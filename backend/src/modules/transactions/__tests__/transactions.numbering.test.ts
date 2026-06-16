import { describe, it, expect, vi, beforeEach } from 'vitest';
import { TransactionsService } from '../transactions.service';

// ─── اختبارات generateEntryNumber في transactions (نظام JE- القديم) ───────────

describe('TransactionsService.generateEntryNumber — MAX-based numbering', () => {
  let service: TransactionsService;
  const year = new Date().getFullYear();
  const prefix = `JE-${year}-`;

  beforeEach(() => {
    service = new TransactionsService();
  });

  function makeClient(lastEntryNumber: string | null) {
    return {
      transaction: {
        findFirst: vi.fn().mockResolvedValue(
          lastEntryNumber ? { entryNumber: lastEntryNumber } : null,
        ),
      },
    } as any;
  }

  it('يولّد الرقم الأول عندما يكون الجدول فارغاً', async () => {
    const client = makeClient(null);
    const result = await service.generateEntryNumber(client);
    expect(result).toBe(`${prefix}00001`);
  });

  it('يولّد الرقم التالي بعد JE-YYYY-00003 دون فجوة', async () => {
    const client = makeClient(`${prefix}00003`);
    const result = await service.generateEntryNumber(client);
    expect(result).toBe(`${prefix}00004`);
  });

  it('يعمل بصواب عند وجود فجوة: JE-2026-00002 و JE-2026-00003 موجودان والأول مفقود', async () => {
    // الـ findFirst يجلب آخر id — وهو JE-YYYY-00003
    const client = makeClient(`${prefix}00003`);
    const result = await service.generateEntryNumber(client);
    // يجب أن يكون 00004 وليس 00003 (كما كان يحدث مع COUNT=2)
    expect(result).toBe(`${prefix}00004`);
    expect(result).not.toBe(`${prefix}00003`);
  });

  it('لا يُكرّر رقم موجود عند وجود فجوة في التسلسل', async () => {
    // سيناريو إنتاجي: JE-2026-00002 و JE-2026-00003 موجودان، JE-2026-00001 مفقود
    // COUNT = 2 → كان يولّد 00003 (خطأ)، id-desc → يولّد 00004 (صحيح)
    const client = makeClient(`${prefix}00003`);
    const next = await service.generateEntryNumber(client);
    const existing = [`${prefix}00002`, `${prefix}00003`];
    expect(existing).not.toContain(next);
    expect(next).toBe(`${prefix}00004`);
  });

  it('يُنتج رقماً صحيحاً بعد 99999 (overflow حدي)', async () => {
    const client = makeClient(`${prefix}99999`);
    const result = await service.generateEntryNumber(client);
    expect(result).toBe(`${prefix}100000`);
  });
});
