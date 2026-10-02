import { create } from 'zustand';

export type ToastTone = 'info' | 'success' | 'error';

export interface ToastAction {
  label: string;
  onSelect: () => void;
}

export interface ToastItem {
  id: string;
  tone: ToastTone;
  message: string;
  /** Optional button, e.g. "Rückgängig" (the toast then stays a little longer). */
  action?: ToastAction;
}

const MAX_TOASTS = 4;

interface ToastState {
  toasts: ToastItem[];
  push: (tone: ToastTone, message: string, action?: ToastAction) => string;
  dismiss: (id: string) => void;
}

export const useToasts = create<ToastState>((set) => ({
  toasts: [],
  push: (tone, message, action) => {
    const id = crypto.randomUUID();
    set((state) => ({
      toasts: [...state.toasts, { id, tone, message, action }].slice(-MAX_TOASTS),
    }));
    return id;
  },
  dismiss: (id) => set((state) => ({ toasts: state.toasts.filter((t) => t.id !== id) })),
}));

/** Shows a short notification at the top of the screen. */
export const toast = {
  info: (message: string) => useToasts.getState().push('info', message),
  success: (message: string, action?: ToastAction) =>
    useToasts.getState().push('success', message, action),
  error: (message: string) => useToasts.getState().push('error', message),
  dismiss: (id: string) => useToasts.getState().dismiss(id),
};
