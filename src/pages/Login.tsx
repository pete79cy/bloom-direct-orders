import { useState, type FormEvent } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { toast } from 'sonner';
import { Leaf } from 'lucide-react';
import { login } from '@/lib/auth';
import { ApiError } from '@/lib/api';

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
    <div className="min-h-full flex flex-col justify-center px-6 pt-safe pb-safe">
      <div className="max-w-sm w-full mx-auto">
        <div className="flex flex-col items-center mb-8">
          <div className="w-16 h-16 rounded-2xl bg-ios-green flex items-center justify-center mb-3">
            <Leaf className="w-8 h-8 text-white" />
          </div>
          <h1 className="text-2xl font-semibold">Bloom Orders</h1>
          <p className="text-ios-ink-sec text-sm mt-1">Pakkoutis Nurseries</p>
        </div>

        <form onSubmit={onSubmit} className="space-y-4">
          <label className="block">
            <span className="text-sm text-ios-ink-sec mb-1 block">Email</span>
            <input
              type="email"
              required
              autoComplete="username"
              autoCapitalize="none"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full h-12 px-4 rounded-xl bg-white border border-gray-200 text-base"
            />
          </label>

          <label className="block">
            <span className="text-sm text-ios-ink-sec mb-1 block">Κωδικός</span>
            <input
              type="password"
              required
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full h-12 px-4 rounded-xl bg-white border border-gray-200 text-base"
            />
          </label>

          <label className="flex items-center gap-3 py-2">
            <input
              type="checkbox"
              checked={rememberMe}
              onChange={(e) => setRememberMe(e.target.checked)}
              className="w-5 h-5 accent-ios-tint"
            />
            <span>Να με θυμάσαι</span>
          </label>

          <button
            type="submit"
            disabled={submitting}
            className="w-full h-12 rounded-xl bg-ios-tint text-white font-medium disabled:opacity-50"
          >
            {submitting ? 'Σύνδεση…' : 'Σύνδεση'}
          </button>
        </form>
      </div>
    </div>
  );
}
