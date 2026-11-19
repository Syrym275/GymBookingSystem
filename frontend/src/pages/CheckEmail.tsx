import { Link, useSearchParams } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { HOME } from '../auth/RequireRole';
import { AuthLayout } from '../components/AuthLayout';
import { ResendVerification } from '../components/ResendVerification';
import { ErrorNote } from '../components/ui';
import { useT } from '../i18n';

/** Shown after sign-up, and from the "verify your email" banner. */
export default function CheckEmail() {
  const { t } = useT();
  const { user } = useAuth();
  const [params] = useSearchParams();
  const email = params.get('email') ?? user?.email ?? '';
  const sendFailed = params.get('sent') === '0';
  const isTrainer = params.get('role') === 'trainer';
  const fromSignUp = params.has('new');

  return (
    <AuthLayout
      aside={
        isTrainer
          ? {
              title: (
                <>
                  {t('check.trainerAside1')} <span className="block text-brand-dark">{t('check.aside2')}</span>
                </>
              ),
              text: t('check.trainerAsideText'),
            }
          : {
              title: (
                <>
                  {t('check.memberAside1')} <span className="block text-brand-dark">{t('check.aside2')}</span>
                </>
              ),
              text: t('check.memberAsideText'),
            }
      }
    >
      <div className="space-y-4 rounded-xl border border-line bg-white p-6">
        <h1 className="text-4xl font-bold">{t('check.title')}</h1>
        {sendFailed ? (
          <ErrorNote message={t('check.sendFailed')} />
        ) : (
          <p className="text-ink/70">
            {t('check.sent1')} {email ? <b className="break-all">{email}</b> : t('check.yourEmail')}. {t('check.sent2')}
          </p>
        )}
        <p className="text-sm text-ink/60">
          {isTrainer
            ? t('check.trainerNote')
            : t('check.memberNote')}
        </p>

        <ResendVerification email={email || undefined} startWithCooldown={fromSignUp && !sendFailed} />

        {user ? (
          <Link to={HOME[user.role]} className="btn-primary inline-flex min-h-[48px] w-full items-center justify-center text-base">
            {t('common.continue')}
          </Link>
        ) : (
          <Link to="/login" className="btn-primary inline-flex min-h-[48px] w-full items-center justify-center text-base">
            {t('check.goLogin')}
          </Link>
        )}
      </div>
    </AuthLayout>
  );
}
