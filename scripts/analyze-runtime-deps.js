#!/usr/bin/env node
/**
 * Production Deployment Pack v1 — محلّل الاعتماديات وقت التشغيل (Runtime Dependency Analyzer).
 *
 * ── لماذا لا قائمة مكتوبة يدويًا ────────────────────────────────────────────────
 *
 * قائمة «المتطلبات» المكتوبة يدويًا تتعفّن بصمت: يُضاف اعتماد أصلي جديد (Prisma
 * engine، وحدة .node، DLL) فلا يلاحظه أحد إلا حين يفشل التثبيت على جهاز نظيف
 * برسالة «تعذّر العثور على vcruntime140.dll». هذا الملف يستخرج المتطلبات
 * **من الثنائيات نفسها**: يقرأ جدول الاستيراد (Import Directory) في ترويسة PE لكل
 * ملف .exe/.dll/.node داخل ناتج البناء، ويطرح منه خط أساس وندوز 10/11، فما تبقّى
 * هو المتطلبات الحقيقية القابلة للتوزيع.
 *
 * الاستخدام:
 *   node scripts/analyze-runtime-deps.js [--root <dir>] [--json <out>] [--quiet]
 *
 * افتراضيًا يفحص: electron-dist، frontend/dist، backend/dist، backend/node_modules،
 * وملفات Electron الثنائية من node_modules/electron/dist.
 *
 * المخرجات: build/runtime-requirements.json + تقرير نصّي.
 * رمز الخروج 1 عند اكتشاف متطلب غير معروف (fail-closed: متطلب مجهول ⇒ تحقيق يدوي).
 */
'use strict';

const fs = require('fs');
const path = require('path');

const REPO_ROOT = path.resolve(__dirname, '..');

// ─────────────────────────────────────────────────────────────────────────────
// 1) قارئ PE — استخراج أسماء DLLs المستوردة من ترويسة الملف التنفيذي
// ─────────────────────────────────────────────────────────────────────────────

/** يحوّل RVA إلى إزاحة داخل الملف باستخدام جدول الأقسام. */
function rvaToOffset(sections, rva) {
  for (const s of sections) {
    const size = s.virtualSize || s.rawSize;
    if (rva >= s.virtualAddress && rva < s.virtualAddress + Math.max(size, s.rawSize)) {
      return rva - s.virtualAddress + s.rawPointer;
    }
  }
  return null;
}

function readCString(buf, offset) {
  if (offset === null || offset < 0 || offset >= buf.length) return null;
  const end = buf.indexOf(0, offset);
  return buf.toString('latin1', offset, end === -1 ? buf.length : end);
}

/**
 * يقرأ أسماء DLLs المستوردة (العادية + المؤجَّلة) من ملف PE.
 * يُعيد `null` إن لم يكن الملف PE صالحًا (لن يكون له متطلبات تشغيل أصلًا).
 */
