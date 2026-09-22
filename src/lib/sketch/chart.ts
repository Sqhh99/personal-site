/**
 * Chart furniture — what makes the landing page read as a hand-drawn map of
 * the edge of somewhere: the neatline and its graduated border, a compass
 * rose, the sea-serpent that lives where the map runs out, a paper plane and
 * a few loose rocks.
 *
 * All of it goes through the same `Pen` as the astronaut, so it is one hand.
 * The still pieces are baked with the rest of the scene; the living ones
 * (needle, serpent, plane, rocks) are rebuilt each frame from a seed that only
 * changes a few times a second, so they move and their lines "boil" the way
 * hand-drawn animation does, without crawling.
 */

import { Pen, catmull, circlePoly, ellipsePoly, type Pt } from './pen';

export interface Frame {
  /** Outer rule, px from the edge of the page. */
  outer: number;
  /** Inner rule; the graduated band sits between the two. */
  inner: number;
}

export function frameInsets(s: number): Frame {
  const outer = Math.round(Math.min(18, Math.max(10, s * 0.018)));
  const band = Math.round(Math.min(8, Math.max(5, s * 0.0085)));
  return { outer, inner: outer + band };
}

/** Where the border's cells fall, so the scene can letter the degrees. */
export interface Graduation {
  xs: number[];
  ys: number[];
}

/**
 * Two ruled lines round the page with a band of alternate inked cells between,
 * as on an old chart. Each side is its own stroke, so the corners cross the
 * way drafted lines do.
 */
export function drawNeatline(pen: Pen, w: number, h: number, f: Frame, nib: number): Graduation {
  const { outer, inner } = f;
  const rule = (a: Pt, b: Pt, wd: number, al: number) =>
    pen.line(a, b, { w: wd, a: al, passes: 1, wobble: 0.001, bow: 0.0006, overshoot: 5 });
  for (const [ins, wd, al] of [
    [outer, nib * 1.35, 0.95],
    [inner, nib * 0.8, 0.8],
  ] as const) {
    rule([ins, ins], [w - ins, ins], wd, al);
    rule([w - ins, ins], [w - ins, h - ins], wd, al);
    rule([w - ins, h - ins], [ins, h - ins], wd, al);
    rule([ins, h - ins], [ins, ins], wd, al);
  }

  const rng = pen.rng;
  const j = () => rng.range(-0.45, 0.45);
  const cell = (x0: number, y0: number, x1: number, y1: number) =>
    pen.shape(
      [
        [x0 + j(), y0 + j()],
        [x1 + j(), y0 + j()],
        [x1 + j(), y1 + j()],
        [x0 + j(), y1 + j()],
      ],
      { fill: 'ink', fillAlpha: 0.7, outline: false },
    );

  const seg = Math.max(30, Math.min(w, h) * 0.058);
  const nx = Math.max(2, Math.floor((w - inner * 2) / seg));
  const ny = Math.max(2, Math.floor((h - inner * 2) / seg));
  const sx = (w - inner * 2) / nx;
  const sy = (h - inner * 2) / ny;
  const xs: number[] = [];
  const ys: number[] = [];
  for (let i = 0; i <= nx; i += 1) xs.push(inner + i * sx);
  for (let i = 0; i <= ny; i += 1) ys.push(inner + i * sy);
  for (let i = 0; i < nx; i += 1) {
    if (i % 2 === 0) cell(xs[i], outer, xs[i + 1], inner);
    // The bottom runs out of step with the top, as a real border would.
    if (i % 2 === 1) cell(xs[i], h - inner, xs[i + 1], h - outer);
  }
  for (let i = 0; i < ny; i += 1) {
    if (i % 2 === 1) cell(outer, ys[i], inner, ys[i + 1]);
    if (i % 2 === 0) cell(w - inner, ys[i], w - outer, ys[i + 1]);
  }
  // Short ticks off the inner rule at every cell boundary.
  const tick = nib * 3.2;
  for (const x of xs.slice(1, -1)) {
    pen.line([x, inner], [x, inner + tick], { w: nib * 0.6, a: 0.55, passes: 1, overshoot: 0, wobble: 0 });
    pen.line([x, h - inner], [x, h - inner - tick], { w: nib * 0.6, a: 0.55, passes: 1, overshoot: 0, wobble: 0 });
  }
  for (const y of ys.slice(1, -1)) {
    pen.line([inner, y], [inner + tick, y], { w: nib * 0.6, a: 0.55, passes: 1, overshoot: 0, wobble: 0 });
    pen.line([w - inner, y], [w - inner - tick, y], { w: nib * 0.6, a: 0.55, passes: 1, overshoot: 0, wobble: 0 });
  }
  return { xs, ys };
}

// --- compass ---------------------------------------------------------------

