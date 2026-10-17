import type { CSSProperties } from 'react';
import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import {
  Activity, AlertTriangle, ArrowUpRight, Check, CheckCircle2, ChevronRight,
  Clock3, Copy, Loader2, Network, RefreshCw, RotateCcw, Sparkles,
  ThumbsDown, ThumbsUp, WandSparkles, Workflow, XCircle, Zap,
} from 'lucide-react';
import { Badge } from '../components/ui/Badge';
import { EmptyState } from '../components/ui/EmptyState';
import { LoadingSpinner } from '../components/ui/LoadingSpinner';
import { SectionHeading } from '../components/ui/SectionHeading';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../contexts/ToastContext';
import { useFetch } from '../lib/hooks';
import { approvalsApi, runsApi } from '../lib/api';
import { useRunEvents, type RunEvent } from '../lib/sse';
import { cx, formatClock, relativeTime, toneForStatus } from '../lib/utils';

// ---------- Display-only JSON helpers (UI only, no logic/state) ----------

function toPretty(data: unknown): string {
  if (typeof data === 'string') {
    try {
      return JSON.stringify(JSON.parse(data), null, 2);
    } catch {
      return data;
    }
  }
  try {
    return JSON.stringify(data, null, 2);
  } catch {
    return String(data);
  }
}

const WRAP_STYLE: CSSProperties = {
  whiteSpace: 'pre-wrap',
  overflowWrap: 'anywhere',
  wordBreak: 'break-word',
  overflowX: 'hidden',
  maxWidth: '100%',
  minWidth: 0,
  margin: 0,
};

function JsonBlock({ data, className }: { data: unknown; className?: string }) {
  return (
    <pre className={className} style={WRAP_STYLE}>
      {toPretty(data)}
    </pre>
  );
}

// ---------- Types ----------
type RunDetail = {
  id: string;
  goal: string;
  status: string;
  owner_agent?: string;
  state: Record<string, any>;
  state_version: number;
  started_at?: number;
  ended_at?: number;
  tokens?: number;
  cost_usd?: number;
  events?: Array<{ seq: number; type: string; ts: number }>;
};

type ApprovalDetail = {
  id: string;
  status: string;
  run_id: string;
  requested_at?: number;
  decided_at?: number;
  decided_by?: string;
  reason?: string;
  action?: {
    id: string;
    kind: string;
    params: Record<string, any>;
    status: string;
    risk?: string;
    rollback_plan?: string;
    verification?: string;
  };
  fix?: { id: string; title: string; kind: string; steps: string[]; risk?: string };
  evidence_finding_ids: string[];
  memory_ids: string[];
  incident_id?: string;
};

const EVENT_ICONS: Record<string, { icon: typeof Activity; color: string; bg: string; label: string }> = {
  'run.started':              { icon: Sparkles,       color: 'text-lime',       bg: 'bg-lime/10',       label: 'Run started' },
  'tool.started':             { icon: Workflow,       color: 'text-sky-300',    bg: 'bg-sky-400/10',    label: 'Tool started' },
  'tool.completed':           { icon: Check,          color: 'text-sky-300',    bg: 'bg-sky-400/10',    label: 'Tool completed' },
  'graph.path_found':         { icon: Network,        color: 'text-violet-300', bg: 'bg-violet-400/10', label: 'Evidence path' },
  'memory.retrieved':         { icon: WandSparkles,   color: 'text-violet-300', bg: 'bg-violet-400/10', label: 'Memory retrieved' },
  'finding.created':          { icon: Sparkles,       color: 'text-amber-300',  bg: 'bg-amber-400/10',  label: 'Finding' },
  'action.proposed':          { icon: Zap,            color: 'text-amber-300',  bg: 'bg-amber-400/10',  label: 'Action proposed' },
  'approval.required':        { icon: AlertTriangle,  color: 'text-amber-300',  bg: 'bg-amber-400/10',  label: 'Awaiting approval' },
  'approval.decided':         { icon: Check,          color: 'text-lime',       bg: 'bg-lime/10',       label: 'Approval decided' },
  'action.executed':          { icon: Zap,            color: 'text-lime',       bg: 'bg-lime/10',       label: 'Action executed' },
  'verification.completed':   { icon: CheckCircle2,   color: 'text-lime',       bg: 'bg-lime/10',       label: 'Verified' },
  'memory.written':           { icon: WandSparkles,   color: 'text-violet-300', bg: 'bg-violet-400/10', label: 'Memory written' },
  'run.completed':            { icon: CheckCircle2,   color: 'text-lime',       bg: 'bg-lime/10',       label: 'Run completed' },
  'run.failed':               { icon: XCircle,        color: 'text-rose-300',   bg: 'bg-rose-400/10',   label: 'Run failed' },
  'run.cancelled':            { icon: XCircle,        color: 'text-rose-300',   bg: 'bg-rose-400/10',   label: 'Run cancelled' },
};

