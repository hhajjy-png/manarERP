import path from 'path';
import { BrowserWindow, ipcMain } from 'electron';
import { startupProgressBus, type StartupProgressEvent, type StartupPhase } from '../services/startupProgressBus';
import { registerUtilityWindow } from './windowLifecycle';

/**
 * Production Startup Pack v1 — نافذة بدء التشغيل.
 *
 * ── لماذا وُجدت ────────────────────────────────────────────────────────────────
 *
 * كان الإقلاع صامتًا تمامًا: لا نافذة ولا مؤشّر حتى تجهز الخدمة الخلفية. فإن تأخّرت
 * (أول تشغيل بعد التثبيت: ملفات باردة، مكافح فيروسات يفحص 3232 ملفًا) لم يرَ
 * المستخدم شيئًا إطلاقًا — ثم `app.quit()` صامت. النتيجة العملية: «ضغطتُ الاختصار
 * فلم يحدث شيء».
 *
 * هذه النافذة تجعل الانتظار **مرئيًا ومفهومًا**، والفشل **مُعلَنًا بسببه الحقيقي**.
 * لا تتخذ أي قرار: تعرض فقط ما يبثّه `startupProgressBus`. الإقلاع يعمل بدونها.
 *
 * تُحمَّل من `data:` URL مكتفٍ ذاتيًا — لا تعتمد على حزمة الواجهة ولا على الخدمة
 * الخلفية، لأنها تعمل قبل وجود أيٍّ منهما بالتعريف.
 */

export interface StartupWindowHandle {
  /** يُغلق النافذة عند نجاح الإقلاع. */
  close(): void;
  /** هل ما زالت النافذة حيّة؟ (يُستخدم قبل فتح النافذة الرئيسية.) */
  isAlive(): boolean;
}

export interface StartupWindowOptions {
  /**
   * يُستدعى حين يضغط المستخدم «إغلاق» في حالة الفشل.
   *
   * لا تُنهي هذه النافذة التطبيق بنفسها: قد تكون الخدمة الخلفية قد بدأت فعلًا
   * قبل أن يقع الفشل (في جدولة النسخ الاحتياطي مثلًا)، وإنهاء العملية الأمّ على
   * وندوز لا يقتل عملية `fork` الابنة — فتبقى معلّقة على المنفذ 48211 وتمنع أي
   * تشغيل لاحق. الإنهاء يخصّ `main.ts` وحده لأنه المالك الوحيد لتسلسل الإيقاف.
   */
  onQuitRequested: () => void;
}

/** ترتيب المراحل كما تُعرض في القائمة — مطابق لترتيب التنفيذ في `main.ts`. */
const PHASE_ORDER: StartupPhase[] = ['ENVIRONMENT', 'DATA_DIR', 'CLOUD_SYNC', 'BACKEND'];

const PHASE_LABELS: Record<StartupPhase, string> = {
  ENVIRONMENT: 'فحص بيئة التشغيل',
  DATA_DIR: 'تهيئة مجلد البيانات',
  CLOUD_SYNC: 'المزامنة السحابية',
  BACKEND: 'تشغيل الخدمة الخلفية',
  READY: 'جاهز',
  FAILED: 'فشل',
};

