import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';

export type ToastTone = 'success' | 'error' | 'info';
export type Toast = { id: number; message: string; tone: ToastTone };

type ToastState = {
  toast: Toast | null;
  notify: (message: string, tone?: ToastTone) => void;
  dismiss: () => void;
};

const Ctx = createContext<ToastState | null>(null);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toast, setToast] = useState<Toast | null>(null);

  const dismiss = useCallback(() => setToast(null), []);

  const notify = useCallback((message: string, tone: ToastTone = 'success') => {
    const id = Date.now();
    setToast({ id, message, tone });
    window.setTimeout(() => {
      setToast((cur) => (cur?.id === id ? null : cur));
    }, 3200);
  }, []);

  const value = useMemo(() => ({ toast, notify, dismiss }), [toast, notify, dismiss]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useToast(): ToastState {
  const v = useContext(Ctx);
  if (!v) throw new Error('useToast must be used inside <ToastProvider>');
  return v;
}