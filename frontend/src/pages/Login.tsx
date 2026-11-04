import { useState, type FormEvent } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import { LogIn } from 'lucide-react';
import { useAuth } from '../auth/AuthContext';
import { DEMO_ACCOUNTS } from '../auth/mockUsers';
import { HOME } from '../auth/RequireRole';
import { AuthLayout } from '../components/AuthLayout';
import { ErrorNote } from '../components/ui';

const ROLE_COLOR: Record<string, string> = {
  member: 'bg-brand text-white',
  trainer: 'bg-mint text-white',
  receptionist: 'bg-sun text-ink',
  admin: 'bg-berry text-white',
};

export default function Login() {
  const { user, login } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (user) return <Navigate to={HOME[user.role]} replace />;

  const attempt = async (e: string, p: string) => {
    setBusy(true);
    setError(null);
    try {
      const u = await login(e, p);
      navigate(HOME[u.role], { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not sign in.');
      setBusy(false);
    }
  };

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    void attempt(email, password);
  };

  return (
    <AuthLayout>
      <div>
        <h2 className="text-3xl font-extrabold">Welcome back</h2>
        <p className="mt-1 text-sm text-ink/60">Sign in to manage your bookings.</p>
      </div>

      <form onSubmit={onSubmit} className="card space-y-4">
        <div>
          <label className="label" htmlFor="email">
            Email
          </label>
          <input id="email" type="email" required className="input" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="username" />
        </div>
        <div>
          <label className="label" htmlFor="password">
            Password
          </label>
          <input
            id="password"
            type="password"
            required
            className="input"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="current-password"
          />
        </div>
        {error && <ErrorNote message={error} />}
        <button className="btn-primary w-full" disabled={busy}>
          <LogIn className="h-4 w-4" /> {busy ? 'Signing in…' : 'Sign in'}
        </button>
        <p className="text-center text-sm text-ink/60">
          New here?{' '}
          <Link to="/register" className="font-bold text-brand underline-offset-2 hover:underline">
            Create a member account
          </Link>
        </p>
      </form>

      <div>
        <p className="label">Demo accounts · one click</p>
        <div className="grid gap-2 sm:grid-cols-2">
          {DEMO_ACCOUNTS.map((d) => (
            <button
              key={d.role}
              disabled={busy}
              onClick={() => attempt(d.email, d.password)}
              className="flex items-center gap-3 rounded-xl border-2 border-ink bg-white p-3 text-left shadow-hard-sm transition hover:-translate-y-0.5 disabled:opacity-60"
            >
              <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full font-display font-extrabold ${ROLE_COLOR[d.role]}`}>
                {d.name[0]}
              </span>
              <span className="min-w-0">
                <span className="block text-sm font-extrabold">{d.label}</span>
                <span className="block truncate text-xs text-ink/60">{d.name}</span>
              </span>
            </button>
          ))}
        </div>
        <p className="mt-3 text-xs text-ink/50">
          Password for every demo account: <b>demo123</b>. Try <i>yerassyl.omarov@example.kz</i> (2 unpaid bookings) or{' '}
          <i>timur.abenov@example.kz</i> (expired membership) to see the booking limits.
        </p>
      </div>
    </AuthLayout>
  );
}
