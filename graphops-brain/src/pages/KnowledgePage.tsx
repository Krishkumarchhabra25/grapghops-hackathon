import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  AlertTriangle, ArrowRight, ArrowUpRight, BookMarked, BookOpen, CheckCircle2,
  Clock3, Database, Eye, FileText, Filter, Info, Loader2, Lock, Network,
  RefreshCw, Search, Send, Sparkles, X,
} from 'lucide-react';
import { PageTitle } from '../components/ui/PageTitle';
import { StatCard } from '../components/ui/StatCard';
import { Badge, type BadgeTone } from '../components/ui/Badge';
import { SearchBox } from '../components/ui/SearchBox';
import { EmptyState } from '../components/ui/EmptyState';
import { LoadingSpinner } from '../components/ui/LoadingSpinner';
import { SectionHeading } from '../components/ui/SectionHeading';
import { useToast } from '../contexts/ToastContext';
import { useFetch } from '../lib/hooks';
import { knowledgeApi } from '../lib/api';
import { cx, formatDateTime, relativeTime, toneForStatus } from '../lib/utils';

// ---------- Types (mirror app/models/knowledge.py) ----------
type DocType = 'Runbook' | 'RFC' | 'Architecture' | 'SLO';
type DocStatus = 'Synced' | 'Needs review';

type DocumentListItem = {
  id: string;
  title: string;
  type: DocType;
  source_url?: string | null;
  visibility: string;
  status: DocStatus;
  content_hash?: string | null;
  updated_at?: number | null;
  created_at?: number | null;
};

type DocumentEntity = { id: string; name: string };
type DocumentAuthor = { id: string; name: string };
type DocumentDecision = { id: string; title: string };

type DocumentDetail = DocumentListItem & {
  body: string;
  services: DocumentEntity[];
  authors: DocumentAuthor[];
  decisions: DocumentDecision[];
};

type Citation = {
  ref: string;
  kind: 'document' | 'graph';
  id: string;
  title?: string | null;
  updated_at?: number | null;
  source_url?: string | null;
  query_id?: string | null;
};

type AskResponse = {
  answer: string;
  citations: Citation[];
  gaps: string[];
  filtered_count: number;
  retrieved_count: number;
};

type SearchHit = {
  id: string;
  title: string;
  type: string;
  source_url?: string | null;
  updated_at?: number | null;
  status: string;
  score: number;
  services: string[];
  owners: string[];
};

type SearchResponse = {
  query: string;
  hits: SearchHit[];
  count: number;
  filtered_count: number;
};

// ---------- Constants ----------
const TYPE_TONES: Record<string, BadgeTone> = {
  Runbook: 'blue',
  RFC: 'purple',
  Architecture: 'green',
  SLO: 'yellow',
};

const SUGGESTED_QUESTIONS = [
  'Who owns checkout-api and which runbook applies?',
  'What is the payment SDK migration policy?',
  'Which services depend on payment-gateway?',
  'What was the last checkout incident and how was it fixed?',
];

