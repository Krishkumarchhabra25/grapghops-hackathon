import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';

export type ModalType =
  | 'incident' | 'investigation' | 'invite' | 'memory' | 'document'
  | 'workspace' | 'search' | 'notifications' | 'help' | 'keyboard'
  | 'confirm' | 'integration' | 'docdetail';

export type ModalState = { type: ModalType; payload?: any } | null;

type ModalContextValue = {
  modal: ModalState;
  openModal: (type: ModalType, payload?: any) => void;
  closeModal: () => void;
};

const Ctx = createContext<ModalContextValue | null>(null);

export function ModalProvider({ children }: { children: ReactNode }) {
  const [modal, setModal] = useState<ModalState>(null);

  const openModal = useCallback((type: ModalType, payload: any = null) => {
    setModal({ type, payload });
  }, []);

  const closeModal = useCallback(() => setModal(null), []);

  const value = useMemo(() => ({ modal, openModal, closeModal }), [modal, openModal, closeModal]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useModal(): ModalContextValue {
  const v = useContext(Ctx);
  if (!v) throw new Error('useModal must be used inside <ModalProvider>');
  return v;
}