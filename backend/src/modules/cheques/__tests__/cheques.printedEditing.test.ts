import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ChequesService } from '../cheques.service';

/**
 * Cheque Printed Record Editing Fix v1 — regression suite.
 *
 * The cheques module is an operational/reference register for printing, not an
 * immutable ledger, so a PRINTED cheque must stay editable: a mis-keyed payee,
 * amount or date has to be correctable in place, without cancelling and
 * re-creating (which would break cheque-number continuity).
 *
 * These tests pin the new behaviour AND the guarantees that must survive it:
 * the same record is updated (never a new one), print state and print history are
 * untouched, the CANCELLED guard still holds, and the edit is still audited.
 */

vi.mock('../../../config/database', () => ({
  prisma: {
    cheque: { findUnique: vi.fn(), update: vi.fn(), create: vi.fn() },
    chequePrintLog: { create: vi.fn(), findMany: vi.fn(), deleteMany: vi.fn() },
    $transaction: vi.fn(),
  },
}));

vi.mock('../../../core/middleware/audit', () => ({ recordAudit: vi.fn() }));

import { prisma } from '../../../config/database';
import { recordAudit } from '../../../core/middleware/audit';

const req = { user: { userId: 7, username: 'accountant' } } as any;

function makeCheque(overrides: Record<string, unknown> = {}) {
  return {
    id: 46,
    chequeNumber: '000002',
    chequeDate: new Date('2026-08-02T00:00:00.000Z'),
    beneficiaryName: 'ساير طليحان العذاب',
    amount: 1370,
    currency: 'KWD',
    description: 'حساب فواتير شهر 7-2026',
    bankName: 'بنك الخليج',
    notes: null,
    status: 'DRAFT',
    printedAt: null,
    cancelledAt: null,
    printCount: 0,
    paymentVoucherNumber: null,
    ...overrides,
  } as any;
}

/** A fully-populated edit, covering every field the update form exposes. */
const FULL_EDIT = {
  chequeNumber: '000009',
  chequeDate: new Date('2026-09-15T00:00:00.000Z'),
  beneficiaryName: 'مستفيد مصحّح',
  amount: 2480.5,
  currency: 'KWD',
  description: 'وصف مصحّح',
  bankName: 'بنك الكويت الوطني',
  notes: 'ملاحظة مصحّحة',
};

const service = new ChequesService();

/**
 * `update()` calls `findUnique` twice: once by `{ id }` to load the current
 * record, and once by `{ chequeNumber }` for the uniqueness check. The harness
 * dispatches on the where-clause so the uniqueness probe reports "no duplicate"
 * unless a test deliberately supplies one — and `update` echoes the CURRENT
 * record merged with the written data, so print state carried by `current` is
 * observable in the result.
 */
// `prisma as any` mirrors the sibling cheque suites: Prisma's generated client
// types do not describe a plain mock implementation (they expect a
// Prisma__ChequeClient), and these are unit tests of the service's own logic.
const mp = prisma as any;

function givenCurrent(current: any, duplicate: any = null) {
  mp.cheque.findUnique.mockImplementation(async (args: any) =>
    (args.where?.chequeNumber !== undefined ? duplicate : current));
  mp.cheque.update.mockImplementation(async (args: any) => ({
    ...current,
    ...args.data,
    id: args.where.id,
  }));
}

beforeEach(() => {
  vi.clearAllMocks();
});

// ── The fix itself ───────────────────────────────────────────────────────────

describe('editing a PRINTED cheque', () => {
  it('is ALLOWED — no "لا يمكن تعديل شيك مطبوع" rejection', async () => {
    givenCurrent(makeCheque({ status: 'PRINTED', printedAt: new Date('2026-08-03'), printCount: 1 }));
    await expect(service.update(46, { beneficiaryName: 'مستفيد مصحّح' } as any, req)).resolves.toBeTruthy();
    expect(prisma.cheque.update).toHaveBeenCalledTimes(1);
  });

  it('persists EVERY field the edit form exposes', async () => {
    givenCurrent(makeCheque({ status: 'PRINTED', printCount: 1 }));
    await service.update(46, FULL_EDIT as any, req);

    const data = mp.cheque.update.mock.calls[0][0].data as Record<string, unknown>;
    expect(data.chequeNumber).toBe('000009');
    expect(data.chequeDate).toEqual(FULL_EDIT.chequeDate);
    expect(data.beneficiaryName).toBe('مستفيد مصحّح');
    expect(data.amount).toBe(2480.5);
    expect(data.currency).toBe('KWD');
    expect(data.description).toBe('وصف مصحّح');
    expect(data.bankName).toBe('بنك الكويت الوطني');
    expect(data.notes).toBe('ملاحظة مصحّحة');
  });

  it('updates the SAME record — never creates a new cheque', async () => {
    givenCurrent(makeCheque({ status: 'PRINTED', printCount: 1 }));
    const saved = await service.update(46, FULL_EDIT as any, req);

    expect(mp.cheque.update.mock.calls[0][0].where).toEqual({ id: 46 });
    expect((saved as any).id).toBe(46);
    expect(prisma.cheque.create).not.toHaveBeenCalled();
  });

  it('returns the updated values, so a re-fetch/preview shows the edit', async () => {
    givenCurrent(makeCheque({ status: 'PRINTED', printCount: 1 }));
    const saved: any = await service.update(46, FULL_EDIT as any, req);
    expect(saved.beneficiaryName).toBe('مستفيد مصحّح');
    expect(saved.amount).toBe(2480.5);
    expect(saved.chequeDate).toEqual(FULL_EDIT.chequeDate);
  });
});

