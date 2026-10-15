import type { LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';
import { Database } from 'lucide-react';

type Props = {
  icon?: LucideIcon;
  title?: string;
  description?: string;
  action?: ReactNode;
};

export function EmptyState({
  icon: Icon = Database,
  title = 'Nothing here yet',
  description = 'Try adjusting your filters or create a new item.',
  action,
}: Props) {
  return (
    <div className="flex min-h-64 flex-col items-center justify-center px-5 text-center">
      <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-2xl border border-line bg-[#18202b] text-slate-400">
        <Icon size={21} />
      </div>
      <h3 className="text-sm font-semibold text-slate-200">{title}</h3>
      <p className="mt-2 max-w-sm text-xs leading-5 text-slate-500">{description}</p>
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}