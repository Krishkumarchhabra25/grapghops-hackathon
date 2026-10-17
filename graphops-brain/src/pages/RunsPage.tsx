import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Activity, AlertTriangle, ArrowUpRight, Bot, CheckCircle2, Clock3, Cpu, 
  Play, RefreshCw, Workflow, Zap,
} from 'lucide-react';
import { PageTitle } from '../components/ui/PageTitle';
import { StatCard } from '../components/ui/StatCard';
import { Badge } from '../components/ui/Badge';
import { SearchBox } from '../components/ui/SearchBox';
import { EmptyState } from '../components/ui/EmptyState';
import { LoadingSpinner } from '../components/ui/LoadingSpinner';
import { useModal } from '../contexts/ModalContext';
import { usePoll } from '../lib/hooks';
import { runsApi } from '../lib/api';
import { cx, relativeTime } from '../lib/utils';

type Run = {
  run_id: string;
  goal: string;
  status: string;
  owner_agent?: string;
  started_at?: number;
  ended_at?: number;
  state_version?: number;
  tokens?: number;
  cost_usd?: number;
};

const STATUS_TABS = ['All', 'running', 'waiting_approval', 'succeeded', 'failed'] as const;

export function RunsPage() {
  const { openModal } = useModal();
  const [tab, setTab] = useState<string>('All');
  const [q, setQ] = useState('');

  // Poll every 5s so live runs update their status and token usage dynamically
  const runs = usePoll(
    () => runsApi.list() as Promise<{ runs: Run[] }>,
    5000,
    [],
  );

  const list = runs.data?.runs ?? [];

  const filtered = useMemo(() => {
    return list.filter(r => {
      if (tab !== 'All' && r.status !== tab) return false;
      if (q) {
        const needle = q.toLowerCase();
        const hay = `${r.run_id} ${r.goal} ${r.owner_agent ?? ''}`.toLowerCase();
        if (!hay.includes(needle)) return false;
      }
      return true;
    });
  }, [list, tab, q]);

  // ----- Calculate Totals -----
  
  // Global totals for the top stat cards
  const totalTokens = list.reduce((sum, r) => sum + (r.tokens || 0), 0);
  const totalCost = list.reduce((sum, r) => sum + (r.cost_usd || 0), 0);

  // Filtered totals for the bottom table footer
  const filteredTokens = filtered.reduce((sum, r) => sum + (r.tokens || 0), 0);
  const filteredCost = filtered.reduce((sum, r) => sum + (r.cost_usd || 0), 0);

  const running = list.filter(r => r.status === 'running').length;
  const waiting = list.filter(r => r.status === 'waiting_approval').length;
  const succeeded = list.filter(r => r.status === 'succeeded').length;
  const failed = list.filter(r => r.status === 'failed').length;

  return (
    <>
      <PageTitle
        eyebrow="Intelligence / Runtime"
        title="Agent runs"
        description="Inspect executions, tool calls, and the evidence trail behind each agent decision."
        actions={
          <>
            <button className="btn-secondary" onClick={runs.refetch}>
              <RefreshCw size={13} /> Refresh
            </button>
            <button className="btn-primary" onClick={() => openModal('investigation')}>
              <Play size={13} /> Run agent
            </button>
          </>
        }
      />

      {/* Top Stat Cards - Added Tokens and Cost */}
      <div className="mb-5 grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        <StatCard label="Total runs" value={list.length} icon={Workflow} />
        <StatCard
          label="Running"
          value={running + waiting}
          icon={Activity}
          accent={running + waiting > 0 ? 'blue' : 'lime'}
          description={waiting > 0 ? `${waiting} awaiting approval` : undefined}
        />
        <StatCard label="Succeeded" value={succeeded} icon={CheckCircle2} accent="lime" />
        <StatCard
          label="Failed"
          value={failed}
          icon={AlertTriangle}
          accent={failed > 0 ? 'red' : 'lime'}
        />
        <StatCard 
          label="Total Tokens" 
          value={totalTokens.toLocaleString()} 
          icon={Cpu} 
          accent="violet" 
        />
        <StatCard 
          label="Total Cost" 
          value={`$${totalCost.toFixed(4)}`} 
          icon={Zap} 
          accent="lime" 
        />
      </div>

      <div className="card overflow-hidden">
        <div className="flex flex-col gap-3 border-b border-line p-4 xl:flex-row xl:items-center xl:justify-between">
          <div className="flex flex-wrap gap-1 rounded-lg bg-[#0d131b] p-1">
            {STATUS_TABS.map(s => (
              <button
                key={s}
                onClick={() => setTab(s)}
                className={cx(
                  'rounded-md px-3 py-1.5 text-[11px] font-semibold transition-colors',
                  tab === s ? 'bg-[#2a3542] text-white' : 'text-slate-500 hover:text-slate-300',
                )}
              >
                {s === 'All' ? 'All' : s.replace('_', ' ')}
                {s === 'All' && <span className="ml-1.5 text-[9px] text-slate-500">{list.length}</span>}
              </button>
            ))}
          </div>
          <SearchBox
            value={q}
            onChange={setQ}
            className="w-full sm:w-[230px]"
            placeholder="Search runs..."
          />
        </div>

        {runs.loading && !runs.data ? (
          <LoadingSpinner label="Loading runs…" />
        ) : runs.error ? (
          <EmptyState
            icon={AlertTriangle}
            title="Couldn't load runs"
            description={runs.error.message}
            action={<button className="btn-secondary" onClick={runs.refetch}>Retry</button>}
          />
        ) : filtered.length === 0 ? (
          <EmptyState
            icon={Workflow}
            title={list.length === 0 ? 'No runs yet' : 'No runs match'}
            description={
              list.length === 0
                ? 'Start an investigation on an incident to see runs here.'
                : 'Try another query or change the filter.'
            }
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[950px] text-left">
              <thead>
                <tr className="border-b border-line text-[9px] font-bold uppercase tracking-widest text-slate-600">
                  <th className="px-5 py-3">Run</th>
                  <th className="px-4 py-3">Agent</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Started</th>
                  <th className="px-4 py-3">Duration</th>
                  <th className="px-4 py-3 text-right">Tokens</th>
                  <th className="px-4 py-3 text-right">Cost</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody>
                {filtered.map(r => (
                  <tr key={r.run_id} className="table-row">
                    <td className="px-5 py-4">
                      <Link to={`/runs/${r.run_id}`} className="block">
                        <p className="font-mono text-[10px] text-slate-500">{r.run_id}</p>
                        <p className="mt-1 max-w-[280px] truncate text-xs font-semibold text-slate-200 hover:text-lime">
                          {r.goal || 'Investigation'}
                        </p>
                      </Link>
                    </td>
                    <td className="px-4 py-4">
                      <div className="flex items-center gap-2">
                        <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-violet-400/10 text-violet-300">
                          <Bot size={13} />
                        </div>
                        <span className="text-[10px] text-slate-300">
                          {r.owner_agent || 'agent'}
                        </span>
                      </div>
                    </td>
                    <td className="px-4 py-4">
                      <span className={cx(
                        'badge',
                        r.status === 'running' && 'badge-blue',
                        r.status === 'waiting_approval' && 'badge-yellow',
                        r.status === 'succeeded' && 'badge-green',
                        r.status === 'failed' && 'badge-red',
                        r.status === 'cancelled' && 'badge-purple',
                      )}>
                        {r.status === 'running' && (
                          <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-sky-300" />
                        )}
                        {r.status === 'waiting_approval' && (
                          <Zap size={10} className="-ml-0.5 mr-0.5" />
                        )}
                        {r.status}
                      </span>
                    </td>
                    <td className="px-4 py-4 text-[10px] text-slate-500">
                      {relativeTime(r.started_at)}
                    </td>
                    <td className="px-4 py-4 font-mono text-[10px] text-slate-400">
                      {r.started_at && r.ended_at
                        ? `${Math.round((r.ended_at - r.started_at) / 1000)}s`
                        : r.started_at
                          ? `${Math.round((Date.now() - r.started_at) / 1000)}s…`
                          : '—'}
                    </td>
                    <td className="px-4 py-4 text-right font-mono text-[10px] text-slate-400">
                      {r.tokens ? r.tokens.toLocaleString() : '0'}
                    </td>
                    <td className="px-4 py-4 text-right font-mono text-[10px] text-lime">
                      ${(r.cost_usd || 0).toFixed(4)}
                    </td>
                    <td className="px-4 py-4">
                      <Link to={`/runs/${r.run_id}`} className="btn-ghost !p-2">
                        <ArrowUpRight size={14} />
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Footer - Shows filtered totals dynamically */}
        <div className="flex flex-col gap-2 border-t border-line bg-[#0b1016] px-5 py-3 text-[10px] text-slate-500 sm:flex-row sm:items-center sm:justify-between">
          <span>
            Showing <span className="text-slate-300">{filtered.length}</span> of {list.length} runs
          </span>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
            <span className="flex items-center gap-1.5">
              <Cpu size={11} className="text-slate-400" />
              Total: <span className="font-mono text-slate-300">{filteredTokens.toLocaleString()}</span> tokens
            </span>
            <span className="flex items-center gap-1.5">
              <Zap size={11} className="text-lime" />
              Total: <span className="font-mono text-lime">${filteredCost.toFixed(4)}</span>
            </span>
            <span className="flex items-center gap-1 ml-2 border-l border-line pl-4">
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-lime" />
              Live
            </span>
          </div>
        </div>
      </div>
    </>
  );
}