export function KnowledgePage() {
  const { notify } = useToast();

  // ---------- Ask state ----------
  const [question, setQuestion] = useState('');
  const [asking, setAsking] = useState(false);
  const [askResult, setAskResult] = useState<AskResponse | null>(null);
  const [askError, setAskError] = useState<string | null>(null);

  const ask = async (q: string = question) => {
    const trimmed = q.trim();
    if (!trimmed || asking) return;
    setAsking(true);
    setAskError(null);
    try {
      const res = await knowledgeApi.ask(trimmed) as AskResponse;
      setAskResult(res);
    } catch (e: any) {
      setAskError(e?.message || 'Ask failed');
      notify(e?.message || 'Ask failed', 'error');
    } finally {
      setAsking(false);
    }
  };

  // ---------- Sources ----------
  const [typeFilter, setTypeFilter] = useState<string>('All');
  const [statusFilter, setStatusFilter] = useState<string>('All');
  const [searchInput, setSearchInput] = useState('');
  const [q, setQ] = useState('');

  useEffect(() => {
    const t = window.setTimeout(() => setQ(searchInput.trim()), 250);
    return () => window.clearTimeout(t);
  }, [searchInput]);

  const sources = useFetch(
    () => knowledgeApi.sources() as Promise<{ documents: DocumentListItem[]; count: number }>,
  );

  const allDocs = sources.data?.documents ?? [];

  const filteredDocs = useMemo(() => {
    return allDocs.filter(d => {
      if (typeFilter !== 'All' && d.type !== typeFilter) return false;
      if (statusFilter !== 'All' && d.status !== statusFilter) return false;
      if (q) {
        const needle = q.toLowerCase();
        if (!`${d.id} ${d.title} ${d.type}`.toLowerCase().includes(needle)) return false;
      }
      return true;
    });
  }, [allDocs, typeFilter, statusFilter, q]);

  // ---------- Document detail ----------
  const [openDocId, setOpenDocId] = useState<string | null>(null);
  const detail = useFetch(
    () => openDocId
      ? knowledgeApi.document(openDocId) as Promise<DocumentDetail>
      : Promise.resolve(null),
    [openDocId],
  );

  // ---------- Derived stats ----------
  const stats = useMemo(() => {
    const synced = allDocs.filter(d => d.status === 'Synced').length;
    const needsReview = allDocs.filter(d => d.status === 'Needs review').length;
    const restricted = allDocs.filter(d => d.visibility.startsWith('team:')).length;
    return { synced, needsReview, restricted };
  }, [allDocs]);

  return (
    <>
      <PageTitle
        eyebrow="Intelligence / Company brain"
        title="Knowledge base"
        description="Ask questions across runbooks, RFCs, and architecture docs. Answers are cited and permission-aware."
        actions={
          <button className="btn-secondary" onClick={sources.refetch}>
            <RefreshCw size={13} /> Refresh sources
          </button>
        }
      />

      {/* ---------- Ask box ---------- */}
      <div className="mb-5 overflow-hidden rounded-2xl border border-[#33472f] bg-gradient-to-br from-[#17251b] to-[#111820]">
        <div className="p-5">
          <div className="mb-4 flex items-start gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-lime/10 text-lime">
              <Sparkles size={18} />
            </div>
            <div className="flex-1">
              <h2 className="text-sm font-semibold text-slate-100">Ask the brain</h2>
              <p className="mt-1 text-[11px] text-slate-400">
                Every answer carries citations. Restricted documents are hidden and counted.
              </p>
            </div>
          </div>

          {/* Input row */}
          <form
            onSubmit={e => { e.preventDefault(); ask(); }}
            className="flex flex-col gap-2 sm:flex-row"
          >
            <div className="relative flex-1">
              <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
              <input
                value={question}
                onChange={e => setQuestion(e.target.value)}
                placeholder="e.g. Who owns checkout-api and which runbook applies?"
                className="input !pl-10 !py-3 text-sm"
                disabled={asking}
              />
            </div>
            <button
              type="submit"
              disabled={asking || !question.trim()}
              className="btn-primary !py-3 sm:!px-5"
            >
              {asking ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
              {asking ? 'Thinking…' : 'Ask'}
            </button>
          </form>

          {/* Suggested questions */}
          {!askResult && !asking && (
            <div className="mt-3 flex flex-wrap gap-2">
              {SUGGESTED_QUESTIONS.map(sq => (
                <button
                  key={sq}
                  onClick={() => { setQuestion(sq); ask(sq); }}
                  className="rounded-full border border-line bg-[#0e141c] px-3 py-1.5 text-[10px] text-slate-400 transition-colors hover:border-lime/40 hover:text-lime"
                >
                  {sq}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Answer */}
        {(askResult || askError || asking) && (
          <div className="border-t border-[#33472f] bg-[#111c15] p-5">
            {asking && (
              <div className="flex items-center gap-3 text-[12px] text-slate-400">
                <Loader2 size={16} className="animate-spin text-lime" />
                Searching the knowledge graph and composing an answer…
              </div>
            )}

            {askError && !asking && (
              <div className="flex items-start gap-2 rounded-lg border border-rose-900/60 bg-[#28181d] p-3 text-[11px] text-rose-200">
                <AlertTriangle size={14} className="mt-0.5 shrink-0" />
                <div>{askError}</div>
              </div>
            )}

            {askResult && !asking && (
              <>
                <div className="mb-4">
                  <p className="text-[13px] leading-7 text-slate-100">{askResult.answer}</p>
                </div>

                {/* Citations */}
                {askResult.citations.length > 0 && (
                  <div className="mb-3">
                    <p className="mb-2 text-[10px] font-bold uppercase tracking-widest text-slate-500">
                      Sources
                    </p>
                    <div className="flex flex-wrap gap-2">
                      {askResult.citations.map(c => (
                        <button
                          key={c.ref}
                          onClick={() => c.kind === 'document' && setOpenDocId(c.id)}
                          className={cx(
                            'flex items-center gap-2 rounded-lg border border-line bg-[#0e141c] px-2.5 py-1.5 text-left transition-colors',
                            c.kind === 'document' && 'hover:border-lime/40',
                          )}
                        >
                          <span className="font-mono text-[10px] font-bold text-lime">
                            [{c.ref}]
                          </span>
                          <div>
                            <p className="text-[11px] font-medium text-slate-200">
                              {c.title || c.id}
                            </p>
                            <p className="mt-0.5 font-mono text-[9px] text-slate-600">
                              {c.kind} · {c.id}
                            </p>
                          </div>
                          {c.kind === 'document' && (
                            <ArrowUpRight size={11} className="text-slate-600" />
                          )}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {/* Gaps */}
                {askResult.gaps.length > 0 && (
                  <div className="mb-3 rounded-lg border border-[#4c4128] bg-[#1c1a14] p-3">
                    <div className="flex items-start gap-2">
                      <Info size={13} className="mt-0.5 shrink-0 text-amber-300" />
                      <div>
                        <p className="text-[11px] font-semibold text-amber-200">Missing evidence</p>
                        <ul className="mt-1.5 space-y-1 text-[11px] leading-5 text-slate-400">
                          {askResult.gaps.map((g, i) => (
                            <li key={i} className="flex gap-2">
                              <span className="text-amber-300">•</span>
                              <span>{g}</span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    </div>
                  </div>
                )}

                {/* Footer note */}
                <div className="flex flex-wrap items-center justify-between gap-2 border-t border-[#2a3a2c] pt-3 text-[10px] text-slate-500">
                  <span>{askResult.retrieved_count} source{askResult.retrieved_count === 1 ? '' : 's'} retrieved</span>
                  {askResult.filtered_count > 0 && (
                    <span className="flex items-center gap-1.5 text-amber-200/80">
                      <Lock size={10} />
                      {askResult.filtered_count} matching item{askResult.filtered_count === 1 ? '' : 's'} hidden by permission
                    </span>
                  )}
                </div>

                <button
                  onClick={() => { setAskResult(null); setQuestion(''); }}
                  className="mt-3 text-[10px] font-semibold text-slate-500 hover:text-slate-300"
                >
                  Ask another question
                </button>
              </>
            )}
          </div>
        )}
      </div>

      {/* ---------- Stat cards ---------- */}
      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Knowledge sources" value={allDocs.length} icon={BookOpen} accent="blue" />
        <StatCard label="Synced" value={stats.synced} icon={CheckCircle2} accent="lime" />
        <StatCard
          label="Needs review"
          value={stats.needsReview}
          icon={AlertTriangle}
          accent={stats.needsReview > 0 ? 'red' : 'lime'}
        />
        <StatCard
          label="Restricted (team)"
          value={stats.restricted}
          icon={Lock}
          accent="violet"
          description="Visible only to team members"
        />
      </div>

      {/* ---------- Sources list ---------- */}
      <div className="card overflow-hidden">
        <div className="flex flex-col gap-3 border-b border-line p-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex flex-wrap gap-1 rounded-lg bg-[#0d131b] p-1">
            {['All', 'Runbook', 'RFC', 'Architecture', 'SLO'].map(t => (
              <button
                key={t}
                onClick={() => setTypeFilter(t)}
                className={cx(
                  'rounded-md px-3 py-1.5 text-[11px] font-semibold transition-colors',
                  typeFilter === t ? 'bg-[#2a3542] text-white' : 'text-slate-500 hover:text-slate-300',
                )}
              >
                {t}
              </button>
            ))}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <SearchBox
              value={searchInput}
              onChange={setSearchInput}
              className="w-full sm:w-[230px]"
              placeholder="Filter sources..."
            />
            <select
              className="input !w-auto !py-2 text-xs"
              value={statusFilter}
              onChange={e => setStatusFilter(e.target.value)}
            >
              <option>All</option>
              <option>Synced</option>
              <option>Needs review</option>
            </select>
          </div>
        </div>

        {sources.loading ? (
          <LoadingSpinner label="Loading sources…" />
        ) : sources.error ? (
          <EmptyState
            icon={AlertTriangle}
            title="Couldn't load sources"
            description={sources.error.message}
            action={<button className="btn-secondary" onClick={sources.refetch}>Retry</button>}
          />
        ) : filteredDocs.length === 0 ? (
          <EmptyState
            icon={BookOpen}
            title={allDocs.length === 0 ? 'No sources yet' : 'No sources match'}
            description={
              allDocs.length === 0
                ? 'Add documents to the knowledge base to enable Ask.'
                : 'Try another filter.'
            }
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-left">
              <thead>
                <tr className="border-b border-line text-[9px] font-bold uppercase tracking-widest text-slate-600">
                  <th className="px-5 py-3">Source</th>
                  <th className="px-4 py-3">Type</th>
                  <th className="px-4 py-3">Visibility</th>
                  <th className="px-4 py-3">Updated</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody>
                {filteredDocs.map(d => (
                  <tr key={d.id} className="table-row">
                    <td className="px-5 py-4">
                      <button
                        onClick={() => setOpenDocId(d.id)}
                        className="flex items-center gap-3 text-left"
                      >
                        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-[#202b37] text-slate-300">
                          <FileText size={15} />
                        </div>
                        <div>
                          <p className="text-xs font-semibold text-slate-200 hover:text-lime">
                            {d.title}
                          </p>
                          <p className="mt-1 font-mono text-[9px] text-slate-600">
                            {d.id}
                          </p>
                        </div>
                      </button>
                    </td>
                    <td className="px-4 py-4">
                      <Badge tone={TYPE_TONES[d.type] ?? 'neutral'}>{d.type}</Badge>
                    </td>
                    <td className="px-4 py-4">
                      {d.visibility === 'workspace' ? (
                        <span className="flex items-center gap-1.5 text-[10px] text-slate-400">
                          <Eye size={11} /> workspace
                        </span>
                      ) : (
                        <span className="flex items-center gap-1.5 text-[10px] text-violet-300">
                          <Lock size={11} /> {d.visibility}
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-4 text-[10px] text-slate-500">
                      {relativeTime(d.updated_at)}
                    </td>
                    <td className="px-4 py-4">
                      <Badge tone={toneForStatus(d.status)}>{d.status}</Badge>
                    </td>
                    <td className="px-4 py-4">
                      <button
                        className="btn-ghost !p-2"
                        onClick={() => setOpenDocId(d.id)}
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
          <span>Showing {filteredDocs.length} of {allDocs.length} sources</span>
          <span className="flex items-center gap-1">
            <Clock3 size={11} /> Last sync {relativeTime(allDocs[0]?.updated_at) ?? 'never'}
          </span>
        </div>
      </div>

      {/* ---------- Document detail modal ---------- */}
      {openDocId && (
        <DocumentDetailModal
          onClose={() => setOpenDocId(null)}
          loading={detail.loading}
          error={detail.error}
          doc={detail.data}
        />
      )}
    </>
  );
}

// ============================================================
// Document detail modal
// ============================================================
function DocumentDetailModal({
  onClose,
  loading,
  error,
  doc,
}: {
  onClose: () => void;
  loading: boolean;
  error: Error | null;
  doc: DocumentDetail | null;
}) {
  // Close on Escape
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-[90] flex items-center justify-center bg-black/70 p-3 backdrop-blur-sm"
      onMouseDown={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="max-h-[90vh] w-full max-w-[720px] overflow-hidden rounded-2xl border border-[#303b49] bg-[#111821] shadow-[0_30px_100px_rgba(0,0,0,.55)]">
        {/* Header */}
        <div className="flex items-start justify-between border-b border-line px-5 py-4">
          <div className="min-w-0 flex-1">
            {loading ? (
              <p className="text-sm text-slate-500">Loading…</p>
            ) : error || !doc ? (
              <p className="text-sm text-rose-300">{error?.message || 'Not found'}</p>
            ) : (
              <>
                <div className="mb-2 flex flex-wrap items-center gap-2">
                  <span className="font-mono text-[10px] text-slate-500">{doc.id}</span>
                  <Badge tone={TYPE_TONES[doc.type] ?? 'neutral'}>{doc.type}</Badge>
                  <Badge tone={toneForStatus(doc.status)}>{doc.status}</Badge>
                  {doc.visibility !== 'workspace' && (
                    <span className="flex items-center gap-1 rounded-full border border-violet-400/30 bg-violet-400/10 px-2 py-0.5 text-[9px] font-semibold text-violet-300">
                      <Lock size={9} /> {doc.visibility}
                    </span>
                  )}
                </div>
                <h2 className="text-[15px] font-semibold text-slate-100">{doc.title}</h2>
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

        {/* Body */}
        {!loading && doc && !error && (
          <div className="max-h-[calc(90vh-140px)] overflow-y-auto px-5 py-4">
            {/* Metadata row */}
            <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
              <div className="rounded-lg bg-[#0e141c] p-3">
                <p className="text-[9px] uppercase tracking-widest text-slate-600">Updated</p>
                <p className="mt-1 text-[11px] text-slate-300">{relativeTime(doc.updated_at)}</p>
              </div>
              <div className="rounded-lg bg-[#0e141c] p-3">
                <p className="text-[9px] uppercase tracking-widest text-slate-600">Visibility</p>
                <p className="mt-1 text-[11px] text-slate-300">{doc.visibility}</p>
              </div>
              {doc.content_hash && (
                <div className="rounded-lg bg-[#0e141c] p-3">
                  <p className="text-[9px] uppercase tracking-widest text-slate-600">Hash</p>
                  <p className="mt-1 truncate font-mono text-[10px] text-slate-400">{doc.content_hash.slice(0, 12)}…</p>
                </div>
              )}
            </div>

            {/* Body text */}
            <div className="mb-4 rounded-lg border border-line bg-[#0b1118] p-4">
              <p className="whitespace-pre-wrap text-[12px] leading-6 text-slate-300">
                {doc.body || '(empty)'}
              </p>
            </div>

            {/* Source URL */}
            {doc.source_url && (
              <a
                href={doc.source_url}
                target="_blank"
                rel="noreferrer"
                className="mb-4 inline-flex items-center gap-1.5 text-[11px] text-lime hover:underline"
              >
                <ArrowUpRight size={12} /> {doc.source_url}
              </a>
            )}

            {/* Linked entities */}
            {(doc.services.length > 0 || doc.authors.length > 0 || doc.decisions.length > 0) && (
              <div className="space-y-4 border-t border-line pt-4">
                {doc.services.length > 0 && (
                  <div>
                    <p className="mb-2 text-[10px] font-bold uppercase tracking-widest text-slate-500">
                      Describes services
                    </p>
                    <div className="flex flex-wrap gap-1.5">
                      {doc.services.map(s => (
                        <Link
                          key={s.id}
                          to={`/services/${s.id}`}
                          className="inline-flex items-center gap-1.5 rounded-md border border-line bg-[#18212b] px-2 py-1.5 font-mono text-[10px] text-slate-300 hover:border-lime/40 hover:text-lime"
                        >
                          <Network size={10} /> {s.name}
                          <ArrowUpRight size={9} className="opacity-60" />
                        </Link>
                      ))}
                    </div>
                  </div>
                )}

                {doc.authors.length > 0 && (
                  <div>
                    <p className="mb-2 text-[10px] font-bold uppercase tracking-widest text-slate-500">
                      Authored by
                    </p>
                    <div className="flex flex-wrap gap-1.5">
                      {doc.authors.map(a => (
                        <span
                          key={a.id}
                          className="rounded-md border border-line bg-[#18212b] px-2 py-1.5 text-[10px] text-slate-300"
                        >
                          {a.name}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                {doc.decisions.length > 0 && (
                  <div>
                    <p className="mb-2 text-[10px] font-bold uppercase tracking-widest text-slate-500">
                      Related decisions
                    </p>
                    <div className="space-y-1.5">
                      {doc.decisions.map(d => (
                        <div
                          key={d.id}
                          className="flex items-center gap-2 rounded-md border border-line bg-[#18212b] px-2 py-1.5"
                        >
                          <BookMarked size={12} className="text-violet-300" />
                          <span className="text-[10px] text-slate-300">{d.title}</span>
                          <span className="ml-auto font-mono text-[9px] text-slate-600">{d.id}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* Footer */}
        <div className="flex items-center justify-between border-t border-line bg-[#0d131b] px-5 py-3">
          <div className="flex items-center gap-3 text-[10px] text-slate-500">
            {doc?.updated_at && (
              <span className="flex items-center gap-1">
                <Clock3 size={10} /> {formatDateTime(doc.updated_at)}
              </span>
            )}
          </div>
          <button className="btn-secondary !py-2" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </div>
  );
}