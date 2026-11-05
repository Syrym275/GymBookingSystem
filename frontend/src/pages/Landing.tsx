import { Link, Navigate } from 'react-router-dom';
import {
  ArrowRight,
  CalendarCheck,
  Clock,
  CreditCard,
  Dumbbell,
  LogIn,
  QrCode,
  ShieldCheck,
  Users,
  Warehouse,
} from 'lucide-react';
import type { ReactNode } from 'react';
import { getPublicCatalog } from '../api/publicApi';
import { useAuth } from '../auth/AuthContext';
import { PLAN_MONTHS } from '../auth/mockUsers';
import { HOME } from '../auth/RequireRole';
import { CLOSE_HOUR, HOLD_MINUTES, OPEN_HOUR } from '../config';
import { useAsync } from '../hooks/useAsync';
import type { MembershipPlan } from '../types';
import { hourLabel, kzt, PLAN_LABEL } from '../utils/format';

const ACCENTS = ['bg-brand text-white', 'bg-mint text-white', 'bg-sun text-ink', 'bg-berry text-white'];

const FEATURES: { icon: ReactNode; title: string; text: string; accent: string }[] = [
  {
    icon: <Dumbbell className="h-6 w-6" />,
    title: 'Personal training',
    text: 'Pick a coach and book a 60-minute one-on-one session that starts on the hour.',
    accent: 'bg-brand-soft',
  },
  {
    icon: <Warehouse className="h-6 w-6" />,
    title: 'Rent a hall',
    text: 'Need space for a class or team? Rent a hall or studio by the hour.',
    accent: 'bg-mint-soft',
  },
  {
    icon: <CreditCard className="h-6 w-6" />,
    title: 'Pay in seconds',
    text: `Card, NFC or app. Your slot is held for ${HOLD_MINUTES} minutes while you pay.`,
    accent: 'bg-sun-soft',
  },
  {
    icon: <ShieldCheck className="h-6 w-6" />,
    title: 'Never double-booked',
    text: 'A trainer or hall is never booked twice for the same hour. Your slot is yours.',
    accent: 'bg-berry-soft',
  },
];

const STEPS = [
  { title: 'Create an account', text: 'Sign up in a minute and choose your membership plan.' },
  { title: 'Book a slot', text: 'Choose a trainer or a hall, then a free time that suits you.' },
  { title: 'Pay & show up', text: 'Pay online, get your booking slip, and show your QR code at the desk.' },
];

const PLANS: { plan: MembershipPlan; blurb: string; highlight?: boolean }[] = [
  { plan: 'monthly', blurb: 'Try us out, no long commitment.' },
  { plan: 'quarterly', blurb: 'Build a habit over a full season.', highlight: true },
  { plan: 'annual', blurb: 'The whole year, for the committed.' },
];

