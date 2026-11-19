import { useState, type FormEvent } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { HOME } from '../auth/RequireRole';
import { MEMBER_AREA_ENABLED } from '../config';
import { AuthLayout } from '../components/AuthLayout';
import { ErrorNote } from '../components/ui';
import { useT } from '../i18n';

export default function Login() {
  const { t } = useT();
  const { user, login, demoLogin } = useAuth();
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
      setError(err instanceof Error ? err.message : t('login.failed'));
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
            {t('login.aside1')} <span className="block text-brand-dark">{t('login.aside2')}</span>
          </>
        ),
        text: MEMBER_AREA_ENABLED
          ? t('login.asideMember')
          : t('login.asideTrainer'),
      }}
    >
      <div>
        <h1 className="text-4xl font-bold">{t('common.logIn')}</h1>
        <p className="mt-1 text-ink/70">{t('login.subtitle')}</p>
      </div>

      <form onSubmit={onSubmit} className="space-y-4 rounded-xl border border-line bg-white p-6">
        <div>
          <label className="label" htmlFor="email">
            {t('field.email')}
          </label>
          <input id="email" type="email" required className="input min-h-[44px]" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="username" />
        </div>
        <div>
          <div className="flex items-center justify-between gap-2">
            <label className="label" htmlFor="password">
              {t('field.password')}
            </label>
            <Link
              to="/forgot-password"
              state={{ email }}
              className="inline-flex min-h-[44px] items-center text-sm font-semibold text-brand-dark underline-offset-2 hover:underline"
            >
              {t('login.forgot')}
            </Link>
          </div>
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
          {busy ? t('login.busy') : t('common.logIn')}
        </button>
        <p className="text-center text-sm text-ink/60">
          {t('login.newTo')}{' '}
          <Link to="/register" className="inline-flex min-h-[44px] items-center font-semibold text-brand-dark underline-offset-2 hover:underline">
            {t('common.signUp')}
          </Link>
        </p>
      </form>

      {demoLogin && (
        <div className="mt-4 rounded-xl border border-dashed border-brand/60 bg-brand-soft p-4">
          <p className="label">{t('adm.demo.title')}</p>
          <p className="text-sm text-ink/70">{t('adm.demo.text')}</p>
          <button
            type="button"
            className="btn-secondary mt-3"
            onClick={async () => {
              const u = await demoLogin();
              navigate(HOME[u.role], { replace: true });
            }}
          >
            {t('adm.demo.button')}
          </button>
        </div>
      )}
    </AuthLayout>
  );
}
