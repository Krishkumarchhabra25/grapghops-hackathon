import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  AlertTriangle, ArrowRight, BookOpen, BrainCircuit, Check, CheckCircle2,
  CircleHelp, Command, FileSearch, FileText, Info, Loader2, MessageSquare,
  Network, Plus, Search, Send, Server, Sparkles, User, WandSparkles,
  X, Zap,
} from 'lucide-react';
import { useModal, type ModalType } from '../../contexts/ModalContext';
import { useToast } from '../../contexts/ToastContext';
import { useAuth } from '../../contexts/AuthContext';
import { incidentsApi, investigationsApi, memoryApi, servicesApi } from '../../lib/api';
import { cx } from '../../lib/utils';

// ============================================================
// Dispatcher
// ============================================================
export function GlobalModal() {
  const { modal, closeModal } = useModal();

  // Close on Escape.
  useEffect(() => {
    if (!modal) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeModal();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [modal, closeModal]);

  if (!modal) return null;

  const type = modal.type as ModalType;

  // ---------- Simple informational modals ----------
  if (type === 'help') return <HelpModal onClose={closeModal} />;
  if (type === 'keyboard') return <KeyboardModal onClose={closeModal} />;
  if (type === 'confirm') return <ConfirmModal onClose={closeModal} payload={modal.payload} />;
  if (type === 'search') return <SearchModal onClose={closeModal} />;
  if (type === 'notifications') return <NotificationsModal onClose={closeModal} />;

  // ---------- Form modals with real API calls ----------
  if (type === 'incident') return <IncidentModal onClose={closeModal} />;
  if (type === 'investigation') return <InvestigationModal onClose={closeModal} />;
  if (type === 'memory') return <MemoryModal onClose={closeModal} />;

  // ---------- Fallback ----------
  return <FallbackModal onClose={closeModal} type={type} />;
}

// ============================================================
// Shell wrapper — every modal uses this
// ============================================================
function ModalShell({
  title,
  subtitle,
  onClose,
  children,
  footer,
  width = 'max-w-[560px]',
}: {
  title: string;
  subtitle?: string;
  onClose: () => void;
  children: React.ReactNode;
  footer?: React.ReactNode;
  width?: string;
}) {
  return (
    <div
      className="fixed inset-0 z-[90] flex items-center justify-center bg-black/70 p-3 backdrop-blur-sm"
      onMouseDown={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className={cx('flex max-h-[90vh] w-full flex-col overflow-hidden rounded-2xl border border-[#303b49] bg-[#111821] shadow-[0_30px_100px_rgba(0,0,0,.55)]', width)}>
        <div className="flex items-start justify-between gap-3 border-b border-line px-5 py-4">
          <div>
            <h2 className="text-[15px] font-semibold text-slate-100">{title}</h2>
            {subtitle && <p className="mt-1 text-[11px] leading-5 text-slate-500">{subtitle}</p>}
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-1.5 text-slate-500 hover:bg-[#202a34] hover:text-white"
          >
            <X size={16} />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-5">{children}</div>
        {footer && (
          <div className="border-t border-line bg-[#0d131b] px-5 py-4">
            {footer}
          </div>
        )}
      </div>
    </div>
  );
}

// ============================================================
// Shared field components
// ============================================================
function Field({
  label,
  hint,
  children,
  required,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
  required?: boolean;
}) {
  return (
    <label className="block">
      <span className="mb-1.5 flex items-center gap-1.5 text-xs font-medium text-slate-300">
        {label}
        {required && <span className="text-rose-400">*</span>}
        {hint && (
          <span className="ml-1 text-[10px] font-normal text-slate-500">{hint}</span>
        )}
      </span>
      {children}
    </label>
  );
}

function ErrorBanner({ message }: { message: string }) {
  return (
    <div className="flex items-start gap-2 rounded-lg border border-rose-900/60 bg-[#28181d] p-3 text-[11px] text-rose-200">
      <AlertTriangle size={13} className="mt-0.5 shrink-0" />
      <span>{message}</span>
    </div>
  );
}

function InfoBanner({ message }: { message: string }) {
  return (
    <div className="flex items-start gap-2 rounded-lg border border-[#33472f] bg-[#141e17] p-3 text-[11px] text-slate-400">
      <Info size={13} className="mt-0.5 shrink-0 text-lime" />
      <span>{message}</span>
    </div>
  );
}

// ============================================================
// Incident modal — POST /api/v1/incidents
// ============================================================
function IncidentModal({ onClose }: { onClose: () => void }) {
  const { notify } = useToast();
  const navigate = useNavigate();

  const [title, setTitle] = useState('');
  const [severity, setSeverity] = useState('Medium');
  const [status, setStatus] = useState('Open');
  const [summary, setSummary] = useState('');
  const [impact, setImpact] = useState('');
  const [selectedServices, setSelectedServices] = useState<string[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Load services for the multi-select.
  const [serviceList, setServiceList] = useState<{ id: string; name: string }[]>([]);
  useEffect(() => {
    servicesApi.list()
      .then((res: any) => {
        setServiceList(res.services?.map((s: any) => ({ id: s.id, name: s.name })) ?? []);
      })
      .catch(() => { /* silent — the field just stays empty */ });
  }, []);

  const toggleService = (id: string) => {
    setSelectedServices(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  };

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (submitting) return;
    if (title.trim().length < 3) {
      setError('Title must be at least 3 characters.');
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const res = await incidentsApi.create({
        title: title.trim(),
        severity,
        status,
        summary: summary.trim() || undefined,
        impact: impact.trim() || undefined,
        service_ids: selectedServices,
      }) as { id: string; title: string; status: string };

      notify(`Incident ${res.id} created`);
      onClose();
      // Jump straight to the incident detail.
      window.setTimeout(() => navigate(`/incidents/${res.id}`), 100);
    } catch (e: any) {
      setError(e?.message || 'Failed to create incident');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <ModalShell
      title="Report an incident"
      subtitle="Create a new incident and link it to affected services."
      onClose={onClose}
      footer={
        <div className="flex items-center justify-end gap-2">
          <button type="button" onClick={onClose} className="btn-secondary" disabled={submitting}>
            Cancel
          </button>
          <button
            type="submit"
            form="incident-form"
            className="btn-primary"
            disabled={submitting}
          >
            {submitting ? <Loader2 size={13} className="animate-spin" /> : <Plus size={13} />}
            {submitting ? 'Creating…' : 'Create incident'}
          </button>
        </div>
      }
    >
      <form id="incident-form" onSubmit={onSubmit} className="space-y-4">
        {error && <ErrorBanner message={error} />}

        <Field label="Title" required>
          <input
            className="input"
            placeholder="e.g. Checkout API latency spike"
            value={title}
            onChange={e => setTitle(e.target.value)}
            autoFocus
            required
            minLength={3}
            maxLength={200}
          />
        </Field>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Severity" required>
            <select className="input" value={severity} onChange={e => setSeverity(e.target.value)}>
              <option>Critical</option>
              <option>High</option>
              <option>Medium</option>
              <option>Low</option>
            </select>
          </Field>
          <Field label="Status">
            <select className="input" value={status} onChange={e => setStatus(e.target.value)}>
              <option>Open</option>
              <option>Investigating</option>
              <option>Monitoring</option>
              <option>Resolved</option>
            </select>
          </Field>
        </div>

        <Field label="Summary" hint="What happened?">
          <textarea
            className="input min-h-[80px] resize-y"
            placeholder="Describe the symptoms, when they started, and any recent changes."
            value={summary}
            onChange={e => setSummary(e.target.value)}
            maxLength={2000}
          />
        </Field>

        <Field label="Impact" hint="Who's affected?">
          <input
            className="input"
            placeholder="e.g. 18% of checkout attempts affected"
            value={impact}
            onChange={e => setImpact(e.target.value)}
            maxLength={1000}
          />
        </Field>

        <Field label="Affected services" hint="Optional">
          {serviceList.length === 0 ? (
            <p className="text-[11px] text-slate-500">No services available.</p>
          ) : (
            <div className="flex flex-wrap gap-1.5">
              {serviceList.map(s => {
                const selected = selectedServices.includes(s.id);
                return (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => toggleService(s.id)}
                    className={cx(
                      'inline-flex items-center gap-1.5 rounded-md border px-2 py-1.5 font-mono text-[10px] transition-colors',
                      selected
                        ? 'border-lime/50 bg-lime/10 text-lime'
                        : 'border-line bg-[#0e141c] text-slate-400 hover:border-slate-600',
                    )}
                  >
                    {selected && <Check size={10} />}
                    {s.name}
                  </button>
                );
              })}
            </div>
          )}
        </Field>
      </form>
    </ModalShell>
  );
}

// ============================================================
// Investigation modal — POST /api/v1/investigations
// ============================================================
function InvestigationModal({ onClose }: { onClose: () => void }) {
  const { notify } = useToast();
  const navigate = useNavigate();

  const [title, setTitle] = useState('');
  const [incidentId, setIncidentId] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Load incidents so the user can pick one.
  const [incidentList, setIncidentList] = useState<
    { id: string; title: string; severity: string; status: string }[]
  >([]);
  useEffect(() => {
    incidentsApi.list()
      .then((res: any) => {
        setIncidentList(res.incidents ?? []);
        // Auto-select the first Open incident.
        const firstOpen = (res.incidents ?? []).find((i: any) => i.status === 'Open');
        if (firstOpen) {
          setIncidentId(firstOpen.id);
          setTitle(`Investigate ${firstOpen.id}: ${firstOpen.title}`);
        }
      })
      .catch(() => { /* silent */ });
  }, []);

  // Update the default title when the incident changes.
  useEffect(() => {
    if (!incidentId) return;
    const inc = incidentList.find(i => i.id === incidentId);
    if (inc) setTitle(`Investigate ${inc.id}: ${inc.title}`);
  }, [incidentId, incidentList]);

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (submitting) return;
    if (!incidentId) {
      setError('Pick an incident to investigate.');
      return;
    }
    if (title.trim().length < 3) {
      setError('Title must be at least 3 characters.');
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const res = await investigationsApi.start({
        title: title.trim(),
        incident_id: incidentId,
      }) as { run_id: string; status: string; events_url: string };

      notify(`Investigation started (${res.run_id})`);
      onClose();
      // Jump to the run detail — the SSE stream starts there.
      window.setTimeout(() => navigate(`/runs/${res.run_id}`), 100);
    } catch (e: any) {
      setError(e?.message || 'Failed to start investigation');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <ModalShell
      title="Start an investigation"
      subtitle="Launch the agent workflow on an incident. Watch it live on the run page."
      onClose={onClose}
      footer={
        <div className="flex items-center justify-end gap-2">
          <button type="button" onClick={onClose} className="btn-secondary" disabled={submitting}>
            Cancel
          </button>
          <button
            type="submit"
            form="investigation-form"
            className="btn-primary"
            disabled={submitting || !incidentId}
          >
            {submitting ? <Loader2 size={13} className="animate-spin" /> : <Sparkles size={13} />}
            {submitting ? 'Starting…' : 'Start investigation'}
          </button>
        </div>
      }
    >
      <form id="investigation-form" onSubmit={onSubmit} className="space-y-4">
        {error && <ErrorBanner message={error} />}

        <InfoBanner message="The agent will walk the graph, retrieve past fixes, propose a rollback, and pause for your approval." />

        <Field label="Incident" required>
          {incidentList.length === 0 ? (
            <p className="text-[11px] text-slate-500">No incidents available. Report one first.</p>
          ) : (
            <select
              className="input"
              value={incidentId}
              onChange={e => setIncidentId(e.target.value)}
              required
            >
              <option value="">— Select an incident —</option>
              {incidentList.map(i => (
                <option key={i.id} value={i.id}>
                  {i.id} · {i.title} ({i.severity}, {i.status})
                </option>
              ))}
            </select>
          )}
        </Field>

        <Field label="Investigation title" required>
          <input
            className="input"
            value={title}
            onChange={e => setTitle(e.target.value)}
            required
            minLength={3}
            maxLength={300}
          />
        </Field>

        <Field label="Tracks" hint="All 3 enabled by default">
          <div className="flex flex-wrap gap-2">
            <span className="inline-flex items-center gap-1.5 rounded-md border border-lime/40 bg-lime/10 px-2 py-1 text-[10px] text-lime">
              <Check size={10} /> Connected data
            </span>
            <span className="inline-flex items-center gap-1.5 rounded-md border border-violet-400/40 bg-violet-400/10 px-2 py-1 text-[10px] text-violet-300">
              <Check size={10} /> Agent memory
            </span>
            <span className="inline-flex items-center gap-1.5 rounded-md border border-sky-400/40 bg-sky-400/10 px-2 py-1 text-[10px] text-sky-300">
              <Check size={10} /> Company brain
            </span>
          </div>
        </Field>
      </form>
    </ModalShell>
  );
}

// ============================================================
// Memory modal — POST /api/v1/memory
// ============================================================
function MemoryModal({ onClose }: { onClose: () => void }) {
  const { notify } = useToast();
  const { user } = useAuth();
  const canAct = ['Owner', 'Admin', 'Engineer'].includes(user?.role || '');

  const [type, setType] = useState('procedural');
  const [title, setTitle] = useState('');
  const [summary, setSummary] = useState('');
  const [confidence, setConfidence] = useState(0.7);
  const [entities, setEntities] = useState('');
  const [fixId, setFixId] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (submitting || !canAct) return;
    if (title.trim().length < 3) { setError('Title must be at least 3 characters.'); return; }
    if (summary.trim().length < 3) { setError('Summary must be at least 3 characters.'); return; }
    setSubmitting(true);
    setError(null);
    try {
      await memoryApi.create({
        type,
        title: title.trim(),
        summary: summary.trim(),
        confidence,
        entity_ids: entities
          .split(',')
          .map(s => s.trim())
          .filter(Boolean),
        fix_id: fixId.trim() || undefined,
      });
      notify('Memory saved');
      onClose();
    } catch (e: any) {
      setError(e?.message || 'Failed to save memory');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <ModalShell
      title="Add a memory"
      subtitle="Save a lesson, procedure, or fact the agent should recall in future runs."
      onClose={onClose}
      footer={
        <div className="flex items-center justify-end gap-2">
          <button type="button" onClick={onClose} className="btn-secondary" disabled={submitting}>
            Cancel
          </button>
          <button
            type="submit"
            form="memory-form"
            className="btn-primary"
            disabled={submitting || !canAct}
          >
            {submitting ? <Loader2 size={13} className="animate-spin" /> : <WandSparkles size={13} />}
            {submitting ? 'Saving…' : 'Save memory'}
          </button>
        </div>
      }
    >
      <form id="memory-form" onSubmit={onSubmit} className="space-y-4">
        {error && <ErrorBanner message={error} />}
        {!canAct && (
          <ErrorBanner message={`Your role (${user?.role}) can't create memories. Ask an Engineer or Admin.`} />
        )}

        <Field label="Type" required>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {[
              ['episodic', 'Episodic', 'Events'],
              ['semantic', 'Semantic', 'Facts'],
              ['procedural', 'Procedural', 'How-to'],
              ['policy', 'Policy', 'Constraints'],
            ].map(([value, label, hint]) => (
              <button
                key={value}
                type="button"
                onClick={() => setType(value)}
                className={cx(
                  'flex flex-col items-start rounded-lg border px-2.5 py-2 text-left transition-colors',
                  type === value
                    ? 'border-lime/50 bg-lime/10 text-lime'
                    : 'border-line bg-[#0e141c] text-slate-400 hover:border-slate-600',
                )}
              >
                <span className="text-[11px] font-semibold">{label}</span>
                <span className="mt-0.5 text-[9px] opacity-70">{hint}</span>
              </button>
            ))}
          </div>
        </Field>

        <Field label="Title" required>
          <input
            className="input"
            placeholder="e.g. Rollback procedure for checkout-api"
            value={title}
            onChange={e => setTitle(e.target.value)}
            required
            minLength={3}
            maxLength={200}
            autoFocus
          />
        </Field>

        <Field label="Summary" required>
          <textarea
            className="input min-h-[80px] resize-y"
            placeholder="Concise description the agent can act on."
            value={summary}
            onChange={e => setSummary(e.target.value)}
            required
            minLength={3}
            maxLength={500}
          />
        </Field>

        <Field label="Confidence" hint={`${Math.round(confidence * 100)}%`}>
          <input
            type="range"
            min="0"
            max="1"
            step="0.01"
            value={confidence}
            onChange={e => setConfidence(Number(e.target.value))}
            className="w-full accent-[#b9f56a]"
          />
        </Field>

        <Field label="Entities" hint="Comma-separated IDs">
          <input
            className="input font-mono text-xs"
            placeholder="svc-checkout, inc-2481, fix-rollback-sdk-3-1-8"
            value={entities}
            onChange={e => setEntities(e.target.value)}
          />
        </Field>

        <Field label="Supports fix" hint="Optional">
          <input
            className="input font-mono text-xs"
            placeholder="fix-rollback-sdk-3-1-8"
            value={fixId}
            onChange={e => setFixId(e.target.value)}
          />
        </Field>
      </form>
    </ModalShell>
  );
}

// ============================================================
// Confirm modal — used by RunDetailPage's "Reject" etc.
// ============================================================
function ConfirmModal({ onClose, payload }: { onClose: () => void; payload: any }) {
  const [busy, setBusy] = useState(false);

  const confirm = async () => {
    if (busy) return;
    setBusy(true);
    try {
      if (typeof payload?.action === 'function') {
        await payload.action();
      }
      onClose();
    } finally {
      setBusy(false);
    }
  };

  return (
    <ModalShell
      title={payload?.title || 'Confirm action'}
      subtitle={payload?.subtitle || 'Review this action before continuing.'}
      onClose={onClose}
      width="max-w-[440px]"
      footer={
        <div className="flex items-center justify-end gap-2">
          <button className="btn-secondary" onClick={onClose} disabled={busy}>
            Cancel
          </button>
          <button className="btn-primary" onClick={confirm} disabled={busy}>
            {busy ? <Loader2 size={13} className="animate-spin" /> : <Check size={13} />}
            {payload?.confirmLabel || 'Confirm'}
          </button>
        </div>
      }
    >
      <p className="text-sm leading-6 text-slate-300">
        {payload?.message || 'Are you sure you want to continue?'}
      </p>
    </ModalShell>
  );
}

// ============================================================
// Search modal — quick navigation
// ============================================================
function SearchModal({ onClose }: { onClose: () => void }) {
  const navigate = useNavigate();
  const [q, setQ] = useState('');

  const [incidents, setIncidents] = useState<any[]>([]);
  const [services, setServices] = useState<any[]>([]);
  const [runs, setRuns] = useState<any[]>([]);
  const [docs, setDocs] = useState<any[]>([]);

  useEffect(() => {
    Promise.allSettled([
      incidentsApi.list(),
      servicesApi.list(),
      fetch('/api/v1/runs').then(r => r.json()),
    ]).then(([incRes, svcRes, runRes]) => {
      if (incRes.status === 'fulfilled') setIncidents((incRes.value as any).incidents ?? []);
      if (svcRes.status === 'fulfilled') setServices((svcRes.value as any).services ?? []);
      if (runRes.status === 'fulfilled') setRuns((runRes.value as any).runs ?? []);
    }).catch(() => { /* silent */ });
  }, []);

  const results = useMemo(() => {
    const needle = q.toLowerCase().trim();
    const items: { kind: string; name: string; id: string; to: string; icon: any }[] = [];

    for (const i of incidents) {
      items.push({ kind: 'Incident', name: i.title, id: i.id, to: `/incidents/${i.id}`, icon: AlertTriangle });
    }
    for (const s of services) {
      items.push({ kind: 'Service', name: s.name, id: s.id, to: `/services/${s.id}`, icon: Server });
    }
    for (const r of runs) {
      items.push({ kind: 'Run', name: r.goal, id: r.run_id, to: `/runs/${r.run_id}`, icon: Zap });
    }

    if (!needle) return items.slice(0, 8);
    return items.filter(x => `${x.name} ${x.id} ${x.kind}`.toLowerCase().includes(needle)).slice(0, 12);
  }, [q, incidents, services, runs, docs]);

  const go = (to: string) => {
    onClose();
    window.setTimeout(() => navigate(to), 50);
  };

  return (
    <ModalShell
      title="Search workspace"
      subtitle="Jump to incidents, services, runs, and documents."
      onClose={onClose}
      width="max-w-[580px]"
    >
      <div className="relative mb-3">
        <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
        <input
          autoFocus
          className="input !pl-10 !py-2.5 text-sm"
          placeholder="Search by name or ID…"
          value={q}
          onChange={e => setQ(e.target.value)}
        />
        <span className="absolute right-3 top-1/2 -translate-y-1/2 rounded border border-line px-1.5 py-0.5 font-mono text-[9px] text-slate-600">
          ESC
        </span>
      </div>

      {results.length === 0 ? (
        <p className="py-6 text-center text-xs text-slate-500">No matches.</p>
      ) : (
        <div className="max-h-[400px] space-y-1 overflow-y-auto">
          {results.map((r, i) => {
            const Icon = r.icon;
            return (
              <button
                key={`${r.kind}-${r.id}-${i}`}
                onClick={() => go(r.to)}
                className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left hover:bg-[#1a232e]"
              >
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-line bg-[#18212c] text-slate-400">
                  <Icon size={14} />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-xs font-medium text-slate-200">{r.name}</span>
                  <span className="mt-0.5 block text-[10px] text-slate-500">
                    {r.kind} · {r.id}
                  </span>
                </span>
                <ArrowRight size={13} className="text-slate-600" />
              </button>
            );
          })}
        </div>
      )}
    </ModalShell>
  );
}

// ============================================================
// Notifications modal
// ============================================================
function NotificationsModal({ onClose }: { onClose: () => void }) {
  return (
    <ModalShell
      title="Notifications"
      subtitle="Updates from your workspace and agents."
      onClose={onClose}
      width="max-w-[520px]"
    >
      <div className="space-y-1">
        {[
          { icon: AlertTriangle, title: 'Critical incident detected', desc: 'checkout-api error rate reached 3.8%', time: '4 min ago' },
          { icon: BrainCircuit, title: 'Investigation completed', desc: 'Payment SDK timeout regression — 5 findings', time: '2 hr ago' },
          { icon: CheckCircle2, title: 'Memory written', desc: 'Rollback procedure added to the workspace', time: '3 hr ago' },
        ].map((n, i) => {
          const Icon = n.icon;
          return (
            <div key={i} className="flex gap-3 rounded-xl px-2 py-3">
              <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-lime/10 text-lime">
                <Icon size={15} />
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-xs font-semibold text-slate-200">{n.title}</p>
                <p className="mt-1 text-[11px] leading-5 text-slate-500">{n.desc}</p>
                <p className="mt-1.5 text-[10px] text-slate-600">{n.time}</p>
              </div>
            </div>
          );
        })}
      </div>
    </ModalShell>
  );
}

// ============================================================
// Keyboard shortcuts modal
// ============================================================
function KeyboardModal({ onClose }: { onClose: () => void }) {
  const shortcuts: [string, string][] = [
    ['Open search', '⌘ / Ctrl + K'],
    ['Close modal', 'Esc'],
    ['Go to overview', 'G then O'],
    ['Go to incidents', 'G then I'],
    ['Go to graph', 'G then G'],
    ['Go to runs', 'G then R'],
  ];
  return (
    <ModalShell
      title="Keyboard shortcuts"
      subtitle="Move around the workspace faster."
      onClose={onClose}
      width="max-w-[460px]"
    >
      <div className="divide-y divide-line">
        {shortcuts.map(([label, keys]) => (
          <div key={label} className="flex items-center justify-between py-3 text-xs">
            <span className="text-slate-300">{label}</span>
            <span className="rounded border border-line bg-[#0e141c] px-2 py-0.5 font-mono text-[10px] text-slate-400">
              {keys}
            </span>
          </div>
        ))}
      </div>
    </ModalShell>
  );
}

// ============================================================
// Help modal
// ============================================================
function HelpModal({ onClose }: { onClose: () => void }) {
  const items = [
    { icon: BookOpen, title: 'FalkorDB docs', desc: 'Query language and algorithm reference', url: 'https://docs.falkordb.com/' },
    { icon: Network, title: 'Graph model', desc: 'Node labels, relationship types, and queries', url: '#' },
    { icon: MessageSquare, title: 'Community', desc: 'Ask questions and share ideas', url: 'https://www.wemakedevs.org/hackathons/falkordb' },
  ];

  return (
    <ModalShell
      title="Help"
      subtitle="Quick resources for getting started."
      onClose={onClose}
      width="max-w-[520px]"
    >
      <div className="space-y-2">
        {items.map(it => {
          const Icon = it.icon;
          return (
            <a
              key={it.title}
              href={it.url}
              target="_blank"
              rel="noreferrer"
              onClick={onClose}
              className="flex items-center gap-3 rounded-xl border border-line bg-[#0e141c] p-3 hover:border-slate-600"
            >
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-[#222d39] text-lime">
                <Icon size={16} />
              </div>
              <div className="flex-1">
                <p className="text-xs font-semibold text-slate-200">{it.title}</p>
                <p className="mt-1 text-[10px] text-slate-500">{it.desc}</p>
              </div>
              <ArrowRight size={13} className="text-slate-600" />
            </a>
          );
        })}
      </div>
    </ModalShell>
  );
}

// ============================================================
// Fallback for modal types we haven't implemented
// ============================================================
function FallbackModal({ onClose, type }: { onClose: () => void; type: ModalType }) {
  return (
    <ModalShell title="Coming soon" subtitle={`Modal type: ${type}`} onClose={onClose} width="max-w-[420px]">
      <p className="text-xs text-slate-400">
        This modal ({type}) isn't wired yet. The other forms — Report incident, Start investigation,
        Add memory, and Search — are fully functional.
      </p>
    </ModalShell>
  );
}