import { Link } from 'react-router-dom';
import { AlertTriangle, ArrowRight, Building2, CalendarClock, Dumbbell, Layers, Users } from 'lucide-react';
import { listBookings } from '../../api/bookingsApi';
import { getMyProfile } from '../../api/membersApi';
import { listMyInvitations } from '../../api/groupsApi';
import { useAuth } from '../../auth/AuthContext';
import { StatusBadge } from '../../components/StatusBadge';
import { EmptyState, ErrorNote, KpiCard, Loading, PageHeader } from '../../components/ui';
import { MAX_PENDING, TODAY } from '../../config';
import { useAsync } from '../../hooks/useAsync';
import { PLAN_LABEL, bkNumber, fmtDate, fmtRange, kzt, membershipState } from '../../utils/format';
import { bookingWhat } from '../../utils/bookingKind';
import { useT } from '../../i18n';

export default function MemberDashboard() {
  const { t, tp } = useT();
  const { user } = useAuth();
  const profile = useAsync(getMyProfile, []);
  const bookings = useAsync(() => listBookings(), []);
  // Optional: the dashboard still works if this fails.
  const groups = useAsync(listMyInvitations, []);

  if (profile.error) return <ErrorNote message={profile.error} />;
  if (!profile.data || !bookings.data) return <Loading />;

  const p = profile.data;
  const ms = membershipState(p.membership_expires_on);
  const mine = bookings.data;
  const unpaid = mine.filter((b) => b.status === 'pending');
  const upcoming = mine.filter((b) => b.start_time >= TODAY && (b.status === 'pending' || b.status === 'confirmed'));
  const waitingInvites = (groups.data ?? []).filter((g) => g.status === 'invited').length;

  return (
    <div>
      <PageHeader title={t('mdash.hi', { name: user?.full_name.split(' ')[0] ?? '' })} subtitle={t('mdash.sub')} />

      {ms.state !== 'active' && (
        <div
          role="alert"
          className={`mb-5 flex items-start gap-3 rounded-xl border border-line p-4 shadow-hard ${ms.state === 'expired' ? 'bg-berry-soft' : 'bg-sun-soft'}`}
        >
          <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0" />
          <div className="text-sm">
            <p className="font-extrabold">
              {ms.state === 'expired' ? t('mdash.expired') : tp('mdash.endsIn', ms.daysLeft)}
            </p>
            <p>
              {ms.state === 'expired'
                ? t('mdash.expiredText')
                : t('mdash.endsText')}
            </p>
          </div>
        </div>
      )}

      {waitingInvites > 0 && (
        <div className="mb-5 flex flex-wrap items-center gap-3 rounded-xl border border-line bg-mint-soft p-4 shadow-hard">
          <Users className="h-5 w-5 shrink-0" />
          <p className="flex-1 text-sm font-extrabold">{t('group.waiting', { n: waitingInvites })}</p>
          <Link to="/member/groups" className="btn-primary btn-sm">
            {t('group.see')}
          </Link>
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-3">
        <KpiCard
          tone="brand"
          label={t('slip.membership')}
          value={PLAN_LABEL[p.membership_plan]}
          hint={`${ms.state === 'expired' ? t('mdash.expiredOn') : t('register.validUntil')} ${fmtDate(p.membership_expires_on)}`}
        />
        <KpiCard
          tone={unpaid.length >= MAX_PENDING ? 'berry' : 'sun'}
          label={t('nav.unpaid')}
          value={t('mdash.of', { n: unpaid.length, max: MAX_PENDING })}
          hint={unpaid.length >= MAX_PENDING ? t('mdash.limit') : t('mdash.hold')}
        />
        <KpiCard tone="mint" label={t('mdash.upcoming')} value={upcoming.length} hint={t('mdash.upcomingHint')} />
      </div>

      <div className="mt-6 grid gap-3 sm:grid-cols-3">
        <Link to="/member/trainers" className="card flex items-center gap-3 transition hover:-translate-y-0.5">
          <span className="flex h-11 w-11 items-center justify-center rounded-full bg-brand text-onaccent">
            <Dumbbell className="h-5 w-5" />
          </span>
          <span className="flex-1">
            <span className="block font-display text-lg font-bold">{t('nav.bookTrainer')}</span>
            <span className="text-sm text-ink/60">{t('mdash.trainerHint')}</span>
          </span>
          <ArrowRight className="h-5 w-5" />
        </Link>
        <Link to="/member/halls" className="card flex items-center gap-3 transition hover:-translate-y-0.5">
          <span className="flex h-11 w-11 items-center justify-center rounded-full bg-mint text-onaccent">
            <Building2 className="h-5 w-5" />
          </span>
          <span className="flex-1">
            <span className="block font-display text-lg font-bold">{t('landing.rentHall')}</span>
            <span className="text-sm text-ink/60">{t('mdash.hallHint')}</span>
          </span>
          <ArrowRight className="h-5 w-5" />
        </Link>
        <Link to="/member/book?mode=both" className="card flex items-center gap-3 transition hover:-translate-y-0.5">
          <span className="flex h-11 w-11 items-center justify-center rounded-full bg-sun text-onaccent">
            <Layers className="h-5 w-5" />
          </span>
          <span className="flex-1">
            <span className="block font-display text-lg font-bold">{t('type.combined')}</span>
            <span className="text-sm text-ink/60">{t('mdash.bothHint')}</span>
          </span>
          <ArrowRight className="h-5 w-5" />
        </Link>
      </div>

      <h2 className="mb-3 mt-8 text-xl font-extrabold">{t('mdash.upcomingTitle')}</h2>
      {upcoming.length === 0 ? (
        <EmptyState icon={<CalendarClock className="h-6 w-6" />} title={t('mdash.nothing')} text={t('mdash.nothingText')} />
      ) : (
        <div className="space-y-3">
          {upcoming.map((b) => (
            <div key={b.booking_id} className="card-flat flex flex-wrap items-center gap-3">
              <div className="min-w-0 flex-1 basis-full sm:basis-auto">
                <p className="font-bold">
                  <span className="mr-2 font-mono text-sm text-ink/50">{bkNumber(b.booking_id)}</span>
                  {bookingWhat(b)}
                </p>
                <p className="text-sm text-ink/60">{fmtRange(b.start_time, b.end_time)}</p>
              </div>
              <span className="text-sm font-bold">{kzt(b.price_kzt)}</span>
              <StatusBadge status={b.status} />
              {b.status === 'pending' && (
                <Link to={`/member/pay/${b.booking_id}`} className="btn-primary btn-sm">
                  {t('mdash.payNow')}
                </Link>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