/** The still part of the compass: rings, a degree scale, the short points. */
export function drawCompass(pen: Pen, cx: number, cy: number, r: number, nib: number) {
  pen.stroke(circlePoly(cx, cy, r, 64), { closed: true, w: nib * 1.2, passes: 2, wobble: 0.003 });
  pen.stroke(circlePoly(cx, cy, r * 0.84, 60), { closed: true, w: nib * 0.7, a: 0.65, passes: 1, wobble: 0.003 });
  for (let i = 0; i < 48; i += 1) {
    const a = (i / 48) * Math.PI * 2;
    const major = i % 6 === 0;
    const r0 = major ? r * 0.84 : r * 0.92;
    pen.line([cx + Math.cos(a) * r0, cy + Math.sin(a) * r0], [cx + Math.cos(a) * r, cy + Math.sin(a) * r], {
      w: nib * (major ? 0.9 : 0.55),
      a: major ? 0.85 : 0.5,
      passes: 1,
      overshoot: 0,
      wobble: 0,
    });
  }
  // The four short points of the rose; the long ones are the live needle.
  for (let k = 0; k < 4; k += 1) {
    const ang = -Math.PI / 4 + (k * Math.PI) / 2;
    const d: Pt = [Math.cos(ang), Math.sin(ang)];
    const p: Pt = [-d[1], d[0]];
    const half = r * 0.085;
    const tip: Pt = [cx + d[0] * r * 0.5, cy + d[1] * r * 0.5];
    const l: Pt = [cx + p[0] * half, cy + p[1] * half];
    const rr: Pt = [cx - p[0] * half, cy - p[1] * half];
    pen.shape([[cx, cy], l, tip, rr], { fill: 'paper', w: nib * 0.8, a: 0.8, wobble: 0.004 });
    pen.hatch([[cx, cy], l, tip], { angle: ang + 1.3, gap: nib * 1.8, w: nib * 0.45, a: 0.5, overshoot: 0, skip: 0.05 });
  }
}

/** The needle, drawn every frame at whatever angle it has swung to. */
export function drawNeedle(pen: Pen, cx: number, cy: number, r: number, ang: number, nib: number) {
  const d: Pt = [Math.cos(ang), Math.sin(ang)];
  const p: Pt = [-d[1], d[0]];
  const half = r * 0.13;
  const n: Pt = [cx + d[0] * r * 0.76, cy + d[1] * r * 0.76];
  const s: Pt = [cx - d[0] * r * 0.6, cy - d[1] * r * 0.6];
  const l: Pt = [cx + p[0] * half, cy + p[1] * half];
  const rr: Pt = [cx - p[0] * half, cy - p[1] * half];
  pen.shape([n, l, s, rr], { fill: 'paper', w: nib * 1.1, wobble: 0.004 });
  pen.shape([n, l, rr], { fill: 'ink', fillAlpha: 0.88, outline: false });
  pen.hatch([s, l, rr], { angle: ang + 1.1, gap: nib * 1.9, w: nib * 0.45, a: 0.5, overshoot: 0, skip: 0.05 });
  pen.shape(circlePoly(cx, cy, r * 0.07, 12), { fill: 'paper', w: nib * 0.9, wobble: 0.01 });
}

// --- the edge of the map -----------------------------------------------------

/** Rows of little arcs, the way an old chart draws the sea. */
export function drawWaves(pen: Pen, x0: number, x1: number, y: number, nib: number) {
  const step = nib * 15;
  for (let row = 0; row < 3; row += 1) {
    const yy = y + nib * 4 + row * nib * 6.5;
    const inset = row * step * 0.7;
    for (let x = x0 + inset + (row % 2) * step * 0.5; x + step < x1 - inset; x += step * 1.3) {
      pen.stroke(
        catmull(
          [
            [x, yy],
            [x + step * 0.5, yy - nib * 2.6],
            [x + step, yy],
          ],
          6,
        ),
        { w: nib * 0.7, a: 0.6 - row * 0.12, passes: 1, wobble: 0.02, overshoot: 0 },
      );
    }
  }
}

/** A body of varying thickness along a spine: paper inside, a pen line each side. */
function tube(pen: Pen, spine: Pt[], r0: number, r1: number, nib: number, shade = 0.35) {
  const n = spine.length;
  const side = (sgn: number) =>
    spine.map(([x, y], i): Pt => {
      const a = spine[Math.max(0, i - 1)];
      const b = spine[Math.min(n - 1, i + 1)];
      const dx = b[0] - a[0];
      const dy = b[1] - a[1];
      const m = Math.hypot(dx, dy) || 1;
      const r = r0 + ((r1 - r0) * i) / (n - 1);
      return [x - (dy / m) * r * sgn, y + (dx / m) * r * sgn];
    });
  const a = side(1);
  const b = side(-1);
  const poly = [...a, ...b.slice().reverse()];
  pen.shape(poly, { fill: 'paper', outline: false });
  if (shade) pen.hatch(poly, { angle: 0.9, gap: nib * 2.2, w: nib * 0.5, a: shade, skip: 0.2, overshoot: 0 });
  pen.stroke(a, { w: nib * 1.1, passes: 1, wobble: 0.004, overshoot: 0 });
  pen.stroke(b, { w: nib * 1.1, passes: 1, wobble: 0.004, overshoot: 0 });
}

