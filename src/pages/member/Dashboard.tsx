import { Link } from 'react-router-dom';
import { AlertTriangle, ArrowRight, Building2, CalendarClock, Dumbbell } from 'lucide-react';
import { listBookings } from '../../api/bookingsApi';
import { getMyProfile } from '../../api/membersApi';
import { useAuth } from '../../auth/AuthContext';
import { StatusBadge } from '../../components/StatusBadge';
import { EmptyState, ErrorNote, KpiCard, Loading, PageHeader } from '../../components/ui';
import { MAX_PENDING, TODAY } from '../../config';
import { useAsync } from '../../hooks/useAsync';
import { PLAN_LABEL, bkNumber, fmtDate, fmtRange, kzt, membershipState } from '../../utils/format';

export default function MemberDashboard() {
  const { user } = useAuth();
  const profile = useAsync(getMyProfile, []);
  const bookings = useAsync(() => listBookings(), []);

  if (profile.error) return <ErrorNote message={profile.error} />;
  if (!profile.data || !bookings.data) return <Loading />;

  const p = profile.data;
  const ms = membershipState(p.membership_expires_on);
  const mine = bookings.data;
  const unpaid = mine.filter((b) => b.status === 'pending');
  const upcoming = mine.filter((b) => b.start_time >= TODAY && (b.status === 'pending' || b.status === 'confirmed'));

  return (
    <div>
      <PageHeader title={`Hi, ${user?.full_name.split(' ')[0]} 👋`} subtitle="Here is what is coming up for you." />

      {ms.state !== 'active' && (
        <div
          role="alert"
          className={`mb-5 flex items-start gap-3 rounded-2xl border-2 border-ink p-4 shadow-hard ${ms.state === 'expired' ? 'bg-berry-soft' : 'bg-sun-soft'}`}
        >
          <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0" />
          <div className="text-sm">
            <p className="font-extrabold">
              {ms.state === 'expired' ? 'Your membership has expired' : `Your membership ends in ${ms.daysLeft} day${ms.daysLeft === 1 ? '' : 's'}`}
            </p>
            <p>
              {ms.state === 'expired'
                ? 'You cannot book new sessions until it is extended. Please visit reception.'
                : 'Bookings after that date will be refused - ask reception to extend it.'}
            </p>
          </div>
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-3">
        <KpiCard
          tone="brand"
          label="Membership"
          value={PLAN_LABEL[p.membership_plan]}
          hint={`${ms.state === 'expired' ? 'Expired' : 'Valid until'} ${fmtDate(p.membership_expires_on)}`}
        />
        <KpiCard
          tone={unpaid.length >= MAX_PENDING ? 'berry' : 'sun'}
          label="Unpaid bookings"
          value={`${unpaid.length} of ${MAX_PENDING}`}
          hint={unpaid.length >= MAX_PENDING ? 'Limit reached - pay or cancel one' : 'Unpaid bookings hold the slot'}
        />
        <KpiCard tone="mint" label="Upcoming" value={upcoming.length} hint="Pending + confirmed" />
      </div>

      <div className="mt-6 grid gap-3 sm:grid-cols-2">
        <Link to="/member/trainers" className="card flex items-center gap-3 transition hover:-translate-y-0.5">
          <span className="flex h-11 w-11 items-center justify-center rounded-full bg-brand text-white">
            <Dumbbell className="h-5 w-5" />
          </span>
          <span className="flex-1">
            <span className="block font-display text-lg font-bold">Book a trainer</span>
            <span className="text-sm text-ink/60">60-minute personal session</span>
          </span>
          <ArrowRight className="h-5 w-5" />
        </Link>
        <Link to="/member/halls" className="card flex items-center gap-3 transition hover:-translate-y-0.5">
          <span className="flex h-11 w-11 items-center justify-center rounded-full bg-mint text-white">
            <Building2 className="h-5 w-5" />
          </span>
          <span className="flex-1">
            <span className="block font-display text-lg font-bold">Rent a hall</span>
            <span className="text-sm text-ink/60">Any interval, 07:00–22:00</span>
          </span>
          <ArrowRight className="h-5 w-5" />
        </Link>
      </div>

      <h2 className="mb-3 mt-8 text-xl font-extrabold">Upcoming bookings</h2>
      {upcoming.length === 0 ? (
        <EmptyState icon={<CalendarClock className="h-6 w-6" />} title="Nothing booked yet" text="Reserve a trainer or a hall to see it here." />
      ) : (
        <div className="space-y-3">
          {upcoming.map((b) => (
            <div key={b.booking_id} className="card-flat flex flex-wrap items-center gap-3">
              <div className="min-w-0 flex-1">
                <p className="font-bold">
                  <span className="mr-2 font-mono text-sm text-ink/50">{bkNumber(b.booking_id)}</span>
                  {b.trainer_name ?? b.hall_name}
                </p>
                <p className="text-sm text-ink/60">{fmtRange(b.start_time, b.end_time)}</p>
              </div>
              <span className="text-sm font-bold">{kzt(b.price_kzt)}</span>
              <StatusBadge status={b.status} />
              {b.status === 'pending' && (
                <Link to={`/member/pay/${b.booking_id}`} className="btn-primary btn-sm">
                  Pay now
                </Link>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
