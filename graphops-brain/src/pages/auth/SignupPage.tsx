import { FormEvent, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ArrowLeft, ArrowRight, Info, LockKeyhole, Mail, User } from 'lucide-react';
import { AuthLayout } from '../../components/layout/AuthLayout';
import { useToast } from '../../contexts/ToastContext';

/**
 * Signup is NOT wired to the backend — the spec only defines /auth/login.
 * In production, users are created via `python -m scripts.seed_auth`.
 * This page renders the UX and redirects to /login with an explanation.
 */
export function SignupPage() {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [agree, setAgree] = useState(false);
  const navigate = useNavigate();
  const { notify } = useToast();

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (!agree) {
      notify('Please accept the demo terms to continue.', 'error');
      return;
    }
    notify('Signup is disabled in this demo — use the pre-seeded account.', 'info');
    // Send them to /login with their email pre-typed so they don't retype.
    window.setTimeout(() => {
      navigate('/login', { state: { email } });
    }, 800);
  };

  return (
    <AuthLayout
      heading="Create your workspace"
      subheading="Demo mode — signup is disabled. Use the pre-seeded account to explore."
    >
      <div className="mb-5 rounded-xl border border-[#33472f] bg-[#141e17] p-3">
        <div className="flex items-start gap-2">
          <Info size={14} className="mt-0.5 shrink-0 text-lime" />
          <div>
            <p className="text-[11px] font-semibold text-lime">How to get access</p>
            <p className="mt-1 text-[10px] leading-5 text-slate-400">
              Sign in with <span className="font-mono text-slate-300">krish@graphops.dev</span>{' '}
              / <span className="font-mono text-slate-300">graphops-demo</span>. New users can be
              added by running the seed script on the backend.
            </p>
          </div>
        </div>
      </div>

      <form onSubmit={onSubmit} className="space-y-4">
        <label className="block">
          <span className="mb-1.5 block text-xs font-medium text-slate-300">Full name</span>
          <div className="relative">
            <User size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
            <input
              required
              className="input !pl-10"
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="Your name"
            />
          </div>
        </label>

        <label className="block">
          <span className="mb-1.5 block text-xs font-medium text-slate-300">Work email</span>
          <div className="relative">
            <Mail size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
            <input
              required
              type="email"
              className="input !pl-10"
              value={email}
              onChange={e => setEmail(e.target.value)}
              placeholder="you@company.com"
            />
          </div>
        </label>

        <label className="block">
          <span className="mb-1.5 block text-xs font-medium text-slate-300">Password</span>
          <div className="relative">
            <LockKeyhole size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
            <input
              required
              minLength={8}
              type="password"
              className="input !pl-10"
              value={password}
              onChange={e => setPassword(e.target.value)}
              placeholder="At least 8 characters"
            />
          </div>
        </label>

        <label className="flex items-start gap-2 text-[10px] leading-5 text-slate-500">
          <input
            type="checkbox"
            checked={agree}
            onChange={e => setAgree(e.target.checked)}
            className="mt-1 accent-[#b9f56a]"
          />
          I agree to the demo terms and understand this is a frontend prototype.
        </label>

        <button disabled={!agree} className="btn-primary w-full !py-3" type="submit">
          Create account <ArrowRight size={14} />
        </button>
      </form>

      <div className="mt-7 flex items-center justify-between text-[11px]">
        <Link to="/login" className="flex items-center gap-1 text-slate-500 hover:text-slate-300">
          <ArrowLeft size={12} /> Back to sign in
        </Link>
        <span className="text-slate-600">
          Already have an account?{' '}
          <Link to="/login" className="font-semibold text-lime hover:text-[#d4ff9c]">
            Sign in
          </Link>
        </span>
      </div>
    </AuthLayout>
  );
}