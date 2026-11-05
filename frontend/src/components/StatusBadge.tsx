import type { BookingStatus, PaymentStatus } from '../types';
import { STATUS_LABEL } from '../utils/format';

const STYLE: Record<BookingStatus, string> = {
  pending: 'bg-sun-soft text-amber-800 border-sun',
  confirmed: 'bg-mint-soft text-mint-dark border-mint',
  completed: 'bg-sky-100 text-sky-800 border-sky-400',
  no_show: 'bg-berry-soft text-rose-700 border-berry',
  cancelled: 'bg-slate-100 text-slate-600 border-slate-300',
  expired: 'bg-orange-50 text-orange-700 border-dashed border-orange-300',
};

export function StatusBadge({ status }: { status: BookingStatus }) {
  return (
    <span className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-bold ${STYLE[status]}`}>
      {STATUS_LABEL[status]}
    </span>
  );
}

const PAY_STYLE: Record<PaymentStatus, string> = {
  approved: 'bg-mint-soft text-mint-dark border-mint',
  declined: 'bg-berry-soft text-rose-700 border-berry',
  refunded: 'bg-slate-100 text-slate-600 border-slate-300',
};

export function PaymentBadge({ status }: { status: PaymentStatus }) {
  return (
    <span className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-bold capitalize ${PAY_STYLE[status]}`}>
      {status}
    </span>
  );
}

export function PaidBadge({ status }: { status: BookingStatus }) {
  if (status === 'pending') return <span className="text-xs font-bold text-amber-700">Unpaid</span>;
  if (status === 'cancelled' || status === 'expired') return <span className="text-xs text-ink/40">—</span>;
  return <span className="text-xs font-bold text-mint-dark">Paid</span>;
}
