import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom'; // <-- Import createPortal
import {
  AlertTriangle, ArrowRight, Clock3, Eye, Filter,
  RefreshCw, Search, ShieldCheck, Terminal, User,
} from 'lucide-react';
import { PageTitle } from '../components/ui/PageTitle';
import { Badge, type BadgeTone } from '../components/ui/Badge';
import { EmptyState } from '../components/ui/EmptyState';
import { LoadingSpinner } from '../components/ui/LoadingSpinner';
import { useFetch } from '../lib/hooks';
import { auditApi, type AuditEvent } from '../lib/api';
import { formatDateTime, relativeTime } from '../lib/utils';

// Helper to color-code verbs based on their prefix
const VERB_TONES: Record<string, BadgeTone> = {
  auth: 'blue',
  approval: 'purple',
  incident: 'red',
  memory: 'yellow',
  investigation: 'green',
};

function getVerbTone(verb: string): BadgeTone {
  const prefix = verb.split('.')[0];
  return VERB_TONES[prefix] || 'neutral';
}

export function AuditPage() {
  // Filters
  const [actor, setActor] = useState('');
  const [targetId, setTargetId] = useState('');
  const [verb, setVerb] = useState('');
  
  // Pagination
  const [limit] = useState(50);
  const [offset, setOffset] = useState(0);

  // Detail Modal
  const [selectedEvent, setSelectedEvent] = useState<AuditEvent | null>(null);

  // Debounce text inputs
  const [debouncedActor, setDebouncedActor] = useState('');
  const [debouncedTarget, setDebouncedTarget] = useState('');
  
  useEffect(() => {
    const t = setTimeout(() => setDebouncedActor(actor.trim()), 300);
    return () => clearTimeout(t);
  }, [actor]);
  
  useEffect(() => {
    const t = setTimeout(() => setDebouncedTarget(targetId.trim()), 300);
    return () => clearTimeout(t);
  }, [targetId]);

  // Fetch Verbs for dropdown
  const { data: verbsData } = useFetch(() => auditApi.verbs());
  const verbs = verbsData?.verbs ?? [];

  // Fetch Events
  const eventsReq = useFetch(
    () => auditApi.list({
      actor: debouncedActor || undefined,
      target_id: debouncedTarget || undefined,
      verb: verb || undefined,
      limit,
      offset,
    }),
    [debouncedActor, debouncedTarget, verb, offset, limit]
  );

  const events = eventsReq.data?.events ?? [];
  const total = eventsReq.data?.count ?? 0;

  const handleRefresh = () => eventsReq.refetch();

  return (
    <>
      <PageTitle
        eyebrow="Security / Compliance"
        title="Audit log"
        description="Immutable record of privileged actions across the workspace. Use filters to trace specific actors, targets, or event types."
        actions={
          <button className="btn-secondary" onClick={handleRefresh}>
            <RefreshCw size={13} /> Refresh
          </button>
        }
      />

      <div className="card overflow-hidden">
        {/* ---------- Filters Toolbar ---------- */}
        <div className="flex flex-col gap-3 border-b border-line p-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex flex-1 flex-wrap items-center gap-3">
            {/* Actor Search */}
            <div className="relative">
              <User size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
              <input
                value={actor}
                onChange={e => { setActor(e.target.value); setOffset(0); }}
                placeholder="Filter by actor..."
                className="input !pl-9 !py-2 text-xs w-full sm:w-[200px]"
              />
            </div>

            {/* Target Search */}
            <div className="relative">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
              <input
                value={targetId}
                onChange={e => { setTargetId(e.target.value); setOffset(0); }}
                placeholder="Filter by target ID..."
                className="input !pl-9 !py-2 text-xs w-full sm:w-[200px]"
              />
            </div>

            {/* Verb Dropdown */}
            <div className="flex items-center gap-2">
              <Filter size={14} className="text-slate-500" />
              <select
                className="input !w-[180px] !py-2 text-xs"
                value={verb}
                onChange={e => { setVerb(e.target.value); setOffset(0); }}
              >
                <option value="">All Verbs</option>
                {verbs.map(v => (
                  <option key={v} value={v}>{v}</option>
                ))}
              </select>
            </div>
          </div>

          <div className="text-[11px] text-slate-500">
            {eventsReq.loading ? 'Loading...' : `${total} events found`}
          </div>
        </div>

        {/* ---------- Table ---------- */}
        {eventsReq.loading && events.length === 0 ? (
          <LoadingSpinner label="Loading audit events…" />
        ) : eventsReq.error ? (
          <EmptyState
            icon={AlertTriangle}
            title="Couldn't load audit logs"
            description={eventsReq.error.message}
            action={<button className="btn-secondary" onClick={handleRefresh}>Retry</button>}
          />
        ) : events.length === 0 ? (
          <EmptyState
            icon={ShieldCheck}
            title="No audit events found"
            description="Try adjusting your filters or clearing the search."
            action={
              (actor || targetId || verb) ? (
                <button className="btn-secondary" onClick={() => { setActor(''); setTargetId(''); setVerb(''); }}>
                  Clear filters
                </button>
              ) : undefined
            }
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[800px] text-left">
              <thead>
                <tr className="border-b border-line text-[9px] font-bold uppercase tracking-widest text-slate-600">
                  <th className="px-5 py-3">Time</th>
                  <th className="px-4 py-3">Actor</th>
                  <th className="px-4 py-3">Action</th>
                  <th className="px-4 py-3">Target</th>
                  <th className="px-4 py-3 text-right">Detail</th>
                </tr>
              </thead>
              <tbody>
                {events.map(e => (
                  <tr key={e.id} className="table-row group hover:bg-[#151d26] transition-colors">
                    <td className="px-5 py-4">
                      <div className="flex items-center gap-2 text-[11px] text-slate-300">
                        <Clock3 size={12} className="text-slate-500" />
                        {formatDateTime(e.ts)}
                      </div>
                      <div className="mt-1 text-[10px] text-slate-500">{relativeTime(e.ts)}</div>
                    </td>
                    <td className="px-4 py-4">
                      <div className="flex items-center gap-2">
                        <div className="flex h-6 w-6 items-center justify-center rounded-full bg-[#26313d] text-[10px] font-bold text-slate-300">
                          {e.actor.substring(0, 2).toUpperCase()}
                        </div>
                        <span className="font-mono text-[11px] text-slate-300">{e.actor}</span>
                      </div>
                    </td>
                    <td className="px-4 py-4">
                      <Badge tone={getVerbTone(e.verb)}>{e.verb}</Badge>
                    </td>
                    <td className="px-4 py-4">
                      {e.target_id ? (
                        <span className="font-mono text-[11px] text-slate-400">{e.target_id}</span>
                      ) : (
                        <span className="text-[11px] text-slate-600">—</span>
                      )}
                    </td>
                    <td className="px-4 py-4 text-right">
                      <button
                        onClick={() => setSelectedEvent(e)}
                        className="inline-flex items-center gap-1.5 rounded-md border border-line bg-[#18212b] px-2 py-1 text-[10px] font-medium text-slate-400 opacity-50 group-hover:opacity-100 hover:border-lime/40 hover:text-lime transition-all"
                      >
                        <Eye size={12} /> View JSON
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* ---------- Pagination ---------- */}
        {events.length > 0 && (
          <div className="flex items-center justify-between border-t border-line px-5 py-3 text-[10px] text-slate-500">
            <span>
              Showing {offset + 1} - {Math.min(offset + limit, total)} of {total}
            </span>
            <div className="flex gap-2">
              <button
                disabled={offset === 0}
                onClick={() => setOffset(Math.max(0, offset - limit))}
                className="btn-secondary !py-1.5 !px-3 disabled:opacity-50"
              >
                Previous
              </button>
              <button
                disabled={offset + limit >= total}
                onClick={() => setOffset(offset + limit)}
                className="btn-secondary !py-1.5 !px-3 disabled:opacity-50"
              >
                Next
              </button>
            </div>
          </div>
        )}
      </div>

      {/* ---------- Detail Modal ---------- */}
      {selectedEvent && (
        <AuditDetailModal
          event={selectedEvent}
          onClose={() => setSelectedEvent(null)}
        />
      )}
    </>
  );
}

// ============================================================
// JSON Detail Modal (With Portal to fix positioning)
// ============================================================
function AuditDetailModal({ event, onClose }: { event: AuditEvent; onClose: () => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    
    // Prevent background scrolling when modal is open
    const originalStyle = window.getComputedStyle(document.body).overflow;
    document.body.style.overflow = 'hidden';
    
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = originalStyle;
    };
  }, [onClose]);

  // Use createPortal to render outside the DOM hierarchy of the parent component
  return createPortal(
    <div
      className="fixed inset-0 z-[999] flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm sm:p-6"
      onMouseDown={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="flex max-h-[90vh] w-full max-w-[650px] flex-col overflow-hidden rounded-2xl border border-[#303b49] bg-[#111821] shadow-[0_30px_100px_rgba(0,0,0,.55)]">
        {/* Header */}
        <div className="flex shrink-0 items-start justify-between border-b border-line px-5 py-4">
          <div>
            <div className="mb-1 flex items-center gap-2">
              <Badge tone={getVerbTone(event.verb)}>{event.verb}</Badge>
              <span className="font-mono text-[10px] text-slate-500">{event.id}</span>
            </div>
            <h2 className="text-[15px] font-semibold text-slate-100">Event Details</h2>
          </div>
          <button onClick={onClose} className="rounded-lg p-1.5 text-slate-500 hover:bg-[#202a34] hover:text-white">
            <ArrowRight size={16} className="rotate-45" />
          </button>
        </div>

        {/* Meta row */}
        <div className="grid shrink-0 grid-cols-2 gap-4 border-b border-line bg-[#0e141c] px-5 py-4">
          <div>
            <p className="text-[9px] uppercase tracking-widest text-slate-600">Actor</p>
            <p className="mt-1 font-mono text-[11px] text-slate-300">{event.actor}</p>
          </div>
          <div>
            <p className="text-[9px] uppercase tracking-widest text-slate-600">Target ID</p>
            <p className="mt-1 font-mono text-[11px] text-slate-300">{event.target_id || '—'}</p>
          </div>
          <div>
            <p className="text-[9px] uppercase tracking-widest text-slate-600">Timestamp</p>
            <p className="mt-1 text-[11px] text-slate-300">{new Date(event.ts).toISOString()}</p>
          </div>
        </div>

        {/* JSON Payload */}
        <div className="flex-1 overflow-y-auto p-5">
          <div className="mb-2 flex items-center gap-2">
            <Terminal size={14} className="text-lime" />
            <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Payload</p>
          </div>
          <div className="overflow-x-auto rounded-lg border border-line bg-[#0b1118] p-4">
            <pre className="whitespace-pre-wrap break-all font-mono text-[11px] leading-5 text-[#a6accd]">
              {JSON.stringify(event.detail, null, 2)}
            </pre>
          </div>
        </div>

        {/* Footer */}
        <div className="flex shrink-0 items-center justify-end border-t border-line bg-[#0d131b] px-5 py-3">
          <button className="btn-secondary !py-2" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}