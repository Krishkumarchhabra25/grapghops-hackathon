import { Link } from 'react-router-dom';
import { ArrowRight, FileSearch } from 'lucide-react';

export function NotFoundPage() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-ink px-4 text-center">
      <div className="flex h-14 w-14 items-center justify-center rounded-2xl border border-line bg-[#151d27] text-slate-400">
        <FileSearch size={23} />
      </div>
      <p className="mt-5 font-mono text-[10px] text-slate-600">404 / PAGE NOT FOUND</p>
      <h1 className="mt-2 text-2xl font-semibold">This page doesn't exist</h1>
      <p className="mt-2 max-w-sm text-xs leading-6 text-slate-500">The link may be outdated.</p>
      <Link to="/" className="btn-primary mt-5">Back to overview <ArrowRight size={13} /></Link>
    </div>
  );
}