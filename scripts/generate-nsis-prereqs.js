#!/usr/bin/env node
/**
 * Production Deployment Pack v1 — مولّد سكربت المتطلبات المسبقة لمثبّت NSIS.
 *
 * يقرأ `build/runtime-requirements.json` (الذي ينتجه `analyze-runtime-deps.js` من
 * جداول استيراد PE للثنائيات الفعلية) ويولّد منه `build/installer-prereqs.nsh`
 * الذي يُدمج في مثبّت electron-builder عبر `nsis.include`.
 *
 * ── لماذا مولَّد لا مكتوب يدويًا ───────────────────────────────────────────────
 *
 * لو كُتب `.nsh` يدويًا لانفصل عن الواقع أول مرة يتغيّر اعتماد أصلي: يبقى المثبّت
 * يفحص متطلبًا لم يعد موجودًا، أو — الأسوأ — لا يفحص متطلبًا جديدًا فيفشل التشغيل
 * على جهاز نظيف. هنا سلسلة واحدة: الثنائيات ⇒ التحليل ⇒ البيان ⇒ سكربت المثبّت.
 *
 * السلوك المولَّد لكل متطلب:
 *   • موجود  ⇒ يُتخطّى تمامًا (لا إعادة تثبيت، ولا لمس لمكوّن قائم).
 *   • ناقص   ⇒ يُثبَّت صامتًا من نسخة مُضمَّنة داخل المثبّت (بلا أي تنزيل من المستخدم).
 *
 * بالإضافة إلى حارس نسخة نظام التشغيل: Windows 10 (1809 / build 17763) فأحدث.
 */
'use strict';

const fs = require('fs');
const path = require('path');

const REPO_ROOT = path.resolve(__dirname, '..');
const MANIFEST_PATH = path.join(REPO_ROOT, 'build', 'runtime-requirements.json');
const OUTPUT_PATH = path.join(REPO_ROOT, 'build', 'installer-prereqs.nsh');
const PREREQ_DIR = path.join(REPO_ROOT, 'build', 'prereq');

/** أقل بناء وندوز مدعوم رسميًا — Windows 10 1809 (LTSC/ما بعده) و Windows 11. */
const MIN_WINDOWS_BUILD = 17763;

