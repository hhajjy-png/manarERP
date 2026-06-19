export type FieldKey = 'beneficiary' | 'date' | 'tafqeet' | 'numeric';

export interface FieldConfig {
  top: number;
  left: number;
  width: number;
  fontSize: number;
  fontFamily: string;
  fontWeight: string;
  fontStyle: string;
  textAlign: 'left' | 'center' | 'right';
  color: string;
}

export type ChequeTemplate = Record<FieldKey, FieldConfig>;

/** Default positions extracted from the original hardcoded values in Cheques.tsx */
export const DEFAULT_TEMPLATE: ChequeTemplate = {
  beneficiary: {
    top: 29.8,
    left: 34.5,
    width: 38,
    fontSize: 11,
    fontFamily: 'Cairo',
    fontWeight: '600',
    fontStyle: 'normal',
    textAlign: 'left',
    color: '#000000',
  },
  date: {
    top: 24.3,
    left: 79.1,
    width: 23,
    fontSize: 10,
    fontFamily: 'Cairo',
    fontWeight: '600',
    fontStyle: 'normal',
    textAlign: 'center',
    color: '#000000',
  },
  tafqeet: {
    top: 39.1,
    left: 5.7,
    width: 72,
    fontSize: 10,
    fontFamily: 'Cairo',
    fontWeight: '600',
    fontStyle: 'normal',
    textAlign: 'right',
    color: '#000000',
  },
  numeric: {
    top: 45.8,
    left: 82.4,
    width: 18,
    fontSize: 11,
    fontFamily: 'monospace',
    fontWeight: '700',
    fontStyle: 'normal',
    textAlign: 'center',
    color: '#000000',
  },
};

export const FONT_FAMILIES = ['Cairo', 'Arial', 'Tahoma', 'Times New Roman', 'monospace'] as const;
export const FONT_SIZES = [8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18] as const;

export const FIELD_LABELS: Record<FieldKey, string> = {
  beneficiary: 'اسم المستفيد',
  date: 'التاريخ',
  tafqeet: 'التفقيط',
  numeric: 'المبلغ الرقمي',
};

export const FIELD_KEYS: FieldKey[] = ['beneficiary', 'date', 'tafqeet', 'numeric'];

export const SETTING_KEY_PREFIX = 'cheque.template.';

export function settingKey(bank: string): string {
  return `${SETTING_KEY_PREFIX}${bank}`;
}

/** Returns a deep clone of DEFAULT_TEMPLATE with no shared nested references. */
export function cloneDefaultTemplate(): ChequeTemplate {
  return {
    beneficiary: { ...DEFAULT_TEMPLATE.beneficiary },
    date: { ...DEFAULT_TEMPLATE.date },
    tafqeet: { ...DEFAULT_TEMPLATE.tafqeet },
    numeric: { ...DEFAULT_TEMPLATE.numeric },
  };
}

export function templateFromSettings(
  settings: { key: string; value: string }[],
  bank: string,
): ChequeTemplate {
  const row = settings.find((s) => s.key === settingKey(bank));
  if (!row) return cloneDefaultTemplate();
  try {
    const parsed = JSON.parse(row.value) as Partial<ChequeTemplate>;
    return {
      beneficiary: { ...DEFAULT_TEMPLATE.beneficiary, ...(parsed.beneficiary ?? {}) },
      date: { ...DEFAULT_TEMPLATE.date, ...(parsed.date ?? {}) },
      tafqeet: { ...DEFAULT_TEMPLATE.tafqeet, ...(parsed.tafqeet ?? {}) },
      numeric: { ...DEFAULT_TEMPLATE.numeric, ...(parsed.numeric ?? {}) },
    };
  } catch {
    return cloneDefaultTemplate();
  }
}

// ── Future-compatibility stubs (no UI wired yet) ─────────────────────────────

/**
 * A saved beneficiary entry for future autocomplete / master-list feature.
 * Store in settings under key 'cheque.beneficiaries' as JSON array.
 */
export interface BeneficiaryMaster {
  id: string;
  name: string;
  nameAr?: string;
  accountNumber?: string;
  bankName?: string;
  notes?: string;
}

/**
 * A named bank template binding a bank name to its saved field positions.
 * Extends the existing per-bank settings to support multiple named layouts
 * per bank (e.g. different cheque book sizes from the same bank).
 */
export interface BankTemplateProfile {
  id: string;
  bankName: string;
  profileName: string;
  template: ChequeTemplate;
  isDefault: boolean;
}

/**
 * Printer preference saved per bank — for future "saved printer" feature.
 * Would be stored in Electron userData and applied when printing cheques.
 */
export interface ChequePrinterPreference {
  bankName: string;
  printerName: string;
  /** When true, forces landscape orientation regardless of system default. */
  forceLandscape: boolean;
  /** Paper tray index (OS-specific). */
  trayIndex?: number;
}

// ── End future stubs ─────────────────────────────────────────────────────────

/**
 * Formats a cheque amount: hides .000 fils, keeps any non-zero fils.
 * 5000     → #5,000#
 * 5000.250 → #5,000.250#
 */
export function fmtChequeAmount(amount: number): string {
  const fils = Math.round(amount * 1000) % 1000;
  if (fils === 0) {
    return `#${Math.floor(amount).toLocaleString('en-US')}#`;
  }
  return `#${amount.toLocaleString('en-US', { minimumFractionDigits: 3, maximumFractionDigits: 3 })}#`;
}
