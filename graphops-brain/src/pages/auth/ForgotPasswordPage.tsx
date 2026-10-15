import { FormEvent, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ArrowLeft, ArrowRight, CheckCircle2, KeyRound, Mail } from 'lucide-react';
import { AuthLayout } from '../../components/layout/AuthLayout';
import { useToast } from '../../contexts/ToastContext';

/**
 * Password reset is NOT wired to the backend — no /auth/forgot-password endpoint.
 * This page shows the UX and honestly tells the user that no email is sent.
 */
export function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const navigate = useNavigate();
  const { notify } = useToast();

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    // Demo mode: pretend we sent it, then show an honest confirmation.
    setSent(true);
    notify('Reset flow is demo-only — no email was sent.', 'info');
  };

  return (
    <AuthLayout>
      <Link
        to="/login"
        className="mb-7 inline-flex items-center gap-2 text-[11px] text-slate-500 hover:text-slate-300"
      >
        <ArrowLeft size={13} /> Back to sign in
      </Link>

      <div className="mb-7 flex h-12 w-12 items-center justify-center rounded-xl border border-line bg-[#18212b] text-lime">
        <KeyRound size={20} />
      </div>

      <h2 className="text-[28px] font-semibold tracking-[-.04em]">Reset your password</h2>
      <p className="mt-2 text-[12px] leading-6 text-slate-500">
        Enter your work email address and we'll show the confirmation flow.
      </p>

      {sent ? (
        <div className="mt-6 rounded-xl border border-[#2c4930] bg-[#15231a] p-4">
          <CheckCircle2 size={20} className="text-lime" />
          <p className="mt-3 text-sm font-semibold">Check your email</p>
          <p className="mt-1 text-[11px] leading-5 text-slate-500">
            If an account exists for <span className="font-mono text-slate-300">{email}</span>,
            a reset link would be sent in production. <span className="text-lime">No email is sent
            by this demo</span>, and no reset endpoint exists on the backend.
          </p>
          <button
            className="btn-primary mt-4 w-full"
            onClick={() => navigate('/login')}
          >
            Return to sign in
          </button>
        </div>
      ) : (
        <form onSubmit={onSubmit} className="mt-6 space-y-4">
          <label className="block">
            <span className="mb-1.5 block text-xs font-medium text-slate-300">Work email</span>
            <div className="relative">
              <Mail size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
              <input
                className="input !pl-10"
                value={email}
                onChange={e => setEmail(e.target.value)}
                type="email"
                required
                placeholder="you@company.com"
              />
            </div>
          </label>

          <button className="btn-primary w-full !py-3" type="submit">
            Send reset instructions <ArrowRight size={14} />
          </button>

          <p className="text-center text-[10px] leading-5 text-slate-600">
            Demo mode: the reset endpoint is not implemented on the backend.
          </p>
        </form>
      )}
    </AuthLayout>
  );
}