import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  AlertTriangle, AlertOctagon, ArrowUpRight, CheckCircle2, Plus,
  RefreshCw, Search,
} from 'lucide-react';
import { PageTitle } from '../components/ui/PageTitle';
import { StatCard } from '../components/ui/StatCard';
import { Badge } from '../components/ui/Badge';
import { SearchBox } from '../components/ui/SearchBox';
import { EmptyState } from '../components/ui/EmptyState';
import { LoadingSpinner } from '../components/ui/LoadingSpinner';
import { useModal } from '../contexts/ModalContext';
import { useFetch } from '../lib/hooks';
import { incidentsApi } from '../lib/api';
import { cx, relativeTime, toneForSeverity, toneForStatus } from '../lib/utils';

type Incident = {
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
};

const STATUS_TABS = ['All', 'Open', 'Investigating', 'Monitoring', 'Resolved'] as const;
const SEVERITIES = ['All', 'Critical', 'High', 'Medium', 'Low'] as const;

export function IncidentsPage() {
  const navigate = useNavigate();
  const { openModal } = useModal();

  const [status, setStatus] = useState<string>('All');
  const [severity, setSeverity] = useState<string>('All');
  const [q, setQ] = useState('');

  const incidents = useFetch(
    () => incidentsApi.list() as Promise<{ incidents: Incident[]; count: number }>,
  );

  const list = incidents.data?.incidents ?? [];

  const filtered = list.filter(i => {
    if (status !== 'All' && i.status !== status) return false;
    if (severity !== 'All' && i.severity !== severity) return false;
    if (q) {
      const needle = q.toLowerCase();
      const hay = `${i.id} ${i.title} ${i.summary ?? ''} ${(i.services ?? []).join(' ')}`.toLowerCase();
      if (!hay.includes(needle)) return false;
    }
    return true;
  });

  const active = list.filter(i => !['Resolved', 'resolved'].includes(i.status));
  const criticalHigh = active.filter(i => ['Critical', 'High'].includes(i.severity));
  const investigating = list.filter(i => i.status === 'Investigating');
  const resolved = list.filter(i => i.status === 'Resolved');

  const resetFilters = () => {
    setStatus('All');
    setSeverity('All');
    setQ('');
  };

  return (
    <>
      <PageTitle
        eyebrow="Operations / Response"
        title="Incidents"
        description="Triage active issues, review evidence, and launch graph-powered investigations."
        actions={
          <>
            <button className="btn-secondary" onClick={resetFilters}>
              <RefreshCw size={13} /> Reset filters
            </button>
            {/* <button className="btn-primary" onClick={() => openModal('incident')}>
              <Plus size={14} /> Report incident
            </button> */}
          </>
        }
      />

      {/* Stat row */}
      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="All incidents" value={list.length} icon={AlertTriangle} />
        <StatCard
          label="Critical & high"
          value={criticalHigh.length}
          icon={AlertOctagon}
          accent={criticalHigh.length > 0 ? 'red' : 'lime'}
        />
        <StatCard
          label="Investigating"
          value={investigating.length}
          icon={Search}
          accent="blue"
        />
        <StatCard
          label="Resolved"
          value={resolved.length}
          icon={CheckCircle2}
          accent="lime"
        />
      </div>

      {/* Filters + table */}
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
          <div className="flex flex-wrap items-center gap-2">
            <SearchBox className="w-full sm:w-[210px]" value={q} onChange={setQ} placeholder="Search incidents..." />
            <select
              className="input !w-auto !py-2 text-xs"
              value={severity}
              onChange={e => setSeverity(e.target.value)}
            >
              {SEVERITIES.map(s => <option key={s}>{s}</option>)}
            </select>
          </div>
        </div>

        {incidents.loading ? (
          <LoadingSpinner label="Loading incidents…" />
        ) : incidents.error ? (
          <EmptyState
            icon={AlertTriangle}
            title="Couldn't load incidents"
            description={incidents.error.message}
            action={<button className="btn-secondary" onClick={incidents.refetch}>Retry</button>}
          />
        ) : filtered.length === 0 ? (
          <EmptyState
            icon={AlertTriangle}
            title={list.length === 0 ? 'No incidents yet' : 'No incidents match'}
            description={
              list.length === 0
                ? 'Report an incident to get started.'
                : 'Try another query or change your filters.'
            }
            action={
              list.length === 0
                ? <button className="btn-primary" onClick={() => openModal('incident')}><Plus size={13} /> Report incident</button>
                : <button className="btn-secondary" onClick={resetFilters}>Clear filters</button>
            }
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[800px] text-left">
              <thead>
                <tr className="border-b border-line text-[9px] font-bold uppercase tracking-widest text-slate-600">
                  <th className="px-5 py-3">Incident</th>
                  <th className="px-4 py-3">Severity</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Service</th>
                  <th className="px-4 py-3">Started</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody>
                {filtered.map(i => (
                  <tr key={i.id} className="table-row">
                    <td className="px-5 py-4">
                      <Link to={`/incidents/${i.id}`} className="group block">
                        <div className="mb-1 font-mono text-[10px] text-slate-500">{i.id}</div>
                        <div className="max-w-[340px] truncate text-xs font-semibold text-slate-200 group-hover:text-lime">
                          {i.title}
                        </div>
                        {i.summary && (
                          <div className="mt-1 max-w-[360px] truncate text-[10px] text-slate-500">
                            {i.summary}
                          </div>
                        )}
                      </Link>
                    </td>
                    <td className="px-4 py-4">
                      <Badge tone={toneForSeverity(i.severity)}>{i.severity}</Badge>
                    </td>
                    <td className="px-4 py-4">
                      <Badge tone={toneForStatus(i.status)}>{i.status}</Badge>
                    </td>
                    <td className="px-4 py-4">
                      <div className="flex flex-wrap gap-1">
                        {(i.services ?? []).slice(0, 2).map(s => (
                          <span key={s} className="rounded bg-[#212a35] px-1.5 py-1 font-mono text-[9px] text-slate-400">
                            {s}
                          </span>
                        ))}
                        {(i.services ?? []).length > 2 && (
                          <span className="text-[9px] text-slate-600">+{(i.services ?? []).length - 2}</span>
                        )}
                        {(i.services ?? []).length === 0 && (
                          <span className="text-[10px] text-slate-600">—</span>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-4 text-[10px] text-slate-500">
                      {relativeTime(i.started_at)}
                    </td>
                    <td className="px-4 py-4">
                      <button
                        className="btn-ghost !px-2"
                        onClick={() => navigate(`/incidents/${i.id}`)}
                        title="Open incident"
                      >
                        <ArrowUpRight size={14} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <div className="flex items-center justify-between border-t border-line px-5 py-3 text-[10px] text-slate-500">
          <span>Showing {filtered.length} of {list.length} incidents</span>
          <span className="flex items-center gap-1">
            <span className="h-1.5 w-1.5 rounded-full bg-lime" /> Updated just now
          </span>
        </div>
      </div>
    </>
  );
}