import type { ReactNode } from 'react';

type Props = {
  eyebrow?: string;
  title: string;
  description?: string;
  actions?: ReactNode;
};

export function PageTitle({ eyebrow, title, description, actions }: Props) {
  return (
    <div className="mb-6 flex flex-col justify-between gap-4 md:flex-row md:items-end">
      <div>
        <div className="mb-2 flex items-center gap-2 text-[10px] font-bold uppercase tracking-[.18em] text-slate-500">
          {eyebrow && <><span>{eyebrow}</span><span className="h-1 w-1 rounded-full bg-slate-700" /></>}
          <span>GraphOps Brain</span>
        </div>
        <h1 className="text-[26px] font-semibold tracking-[-.04em] text-slate-100 md:text-[30px]">{title}</h1>
        {description && <p className="mt-2 max-w-2xl text-[13px] leading-6 text-slate-400">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}