import { Loader2 } from 'lucide-react';

export function LoadingSpinner({ label = 'Loading…' }: { label?: string }) {
  return (
    <div className="flex min-h-[200px] flex-col items-center justify-center gap-3 text-slate-500">
      <Loader2 className="animate-spin" size={22} />
      <span className="text-xs">{label}</span>
    </div>
  );
}