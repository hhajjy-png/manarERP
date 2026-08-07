#!/usr/bin/env node
/**
 * Production Deployment Pack v1 — تنظيف بقايا التطوير من شجرة العمل.
 *
 * ── ماذا يحذف ──────────────────────────────────────────────────────────────────
 * ملفات تشخيص/فحص/إصلاح لمرة واحدة تراكمت أثناء التطوير. لا يُنفَّذ أيٌّ منها في
 * الإنتاج، ولا يدخل حزمة التثبيت أصلًا (مُستبعَد في electron-builder.yml) — الحذف
 * هنا نظافة مستودع لا شرط تشغيل.
 *
 * ── ماذا لا يحذف أبدًا ─────────────────────────────────────────────────────────
 * • مجموعة الاختبارات الحقيقية (`backend/src/**\/__tests__`, `electron/**\/__tests__`,
 *   `frontend/src/**\/__tests__`) — شبكة الأمان الوحيدة ضد الانحدار. تُستبعَد من
 *   الحزمة، ولا تُحذف من المستودع.
 * • أي ملف بيانات أو مستند أو أصل تصميم.
 * • `backend/scripts/one-time/create-letters-permissions.ts` — سكربت تهيئة صلاحيات
 *   قابل لإعادة التشغيل، لا أداة تشخيص.
 *
 * الاستخدام:
 *   node scripts/cleanup-dev-artifacts.js            # عرض فقط (dry-run)
 *   node scripts/cleanup-dev-artifacts.js --apply    # تنفيذ الحذف فعليًا
 */
'use strict';

const fs = require('fs');
const path = require('path');

const REPO_ROOT = path.resolve(__dirname, '..');

/**
 * كل مدخل: مسار نسبي من جذر المستودع + سبب الحذف.
 * قائمة صريحة لا أنماط عامة — الحذف بأنماط عامة يبتلع ملفًا مهمًا يومًا ما.
 */
const ARTIFACTS = [
  // ── مخرجات vitest مؤقتة تُركت في الجذر ─────────────────────────────────────
  { file: '.tmp-final.json', reason: 'مخرجات vitest مؤقتة' },
  { file: '.tmp-vitest.json', reason: 'مخرجات vitest مؤقتة' },
  { file: '.tmp-vitest2.json', reason: 'مخرجات vitest مؤقتة' },
  { file: '.tmp-vitest3.json', reason: 'مخرجات vitest مؤقتة' },
  { file: '.tmp-vitest4.json', reason: 'مخرجات vitest مؤقتة' },

  // ── أدوات إصلاح/فحص لمرة واحدة، بمسارات مثبَّتة على جهاز المطوّر ────────────
  { file: 'backend/__backfill_historical_cheques.ts', reason: 'أداة تعبئة لمرة واحدة (مسار مثبَّت على جهاز المطوّر)' },
  { file: 'backend/__fix_backfilled_cheque_numbers.ts', reason: 'أداة إصلاح لمرة واحدة' },
  { file: 'backend/__inspect_xlsx.ts', reason: 'أداة فحص (مسار مثبَّت على جهاز المطوّر)' },
  { file: 'backend/__verify_no_side_effects.ts', reason: 'تحقّق لمرة واحدة (مسار مثبَّت على جهاز المطوّر)' },
  { file: 'backend/__verify_padfix_final.ts', reason: 'تحقّق لمرة واحدة' },

  // ── سكربتات تشخيص مؤقتة ────────────────────────────────────────────────────
  { file: 'backend/scripts/one-time/_ar_trace.ts', reason: 'تتبّع تشخيصي مؤقت' },
  { file: 'backend/scripts/one-time/_ar_trace2.ts', reason: 'تتبّع تشخيصي مؤقت' },
  { file: 'backend/scripts/one-time/_audit_224520.ts', reason: 'تدقيق سجل واحد — انتهى الغرض منه' },
  { file: 'backend/scripts/one-time/_audit_224520_b.ts', reason: 'تدقيق سجل واحد — انتهى الغرض منه' },
  { file: 'backend/scripts/one-time/_audit_224520_c.ts', reason: 'تدقيق سجل واحد — انتهى الغرض منه' },
  { file: 'backend/scripts/one-time/_fieldref_probe.ts', reason: 'فحص مرجع حقل مؤقت' },
  { file: 'backend/scripts/one-time/fix-expense-dates-2026-06-07.ts', reason: 'إصلاح بيانات مؤرَّخ — طُبِّق بالفعل' },

  // ── ملفات فحص في الواجهة ───────────────────────────────────────────────────
  { file: 'frontend/src/pages/__tests__/__probe.test.tsx', reason: 'اختبار فحص مؤقت (ليس تغطية حقيقية)' },

  // ── ملف بمسار تالف (اسم ملف يحتوي مسارًا كاملًا) ───────────────────────────
  { file: 'backend/C:UsershhajjAppDataLocalTempbackend-watch-test.log', reason: 'سجلّ بمسار تالف نتج عن إعادة توجيه خاطئة' },
];