function eventMeta(name: string) {
  return EVENT_ICONS[name] || { icon: Activity, color: 'text-slate-400', bg: 'bg-slate-400/10', label: name };
}

const APPROVER_ROLES = ['Owner', 'Admin', 'Engineer'];

export function RunDetailPage() {
  const { id = '' } = useParams<{ id: string }>();
  const { notify } = useToast();
  const { user } = useAuth();

  const canAct = APPROVER_ROLES.includes(user?.role || '');

  const run = useFetch(() => runsApi.get(id) as Promise<RunDetail>, [id]);
  const [tab, setTab] = useState<'Trace' | 'Inputs' | 'Context'>('Trace');
  const [retrying, setRetrying] = useState(false);

  const { events, connected } = useRunEvents(id, { stopOnTerminal: false });

  const approvals = useFetch(
    async () => {
      const res = await approvalsApi.list('pending') as { approvals: Array<{ id: string; run_id: string }> };
      const match = res.approvals.find(a => a.run_id === id);
      if (!match) return null;
      return approvalsApi.get(match.id) as Promise<ApprovalDetail>;
    },
    [id],
  );

  // Refetch run detail when significant events occur (e.g. to update token/cost)
  useEffect(() => {
    const last = events[events.length - 1];
    if (!last) return;
    if (['tool.completed', 'approval.decided', 'action.executed', 'verification.completed',
         'memory.written', 'run.completed', 'run.failed'].includes(last.event)) {
      run.refetch();
    }
    if (['approval.required', 'approval.decided'].includes(last.event)) {
      approvals.refetch();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [events.length]);

  const detail = run.data;
  const pending = approvals.data;

  if (run.loading && !run.data) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <LoadingSpinner label="Loading run…" />
      </div>
    );
  }

  if (run.error || !detail) {
    return (
      <EmptyState
        icon={Workflow}
        title="Run not found"
        description={run.error?.message || `No run with id "${id}"`}
        action={<Link to="/runs" className="btn-secondary">Back to runs</Link>}
      />
    );
  }

  const isTerminal = ['succeeded', 'failed', 'cancelled'].includes(detail.status);
  const canRetry = ['failed', 'waiting_approval', 'cancelled'].includes(detail.status) && canAct;

  const retry = async () => {
    if (retrying) return;
    setRetrying(true);
    try {
      await runsApi.retry(detail.id);
      notify('Run resumed from its last checkpoint');
      run.refetch();
    } catch (e: any) {
      notify(e?.message || 'Retry failed', 'error');
    } finally {
      setRetrying(false);
    }
  };

  return (
    <>
      <div className="mb-5 flex items-center gap-2 text-[11px] text-slate-500">
        <Link to="/runs" className="hover:text-slate-300">Agent runs</Link>
        <ChevronRight size={12} />
        <span className="font-mono">{detail.id}</span>
      </div>

      <div className="mb-6 flex flex-col justify-between gap-4 xl:flex-row xl:items-start">
        <div className="max-w-3xl">
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <span className="font-mono text-xs text-slate-500">{detail.id}</span>
            <Badge tone={toneForStatus(detail.status)}>{detail.status}</Badge>
            {connected ? (
              <span className="flex items-center gap-1.5 rounded-full border border-[#28402d] bg-[#132018] px-2 py-0.5 text-[9px] font-semibold text-lime">
                <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-lime" /> LIVE
              </span>
            ) : (
              <span className="flex items-center gap-1.5 rounded-full border border-line bg-[#121821] px-2 py-0.5 text-[9px] font-semibold text-slate-500">
                <span className="h-1.5 w-1.5 rounded-full bg-slate-600" /> OFFLINE
              </span>
            )}
          </div>
          <h1 className="text-[26px] font-semibold leading-tight tracking-[-.04em] md:text-[30px]">
            {detail.goal || 'Investigation'}
          </h1>
          <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-2 text-[10px] text-slate-500">
            <span className="flex items-center gap-1.5"><Activity size={12} /> {detail.owner_agent || 'agent'}</span>
            <span className="flex items-center gap-1.5"><Clock3 size={12} /> started {relativeTime(detail.started_at)}</span>
            {detail.ended_at && (
              <span className="flex items-center gap-1.5"><CheckCircle2 size={12} /> ended {relativeTime(detail.ended_at)}</span>
            )}
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            className="btn-secondary"
            onClick={() => { navigator.clipboard.writeText(detail.id); notify('Run ID copied'); }}
          >
            <Copy size={13} /> Copy ID
          </button>
          {canRetry && (
            <button className="btn-primary" onClick={retry} disabled={retrying}>
              {retrying ? <Loader2 size={13} className="animate-spin" /> : <RotateCcw size={13} />}
              {retrying ? 'Resuming…' : 'Resume run'}
            </button>
          )}
        </div>
      </div>

      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <div className="card p-4">
          <p className="text-[10px] uppercase tracking-widest text-slate-500">Status</p>
          <p className="mt-2 text-lg font-semibold text-slate-100">{detail.status}</p>
        </div>
        <div className="card p-4">
          <p className="text-[10px] uppercase tracking-widest text-slate-500">State version</p>
          <p className="mt-2 text-lg font-semibold text-slate-100">{detail.state_version}</p>
        </div>
        <div className="card p-4">
          <p className="text-[10px] uppercase tracking-widest text-slate-500">Tokens</p>
          <p className="mt-2 text-lg font-semibold text-slate-100">{detail.tokens ?? 0}</p>
        </div>
        <div className="card p-4">
          <p className="text-[10px] uppercase tracking-widest text-slate-500">Cost</p>
          <p className="mt-2 font-mono text-lg font-semibold text-slate-100">
            ${(detail.cost_usd ?? 0).toFixed(4)}
          </p>
        </div>
      </div>

      {pending && (
        <PendingApprovalPanel
          approval={pending}
          canAct={canAct}
          userRole={user?.role || 'Viewer'}
          onDecision={() => {
            approvals.refetch();
            run.refetch();
          }}
        />
      )}

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)] items-start">
        <div className="card min-w-0 overflow-hidden flex flex-col max-h-[80vh]">
          <div className="flex gap-5 border-b border-line px-5 shrink-0">
            {(['Trace', 'Inputs', 'Context'] as const).map(t => (
              <button
                key={t}
                onClick={() => setTab(t)}
                className={cx(
                  'border-b-2 py-3.5 text-xs font-semibold transition-colors',
                  tab === t ? 'border-lime text-lime' : 'border-transparent text-slate-500 hover:text-slate-300',
                )}
              >
                {t === 'Inputs' ? 'Inputs & outputs' : t}
              </button>
            ))}
          </div>

          <div className="flex-1 overflow-y-auto p-5">
            {tab === 'Trace' && (
              <div className="min-w-0">
                <SectionHeading
                  title="Execution trace"
                  subtitle="Step-by-step agent activity, streamed live"
                  action={
                    <span className="font-mono text-[10px] text-slate-500">
                      {events.length} event{events.length === 1 ? '' : 's'}
                    </span>
                  }
                />
                {events.length === 0 ? (
                  <EmptyState
                    icon={Activity}
                    title={isTerminal ? 'No events captured' : 'Waiting for the first event…'}
                    description={
                      isTerminal
                        ? 'This run finished before the stream was opened.'
                        : 'The SSE stream will populate as soon as the agent acts.'
                    }
                  />
                ) : (
                  <EventTimeline events={events} />
                )}
              </div>
            )}

            {tab === 'Inputs' && (
              <div className="min-w-0 space-y-4">
                <div className="min-w-0">
                  <h3 className="mb-2 text-xs font-semibold">Run state</h3>
                  <JsonBlock
                    data={detail.state || {}}
                    className="w-full rounded-xl border border-line bg-[#0b1118] p-4 font-mono text-[10px] leading-5 text-sky-200"
                  />
                </div>
              </div>
            )}

            {tab === 'Context' && (
              <div className="min-w-0">
                <SectionHeading title="Graph context" subtitle="Nodes accessed by this run" />
                <div className="grid grid-cols-2 gap-3">
                  {(() => {
                    const s = detail.state || {};
                    const serviceIds: string[] = s.service_ids ?? [];
                    const findingIds: string[] = s.finding_ids ?? [];
                    const deploymentIds: string[] = (s.deployments ?? []).map((d: any) => d.deployment).filter(Boolean);
                    const memoryIds: string[] = (s.memories ?? []).map((m: any) => m.id).filter(Boolean);
                    return (
                      <>
                        {serviceIds.map(sid => <ContextItem key={sid} icon={Network} label="Service" value={sid} to={`/services/${sid}`} />)}
                        {deploymentIds.map(did => <ContextItem key={did} icon={RefreshCw} label="Deployment" value={did} />)}
                        {findingIds.slice(0, 6).map(fid => <ContextItem key={fid} icon={Sparkles} label="Finding" value={fid} />)}
                        {memoryIds.map(mid => <ContextItem key={mid} icon={WandSparkles} label="Memory" value={mid} to={`/memory`} />)}
                        {serviceIds.length + deploymentIds.length + findingIds.length + memoryIds.length === 0 && (
                          <p className="col-span-2 text-xs text-slate-500">No context captured yet.</p>
                        )}
                      </>
                    );
                  })()}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Right: side panel (Sticky) */}
        <div className="min-w-0 space-y-4 xl:sticky xl:top-24">
          <div className="card p-5">
            <SectionHeading title="Recent events" subtitle="Last 200 persisted checkpoints" />
            {(!detail.events || detail.events.length === 0) ? (
              <p className="text-xs text-slate-500">No events yet.</p>
            ) : (
              <div className="max-h-[280px] space-y-2 overflow-y-auto pr-1">
                {detail.events.slice(0, 20).map(ev => {
                  const meta = eventMeta(ev.type);
                  const Icon = meta.icon;
                  return (
                    <div key={`${ev.type}-${ev.seq}`} className="flex items-center gap-2 text-[10px]">
                      <span className={cx('flex h-6 w-6 shrink-0 items-center justify-center rounded-md', meta.bg, meta.color)}>
                        <Icon size={11} />
                      </span>
                      <span className="font-mono text-slate-500">#{ev.seq}</span>
                      <span className="flex-1 truncate text-slate-400">{meta.label}</span>
                      <span className="font-mono text-slate-600">{formatClock(ev.ts)}</span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          <div className="card p-5">
            <SectionHeading title="Run configuration" />
            <div className="space-y-2.5 text-[11px]">
              <Row label="Agent" value={detail.owner_agent || 'investigator'} />
              <Row label="Status" value={detail.status} />
              <Row label="State version" value={String(detail.state_version)} />
              <Row label="Started" value={relativeTime(detail.started_at)} />
              <Row label="Ended" value={detail.ended_at ? relativeTime(detail.ended_at) : '—'} />
            </div>
          </div>

          <div className="card p-5">
            <SectionHeading title="Usage" />
            <div className="space-y-3">
              <div>
                <div className="mb-1.5 flex justify-between text-[10px]">
                  <span className="text-slate-400">Tokens</span>
                  <span className="font-mono text-slate-300">{detail.tokens ? detail.tokens.toLocaleString() : 0}</span>
                </div>
              </div>
              <div>
                <div className="mb-1.5 flex justify-between text-[10px]">
                  <span className="text-slate-400">Cost</span>
                  <span className="font-mono text-lime">${(detail.cost_usd ?? 0).toFixed(4)}</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

function EventTimeline({ events }: { events: RunEvent[] }) {
  return (
    <div className="min-w-0 space-y-3">
      {events.map((ev, i) => {
        const meta = eventMeta(ev.event);
        const Icon = meta.icon;
        const last = i === events.length - 1;
        return (
          <div key={`${ev.event}-${ev.seq}-${i}`} className="flex min-w-0 gap-3">
            <div className="w-14 shrink-0 pt-1 text-right font-mono text-[9px] text-slate-600">
              {formatClock(ev.ts)}
            </div>
            <div className="relative min-w-0 flex-1 border-l border-line pb-2 pl-4 pr-1">
              <span className={cx(
                'absolute -left-[5px] top-1 h-2.5 w-2.5 rounded-full',
                last && 'animate-pulse',
                meta.color.replace('text-', 'bg-'),
              )} />
              <div className="min-w-0 overflow-hidden rounded-xl border border-line bg-[#0e141c] p-3 pr-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span className={cx('flex h-6 w-6 items-center justify-center rounded-md', meta.bg, meta.color)}>
                      <Icon size={12} />
                    </span>
                    <p className="text-xs font-semibold">{meta.label}</p>
                  </div>
                  <span className="font-mono text-[9px] text-slate-600">#{ev.seq}</span>
                </div>

                {ev.event === 'graph.path_found' && ev.data.path && (
                  <div className="mt-3 flex flex-wrap items-center gap-1.5">
                    {(ev.data.path as Array<{ label: string; id: string }>).map((n, idx) => (
                      <span key={`${n.id}-${idx}`} className="flex items-center gap-1.5">
                        <span className="rounded border border-line bg-[#18212b] px-2 py-1 font-mono text-[9px] text-slate-300">
                          {n.id}
                        </span>
                        {idx < ev.data.path.length - 1 && <span className="text-slate-600">→</span>}
                      </span>
                    ))}
                  </div>
                )}

                {ev.event === 'finding.created' && ev.data.claim && (
                  <div className="mt-2">
                    <p className="whitespace-pre-wrap break-words text-[11px] leading-5 text-slate-400">{ev.data.claim}</p>
                    {ev.data.confidence != null && (
                      <p className="mt-1 text-[10px] text-slate-500">
                        Confidence: {Math.round(ev.data.confidence * 100)}%
                      </p>
                    )}
                  </div>
                )}

                {ev.event === 'action.proposed' && ev.data.fix_id && (
                  <p className="mt-2 break-words font-mono text-[10px] text-slate-400">
                    fix: {ev.data.fix_id} · risk: {ev.data.risk ?? 'unknown'}
                  </p>
                )}

                {ev.event === 'memory.retrieved' && (
                  <p className="mt-2 text-[10px] text-slate-500">
                    {(ev.data.memory_ids as string[] | undefined)?.length ?? 0} memories ·{' '}
                    {(ev.data.fix_ids as string[] | undefined)?.length ?? 0} historical fixes
                  </p>
                )}

                {!['graph.path_found', 'finding.created', 'action.proposed', 'memory.retrieved'].includes(ev.event) &&
                  ev.data && Object.keys(ev.data).length > 2 && (
                    <JsonBlock
                      data={ev.data}
                      className="mt-2 w-full rounded bg-[#0b1118] px-3 py-2 font-mono text-[9px] leading-4 text-slate-500"
                    />
                  )}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function PendingApprovalPanel({
  approval,
  canAct,
  userRole,
  onDecision,
}: {
  approval: ApprovalDetail;
  canAct: boolean;
  userRole: string;
  onDecision: () => void;
}) {
  const { notify } = useToast();
  const [busy, setBusy] = useState<'approve' | 'reject' | null>(null);
  const [reason, setReason] = useState('');
  const [showReject, setShowReject] = useState(false);

  const decide = async (kind: 'approve' | 'reject') => {
    if (!canAct) {
      notify(`Your role (${userRole}) can't approve actions — ask an Engineer or Admin`, 'error');
      return;
    }
    if (busy) return;
    if (kind === 'reject' && reason.trim().length < 3) {
      notify('A reason is required to reject', 'error');
      return;
    }
    setBusy(kind);
    try {
      if (kind === 'approve') {
        await approvalsApi.approve(approval.id, reason || undefined);
        notify('Approved — resuming run');
      } else {
        await approvalsApi.reject(approval.id, reason);
        notify('Rejected — run marked as failed', 'error');
      }
      onDecision();
    } catch (e: any) {
      notify(e?.message || 'Decision failed', 'error');
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="mb-5 overflow-hidden rounded-2xl border border-[#4c4128] bg-gradient-to-br from-[#221e14] to-[#181a22]">
      <div className="flex items-start gap-3 border-b border-[#3a3428] px-5 py-4">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-amber-400/10 text-amber-300">
          <AlertTriangle size={18} />
        </div>
        <div className="flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-sm font-semibold text-amber-100">Approval required</h2>
            <span className="rounded-full border border-amber-400/30 bg-amber-400/10 px-2 py-0.5 text-[9px] font-semibold text-amber-200">
              {approval.id}
            </span>
          </div>
          <p className="mt-1 text-[11px] text-amber-100/70">
            The agent is paused until a human decides. Nothing runs automatically.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 p-5 md:grid-cols-2">
        <div>
          <p className="mb-2 text-[10px] font-bold uppercase tracking-widest text-slate-500">
            Proposed action
          </p>
          {approval.action ? (
            <div className="space-y-2 rounded-xl border border-line bg-[#0e141c] p-3">
              <Row label="Kind" value={approval.action.kind} />
              {approval.action.params?.service && (
                <Row label="Service" value={String(approval.action.params.service)} />
              )}
              {approval.action.params?.dependency && (
                <Row label="Dependency" value={String(approval.action.params.dependency)} />
              )}
              {approval.action.params?.fix_id && (
                <Row label="Fix" value={String(approval.action.params.fix_id)} />
              )}
              {approval.action.risk && (
                <Row
                  label="Risk"
                  value={
                    <span className={cx(
                      'font-semibold',
                      approval.action.risk === 'high' ? 'text-rose-300'
                        : approval.action.risk === 'medium' ? 'text-amber-300'
                        : 'text-lime',
                    )}>
                      {approval.action.risk}
                    </span>
                  }
                />
              )}
              {approval.action.rollback_plan && (
                <Row label="Rollback" value={approval.action.rollback_plan} />
              )}
              {approval.action.verification && (
                <Row label="Verify with" value={approval.action.verification} />
              )}
            </div>
          ) : (
            <p className="text-xs text-slate-500">No action details available.</p>
          )}
        </div>

        <div>
          <p className="mb-2 text-[10px] font-bold uppercase tracking-widest text-slate-500">
            Linked fix & evidence
          </p>
          <div className="space-y-2 rounded-xl border border-line bg-[#0e141c] p-3">
            {approval.fix ? (
              <>
                <Row label="Fix" value={approval.fix.title} />
                <Row label="Kind" value={approval.fix.kind} />
                {approval.fix.steps.length > 0 && (
                  <div className="mt-2">
                    <p className="mb-1 text-[10px] text-slate-500">Steps</p>
                    <ol className="space-y-1 text-[10px] leading-5 text-slate-400">
                      {approval.fix.steps.map((s, i) => (
                        <li key={i} className="flex gap-2">
                          <span className="font-mono text-lime">{String(i + 1).padStart(2, '0')}</span>
                          <span className="break-words">{s}</span>
                        </li>
                      ))}
                    </ol>
                  </div>
                )}
              </>
            ) : (
              <p className="text-xs text-slate-500">No fix linked.</p>
            )}
            {approval.evidence_finding_ids.length > 0 && (
              <div className="mt-3 border-t border-line pt-3">
                <p className="mb-1 text-[10px] text-slate-500">Evidence findings</p>
                <div className="flex flex-wrap gap-1">
                  {approval.evidence_finding_ids.map(fid => (
                    <span key={fid} className="rounded bg-[#1e2834] px-1.5 py-1 font-mono text-[9px] text-slate-400">
                      {fid}
                    </span>
                  ))}
                </div>
              </div>
            )}
            {approval.memory_ids.length > 0 && (
              <div className="mt-3 border-t border-line pt-3">
                <p className="mb-1 text-[10px] text-slate-500">Citing memories</p>
                <div className="flex flex-wrap gap-1">
                  {approval.memory_ids.map(mid => (
                    <span key={mid} className="rounded bg-violet-400/10 px-1.5 py-1 font-mono text-[9px] text-violet-300">
                      {mid}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="border-t border-[#3a3428] bg-[#161a22] px-5 py-4">
        {!canAct ? (
          <div className="flex items-start gap-2 rounded-lg border border-amber-400/20 bg-amber-400/5 p-3 text-[11px] leading-5 text-amber-200/80">
            <AlertTriangle size={14} className="mt-0.5 shrink-0" />
            <div>
              Your role is <span className="font-semibold text-amber-100">{userRole}</span> — you can
              see this approval but cannot decide on it. Ask an <span className="font-semibold">Engineer</span>,
              <span className="font-semibold"> Admin</span>, or <span className="font-semibold">Owner</span> to
              approve or reject.
            </div>
          </div>
        ) : showReject ? (
          <div className="space-y-3">
            <label className="block">
              <span className="mb-1.5 block text-[10px] font-semibold text-slate-400">
                Reason for rejecting
              </span>
              <textarea
                className="input min-h-[70px] resize-y text-xs"
                placeholder="Why are you rejecting this action?"
                value={reason}
                onChange={e => setReason(e.target.value)}
              />
            </label>
            <div className="flex justify-end gap-2">
              <button className="btn-secondary" onClick={() => { setShowReject(false); setReason(''); }}>
                Cancel
              </button>
              <button
                className="btn-primary !bg-rose-500/20 !text-rose-200 hover:!bg-rose-500/30"
                onClick={() => decide('reject')}
                disabled={busy !== null}
              >
                {busy === 'reject' ? <Loader2 size={13} className="animate-spin" /> : <ThumbsDown size={13} />}
                Confirm rejection
              </button>
            </div>
          </div>
        ) : (
          <div className="flex flex-wrap justify-end gap-2">
            <button
              className="btn-secondary"
              onClick={() => setShowReject(true)}
              disabled={busy !== null}
            >
              <ThumbsDown size={13} /> Reject
            </button>
            <button
              className="btn-primary"
              onClick={() => decide('approve')}
              disabled={busy !== null}
            >
              {busy === 'approve' ? <Loader2 size={13} className="animate-spin" /> : <ThumbsUp size={13} />}
              Approve & resume
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-3 text-[11px]">
      <span className="text-slate-500">{label}</span>
      <span className="max-w-[60%] break-words text-right text-slate-300">{value}</span>
    </div>
  );
}

function ContextItem({
  icon: Icon, label, value, to,
}: { icon: typeof Activity; label: string; value: string; to?: string }) {
  const inner = (
    <div className="flex items-center gap-2 rounded-lg border border-line bg-[#0f151d] p-2.5">
      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-[#202a35] text-slate-400">
        <Icon size={12} />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-[9px] uppercase tracking-widest text-slate-600">{label}</p>
        <p className="mt-0.5 truncate font-mono text-[10px] text-slate-300">{value}</p>
      </div>
      {to && <ArrowUpRight size={11} className="text-slate-600" />}
    </div>
  );
  if (to) return <Link to={to} className="hover:opacity-80">{inner}</Link>;
  return inner;
}