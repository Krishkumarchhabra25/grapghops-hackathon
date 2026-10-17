import { useMemo, useState } from 'react';
import {
  Activity, AlertCircle, ArrowRight, ArrowUpRight, Bell, BellRing,
  Check, CheckCircle2, ExternalLink, Github, GitBranch, LayoutList,
  Loader2, MessageSquare, Network, Plus, RefreshCw, Settings, Shield,
  Slack, Webhook, Workflow, X, Zap,
} from 'lucide-react';
import { PageTitle } from '../components/ui/PageTitle';
import { StatCard } from '../components/ui/StatCard';
import { Badge, type BadgeTone } from '../components/ui/Badge';
import { EmptyState } from '../components/ui/EmptyState';
import { SectionHeading } from '../components/ui/SectionHeading';
import { useToast } from '../contexts/ToastContext';
import { cx } from '../lib/utils';

// ============================================================
// Types
// ============================================================
type Integration = {
  id: string;
  name: string;
  category: string;
  description: string;
  connected: boolean;
  detail: string;
  docsUrl: string;
  color: string;
  icon: React.ComponentType<{ size?: number; className?: string }>;
  scopes?: string[];
};

// ============================================================
// Catalogue — six demo integrations matching the original mock
// ============================================================
const INITIAL: Integration[] = [
  {
    id: 'github',
    name: 'GitHub',
    category: 'Code & deployments',
    description: 'Connect repositories, pull requests, commits, and deployment events.',
    connected: true,
    detail: 'acme / 8 repositories',
    docsUrl: 'https://docs.github.com/en/rest',
    color: '#e6edf3',
    icon: Github,
    scopes: ['repo:read', 'pull_requests:read', 'deployments:read'],
  },
  {
    id: 'datadog',
    name: 'Datadog',
    category: 'Observability',
    description: 'Bring in metrics, monitors, traces, and incident context.',
    connected: true,
    detail: '3 monitors active',
    docsUrl: 'https://docs.datadoghq.com/api/',
    color: '#a78bfa',
    icon: Activity,
    scopes: ['metrics:read', 'monitors:read', 'apm:read'],
  },
  {
    id: 'pagerduty',
    name: 'PagerDuty',
    category: 'Incident management',
    description: 'Sync on-call alerts and incident status updates.',
    connected: true,
    detail: 'Connected workspace',
    docsUrl: 'https://developer.pagerduty.com/api-reference/',
    color: '#57e0b0',
    icon: BellRing,
    scopes: ['incidents:read', 'incidents:write', 'schedules:read'],
  },

];

const FILTER_TABS = ['All', 'Connected', 'Not connected'] as const;

