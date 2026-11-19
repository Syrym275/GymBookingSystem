import { addDays, format } from 'date-fns';
import { Info } from 'lucide-react';
import { dateLocale, useT } from '../../i18n';
import { membershipState, parseLocal, toDate } from '../../utils/format';

/** Shown on every admin screen: the admin area runs on demo data until the backend has admin routes. */
export function DemoBanner() {
  const { t } = useT();
  return (
    <div role="note" className="mb-5 flex items-start gap-2 rounded-lg border border-dashed border-brand/60 bg-brand-soft px-3 py-2 text-sm">
      <Info className="mt-0.5 h-4 w-4 shrink-0 text-brand-dark" aria-hidden="true" />
      <span>{t('adm.demoBanner')}</span>
    </div>
  );
}

export function ActiveChip({ active }: { active: boolean }) {
  const { t } = useT();
  return (
    <span className={`chip ${active ? 'border-mint/60 bg-mint-soft text-mint-dark' : 'border-line bg-sun-soft text-ink/60'}`}>
      {active ? t('adm.active') : t('adm.inactive')}
    </span>
  );
}

/** Active / ends soon / expired, from the membership end date. */
export function MembershipChip({ expires }: { expires: string }) {
  const { t } = useT();
  const ms = membershipState(expires);
  const style =
    ms.state === 'expired'
      ? 'border-berry/60 bg-berry-soft text-berry'
      : ms.state === 'expiring'
        ? 'border-line bg-sun-soft text-ink'
        : 'border-mint/60 bg-mint-soft text-mint-dark';
  return (
    <span className={`chip ${style}`}>
      {ms.state === 'expired' ? t('adm.mem.expired') : ms.state === 'expiring' ? t('adm.mem.endsIn', { n: ms.daysLeft }) : t('adm.mem.valid')}
    </span>
  );
}

/** Short weekday name for index 0 = Monday ... 6 = Sunday, in the current site language. */
export function weekdayName(index: number): string {
  const monday = parseLocal('2026-11-02'); // any Monday
  return format(addDays(monday, ((index % 7) + 7) % 7), 'EEE', { locale: dateLocale() });
}

export const WEEKDAY_KEYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

const csvCell = (v: string | number) => `"${String(v).replace(/"/g, '""')}"`;

/** Downloads rows as a UTF-8 CSV file (with a BOM so Excel reads Cyrillic correctly). */
export function downloadCsv(filename: string, head: string[], rows: (string | number)[][]) {
  const body = [head, ...rows].map((r) => r.map(csvCell).join(',')).join('\n');
  const blob = new Blob([`﻿${body}`], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export const todayFile = (name: string, today: string) => `${name}-${toDate(parseLocal(today))}.csv`;
