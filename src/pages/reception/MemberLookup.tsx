import { useState } from 'react';
import { Search } from 'lucide-react';
import { listBookings } from '../../api/bookingsApi';
import { listMembers } from '../../api/membersApi';
import { BookingSlip } from '../../components/BookingSlip';
import { PaidBadge, StatusBadge } from '../../components/StatusBadge';
import { EmptyState, ErrorNote, Loading, PageHeader } from '../../components/ui';
import { useAsync } from '../../hooks/useAsync';
import type { BookingView, MemberView } from '../../types';
import { PLAN_LABEL, bkNumber, fmtDate, fmtRange, kzt, membershipState } from '../../utils/format';

export function MembershipBadge({ expires }: { expires: string }) {
  const ms = membershipState(expires);
  const style =
    ms.state === 'expired'
      ? 'border-berry bg-berry-soft text-rose-700'
      : ms.state === 'expiring'
        ? 'border-sun bg-sun-soft text-amber-800'
        : 'border-mint bg-mint-soft text-mint-dark';
  return (
    <span className={`rounded-full border px-2.5 py-0.5 text-xs font-bold ${style}`}>
      {ms.state === 'expired' ? 'Expired' : ms.state === 'expiring' ? `Ends in ${ms.daysLeft} d` : 'Valid'}
    </span>
  );
}

function MemberDetail({ member }: { member: MemberView }) {
  const bookings = useAsync(() => listBookings({ member_id: member.member_id }), [member.member_id]);
  const [slip, setSlip] = useState<BookingView | null>(null);
  return (
    <div className="card">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="font-display text-2xl font-extrabold">{member.full_name}</h2>
          <p className="text-sm text-ink/60">{member.phone}</p>
        </div>
        <MembershipBadge expires={member.membership_expires_on} />
      </div>
      <dl className="mt-4 grid grid-cols-2 gap-3 text-sm">
        <div className="rounded-xl bg-cream p-3">
          <dt className="text-xs text-ink/60">Plan</dt>
          <dd className="font-bold">{PLAN_LABEL[member.membership_plan]}</dd>
        </div>
        <div className="rounded-xl bg-cream p-3">
          <dt className="text-xs text-ink/60">Valid until</dt>
          <dd className="font-bold">{fmtDate(member.membership_expires_on)}</dd>
        </div>
      </dl>

      <h3 className="mb-2 mt-5 text-lg font-extrabold">Bookings</h3>
      {bookings.error && <ErrorNote message={bookings.error} />}
      {!bookings.data && !bookings.error && <Loading />}
      {bookings.data && bookings.data.length === 0 && <p className="text-sm text-ink/60">No bookings yet.</p>}
      <div className="space-y-2">
        {bookings.data?.map((b) => (
          <button
            key={b.booking_id}
            onClick={() => setSlip(b)}
            className="flex w-full flex-wrap items-center gap-2 rounded-xl border-2 border-ink/15 bg-white p-3 text-left text-sm hover:border-ink"
          >
            <span className="font-mono text-xs text-ink/50">{bkNumber(b.booking_id)}</span>
            <span className="min-w-0 flex-1">
              <b>{b.trainer_name ?? b.hall_name}</b> · {fmtRange(b.start_time, b.end_time)}
            </span>
            <span className="font-bold">{kzt(b.price_kzt)}</span>
            <PaidBadge status={b.status} />
            <StatusBadge status={b.status} />
          </button>
        ))}
      </div>
      <BookingSlip booking={slip} onClose={() => setSlip(null)} />
    </div>
  );
}

export default function MemberLookup() {
  const [q, setQ] = useState('');
  const [selected, setSelected] = useState<MemberView | null>(null);
  const { data, error } = useAsync(() => listMembers(q), [q]);

  return (
    <div>
      <PageHeader title="Member lookup" subtitle="Search by name or phone number." />
      <div className="grid gap-6 lg:grid-cols-[1fr_1.4fr]">
        <div>
          <div className="relative mb-3">
            <label className="sr-only" htmlFor="ml-q">
              Search members
            </label>
            <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-ink/40" />
            <input id="ml-q" className="input pl-9" placeholder="Name or phone…" value={q} onChange={(e) => setQ(e.target.value)} />
          </div>
          {error && <ErrorNote message={error} />}
          {data && data.length === 0 && <EmptyState title="No member found" text="Check the spelling or try the phone number." />}
          <div className="space-y-2">
            {data?.map((m) => (
              <button
                key={m.member_id}
                onClick={() => setSelected(m)}
                className={`flex w-full items-center justify-between gap-2 rounded-xl border-2 p-3 text-left transition ${
                  selected?.member_id === m.member_id ? 'border-ink bg-sun shadow-hard-sm' : 'border-ink/15 bg-white hover:border-ink'
                }`}
              >
                <span>
                  <span className="block font-bold">{m.full_name}</span>
                  <span className="text-xs text-ink/60">{m.phone}</span>
                </span>
                <MembershipBadge expires={m.membership_expires_on} />
              </button>
            ))}
          </div>
        </div>
        <div>{selected ? <MemberDetail key={selected.member_id} member={selected} /> : <EmptyState title="Select a member" text="Their plan, validity and bookings appear here." />}</div>
      </div>
    </div>
  );
}