// ── Print state / history must survive the edit ──────────────────────────────

describe('print state and history are preserved by an edit', () => {
  it('writes ONLY the eight business fields — never status/printedAt/printCount/cancelledAt', async () => {
    givenCurrent(makeCheque({ status: 'PRINTED', printedAt: new Date('2026-08-03'), printCount: 3 }));
    await service.update(46, FULL_EDIT as any, req);

    const data = mp.cheque.update.mock.calls[0][0].data as Record<string, unknown>;
    expect(Object.keys(data).sort()).toEqual([
      'amount', 'bankName', 'beneficiaryName', 'chequeDate',
      'chequeNumber', 'currency', 'description', 'notes',
    ]);
    for (const protectedField of ['status', 'printedAt', 'printCount', 'cancelledAt', 'paymentVoucherNumber']) {
      expect(data, protectedField).not.toHaveProperty(protectedField);
    }
  });

  it('never touches the print log', async () => {
    givenCurrent(makeCheque({ status: 'PRINTED', printCount: 2 }));
    await service.update(46, FULL_EDIT as any, req);
    expect(prisma.chequePrintLog.create).not.toHaveBeenCalled();
    expect(prisma.chequePrintLog.deleteMany).not.toHaveBeenCalled();
  });

  it('the cheque remains PRINTED after the edit', async () => {
    const printedAt = new Date('2026-08-03');
    givenCurrent(makeCheque({ status: 'PRINTED', printedAt, printCount: 2 }));
    const saved: any = await service.update(46, { notes: 'تصحيح' } as any, req);
    expect(saved.status).toBe('PRINTED');
    expect(saved.printedAt).toEqual(printedAt);
    expect(saved.printCount).toBe(2);
  });

  it('records an audit entry with the full before/after', async () => {
    const current = makeCheque({ status: 'PRINTED', printCount: 1 });
    givenCurrent(current);
    await service.update(46, FULL_EDIT as any, req);

    expect(recordAudit).toHaveBeenCalledTimes(1);
    expect(vi.mocked(recordAudit).mock.calls[0][0]).toMatchObject({
      action: 'UPDATE', module: 'cheques', entityId: 46, oldValue: current, newValue: FULL_EDIT,
    });
  });
});

// ── Behaviour that must NOT change ───────────────────────────────────────────

describe('unchanged guards', () => {
  it('a DRAFT cheque is still editable exactly as before', async () => {
    givenCurrent(makeCheque({ status: 'DRAFT' }));
    const saved: any = await service.update(46, FULL_EDIT as any, req);
    expect(saved.id).toBe(46);
    expect(prisma.cheque.update).toHaveBeenCalledTimes(1);
  });

  it('a CANCELLED cheque is still rejected', async () => {
    givenCurrent(makeCheque({ status: 'CANCELLED' }));
    await expect(service.update(46, { notes: 'x' } as any, req)).rejects.toThrow('لا يمكن تعديل شيك ملغي');
    expect(prisma.cheque.update).not.toHaveBeenCalled();
  });

  it('a missing cheque is still rejected', async () => {
    givenCurrent(null);
    await expect(service.update(999, { notes: 'x' } as any, req)).rejects.toThrow('الشيك غير موجود');
  });

  it('duplicate chequeNumber is still rejected — including for a PRINTED cheque', async () => {
    givenCurrent(
      makeCheque({ status: 'PRINTED', printCount: 1 }),
      makeCheque({ id: 99, chequeNumber: '000009', beneficiaryName: 'آخر' }),
    );
    await expect(service.update(46, { chequeNumber: '000009' } as any, req)).rejects.toThrow(/مستخدم بالفعل/);
    expect(prisma.cheque.update).not.toHaveBeenCalled();
  });

  it('omitted fields keep their current values (partial edit of a PRINTED cheque)', async () => {
    const current = makeCheque({ status: 'PRINTED', printCount: 1 });
    givenCurrent(current);
    await service.update(46, { notes: 'ملاحظة فقط' } as any, req);

    const data = mp.cheque.update.mock.calls[0][0].data as Record<string, unknown>;
    expect(data.notes).toBe('ملاحظة فقط');
    expect(data.beneficiaryName).toBe(current.beneficiaryName);
    expect(data.amount).toBe(current.amount);
    expect(data.chequeNumber).toBe(current.chequeNumber);
  });
});
