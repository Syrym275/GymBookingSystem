import { useSearchParams, useNavigate } from 'react-router-dom';
import { Building2, Dumbbell, Layers } from 'lucide-react';
import { CombinedBooking } from '../../components/booking/CombinedBooking';
import { HallBooking } from '../../components/booking/HallBooking';
import { TrainerBooking } from '../../components/booking/TrainerBooking';
import { useToast } from '../../components/Toast';
import { PageHeader } from '../../components/ui';
import type { BookingView } from '../../types';
import { bkNumber } from '../../utils/format';
import { useT, type Key } from '../../i18n';

type Mode = 'trainer' | 'hall' | 'both';

const MODES: { mode: Mode; icon: JSX.Element; title: Key; hint: Key }[] = [
  { mode: 'trainer', icon: <Dumbbell className="h-5 w-5" />, title: 'book.mode.trainer', hint: 'book.mode.trainerHint' },
  { mode: 'hall', icon: <Building2 className="h-5 w-5" />, title: 'book.mode.hall', hint: 'book.mode.hallHint' },
  { mode: 'both', icon: <Layers className="h-5 w-5" />, title: 'book.mode.both', hint: 'book.mode.bothHint' },
];

const isMode = (v: string | null): v is Mode => v === 'trainer' || v === 'hall' || v === 'both';

/** One place to book: a trainer, a hall, or both together (a free trainer joins you in the hall). */
export default function BookSession({ initial = 'both' }: { initial?: Mode }) {
  const { t } = useT();
  const toast = useToast();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const asked = params.get('mode');
  const mode: Mode = isMode(asked) ? asked : initial;

  const booked = (b: BookingView) => {
    toast.success(t('member.reserved', { id: bkNumber(b.booking_id) }));
    navigate(`/member/pay/${b.booking_id}`);
  };

  return (
    <div>
      <PageHeader title={t('nav.bookSession')} subtitle={t('book.sub')} />
      <div className="mb-6 grid gap-3 sm:grid-cols-3" role="group" aria-label={t('book.choose')}>
        {MODES.map((m) => (
          <button
            key={m.mode}
            type="button"
            onClick={() => setParams({ mode: m.mode }, { replace: true })}
            aria-pressed={mode === m.mode}
            className={`flex items-center gap-3 rounded-xl border p-4 text-left transition ${
              mode === m.mode ? 'border-line bg-sun shadow-hard' : 'border-ink/20 bg-white hover:border-line'
            }`}
          >
            <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-onaccent ${m.mode === 'hall' ? 'bg-mint' : 'bg-brand'}`}>{m.icon}</span>
            <span>
              <span className="block font-display text-lg font-bold">{t(m.title)}</span>
              <span className="block text-xs text-ink/60">{t(m.hint)}</span>
            </span>
          </button>
        ))}
      </div>
      {mode === 'trainer' ? <TrainerBooking key="t" onBooked={booked} /> : mode === 'hall' ? <HallBooking key="h" onBooked={booked} /> : <CombinedBooking key="b" onBooked={booked} />}
    </div>
  );
}
