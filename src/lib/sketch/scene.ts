/**
 * The landing sketch: a small planet, an astronaut who has just planted a flag
 * on it, and a sky of hand-drawn stars — pen on paper, drawn live.
 *
 * The scene is built once into a flat list of marks (see `pen.ts`) and then
 * sketched in, mark by mark, as if a hand were drawing it. When the last mark
 * lands, the sky and the ground are baked into a single bitmap and the figure
 * into another, so the idle loop is two `drawImage` calls and nothing else:
 * parallax and a slow breath, no re-drawing, no per-frame geometry.
 */

import { drawAstronaut, drawFlag, star } from './astronaut';
import { Pen, Rng, catmull, circlePoly, ellipsePoly, markWeight, renderMarks, type Mark, type Palette, type Pt } from './pen';

export interface SketchSceneHandle {
  destroy: () => void;
}

interface Layout {
  width: number;
  height: number;
  /** Planet centre and radius in px; the astronaut stands on its crown. */
  planet: { x: number; y: number; r: number };
  figure: { x: number; y: number; h: number };
  /** Where the tagline sits. Nothing is drawn inside it. */
  copy: { x0: number; y0: number; x1: number; y1: number };
  portrait: boolean;
  detail: number;
}

export function layout(width: number, height: number, detail: number): Layout {
  const s = Math.min(width, height);
  const portrait = width / height < 0.85;
  const h = height * (portrait ? 0.3 : 0.42);
  // Portrait stacks the drawing under the tagline; landscape sets it right of
  // centre so the tagline has the left half of the paper to itself. On a short
  // landscape window the two would meet, so the figure is held off the text.
  let fx = portrait ? width * 0.52 : width * 0.64;
  if (!portrait) fx = Math.max(fx, width * 0.58 + h * 0.25);
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
    copy: portrait
      ? { x0: 0, y0: 0, x1: width, y1: height * 0.46 }
      : { x0: 0, y0: height * 0.2, x1: width * 0.54, y1: height * 0.84 },
    portrait,
    detail,
  };
}

