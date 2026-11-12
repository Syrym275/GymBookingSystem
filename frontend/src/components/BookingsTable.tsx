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
      toast.success(`${bkNumber(b.booking_id)} is now ${STATUS_LABEL[status].toLowerCase()}.`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not change status.');
    }
    bookings.reload();
  };

  const columns: Column<BookingView>[] = [
    { key: 'id', header: 'Booking', sort: (b) => b.booking_id, render: (b) => <span className="font-mono font-bold">{bkNumber(b.booking_id)}</span> },
    {
      key: 'member',
      header: 'Member',
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
      header: 'Trainer / hall',
      sort: (b) => b.trainer_name ?? b.hall_name ?? '',
      render: (b) => (
        <div>
          <div>{b.trainer_name ?? b.hall_name}</div>
          <div className="text-xs text-ink/50">{b.booking_type === 'training' ? 'Training' : 'Hall rental'}</div>
        </div>
      ),
    },
    {
      key: 'when',
      header: 'When',
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
    { key: 'price', header: 'Price', sort: (b) => b.price_kzt, render: (b) => kzt(b.price_kzt) },
    {
      key: 'status',
      header: 'Status',
      sort: (b) => b.status,
      render: (b) =>
        mode === 'admin' ? (
          <select
            aria-label={`Status of ${bkNumber(b.booking_id)}`}
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
      header: mode === 'reception' ? 'Payment audit' : 'Paid',
      render: (b) => mode === 'reception' ? (
        <div className="text-sm">
          <div className="font-bold capitalize">{b.payment_status ?? (b.paid ? 'paid' : 'unpaid')}</div>
          {b.paid_at && (
            <div className="text-xs text-ink/60">
              {b.payment_status === 'refunded' ? 'Originally paid ' : 'Paid '}{fmtDateTime(b.paid_at)}
            </div>
          )}
          {b.payment_method && <div className="text-xs capitalize text-ink/50">{b.payment_method}</div>}
        </div>
      ) : <PaidBadge status={b.status} />,
    },
  ];
  if (mode === 'admin') {
    columns.push({
      key: 'payment',
      header: 'Payment',
      render: (b) =>
        b.payment ? (
          <div className="text-xs">
            <span className="font-bold capitalize">{b.payment.payment_status}</span> · {b.payment.method}
            <div className="font-mono text-ink/50">{b.payment.provider_txn_ref}</div>
          </div>
        ) : (
          <span className="text-xs text-ink/40">none</span>
        ),
    });
  }

  return (
    <div className="space-y-4">
      <div className="card-flat space-y-4">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div className="relative sm:col-span-2">
            <label className="label" htmlFor="bt-q">
              Search
            </label>
            <Search className="pointer-events-none absolute bottom-2.5 left-3 h-4 w-4 text-ink/40" />
            <input
              id="bt-q"
              className="input pl-9"
              placeholder="Member name, phone or BK number"
              value={sp.get('q') ?? ''}
              onChange={(e) => setParam('q', e.target.value)}
            />
          </div>
          <div>
            <label className="label" htmlFor="bt-from">
              From
            </label>
            <input id="bt-from" type="date" className="input" value={sp.get('from') ?? ''} onChange={(e) => setParam('from', e.target.value)} />
          </div>
          <div>
            <label className="label" htmlFor="bt-to">
              To
            </label>
            <input id="bt-to" type="date" className="input" value={sp.get('to') ?? ''} onChange={(e) => setParam('to', e.target.value)} />
          </div>
          <div>
            <label className="label" htmlFor="bt-type">
              Type
            </label>
            <select id="bt-type" className="input" value={sp.get('type') ?? ''} onChange={(e) => setParam('type', e.target.value)}>
              <option value="">All types</option>
              <option value="training">Training</option>
              <option value="hall_rental">Hall rental</option>
            </select>
          </div>
          <div>
            <label className="label" htmlFor="bt-paid">
              Payment
            </label>
            <select id="bt-paid" className="input" value={sp.get('paid') ?? ''} onChange={(e) => setParam('paid', e.target.value)}>
              <option value="">Paid &amp; unpaid</option>
              <option value="paid">Paid</option>
              <option value="unpaid">Unpaid</option>
            </select>
          </div>
          <div>
            <label className="label" htmlFor="bt-trainer">
              Trainer
            </label>
            <select id="bt-trainer" className="input" value={sp.get('trainer') ?? ''} onChange={(e) => setParam('trainer', e.target.value)}>
              <option value="">Any trainer</option>
              {trainers.data?.map((t) => (
                <option key={t.trainer_id} value={t.trainer_id}>
                  {t.full_name}
                  {t.is_active ? '' : ' (inactive)'}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="label" htmlFor="bt-hall">
              Hall
            </label>
            <select id="bt-hall" className="input" value={sp.get('hall') ?? ''} onChange={(e) => setParam('hall', e.target.value)}>
              <option value="">Any hall</option>
              {halls.data?.map((h) => (
                <option key={h.hall_id} value={h.hall_id}>
                  {h.hall_name}
                  {h.is_active ? '' : ' (inactive)'}
                </option>
              ))}
            </select>
          </div>
          <div className="sm:col-span-2">
            <label className="label" htmlFor="bt-member">
              Member
            </label>
            <select id="bt-member" className="input" value={sp.get('member') ?? ''} onChange={(e) => setParam('member', e.target.value)}>
              <option value="">Any member</option>
              {members.data?.map((m) => (
                <option key={m.member_id} value={m.member_id}>
                  {m.full_name}
                </option>
              ))}
            </select>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="label mb-0 mr-1">Status</span>
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
              <X className="h-3 w-3" /> Clear filters
            </button>
          )}
        </div>
      </div>

      {bookings.error && <ErrorNote message={bookings.error} />}
      {bookings.data && (
        <>
          <p className="text-sm text-ink/60">
            {bookings.data.length} booking{bookings.data.length === 1 ? '' : 's'}
          </p>
          <DataTable
            rows={bookings.data}
            columns={columns}
            rowKey={(b) => b.booking_id}
            initialSort={{ key: 'when', dir: 'asc' }}
            onRowClick={setSlip}
            busy={bookings.loading}
            empty={<EmptyState title="No bookings match" text="Try removing a filter or widening the date range." />}
          />
        </>
      )}
      {!bookings.data && !bookings.error && <p className="py-8 text-center text-sm text-ink/50">Loading bookings…</p>}
      <BookingSlip booking={slip} onClose={() => setSlip(null)} />
    </div>
  );
}
