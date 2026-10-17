import { NavLink, Link } from 'react-router-dom';
import {
  Activity, AlertTriangle, ArrowUpRight, BookOpen, BrainCircuit, Building2,
  Check, ChevronsUpDown, FileSearch, LayoutDashboard, Link2, MoreHorizontal,
  Network, Plus, Server, Settings, User, Users, Workflow, X, Command, LogOut,ShieldCheck
} from 'lucide-react';
import { useState } from 'react';
import { cx } from '../../lib/utils';
import { Avatar } from '../ui/Avatar';
import { useAuth } from '../../contexts/AuthContext';
import { useModal } from '../../contexts/ModalContext';
import { useToast } from '../../contexts/ToastContext';
import { useNavigate } from 'react-router-dom';

const NAV_GROUPS = [
  {
    label: 'WORKSPACE',
    items: [
      { to: '/', label: 'Overview', icon: LayoutDashboard },
      { to: '/incidents', label: 'Incidents', icon: AlertTriangle },
      { to: '/graph', label: 'Graph explorer', icon: Network },
    ],
  },
  {
    label: 'INTELLIGENCE',
    items: [
      { to: '/runs', label: 'Agent runs', icon: Workflow },
      { to: '/memory', label: 'Agent memory', icon: BrainCircuit },
      { to: '/knowledge', label: 'Knowledge base', icon: BookOpen },
    ],
  },
  {
    label: 'MANAGE',
    items: [
      { to: '/services', label: 'Services', icon: Server },
      { to: '/team', label: 'Team', icon: Users },
      { to: '/integrations', label: 'Integrations', icon: Link2 },
      { to: '/audit', label: 'Audit log', icon: ShieldCheck }, 
    ],
  },
 
];

