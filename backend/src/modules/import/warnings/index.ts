// Smart Import Validation (Phase 1) — orchestrator.
// Computes non-blocking warnings for VALID rows during PREVIEW only.
// Architectural isolation: nothing here imports from modules/bankStatementImport,
// and modules/bankStatementImport must never import from here.

import type { EntityType, ImportWarning } from '../import.types';
import { rowSignature, strOf, warn } from './helpers';
import {
  employeeWarnings,
  equipmentWarnings,
  invoiceWarnings,
  contractWarnings,
  payrollWarnings,
} from './entityWarnings';

export interface WarnInput {
  rowIndex: number;
  raw: Record<string, unknown>;
  normalized: Record<string, unknown>;
}

type PerRowFn = (n: Record<string, unknown>, raw: Record<string, unknown>, now: Date) => ImportWarning[];

const PER_ROW: Partial<Record<EntityType, PerRowFn>> = {
  employees: employeeWarnings,
  equipment: equipmentWarnings,
  invoices: invoiceWarnings,
  contracts: contractWarnings,
  payroll: payrollWarnings,
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

  // ── DUP_SECONDARY_KEY (equipment plateNumber, within the file) ──
  if (entityType === 'equipment') {
    const plateCount = new Map<string, number>();
    for (const v of valid) {
      const p = strOf(v.normalized.plateNumber);
      if (p) plateCount.set(p, (plateCount.get(p) ?? 0) + 1);
    }
    for (const v of valid) {
      const p = strOf(v.normalized.plateNumber);
      if (p && (plateCount.get(p) ?? 0) > 1) {
        push(v.rowIndex, [warn('DUP_SECONDARY_KEY', 'warning',
          `رقم اللوحة "${p}" مكرّر داخل الملف`,
          `Plate number "${p}" is duplicated within the file`,
          { field: 'plateNumber' })]);
      }
    }
  }

  return out;
}
