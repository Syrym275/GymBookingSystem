import { useEffect, useState, type FormEvent } from 'react';
import { Link, Navigate, useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { HOME } from '../auth/RequireRole';
import { AuthLayout } from '../components/AuthLayout';
import { useToast } from '../components/Toast';
import { ErrorNote } from '../components/ui';

const RESEND_SECONDS = 60; // matches the backend cooldown

export default function VerifyEmail() {
  const { user, verifyEmail, resendCode } = useAuth();
  const navigate = useNavigate();
  const toast = useToast();
  const [params] = useSearchParams();
  const [email, setEmail] = useState(params.get('email') ?? '');
  const emailFromLink = Boolean(params.get('email'));
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(
    params.get('sent') === '0' ? 'Your account is saved, but the email could not be sent. Use "Send a new code".' : null,
  );
  const [info, setInfo] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  // Coming from login (resend=1) or after a failed send, a new code can be requested at once.
  const [cooldown, setCooldown] = useState(params.get('sent') === '0' || params.get('resend') === '1' ? 0 : RESEND_SECONDS);
  const [trainerConfirmed, setTrainerConfirmed] = useState(false);

  useEffect(() => {
    if (cooldown <= 0) return;
    const timer = setTimeout(() => setCooldown((s) => s - 1), 1000);
    return () => clearTimeout(timer);
  }, [cooldown]);

  if (user) return <Navigate to={HOME[user.role]} replace />;

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setInfo(null);
    if (!/^\d{6}$/.test(code)) return setError('Enter the 6-digit code from the email.');
    setBusy(true);
    try {
      const verified = await verifyEmail(email.trim(), code);
      if (verified.role === 'trainer') {
        setTrainerConfirmed(true);
        return;
      }
      toast.success(`Email confirmed. Welcome, ${verified.full_name.split(' ')[0]}!`);
      navigate(HOME[verified.role as keyof typeof HOME] ?? '/', { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not confirm the email.');
    } finally {
      setBusy(false);
    }
  };

  const onResend = async () => {
    setError(null);
    setInfo(null);
    if (!email.trim()) return setError('Enter your email first.');
    setBusy(true);
    try {
      await resendCode(email.trim());
      setInfo(`A new code was sent to ${email.trim()}. It works for 15 minutes.`);
      setCode('');
      setCooldown(RESEND_SECONDS);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not send a new code.');
    } finally {
      setBusy(false);
    }
  };

  if (trainerConfirmed) {
    return (
      <AuthLayout
        aside={{
          title: (
            <>
              Thanks for applying. <span className="block text-brand-dark">We will review it soon.</span>
            </>
          ),
          text: 'Approved trainers are listed on PulseGym with their specialization and session price.',
        }}
      >
        <div className="space-y-4 rounded-xl border border-line bg-white p-6">
          <h1 className="text-4xl font-bold">Email confirmed</h1>
          <p className="text-ink/70">
            Your trainer profile is waiting for approval and is not public yet. Trainer sign-in is not available yet.
          </p>
          <Link to="/" className="btn-primary inline-flex min-h-[48px] w-full items-center justify-center text-base">
            Back to home
          </Link>
        </div>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout
      aside={{
        title: (
          <>
            Almost there. <span className="block text-brand-dark">Check your inbox.</span>
          </>
        ),
        text: 'We sent a 6-digit code to your email to make sure the address is yours.',
      }}
    >
      <div>
        <h1 className="text-4xl font-bold">Confirm your email</h1>
        <p className="mt-1 text-ink/70">
          {emailFromLink ? (
            <>
              Enter the code we sent to <b className="break-all">{email}</b>.
            </>
          ) : (
            'Enter your email and the code we sent you.'
          )}
        </p>
      </div>

      <form onSubmit={onSubmit} className="space-y-4 rounded-xl border border-line bg-white p-6">
        {!emailFromLink && (
          <div>
            <label className="label" htmlFor="email">
              Email
            </label>
            <input id="email" type="email" required className="input min-h-[44px]" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" />
          </div>
        )}
        <div>
          <label className="label" htmlFor="code">
            Confirmation code
          </label>
          <input
            id="code"
            required
            inputMode="numeric"
            autoComplete="one-time-code"
            maxLength={6}
            placeholder="123456"
            className="input min-h-[44px] text-center font-display text-2xl tracking-[0.5em]"
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
          />
          <p className="mt-1 text-xs text-ink/60">The code works for 15 minutes. Check your spam folder if it has not arrived.</p>
        </div>

        {error && <ErrorNote message={error} />}
        {info && (
          <p role="status" className="rounded-lg border border-line bg-cream p-3 text-sm">
            {info}
          </p>
        )}

        <button className="btn-primary min-h-[48px] w-full text-base" disabled={busy}>
          {busy ? 'Checking…' : 'Confirm email'}
        </button>
        <button
          type="button"
          onClick={onResend}
          disabled={busy || cooldown > 0}
          className="inline-flex min-h-[44px] w-full items-center justify-center text-sm font-semibold text-brand-dark underline-offset-2 hover:underline disabled:cursor-not-allowed disabled:text-ink/40 disabled:no-underline"
        >
          {cooldown > 0 ? `Send a new code in ${cooldown}s` : 'Send a new code'}
        </button>
        <p className="text-center text-sm text-ink/60">
          Already confirmed?{' '}
          <Link to="/login" className="inline-flex min-h-[44px] items-center font-semibold text-brand-dark underline-offset-2 hover:underline">
            Log in
          </Link>
        </p>
      </form>
    </AuthLayout>
  );
}
