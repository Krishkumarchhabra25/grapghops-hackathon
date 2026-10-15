import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Activity, AlertTriangle, ArrowUpRight, Building2, CheckCircle2, Crown,
  Loader2, Network, Search, Shield, ShieldCheck, User, UserPlus, Users,
  X,
} from 'lucide-react';
import { PageTitle } from '../components/ui/PageTitle';
import { StatCard } from '../components/ui/StatCard';
import { Badge, type BadgeTone } from '../components/ui/Badge';
import { SearchBox } from '../components/ui/SearchBox';
import { EmptyState } from '../components/ui/EmptyState';
import { LoadingSpinner } from '../components/ui/LoadingSpinner';
import { SectionHeading } from '../components/ui/SectionHeading';
import { useModal } from '../contexts/ModalContext';
import { useFetch } from '../lib/hooks';
import { teamApi } from '../lib/api';
import { cx, relativeTime, toneForSeverity, toneForStatus } from '../lib/utils';

// ---------- Types ----------
type TeamMember = {
  id: string;
  name: string;
  email?: string | null;
  role?: string | null;
  team_id?: string | null;
  team_name?: string | null;
  service_count: number;
  owned_services: string[];
};

type TeamListResponse = {
  members: TeamMember[];
  count: number;
  stats: {
    total: number;
    role_counts: Record<string, number>;
    teams: number;
  };
};

type PersonService = { id: string; name: string; status?: string | null };
type PersonIncident = {
  id: string;
  title: string;
  severity: string;
  status: string;
  resolved_at?: number | null;
};
type PersonDetail = {
  id: string;
  name: string;
  email?: string | null;
  role?: string | null;
  team_id?: string | null;
  team_name?: string | null;
  services: PersonService[];
  incidents: PersonIncident[];
};

// ---------- Constants ----------
const ROLE_TABS = ['All', 'Owner', 'Admin', 'Engineer', 'Viewer'] as const;

const ROLE_TONES: Record<string, BadgeTone> = {
  Owner: 'green',
  Admin: 'purple',
  Engineer: 'blue',
  Viewer: 'yellow',
};

const AVATAR_COLORS = ['#b9f56a', '#a78bfa', '#61c8f3', '#f4a261', '#ff9eaa', '#57e0b0'];

function colorForId(id: string): string {
  let hash = 0;
  for (let i = 0; i < id.length; i++) hash = (hash * 31 + id.charCodeAt(i)) | 0;
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
}

function initialsFor(name: string): string {
  return name.split(' ').map(n => n[0]).slice(0, 2).join('').toUpperCase();
}

// ---------- Page ----------
export function TeamPage() {
  const { openModal } = useModal();
  const [roleFilter, setRoleFilter] = useState<typeof ROLE_TABS[number]>('All');
  const [searchInput, setSearchInput] = useState('');
  const [q, setQ] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);

  // Debounce search
  useEffect(() => {
    const t = window.setTimeout(() => setQ(searchInput.trim()), 250);
    return () => window.clearTimeout(t);
  }, [searchInput]);

  const team = useFetch(
    () => teamApi.list({ q: q || undefined, role: roleFilter === 'All' ? undefined : roleFilter }) as Promise<TeamListResponse>,
    [q, roleFilter],
  );

  const members = team.data?.members ?? [];
  const stats = team.data?.stats;

  const total = stats?.total ?? members.length;
  const owners = stats?.role_counts?.Owner ?? 0;
  const admins = stats?.role_counts?.Admin ?? 0;
  const engineers = stats?.role_counts?.Engineer ?? 0;
  const teamsCount = stats?.teams ?? 0;

  return (
    <>
      <PageTitle
        eyebrow="Manage / Workspace access"
        title="Team"
        description="Manage your workspace members, responsibilities, and access to GraphOps Brain."
        actions={
          <button className="btn-primary" onClick={() => openModal('invite')}>
            <UserPlus size={14} /> Invite member
          </button>
        }
      />

      {/* Stat cards */}
      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Total members" value={total} icon={Users} />
        <StatCard
          label="Owners & admins"
          value={owners + admins}
          icon={Crown}
          accent="violet"
        />
        <StatCard
          label="Engineers"
          value={engineers}
          icon={Shield}
          accent="blue"
        />
        <StatCard
          label="Teams represented"
          value={teamsCount}
          icon={Building2}
          accent="lime"
        />
      </div>

      {/* Filters */}
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap gap-1 rounded-lg bg-[#121821] p-1">
          {ROLE_TABS.map(r => (
            <button
              key={r}
              onClick={() => setRoleFilter(r)}
              className={cx(
                'rounded-md px-3 py-1.5 text-[11px] font-semibold transition-colors',
                roleFilter === r ? 'bg-[#2a3542] text-white' : 'text-slate-500 hover:text-slate-300',
              )}
            >
              {r}
              {r === 'All' && stats && (
                <span className="ml-1.5 text-[9px] text-slate-500">{stats.total}</span>
              )}
            </button>
          ))}
        </div>
        <SearchBox
          value={searchInput}
          onChange={setSearchInput}
          className="w-full sm:w-[260px]"
          placeholder="Search by name, email, team..."
        />
      </div>

      {/* Content */}
      {team.loading ? (
        <LoadingSpinner label="Loading team…" />
      ) : team.error ? (
        <EmptyState
          icon={AlertTriangle}
          title="Couldn't load team"
          description={team.error.message}
          action={<button className="btn-secondary" onClick={team.refetch}>Retry</button>}
        />
      ) : members.length === 0 ? (
        <EmptyState
          icon={Users}
          title={q || roleFilter !== 'All' ? 'No members match' : 'No members yet'}
          description={
            q || roleFilter !== 'All'
              ? 'Try another search or clear the filters.'
              : 'Invite people to collaborate in this workspace.'
          }
          action={
            q || roleFilter !== 'All' ? (
              <button
                className="btn-secondary"
                onClick={() => { setSearchInput(''); setRoleFilter('All'); }}
              >
                Clear filters
              </button>
            ) : (
              <button className="btn-primary" onClick={() => openModal('invite')}>
                <UserPlus size={13} /> Invite member
              </button>
            )
          }
        />
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {members.map(m => (
            <MemberCard
              key={m.id}
              member={m}
              onClick={() => setSelectedId(m.id)}
            />
          ))}
        </div>
      )}

      {/* Detail modal */}
      {selectedId && (
        <PersonDetailModal
          personId={selectedId}
          onClose={() => setSelectedId(null)}
        />
      )}
    </>
  );
}

