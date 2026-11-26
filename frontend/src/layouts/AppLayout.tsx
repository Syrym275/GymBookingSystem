import { useState, type ReactNode } from 'react';
import { Link, NavLink, Outlet, useNavigate } from 'react-router-dom';
import {
  Activity,
  BarChart3,
  Building2,
  CalendarCheck,
  CalendarDays,
  Dumbbell,
  LayoutDashboard,
  ListChecks,
  LogOut,
  MailWarning,
  Menu,
  PlusCircle,
  History,
  Receipt,
  Search,
  ScrollText,
  ShieldCheck,
  User,
  UserCog,
  Users,
  Wallet,
  X,
} from 'lucide-react';
import { useAuth } from '../auth/AuthContext';
import { ROLE_LABEL } from '../auth/RequireRole';
import type { Role } from '../types';
import { fmtDateTime } from '../utils/format';
import { TODAY } from '../config';
import { ThemeToggle } from '../theme/ThemeContext';
import { LanguageSwitcher, useT, type Key } from '../i18n';

interface NavItem {
  to: string;
  label: Key;
  icon: ReactNode;
  end?: boolean;
}

const i = 'h-4 w-4';
const NAV: Partial<Record<Role, NavItem[]>> = {
  member: [
    { to: '/member', label: 'common.dashboard', icon: <LayoutDashboard className={i} />, end: true },
    { to: '/member/book', label: 'nav.bookSession', icon: <PlusCircle className={i} /> },
    { to: '/member/bookings', label: 'nav.myBookings', icon: <ListChecks className={i} /> },
    { to: '/member/groups', label: 'nav.groups', icon: <Users className={i} /> },
    { to: '/member/profile', label: 'nav.profile', icon: <User className={i} /> },
  ],
  trainer: [
    { to: '/trainer', label: 'nav.overview', icon: <LayoutDashboard className={i} />, end: true },
    { to: '/trainer/schedule', label: 'nav.schedule', icon: <CalendarDays className={i} /> },
    { to: '/trainer/stats', label: 'nav.stats', icon: <BarChart3 className={i} /> },
    { to: '/trainer/clients', label: 'nav.clients', icon: <Users className={i} /> },
    { to: '/trainer/history', label: 'nav.history', icon: <History className={i} /> },
    { to: '/trainer/status', label: 'nav.status', icon: <Activity className={i} /> },
    { to: '/trainer/profile', label: 'profile.title', icon: <User className={i} /> },
  ],
  admin: [
    { to: '/admin', label: 'nav.overview', icon: <LayoutDashboard className={i} />, end: true },
    { to: '/admin/bookings', label: 'adm.nav.bookings', icon: <ListChecks className={i} /> },
    { to: '/admin/payments', label: 'adm.nav.payments', icon: <Receipt className={i} /> },
    { to: '/admin/trainers', label: 'adm.nav.trainers', icon: <Dumbbell className={i} /> },
    { to: '/admin/halls', label: 'adm.nav.halls', icon: <Building2 className={i} /> },
    { to: '/admin/members', label: 'adm.nav.members', icon: <Users className={i} /> },
    { to: '/admin/reports', label: 'adm.nav.reports', icon: <BarChart3 className={i} /> },
    { to: '/admin/staff', label: 'adm.nav.staff', icon: <UserCog className={i} /> },
    { to: '/admin/audit', label: 'adm.nav.audit', icon: <ScrollText className={i} /> },
    { to: '/admin/profile', label: 'profile.title', icon: <User className={i} /> },
  ],
  receptionist: [
    { to: '/reception', label: 'nav.today', icon: <CalendarCheck className={i} />, end: true },
    { to: '/reception/bookings', label: 'nav.allBookings', icon: <ListChecks className={i} /> },
    { to: '/reception/unpaid', label: 'nav.unpaid', icon: <Wallet className={i} /> },
    { to: '/reception/members', label: 'nav.memberLookup', icon: <Search className={i} /> },
    { to: '/reception/new', label: 'nav.newBooking', icon: <PlusCircle className={i} /> },
    { to: '/reception/profile', label: 'profile.title', icon: <User className={i} /> },
  ],
};

