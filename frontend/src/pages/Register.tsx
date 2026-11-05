import { useState, type FormEvent } from 'react';
import { Link, Navigate, useNavigate, useSearchParams } from 'react-router-dom';
import { addMonths } from 'date-fns';
import { useAuth } from '../auth/AuthContext';
import { normalizePhone, PLAN_MONTHS } from '../auth/mockUsers';
import { HOME } from '../auth/RequireRole';
import { AuthLayout } from '../components/AuthLayout';
import { useToast } from '../components/Toast';
import { ErrorNote } from '../components/ui';
import { TODAY_DATE } from '../config';
import { PLANS as PLAN_INFO } from '../data/gymData';
import type { MembershipPlan } from '../types';
import { fmtDate, kzt, PLAN_LABEL, toDate } from '../utils/format';

const PLANS: MembershipPlan[] = ['monthly', 'quarterly', 'annual'];

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
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (user) return <Navigate to={HOME[user.role]} replace />;

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    // Quick client-side checks; the API validates everything again.
    if (!normalizePhone(phone)) return setError('Phone must be a Kazakhstan number, e.g. +7 701 123 45 67.');
    if (password.length < 6) return setError('Password must be at least 6 characters.');
    if (password !== confirm) return setError('The passwords do not match.');

    setBusy(true);
    try {
      const u = await register({ full_name: fullName, email, phone, password, membership_plan: plan });
      toast.success(`Welcome, ${u.full_name.split(' ')[0]}! Your account is ready.`);
      navigate(HOME[u.role], { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not create the account.');
      setBusy(false);
    }
  };

  return (
    <AuthLayout
      aside={{
        title: (
          <>
            Join PulseGym. <span className="block text-brand-dark">Book your first hour.</span>
          </>
        ),
        text: 'Create an account, choose a coach or a hall, pick a free hour and pay online. Your QR code gets you in at the desk.',
      }}
    >
      <div>
        <h1 className="text-4xl font-bold">Sign up</h1>
        <p className="mt-1 text-ink/70">Takes a minute. You are logged in straight away.</p>
      </div>

      <form onSubmit={onSubmit} className="space-y-4 rounded-xl border border-line bg-white p-6">
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
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="label" htmlFor="password">
              Password
            </label>
            <input
              id="password"
              type="password"
              required
              minLength={6}
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
        </div>

        <fieldset>
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
        </fieldset>

        {error && <ErrorNote message={error} />}
        <button className="btn-primary min-h-[48px] w-full text-base" disabled={busy}>
          {busy ? 'Creating account…' : 'Create account'}
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
