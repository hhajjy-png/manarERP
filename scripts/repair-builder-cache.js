#!/usr/bin/env node
/**
 * Production Deployment Pack v1 — إصلاح ذاكرة أدوات electron-builder على وندوز.
 *
 * ── العطل ──────────────────────────────────────────────────────────────────────
 *
 * يحتاج electron-builder حزمة `winCodeSign` لتشغيل `rcedit` — الأداة التي تكتب
 * الأيقونة ومعلومات الإصدار داخل الملف التنفيذي. الحزمة أرشيف 7z **مشترك بين كل
 * المنصّات**، ويحوي روابط رمزية (symlinks) لمكتبات macOS:
 *
 *     darwin/10.12/lib/libcrypto.dylib → libcrypto.1.0.0.dylib
 *     darwin/10.12/lib/libssl.dylib    → libssl.1.0.0.dylib
 *
 * إنشاء رابط رمزي على وندوز يتطلب امتياز `SeCreateSymbolicLinkPrivilege` — أي
 * صلاحيات مسؤول أو تفعيل «وضع المطوّر». بدونه يُنهي 7za بالرمز 2، فيعتبره
 * electron-builder فشلًا قاتلًا ويتوقّف البناء بالكامل. النتيجة: **يستحيل بناء
 * المثبّت على جهاز وندوز عادي** رغم أن الملفات المعطوبة تخصّ macOS ولا تُستخدم هنا.
 *
 * ── العلاج ─────────────────────────────────────────────────────────────────────
 *
 * فكّ الأرشيف مرّة واحدة **باستثناء شجرة `darwin/`** إلى المسار الذي يبحث فيه
 * electron-builder. حين يجد الحزمة مفكوكة يتخطّى التنزيل والفكّ كليًا، فلا يُنشئ
 * رابطًا رمزيًا أصلًا. لا شيء يُفقد: `rcedit-x64.exe` و`signtool` وكل أدوات وندوز
 * خارج `darwin/` تمامًا.
 *
 * إصلاح **بيئة بناء** لا تغيير في المنتج: لا يمسّ أي ملف داخل المستودع، ولا يؤثّر
 * في محتوى المثبّت. آمن للتكرار — يتخطّى العمل إن كانت الحزمة سليمة أصلًا.
 *
 * الاستخدام:  node scripts/repair-builder-cache.js
 */
'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');

const REPO_ROOT = path.resolve(__dirname, '..');

const ARTIFACT_NAME = 'winCodeSign';
const ARTIFACT_VERSION = '2.6.0';
const ARTIFACT_URL =
  'https://github.com/electron-userland/electron-builder-binaries/releases/download/' +
  `${ARTIFACT_NAME}-${ARTIFACT_VERSION}/${ARTIFACT_NAME}-${ARTIFACT_VERSION}.7z`;

/** ملف يجب أن يوجد لتُعدّ الحزمة سليمة — هو سبب وجودها أصلًا في بناء وندوز. */
const REQUIRED_TOOL = 'rcedit-x64.exe';

const SEVEN_ZIP = path.join(REPO_ROOT, 'node_modules', '7zip-bin', 'win', 'x64', '7za.exe');

function log(msg) {
  console.log(`[builder-cache] ${msg}`);
}

function cacheRoot() {
  if (process.env.ELECTRON_BUILDER_CACHE) return path.resolve(process.env.ELECTRON_BUILDER_CACHE);
  return path.join(os.homedir(), 'AppData', 'Local', 'electron-builder', 'Cache');
}

const artifactDir = () => path.join(cacheRoot(), ARTIFACT_NAME, `${ARTIFACT_NAME}-${ARTIFACT_VERSION}`);

/** يبحث عن أرشيف مُنزَّل مسبقًا من محاولة بناء فاشلة — يوفّر تنزيلًا لا داعي له. */
function findDownloadedArchive() {
  const dir = path.join(cacheRoot(), ARTIFACT_NAME);
  let entries;
  try {
    entries = fs.readdirSync(dir);
  } catch {
    return null;
  }
  const archives = entries
    .filter((e) => e.endsWith('.7z'))
    .map((e) => path.join(dir, e))
    .filter((p) => {
      try {
        // الأرشيف الصحيح ≈ 5.6 ميغابايت؛ أي ملف أصغر بكثير تنزيل مبتور.
        return fs.statSync(p).size > 5_000_000;
      } catch {
        return false;
      }
    });
  return archives[0] ?? null;
}

