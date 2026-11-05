import { Link } from 'react-router-dom';
import { Barbell } from '../components/GymIcons';

export default function NotFound() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-5 px-4 text-center">
      <span className="flex h-14 w-14 items-center justify-center rounded-md bg-brand text-onaccent">
        <Barbell className="h-8 w-8" />
      </span>
      <h1 className="font-display text-5xl font-bold uppercase">Page not found</h1>
      <p className="max-w-md text-ink/70">This address does not lead anywhere. The schedule and sign-up are on the home page.</p>
      <Link to="/" className="btn-primary min-h-[44px] px-6">
        Back to the home page
      </Link>
    </main>
  );
}
