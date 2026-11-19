import { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Download, Search, X } from 'lucide-react';
import { listAllHalls, listAllMembers, listAllTrainers, listPaymentsOf } from '../../api/adminApi';
import { listBookings, setBookingStatus, type BookingFilters } from '../../api/bookingsApi';
import { DataTable, type Column } from '../../components/DataTable';
import { Modal } from '../../components/Modal';
import { PaidBadge, PaymentBadge, StatusBadge } from '../../components/StatusBadge';
import { useToast } from '../../components/Toast';
import { EmptyState, ErrorNote, PageHeader } from '../../components/ui';
import { useAsync } from '../../hooks/useAsync';
import { useT } from '../../i18n';
import { msg } from '../../i18n/messages';
import type { BookingStatus, BookingType, BookingView } from '../../types';
import { ALL_STATUSES, STATUS_LABEL, bkNumber, dateOf, fmtDate, fmtDay, fmtDateTime, kzt, timeOf } from '../../utils/format';
import { downloadCsv } from './common';

const CHIP_ON: Record<BookingStatus, string> = {
  pending: 'border-ink/40 bg-sun-soft',
  confirmed: 'border-brand bg-brand-soft',
  completed: 'border-mint bg-mint-soft',
  no_show: 'border-berry bg-berry-soft',
  cancelled: 'border-line bg-sun-soft',
  expired: 'border-line bg-sun-soft',
};

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4 py-1.5 text-sm">
      <span className="text-ink/60">{label}</span>
      <span className="text-right font-semibold">{children}</span>
    </div>
  );
}

