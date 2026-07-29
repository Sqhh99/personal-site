/**
 * Minimal plotting primitives shared by every figure. Not a chart library — just
 * enough to stop each canvas from re-deriving the same axis arithmetic.
 */

export interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

export function box(x: number, y: number, w: number, h: number): Box {
  return { x, y, w, h };
}

/** Maps a normalised [0,1] position to a pixel x inside the box. */
export function bx(b: Box, u: number): number {
  return b.x + u * b.w;
}

/** Maps a value in [-range, range] to a pixel y, y-up. */
export function by(b: Box, v: number, range = 1): number {
  return b.y + b.h / 2 - (v / range) * (b.h / 2);
}

/** Maps a value in [0, range] to a pixel y measured from the box floor. */
export function byUp(b: Box, v: number, range = 1): number {
  return b.y + b.h - (v / range) * b.h;
}

export function polyline(
  ctx: CanvasRenderingContext2D,
  points: Array<[number, number]>,
  color: string,
  width = 2,
) {
  if (points.length < 2) return;
  ctx.beginPath();
  ctx.moveTo(points[0][0], points[0][1]);
  for (let i = 1; i < points.length; i += 1) ctx.lineTo(points[i][0], points[i][1]);
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  ctx.stroke();
}

/** Samples `fn` across the box width and strokes the result. */
export function curve(
  ctx: CanvasRenderingContext2D,
  b: Box,
  fn: (u: number) => number,
  color: string,
  { range = 1, width = 2, samples = 480 }: { range?: number; width?: number; samples?: number } = {},
) {
  const points: Array<[number, number]> = [];
  for (let i = 0; i <= samples; i += 1) {
    const u = i / samples;
    points.push([bx(b, u), by(b, fn(u), range)]);
  }
  polyline(ctx, points, color, width);
}

export function baseline(ctx: CanvasRenderingContext2D, b: Box, color: string) {
  ctx.beginPath();
  ctx.moveTo(b.x, by(b, 0));
  ctx.lineTo(b.x + b.w, by(b, 0));
  ctx.strokeStyle = color;
  ctx.lineWidth = 1;
  ctx.setLineDash([3, 4]);
  ctx.stroke();
  ctx.setLineDash([]);
}

export function frame(ctx: CanvasRenderingContext2D, b: Box, color: string, radius = 10) {
  ctx.beginPath();
  ctx.roundRect(b.x + 0.5, b.y + 0.5, b.w - 1, b.h - 1, radius);
  ctx.strokeStyle = color;
  ctx.lineWidth = 1;
  ctx.stroke();
}

export function fillRoundRect(
  ctx: CanvasRenderingContext2D,
  b: Box,
  color: string,
  radius = 10,
) {
  ctx.beginPath();
  ctx.roundRect(b.x, b.y, b.w, b.h, radius);
  ctx.fillStyle = color;
  ctx.fill();
}

export function label(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  color: string,
  {
    align = 'left',
    baseline: vAlign = 'alphabetic',
    size = 11,
    mono = true,
    weight = '500',
  }: {
    align?: CanvasTextAlign;
    baseline?: CanvasTextBaseline;
    size?: number;
    mono?: boolean;
    weight?: string;
  } = {},
) {
  ctx.font = `${weight} ${size}px ${
    mono ? 'ui-monospace, SFMono-Regular, Menlo, monospace' : 'Inter Variable, system-ui, sans-serif'
  }`;
  ctx.fillStyle = color;
  ctx.textAlign = align;
  ctx.textBaseline = vAlign;
  ctx.fillText(text, x, y);
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
}

export function dot(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, color: string) {
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fillStyle = color;
  ctx.fill();
}

export function circle(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  r: number,
  color: string,
  width = 1,
) {
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.stroke();
}

export const TAU = Math.PI * 2;

/**
 * Naive DFT magnitude/phase. O(N²), which for the N ≤ 512 these figures use is
 * a fraction of a millisecond — an FFT would be faster and much harder to read.
 */
export function dft(samples: number[]): { mag: number[]; phase: number[] } {
  const n = samples.length;
  const bins = Math.floor(n / 2);
  const mag: number[] = new Array(bins);
  const phase: number[] = new Array(bins);

  for (let k = 0; k < bins; k += 1) {
    let re = 0;
    let im = 0;
    for (let t = 0; t < n; t += 1) {
      const angle = (TAU * k * t) / n;
      re += samples[t] * Math.cos(angle);
      im -= samples[t] * Math.sin(angle);
    }
    mag[k] = (2 * Math.hypot(re, im)) / n;
    phase[k] = Math.atan2(im, re);
  }
  return { mag, phase };
}
