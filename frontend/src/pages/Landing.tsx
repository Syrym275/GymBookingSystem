import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import {
  Clock,
  Instagram,
  LayoutDashboard,
  LogIn,
  LogOut,
  Mail,
  MessageCircle,
  Navigation,
  Phone,
} from "lucide-react";
import { useAuth } from "../auth/AuthContext";
import { HOME } from "../auth/RequireRole";
import { Barbell, Glove, Group, Kettlebell, Mat } from "../components/GymIcons";
import { CLOSE_HOUR, OPEN_HOUR, TODAY_DATE } from "../config";
import {
  CONTACT,
  GYM_NAME,
  HALLS,
  PLANS,
  INSTAGRAM,
  SERVICES,
  STEPS,
  TESTIMONIALS,
  TRAINERS,
  type ServiceIcon,
} from "../data/gymData";
import { hourLabel, kzt } from "../utils/format";
import { ThemeToggle } from "../theme/ThemeContext";
import HeroScene from "../components/HeroScene";

const SERVICE_ICON: Record<
  ServiceIcon,
  (p: { className?: string }) => ReactNode
> = {
  barbell: Barbell,
  group: Group,
  mat: Mat,
  glove: Glove,
  kettlebell: Kettlebell,
};

const NAV = [
  { href: "#services", label: "Services" },
  { href: "#trainers", label: "Trainers" },
  { href: "#halls", label: "Halls" },
  { href: "#pricing", label: "Pricing" },
  { href: "#contact", label: "Contact" },
];

const HOURS_TEXT = `${hourLabel(OPEN_HOUR)}–${hourLabel(CLOSE_HOUR)}`;
const PHONE_HREF = `tel:${CONTACT.phone.replace(/[^+\d]/g, "")}`;
const MAP_SRC = `https://maps.google.com/maps?q=${encodeURIComponent(CONTACT.mapQuery)}&z=16&output=embed`;

/** "Aigerim Sadykova" -> "AS" */
const initials = (name: string) =>
  name
    .split(" ")
    .map((w) => w[0])
    .join("")
    .slice(0, 2);
const years = (n: number) => `${n} ${n === 1 ? "year" : "years"}`;

