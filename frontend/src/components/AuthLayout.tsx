import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { ThemeToggle } from '../theme/ThemeContext';
import { GYM_NAME } from '../data/gymData';
import { Barbell } from './GymIcons';
import HeroScene from './HeroScene';

function Logo() {
  return (
    <Link to="/" className="flex min-h-[44px] items-center gap-2 rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/60">
      <span className="flex h-10 w-10 items-center justify-center rounded-md bg-brand text-onaccent">
        <Barbell className="h-6 w-6" />
      </span>
      <span className="font-display text-xl font-bold uppercase tracking-wide">{GYM_NAME}</span>
    </Link>
  );
}

/**
 * Shell shared by the Login and Register pages, in the landing page's style:
 * gym-floor illustration panel (lg+) + form column.
 */
export function AuthLayout({ aside, children }: { aside: { title: ReactNode; text: string }; children: ReactNode }) {
  return (
    <div className="grid min-h-screen lg:grid-cols-[1.05fr_1fr]">
      <aside className="relative hidden flex-col justify-between gap-10 border-r border-line bg-white p-10 lg:flex xl:p-12">
        <Logo />
        <HeroScene ticket={false} />
        <div>
          <p className="font-display text-5xl font-bold uppercase leading-[0.95] xl:text-6xl">{aside.title}</p>
          <p className="mt-4 max-w-md text-ink/70">{aside.text}</p>
        </div>
      </aside>

      <main className="flex justify-center px-4 py-6 sm:p-10 lg:items-center">
        <div className="w-full max-w-md space-y-8">
          <div className="flex items-center justify-between gap-3">
            <span className="lg:hidden">
              <Logo />
            </span>
            <Link
              to="/"
              className="hidden min-h-[44px] items-center text-sm font-semibold text-ink/70 hover:text-brand-dark lg:inline-flex"
            >
              ← Back to home
            </Link>
            <ThemeToggle className="min-h-[44px] min-w-[44px]" />
          </div>
          {children}
          <p className="text-center lg:hidden">
            <Link to="/" className="inline-flex min-h-[44px] items-center text-sm font-semibold text-ink/70 hover:text-brand-dark">
              ← Back to home
            </Link>
          </p>
        </div>
      </main>
    </div>
  );
}
