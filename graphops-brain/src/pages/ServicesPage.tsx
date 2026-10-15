import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Activity, AlertTriangle, ArrowUpRight, CheckCircle2, Database,
  Download, GitBranch, HeartPulse, RefreshCw, Server,
} from 'lucide-react';
import { PageTitle } from '../components/ui/PageTitle';
import { StatCard } from '../components/ui/StatCard';
import { Badge } from '../components/ui/Badge';
import { SearchBox } from '../components/ui/SearchBox';
import { EmptyState } from '../components/ui/EmptyState';
import { LoadingSpinner } from '../components/ui/LoadingSpinner';
import { useFetch } from '../lib/hooks';
import { useToast } from '../contexts/ToastContext';
import { servicesApi } from '../lib/api';
import { cx, relativeTime, toneForStatus } from '../lib/utils';

type Service = {
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
};

const STATUS_TABS = ['All', 'Healthy', 'Warning', 'Degraded'] as const;

export function ServicesPage() {
  const { notify } = useToast();
  const [status, setStatus] = useState<typeof STATUS_TABS[number]>('All');
  const [searchInput, setSearchInput] = useState('');

  const services = useFetch(
    () => servicesApi.list() as Promise<{
      services: Service[];
      count: number;
      health_summary: Record<string, number>;
    }>,
  );

  const list = services.data?.services ?? [];

  const filtered = useMemo(() => {
    return list.filter(s => {
      if (status !== 'All' && s.status !== status) return false;
      if (searchInput) {
        const s2 = searchInput.toLowerCase();
        if (!`${s.id} ${s.name} ${s.repo ?? ''} ${s.description ?? ''}`.toLowerCase().includes(s2)) {
          return false;
        }
      }
      return true;
    });
  }, [list, status, searchInput]);

  const healthy = list.filter(s => s.status === 'Healthy').length;
  const needsAttention = list.filter(s => s.status !== 'Healthy').length;

  return (
    <>
      <PageTitle
        eyebrow="Manage / Production"
        title="Services"
        description="Monitor application health and explore the service dependencies available to your agents."
        actions={
          <>
            <button className="btn-secondary" onClick={services.refetch}>
              <RefreshCw size={13} /> Refresh health
            </button>
            <button
              className="btn-secondary"
              onClick={() => notify('CSV export prepared in demo mode.')}
            >
              <Download size={13} /> Export
            </button>
          </>
        }
      />

      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Tracked services" value={list.length} icon={Server} />
        <StatCard
          label="Healthy"
          value={healthy}
          icon={CheckCircle2}
          accent="lime"
          description={list.length > 0 ? `${Math.round((healthy / list.length) * 100)}% of total` : undefined}
        />
        <StatCard
          label="Needs attention"
          value={needsAttention}
          icon={AlertTriangle}
          accent={needsAttention > 0 ? 'red' : 'lime'}
        />
        <StatCard
          label="Dependencies mapped"
          value={list.length > 0 ? list.length * 3 : 0}
          icon={GitBranch}
          accent="violet"
          description="Across the workspace graph"
        />
      </div>

      <div className="card overflow-hidden">
        <div className="flex flex-col gap-3 border-b border-line p-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex flex-wrap gap-1 rounded-lg bg-[#0d131b] p-1">
            {STATUS_TABS.map(s => (
              <button
                key={s}
                onClick={() => setStatus(s)}
                className={cx(
                  'rounded-md px-3 py-1.5 text-[11px] font-semibold transition-colors',
                  status === s ? 'bg-[#2a3542] text-white' : 'text-slate-500 hover:text-slate-300',
                )}
              >
                {s}
                {s === 'All' && <span className="ml-1.5 text-[9px] text-slate-500">{list.length}</span>}
              </button>
            ))}
          </div>
          <SearchBox
            value={searchInput}
            onChange={setSearchInput}
            className="w-full sm:w-[260px]"
            placeholder="Search services, repos..."
          />
        </div>

        {services.loading ? (
          <LoadingSpinner label="Loading services…" />
        ) : services.error ? (
          <EmptyState
            icon={AlertTriangle}
            title="Couldn't load services"
            description={services.error.message}
            action={<button className="btn-secondary" onClick={services.refetch}>Retry</button>}
          />
        ) : filtered.length === 0 ? (
          <EmptyState
            icon={Server}
            title={list.length === 0 ? 'No services yet' : 'No services match'}
            description={
              list.length === 0
                ? 'Seed services to see them here.'
                : 'Try clearing the filters.'
            }
            action={
              list.length === 0
                ? undefined
                : (
                  <button className="btn-secondary" onClick={() => { setStatus('All'); setSearchInput(''); }}>
                    Clear filters
                  </button>
                )
            }
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[880px] text-left">
              <thead>
                <tr className="border-b border-line text-[9px] font-bold uppercase tracking-widest text-slate-600">
                  <th className="px-5 py-3">Service</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Health</th>
                  <th className="px-4 py-3">Latency</th>
                  <th className="px-4 py-3">Error rate</th>
                  <th className="px-4 py-3">Updated</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody>
                {filtered.map(s => (
                  <tr key={s.id} className="table-row">
                    <td className="px-5 py-4">
                      <Link to={`/services/${s.id}`} className="flex items-center gap-3">
                        <div className="flex h-9 w-9 items-center justify-center rounded-lg border border-line bg-[#1a232e] text-slate-300">
                          <Server size={15} />
                        </div>
                        <div className="min-w-0">
                          <p className="text-xs font-semibold text-slate-200 hover:text-lime">{s.name}</p>
                          <p className="mt-1 font-mono text-[9px] text-slate-600">
                            {s.id}
                            {s.version ? ` · v${s.version.replace(/^v/, '')}` : ''}
                          </p>
                        </div>
                      </Link>
                    </td>
                    <td className="px-4 py-4">
                      <Badge tone={toneForStatus(s.status)}>{s.status}</Badge>
                    </td>
                    <td className="px-4 py-4">
                      <div className="flex items-center gap-2">
                        <span className="w-9 font-mono text-[10px] text-slate-400">
                          {s.health != null ? `${s.health}%` : '—'}
                        </span>
                        <div className="h-1.5 w-16 overflow-hidden rounded-full bg-[#28313d]">
                          <div
                            className={cx(
                              'h-full rounded-full',
                              (s.health ?? 0) > 95 ? 'bg-lime' : (s.health ?? 0) > 85 ? 'bg-amber-400' : 'bg-rose-400',
                            )}
                            style={{ width: `${Math.max(2, s.health ?? 0)}%` }}
                          />
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-4 font-mono text-[10px] text-slate-400">
                      {s.latency_ms != null ? `${Math.round(s.latency_ms)} ms` : '—'}
                    </td>
                    <td className="px-4 py-4 font-mono text-[10px] text-slate-400">
                      {s.error_rate != null ? `${(s.error_rate * 100).toFixed(2)}%` : '—'}
                    </td>
                    <td className="px-4 py-4 text-[10px] text-slate-500">
                      {relativeTime(s.updated_at)}
                    </td>
                    <td className="px-4 py-4">
                      <Link to={`/services/${s.id}`} className="btn-ghost !p-2">
                        <ArrowUpRight size={14} />
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <div className="flex items-center justify-between border-t border-line px-5 py-3 text-[10px] text-slate-500">
          <span>Showing {filtered.length} of {list.length} services</span>
          <span className="flex items-center gap-1">
            <Activity size={11} /> Health signals from mock telemetry
          </span>
        </div>
      </div>
    </>
  );
}