export default function Landing() {
  const { user, logout } = useAuth();

  // Logged out -> sign up; logged in -> the user's own dashboard.
  const target = user ? HOME[user.role] : "/register";

  return (
    <div className="relative min-h-screen overflow-x-hidden">
      {/* ---- Sticky navbar ---- */}
      <header className="sticky top-0 z-30 border-b border-line bg-cream/90 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 py-3 sm:px-6">
          <a
            href="#top"
            className="flex min-h-[44px] items-center gap-2 rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/60"
          >
            <span className="flex h-10 w-10 items-center justify-center rounded-md bg-brand text-onaccent">
              <Barbell className="h-6 w-6" />
            </span>
            <span className="font-display text-xl font-bold uppercase tracking-wide">
              {GYM_NAME}
            </span>
          </a>
          <nav
            className="hidden items-center gap-6 text-sm font-semibold lg:flex"
            aria-label="Sections"
          >
            {NAV.map((n) => (
              <a key={n.href} href={n.href} className="hover:text-brand-dark">
                {n.label}
              </a>
            ))}
          </nav>
          <div className="flex items-center gap-2">
            <ThemeToggle className="min-h-[44px] min-w-[44px]" />
            {user ? (
              <>
                <span
                  className="hidden max-w-[10rem] truncate text-sm font-semibold md:inline"
                  title={user.full_name}
                >
                  {user.full_name}
                </span>
                <Link
                  to={HOME[user.role]}
                  className="btn-primary min-h-[44px]"
                  aria-label="Dashboard"
                >
                  <LayoutDashboard className="h-4 w-4 sm:hidden" />
                  <span className="hidden sm:inline">Dashboard</span>
                </Link>
                <button
                  type="button"
                  onClick={logout}
                  className="btn-ghost min-h-[44px]"
                  aria-label="Log out"
                >
                  <LogOut className="h-4 w-4" />
                  <span className="hidden sm:inline">Log out</span>
                </button>
              </>
            ) : (
              <>
                <Link
                  to="/login"
                  className="btn-ghost min-h-[44px]"
                  aria-label="Log in"
                >
                  <LogIn className="h-4 w-4 sm:hidden" />
                  <span className="hidden sm:inline">Log in</span>
                </Link>
                <Link to="/register" className="btn-primary min-h-[44px]">
                  Sign up
                </Link>
              </>
            )}
          </div>
        </div>
      </header>

      <main id="top">
        {/* ---- Hero ---- */}
        <section className="mx-auto grid max-w-6xl items-center gap-12 px-4 pb-16 pt-10 sm:px-6 lg:grid-cols-[1fr_1.05fr] lg:pb-20 lg:pt-14">
          <div>
            <h1 className="font-display text-[2.6rem] font-bold uppercase leading-[0.95] sm:text-6xl xl:text-7xl">
              Book your workout.{" "}
              <span className="block text-brand-dark">Rent the hall.</span>
            </h1>
            <div className="mt-5 flex flex-col gap-6">
              <p className="max-w-xl text-base text-ink/75 sm:text-lg">
                Personal training and hall rental by the hour, open {HOURS_TEXT}{" "}
                every day. Pick a free hour, pay online, check in with a QR
                code.
              </p>
              <div className="flex shrink-0 flex-wrap gap-3">
                <Link
                  to={target}
                  className="btn-primary min-h-[48px] px-6 text-base"
                >
                  Book a session
                </Link>
                <Link
                  to={target}
                  className="btn-ghost min-h-[48px] px-6 text-base"
                >
                  Rent a hall
                </Link>
              </div>
            </div>
          </div>

          <HeroScene />
        </section>

        {/* ---- Services ---- */}
        <section
          id="services"
          className="scroll-mt-20 border-y border-line bg-white"
        >
          <div className="mx-auto max-w-6xl px-4 py-14 sm:px-6 lg:py-20">
            <SectionHead
              title="Services"
              note="Every session is one hour and starts on the hour."
            />
            <ul className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
              {SERVICES.map((s) => {
                const Icon = SERVICE_ICON[s.icon];
                return (
                  <li
                    key={s.title}
                    className="flex flex-col rounded-xl border border-line bg-cream p-5"
                  >
                    <span className="flex h-11 w-11 items-center justify-center rounded-md bg-brand text-onaccent">
                      <Icon className="h-6 w-6" />
                    </span>
                    <h3 className="mt-4 text-lg font-bold">{s.title}</h3>
                    <p className="mt-1 text-sm text-ink/70">{s.text}</p>
                    <p className="mt-auto flex items-center gap-1.5 pt-4 text-sm font-semibold">
                      <Clock
                        className="h-4 w-4 text-ink/60"
                        aria-hidden="true"
                      />{" "}
                      {s.duration}
                    </p>
                    <Link
                      to={target}
                      className="btn-ghost mt-4 min-h-[44px]"
                      aria-label={`Book ${s.title.toLowerCase()}`}
                    >
                      Book
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        </section>

        {/* ---- Trainers ---- */}
        <section
          id="trainers"
          className="mx-auto max-w-6xl scroll-mt-20 px-4 py-14 sm:px-6 lg:py-20"
        >
          <SectionHead
            title="Our trainers"
            note="Pick a coach for a one-hour personal session."
          />
          <ul className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {TRAINERS.map((t) => (
              <li
                key={t.name}
                className="flex flex-col overflow-hidden rounded-xl border border-line bg-white"
              >
                <div className="flex flex-1 flex-col px-5 pt-6 text-center">
                  <h3 className="font-display text-2xl font-bold uppercase tracking-wide underline decoration-2 underline-offset-[6px]">
                    {t.name}
                  </h3>
                  <p className="mt-2 text-ink/70">{t.specialization}</p>
                  <dl className="mt-auto grid grid-cols-2 gap-2 pt-5 text-left">
                    <div className="rounded-lg bg-cream p-3">
                      <dt className="text-xs text-ink/60">Per session</dt>
                      <dd className="mt-0.5 font-display text-xl font-bold">
                        {kzt(t.priceKzt)}
                      </dd>
                    </div>
                    <div className="rounded-lg bg-cream p-3">
                      <dt className="text-xs text-ink/60">Experience</dt>
                      <dd className="mt-0.5 font-display text-xl font-bold">
                        {years(t.experienceYears)}
                      </dd>
                    </div>
                  </dl>
                </div>

                {/* Picture area: brand chevrons + initials instead of a photo */}
                <div
                  className="relative mt-5 flex h-36 items-center justify-center overflow-hidden bg-sun-soft"
                  aria-hidden="true"
                >
                  <svg
                    viewBox="0 0 200 140"
                    className="absolute -left-6 bottom-0 h-full text-brand"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="20"
                  >
                    <path d="M30 150 L90 80 L150 150" />
                    <path d="M30 95 L90 25 L150 95" opacity="0.55" />
                  </svg>
                  <span className="relative ml-16 flex h-20 w-20 items-center justify-center rounded-full border-4 border-white bg-ink font-display text-3xl font-bold text-white dark:border-surface dark:bg-brand dark:text-onaccent">
                    {initials(t.name)}
                  </span>
                </div>

                <div className="p-5 pt-4">
                  <Link
                    to={target}
                    className="btn-primary min-h-[44px] w-full"
                    aria-label={`Book a session with ${t.name}`}
                  >
                    Book a session
                  </Link>
                </div>
              </li>
            ))}
          </ul>
        </section>

        {/* ---- Hall rental: drawn to scale by capacity ---- */}
        <section
          id="halls"
          className="mx-auto max-w-6xl scroll-mt-20 px-4 py-14 sm:px-6 lg:py-20"
        >
          <SectionHead
            title="Hall rental"
            note="For your class, team or group. Each block is drawn to scale by how many people the hall holds."
          />
          <div className="mt-8 flex flex-col gap-3 md:h-80 md:flex-row">
            {HALLS.map((h) => (
              <div
                key={h.name}
                style={{ flexGrow: h.capacity }}
                className="relative flex min-h-[12rem] basis-0 flex-col justify-between overflow-hidden rounded-lg border-2 border-dashed border-ink/25 bg-white p-5"
              >
                <h3 className="relative text-xl font-bold">{h.name}</h3>
                <dl className="relative grid grid-cols-[auto_1fr] gap-x-3 text-sm">
                  <dt className="text-ink/60">Capacity</dt>
                  <dd className="font-semibold">up to {h.capacity} people</dd>
                  <dt className="text-ink/60">Size</dt>
                  <dd className="font-semibold">{h.sizeM2} m²</dd>
                  <dt className="sr-only">Price</dt>
                  <dd className="col-span-2 mt-2 font-display text-2xl font-bold">
                    {kzt(h.pricePerHourKzt)}{" "}
                    <span className="font-body text-sm font-normal text-ink/60">
                      / hour
                    </span>
                  </dd>
                </dl>
                <Link
                  to={target}
                  className="btn-primary mt-4 min-h-[44px] self-start"
                  aria-label={`Rent the ${h.name}`}
                >
                  Rent this hall
                </Link>
              </div>
            ))}
          </div>
        </section>

        {/* ---- How it works ---- */}
        <section className="border-y border-line bg-white">
          <div className="mx-auto max-w-6xl px-4 py-14 sm:px-6 lg:py-20">
            <SectionHead title="How it works" />
            <ol className="mt-10 grid gap-x-6 gap-y-8 md:grid-cols-3">
              {STEPS.map((s, i) => (
                <li key={s.title} className="flex gap-4">
                  <span
                    className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full border-[5px] border-ink bg-brand font-display text-xl font-bold text-onaccent ring-2 ring-inset ring-onaccent/20"
                    aria-hidden="true"
                  >
                    {i + 1}
                  </span>
                  <div>
                    <p className="sr-only">Step {i + 1}</p>
                    <h3 className="text-xl font-bold">{s.title}</h3>
                    <p className="mt-1 text-sm text-ink/70">{s.text}</p>
                  </div>
                </li>
              ))}
            </ol>
          </div>
        </section>

        {/* ---- Pricing ---- */}
        <section
          id="pricing"
          className="mx-auto max-w-6xl scroll-mt-20 px-4 py-14 sm:px-6 lg:py-20"
        >
          <SectionHead
            title="Pricing"
            note="A membership lets you book on the days it covers. Trainer sessions and hall hours are paid per booking."
          />
          <ul className="mt-8 grid gap-4 md:grid-cols-3">
            {PLANS.map((p) => (
              <li
                key={p.plan}
                className={`flex flex-col rounded-xl border p-6 ${p.featured ? "border-brand bg-brand/10 ring-1 ring-brand" : "border-line bg-white"}`}
              >
                <h3 className="text-xl font-bold">{p.name}</h3>
                <p className="mt-3">
                  <span className="font-display text-4xl font-bold">
                    {kzt(p.priceKzt)}
                  </span>{" "}
                  <span className="text-sm text-ink/60">{p.period}</span>
                </p>
                <ul className="mt-4 space-y-2 text-sm">
                  {p.perks.map((perk) => (
                    <li key={perk} className="flex gap-2">
                      <span
                        className="mt-1.5 h-2 w-3 shrink-0 rounded-[2px] border border-brand-dark/50 bg-brand/40"
                        aria-hidden="true"
                      />
                      {perk}
                    </li>
                  ))}
                </ul>
                <Link
                  to={user ? HOME[user.role] : `/register?plan=${p.plan}`}
                  className={`${p.featured ? "btn-primary" : "btn-ghost"} mt-6 min-h-[44px]`}
                  aria-label={
                    user ? "Dashboard" : `Sign up with the ${p.name} plan`
                  }
                >
                  {user ? "Dashboard" : `Choose ${p.name}`}
                </Link>
              </li>
            ))}
          </ul>
          <p className="mt-4 text-xs text-ink/60">
            Prices shown are demo values.
          </p>
        </section>

        {/* ---- Testimonials ---- */}
        <section className="border-y border-line bg-white">
          <div className="mx-auto max-w-6xl px-4 py-14 sm:px-6 lg:py-20">
            <SectionHead
              title="What members say"
              note="Sample reviews with fictional names, for this demo."
            />
            <ul className="mt-8 grid gap-4 md:grid-cols-3">
              {TESTIMONIALS.map((t) => (
                <li key={t.name}>
                  <figure className="flex h-full flex-col rounded-xl border border-line bg-cream p-6">
                    <blockquote className="text-ink/85">“{t.text}”</blockquote>
                    <figcaption className="mt-auto pt-5 text-sm">
                      <span className="block font-semibold">{t.name}</span>
                      <span className="text-ink/60">{t.role}</span>
                    </figcaption>
                  </figure>
                </li>
              ))}
            </ul>
          </div>
        </section>

        {/* ---- Contact: address, hours, phone, map ---- */}
        <section id="contact" className="scroll-mt-20">
          <div className="mx-auto grid max-w-6xl gap-8 px-4 py-14 sm:px-6 lg:grid-cols-[1fr_1.35fr] lg:items-center lg:py-20">
            <div>
              <p className="text-sm font-bold uppercase tracking-widest text-brand-dark">
                Visit us
              </p>
              <h2 className="mt-2 text-4xl font-bold sm:text-5xl">
                {CONTACT.address}
              </h2>

              <ul className="mt-6 space-y-1 text-lg">
                <li className="flex min-h-[44px] items-center gap-3">
                  <Clock className="h-6 w-6 shrink-0 text-brand-dark" aria-hidden="true" />
                  Every day, {HOURS_TEXT}
                </li>
                <li>
                  <a href={PHONE_HREF} className="inline-flex min-h-[44px] items-center gap-3 underline-offset-4 hover:underline">
                    <Phone className="h-6 w-6 shrink-0 text-brand-dark" aria-hidden="true" />
                    {CONTACT.phone}
                  </a>
                </li>
                <li>
                  <a href={`mailto:${CONTACT.email}`} className="inline-flex min-h-[44px] items-center gap-3 underline-offset-4 hover:underline">
                    <Mail className="h-6 w-6 shrink-0 text-brand-dark" aria-hidden="true" />
                    {CONTACT.email}
                  </a>
                </li>
                <li>
                  <a
                    href={INSTAGRAM.href}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex min-h-[44px] items-center gap-3 underline-offset-4 hover:underline"
                  >
                    <Instagram className="h-6 w-6 shrink-0 text-brand-dark" aria-hidden="true" />
                    {INSTAGRAM.label}
                  </a>
                </li>
              </ul>

              <div className="mt-8 flex flex-col gap-3 sm:max-w-sm">
                <a href={CONTACT.whatsapp} target="_blank" rel="noopener noreferrer" className="contact-btn">
                  <MessageCircle className="h-5 w-5" aria-hidden="true" />
                  Message us on WhatsApp
                </a>
                <a href={CONTACT.twoGisUrl} target="_blank" rel="noopener noreferrer" className="contact-btn">
                  <Navigation className="h-5 w-5" aria-hidden="true" />
                  Get directions in 2GIS
                </a>
              </div>
            </div>

            <div className="h-80 overflow-hidden rounded-2xl border border-line bg-white sm:h-96 lg:h-[440px]">
              <iframe
                title={`Map: ${GYM_NAME}, ${CONTACT.address}`}
                src={MAP_SRC}
                className="h-full w-full border-0"
                loading="lazy"
                referrerPolicy="no-referrer-when-downgrade"
              />
            </div>
          </div>
        </section>
      </main>

      {/* ---- Footer ---- */}
      <footer className="border-t border-line">
        <div className="mx-auto flex max-w-6xl flex-col gap-2 px-4 py-6 text-sm sm:flex-row sm:items-center sm:justify-between sm:px-6">
          <p className="flex items-center gap-2 font-display text-lg font-bold uppercase tracking-wide">
            <Barbell className="h-5 w-5" /> {GYM_NAME}
          </p>
          <p className="text-xs text-ink/60">
            © {TODAY_DATE.slice(0, 4)} {GYM_NAME}. Personal training and hall rental by the hour.
          </p>
        </div>
      </footer>
    </div>
  );
}

function SectionHead({ title, note }: { title: string; note?: string }) {
  return (
    <div className="max-w-3xl">
      <h2 className="text-3xl font-bold sm:text-4xl">{title}</h2>
      {note && <p className="mt-2 text-ink/70">{note}</p>}
    </div>
  );
}
