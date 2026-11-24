import { useState, type FormEvent } from 'react';
import { KeyRound } from 'lucide-react';
import { changePassword } from '../api/passwordResetApi';
import { useToast } from './Toast';
import { ErrorNote } from './ui';
import { useT } from '../i18n';

// Same rules as sign-up (Register.tsx), ResetPassword.tsx and the backend (auth.check_new_password).
const isValidPassword = (value: string) => value.length >= 8 && /\p{Lu}/u.test(value) && /[^\p{L}\p{N}\s]/u.test(value);
const passwordBytes = (value: string) => new TextEncoder().encode(value).length;

/** "Change password" form for the signed-in user, shown on every role's profile page. */
export function ChangePasswordCard() {
  const { t } = useT();
  const toast = useToast();
  const [current, setCurrent] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!isValidPassword(password)) return setError(t('register.passwordRule'));
    if (passwordBytes(password) > 72) return setError(t('register.errLong'));
    if (password !== confirm) return setError(t('register.errMatch'));
    setBusy(true);
    try {
      toast.success(await changePassword(current, password));
      setCurrent('');
      setPassword('');
      setConfirm('');
    } catch (err) {
      setError(err instanceof Error ? err.message : t('reset.failed'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={onSubmit} className="card max-w-xl space-y-4">
      <div>
        <h2 className="flex items-center gap-2 text-lg font-extrabold">
          <KeyRound className="h-5 w-5 text-brand-dark" /> {t('reset.title')}
        </h2>
        <p className="mt-1 text-sm text-ink/60">{t('profile.passwordSub')}</p>
      </div>
      <div>
        <label className="label" htmlFor="current_password">
          {t('field.currentPassword')}
        </label>
        <input
          id="current_password"
          type="password"
          required
          className="input min-h-[44px]"
          value={current}
          onChange={(e) => setCurrent(e.target.value)}
          autoComplete="current-password"
        />
      </div>
      <div>
        <label className="label" htmlFor="new_password">
          {t('field.newPassword')}
        </label>
        <input
          id="new_password"
          type="password"
          required
          className="input min-h-[44px]"
          aria-describedby="new_password_hint"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          autoComplete="new-password"
        />
        <p id="new_password_hint" className="mt-1 text-xs text-ink/60">
          {t('register.passwordHint')}
        </p>
      </div>
      <div>
        <label className="label" htmlFor="confirm_new_password">
          {t('field.confirmNewPassword')}
        </label>
        <input
          id="confirm_new_password"
          type="password"
          required
          className="input min-h-[44px]"
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          autoComplete="new-password"
        />
      </div>
      {error && <ErrorNote message={error} />}
      <button className="btn-primary min-h-[44px]" disabled={busy}>
        {busy ? t('common.saving') : t('reset.title')}
      </button>
    </form>
  );
}
