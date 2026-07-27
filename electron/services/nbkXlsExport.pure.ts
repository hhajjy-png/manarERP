/**
 * NBK Salary Export — Native XLS Generation v1.
 *
 * PURE policy layer only (no `electron` import — runs under vitest.electron.config.ts
 * without an Electron runtime). Owns the JSON payload shape handed to the PowerShell
 * COM writer (backend/assets/nbk-export/generate-nbk-xls.ps1) and the parsing of its
 * result file. Never talks to Excel, the filesystem beyond its inputs, or child
 * processes — that orchestration lives in nbkXlsExport.service.ts.
 *
 * This layer is a serializer/writer concern only: it reuses whatever rows/columns
 * the existing validated payroll bank-export engine (backend nbkSalaryXlsProfile.ts)
 * already produced — it never re-derives serial numbers, re-applies payroll/approval
 * rules, or re-validates business eligibility.
 */

export interface NbkExportColumn {
  header: string;
  key: string;
}

/** Mirrors the shape already returned by the backend payroll bank-export preview
 *  (`PayrollBankExportResult.sheets`) — `columns` carries the exact NBK header text
 *  and row key, so this layer never hardcodes header strings of its own. */
export interface NbkExportSheetInput {
  name: string;
  columns: NbkExportColumn[];
  rows: Array<Record<string, string | number>>;
}

interface NbkExportPayloadSheet {
  name: string;
  headers: string[];
  keys: string[];
  rows: Array<Record<string, string | number>>;
}

export interface NbkExportPayload {
  templatePath: string;
  outputPath: string;
  sheets: NbkExportPayloadSheet[];
}

export type NbkExportErrorCode =
  | 'EXCEL_COM_UNAVAILABLE'
  | 'TEMPLATE_MISSING'
  | 'TEMPLATE_STRUCTURE_INVALID'
  | 'GENERATION_FAILED'
  | 'OUTPUT_INVALID'
  | 'TIMEOUT'
  | 'UNKNOWN';

export type NbkExportOutcome =
  | { ok: true; path: string; sizeBytes: number; rowCount: number }
  | { ok: false; code: NbkExportErrorCode; message: string };

const VALID_CODES: readonly NbkExportErrorCode[] = [
  'EXCEL_COM_UNAVAILABLE', 'TEMPLATE_MISSING', 'TEMPLATE_STRUCTURE_INVALID',
  'GENERATION_FAILED', 'OUTPUT_INVALID', 'TIMEOUT', 'UNKNOWN',
];

/** Arabic, user-facing. One message per error code — never invented per call site. */
export const NBK_EXPORT_MESSAGES: Record<NbkExportErrorCode, string> = {
  EXCEL_COM_UNAVAILABLE: 'تعذّر إنشاء ملف الرواتب البنكي: Microsoft Excel غير مثبَّت أو غير متاح على هذا الجهاز. يلزم تثبيت Excel لإنشاء ملف NBK بصيغة متوافقة.',
  TEMPLATE_MISSING: 'قالب ملف NBK غير موجود ضمن مكوّنات التطبيق. تواصل مع الدعم الفني.',
  TEMPLATE_STRUCTURE_INVALID: 'قالب ملف NBK غير متطابق مع التنسيق البنكي المطلوب. تواصل مع الدعم الفني قبل المتابعة.',
  GENERATION_FAILED: 'تعذّر إنشاء ملف الرواتب البنكي. أعد المحاولة، وإن تكرر الخطأ تواصل مع الدعم الفني.',
  OUTPUT_INVALID: 'فشل إنشاء ملف الرواتب البنكي — الملف الناتج غير صالح.',
  TIMEOUT: 'استغرق إنشاء ملف الرواتب البنكي وقتًا أطول من المتوقع. أعد المحاولة.',
  UNKNOWN: 'حدث خطأ غير متوقع أثناء إنشاء ملف الرواتب البنكي.',
};

/**
 * Builds the exact JSON payload handed to the PowerShell writer.
 * Only "Salary Details" carries rows to write; "Bank Codes" is passed for the
 * writer's header-existence check only — its rows are never sent and never
 * rewritten (the template's own Bank Codes sheet is authoritative, untouched).
 */
export function buildNbkExportPayload(
  templatePath: string,
  outputPath: string,
  sheets: NbkExportSheetInput[],
): NbkExportPayload {
  const salaryDetails = sheets.find((s) => s.name === 'Salary Details');
  const bankCodes = sheets.find((s) => s.name === 'Bank Codes');
  if (!salaryDetails || !bankCodes) {
    throw new Error('NBK export payload must include both "Salary Details" and "Bank Codes" sheets');
  }
  return {
    templatePath,
    outputPath,
    sheets: [
      {
        name: 'Salary Details',
        headers: salaryDetails.columns.map((c) => c.header),
        keys: salaryDetails.columns.map((c) => c.key),
        rows: salaryDetails.rows,
      },
      {
        name: 'Bank Codes',
        headers: bankCodes.columns.map((c) => c.header),
        keys: bankCodes.columns.map((c) => c.key),
        rows: [],
      },
    ],
  };
}

/**
 * Parses the PowerShell writer's result file content. Strips the UTF-8 BOM that
 * `Set-Content -Encoding UTF8` always writes on Windows PowerShell 5.1. Never
 * throws — missing/malformed content becomes a typed GENERATION_FAILED/UNKNOWN
 * outcome instead, so the caller always gets a well-formed result.
 */
export function parseNbkExportResultFile(raw: string | null): NbkExportOutcome {
  if (raw == null) {
    return { ok: false, code: 'GENERATION_FAILED', message: NBK_EXPORT_MESSAGES.GENERATION_FAILED };
  }
  const cleaned = raw.replace(/^﻿/, '').trim();
  if (!cleaned) {
    return { ok: false, code: 'GENERATION_FAILED', message: NBK_EXPORT_MESSAGES.GENERATION_FAILED };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(cleaned);
  } catch {
    return { ok: false, code: 'GENERATION_FAILED', message: NBK_EXPORT_MESSAGES.GENERATION_FAILED };
  }

  if (typeof parsed !== 'object' || parsed === null) {
    return { ok: false, code: 'UNKNOWN', message: NBK_EXPORT_MESSAGES.UNKNOWN };
  }
  const p = parsed as Record<string, unknown>;

  if (p.ok === true) {
    if (typeof p.path === 'string' && typeof p.sizeBytes === 'number' && p.sizeBytes > 0) {
      return {
        ok: true,
        path: p.path,
        sizeBytes: p.sizeBytes,
        rowCount: typeof p.rowCount === 'number' ? p.rowCount : 0,
      };
    }
    return { ok: false, code: 'OUTPUT_INVALID', message: NBK_EXPORT_MESSAGES.OUTPUT_INVALID };
  }

  const code: NbkExportErrorCode = typeof p.code === 'string' && (VALID_CODES as string[]).includes(p.code)
    ? (p.code as NbkExportErrorCode)
    : 'UNKNOWN';
  const message = typeof p.message === 'string' && p.message.trim() ? p.message : NBK_EXPORT_MESSAGES[code];
  return { ok: false, code, message };
}
