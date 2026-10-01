/**
 * Where everything on the poster goes, and the picture read off as a grid of
 * brightness values — one per character cell.
 *
 * The engraving is sampled by drawing it, shrunk, into a canvas exactly one
 * pixel per cell; the browser's own resampling does the averaging. A tone
 * curve then keeps only the light (the ring, the angels, the sun), and an
 * elliptical falloff lets the edge of the plate dissolve into the dark rather
 * than stop at a line.
 */

export interface Rect {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

export interface PosterLayout {
  width: number;
  height: number;
  /** Character cell, in CSS px. */
  cw: number;
  ch: number;
  cols: number;
  rows: number;
  /** The plate, in CSS px. It may run off the page. */
  art: Rect;
  /** The light at the centre of the ring. */
  sun: { x: number; y: number; r: number };
  /** The spot-colour panel behind the plate, snapped to whole cells. */
  panel: Rect;
  portrait: boolean;
}

export interface Field {
  /** Brightness to print, 0 (nothing) to 1, row-major. */
  v: Float32Array;
  /** How far inside the plate's falloff each cell is, 0 to 1. */
  mask: Float32Array;
  /** The plate's own brightness, before the tone curve — the detail in the
   *  grey sky that only the lantern brings out. */
  raw: Float32Array;
}

/** Where the light sits in Doré's plate, as fractions of its width and height. */
const SUN = { x: 0.487, y: 0.44, r: 0.085 };
/** The ring of the blessed round it: radius and spread, as fractions of the width. */
const RING = { r: 0.36, spread: 0.06, core: 0.07 };
/** How much of the print the ring and the core are allowed to claim. */
const EMPHASIS = 0.6;

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
const smooth = (e0: number, e1: number, x: number) => {
  const t = clamp((x - e0) / (e1 - e0), 0, 1);
  return t * t * (3 - 2 * t);
};

export function layoutPoster(width: number, height: number, aspect: number): PosterLayout {
  const portrait = width / height < 0.85;
  const cw = width >= 1100 ? 9 : width >= 720 ? 8 : 6;
  const ch = Math.round(cw * 1.45);
  const cols = Math.ceil(width / cw);
  const rows = Math.ceil(height / ch);

  let art: Rect;
  if (portrait) {
    const aw = Math.min(width * 1.2, height * 0.66 * aspect);
    const ah = aw / aspect;
    const y1 = height - height * 0.05;
    art = { x0: width / 2 - aw / 2, y0: y1 - ah, x1: width / 2 + aw / 2, y1 };
  } else {
    let ah = height * 1.04;
    let aw = ah * aspect;
    if (aw > width * 0.62) {
      aw = width * 0.62;
      ah = aw / aspect;
    }
    const x1 = width * 0.975;
    const y0 = (height - ah) / 2 + height * 0.015;
    art = { x0: x1 - aw, y0, x1, y1: y0 + ah };
  }
  const aw = art.x1 - art.x0;
  const ah = art.y1 - art.y0;
  const sun = { x: art.x0 + aw * SUN.x, y: art.y0 + ah * SUN.y, r: aw * SUN.r };

  // The panel sits behind the lower-left of the ring and runs off toward the
  // headline, the way a printed block sits behind a cut-out figure.
  const raw: Rect = portrait
    ? { x0: 0, y0: art.y0 + ah * 0.36, x1: art.x0 + aw * 0.3, y1: art.y0 + ah * 0.62 }
    : { x0: art.x0 - aw * 0.04, y0: art.y0 + ah * 0.46, x1: art.x0 + aw * 0.34, y1: art.y0 + ah * 0.76 };
  const panel: Rect = {
    x0: Math.round(raw.x0 / cw) * cw,
    y0: Math.round(raw.y0 / ch) * ch,
    x1: Math.round(raw.x1 / cw) * cw,
    y1: Math.round(raw.y1 / ch) * ch,
  };

  return { width, height, cw, ch, cols, rows, art, sun, panel, portrait };
}

export function sampleField(img: CanvasImageSource, l: PosterLayout): Field {
  const { cols, rows, cw, ch, art, sun } = l;
  const c = document.createElement('canvas');
  c.width = cols;
  c.height = rows;
  const g = c.getContext('2d', { willReadFrequently: true })!;
  g.imageSmoothingEnabled = true;
  g.imageSmoothingQuality = 'high';
  g.drawImage(img, art.x0 / cw, art.y0 / ch, (art.x1 - art.x0) / cw, (art.y1 - art.y0) / ch);
  const px = g.getImageData(0, 0, cols, rows).data;

  const v = new Float32Array(cols * rows);
  const mask = new Float32Array(cols * rows);
  const raw = new Float32Array(cols * rows);
  const cx = (art.x0 + art.x1) / 2;
  const cy = (art.y0 + art.y1) / 2;
  const rx = (art.x1 - art.x0) / 2;
  const ry = (art.y1 - art.y0) / 2;
  const aw = rx * 2;
  for (let r = 0; r < rows; r += 1) {
    for (let col = 0; col < cols; col += 1) {
      const i = r * cols + col;
      const x = (col + 0.5) * cw;
      const y = (r + 0.5) * ch;
      const e = Math.hypot((x - cx) / rx, (y - cy) / ry);
      const m = 1 - smooth(0.7, 1.02, e);
      mask[i] = m;
      if (m <= 0) continue;
      const lum = px[i * 4] / 255;
      raw[i] = lum * m;
      // Keep the light, drop the mid-grey sky: only what glows gets printed.
      const t = clamp((lum - 0.45) / 0.45, 0, 1);
      // The plate's ring is subtle at this resolution, so the light on it and
      // at its centre is favoured over the light elsewhere.
      const d = Math.hypot(x - sun.x, y - sun.y) / aw;
      const ring = Math.exp(-((d - RING.r) ** 2) / (2 * RING.spread ** 2));
      const core = Math.exp(-(d * d) / (2 * RING.core ** 2));
      v[i] = Math.pow(t, 1.4) * (1 - EMPHASIS + EMPHASIS * Math.min(1, ring + core)) * m;
    }
  }
  return { v, mask, raw };
}
