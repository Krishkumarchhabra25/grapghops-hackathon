import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  AlertTriangle, ArrowUpRight, BadgeCheck, BookMarked, Brain, BrainCircuit,
  Check, Copy, Database, History, Loader2, Network, Pin, Plus, RefreshCw,
  Shield, ShieldAlert, Sparkles, Trash2, Workflow, WandSparkles,
} from 'lucide-react';
import { PageTitle } from '../components/ui/PageTitle';
import { StatCard } from '../components/ui/StatCard';
import { Badge, type BadgeTone } from '../components/ui/Badge';
import { SearchBox } from '../components/ui/SearchBox';
import { EmptyState } from '../components/ui/EmptyState';
import { LoadingSpinner } from '../components/ui/LoadingSpinner';
import { SectionHeading } from '../components/ui/SectionHeading';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../contexts/ToastContext';
import { useModal } from '../contexts/ModalContext';
import { usePoll } from '../lib/hooks';
import { memoryApi } from '../lib/api';
import { cx, formatDateTime, relativeTime, toneForStatus } from '../lib/utils';

// ---------- Types ----------
type MemoryType = 'episodic' | 'semantic' | 'procedural' | 'policy';
type MemoryStatus = 'unverified' | 'verified' | 'pinned' | 'deprecated';

type MemoryListItem = {
  id: string;
  type: MemoryType;
  title: string;
  summary: string;
  confidence: number;
  status: MemoryStatus;
  uses: number;
  source?: string | null;
  updated_at?: number | null;
  created_at?: number | null;
  score?: number | null;
};

type MemoryEntity = { id: string; type: string; name: string };
type MemoryFix = { id: string; title: string; kind: string };

type MemoryDetail = {
  id: string;
  type: MemoryType;
  title: string;
  summary: string;
  confidence: number;
  status: MemoryStatus;
  uses: number;
  source?: string | null;
  expires_at?: number | null;
  created_at?: number | null;
  updated_at?: number | null;
  entities: MemoryEntity[];
  fixes: MemoryFix[];
};

// ---------- Constants ----------
const APPROVER_ROLES = ['Owner', 'Admin', 'Engineer'];

const TYPE_META: Record<MemoryType, { label: string; tone: BadgeTone; color: string; icon: typeof Brain }> = {
  episodic:   { label: 'Episodic',   tone: 'blue',   color: 'text-sky-300',    icon: History },
  semantic:   { label: 'Semantic',   tone: 'purple', color: 'text-violet-300', icon: Network },
  procedural: { label: 'Procedural', tone: 'green',  color: 'text-lime',       icon: Workflow },
  policy:     { label: 'Policy',     tone: 'yellow', color: 'text-amber-300',  icon: Shield },
};

const STATUS_TABS = ['All', 'verified', 'pinned', 'unverified', 'deprecated'] as const;

// ---------- Helpers ----------
function entityRoute(entityId: string): string | null {
  if (entityId.startsWith('svc-'))  return `/services/${entityId}`;
  if (entityId.startsWith('inc-'))  return `/incidents/${entityId}`;
  if (entityId.startsWith('run-'))  return `/runs/${entityId}`;
  if (entityId.startsWith('doc-'))  return `/knowledge`;
  if (entityId.startsWith('usr-'))  return `/team`;
  if (entityId.startsWith('team-')) return `/team`;
  return null;
}

