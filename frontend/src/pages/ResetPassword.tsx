import { useState, type FormEvent } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { CheckCircle2 } from 'lucide-react';
import { resetPassword } from '../api/passwordResetApi';
import { useAuth } from '../auth/AuthContext';
import { AuthLayout } from '../components/AuthLayout';
import { ErrorNote } from '../components/ui';

// Same rules as sign-up (Register.tsx) and the backend (auth.check_new_password).
const PASSWORD_RULE = 'Password must be at least 8 characters and include a capital letter and a symbol.';
const isValidPassword = (value: string) => value.length >= 8 && /\p{Lu}/u.test(value) && /[^\p{L}\p{N}\s]/u.test(value);
const passwordBytes = (value: string) => new TextEncoder().encode(value).length;

/** Opened from the emailed link: /reset-password?token=... */
export default function ResetPassword() {
  const { user, logout } = useAuth();
  const [params] = useSearchParams();
  const token = params.get('token') ?? '';
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState<string | null>(token ? null : 'This reset link is incomplete. Request a new one.');
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!isValidPassword(password)) return setError(PASSWORD_RULE);
    if (passwordBytes(password) > 72) return setError('Password is too long. Use at most 72 bytes (about 36 non-Latin letters).');
    if (password !== confirm) return setError('The passwords do not match.');
    setBusy(true);
    try {
      await resetPassword(token, password);
      // The backend signed this account out everywhere; drop the stale session here too.
      if (user) logout();
      setDone(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not change the password.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <AuthLayout
      aside={{
        title: (
          <>
            Fresh start. <span className="block text-brand-dark">Pick a new password.</span>
          </>
        ),
        text: 'After you change it, every device signed in to your account is logged out.',
      }}
    >
      {done ? (
        <div className="space-y-4 rounded-xl border border-line bg-white p-6">
          <h1 className="flex items-center gap-2 text-4xl font-bold">
            <CheckCircle2 className="h-8 w-8 shrink-0 text-brand-dark" /> Password changed
          </h1>
          <p className="text-ink/70">Log in with your new password.</p>
          <Link to="/login" className="btn-primary inline-flex min-h-[48px] w-full items-center justify-center text-base">
            Log in
          </Link>
        </div>
      ) : (
        <>
          <div>
            <h1 className="text-4xl font-bold">Change password</h1>
            <p className="mt-1 text-ink/70">Choose a new password for your account.</p>
          </div>

          <form onSubmit={onSubmit} className="space-y-4 rounded-xl border border-line bg-white p-6">
            <div>
              <label className="label" htmlFor="password">
                New password
              </label>
              <input
                id="password"
                type="password"
                required
                className="input min-h-[44px]"
                aria-describedby="password_hint"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="new-password"
                disabled={!token}
              />
            </div>
            <div>
              <label className="label" htmlFor="confirm">
                Confirm new password
              </label>
              <input
                id="confirm"
                type="password"
                required
                className="input min-h-[44px]"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                autoComplete="new-password"
                disabled={!token}
              />
            </div>
            <p id="password_hint" className="text-xs text-ink/60">
              At least 8 characters, with a capital letter and a symbol.
            </p>
            {error && <ErrorNote message={error} />}
            {error && (
              <Link to="/forgot-password" className="block text-center text-sm font-semibold text-brand-dark underline-offset-2 hover:underline">
                Request a new reset link
              </Link>
            )}
            <button className="btn-primary min-h-[48px] w-full text-base" disabled={busy || !token}>
              {busy ? 'Saving…' : 'Change password'}
            </button>
          </form>
        </>
      )}
    </AuthLayout>
  );
}