export function createStartupWindow(options: StartupWindowOptions): StartupWindowHandle {
  const win = new BrowserWindow({
    width: 460,
    height: 340,
    show: false,
    frame: false,
    resizable: false,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    alwaysOnTop: true,
    center: true,
    backgroundColor: '#0f172a',
    title: 'نظام المنار — بدء التشغيل',
    webPreferences: {
      preload: path.join(__dirname, 'startupWindow.preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });
  win.setMenuBarVisibility(false);
  // نافذة مساعدة: إغلاقها قبل ظهور النافذة الرئيسية لا يعني إنهاء التطبيق.
  registerUtilityWindow(win);

  /**
   * أحداث تصل قبل اكتمال تحميل الصفحة تُفقد لو أُرسلت فورًا. نُخزّنها ونُعيد بثّها
   * عند الجاهزية — المرحلة الأولى (`ENVIRONMENT`) تُبثّ عادةً خلال أجزاء من الثانية،
   * أي قبل أن يجهز المُحمِّل، وفقدانها كان سيُظهر قائمة فارغة في أول لحظة.
   */
  const buffered: StartupProgressEvent[] = [];
  let ready = false;

  const send = (event: StartupProgressEvent) => {
    if (win.isDestroyed()) return;
    if (!ready) {
      buffered.push(event);
      return;
    }
    win.webContents.send('startup-progress:update', event);
  };

  win.webContents.once('did-finish-load', () => {
    ready = true;
    for (const event of buffered) {
      if (!win.isDestroyed()) win.webContents.send('startup-progress:update', event);
    }
    buffered.length = 0;
    if (!win.isDestroyed()) win.show();
  });

  const listener = (event: StartupProgressEvent) => send(event);
  startupProgressBus.on('progress', listener);

  /**
   * زرّ «إغلاق» في حالة الفشل. الإنهاء هنا **بطلب صريح من المستخدم** بعد أن قرأ
   * السبب — وهو نقيض الإنهاء الصامت الذي كان يحدث قبل هذه الحزمة.
   */
  const onQuit = () => options.onQuitRequested();
  ipcMain.on('startup-progress:quit', onQuit);

  win.once('closed', () => {
    startupProgressBus.off('progress', listener);
    ipcMain.removeListener('startup-progress:quit', onQuit);
  });

  win.loadURL('data:text/html;charset=UTF-8,' + encodeURIComponent(buildStartupHtml()));

  return {
    close: () => {
      if (!win.isDestroyed()) win.destroy();
    },
    isAlive: () => !win.isDestroyed(),
  };
}

// ── HTML/CSS/JS مكتفٍ ذاتيًا ────────────────────────────────────────────────
// الألوان تعكس رموز التصميم في `frontend/src/app/theme.css` (متزامنة يدويًا —
// هذه النافذة لا تعتمد على حزمة الواجهة عمدًا).
// لا بيانات مُصطنعة: كل نص ظاهر إمّا تسمية ثابتة أو منقول حرفيًا من حدث حقيقي.

function buildStartupHtml(): string {
  const rows = PHASE_ORDER.map(
    (p) => `<div class="step" data-phase="${p}"><span class="dot"></span><span class="label">${PHASE_LABELS[p]}</span></div>`,
  ).join('');

  return `<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head>
<meta charset="UTF-8" />
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline'; img-src data:;" />
<title>نظام المنار — بدء التشغيل</title>
<style>
  :root {
    --accent:#3b82f6; --surface:#ffffff; --surface-2:#f1f5f9;
    --text:#0f172a; --text-muted:#64748b; --border:#e2e8f0;
    --green:#10b981; --red:#ef4444;
  }
  @media (prefers-color-scheme: dark) {
    :root { --surface:#1e293b; --surface-2:#334155; --text:#f8fafc; --text-muted:#94a3b8; --border:#334155; }
  }
  * { box-sizing:border-box; }
  html,body { margin:0; padding:0; height:100%; background:transparent;
    font-family:"IBM Plex Sans Arabic","Cairo","Tajawal",Arial,sans-serif; }
  .card { width:460px; height:340px; padding:26px 30px; background:var(--surface); color:var(--text);
    border-radius:16px; border:1px solid var(--border); box-shadow:0 20px 40px rgba(15,23,42,.35);
    display:flex; flex-direction:column; }
  .head { display:flex; align-items:center; gap:12px; margin-bottom:4px; }
  .spinner { width:26px; height:26px; border-radius:50%; border:3px solid var(--surface-2);
    border-top-color:var(--accent); animation:spin .9s linear infinite; flex:none; }
  @keyframes spin { to { transform:rotate(360deg); } }
  .spinner.done { animation:none; border:none; color:var(--green); font-size:24px; line-height:26px; text-align:center; }
  .spinner.fail { animation:none; border:none; color:var(--red);   font-size:24px; line-height:26px; text-align:center; }
  h1 { font-size:17px; font-weight:800; margin:0; }
  .sub { font-size:13px; color:var(--text-muted); margin:2px 0 18px; min-height:18px; }
  .steps { display:flex; flex-direction:column; gap:9px; flex:1; }
  .step { display:flex; align-items:center; gap:10px; font-size:13px; color:var(--text-muted); }
  .dot { width:9px; height:9px; border-radius:50%; background:var(--surface-2); flex:none;
    border:2px solid var(--border); }
  .step.active { color:var(--text); font-weight:700; }
  .step.active .dot { background:var(--accent); border-color:var(--accent); animation:pulse 1.2s ease-in-out infinite; }
  @keyframes pulse { 0%,100%{transform:scale(1);opacity:.7} 50%{transform:scale(1.35);opacity:1} }
  .step.done .dot { background:var(--green); border-color:var(--green); }
  .step.done { color:var(--text); }
  .elapsed { font-size:11px; color:var(--text-muted); margin-inline-start:auto; font-variant-numeric:tabular-nums; }
  .err { display:none; font-size:12px; color:var(--text-muted); background:var(--surface-2);
    border-radius:10px; padding:10px 12px; max-height:104px; overflow:auto; white-space:pre-wrap;
    text-align:start; direction:ltr; font-family:Consolas,monospace; font-size:11px; }
  .actions { display:none; justify-content:center; margin-top:12px; }
  button { font-family:inherit; font-size:13px; font-weight:700; padding:8px 26px; border-radius:9px;
    border:1px solid var(--border); background:var(--accent); color:#fff; cursor:pointer; }
  button:hover { filter:brightness(1.08); }
  body.failed .steps { display:none; }
  body.failed .err, body.failed .actions { display:flex; }
  body.failed .err { display:block; }
</style>
</head>
<body>
  <div class="card">
    <div class="head">
      <div class="spinner" id="spin"></div>
      <h1 id="title">جاري تهيئة النظام...</h1>
    </div>
    <div class="sub" id="sub">يرجى الانتظار</div>
    <div class="steps" id="steps">${rows}</div>
    <div class="err" id="err"></div>
    <div class="actions"><button id="quitBtn">إغلاق</button></div>
  </div>
<script>
  var ORDER = ${JSON.stringify(PHASE_ORDER)};
  var stepsEl = document.getElementById('steps');
  var subEl = document.getElementById('sub');
  var titleEl = document.getElementById('title');
  var spinEl = document.getElementById('spin');
  var errEl = document.getElementById('err');

  document.getElementById('quitBtn').addEventListener('click', function () {
    if (window.startupProgress && window.startupProgress.quit) window.startupProgress.quit();
  });

  function rowFor(phase) { return stepsEl.querySelector('[data-phase="' + phase + '"]'); }

  function apply(evt) {
    subEl.textContent = evt.message || '';

    if (evt.phase === 'FAILED') {
      document.body.classList.add('failed');
      titleEl.textContent = 'تعذّر بدء تشغيل النظام';
      spinEl.className = 'spinner fail';
      spinEl.textContent = '\\u26A0';
      // التفاصيل تُعرض كما وردت حرفيًا — سبب حقيقي لا نص مُصطنع.
      errEl.textContent = evt.detail || evt.message || '';
      return;
    }

    if (evt.phase === 'READY') {
      ORDER.forEach(function (p) { var r = rowFor(p); if (r) { r.classList.remove('active'); r.classList.add('done'); } });
      titleEl.textContent = 'اكتملت التهيئة';
      spinEl.className = 'spinner done';
      spinEl.textContent = '\\u2713';
      return;
    }

    var idx = ORDER.indexOf(evt.phase);
    if (idx === -1) return;
    ORDER.forEach(function (p, i) {
      var r = rowFor(p);
      if (!r) return;
      r.classList.toggle('done', i < idx);
      r.classList.toggle('active', i === idx);
    });

    var row = rowFor(evt.phase);
    if (row) {
      var t = row.querySelector('.elapsed');
      if (typeof evt.elapsedSeconds === 'number' && evt.elapsedSeconds > 0) {
        if (!t) { t = document.createElement('span'); t.className = 'elapsed'; row.appendChild(t); }
        t.textContent = evt.elapsedSeconds + ' ث';
      } else if (t) {
        t.remove();
      }
    }
  }

  if (window.startupProgress && window.startupProgress.onUpdate) {
    window.startupProgress.onUpdate(apply);
  }
</script>
</body>
</html>`;
}
