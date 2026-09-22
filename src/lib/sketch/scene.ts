/**
 * The landing sketch: a hand-drawn chart of the edge of the map. A small
 * planet, an astronaut who has just planted a flag on it, a compass, a dashed
 * route in from a ringed world, and — where the chart runs out — a
 * sea-serpent. Pen on paper, drawn live.
 *
 * The scene is built once into a flat list of marks (see `pen.ts`) and then
 * sketched in, mark by mark, as if a hand were drawing it. When the last mark
 * lands, sky and ground are baked into one bitmap and the figure into three
 * small ones, redrawn from different seeds so the idle loop can cycle them:
 * the "boil" of hand-drawn animation, where every line is traced again each
 * few frames and so is never quite still.
 *
 * Over that sits the live layer, rebuilt every frame and never baked: the
 * flag, the compass needle (which swings to find the cursor), the serpent,
 * a paper plane, tumbling rocks, the odd shooting star, twinkling, a
 * constellation drawn to whatever the cursor is near, and a new star wherever
 * you tap.
 */

import { drawAstronaut, drawFlag, drawPennant, star } from './astronaut';
import {
  drawCompass,
  drawNeatline,
  drawNeedle,
  drawPlane,
  drawRock,
  drawSerpent,
  drawWaves,
  frameInsets,
  type Frame,
} from './chart';
import { Pen, Rng, catmull, circlePoly, ellipsePoly, markWeight, renderMarks, type Mark, type Palette, type Pt } from './pen';

export interface SketchSceneHandle {
  destroy: () => void;
}

/** A star's place in the sky, kept so the cursor can find its neighbours. */
export interface SkyStar {
  x: number;
  y: number;
  r: number;
}