function BookingDetails({ booking, onClose }: { booking: BookingView | null; onClose: () => void }) {
  const { t } = useT();
  const payments = useAsync(() => (booking ? listPaymentsOf(booking.booking_id) : Promise.resolve([])), [booking?.booking_id, booking?.status]);
  return (
    <Modal open={!!booking} title={booking ? `${t('adm.bk.booking')} ${bkNumber(booking.booking_id)}` : ''} onClose={onClose} wide>
      {booking && (
        <div className="space-y-5">
          <div className="flex items-center justify-between">
            <StatusBadge status={booking.status} />
            <PaidBadge status={booking.status} />
          </div>
          <div className="rounded-lg border border-line bg-sun-soft px-4 py-2">
            <Row label={t('adm.bk.type')}>{booking.booking_type === 'training' ? t('adm.bk.training') : t('adm.bk.hallRental')}</Row>
            <Row label={booking.booking_type === 'training' ? t('adm.bk.trainer') : t('adm.bk.hall')}>{booking.trainer_name ?? booking.hall_name}</Row>
            <Row label={t('adm.bk.date')}>{fmtDate(booking.start_time)}</Row>
            <Row label={t('adm.bk.time')}>
              {timeOf(booking.start_time)} – {timeOf(booking.end_time)}
            </Row>
            <Row label={t('adm.bk.price')}>{kzt(booking.price_kzt)}</Row>
            <Row label={t('adm.bk.member')}>{booking.member.full_name}</Row>
            {booking.member.phone && <Row label={t('adm.bk.phone')}>{booking.member.phone}</Row>}
            {booking.member.email && <Row label={t('adm.bk.email')}>{booking.member.email}</Row>}
            <Row label={t('adm.bk.created')}>{fmtDateTime(booking.created_at)}</Row>
          </div>
          <div>
            <p className="label">{t('adm.bk.attempts')}</p>
            {payments.loading && !payments.data && <p className="text-sm text-ink/50">{t('common.loading')}</p>}
            {payments.data && payments.data.length === 0 && <p className="text-sm text-ink/50">{t('adm.bk.noAttempts')}</p>}
            <ul className="space-y-2">
              {payments.data?.map((p) => (
                <li key={p.payment_id} className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-line px-3 py-2 text-xs">
                  <span className="font-mono">{p.provider_txn_ref}</span>
                  <span className="uppercase">{p.method}</span>
                  <span className="font-semibold">{kzt(p.amount_kzt)}</span>
                  <PaymentBadge status={p.payment_status} />
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}
    </Modal>
  );
}

/** All bookings with every filter in the address bar, payment info and a status change. */
export default function AdminBookings() {
  const { t } = useT();
  const toast = useToast();
  const [sp, setSp] = useSearchParams();
  const [open, setOpen] = useState<BookingView | null>(null);

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
  const trainers = useAsync(listAllTrainers, []);
  const halls = useAsync(listAllHalls, []);
  const members = useAsync(() => listAllMembers(), []);

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

  const changeStatus = async (b: BookingView, status: BookingStatus) => {
    try {
      await setBookingStatus(b.booking_id, status);
      toast.success(t('adm.bk.statusChanged', { id: bkNumber(b.booking_id), status: STATUS_LABEL[status].toLowerCase() }));
    } catch (e) {
      toast.error(msg(e instanceof Error ? e.message : t('adm.bk.statusFailed')));
    }
    bookings.reload();
  };

  const rows = bookings.data ?? [];
  const exportCsv = () =>
    downloadCsv(
      'bookings.csv',
      ['Booking', 'Date', 'Start', 'End', 'Member', 'Trainer / hall', 'Type', 'Status', 'Price KZT', 'Payment'],
      rows.map((b) => [
        bkNumber(b.booking_id),
        dateOf(b.start_time),
        timeOf(b.start_time),
        timeOf(b.end_time),
        b.member.full_name,
        b.trainer_name ?? b.hall_name ?? '',
        b.booking_type,
        b.status,
        b.price_kzt,
        b.payment ? `${b.payment.payment_status} ${b.payment.method}` : '',
      ]),
    );

  const columns: Column<BookingView>[] = [
    { key: 'id', header: t('adm.bk.booking'), sort: (b) => b.booking_id, render: (b) => <span className="font-mono font-bold">{bkNumber(b.booking_id)}</span> },
    {
      key: 'member',
      header: t('adm.bk.member'),
      sort: (b) => b.member.full_name,
      render: (b) => (
        <div>
          <div className="font-semibold">{b.member.full_name}</div>
          <div className="text-xs text-ink/50">{b.member.phone}</div>
        </div>
      ),
    },
    {
      key: 'what',
      header: t('adm.bk.what'),
      sort: (b) => b.trainer_name ?? b.hall_name ?? '',
      render: (b) => (
        <div>
          <div>{b.trainer_name ?? b.hall_name}</div>
          <div className="text-xs text-ink/50">{b.booking_type === 'training' ? t('adm.bk.training') : t('adm.bk.hallRental')}</div>
        </div>
      ),
    },
    {
      key: 'when',
      header: t('adm.bk.when'),
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
    { key: 'price', header: t('adm.bk.price'), sort: (b) => b.price_kzt, render: (b) => kzt(b.price_kzt) },
    {
      key: 'status',
      header: t('adm.bk.status'),
      sort: (b) => b.status,
      render: (b) => (
        <select
          aria-label={`${t('adm.bk.status')} ${bkNumber(b.booking_id)}`}
          className="rounded-md border border-line bg-cream px-2 py-1 text-xs font-semibold"
          value={b.status}
          onClick={(e) => e.stopPropagation()}
          onChange={(e) => void changeStatus(b, e.target.value as BookingStatus)}
        >
          {ALL_STATUSES.map((s) => (
            <option key={s} value={s}>
              {STATUS_LABEL[s]}
            </option>
          ))}
        </select>
      ),
    },
    { key: 'paid', header: t('adm.bk.paid'), render: (b) => <PaidBadge status={b.status} /> },
    {
      key: 'payment',
      header: t('adm.bk.payment'),
      render: (b) =>
        b.payment ? (
          <div className="text-xs">
            <span className="font-semibold capitalize">{b.payment.payment_status}</span> · {b.payment.method}
            <div className="font-mono text-ink/50">{b.payment.provider_txn_ref}</div>
          </div>
        ) : (
          <span className="text-xs text-ink/40">{t('adm.bk.noPayment')}</span>
        ),
    },
  ];

  return (
    <div className="space-y-4">
      <PageHeader
        title={t('adm.nav.bookings')}
        subtitle={t('adm.bk.sub')}
        actions={
          <button className="btn-secondary" onClick={exportCsv} disabled={rows.length === 0}>
            <Download className="h-4 w-4" /> {t('history.export')}
          </button>
        }
      />

      <div className="card-flat space-y-4">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div className="relative sm:col-span-2">
            <label className="label" htmlFor="ab-q">
              {t('adm.search')}
            </label>
            <Search className="pointer-events-none absolute bottom-2.5 left-3 h-4 w-4 text-ink/40" />
            <input id="ab-q" className="input pl-9" placeholder={t('adm.bk.searchPh')} value={sp.get('q') ?? ''} onChange={(e) => setParam('q', e.target.value)} />
          </div>
          <div>
            <label className="label" htmlFor="ab-from">
              {t('adm.from')}
            </label>
            <input id="ab-from" type="date" className="input" value={sp.get('from') ?? ''} onChange={(e) => setParam('from', e.target.value)} />
          </div>
          <div>
            <label className="label" htmlFor="ab-to">
              {t('adm.to')}
            </label>
            <input id="ab-to" type="date" className="input" value={sp.get('to') ?? ''} onChange={(e) => setParam('to', e.target.value)} />
          </div>
          <div>
            <label className="label" htmlFor="ab-type">
              {t('adm.bk.type')}
            </label>
            <select id="ab-type" className="input" value={sp.get('type') ?? ''} onChange={(e) => setParam('type', e.target.value)}>
              <option value="">{t('adm.bk.allTypes')}</option>
              <option value="training">{t('adm.bk.training')}</option>
              <option value="hall_rental">{t('adm.bk.hallRental')}</option>
            </select>
          </div>
          <div>
            <label className="label" htmlFor="ab-paid">
              {t('adm.bk.payment')}
            </label>
            <select id="ab-paid" className="input" value={sp.get('paid') ?? ''} onChange={(e) => setParam('paid', e.target.value)}>
              <option value="">{t('adm.bk.paidAndUnpaid')}</option>
              <option value="paid">{t('adm.bk.paid')}</option>
              <option value="unpaid">{t('adm.bk.unpaid')}</option>
            </select>
          </div>
          <div>
            <label className="label" htmlFor="ab-trainer">
              {t('adm.bk.trainer')}
            </label>
            <select id="ab-trainer" className="input" value={sp.get('trainer') ?? ''} onChange={(e) => setParam('trainer', e.target.value)}>
              <option value="">{t('adm.bk.anyTrainer')}</option>
              {trainers.data?.map((x) => (
                <option key={x.trainer_id} value={x.trainer_id}>
                  {x.full_name}
                  {x.is_active ? '' : ` (${t('adm.inactive').toLowerCase()})`}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="label" htmlFor="ab-hall">
              {t('adm.bk.hall')}
            </label>
            <select id="ab-hall" className="input" value={sp.get('hall') ?? ''} onChange={(e) => setParam('hall', e.target.value)}>
              <option value="">{t('adm.bk.anyHall')}</option>
              {halls.data?.map((x) => (
                <option key={x.hall_id} value={x.hall_id}>
                  {x.hall_name}
                  {x.is_active ? '' : ` (${t('adm.inactive').toLowerCase()})`}
                </option>
              ))}
            </select>
          </div>
          <div className="sm:col-span-2">
            <label className="label" htmlFor="ab-member">
              {t('adm.bk.member')}
            </label>
            <select id="ab-member" className="input" value={sp.get('member') ?? ''} onChange={(e) => setParam('member', e.target.value)}>
              <option value="">{t('adm.bk.anyMember')}</option>
              {members.data?.map((m) => (
                <option key={m.member_id} value={m.member_id}>
                  {m.full_name}
                </option>
              ))}
            </select>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="label mb-0 mr-1">{t('adm.bk.status')}</span>
          {ALL_STATUSES.map((s) => (
            <button
              key={s}
              onClick={() => toggleStatus(s)}
              aria-pressed={statuses.includes(s)}
              className={`chip ${statuses.includes(s) ? `${CHIP_ON[s]} text-ink` : 'border-line text-ink/60 hover:border-ink/40'}`}
            >
              {STATUS_LABEL[s]}
            </button>
          ))}
          {sp.toString() !== '' && (
            <button className="btn-ghost btn-sm ml-auto" onClick={() => setSp({}, { replace: true })}>
              <X className="h-3 w-3" /> {t('adm.clear')}
            </button>
          )}
        </div>
      </div>

      {bookings.error && <ErrorNote message={msg(bookings.error)} />}
      {bookings.data && (
        <>
          <p className="text-sm text-ink/60">{t('adm.bk.count', { n: rows.length })}</p>
          <DataTable
            rows={rows}
            columns={columns}
            rowKey={(b) => b.booking_id}
            initialSort={{ key: 'when', dir: 'desc' }}
            onRowClick={setOpen}
            busy={bookings.loading}
            empty={<EmptyState title={t('adm.bk.none')} text={t('adm.bk.noneText')} />}
          />
        </>
      )}
      {!bookings.data && !bookings.error && <p className="py-8 text-center text-sm text-ink/50">{t('common.loading')}</p>}
      <BookingDetails booking={open} onClose={() => setOpen(null)} />
    </div>
  );
}
