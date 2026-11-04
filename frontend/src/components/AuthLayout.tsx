import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, Dumbbell } from 'lucide-react';

/** Two-column shell shared by the Login and Register pages: brand panel (lg+) + form column. */
export function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <div className="grid min-h-screen lg:grid-cols-[1.1fr_1fr]">
      <div className="relative hidden overflow-hidden bg-brand p-12 text-white lg:flex lg:flex-col lg:justify-between">
        <div className="absolute -right-20 -top-20 h-80 w-80 rounded-full bg-sun" />
        <div className="absolute -bottom-24 left-10 h-72 w-72 rounded-full bg-mint" />
        <div className="absolute bottom-40 right-16 h-24 w-24 rounded-3xl border-4 border-ink bg-berry" />
        <div className="relative flex items-center gap-3">
          <span className="flex h-12 w-12 items-center justify-center rounded-2xl border-2 border-ink bg-white text-ink shadow-hard">
            <Dumbbell className="h-6 w-6" />
          </span>
          <span className="font-display text-2xl font-extrabold">Gym Booking System</span>
        </div>
        <div className="relative">
          <h1 className="font-display text-5xl font-extrabold leading-tight drop-shadow-[3px_3px_0_#1E2235]">
            Book it.
            <br />
            Pay it.
            <br />
            Show up.
          </h1>
          <p className="mt-5 max-w-md text-lg font-medium">
            Personal training and hall rental in one place — one trainer or hall is never booked twice for the same time.
          </p>
        </div>
      </div>

      <div className="flex items-center justify-center p-6 sm:p-10">
        <div className="w-full max-w-md space-y-8">
          <Link to="/" className="inline-flex items-center gap-1.5 text-sm font-bold text-ink/60 hover:text-brand">
            <ArrowLeft className="h-4 w-4" /> Back to home
          </Link>
          {children}
        </div>
      </div>
    </div>
  );
}
