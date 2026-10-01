/**
 * The poster's type case: a ramp of glyphs from empty to dense, set once per
 * colour into an atlas so the field can be printed with `drawImage` — one blit
 * per cell — rather than thousands of `fillText` calls a frame.
 *
 * The ramp borrows from ASCII-art posters: slashes and lower-case for the thin
 * light, capitals and `@` where the engraving is brightest.
 */

/** Light to dense. Index 0 is an empty cell. */
export const RAMP = [' ', '.', '·', ':', ';', '/', 'r', 'c', 'a', 'J', 'Z', 'd', 'M', '@'] as const;

/** Extra atlas slots past the ramp: printed squares for the mosaic fringe. */
export const BLOCK = RAMP.length;
export const DOT = RAMP.length + 1;
export const SLOTS = RAMP.length + 2;

/** Ink colours, by index into the atlas rows. */
export const Tone = {
  Deep: 0,
  Cobalt: 1,
  Bone: 2,
  /** Ink printed on the pink panel. */
  Ink: 3,
  /** The lantern's warm light. */
  Gold: 4,
} as const;

export type Tone = (typeof Tone)[keyof typeof Tone];

export type Inks = Record<'deep' | 'cobalt' | 'bone' | 'ink' | 'gold', string>;

export interface Atlas {
  canvas: HTMLCanvasElement;
  /** One slot, in device pixels. */
  sw: number;
  sh: number;
}

/** 4×4 ordered-dither thresholds, in [0, 1). */
const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5].map((v) => (v + 0.5) / 16);

export const bayer = (col: number, row: number) => BAYER[(row & 3) * 4 + (col & 3)];

/** Picks a ramp index for a value in [0, 1], dithered between neighbours. */
export function glyphFor(v: number, col: number, row: number): number {
  if (v <= 0) return 0;
  const n = RAMP.length - 1;
  return Math.max(0, Math.min(n, Math.floor(v * n + bayer(col, row))));
}

/** Which ink a value is printed in, off the panel. */
export function toneFor(v: number): Tone {
  return v < 0.42 ? Tone.Deep : v < 0.78 ? Tone.Cobalt : Tone.Bone;
}

export function buildAtlas(cw: number, ch: number, dpr: number, font: string, inks: Inks): Atlas {
  const sw = Math.ceil(cw * dpr);
  const sh = Math.ceil(ch * dpr);
  const rows = [inks.deep, inks.cobalt, inks.bone, inks.ink, inks.gold];
  const canvas = document.createElement('canvas');
  canvas.width = sw * SLOTS;
  canvas.height = sh * rows.length;
  const c = canvas.getContext('2d')!;
  // Set the glyph to the cell's width: a monospace advance is about 0.6em.
  const size = (cw / 0.6) * dpr;
  c.font = `600 ${size.toFixed(1)}px ${font}`;
  c.textAlign = 'center';
  c.textBaseline = 'middle';
  rows.forEach((ink, r) => {
    c.fillStyle = ink;
    for (let g = 1; g < RAMP.length; g += 1) {
      c.fillText(RAMP[g], g * sw + sw / 2, r * sh + sh / 2 + dpr * 0.5);
    }
    // The fringe's printed squares: one nearly fills the cell, one is a dot.
    const bw = Math.round(sw * 0.78);
    const bh = Math.round(sh * 0.62);
    c.fillRect(BLOCK * sw + ((sw - bw) >> 1), r * sh + ((sh - bh) >> 1), bw, bh);
    const d = Math.max(1, Math.round(sw * 0.34));
    c.fillRect(DOT * sw + ((sw - d) >> 1), r * sh + ((sh - d) >> 1), d, d);
  });
  return { canvas, sw, sh };
}
