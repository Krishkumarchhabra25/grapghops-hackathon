import { ArrowUpRight } from 'lucide-react';
import { useModal } from '../../contexts/ModalContext';

export function Footer() {
  const { openModal } = useModal();
  return (
    <footer className="flex flex-col gap-2 border-t border-line px-5 py-4 text-[10px] text-slate-600 sm:flex-row sm:items-center sm:justify-between md:px-7">
      <div className="flex items-center gap-2">
        <span className="font-semibold text-slate-500">graphops.</span>
        <span>Context you can trust.</span>
        <span className="text-slate-700">·</span>
        <span>v0.9.4</span>
      </div>
      <div className="flex items-center gap-4">
        <span>FalkorDB connected</span>
        <span>All systems normal</span>
        <button onClick={() => openModal('help')} className="hover:text-slate-300">
          Documentation <ArrowUpRight size={10} className="ml-1 inline" />
        </button>
      </div>
    </footer>
  );
}