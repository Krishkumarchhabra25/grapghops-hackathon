import { useMemo } from 'react';
import { Link, useParams } from 'react-router-dom';
import {
  Activity, AlertTriangle, ArrowUpRight, BookOpen, Building2, CheckCircle2,
  ChevronRight, Clock3, Database, GitBranch, GitCommit, HeartPulse, Network,
  Server, Sparkles, TrendingUp, User, Users, Zap,
} from 'lucide-react';
import { Badge } from '../components/ui/Badge';
import { EmptyState } from '../components/ui/EmptyState';
import { LoadingSpinner } from '../components/ui/LoadingSpinner';
import { SectionHeading } from '../components/ui/SectionHeading';
import { useModal } from '../contexts/ModalContext';
import { useFetch } from '../lib/hooks';
import { servicesApi } from '../lib/api';
import { cx, formatDateTime, relativeTime, toneForSeverity, toneForStatus } from '../lib/utils';

type ServiceOwner = { id: string; name: string; kind: 'person' | 'team' };
type ServiceRunbook = { id: string; title: string };
type ServiceDependency = {
  id: string;
  type: string;
  name: string;
  version: string;
  kind: string;
  criticality: string;
};
type ServiceIncident = {
  id: string;
  title: string;
  severity: string;
  status: string;
  started_at?: number | null;
  resolved_at?: number | null;
};
type ServiceDeployment = {
  id: string;
  version: string;
  deployed_at?: number | null;
  deployed_by?: string | null;
  status?: string | null;
};

type ServiceDetail = {
  id: string;
  name: string;
  env: string;
  status: 'Healthy' | 'Warning' | 'Degraded';
  health?: number | null;
  latency_ms?: number | null;
  error_rate?: number | null;
  version?: string | null;
  repo?: string | null;
  description?: string | null;
  updated_at?: number | null;
  owners: ServiceOwner[];
  runbooks: ServiceRunbook[];
  dependencies: ServiceDependency[];
  recent_incidents: ServiceIncident[];
  recent_deployments: ServiceDeployment[];
};

const CRITICALITY_TONE: Record<string, 'red' | 'yellow' | 'blue' | 'neutral'> = {
  high: 'red',
  medium: 'yellow',
  low: 'blue',
};