/**
 * Here be dragons: a serpent swimming along a waterline, head to the left.
 * `u` is its length; `t` is seconds, which moves the humps and the head.
 */
export function drawSerpent(pen: Pen, x: number, wl: number, u: number, t: number, nib: number) {
  // Tail first, so the humps overlap it.
  const wag = Math.sin(t * 1.5 - 3.4) * u * 0.012;
  const tail = catmull(
    [
      [x + u * 0.86, wl],
      [x + u * 0.9, wl - u * 0.06],
      [x + u * 0.955, wl - u * 0.085 + wag],
      [x + u * 0.985, wl - u * 0.06 + wag],
    ],
    6,
  );
  tube(pen, tail, u * 0.026, u * 0.008, nib);
  const tip = tail[tail.length - 1];
  const fluke: Pt[] = catmull(
    [
      [tip[0], tip[1]],
      [tip[0] + u * 0.025, tip[1] - u * 0.03],
      [tip[0] + u * 0.035, tip[1] + u * 0.004],
      [tip[0] + u * 0.012, tip[1] + u * 0.018],
    ],
    5,
    true,
  );
  pen.shape(fluke, { fill: 'paper', w: nib, wobble: 0.01 });

  // Three humps, a wave running down them from the head.
  const humps: Array<[number, number, number]> = [
    [0.33, 0.17, 0.14],
    [0.54, 0.155, 0.115],
    [0.73, 0.13, 0.085],
  ];
  humps.forEach(([at, wd, ht], i) => {
    const cx = x + u * at + Math.sin(t * 0.7 + i) * u * 0.006;
    const w = u * wd;
    const hgt = u * ht * (0.78 + 0.22 * Math.sin(t * 1.5 - i * 1.1));
    const th = u * 0.042 * (1 - i * 0.14);
    const outer: Pt[] = [];
    const inner: Pt[] = [];
    for (let k = 0; k <= 18; k += 1) {
      const a = Math.PI * (1 - k / 18);
      outer.push([cx + Math.cos(a) * w * 0.5, wl - Math.sin(a) * hgt]);
      inner.push([cx + Math.cos(a) * (w * 0.5 - th), wl - Math.sin(a) * Math.max(hgt - th, hgt * 0.35)]);
    }
    const poly = [...outer, ...inner.slice().reverse()];
    pen.shape(poly, { fill: 'paper', outline: false });
    pen.hatch(poly, { angle: 0.85, gap: nib * 2.2, w: nib * 0.5, a: 0.4, skip: 0.2, overshoot: 0 });
    pen.stroke(outer, { w: nib * 1.15, passes: 1, wobble: 0.004, overshoot: 0 });
    pen.stroke(inner, { w: nib * 0.9, a: 0.85, passes: 1, wobble: 0.004, overshoot: 0 });
    // Spines along the back.
    for (const k of [0.3, 0.45, 0.6, 0.75]) {
      const a = Math.PI * (1 - k);
      const px = cx + Math.cos(a) * w * 0.5;
      const py = wl - Math.sin(a) * hgt;
      pen.line([px, py], [px + Math.cos(a) * nib * 2 + nib * 1.6, py - nib * 4.8], {
        w: nib * 0.8,
        a: 0.8,
        passes: 1,
        overshoot: 0,
      });
    }
  });

  // Neck and head, rising out of the water nearest the astronaut.
  const bob = Math.sin(t * 1.5 + 0.6) * u * 0.016;
  const neck = catmull(
    [
      [x + u * 0.2, wl],
      [x + u * 0.175, wl - u * 0.1],
      [x + u * 0.115, wl - u * 0.18 + bob * 0.6],
      [x + u * 0.095, wl - u * 0.245 + bob],
    ],
    8,
  );
  tube(pen, neck, u * 0.042, u * 0.028, nib);
  const hx = x + u * 0.07;
  const hy = wl - u * 0.272 + bob;
  const k = u;
  const head = catmull(
    [
      [hx - k * 0.078, hy + k * 0.012],
      [hx - k * 0.05, hy - k * 0.016],
      [hx - k * 0.004, hy - k * 0.036],
      [hx + k * 0.036, hy - k * 0.022],
      [hx + k * 0.044, hy + k * 0.014],
      [hx - k * 0.008, hy + k * 0.03],
      [hx - k * 0.058, hy + k * 0.027],
    ],
    6,
    true,
  );
  pen.shape(head, { fill: 'paper', w: nib * 1.15, wobble: 0.004 });
  pen.curve(
    [
      [hx - k * 0.072, hy + k * 0.016],
      [hx - k * 0.04, hy + k * 0.012],
      [hx - k * 0.012, hy + k * 0.016],
    ],
    { w: nib * 0.75, a: 0.8, passes: 1, overshoot: 0 },
  );
  pen.stroke(circlePoly(hx - k * 0.012, hy - k * 0.012, k * 0.009, 10), { closed: true, w: nib * 0.8, passes: 1, wobble: 0.02 });
  pen.dot(hx - k * 0.01, hy - k * 0.011, nib * 0.9, 0.95);
  pen.dot(hx - k * 0.066, hy + k * 0.002, nib * 0.5, 0.8);
  // Swept-back horns.
  pen.curve(
    [
      [hx + k * 0.018, hy - k * 0.03],
      [hx + k * 0.05, hy - k * 0.058],
      [hx + k * 0.078, hy - k * 0.066],
    ],
    { w: nib * 0.9, passes: 1, overshoot: 0 },
  );
  pen.curve(
    [
      [hx + k * 0.034, hy - k * 0.012],
      [hx + k * 0.064, hy - k * 0.03],
      [hx + k * 0.09, hy - k * 0.032],
    ],
    { w: nib * 0.8, a: 0.8, passes: 1, overshoot: 0 },
  );
}

