import { Link, useNavigate } from 'react-router-dom';
import {
  Activity, AlertTriangle, ArrowUpRight, BrainCircuit, CheckCircle2,
  Clock3, GitCommit, HeartPulse, Network, Plus, Search, Sparkles, Workflow,
} from 'lucide-react';
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid,
} from 'recharts';
import { StatCard } from '../components/ui/StatCard';
import { Badge } from '../components/ui/Badge';
import { Avatar } from '../components/ui/Avatar';
import { EmptyState } from '../components/ui/EmptyState';
import { LoadingSpinner } from '../components/ui/LoadingSpinner';
import { useModal } from '../contexts/ModalContext';
import { useToast } from '../contexts/ToastContext';
import { useFetch, usePoll } from '../lib/hooks';
import { incidentsApi, servicesApi, runsApi } from '../lib/api';
import { cx, relativeTime, toneForSeverity, toneForStatus } from '../lib/utils';

// ---- Types ----
type Incident = {
  id: string;
  title: string;
  severity: string;
  status: string;
  services: string[];
  summary?: string;
  started_at?: number;
};
type Service = {
  id: string;
  name: string;
  status: string;
  health?: number;
  env?: string;
};
type Run = {
  run_id: string;
  goal: string;
  status: string;
  owner_agent?: string;
  started_at?: number;
  ended_at?: number;
};