export function ServiceDetailPage() {
  const { id = '' } = useParams<{ id: string }>();
  const { openModal } = useModal();

  const service = useFetch(
    () => servicesApi.get(id) as Promise<ServiceDetail>,
    [id],
  );

  const svc = service.data;

  // Split owners into people vs. teams for display
  const { people, teams } = useMemo(() => {
    const p: ServiceOwner[] = [];
    const t: ServiceOwner[] = [];
    for (const o of svc?.owners ?? []) {
      if (o.kind === 'person') p.push(o);
      else t.push(o);
    }
    return { people: p, teams: t };
  }, [svc?.owners]);

  // Group dependencies by kind for readability
  const depGroups = useMemo(() => {
    const groups = new Map<string, ServiceDependency[]>();
    for (const d of svc?.dependencies ?? []) {
      const key = d.kind || d.type.toLowerCase() || 'other';
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key)!.push(d);
    }
    return Array.from(groups.entries()).sort(([a], [b]) => a.localeCompare(b));
  }, [svc?.dependencies]);

  if (service.loading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <LoadingSpinner label="Loading service…" />
      </div>
    );
  }

  if (service.error || !svc) {
    return (
      <EmptyState
        icon={Server}
        title="Service not found"
        description={service.error?.message || `No service with id "${id}"`}
        action={<Link to="/services" className="btn-secondary">Back to services</Link>}
      />
    );
  }

  const healthPct = svc.health ?? 0;
  const errorPct = svc.error_rate != null ? svc.error_rate * 100 : null;

  return (
    <>
      {/* Breadcrumb */}
      <div className="mb-5 flex items-center gap-2 text-[11px] text-slate-500">
        <Link to="/services" className="hover:text-slate-300">Services</Link>
        <ChevronRight size={12} />
        <span className="font-mono">{svc.name}</span>
      </div>

      {/* Header */}
      <div className="mb-6 flex flex-col justify-between gap-4 xl:flex-row xl:items-start">
        <div className="max-w-3xl">
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <span className="font-mono text-xs text-slate-500">{svc.id}</span>
            <Badge tone={toneForStatus(svc.status)}>{svc.status}</Badge>
            {svc.env && <Badge>{svc.env}</Badge>}
            {svc.version && <Badge tone="blue">v{svc.version.replace(/^v/, '')}</Badge>}
          </div>
          <h1 className="text-[26px] font-semibold leading-tight tracking-[-.04em] md:text-[30px]">
            {svc.name}
          </h1>
          {svc.description && (
            <p className="mt-3 text-[13px] leading-6 text-slate-400">{svc.description}</p>
          )}
          <div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-2 text-[10px] text-slate-500">
            {svc.updated_at && (
              <span className="flex items-center gap-1.5">
                <Clock3 size={12} /> Updated {relativeTime(svc.updated_at)}
              </span>
            )}
            {svc.repo && (
              <span className="flex items-center gap-1.5">
                <GitBranch size={12} /> <span className="font-mono">{svc.repo}</span>
              </span>
            )}
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          <button
            className="btn-secondary"
            onClick={() => openModal('investigation')}
          >
            <Sparkles size={13} /> Investigate
          </button>
          <Link to={`/graph?center=${svc.id}`} className="btn-primary">
            <Network size={13} /> View in graph
          </Link>
        </div>
      </div>

      {/* Stat cards */}
      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <div className="card p-4">
          <div className="flex items-center gap-2 text-[10px] text-slate-500">
            <HeartPulse size={13} /> HEALTH
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <p className={cx(
              'text-2xl font-semibold',
              healthPct > 95 ? 'text-lime' : healthPct > 85 ? 'text-amber-300' : 'text-rose-300',
            )}>
              {svc.health != null ? `${healthPct}%` : '—'}
            </p>
            <span className="text-[10px] text-slate-500">
              {healthPct > 95 ? 'Excellent' : healthPct > 85 ? 'Acceptable' : 'At risk'}
            </span>
          </div>
        </div>

        <div className="card p-4">
          <div className="flex items-center gap-2 text-[10px] text-slate-500">
            <Activity size={13} /> P95 LATENCY
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <p className="font-mono text-2xl font-semibold text-slate-100">
              {svc.latency_ms != null ? Math.round(svc.latency_ms) : '—'}
            </p>
            <span className="text-[10px] text-slate-500">ms</span>
          </div>
        </div>

        <div className="card p-4">
          <div className="flex items-center gap-2 text-[10px] text-slate-500">
            <TrendingUp size={13} /> ERROR RATE
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <p className={cx(
              'font-mono text-2xl font-semibold',
              errorPct == null ? 'text-slate-100' : errorPct > 1 ? 'text-rose-300' : 'text-lime',
            )}>
              {errorPct != null ? errorPct.toFixed(2) : '—'}
            </p>
            <span className="text-[10px] text-slate-500">%</span>
          </div>
        </div>

        <div className="card p-4">
          <div className="flex items-center gap-2 text-[10px] text-slate-500">
            <GitCommit size={13} /> VERSION
          </div>
          <div className="mt-2">
            <p className="font-mono text-lg font-semibold text-slate-100">
              {svc.version || '—'}
            </p>
          </div>
        </div>
      </div>

      {/* Main grid */}
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[1.4fr_1fr]">
        {/* LEFT column */}
        <div className="space-y-4">
          {/* Dependencies */}
          <div className="card p-5">
            <SectionHeading
              title="Dependencies"
              subtitle={`${svc.dependencies.length} upstream node${svc.dependencies.length === 1 ? '' : 's'} this service calls`}
            />
            {svc.dependencies.length === 0 ? (
              <EmptyState
                icon={Database}
                title="No dependencies mapped"
                description="This service has no outgoing DEPENDS_ON edges yet."
              />
            ) : (
              <div className="space-y-4">
                {depGroups.map(([kind, items]) => (
                  <div key={kind}>
                    <p className="mb-2 text-[9px] font-bold uppercase tracking-widest text-slate-600">
                      {kind}
                    </p>
                    <div className="space-y-1.5">
                      {items.map(d => (
                        <div
                          key={d.id}
                          className="flex items-center gap-3 rounded-lg border border-line bg-[#0f151d] px-3 py-2"
                        >
                          <div className={cx(
                            'flex h-7 w-7 shrink-0 items-center justify-center rounded-md',
                            d.type === 'Service' ? 'bg-lime/10 text-lime' : 'bg-amber-400/10 text-amber-300',
                          )}>
                            {d.type === 'Service' ? <Server size={12} /> : <Database size={12} />}
                          </div>
                          <div className="min-w-0 flex-1">
                            {d.type === 'Service' ? (
                              <Link
                                to={`/services/${d.id}`}
                                className="text-[11px] font-semibold text-slate-200 hover:text-lime"
                              >
                                {d.name}
                              </Link>
                            ) : (
                              <p className="text-[11px] font-semibold text-slate-200">{d.name}</p>
                            )}
                            <p className="mt-0.5 font-mono text-[9px] text-slate-600">
                              {d.id}{d.version ? ` · v${d.version}` : ''}
                            </p>
                          </div>
                          <Badge tone={CRITICALITY_TONE[d.criticality] ?? 'neutral'}>
                            {d.criticality}
                          </Badge>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Recent incidents */}
          <div className="card p-5">
            <SectionHeading
              title="Recent incidents"
              subtitle="Incidents that affected this service"
              action={
                <Link to="/incidents" className="text-[10px] font-semibold text-lime hover:underline">
                  All incidents <ArrowUpRight size={10} className="inline" />
                </Link>
              }
            />
            {svc.recent_incidents.length === 0 ? (
              <EmptyState
                icon={CheckCircle2}
                title="No incidents on record"
                description="This service has never appeared in the incident stream."
              />
            ) : (
              <div className="space-y-1.5">
                {svc.recent_incidents.map(i => (
                  <Link
                    key={i.id}
                    to={`/incidents/${i.id}`}
                    className="flex items-center gap-3 rounded-lg border border-line bg-[#0f151d] px-3 py-2.5 hover:border-slate-600"
                  >
                    <div className={cx(
                      'flex h-8 w-8 shrink-0 items-center justify-center rounded-md',
                      i.severity === 'Critical' ? 'bg-rose-400/10 text-rose-300'
                        : i.severity === 'High' ? 'bg-amber-400/10 text-amber-300'
                        : 'bg-sky-400/10 text-sky-300',
                    )}>
                      <AlertTriangle size={14} />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-mono text-[9px] text-slate-600">{i.id}</span>
                        <Badge tone={toneForSeverity(i.severity)}>{i.severity}</Badge>
                      </div>
                      <p className="mt-1 truncate text-[11px] font-semibold text-slate-200">{i.title}</p>
                      <p className="mt-0.5 text-[10px] text-slate-500">
                        {i.status} · {relativeTime(i.started_at)}
                      </p>
                    </div>
                    <Badge tone={toneForStatus(i.status)}>{i.status}</Badge>
                  </Link>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* RIGHT column */}
        <div className="space-y-4">
          {/* Ownership */}
          <div className="card p-5">
            <SectionHeading title="Ownership" subtitle="Who is accountable for this service" />

            {people.length === 0 && teams.length === 0 ? (
              <EmptyState
                icon={Users}
                title="No owners mapped"
                description="No Person or Team has an OWNS edge to this service."
              />
            ) : (
              <div className="space-y-3">
                {people.map(p => (
                  <div key={p.id} className="flex items-center gap-3 rounded-lg border border-line bg-[#0f151d] p-3">
                    <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-violet-400/10 text-violet-300">
                      <User size={15} />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[11px] font-semibold text-slate-200">{p.name}</p>
                      <p className="mt-0.5 font-mono text-[9px] text-slate-600">{p.id}</p>
                    </div>
                    <Badge tone="purple">owner</Badge>
                  </div>
                ))}

                {teams.map(t => (
                  <div key={t.id} className="flex items-center gap-3 rounded-lg border border-line bg-[#0f151d] p-3">
                    <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-amber-400/10 text-amber-300">
                      <Building2 size={15} />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[11px] font-semibold text-slate-200">{t.name}</p>
                      <p className="mt-0.5 font-mono text-[9px] text-slate-600">{t.id}</p>
                    </div>
                    <Badge tone="yellow">team</Badge>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Runbooks */}
          <div className="card p-5">
            <SectionHeading
              title="Runbooks"
              subtitle="Documents describing how to operate this service"
            />
            {svc.runbooks.length === 0 ? (
              <EmptyState
                icon={BookOpen}
                title="No runbooks"
                description="No Document has a DESCRIBES edge to this service."
              />
            ) : (
              <div className="space-y-1.5">
                {svc.runbooks.map(r => (
                  <Link
                    key={r.id}
                    to="/knowledge"
                    className="flex items-center gap-3 rounded-lg border border-line bg-[#0f151d] px-3 py-2.5 hover:border-lime/40"
                  >
                    <div className="flex h-8 w-8 items-center justify-center rounded-md bg-sky-400/10 text-sky-300">
                      <BookOpen size={13} />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[11px] font-semibold text-slate-200">{r.title}</p>
                      <p className="mt-0.5 font-mono text-[9px] text-slate-600">{r.id}</p>
                    </div>
                    <ArrowUpRight size={12} className="text-slate-600" />
                  </Link>
                ))}
              </div>
            )}
          </div>

          {/* Recent deployments */}
          <div className="card p-5">
            <SectionHeading
              title="Recent deployments"
              subtitle="CHANGED or BUMPED events touching this service"
            />
            {svc.recent_deployments.length === 0 ? (
              <EmptyState
                icon={GitCommit}
                title="No deployments"
                description="No Deployment node references this service yet."
              />
            ) : (
              <div className="space-y-1.5">
                {svc.recent_deployments.map(d => (
                  <div
                    key={d.id}
                    className="flex items-center gap-3 rounded-lg border border-line bg-[#0f151d] px-3 py-2.5"
                  >
                    <div className="flex h-8 w-8 items-center justify-center rounded-md bg-violet-400/10 text-violet-300">
                      <GitCommit size={13} />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[11px] font-semibold text-slate-200">
                        {d.version || d.id}
                      </p>
                      <p className="mt-0.5 text-[9px] text-slate-600">
                        {formatDateTime(d.deployed_at)}
                        {d.deployed_by ? ` · ${d.deployed_by}` : ''}
                      </p>
                    </div>
                    {d.status && <Badge tone={toneForStatus(d.status)}>{d.status}</Badge>}
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Quick actions */}
          <div className="card p-5">
            <SectionHeading title="Actions" />
            <div className="space-y-2">
              <Link to={`/graph?center=${svc.id}`} className="btn-secondary w-full !justify-start">
                <Network size={13} /> Explore in graph
              </Link>
              <button
                className="btn-secondary w-full !justify-start"
                onClick={() => openModal('investigation')}
              >
                <Sparkles size={13} /> Start investigation
              </button>
              <Link to="/knowledge" className="btn-secondary w-full !justify-start">
                <BookOpen size={13} /> Open knowledge base
              </Link>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}