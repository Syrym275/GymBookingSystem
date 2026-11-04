import { useState, type ReactNode } from 'react';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import {
  BarChart3,
  Building2,
  CalendarCheck,
  CalendarDays,
  ClipboardList,
  Dumbbell,
  LayoutDashboard,
  ListChecks,
  LogOut,
  Menu,
  PlusCircle,
  Receipt,
  RotateCcw,
  Search,
  ShieldCheck,
  User,
  Users,
  UserCog,
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

interface NavItem {
  to: string;
  label: string;
  icon: ReactNode;
  end?: boolean;
}

const i = 'h-4 w-4';
const NAV: Record<Role, NavItem[]> = {
  member: [
    { to: '/member', label: 'Dashboard', icon: <LayoutDashboard className={i} />, end: true },
    { to: '/member/trainers', label: 'Book a trainer', icon: <Dumbbell className={i} /> },
    { to: '/member/halls', label: 'Rent a hall', icon: <Building2 className={i} /> },
    { to: '/member/bookings', label: 'My bookings', icon: <ListChecks className={i} /> },
    { to: '/member/profile', label: 'Profile & QR', icon: <User className={i} /> },
  ],
  trainer: [
    { to: '/trainer', label: 'My schedule', icon: <CalendarDays className={i} />, end: true },
    { to: '/trainer/sessions', label: 'Sessions', icon: <ClipboardList className={i} /> },
    { to: '/trainer/stats', label: 'Stats', icon: <BarChart3 className={i} /> },
  ],
  receptionist: [
    { to: '/reception', label: 'Today', icon: <CalendarCheck className={i} />, end: true },
    { to: '/reception/bookings', label: 'All bookings', icon: <ListChecks className={i} /> },
    { to: '/reception/unpaid', label: 'Unpaid bookings', icon: <Wallet className={i} /> },
    { to: '/reception/members', label: 'Member lookup', icon: <Search className={i} /> },
    { to: '/reception/new', label: 'New booking', icon: <PlusCircle className={i} /> },
  ],
  admin: [
    { to: '/admin', label: 'Overview', icon: <LayoutDashboard className={i} />, end: true },
    { to: '/admin/bookings', label: 'Bookings', icon: <ListChecks className={i} /> },
    { to: '/admin/payments', label: 'Payments log', icon: <Receipt className={i} /> },
    { to: '/admin/trainers', label: 'Trainers', icon: <Dumbbell className={i} /> },
    { to: '/admin/halls', label: 'Halls', icon: <Building2 className={i} /> },
    { to: '/admin/members', label: 'Members', icon: <Users className={i} /> },
    { to: '/admin/reports', label: 'Reports', icon: <BarChart3 className={i} /> },
    { to: '/admin/staff', label: 'Staff accounts', icon: <UserCog className={i} /> },
  ],
};

export function AppLayout() {
  const { user, login, logout } = useAuth();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  if (!user) return null;

  const items = NAV[user.role];

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
      <div className="mb-5 flex items-center gap-2 px-2 text-white">
        <span className="flex h-9 w-9 items-center justify-center rounded-xl border-2 border-ink bg-sun text-ink">
          <Dumbbell className="h-5 w-5" />
        </span>
        <span className="font-display text-lg font-extrabold leading-tight">
          Gym Booking
          <span className="block text-xs font-medium text-white/80">{ROLE_LABEL[user.role]} area</span>
        </span>
      </div>
      {items.map((it) => (
        <NavLink
          key={it.to}
          to={it.to}
          end={it.end}
          onClick={() => setOpen(false)}
          className={({ isActive }) =>
            `flex items-center gap-3 rounded-xl border-2 px-3 py-2 text-sm font-bold transition ${
              isActive ? 'border-ink bg-sun text-ink shadow-hard-sm' : 'border-transparent text-white hover:bg-white/15'
            }`
          }
        >
          {it.icon}
          {it.label}
        </NavLink>
      ))}
      <div className="mt-auto rounded-xl bg-white/15 p-3 text-xs text-white">
        <p className="flex items-center gap-1 font-bold">
          <ShieldCheck className="h-3 w-3" /> Demo clock
        </p>
        <p className="mt-0.5 text-white/90">{fmtDateTime(TODAY)} (fixed for the sample data)</p>
      </div>
    </nav>
  );

  return (
    <div className="flex min-h-screen">
      <aside className="sticky top-0 hidden h-screen w-64 shrink-0 bg-mint lg:block">{sidebar}</aside>

      {open && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div className="absolute inset-0 bg-ink/50" onClick={() => setOpen(false)} />
          <aside className="relative h-full w-64 bg-mint">
            <button className="absolute right-3 top-3 text-white" onClick={() => setOpen(false)} aria-label="Close menu">
              <X className="h-5 w-5" />
            </button>
            {sidebar}
          </aside>
        </div>
      )}

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex flex-wrap items-center gap-3 border-b-2 border-ink bg-white px-4 py-3">
          <button className="rounded-lg border-2 border-ink p-1.5 lg:hidden" onClick={() => setOpen(true)} aria-label="Open menu">
            <Menu className="h-5 w-5" />
          </button>
          <div className="mr-auto min-w-0">
            <p className="truncate text-sm font-extrabold">{user.full_name}</p>
            <p className="text-xs text-ink/60">{ROLE_LABEL[user.role]}</p>
          </div>

          {import.meta.env.DEV && (
            <div className="flex items-center gap-2 rounded-xl border-2 border-dashed border-brand bg-brand-soft px-2 py-1 text-xs">
              <span className="font-bold text-brand-dark">DEV</span>
              <select
                aria-label="Switch role (dev only)"
                className="rounded-lg border border-ink/20 bg-white px-1 py-1 font-bold"
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
