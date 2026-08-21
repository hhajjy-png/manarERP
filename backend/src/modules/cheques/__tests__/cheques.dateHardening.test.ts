import { describe, it, expect } from 'vitest';
import { createChequeSchema, updateChequeSchema } from '../cheques.schema';

/**
 * API Date Hardening Pack v1 — الحالة الإلزامية: chequeDate.
 *
 * كانت `chequeDate: z.coerce.date()` تُمرِّر أي نص إلى `new Date(value)`، فتصبح
 * صيغة مثل `'02/08/2026'` عرضة لتفسير المحرّك غير القياسي (MM/DD أمريكي عادةً) —
 * «2 أغسطس» يتحوّل صامتًا إلى «8 فبراير». هذه الاختبارات تثبت مباشرةً على مخطط
 * الشيك (لا المدقّق المشترك وحده) أن الصيغة القانونية فقط تُقبَل.
 */

// `bankAccountId` بدل `bankName` منذ Multi-Bank Cheques Foundation v1: هوية البنك
// صارت الحساب البنكي، و`bankName` يُشتق في الخدمة من `Bank.nameAr` ولا يُقبل من
// العميل إطلاقًا. هذا الملف يختبر تشديد التاريخ وحده، والقاعدة هنا محدَّثة فقط
// لتبقى حمولة صالحة.
const VALID_BASE = {
  chequeNumber: 'CHQ-1001',
  beneficiaryName: 'شركة الاختبار',
  amount: 100,
  currency: 'KWD' as const,
  bankAccountId: 1,
};

function parseCreate(chequeDate: unknown) {
  return createChequeSchema.safeParse({ body: { ...VALID_BASE, chequeDate } });
}

describe('cheques.schema — chequeDate DATE-ONLY hardening', () => {
  it('"2026-08-02" مقبول → 2 أغسطس 2026', () => {
    const r = parseCreate('2026-08-02');
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.body.chequeDate.getUTCFullYear()).toBe(2026);
      expect(r.data.body.chequeDate.getUTCMonth()).toBe(7); // أغسطس (0-based)
      expect(r.data.body.chequeDate.getUTCDate()).toBe(2);
    }
  });

  it('"02/08/2026" مرفوض — لا يُترك لتفسير JS كـ MM/DD', () => {
    expect(parseCreate('02/08/2026').success).toBe(false);
  });

  it('"08/02/2026" مرفوض — نفس الالتباس بالاتجاه المعاكس', () => {
    expect(parseCreate('08/02/2026').success).toBe(false);
  });

  it('"31/03/2025" مرفوض كصيغة غير قانونية', () => {
    expect(parseCreate('31/03/2025').success).toBe(false);
  });

  it('"2028-02-29" (سنة كبيسة) مقبول', () => {
    expect(parseCreate('2028-02-29').success).toBe(true);
  });

  it('"2026-02-29" (سنة غير كبيسة) مرفوض', () => {
    expect(parseCreate('2026-02-29').success).toBe(false);
  });

  it('تعديل البيانات الأخرى (المبلغ/المستفيد) مع chequeDate ثابتة بصيغة ISO ينجح', () => {
    const r = updateChequeSchema.safeParse({
      body: { amount: 250, beneficiaryName: 'مستفيد جديد', chequeDate: '2026-08-02' },
    });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.body.chequeDate?.toISOString()).toBe('2026-08-02T00:00:00.000Z');
  });

  it('تعديل بلا chequeDate إطلاقًا يبقى صالحًا (اختياري في التعديل)', () => {
    const r = updateChequeSchema.safeParse({ body: { amount: 250 } });
    expect(r.success).toBe(true);
  });

  it('نطاق السنة (2020-2035) على chequeDate القانونية لا يزال يُطبَّق بعد التشديد', () => {
    expect(parseCreate('2010-01-01').success).toBe(false); // خارج المدى، لكن قانوني الصيغة
    expect(parseCreate('2036-01-01').success).toBe(false);
    expect(parseCreate('2035-12-31').success).toBe(true);
  });
});
