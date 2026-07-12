// @vitest-environment jsdom
import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, cleanup } from '@testing-library/react';
import '@testing-library/jest-dom';
import { readFileSync, readdirSync } from 'node:fs';
import { AnalyticsTab } from '../pages/BankAccountExplorer';
import type { BankAccountDashboard } from '../api/bankAccounts';

/**
 * نظافة مخرجات الاختبارات — حارس دائم.
 *
 * الخطر الذي يحرسه هذا الملف ليس التحذيرات نفسها، بل **إخفاؤها**: كتم `console.warn`
 * على مستوى الوحدة يُعمي كل ما يليه في الملف (تحذيرات act، مفاتيح React، props خاطئة)،
 * فيبدو الاختبار سليمًا وهو يمشي فوق أعطال صامتة. كتم واحد بلا `restore` كان قائمًا
 * فعلًا في `bankAnalyticsTab.test.tsx` — وقد أُزيل في هذه الحزمة.
 *
 * القاعدة: يُسمح بالتجسّس على الـ console **للتأكيد** عليه، لا لإسكاته — وبشرط
 * `mockRestore` صريح.
 */

afterEach(cleanup);

const TESTS_DIR = 'src/__tests__';
const testFiles = readdirSync(TESTS_DIR).filter((f) => f.endsWith('.test.tsx') || f.endsWith('.test.ts'));

describe('لا كتم عامًّا للـ console في أي ملف اختبار', () => {
  it('لا mockImplementation فارغ على console.warn/error بلا restore', () => {
    const offenders: string[] = [];

    for (const file of testFiles) {
      if (file === 'testConsoleHygiene.test.tsx') continue; // هذا الملف يذكرها ليمنعها
      const src = readFileSync(`${TESTS_DIR}/${file}`, 'utf8');

      // كتم صريح: spy على warn/error بتنفيذ فارغ.
      const silenced = /spyOn\(console,\s*'(warn|error)'\)[\s\S]{0,40}mockImplementation\(\s*\(\s*\)\s*=>\s*\{?\s*\}?\s*\)/.test(src);
      // مقبول فقط إن أُعيد الأصل صراحةً في نفس الملف.
      const restored = /mockRestore\(\)|restoreAllMocks\(\)/.test(src);
      if (silenced && !restored) offenders.push(file);

      // ولا اختصارات إخفاء أخرى.
      if (/suppressConsole/.test(src)) offenders.push(`${file} (suppressConsole)`);
    }

    expect(offenders).toEqual([]);
  });

  it('لا فلترة نصية لتحذير Recharts بدل إصلاح البيئة', () => {
    const offenders = testFiles.filter((f) => {
      if (f === 'testConsoleHygiene.test.tsx') return false;
      const src = readFileSync(`${TESTS_DIR}/${f}`, 'utf8');
      return /width\(-1\)|greater than 0/.test(src) && /console\.(warn|error)/.test(src);
    });
    expect(offenders).toEqual([]);
  });
});

describe('console.warn حيّ فعلًا، ولا تحذير أبعاد من المخططات', () => {
  const dashboard = (): BankAccountDashboard => ({
    accountKey: 'A', bankName: 'بنك', currentBalance: 0, openingBalance: 0, closingBalance: 0,
    totalDeposits: 0, totalWithdrawals: 0, netCashFlow: 0, largestDeposit: 0, largestWithdrawal: 0,
    avgDeposit: 0, avgWithdrawal: 0, depositCount: 0, withdrawalCount: 0, transactionCount: 0,
    importCount: 0, coverageStart: null, coverageEnd: null,
    monthly: [
      { month: '2026-05', totalDeposits: 100, totalWithdrawals: 40, netFlow: 60, txCount: 3, largestDeposit: 90, largestWithdrawal: 30 },
      { month: '2026-06', totalDeposits: 200, totalWithdrawals: 70, netFlow: 130, txCount: 5, largestDeposit: 150, largestWithdrawal: 50 },
    ],
    topDeposits: [], topWithdrawals: [],
  });

  it('console.warn غير مكتوم — يصل فعلًا إلى المخرجات', () => {
    // تجسّس **للتأكيد** لا للإسكات: نُبقي السلوك الأصلي ونُعيده فورًا.
    const spy = vi.spyOn(console, 'warn');
    console.warn('probe');
    expect(spy).toHaveBeenCalledWith('probe');
    spy.mockRestore();
    expect(console.warn).not.toHaveProperty('mock'); // عاد الأصل
  });

  it('تصيير مخطط حقيقي لا يُطلق width(-1)/height(-1)', () => {
    const seen: string[] = [];
    const spy = vi.spyOn(console, 'warn').mockImplementation((...args: unknown[]) => {
      seen.push(args.map(String).join(' ')); // نلتقط ونؤكّد — ولا نُسكت شيئًا بعد الاختبار
    });

    render(<AnalyticsTab dashboard={dashboard()} />);

    spy.mockRestore(); // restore صريح — لا يتسرّب الكتم إلى ما بعده
    expect(seen.filter((m) => /greater than 0|width\(-1\)|height\(-1\)/i.test(m))).toEqual([]);
  });
});