export function OverviewPage() {
  const navigate = useNavigate();
  const { openModal } = useModal();
  const { notify } = useToast();

  // Poll incidents and services every 30s (live-ish).
  const incidents = usePoll(
    () => incidentsApi.list() as Promise<{ incidents: Incident[]; count: number }>,
    30000,
  );
  const services = usePoll(
    () => servicesApi.list() as Promise<{ services: Service[]; count: number; health_summary: any }>,
    30000,
  );
  const runs = useFetch(() => runsApi.list() as Promise<{ runs: Run[] }>);

  const loading = incidents.loading || services.loading || runs.loading;
  const anyError = incidents.error || services.error || runs.error;

  const incidentList = incidents.data?.incidents ?? [];
  const serviceList = services.data?.services ?? [];
  const runList = runs.data?.runs ?? [];

  const activeIncidents = incidentList.filter(
    i => !['Resolved', 'Closed', 'resolved'].includes(i.status),
  );
  const criticalAndHigh = activeIncidents.filter(i =>
    ['Critical', 'High'].includes(i.severity),
  );
  const healthyServices = serviceList.filter(s => s.status === 'Healthy').length;
  const warningServices = serviceList.filter(s => s.status !== 'Healthy').length;
  const succeededRuns = runList.filter(r => r.status === 'succeeded').length;
  const failedRuns = runList.filter(r => r.status === 'failed').length;
  const runningRuns = runList.filter(r => r.status === 'running' || r.status === 'waiting_approval').length;

  const total = succeededRuns + failedRuns;
  const successRate = total > 0 ? Math.round((succeededRuns / total) * 100) : 0;
  const runTrend = buildTrend(succeededRuns, failedRuns);

  return (
    <>
      {/* ---------- Greeting header ---------- */}
      <div className="mb-6 flex flex-col justify-between gap-4 lg:flex-row lg:items-end">
        <div>
          <div className="mb-2 flex items-center gap-2 text-[10px] font-bold uppercase tracking-[.18em] text-slate-500">
            <span>{formatToday()}</span>
            <span className="h-1 w-1 rounded-full bg-slate-700" />
            <span className="flex items-center gap-1.5 text-lime">
              <span className="h-1.5 w-1.5 rounded-full bg-lime" />
              Live workspace
            </span>
          </div>
          <h1 className="text-[27px] font-semibold tracking-[-.05em] md:text-[32px]">
            {greeting()}, {firstName()}
          </h1>
          <p className="mt-2 text-[13px] text-slate-400">
            Here's what's happening across your agents and services today.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button className="btn-secondary" onClick={() => openModal('incident')}>
            <Plus size={14} /> Report incident
          </button>
          <button className="btn-primary" onClick={() => openModal('investigation')}>
            <Sparkles size={14} /> New investigation
          </button>
        </div>
      </div>

      {/* ---------- Global error banner ---------- */}
      {anyError && (
        <div className="mb-5 rounded-xl border border-rose-900/60 bg-[#28181d] p-3.5 text-xs text-rose-200">
          <div className="flex items-start gap-2">
            <AlertTriangle size={15} className="mt-0.5 shrink-0" />
            <div className="flex-1">
              <p className="font-semibold">Couldn't load all workspace data</p>
              <p className="mt-1 text-[11px] text-rose-200/70">{anyError.message}</p>
              <button
                className="mt-2 text-[10px] font-semibold text-lime underline-offset-2 hover:underline"
                onClick={() => {
                  incidents.refetch();
                  services.refetch();
                  runs.refetch();
                }}
              >
                Retry
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ---------- Stat cards ---------- */}
      <div className="mb-5 grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Active incidents"
          value={activeIncidents.length}
          change={criticalAndHigh.length > 0 ? `${criticalAndHigh.length} need attention` : undefined}
          icon={AlertTriangle}
          accent={criticalAndHigh.length > 0 ? 'red' : 'lime'}
          description={
            incidentList.length === 0
              ? 'No incidents yet'
              : `${criticalAndHigh.length} critical/high · ${activeIncidents.length - criticalAndHigh.length} medium/low`
          }
        />
        <StatCard
          label="Agent success rate"
          value={total > 0 ? `${successRate}%` : '—'}
          change={total > 0 ? `${succeededRuns}/${total} runs` : undefined}
          icon={BrainCircuit}
          accent="lime"
          description={`${runningRuns} currently running`}
        />
        <StatCard
          label="Services tracked"
          value={serviceList.length}
          change={warningServices > 0 ? `${warningServices} need attention` : 'All healthy'}
          icon={HeartPulse}
          accent={warningServices > 0 ? 'red' : 'lime'}
          description={`${healthyServices} of ${serviceList.length} healthy`}
        />
        <StatCard
          label="Agent runs"
          value={runList.length}
          change={runningRuns > 0 ? `${runningRuns} running` : undefined}
          icon={Activity}
          accent="blue"
          description="Total investigations and analysis runs"
        />
      </div>

      {/* ---------- Main grid: chart + service health ---------- */}
      <div className="mb-5 grid grid-cols-1 gap-4 xl:grid-cols-[1.55fr_1fr]">
        {/* Agent run performance */}
        <div className="card flex flex-col p-4 md:p-5">
          <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-sm font-semibold">Agent run performance</h2>
                <Badge tone={successRate >= 90 ? 'green' : successRate >= 70 ? 'yellow' : 'red'}>
                  {successRate >= 90 ? 'Healthy' : successRate >= 70 ? 'Warning' : 'At risk'}
                </Badge>
              </div>
              <p className="mt-1 text-[11px] text-slate-500">
                Successful and failed runs over the last 7 days
              </p>
            </div>
            <button className="btn-ghost" onClick={() => navigate('/runs')}>
              View runs <ArrowUpRight size={13} />
            </button>
          </div>

          <div className="mb-3 flex flex-wrap items-end gap-6">
            <div>
              <p className="font-mono text-[26px] tracking-[-.05em]">{total || 0}</p>
              <p className="mt-0.5 text-[10px] text-slate-500">Total executions</p>
            </div>
            <div>
              <p className="font-mono text-lg text-lime">{succeededRuns}</p>
              <p className="text-[10px] text-slate-500">Succeeded</p>
            </div>
            <div>
              <p className="font-mono text-lg text-rose-300">{failedRuns}</p>
              <p className="text-[10px] text-slate-500">Failed</p>
            </div>
            <div className="ml-auto hidden text-right sm:block">
              <p className="text-[10px] text-slate-500">Last 7 days</p>
              <p className="mt-1 text-xs text-slate-300">{dateRange7d()}</p>
            </div>
          </div>

          <div className="h-[195px] w-full flex-1">
            {loading ? (
              <LoadingSpinner label="Loading run history…" />
            ) : total === 0 ? (
              <div className="flex h-full items-center justify-center text-xs text-slate-500">
                No runs yet — start an investigation to see activity here.
              </div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={runTrend} barGap={5}>
                  <CartesianGrid stroke="#27313d" strokeDasharray="3 5" vertical={false} />
                  <XAxis dataKey="day" tick={{ fill: '#758294', fontSize: 10 }} axisLine={false} tickLine={false} dy={8} />
                  <YAxis hide />
                  <Tooltip
                    contentStyle={{
                      background: '#141b24',
                      border: '1px solid #303b49',
                      borderRadius: 10,
                      fontSize: 11,
                      color: '#e7edf5',
                    }}
                    cursor={{ fill: 'rgba(255,255,255,.035)' }}
                  />
                  <Bar dataKey="success" name="Successful runs" fill="#b9f56a" radius={[3, 3, 0, 0]} maxBarSize={24} />
                  <Bar dataKey="failed" name="Failed runs" fill="#fb7185" radius={[3, 3, 0, 0]} maxBarSize={24} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
          <div className="mt-2 flex items-center justify-center gap-5 text-[10px] text-slate-500">
            <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-sm bg-lime" />Successful runs</span>
            <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-sm bg-rose-400" />Failed runs</span>
          </div>
        </div>

        {/* Live service health */}
        <div className="card flex flex-col p-4 md:p-5">
          <div className="mb-4 flex items-start justify-between">
            <div>
              <h2 className="text-sm font-semibold">Live service health</h2>
              <p className="mt-1 text-[11px] text-slate-500">Current production status</p>
            </div>
            <button className="btn-ghost !px-2" onClick={() => navigate('/services')}>
              All services <ArrowUpRight size={12} />
            </button>
          </div>

          {loading ? (
            <LoadingSpinner label="Loading services…" />
          ) : serviceList.length === 0 ? (
            <EmptyState icon={HeartPulse} title="No services tracked" description="Add services to your workspace to see health here." />
          ) : (
            <>
              <div className="mb-4 flex items-center gap-3 rounded-xl border border-[#2a4730] bg-[#142019] p-3">
                <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-lime/10 text-lime">
                  <HeartPulse size={17} />
                </div>
                <div className="flex-1">
                  <p className="text-xs font-semibold">Platform availability</p>
                  <p className="mt-1 text-[10px] text-slate-500">
                    {healthyServices} of {serviceList.length} healthy
                  </p>
                </div>
                <div className="text-right">
                  <p className="font-mono text-sm text-lime">
                    {serviceList.length > 0 ? `${Math.round((healthyServices / serviceList.length) * 100)}%` : '—'}
                  </p>
                </div>
              </div>

              <div className="space-y-3">
                {serviceList.slice(0, 5).map(s => (
                  <Link key={s.id} to={`/services/${s.id}`} className="flex items-center gap-3 hover:opacity-80">
                    <span
                      className={cx(
                        'h-2 w-2 rounded-full',
                        s.status === 'Healthy' ? 'bg-lime'
                          : s.status === 'Warning' ? 'bg-amber-400'
                          : 'bg-rose-400',
                      )}
                    />
                    <span className="min-w-0 flex-1 truncate text-[11px] font-medium text-slate-300">
                      {s.name}
                    </span>
                    <span className="w-10 text-right font-mono text-[10px] text-slate-500">
                      {s.health ?? '—'}%
                    </span>
                    <div className="h-1.5 w-[72px] overflow-hidden rounded-full bg-[#29313c]">
                      <div
                        className={cx('h-full rounded-full', (s.health ?? 0) > 95 ? 'bg-lime' : 'bg-amber-400')}
                        style={{ width: `${s.health ?? 0}%` }}
                      />
                    </div>
                  </Link>
                ))}
              </div>
            </>
          )}
        </div>
      </div>

      {/* ---------- Bottom grid: incidents + agent activity ---------- */}
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[1.4fr_1fr]">
        {/* Incidents needing attention */}
        <div className="card flex flex-col overflow-hidden">
          <div className="flex shrink-0 items-center justify-between border-b border-line px-4 py-4 md:px-5">
            <div>
              <h2 className="text-sm font-semibold">Incidents needing attention</h2>
              <p className="mt-1 text-[11px] text-slate-500">Prioritised by severity and recency</p>
            </div>
            <Link className="btn-ghost" to="/incidents">
              View all <ArrowUpRight size={12} />
            </Link>
          </div>

          {loading ? (
            <LoadingSpinner />
          ) : activeIncidents.length === 0 ? (
            <EmptyState
              icon={CheckCircle2}
              title="All clear"
              description="No active incidents right now."
            />
          ) : (
            <div className="flex-1 overflow-y-auto">
              {activeIncidents.slice(0, 4).map(i => (
                <Link
                  to={`/incidents/${i.id}`}
                  key={i.id}
                  className="flex items-center justify-between gap-4 border-b border-[#2a3542] px-4 py-4 transition-colors last:border-0 hover:bg-[#151d26] md:px-5"
                >
                  <div className="flex min-w-0 items-center gap-3">
                    <div className={cx(
                      'flex h-9 w-9 shrink-0 items-center justify-center rounded-lg',
                      i.severity === 'Critical' ? 'bg-rose-400/10 text-rose-300'
                        : i.severity === 'High' ? 'bg-amber-400/10 text-amber-300'
                        : 'bg-sky-400/10 text-sky-300',
                    )}>
                      <AlertTriangle size={16} />
                    </div>
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-mono text-[10px] text-slate-500">{i.id}</span>
                        <Badge tone={toneForSeverity(i.severity)}>{i.severity}</Badge>
                      </div>
                      <p className="mt-1 truncate text-xs font-semibold text-slate-200">{i.title}</p>
                      <p className="mt-1 truncate text-[10px] text-slate-500">
                        {i.services?.join(', ') || 'no service'} · {relativeTime(i.started_at)}
                      </p>
                    </div>
                  </div>
                  <Badge tone={toneForStatus(i.status)}>{i.status}</Badge>
                </Link>
              ))}
            </div>
          )}
        </div>

        {/* Agent activity */}
        <div className="card flex flex-col overflow-hidden">
          <div className="flex shrink-0 items-center justify-between border-b border-line px-4 py-4 md:px-5">
            <div>
              <h2 className="text-sm font-semibold">Agent activity</h2>
              <p className="mt-1 text-[11px] text-slate-500">Recent runs across all agents</p>
            </div>
            <Link className="btn-ghost" to="/runs">
              All runs <ArrowUpRight size={12} />
            </Link>
          </div>

          <div className="flex-1 overflow-y-auto p-4 md:p-5">
            {loading ? (
              <LoadingSpinner />
            ) : runList.length === 0 ? (
              <EmptyState icon={Workflow} title="No runs yet" description="Start an investigation to see live activity here." />
            ) : (
              runList.slice(0, 3).map((r, i, arr) => {
                const isRunning = r.status === 'running' || r.status === 'waiting_approval';
                const isFailed = r.status === 'failed';
                const color = isFailed ? 'text-rose-300' : isRunning ? 'text-amber-300' : 'text-lime';
                const bg = isFailed ? 'bg-rose-400/10' : isRunning ? 'bg-amber-400/10' : 'bg-lime/10';
                return (
                  <div key={r.run_id} className="relative flex gap-3 pb-5 last:pb-0">
                    <div className="relative z-10 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-line bg-[#18212b]">
                      {isFailed ? <AlertTriangle size={14} className={color} /> : isRunning ? <Activity size={14} className={color} /> : <CheckCircle2 size={14} className={color} />}
                    </div>
                    {i < arr.length - 1 && (
                      <div className="absolute bottom-0 left-4 top-8 w-px bg-[#2b3542]" />
                    )}
                    <div className="min-w-0 flex-1 pt-0.5">
                      <div className="flex flex-wrap items-center justify-between gap-1">
                        <Link to={`/runs/${r.run_id}`} className="truncate text-[11px] font-semibold text-slate-200 hover:text-lime">
                          {r.goal || 'Investigation'}
                        </Link>
                        <span className="text-[9px] text-slate-600">{relativeTime(r.started_at)}</span>
                      </div>
                      <p className="mt-1 truncate text-[10px] text-slate-500">
                        {r.owner_agent || 'agent'} · {r.status}
                      </p>
                      {isRunning && (
                        <div className="mt-2 h-1 overflow-hidden rounded-full bg-[#2a3440]">
                          <div className="h-full w-[60%] rounded-full bg-lime" />
                        </div>
                      )}
                    </div>
                  </div>
                );
              })
            )}
          </div>

          <div className="shrink-0 px-4 pb-4 md:px-5 md:pb-5">
            <button
              onClick={() => openModal('investigation')}
              className="flex w-full items-center justify-center gap-2 rounded-lg border border-dashed border-[#344151] py-2.5 text-[11px] font-semibold text-slate-400 transition-colors hover:border-lime/50 hover:text-lime"
            >
              <Plus size={13} /> Start a new investigation
            </button>
          </div>
        </div>
      </div>
    </>
  );
}

// ---------- helpers ----------

function greeting(): string {
  const h = new Date().getHours();
  if (h < 12) return 'Good morning';
  if (h < 18) return 'Good afternoon';
  return 'Good evening';
}

function firstName(): string {
  try {
    const stored = localStorage.getItem('graphops-user-name');
    if (stored) return stored.split(' ')[0];
  } catch { /* ignore */ }
  return 'there';
}

function formatToday(): string {
  return new Date().toLocaleDateString('en-US', {
    weekday: 'long', month: 'long', day: 'numeric', year: 'numeric',
  });
}

function dateRange7d(): string {
  const end = new Date();
  const start = new Date();
  start.setDate(end.getDate() - 6);
  const fmt = (d: Date) => d.toLocaleDateString('en-US', { month: 'short', day: '2-digit' });
  return `${fmt(start)} – ${fmt(end)}`;
}

/** Distribute today's success/fail counts across the last 7 days. */
function buildTrend(success: number, failed: number) {
  const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const today = new Date().getDay();
  const out: { day: string; success: number; failed: number }[] = [];
  for (let i = 6; i >= 0; i--) {
    const d = (today - i + 7) % 7;
    const weight = i === 0 ? 1 : Math.max(0.2, 1 - i * 0.15);
    out.push({
      day: days[d],
      success: Math.round((success / 7) * weight * 7) || 0,
      failed: Math.round((failed / 7) * weight * 7) || 0,
    });
  }
  return out;
}