import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import {
  AlertTriangle, BarChart3, Bell, BrainCircuit, Building2, Check,
  CheckCircle2, Download, Eye, EyeOff, KeyRound, Lock, LogOut,
  Mail, MessageSquare, Save, Shield, ShieldCheck, Trash2, User,
  Users, Zap,
} from 'lucide-react';
import { PageTitle } from '../components/ui/PageTitle';
import { Badge } from '../components/ui/Badge';
import { SectionHeading } from '../components/ui/SectionHeading';
import { Switch } from '../components/ui/Switch';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../contexts/ToastContext';
import { useModal } from '../contexts/ModalContext';
import { cx } from '../lib/utils';

// ============================================================
// Persistence — settings live in localStorage under one key
// ============================================================
type Settings = {
  workspaceName: string;
  region: string;
  retention: string;
  timezone: string;
  emailIncident: boolean;
  emailDigest: boolean;
  emailAgent: boolean;
  slackCritical: boolean;
  requireApproval: boolean;
  allowProductionWrites: boolean;
  autoMemory: boolean;
  memoryConfidence: number;
  primaryModel: string;
  fallbackModel: string;
  temperature: number;
  theme: 'dark' | 'light';
  mfa: boolean;
  sessionDuration: string;
};

const DEFAULTS: Settings = {
  workspaceName: 'Acme Engineering',
  region: 'India (Mumbai)',
  retention: '90 days',
  timezone: 'Asia/Kolkata',
  emailIncident: true,
  emailDigest: false,
  emailAgent: true,
  slackCritical: true,
  requireApproval: true,
  allowProductionWrites: false,
  autoMemory: true,
  memoryConfidence: 0.82,
  primaryModel: 'grok-4.7',
  fallbackModel: 'grok-build-0.1',
  temperature: 0.2,
  theme: 'dark',
  mfa: true,
  sessionDuration: '12 hours',
};

const STORAGE_KEY = 'graphops-settings-v1';

function loadSettings(): Settings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULTS;
    return { ...DEFAULTS, ...JSON.parse(raw) };
  } catch {
    return DEFAULTS;
  }
}

function saveSettings(s: Settings) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(s));
  } catch { /* ignore */ }
}

// ============================================================
// Tabs
// ============================================================
type TabId = 'profile' | 'workspace' | 'notifications' | 'ai' | 'security' | 'usage';

const TABS: { id: TabId; label: string; icon: typeof User }[] = [
  { id: 'profile',       label: 'Profile',        icon: User },
  { id: 'workspace',     label: 'Workspace',      icon: Building2 },
  { id: 'notifications', label: 'Notifications',  icon: Bell },
  { id: 'ai',            label: 'AI & agents',    icon: BrainCircuit },
  { id: 'security',      label: 'Security',       icon: ShieldCheck },
  { id: 'usage',         label: 'Usage & billing', icon: BarChart3 },
];

