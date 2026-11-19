import { useState } from 'react';
import { Link } from 'react-router-dom';
import { cancelBooking, listBookings } from '../../api/bookingsApi';
import { BookingSlip } from '../../components/BookingSlip';
import { ConfirmDialog } from '../../components/ConfirmDialog';
import { PaidBadge, StatusBadge } from '../../components/StatusBadge';
import { useToast } from '../../components/Toast';
import { EmptyState, ErrorNote, Loading, PageHeader } from '../../components/ui';
import { TODAY } from '../../config';
import { useAsync } from '../../hooks/useAsync';
import type { BookingStatus, BookingView } from '../../types';
import { ALL_STATUSES, STATUS_LABEL, bkNumber, fmtRange, kzt } from '../../utils/format';
import { useT, type Key } from '../../i18n';

export default function MyBookings() {
  const { t } = useT();
  const toast = useToast();
  const { data, error, reload } = useAsync(() => listBookings(), []);
  const [tab, setTab] = useState<'upcoming' | 'past'>('upcoming');
  const [status, setStatus] = useState<BookingStatus | ''>('');
  const [slip, setSlip] = useState<BookingView | null>(null);
  const [toCancel, setToCancel] = useState<BookingView | null>(null);

  if (error) return <ErrorNote message={error} />;
  if (!data) return <Loading />;

  const rows = data
    .filter((b) => (tab === 'upcoming' ? b.start_time >= TODAY : b.start_time < TODAY))
    .filter((b) => !status || b.status === status)
    .sort((a, b) => (tab === 'upcoming' ? a.start_time.localeCompare(b.start_time) : b.start_time.localeCompare(a.start_time)));

  const canCancel = (b: BookingView) => b.start_time >= TODAY && (b.status === 'pending' || b.status === 'confirmed');

  return (
    <div>
      <PageHeader title={t('nav.myBookings')} />
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <div className="inline-flex rounded-xl border border-line bg-white p-1">
          {(['upcoming', 'past'] as const).map((tb) => (
            <button
              key={tb}
              onClick={() => setTab(tb)}
              className={`rounded-lg px-4 py-1.5 text-sm font-bold ${tab === tb ? 'bg-brand text-onaccent' : 'hover:bg-sun-soft'}`}
            >
              {t(`mybook.${tb}` as Key)}
            </button>
          ))}
        </div>
        <label className="sr-only" htmlFor="mb-status">
          {t('mybook.filter')}
        </label>
        <select id="mb-status" className="input w-auto" value={status} onChange={(e) => setStatus(e.target.value as BookingStatus | '')}>
          <option value="">{t('mybook.allStatuses')}</option>
          {ALL_STATUSES.map((s) => (
            <option key={s} value={s}>
              {STATUS_LABEL[s]}
            </option>
          ))}
        </select>
      </div>

      {rows.length === 0 ? (
        <EmptyState
          title={status ? t(`mybook.none.${tab}.status` as Key, { status: STATUS_LABEL[status] }) : t(`mybook.none.${tab}` as Key)}
          action={
            tab === 'upcoming' ? (
              <Link to="/member/trainers" className="btn-primary">
                {t('landing.bookSession')}
              </Link>
            ) : undefined
          }
        />
      ) : (
        <div className="space-y-3">
          {rows.map((b) => (
            <div key={b.booking_id} className="card-flat flex flex-wrap items-center gap-3">
              <button className="min-w-0 flex-1 basis-full text-left sm:basis-auto" onClick={() => setSlip(b)}>
                <p className="font-bold">
                  <span className="mr-2 font-mono text-sm text-ink/50">{bkNumber(b.booking_id)}</span>
                  {b.trainer_name ?? b.hall_name}
                  <span className="ml-2 text-xs font-normal text-ink/50">{b.booking_type === 'training' ? t('type.training') : t('type.hall')}</span>
                </p>
                <p className="text-sm text-ink/60">{fmtRange(b.start_time, b.end_time)}</p>
              </button>
              <span className="text-sm font-bold">{kzt(b.price_kzt)}</span>
              <PaidBadge status={b.status} />
              <StatusBadge status={b.status} />
              <div className="flex gap-2">
                {b.status === 'pending' && b.start_time >= TODAY && (
                  <Link to={`/member/pay/${b.booking_id}`} className="btn-primary btn-sm">
                    {t('mybook.pay')}
                  </Link>
                )}
                {canCancel(b) && (
                  <button className="btn-danger btn-sm" onClick={() => setToCancel(b)}>
                    {t('mybook.cancel')}
                  </button>
                )}
                <button className="btn-ghost btn-sm" onClick={() => setSlip(b)}>
                  {t('mybook.slip')}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      <BookingSlip booking={slip} onClose={() => setSlip(null)} />
      <ConfirmDialog
        open={!!toCancel}
        danger
        title={toCancel ? t('mybook.cancelQ', { id: bkNumber(toCancel.booking_id) }) : ''}
        message={
          toCancel?.status === 'confirmed'
            ? t('mybook.cancelPaid')
            : t('mybook.released')
        }
        confirmLabel={t('mybook.cancelBooking')}
        onCancel={() => setToCancel(null)}
        onConfirm={async () => {
          if (!toCancel) return;
          try {
            await cancelBooking(toCancel.booking_id);
            toast.success(t('mybook.cancelled', { id: bkNumber(toCancel.booking_id) }));
            reload();
          } catch (e) {
            toast.error(e instanceof Error ? e.message : t('mybook.cancelFailed'));
          }
          setToCancel(null);
        }}
      />
    </div>
  );
}
