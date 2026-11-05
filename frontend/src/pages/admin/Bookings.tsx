import { BookingsTable } from '../../components/BookingsTable';
import { PageHeader } from '../../components/ui';

export default function AdminBookings() {
  return (
    <div>
      <PageHeader title="Bookings" subtitle="Everything, including payment info. Change a status straight from the table." />
      <BookingsTable mode="admin" />
    </div>
  );
}
