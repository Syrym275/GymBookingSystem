import { useNavigate } from 'react-router-dom';
import { HallBooking } from '../../components/booking/HallBooking';
import { useToast } from '../../components/Toast';
import { PageHeader } from '../../components/ui';
import { bkNumber } from '../../utils/format';

export default function RentHall() {
  const navigate = useNavigate();
  const toast = useToast();
  return (
    <div>
      <PageHeader title="Rent a hall" subtitle="Choose a hall and the time interval you need - the price updates live." />
      <HallBooking
        onBooked={(b) => {
          toast.success(`${bkNumber(b.booking_id)} reserved - now complete the payment.`);
          navigate(`/member/pay/${b.booking_id}`);
        }}
      />
    </div>
  );
}
