import { FormEvent, useState } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { ArrowRight, AtSign, Eye, EyeOff, LockKeyhole, Network, Shield, User, Wrench } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { useToast } from '../../contexts/ToastContext';
import { cx } from '../../lib/utils';

// Define the specific demo users for the judges
const DEMO_USERS = [
  { 
    role: 'Owner', 
    name: 'Krish', 
    email: 'krish@graphops.dev', 
    icon: Shield,
    color: 'text-lime', 
    bg: 'bg-lime/10', 
    border: 'border-lime/20',
    hover: 'hover:border-lime/50 hover:bg-lime/20'
  },
  { 
    role: 'Engineer', 
    name: 'Ananya', 
    email: 'ananya@graphops.dev', 
    icon: Wrench,
    color: 'text-sky-300', 
    bg: 'bg-sky-400/10', 
    border: 'border-sky-400/20',
    hover: 'hover:border-sky-400/50 hover:bg-sky-400/20'
  },
  { 
    role: 'Viewer', 
    name: 'Neha', 
    email: 'neha@graphops.dev', 
    icon: User,
    color: 'text-amber-300', 
    bg: 'bg-amber-400/10', 
    border: 'border-amber-400/20',
    hover: 'hover:border-amber-400/50 hover:bg-amber-400/20'
  },
];

export function LoginPage() {
  const [email, setEmail] = useState('krish@graphops.dev');
  const [password, setPassword] = useState('graphops-demo');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const { login } = useAuth();
  const { notify } = useToast();
  const navigate = useNavigate();
  const location = useLocation();

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      await login(email, password);
      notify('Welcome back!');
      const from = (location.state as any)?.from || '/';
      navigate(from, { replace: true });
    } catch (err: any) {
      notify(err?.message || 'Login failed', 'error');
    } finally {
      setLoading(false);
    }
  };

  const fillCredentials = (demoEmail: string) => {
    setEmail(demoEmail);
    setPassword('graphops-demo');
    notify(`Autofilled credentials for ${demoEmail}`);
  };

  return (
    <div className="relative flex min-h-screen items-center justify-center bg-ink px-4 py-10">
      <div className="absolute inset-0 grid-bg opacity-40" />
      <div className="absolute -left-40 -top-40 h-[460px] w-[460px] rounded-full bg-lime/5 blur-[110px]" />
      
      <div className="relative z-10 w-full max-w-[420px]">
        <Link to="/login" className="mb-8 flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-lime text-[#14200b]">
            <Network size={20} />
          </div>
          <div>
            <div className="text-sm font-bold">graphops<span className="text-lime">.</span></div>
            <p className="mt-0.5 text-[9px] font-bold uppercase tracking-[.2em] text-slate-500">AI reliability platform</p>
          </div>
        </Link>

        <h2 className="text-[28px] font-semibold tracking-[-.04em]">Sign in to GraphOps</h2>
        <p className="mt-2 text-[12px] leading-5 text-slate-500">Continue to your engineering intelligence workspace.</p>

        {/* Quick Demo Access for Judges */}
        <div className="mt-5 mb-6 rounded-xl border border-line bg-[#0f151d] p-3">
          <p className="mb-2 text-[10px] font-bold uppercase tracking-widest text-slate-500">
            Hackathon Judge Quick Access
          </p>
          <div className="grid grid-cols-3 gap-2">
            {DEMO_USERS.map(u => {
              const Icon = u.icon;
              return (
                <button
                  key={u.role}
                  type="button"
                  onClick={() => fillCredentials(u.email)}
                  className={cx(
                    'flex flex-col items-center justify-center rounded-lg border p-2 transition-colors',
                    u.bg, u.border, u.hover
                  )}
                >
                  <Icon size={14} className={cx('mb-1', u.color)} />
                  <span className={cx('text-[11px] font-semibold', u.color)}>{u.role}</span>
                  <span className="text-[9px] text-slate-500">{u.name}</span>
                </button>
              );
            })}
          </div>
          <p className="mt-2 text-center text-[9px] text-slate-600">
            Password for all users: <span className="font-mono text-slate-400">graphops-demo</span>
          </p>
        </div>
    
        <form onSubmit={onSubmit} className="space-y-4">
          <label className="block">
            <span className="mb-1.5 block text-xs font-medium text-slate-300">Work email</span>
            <div className="relative">
              <AtSign size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
              <input
                type="email" required
                className="input !pl-10"
                value={email}
                onChange={e => setEmail(e.target.value)}
              />
            </div>
          </label>

          <label className="block">
            <div className="mb-1.5 flex items-center justify-between">
              <span className="text-xs font-medium text-slate-300">Password</span>
            </div>
            <div className="relative">
              <LockKeyhole size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
              <input
                required
                type={showPassword ? 'text' : 'password'}
                className="input !pl-10 !pr-10"
                value={password}
                onChange={e => setPassword(e.target.value)}
              />
              <button
                type="button"
                onClick={() => setShowPassword(v => !v)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-white"
              >
                {showPassword ? <EyeOff size={15} /> : <Eye size={15} />}
              </button>
            </div>
          </label>

          <button disabled={loading} type="submit" className="btn-primary w-full !py-3">
            {loading ? 'Signing in…' : 'Sign in to workspace'}
            {!loading && <ArrowRight size={14} />}
          </button>
        </form>
      </div>
    </div>
  );
}