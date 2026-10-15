import { Bell, ChevronRight, CircleHelp, Command, Menu, Search } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Avatar } from '../ui/Avatar';
import { useAuth } from '../../contexts/AuthContext';
import { useModal } from '../../contexts/ModalContext';

const TITLE_MAP: Record<string, string> = {
  '/': 'Overview',
  '/incidents': 'Incidents',
  '/investigations': 'Investigations',
  '/graph': 'Graph explorer',
  '/runs': 'Agent runs',
  '/memory': 'Agent memory',
  '/knowledge': 'Knowledge base',
  '/services': 'Services',
  '/team': 'Team',
  '/integrations': 'Integrations',
  '/tracks': 'Track coverage',
  '/settings': 'Settings',
};

export function Topbar({ onOpenSidebar }: { onOpenSidebar: () => void }) {
  const { user } = useAuth();
  const { openModal } = useModal();
  const location = useLocation();
  const navigate = useNavigate();
  const [profileOpen, setProfileOpen] = useState(false);

  // Find the page title — longest matching prefix wins.
  const pageTitle = Object.keys(TITLE_MAP)
    .sort((a, b) => b.length - a.length)
    .find(k => location.pathname === k || (k !== '/' && location.pathname.startsWith(k + '/')));

  // Close profile dropdown on navigation
  useEffect(() => { setProfileOpen(false); }, [location.pathname]);

  // Keyboard shortcut ⌘K
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        openModal('search');
      }
      if (e.key === 'Escape') setProfileOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [openModal]);

  return (
    <>
      <header className="sticky top-0 z-30 flex h-[72px] items-center justify-between gap-3 border-b border-line bg-[#0d1117]/90 px-4 backdrop-blur-xl md:px-7">
        <div className="flex min-w-0 items-center gap-3">
          <button className="btn-ghost -ml-2 md:hidden" onClick={onOpenSidebar}>
            <Menu size={19} />
          </button>
          <div className="hidden items-center gap-2 text-xs text-slate-500 sm:flex">
            <span>Acme Engineering</span>
            <ChevronRight size={13} />
            <span className="font-semibold text-slate-200">{TITLE_MAP[pageTitle || ''] || 'Workspace'}</span>
          </div>
          <div className="text-sm font-semibold sm:hidden">{TITLE_MAP[pageTitle || ''] || 'Workspace'}</div>
        </div>
        <div className="flex items-center gap-1.5 sm:gap-2">
          <button
            onClick={() => openModal('search')}
            className="hidden h-9 min-w-[210px] items-center gap-2 rounded-lg border border-line bg-[#121821] px-3 text-xs text-slate-500 hover:border-slate-600 md:flex"
          >
            <Search size={14} />
            <span className="flex-1 text-left">Search anything...</span>
            <span className="flex items-center gap-0.5 rounded border border-[#364150] px-1.5 py-0.5 font-mono text-[9px] text-slate-400">
              <Command size={9} /> K
            </span>
          </button>
          <button onClick={() => openModal('search')} className="btn-ghost md:hidden"><Search size={17} /></button>
          <span className="mx-1 hidden h-5 w-px bg-line sm:block" />
          <div className="hidden items-center gap-2 rounded-full border border-[#28402d] bg-[#132018] px-2.5 py-1.5 sm:flex">
            <span className="pulse-dot h-1.5 w-1.5 rounded-full bg-lime text-lime" />
            <span className="text-[10px] font-semibold text-lime">LIVE</span>
          </div>
          <button
            onClick={() => openModal('notifications')}
            className="relative flex h-9 w-9 items-center justify-center rounded-lg text-slate-400 hover:bg-[#1a222c] hover:text-slate-100"
          >
            <Bell size={17} />
          </button>
          <button
            onClick={() => openModal('help')}
            className="hidden h-9 w-9 items-center justify-center rounded-lg text-slate-400 hover:bg-[#1a222c] hover:text-white sm:flex"
          >
            <CircleHelp size={17} />
          </button>
          <div className="ml-1 h-7 w-px bg-line" />
          <button
            onClick={() => setProfileOpen(v => !v)}
            className="rounded-full ring-2 ring-transparent hover:ring-[#3a4933]"
          >
            <Avatar name={user?.name || 'User'} size="sm" />
          </button>
        </div>
      </header>

      {profileOpen && (
        <div className="fixed right-4 top-[64px] z-50 w-52 rounded-xl border border-line bg-[#151d27] p-1.5 shadow-soft md:right-7">
          <div className="px-3 py-2">
            <p className="text-xs font-semibold">{user?.name || 'User'}</p>
            <p className="mt-1 text-[10px] text-slate-500">{user?.role || ''}</p>
          </div>
          <button
            onClick={() => { setProfileOpen(false); navigate('/settings?tab=profile'); }}
            className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-xs text-slate-300 hover:bg-[#202a34]"
          >
            Profile settings
          </button>
          <button
            onClick={() => { setProfileOpen(false); navigate('/settings?tab=workspace'); }}
            className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-xs text-slate-300 hover:bg-[#202a34]"
          >
            Settings
          </button>
        </div>
      )}
    </>
  );
}