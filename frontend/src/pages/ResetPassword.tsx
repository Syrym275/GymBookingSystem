import { useState, type FormEvent } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { CheckCircle2 } from 'lucide-react';
import { resetPassword } from '../api/passwordResetApi';
import { useAuth } from '../auth/AuthContext';
import { AuthLayout } from '../components/AuthLayout';
import { ErrorNote } from '../components/ui';
import { t, useT } from '../i18n';

// Same rules as sign-up (Register.tsx) and the backend (auth.check_new_password).

const isValidPassword = (value: string) => value.length >= 8 && /\p{Lu}/u.test(value) && /[^\p{L}\p{N}\s]/u.test(value);
const passwordBytes = (value: string) => new TextEncoder().encode(value).length;

/** Opened from the emailed link: /reset-password?token=... */
export default function ResetPassword() {
  useT();
  const { user, logout } = useAuth();
  const [params] = useSearchParams();
  const token = params.get('token') ?? '';
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState<string | null>(token ? null : t('reset.incomplete'));
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!isValidPassword(password)) return setError(t('register.passwordRule'));
    if (passwordBytes(password) > 72) return setError(t('register.errLong'));
    if (password !== confirm) return setError(t('register.errMatch'));
    setBusy(true);
    try {
      await resetPassword(token, password);
      // The backend signed this account out everywhere; drop the stale session here too.
      if (user) logout();
      setDone(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : t('reset.failed'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <AuthLayout
      aside={{
        title: (
          <>
            {t('reset.aside1')} <span className="block text-brand-dark">{t('reset.aside2')}</span>
          </>
        ),
        text: t('reset.asideText'),
      }}
    >
      {done ? (
        <div className="space-y-4 rounded-xl border border-line bg-white p-6">
          <h1 className="flex items-center gap-2 text-4xl font-bold">
            <CheckCircle2 className="h-8 w-8 shrink-0 text-brand-dark" /> {t('reset.done')}
          </h1>
          <p className="text-ink/70">{t('reset.doneText')}</p>
          <Link to="/login" className="btn-primary inline-flex min-h-[48px] w-full items-center justify-center text-base">
            {t('common.logIn')}
          </Link>
        </div>
      ) : (
        <>
          <div>
            <h1 className="text-4xl font-bold">{t('reset.title')}</h1>
            <p className="mt-1 text-ink/70">{t('reset.subtitle')}</p>
          </div>

          <form onSubmit={onSubmit} className="space-y-4 rounded-xl border border-line bg-white p-6">
            <div>
              <label className="label" htmlFor="password">
                {t('field.newPassword')}
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
                {t('field.confirmNewPassword')}
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
              {t('register.passwordHint')}
            </p>
            {error && <ErrorNote message={error} />}
            {error && (
              <Link to="/forgot-password" className="block text-center text-sm font-semibold text-brand-dark underline-offset-2 hover:underline">
                {t('reset.requestNew')}
              </Link>
            )}
            <button className="btn-primary min-h-[48px] w-full text-base" disabled={busy || !token}>
              {busy ? t('common.saving') : t('reset.title')}
            </button>
          </form>
        </>
      )}
    </AuthLayout>
  );
}
