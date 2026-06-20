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
