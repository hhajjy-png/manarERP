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

/** يستخرج مجموعة أسماء النماذج من ملف schema.prisma. */
function readModelSet(schemaPath) {
  const text = fs.readFileSync(schemaPath, 'utf8');
  const models = new Set();
  for (const m of text.matchAll(/^model\s+(\w+)\s/gm)) models.add(m[1]);
  return models;
}

/**
 * حارس فشل-مغلق (تدقيق 2026-08-19): يقارن **مجموعة** نماذج عميل Prisma المُجهَّز
 * للتغليف مع المخطط القانوني `backend/prisma/schema.prisma` — لا العدد فقط.
 * لو كان هذا الحارس موجودًا في 2026.5.5 لفشل البناء بصوت عالٍ (75 ≠ 85) بدل
 * اكتشاف النقص يدويًا بعد التغليف.
 */
function verifyPackagedPrismaSchema() {
  const canonicalPath = path.join(BACKEND_DIR, 'prisma', 'schema.prisma');
  const stagedPath = path.join(STAGE_DIR, 'node_modules', '.prisma', 'client', 'schema.prisma');
  if (!fs.existsSync(stagedPath)) {
    throw new Error(`عميل Prisma المُجهَّز بلا schema.prisma (${stagedPath}) — العميل المنسوخ غير مُولَّد. شغّل "npm run db:generate".`);
  }
  const canonical = readModelSet(canonicalPath);
  const staged = readModelSet(stagedPath);
  const missing = [...canonical].filter((m) => !staged.has(m));
  const extra = [...staged].filter((m) => !canonical.has(m));
  if (missing.length || extra.length) {
    throw new Error(
      `عميل Prisma المُجهَّز للتغليف لا يطابق المخطط القانوني (${canonical.size} نموذجًا):\n` +
      (missing.length ? `  ناقص من العميل (${missing.length}): ${missing.join(', ')}\n` : '') +
      (extra.length ? `  زائد في العميل (${extra.length}): ${extra.join(', ')}\n` : '') +
      'شغّل "npm run db:generate" ثم أعد التغليف.',
    );
  }
  log(`تحقّق مجموعة نماذج Prisma: ${staged.size} نموذجًا مطابقًا للمخطط القانوني ✓`);
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
  // بالنسخة المُولَّدة فعليًا — **من backend/node_modules أولًا**: هذا هو المسار الذي
  // يكتب إليه `prisma generate` فعليًا في هذا المستودع، بينما كانت نسخة الجذر تتجمّد
  // صامتةً على مخطط قديم (75 نموذجًا مقابل 85 في إصدار 2026.5.5 — عيب متكرر في كل
  // إصدار). نسخة الجذر تبقى احتياطًا فقط، وحارس مجموعة النماذج أدناه يُفشل البناء
  // بصوت عالٍ إن كانت أي نسخة مُنتقاة قديمة.
  const rootNodeModules = path.join(REPO_ROOT, 'node_modules');
  const backendNodeModulesSrc = path.join(BACKEND_DIR, 'node_modules');

  // تنظيف بقايا المحرّك في المصدرين قبل النسخ — يحرّر المستودع أيضًا لا الحزمة فقط.
  for (const base of [backendNodeModulesSrc, rootNodeModules]) {
    const pruned = pruneOrphanEngines(path.join(base, '.prisma', 'client'));
    if (pruned.removed > 0) {
      log(`حُذفت ${pruned.removed} نسخة مؤقتة يتيمة من محرّك Prisma (${(pruned.bytes / 1024 / 1024).toFixed(0)} ميغابايت).`);
    }
  }

  /** يختار أول مصدر موجود من القائمة (backend أولًا ثم الجذر). */
  function pickOverlaySource(...candidates) {
    return candidates.find((p) => fs.existsSync(p));
  }

  const overlays = [
    ['@prisma/client', pickOverlaySource(
      path.join(backendNodeModulesSrc, '@prisma', 'client'),
      path.join(rootNodeModules, '@prisma', 'client'),
    )],
    ['.prisma', pickOverlaySource(
      path.join(backendNodeModulesSrc, '.prisma'),
      path.join(rootNodeModules, '.prisma'),
    )],
  ];
  for (const [label, srcDir] of overlays) {
    if (!srcDir) {
      throw new Error(`لم يُعثر على ${label} في backend/node_modules ولا في جذر المستودع — شغّل "npm run db:generate" أولًا.`);
    }
    const destDir = path.join(STAGE_DIR, 'node_modules', label);
    log(`استبدال ${label} بالنسخة المُولَّدة من: ${srcDir}`);
    fs.rmSync(destDir, { recursive: true, force: true });
    fs.cpSync(srcDir, destDir, { recursive: true, filter: packageFilter });
  }

  verifyPackagedPrismaSchema();

  const backendNodeModules = path.join(BACKEND_DIR, 'node_modules');
  log(`نسخ node_modules المعزولة إلى ${backendNodeModules}...`);
  fs.rmSync(backendNodeModules, { recursive: true, force: true });
  fs.cpSync(path.join(STAGE_DIR, 'node_modules'), backendNodeModules, {
    recursive: true,
    filter: packageFilter,
  });

  log('اكتمل — backend/node_modules الآن مكتفٍ ذاتيًا لأغراض التغليف.');
}

if (require.main === module) main();

module.exports = { readModelSet };