export function Sidebar({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { user, workspace, logout } = useAuth();
  const { openModal } = useModal();
  const { notify } = useToast();
  const navigate = useNavigate();

  const [profileOpen, setProfileOpen] = useState(false);
  const [workspaceOpen, setWorkspaceOpen] = useState(false);

  const signOut = async () => {
    await logout();
    notify('You have signed out.');
    navigate('/login');
  };

  return (
    <>
      {open && (
        <button
          className="fixed inset-0 z-40 bg-black/60 md:hidden"
          aria-label="Close navigation"
          onClick={onClose}
        />
      )}
      <aside className={cx(
        'fixed inset-y-0 left-0 z-50 flex w-[248px] flex-col border-r border-line bg-[#0b1016] transition-transform duration-200 md:translate-x-0',
        open ? 'translate-x-0' : '-translate-x-full',
      )}>
        {/* Logo */}
        <div className="flex h-[72px] items-center justify-between border-b border-line px-5">
          <Link to="/" className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-lime text-[#15210c]">
              <Network size={19} strokeWidth={2.6} />
            </div>
            <div>
              <div className="text-[14px] font-bold tracking-[-.035em]">
                graphops<span className="text-lime">.</span>
              </div>
              <div className="mt-0.5 text-[9px] font-bold uppercase tracking-[.2em] text-slate-500">
                AI reliability platform
              </div>
            </div>
          </Link>
          <button className="btn-ghost md:hidden" onClick={onClose}><X size={17} /></button>
        </div>

        {/* Workspace switcher */}
        <div className="relative px-3 pt-4">
          <button
            onClick={() => setWorkspaceOpen(v => !v)}
            className="flex w-full items-center gap-3 rounded-xl border border-[#26313d] bg-[#121922] px-3 py-2.5 text-left hover:border-[#3c4a59]"
          >
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#263b32] text-lime">
              <Building2 size={16} />
            </div>
            <div className="min-w-0 flex-1">
              <div className="truncate text-xs font-semibold text-slate-200">
                {workspace?.name || 'Workspace'}
              </div>
              <div className="mt-0.5 flex items-center gap-1 text-[10px] text-slate-500">
                <span className="h-1.5 w-1.5 rounded-full bg-lime" /> Pro workspace
              </div>
            </div>
            <ChevronsUpDown size={14} className="text-slate-500" />
          </button>
          {workspaceOpen && (
            <div className="absolute left-3 right-3 top-[88px] z-50 rounded-xl border border-line bg-[#151d27] p-2 shadow-soft">
              <div className="px-2 py-1.5 text-[10px] font-bold uppercase tracking-widest text-slate-500">
                Your workspaces
              </div>
              <button
                onClick={() => { setWorkspaceOpen(false); notify('Workspace already selected.'); }}
                className="flex w-full items-center gap-2 rounded-lg bg-[#202a34] px-2 py-2 text-xs"
              >
                <Building2 size={14} className="text-lime" />
                {workspace?.name || 'Workspace'}
                <Check size={13} className="ml-auto text-lime" />
              </button>
              <button
                onClick={() => { setWorkspaceOpen(false); openModal('workspace'); }}
                className="mt-1 flex w-full items-center gap-2 rounded-lg px-2 py-2 text-xs text-slate-400 hover:bg-[#202a34] hover:text-white"
              >
                <Plus size={14} /> Create workspace
              </button>
            </div>
          )}
        </div>

        {/* Nav */}
        <nav className="sidebar-scroll mt-5 flex-1 overflow-y-auto px-3 pb-4">
          {NAV_GROUPS.map(group => (
            <div key={group.label} className="mb-6">
              <div className="mb-2 px-3 text-[9px] font-bold tracking-[.19em] text-slate-600">
                {group.label}
              </div>
              <div className="space-y-1">
                {group.items.map(item => {
                  const Icon = item.icon;
                  return (
                    <NavLink
                      key={item.to}
                      to={item.to}
                      end={item.to === '/'}
                      className={({ isActive }) => cx('sidebar-link', isActive && 'active')}
                    >
                      <Icon size={16} />
                      <span>{item.label}</span>
                    </NavLink>
                  );
                })}
              </div>
            </div>
          ))}
          <div>
            <div className="mb-2 px-3 text-[9px] font-bold tracking-[.19em] text-slate-600">
              PREFERENCES
            </div>
            <NavLink to="/settings" className={({ isActive }) => cx('sidebar-link', isActive && 'active')}>
              <Settings size={16} />
              <span>Settings</span>
            </NavLink>
          </div>
        </nav>

   

        {/* Profile */}
        <div className="border-t border-line p-3">
          <button
            onClick={() => setProfileOpen(v => !v)}
            className="flex w-full items-center gap-2.5 rounded-xl p-2 text-left hover:bg-[#151d26]"
          >
            <Avatar name={user?.name || 'User'} />
            <div className="min-w-0 flex-1">
              <div className="truncate text-xs font-semibold text-slate-200">{user?.name || 'User'}</div>
              <div className="truncate text-[10px] text-slate-500">{user?.email || ''}</div>
            </div>
            <MoreHorizontal size={16} className="text-slate-500" />
          </button>
          {profileOpen && (
            <div className="mb-1 mt-1 rounded-xl border border-line bg-[#141b24] p-1.5 shadow-soft">
              <button
                onClick={() => { setProfileOpen(false); navigate('/settings?tab=profile'); }}
                className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-xs text-slate-300 hover:bg-[#202a34]"
              >
                <User size={14} /> Profile settings
              </button>
              <button
                onClick={() => { setProfileOpen(false); openModal('keyboard'); }}
                className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-xs text-slate-300 hover:bg-[#202a34]"
              >
                <Command size={14} /> Keyboard shortcuts
              </button>
              <div className="my-1 border-t border-line" />
              <button
                onClick={signOut}
                className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-xs text-rose-300 hover:bg-rose-400/10"
              >
                <LogOut size={14} /> Sign out
              </button>
            </div>
          )}
        </div>
      </aside>
    </>
  );
}