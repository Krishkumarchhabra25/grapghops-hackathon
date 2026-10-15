import type { LucideIcon } from 'lucide-react';
import { cx } from '../../lib/utils';

type Props = {
  label: string;
  value: string | number;
  change?: string;
  icon: LucideIcon;
  accent?: 'lime' | 'red' | 'blue' | 'violet';
  description?: string;
};

export function StatCard({ label, value, change, icon: Icon, accent = 'lime', description }: Props) {
  const color = accent === 'red' ? 'text-rose-300' : accent === 'blue' ? 'text-sky-300' : accent === 'violet' ? 'text-violet-300' : 'text-lime';
  const iconBg = accent === 'red' ? 'bg-rose-400/10' : accent === 'blue' ? 'bg-sky-400/10' : accent === 'violet' ? 'bg-violet-400/10' : 'bg-lime/10';
  return (
    <div className="card p-4 md:p-5">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-xs font-medium text-slate-400">{label}</p>
          <div className="mt-3 flex items-baseline gap-2">
            <span className="text-[26px] font-semibold tracking-[-.05em] text-slate-100">{value}</span>
            {change && <span className={cx('text-[10px] font-semibold', change.startsWith('-') ? 'text-lime' : 'text-slate-400')}>{change}</span>}
          </div>
        </div>
        <div className={cx('flex h-9 w-9 items-center justify-center rounded-xl', iconBg, color)}>
          <Icon size={17} />
        </div>
      </div>
      {description && <p className="mt-3 text-[11px] text-slate-500">{description}</p>}
    </div>
  );
}