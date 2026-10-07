/**
 * The seven plates of the landing's descent, one per classical planet, from
 * Saturn down to the Moon. The list itself lives in `plates.json`, which
 * `scripts/prep-plates.mjs` reads too, so the crop the script makes and the
 * tone the page prints it at never drift apart.
 */

import data from './plates.json';

export const LEVELS = ['saturn', 'jupiter', 'mars', 'sun', 'venus', 'mercury', 'moon'] as const;
export type Level = (typeof LEVELS)[number];

export interface Plate {
  id: Level;
  src: string;
  credit: string;
  /** Where to hold the plate when the screen crops it, as fractions. */
  focus: readonly [number, number];
  /** Levels: black point, white point and gamma, so all seven print at
   *  about the same density of umber. */
  tone: readonly [number, number, number];
}

export const PLATES: readonly Plate[] = data.map((p) => ({
  id: p.id as Level,
  src: `/plates/${p.id}.jpg`,
  credit: p.credit,
  focus: [p.focus[0], p.focus[1]] as const,
  tone: [p.tone[0], p.tone[1], p.tone[2]] as const,
}));

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
