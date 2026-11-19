import { useEffect, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { CheckCircle2 } from 'lucide-react';
import { verifyEmailToken } from '../api/verificationApi';
import { useAuth } from '../auth/AuthContext';
import { HOME } from '../auth/RequireRole';
import { AuthLayout } from '../components/AuthLayout';
import { ResendVerification } from '../components/ResendVerification';
import { ErrorNote, Loading } from '../components/ui';
import { t, useT } from '../i18n';

type State =
  | { kind: 'loading' }
  | { kind: 'verified'; email: string; again: boolean }
  | { kind: 'error'; message: string };

/** Opened from the emailed link: /verify-email?token=... */
export default function VerifyEmail() {
  useT();
  const { user, markEmailVerified } = useAuth();
  const [params] = useSearchParams();
  const token = params.get('token') ?? '';
  const [state, setState] = useState<State>(() =>
    token ? { kind: 'loading' } : { kind: 'error', message: t('verify.incomplete') },
  );
  const started = useRef(false);

  useEffect(() => {
    if (!token || started.current) return; // React StrictMode runs effects twice in development
    started.current = true;
    verifyEmailToken(token)
      .then((result) => {
        markEmailVerified(result.email);
        setState({ kind: 'verified', email: result.email, again: result.already_verified });
      })
      .catch((err: unknown) =>
        setState({ kind: 'error', message: err instanceof Error ? err.message : t('verify.failed') }),
      );
  }, [token, markEmailVerified]);

  const next = user ? (
    <Link to={HOME[user.role]} className="btn-primary inline-flex min-h-[48px] w-full items-center justify-center text-base">
      {t('common.continue')}
    </Link>
  ) : (
    <Link to="/login" className="btn-primary inline-flex min-h-[48px] w-full items-center justify-center text-base">
      {t('common.logIn')}
    </Link>
  );

  return (
    <AuthLayout
      aside={{
        title: (
          <>
            {t('verify.aside1')} <span className="block text-brand-dark">{t('verify.aside2')}</span>
          </>
        ),
        text: t('verify.asideText'),
      }}
    >
      <div className="space-y-4 rounded-xl border border-line bg-white p-6">
        {state.kind === 'loading' && (
          <>
            <h1 className="text-4xl font-bold">{t('verify.verifying')}</h1>
            <Loading text={t('verify.checking')} />
          </>
        )}

        {state.kind === 'verified' && (
          <>
            <h1 className="flex items-center gap-2 text-4xl font-bold">
              <CheckCircle2 className="h-8 w-8 shrink-0 text-brand-dark" /> {t('verify.done')}
            </h1>
            <p className="text-ink/70">
              {state.again ? t('verify.already1') : t('verify.thanks1')}{' '}
              <b className="break-all">{state.email}</b> {state.again ? t('verify.already2') : t('verify.thanks2')}
            </p>
            {next}
          </>
        )}

        {state.kind === 'error' && (
          <>
            <h1 className="text-4xl font-bold">{t('verify.invalid')}</h1>
            <ErrorNote message={state.message} />
            <p className="text-sm text-ink/60">{t('verify.fresh')}</p>
            <ResendVerification email={user?.email_verified === false ? user.email : undefined} />
            {next}
          </>
        )}
      </div>
    </AuthLayout>
  );
}
