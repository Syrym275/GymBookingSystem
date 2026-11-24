import { useId, useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import {
  ChevronDown,
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
import { getPublicCatalog } from "../api/publicApi";
import { useAsync } from "../hooks/useAsync";
import { HOME } from "../auth/RequireRole";
import { Barbell, Glove, Group, Kettlebell, Mat } from "../components/GymIcons";
import {
  CLOSE_HOUR,
  HOLD_MINUTES,
  MAX_PENDING,
  OPEN_HOUR,
  TODAY_DATE,
} from "../config";
import { LanguageSwitcher, useT, type Key } from "../i18n";
import { TrainerPortrait } from "../components/TrainerPortrait";
import {
  CONTACT,
  GYM_NAME,
  PLANS,
  INSTAGRAM,
  SERVICES,
  STEPS,
  TESTIMONIALS,
  address,
  specializationLabel,
  type ServiceIcon,
} from "../data/gymData";
import { hourLabel, kzt } from "../utils/format";
import { ThemeToggle } from "../theme/ThemeContext";
import HeroScene from "../components/HeroScene";
import { msg } from "../i18n/messages";

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

const NAV: { href: string; label: Key }[] = [
  { href: "#services", label: "landing.nav.services" },
  { href: "#trainers", label: "landing.nav.trainers" },
  { href: "#halls", label: "landing.nav.halls" },
  { href: "#pricing", label: "landing.nav.pricing" },
  { href: "#faq", label: "landing.nav.faq" },
  { href: "#contact", label: "landing.nav.contact" },
];

// FAQ items: text in landing.faq.q<n> / landing.faq.a<n>. The answers repeat the site's real rules
// (see config.ts and the backend), so numbers are filled in from config, not typed into the text.
const FAQ_COUNT = 8;

const HOURS_TEXT = `${hourLabel(OPEN_HOUR)}–${hourLabel(CLOSE_HOUR)}`;
const PHONE_HREF = `tel:${CONTACT.phone.replace(/[^+\d]/g, "")}`;
const MAP_SRC = `https://maps.google.com/maps?q=${encodeURIComponent(CONTACT.mapQuery)}&z=16&output=embed`;

export default function Landing() {
  const { t, tp, lang } = useT();
  const { user, logout } = useAuth();
  const catalog = useAsync(getPublicCatalog, []);
  const trainers = catalog.data?.trainers ?? [];
  const halls = catalog.data?.halls ?? [];

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
            aria-label={t("landing.nav.sections")}
          >
            {NAV.map((n) => (
              <a key={n.href} href={n.href} className="hover:text-brand-dark">
                {t(n.label)}
              </a>
            ))}
          </nav>
          <div className="flex items-center gap-2">
            <LanguageSwitcher className="hidden sm:inline-flex" />
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
                  aria-label={t("common.dashboard")}
                >
                  <LayoutDashboard className="h-4 w-4 sm:hidden" />
                  <span className="hidden sm:inline">{t("common.dashboard")}</span>
                </Link>
                <button
                  type="button"
                  onClick={logout}
                  className="btn-ghost min-h-[44px]"
                  aria-label={t("common.logOut")}
                >
                  <LogOut className="h-4 w-4" />
                  <span className="hidden sm:inline">{t("common.logOut")}</span>
                </button>
              </>
            ) : (
              <>
                <Link
                  to="/login"
                  className="btn-ghost min-h-[44px]"
                  aria-label={t("common.logIn")}
                >
                  <LogIn className="h-4 w-4 sm:hidden" />
                  <span className="hidden sm:inline">{t("common.logIn")}</span>
                </Link>
                <Link to="/register" className="btn-primary min-h-[44px]">
                  {t("common.signUp")}
                </Link>
              </>
            )}
          </div>
        </div>
        {/* On phones the language switch gets its own row so the header buttons still fit. */}
        <div className="flex justify-end border-t border-line px-4 py-1.5 sm:hidden">
          <LanguageSwitcher />
        </div>
      </header>

      <main id="top">
        {/* ---- Hero ---- */}
        <section className="mx-auto grid max-w-6xl items-center gap-12 px-4 pb-16 pt-10 sm:px-6 lg:grid-cols-[1fr_1.05fr] lg:pb-20 lg:pt-14">
          <div>
            <h1 className="font-display text-[2.6rem] font-bold uppercase leading-[0.95] sm:text-6xl xl:text-7xl">
              {t("landing.hero.title1")}{" "}
              <span className="block text-brand-dark">{t("landing.hero.title2")}</span>
            </h1>
            <div className="mt-5 flex flex-col gap-6">
              <p className="max-w-xl text-base text-ink/75 sm:text-lg">
                {t("landing.hero.text", { hours: HOURS_TEXT })}
              </p>
              <div className="flex shrink-0 flex-wrap gap-3">
                <Link
                  to={target}
                  className="btn-primary min-h-[48px] px-6 text-base"
                >
                  {t("landing.bookSession")}
                </Link>
                <Link
                  to={target}
                  className="btn-ghost min-h-[48px] px-6 text-base"
                >
                  {t("landing.rentHall")}
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
              title={t("landing.services.title")}
              note={t("landing.services.note")}
            />
            <ul className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
              {SERVICES.map((s) => {
                const Icon = SERVICE_ICON[s.icon];
                return (
                  <li
                    key={s.id}
                    className="flex flex-col rounded-xl border border-line bg-cream p-5"
                  >
                    <span className="flex h-11 w-11 items-center justify-center rounded-md bg-brand text-onaccent">
                      <Icon className="h-6 w-6" />
                    </span>
                    <h3 className="mt-4 text-lg font-bold">{t(`service.${s.id}.title` as Key)}</h3>
                    <p className="mt-1 text-sm text-ink/70">{t(`service.${s.id}.text` as Key)}</p>
                    <p className="mt-auto flex items-center gap-1.5 pt-4 text-sm font-semibold">
                      <Clock
                        className="h-4 w-4 text-ink/60"
                        aria-hidden="true"
                      />{" "}
                      {t(`service.${s.id}.duration` as Key)}
                    </p>
                    <Link
                      to={target}
                      className="btn-ghost mt-4 min-h-[44px]"
                      aria-label={t("landing.bookService", { service: t(`service.${s.id}.title` as Key) })}
                    >
                      {t("landing.book")}
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
          <SectionHead title={t("landing.trainers.title")} note={t("landing.trainers.note")} />
          {catalog.loading && <p className="mt-6 text-ink/70" role="status">{t("landing.trainers.loading")}</p>}
          {catalog.error && (
            <div className="mt-6" role="alert">
              <p className="text-berry">{msg(catalog.error)}</p>
              <button type="button" className="btn-ghost mt-3" onClick={catalog.reload}>{t("common.tryAgain")}</button>
            </div>
          )}
          {!catalog.loading && !catalog.error && trainers.length === 0 && (
            <p className="mt-6 text-ink/70">{t("landing.trainers.none")}</p>
          )}
          <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {trainers.map((trainer) => (
              <article key={trainer.trainer_id} className="flex flex-col overflow-hidden rounded-xl border border-line bg-white">
                <TrainerPortrait trainerId={trainer.trainer_id} name={trainer.full_name} />
                <div className="flex flex-1 flex-col px-5 pt-5 text-center">
                  <h3 className="font-display text-xl font-bold uppercase tracking-wide">{trainer.full_name}</h3>
                  <p className="mt-2 text-sm text-ink/70">{specializationLabel(trainer.specialization)}</p>
                  <p className="mt-auto pt-5 font-display text-2xl font-bold">
                    {kzt(trainer.session_price_kzt)} <span className="font-body text-sm font-normal text-ink/60">{t("landing.perSession")}</span>
                  </p>
                </div>
                <div className="p-5 pt-4">
                  <Link to={target} className="btn-primary min-h-[44px] w-full" aria-label={t("landing.bookWith", { name: trainer.full_name })}>
                    {t("landing.bookSession")}
                  </Link>
                </div>
              </article>
            ))}
          </div>
        </section>

        {/* ---- Hall rental: drawn to scale by capacity ---- */}
        <section
          id="halls"
          className="mx-auto max-w-6xl scroll-mt-20 px-4 py-14 sm:px-6 lg:py-20"
        >
          <SectionHead
            title={t("landing.halls.title")}
            note={t("landing.halls.note")}
          />
          {catalog.loading && <p className="mt-6 text-ink/70" role="status">{t("landing.halls.loading")}</p>}
          {catalog.error && (
            <div className="mt-6" role="alert">
              <p className="text-berry">{msg(catalog.error)}</p>
              <button type="button" className="btn-ghost mt-3" onClick={catalog.reload}>{t("common.tryAgain")}</button>
            </div>
          )}
          {!catalog.loading && !catalog.error && halls.length === 0 && (
            <p className="mt-6 text-ink/70">{t("landing.halls.none")}</p>
          )}
          <div className="mt-8 flex flex-col gap-3 md:h-80 md:flex-row">
            {halls.map((h) => (
              <div
                key={h.hall_id}
                style={{ flexGrow: h.capacity }}
                className="relative flex min-h-[12rem] basis-0 flex-col justify-between overflow-hidden rounded-lg border-2 border-dashed border-ink/25 bg-white p-5"
              >
                <h3 className="relative text-xl font-bold">{h.hall_name}</h3>
                <dl className="relative grid grid-cols-[auto_1fr] gap-x-3 text-sm">
                  <dt className="text-ink/60">{t("landing.halls.capacity")}</dt>
                  <dd className="font-semibold">{tp("landing.halls.upTo", h.capacity)}</dd>
                  <dt className="sr-only">{t("landing.halls.price")}</dt>
                  <dd className="col-span-2 mt-2 font-display text-2xl font-bold">
                    {kzt(h.hourly_rate_kzt)}{" "}
                    <span className="font-body text-sm font-normal text-ink/60">
                      {t("landing.perHour")}
                    </span>
                  </dd>
                </dl>
                <Link
                  to={target}
                  className="btn-primary mt-4 min-h-[44px] self-start"
                  aria-label={t("landing.rentThe", { hall: h.hall_name })}
                >
                  {t("landing.rentThisHall")}
                </Link>
              </div>
            ))}
          </div>
        </section>

        {/* ---- How it works ---- */}
        <section className="border-y border-line bg-white">
          <div className="mx-auto max-w-6xl px-4 py-14 sm:px-6 lg:py-20">
            <SectionHead title={t("landing.how.title")} />
            <ol className="mt-10 grid gap-x-6 gap-y-8 md:grid-cols-3">
              {STEPS.map((s, i) => (
                <li key={s} className="flex gap-4">
                  <span
                    className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full border-[5px] border-ink bg-brand font-display text-xl font-bold text-onaccent ring-2 ring-inset ring-onaccent/20"
                    aria-hidden="true"
                  >
                    {i + 1}
                  </span>
                  <div>
                    <p className="sr-only">{t("landing.how.step", { n: i + 1 })}</p>
                    <h3 className="text-xl font-bold">{t(`step.${s}.title` as Key)}</h3>
                    <p className="mt-1 text-sm text-ink/70">{t(`step.${s}.text` as Key)}</p>
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
            title={t("landing.pricing.title")}
            note={t("landing.pricing.note")}
          />
          <ul className="mt-8 grid gap-4 md:grid-cols-3">
            {PLANS.map((p) => (
              <li
                key={p.plan}
                className={`flex flex-col rounded-xl border p-6 ${p.featured ? "border-brand bg-brand/10 ring-1 ring-brand" : "border-line bg-white"}`}
              >
                <h3 className="text-xl font-bold">{t(`plan.${p.plan}` as Key)}</h3>
                <p className="mt-3">
                  <span className="font-display text-4xl font-bold">
                    {kzt(p.priceKzt)}
                  </span>{" "}
                  <span className="text-sm text-ink/60">{t(`landing.plan.${p.plan}.period` as Key)}</span>
                </p>
                <ul className="mt-4 space-y-2 text-sm">
                  {[t(`landing.plan.${p.plan}.perk1` as Key), t("landing.plan.perk2"), t("landing.plan.perk3")].map((perk) => (
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
                    user ? t("common.dashboard") : t("landing.pricing.signUpWith", { plan: t(`plan.${p.plan}` as Key) })
                  }
                >
                  {user ? t("common.dashboard") : t("landing.pricing.choose", { plan: t(`plan.${p.plan}` as Key) })}
                </Link>
              </li>
            ))}
          </ul>
          <p className="mt-4 text-xs text-ink/60">
            {t("landing.pricing.demo")}
          </p>
        </section>

        {/* ---- Testimonials ---- */}
        <section className="border-y border-line bg-white">
          <div className="mx-auto max-w-6xl px-4 py-14 sm:px-6 lg:py-20">
            <SectionHead
              title={t("landing.reviews.title")}
              note={t("landing.reviews.note")}
            />
            <ul className="mt-8 grid gap-4 md:grid-cols-3">
              {TESTIMONIALS.map((r) => (
                <li key={r.name}>
                  <figure className="flex h-full flex-col rounded-xl border border-line bg-cream p-6">
                    <blockquote className="text-ink/85">{lang === "en" ? "“" : "«"}{t(`review.${r.n}.text` as Key)}{lang === "en" ? "”" : "»"}</blockquote>
                    <figcaption className="mt-auto pt-5 text-sm">
                      <span className="block font-semibold">{r.name}</span>
                      <span className="text-ink/60">{t(`review.${r.n}.role` as Key)}</span>
                    </figcaption>
                  </figure>
                </li>
              ))}
            </ul>
          </div>
        </section>

        {/* ---- FAQ ---- */}
        <section
          id="faq"
          className="mx-auto max-w-6xl scroll-mt-20 px-4 py-14 sm:px-6 lg:py-20"
        >
          <SectionHead title={t("landing.faq.title")} note={t("landing.faq.note")} />
          <Faq />
        </section>

        {/* ---- Contact: address, hours, phone, map ---- */}
        <section id="contact" className="scroll-mt-20">
          <div className="mx-auto grid max-w-6xl gap-8 px-4 py-14 sm:px-6 lg:grid-cols-[1fr_1.35fr] lg:items-center lg:py-20">
            <div>
              <p className="text-sm font-bold uppercase tracking-widest text-brand-dark">
                {t("landing.contact.visit")}
              </p>
              <h2 className="mt-2 text-4xl font-bold sm:text-5xl">
                {address()}
              </h2>

              <ul className="mt-6 space-y-1 text-lg">
                <li className="flex min-h-[44px] items-center gap-3">
                  <Clock className="h-6 w-6 shrink-0 text-brand-dark" aria-hidden="true" />
                  {t("landing.contact.everyDay", { hours: HOURS_TEXT })}
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
                  {t("landing.contact.whatsapp")}
                </a>
                <a href={CONTACT.twoGisUrl} target="_blank" rel="noopener noreferrer" className="contact-btn">
                  <Navigation className="h-5 w-5" aria-hidden="true" />
                  {t("landing.contact.twoGis")}
                </a>
              </div>
            </div>

            <div className="h-80 overflow-hidden rounded-2xl border border-line bg-white sm:h-96 lg:h-[440px]">
              <iframe
                title={t("landing.contact.map", { gym: GYM_NAME, address: address() })}
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
            © {TODAY_DATE.slice(0, 4)} {GYM_NAME}. {t("landing.footer")}
          </p>
        </div>
      </footer>
    </div>
  );
}

/** Accordion: one answer open at a time; each question is a button, so it works from the keyboard. */
function Faq() {
  const { t } = useT();
  const [open, setOpen] = useState<number | null>(null);
  const baseId = useId();
  const vars = {
    hold: HOLD_MINUTES,
    max: MAX_PENDING,
    gym: GYM_NAME,
    monthly: t("plan.monthly"),
    quarterly: t("plan.quarterly"),
    annual: t("plan.annual"),
  };

  return (
    <ul className="mt-8 max-w-3xl divide-y divide-line overflow-hidden rounded-xl border border-line bg-white">
      {Array.from({ length: FAQ_COUNT }, (_, i) => {
        const n = i + 1;
        const isOpen = open === n;
        const buttonId = `${baseId}-q${n}`;
        const panelId = `${baseId}-a${n}`;
        return (
          <li key={n}>
            <h3>
              <button
                type="button"
                id={buttonId}
                aria-expanded={isOpen}
                aria-controls={panelId}
                onClick={() => setOpen(isOpen ? null : n)}
                className="flex min-h-[56px] w-full items-center justify-between gap-4 px-5 py-4 text-left font-semibold transition hover:bg-cream focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand/60 sm:text-lg"
              >
                <span>{t(`landing.faq.q${n}` as Key, vars)}</span>
                <ChevronDown
                  className={`h-5 w-5 shrink-0 text-brand-dark transition-transform duration-200 ${isOpen ? "rotate-180" : ""}`}
                  aria-hidden="true"
                />
              </button>
            </h3>
            <div
              id={panelId}
              role="region"
              aria-labelledby={buttonId}
              hidden={!isOpen}
              className="px-5 pb-5 text-ink/75"
            >
              {t(`landing.faq.a${n}` as Key, vars)}
            </div>
          </li>
        );
      })}
    </ul>
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
