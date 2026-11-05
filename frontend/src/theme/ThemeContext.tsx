import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { Moon, Sun } from 'lucide-react';

export type Theme = 'dark' | 'light';
const KEY = 'gym-theme';

function initialTheme(): Theme {
  try {
    const saved = localStorage.getItem(KEY);
    if (saved === 'dark' || saved === 'light') return saved;
  } catch {
    /* storage blocked */
  }
  return 'dark';
}

const Ctx = createContext<{ theme: Theme; toggle: () => void }>({ theme: 'dark', toggle: () => {} });

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setTheme] = useState<Theme>(initialTheme);

  useEffect(() => {
    document.documentElement.classList.toggle('dark', theme === 'dark');
    document.documentElement.style.colorScheme = theme;
    try {
      localStorage.setItem(KEY, theme);
    } catch {
      /* storage blocked */
    }
  }, [theme]);

  const toggle = useCallback(() => setTheme((t) => (t === 'dark' ? 'light' : 'dark')), []);
  return <Ctx.Provider value={{ theme, toggle }}>{children}</Ctx.Provider>;
}

export const useTheme = () => useContext(Ctx);

/** Hex colors for Recharts (SVG attributes can't read CSS variables reliably). */
export function useChartColors() {
  const { theme } = useTheme();
  return theme === 'dark'
    ? { primary: '#C6FF3D', secondary: '#2DD4BF', tertiary: '#5B6170', cursor: 'rgba(255,255,255,0.06)', axis: '#8A8F9C', grid: '#2A2D35' }
    : { primary: '#65A30D', secondary: '#0D9488', tertiary: '#A3A9B6', cursor: 'rgba(14,15,18,0.05)', axis: '#6B7180', grid: '#E2E5EA' };
}

export function ThemeToggle({ className = '' }: { className?: string }) {
  const { theme, toggle } = useTheme();
  const next = theme === 'dark' ? 'light' : 'dark';
  return (
    <button type="button" onClick={toggle} className={`btn-ghost btn-sm !px-2 ${className}`} aria-label={`Switch to ${next} mode`} title={`Switch to ${next} mode`}>
      {theme === 'dark' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
    </button>
  );
}
