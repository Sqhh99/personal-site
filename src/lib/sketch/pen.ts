/**
 * The pen — the only thing the landing sketch is drawn with.
 *
 * A mark is *data*, never a closure: a flat point list plus how to lay it down.
 * That is what lets the scene be built once and then progressively sketched in,
 * baked to a bitmap, and re-rendered on resize without rebuilding anything —
 * and it is what lets the same geometry be rasterised outside the browser when
 * the drawing needs checking.
 *
 * Every visible line goes down two or three times, each pass wobbled, bellied
 * and overshot a little, because that is what a nib does and it is the whole
 * difference between a hand-drawn line and a CAD one.
 */

export type Pt = [number, number];

/** 0 sky · 1 ground · 2 figure. Each gets its own canvas so it can parallax. */
export type Layer = 0 | 1 | 2;

export interface Mark {
  layer: Layer;
  /** Fill the path instead of stroking it. */
  fill: boolean;
  /** Ink, or paper — paper marks are how a near shape occludes a far one. */
  ink: boolean;
  alpha: number;
  width: number;
  closed: boolean;
  /** Flat x,y pairs in device-independent pixels. A text mark has one pair. */
  pts: number[];
  /** Lettering, set in place of a path — the chart's labels. */
  text?: string;
  font?: string;
  align?: CanvasTextAlign;
  rot?: number;
}

export interface StrokeOpts {
  /** Nib width in px. */
  w?: number;
  a?: number;
  /** How many times the line is gone over. */
  passes?: number;
  /** Sideways wander, as a fraction of the path length. */
  wobble?: number;
  /** Belly of the stroke, as a fraction of the path length. */
  bow?: number;
  /** How far each pass runs past the ends, in px. */
  overshoot?: number;
  closed?: boolean;
  ink?: boolean;
}

export interface ShapeOpts extends StrokeOpts {
  /** 'paper' knocks a hole in what is behind; 'ink' is a solid black. */
  fill?: 'paper' | 'ink' | null;
  fillAlpha?: number;
  /** Omit the contour and only fill. */
  outline?: boolean;
}

export interface HatchOpts {
  angle?: number;
  /** Spacing between lines in px. */
  gap?: number;
  w?: number;
  a?: number;
  /** Run past the shape edge, in px — hatching that stops dead reads printed. */
  overshoot?: number;
  /** Second set of lines across the first. */
  cross?: boolean;
  /** Skip this fraction of the lines, at random, for an uneven hand. */
  skip?: number;
}

// --- randomness ------------------------------------------------------------

/** Small, fast, seeded: the same viewport always draws the same picture. */
export class Rng {
  private s: number;
  constructor(seed: number) {
    this.s = seed >>> 0 || 1;
  }
  next(): number {
    this.s = (Math.imul(this.s, 1664525) + 1013904223) >>> 0;
    return this.s / 4294967296;
  }
  range(a: number, b: number): number {
    return a + (b - a) * this.next();
  }
  pick<T>(items: readonly T[]): T {
    return items[Math.floor(this.next() * items.length) % items.length];
  }
}

// --- geometry --------------------------------------------------------------

export function ellipsePoly(cx: number, cy: number, rx: number, ry: number, rot = 0, steps = 48): Pt[] {
  const out: Pt[] = [];
  const c = Math.cos(rot);
  const s = Math.sin(rot);
  for (let i = 0; i < steps; i += 1) {
    const a = (i / steps) * Math.PI * 2;
    const x = Math.cos(a) * rx;
    const y = Math.sin(a) * ry;
    out.push([cx + x * c - y * s, cy + x * s + y * c]);
  }
  return out;
}

export function circlePoly(cx: number, cy: number, r: number, steps = 44): Pt[] {
  return ellipsePoly(cx, cy, r, r, 0, steps);
}

export function roundRectPoly(x: number, y: number, w: number, h: number, r: number, steps = 5): Pt[] {
  const rad = Math.min(r, Math.abs(w) / 2, Math.abs(h) / 2);
  const out: Pt[] = [];
  const corner = (cx: number, cy: number, from: number) => {
    for (let i = 0; i <= steps; i += 1) {
      const a = from + (i / steps) * (Math.PI / 2);
      out.push([cx + Math.cos(a) * rad, cy + Math.sin(a) * rad]);
    }
  };
  corner(x + w - rad, y + rad, -Math.PI / 2);
  corner(x + w - rad, y + h - rad, 0);
  corner(x + rad, y + h - rad, Math.PI / 2);
  corner(x + rad, y + rad, Math.PI);
  return out;
}

