// Smart Import Validation orchestrator (Phase 1 + Phase 2 additions).
// Computes non-blocking warnings for VALID rows during PREVIEW only.
// Architectural isolation: nothing here imports from modules/bankStatementImport,
// and modules/bankStatementImport must never import from here.

import type { EntityType, ImportWarning } from '../import.types';
import { asDate, rowSignature, strOf, warn } from './helpers';
import {
  employeeWarnings,
  equipmentWarnings,
  invoiceWarnings,
  contractWarnings,
  payrollWarnings,
  expenseWarnings,
} from './entityWarnings';

export interface WarnInput {
  rowIndex: number;
  raw: Record<string, unknown>;
  normalized: Record<string, unknown>;
}

type Row = Record<string, unknown>;
type PerRowFn = (n: Row, raw: Row, now: Date) => ImportWarning[];

const PER_ROW: Partial<Record<EntityType, PerRowFn>> = {
  employees: employeeWarnings,
  equipment: equipmentWarnings,
  invoices: invoiceWarnings,
  contracts: contractWarnings,
  payroll: payrollWarnings,
  expenses: expenseWarnings,
};

// ── Phase 2B: in-file "possible duplicate" secondary keys (warning-level) ──────
// These NEVER change status; they only flag rows sharing a secondary identifier
// within the uploaded file. No DB queries (DB secondary-dup deferred to keep Phase 2 safe).
interface SecondaryKey {
  field: string;
  labelAr: string;
  composite?: boolean;             // when true, the raw value is not shown in the message
  get: (n: Row) => string | undefined;
}

const isoDay = (d: Date) => d.toISOString().slice(0, 10);

const SECONDARY_KEYS: Partial<Record<EntityType, SecondaryKey[]>> = {
  employees: [
    { field: 'civilId',        labelAr: 'الرقم المدني', get: (n) => strOf(n.civilId) },
    { field: 'phone',          labelAr: 'الهاتف',        get: (n) => strOf(n.phone) },
    { field: 'email',          labelAr: 'البريد',        get: (n) => strOf(n.email)?.toLowerCase() },
    { field: 'passportNumber', labelAr: 'رقم الجواز',    get: (n) => strOf(n.passportNumber) },
  ],
  customers: [
    { field: 'phone', labelAr: 'الهاتف', get: (n) => strOf(n.phone) },
    { field: 'email', labelAr: 'البريد', get: (n) => strOf(n.email)?.toLowerCase() },
  ],
  suppliers: [
    { field: 'phone', labelAr: 'الهاتف', get: (n) => strOf(n.phone) },
    { field: 'email', labelAr: 'البريد', get: (n) => strOf(n.email)?.toLowerCase() },
  ],
  equipment: [
    { field: 'plateNumber', labelAr: 'رقم اللوحة', get: (n) => strOf(n.plateNumber) },
  ],
  contracts: [
    {
      field: 'customer+date+price', labelAr: 'العميل والتاريخ والسعر', composite: true,
      get: (n) => {
        const d = asDate(n.startDate);
        if (n.customerId == null || !d || n.price == null) return undefined;
        return `${n.customerId}|${isoDay(d)}|${n.price}`;
      },
    },
  ],
  invoices: [
    {
      field: 'customer+date+total', labelAr: 'العميل والتاريخ والإجمالي', composite: true,
      get: (n) => {
        const d = asDate(n.issueDate);
        if (n.customerId == null || !d || n.total == null) return undefined;
        return `${n.customerId}|${isoDay(d)}|${n.total}`;
      },
    },
  ],
};

/**
 * Builds a map of rowIndex → warnings for the given VALID rows.
 * `now` is injectable for deterministic tests.
 */
export function buildWarningsForBatch(
  entityType: EntityType,
  valid: WarnInput[],
  now: Date = new Date(),
): Map<number, ImportWarning[]> {
  const out = new Map<number, ImportWarning[]>();
  const push = (rowIndex: number, ws: ImportWarning[]) => {
    if (!ws.length) return;
    const cur = out.get(rowIndex);
    if (cur) cur.push(...ws);
    else out.set(rowIndex, [...ws]);
  };

  // ── Per-row business rules ──
  const fn = PER_ROW[entityType];
  if (fn) {
    for (const v of valid) push(v.rowIndex, fn(v.normalized, v.raw, now));
  }

  // ── ROW_IDENTICAL (all entities): identical full raw row within the file ──
  const sigByIndex = new Map<number, string>();
  const sigCount = new Map<string, number>();
  for (const v of valid) {
    const sig = rowSignature(v.raw);
    sigByIndex.set(v.rowIndex, sig);
    sigCount.set(sig, (sigCount.get(sig) ?? 0) + 1);
  }
  for (const v of valid) {
    if ((sigCount.get(sigByIndex.get(v.rowIndex)!) ?? 0) > 1) {
      push(v.rowIndex, [warn('ROW_IDENTICAL', 'info',
        'صف مطابق تماماً لصف آخر داخل الملف',
        'Row is identical to another row in the file')]);
    }
  }

  // ── DUP_SECONDARY_KEY: in-file possible duplicates on secondary identifiers ──
  const secKeys = SECONDARY_KEYS[entityType];
  if (secKeys) {
    for (const sk of secKeys) {
      const counts = new Map<string, number>();
      for (const v of valid) {
        const val = sk.get(v.normalized);
        if (val) counts.set(val, (counts.get(val) ?? 0) + 1);
      }
      for (const v of valid) {
        const val = sk.get(v.normalized);
        if (val && (counts.get(val) ?? 0) > 1) {
          push(v.rowIndex, [warn('DUP_SECONDARY_KEY', 'warning',
            sk.composite
              ? `احتمال تكرار داخل الملف (${sk.labelAr})`
              : `${sk.labelAr} "${val}" مكرّر داخل الملف`,
            sk.composite
              ? `Possible duplicate within the file (${sk.field})`
              : `Duplicate ${sk.field} "${val}" within the file`,
            { field: sk.field })]);
        }
      }
    }
  }

  return out;
}
