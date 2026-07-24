import path from 'path';
import { BrowserWindow } from 'electron';
import { syncProgressBus } from '../services/syncProgressBus';
import type { SyncProgressEvent } from '../services/syncProgressBus';
import { registerUtilityWindow } from './windowLifecycle';

/**
 * Cloud Sync Progress Dialog v1.
 *
 * A presentation-only layer over the existing Google Drive sync engine. This
 * module creates a small, frameless, centered window and forwards real
 * `syncProgressBus` events to it — it makes no sync decisions, calls no
 * Drive API, performs no retry/backoff, and does not touch conflict
 * resolution. It is loaded from a `data:` URL (a self-contained HTML/CSS/JS
 * string), not the main React app: during BOTH startup sync (before the
 * backend has even started) and shutdown sync (after the backend has been
 * stopped), the Express API is unavailable — this window depends on nothing
 * but the Electron IPC bridge, by design.
 *
 * `beginSyncProgressUI(parent)` is the single entry point — pass the main
 * window during shutdown (the dialog becomes a modal child of it) or omit it
 * during startup (no window exists yet). It:
 *   - subscribes to `syncProgressBus` immediately;
 *   - creates the window HIDDEN — if no real sync attempt happens (cloud
 *     sync not configured/authenticated, the common case), zero events ever
 *     arrive and the window is destroyed without ever flashing on screen;
 *   - on the FIRST real event, shows the window and starts forwarding every
 *     subsequent event to it;
 *   - `finish()` (called by the caller once the underlying
 *     `performStartupSync`/`performShutdownSync` promise has settled) holds
 *     the last real state on screen briefly (~900ms, matching the spec's
 *     "~1 second" success dwell) then closes — a presentation delay only,
 *     never a fabricated sync state.
 */

export interface SyncProgressUIHandle {
  finish(): Promise<void>;
}

