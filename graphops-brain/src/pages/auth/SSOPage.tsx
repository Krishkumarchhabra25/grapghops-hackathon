import { FormEvent, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ArrowLeft, ArrowRight, Building2, Globe2, Info, ShieldCheck } from 'lucide-react';
import { AuthLayout } from '../../components/layout/AuthLayout';
import { useToast } from '../../contexts/ToastContext';

/**
 * SSO is not configured in this demo. The backend has no SAML/OIDC endpoint.
 * This page shows the UX and redirects to /login with an honest explanation.
 */
export function SSOPage() {
  const [domain, setDomain] = useState('acme.com');
  const navigate = useNavigate();
  const { toast } = useToastSafe();

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    toast?.('SSO is not configured in this demo — use the pre-seeded account.', 'info');
    window.setTimeout(() => navigate('/login'), 800);
  };

  return (
    <AuthLayout>
      <Link
        to="/login"
        className="mb-7 inline-flex items-center gap-2 text-[11px] text-slate-500 hover:text-slate-300"
      >
        <ArrowLeft size={13} /> Back to sign in
      </Link>

      <div className="mb-8 flex h-12 w-12 items-center justify-center rounded-xl border border-line bg-[#18212b] text-lime">
        <Building2 size={22} />
      </div>

      <h2 className="text-[28px] font-semibold tracking-[-.04em]">Single sign-on</h2>
      <p className="mt-2 text-[12px] leading-6 text-slate-500">
        Sign in through your organisation's identity provider.
      </p>

      <div className="mt-5 rounded-xl border border-[#33472f] bg-[#141e17] p-3">
        <div className="flex items-start gap-2">
          <Info size={14} className="mt-0.5 shrink-0 text-lime" />
          <p className="text-[10px] leading-5 text-slate-400">
            SSO / SAML / OIDC is <span className="font-semibold text-lime">not implemented</span>{' '}
            in this demo. Use the standard sign-in with a pre-seeded account.
          </p>
        </div>
      </div>

      <form onSubmit={onSubmit} className="mt-6 space-y-4">
        <label className="block">
          <span className="mb-1.5 block text-xs font-medium text-slate-300">
            Company email domain
          </span>
          <div className="relative">
            <Globe2 size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
            <input
              className="input !pl-10"
              value={domain}
              onChange={e => setDomain(e.target.value)}
              required
              placeholder="company.com"
            />
          </div>
        </label>

        <button type="submit" className="btn-primary w-full !py-3">
          Continue with SSO <ArrowRight size={14} />
        </button>
      </form>

      <div className="mt-5 flex items-start gap-2 rounded-xl border border-line bg-[#121821] p-3 text-[10px] leading-5 text-slate-500">
        <ShieldCheck size={14} className="mt-0.5 shrink-0 text-lime" />
        <span>
          This is a simulated SSO flow for the frontend prototype. Production SAML/OIDC
          authentication must be configured on a secure backend.
        </span>
      </div>
    </AuthLayout>
  );
}

// Small local guard — avoids a circular import if AuthContext isn't ready yet.
function useToastSafe() {
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { useToast } = require('../../contexts/ToastContext') as {
      useToast: () => { notify: (m: string, t?: any) => void };
    };
    const t = useToast();
    return { toast: t.notify };
  } catch {
    return { toast: null };
  }
}