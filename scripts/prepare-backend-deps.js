#!/usr/bin/env node
/**
 * يُشغَّل فقط ضمن خط أنابيب التغليف (`npm run dist`) — لا يمسّ سير عمل التطوير اليومي.
 *
 * هذا مستودع npm workspaces: `npm install` يرفع الاعتماديات المشتركة (express،
 * @prisma/client، ...) إلى `node_modules` في جذر المستودع، فيبقى `backend/node_modules`
 * شبه فارغ. حزمة electron-builder تُدرج `backend/node_modules` حرفيًا ضمن الموارد
 * (extraResources في electron-builder.yml) — فإن بقي شبه فارغ، تفشل الخدمة الخلفية
 * المُغلَّفة فورًا بخطأ MODULE_NOT_FOUND عند التشغيل خارج شجرة المستودع (لا يوجد
 * node_modules أب لتصعد إليه خوارزمية Node، خلافًا لبيئة التطوير داخل المستودع).
 *
 * الحل: تثبيت مستقل لاعتماديات backend الإنتاجية فقط في مجلد مؤقت خارج شجرة
 * المستودع تمامًا (Node لا يمكنه اكتشاف workspaces الأب هناك)، ثم استبدال عميل
 * Prisma المُولَّد افتراضيًا بالنسخة المُولَّدة فعليًا من جذر المستودع (نفس الإصدار
 * المُختبَر في التطوير)، ثم نسخ الناتج إلى backend/node_modules.
 */
const fs = require('fs');
const path = require('path');
const os = require('os');
const { execFileSync } = require('child_process');

const REPO_ROOT = path.resolve(__dirname, '..');
const BACKEND_DIR = path.join(REPO_ROOT, 'backend');
const STAGE_DIR = path.join(os.tmpdir(), 'manarerp-backend-deps-stage');

function log(msg) {
  console.log(`[prepare-backend-deps] ${msg}`);
}

/**
 * ملفات لا يجوز أن تدخل الحزمة إطلاقًا.
 *
 * `query_engine-windows.dll.node.tmpNNNNN`: يكتب Prisma محرّكه إلى ملف مؤقت ثم
 * يعيد تسميته عند كل `prisma generate`؛ فشل إعادة التسمية (والملف مقفول لأن
 * الخدمة تعمل) يترك النسخة المؤقتة خلفه — 19 ميغابايت للنسخة الواحدة. تراكمت
 * ثلاثون منها في هذا المستودع (≈537 ميغابايت) وكانت تُنسخ حرفيًا إلى كل مثبّت.
 * لا وظيفة لها إطلاقًا وقت التشغيل: Node يحمّل `query_engine-windows.dll.node` وحده.
 */
const EXCLUDED_FROM_PACKAGE = [
  /\.tmp\d+$/i,          // بقايا إعادة تسمية محرّك Prisma
  /\.map$/i,             // خرائط المصدر — تشخيص مطوّر لا تشغيل
  /[\\/]\.bin[\\/]/i,    // روابط CLI — لا تُستدعى من الخدمة المُعبَّأة
];

/** مُرشِّح `fs.cpSync` — يُعيد false للملفات المستبعَدة أعلاه. */
function packageFilter(src) {
  return !EXCLUDED_FROM_PACKAGE.some((re) => re.test(src));
}

/** يحذف بقايا محرّك Prisma المؤقتة من مجلد مصدر (تنظيف المستودع نفسه). */
function pruneOrphanEngines(dir) {
  let removed = 0;
  let bytes = 0;
  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return { removed, bytes };
  }
  for (const e of entries) {
    if (!e.isFile() || !/\.tmp\d+$/i.test(e.name)) continue;
    const full = path.join(dir, e.name);
    try {
      bytes += fs.statSync(full).size;
      fs.rmSync(full, { force: true });
      removed++;
    } catch {
      // مقفول أو محذوف بالتوازي — تخطٍّ صامت، المُرشِّح يمنعه من الحزمة على أي حال.
    }
  }
  return { removed, bytes };
}

function main() {
  log(`تجهيز مجلد التثبيت المعزول: ${STAGE_DIR}`);
  fs.rmSync(STAGE_DIR, { recursive: true, force: true });
  fs.mkdirSync(STAGE_DIR, { recursive: true });

  // نسخ package.json فقط (بلا lockfile) — تثبيت مستقل بمعزل عن سياق workspaces الأب.
  fs.copyFileSync(path.join(BACKEND_DIR, 'package.json'), path.join(STAGE_DIR, 'package.json'));

  log('تثبيت اعتماديات الإنتاج فقط (بمعزل عن جذر المستودع)...');
  // shell:true مطلوب لتشغيل npm.cmd على وندوز (execFileSync بلا shell يفشل بـ EINVAL على
  // ملفات .cmd). آمن هنا: كل الوسائط أدناه ثوابت مكتوبة يدويًا، لا مدخلات مستخدم أو خارجية.
  execFileSync('npm', ['install', '--omit=dev', '--no-audit', '--no-fund', '--no-package-lock'], {
    cwd: STAGE_DIR,
    stdio: 'inherit',
    shell: true,
  });

  // عميل Prisma المُولَّد افتراضيًا من `npm install` هو غلاف فارغ (بلا مخطط). استبداله
  // بالنسخة المُولَّدة فعليًا في جذر المستودع (نفس schema.prisma، مُختبَرة في التطوير).
  const rootNodeModules = path.join(REPO_ROOT, 'node_modules');

  // تنظيف بقايا المحرّك في المصدر قبل النسخ — يحرّر المستودع أيضًا لا الحزمة فقط.
  const pruned = pruneOrphanEngines(path.join(rootNodeModules, '.prisma', 'client'));
  if (pruned.removed > 0) {
    log(`حُذفت ${pruned.removed} نسخة مؤقتة يتيمة من محرّك Prisma (${(pruned.bytes / 1024 / 1024).toFixed(0)} ميغابايت).`);
  }

  const overlays = [
    ['@prisma/client', path.join(rootNodeModules, '@prisma', 'client')],
    ['.prisma', path.join(rootNodeModules, '.prisma')],
  ];
  for (const [label, srcDir] of overlays) {
    if (!fs.existsSync(srcDir)) {
      throw new Error(`لم يُعثر على ${label} في جذر المستودع — شغّل "npm run db:generate" أولًا.`);
    }
    const destDir = path.join(STAGE_DIR, 'node_modules', label);
    log(`استبدال ${label} بالنسخة المُولَّدة من جذر المستودع...`);
    fs.rmSync(destDir, { recursive: true, force: true });
    fs.cpSync(srcDir, destDir, { recursive: true, filter: packageFilter });
  }

  const backendNodeModules = path.join(BACKEND_DIR, 'node_modules');
  log(`نسخ node_modules المعزولة إلى ${backendNodeModules}...`);
  fs.rmSync(backendNodeModules, { recursive: true, force: true });
  fs.cpSync(path.join(STAGE_DIR, 'node_modules'), backendNodeModules, {
    recursive: true,
    filter: packageFilter,
  });

  log('اكتمل — backend/node_modules الآن مكتفٍ ذاتيًا لأغراض التغليف.');
}

main();
