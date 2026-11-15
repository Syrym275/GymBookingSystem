import { useState, type FormEvent } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { HOME } from '../auth/RequireRole';
import { MEMBER_AREA_ENABLED } from '../config';
import { AuthLayout } from '../components/AuthLayout';
import { ErrorNote } from '../components/ui';

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
      setError(err instanceof Error ? err.message : 'Could not log in.');
      setBusy(false);
    }
  };

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    void attempt(email, password);
  };

  return (
    <AuthLayout
      aside={{
        title: (
          <>
            Welcome back. <span className="block text-brand-dark">Your hour is waiting.</span>
          </>
        ),
        text: MEMBER_AREA_ENABLED
          ? 'Log in to book trainers and halls, pay for your bookings and show your QR code at the desk.'
          : 'Log in to see your schedule, your clients and your results.',
      }}
    >
      <div>
        <h1 className="text-4xl font-bold">Log in</h1>
        <p className="mt-1 text-ink/70">See your bookings and book your next session.</p>
      </div>

      <form onSubmit={onSubmit} className="space-y-4 rounded-xl border border-line bg-white p-6">
        <div>
          <label className="label" htmlFor="email">
            Email
          </label>
          <input id="email" type="email" required className="input min-h-[44px]" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="username" />
        </div>
        <div>
          <label className="label" htmlFor="password">
            Password
          </label>
          <input
            id="password"
            type="password"
            required
            className="input min-h-[44px]"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="current-password"
          />
        </div>
        {error && <ErrorNote message={error} />}
        <button className="btn-primary min-h-[48px] w-full text-base" disabled={busy}>
          {busy ? 'Logging in…' : 'Log in'}
        </button>
        <p className="text-center text-sm text-ink/60">
          New to PulseGym?{' '}
          <Link to="/register" className="inline-flex min-h-[44px] items-center font-semibold text-brand-dark underline-offset-2 hover:underline">
            Sign up
          </Link>
        </p>
      </form>

    </AuthLayout>
  );
}