export default function Landing() {
  const { user } = useAuth();
  const catalog = useAsync(getPublicCatalog, []);

  if (user) return <Navigate to={HOME[user.role]} replace />;

  const trainers = catalog.data?.trainers ?? [];
  const halls = catalog.data?.halls ?? [];
  const minTrainer = trainers.length ? Math.min(...trainers.map((t) => t.session_price_kzt)) : null;

  return (
    <div className="min-h-screen overflow-x-hidden">
      {/* ---- Top bar ---- */}
      <header className="sticky top-0 z-20 border-b-2 border-ink bg-cream/90 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 py-3 sm:px-6">
          <Link to="/" className="flex items-center gap-2">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl border-2 border-ink bg-brand text-white shadow-hard-sm">
              <Dumbbell className="h-5 w-5" />
            </span>
            <span className="font-display text-lg font-extrabold leading-tight sm:text-xl">Gym Booking</span>
          </Link>
          <nav className="hidden items-center gap-6 text-sm font-bold md:flex">
            <a href="#features" className="hover:text-brand">Features</a>
            <a href="#trainers" className="hover:text-brand">Trainers</a>
            <a href="#halls" className="hover:text-brand">Halls</a>
            <a href="#plans" className="hover:text-brand">Plans</a>
          </nav>
          <div className="flex items-center gap-2">
            <Link to="/login" className="btn-ghost">
              <LogIn className="h-4 w-4" /> <span className="hidden sm:inline">Sign in</span>
            </Link>
            <Link to="/register" className="btn-primary">
              Join now
            </Link>
          </div>
        </div>
      </header>

      {/* ---- Hero ---- */}
      <section className="relative">
        <div className="pointer-events-none absolute -right-24 -top-10 h-72 w-72 rounded-full bg-sun sm:h-96 sm:w-96" />
        <div className="pointer-events-none absolute -left-20 bottom-0 h-48 w-48 rounded-full bg-mint/70" />
        <div className="relative mx-auto grid max-w-6xl items-center gap-12 px-4 py-14 sm:px-6 lg:grid-cols-[1.15fr_1fr] lg:py-24">
          <div>
            <span className="chip border-ink bg-white">
              <Clock className="mr-1.5 h-3.5 w-3.5" /> Open daily {hourLabel(OPEN_HOUR)} – {hourLabel(CLOSE_HOUR)}
            </span>
            <h1 className="mt-5 font-display text-5xl font-extrabold leading-[1.05] sm:text-6xl">
              Book it. <span className="text-brand">Pay it.</span>
              <br />
              Show up.
            </h1>
            <p className="mt-5 max-w-xl text-lg text-ink/70">
              Personal training and hall rental in one place. Pick a coach or a studio, grab a free hour, pay online — done.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link to="/register" className="btn-primary px-6 py-3 text-base">
                Create free account <ArrowRight className="h-4 w-4" />
              </Link>
              <a href="#trainers" className="btn-secondary px-6 py-3 text-base">
                Meet the trainers
              </a>
            </div>
            <p className="mt-4 text-sm text-ink/60">
              Already a member?{' '}
              <Link to="/login" className="font-bold text-brand hover:underline">
                Sign in
              </Link>
            </p>
          </div>

          <HeroSlip trainerName={trainers[0]?.full_name} trainerSpec={trainers[0]?.specialization} price={trainers[0]?.session_price_kzt} />
        </div>
      </section>

      {/* ---- Stats strip ---- */}
      <section className="border-y-2 border-ink bg-ink text-cream">
        <div className="mx-auto grid max-w-6xl grid-cols-2 gap-6 px-4 py-6 text-center sm:px-6 md:grid-cols-4">
          <Stat value={catalog.data ? String(trainers.length) : '–'} label="Expert trainers" />
          <Stat value={catalog.data ? String(halls.length) : '–'} label="Halls & studios" />
          <Stat value={`${CLOSE_HOUR - OPEN_HOUR} h`} label="Open every day" />
          <Stat value={minTrainer !== null ? `from ${kzt(minTrainer)}` : '–'} label="Per session" />
        </div>
      </section>

      {/* ---- Features ---- */}
      <section id="features" className="mx-auto max-w-6xl scroll-mt-20 px-4 py-16 sm:px-6 lg:py-20">
        <SectionTitle kicker="Why us" title="Everything you need, nothing you don't" />
        <div className="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {FEATURES.map((f) => (
            <div key={f.title} className="card transition hover:-translate-y-1">
              <span className={`flex h-12 w-12 items-center justify-center rounded-xl border-2 border-ink ${f.accent}`}>{f.icon}</span>
              <h3 className="mt-4 text-lg font-extrabold">{f.title}</h3>
              <p className="mt-1 text-sm text-ink/70">{f.text}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ---- How it works ---- */}
      <section className="border-y-2 border-ink bg-brand-soft">
        <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6 lg:py-20">
          <SectionTitle kicker="How it works" title="Three steps to your next workout" />
          <ol className="mt-10 grid gap-5 md:grid-cols-3">
            {STEPS.map((s, i) => (
              <li key={s.title} className="card relative">
                <span className="absolute -top-4 left-5 flex h-9 w-9 items-center justify-center rounded-full border-2 border-ink bg-sun font-display font-extrabold shadow-hard-sm">
                  {i + 1}
                </span>
                <h3 className="mt-3 text-lg font-extrabold">{s.title}</h3>
                <p className="mt-1 text-sm text-ink/70">{s.text}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* ---- Trainers ---- */}
      <section id="trainers" className="mx-auto max-w-6xl scroll-mt-20 px-4 py-16 sm:px-6 lg:py-20">
        <SectionTitle kicker="Our team" title="Train with the best" />
        <div className="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {catalog.loading && !catalog.data
            ? [0, 1, 2, 3].map((i) => <div key={i} className="card h-44 animate-pulse bg-white/60" />)
            : trainers.map((t, i) => (
                <div key={t.trainer_id} className="card flex flex-col transition hover:-translate-y-1">
                  <span
                    className={`flex h-14 w-14 items-center justify-center rounded-full border-2 border-ink font-display text-xl font-extrabold ${ACCENTS[i % ACCENTS.length]}`}
                  >
                    {initials(t.full_name)}
                  </span>
                  <h3 className="mt-4 text-lg font-extrabold">{t.full_name}</h3>
                  <p className="text-sm text-ink/60">{t.specialization}</p>
                  <p className="mt-auto pt-4 text-sm">
                    <b className="font-display text-xl font-extrabold">{kzt(t.session_price_kzt)}</b>
                    <span className="text-ink/60"> / 60 min</span>
                  </p>
                </div>
              ))}
        </div>
        {catalog.error && <p className="mt-4 text-sm text-berry">Could not load trainers right now.</p>}
      </section>

      {/* ---- Halls ---- */}
      <section id="halls" className="scroll-mt-20 border-y-2 border-ink bg-mint-soft">
        <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6 lg:py-20">
          <SectionTitle kicker="Spaces" title="Halls & studios for rent" />
          <div className="mt-10 grid gap-5 md:grid-cols-3">
            {catalog.loading && !catalog.data
              ? [0, 1, 2].map((i) => <div key={i} className="card h-36 animate-pulse bg-white/60" />)
              : halls.map((h) => (
                  <div key={h.hall_id} className="card transition hover:-translate-y-1">
                    <div className="flex items-start justify-between gap-3">
                      <h3 className="text-lg font-extrabold">{h.hall_name}</h3>
                      <Warehouse className="h-6 w-6 shrink-0 text-mint-dark" />
                    </div>
                    <p className="mt-1 flex items-center gap-1.5 text-sm text-ink/60">
                      <Users className="h-4 w-4" /> Up to {h.capacity} people
                    </p>
                    <p className="mt-4 text-sm">
                      <b className="font-display text-xl font-extrabold">{kzt(h.hourly_rate_kzt)}</b>
                      <span className="text-ink/60"> / hour</span>
                    </p>
                  </div>
                ))}
          </div>
        </div>
      </section>

      {/* ---- Plans ---- */}
      <section id="plans" className="mx-auto max-w-6xl scroll-mt-20 px-4 py-16 sm:px-6 lg:py-20">
        <SectionTitle kicker="Membership" title="Choose your plan" />
        <p className="mx-auto mt-3 max-w-xl text-center text-ink/70">
          A valid membership lets you book trainers and halls any day it covers.
        </p>
        <div className="mt-10 grid gap-5 md:grid-cols-3">
          {PLANS.map(({ plan, blurb, highlight }) => (
            <div key={plan} className={`card relative flex flex-col ${highlight ? 'bg-sun-soft md:-translate-y-2' : ''}`}>
              {highlight && (
                <span className="chip absolute -top-3 right-5 border-ink bg-berry text-white">Most popular</span>
              )}
              <h3 className="text-xl font-extrabold">{PLAN_LABEL[plan]}</h3>
              <p className="mt-1 font-display text-4xl font-extrabold">
                {PLAN_MONTHS[plan]} <span className="text-lg font-bold text-ink/60">{PLAN_MONTHS[plan] === 1 ? 'month' : 'months'}</span>
              </p>
              <p className="mt-2 text-sm text-ink/70">{blurb}</p>
              <Link to={`/register?plan=${plan}`} className={`${highlight ? 'btn-primary' : 'btn-ghost'} mt-6`}>
                Choose {PLAN_LABEL[plan].toLowerCase()}
              </Link>
            </div>
          ))}
        </div>
      </section>

      {/* ---- CTA ---- */}
      <section className="px-4 pb-16 sm:px-6 lg:pb-20">
        <div className="relative mx-auto max-w-6xl overflow-hidden rounded-3xl border-2 border-ink bg-brand p-8 text-white shadow-hard sm:p-12">
          <div className="pointer-events-none absolute -right-12 -top-12 h-48 w-48 rounded-full bg-sun" />
          <div className="pointer-events-none absolute -bottom-10 right-40 h-24 w-24 rounded-2xl border-4 border-ink bg-berry" />
          <div className="relative max-w-xl">
            <h2 className="text-3xl font-extrabold sm:text-4xl">Ready for your first session?</h2>
            <p className="mt-3 text-lg text-white/90">Create an account and book your first hour today.</p>
            <Link to="/register" className="btn mt-6 bg-white px-6 py-3 text-base text-ink shadow-hard hover:bg-cream">
              Join now <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        </div>
      </section>

      {/* ---- Footer ---- */}
      <footer className="border-t-2 border-ink">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-3 px-4 py-6 text-sm text-ink/60 sm:flex-row sm:px-6">
          <span className="flex items-center gap-2 font-bold text-ink">
            <Dumbbell className="h-4 w-4" /> Gym Booking System
          </span>
          <span>
            Open daily {hourLabel(OPEN_HOUR)} – {hourLabel(CLOSE_HOUR)}
          </span>
          <Link to="/login" className="font-bold hover:text-brand">
            Staff & member sign in
          </Link>
        </div>
      </footer>
    </div>
  );
}

