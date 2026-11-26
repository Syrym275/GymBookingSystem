import { bookingTypeLabel, bookingWhat } from '../utils/bookingKind';
import { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Search, X } from 'lucide-react';
import { listBookings, setBookingStatus, type BookingFilters } from '../api/bookingsApi';
import { listHalls } from '../api/hallsApi';
import { listMembers } from '../api/membersApi';
import { listTrainers } from '../api/trainersApi';
import { useAsync } from '../hooks/useAsync';
import type { BookingStatus, BookingType, BookingView } from '../types';
import { ALL_STATUSES, STATUS_LABEL, bkNumber, fmtDateTime, fmtDay, kzt, timeOf } from '../utils/format';
import { BookingSlip } from './BookingSlip';
import { DataTable, type Column } from './DataTable';
import { PaidBadge, StatusBadge } from './StatusBadge';
import { useToast } from './Toast';
import { EmptyState, ErrorNote } from './ui';
import { useT, type Key } from '../i18n';

const CHIP_ON: Record<BookingStatus, string> = {
  pending: 'border-sun bg-sun-soft',
  confirmed: 'border-mint bg-mint-soft',
  completed: 'border-sky-400 bg-sky-100',
  no_show: 'border-berry bg-berry-soft',
  cancelled: 'border-slate-300 bg-slate-100',
  expired: 'border-orange-300 bg-orange-50',
};

/**
 * Full bookings table for reception and admin. Every filter lives in the URL query string,
 * so a filtered view can be bookmarked or shared. Admin mode adds payment info + status change.
 */