// ============================================================
// Page
// ============================================================
export function IntegrationsPage() {
  const { notify } = useToast();

  const [integrations, setIntegrations] = useState<Integration[]>(INITIAL);
  const [filter, setFilter] = useState<typeof FILTER_TABS[number]>('All');
  const [busyId, setBusyId] = useState<string | null>(null);
  const [manageId, setManageId] = useState<string | null>(null);

  const filtered = useMemo(() => {
    return integrations.filter(i => {
      if (filter === 'Connected' && !i.connected) return false;
      if (filter === 'Not connected' && i.connected) return false;
      return true;
    });
  }, [integrations, filter]);

  const total = integrations.length;
  const connected = integrations.filter(i => i.connected).length;
  const eventsToday = connected * 812; // demo metric derived from connected count

  const toggle = async (id: string) => {
    if (busyId) return;
    setBusyId(id);
    // Simulate an OAuth round-trip with a short delay so the toast feels real.
    await new Promise(r => setTimeout(r, 700));
    setIntegrations(prev => prev.map(i => {
      if (i.id !== id) return i;
      const next = !i.connected;
      return {
        ...i,
        connected: next,
        detail: next ? 'Connected just now' : 'Not connected',
      };
    }));
    const item = integrations.find(i => i.id === id);
    notify(
      `${item?.name || 'Integration'} ${item?.connected ? 'disconnected' : 'connected'}`,
      item?.connected ? 'error' : 'success',
    );
    setBusyId(null);
  };

  const managed = integrations.find(i => i.id === manageId) || null;

  return (
    <>
      <PageTitle
        eyebrow="Manage / Connections"
        title="Integrations"
        description="Connect your engineering tools so agents can understand code changes, telemetry, incident history, and team workflows."
        actions={
          <button
            className="btn-secondary"
            onClick={() => notify('Integration catalogue refreshed.')}
          >
            <RefreshCw size={13} /> Refresh
          </button>
        }
      />

      {/* Stats */}
      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Available" value={total} icon={Zap} />
        <StatCard
          label="Connected"
          value={connected}
          icon={CheckCircle2}
          accent="lime"
          description={total > 0 ? `${Math.round((connected / total) * 100)}% of catalogue` : undefined}
        />
        <StatCard
          label="Events today"
          value={eventsToday.toLocaleString()}
          icon={Webhook}
          accent="blue"
          description="Across connected integrations"
        />
        <StatCard
          label="Last sync"
          value="18s"
          icon={RefreshCw}
          accent="violet"
          description="Continuous polling"
        />
      </div>

      {/* Filters */}
      <div className="mb-4 flex gap-1 rounded-lg bg-[#121821] p-1 sm:w-fit">
        {FILTER_TABS.map(f => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={cx(
              'rounded-md px-3 py-1.5 text-[11px] font-semibold transition-colors',
              filter === f ? 'bg-[#2a3542] text-white' : 'text-slate-500 hover:text-slate-300',
            )}
          >
            {f}
            {f === 'All' && <span className="ml-1.5 text-[9px] text-slate-500">{total}</span>}
            {f === 'Connected' && <span className="ml-1.5 text-[9px] text-slate-500">{connected}</span>}
            {f === 'Not connected' && (
              <span className="ml-1.5 text-[9px] text-slate-500">{total - connected}</span>
            )}
          </button>
        ))}
      </div>

      {/* Grid */}
      {filtered.length === 0 ? (
        <div className="card">
          <EmptyState
            icon={Zap}
            title="No integrations match"
            description="Try another filter."
            action={
              <button className="btn-secondary" onClick={() => setFilter('All')}>
                Show all
              </button>
            }
          />
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
          {filtered.map(i => (
            <IntegrationCard
              key={i.id}
              integration={i}
              busy={busyId === i.id}
              onToggle={() => toggle(i.id)}
              onManage={() => setManageId(i.id)}
            />
          ))}
        </div>
      )}

      {/* Custom integration CTA */}
      <div className="mt-5 card flex flex-col gap-3 p-5 sm:flex-row sm:items-center">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-lime/10 text-lime">
          <Workflow size={18} />
        </div>
        <div className="flex-1">
          <h3 className="text-xs font-semibold text-slate-100">Build a custom integration</h3>
          <p className="mt-1 text-[11px] text-slate-500">
            Use webhooks and the GraphOps API to connect your own systems or internal tools.
          </p>
        </div>
        <button
          className="btn-secondary"
          onClick={() => notify('Developer guide opened in demo mode.')}
        >
          View developer guide <ArrowUpRight size={12} />
        </button>
      </div>

      {/* Manage modal */}
      {managed && (
        <ManageModal
          integration={managed}
          onClose={() => setManageId(null)}
          onToggle={() => { toggle(managed.id); setManageId(null); }}
        />
      )}
    </>
  );
}

