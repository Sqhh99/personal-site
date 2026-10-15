/**
 * The plates of the landing's descent: seven planets in the old order, from
 * Saturn down to the Moon, three plates each. The list itself lives in
 * `plates.json`, which `scripts/prep-plates.mjs` reads too, so the crop the
 * script makes and the tone the page prints it at never drift apart.
 */

import data from './plates.json';

export const PLANETS = ['saturn', 'jupiter', 'mars', 'sun', 'venus', 'mercury', 'moon'] as const;
export type Planet = (typeof PLANETS)[number];

export interface Plate {
  /** The first plate of a chapter is the bare planet (`#venus`), the others
   *  `venus-2` and `venus-3`. */
  id: string;
  planet: Planet;
  /** 1–3 within its planet. */
  n: number;
  src: string;
  work: string;
  year: number;
  credit: string;
  /** Where to hold the plate when the screen crops it, as fractions. */
  focus: readonly [number, number];
  /** Levels: black point, white point and gamma, so all the plates print at
   *  about the same density of umber. */
  tone: readonly [number, number, number];
  /** Points of interest in the plate, as fractions; the first is where the
   *  light comes from — the lamp, the moon, the door. */
  light: ReadonlyArray<readonly [number, number]>;
}

export const PLATES: readonly Plate[] = data.map((p) => ({
  id: p.id,
  planet: p.planet as Planet,
  n: Number(p.id.split('-')[1] ?? 1),
  src: `/plates/${p.id}.jpg`,
  work: p.work,
  year: p.year,
  credit: `Gustave Doré — ${p.work}, ${p.year}`,
  focus: [p.focus[0], p.focus[1]] as const,
  tone: [p.tone[0], p.tone[1], p.tone[2]] as const,
  light: p.light.map(([x, y]) => [x, y] as const),
}));

/** The index of a planet's first plate. */
export const chapterStart = (planet: Planet) => PLATES.findIndex((p) => p.planet === planet);

/** `#venus` or `#venus-2` to a plate index, or −1. */
export const parseHash = (hash: string) => PLATES.findIndex((p) => p.id === hash.replace(/^#/, ''));

/** The planet that rules the day, by the old week: Sunday the Sun, Monday the
 *  Moon, then Mars, Mercury, Jupiter, Venus and Saturn. */
export const WEEKDAY: readonly Planet[] = ['sun', 'moon', 'mars', 'mercury', 'jupiter', 'venus', 'saturn'];
export const todayPlanet = (date = new Date()) => WEEKDAY[date.getDay()];

export const ROMAN = ['I', 'II', 'III'] as const;

/** 8×8 Bayer thresholds in (0, 1), row-major — the order the dots come in. */
export const BAYER8: Float32Array = (() => {
  let m = [[0]];
  for (let n = 1; n < 8; n *= 2) {
    const next: number[][] = [];
    for (let y = 0; y < n * 2; y += 1) {
      next.push([]);
      for (let x = 0; x < n * 2; x += 1) {
        const q = [0, 2, 3, 1][(y >= n ? 2 : 0) + (x >= n ? 1 : 0)];
        next[y].push(4 * m[y % n][x % n] + q);
      }
    }
    m = next;
  }
  return Float32Array.from(m.flat(), (v) => (v + 0.5) / 64);
})();
