export type EntityType = 'employees' | 'customers' | 'equipment' | 'suppliers' | 'prices' | 'contracts' | 'expenses';

export type RowStatus = 'valid' | 'invalid' | 'duplicate';

export interface RowResult {
  rowIndex: number;
  status: RowStatus;
  data: Record<string, unknown>;
  errors?: string[];
  duplicateKey?: string;
  duplicateValue?: string;
}

export interface PreviewSummary {
  entityType: EntityType;
  totalRows: number;
  validRows: number;
  invalidRows: number;
  duplicateRows: number;
  rows: RowResult[];
}

export interface ExecuteSummary {
  entityType: EntityType;
  totalRows: number;
  imported: number;
  invalidRows: number;
  duplicateRows: number;
  backupId: number;
  backupFileName: string;
}
