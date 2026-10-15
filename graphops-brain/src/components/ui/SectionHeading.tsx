import type { ReactNode } from 'react';

type Props = { title: string; subtitle?: string; action?: ReactNode };

export function SectionHeading({ title, subtitle, action }: Props) {
  return (
    <div className="mb-4 flex items-center justify-between gap-4">
      <div>
        <h2 className="text-sm font-semibold text-slate-100">{title}</h2>
        {subtitle && <p className="mt-1 text-xs text-slate-500">{subtitle}</p>}
      </div>
      {action}
    </div>
  );
}