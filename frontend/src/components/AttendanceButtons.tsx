import { useState } from 'react';
import { Check, UserX } from 'lucide-react';
import { markAttendance } from '../api/bookingsApi';
import type { BookingView } from '../types';
import { useToast } from './Toast';
import { useT } from '../i18n';

/** Eligible = paid (confirmed) and the session has ended. */
export const canMarkAttendance = (b: BookingView) => b.status === 'confirmed' && new Date(b.end_time).getTime() <= Date.now();

export function AttendanceButtons({ booking, onDone }: { booking: BookingView; onDone: () => void }) {
  const { t } = useT();
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  if (!canMarkAttendance(booking)) return null;

  const mark = async (status: 'completed' | 'no_show') => {
    setBusy(true);
    try {
      await markAttendance(booking.booking_id, status);
      toast.success(status === 'completed' ? t('attend.marked') : t('attend.markedNoShow'));
      onDone();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t('common.saveFailed'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex gap-2">
      <button className="btn-secondary btn-sm" disabled={busy} onClick={() => mark('completed')}>
        <Check className="h-3 w-3" /> {t('attend.attended')}
      </button>
      <button className="btn-ghost btn-sm" disabled={busy} onClick={() => mark('no_show')}>
        <UserX className="h-3 w-3" /> {t('status.no_show')}
      </button>
    </div>
  );
}
