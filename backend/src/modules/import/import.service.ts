import { Request } from 'express';
import { prisma } from '../../config/database';
import { backupService } from '../../shared/services/backup.service';
import { recordAudit } from '../../core/middleware/audit';
import { AppError } from '../../core/errors/AppError';
import { validateEmployeeRow } from './validators/employees';
import { validateCustomerRow } from './validators/customers';
import { validateEquipmentRow } from './validators/equipment';
import { validateSupplierRow } from './validators/suppliers';
import { validatePriceRow, priceCompositeKey } from './validators/prices';
import { validateContractRow } from './validators/contracts';
import { validateExpenseRow } from './validators/expenses';
import type { ContractFKMaps } from './validators/contracts';
import type { ExpenseFKMaps } from './validators/expenses';
import type { EntityType, ExecuteSummary, PreviewSummary, RowResult } from './import.types';

// ── FK resolver ───────────────────────────────────────────────────────────────

interface FKMaps {
  customerCodeToId?: Map<string, number>;
  supplierCodeToId?: Map<string, number>;
  contractCodeToId?: Map<string, number>;
  employeeCodeToId?: Map<string, number>;
}

async function loadCodeToIdMap(
  entity: 'customers' | 'suppliers' | 'contracts' | 'employees',
): Promise<Map<string, number>> {
  if (entity === 'customers') {
    const rows = await prisma.customer.findMany({ where: { isArchived: false }, select: { code: true, id: true } });
    return new Map(rows.map((r) => [r.code, r.id]));
  }
  if (entity === 'suppliers') {
    const rows = await prisma.supplier.findMany({ where: { isArchived: false }, select: { code: true, id: true } });
    return new Map(rows.map((r) => [r.code, r.id]));
  }
  if (entity === 'employees') {
    const rows = await prisma.employee.findMany({ where: { status: 'ACTIVE' }, select: { code: true, id: true } });
    return new Map(rows.map((r) => [r.code, r.id]));
  }
  // contracts — no cancelled status exists; resolve all
  const rows = await prisma.contract.findMany({ select: { code: true, id: true } });
  return new Map(rows.map((r) => [r.code, r.id]));
}

async function loadFKMaps(entityType: EntityType): Promise<FKMaps> {
  if (entityType === 'contracts') {
    const [customerCodeToId, employeeCodeToId] = await Promise.all([
      loadCodeToIdMap('customers'),
      loadCodeToIdMap('employees'),
    ]);
    return { customerCodeToId, employeeCodeToId };
  }
  if (entityType === 'expenses') {
    const [contractCodeToId, supplierCodeToId] = await Promise.all([
      loadCodeToIdMap('contracts'),
      loadCodeToIdMap('suppliers'),
    ]);
    return { contractCodeToId, supplierCodeToId };
  }
  return {};
}

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
  if (entityType === 'prices') {
    const rows = await prisma.projectPrice.findMany({
      select: { asphaltPlant: true, companyName: true, contractLocation: true, contractUnit: true },
    });
    return new Set(rows.map((r) => priceCompositeKey(r.asphaltPlant, r.companyName, r.contractLocation, r.contractUnit)));
  }
  if (entityType === 'contracts') {
    const rows = await prisma.contract.findMany({ select: { code: true } });
    return new Set(rows.map((r) => r.code));
  }
  if (entityType === 'expenses') {
    const rows = await prisma.expense.findMany({ select: { code: true } });
    return new Set(rows.map((r) => r.code));
  }
  const rows = await prisma.equipment.findMany({ select: { code: true } });
  return new Set(rows.map((r) => r.code));
}

