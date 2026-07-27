import { describe, it, expect } from 'vitest';
import {
  buildNbkExportPayload,
  parseNbkExportResultFile,
  NBK_EXPORT_MESSAGES,
  NbkExportSheetInput,
} from '../nbkXlsExport.pure';

const HEADERS = [
  'Payment Serial Number', 'Beneficiary Name', 'Beneficiary Civil Id',
  'Account # for NBK A/C & IBAN for other Bank',
  "Beneficiary Bank (Refer next sheet 'Bank Codes' for list of Banks)",
  'Payment Currency (only KWD)', 'Payment Amount',
];
const KEYS = ['serial', 'name', 'civilId', 'account', 'bank', 'currency', 'amount'];

function columns() {
  return HEADERS.map((header, i) => ({ header, key: KEYS[i] }));
}

function fakeSheets(rows: Array<Record<string, string | number>>): NbkExportSheetInput[] {
  return [
    { name: 'Salary Details', columns: columns(), rows },
    { name: 'Bank Codes', columns: [{ header: 'Bank Code', key: 'code' }, { header: 'Bank Name', key: 'name' }], rows: [] },
  ];
}

describe('buildNbkExportPayload', () => {
  it('maps the 7 existing export columns into headers/keys, preserving order', () => {
    const payload = buildNbkExportPayload('T.xls', 'O.xls', fakeSheets([]));
    const sd = payload.sheets.find((s) => s.name === 'Salary Details')!;
    expect(sd.headers).toEqual(HEADERS);
    expect(sd.keys).toEqual(KEYS);
  });

  it('handles a variable employee count — not hardcoded to any fixed number of rows', () => {
    const rows = [
      { serial: 1, name: 'FAKE A', civilId: 111111111111, account: 1111111111, bank: 'NBK', currency: 'KWD', amount: 100 },
      { serial: 2, name: 'FAKE B', civilId: 222222222222, account: 2222222222, bank: 'NBK', currency: 'KWD', amount: 200 },
      { serial: 3, name: 'FAKE C', civilId: 333333333333, account: 3333333333, bank: 'NBK', currency: 'KWD', amount: 300 },
      { serial: 4, name: 'FAKE D', civilId: 444444444444, account: 4444444444, bank: 'NBK', currency: 'KWD', amount: 400 },
    ];
    const payload = buildNbkExportPayload('T.xls', 'O.xls', fakeSheets(rows));
    const sd = payload.sheets.find((s) => s.name === 'Salary Details')!;
    expect(sd.rows).toHaveLength(4);
    expect(sd.rows).toEqual(rows);
  });

  it('preserves serial numbers exactly as supplied — never re-derives them', () => {
    const rows = [
      { serial: 5, name: 'FAKE E', civilId: 555555555555, account: 5555555555, bank: 'NBK', currency: 'KWD', amount: 500 },
      { serial: 9, name: 'FAKE F', civilId: 666666666666, account: 6666666666, bank: 'NBK', currency: 'KWD', amount: 600 },
    ];
    const payload = buildNbkExportPayload('T.xls', 'O.xls', fakeSheets(rows));
    const sd = payload.sheets.find((s) => s.name === 'Salary Details')!;
    expect(sd.rows.map((r) => r.serial)).toEqual([5, 9]);
  });

  it('never sends Bank Codes rows — the template sheet is the single source of truth', () => {
    const payload = buildNbkExportPayload('T.xls', 'O.xls', fakeSheets([]));
    const bc = payload.sheets.find((s) => s.name === 'Bank Codes')!;
    expect(bc.rows).toEqual([]);
    expect(bc.headers).toEqual(['Bank Code', 'Bank Name']);
  });

  it('fails closed (throws) when the expected sheets are missing — never guesses by index', () => {
    const onlyOneSheet: NbkExportSheetInput[] = [{ name: 'Salary Details', columns: columns(), rows: [] }];
    expect(() => buildNbkExportPayload('T.xls', 'O.xls', onlyOneSheet)).toThrow();
  });

  it('carries the caller-supplied template/output paths through unchanged', () => {
    const payload = buildNbkExportPayload('/tmp/work.xls', '/tmp/out.xls', fakeSheets([]));
    expect(payload.templatePath).toBe('/tmp/work.xls');
    expect(payload.outputPath).toBe('/tmp/out.xls');
  });
});

describe('parseNbkExportResultFile', () => {
  it('parses a successful result, stripping the PowerShell UTF-8 BOM', () => {
    const raw = '\uFEFF{"ok":true,"path":"C:\\\\out.xls","sizeBytes":21504,"rowCount":3}';
    const outcome = parseNbkExportResultFile(raw);
    expect(outcome).toEqual({ ok: true, path: 'C:\\out.xls', sizeBytes: 21504, rowCount: 3 });
  });

  it('parses a typed failure with its Arabic message from the script', () => {
    const raw = '{"ok":false,"code":"TEMPLATE_STRUCTURE_INVALID","message":"رأس العمود 1 غير متطابق"}';
    const outcome = parseNbkExportResultFile(raw);
    expect(outcome).toEqual({ ok: false, code: 'TEMPLATE_STRUCTURE_INVALID', message: 'رأس العمود 1 غير متطابق' });
  });

  it('maps every documented failure mode to a distinct, stable error code', () => {
    const codes = ['EXCEL_COM_UNAVAILABLE', 'TEMPLATE_MISSING', 'TEMPLATE_STRUCTURE_INVALID', 'GENERATION_FAILED', 'OUTPUT_INVALID'];
    for (const code of codes) {
      const outcome = parseNbkExportResultFile(`{"ok":false,"code":"${code}","message":"x"}`);
      expect(outcome).toMatchObject({ ok: false, code });
    }
  });

  it('never throws and never silently reports success on missing result content (COM/Excel unavailable, script crashed before writing)', () => {
    expect(() => parseNbkExportResultFile(null)).not.toThrow();
    expect(parseNbkExportResultFile(null)).toMatchObject({ ok: false, code: 'GENERATION_FAILED' });
    expect(parseNbkExportResultFile('')).toMatchObject({ ok: false });
    expect(parseNbkExportResultFile('not json at all')).toMatchObject({ ok: false, code: 'GENERATION_FAILED' });
  });

  it('falls back to the canonical Arabic message for an unrecognized error code (defense against a future script typo)', () => {
    const outcome = parseNbkExportResultFile('{"ok":false,"code":"SOMETHING_NEW"}');
    expect(outcome).toEqual({ ok: false, code: 'UNKNOWN', message: NBK_EXPORT_MESSAGES.UNKNOWN });
  });

  it('treats a success report with no valid path/size as OUTPUT_INVALID rather than trusting it blindly', () => {
    const outcome = parseNbkExportResultFile('{"ok":true}');
    expect(outcome).toEqual({ ok: false, code: 'OUTPUT_INVALID', message: NBK_EXPORT_MESSAGES.OUTPUT_INVALID });
  });

  it('every error code has a non-empty Arabic user-facing message', () => {
    for (const msg of Object.values(NBK_EXPORT_MESSAGES)) {
      expect(msg.length).toBeGreaterThan(0);
    }
  });
});
