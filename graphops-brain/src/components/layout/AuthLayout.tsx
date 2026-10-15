import { Link } from 'react-router-dom';
import type { ReactNode } from 'react';
import {
  AlertTriangle, ArrowUpRight, Network, ShieldCheck, Sparkles,
} from 'lucide-react';
import { Badge } from '../ui/Badge';

type Props = {
  children: ReactNode;
  /** Optional title above the form, e.g. "Sign in to GraphOps" */
  heading?: string;
  /** Optional subtitle below the heading */
  subheading?: string;
};

export function AuthLayout({ children, heading, subheading }: Props) {
  return (
    <div className="relative flex min-h-screen overflow-hidden bg-[#0b1016]">
      <div className="absolute inset-0 grid-bg opacity-40" />
      <div className="absolute -left-40 -top-40 h-[460px] w-[460px] rounded-full bg-lime/5 blur-[110px]" />
      <div className="absolute -bottom-40 right-0 h-[460px] w-[460px] rounded-full bg-violet-500/5 blur-[120px]" />

      <div className="relative z-10 grid min-h-screen w-full grid-cols-1 lg:grid-cols-[1.03fr_.97fr]">
        {/* ---- Left hero (hidden on mobile) ---- */}
        <div className="relative hidden flex-col justify-between border-r border-line px-12 py-10 lg:flex xl:px-20">
          <Link to="/login" className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-lime text-[#14200b]">
              <Network size={20} />
            </div>
            <div>
              <div className="text-sm font-bold">
                graphops<span className="text-lime">.</span>
              </div>
              <p className="mt-0.5 text-[9px] font-bold uppercase tracking-[.2em] text-slate-500">
                AI reliability platform
              </p>
            </div>
          </Link>

          <div className="max-w-[500px]">
            <div className="mb-5 inline-flex items-center gap-2 rounded-full border border-[#334b2e] bg-[#152118] px-3 py-1.5 text-[10px] font-semibold text-lime">
              <Sparkles size={12} /> CONTEXT FOR AI AGENTS
            </div>
            <h1 className="text-[42px] font-semibold leading-[1.12] tracking-[-.05em] xl:text-[52px]">
              Give your agents
              <br />
              the <span className="text-lime">context</span> to act.
            </h1>
            <p className="mt-5 max-w-md text-sm leading-7 text-slate-400">
              Investigate incidents, learn from every failure, and make safer decisions
              with a living graph of your engineering systems.
            </p>

            <div className="mt-10 rounded-2xl border border-line bg-[#111821]/80 p-5 shadow-soft">
              <div className="mb-4 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-rose-400/10 text-rose-300">
                    <AlertTriangle size={15} />
                  </div>
                  <div>
                    <p className="text-xs font-semibold">Checkout service regression</p>
                    <p className="mt-1 text-[9px] text-slate-600">INC-2481 · 4 min ago</p>
                  </div>
                </div>
                <Badge tone="red">Critical</Badge>
              </div>
              <div className="space-y-2 border-l border-line pl-4">
                <div className="relative">
                  <span className="absolute -left-[21px] top-1 h-2 w-2 rounded-full bg-sky-300" />
                  <p className="text-[11px] text-slate-300">Graph identified a changed dependency</p>
                </div>
                <div className="relative">
                  <span className="absolute -left-[21px] top-1 h-2 w-2 rounded-full bg-violet-300" />
                  <p className="text-[11px] text-slate-300">Memory recalled a verified recovery</p>
                </div>
                <div className="relative">
                  <span className="absolute -left-[21px] top-1 h-2 w-2 rounded-full bg-lime" />
                  <p className="text-[11px] text-lime">Safe rollback recommended · approval required</p>
                </div>
              </div>
            </div>
          </div>

          <div className="flex items-center justify-between text-[10px] text-slate-600">
            <span>© 2026 GraphOps Brain</span>
            <span className="flex items-center gap-2">
              <ShieldCheck size={12} /> Secure by design
            </span>
          </div>
        </div>

        {/* ---- Right content ---- */}
        <div className="relative flex items-center justify-center px-5 py-10 sm:px-10">
          <div className="w-full max-w-[420px]">
            {/* Mobile logo */}
            <div className="mb-8 flex items-center gap-3 lg:hidden">
              <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-lime text-[#14200b]">
                <Network size={18} />
              </div>
              <div className="text-sm font-bold">
                graphops<span className="text-lime">.</span>
              </div>
            </div>

            {(heading || subheading) && (
              <div className="mb-7">
                {heading && (
                  <h2 className="text-[28px] font-semibold tracking-[-.04em]">{heading}</h2>
                )}
                {subheading && (
                  <p className="mt-2 text-[12px] leading-5 text-slate-500">{subheading}</p>
                )}
              </div>
            )}

            {children}

            <div className="mt-8 flex items-center justify-center gap-4 text-[10px] text-slate-600">
              <a
                href="https://docs.falkordb.com/"
                target="_blank"
                rel="noreferrer"
                className="hover:text-slate-400"
              >
                Documentation
              </a>
              <span>·</span>
              <a
                href="https://www.wemakedevs.org/hackathons/falkordb"
                target="_blank"
                rel="noreferrer"
                className="hover:text-slate-400"
              >
                Hackathon
              </a>
              <span>·</span>
              <button className="hover:text-slate-400">Privacy</button>
              <ArrowUpRight size={10} className="opacity-50" />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}