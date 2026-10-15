import { AlertCircle, CheckCircle2, X } from 'lucide-react';
import { cx } from '../../lib/utils';
import { useToast } from '../../contexts/ToastContext';

export function Toast() {
  const { toast, dismiss } = useToast();
  if (!toast) return null;
  const error = toast.tone === 'error';
  return (
    <div className="fixed bottom-5 right-5 z-[100] animate-in">
      <div className={cx(
        'flex items-center gap-3 rounded-xl border px-4 py-3 shadow-soft backdrop-blur-xl',
        error ? 'border-red-900 bg-[#28181d]' : 'border-[#3c5930] bg-[#17231a]',
      )}>
        <span className={error ? 'text-red-300' : 'text-lime'}>
          {error ? <AlertCircle size={18} /> : <CheckCircle2 size={18} />}
        </span>
        <span className="text-sm font-medium text-slate-100">{toast.message}</span>
        <button onClick={dismiss} className="ml-2 text-slate-500 hover:text-white"><X size={14} /></button>
      </div>
    </div>
  );
}