async function downloadArchive(dest) {
  log(`تنزيل ${ARTIFACT_NAME}-${ARTIFACT_VERSION}...`);
  const res = await fetch(ARTIFACT_URL, { redirect: 'follow' });
  if (!res.ok) throw new Error(`فشل التنزيل (HTTP ${res.status}) من ${ARTIFACT_URL}`);
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.writeFileSync(dest, Buffer.from(await res.arrayBuffer()));
  return dest;
}

/** يحذف مجلدات الفكّ المؤقتة اليتيمة التي خلّفتها محاولات فاشلة سابقة. */
function pruneFailedExtractions() {
  const dir = path.join(cacheRoot(), ARTIFACT_NAME);
  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return 0;
  }
  let removed = 0;
  for (const e of entries) {
    // مجلدات الفكّ المؤقتة أسماؤها أرقام عشوائية بحتة — لا تلتبس باسم الحزمة.
    if (!e.isDirectory() || !/^\d+$/.test(e.name)) continue;
    try {
      fs.rmSync(path.join(dir, e.name), { recursive: true, force: true });
      fs.rmSync(path.join(dir, `${e.name}.7z`), { force: true });
      removed++;
    } catch {
      // مقفول أو محذوف بالتوازي — تخطٍّ صامت.
    }
  }
  return removed;
}

async function main() {
  const target = artifactDir();

  if (fs.existsSync(path.join(target, REQUIRED_TOOL))) {
    log(`الحزمة سليمة مسبقًا — لا عمل. (${target})`);
    const pruned = pruneFailedExtractions();
    if (pruned > 0) log(`نُظّف ${pruned} مجلد فكّ مؤقت يتيم من محاولات سابقة.`);
    return;
  }

  if (!fs.existsSync(SEVEN_ZIP)) {
    throw new Error(`لم يُعثر على 7za: ${SEVEN_ZIP} — شغّل "npm install" أولًا.`);
  }

  let archive = findDownloadedArchive();
  if (archive) {
    log(`استخدام أرشيف مُنزَّل مسبقًا: ${path.basename(archive)}`);
  } else {
    archive = await downloadArchive(path.join(cacheRoot(), ARTIFACT_NAME, `${ARTIFACT_NAME}-${ARTIFACT_VERSION}.7z`));
  }

  fs.rmSync(target, { recursive: true, force: true });
  fs.mkdirSync(target, { recursive: true });

  log('فكّ الأرشيف باستثناء شجرة darwin/ (روابط رمزية غير مدعومة بلا امتيازات)...');
  // `-xr!darwin` استبعاد تكراري · `-y` قبول تلقائي · `-bso0/-bsp0` كتم التقدّم.
  execFileSync(SEVEN_ZIP, ['x', archive, `-o${target}`, '-xr!darwin', '-y', '-bso0', '-bsp0'], {
    stdio: ['ignore', 'inherit', 'inherit'],
  });

  if (!fs.existsSync(path.join(target, REQUIRED_TOOL))) {
    throw new Error(`فُكّ الأرشيف لكن ${REQUIRED_TOOL} غير موجود في ${target} — بنية الحزمة تغيّرت.`);
  }

  const pruned = pruneFailedExtractions();
  log(`تمّ. ${REQUIRED_TOOL} جاهز في ${target}` + (pruned > 0 ? ` · نُظّف ${pruned} مجلد يتيم.` : ''));
}

if (require.main === module) {
  main().catch((err) => {
    console.error(`[builder-cache] ${err instanceof Error ? err.message : String(err)}`);
    process.exitCode = 1;
  });
}

module.exports = { artifactDir, cacheRoot, ARTIFACT_NAME, ARTIFACT_VERSION };
