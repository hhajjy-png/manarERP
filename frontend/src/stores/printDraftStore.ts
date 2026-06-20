import { create } from 'zustand';

interface Draft {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  state: Record<string, any>;
  savedAt: string;
}

interface PrintDraftStore {
  drafts: Record<string, Draft>;
  saveDraft: (formType: string, state: Record<string, unknown>) => void;
  getDraft: (formType: string) => Draft | null;
  clearDraft: (formType: string) => void;
}

export const usePrintDraftStore = create<PrintDraftStore>((set, get) => ({
  drafts: {},
  saveDraft: (formType, state) =>
    set((s) => ({
      drafts: { ...s.drafts, [formType]: { state, savedAt: new Date().toISOString() } },
    })),
  getDraft: (formType) => get().drafts[formType] ?? null,
  clearDraft: (formType) =>
    set((s) => {
      const { [formType]: _, ...rest } = s.drafts;
      void _;
      return { drafts: rest };
    }),
}));
