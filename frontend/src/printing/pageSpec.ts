/**
 * Print Center — PageSpec registry (Foundation v1).
 *
 * THE future single source of truth for page geometry. Today the app carries 11+
 * independent `@page` rules with five different margin philosophies (a global
 * `@page { margin: 1cm }` in app/theme.css, `12mm` in ReportPrint, `8mm 10mm` in
 * InvoicePreview, `12mm 15mm` in ReceiptVoucher, `0` in several template CSS
 * modules, and dynamic values in FormLayout / ChequeCalibrator).
 *
 * FOUNDATION SCOPE: this file only DEFINES the specs and can EMIT the CSS. It does
 * NOT rewrite any existing page. Migration is per-document-type, one release at a
 * time; a page keeps its own `@page` until the release that migrates it. That is
 * why nothing here is imported by the existing print paths yet — by design.
 *
 * `cheque-dynamic` is declared for completeness of the registry, but the cheque
 * pipeline is explicitly NOT migrated and must not be: ChequeCalibrator derives its
 * own `@page` from the persisted calibration geometry, and that behaviour is frozen.
 */

import type { PageSpecId, PaperSize, PrintOrientation } from './types';

export interface PageMargins {
  top: string;
  right: string;
  bottom: string;
  left: string;
}

export interface PageSpec {
  id: PageSpecId;
  /** Arabic label for future settings/preview UI. */
  labelAr: string;
  labelEn: string;
  paper: PaperSize;
  orientation: PrintOrientation;
  margins: PageMargins;
  /**
   * When true the spec's geometry is supplied by the caller at print time rather
   * than by this registry (cheque calibration geometry is operator-owned and lives
   * in the database). `toPageCss` refuses to emit CSS for such a spec.
   */
  dynamic?: boolean;
}

const mm = (top: string, right = top, bottom = top, left = right): PageMargins => ({
  top,
  right,
  bottom,
  left,
});

export const PAGE_SPECS: Record<PageSpecId, PageSpec> = {
  'a4-portrait': {
    id: 'a4-portrait',
    labelAr: 'A4 عمودي',
    labelEn: 'A4 Portrait',
    paper: 'A4',
    orientation: 'portrait',
    margins: mm('12mm'),
  },
  'a4-landscape': {
    id: 'a4-landscape',
    labelAr: 'A4 أفقي',
    labelEn: 'A4 Landscape',
    paper: 'A4',
    orientation: 'landscape',
    margins: mm('10mm'),
  },
  'a5-receipt': {
    id: 'a5-receipt',
    labelAr: 'A5 إيصال',
    labelEn: 'A5 Receipt',
    paper: 'A5',
    orientation: 'portrait',
    margins: mm('8mm'),
  },
  // Registered, deliberately NOT migrated. The cheque sheet's page box is derived
  // from the saved calibration geometry at print time — see ChequeCalibrator.
  'cheque-dynamic': {
    id: 'cheque-dynamic',
    labelAr: 'شيك — أبعاد المعايرة',
    labelEn: 'Cheque — calibrated geometry',
    paper: 'custom',
    orientation: 'landscape',
    margins: mm('0mm'),
    dynamic: true,
  },
};

/**
 * The spec the Receipt Voucher pilot prints with. It intentionally reproduces the
 * page's EXISTING rule (`@page { size: A4; margin: 12mm 15mm; }`, ReceiptVoucher.tsx)
 * so the pilot's physical output is unchanged. It is NOT `a5-receipt` — that spec
 * exists for future documents, and switching the voucher's paper would be a visible
 * behaviour change, which this phase forbids.
 */
export const RECEIPT_VOUCHER_PAGE_SPEC: PageSpec = {
  id: 'a4-portrait',
  labelAr: 'A4 عمودي — سند قبض',
  labelEn: 'A4 Portrait — Receipt Voucher',
  paper: 'A4',
  orientation: 'portrait',
  margins: { top: '12mm', right: '15mm', bottom: '12mm', left: '15mm' },
};

export function getPageSpec(id: PageSpecId): PageSpec {
  return PAGE_SPECS[id];
}

export function listPageSpecs(): PageSpec[] {
  return Object.values(PAGE_SPECS);
}

/**
 * Emit the `@page` rule for a spec. This is what will replace the scattered rules
 * as each document type migrates — one function, one truth.
 *
 * Throws for `dynamic` specs: their geometry is not ours to invent.
 */
export function toPageCss(spec: PageSpec): string {
  if (spec.dynamic) {
    throw new Error(
      `PageSpec "${spec.id}" is dynamic — its geometry is supplied by the caller, not the registry.`,
    );
  }
  const size = spec.orientation === 'landscape' ? `${spec.paper} landscape` : spec.paper;
  const { top, right, bottom, left } = spec.margins;
  return `@page { size: ${size}; margin: ${top} ${right} ${bottom} ${left}; }`;
}
