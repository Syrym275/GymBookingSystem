import { useNavigate } from 'react-router-dom';
import { TrainerBooking } from '../../components/booking/TrainerBooking';
import { useToast } from '../../components/Toast';
import { PageHeader } from '../../components/ui';
import { bkNumber } from '../../utils/format';

export default function BookTrainer() {
  const navigate = useNavigate();
  const toast = useToast();
  return (
    <div>
      <PageHeader title="Book a trainer" subtitle="Pick a trainer, a day and a free 60-minute slot." />
      <TrainerBooking
        onBooked={(b) => {
          toast.success(`${bkNumber(b.booking_id)} reserved - now complete the payment.`);
          navigate(`/member/pay/${b.booking_id}`);
        }}
      />
    </div>
  );
}
