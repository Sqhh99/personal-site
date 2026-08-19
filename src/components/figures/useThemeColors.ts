import { useEffect, useState } from 'react';

/**
 * The palette tokens a figure is allowed to draw with. Keeping the list closed
 * means a canvas can never invent a colour that is outside the site's system.
 */
const TOKENS = [
  'ink',
  'muted',
  'faint',
  'accent',
  'accent-deep',
  'kraft',
  'manilla',
  'surface',
  'surface-sunk',
  'border',
  'border-strong',
] as const;

export type ThemeColors = Record<(typeof TOKENS)[number], string>;

const FALLBACK: ThemeColors = {
  ink: '#1c1814',
  muted: '#534c43',
  faint: '#6f675d',
  accent: '#c45c3e',
  'accent-deep': '#a8472c',
  kraft: '#c9a07a',
  manilla: '#ead8b6',
  surface: '#f8f4ea',
  'surface-sunk': '#e8e1d2',
  border: '#d4ccbc',
  'border-strong': '#b8ae9a',
};

function read(): ThemeColors {
  if (typeof window === 'undefined') return FALLBACK;
  const style = getComputedStyle(document.documentElement);
  const out = {} as ThemeColors;
  for (const token of TOKENS) {
    out[token] = style.getPropertyValue(`--${token}`).trim() || FALLBACK[token];
  }
  return out;
}

/**
 * Resolves the CSS custom properties a canvas needs, and re-resolves them when
 * the theme toggle flips `data-theme`. Canvas pixels are not styled by CSS, so
 * without this every figure would keep its light-mode colours in dark mode.
 */
export function useThemeColors(): ThemeColors {
  const [colors, setColors] = useState<ThemeColors>(FALLBACK);

  useEffect(() => {
    setColors(read());

    const observer = new MutationObserver(() => setColors(read()));
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['data-theme'],
    });
    return () => observer.disconnect();
  }, []);

  return colors;
}

/**
 * `color` at `alpha` opacity. Deliberately hand-parses hex rather than emitting
 * `color-mix()`: canvas `fillStyle` support for it is newer than the rest of
 * what these figures need, and every palette token resolves to a hex string.
 */
export function fade(color: string, alpha: number): string {
  const hex = color.trim();
  const match = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(hex);
  if (!match) return hex;

  const digits = match[1];
  const full =
    digits.length === 3
      ? digits
          .split('')
          .map((d) => d + d)
          .join('')
      : digits;

  const r = parseInt(full.slice(0, 2), 16);
  const g = parseInt(full.slice(2, 4), 16);
  const b = parseInt(full.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}
