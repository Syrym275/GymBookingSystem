import { useState, type FormEvent } from 'react';
import { Link, Navigate, useNavigate, useSearchParams } from 'react-router-dom';
import { addMonths } from 'date-fns';
import { registerTrainer } from '../api/publicApi';
import { useAuth } from '../auth/AuthContext';
import { normalizePhone, PLAN_MONTHS } from '../auth/mockUsers';
import { HOME } from '../auth/RequireRole';
import { AuthLayout } from '../components/AuthLayout';
import { useToast } from '../components/Toast';
import { ErrorNote } from '../components/ui';
import { TODAY_DATE, MEMBER_AREA_ENABLED } from '../config';
import { PLANS as PLAN_INFO } from '../data/gymData';
import type { MembershipPlan } from '../types';
import { fmtDate, kzt, PLAN_LABEL, toDate } from '../utils/format';

const PLANS: MembershipPlan[] = ['monthly', 'quarterly', 'annual'];
const MAX_SESSION_PRICE = 99999999.99; // NUMERIC(10,2) in the database
const PASSWORD_RULE = 'Password must be at least 8 characters and include a capital letter and a symbol.';
const isValidPassword = (value: string) => value.length >= 8 && /\p{Lu}/u.test(value) && /[^\p{L}\p{N}\s]/u.test(value);
// bcrypt on the backend accepts at most 72 bytes.
const passwordBytes = (value: string) => new TextEncoder().encode(value).length;
// Same pattern as backend/app/db.py.
const EMAIL_PATTERN =
  /^[A-Za-z0-9!#$%&'*+/=?^_`{|}~-]+(?:\.[A-Za-z0-9!#$%&'*+/=?^_`{|}~-]+)*@(?:[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?\.)+[A-Za-z]{2,}$/;

type AccountType = 'member' | 'trainer';
const ACCOUNT_TYPES: { type: AccountType; label: string; note: string }[] = [
  { type: 'member' as AccountType, label: 'Member', note: 'Book trainers and halls' },
  { type: 'trainer' as AccountType, label: 'Trainer', note: 'Offer training sessions' },
].filter((a) => a.type !== 'member' || MEMBER_AREA_ENABLED); // member sign-up is hidden until the member area is ready

// Demo prices shared with the landing page's pricing section.
const price = (p: MembershipPlan) => {
  const info = PLAN_INFO.find((x) => x.plan === p);
  return info ? kzt(info.priceKzt) : '';
};

const expiryFor = (plan: MembershipPlan) => toDate(addMonths(new Date(`${TODAY_DATE}T00:00`), PLAN_MONTHS[plan]));

export default function Register() {
  const { user, register } = useAuth();
  const navigate = useNavigate();
  const toast = useToast();
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
  const [trainerSubmitted, setTrainerSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (user) return <Navigate to={HOME[user.role]} replace />;

  const isTrainer = accountType === 'trainer';

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    const priceKzt = Number(sessionPrice);
    // Quick client-side checks; the API validates everything again.
    if (fullName.trim().split(/\s+/).join(' ').length < 2) return setError('Please enter your full name.');
    if (!EMAIL_PATTERN.test(email.trim())) return setError('Please enter a valid email.');
    if (isTrainer) {
      if (specialization.trim().length < 2) return setError('Please enter your specialization.');
      if (!(priceKzt > 0) || priceKzt > MAX_SESSION_PRICE) return setError('Please enter a valid session price.');
    } else if (!normalizePhone(phone)) {
      return setError('Phone must be a Kazakhstan number, e.g. +7 701 123 45 67.');
    }
    if (!isValidPassword(password)) return setError(PASSWORD_RULE);
    if (passwordBytes(password) > 72) return setError('Password is too long. Use at most 72 bytes (about 36 non-Latin letters).');
    if (password !== confirm) return setError('The passwords do not match.');

    setBusy(true);
    try {
      if (isTrainer) {
        await registerTrainer({ full_name: fullName, email, password, specialization, session_price_kzt: priceKzt });
        setTrainerSubmitted(true);
        setBusy(false);
        return;
      }
      const u = await register({ full_name: fullName, email, phone, password, membership_plan: plan });
      toast.success(`Welcome, ${u.full_name.split(' ')[0]}! Your account is ready.`);
      navigate(HOME[u.role], { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not create the account.');
      setBusy(false);
    }
  };

  if (trainerSubmitted) {
    return (
      <AuthLayout
        aside={{
          title: (
            <>
              Thanks for applying. <span className="block text-brand-dark">We will review it soon.</span>
            </>
          ),
          text: 'Approved trainers are listed on PulseGym with their specialization and session price.',
        }}
      >
        <div className="space-y-4 rounded-xl border border-line bg-white p-6">
          <h1 className="text-4xl font-bold">Registration received</h1>
          <p className="text-ink/70">
            Your trainer profile is waiting for approval and is not public yet. You can log in while your profile is reviewed.
          </p>
          <Link to="/" className="btn-primary inline-flex min-h-[48px] w-full items-center justify-center text-base">
            Back to home
          </Link>
        </div>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout
      aside={{
        title: MEMBER_AREA_ENABLED ? (
          <>
            Join PulseGym. <span className="block text-brand-dark">Book your first hour.</span>
          </>
        ) : (
          <>
            Join PulseGym. <span className="block text-brand-dark">Offer your sessions.</span>
          </>
        ),
        text: MEMBER_AREA_ENABLED
          ? 'Create an account, choose a coach or a hall, pick a free hour and pay online. Your QR code gets you in at the desk.'
          : 'Register as a trainer. Your profile is reviewed before it goes public.',
      }}
    >
      <div>
        <h1 className="text-4xl font-bold">Sign up</h1>
        <p className="mt-1 text-ink/70">
          {isTrainer ? 'Takes a minute. Your profile is reviewed before it goes public.' : 'Takes a minute. You are logged in straight away.'}
        </p>
      </div>

      <form onSubmit={onSubmit} className="space-y-4 rounded-xl border border-line bg-white p-6">
        <fieldset>
          <legend className="label">I am registering as</legend>
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
                  <span className="block font-display text-base font-bold uppercase tracking-wide">{label}</span>
                  <span className={`block text-xs ${active ? 'text-onaccent/80' : 'text-ink/60'}`}>{note}</span>
                </label>
              );
            })}
          </div>
        </fieldset>

        <div>
          <label className="label" htmlFor="full_name">
            Full name
          </label>
          <input id="full_name" required className="input min-h-[44px]" value={fullName} onChange={(e) => setFullName(e.target.value)} autoComplete="name" />
        </div>
        <div>
          <label className="label" htmlFor="email">
            Email
          </label>
          <input id="email" type="email" required className="input min-h-[44px]" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" />
        </div>
        {isTrainer ? (
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="label" htmlFor="specialization">
                Specialization
              </label>
              <input
                id="specialization"
                required
                maxLength={60}
                className="input min-h-[44px]"
                placeholder="Strength training"
                value={specialization}
                onChange={(e) => setSpecialization(e.target.value)}
              />
            </div>
            <div>
              <label className="label" htmlFor="session_price">
                Price per 60-min session (KZT)
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
              Phone
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
              Password
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
              Confirm password
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
            At least 8 characters, with 1 capital letter and 1 symbol.
          </p>
        </div>

        {!isTrainer && <fieldset>
          <legend className="label">Membership plan</legend>
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
                    {PLAN_MONTHS[p]} {PLAN_MONTHS[p] === 1 ? 'month' : 'months'}
                  </span>
                </label>
              );
            })}
          </div>
          <p className="mt-2 text-xs text-ink/60">
            Valid until <b>{fmtDate(expiryFor(plan))}</b>. Demo prices; sessions and hall hours are paid per booking.
          </p>
        </fieldset>}

        {error && <ErrorNote message={error} />}
        <button className="btn-primary min-h-[48px] w-full text-base" disabled={busy}>
          {busy ? 'Creating account…' : isTrainer ? 'Submit registration' : 'Create account'}
        </button>
        <p className="text-center text-sm text-ink/60">
          Already a member?{' '}
          <Link to="/login" className="inline-flex min-h-[44px] items-center font-semibold text-brand-dark underline-offset-2 hover:underline">
            Log in
          </Link>
        </p>
      </form>
    </AuthLayout>
  );
}
