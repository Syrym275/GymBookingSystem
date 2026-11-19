import { Link } from 'react-router-dom';
import { Barbell } from '../components/GymIcons';
import { useT } from '../i18n';

export default function NotFound() {
  const { t } = useT();
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-5 px-4 text-center">
      <span className="flex h-14 w-14 items-center justify-center rounded-md bg-brand text-onaccent">
        <Barbell className="h-8 w-8" />
      </span>
      <h1 className="font-display text-5xl font-bold uppercase">{t('notFound.title')}</h1>
      <p className="max-w-md text-ink/70">{t('notFound.text')}</p>
      <Link to="/" className="btn-primary min-h-[44px] px-6">
        {t('notFound.back')}
      </Link>
    </main>
  );
}
