import { useState, type FormEvent } from 'react';
import { Link, Navigate, useNavigate, useSearchParams } from 'react-router-dom';
import { addMonths } from 'date-fns';
import { registerTrainer } from '../api/publicApi';
import { useAuth } from '../auth/AuthContext';
import { normalizePhone, PLAN_MONTHS } from '../auth/mockUsers';
import { HOME } from '../auth/RequireRole';
import { AuthLayout } from '../components/AuthLayout';
import { ErrorNote } from '../components/ui';
import { TODAY_DATE, MEMBER_AREA_ENABLED } from '../config';
import { PLANS as PLAN_INFO } from '../data/gymData';
import type { MembershipPlan } from '../types';
import { fmtDate, kzt, PLAN_LABEL, toDate } from '../utils/format';
import { t, useT, type Key } from '../i18n';

const PLANS: MembershipPlan[] = ['monthly', 'quarterly', 'annual'];
const MAX_SESSION_PRICE = 99999999.99; // NUMERIC(10,2) in the database
const passwordRule = () => t('register.passwordRule');
const isValidPassword = (value: string) => value.length >= 8 && /\p{Lu}/u.test(value) && /[^\p{L}\p{N}\s]/u.test(value);
// bcrypt on the backend accepts at most 72 bytes.
const passwordBytes = (value: string) => new TextEncoder().encode(value).length;
// Same pattern as backend/app/db.py.
const EMAIL_PATTERN =
  /^[A-Za-z0-9!#$%&'*+/=?^_`{|}~-]+(?:\.[A-Za-z0-9!#$%&'*+/=?^_`{|}~-]+)*@(?:[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?\.)+[A-Za-z]{2,}$/;

type AccountType = 'member' | 'trainer';
const ACCOUNT_TYPES: { type: AccountType; label: Key; note: Key }[] = [
  { type: 'member' as AccountType, label: 'register.member' as Key, note: 'register.memberNote' as Key },
  { type: 'trainer' as AccountType, label: 'register.trainer' as Key, note: 'register.trainerNote' as Key },
].filter((a) => a.type !== 'member' || MEMBER_AREA_ENABLED); // member sign-up is hidden until the member area is ready

// Demo prices shared with the landing page's pricing section.
const price = (p: MembershipPlan) => {
  const info = PLAN_INFO.find((x) => x.plan === p);
  return info ? kzt(info.priceKzt) : '';
};

const expiryFor = (plan: MembershipPlan) => toDate(addMonths(new Date(`${TODAY_DATE}T00:00`), PLAN_MONTHS[plan]));

export default function Register() {
  const { tp } = useT();
  const { user, register } = useAuth();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const planParam = params.get('plan') as MembershipPlan | null;
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [plan, setPlan] = useState<MembershipPlan>(planParam && PLANS.includes(planParam) ? planParam : 'monthly');
  const [accountType, setAccountType] = useState<AccountType>(ACCOUNT_TYPES[0].type);
  const [specialization, setSpecialization] = useState('');
  const [sessionPrice, setSessionPrice] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // While submitting, the new member is signed in before we move on to /check-email.
  if (user && !busy) return <Navigate to={HOME[user.role]} replace />;

  const isTrainer = accountType === 'trainer';

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    const priceKzt = Number(sessionPrice);
    // Quick client-side checks; the API validates everything again.
    if (fullName.trim().split(/\s+/).join(' ').length < 2) return setError(t('register.errName'));
    if (!EMAIL_PATTERN.test(email.trim())) return setError(t('register.errEmail'));
    if (isTrainer) {
      if (specialization.trim().length < 2) return setError(t('register.errSpec'));
      if (!(priceKzt > 0) || priceKzt > MAX_SESSION_PRICE) return setError(t('register.errPrice'));
    } else if (!normalizePhone(phone)) {
      return setError(t('register.errPhone'));
    }
    if (!isValidPassword(password)) return setError(passwordRule());
    if (passwordBytes(password) > 72) return setError(t('register.errLong'));
    if (password !== confirm) return setError(t('register.errMatch'));

    setBusy(true);
    try {
      const query = new URLSearchParams({ email: email.trim().toLowerCase(), new: '1' });
      if (isTrainer) {
        const { verificationEmailSent } = await registerTrainer({ full_name: fullName, email, password, specialization, session_price_kzt: priceKzt });
        query.set('role', 'trainer');
        if (!verificationEmailSent) query.set('sent', '0');
      } else {
        const u = await register({ full_name: fullName, email, phone, password, membership_plan: plan });
        if (u.verification_email_sent === false) query.set('sent', '0');
      }
      navigate(`/check-email?${query}`, { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : t('register.failed'));
      setBusy(false);
    }
  };

  return (
    <AuthLayout
      aside={{
        title: MEMBER_AREA_ENABLED ? (
          <>
            {t('register.aside1')} <span className="block text-brand-dark">{t('register.asideMember2')}</span>
          </>
        ) : (
          <>
            {t('register.aside1')} <span className="block text-brand-dark">{t('register.asideTrainer2')}</span>
          </>
        ),
        text: MEMBER_AREA_ENABLED
          ? t('register.asideMemberText')
          : t('register.asideTrainerText'),
      }}
    >
      <div>
        <h1 className="text-4xl font-bold">{t('common.signUp')}</h1>
        <p className="mt-1 text-ink/70">
          {isTrainer
            ? t('register.subTrainer')
            : t('register.subMember')}
        </p>
      </div>

      <form onSubmit={onSubmit} className="space-y-4 rounded-xl border border-line bg-white p-6">
        <fieldset>
          <legend className="label">{t('register.as')}</legend>
          <div className="grid gap-2 sm:grid-cols-2">
            {ACCOUNT_TYPES.map(({ type, label, note }) => {
              const active = accountType === type;
              return (
                <label
                  key={type}
                  className={`cursor-pointer rounded-xl border p-3 transition has-[:focus-visible]:ring-4 has-[:focus-visible]:ring-brand/40 ${
                    active ? 'border-brand bg-brand text-onaccent' : 'border-line bg-cream hover:border-ink/40'
                  }`}
                >
                  <input
                    type="radio"
                    name="account_type"
                    value={type}
                    checked={active}
                    onChange={() => {
                      setAccountType(type);
                      setError(null);
                    }}
                    className="sr-only"
                  />
                  <span className="block font-display text-base font-bold uppercase tracking-wide">{t(label)}</span>
                  <span className={`block text-xs ${active ? 'text-onaccent/80' : 'text-ink/60'}`}>{t(note)}</span>
                </label>
              );
            })}
          </div>
        </fieldset>

        <div>
          <label className="label" htmlFor="full_name">
            {t('field.fullName')}
          </label>
          <input id="full_name" required className="input min-h-[44px]" value={fullName} onChange={(e) => setFullName(e.target.value)} autoComplete="name" />
        </div>
        <div>
          <label className="label" htmlFor="email">
            {t('field.email')}
          </label>
          <input id="email" type="email" required className="input min-h-[44px]" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" />
        </div>
        {isTrainer ? (
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="label" htmlFor="specialization">
                {t('field.specialization')}
              </label>
              <input
                id="specialization"
                required
                maxLength={60}
                className="input min-h-[44px]"
                placeholder={t('spec.strength')}
                value={specialization}
                onChange={(e) => setSpecialization(e.target.value)}
              />
            </div>
            <div>
              <label className="label" htmlFor="session_price">
                {t('field.sessionPrice')}
              </label>
              <input
                id="session_price"
                type="number"
                required
                min="1"
                max={MAX_SESSION_PRICE}
                step="0.01"
                className="input min-h-[44px]"
                placeholder="7000"
                value={sessionPrice}
                onChange={(e) => setSessionPrice(e.target.value)}
              />
            </div>
          </div>
        ) : (
          <div>
            <label className="label" htmlFor="phone">
              {t('field.phone')}
            </label>
            <input
              id="phone"
              type="tel"
              required
              className="input min-h-[44px]"
              placeholder="+7 701 123 45 67"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              autoComplete="tel"
            />
          </div>
        )}
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="label" htmlFor="password">
              {t('field.password')}
            </label>
            <input
              id="password"
              type="password"
              required
              minLength={8}
              aria-describedby="password_hint"
              className="input min-h-[44px]"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="new-password"
            />
          </div>
          <div>
            <label className="label" htmlFor="confirm">
              {t('field.confirmPassword')}
            </label>
            <input
              id="confirm"
              type="password"
              required
              className="input min-h-[44px]"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              autoComplete="new-password"
            />
          </div>
          <p id="password_hint" className="text-xs text-ink/60 sm:col-span-2">
            {t('register.passwordHint')}
          </p>
        </div>

        {!isTrainer && <fieldset>
          <legend className="label">{t('register.plan')}</legend>
          <div className="grid gap-2 sm:grid-cols-3">
            {PLANS.map((p) => {
              const active = plan === p;
              return (
                <label
                  key={p}
                  className={`cursor-pointer rounded-xl border p-3 transition has-[:focus-visible]:ring-4 has-[:focus-visible]:ring-brand/40 ${
                    active ? 'border-brand bg-brand text-onaccent' : 'border-line bg-cream hover:border-ink/40'
                  }`}
                >
                  <input type="radio" name="plan" value={p} checked={active} onChange={() => setPlan(p)} className="sr-only" />
                  <span className="block font-display text-base font-bold uppercase tracking-wide">{PLAN_LABEL[p]}</span>
                  <span className="block font-display text-lg font-bold">{price(p)}</span>
                  <span className={`block text-xs ${active ? 'text-onaccent/80' : 'text-ink/60'}`}>
                    {tp('unit.months', PLAN_MONTHS[p])}
                  </span>
                </label>
              );
            })}
          </div>
          <p className="mt-2 text-xs text-ink/60">
            {t('register.validUntil')} <b>{fmtDate(expiryFor(plan))}</b>. {t('register.demoPrices')}
          </p>
        </fieldset>}

        {error && <ErrorNote message={error} />}
        <button className="btn-primary min-h-[48px] w-full text-base" disabled={busy}>
          {busy ? t('register.busy') : isTrainer ? t('register.submitTrainer') : t('register.submit')}
        </button>
        <p className="text-center text-sm text-ink/60">
          {t('register.already')}{' '}
          <Link to="/login" className="inline-flex min-h-[44px] items-center font-semibold text-brand-dark underline-offset-2 hover:underline">
            {t('common.logIn')}
          </Link>
        </p>
      </form>
    </AuthLayout>
  );
}