export function beginSyncProgressUI(parent?: BrowserWindow | null): SyncProgressUIHandle {
  const safeParent = parent && !parent.isDestroyed() ? parent : undefined;

  const win = new BrowserWindow({
    width: 440,
    height: 320,
    show: false,
    frame: false,
    resizable: false,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    modal: !!safeParent,
    parent: safeParent,
    alwaysOnTop: !safeParent,
    backgroundColor: '#0f172a',
    title: 'مزامنة البيانات السحابية',
    webPreferences: {
      preload: path.join(__dirname, 'syncProgressWindow.preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });
  win.setMenuBarVisibility(false);
  // نافذة مساعدة مؤقتة — إغلاقها لا يجب أبدًا أن يُفسَّر كطلب إنهاء التطبيق،
  // خاصةً أثناء مزامنة بدء التشغيل حيث لا توجد بعد أي نافذة رئيسية.
  registerUtilityWindow(win);
  win.loadURL('data:text/html;charset=UTF-8,' + encodeURIComponent(buildSyncProgressHtml()));

  let shown = false;

  const listener = (event: SyncProgressEvent) => {
    if (win.isDestroyed()) return;
    if (!shown) {
      shown = true;
      win.show();
    }
    win.webContents.send('sync-progress:update', event);
  };
  syncProgressBus.on('progress', listener);

  async function finish(): Promise<void> {
    syncProgressBus.off('progress', listener);
    if (win.isDestroyed()) return;
    if (!shown) {
      // No sync attempt actually happened (not configured/authenticated, or
      // resolved before any status event) — nothing real to present. Close
      // silently with zero visible flash.
      win.destroy();
      return;
    }
    // Presentation dwell only — the terminal state already shown is the real
    // last event; this just gives the user a moment to read it, exactly as
    // OneDrive/Dropbox hold their "up to date" / "sync complete" toast.
    await new Promise((resolve) => setTimeout(resolve, 900));
    if (!win.isDestroyed()) win.close();
  }

  return { finish };
}

// ── Self-contained HTML/CSS/JS ──────────────────────────────────────────────
// Colors mirror `frontend/src/app/theme.css`'s design tokens (kept in sync by
// hand — this window intentionally does not depend on the frontend bundle).
// No fabricated data anywhere: every visible number/message is either a
// literal constant (labels) or written verbatim from a real
// `SyncProgressEvent` received over IPC.

function buildSyncProgressHtml(): string {
  return `<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head>
<meta charset="UTF-8" />
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline'; img-src data:;" />
<title>مزامنة البيانات السحابية</title>
<style>
  :root {
    --primary: #0f172a; --accent: #3b82f6; --accent-hover: #2563eb;
    --bg: #f8fafc; --surface: #ffffff; --surface-2: #f1f5f9;
    --text: #0f172a; --text-muted: #64748b; --border: #e2e8f0;
    --green: #10b981; --red: #ef4444; --amber: #f59e0b;
    --radius: 16px;
    --shadow-lg: 0 20px 40px rgba(15, 23, 42, 0.35);
  }
  @media (prefers-color-scheme: dark) {
    :root {
      --primary: #020617; --bg: #0f172a; --surface: #1e293b; --surface-2: #334155;
      --text: #f8fafc; --text-muted: #94a3b8; --border: #334155;
    }
  }
  * { box-sizing: border-box; }
  html, body {
    margin: 0; padding: 0; height: 100%;
    font-family: "IBM Plex Sans Arabic", "Cairo", "Tajawal", Arial, sans-serif;
    background: transparent;
  }
  .card {
    width: 440px; height: 320px; padding: 28px 30px;
    background: var(--surface); color: var(--text);
    border-radius: var(--radius); box-shadow: var(--shadow-lg);
    border: 1px solid var(--border);
    display: flex; flex-direction: column; align-items: center;
    text-align: center;
  }
  .icon-wrap {
    width: 56px; height: 56px; margin-bottom: 14px;
    display: flex; align-items: center; justify-content: center;
    color: var(--accent);
    animation: breathe 2.2s ease-in-out infinite;
  }
  .icon-wrap.done, .icon-wrap.warn, .icon-wrap.error { animation: none; }
  .icon-wrap.done { color: var(--green); }
  .icon-wrap.warn { color: var(--amber); }
  .icon-wrap.error { color: var(--red); }
  .icon-wrap svg { display: block; }
  .icon-glyph { display: none; font-size: 40px; line-height: 1; }
  .icon-wrap.terminal svg { display: none; }
  .icon-wrap.terminal .icon-glyph { display: block; }
  @keyframes breathe { 0%, 100% { transform: scale(1); opacity: 0.85; } 50% { transform: scale(1.08); opacity: 1; } }
  h1 { font-size: 17px; font-weight: 800; margin: 0 0 6px; }
  .op-line { font-size: 13px; color: var(--text-muted); min-height: 18px; margin-bottom: 16px; }
  .bar-track {
    width: 100%; height: 6px; border-radius: 999px; background: var(--surface-2);
    overflow: hidden; margin-bottom: 16px; position: relative;
  }
  .bar-fill {
    height: 100%; border-radius: 999px; background: var(--accent);
    transition: width 0.3s ease;
  }
  .bar-track.indeterminate .bar-fill {
    position: absolute; width: 40%;
    animation: indeterminate 1.4s ease-in-out infinite;
  }
  @keyframes indeterminate {
    0% { left: -40%; }
    100% { left: 100%; }
  }
  .timers { display: flex; gap: 28px; margin-bottom: 14px; }
  .timer { display: flex; flex-direction: column; align-items: center; }
  .timer-label { font-size: 11px; color: var(--text-muted); margin-bottom: 2px; }
  .timer-value { font-size: 20px; font-weight: 700; font-variant-numeric: tabular-nums; }
  .remaining-text { font-size: 20px; font-weight: 700; color: var(--text-muted); }
  .stages {
    width: 100%; max-height: 70px; overflow-y: auto; text-align: start;
    font-size: 12px; color: var(--text-muted); border-top: 1px solid var(--border);
    padding-top: 8px; display: flex; flex-direction: column; gap: 4px;
  }
  .stage-row { display: flex; gap: 6px; align-items: baseline; }
  .stage-row:last-child { color: var(--text); font-weight: 600; }
</style>
</head>
<body>
  <div class="card">
    <div class="icon-wrap" id="icon">${CLOUD_SVG}<span class="icon-glyph" id="iconGlyph"></span></div>
    <h1>مزامنة البيانات السحابية</h1>
    <div class="op-line" id="opLine">جارٍ التحضير...</div>
    <div class="bar-track indeterminate" id="barTrack"><div class="bar-fill" id="barFill"></div></div>
    <div class="timers">
      <div class="timer">
        <span class="timer-label">الوقت المنقضي</span>
        <span class="timer-value" id="elapsed">00:00</span>
      </div>
      <div class="timer">
        <span class="timer-label">الوقت المتبقي</span>
        <span class="remaining-text" id="remaining">جاري حساب الزمن المتبقي...</span>
      </div>
    </div>
    <div class="stages" id="stages"></div>
  </div>
<script>
  var PHASE_LABELS = {
    CHECKING:    { icon: '🔄', text: 'جارٍ الاتصال بـ Google Drive...' },
    DOWNLOADING: { icon: '⬇',  text: 'جارٍ تنزيل قاعدة البيانات...' },
    UPLOADING:   { icon: '⬆',  text: 'جارٍ رفع قاعدة البيانات...' },
    COMPLETED:   { icon: '✅', text: 'اكتملت المزامنة بنجاح' },
    READY:       { icon: '✓',  text: 'البيانات محدّثة بالفعل' },
    OFFLINE:     { icon: '⚠',  text: 'تعذّر الاتصال بـ Google Drive' },
    CONFLICT:    { icon: '⚠',  text: 'يوجد تعارض في نسخ قاعدة البيانات' },
    FAILED:      { icon: '⚠',  text: 'تعذّرت المزامنة' }
  };
  var TERMINAL = { COMPLETED: 1, READY: 1, OFFLINE: 1, CONFLICT: 1, FAILED: 1 };
  var SUCCESS = { COMPLETED: 1, READY: 1 };

  var opLine = document.getElementById('opLine');
  var iconWrap = document.getElementById('icon');
  var iconGlyph = document.getElementById('iconGlyph');
  var barTrack = document.getElementById('barTrack');
  var elapsedEl = document.getElementById('elapsed');
  var remainingEl = document.getElementById('remaining');
  var stagesEl = document.getElementById('stages');

  var startedAt = null;
  var timerHandle = null;

  function pad(n) { return String(n).padStart(2, '0'); }
  function formatDuration(ms) {
    var totalSec = Math.floor(ms / 1000);
    return pad(Math.floor(totalSec / 60)) + ':' + pad(totalSec % 60);
  }
  function tickElapsed() {
    if (startedAt === null) return;
    elapsedEl.textContent = formatDuration(Date.now() - startedAt);
  }

  // Never fabricated: no byte-level transfer progress is available from the
  // sync engine today (single-shot upload/download, no chunk callbacks), so
  // this always returns null and the UI always shows the "calculating" text.
  // Written this way (not hardcoded text) so a future engine that DOES expose
  // transferredBytes/totalBytes/speed can be wired in without touching markup.
  function estimateRemainingMs(transferredBytes, totalBytes, elapsedMs) {
    if (!transferredBytes || !totalBytes || !elapsedMs) return null;
    var speed = transferredBytes / elapsedMs;
    if (speed <= 0) return null;
    return Math.max(0, (totalBytes - transferredBytes) / speed);
  }

  function applyEvent(evt) {
    var label = PHASE_LABELS[evt.phase] || { icon: '🔄', text: '' };
    var text = evt.message && evt.message.trim() ? evt.message : label.text;

    if (startedAt === null) {
      startedAt = Date.now();
      timerHandle = setInterval(tickElapsed, 1000);
      tickElapsed();
    }

    opLine.textContent = text;

    var row = document.createElement('div');
    row.className = 'stage-row';
    var iconSpan = document.createElement('span');
    iconSpan.textContent = label.icon;
    var textSpan = document.createElement('span');
    textSpan.textContent = text;
    row.appendChild(iconSpan);
    row.appendChild(textSpan);
    stagesEl.appendChild(row);
    stagesEl.scrollTop = stagesEl.scrollHeight;

    var remainingMs = estimateRemainingMs(null, null, startedAt ? Date.now() - startedAt : null);
    remainingEl.textContent = remainingMs === null
      ? 'جاري حساب الزمن المتبقي...'
      : formatDuration(remainingMs);

    if (TERMINAL[evt.phase]) {
      if (timerHandle) { clearInterval(timerHandle); timerHandle = null; }
      barTrack.classList.remove('indeterminate');
      iconWrap.classList.remove('done', 'warn', 'error');
      iconWrap.classList.add('terminal');
      if (SUCCESS[evt.phase]) {
        iconWrap.classList.add('done');
        iconGlyph.textContent = '\\u2713';
      } else if (evt.phase === 'FAILED') {
        iconWrap.classList.add('error');
        iconGlyph.textContent = '\\u26A0';
      } else {
        iconWrap.classList.add('warn');
        iconGlyph.textContent = '\\u26A0';
      }
    }
  }

  if (window.syncProgress && window.syncProgress.onUpdate) {
    window.syncProgress.onUpdate(applyEvent);
  }
</script>
</body>
</html>`;
}

const CLOUD_SVG = `<svg width="40" height="40" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
<path d="M7 18a4.5 4.5 0 0 1-.4-8.98A5.5 5.5 0 0 1 17.5 9.5 4 4 0 0 1 17 18H7Z" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/>
</svg>`;
