import { useState, type ReactNode } from 'react';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import {
  Building2,
  CalendarCheck,
  Dumbbell,
  LayoutDashboard,
  ListChecks,
  LogOut,
  Menu,
  PlusCircle,
  RotateCcw,
  Search,
  ShieldCheck,
  User,
  Wallet,
  X,
} from 'lucide-react';
import { useAuth } from '../auth/AuthContext';
import { DEMO_ACCOUNTS } from '../auth/mockUsers';
import { HOME, ROLE_LABEL } from '../auth/RequireRole';
import { resetDb } from '../mock/db';
import type { Role } from '../types';
import { fmtDateTime } from '../utils/format';
import { TODAY } from '../config';
import { ThemeToggle } from '../theme/ThemeContext';

interface NavItem {
  to: string;
  label: string;
  icon: ReactNode;
  end?: boolean;
}

const i = 'h-4 w-4';
const NAV: Partial<Record<Role, NavItem[]>> = {
  member: [
    { to: '/member', label: 'Dashboard', icon: <LayoutDashboard className={i} />, end: true },
    { to: '/member/trainers', label: 'Book a trainer', icon: <Dumbbell className={i} /> },
    { to: '/member/halls', label: 'Rent a hall', icon: <Building2 className={i} /> },
    { to: '/member/bookings', label: 'My bookings', icon: <ListChecks className={i} /> },
    { to: '/member/profile', label: 'Profile & QR', icon: <User className={i} /> },
  ],
  receptionist: [
    { to: '/reception', label: 'Today', icon: <CalendarCheck className={i} />, end: true },
    { to: '/reception/bookings', label: 'All bookings', icon: <ListChecks className={i} /> },
    { to: '/reception/unpaid', label: 'Unpaid bookings', icon: <Wallet className={i} /> },
    { to: '/reception/members', label: 'Member lookup', icon: <Search className={i} /> },
    { to: '/reception/new', label: 'New booking', icon: <PlusCircle className={i} /> },
  ],
};

export function AppLayout() {
  const { user, login, logout } = useAuth();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  if (!user) return null;

  const items = NAV[user.role] ?? [];

  const switchRole = async (role: Role) => {
    const demo = DEMO_ACCOUNTS.find((d) => d.role === role)!;
    await login(demo.email, demo.password);
    navigate(HOME[role]);
  };

  const onReset = () => {
    resetDb();
    window.location.href = HOME[user.role];
  };

  const sidebar = (
    <nav className="flex h-full flex-col gap-1 p-4">
      <div className="mb-6 flex items-center gap-3 px-2">
        <span className="flex h-9 w-9 items-center justify-center rounded-md bg-brand text-onaccent">
          <Dumbbell className="h-5 w-5" />
        </span>
        <span className="font-display text-lg font-bold uppercase leading-tight tracking-wide">
          Gym Booking
          <span className="block font-body text-[11px] font-medium normal-case tracking-normal text-ink/50">{ROLE_LABEL[user.role]} area</span>
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
          {it.label}
        </NavLink>
      ))}
      <div className="mt-auto rounded-md border border-line bg-cream p-3 text-xs">
        <p className="flex items-center gap-1 font-semibold uppercase tracking-wide text-ink/70">
          <ShieldCheck className="h-3 w-3 text-brand-dark" /> Demo clock
        </p>
        <p className="mt-0.5 text-ink/50">{fmtDateTime(TODAY)} (fixed for the sample data)</p>
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
            <button className="absolute right-3 top-3 text-ink/60 hover:text-ink" onClick={() => setOpen(false)} aria-label="Close menu">
              <X className="h-5 w-5" />
            </button>
            {sidebar}
          </aside>
        </div>
      )}

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex flex-wrap items-center gap-3 border-b border-line bg-cream/80 px-4 py-3 backdrop-blur">
          <button className="rounded-md border border-line p-1.5 lg:hidden" onClick={() => setOpen(true)} aria-label="Open menu">
            <Menu className="h-5 w-5" />
          </button>
          <div className="mr-auto min-w-0">
            <p className="truncate text-sm font-extrabold">{user.full_name}</p>
            <p className="text-xs text-ink/60">{ROLE_LABEL[user.role]}</p>
          </div>

          {import.meta.env.DEV && (
            <div className="flex items-center gap-2 rounded-md border border-dashed border-brand/60 bg-brand-soft px-2 py-1 text-xs">
              <span className="font-bold text-brand-dark">DEV</span>
              <select
                aria-label="Switch role (dev only)"
                className="rounded border border-line bg-white px-1 py-1 font-semibold text-ink"
                value={user.role}
                onChange={(e) => switchRole(e.target.value as Role)}
              >
                {DEMO_ACCOUNTS.map((d) => (
                  <option key={d.role} value={d.role}>
                    {d.label}
                  </option>
                ))}
              </select>
              <button className="btn-ghost btn-sm" onClick={onReset} title="Restore the original sample data">
                <RotateCcw className="h-3 w-3" /> Reset demo data
              </button>
            </div>
          )}

          <ThemeToggle />
          <button
            className="btn-ghost btn-sm"
            onClick={() => {
              logout();
              navigate('/login');
            }}
          >
            <LogOut className="h-3 w-3" /> Log out
          </button>
        </header>
        <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-6 sm:px-6">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