// ============================================================
// Integration card
// ============================================================
function IntegrationCard({
  integration,
  busy,
  onToggle,
  onManage,
}: {
  integration: Integration;
  busy: boolean;
  onToggle: () => void;
  onManage: () => void;
}) {
  const Icon = integration.icon;

  return (
    <div className="card flex flex-col p-5 transition-colors hover:border-[#394757]">
      <div className="flex items-start justify-between">
        <div
          className="flex h-11 w-11 items-center justify-center rounded-xl border border-line bg-[#1b2430]"
          style={{ color: integration.color }}
        >
          <Icon size={20} />
        </div>
        <Badge tone={integration.connected ? 'green' : 'blue'}>
          {integration.connected ? 'Connected' : 'Available'}
        </Badge>
      </div>

      <div className="mt-4">
        <h3 className="text-sm font-semibold text-slate-100">{integration.name}</h3>
        <p className="mt-1 text-[10px] text-slate-500">{integration.category}</p>
        <p className="mt-3 min-h-[42px] text-[11px] leading-5 text-slate-400">
          {integration.description}
        </p>
      </div>

      <div className="mt-4 flex items-center gap-2 rounded-lg bg-[#0e141c] px-3 py-2">
        <span className={cx(
          'h-1.5 w-1.5 rounded-full',
          integration.connected ? 'bg-lime' : 'bg-slate-600',
        )} />
        <span className="text-[10px] text-slate-500">{integration.detail}</span>
      </div>

      <div className="mt-4 flex gap-2">
        {integration.connected ? (
          <button className="btn-secondary flex-1" onClick={onManage}>
            <Settings size={12} /> Manage
          </button>
        ) : (
          <button className="btn-primary flex-1" onClick={onToggle} disabled={busy}>
            {busy ? <Loader2 size={13} className="animate-spin" /> : <Plus size={13} />}
            {busy ? 'Connecting…' : 'Connect'}
          </button>
        )}
        <a
          href={integration.docsUrl}
          target="_blank"
          rel="noreferrer"
          className="btn-secondary !px-3"
          title="Open docs"
        >
          <ExternalLink size={13} />
        </a>
      </div>
    </div>
  );
}

// ============================================================
// Manage modal
// ============================================================
function ManageModal({
  integration,
  onClose,
  onToggle,
}: {
  integration: Integration;
  onClose: () => void;
  onToggle: () => void;
}) {
  const Icon = integration.icon;

  return (
    <div
      className="fixed inset-0 z-[90] flex items-center justify-center bg-black/70 p-3 backdrop-blur-sm"
      onMouseDown={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="w-full max-w-[560px] overflow-hidden rounded-2xl border border-[#303b49] bg-[#111821] shadow-[0_30px_100px_rgba(0,0,0,.55)]">
        <div className="flex items-start justify-between border-b border-line px-5 py-4">
          <div className="flex items-center gap-3">
            <div
              className="flex h-10 w-10 items-center justify-center rounded-xl border border-line bg-[#1b2430]"
              style={{ color: integration.color }}
            >
              <Icon size={18} />
            </div>
            <div>
              <h2 className="text-sm font-semibold text-slate-100">{integration.name}</h2>
              <p className="mt-0.5 text-[10px] text-slate-500">{integration.category}</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-1.5 text-slate-500 hover:bg-[#202a34] hover:text-white"
          >
            <X size={16} />
          </button>
        </div>

        <div className="p-5">
          {/* Status panel */}
          <div className="mb-4 flex items-center gap-3 rounded-xl border border-[#2a4730] bg-[#142019] p-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-lime/10 text-lime">
              <CheckCircle2 size={16} />
            </div>
            <div className="flex-1">
              <p className="text-xs font-semibold text-slate-100">Active connection</p>
              <p className="mt-1 text-[10px] text-slate-500">{integration.detail}</p>
            </div>
            <Badge tone="green">Connected</Badge>
          </div>

          {/* Scopes */}
          {integration.scopes && integration.scopes.length > 0 && (
            <div className="mb-4">
              <SectionHeading
                title="Granted scopes"
                subtitle="Permissions the integration was granted"
              />
              <div className="space-y-1.5">
                {integration.scopes.map(s => (
                  <div
                    key={s}
                    className="flex items-center gap-2 rounded-lg border border-line bg-[#0e141c] px-3 py-2"
                  >
                    <Shield size={12} className="text-lime" />
                    <span className="font-mono text-[10px] text-slate-300">{s}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Info banner */}
          <div className="flex items-start gap-2 rounded-lg border border-[#33472f] bg-[#141e17] p-3 text-[11px] text-slate-400">
            <Shield size={13} className="mt-0.5 shrink-0 text-lime" />
            <span>
              Demo mode: connect/disconnect only updates local state. No OAuth flow is triggered
              and no external requests are made.
            </span>
          </div>
        </div>

        <div className="flex items-center justify-between gap-2 border-t border-line bg-[#0d131b] px-5 py-3">
          <button
            className="btn-secondary !border-rose-900/60 !text-rose-300 hover:!bg-rose-400/10"
            onClick={onToggle}
          >
            Disconnect
          </button>
          <div className="flex gap-2">
            <button className="btn-secondary" onClick={onClose}>
              Close
            </button>
            <button className="btn-primary" onClick={onClose}>
              <Check size={13} /> Save
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}