import { create } from 'zustand';

export interface PrintLogEntry {
  id: string;
  formType: string;
  formNumber: string;
  employeeName: string;
  printProfile: string;
  printedAt: string;
}

interface PrintLogStore {
  entries: PrintLogEntry[];
  addEntry: (entry: Omit<PrintLogEntry, 'id' | 'printedAt'>) => void;
  clear: () => void;
}

const FORM_LABELS: Record<string, string> = {
  'employment-contract': 'عقد العمل',
  'salary-certificate': 'شهادة راتب',
  'to-whom-it-may-concern': 'إفادة لمن يهمه الأمر',
  'leave-request': 'طلب إجازة',
  'return-to-work': 'إعادة مباشرة العمل',
  'salary-advance': 'طلب سلفة راتب',
  'employee-warning': 'إنذار موظف',
  'performance-evaluation': 'تقييم أداء',
  'resignation': 'استقالة',
  quotation: 'عرض سعر',
  'purchase-request': 'طلب شراء',
};

const PROFILE_LABELS: Record<string, string> = {
  'plain-a4': 'A4 عادي',
  'letterhead': 'ورق الشركة الرسمي',
};

export { FORM_LABELS, PROFILE_LABELS };

// ─── Additive lang-aware wiring (foundational — this is a plain store module,
// no hook access) ──────────────────────────────────────────────────────────
// FORM_LABELS / PROFILE_LABELS above are kept UNCHANGED (still literal Arabic)
// because the only consumer found via a whole-app grep, PrintLogPanel.tsx
// (components/PrintLogPanel.tsx), indexes them directly with no `t()` call and
// is outside this task's file list — swapping the values for i18n keys would
// silently break its render. The maps below let a future pass make that
// consumer lang-aware without touching FORM_LABELS/PROFILE_LABELS themselves.
const FORM_LABEL_KEYS: Record<string, string> = {
  'employment-contract': 'printlog.form.employment_contract',
  'salary-certificate': 'printlog.form.salary_certificate',
  'to-whom-it-may-concern': 'printlog.form.to_whom_it_may_concern',
  'leave-request': 'printlog.form.leave_request',
  'return-to-work': 'printlog.form.return_to_work',
  'salary-advance': 'printlog.form.salary_advance',
  'employee-warning': 'printlog.form.employee_warning',
  'performance-evaluation': 'printlog.form.performance_evaluation',
  'resignation': 'printlog.form.resignation',
  quotation: 'printlog.form.quotation',
  'purchase-request': 'printlog.form.purchase_request',
};

const PROFILE_LABEL_KEYS: Record<string, string> = {
  'plain-a4': 'printlog.profile.plain_a4',
  'letterhead': 'printlog.profile.letterhead',
};

/** Lang-aware form label. Falls back to the Arabic literal, then the raw code. */
export function getFormLabel(formType: string, t: (key: string) => string): string {
  const key = FORM_LABEL_KEYS[formType];
  return key ? t(key) : FORM_LABELS[formType] ?? formType;
}

/** Lang-aware print-profile label. Falls back to the Arabic literal, then the raw code. */
export function getProfileLabel(profile: string, t: (key: string) => string): string {
  const key = PROFILE_LABEL_KEYS[profile];
  return key ? t(key) : PROFILE_LABELS[profile] ?? profile;
}

export const usePrintLogStore = create<PrintLogStore>((set) => ({
  entries: [],
  addEntry: (entry) =>
    set((s) => ({
      entries: [
        {
          ...entry,
          id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
          printedAt: new Date().toISOString(),
        },
        ...s.entries,
      ].slice(0, 100),
    })),
  clear: () => set({ entries: [] }),
}));