export interface Box {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

/** Where the living things go. Anything that did not fit is null or empty. */
export interface Live {
  compass: { x: number; y: number; r: number } | null;
  serpent: { x: number; wl: number; u: number } | null;
  plane: { cx: number; cy: number; rx: number; ry: number; s: number } | null;
  rocks: { x: number; y: number; r: number; seed: number }[];
  /** Where shooting stars may start, and how far they run. */
  meteor: (Box & { len: number }) | null;
}

export interface Scene {
  marks: Mark[];
  /** Sky stars only — the ones the live pen is allowed to play with. */
  stars: SkyStar[];
  /** Marks before this index include the flagpole, so the pennant can fly. */
  flagAt: number;
  live: Live;
  scale: number;
}

export interface SketchNotes {
  here?: string;
  dragons?: string;
}

export interface BuildOpts {
  font?: string;
  notes?: SketchNotes;
  measure?: (text: string, font: string) => number;
  /** Page furniture the drawing has to keep clear of, in canvas px. */
  avoid?: Box[];
}

interface Layout {
  width: number;
  height: number;
  /** Planet centre and radius in px; the astronaut stands on its crown. */
  planet: { x: number; y: number; r: number };
  figure: { x: number; y: number; h: number };
  /** Where the tagline sits. Nothing is drawn inside it. */
  copy: Box;
  frame: Frame;
  portrait: boolean;
  detail: number;
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

export const scaleFor = (w: number, h: number) => clamp(Math.min(w, h) / 760, 0.7, 1.25);

export function layout(width: number, height: number, detail: number, copy?: Box): Layout {
  const s = Math.min(width, height);
  const portrait = width / height < 0.85;
  const h = height * (portrait ? 0.3 : 0.42);
  const box: Box =
    copy ??
    (portrait
      ? { x0: 0, y0: 0, x1: width, y1: height * 0.46 }
      : { x0: 0, y0: height * 0.2, x1: Math.min(width * 0.54, 620), y1: height * 0.8 });
  // Portrait stacks the drawing under the tagline; landscape sets it right of
  // centre so the tagline has the left of the paper to itself. On a short
  // landscape window the two would meet, so the figure is held off the text.
  let fx = portrait ? width * 0.52 : width * 0.64;
  if (!portrait) fx = Math.max(fx, width * 0.58 + h * 0.25, box.x1 + h * 0.42);
  // …and off the right edge, since the flag reaches further than the figure.
  fx = Math.min(fx, width - h * 0.46 - 12);
  const r = s * (portrait ? 0.78 : 0.62);
  const rise = portrait ? s * 0.2 : s * 0.24;
  const y = height + r - rise;
  return {
    width,
    height,
    planet: { x: fx, y, r },
    figure: { x: fx, y: y - r, h },
    copy: box,
    frame: frameInsets(s),
    portrait,
    detail,
  };
}

/** Everything in the picture, in drawing order — which is also reveal order. */
export function build(l: Layout, seed: number, o: BuildOpts = {}): Scene {
  const pen = new Pen(new Rng(seed));
  const rng = pen.rng;
  const { width, height, planet, figure, detail, frame } = l;
  const s = Math.min(width, height);
  pen.scale = scaleFor(width, height);
  pen.fontFamily = o.font ?? 'serif';
  const nib = figure.h * 0.0042;
  const stars: SkyStar[] = [];
  const live: Live = { compass: null, serpent: null, plane: null, rocks: [], meteor: null };
  const measure =
    o.measure ?? ((text: string, font: string) => text.length * parseFloat(/([\d.]+)px/.exec(font)?.[1] ?? '12') * 0.5);
  const fontAt = (size: number) => `italic 400 ${(size * pen.scale).toFixed(1)}px ${pen.fontFamily}`;

  // --- keep-out -------------------------------------------------------------
  const blocked: Box[] = [
    // The wordmark and the menu button float over the top corners.
    { x0: 0, y0: 0, x1: 190, y1: 80 },
    { x0: width - 160, y0: 0, x1: width, y1: 80 },
    ...(o.avoid ?? []),
  ];
  const fig: Box = {
    x0: figure.x - figure.h * 0.32,
    y0: figure.y - figure.h * 1.22,
    x1: figure.x + figure.h * 0.47,
    y1: figure.y + figure.h * 0.04,
  };
  const edge = frame.inner + 6;
  const hits = (a: Box, b: Box) => a.x0 < b.x1 && a.x1 > b.x0 && a.y0 < b.y1 && a.y1 > b.y0;
  const onPlanet = (b: Box, k = 1.01) => {
    const nx = clamp(planet.x, b.x0, b.x1);
    const ny = clamp(planet.y, b.y0, b.y1);
    return Math.hypot(nx - planet.x, ny - planet.y) < planet.r * k;
  };
  const inside = (b: Box) => b.x0 >= edge && b.y0 >= edge && b.x1 <= width - edge && b.y1 <= height - edge;
  const free = (b: Box, withFigure = true) =>
    inside(b) && !hits(b, l.copy) && !(withFigure && hits(b, fig)) && !onPlanet(b) && !blocked.some((q) => hits(b, q));
  const around = (x: number, y: number, r: number): Box => ({ x0: x - r, y0: y - r, x1: x + r, y1: y + r });

  // 0. The chart's border, first: the page is a map before it is a picture.
  let grad = { xs: [] as number[], ys: [] as number[] };
  pen.on(0, () => {
    grad = drawNeatline(pen, width, height, frame, Math.max(0.95, nib));
  });

  // 1. The ground the figure is standing on, so the subject has a footing.
  pen.on(1, () => {
    const dome = circlePoly(planet.x, planet.y, planet.r, 128);
    pen.shape(dome, { fill: 'paper', outline: false });
    // Only the crown is on screen, so the contour is drawn as an arc.
    const crown: Pt[] = [];
    const span = Math.acos(Math.max(-1, Math.min(1, (height + planet.r * 0.06 - planet.y) / -planet.r)));
    for (let i = 0; i <= 96; i += 1) {
      const a = -Math.PI / 2 - span + (i / 96) * span * 2;
      crown.push([planet.x + Math.cos(a) * planet.r, planet.y + Math.sin(a) * planet.r]);
    }
    pen.stroke(crown, { w: nib * 1.6, passes: 2, wobble: 0.0015, overshoot: 0 });

    // Craters: a rim, a shaded inner wall, a scatter of grit.
    const craters = Math.round(7 * detail);
    for (let i = 0; i < craters; i += 1) {
      const a = -Math.PI / 2 + rng.range(-1.15, 1.15);
      const d = planet.r * rng.range(0.94, 1.0);
      const x = planet.x + Math.cos(a) * d;
      const y = planet.y + Math.sin(a) * d + planet.r * 0.035;
      if (Math.abs(x - figure.x) < figure.h * 0.36 && y < figure.y + figure.h * 0.1) continue;
      const cr = figure.h * rng.range(0.05, 0.14);
      const cup = ellipsePoly(x, y, cr, cr * 0.36, 0, 28);
      pen.shape(cup, { fill: 'paper', w: nib * 0.9, wobble: 0.01 });
      pen.hatch(ellipsePoly(x + cr * 0.12, y + cr * 0.05, cr * 0.8, cr * 0.26, 0, 24), {
        angle: -0.5,
        gap: nib * 2.1,
        w: nib * 0.55,
        a: 0.4,
        skip: 0.25,
      });
      pen.dots(ellipsePoly(x, y, cr * 1.5, cr * 0.6, 0, 20), Math.round(12 * detail), nib * 0.5, 0.35);
    }
    // The planet turning away: hatching that thickens toward the limb.
    for (const side of [-1, 1] as const) {
      const band: Pt[] = [];
      const a0 = -Math.PI / 2 + side * 0.55;
      const a1 = -Math.PI / 2 + side * 1.28;
      for (let i = 0; i <= 24; i += 1) {
        const a = a0 + ((a1 - a0) * i) / 24;
        band.push([planet.x + Math.cos(a) * planet.r * 0.995, planet.y + Math.sin(a) * planet.r * 0.995]);
      }
      for (let i = 24; i >= 0; i -= 1) {
        const a = a0 + ((a1 - a0) * i) / 24;
        band.push([planet.x + Math.cos(a) * planet.r * 0.9, planet.y + Math.sin(a) * planet.r * 0.9]);
      }
      pen.hatch(band, { angle: side > 0 ? -0.9 : 0.9, gap: nib * 2.3, w: nib * 0.6, a: 0.45, skip: 0.15 });
    }
    // A scatter of loose rocks on the crown.
    for (let i = 0; i < Math.round(9 * detail); i += 1) {
      const a = -Math.PI / 2 + rng.range(-1.3, 1.3);
      const x = planet.x + Math.cos(a) * planet.r;
      const y = planet.y + Math.sin(a) * planet.r + planet.r * 0.01;
      if (Math.abs(x - figure.x) < figure.h * 0.3) continue;
      const rr = figure.h * rng.range(0.012, 0.03);
      const rock = catmull(
        [
          [x - rr, y + rr * 0.06],
          [x - rr * 0.6, y - rr * 0.72],
          [x + rr * 0.45, y - rr * 0.88],
          [x + rr, y + rr * 0.04],
          [x, y + rr * 0.2],
        ] as Pt[],
        7,
        true,
      );
      pen.shape(rock, { fill: 'paper', w: nib * 0.8, wobble: 0.008 });
      pen.hatch(rock, { angle: -0.6, gap: nib * 1.9, w: nib * 0.5, a: 0.4, skip: 0.2 });
    }
  });

  // 2. The subject.
  let flagAt = 0;
  pen.on(2, () => {
    drawFlag(pen, figure.x, figure.y, figure.h, false);
    flagAt = pen.marks.length;
    drawAstronaut(pen, figure.x, figure.y, figure.h, { detail });
  });

  // 3. The chart around them, then the sky.
  pen.on(0, () => {
    // A ringed world, small and far — where the route sets out from.
    const rw = l.portrait
      ? { x: width * 0.2, y: height * 0.54, r: s * 0.055 }
      : { x: width * 0.13, y: height * 0.17, r: s * 0.055 };
    const ball = circlePoly(rw.x, rw.y, rw.r, 40);
    pen.shape(ball, { fill: 'paper', w: nib * 1.1, wobble: 0.005 });
    pen.hatch(
      catmull(
        [
          [rw.x + rw.r * 0.2, rw.y - rw.r * 0.95],
          [rw.x + rw.r, rw.y],
          [rw.x + rw.r * 0.2, rw.y + rw.r * 0.95],
          [rw.x + rw.r * 0.1, rw.y + rw.r * 0.7],
          [rw.x + rw.r * 0.68, rw.y],
          [rw.x + rw.r * 0.1, rw.y - rw.r * 0.7],
        ] as Pt[],
        8,
        true,
      ),
      { angle: -0.6, gap: nib * 2, w: nib * 0.6, a: 0.5, skip: 0.1 },
    );
    pen.stroke(ellipsePoly(rw.x, rw.y, rw.r * 1.75, rw.r * 0.42, -0.34, 44), { w: nib * 0.9, a: 0.75, passes: 1, closed: true, wobble: 0.004 });
    pen.stroke(ellipsePoly(rw.x, rw.y, rw.r * 1.45, rw.r * 0.33, -0.34, 40), { w: nib * 0.7, a: 0.5, passes: 1, closed: true, wobble: 0.004 });
    const rwBox: Box = { x0: rw.x - rw.r * 1.9, y0: rw.y - rw.r * 1.2, x1: rw.x + rw.r * 1.9, y1: rw.y + rw.r * 1.2 };
    blocked.push(rwBox);

    // The compass. Only its rings and short points are drawn here; the long
    // needle is live, and swings round to find the cursor.
    const cr = clamp(s * 0.062, 26, 62);
    const cands: Pt[] = l.portrait
      ? [
          [edge + cr + width * 0.04, height * 0.68],
          [width - edge - cr - width * 0.04, height * 0.62],
          [edge + cr + width * 0.04, height * 0.6],
        ]
      : [
          [width * 0.34, height - edge - cr - height * 0.05],
          [width * 0.42, height - edge - cr - height * 0.04],
          [l.copy.x1 + cr + 24, height - edge - cr - height * 0.05],
          [width * 0.3, height - edge - cr - height * 0.03],
        ];
    for (const [x, y] of cands) {
      const b: Box = { x0: x - cr - 6, y0: y - cr - 24, x1: x + cr + 6, y1: y + cr + 6 };
      if (!free(b)) continue;
      drawCompass(pen, x, y, cr, Math.max(0.9, nib));
      pen.text('N', x, y - cr - 7, { size: 12.5, a: 0.85, italic: false });
      live.compass = { x, y, r: cr };
      blocked.push(b);
      break;
    }

    // Here be dragons: where the chart runs out on the far side. A smaller
    // serpent is tried before giving up on a tight page.
    const dragons = o.notes?.dragons;
    const waves = nib * 20;
    serpent: for (const k of [1, 0.72]) {
      const u = Math.min(width * 0.21, figure.h * (l.portrait ? 0.7 : 0.85), 320) * k;
      const at: Array<[number, number]> = l.portrait
        ? [
            [width - edge - u - 6, height * 0.58],
            [width - edge - u - 6, height * 0.64],
          ]
        : [
            [width - edge - u - width * 0.02, height * 0.58],
            [width - edge - u - width * 0.02, height * 0.5],
            [width - edge - u - width * 0.02, height * 0.66],
          ];
      for (const [x, wl] of at) {
        const b: Box = { x0: x - 4, y0: wl - u * 0.36 - (dragons ? 22 * pen.scale : 0), x1: x + u + 10, y1: wl + waves };
        if (!free(b)) continue;
        drawWaves(pen, x + u * 0.02, x + u * 1.02, wl, Math.max(0.9, nib));
        if (dragons) pen.text(dragons, x + u * 0.6, wl - u * 0.21, { size: 13.5 * Math.max(0.85, k), a: 0.82, rot: -0.04 });
        live.serpent = { x, wl, u };
        blocked.push(b);
        break serpent;
      }
    }

    // "You are here", with an arrow — tried in a few places round the figure.
    const here = o.notes?.here;
    if (here) {
      const size = 14;
      const tw = measure(here, fontAt(size));
      const fx = figure.x;
      const fy = figure.y;
      const fh = figure.h;
      const tries = [
        { x1: fx - fh * 0.3, y: fy - fh * 1.12, to: [fx - fh * 0.125, fy - fh * 0.96] as Pt, above: false },
        { x1: fx - fh * 0.36, y: fy - fh * 0.78, to: [fx - fh * 0.27, fy - fh * 0.68] as Pt, above: false },
        { x1: fx - fh * 0.02 + tw / 2, y: fy - fh * 1.36, to: [fx - fh * 0.02, fy - fh * 1.05] as Pt, above: true },
      ];
      for (const t of tries) {
        const x0 = t.x1 - tw;
        const b: Box = { x0: x0 - 6, y0: t.y - size * pen.scale - 4, x1: t.x1 + 6, y1: t.y + 8 };
        if (!free(b, false)) continue;
        pen.text(here, t.above ? (x0 + t.x1) / 2 : t.x1, t.y, { size, a: 0.85, align: t.above ? 'center' : 'right', rot: -0.05 });
        const from: Pt = t.above ? [(x0 + t.x1) / 2, t.y + 6] : [t.x1 + 5, t.y - size * pen.scale * 0.35];
        const to = t.to;
        const dx = to[0] - from[0];
        const dy = to[1] - from[1];
        const m = Math.hypot(dx, dy) || 1;
        const bow = m * 0.22;
        const mid: Pt = [(from[0] + to[0]) / 2 + (dy / m) * bow, (from[1] + to[1]) / 2 - (dx / m) * bow];
        const path = catmull([from, mid, to], 10);
        pen.stroke(path, { w: nib * 0.9, a: 0.85, passes: 1, wobble: 0.01, overshoot: 0 });
        const q = path[path.length - 3];
        const ang = Math.atan2(to[1] - q[1], to[0] - q[0]);
        const head = 7 * pen.scale;
        for (const side of [-1, 1]) {
          pen.line(to, [to[0] - Math.cos(ang + side * 0.45) * head, to[1] - Math.sin(ang + side * 0.45) * head], {
            w: nib * 0.9,
            a: 0.85,
            passes: 1,
            overshoot: 0,
          });
        }
        blocked.push(b);
        break;
      }
    }

    // The route in, from the ringed world to the landing site, dashed.
    if (!l.portrait) {
      const a: Pt = [rw.x + rw.r * 1.95, rw.y - rw.r * 0.3];
      const b: Pt = [figure.x - figure.h * 0.02, Math.max(edge + 40, figure.y - figure.h * 1.3)];
      const mid: Pt = [(a[0] + b[0]) / 2, Math.max(edge + 24, Math.min(a[1], b[1]) - height * 0.1)];
      // Densely sampled: a dash has to span several points or it vanishes.
      const reach = Math.hypot(mid[0] - a[0], mid[1] - a[1]) + Math.hypot(b[0] - mid[0], b[1] - mid[1]);
      const path = catmull([a, mid, b], Math.ceil(reach / 3));
      const dash = 7 * pen.scale;
      let run: Pt[] = [];
      let acc = 0;
      let on = true;
      for (let i = 1; i < path.length; i += 1) {
        const d = Math.hypot(path[i][0] - path[i - 1][0], path[i][1] - path[i - 1][1]);
        acc += d;
        if (on) run.push(path[i]);
        if (acc >= dash) {
          acc = 0;
          if (on && run.length > 1) {
            const c = run[Math.floor(run.length / 2)];
            if (free(around(c[0], c[1], 3), false) && !hits(around(c[0], c[1], 3), rwBox)) {
              pen.stroke(run, { w: nib * 0.85, a: 0.6, passes: 1, wobble: 0.02, overshoot: 0 });
            }
          }
          run = [];
          on = !on;
        }
      }
      const q = path[path.length - 4];
      const ang = Math.atan2(b[1] - q[1], b[0] - q[0]);
      for (const side of [-1, 1]) {
        pen.line(b, [b[0] - Math.cos(ang + side * 0.5) * 8 * pen.scale, b[1] - Math.sin(ang + side * 0.5) * 8 * pen.scale], {
          w: nib * 0.85,
          a: 0.7,
          passes: 1,
          overshoot: 0,
        });
      }
    }

    // Degrees along the border, where there is room to letter them.
    const label = (text: string, x: number, y: number, align: CanvasTextAlign) => {
      const w = measure(text, fontAt(9.5));
      const x0 = align === 'left' ? x : align === 'right' ? x - w : x - w / 2;
      const b: Box = { x0: x0 - 3, y0: y - 11 * pen.scale, x1: x0 + w + 3, y1: y + 3 };
      if (hits(b, l.copy) || onPlanet(b, 1.02) || blocked.some((q) => hits(b, q))) return;
      pen.text(text, x, y, { size: 9.5, a: 0.55, align });
    };
    grad.xs.forEach((x, i) => {
      if (i === 0 || i === grad.xs.length - 1 || i % 2) return;
      label(`${140 + i * 5}°E`, x, frame.inner + 13 * pen.scale, 'center');
      label(`${140 + i * 5}°E`, x, height - frame.inner - 6 * pen.scale, 'center');
    });
    grad.ys.forEach((y, i) => {
      if (i === 0 || i === grad.ys.length - 1 || i % 2) return;
      const v = 60 - i * 5;
      const lat = v === 0 ? '0°' : `${Math.abs(v)}°${v < 0 ? 'S' : 'N'}`;
      label(lat, frame.inner + 6 * pen.scale, y + 3.5 * pen.scale, 'left');
      label(lat, width - frame.inner - 6 * pen.scale, y + 3.5 * pen.scale, 'right');
    });

    // Loose rocks, tumbling where there is space for them. Placed now, drawn live.
    const want = l.portrait ? 2 : 3;
    for (let tries = 0; tries < 60 && live.rocks.length < want; tries += 1) {
      const r = s * rng.range(0.014, 0.024);
      const x = rng.range(edge + r, width - edge - r);
      const y = rng.range(edge + r, height * 0.85);
      const b = around(x, y, r * 2.2);
      if (!free(b)) continue;
      live.rocks.push({ x, y, r, seed: Math.floor(rng.range(1, 1e6)) });
      blocked.push(b);
    }

    // A paper plane's beat, and where shooting stars may fall.
    if (!l.portrait) {
      const x0 = l.copy.x1 + 30;
      const x1 = width - edge - 40;
      const cy = edge + height * 0.12;
      const ry = height * 0.045;
      if (x1 - x0 > 160 && cy + ry + 30 < fig.y0) {
        live.plane = { cx: (x0 + x1) / 2, cy, rx: ((x1 - x0) / 2) * 0.82, ry, s: clamp(s * 0.022, 11, 20) };
      }
      const len = width * 0.16;
      if (width - edge - (l.copy.x1 + len) > 60) {
        live.meteor = { x0: l.copy.x1 + len, y0: edge + 16, x1: width - edge - 20, y1: height * 0.3, len };
      }
    } else {
      const gap = fig.y0 - l.copy.y1;
      if (gap > 60) {
        live.plane = { cx: width * 0.5, cy: l.copy.y1 + gap * 0.5, rx: width * 0.32, ry: gap * 0.18, s: clamp(s * 0.03, 10, 16) };
      }
    }

    // Stars. Big sparkles are placed; the dust is scattered — never over the
    // words, the figure, the planet, or anything placed above.
    const clear = (x: number, y: number) => free(around(x, y, 4));
    const sparkles: Pt[] = [
      [width * 0.4, height * 0.12],
      [width * 0.86, height * 0.18],
      [width * 0.28, height * 0.9],
      [width * 0.72, height * 0.34],
    ];
    for (const [x, y] of sparkles) {
      if (!clear(x, y)) continue;
      const r = s * rng.range(0.016, 0.026);
      star(pen, x, y, r, nib * 1.1);
      stars.push({ x, y, r });
    }
    // Portrait reserves the whole top of the page for the words, so it needs
    // more throws of the pen to end up with the same scatter of stars.
    const dust = Math.round((l.portrait ? 52 : 40) * detail);
    for (let i = 0; i < dust; i += 1) {
      const x = rng.range(width * 0.03, width * 0.97);
      const y = rng.range(height * 0.05, height * 0.82);
      if (!clear(x, y)) continue;
      if (rng.next() < 0.22) {
        const r = s * rng.range(0.006, 0.011);
        star(pen, x, y, r, nib * 0.8);
        stars.push({ x, y, r });
      } else {
        pen.dot(x, y, nib * rng.range(0.6, 1.2), rng.range(0.4, 0.85));
        stars.push({ x, y, r: nib * 1.8 });
      }
    }
  });

  return { marks: pen.marks, stars, flagAt, live, scale: pen.scale };
}

interface Sprite {
  c: HTMLCanvasElement;
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Renders marks into a canvas cropped to their bounds, for drawing as a sprite. */
function spriteOf(marks: Mark[], palette: Palette, dpr: number, pad = 6): Sprite {
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  for (const m of marks) {
    for (let i = 0; i < m.pts.length; i += 2) {
      x0 = Math.min(x0, m.pts[i]);
      x1 = Math.max(x1, m.pts[i]);
      y0 = Math.min(y0, m.pts[i + 1]);
      y1 = Math.max(y1, m.pts[i + 1]);
    }
  }
  x0 -= pad;
  y0 -= pad;
  const w = Math.max(1, x1 + pad - x0);
  const h = Math.max(1, y1 + pad - y0);
  const c = document.createElement('canvas');
  c.width = Math.ceil(w * dpr);
  c.height = Math.ceil(h * dpr);
  const sc = c.getContext('2d')!;
  sc.setTransform(dpr, 0, 0, dpr, -x0 * dpr, -y0 * dpr);
  renderMarks(sc, marks, palette, 0, marks.length);
  return { c, x: x0, y: y0, w, h };
}

/** A cheap, stable hash for per-event randomness in the live layer. */
const hash = (n: number) => {
  const x = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return x - Math.floor(x);
};

const SEED = 20260922;
/** Seconds each boil frame is held — about six drawings a second. */
const BOIL = 0.17;

export function initSketchScene(canvas: HTMLCanvasElement): SketchSceneHandle {
  const ctx = canvas.getContext('2d');
  if (!ctx) return { destroy: () => undefined };

  const css = getComputedStyle(document.documentElement);
  const palette: Palette = {
    ink: css.getPropertyValue('--ink').trim() || '#161513',
    paper: css.getPropertyValue('--bg').trim() || '#f1eee6',
  };
  const font = css.getPropertyValue('--font-display').trim() || 'serif';
  const notes: SketchNotes = { here: canvas.dataset.here, dragons: canvas.dataset.dragons };
  const hero = canvas.parentElement;
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  let width = 0;
  let height = 0;
  let dpr = 1;
  let lay: Layout | null = null;
  let scene: Scene | null = null;
  let marks: Mark[] = [];
  let stars: SkyStar[] = [];
  let twinklers: { s: SkyStar; phase: number; speed: number }[] = [];
  let weights: number[] = [];
  let totalWeight = 1;
  let drawn = 0;
  let drawnWeight = 0;
  let layerCanvas: HTMLCanvasElement[] = [];
  let layerCtx: CanvasRenderingContext2D[] = [];
  let baked: HTMLCanvasElement | null = null;
  let bakedAt = 0;
  let figures: Sprite[] = [];
  let rocks: Sprite[] = [];
  let revealStart = 0;
  let frame = 0;
  let lastIdle = 0;
  let visible = true;
  let paused = false;
  let destroyed = false;
  const REVEAL_MS = 2300;
  const start = performance.now();
  const pointer = { x: 0, y: 0 };
  const eased = { x: 0, y: 0 };
  /** The cursor in canvas pixels; `on` eases the live pen in and out. */
  const cursor = { x: 0, y: 0, in: false, on: 0 };
  /** Stars the visitor added by tapping the sky. */
  const added: { x: number; y: number; r: number; born: number }[] = [];
  const near: { s: SkyStar; d: number }[] = [];
  const needle = { a: -Math.PI / 2, v: 0 };

  const sizeLayer = (c: HTMLCanvasElement) => {
    c.width = canvas.width;
    c.height = canvas.height;
    const lc = c.getContext('2d')!;
    lc.setTransform(dpr, 0, 0, dpr, 0, 0);
    return lc;
  };

  /** A page element's box in canvas px, grown by `pad`. */
  const boxOf = (el: Element | null | undefined, pad: number): Box | undefined => {
    if (!el) return undefined;
    const r = el.getBoundingClientRect();
    const c = canvas.getBoundingClientRect();
    if (!r.width || !r.height) return undefined;
    return { x0: r.left - c.left - pad, y0: r.top - c.top - pad, x1: r.right - c.left + pad, y1: r.bottom - c.top + pad };
  };

  const measure = (text: string, f: string) => {
    ctx.save();
    ctx.font = f;
    const w = ctx.measureText(text).width;
    ctx.restore();
    return w;
  };

  const build_ = () => {
    const rect = canvas.getBoundingClientRect();
    width = Math.max(1, Math.round(rect.width));
    height = Math.max(1, Math.round(rect.height));
    dpr = Math.min(window.devicePixelRatio || 1, width < 720 ? 1.5 : 2);
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
    const conn = (navigator as Navigator & { connection?: { saveData?: boolean } }).connection;
    const detail = conn?.saveData ? 0.55 : width < 720 ? 0.75 : 1;
    const copy = boxOf(hero?.querySelector('.sketch-hero-copy'), 18);
    const cue = boxOf(hero?.querySelector('.sketch-hero-scroll'), 12);
    lay = layout(width, height, detail, copy);
    scene = build(lay, SEED, { font, notes, measure, avoid: cue ? [cue] : [] });
    marks = scene.marks;
    stars = scene.stars;
    // The brightest handful breathe, each on its own clock.
    twinklers = [...stars]
      .sort((a, b) => b.r - a.r)
      .slice(0, 8)
      .map((star_, i) => ({ s: star_, phase: i * 1.37, speed: 0.6 + (i % 4) * 0.17 }));
    added.length = 0;
    weights = marks.map(markWeight);
    totalWeight = weights.reduce((a, b) => a + b, 0) || 1;
    layerCanvas = [0, 1, 2].map(() => document.createElement('canvas'));
    layerCtx = layerCanvas.map(sizeLayer);
    drawn = 0;
    drawnWeight = 0;
    baked = null;
    figures = [];
    rocks = [];
    revealStart = performance.now();
  };

  /** Lay down marks until `weight` of ink is on the paper. */
  const inkTo = (weight: number) => {
    while (drawn < marks.length && drawnWeight < weight) {
      const m = marks[drawn];
      renderMarks(layerCtx[m.layer], marks, palette, drawn, drawn + 1);
      drawnWeight += weights[drawn];
      drawn += 1;
    }
  };

  /** Sky + ground collapse into one bitmap; the figure becomes three small
   *  ones, each traced again from its own seed, for the boil. */
  const bake = () => {
    if (!lay || !scene) return;
    const c = document.createElement('canvas');
    c.width = canvas.width;
    c.height = canvas.height;
    const bc = c.getContext('2d')!;
    bc.setTransform(dpr, 0, 0, dpr, 0, 0);
    bc.drawImage(layerCanvas[0], 0, 0, width, height);
    bc.drawImage(layerCanvas[1], 0, 0, width, height);
    baked = c;
    bakedAt = performance.now();
    const { figure, detail } = lay;
    figures = [0, 1, 2].map((k) => {
      const pen = new Pen(new Rng(SEED + 101 + k));
      pen.scale = scene!.scale;
      pen.on(2, () => {
        drawFlag(pen, figure.x, figure.y, figure.h, false);
        drawAstronaut(pen, figure.x, figure.y, figure.h, { detail });
      });
      return spriteOf(pen.marks, palette, dpr);
    });
    rocks = scene.live.rocks.map((r) => {
      const pen = new Pen(new Rng(r.seed));
      pen.scale = scene!.scale;
      drawRock(pen, r.r, figure.h * 0.0042);
      return spriteOf(pen.marks, palette, dpr, 4);
    });
    // The layers are done with; let the memory go.
    for (const lc of layerCanvas) {
      lc.width = 0;
      lc.height = 0;
    }
    // If the lettering went down in a fallback face, draw it again once the
    // real one arrives.
    const probe = `italic 400 14px ${font}`;
    if (document.fonts && !document.fonts.check(probe)) {
      document.fonts.load(probe).then(() => {
        if (!destroyed && document.fonts.check(probe)) redraw();
      });
    }
  };

  /** A straight line with a bow in it, so the live pen matches the drawn one. */
  const penLine = (ax: number, ay: number, bx: number, by: number, w: number, a: number, bow: number) => {
    const dx = bx - ax;
    const dy = by - ay;
    const len = Math.hypot(dx, dy) || 1;
    ctx.globalAlpha = a;
    ctx.lineWidth = w;
    ctx.beginPath();
    ctx.moveTo(ax, ay);
    ctx.quadraticCurveTo((ax + bx) / 2 - (dy / len) * bow, (ay + by) / 2 + (dx / len) * bow, bx, by);
    ctx.stroke();
  };

  /** The same four-point star the pen draws, but live. */
  const sparkle = (x: number, y: number, r: number, w: number, a: number) => {
    const k = r * 0.16;
    ctx.globalAlpha = a;
    ctx.lineWidth = w;
    ctx.beginPath();
    ctx.moveTo(x, y - r);
    ctx.quadraticCurveTo(x + k, y - k, x + r, y);
    ctx.quadraticCurveTo(x + k, y + k, x, y + r);
    ctx.quadraticCurveTo(x - k, y + k, x - r, y);
    ctx.quadraticCurveTo(x - k, y - k, x, y - r);
    ctx.stroke();
  };

  const planeAt = (p: NonNullable<Live['plane']>, t: number): Pt => {
    const w = (Math.PI * 2) / 26;
    return [p.cx + p.rx * Math.sin(w * t), p.cy + p.ry * Math.sin(2 * w * t)];
  };

  /** The chart's living things, drawn over the baked sky at its parallax. */
  const liveSky = (t: number, boil: number, fade: number, still: boolean) => {
    if (!scene || !lay) return;
    const L = scene.live;
    const nib = lay.figure.h * 0.0042;
    const pen = new Pen(new Rng(911 + boil));
    pen.scale = scene.scale;

    if (L.compass) {
      const { x, y } = L.compass;
      // The needle hunts for the cursor, overshoots, and settles.
      const target = cursor.in && !still ? Math.atan2(cursor.y - eased.y * 3 - y, cursor.x - eased.x * 5 - x) : -Math.PI / 2 + (still ? 0 : Math.sin(t * 0.5) * 0.14);
      let d = target - needle.a;
      d = Math.atan2(Math.sin(d), Math.cos(d));
      if (still) needle.a = target;
      else {
        needle.v = (needle.v + d * 0.06) * 0.86;
        needle.a += needle.v;
      }
      drawNeedle(pen, x, y, L.compass.r, needle.a, Math.max(0.9, nib));
    }
    if (L.serpent) drawSerpent(pen, L.serpent.x, L.serpent.wl, L.serpent.u, t, Math.max(0.9, nib));
    if (L.plane && !still) {
      const p = planeAt(L.plane, t);
      const q = planeAt(L.plane, t + 0.05);
      drawPlane(pen, p[0], p[1], Math.atan2(q[1] - p[1], q[0] - p[0]), q[0] < p[0], L.plane.s, Math.max(0.8, nib * 0.9));
    }
    renderMarks(ctx, pen.marks, palette, 0, pen.marks.length, fade);

    ctx.save();
    ctx.lineCap = 'round';
    ctx.strokeStyle = palette.ink;
    // The plane's dashed wake.
    if (L.plane && !still) {
      for (let i = 2; i < 26; i += 2) {
        const a = planeAt(L.plane, t - i * 0.075);
        const b = planeAt(L.plane, t - (i - 1) * 0.075);
        penLine(a[0], a[1], b[0], b[1], nib * 0.8, 0.5 * (1 - i / 26) * fade, 0);
      }
    }
    // Now and then, a shooting star.
    if (L.meteor && !still) {
      const period = 9.5;
      const k = Math.floor(t / period);
      const ph = t - k * period;
      const dur = 1.1;
      if (k > 0 && ph < dur) {
        const M = L.meteor;
        const sx = M.x0 + hash(k) * (M.x1 - M.x0);
        const sy = M.y0 + hash(k + 0.5) * (M.y1 - M.y0);
        const dx = -Math.cos(0.42);
        const dy = Math.sin(0.42);
        const p = ph / dur;
        const e = 1 - (1 - p) ** 3;
        const hx = sx + dx * M.len * e;
        const hy = sy + dy * M.len * e;
        const tail = M.len * 0.42 * (1 - p * 0.6);
        const a = p < 0.75 ? 1 : (1 - p) / 0.25;
        penLine(hx - dx * tail, hy - dy * tail, hx, hy, nib * 1.1, 0.75 * a, nib * 1.5);
        penLine(hx - dx * tail * 0.7 - dy * nib * 2, hy - dy * tail * 0.7 + dx * nib * 2, hx, hy, nib * 0.6, 0.45 * a, -nib);
        sparkle(hx, hy, nib * 4.5, nib, 0.9 * a);
      }
    }
    ctx.restore();

    // Rocks tumble slowly where they were placed.
    ctx.save();
    ctx.globalAlpha = fade;
    L.rocks.forEach((r, i) => {
      const sp = rocks[i];
      if (!sp) return;
      const spin = still ? 0 : t * (0.12 + (i % 3) * 0.05) * (i % 2 ? -1 : 1);
      const bob = still ? 0 : Math.sin(t * 0.8 + i * 2) * r.r * 0.25;
      ctx.save();
      ctx.translate(r.x, r.y + bob);
      ctx.rotate(spin);
      ctx.drawImage(sp.c, sp.x, sp.y, sp.w, sp.h);
      ctx.restore();
    });
    ctx.restore();
  };

  /** Pen-work over the finished picture: nothing here is ever baked in. */
  const garnish = (now: number) => {
    const nib = Math.max(0.7, Math.min(width, height) / 760);
    const px = eased.x * 5;
    const py = eased.y * 3;
    ctx.save();
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = palette.ink;

    for (const tw of twinklers) {
      const k = 0.5 + 0.5 * Math.sin((now / 1000) * tw.speed + tw.phase);
      sparkle(tw.s.x + px, tw.s.y + py, tw.s.r * (1.2 + k * 0.7), nib * 0.9, 0.1 + k * 0.38);
    }

    // The cursor joins up whatever stars it is near, the way a finger traces
    // a constellation. The links are redrawn each frame, never kept.
    cursor.on += ((cursor.in ? 1 : 0) - cursor.on) * 0.08;
    if (cursor.on > 0.01) {
      const reach = Math.min(width, height) * 0.26;
      near.length = 0;
      for (const s of stars) {
        const d = Math.hypot(s.x + px - cursor.x, s.y + py - cursor.y);
        if (d < reach) near.push({ s, d });
      }
      near.sort((a, b) => a.d - b.d);
      for (let i = 0; i < Math.min(4, near.length); i += 1) {
        const { s, d } = near[i];
        const fade = (1 - d / reach) * cursor.on;
        penLine(cursor.x, cursor.y, s.x + px, s.y + py, nib * 0.8, fade * 0.55, Math.sin(now / 1400 + i) * nib * 4);
        sparkle(s.x + px, s.y + py, s.r * 1.6, nib * 0.9, fade * 0.65);
      }
      // …and the pen's own tip, a small cross on the paper.
      const c = nib * 7 * cursor.on;
      penLine(cursor.x - c, cursor.y, cursor.x + c, cursor.y, nib * 1.1, cursor.on * 0.5, nib * 0.9);
      penLine(cursor.x, cursor.y - c, cursor.x, cursor.y + c, nib * 1.1, cursor.on * 0.5, -nib * 0.9);
    }

    // Stars the visitor put there, each drawn in over a moment.
    for (const a of added) {
      const t = Math.min(1, (now - a.born) / 420);
      const e = 1 - (1 - t) * (1 - t);
      sparkle(a.x, a.y, a.r * e, nib * 1.1, 0.25 + e * 0.6);
    }

    ctx.globalAlpha = 1;
    ctx.restore();
  };

  const composite = (now: number) => {
    if (!lay || !scene) return;
    const still = reduced;
    const t = still ? 0 : (now - start) / 1000;
    const boil = still ? 0 : Math.floor(t / BOIL) % 3;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = palette.paper;
    ctx.fillRect(0, 0, width, height);
    if (!still) {
      eased.x += (pointer.x - eased.x) * 0.05;
      eased.y += (pointer.y - eased.y) * 0.05;
    }
    const bob = still ? 0 : Math.sin(t * ((Math.PI * 2) / 9)) * Math.min(2.2, height * 0.0026);
    const sx = eased.x * 5;
    const sy = eased.y * 3;
    ctx.drawImage(baked ?? layerCanvas[0], sx, sy, width, height);
    if (!baked) ctx.drawImage(layerCanvas[1], eased.x * -6, eased.y * -3, width, height);
    if (baked) {
      ctx.save();
      ctx.translate(sx, sy);
      liveSky(t, boil, Math.min(1, (now - bakedAt) / 700), still);
      ctx.restore();
    }

    // The figure leans a little toward the cursor. Half a degree is plenty —
    // it reads as weight shifting, not as the drawing sliding about.
    const fig = lay.figure;
    const tilt = still ? 0 : eased.x * 0.02;
    const ox = eased.x * -11;
    const oy = eased.y * -5 + bob;
    ctx.save();
    ctx.translate(fig.x, fig.y);
    ctx.rotate(tilt);
    ctx.translate(-fig.x + ox, -fig.y + oy);
    const sp = figures[boil];
    if (baked && sp) ctx.drawImage(sp.c, sp.x, sp.y, sp.w, sp.h);
    else ctx.drawImage(layerCanvas[2], 0, 0, width, height);
    if (drawn > scene.flagAt) {
      const pen = new Pen(new Rng(733 + boil));
      pen.scale = scene.scale;
      drawPennant(pen, fig.x, fig.y, fig.h, t);
      renderMarks(ctx, pen.marks, palette, 0, pen.marks.length);
    }
    ctx.restore();

    if (!still && baked) garnish(now);
  };

  const tick = (now: number) => {
    if (destroyed || paused || !visible) return;
    if (drawn < marks.length) {
      const p = Math.min(1, (now - revealStart) / REVEAL_MS);
      const e = p * p * (3 - 2 * p);
      // Always advance a little, so a slow frame never stalls the hand — but
      // only a little, or the floor outruns the clock and the sketch-in is
      // over in a blink.
      inkTo(Math.max(e * totalWeight, drawnWeight + totalWeight * 0.003));
      composite(now);
      frame = requestAnimationFrame(tick);
      return;
    }
    if (!baked) bake();
    if (reduced) {
      composite(now);
      frame = 0;
      return;
    }
    // Idle: the pictures are baked, so 30fps is plenty for what moves.
    if (now - lastIdle > 32) {
      lastIdle = now;
      composite(now);
    }
    frame = requestAnimationFrame(tick);
  };

  const onPointer = (e: PointerEvent) => {
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    pointer.x = x / rect.width - 0.5;
    pointer.y = y / rect.height - 0.5;
    cursor.x = x;
    cursor.y = y;
    cursor.in = e.pointerType !== 'touch' && x >= 0 && y >= 0 && x <= rect.width && y <= rect.height;
  };
  const onLeave = () => {
    pointer.x = 0;
    pointer.y = 0;
    cursor.in = false;
  };

  /** Tap the sky and a star appears there. The last dozen are kept. */
  const onTap = (e: PointerEvent) => {
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    if (x < 0 || y < 0 || x > rect.width || y > rect.height) return;
    const s = Math.min(width, height);
    added.push({ x, y, r: s * (0.008 + Math.random() * 0.007), born: performance.now() });
    if (added.length > 12) added.shift();
    resume();
  };

  const resume = () => {
    if (destroyed || paused || !visible || frame) return;
    frame = requestAnimationFrame(tick);
  };
  const halt = () => {
    cancelAnimationFrame(frame);
    frame = 0;
  };

  /** Rebuild and finish the picture at once — no second sketch-in. */
  const redraw = () => {
    halt();
    build_();
    inkTo(Infinity);
    bake();
    composite(performance.now());
    resume();
  };

  let resizeTimer = 0;
  const onResize = () => {
    window.clearTimeout(resizeTimer);
    resizeTimer = window.setTimeout(() => {
      const rect = canvas.getBoundingClientRect();
      // Mobile browsers fire resize on every toolbar nudge; height alone is not
      // worth re-drawing an entire picture for.
      if (Math.round(rect.width) === width && Math.abs(Math.round(rect.height) - height) < 80) return;
      redraw();
    }, 220);
  };

  const onVisibility = () => {
    paused = document.hidden;
    if (paused) halt();
    else resume();
  };

  const observer = new IntersectionObserver(([entry]) => {
    visible = entry.isIntersecting;
    if (visible) resume();
    else halt();
  });

  const go = () => {
    if (destroyed) return;
    build_();
    if (reduced) {
      inkTo(Infinity);
      bake();
      composite(performance.now());
    } else {
      observer.observe(canvas);
      window.addEventListener('pointermove', onPointer, { passive: true });
      canvas.addEventListener('pointerleave', onLeave);
      canvas.addEventListener('pointerdown', onTap);
      resume();
    }
    window.addEventListener('resize', onResize);
    document.addEventListener('visibilitychange', onVisibility);
  };

  // The drawing is laid out round the tagline, so wait (briefly) for the real
  // faces: a fallback font sets the words taller and the picture would be
  // planned round the wrong shape. The labels' italic is fetched in the same
  // breath.
  const settle = new Promise((r) => setTimeout(r, 900));
  const fonts = document.fonts
    ? Promise.all([document.fonts.ready, document.fonts.load(`italic 400 14px ${font}`)])
    : Promise.resolve();
  Promise.race([fonts, settle]).then(go, go);

  return {
    destroy: () => {
      destroyed = true;
      halt();
      observer.disconnect();
      window.removeEventListener('pointermove', onPointer);
      canvas.removeEventListener('pointerleave', onLeave);
      canvas.removeEventListener('pointerdown', onTap);
      window.removeEventListener('resize', onResize);
      document.removeEventListener('visibilitychange', onVisibility);
    },
  };
}
