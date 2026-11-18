import { useNavigate } from 'react-router-dom';
import { HallBooking } from '../../components/booking/HallBooking';
import { useToast } from '../../components/Toast';
import { PageHeader } from '../../components/ui';
import { bkNumber } from '../../utils/format';
import { useT } from '../../i18n';

export default function RentHall() {
  const navigate = useNavigate();
  const { t } = useT();
  const toast = useToast();
  return (
    <div>
      <PageHeader title={t('landing.rentHall')} subtitle={t('member.rentHallSub')} />
      <HallBooking
        onBooked={(b) => {
          toast.success(t('member.reserved', { id: bkNumber(b.booking_id) }));
          navigate(`/member/pay/${b.booking_id}`);
        }}
      />
    </div>
  );
}