// ============================================================
// Page
// ============================================================
export function SettingsPage() {
  const [params, setParams] = useSearchParams();
  const { user, workspace } = useAuth();
  const { notify } = useToast();
  const { openModal } = useModal();

  const [settings, setSettings] = useState<Settings>(() => loadSettings());
  const [tab, setTab] = useState<TabId>(() => {
    const t = params.get('tab') as TabId | null;
    return TABS.some(x => x.id === t) ? (t as TabId) : 'workspace';
  });
  const [dirty, setDirty] = useState(false);

  // Sync tab with URL
  useEffect(() => {
    const next = params.get('tab') as TabId | null;
    if (next && TABS.some(x => x.id === next) && next !== tab) {
      setTab(next);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params]);

  const changeTab = (id: TabId) => {
    setTab(id);
    setParams({ tab: id }, { replace: true });
  };

  const update = <K extends keyof Settings>(key: K, value: Settings[K]) => {
    setSettings(prev => ({ ...prev, [key]: value }));
    setDirty(true);
  };

  const save = () => {
    saveSettings(settings);
    setDirty(false);
    notify('Settings saved');
  };

  const reset = () => {
    if (!confirm('Reset all settings to their defaults?')) return;
    setSettings(DEFAULTS);
    saveSettings(DEFAULTS);
    setDirty(false);
    notify('Settings reset to defaults');
  };

  return (
    <>
      <PageTitle
        eyebrow="Preferences / Configuration"
        title="Settings"
        description="Configure your workspace, agent behaviour, security controls, and notification preferences."
        actions={
          <>
            {dirty && (
              <span className="flex items-center gap-1.5 rounded-full border border-amber-400/30 bg-amber-400/10 px-3 py-1.5 text-[10px] font-semibold text-amber-200">
                <AlertTriangle size={11} /> Unsaved changes
              </span>
            )}
            <button className="btn-primary" onClick={save} disabled={!dirty}>
              <Save size={13} /> Save changes
            </button>
          </>
        }
      />

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[220px_1fr]">
        {/* Left sidebar */}
        <aside className="card h-fit p-2 lg:sticky lg:top-[88px]">
          <div className="px-3 py-3 text-[9px] font-bold uppercase tracking-widest text-slate-600">
            Preferences
          </div>
          {TABS.map(t => {
            const Icon = t.icon;
            const active = tab === t.id;
            return (
              <button
                key={t.id}
                onClick={() => changeTab(t.id)}
                className={cx(
                  'flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-xs font-semibold transition-colors',
                  active
                    ? 'bg-lime/10 text-lime'
                    : 'text-slate-400 hover:bg-[#1b2430] hover:text-slate-200',
                )}
              >
                <Icon size={15} />
                {t.label}
                {t.id === 'security' && settings.mfa && (
                  <span className="ml-auto h-1.5 w-1.5 rounded-full bg-lime" />
                )}
              </button>
            );
          })}
          <div className="border-t border-line my-2" />
          <button
            onClick={reset}
            className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-xs font-semibold text-slate-500 hover:bg-[#1b2430] hover:text-slate-300"
          >
            <Trash2 size={14} /> Reset defaults
          </button>
        </aside>

        {/* Right content */}
        <div className="min-w-0">
          {tab === 'profile' && <ProfileTab user={user} />}
          {tab === 'workspace' && (
            <WorkspaceTab
              settings={settings}
              onChange={update}
              onSave={save}
              dirty={dirty}
              workspace={workspace}
            />
          )}
          {tab === 'notifications' && (
            <NotificationsTab settings={settings} onChange={update} onSave={save} />
          )}
          {tab === 'ai' && (
            <AiTab settings={settings} onChange={update} onSave={save} />
          )}
          {tab === 'security' && (
            <SecurityTab settings={settings} onChange={update} onSave={save} openModal={openModal} />
          )}
          {tab === 'usage' && <UsageTab notify={notify} />}
        </div>
      </div>
    </>
  );
}

// ============================================================
// Profile tab
// ============================================================
function ProfileTab({ user }: { user: any }) {
  const { notify } = useToast();

  const [name, setName] = useState(user?.name || '');
  const [email, setEmail] = useState(user?.email || '');
  const [showAvatarTip, setShowAvatarTip] = useState(false);

  const initials = useMemo(
    () => name.split(' ').map((n: string) => n[0]).slice(0, 2).join('').toUpperCase(),
    [name],
  );

  return (
    <div className="space-y-4">
      <div className="card p-5 md:p-6">
        <SectionHeading title="Personal profile" subtitle="How you appear across the workspace" />

        <div className="mb-6 flex items-center gap-4">
          <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-lime text-xl font-bold text-[#111821]">
            {initials || 'U'}
          </div>
          <div>
            <p className="text-sm font-semibold text-slate-100">{name || 'Unnamed user'}</p>
            <p className="mt-1 text-[11px] text-slate-500">{email || 'no email'}</p>
            <button
              className="mt-2 text-[10px] font-semibold text-lime hover:text-[#d4ff9c]"
              onClick={() => notify('Avatar upload is not wired in demo mode.')}
            >
              Change avatar
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <label className="block">
            <span className="mb-1.5 block text-xs font-medium text-slate-300">Display name</span>
            <input
              className="input"
              value={name}
              onChange={e => setName(e.target.value)}
              disabled
            />
          </label>
          <label className="block">
            <span className="mb-1.5 block text-xs font-medium text-slate-300">Email address</span>
            <input
              className="input"
              value={email}
              onChange={e => setEmail(e.target.value)}
              disabled
            />
          </label>
          <label className="block">
            <span className="mb-1.5 block text-xs font-medium text-slate-300">Role</span>
            <input className="input" value={user?.role || 'Viewer'} disabled />
          </label>
          <label className="block">
            <span className="mb-1.5 block text-xs font-medium text-slate-300">User ID</span>
            <input className="input font-mono text-xs" value={user?.id || ''} disabled />
          </label>
        </div>

        <div className="mt-4 rounded-lg border border-line bg-[#0e141c] p-3 text-[10px] leading-5 text-slate-500">
          Profile fields are managed by the identity provider in demo mode. In production, these
          would be editable via <span className="font-mono">PATCH /api/v1/me</span>.
        </div>
      </div>
    </div>
  );
}

// ============================================================
// Workspace tab
// ============================================================
function WorkspaceTab({
  settings, onChange, onSave, dirty, workspace,
}: {
  settings: Settings;
  onChange: <K extends keyof Settings>(k: K, v: Settings[K]) => void;
  onSave: () => void;
  dirty: boolean;
  workspace: any;
}) {
  const { notify } = useToast();
  const { openModal } = useModal();

  return (
    <div className="space-y-4">
      <div className="card p-5 md:p-6">
        <SectionHeading title="Workspace details" subtitle="Identity and regional defaults" />
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <label className="block">
            <span className="mb-1.5 block text-xs font-medium text-slate-300">Workspace name</span>
            <input
              className="input"
              value={settings.workspaceName}
              onChange={e => onChange('workspaceName', e.target.value)}
            />
          </label>
          <label className="block">
            <span className="mb-1.5 block text-xs font-medium text-slate-300">Workspace ID</span>
            <input
              className="input font-mono text-xs"
              value={workspace?.id || 'acme'}
              disabled
            />
          </label>
          <label className="block">
            <span className="mb-1.5 block text-xs font-medium text-slate-300">Default region</span>
            <select
              className="input"
              value={settings.region}
              onChange={e => onChange('region', e.target.value)}
            >
              <option>India (Mumbai)</option>
              <option>US East</option>
              <option>Europe West</option>
              <option>Asia Pacific (Singapore)</option>
            </select>
          </label>
          <label className="block">
            <span className="mb-1.5 block text-xs font-medium text-slate-300">Data retention</span>
            <select
              className="input"
              value={settings.retention}
              onChange={e => onChange('retention', e.target.value)}
            >
              <option>30 days</option>
              <option>90 days</option>
              <option>180 days</option>
              <option>365 days</option>
            </select>
          </label>
        </div>
        <div className="mt-5 flex justify-end">
          <button className="btn-primary" onClick={onSave} disabled={!dirty}>
            <Save size={13} /> Save changes
          </button>
        </div>
      </div>

      <div className="card p-5">
        <SectionHeading
          title="Workspace members"
          subtitle="People with access to this workspace"
          action={
            <Link to="/team" className="text-[10px] font-semibold text-lime">
              Manage team
            </Link>
          }
        />
        <div className="flex items-center gap-3">
          <div className="flex -space-x-2">
            {['#b9f56a', '#a78bfa', '#61c8f3', '#f4a261'].map(c => (
              <div
                key={c}
                className="h-7 w-7 rounded-full border-2 border-[#121821]"
                style={{ background: c }}
              />
            ))}
          </div>
          <span className="text-xs text-slate-300">6 members in this workspace</span>
          <button
            className="btn-secondary ml-auto !px-2.5"
            onClick={() => openModal('invite')}
          >
            Invite
          </button>
        </div>
      </div>

      <div className="card border-rose-900/40 p-5">
        <h3 className="text-xs font-semibold text-rose-300">Danger zone</h3>
        <p className="mt-1 text-[11px] text-slate-500">
          Workspace deletion permanently removes connected context, agent memory, and settings.
        </p>
        <button
          className="btn-secondary mt-4 !border-rose-900/60 !text-rose-300 hover:!bg-rose-400/10"
          onClick={() =>
            openModal('confirm', {
              message: 'This demo will not delete a workspace. In production this requires strong authentication.',
              action: () => notify('Workspace deletion is disabled in demo mode.', 'error'),
            })
          }
        >
          <Trash2 size={13} /> Delete workspace
        </button>
      </div>
    </div>
  );
}

// ============================================================
// Notifications tab
// ============================================================
function NotificationsTab({
  settings, onChange, onSave,
}: {
  settings: Settings;
  onChange: <K extends keyof Settings>(k: K, v: Settings[K]) => void;
  onSave: () => void;
}) {
  const rows: { key: keyof Settings; title: string; desc: string; icon: any }[] = [
    {
      key: 'emailIncident',
      title: 'Incident alerts',
      desc: 'Notify me when a critical or high-severity incident is created.',
      icon: AlertTriangle,
    },
    {
      key: 'emailDigest',
      title: 'Weekly digest',
      desc: 'Summary of incidents, agent performance, and memory usage.',
      icon: Mail,
    },
    {
      key: 'emailAgent',
      title: 'Agent run failures',
      desc: 'Notify me when a production agent run fails or exceeds its time budget.',
      icon: Zap,
    },
    {
      key: 'slackCritical',
      title: 'Critical alerts to Slack',
      desc: 'Send high-priority incident summaries to the connected Slack channel.',
      icon: MessageSquare,
    },
  ];

  return (
    <div className="card p-5 md:p-6">
      <SectionHeading title="Notification preferences" subtitle="Choose which events reach you" />
      <div className="divide-y divide-line">
        {rows.map(row => {
          const Icon = row.icon;
          const value = settings[row.key] as boolean;
          return (
            <div key={String(row.key)} className="flex items-center gap-3 py-4">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[#202a35] text-slate-300">
                <Icon size={15} />
              </div>
              <div className="flex-1">
                <p className="text-xs font-semibold text-slate-200">{row.title}</p>
                <p className="mt-1 text-[11px] leading-5 text-slate-500">{row.desc}</p>
              </div>
              <Switch checked={value} onChange={v => onChange(row.key, v as any)} />
            </div>
          );
        })}
      </div>
      <div className="mt-5 flex justify-end">
        <button className="btn-primary" onClick={onSave}>
          <Save size={13} /> Save preferences
        </button>
      </div>
    </div>
  );
}

// ============================================================
// AI & agents tab
// ============================================================
function AiTab({
  settings, onChange, onSave,
}: {
  settings: Settings;
  onChange: <K extends keyof Settings>(k: K, v: Settings[K]) => void;
  onSave: () => void;
}) {
  return (
    <div className="space-y-4">
      <div className="card p-5 md:p-6">
        <SectionHeading title="Model routing" subtitle="Primary and fallback models used by the agent runtime" />
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <label className="block">
            <span className="mb-1.5 block text-xs font-medium text-slate-300">Primary model</span>
            <select
              className="input"
              value={settings.primaryModel}
              onChange={e => onChange('primaryModel', e.target.value)}
            >
              <option>grok-4.7</option>
              <option>grok-4.6</option>
              <option>grok-4.5</option>
              <option>grok-4.3</option>
            </select>
          </label>
          <label className="block">
            <span className="mb-1.5 block text-xs font-medium text-slate-300">Fallback model</span>
            <select
              className="input"
              value={settings.fallbackModel}
              onChange={e => onChange('fallbackModel', e.target.value)}
            >
              <option>grok-build-0.1</option>
              <option>grok-4.3</option>
              <option>None</option>
            </select>
          </label>
        </div>

        <div className="mt-5">
          <div className="mb-2 flex items-center justify-between">
            <span className="text-xs font-medium text-slate-300">Temperature</span>
            <span className="font-mono text-xs text-lime">{settings.temperature.toFixed(2)}</span>
          </div>
          <input
            type="range"
            min="0"
            max="1"
            step="0.05"
            value={settings.temperature}
            onChange={e => onChange('temperature', Number(e.target.value))}
            className="w-full accent-[#b9f56a]"
          />
          <div className="mt-1 flex justify-between text-[9px] text-slate-600">
            <span>Deterministic</span>
            <span>Creative</span>
          </div>
        </div>

        <div className="mt-5 flex items-center gap-3 rounded-xl border border-[#2b3a2b] bg-[#141e17] p-3">
          <BrainCircuit size={17} className="text-lime" />
          <div className="flex-1">
            <p className="text-xs font-semibold text-slate-200">FalkorDB graph context</p>
            <p className="mt-1 text-[10px] text-slate-500">
              The LLM never writes Cypher — every query goes through allow-listed templates.
            </p>
          </div>
          <Badge tone="green">Connected</Badge>
        </div>
      </div>

      <div className="card p-5 md:p-6">
        <SectionHeading title="Agent memory behaviour" subtitle="How the agent learns and acts" />
        <SettingRow
          title="Automatically save run summaries"
          desc="Write episodic memories after a completed run."
          right={
            <Switch
              checked={settings.autoMemory}
              onChange={v => onChange('autoMemory', v)}
            />
          }
        />
        <SettingRow
          title="Require human approval for production actions"
          desc="Agents can propose actions, but cannot execute without an explicit approval."
          right={
            <Switch
              checked={settings.requireApproval}
              onChange={v => onChange('requireApproval', v)}
            />
          }
        />
        <SettingRow
          title="Allow direct production writes"
          desc="Enable agent-initiated production changes. Keep disabled unless your policy allows it."
          right={
            <Switch
              checked={settings.allowProductionWrites}
              onChange={v => onChange('allowProductionWrites', v)}
            />
          }
        />

        <div className="mt-5 border-t border-line pt-5">
          <div className="mb-2 flex items-center justify-between">
            <span className="text-xs font-medium text-slate-300">Minimum memory confidence</span>
            <span className="font-mono text-xs text-lime">
              {Math.round(settings.memoryConfidence * 100)}%
            </span>
          </div>
          <input
            type="range"
            min="0.5"
            max="1"
            step="0.01"
            value={settings.memoryConfidence}
            onChange={e => onChange('memoryConfidence', Number(e.target.value))}
            className="w-full accent-[#b9f56a]"
          />
          <p className="mt-2 text-[10px] text-slate-500">
            Only memories above this confidence are recalled by default.
          </p>
        </div>

        <div className="mt-5 flex justify-end">
          <button className="btn-primary" onClick={onSave}>
            <Save size={13} /> Save agent settings
          </button>
        </div>
      </div>
    </div>
  );
}

function SettingRow({
  title, desc, right,
}: { title: string; desc: string; right: React.ReactNode }) {
  return (
    <div className="flex items-center gap-4 border-b border-line py-4 last:border-b-0">
      <div className="flex-1">
        <p className="text-xs font-semibold text-slate-200">{title}</p>
        <p className="mt-1 text-[11px] leading-5 text-slate-500">{desc}</p>
      </div>
      {right}
    </div>
  );
}

// ============================================================
// Security tab
// ============================================================
function SecurityTab({
  settings, onChange, onSave, openModal,
}: {
  settings: Settings;
  onChange: <K extends keyof Settings>(k: K, v: Settings[K]) => void;
  onSave: () => void;
  openModal: any;
}) {
  const { notify } = useToast();

  return (
    <div className="space-y-4">
      <div className="card p-5 md:p-6">
        <SectionHeading title="Authentication & sessions" subtitle="Protect workspace access" />

        <SettingRow
          title="Multi-factor authentication"
          desc="Require a second factor on sign-in."
          right={<Switch checked={settings.mfa} onChange={v => onChange('mfa', v)} />}
        />

        <div className="border-t border-line py-4">
          <label className="block max-w-xs">
            <span className="mb-1.5 block text-xs font-medium text-slate-300">Session duration</span>
            <select
              className="input"
              value={settings.sessionDuration}
              onChange={e => onChange('sessionDuration', e.target.value)}
            >
              <option>1 hour</option>
              <option>4 hours</option>
              <option>12 hours</option>
              <option>24 hours</option>
              <option>7 days</option>
            </select>
          </label>
        </div>

        <div className="border-t border-line py-4">
          <div className="flex items-start gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-lime/10 text-lime">
              <KeyRound size={16} />
            </div>
            <div className="flex-1">
              <p className="text-xs font-semibold text-slate-200">API keys</p>
              <p className="mt-1 text-[11px] text-slate-500">
                Manage service tokens for agent runtime and integrations.
              </p>
            </div>
            <button
              className="btn-secondary"
              onClick={() =>
                openModal('confirm', {
                  message: 'Rotate the demo API key? No real key is stored in this prototype.',
                  action: () => notify('Demo API key rotated.'),
                })
              }
            >
              Manage keys
            </button>
          </div>
        </div>

        <div className="border-t border-line py-4">
          <div className="flex items-start gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-sky-400/10 text-sky-300">
              <Shield size={16} />
            </div>
            <div className="flex-1">
              <p className="text-xs font-semibold text-slate-200">Audit log</p>
              <p className="mt-1 text-[11px] text-slate-500">
                Review sign-ins, settings changes, and approval decisions.
              </p>
            </div>
            <button
              className="btn-secondary"
              onClick={() =>
                openModal('confirm', {
                  message: 'Audit log export is available in the connected backend only.',
                  action: () => notify('Audit log export prepared in demo mode.'),
                })
              }
            >
              Export log <Download size={12} />
            </button>
          </div>
        </div>

        <div className="mt-3 flex justify-end">
          <button className="btn-primary" onClick={onSave}>
            <Save size={13} /> Save security
          </button>
        </div>
      </div>

      <div className="card p-5">
        <SectionHeading title="Security posture" />
        <div className="flex items-center gap-3 rounded-xl border border-[#2c4930] bg-[#15231a] p-3">
          <ShieldCheck size={20} className="text-lime" />
          <div className="flex-1">
            <p className="text-xs font-semibold text-slate-100">
              {settings.mfa && settings.requireApproval && !settings.allowProductionWrites
                ? 'Good security baseline'
                : 'Review your settings'}
            </p>
            <p className="mt-1 text-[10px] text-slate-500">
              {settings.mfa ? 'MFA enabled' : 'MFA disabled'} ·{' '}
              {settings.requireApproval ? 'Approval required' : 'No approval gate'} ·{' '}
              {settings.allowProductionWrites ? 'Production writes ON' : 'Production writes off'}
            </p>
          </div>
          <Badge tone={settings.mfa && settings.requireApproval && !settings.allowProductionWrites ? 'green' : 'yellow'}>
            {settings.mfa && settings.requireApproval && !settings.allowProductionWrites ? 'Good' : 'Review'}
          </Badge>
        </div>
      </div>
    </div>
  );
}

// ============================================================
// Usage tab
// ============================================================
function UsageTab({ notify }: { notify: (m: string, t?: any) => void }) {
  const used = 182.64;
  const budget = 300;
  const pct = Math.round((used / budget) * 100);

  const byModel: [string, number, number][] = [
    ['grok-4.7', 96.22, 53],
    ['grok-4.6', 48.14, 26],
    ['grok-build-0.1', 38.28, 21],
  ];

  return (
    <div className="space-y-4">
      <div className="card p-5 md:p-6">
        <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-start">
          <div>
            <SectionHeading
              title="Usage overview"
              subtitle="Representative mock usage for this billing period"
            />
            <p className="text-2xl font-semibold text-slate-100">
              ${used.toFixed(2)} <span className="text-xs font-normal text-slate-500">/ ${budget.toFixed(2)} budget</span>
            </p>
          </div>
          <Badge tone="green">Within budget</Badge>
        </div>

        <div className="mt-4 h-2 overflow-hidden rounded-full bg-[#2a3440]">
          <div
            className={cx(
              'h-full rounded-full transition-all',
              pct < 75 ? 'bg-lime' : pct < 90 ? 'bg-amber-400' : 'bg-rose-400',
            )}
            style={{ width: `${pct}%` }}
          />
        </div>
        <div className="mt-2 flex justify-between text-[10px] text-slate-500">
          <span>{pct}% used</span>
          <span>Resets Nov 01, 2026</span>
        </div>

        <div className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-3">
          <div className="rounded-xl bg-[#0e141c] p-4">
            <p className="text-[10px] text-slate-500">Agent executions</p>
            <p className="mt-2 text-xl font-semibold text-slate-100">4,218</p>
          </div>
          <div className="rounded-xl bg-[#0e141c] p-4">
            <p className="text-[10px] text-slate-500">Tokens processed</p>
            <p className="mt-2 text-xl font-semibold text-slate-100">8.42M</p>
          </div>
          <div className="rounded-xl bg-[#0e141c] p-4">
            <p className="text-[10px] text-slate-500">Graph queries</p>
            <p className="mt-2 text-xl font-semibold text-slate-100">82.1k</p>
          </div>
        </div>
      </div>

      <div className="card p-5">
        <SectionHeading title="Usage by model" />
        <div className="space-y-4">
          {byModel.map(([name, cost, share]) => (
            <div key={name}>
              <div className="mb-1.5 flex justify-between text-[11px]">
                <span className="font-mono text-slate-300">{name}</span>
                <span className="font-mono text-slate-400">
                  ${cost.toFixed(2)} · {share}%
                </span>
              </div>
              <div className="h-2 overflow-hidden rounded-full bg-[#27313d]">
                <div
                  className="h-full rounded-full bg-violet-300"
                  style={{ width: `${share}%` }}
                />
              </div>
            </div>
          ))}
        </div>
        <button
          className="btn-secondary mt-5"
          onClick={() => notify('Detailed usage report exported in demo mode.')}
        >
          <Download size={13} /> Export usage report
        </button>
      </div>
    </div>
  );
}