/** Everything in the picture, in drawing order — which is also reveal order. */
export function build(l: Layout, seed: number): Mark[] {
  const pen = new Pen(new Rng(seed));
  const rng = pen.rng;
  const { width, height, planet, figure, detail } = l;
  pen.scale = Math.max(0.7, Math.min(1.25, Math.min(width, height) / 760));
  const nib = figure.h * 0.0042;

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
  pen.on(2, () => {
    drawFlag(pen, figure.x, figure.y, figure.h);
    drawAstronaut(pen, figure.x, figure.y, figure.h, { detail });
  });

  // 3. The sky, last: garnish drawn once the picture already reads.
  pen.on(0, () => {
    // A ringed world, small and far, clear of both the figure and the words.
    const rw = l.portrait
      ? { x: width * 0.17, y: height * 0.56, r: Math.min(width, height) * 0.06 }
      : { x: width * 0.13, y: height * 0.17, r: Math.min(width, height) * 0.055 };
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

    // Stars. Big sparkles are placed; the dust is scattered, but never over
    // the tagline's half of the paper and never on top of the figure.
    const clear = (x: number, y: number) => {
      const dx = Math.abs(x - figure.x);
      const dy = y - (figure.y - figure.h * 1.2);
      const onFigure = dx < figure.h * 0.55 && dy > 0 && y < figure.y;
      const onPlanet = Math.hypot(x - planet.x, y - planet.y) < planet.r * 1.03;
      const onWorld = Math.hypot(x - rw.x, y - rw.y) < rw.r * 2.1;
      const onCopy = x > l.copy.x0 && x < l.copy.x1 && y > l.copy.y0 && y < l.copy.y1;
      return !onFigure && !onPlanet && !onWorld && !onCopy;
    };
    const sparkles: Pt[] = [
      [width * 0.4, height * 0.12],
      [width * 0.86, height * 0.18],
      [width * 0.28, height * 0.9],
      [width * 0.72, height * 0.34],
    ];
    for (const [x, y] of sparkles) {
      if (!clear(x, y)) continue;
      star(pen, x, y, Math.min(width, height) * rng.range(0.016, 0.026), nib * 1.1);
    }
    // Portrait reserves the whole top of the page for the words, so it needs
    // more throws of the pen to end up with the same scatter of stars.
    const dust = Math.round((l.portrait ? 52 : 34) * detail);
    for (let i = 0; i < dust; i += 1) {
      const x = rng.range(width * 0.03, width * 0.97);
      const y = rng.range(height * 0.05, height * 0.78);
      if (!clear(x, y)) continue;
      if (rng.next() < 0.22) star(pen, x, y, Math.min(width, height) * rng.range(0.006, 0.011), nib * 0.8);
      else pen.dot(x, y, nib * rng.range(0.6, 1.2), rng.range(0.4, 0.85));
    }
    // One comet, going somewhere.
    const cx0 = width * 0.9;
    const cy0 = height * (l.portrait ? 0.3 : 0.62);
    if (!clear(cx0, cy0)) return;
    pen.dot(cx0, cy0, nib * 2.2, 0.9);
    pen.stroke(circlePoly(cx0, cy0, nib * 4.4, 16), { w: nib * 0.8, a: 0.55, passes: 1, closed: true, wobble: 0.02 });
    for (let i = 0; i < 6; i += 1) {
      const t = i / 6;
      pen.line(
        [cx0 + 14 * pen.scale + t * 62 * pen.scale, cy0 - 10 * pen.scale - t * 34 * pen.scale],
        [cx0 + 30 * pen.scale + t * 62 * pen.scale, cy0 - 20 * pen.scale - t * 34 * pen.scale],
        { w: nib * 0.7, a: 0.5 - t * 0.3, passes: 1, overshoot: 0 },
      );
    }
  });

  return pen.marks;
}

