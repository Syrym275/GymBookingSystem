import { useEffect, useState, type FormEvent } from 'react';
import { resendVerification } from '../api/verificationApi';
import { ErrorNote } from './ui';

const COOLDOWN_SECONDS = 60; // the backend also allows only 3 resends per hour

/** "Send a new link" button. Asks for the email when it is not known. */
export function ResendVerification({ email: knownEmail, startWithCooldown = false }: { email?: string; startWithCooldown?: boolean }) {
  const [email, setEmail] = useState(knownEmail ?? '');
  const [cooldown, setCooldown] = useState(startWithCooldown ? COOLDOWN_SECONDS : 0);
  const [busy, setBusy] = useState(false);
  const [info, setInfo] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (cooldown <= 0) return;
    const timer = window.setTimeout(() => setCooldown((s) => s - 1), 1000);
    return () => window.clearTimeout(timer);
  }, [cooldown]);

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setInfo(null);
    if (!email.trim()) return setError('Enter your email first.');
    setBusy(true);
    try {
      setInfo(await resendVerification(email.trim()));
      setCooldown(COOLDOWN_SECONDS);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not send a new link.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={onSubmit} className="space-y-3">
      {!knownEmail && (
        <div>
          <label className="label" htmlFor="resend_email">
            Email
          </label>
          <input
            id="resend_email"
            type="email"
            required
            className="input min-h-[44px]"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoComplete="email"
          />
        </div>
      )}
      {info && <p className="rounded-xl border border-line bg-cream p-3 text-sm">{info}</p>}
      {error && <ErrorNote message={error} />}
      <button className="btn-secondary min-h-[48px] w-full text-base" disabled={busy || cooldown > 0}>
        {busy ? 'Sending…' : cooldown > 0 ? `Send a new link (${cooldown}s)` : 'Send a new link'}
      </button>
    </form>
  );
}