function validateRow(
  entityType: EntityType,
  row: Record<string, unknown>,
  fkMaps: FKMaps = {},
): { valid: boolean; errors: string[]; normalized: unknown } {
  if (entityType === 'employees') return validateEmployeeRow(row);
  if (entityType === 'customers') return validateCustomerRow(row);
  if (entityType === 'suppliers') return validateSupplierRow(row);
  if (entityType === 'prices') return validatePriceRow(row);
  if (entityType === 'contracts') {
    const maps: ContractFKMaps = {
      customerCodeToId: fkMaps.customerCodeToId ?? new Map(),
      employeeCodeToId: fkMaps.employeeCodeToId ?? new Map(),
    };
    return validateContractRow(row, maps);
  }
  if (entityType === 'expenses') {
    const maps: ExpenseFKMaps = {
      contractCodeToId: fkMaps.contractCodeToId ?? new Map(),
      supplierCodeToId: fkMaps.supplierCodeToId ?? new Map(),
    };
    return validateExpenseRow(row, maps);
  }
  return validateEquipmentRow(row);
}

// Prices use a composite key (asphaltPlant|companyName|contractLocation|contractUnit); all others use `code`.
function getEntityKey(entityType: EntityType, normalized: Record<string, unknown>): string {
  if (entityType === 'prices') {
    return priceCompositeKey(
      String(normalized['asphaltPlant'] ?? '').trim(),
      String(normalized['companyName'] ?? '').trim(),
      String(normalized['contractLocation'] ?? '').trim(),
      String(normalized['contractUnit'] ?? '').trim(),
    );
  }
  return String(normalized['code']).trim();
}

// ── core logic ────────────────────────────────────────────────────────────────

function buildPreviewRows(
  entityType: EntityType,
  rows: Record<string, unknown>[],
  existingCodes: Set<string>,
  fkMaps: FKMaps = {},
): RowResult[] {
  const seenInBatch = new Set<string>();
  const results: RowResult[] = [];

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const result = validateRow(entityType, row, fkMaps);

    if (!result.valid) {
      results.push({ rowIndex: i, status: 'invalid', data: row, errors: result.errors });
      continue;
    }

    const normalized = result.normalized as Record<string, unknown>;
    const key = getEntityKey(entityType, normalized);
    const duplicateKeyLabel = entityType === 'prices' ? 'مصنع|شركة|مكان|وحدة' : 'code';

    if (seenInBatch.has(key) || existingCodes.has(key)) {
      results.push({
        rowIndex: i,
        status: 'duplicate',
        data: row,
        duplicateKey: duplicateKeyLabel,
        duplicateValue: key,
      });
    } else {
      seenInBatch.add(key);
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
  const [existingCodes, fkMaps] = await Promise.all([
    loadExistingCodes(entityType),
    loadFKMaps(entityType),
  ]);
  const rowResults = buildPreviewRows(entityType, rows, existingCodes, fkMaps);

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
  const [existingCodes, fkMaps] = await Promise.all([
    loadExistingCodes(entityType),
    loadFKMaps(entityType),
  ]);
  const rowResults = buildPreviewRows(entityType, rows, existingCodes, fkMaps);

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

  const contractMaps: ContractFKMaps = {
    customerCodeToId: fkMaps.customerCodeToId ?? new Map(),
    employeeCodeToId: fkMaps.employeeCodeToId ?? new Map(),
  };
  const expenseMaps: ExpenseFKMaps = {
    contractCodeToId: fkMaps.contractCodeToId ?? new Map(),
    supplierCodeToId: fkMaps.supplierCodeToId ?? new Map(),
  };

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
    } else if (entityType === 'prices') {
      for (const result of validResults) {
        const { normalized } = validatePriceRow(result.data);
        if (!normalized) continue;
        await tx.projectPrice.create({ data: normalized });
        imported++;
      }
    } else if (entityType === 'contracts') {
      for (const result of validResults) {
        const { normalized } = validateContractRow(result.data, contractMaps);
        if (!normalized) continue;
        await tx.contract.create({ data: normalized });
        imported++;
      }
    } else if (entityType === 'expenses') {
      for (const result of validResults) {
        const { normalized } = validateExpenseRow(result.data, expenseMaps);
        if (!normalized) continue;
        await tx.expense.create({ data: normalized });
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