/** بقايا نسخ محرّك Prisma المؤقتة — أنماط، لأن الأسماء تحمل رقم عملية متغيّرًا. */
const ENGINE_TMP_DIRS = [
  'node_modules/.prisma/client',
  'backend/node_modules/.prisma/client',
];

function findEngineTemps() {
  const found = [];
  for (const dir of ENGINE_TMP_DIRS) {
    const abs = path.join(REPO_ROOT, dir);
    let entries;
    try {
      entries = fs.readdirSync(abs, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const e of entries) {
      if (!e.isFile() || !/\.tmp\d+$/i.test(e.name)) continue;
      const rel = path.join(dir, e.name).replace(/\\/g, '/');
      let size = 0;
      try { size = fs.statSync(path.join(abs, e.name)).size; } catch { /* تجاهل */ }
      found.push({ file: rel, reason: 'نسخة مؤقتة يتيمة من محرّك Prisma', size });
    }
  }
  return found;
}

function main() {
  const apply = process.argv.includes('--apply');

  const targets = [...ARTIFACTS, ...findEngineTemps()]
    .map((t) => {
      const abs = path.join(REPO_ROOT, t.file);
      let size = t.size;
      let exists = false;
      try {
        const st = fs.statSync(abs);
        exists = st.isFile();
        if (size === undefined) size = st.size;
      } catch { /* غير موجود */ }
      return { ...t, abs, exists, size: size ?? 0 };
    })
    .filter((t) => t.exists);

  if (targets.length === 0) {
    console.log('[cleanup] لا بقايا تطوير — شجرة العمل نظيفة.');
    return;
  }

  const totalBytes = targets.reduce((sum, t) => sum + t.size, 0);
  console.log(`[cleanup] ${targets.length} ملف · ${(totalBytes / 1024 / 1024).toFixed(1)} ميغابايت\n`);

  // النسخ المؤقتة للمحرّك تُطوى في سطر واحد — قد تكون عشرات ولا فائدة من سردها.
  const engines = targets.filter((t) => /\.tmp\d+$/i.test(t.file));
  for (const t of targets.filter((x) => !engines.includes(x))) {
    console.log(`  ${t.file}\n      ${t.reason}`);
  }
  if (engines.length > 0) {
    const mb = (engines.reduce((s, e) => s + e.size, 0) / 1024 / 1024).toFixed(0);
    console.log(`  ${engines.length} × نسخة مؤقتة يتيمة من محرّك Prisma (${mb} ميغابايت)`);
  }

  if (!apply) {
    console.log('\n[cleanup] عرض فقط — لم يُحذف شيء. للتنفيذ:');
    console.log('          node scripts/cleanup-dev-artifacts.js --apply');
    return;
  }

  let deleted = 0;
  const failed = [];
  for (const t of targets) {
    try {
      fs.rmSync(t.abs, { force: true });
      deleted++;
    } catch (err) {
      failed.push({ file: t.file, error: err instanceof Error ? err.message : String(err) });
    }
  }

  console.log(`\n[cleanup] حُذف ${deleted} ملف (${(totalBytes / 1024 / 1024).toFixed(1)} ميغابايت).`);
  for (const f of failed) console.error(`[cleanup] تعذّر حذف ${f.file}: ${f.error}`);
  if (failed.length > 0) process.exitCode = 1;

  console.log('[cleanup] الملفات المُتتبَّعة بـgit تظهر الآن كمحذوفة — راجعها بـ"git status" قبل الالتزام.');
}

if (require.main === module) main();

module.exports = { ARTIFACTS, findEngineTemps };