/** A limb: a tapered sausage from a to b, closed round at both ends. */
export function capsulePoly(a: Pt, b: Pt, r0: number, r1 = r0, steps = 10): Pt[] {
  const ang = Math.atan2(b[1] - a[1], b[0] - a[0]);
  const out: Pt[] = [];
  for (let i = 0; i <= steps; i += 1) {
    const t = ang + Math.PI / 2 + (i / steps) * Math.PI;
    out.push([b[0] + Math.cos(t) * r1, b[1] + Math.sin(t) * r1]);
  }
  for (let i = 0; i <= steps; i += 1) {
    const t = ang - Math.PI / 2 + (i / steps) * Math.PI;
    out.push([a[0] + Math.cos(t) * r0, a[1] + Math.sin(t) * r0]);
  }
  return out;
}

/** Catmull-Rom through the control points, so hand-placed anchors stay few. */
export function catmull(points: Pt[], perSegment = 12, closed = false): Pt[] {
  const n = points.length;
  if (n < 2) return points.slice();
  const at = (i: number): Pt => (closed ? points[((i % n) + n) % n] : points[Math.min(n - 1, Math.max(0, i))]);
  const out: Pt[] = [];
  const last = closed ? n : n - 1;
  for (let i = 0; i < last; i += 1) {
    const p0 = at(i - 1);
    const p1 = at(i);
    const p2 = at(i + 1);
    const p3 = at(i + 2);
    for (let j = 0; j < perSegment; j += 1) {
      const t = j / perSegment;
      const t2 = t * t;
      const t3 = t2 * t;
      out.push([
        0.5 * (2 * p1[0] + (-p0[0] + p2[0]) * t + (2 * p0[0] - 5 * p1[0] + 4 * p2[0] - p3[0]) * t2 + (-p0[0] + 3 * p1[0] - 3 * p2[0] + p3[0]) * t3),
        0.5 * (2 * p1[1] + (-p0[1] + p2[1]) * t + (2 * p0[1] - 5 * p1[1] + 4 * p2[1] - p3[1]) * t2 + (-p0[1] + 3 * p1[1] - 3 * p2[1] + p3[1]) * t3),
      ]);
    }
  }
  if (!closed) out.push(points[n - 1]);
  return out;
}

export function pathLength(pts: Pt[]): number {
  let sum = 0;
  for (let i = 1; i < pts.length; i += 1) sum += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
  return sum;
}

