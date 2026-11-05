import type { ReactNode } from 'react';
import { AlertTriangle, Inbox, Loader2 } from 'lucide-react';

export function PageHeader({ title, subtitle, actions }: { title: string; subtitle?: string; actions?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="text-2xl font-extrabold sm:text-3xl">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-ink/60">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  );
}

export function Loading({ text = 'Loading…' }: { text?: string }) {
  return (
    <div className="flex items-center justify-center gap-2 py-12 text-sm text-ink/60">
      <Loader2 className="h-4 w-4 animate-spin" /> {text}
    </div>
  );
}

export function ErrorNote({ message }: { message: string }) {
  return (
    <div className="flex items-start gap-2 rounded-xl border border-berry bg-berry-soft p-3 text-sm">
      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-berry" /> {message}
    </div>
  );
}

export function EmptyState({ title, text, action, icon }: { title: string; text?: string; action?: ReactNode; icon?: ReactNode }) {
  return (
    <div className="flex flex-col items-center rounded-xl border border-dashed border-ink/20 bg-white/60 px-6 py-10 text-center">
      <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-sun-soft text-ink">
        {icon ?? <Inbox className="h-6 w-6" />}
      </div>
      <p className="font-display text-lg font-bold">{title}</p>
      {text && <p className="mt-1 max-w-sm text-sm text-ink/60">{text}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

const TONES = {
  brand: 'bg-brand-soft',
  mint: 'bg-mint-soft',
  sun: 'bg-sun-soft',
  berry: 'bg-berry-soft',
  white: 'bg-white',
} as const;

export function KpiCard({
  label,
  value,
  hint,
  tone = 'white',
  icon,
}: {
  label: string;
  value: ReactNode;
  hint?: string;
  tone?: keyof typeof TONES;
  icon?: ReactNode;
}) {
  return (
    <div className={`rounded-xl border border-line p-4 shadow-hard ${TONES[tone]}`}>
      <div className="flex items-center justify-between text-xs font-bold uppercase tracking-wide text-ink/60">
        {label}
        {icon}
      </div>
      <div className="mt-1 font-display text-3xl font-extrabold">{value}</div>
      {hint && <div className="mt-0.5 text-xs text-ink/60">{hint}</div>}
    </div>
  );
}