function readPeImports(filePath) {
  let buf;
  try {
    buf = fs.readFileSync(filePath);
  } catch {
    return null;
  }
  if (buf.length < 0x40 || buf.readUInt16LE(0) !== 0x5a4d) return null; // 'MZ'

  const peOffset = buf.readUInt32LE(0x3c);
  if (peOffset + 24 > buf.length || buf.readUInt32LE(peOffset) !== 0x00004550) return null; // 'PE\0\0'

  const machine = buf.readUInt16LE(peOffset + 4);
  const numberOfSections = buf.readUInt16LE(peOffset + 6);
  const sizeOfOptionalHeader = buf.readUInt16LE(peOffset + 20);
  const optionalHeaderOffset = peOffset + 24;
  if (optionalHeaderOffset + sizeOfOptionalHeader > buf.length) return null;

  const magic = buf.readUInt16LE(optionalHeaderOffset);
  const isPe32Plus = magic === 0x20b;
  if (!isPe32Plus && magic !== 0x10b) return null;

  // جداول الدلائل تبدأ بعد الترويسة الاختيارية القياسية: 96 بايت (PE32) / 112 (PE32+)
  const dataDirOffset = optionalHeaderOffset + (isPe32Plus ? 112 : 96);

  const sectionsOffset = optionalHeaderOffset + sizeOfOptionalHeader;
  const sections = [];
  for (let i = 0; i < numberOfSections; i++) {
    const off = sectionsOffset + i * 40;
    if (off + 40 > buf.length) break;
    sections.push({
      virtualSize: buf.readUInt32LE(off + 8),
      virtualAddress: buf.readUInt32LE(off + 12),
      rawSize: buf.readUInt32LE(off + 16),
      rawPointer: buf.readUInt32LE(off + 20),
    });
  }

  const imports = new Set();

  /** الدليل 1 = Import Directory (استيراد عادي)، الدليل 13 = Delay Import Directory. */
  const readDescriptors = (dirIndex, descriptorSize, nameFieldOffset) => {
    const dirOff = dataDirOffset + dirIndex * 8;
    if (dirOff + 8 > buf.length) return;
    const dirRva = buf.readUInt32LE(dirOff);
    if (!dirRva) return;
    let off = rvaToOffset(sections, dirRva);
    if (off === null) return;

    for (let i = 0; i < 4096; i++) {
      if (off + descriptorSize > buf.length) break;
      const slice = buf.subarray(off, off + descriptorSize);
      if (slice.every((b) => b === 0)) break; // نهاية الجدول
      const nameRva = buf.readUInt32LE(off + nameFieldOffset);
      if (nameRva) {
        const name = readCString(buf, rvaToOffset(sections, nameRva));
        if (name && /\.(dll|DLL)$/.test(name)) imports.add(name.toLowerCase());
      }
      off += descriptorSize;
    }
  };

  readDescriptors(1, 20, 12); // IMAGE_IMPORT_DESCRIPTOR.Name @ +12
  readDescriptors(13, 32, 4); // IMAGE_DELAYLOAD_DESCRIPTOR.DllNameRVA @ +4

  return {
    arch: machine === 0x8664 ? 'x64' : machine === 0x14c ? 'x86' : machine === 0xaa64 ? 'arm64' : `0x${machine.toString(16)}`,
    imports: [...imports].sort(),
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// 2) خط أساس وندوز 10/11 — DLLs المضمونة على أي تثبيت نظيف
// ─────────────────────────────────────────────────────────────────────────────

/**
 * موجودة في %SystemRoot%\System32 على كل تثبيت Windows 10/11 x64 نظيف.
 * لا تُوزَّع ولا تُثبَّت — وجودها جزء من نظام التشغيل نفسه.
 */
const WINDOWS_BASELINE = new Set([
  'advapi32.dll', 'authz.dll', 'avrt.dll', 'bcrypt.dll', 'bcryptprimitives.dll',
  'cabinet.dll', 'cfgmgr32.dll', 'chakra.dll', 'clbcatq.dll', 'combase.dll',
  'comctl32.dll', 'comdlg32.dll', 'credui.dll', 'crypt32.dll', 'cryptbase.dll',
  'cryptnet.dll', 'cryptui.dll', 'd2d1.dll', 'd3d10.dll', 'd3d10_1.dll',
  'd3d11.dll', 'd3d12.dll', 'd3d9.dll', 'davclnt.dll', 'dbghelp.dll',
  'dcomp.dll', 'devobj.dll', 'dhcpcsvc.dll', 'dnsapi.dll', 'dsound.dll',
  'dwmapi.dll', 'dwrite.dll', 'dxgi.dll', 'dxva2.dll', 'esent.dll',
  'fltlib.dll', 'fwpuclnt.dll', 'gdi32.dll', 'gdi32full.dll', 'gdiplus.dll',
  'hid.dll', 'httpapi.dll', 'iphlpapi.dll', 'imm32.dll', 'kernel32.dll',
  'kernelbase.dll', 'ksuser.dll', 'ktmw32.dll', 'mf.dll', 'mfplat.dll',
  'mfreadwrite.dll', 'mpr.dll', 'mscoree.dll', 'msi.dll', 'msimg32.dll',
  'mswsock.dll', 'ncrypt.dll', 'netapi32.dll', 'netutils.dll', 'ntdll.dll',
  'ntdsapi.dll', 'ole32.dll', 'oleacc.dll', 'oleaut32.dll', 'oledlg.dll',
  'opengl32.dll', 'pdh.dll', 'powrprof.dll', 'propsys.dll',
  'psapi.dll', 'rpcrt4.dll', 'rstrtmgr.dll', 'sechost.dll', 'secur32.dll',
  'setupapi.dll', 'shcore.dll', 'shell32.dll', 'shlwapi.dll', 'srvcli.dll',
  'sspicli.dll', 'taskschd.dll', 'ucrtbase.dll', 'urlmon.dll', 'user32.dll',
  'userenv.dll', 'usp10.dll', 'uxtheme.dll', 'version.dll', 'wer.dll',
  'websocket.dll', 'winhttp.dll', 'wininet.dll', 'winmm.dll', 'winspool.drv',
  'wintrust.dll', 'wkscli.dll', 'wldap32.dll', 'ws2_32.dll', 'wsock32.dll',
  'wtsapi32.dll', 'xinput1_4.dll', 'dxcore.dll', 'onecoreuapcommonproxystub.dll',
  'windows.storage.dll', 'wintypes.dll', 'coremessaging.dll', 'ninput.dll',
  'inputhost.dll', 'twinapi.appcore.dll', 'uiautomationcore.dll', 'msvcrt.dll',
  'ntoskrnl.exe', 'hal.dll', 'dbgcore.dll', 'winsta.dll', 'dbghelp.dll',
  'msvcp_win.dll', 'ucrtbased.dll', 'ext-ms-win-ntuser-window-l1-1-0.dll',
  // خطوط/أجهزة — موجودة في System32 على كل Windows 10/11 (تستوردها Electron).
  'fontsub.dll', 'winusb.dll', 'dwmredir.dll', 'winusb.sys', 'usp10.dll',
  'msdmo.dll', 'audioses.dll', 'mmdevapi.dll', 'wevtapi.dll', 'wecapi.dll',
  'sensorsapi.dll', 'portabledeviceapi.dll', 'bluetoothapis.dll', 'deviceaccess.dll',
]);

/** عقود API Set — أسماء وهمية يحلّها المحمّل داخليًا؛ ليست ملفات توزَّع أبدًا. */
const isApiSet = (dll) => /^(api-ms-win-|ext-ms-win-)/.test(dll);

/**
 * DLLs معروفة تأتي من حزمة قابلة للتوزيع — تُترجَم إلى متطلب تثبيت فعلي.
 * المفتاح: اسم الـDLL. القيمة: معرّف المتطلب في `REDISTRIBUTABLES`.
 */
const REDIST_DLL_MAP = {
  'vcruntime140.dll': 'vcredist_x64',
  'vcruntime140_1.dll': 'vcredist_x64',
  'msvcp140.dll': 'vcredist_x64',
  'msvcp140_1.dll': 'vcredist_x64',
  'msvcp140_2.dll': 'vcredist_x64',
  'msvcp140_atomic_wait.dll': 'vcredist_x64',
  'msvcp140_codecvt_ids.dll': 'vcredist_x64',
  'concrt140.dll': 'vcredist_x64',
  'vccorlib140.dll': 'vcredist_x64',
};

const REDISTRIBUTABLES = {
  vcredist_x64: {
    id: 'vcredist_x64',
    name: 'Microsoft Visual C++ 2015-2022 Redistributable (x64)',
    installerFile: 'VC_redist.x64.exe',
    downloadUrl: 'https://aka.ms/vs/17/release/vc_redist.x64.exe',
    /** فحص الوجود: مفتاح السجل الرسمي الذي يكتبه المثبّت. */
    detection: {
      type: 'registry',
      root: 'HKLM',
      key: 'SOFTWARE\\Microsoft\\VisualStudio\\14.0\\VC\\Runtimes\\x64',
      valueName: 'Installed',
      expected: 1,
    },
    silentArgs: '/install /quiet /norestart',
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// 3) اكتشاف الملفات الثنائية داخل ناتج البناء
// ─────────────────────────────────────────────────────────────────────────────

const BINARY_EXT = new Set(['.node', '.dll', '.exe']);

/** مجلدات لا تُفحص أبدًا: ليست جزءًا من ناتج التوزيع. */
const SKIP_DIRS = new Set(['.git', '.cache', 'test', 'tests', '__tests__', 'coverage', '.bin']);

function walkBinaries(root, out = [], depth = 0) {
  if (depth > 14) return out;
  let entries;
  try {
    entries = fs.readdirSync(root, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const e of entries) {
    const full = path.join(root, e.name);
    if (e.isDirectory()) {
      if (SKIP_DIRS.has(e.name)) continue;
      walkBinaries(full, out, depth + 1);
    } else if (e.isFile() && BINARY_EXT.has(path.extname(e.name).toLowerCase())) {
      out.push(full);
    }
  }
  return out;
}

// ─────────────────────────────────────────────────────────────────────────────
// 4) التحليل
// ─────────────────────────────────────────────────────────────────────────────

/** المسارات المفحوصة افتراضيًا — كل ما يُشحن فعليًا مع المثبّت. */
const DEFAULT_TARGETS = [
  'backend/node_modules',
  'backend/dist',
  'electron-dist',
  'node_modules/electron/dist',
];

function analyze(targets) {
  const files = [];
  for (const t of targets) {
    const abs = path.isAbsolute(t) ? t : path.join(REPO_ROOT, t);
    if (!fs.existsSync(abs)) continue;
    const stat = fs.statSync(abs);
    if (stat.isDirectory()) files.push(...walkBinaries(abs));
    else if (BINARY_EXT.has(path.extname(abs).toLowerCase())) files.push(abs);
  }

  /** dll (lowercase) → مجموعة الملفات التي تستوردها */
  const externalImports = new Map();
  const analyzed = [];

  for (const file of files) {
    const pe = readPeImports(file);
    if (!pe) continue;
    const rel = path.relative(REPO_ROOT, file).replace(/\\/g, '/');
    analyzed.push({ file: rel, arch: pe.arch, importCount: pe.imports.length });

    for (const dll of pe.imports) {
      if (isApiSet(dll) || WINDOWS_BASELINE.has(dll)) continue;
      // استيراد من ثنائي آخر داخل نفس الحزمة (مثلًا ffmpeg.dll بجانب electron.exe)
      // ليس متطلبًا خارجيًا — نتحقق بوجود الملف بجوار المستورِد أو في أي مسار مفحوص.
      if (!externalImports.has(dll)) externalImports.set(dll, new Set());
      externalImports.get(dll).add(rel);
    }
  }

  // استبعاد ما يُشحن معنا فعلًا (DLLs موجودة داخل شجرة الملفات المفحوصة).
  const shippedBasenames = new Set(files.map((f) => path.basename(f).toLowerCase()));
  const requirements = new Map(); // redistId → Set(dll)
  const unknown = new Map();      // dll → Set(files)

  for (const [dll, importers] of externalImports) {
    if (shippedBasenames.has(dll)) continue; // مشحون داخل الحزمة — لا متطلب
    const redistId = REDIST_DLL_MAP[dll];
    if (redistId) {
      if (!requirements.has(redistId)) requirements.set(redistId, new Set());
      requirements.get(redistId).add(dll);
    } else {
      unknown.set(dll, importers);
    }
  }

  return { analyzed, requirements, unknown, externalImports, shippedBasenames };
}

// ─────────────────────────────────────────────────────────────────────────────
// 5) نقطة الدخول
// ─────────────────────────────────────────────────────────────────────────────

function parseArgs(argv) {
  const args = { targets: [], json: path.join(REPO_ROOT, 'build', 'runtime-requirements.json'), quiet: false };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--root' && argv[i + 1]) args.targets.push(argv[++i]);
    else if (argv[i] === '--json' && argv[i + 1]) args.json = argv[++i];
    else if (argv[i] === '--quiet') args.quiet = true;
  }
  if (args.targets.length === 0) args.targets = DEFAULT_TARGETS;
  return args;
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const log = (m) => { if (!args.quiet) console.log(m); };

  log('[runtime-deps] فحص الثنائيات في: ' + args.targets.join(', '));
  const result = analyze(args.targets);
  log(`[runtime-deps] فُحص ${result.analyzed.length} ملف PE.`);

  const manifest = {
    generatedFor: 'Al Manar ERP',
    platform: 'win32-x64',
    supportedOs: ['Windows 10 (64-bit) 1809+', 'Windows 11 (64-bit)'],
    analyzedBinaries: result.analyzed.length,
    /** الاعتماديات المُضمَّنة في الحزمة نفسها — لا تحتاج تثبيتًا. */
    bundledRuntimes: [
      { name: 'Electron (Chromium + Node.js)', note: 'مُضمَّن كاملًا داخل الحزمة — لا يتطلب Node.js مثبّتًا على الجهاز.' },
      { name: 'Prisma Query Engine (native)', note: 'query_engine-windows.dll.node مُضمَّن ضمن موارد الخدمة الخلفية.' },
      { name: 'SQLite', note: 'مُضمَّن داخل محرّك Prisma — لا يتطلب تثبيتًا منفصلًا.' },
    ],
    /** متطلبات فعلية استُخرجت من جداول استيراد PE. */
    prerequisites: [],
    unknownImports: [],
  };

  for (const [redistId, dlls] of result.requirements) {
    const redist = REDISTRIBUTABLES[redistId];
    manifest.prerequisites.push({
      ...redist,
      requiredBy: [...dlls].sort(),
      importedBy: [...new Set([...dlls].flatMap((d) => [...(result.externalImports.get(d) ?? [])]))].sort().slice(0, 12),
    });
  }

  for (const [dll, importers] of result.unknown) {
    manifest.unknownImports.push({ dll, importedBy: [...importers].sort().slice(0, 8) });
  }

  fs.mkdirSync(path.dirname(args.json), { recursive: true });
  fs.writeFileSync(args.json, JSON.stringify(manifest, null, 2), 'utf8');
  log(`[runtime-deps] كُتب البيان: ${path.relative(REPO_ROOT, args.json).replace(/\\/g, '/')}`);

  log('');
  log('── متطلبات وقت التشغيل المكتشَفة ─────────────────────────────');
  if (manifest.prerequisites.length === 0) {
    log('  (لا شيء) — الحزمة مكتفية ذاتيًا بالكامل على وندوز 10/11 نظيف.');
  }
  for (const p of manifest.prerequisites) {
    log(`  • ${p.name}`);
    log(`      مطلوب بسبب: ${p.requiredBy.join(', ')}`);
    log(`      فحص الوجود: ${p.detection.root}\\${p.detection.key} → ${p.detection.valueName}`);
  }

  if (manifest.unknownImports.length > 0) {
    log('');
    log('── استيرادات غير مُصنَّفة (تتطلب مراجعة) ─────────────────────');
    for (const u of manifest.unknownImports) {
      log(`  ! ${u.dll}  ←  ${u.importedBy.join(', ')}`);
    }
    // fail-closed: متطلب مجهول يعني احتمال فشل على جهاز نظيف.
    process.exitCode = 1;
  }
}

if (require.main === module) main();

module.exports = { readPeImports, analyze, REDISTRIBUTABLES, REDIST_DLL_MAP, WINDOWS_BASELINE };
