import { BookingsTable } from '../../components/BookingsTable';
import { PageHeader } from '../../components/ui';
import { useT } from '../../i18n';

export default function ReceptionBookings() {
  const { t } = useT();
  return (
    <div>
      <PageHeader title={t('nav.allBookings')} subtitle={t('rec.allSub')} />
      <BookingsTable mode="reception" />
    </div>
  );
}