export function initSketchScene(canvas: HTMLCanvasElement): SketchSceneHandle {
  const ctx = canvas.getContext('2d');
  if (!ctx) return { destroy: () => undefined };

  const css = getComputedStyle(document.documentElement);
  const palette: Palette = {
    ink: css.getPropertyValue('--ink').trim() || '#161513',
    paper: css.getPropertyValue('--bg').trim() || '#f1eee6',
  };
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  let width = 0;
  let height = 0;
  let dpr = 1;
  let marks: Mark[] = [];
  let weights: number[] = [];
  let totalWeight = 1;
  let drawn = 0;
  let drawnWeight = 0;
  let layerCanvas: HTMLCanvasElement[] = [];
  let layerCtx: CanvasRenderingContext2D[] = [];
  let baked: HTMLCanvasElement | null = null;
  let revealStart = 0;
  let frame = 0;
  let lastIdle = 0;
  let visible = true;
  let paused = false;
  let destroyed = false;
  const REVEAL_MS = 1500;
  const start = performance.now();
  const pointer = { x: 0, y: 0 };
  const eased = { x: 0, y: 0 };

  const sizeLayer = (c: HTMLCanvasElement) => {
    c.width = canvas.width;
    c.height = canvas.height;
    const lc = c.getContext('2d')!;
    lc.setTransform(dpr, 0, 0, dpr, 0, 0);
    return lc;
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
    marks = build(layout(width, height, detail), 20260922);
    weights = marks.map(markWeight);
    totalWeight = weights.reduce((a, b) => a + b, 0) || 1;
    layerCanvas = [0, 1, 2].map(() => document.createElement('canvas'));
    layerCtx = layerCanvas.map(sizeLayer);
    drawn = 0;
    drawnWeight = 0;
    baked = null;
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

  /** Sky + ground collapse into one bitmap; the figure keeps its own so it
   *  can breathe without anything being re-drawn. */
  const bake = () => {
    const c = document.createElement('canvas');
    c.width = canvas.width;
    c.height = canvas.height;
    const bc = c.getContext('2d')!;
    bc.setTransform(dpr, 0, 0, dpr, 0, 0);
    bc.drawImage(layerCanvas[0], 0, 0, width, height);
    bc.drawImage(layerCanvas[1], 0, 0, width, height);
    baked = c;
  };

  const composite = (now: number) => {
    const t = (now - start) / 1000;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = palette.paper;
    ctx.fillRect(0, 0, width, height);
    if (!reduced) {
      eased.x += (pointer.x - eased.x) * 0.05;
      eased.y += (pointer.y - eased.y) * 0.05;
    }
    const bob = reduced ? 0 : Math.sin(t * ((Math.PI * 2) / 9)) * Math.min(2.2, height * 0.0026);
    const sky = baked ?? layerCanvas[0];
    ctx.drawImage(sky, eased.x * 5, eased.y * 3, width, height);
    if (!baked) ctx.drawImage(layerCanvas[1], eased.x * -6, eased.y * -3, width, height);
    ctx.drawImage(layerCanvas[2], eased.x * -11, eased.y * -5 + bob, width, height);
  };

  const tick = (now: number) => {
    if (destroyed || paused || !visible) return;
    if (drawn < marks.length) {
      const p = Math.min(1, (now - revealStart) / REVEAL_MS);
      const e = p * p * (3 - 2 * p);
      // Always advance a little, so a slow frame never stalls the hand.
      inkTo(Math.max(e * totalWeight, drawnWeight + totalWeight * 0.035));
      composite(now);
      frame = requestAnimationFrame(tick);
      return;
    }
    if (!baked) bake();
    if (reduced) {
      composite(now);
      return;
    }
    // Idle: nothing is re-drawn, so 30fps is plenty for a breath and parallax.
    if (now - lastIdle > 32) {
      lastIdle = now;
      composite(now);
    }
    frame = requestAnimationFrame(tick);
  };

  const onPointer = (e: PointerEvent) => {
    const rect = canvas.getBoundingClientRect();
    pointer.x = (e.clientX - rect.left) / rect.width - 0.5;
    pointer.y = (e.clientY - rect.top) / rect.height - 0.5;
  };
  const onLeave = () => {
    pointer.x = 0;
    pointer.y = 0;
  };

  const resume = () => {
    if (destroyed || paused || !visible || frame) return;
    frame = requestAnimationFrame(tick);
  };
  const halt = () => {
    cancelAnimationFrame(frame);
    frame = 0;
  };

  let resizeTimer = 0;
  const onResize = () => {
    window.clearTimeout(resizeTimer);
    resizeTimer = window.setTimeout(() => {
      const rect = canvas.getBoundingClientRect();
      // Mobile browsers fire resize on every toolbar nudge; height alone is not
      // worth re-drawing an entire picture for.
      if (Math.round(rect.width) === width && Math.abs(Math.round(rect.height) - height) < 80) return;
      halt();
      build_();
      inkTo(Infinity);
      bake();
      composite(performance.now());
      resume();
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

  build_();
  if (reduced) {
    inkTo(Infinity);
    bake();
    composite(performance.now());
  } else {
    observer.observe(canvas);
    window.addEventListener('pointermove', onPointer, { passive: true });
    canvas.addEventListener('pointerleave', onLeave);
    resume();
  }
  window.addEventListener('resize', onResize);
  document.addEventListener('visibilitychange', onVisibility);

  return {
    destroy: () => {
      destroyed = true;
      halt();
      observer.disconnect();
      window.removeEventListener('pointermove', onPointer);
      canvas.removeEventListener('pointerleave', onLeave);
      window.removeEventListener('resize', onResize);
      document.removeEventListener('visibilitychange', onVisibility);
    },
  };
}
