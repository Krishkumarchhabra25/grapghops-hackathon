import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import {
  AlertTriangle, ArrowUpRight, BrainCircuit, Check, ChevronRight, Clock3,
  FileSearch, GitCommit, History, Loader2, Network, RefreshCw, Server,
  Sparkles, WandSparkles,
} from 'lucide-react';
import { Badge } from '../components/ui/Badge';
import { EmptyState } from '../components/ui/EmptyState';
import { LoadingSpinner } from '../components/ui/LoadingSpinner';
import { SectionHeading } from '../components/ui/SectionHeading';
import { useToast } from '../contexts/ToastContext';
import { useFetch } from '../lib/hooks';
import { incidentsApi, investigationsApi } from '../lib/api';
import { cx, formatClock, relativeTime, toneForSeverity, toneForStatus } from '../lib/utils';

type RelatedIncident = {
  incident: string;
  title: string;
  status: string;
  signature?: string;
  fixes: string[];
};

type Finding = {
  id: string;
  kind: string;
  claim: string;
  confidence?: number;
  verification: string;
};

type IncidentDetail = {
  id: string;
  title: string;
  severity: string;
  status: string;
  summary?: string;
  impact?: string;
  started_at?: number;
  resolved_at?: number;
  root_cause?: string;
  updated_at?: number;
  services: string[];
  related: RelatedIncident[];
  findings: Finding[];
  run_ids: string[];
};

type Tab = 'Evidence' | 'Related' | 'Timeline';

