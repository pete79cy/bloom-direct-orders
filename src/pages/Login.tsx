import { useEffect, useState, type FormEvent } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { toast } from 'sonner';
import { login, completeSsoLogin, tokenFromHash } from '@/lib/auth';
import { ApiError } from '@/lib/api';
import LeafMark from '@/components/LeafMark';

interface LocationState {
  from?: string;
}

export default function Login() {
  const navigate = useNavigate();
  const location = useLocation();
  const from = (location.state as LocationState | null)?.from ?? '/';

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [rememberMe, setRememberMe] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  // SSO handoff: bloom-crm redirects here with the JWT in the URL fragment
  // (#token=...). Consume it, store the session, then enter the app.
  useEffect(() => {
    const token = tokenFromHash(window.location.hash);
    if (!token) return;
    window.history.replaceState(null, '', window.location.pathname);
    completeSsoLogin(token, true)
      .then(() => navigate(from, { replace: true }))
      .catch((err) => {
        const msg = err instanceof Error ? err.message : 'Πρόβλημα σύνδεσης';
        toast.error(msg);
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    try {
      await login(email.trim(), password, rememberMe);
      navigate(from, { replace: true });
    } catch (err) {
      const msg =
        err instanceof ApiError && err.status === 401
          ? 'Λάθος email ή κωδικός'
          : err instanceof Error
            ? err.message
            : 'Πρόβλημα σύνδεσης';
      toast.error(msg);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="min-h-screen bg-paper flex flex-col justify-center px-6 pt-safe pb-safe relative overflow-hidden">
      {/* Decorative botanical mark, large but very faint, top-right */}
      <div
        aria-hidden="true"
        className="absolute -top-8 -right-12 text-sage-200/60 pointer-events-none select-none"
      >
        <LeafMark size={220} />
      </div>

      <div className="max-w-sm w-full mx-auto relative">
        <div className="flex flex-col items-center mb-10">
          <div className="w-14 h-14 rounded-2xl bg-sage-600 flex items-center justify-center mb-4 shadow-lg shadow-sage-600/20">
            <LeafMark size={28} className="text-cream-50" />
          </div>
          <h1
            className="font-display"
            style={{
              fontSize: 44,
              lineHeight: 1,
              color: 'var(--sage-800)',
              fontWeight: 500,
              letterSpacing: '-0.015em',
            }}
          >
            Bloom{' '}
            <span style={{ fontStyle: 'italic', color: 'var(--sage-700)' }}>Orders</span>
          </h1>
          <p className="text-ink-500 text-[13px] mt-2 tracking-[0.18em] uppercase">
            Pakkoutis&nbsp;·&nbsp;Nurseries
          </p>
        </div>

        <form onSubmit={onSubmit} className="space-y-4">
          <label className="block">
            <span className="text-[11px] uppercase tracking-[0.15em] text-ink-500 mb-1.5 block">
              Email
            </span>
            <input
              type="email"
              required
              autoComplete="username"
              autoCapitalize="none"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full h-12 px-4 rounded-xl bg-white border border-cream-300/60 text-base focus:outline-none focus:border-sage-400 focus:ring-2 focus:ring-sage-200/40 transition-colors"
            />
          </label>

          <label className="block">
            <span className="text-[11px] uppercase tracking-[0.15em] text-ink-500 mb-1.5 block">
              Κωδικός
            </span>
            <input
              type="password"
              required
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full h-12 px-4 rounded-xl bg-white border border-cream-300/60 text-base focus:outline-none focus:border-sage-400 focus:ring-2 focus:ring-sage-200/40 transition-colors"
            />
          </label>

          <label className="flex items-center gap-3 py-2 cursor-pointer">
            <input
              type="checkbox"
              checked={rememberMe}
              onChange={(e) => setRememberMe(e.target.checked)}
              className="w-5 h-5 accent-sage-600"
            />
            <span className="text-ink-700">Να με θυμάσαι</span>
          </label>

          <button
            type="submit"
            disabled={submitting}
            className="ios-tap w-full h-12 rounded-xl bg-sage-600 hover:bg-sage-700 text-cream-50 font-medium tracking-wide disabled:opacity-50 shadow-md shadow-sage-600/20"
          >
            {submitting ? 'Σύνδεση…' : 'Σύνδεση'}
          </button>
        </form>

        <div className="flex items-center gap-3 my-6">
          <span className="flex-1 h-px bg-cream-300/60" />
          <span className="text-[10px] uppercase tracking-[0.18em] text-ink-300">ή</span>
          <span className="flex-1 h-px bg-cream-300/60" />
        </div>

        <a
          href={`${import.meta.env.VITE_API_BASE_URL || ''}/api/auth/oidc/login?app=pwa`}
          className="ios-tap w-full h-12 rounded-xl bg-white border border-cream-300/60 hover:border-sage-400 text-ink-700 font-medium tracking-wide flex items-center justify-center transition-colors"
        >
          Σύνδεση με SSO
        </a>

        <p className="mt-10 text-center text-[10px] uppercase tracking-[0.2em] text-ink-300">
          Pakkoutis Nurseries · Direct Orders
        </p>
      </div>
    </div>
  );
}
