import { useEffect, useState } from 'react';

type Theme = 'light' | 'dark';

export default function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>('dark');
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setTheme((document.documentElement.dataset.theme as Theme) ?? 'dark');
    setMounted(true);
  }, []);

  const toggle = () => {
    const next: Theme = theme === 'dark' ? 'light' : 'dark';
    document.documentElement.dataset.theme = next;
    localStorage.setItem('theme', next);
    setTheme(next);
  };

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'}
      title={theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'}
      className="group sketch-control relative grid size-9 place-items-center text-ink"
    >
      <span className={mounted ? 'contents' : 'invisible contents'}>
        <span className={`transition-transform duration-500 ease-out ${theme === 'dark' ? 'rotate-0 scale-100' : 'rotate-90 scale-0 absolute'}`}>
          <SunIcon />
        </span>
        <span className={`transition-transform duration-500 ease-out ${theme === 'light' ? 'rotate-0 scale-100' : '-rotate-90 scale-0 absolute'}`}>
          <MoonIcon />
        </span>
      </span>
    </button>
  );
}

const iconProps = {
  viewBox: '0 0 24 24',
  className: 'size-4 transition-colors group-hover:text-accent',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.7,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
  'aria-hidden': true,
};

function SunIcon() {
  return (
    <svg {...iconProps}>
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
    </svg>
  );
}

function MoonIcon() {
  return (
    <svg {...iconProps}>
      <path d="M20.5 14.1A8.5 8.5 0 0 1 9.9 3.5 8.5 8.5 0 1 0 20.5 14.1Z" />
    </svg>
  );
}