export function BookingsTable({ mode }: { mode: 'reception' | 'admin' }) {
  const { t, tp } = useT();
  const [sp, setSp] = useSearchParams();
  const toast = useToast();
  const [slip, setSlip] = useState<BookingView | null>(null);

  const statuses = useMemo(
    () => (sp.get('status') ?? '').split(',').filter((s): s is BookingStatus => ALL_STATUSES.includes(s as BookingStatus)),
    [sp],
  );
  const filters: BookingFilters = {
    from: sp.get('from') || undefined,
    to: sp.get('to') || undefined,
    statuses,
    paid: (sp.get('paid') as 'paid' | 'unpaid' | '') || '',
    type: (sp.get('type') as BookingType | '') || '',
    trainer_id: Number(sp.get('trainer')) || undefined,
    hall_id: Number(sp.get('hall')) || undefined,
    member_id: Number(sp.get('member')) || undefined,
    q: sp.get('q') || undefined,
  };

  const bookings = useAsync(() => listBookings(filters), [sp.toString()]);
  // The existing backend endpoint lists active trainers from the catalogue.
  const trainers = useAsync(() => listTrainers(), []);
  const halls = useAsync(() => listHalls({ includeInactive: true }), []);
  const members = useAsync(() => listMembers(), []);

  const setParam = (key: string, value: string) => {
    const next = new URLSearchParams(sp);
    if (value) next.set(key, value);
    else next.delete(key);
    setSp(next, { replace: true });
  };
  const toggleStatus = (s: BookingStatus) => {
    const set = new Set(statuses);
    if (set.has(s)) set.delete(s);
    else set.add(s);
    setParam('status', [...set].join(','));
  };
  const anyFilter = sp.toString() !== '';

  const changeStatus = async (b: BookingView, status: BookingStatus) => {
    try {
      await setBookingStatus(b.booking_id, status);
      toast.success(t('table.statusChanged', { id: bkNumber(b.booking_id), status: STATUS_LABEL[status].toLowerCase() }));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t('table.statusFailed'));
    }
    bookings.reload();
  };

  const columns: Column<BookingView>[] = [
    { key: 'id', header: t('table.booking'), sort: (b) => b.booking_id, render: (b) => <span className="font-mono font-bold">{bkNumber(b.booking_id)}</span> },
    {
      key: 'member',
      header: t('role.member'),
      sort: (b) => b.member.full_name,
      render: (b) => (
        <div>
          <div className="font-bold">{b.member.full_name}</div>
          <div className="text-xs text-ink/50">{b.member.phone}</div>
        </div>
      ),
    },
    {
      key: 'what',
      header: t('table.trainerHall'),
      sort: (b) => bookingWhat(b),
      render: (b) => (
        <div>
          <div>{bookingWhat(b)}</div>
          <div className="text-xs text-ink/50">{bookingTypeLabel(b.booking_type)}</div>
        </div>
      ),
    },
    {
      key: 'when',
      header: t('table.when'),
      sort: (b) => b.start_time,
      render: (b) => (
        <div>
          <div>{fmtDay(b.start_time)}</div>
          <div className="text-xs text-ink/50">
            {timeOf(b.start_time)}–{timeOf(b.end_time)}
          </div>
        </div>
      ),
    },
    { key: 'price', header: t('table.price'), sort: (b) => b.price_kzt, render: (b) => kzt(b.price_kzt) },
    {
      key: 'status',
      header: t('nav.status'),
      sort: (b) => b.status,
      render: (b) =>
        mode === 'admin' ? (
          <select
            aria-label={t('table.statusOf', { id: bkNumber(b.booking_id) })}
            className="rounded-lg border border-ink/20 bg-white px-2 py-1 text-xs font-bold"
            value={b.status}
            onClick={(e) => e.stopPropagation()}
            onChange={(e) => changeStatus(b, e.target.value as BookingStatus)}
          >
            {ALL_STATUSES.map((s) => (
              <option key={s} value={s}>
                {STATUS_LABEL[s]}
              </option>
            ))}
          </select>
        ) : (
          <StatusBadge status={b.status} />
        ),
    },
    {
      key: 'paid',
      header: mode === 'reception' ? t('table.audit') : t('pay.paid'),
      render: (b) => mode === 'reception' ? (
        <div className="text-sm">
          <div className="font-bold">{b.payment_status ? t(`payStatus.${b.payment_status}` as Key) : b.paid ? t('pay.paid') : t('pay.unpaid')}</div>
          {b.paid_at && (
            <div className="text-xs text-ink/60">
              {b.payment_status === 'refunded' ? t('table.originallyPaid') : t('pay.paid')}{' '}{fmtDateTime(b.paid_at)}
            </div>
          )}
          {b.payment_method && <div className="text-xs text-ink/50">{t(`method.${b.payment_method}` as Key)}</div>}
        </div>
      ) : <PaidBadge status={b.status} />,
    },
  ];
  if (mode === 'admin') {
    columns.push({
      key: 'payment',
      header: t('table.payment'),
      render: (b) =>
        b.payment ? (
          <div className="text-xs">
            <span className="font-bold">{t(`payStatus.${b.payment.payment_status}` as Key)}</span> · {t(`method.${b.payment.method}` as Key)}
            <div className="font-mono text-ink/50">{b.payment.provider_txn_ref}</div>
          </div>
        ) : (
          <span className="text-xs text-ink/40">{t('table.none')}</span>
        ),
    });
  }

  return (
    <div className="space-y-4">
      <div className="card-flat space-y-4">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div className="relative sm:col-span-2">
            <label className="label" htmlFor="bt-q">
              {t('table.search')}
            </label>
            <Search className="pointer-events-none absolute bottom-2.5 left-3 h-4 w-4 text-ink/40" />
            <input
              id="bt-q"
              className="input pl-9"
              placeholder={t('table.searchPlaceholder')}
              value={sp.get('q') ?? ''}
              onChange={(e) => setParam('q', e.target.value)}
            />
          </div>
          <div>
            <label className="label" htmlFor="bt-from">
              {t('table.from')}
            </label>
            <input id="bt-from" type="date" className="input" value={sp.get('from') ?? ''} onChange={(e) => setParam('from', e.target.value)} />
          </div>
          <div>
            <label className="label" htmlFor="bt-to">
              {t('table.to')}
            </label>
            <input id="bt-to" type="date" className="input" value={sp.get('to') ?? ''} onChange={(e) => setParam('to', e.target.value)} />
          </div>
          <div>
            <label className="label" htmlFor="bt-type">
              {t('table.type')}
            </label>
            <select id="bt-type" className="input" value={sp.get('type') ?? ''} onChange={(e) => setParam('type', e.target.value)}>
              <option value="">{t('table.allTypes')}</option>
              <option value="training">{t('type.training')}</option>
              <option value="hall_rental">{t('type.hall')}</option>
              <option value="combined">{t('type.combined')}</option>
            </select>
          </div>
          <div>
            <label className="label" htmlFor="bt-paid">
              {t('table.payment')}
            </label>
            <select id="bt-paid" className="input" value={sp.get('paid') ?? ''} onChange={(e) => setParam('paid', e.target.value)}>
              <option value="">{t('table.paidAndUnpaid')}</option>
              <option value="paid">{t('pay.paid')}</option>
              <option value="unpaid">{t('pay.unpaid')}</option>
            </select>
          </div>
          <div>
            <label className="label" htmlFor="bt-trainer">
              {t('role.trainer')}
            </label>
            <select id="bt-trainer" className="input" value={sp.get('trainer') ?? ''} onChange={(e) => setParam('trainer', e.target.value)}>
              <option value="">{t('table.anyTrainer')}</option>
              {trainers.data?.map((tr) => (
                <option key={tr.trainer_id} value={tr.trainer_id}>
                  {tr.full_name}
                  {tr.is_active ? '' : ` (${t('table.inactive')})`}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="label" htmlFor="bt-hall">
              {t('table.hall')}
            </label>
            <select id="bt-hall" className="input" value={sp.get('hall') ?? ''} onChange={(e) => setParam('hall', e.target.value)}>
              <option value="">{t('table.anyHall')}</option>
              {halls.data?.map((h) => (
                <option key={h.hall_id} value={h.hall_id}>
                  {h.hall_name}
                  {h.is_active ? '' : ` (${t('table.inactive')})`}
                </option>
              ))}
            </select>
          </div>
          <div className="sm:col-span-2">
            <label className="label" htmlFor="bt-member">
              {t('role.member')}
            </label>
            <select id="bt-member" className="input" value={sp.get('member') ?? ''} onChange={(e) => setParam('member', e.target.value)}>
              <option value="">{t('table.anyMember')}</option>
              {members.data?.map((m) => (
                <option key={m.member_id} value={m.member_id}>
                  {m.full_name}
                </option>
              ))}
            </select>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="label mb-0 mr-1">{t('nav.status')}</span>
          {ALL_STATUSES.map((s) => (
            <button
              key={s}
              onClick={() => toggleStatus(s)}
              aria-pressed={statuses.includes(s)}
              className={`chip ${statuses.includes(s) ? `${CHIP_ON[s]} border-line` : 'border-ink/15 bg-white text-ink/60 hover:border-line'}`}
            >
              {STATUS_LABEL[s]}
            </button>
          ))}
          {anyFilter && (
            <button className="btn-ghost btn-sm ml-auto" onClick={() => setSp({}, { replace: true })}>
              <X className="h-3 w-3" /> {t('table.clear')}
            </button>
          )}
        </div>
      </div>

      {bookings.error && <ErrorNote message={bookings.error} />}
      {bookings.data && (
        <>
          <p className="text-sm text-ink/60">
            {tp('unit.bookings', bookings.data.length)}
          </p>
          <DataTable
            rows={bookings.data}
            columns={columns}
            rowKey={(b) => b.booking_id}
            initialSort={{ key: 'when', dir: 'asc' }}
            onRowClick={setSlip}
            busy={bookings.loading}
            empty={<EmptyState title={t('table.emptyTitle')} text={t('table.emptyText')} />}
          />
        </>
      )}
      {!bookings.data && !bookings.error && <p className="py-8 text-center text-sm text-ink/50">{t('table.loading')}</p>}
      <BookingSlip booking={slip} onClose={() => setSlip(null)} />
    </div>
  );
}
