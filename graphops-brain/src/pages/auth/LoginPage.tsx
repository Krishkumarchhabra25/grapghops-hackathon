import { FormEvent, useState } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { ArrowLeft, ArrowRight, AtSign, Eye, EyeOff, LockKeyhole, Network, Sparkles } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { useToast } from '../../contexts/ToastContext';

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

  return (
    <div className="relative flex min-h-screen items-center justify-center bg-ink px-4">
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

        <div className="my-6 rounded-xl border border-[#2b4930] bg-[#142018] p-3">
          <div className="flex items-center gap-2 text-[11px] font-semibold text-lime">
            <Sparkles size={14} /> Demo environment
          </div>
          <p className="mt-1.5 text-[10px] leading-5 text-slate-500">
            Use the pre-filled demo account. Auth is backed by the FastAPI server on port 8000.
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
              <Link to="/forgot-password" className="text-[10px] font-semibold text-lime hover:text-[#d4ff9c]">
                Forgot password?
              </Link>
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

        <p className="mt-7 text-center text-[11px] text-slate-500">
          New to GraphOps? <Link to="/signup" className="font-semibold text-lime hover:text-[#d4ff9c]">Create an account</Link>
        </p>
      </div>
    </div>
  );
}