// ============================================================
// Member card
// ============================================================
function MemberCard({ member, onClick }: { member: TeamMember; onClick: () => void }) {
  const color = colorForId(member.id);
  const initials = initialsFor(member.name);

  return (
    <button
      onClick={onClick}
      className="card group flex flex-col items-start gap-3 p-4 text-left transition-colors hover:border-[#3b4857]"
    >
      <div className="flex w-full items-start justify-between">
        <div
          className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl font-bold text-[#111821]"
          style={{ background: color }}
        >
          {initials}
        </div>
        <Badge tone={ROLE_TONES[member.role || 'Viewer'] ?? 'neutral'}>
          {member.role || 'Viewer'}
        </Badge>
      </div>

      <div className="w-full min-w-0">
        <p className="truncate text-sm font-semibold text-slate-100 group-hover:text-lime">
          {member.name}
        </p>
        <p className="mt-1 truncate text-[10px] text-slate-500">{member.email || '—'}</p>
      </div>

      <div className="w-full space-y-1.5 border-t border-line pt-3">
        {member.team_name ? (
          <div className="flex items-center gap-2 text-[10px] text-slate-400">
            <Building2 size={11} className="text-slate-500" />
            <span className="truncate">{member.team_name}</span>
          </div>
        ) : (
          <div className="flex items-center gap-2 text-[10px] text-slate-600">
            <Building2 size={11} />
            <span>No team</span>
          </div>
        )}
        <div className="flex items-center gap-2 text-[10px] text-slate-400">
          <Network size={11} className="text-slate-500" />
          <span>
            {member.service_count > 0
              ? `Owns ${member.service_count} service${member.service_count === 1 ? '' : 's'}`
              : 'No owned services'}
          </span>
        </div>
      </div>
    </button>
  );
}

// ============================================================
// Detail modal
// ============================================================
function PersonDetailModal({
  personId,
  onClose,
}: {
  personId: string;
  onClose: () => void;
}) {
  const detail = useFetch(
    () => teamApi.get(personId) as Promise<PersonDetail>,
    [personId],
  );

  // Escape closes
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const person = detail.data;

  return (
    <div
      className="fixed inset-0 z-[90] flex items-center justify-center bg-black/70 p-3 backdrop-blur-sm"
      onMouseDown={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="max-h-[90vh] w-full max-w-[620px] overflow-hidden rounded-2xl border border-[#303b49] bg-[#111821] shadow-[0_30px_100px_rgba(0,0,0,.55)]">
        {/* Header */}
        <div className="flex items-start justify-between border-b border-line px-5 py-4">
          <div className="min-w-0 flex-1">
            {detail.loading ? (
              <p className="text-sm text-slate-500">Loading…</p>
            ) : detail.error || !person ? (
              <p className="text-sm text-rose-300">{detail.error?.message || 'Not found'}</p>
            ) : (
              <>
                <h2 className="text-[15px] font-semibold text-slate-100">{person.name}</h2>
                <p className="mt-1 text-[11px] text-slate-500">{person.email || '—'}</p>
              </>
            )}
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-1.5 text-slate-500 hover:bg-[#202a34] hover:text-white"
          >
            <X size={16} />
          </button>
        </div>

        {!detail.loading && person && !detail.error && (
          <div className="max-h-[calc(90vh-140px)] overflow-y-auto px-5 py-4">
            {/* Identity card */}
            <div className="mb-4 flex items-start gap-4">
              <div
                className="flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl text-lg font-bold text-[#111821]"
                style={{ background: colorForId(person.id) }}
              >
                {initialsFor(person.name)}
              </div>
              <div className="min-w-0 flex-1 space-y-2">
                <div className="flex flex-wrap gap-2">
                  <Badge tone={ROLE_TONES[person.role || 'Viewer'] ?? 'neutral'}>
                    <Crown size={10} className="-ml-0.5 mr-0.5" />
                    {person.role || 'Viewer'}
                  </Badge>
                  {person.team_name && (
                    <Badge tone="blue">
                      <Building2 size={10} className="-ml-0.5 mr-0.5" />
                      {person.team_name}
                    </Badge>
                  )}
                  <Badge>{person.id}</Badge>
                </div>
                {person.team_id && (
                  <p className="font-mono text-[10px] text-slate-600">team: {person.team_id}</p>
                )}
              </div>
            </div>

            {/* Owned services */}
            <div className="mb-4 border-t border-line pt-4">
              <SectionHeading
                title="Owned services"
                subtitle={`${person.services.length} service${person.services.length === 1 ? '' : 's'}`}
              />
              {person.services.length === 0 ? (
                <p className="text-[11px] text-slate-500">No direct ownership recorded.</p>
              ) : (
                <div className="space-y-1.5">
                  {person.services.map(s => (
                    <Link
                      key={s.id}
                      to={`/services/${s.id}`}
                      onClick={onClose}
                      className="flex items-center gap-3 rounded-lg border border-line bg-[#0f151d] px-3 py-2 hover:border-lime/40"
                    >
                      <div className="flex h-7 w-7 items-center justify-center rounded-md bg-lime/10 text-lime">
                        <Network size={12} />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-[11px] font-semibold text-slate-200">{s.name}</p>
                        <p className="mt-0.5 font-mono text-[9px] text-slate-600">{s.id}</p>
                      </div>
                      {s.status && (
                        <Badge tone={toneForStatus(s.status)}>{s.status}</Badge>
                      )}
                      <ArrowUpRight size={11} className="text-slate-600" />
                    </Link>
                  ))}
                </div>
              )}
            </div>

            {/* Resolved incidents */}
            <div className="border-t border-line pt-4">
              <SectionHeading
                title="Resolved incidents"
                subtitle={`${person.incidents.length} incident${person.incidents.length === 1 ? '' : 's'}`}
              />
              {person.incidents.length === 0 ? (
                <p className="text-[11px] text-slate-500">
                  No incidents resolved by this person yet.
                </p>
              ) : (
                <div className="space-y-1.5">
                  {person.incidents.map(i => (
                    <Link
                      key={i.id}
                      to={`/incidents/${i.id}`}
                      onClick={onClose}
                      className="flex items-center gap-3 rounded-lg border border-line bg-[#0f151d] px-3 py-2 hover:border-slate-600"
                    >
                      <div className={cx(
                        'flex h-7 w-7 items-center justify-center rounded-md',
                        i.severity === 'Critical' ? 'bg-rose-400/10 text-rose-300'
                          : i.severity === 'High' ? 'bg-amber-400/10 text-amber-300'
                          : 'bg-sky-400/10 text-sky-300',
                      )}>
                        <AlertTriangle size={12} />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-[11px] font-semibold text-slate-200">{i.title}</p>
                        <p className="mt-0.5 font-mono text-[9px] text-slate-600">
                          {i.id} · {i.resolved_at ? relativeTime(i.resolved_at) : '—'}
                        </p>
                      </div>
                      <Badge tone={toneForSeverity(i.severity)}>{i.severity}</Badge>
                    </Link>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        <div className="flex items-center justify-end border-t border-line bg-[#0d131b] px-5 py-3">
          <button className="btn-secondary !py-2" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </div>
  );
}