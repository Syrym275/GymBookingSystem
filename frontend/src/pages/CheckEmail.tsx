import { Link, useSearchParams } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { HOME } from '../auth/RequireRole';
import { AuthLayout } from '../components/AuthLayout';
import { ResendVerification } from '../components/ResendVerification';
import { ErrorNote } from '../components/ui';

/** Shown after sign-up, and from the "verify your email" banner. */
export default function CheckEmail() {
  const { user } = useAuth();
  const [params] = useSearchParams();
  const email = params.get('email') ?? user?.email ?? '';
  const sendFailed = params.get('sent') === '0';
  const isTrainer = params.get('role') === 'trainer';
  const fromSignUp = params.has('new');

  return (
    <AuthLayout
      aside={
        isTrainer
          ? {
              title: (
                <>
                  Thanks for applying. <span className="block text-brand-dark">Check your inbox.</span>
                </>
              ),
              text: 'Verify your email, then your trainer profile is reviewed before it goes public.',
            }
          : {
              title: (
                <>
                  Almost there. <span className="block text-brand-dark">Check your inbox.</span>
                </>
              ),
              text: 'Verify your email to book trainers and halls and to pay online.',
            }
      }
    >
      <div className="space-y-4 rounded-xl border border-line bg-white p-6">
        <h1 className="text-4xl font-bold">Check your inbox</h1>
        {sendFailed ? (
          <ErrorNote message="Your account is saved, but we could not send the email. Use “Send a new link” below." />
        ) : (
          <p className="text-ink/70">
            We sent a verification link to {email ? <b className="break-all">{email}</b> : 'your email'}. Open it within 24
            hours. Check the spam folder if you cannot find it.
          </p>
        )}
        <p className="text-sm text-ink/60">
          {isTrainer
            ? 'Your trainer profile is waiting for approval and is not public yet. You can log in while it is reviewed.'
            : 'You can look around now. Booking and payments unlock once your email is verified.'}
        </p>

        <ResendVerification email={email || undefined} startWithCooldown={fromSignUp && !sendFailed} />

        {user ? (
          <Link to={HOME[user.role]} className="btn-primary inline-flex min-h-[48px] w-full items-center justify-center text-base">
            Continue
          </Link>
        ) : (
          <Link to="/login" className="btn-primary inline-flex min-h-[48px] w-full items-center justify-center text-base">
            Go to log in
          </Link>
        )}
      </div>
    </AuthLayout>
  );
}
