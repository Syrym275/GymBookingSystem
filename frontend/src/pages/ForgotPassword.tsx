import { useEffect, useState, type FormEvent } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { MailCheck } from 'lucide-react';
import { requestPasswordReset } from '../api/passwordResetApi';
import { AuthLayout } from '../components/AuthLayout';
import { ErrorNote } from '../components/ui';
import { useT } from '../i18n';
import { msg } from '../i18n/messages';

const COOLDOWN_SECONDS = 60; // the backend also allows only 3 links per hour

/** "Forgot password?" from the login page: emails a reset link. */
export default function ForgotPassword() {
  const { t } = useT();
  const location = useLocation();
  const [email, setEmail] = useState((location.state as { email?: string } | null)?.email ?? '');
  const [sent, setSent] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [cooldown, setCooldown] = useState(0);

  useEffect(() => {
    if (cooldown <= 0) return;
    const timer = window.setTimeout(() => setCooldown((s) => s - 1), 1000);
    return () => window.clearTimeout(timer);
  }, [cooldown]);

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!email.trim()) return setError(t('resend.enterEmail'));
    setBusy(true);
    try {
      setSent(await requestPasswordReset(email.trim()));
      setCooldown(COOLDOWN_SECONDS);
    } catch (err) {
      setError(err instanceof Error ? err.message : t('forgot.failed'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <AuthLayout
      aside={{
        title: (
          <>
            {t('forgot.aside1')} <span className="block text-brand-dark">{t('forgot.aside2')}</span>
          </>
        ),
        text: t('forgot.asideText'),
      }}
    >
      <div>
        <h1 className="text-4xl font-bold">{t('forgot.title')}</h1>
        <p className="mt-1 text-ink/70">{t('forgot.subtitle')}</p>
      </div>

      <form onSubmit={onSubmit} className="space-y-4 rounded-xl border border-line bg-white p-6">
        <div>
          <label className="label" htmlFor="email">
            {t('field.email')}
          </label>
          <input
            id="email"
            type="email"
            required
            className="input min-h-[44px]"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoComplete="email"
          />
        </div>
        {sent && (
          <p className="flex gap-2 rounded-xl border border-line bg-cream p-3 text-sm">
            <MailCheck className="h-5 w-5 shrink-0 text-brand-dark" /> {msg(sent)}
          </p>
        )}
        {error && <ErrorNote message={error} />}
        <button className="btn-primary min-h-[48px] w-full text-base" disabled={busy || cooldown > 0}>
          {busy ? t('resend.sending') : cooldown > 0 ? t('forgot.againWait', { s: cooldown }) : sent ? t('forgot.again') : t('forgot.send')}
        </button>
        <p className="text-center text-sm text-ink/60">
          {t('forgot.remembered')}{' '}
          <Link to="/login" className="inline-flex min-h-[44px] items-center font-semibold text-brand-dark underline-offset-2 hover:underline">
            {t('forgot.backLogin')}
          </Link>
        </p>
      </form>
    </AuthLayout>
  );
}