// --- things in the air -------------------------------------------------------

/** A folded paper plane, side on. `flip` keeps it the right way up heading left. */
export function drawPlane(pen: Pen, x: number, y: number, ang: number, flip: boolean, s: number, nib: number) {
  const c = Math.cos(ang);
  const sn = Math.sin(ang);
  const f = flip ? -1 : 1;
  const T = (px: number, py: number): Pt => [x + px * c - py * f * sn, y + px * sn + py * f * c];
  const nose = T(s, 0);
  const top = T(-s * 0.85, -s * 0.44);
  const fold = T(-s * 0.55, s * 0.02);
  const keel = T(-s * 0.72, s * 0.22);
  pen.shape([nose, fold, keel], { fill: 'paper', w: nib * 0.9, wobble: 0.004 });
  pen.hatch([nose, fold, keel], { angle: ang + 1.1, gap: nib * 1.7, w: nib * 0.45, a: 0.55, overshoot: 0, skip: 0.1 });
  pen.shape([nose, top, fold], { fill: 'paper', w: nib * 0.95, wobble: 0.004 });
  pen.line(nose, T(-s * 0.66, -s * 0.12), { w: nib * 0.6, a: 0.6, passes: 1, overshoot: 0 });
}

/** A loose rock, centred on the origin so it can be spun as a sprite. */
export function drawRock(pen: Pen, r: number, nib: number) {
  const rng = pen.rng;
  const n = 7;
  const anchors: Pt[] = [];
  for (let i = 0; i < n; i += 1) {
    const a = (i / n) * Math.PI * 2 + rng.range(-0.2, 0.2);
    const rr = r * rng.range(0.74, 1.04);
    anchors.push([Math.cos(a) * rr, Math.sin(a) * rr * 0.86]);
  }
  const poly = catmull(anchors, 6, true);
  pen.shape(poly, { fill: 'paper', w: nib * 1.05, wobble: 0.006 });
  // Shade the side away from the light with a second contour and hatching.
  const core = poly.filter(([px, py]) => px + py > r * 0.1).map(([px, py]): Pt => [px * 0.8, py * 0.8]);
  if (core.length > 3) pen.stroke(core, { w: nib * 0.6, a: 0.55, passes: 1, overshoot: 0, wobble: 0.01 });
  pen.hatch(poly, { angle: -0.7, gap: nib * 2, w: nib * 0.45, a: 0.3, skip: 0.35, overshoot: 0 });
  // One crater, off-centre, and grit — two craters side by side read as a face.
  const cr = r * rng.range(0.2, 0.28);
  const cx = r * rng.range(-0.3, 0.1);
  const cy = r * rng.range(-0.25, 0.15);
  pen.stroke(ellipsePoly(cx, cy, cr, cr * 0.62, 0.3, 12), { closed: true, w: nib * 0.7, a: 0.75, passes: 1, wobble: 0.02 });
  pen.dots(ellipsePoly(r * 0.2, r * 0.25, r * 0.4, r * 0.3, 0.4, 10), 6, nib * 0.45, 0.6);
}
