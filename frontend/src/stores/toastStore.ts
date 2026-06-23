import { create } from 'zustand';

export type ToastVariant = 'ok' | 'error' | 'warn' | 'info';

export interface ToastItem {
  id: number;
  message: string;
  variant: ToastVariant;
}

interface ToastStore {
  toasts: ToastItem[];
  add: (message: string, variant?: ToastVariant) => void;
  remove: (id: number) => void;
}

let nextId = 1;
const DURATION_MS = 4000;

export const useToastStore = create<ToastStore>((set) => ({
  toasts: [],
  add(message, variant = 'ok') {
    const id = nextId++;
    set((s) => ({ toasts: [...s.toasts, { id, message, variant }] }));
    setTimeout(() => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })), DURATION_MS);
  },
  remove(id) {
    set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) }));
  },
}));

export function useToast() {
  const { add } = useToastStore();
  return {
    ok: (msg: string) => add(msg, 'ok'),
    error: (msg: string) => add(msg, 'error'),
    warn: (msg: string) => add(msg, 'warn'),
    info: (msg: string) => add(msg, 'info'),
  };
}
