import { BookingsTable } from '../../components/BookingsTable';
import { PageHeader } from '../../components/ui';

export default function ReceptionBookings() {
  return (
    <div>
      <PageHeader title="All bookings" subtitle="Filters are saved in the page address, so you can bookmark a view." />
      <BookingsTable mode="reception" />
    </div>
  );
}