function SectionTitle({ kicker, title }: { kicker: string; title: string }) {
  return (
    <div className="text-center">
      <p className="text-xs font-bold uppercase tracking-widest text-brand">{kicker}</p>
      <h2 className="mt-2 text-3xl font-extrabold sm:text-4xl">{title}</h2>
    </div>
  );
}

function Stat({ value, label }: { value: string; label: string }) {
  return (
    <div>
      <p className="font-display text-2xl font-extrabold text-sun sm:text-3xl">{value}</p>
      <p className="text-xs font-bold uppercase tracking-wide text-cream/70">{label}</p>
    </div>
  );
}

/** Decorative booking slip in the hero; uses the first real trainer when loaded. */
function HeroSlip({ trainerName, trainerSpec, price }: { trainerName?: string; trainerSpec?: string; price?: number }) {
  return (
    <div className="relative mx-auto w-full max-w-sm" aria-hidden="true">
      <div className="absolute -left-4 top-6 h-full w-full rotate-[-5deg] rounded-2xl border-2 border-ink bg-mint" />
      <div className="relative rotate-[2deg] rounded-2xl border-2 border-ink bg-white p-6 shadow-hard">
        <div className="flex items-center justify-between">
          <span className="text-xs font-bold uppercase tracking-wide text-ink/60">Booking slip</span>
          <span className="chip border-mint-dark bg-mint-soft text-mint-dark">
            <CalendarCheck className="mr-1 h-3.5 w-3.5" /> Confirmed
          </span>
        </div>
        <p className="mt-4 font-display text-3xl font-extrabold">BK-0042</p>
        <div className="mt-4 space-y-2 text-sm">
          <Row label="Trainer" value={trainerName ?? 'Your coach'} />
          <Row label="Session" value={trainerSpec ?? 'Personal training'} />
          <Row label="When" value="Tomorrow, 18:00 – 19:00" />
          <Row label="Paid" value={price ? kzt(price) : '—'} />
        </div>
        <div className="mt-5 flex items-center gap-3 rounded-xl border-2 border-dashed border-ink/30 p-3">
          <QrCode className="h-10 w-10" />
          <span className="text-xs text-ink/60">Show this QR code at the front desk to check in.</span>
        </div>
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-4">
      <span className="text-ink/60">{label}</span>
      <span className="text-right font-bold">{value}</span>
    </div>
  );
}

function initials(name: string) {
  return name
    .split(' ')
    .map((p) => p[0])
    .slice(0, 2)
    .join('');
}