function nsisEscape(s) {
  return String(s).replace(/\$/g, '$$$$').replace(/"/g, '$\\"');
}

function generate() {
  if (!fs.existsSync(MANIFEST_PATH)) {
    throw new Error(
      `لم يُعثر على بيان المتطلبات: ${MANIFEST_PATH}\n` +
        'شغّل "node scripts/analyze-runtime-deps.js" أولًا.',
    );
  }

  const manifest = JSON.parse(fs.readFileSync(MANIFEST_PATH, 'utf8'));
  const prereqs = Array.isArray(manifest.prerequisites) ? manifest.prerequisites : [];

  // متطلب مُعلَن بلا ملف مثبّت مُضمَّن = وعد لا يمكن الوفاء به على جهاز بلا إنترنت.
  // نفشل عند البناء لا عند التثبيت لدى المستخدم.
  const missingInstallers = prereqs.filter((p) => !fs.existsSync(path.join(PREREQ_DIR, p.installerFile)));
  if (missingInstallers.length > 0) {
    throw new Error(
      'متطلبات مُعلَنة بلا ملفات تثبيت مُضمَّنة:\n' +
        missingInstallers.map((p) => `  • ${p.name} → build/prereq/${p.installerFile}`).join('\n') +
        '\nنزّل الملفات إلى build/prereq/ أو أزل المتطلب من البيان.',
    );
  }

  const lines = [];
  const w = (s = '') => lines.push(s);

  w('; ─────────────────────────────────────────────────────────────────────────');
  w('; مولَّد آليًا بواسطة scripts/generate-nsis-prereqs.js — لا تحرّره يدويًا.');
  w(`; المصدر: build/runtime-requirements.json (${prereqs.length} متطلب)`);
  w('; ─────────────────────────────────────────────────────────────────────────');
  w();
  w('!include "LogicLib.nsh"');
  w('!include "x64.nsh"');
  w();
  w(`!define MANAR_MIN_WIN_BUILD ${MIN_WINDOWS_BUILD}`);
  w();

  // ── دوال المثبّت ───────────────────────────────────────────────────────────
  //
  // كل التعريفات **وكل النداءات** داخل `!ifndef BUILD_UNINSTALLER`.
  //
  // يُصرِّف electron-builder السكربت مرّتين: مرّة للمثبّت ومرّة لبناء المُزيل
  // (`BUILD_UNINSTALLER`). في التمريرة الثانية لا يُدرَج `preInit` ولا
  // `customInstall`، فتبقى الدوال معرَّفة بلا نداء ⇒
  //     warning 6010: install function "..." not referenced
  // و electron-builder يعامل تحذيرات NSIS كأخطاء ⇒ يفشل البناء كليًا. ولا معنى
  // للفحوص هناك أصلًا: تلك التمريرة تجري على جهاز البناء لا على جهاز المستخدم.
  w('!ifndef BUILD_UNINSTALLER');
  w();
  w('; يتحقق من أن الجهاز يستوفي بيئة التشغيل المدعومة رسميًا: Windows 10/11 (64-bit).');
  w('Function ManarVerifyPlatform');
  w('  ${IfNot} ${RunningX64}');
  w('    MessageBox MB_OK|MB_ICONSTOP "هذا البرنامج يعمل على إصدار 64-bit من Windows فقط.$\\r$\\n$\\r$\\nنظام التشغيل الحالي 32-bit وغير مدعوم."');
  w('    Abort');
  w('  ${EndIf}');
  w();
  w('  ClearErrors');
  w('  ReadRegStr $0 HKLM "SOFTWARE\\Microsoft\\Windows NT\\CurrentVersion" "CurrentBuild"');
  w('  ${If} ${Errors}');
  w('    ; تعذّرت القراءة — لا نمنع التثبيت بسبب فحص تعذّر إجراؤه.');
  w('    Return');
  w('  ${EndIf}');
  w('  IntOp $1 $0 + 0');
  w('  ${If} $1 < ${MANAR_MIN_WIN_BUILD}');
  w('    MessageBox MB_OK|MB_ICONSTOP "يتطلب هذا البرنامج Windows 10 (تحديث 1809) أو Windows 11.$\\r$\\n$\\r$\\nإصدار Windows على هذا الجهاز أقدم من المدعوم (build $0)."');
  w('    Abort');
  w('  ${EndIf}');
  w('FunctionEnd');
  w();

  // ── فحص/تثبيت المتطلبات ────────────────────────────────────────────────────
  w('; يفحص كل متطلب وقت تشغيل مكتشَف آليًا: الموجود يُتخطّى، والناقص يُثبَّت صامتًا.');
  w('Function ManarInstallPrerequisites');
  if (prereqs.length === 0) {
    w('  ; لا متطلبات خارجية: تحليل جداول استيراد PE لكل ثنائي مشحون أثبت أن الحزمة');
    w('  ; مكتفية ذاتيًا على Windows 10/11 نظيف (Electron و Prisma engine يربطان');
    w('  ; بمكتبات النظام القياسية فقط، بلا أي DLL قابل لإعادة التوزيع).');
    w('  DetailPrint "فحص متطلبات التشغيل: لا متطلبات خارجية — الحزمة مكتفية ذاتيًا."');
  }
  for (const [i, p] of prereqs.entries()) {
    const varOk = `$${i % 8}`; // سجلات NSIS $0..$7
    w();
    w(`  ; ── ${p.name} ─────────────────────────────────────────────`);
    w(`  DetailPrint "فحص: ${nsisEscape(p.name)}"`);
    w('  ClearErrors');
    w('  SetRegView 64');
    w(`  ReadRegDWORD ${varOk} ${p.detection.root} "${p.detection.key}" "${p.detection.valueName}"`);
    w('  SetRegView lastused');
    w(`  \${If} \${Errors}`);
    w(`  \${OrIf} ${varOk} != ${p.detection.expected}`);
    w(`    DetailPrint "غير موجود — جارٍ التثبيت: ${nsisEscape(p.name)}"`);
    w(`    File "/oname=$PLUGINSDIR\\${p.installerFile}" "${nsisEscape(path.join(PREREQ_DIR, p.installerFile))}"`);
    w(`    ExecWait '"$PLUGINSDIR\\${p.installerFile}" ${p.silentArgs}' $R0`);
    w('    ${If} $R0 != 0');
    w('    ${AndIf} $R0 != 1638'); // 1638 = نسخة أحدث مثبّتة بالفعل
    w('    ${AndIf} $R0 != 3010'); // 3010 = نجح ويتطلب إعادة تشغيل
    w(`      MessageBox MB_OK|MB_ICONEXCLAMATION "تعذّر تثبيت أحد متطلبات التشغيل (${nsisEscape(p.name)}).$\\r$\\n$\\r$\\nرمز الخطأ: $R0$\\r$\\n$\\r$\\nسيستمر التثبيت، لكن قد لا يعمل البرنامج حتى يُثبَّت هذا المتطلب."`);
    w('    ${Else}');
    w(`      DetailPrint "اكتمل تثبيت: ${nsisEscape(p.name)}"`);
    w('    ${EndIf}');
    w('    Delete "$PLUGINSDIR\\' + p.installerFile + '"');
    w('  ${Else}');
    w(`    DetailPrint "موجود مسبقًا — تخطٍّ: ${nsisEscape(p.name)}"`);
    w('  ${EndIf}');
  }
  w('FunctionEnd');
  w();
  w('!endif ; BUILD_UNINSTALLER');
  w();

  // ── ربط الدوال بمراحل electron-builder ─────────────────────────────────────
  w('; يُستدعى مبكرًا جدًا في .onInit — قبل عرض أي واجهة أو كتابة أي ملف.');
  w('!macro preInit');
  w('  !ifndef BUILD_UNINSTALLER');
  w('    Call ManarVerifyPlatform');
  w('  !endif');
  w('!macroend');
  w();
  w('; يُستدعى بعد نسخ ملفات التطبيق — المتطلبات تُفحص وتُثبَّت هنا.');
  w('!macro customInstall');
  w('  !ifndef BUILD_UNINSTALLER');
  w('    Call ManarInstallPrerequisites');
  w('  !endif');
  w('!macroend');
  w();

  fs.mkdirSync(path.dirname(OUTPUT_PATH), { recursive: true });
  fs.writeFileSync(OUTPUT_PATH, lines.join('\r\n'), 'utf8');

  return { outputPath: OUTPUT_PATH, count: prereqs.length };
}

function main() {
  const { outputPath, count } = generate();
  console.log(
    `[nsis-prereqs] وُلّد ${path.relative(REPO_ROOT, outputPath).replace(/\\/g, '/')} — ` +
      (count === 0
        ? 'لا متطلبات خارجية (حزمة مكتفية ذاتيًا) + حارس نسخة وندوز.'
        : `${count} متطلب + حارس نسخة وندوز.`),
  );
}

if (require.main === module) main();

module.exports = { generate, MIN_WINDOWS_BUILD };
