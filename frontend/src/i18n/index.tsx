import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { enGB, kk, ru as ruLocale } from 'date-fns/locale';
import type { Locale } from 'date-fns';
import { en, type Key } from './en';
import { ru } from './ru';
import { kz } from './kz';

/**
 * Site languages. `t('key')` returns the text in the current language; `{name}` placeholders are
 * filled from `vars`. Dictionaries live in en.ts / ru.ts / kz.ts and share the same keys
 * (TypeScript checks that ru and kz have every key that en has).
 */
export type Lang = 'ru' | 'kz' | 'en';
export type { Key };

export const LANGS: { code: Lang; label: string; name: string; html: string }[] = [
  { code: 'ru', label: 'RU', name: 'Русский', html: 'ru' },
  { code: 'kz', label: 'KZ', name: 'Қазақша', html: 'kk' },
  { code: 'en', label: 'EN', name: 'English', html: 'en' },
];

const DICTS: Record<Lang, Record<Key, string>> = { en, ru, kz };
const STORAGE_KEY = 'gbs_lang';
const isLang = (v: unknown): v is Lang => v === 'ru' || v === 'kz' || v === 'en';

function initialLang(): Lang {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (isLang(saved)) return saved;
  } catch {
    /* storage blocked */
  }
  const browser = typeof navigator !== 'undefined' ? navigator.languages ?? [navigator.language] : [];
  for (const l of browser) {
    const code = (l || '').toLowerCase();
    if (code.startsWith('kk')) return 'kz';
    if (code.startsWith('ru')) return 'ru';
    if (code.startsWith('en')) return 'en';
  }
  return 'ru';
}

let current: Lang = initialLang();
export const getLang = () => current;

/** Text for `key` in the current language. */
export function t(key: Key, vars?: Record<string, string | number>): string {
  let s = DICTS[current][key] ?? en[key] ?? key;
  if (vars) for (const [k, v] of Object.entries(vars)) s = s.split(`{${k}}`).join(String(v));
  return s;
}

type PluralBase = Key extends infer K ? (K extends `${infer B}_one` ? B : never) : never;

/** Count-aware text: tp('unit.people', 5) -> "5 человек" / "5 people" / "5 адам". */
export function tp(base: PluralBase, n: number, vars?: Record<string, string | number>): string {
  let form: 'one' | 'few' | 'many' | 'other' = 'other';
  if (current === 'en') form = n === 1 ? 'one' : 'other';
  else if (current === 'ru') {
    const m10 = n % 10;
    const m100 = n % 100;
    form = m10 === 1 && m100 !== 11 ? 'one' : m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14) ? 'few' : 'many';
  }
  return t(`${base}_${form}` as Key, { n, ...vars });
}

/** date-fns locale for the current language (used by utils/format.ts). */
export function dateLocale(): Locale {
  return current === 'ru' ? ruLocale : current === 'kz' ? kk : enGB;
}

const Ctx = createContext<{ lang: Lang; setLang: (l: Lang) => void }>({ lang: current, setLang: () => {} });

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>(current);

  useEffect(() => {
    document.documentElement.lang = LANGS.find((l) => l.code === lang)!.html;
    document.title = t('meta.title');
  }, [lang]);

  const setLang = useCallback((l: Lang) => {
    current = l;
    try {
      localStorage.setItem(STORAGE_KEY, l);
    } catch {
      /* storage blocked */
    }
    setLangState(l);
  }, []);

  return <Ctx.Provider value={{ lang, setLang }}>{children}</Ctx.Provider>;
}

/**
 * Use in every component that shows text: it re-renders the component when the language changes.
 * `const { t } = useT();`
 */
export function useT() {
  const { lang, setLang } = useContext(Ctx);
  return { t, tp, lang, setLang };
}

/** RU / KZ / EN switch for page headers. */
export function LanguageSwitcher({ className = '' }: { className?: string }) {
  const { lang, setLang } = useT();
  return (
    <div role="group" aria-label={t('lang.choose')} className={`inline-flex rounded-md border border-line p-0.5 ${className}`}>
      {LANGS.map((l) => (
        <button
          key={l.code}
          type="button"
          lang={l.html}
          onClick={() => setLang(l.code)}
          aria-pressed={lang === l.code}
          title={l.name}
          className={`min-h-[36px] min-w-[36px] rounded px-2 text-xs font-bold tracking-wide transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/60 ${
            lang === l.code ? 'bg-brand text-onaccent' : 'text-ink/70 hover:text-ink'
          }`}
        >
          {l.label}
        </button>
      ))}
    </div>
  );
}