export function MemoryPage() {
  const { user } = useAuth();
  const { notify } = useToast();
  const { openModal } = useModal();

  const canAct = APPROVER_ROLES.includes(user?.role || '');

  // ---------- Filters ----------
  const [searchInput, setSearchInput] = useState('');
  const [q, setQ] = useState('');
  const [typeFilter, setTypeFilter] = useState<MemoryType | 'All'>('All');
  const [statusFilter, setStatusFilter] = useState<typeof STATUS_TABS[number]>('All');

  // Debounce search 250ms so we don't hammer the fulltext index.
  useEffect(() => {
    const t = window.setTimeout(() => setQ(searchInput.trim()), 250);
    return () => window.clearTimeout(t);
  }, [searchInput]);

  // Poll every 10s to save server cost (was 5s).
  const list = usePoll(
    () => memoryApi.list({
      type: typeFilter === 'All' ? undefined : typeFilter,
      status: statusFilter === 'All' ? undefined : statusFilter,
      q: q || undefined,
    }) as Promise<{ memories: MemoryListItem[] }>,
    10000,
    [typeFilter, statusFilter, q],
  );

  const memories = list.data?.memories ?? [];

  // ---------- Selection ----------
  const [selectedId, setSelectedId] = useState<string | null>(null);

  // Auto-select first item when the list loads and nothing is selected.
  useEffect(() => {
    if (!selectedId && memories.length > 0) {
      setSelectedId(memories[0].id);
    }
  }, [memories, selectedId]);

  // ---------- Detail ----------
  const detail = usePoll(
    () => selectedId
      ? memoryApi.get(selectedId) as Promise<MemoryDetail>
      : Promise.resolve(null),
    10000, // Poll detail every 10s
    [selectedId],
  );

  const selected = detail.data;

  // ---------- Lifecycle actions ----------
  const [busyAction, setBusyAction] = useState<string | null>(null);

  const runAction = async (name: string, fn: () => Promise<any>) => {
    if (busyAction) return;
    setBusyAction(name);
    try {
      await fn();
      await Promise.all([list.refetch(), detail.refetch()]);
    } catch (e: any) {
      notify(e?.message || `${name} failed`, 'error');
    } finally {
      setBusyAction(null);
    }
  };

  const onVerify = () => selected && runAction('verify', () =>
    memoryApi.verify(selected.id).then(() => notify('Memory verified')));
  const onPin = () => selected && runAction('pin', () =>
    memoryApi.pin(selected.id).then(() => notify('Memory pinned')));
  const onDeprecate = () => selected && runAction('deprecate', () =>
    memoryApi.deprecate(selected.id).then(() => notify('Memory deprecated')));
  const onDelete = () => {
    if (!selected) return;
    if (!confirm(`Delete memory "${selected.title}"? This cannot be undone.`)) return;
    runAction('delete', () =>
      memoryApi.delete(selected.id).then(() => {
        notify('Memory deleted');
        setSelectedId(null);
      }));
  };

  // ---------- Derived stats ----------
  const stats = useMemo(() => {
    const byType: Record<MemoryType, number> = { episodic: 0, semantic: 0, procedural: 0, policy: 0 };
    const byStatus: Record<string, number> = { verified: 0, pinned: 0, unverified: 0, deprecated: 0 };
    let totalUses = 0;
    let verifiedConf = 0;
    let verifiedCount = 0;
    for (const m of memories) {
      byType[m.type] = (byType[m.type] ?? 0) + 1;
      byStatus[m.status] = (byStatus[m.status] ?? 0) + 1;
      totalUses += m.uses;
      if (m.status === 'verified' || m.status === 'pinned') {
        verifiedConf += m.confidence;
        verifiedCount++;
      }
    }
    const avgConfidence = verifiedCount > 0 ? verifiedConf / verifiedCount : 0;
    return { byType, byStatus, totalUses, avgConfidence };
  }, [memories]);

  return (
    <>
      <PageTitle
        eyebrow="Intelligence / Long-term context"
        title="Agent memory"
        description="Curate the verified experiences, procedures, and facts your agents recall across sessions."
        actions={
          <>
            <button className="btn-secondary" onClick={() => { list.refetch(); detail.refetch(); }}>
              <RefreshCw size={13} /> Refresh
            </button>
            {/* <button className="btn-primary" onClick={() => openModal('memory')} disabled={!canAct}>
              <Plus size={14} /> Add memory
            </button> */}
          </>
        }
      />

      {/* Stat cards */}
      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Total memories" value={memories.length} icon={BrainCircuit} accent="violet" />
        <StatCard
          label="Verified & pinned"
          value={(stats.byStatus.verified ?? 0) + (stats.byStatus.pinned ?? 0)}
          icon={BadgeCheck}
          accent="lime"
        />
        <StatCard
          label="Avg confidence"
          value={stats.avgConfidence ? `${Math.round(stats.avgConfidence * 100)}%` : '—'}
          icon={Sparkles}
          accent="blue"
          description="Across verified memories"
        />
        <StatCard
          label="Total recalls"
          value={stats.totalUses}
          icon={WandSparkles}
          accent="violet"
          description="Times any memory was retrieved"
        />
      </div>

      {/* Type cards */}
      <div className="mb-4 grid grid-cols-2 gap-2 md:grid-cols-4">
        {(Object.keys(TYPE_META) as MemoryType[]).map(t => {
          const meta = TYPE_META[t];
          const Icon = meta.icon;
          const active = typeFilter === t;
          const count = stats.byType[t] ?? 0;
          return (
            <button
              key={t}
              onClick={() => setTypeFilter(active ? 'All' : t)}
              className={cx(
                'card p-3.5 text-left transition-colors hover:border-slate-600',
                active && '!border-lime/40 !bg-[#17221a]',
              )}
            >
              <div className="flex items-center justify-between">
                <Icon size={16} className={meta.color} />
                <span className="font-mono text-sm text-slate-200">{count}</span>
              </div>
              <p className="mt-3 text-xs font-semibold">{meta.label}</p>
              <p className="mt-1 text-[10px] text-slate-500">
                {t === 'episodic' ? 'Specific past events' :
                 t === 'semantic' ? 'Facts & relationships' :
                 t === 'procedural' ? 'How-to knowledge' :
                 'Safety constraints'}
              </p>
            </button>
          );
        })}
      </div>

      {/* Split panel */}
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[1fr_420px]">
        {/* ---------- Left: list ---------- */}
        <div className="card overflow-hidden flex flex-col max-h-[80vh]">
          {/* Filter bar */}
          <div className="flex flex-col gap-3 border-b border-line p-4 sm:flex-row sm:items-center sm:justify-between shrink-0">
            <div className="flex flex-wrap gap-1 rounded-lg bg-[#0d131b] p-1">
              {STATUS_TABS.map(s => (
                <button
                  key={s}
                  onClick={() => setStatusFilter(s)}
                  className={cx(
                    'rounded-md px-3 py-1.5 text-[11px] font-semibold transition-colors',
                    statusFilter === s ? 'bg-[#2a3542] text-white' : 'text-slate-500 hover:text-slate-300',
                  )}
                >
                  {s === 'All' ? 'All' : s}
                  {s === 'All' && <span className="ml-1.5 text-[9px] text-slate-500">{memories.length}</span>}
                </button>
              ))}
            </div>
            <SearchBox
              value={searchInput}
              onChange={setSearchInput}
              className="w-full sm:w-[240px]"
              placeholder="Search memories and entities..."
            />
          </div>

          {/* List body - Internal Scroll */}
          <div className="flex-1 overflow-y-auto">
            {list.loading && !list.data ? (
              <LoadingSpinner label="Loading memories…" />
            ) : list.error ? (
              <EmptyState
                icon={AlertTriangle}
                title="Couldn't load memories"
                description={list.error.message}
                action={<button className="btn-secondary" onClick={list.refetch}>Retry</button>}
              />
            ) : memories.length === 0 ? (
              <EmptyState
                icon={BrainCircuit}
                title={q || typeFilter !== 'All' || statusFilter !== 'All'
                  ? 'No memories match'
                  : 'No memories yet'}
                description={
                  q || typeFilter !== 'All' || statusFilter !== 'All'
                    ? 'Try another search or clear your filters.'
                    : 'Run an investigation and approve the fix — the agent will write a Memory after verification.'
                }
                action={
                  q || typeFilter !== 'All' || statusFilter !== 'All' ? (
                    <button
                      className="btn-secondary"
                      onClick={() => { setSearchInput(''); setTypeFilter('All'); setStatusFilter('All'); }}
                    >
                      Clear filters
                    </button>
                  ) : (
                    <button className="btn-primary" onClick={() => openModal('memory')} disabled={!canAct}>
                      <Plus size={13} /> Add memory
                    </button>
                  )
                }
              />
            ) : (
              <div className="divide-y divide-[#222b36]">
                {memories.map(m => {
                  const meta = TYPE_META[m.type];
                  const Icon = meta.icon;
                  const isSelected = selectedId === m.id;
                  return (
                    <button
                      key={m.id}
                      onClick={() => setSelectedId(m.id)}
                      className={cx(
                        'flex w-full gap-3 px-4 py-4 text-left transition-colors hover:bg-[#171f29] md:px-5',
                        isSelected && 'bg-[#19231d]',
                      )}
                    >
                      <div className={cx(
                        'mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg',
                        meta.tone === 'blue' && 'bg-sky-400/10',
                        meta.tone === 'purple' && 'bg-violet-400/10',
                        meta.tone === 'green' && 'bg-lime/10',
                        meta.tone === 'yellow' && 'bg-amber-400/10',
                        meta.color,
                      )}>
                        <Icon size={16} />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-mono text-[9px] text-slate-600">{m.id}</span>
                          <Badge tone={meta.tone}>{meta.label}</Badge>
                          <Badge tone={toneForStatus(m.status)}>{m.status}</Badge>
                        </div>
                        <p className="mt-1.5 text-xs font-semibold text-slate-200">{m.title}</p>
                        <p className="mt-1.5 line-clamp-2 text-[11px] leading-5 text-slate-500">{m.summary}</p>
                        <div className="mt-2 flex items-center gap-3 text-[10px] text-slate-600">
                          <span>{Math.round(m.confidence * 100)}% confidence</span>
                          <span>·</span>
                          <span>{m.uses} recall{m.uses === 1 ? '' : 's'}</span>
                          {m.updated_at && <><span>·</span><span>{relativeTime(m.updated_at)}</span></>}
                        </div>
                      </div>
                      <div className={cx('mt-2 shrink-0 transition-colors', isSelected ? 'text-lime' : 'text-slate-700')}>
                        <ArrowUpRight size={15} />
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          <div className="border-t border-line px-5 py-3 text-[10px] text-slate-600 bg-[#0b1016] shrink-0">
            Showing {memories.length} memor{memories.length === 1 ? 'y' : 'ies'}
            <span className="float-right flex items-center gap-1">
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-lime" /> Live
            </span>
          </div>
        </div>

        {/* ---------- Right: detail ---------- */}
        <div className="space-y-4 xl:sticky xl:top-24 max-h-[80vh] overflow-y-auto">
          {detail.loading && !detail.data ? (
            <div className="card">
              <LoadingSpinner label="Loading detail…" />
            </div>
          ) : !selected ? (
            <div className="card">
              <EmptyState
                icon={BrainCircuit}
                title="Select a memory"
                description="Choose a memory from the list to see its linked entities, fixes, and lifecycle."
              />
            </div>
          ) : (
            <MemoryDetailPanel
              memory={selected}
              canAct={canAct}
              userRole={user?.role || 'Viewer'}
              busyAction={busyAction}
              onVerify={onVerify}
              onPin={onPin}
              onDeprecate={onDeprecate}
              onDelete={onDelete}
              onCopyId={() => { navigator.clipboard.writeText(selected.id); notify('Memory ID copied'); }}
            />
          )}
        </div>
      </div>
    </>
  );
}

// ============================================================
// Detail panel
// ============================================================
function MemoryDetailPanel({
  memory,
  canAct,
  userRole,
  busyAction,
  onVerify,
  onPin,
  onDeprecate,
  onDelete,
  onCopyId,
}: {
  memory: MemoryDetail;
  canAct: boolean;
  userRole: string;
  busyAction: string | null;
  onVerify: () => void;
  onPin: () => void;
  onDeprecate: () => void;
  onDelete: () => void;
  onCopyId: () => void;
}) {
  const meta = TYPE_META[memory.type];
  const Icon = meta.icon;
  const confPct = Math.round(memory.confidence * 100);

  return (
    <>
      {/* Header card */}
      <div className="card p-5">
        <div className="mb-4 flex items-start justify-between">
          <div className={cx(
            'flex h-11 w-11 items-center justify-center rounded-xl',
            meta.tone === 'blue' && 'bg-sky-400/10',
            meta.tone === 'purple' && 'bg-violet-400/10',
            meta.tone === 'green' && 'bg-lime/10',
            meta.tone === 'yellow' && 'bg-amber-400/10',
            meta.color,
          )}>
            <Icon size={19} />
          </div>
          <button
            className="btn-ghost !p-2"
            onClick={onCopyId}
            title="Copy memory ID"
          >
            <Copy size={14} />
          </button>
        </div>

        <p className="font-mono text-[10px] text-slate-600">{memory.id}</p>
        <h2 className="mt-2 text-base font-semibold leading-6 text-slate-100">{memory.title}</h2>

        <div className="mt-3 flex flex-wrap gap-2">
          <Badge tone={meta.tone}>{meta.label}</Badge>
          <Badge tone={toneForStatus(memory.status)}>{memory.status}</Badge>
        </div>

        <p className="mt-4 text-[12px] leading-6 text-slate-400">{memory.summary}</p>
      </div>

      {/* Confidence & usage card */}
      <div className="card p-5">
        <SectionHeading title="Confidence" subtitle="How strongly the agent trusts this memory" />
        <div className="flex items-end justify-between">
          <span className="text-2xl font-semibold text-lime">{confPct}%</span>
          <span className="text-[10px] text-slate-500">
            {confPct >= 85 ? 'High' : confPct >= 60 ? 'Medium' : 'Low'} trust
          </span>
        </div>
        <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-[#28313d]">
          <div
            className={cx(
              'h-full rounded-full transition-all',
              confPct >= 85 ? 'bg-lime' : confPct >= 60 ? 'bg-amber-400' : 'bg-rose-400',
            )}
            style={{ width: `${Math.max(2, confPct)}%` }}
          />
        </div>

        <div className="mt-4 grid grid-cols-2 gap-3">
          <div className="rounded-lg bg-[#0e141c] p-3">
            <p className="text-[9px] uppercase tracking-widest text-slate-600">Uses</p>
            <p className="mt-1.5 text-sm font-semibold text-slate-100">{memory.uses}</p>
          </div>
          <div className="rounded-lg bg-[#0e141c] p-3">
            <p className="text-[9px] uppercase tracking-widest text-slate-600">Updated</p>
            <p className="mt-1.5 text-[11px] font-semibold text-slate-300">
              {relativeTime(memory.updated_at)}
            </p>
          </div>
        </div>

        {memory.source && (
          <div className="mt-3 rounded-lg border border-line bg-[#0e141c] p-3">
            <p className="text-[9px] uppercase tracking-widest text-slate-600">Source</p>
            {memory.source.startsWith('run-') ? (
              <Link
                to={`/runs/${memory.source}`}
                className="mt-1 inline-flex items-center gap-1 font-mono text-[10px] text-lime hover:underline"
              >
                {memory.source} <ArrowUpRight size={10} />
              </Link>
            ) : (
              <p className="mt-1 font-mono text-[10px] text-slate-400">{memory.source}</p>
            )}
          </div>
        )}

        {memory.created_at && (
          <p className="mt-3 text-[9px] text-slate-600">
            Created {formatDateTime(memory.created_at)}
          </p>
        )}
      </div>

      {/* Entities card */}
      {memory.entities.length > 0 && (
        <div className="card p-5">
          <SectionHeading
            title="Linked entities"
            subtitle={`${memory.entities.length} node${memory.entities.length === 1 ? '' : 's'} in the graph`}
          />
          <div className="flex flex-wrap gap-1.5">
            {memory.entities.map(e => {
              const route = entityRoute(e.id);
              const chip = (
                <span className={cx(
                  'inline-flex items-center gap-1.5 rounded-md border border-line bg-[#18212b] px-2 py-1.5 font-mono text-[10px] text-slate-300',
                  route && 'hover:border-lime/40 hover:text-lime',
                )}>
                  <Database size={10} className="text-slate-500" />
                  {e.id}
                  {route && <ArrowUpRight size={9} className="opacity-60" />}
                </span>
              );
              return route ? (
                <Link key={e.id} to={route}>{chip}</Link>
              ) : (
                <span key={e.id}>{chip}</span>
              );
            })}
          </div>
        </div>
      )}

      {/* Fixes card */}
      {memory.fixes.length > 0 && (
        <div className="card p-5">
          <SectionHeading
            title="Supporting fixes"
            subtitle="Fixes this memory recommends or vouches for"
          />
          <div className="space-y-2">
            {memory.fixes.map(f => (
              <div
                key={f.id}
                className="flex items-center gap-3 rounded-lg border border-line bg-[#0f151d] p-3"
              >
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-lime/10 text-lime">
                  <WandSparkles size={14} />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[11px] font-semibold text-slate-200">{f.title}</p>
                  <p className="mt-0.5 font-mono text-[9px] text-slate-600">{f.id} · {f.kind}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Lifecycle card */}
      <div className="card p-5">
        <SectionHeading title="Lifecycle" subtitle="Change the trust state of this memory" />

        {!canAct ? (
          <div className="flex items-start gap-2 rounded-lg border border-amber-400/20 bg-amber-400/5 p-3 text-[11px] leading-5 text-amber-200/80">
            <ShieldAlert size={14} className="mt-0.5 shrink-0" />
            <div>
              Your role is <span className="font-semibold text-amber-100">{userRole}</span> — you can
              view memories but cannot modify them.
            </div>
          </div>
        ) : (
          <div className="space-y-2">
            <div className="grid grid-cols-2 gap-2">
              <button
                className="btn-secondary !justify-start"
                onClick={onVerify}
                disabled={busyAction !== null || memory.status === 'verified' || memory.status === 'pinned'}
              >
                {busyAction === 'verify' ? <Loader2 size={13} className="animate-spin" /> : <BadgeCheck size={13} />}
                Verify
              </button>
              <button
                className="btn-secondary !justify-start"
                onClick={onPin}
                disabled={busyAction !== null || memory.status === 'pinned'}
              >
                {busyAction === 'pin' ? <Loader2 size={13} className="animate-spin" /> : <Pin size={13} />}
                Pin
              </button>
            </div>

            <button
              className="btn-secondary w-full !justify-start"
              onClick={onDeprecate}
              disabled={busyAction !== null || memory.status === 'deprecated'}
            >
              {busyAction === 'deprecate' ? <Loader2 size={13} className="animate-spin" /> : <AlertTriangle size={13} />}
              Deprecate
            </button>

            <button
              className="btn-secondary w-full !justify-start !border-rose-900/60 !text-rose-300 hover:!bg-rose-400/10"
              onClick={onDelete}
              disabled={busyAction !== null}
            >
              {busyAction === 'delete' ? <Loader2 size={13} className="animate-spin" /> : <Trash2 size={13} />}
              Delete memory
            </button>
          </div>
        )}
      </div>
    </>
  );
}