export function AppLayout() {
  const { t } = useT();
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  if (!user) return null;

  const items = NAV[user.role] ?? [];

  const sidebar = (
    <nav className="flex h-full flex-col gap-1 p-4">
      <div className="mb-6 flex items-center gap-3 px-2">
        <span className="flex h-9 w-9 items-center justify-center rounded-md bg-brand text-onaccent">
          <Dumbbell className="h-5 w-5" />
        </span>
        <span className="font-display text-lg font-bold uppercase leading-tight tracking-wide">
          Gym Booking
          <span className="block font-body text-[11px] font-medium normal-case tracking-normal text-ink/50">{t('nav.area', { role: ROLE_LABEL[user.role] })}</span>
        </span>
      </div>
      {items.map((it) => (
        <NavLink
          key={it.to}
          to={it.to}
          end={it.end}
          onClick={() => setOpen(false)}
          className={({ isActive }) =>
            `flex items-center gap-3 rounded-md px-3 py-2 text-sm font-semibold transition ${
              isActive ? 'bg-brand text-onaccent' : 'text-ink/70 hover:bg-sun-soft hover:text-ink'
            }`
          }
        >
          {it.icon}
          {t(it.label)}
        </NavLink>
      ))}
      <div className="mt-auto rounded-md border border-line bg-cream p-3 text-xs">
        <p className="flex items-center gap-1 font-semibold uppercase tracking-wide text-ink/70">
          <ShieldCheck className="h-3 w-3 text-brand-dark" /> {t('nav.clock')}
        </p>
        <p className="mt-0.5 text-ink/50">{fmtDateTime(TODAY)} {t('nav.clockNote')}</p>
      </div>
    </nav>
  );

  return (
    <div className="flex min-h-screen">
      <aside className="sticky top-0 hidden h-screen w-64 shrink-0 border-r border-line bg-white lg:block">{sidebar}</aside>

      {open && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div className="absolute inset-0 bg-black/60" onClick={() => setOpen(false)} />
          <aside className="relative h-full w-64 border-r border-line bg-white">
            <button className="absolute right-3 top-3 text-ink/60 hover:text-ink" onClick={() => setOpen(false)} aria-label={t('nav.closeMenu')}>
              <X className="h-5 w-5" />
            </button>
            {sidebar}
          </aside>
        </div>
      )}

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex flex-wrap items-center gap-3 border-b border-line bg-cream/80 px-4 py-3 backdrop-blur">
          <button className="rounded-md border border-line p-1.5 lg:hidden" onClick={() => setOpen(true)} aria-label={t('nav.openMenu')}>
            <Menu className="h-5 w-5" />
          </button>
          <div className="mr-auto min-w-0">
            <p className="truncate text-sm font-extrabold">{user.full_name}</p>
            <p className="text-xs text-ink/60">{ROLE_LABEL[user.role]}</p>
          </div>

          <LanguageSwitcher />
          <ThemeToggle />
          <button
            className="btn-ghost btn-sm"
            onClick={() => {
              logout();
              navigate('/login');
            }}
          >
            <LogOut className="h-3 w-3" /> {t('common.logOut')}
          </button>
        </header>
        <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-6 sm:px-6">
          {user.email_verified === false && (
            <div className="mb-6 flex flex-wrap items-center gap-3 rounded-xl border border-line bg-cream p-4 text-sm" role="status">
              <MailWarning className="h-5 w-5 shrink-0 text-brand-dark" />
              <p className="min-w-0 flex-1">
                <b>{t('nav.verifyBanner')}</b> {t('nav.verifySent')} <span className="break-all">{user.email}</span>.
              </p>
              <Link
                to={`/check-email?${new URLSearchParams({ email: user.email })}`}
                className="btn-secondary inline-flex min-h-[44px] items-center justify-center"
              >
                {t('nav.resend')}
              </Link>
            </div>
          )}
          <Outlet />
        </main>
      </div>
    </div>
  );
}