export function IncidentDetailPage() {
  const { id = '' } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { notify } = useToast();

  const detail = useFetch(
    () => incidentsApi.get(id) as Promise<IncidentDetail>,
    [id],
  );

  const [tab, setTab] = useState<Tab>('Evidence');
  const [starting, setStarting] = useState(false);

  const inc = detail.data;

  const startInvestigation = async () => {
    if (!inc || starting) return;
    setStarting(true);
    try {
      const res = await investigationsApi.start({
        title: `Investigate ${inc.id}: ${inc.title}`,
        incident_id: inc.id,
      });
      notify(`Investigation started (${res.run_id})`);
      // Route to the run detail page — stub today, real page next.
      navigate(`/runs/${res.run_id}`);
    } catch (e: any) {
      notify(e?.message || 'Failed to start investigation', 'error');
    } finally {
      setStarting(false);
    }
  };

  // ---------- loading / error / not found ----------
  if (detail.loading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <LoadingSpinner label="Loading incident…" />
      </div>
    );
  }

  if (detail.error || !inc) {
    return (
      <EmptyState
        icon={AlertTriangle}
        title="Incident not found"
        description={detail.error?.message || `No incident with id "${id}"`}
        action={
          <Link to="/incidents" className="btn-secondary">
            Back to incidents
          </Link>
        }
      />
    );
  }

  const isResolved = inc.status === 'Resolved' || inc.status === 'resolved';
  const hypothesis = inc.findings.find(f => f.kind === 'hypothesis');

  return (
    <>
      {/* Breadcrumb */}
      <div className="mb-5 flex items-center gap-2 text-[11px] text-slate-500">
        <Link to="/incidents" className="hover:text-slate-300">Incidents</Link>
        <ChevronRight size={12} />
        <span className="font-mono text-slate-400">{inc.id}</span>
      </div>

      {/* Header */}
      <div className="mb-6 flex flex-col justify-between gap-4 xl:flex-row xl:items-start">
        <div className="max-w-3xl">
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <span className="font-mono text-xs text-slate-500">{inc.id}</span>
            <Badge tone={toneForSeverity(inc.severity)}>{inc.severity} severity</Badge>
            <Badge tone={toneForStatus(inc.status)}>{inc.status}</Badge>
          </div>
          <h1 className="text-[26px] font-semibold leading-tight tracking-[-.04em] md:text-[30px]">
            {inc.title}
          </h1>
          {inc.summary && (
            <p className="mt-3 text-[13px] leading-6 text-slate-400">{inc.summary}</p>
          )}
          <div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-2 text-[10px] text-slate-500">
            <span className="flex items-center gap-1.5">
              <Clock3 size={12} /> started {relativeTime(inc.started_at)}
            </span>
            {(inc.services ?? []).map(s => (
              <span key={s} className="flex items-center gap-1.5">
                <Server size={12} /> {s}
              </span>
            ))}
            {isResolved && inc.resolved_at && (
              <span className="flex items-center gap-1.5 text-lime">
                <Check size={12} /> resolved {relativeTime(inc.resolved_at)}
              </span>
            )}
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          <button className="btn-secondary" onClick={detail.refetch}>
            <RefreshCw size={13} /> Refresh
          </button>
          <button
            className="btn-primary"
            onClick={startInvestigation}
            disabled={starting}
          >
            {starting ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />}
            {starting ? 'Starting…' : 'Start investigation'}
          </button>
        </div>
      </div>

      {/* Stat cards */}
      <div className="mb-5 grid grid-cols-1 gap-3 sm:grid-cols-3">
        <div className="card p-4">
          <div className="flex items-center gap-2 text-[10px] text-slate-500">
            <AlertTriangle size={13} /> CUSTOMER IMPACT
          </div>
          <div className="mt-3 text-sm font-semibold text-slate-200">
            {inc.impact || 'Not yet assessed'}
          </div>
        </div>
        <div className="card p-4">
          <div className="flex items-center gap-2 text-[10px] text-slate-500">
            <BrainCircuit size={13} /> ROOT CAUSE
          </div>
          <div className="mt-3 text-sm font-semibold text-slate-200">
            {inc.root_cause || hypothesis?.claim || 'Under investigation'}
          </div>
          {hypothesis?.confidence != null && (
            <div className="mt-2 text-[10px] text-slate-500">
              {Math.round(hypothesis.confidence * 100)}% confidence from linked evidence
            </div>
          )}
        </div>
        <div className="card p-4">
          <div className="flex items-center gap-2 text-[10px] text-slate-500">
            <FileSearch size={13} /> GRAPH CONTEXT
          </div>
          <div className="mt-3 flex items-baseline gap-2">
            <span className="text-lg font-semibold">{inc.related.length + inc.findings.length}</span>
            <span className="text-[11px] text-slate-500">linked entities</span>
          </div>
          <div className="mt-2 flex flex-wrap gap-1">
            {inc.services.slice(0, 1).map(s => <Badge key={s} tone="blue">Service</Badge>)}
            {inc.findings.length > 0 && <Badge tone="purple">{inc.findings.length} findings</Badge>}
            {inc.run_ids.length > 0 && <Badge tone="green">{inc.run_ids.length} run{inc.run_ids.length > 1 ? 's' : ''}</Badge>}
          </div>
        </div>
      </div>

      {/* Main grid */}
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[1.35fr_1fr]">
        {/* Left: tabs */}
        <div className="card overflow-hidden">
          <div className="flex gap-5 border-b border-line px-5">
            {(['Evidence', 'Related', 'Timeline'] as Tab[]).map(t => (
              <button
                key={t}
                onClick={() => setTab(t)}
                className={cx(
                  'border-b-2 py-3.5 text-xs font-semibold transition-colors',
                  tab === t ? 'border-lime text-lime' : 'border-transparent text-slate-500 hover:text-slate-300',
                )}
              >
                {t}
              </button>
            ))}
          </div>

          {tab === 'Evidence' && (
            <div className="p-5">
              <SectionHeading
                title="Investigation evidence"
                subtitle="Facts and hypotheses linked to this incident"
                action={hypothesis?.confidence != null ? (
                  <Badge tone="purple">{Math.round(hypothesis.confidence * 100)}% confidence</Badge>
                ) : undefined}
              />

              {inc.findings.length === 0 ? (
                <EmptyState
                  icon={FileSearch}
                  title="No findings yet"
                  description="Start an investigation to gather evidence from the graph."
                  action={
                    <button className="btn-primary" onClick={startInvestigation} disabled={starting}>
                      <Sparkles size={13} /> Start investigation
                    </button>
                  }
                />
              ) : (
                <div className="space-y-3">
                  {inc.findings.map(f => (
                    <div key={f.id} className="rounded-xl border border-line bg-[#0f151d] p-3.5">
                      <div className="flex items-start gap-3">
                        <div className={cx(
                          'flex h-8 w-8 shrink-0 items-center justify-center rounded-lg',
                          f.kind === 'hypothesis' ? 'bg-violet-400/10 text-violet-300'
                            : 'bg-sky-400/10 text-sky-300',
                        )}>
                          {f.kind === 'hypothesis' ? <WandSparkles size={15} /> : <Network size={15} />}
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <p className="text-xs font-semibold">
                              {f.kind === 'hypothesis' ? 'Hypothesis' : 'Fact'}
                            </p>
                            <Badge tone={f.verification === 'unverified_hypothesis' ? 'yellow' : 'green'}>
                              {f.verification === 'unverified_hypothesis' ? 'Unverified' : 'Retrieved'}
                            </Badge>
                          </div>
                          <p className="mt-2 text-[11px] leading-5 text-slate-400">{f.claim}</p>
                          {f.confidence != null && (
                            <p className="mt-2 text-[10px] text-slate-500">
                              Confidence: {Math.round(f.confidence * 100)}%
                            </p>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {tab === 'Related' && (
            <div className="p-5">
              <SectionHeading
                title="Related incidents"
                subtitle="Incidents that share the same error signature"
              />
              {inc.related.length === 0 ? (
                <EmptyState
                  icon={History}
                  title="No related incidents"
                  description="Nothing in the graph shares this incident's error signature."
                />
              ) : (
                <div className="space-y-3">
                  {inc.related.map(r => (
                    <Link
                      key={r.incident}
                      to={`/incidents/${r.incident}`}
                      className="flex items-center gap-3 rounded-xl border border-line bg-[#0f151d] p-3.5 hover:border-slate-600"
                    >
                      <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#202a35] text-slate-400">
                        <History size={14} />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-mono text-[10px] text-slate-500">{r.incident}</span>
                          <Badge tone={toneForStatus(r.status)}>{r.status}</Badge>
                        </div>
                        <p className="mt-1 truncate text-xs font-semibold text-slate-200">{r.title}</p>
                        {r.fixes.length > 0 && (
                          <p className="mt-1 text-[10px] text-slate-500">
                            Fix applied: {r.fixes[0]}
                          </p>
                        )}
                      </div>
                      <ArrowUpRight size={13} className="text-slate-600" />
                    </Link>
                  ))}
                </div>
              )}
            </div>
          )}

          {tab === 'Timeline' && (
            <div className="space-y-4 p-5">
              {inc.started_at && (
                <div className="flex gap-3">
                  <div className="w-16 shrink-0 pt-0.5 font-mono text-[10px] text-slate-600">
                    {formatClock(inc.started_at)}
                  </div>
                  <div className="relative flex-1 border-l border-line pb-2 pl-4">
                    <span className="absolute -left-[4px] top-1 h-2 w-2 rounded-full bg-rose-400" />
                    <p className="text-xs font-semibold">Incident started</p>
                    <p className="mt-1 text-[11px] leading-5 text-slate-500">
                      {inc.title}
                    </p>
                  </div>
                </div>
              )}
              {inc.run_ids.map(runId => (
                <div key={runId} className="flex gap-3">
                  <div className="w-16 shrink-0 pt-0.5 font-mono text-[10px] text-slate-600">run</div>
                  <div className="relative flex-1 border-l border-line pb-2 pl-4">
                    <span className="absolute -left-[4px] top-1 h-2 w-2 rounded-full bg-violet-300" />
                    <p className="text-xs font-semibold">Investigation</p>
                    <Link to={`/runs/${runId}`} className="mt-1 inline-flex items-center gap-1 font-mono text-[10px] text-lime hover:underline">
                      {runId} <ArrowUpRight size={10} />
                    </Link>
                  </div>
                </div>
              ))}
              {inc.resolved_at && (
                <div className="flex gap-3">
                  <div className="w-16 shrink-0 pt-0.5 font-mono text-[10px] text-slate-600">
                    {formatClock(inc.resolved_at)}
                  </div>
                  <div className="relative flex-1 border-l border-line pb-2 pl-4">
                    <span className="absolute -left-[4px] top-1 h-2 w-2 rounded-full bg-lime" />
                    <p className="text-xs font-semibold text-lime">Incident resolved</p>
                    {inc.root_cause && (
                      <p className="mt-1 text-[11px] leading-5 text-slate-500">{inc.root_cause}</p>
                    )}
                  </div>
                </div>
              )}
              {!inc.started_at && inc.run_ids.length === 0 && !inc.resolved_at && (
                <EmptyState icon={Clock3} title="No events yet" description="Nothing has happened on this incident." />
              )}
            </div>
          )}
        </div>

        {/* Right: side panel */}
        <div className="space-y-4">
          <div className="card p-5">
            <SectionHeading title="Suggested recovery" subtitle="Based on verified past resolutions" />
            {isResolved ? (
              <div className="rounded-xl border border-[#2c4930] bg-[#15231a] p-4">
                <div className="mb-3 flex items-center gap-2">
                  <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-lime/10 text-lime">
                    <Check size={16} />
                  </div>
                  <div>
                    <p className="text-xs font-semibold text-slate-100">Incident resolved</p>
                    <p className="mt-1 text-[10px] text-lime">Verified outcome on record</p>
                  </div>
                </div>
                {inc.root_cause && (
                  <p className="text-[11px] leading-5 text-slate-400">{inc.root_cause}</p>
                )}
              </div>
            ) : (
              <div className="rounded-xl border border-[#2c4930] bg-[#15231a] p-4">
                <div className="mb-3 flex items-center gap-2">
                  <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-lime/10 text-lime">
                    <WandSparkles size={16} />
                  </div>
                  <div>
                    <p className="text-xs font-semibold text-slate-100">Let the agent investigate</p>
                    <p className="mt-1 text-[10px] text-slate-500">The graph has the context you need</p>
                  </div>
                </div>
                <p className="text-[11px] leading-5 text-slate-400">
                  The investigator will traverse dependencies, retrieve prior fixes, and propose a
                  rollback — pending your approval.
                </p>
                <button
                  onClick={startInvestigation}
                  disabled={starting}
                  className="btn-primary mt-4 w-full"
                >
                  {starting ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />}
                  {starting ? 'Starting…' : 'Start investigation'}
                </button>
              </div>
            )}
          </div>

          <div className="card p-5">
            <SectionHeading title="Affected services" />
            {inc.services.length === 0 ? (
              <p className="text-xs text-slate-500">No services linked.</p>
            ) : (
              <div className="space-y-2">
                {inc.services.map(s => (
                  <Link
                    key={s}
                    to={`/services/${s}`}
                    className="flex items-center gap-3 rounded-lg py-2 hover:bg-[#171f29]"
                  >
                    <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#202a35] text-slate-400">
                      <Server size={14} />
                    </div>
                    <span className="flex-1 truncate font-mono text-[11px] text-slate-300">{s}</span>
                    <ArrowUpRight size={12} className="text-slate-600" />
                  </Link>
                ))}
              </div>
            )}
          </div>

          <div className="card p-5">
            <SectionHeading title="Recent investigations" />
            {inc.run_ids.length === 0 ? (
              <p className="text-xs text-slate-500">No runs yet.</p>
            ) : (
              <div className="space-y-2">
                {inc.run_ids.map(runId => (
                  <Link
                    key={runId}
                    to={`/runs/${runId}`}
                    className="flex items-center gap-3 rounded-lg py-2 hover:bg-[#171f29]"
                  >
                    <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-violet-400/10 text-violet-300">
                      <GitCommit size={14} />
                    </div>
                    <span className="flex-1 truncate font-mono text-[11px] text-slate-300">{runId}</span>
                    <ArrowUpRight size={12} className="text-slate-600" />
                  </Link>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  );
}