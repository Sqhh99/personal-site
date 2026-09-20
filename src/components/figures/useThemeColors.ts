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
  ink: '#161513',
  muted: '#4d4a45',
  faint: '#807c74',
  accent: '#161513',
  'accent-deep': '#000000',
  kraft: '#6f6b64',
  manilla: '#9c978d',
  surface: '#f6f4ee',
  'surface-sunk': '#e7e3d9',
  border: '#d3cec2',
  'border-strong': '#b3ada0',
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
 * Resolves the CSS custom properties a canvas draws with. Canvas pixels are
 * not styled by CSS, so this is how a figure stays inside the site's palette.
 * Resolved once after mount; the site has a single theme.
 */
export function useThemeColors(): ThemeColors {
  const [colors, setColors] = useState<ThemeColors>(FALLBACK);

  useEffect(() => {
    setColors(read());
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
