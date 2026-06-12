import { Request } from 'express';
import { prisma } from '../../config/database';
import { backupService } from '../../shared/services/backup.service';
import { recordAudit } from '../../core/middleware/audit';
import { AppError } from '../../core/errors/AppError';
import { validateEmployeeRow } from './validators/employees';
import { validateCustomerRow } from './validators/customers';
import { validateEquipmentRow } from './validators/equipment';
import { validateSupplierRow } from './validators/suppliers';
import type { EntityType, ExecuteSummary, PreviewSummary, RowResult } from './import.types';

// ── per-entity helpers ────────────────────────────────────────────────────────

async function loadExistingCodes(entityType: EntityType): Promise<Set<string>> {
  if (entityType === 'employees') {
    const rows = await prisma.employee.findMany({ select: { code: true } });
    return new Set(rows.map((r) => r.code));
  }
  if (entityType === 'customers') {
    const rows = await prisma.customer.findMany({ select: { code: true } });
    return new Set(rows.map((r) => r.code));
  }
  if (entityType === 'suppliers') {
    const rows = await prisma.supplier.findMany({ select: { code: true } });
    return new Set(rows.map((r) => r.code));
  }
  const rows = await prisma.equipment.findMany({ select: { code: true } });
  return new Set(rows.map((r) => r.code));
}

function validateRow(
  entityType: EntityType,
  row: Record<string, unknown>,
): { valid: boolean; errors: string[]; normalized: unknown } {
  if (entityType === 'employees') return validateEmployeeRow(row);
  if (entityType === 'customers') return validateCustomerRow(row);
  if (entityType === 'suppliers') return validateSupplierRow(row);
  return validateEquipmentRow(row);
}

// ── core logic ────────────────────────────────────────────────────────────────

function buildPreviewRows(
  entityType: EntityType,
  rows: Record<string, unknown>[],
  existingCodes: Set<string>,
): RowResult[] {
  const seenInBatch = new Set<string>();
  const results: RowResult[] = [];

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const result = validateRow(entityType, row);

    if (!result.valid) {
      results.push({ rowIndex: i, status: 'invalid', data: row, errors: result.errors });
      continue;
    }

    const normalized = result.normalized as Record<string, unknown>;
    const code = String(normalized['code']).trim();

    if (seenInBatch.has(code) || existingCodes.has(code)) {
      results.push({
        rowIndex: i,
        status: 'duplicate',
        data: row,
        duplicateKey: 'code',
        duplicateValue: code,
      });
    } else {
      seenInBatch.add(code);
      results.push({ rowIndex: i, status: 'valid', data: row });
    }
  }

  return results;
}

// ── public service functions ──────────────────────────────────────────────────

export async function previewImport(
  entityType: EntityType,
  rows: Record<string, unknown>[],
): Promise<PreviewSummary> {
  const existingCodes = await loadExistingCodes(entityType);
  const rowResults = buildPreviewRows(entityType, rows, existingCodes);

  const validRows = rowResults.filter((r) => r.status === 'valid').length;
  const invalidRows = rowResults.filter((r) => r.status === 'invalid').length;
  const duplicateRows = rowResults.filter((r) => r.status === 'duplicate').length;

  return {
    entityType,
    totalRows: rows.length,
    validRows,
    invalidRows,
    duplicateRows,
    rows: rowResults,
  };
}

export async function executeImport(
  req: Request,
  entityType: EntityType,
  rows: Record<string, unknown>[],
): Promise<ExecuteSummary> {
  if (!req.user?.userId) throw AppError.unauthorized('المصادقة مطلوبة');

  // 1. Re-validate all rows from scratch (never trust frontend preview)
  const existingCodes = await loadExistingCodes(entityType);
  const rowResults = buildPreviewRows(entityType, rows, existingCodes);

  const validResults = rowResults.filter((r) => r.status === 'valid');
  const invalidCount = rowResults.filter((r) => r.status === 'invalid').length;
  const duplicateCount = rowResults.filter((r) => r.status === 'duplicate').length;

  if (validResults.length === 0) {
    throw AppError.badRequest('لا توجد صفوف صالحة للاستيراد بعد التحقق');
  }

  // 2. Backup before any insert — abort if backup fails
  const backup = await backupService.create('MANUAL', req.user.userId);

  // 3. Insert all valid rows atomically — partial failure rolls back everything
  let imported = 0;

  await prisma.$transaction(async (tx) => {
    if (entityType === 'employees') {
      for (const result of validResults) {
        const { normalized } = validateEmployeeRow(result.data);
        if (!normalized) continue;
        await tx.employee.create({ data: normalized });
        imported++;
      }
    } else if (entityType === 'customers') {
      for (const result of validResults) {
        const { normalized } = validateCustomerRow(result.data);
        if (!normalized) continue;
        await tx.customer.create({ data: normalized });
        imported++;
      }
    } else if (entityType === 'suppliers') {
      for (const result of validResults) {
        const { normalized } = validateSupplierRow(result.data);
        if (!normalized) continue;
        await tx.supplier.create({ data: normalized });
        imported++;
      }
    } else {
      for (const result of validResults) {
        const { normalized } = validateEquipmentRow(result.data);
        if (!normalized) continue;
        await tx.equipment.create({ data: normalized });
        imported++;
      }
    }
  });

  // 4. Audit
  await recordAudit({
    req,
    action: 'IMPORT',
    module: 'import',
    entityId: entityType,
    newValue: { imported, total: rows.length, invalid: invalidCount, duplicate: duplicateCount },
  });

  return {
    entityType,
    totalRows: rows.length,
    imported,
    invalidRows: invalidCount,
    duplicateRows: duplicateCount,
    backupId: backup.id,
    backupFileName: backup.fileName,
  };
}