function pointInPoly(poly: Pt[], x: number, y: number): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i, i += 1) {
    const [xi, yi] = poly[i];
    const [xj, yj] = poly[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

/**
 * Hatching by scanline rather than by clipping: the lines are cut to the shape
 * analytically, so each one stays an individual stroke that can overshoot the
 * edge, wobble, and be sketched in one at a time.
 */
export function hatchSpans(poly: Pt[], angle: number, gap: number): Array<[Pt, Pt]> {
  const c = Math.cos(-angle);
  const s = Math.sin(-angle);
  const rot = poly.map(([x, y]): Pt => [x * c - y * s, x * s + y * c]);
  let lo = Infinity;
  let hi = -Infinity;
  for (const [, y] of rot) {
    if (y < lo) lo = y;
    if (y > hi) hi = y;
  }
  const back = (x: number, y: number): Pt => [x * c + y * s, -x * s + y * c];
  const out: Array<[Pt, Pt]> = [];
  for (let y = lo + gap * 0.5; y < hi; y += gap) {
    const xs: number[] = [];
    for (let i = 0, j = rot.length - 1; i < rot.length; j = i, i += 1) {
      const [xi, yi] = rot[i];
      const [xj, yj] = rot[j];
      if (yi > y !== yj > y) xs.push(xi + ((xj - xi) * (y - yi)) / (yj - yi));
    }
    xs.sort((a, b) => a - b);
    for (let k = 0; k + 1 < xs.length; k += 2) {
      if (xs[k + 1] - xs[k] < 0.8) continue;
      out.push([back(xs[k], y), back(xs[k + 1], y)]);
    }
  }
  return out;
}

// --- the pen ---------------------------------------------------------------

export class Pen {
  readonly marks: Mark[] = [];
  layer: Layer = 0;
  /** Scales wobble/overshoot with the drawing, so a small hero is not shaggy. */
  scale = 1;
  /** Family for `text()`; the page's display face, so labels match the copy. */
  fontFamily = 'serif';

  constructor(readonly rng: Rng) {}

  /** Runs `body` on a layer and restores the previous one. */
  on(layer: Layer, body: () => void) {
    const prev = this.layer;
    this.layer = layer;
    body();
    this.layer = prev;
  }

  private push(pts: Pt[], fill: boolean, ink: boolean, alpha: number, width: number, closed: boolean) {
    if (pts.length < 2) return;
    const flat: number[] = new Array(pts.length * 2);
    for (let i = 0; i < pts.length; i += 1) {
      flat[i * 2] = pts[i][0];
      flat[i * 2 + 1] = pts[i][1];
    }
    this.marks.push({ layer: this.layer, fill, ink, alpha, width, closed, pts: flat });
  }

  /**
   * One pass of a hand line: the path wandered sideways by two slow sine waves
   * (so the wander is smooth, not fuzzy), bellied, and run past both ends.
   */
  private pass(pts: Pt[], o: StrokeOpts): Pt[] {
    const rng = this.rng;
    const len = pathLength(pts) || 1;
    const closed = o.closed ?? false;
    const wobble = (o.wobble ?? 0.012) * len;
    const bow = (o.bow ?? 0.006) * len * rng.range(-1, 1);
    // Closed shapes get whole-number frequencies so the wander meets itself.
    const f1 = closed ? Math.round(rng.range(2, 4)) : rng.range(1.2, 2.6);
    const f2 = closed ? Math.round(rng.range(4, 7)) : rng.range(3.4, 6.2);
    const p1 = rng.range(0, Math.PI * 2);
    const p2 = rng.range(0, Math.PI * 2);
    const n = pts.length;
    const out: Pt[] = [];
    for (let i = 0; i < n; i += 1) {
      const t = i / (n - 1);
      const prev = pts[Math.max(0, i - 1)];
      const next = pts[Math.min(n - 1, i + 1)];
      const dx = next[0] - prev[0];
      const dy = next[1] - prev[1];
      const m = Math.hypot(dx, dy) || 1;
      const nx = -dy / m;
      const ny = dx / m;
      const tau = t * Math.PI * 2;
      const off =
        wobble * (Math.sin(tau * f1 + p1) * 0.6 + Math.sin(tau * f2 + p2) * 0.4) +
        (closed ? 0 : bow * Math.sin(Math.PI * t));
      out.push([pts[i][0] + nx * off, pts[i][1] + ny * off]);
    }
    const over = (o.overshoot ?? 1.6) * this.scale;
    if (!closed && over > 0 && out.length > 2) {
      const ext = (from: Pt, to: Pt, k: number): Pt => {
        const dx = to[0] - from[0];
        const dy = to[1] - from[1];
        const m = Math.hypot(dx, dy) || 1;
        return [to[0] + (dx / m) * k, to[1] + (dy / m) * k];
      };
      out.unshift(ext(out[1], out[0], over * rng.range(0.3, 1)));
      out.push(ext(out[out.length - 2], out[out.length - 1], over * rng.range(0.3, 1)));
    }
    return out;
  }

  /** A hand-drawn line along `pts`, gone over `passes` times. */
  stroke(pts: Pt[], o: StrokeOpts = {}) {
    const passes = o.passes ?? 2;
    const w = (o.w ?? 1.5) * this.scale;
    const a = o.a ?? 1;
    for (let i = 0; i < passes; i += 1) {
      // Later passes sit a touch lighter and thinner, like a second look.
      const k = i === 0 ? 1 : this.rng.range(0.6, 0.9);
      this.push(this.pass(pts, o), false, o.ink ?? true, a * k, w * this.rng.range(0.85, 1.1), o.closed ?? false);
    }
  }

  line(a: Pt, b: Pt, o: StrokeOpts = {}) {
    const steps = Math.max(2, Math.round(Math.hypot(b[0] - a[0], b[1] - a[1]) / 6));
    const pts: Pt[] = [];
    for (let i = 0; i <= steps; i += 1) pts.push([a[0] + (b[0] - a[0]) * (i / steps), a[1] + (b[1] - a[1]) * (i / steps)]);
    this.stroke(pts, o);
  }

  /** Smooth curve through hand-placed anchors. */
  curve(anchors: Pt[], o: StrokeOpts = {}) {
    this.stroke(catmull(anchors, 10, o.closed ?? false), o);
  }

  /** A filled and/or outlined closed form. */
  shape(poly: Pt[], o: ShapeOpts = {}) {
    if (o.fill) this.push(poly, true, o.fill === 'ink', o.fillAlpha ?? 1, 0, true);
    if (o.outline === false) return;
    this.stroke(poly, { ...o, closed: true, wobble: o.wobble ?? 0.004, overshoot: 0 });
  }

  /** Shading inside a closed form. */
  hatch(poly: Pt[], o: HatchOpts = {}) {
    const gap = (o.gap ?? 4) * this.scale;
    const over = (o.overshoot ?? 1.5) * this.scale;
    const skip = o.skip ?? 0.06;
    const w = (o.w ?? 0.9) * this.scale;
    const a = o.a ?? 0.7;
    const runs: Array<[number, Array<[Pt, Pt]>]> = [[o.angle ?? -0.7, hatchSpans(poly, o.angle ?? -0.7, gap)]];
    if (o.cross) runs.push([(o.angle ?? -0.7) + 1.25, hatchSpans(poly, (o.angle ?? -0.7) + 1.25, gap * 1.25)]);
    for (const [, spans] of runs) {
      for (const [p, q] of spans) {
        if (this.rng.next() < skip) continue;
        const dx = q[0] - p[0];
        const dy = q[1] - p[1];
        const m = Math.hypot(dx, dy) || 1;
        const e0 = over * this.rng.range(0, 1);
        const e1 = over * this.rng.range(0, 1);
        this.stroke(
          [
            [p[0] - (dx / m) * e0, p[1] - (dy / m) * e0],
            [q[0] + (dx / m) * e1, q[1] + (dy / m) * e1],
          ],
          { w, a: a * this.rng.range(0.7, 1), passes: 1, wobble: 0.02, bow: 0.01, overshoot: 0 },
        );
      }
    }
  }

  /** Stippling — for grit, contact shadow and the powdery edge of a crater. */
  dots(poly: Pt[], count: number, r: number, a = 0.7) {
    let lo = Infinity;
    let hi = -Infinity;
    let left = Infinity;
    let right = -Infinity;
    for (const [x, y] of poly) {
      if (y < lo) lo = y;
      if (y > hi) hi = y;
      if (x < left) left = x;
      if (x > right) right = x;
    }
    for (let i = 0, tries = 0; i < count && tries < count * 8; tries += 1) {
      const x = this.rng.range(left, right);
      const y = this.rng.range(lo, hi);
      if (!pointInPoly(poly, x, y)) continue;
      i += 1;
      const rr = r * this.rng.range(0.6, 1.3) * this.scale;
      this.push(circlePoly(x, y, rr, 6), true, true, a * this.rng.range(0.5, 1), 0, true);
    }
  }

  /** A hand-lettered label: italic, a touch off the horizontal. */
  text(str: string, x: number, y: number, o: { size?: number; a?: number; align?: CanvasTextAlign; rot?: number; italic?: boolean } = {}) {
    const size = (o.size ?? 12) * this.scale;
    this.marks.push({
      layer: this.layer,
      fill: true,
      ink: true,
      alpha: o.a ?? 0.8,
      width: 0,
      closed: false,
      pts: [x, y],
      text: str,
      font: `${o.italic === false ? '' : 'italic '}400 ${size.toFixed(1)}px ${this.fontFamily}`,
      align: o.align ?? 'center',
      rot: o.rot ?? 0,
    });
  }

  /** A single dot, where the position matters. */
  dot(x: number, y: number, r: number, a = 1) {
    this.push(circlePoly(x, y, r * this.scale, 8), true, true, a, 0, true);
  }
}

// --- rendering -------------------------------------------------------------

export interface Palette {
  ink: string;
  paper: string;
}

/** Lays marks `[from, to)` onto a context. The only place marks become pixels. */
export function renderMarks(
  ctx: CanvasRenderingContext2D,
  marks: readonly Mark[],
  palette: Palette,
  from: number,
  to: number,
  /** Multiplies every mark's alpha — for fading live pen-work in. */
  fade = 1,
) {
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  for (let i = from; i < to; i += 1) {
    const m = marks[i];
    const pts = m.pts;
    ctx.globalAlpha = m.alpha * fade;
    if (m.text) {
      ctx.save();
      ctx.fillStyle = palette.ink;
      ctx.font = m.font ?? '12px serif';
      ctx.textAlign = m.align ?? 'center';
      ctx.textBaseline = 'alphabetic';
      ctx.translate(pts[0], pts[1]);
      if (m.rot) ctx.rotate(m.rot);
      ctx.fillText(m.text, 0, 0);
      ctx.restore();
      continue;
    }
    ctx.beginPath();
    ctx.moveTo(pts[0], pts[1]);
    for (let j = 2; j < pts.length; j += 2) ctx.lineTo(pts[j], pts[j + 1]);
    if (m.closed) ctx.closePath();
    if (m.fill) {
      ctx.fillStyle = m.ink ? palette.ink : palette.paper;
      ctx.fill();
    } else {
      ctx.strokeStyle = m.ink ? palette.ink : palette.paper;
      ctx.lineWidth = m.width;
      ctx.stroke();
    }
  }
  ctx.globalAlpha = 1;
}

/** Rough cost of a mark, so the sketch-in paces by ink laid rather than count. */
export function markWeight(m: Mark): number {
  if (m.text) return 4 + m.text.length * 1.5;
  return m.fill ? 6 + m.pts.length * 0.15 : 2 + m.pts.length * 0.25;
}
