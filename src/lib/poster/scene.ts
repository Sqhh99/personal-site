/**
 * The landing poster: Doré's Paradiso XXXI — the rose of light — set as a
 * field of characters on a dark sheet, with a spot-colour panel behind it and
 * a few pencil marks over the top.
 *
 * The static field is printed once into a backing canvas. Each frame blits it
 * and then overprints only the cells that are alive:
 *
 *  - on arrival, a scan band sweeps down and the characters decode into place;
 *  - a slow shimmer re-sets a handful of cells at a time;
 *  - gold rays turn, very slowly, round the light at the centre;
 *  - the cursor carries a lantern, which brings up the detail the tone curve
 *    hid in the grey sky and warms what it touches;
 *  - embers rise off the ring and go out.
 *
 * The pencil marks reuse the landing's old pen (`../sketch/pen`), and boil —
 * three tracings, cycled — the way hand-drawn animation never sits still.
 */

import { BLOCK, DOT, RAMP, Tone, bayer, buildAtlas, glyphFor, toneFor, type Atlas, type Inks } from './glyphs';
import { layoutPoster, sampleField, type Field, type PosterLayout, type Rect } from './field';
import { Pen, Rng, catmull, ellipsePoly, renderMarks, type Mark, type Pt } from '../sketch/pen';

export interface PosterHandle {
  destroy: () => void;
}

/** A cheap, stable hash for per-cell and per-tick randomness. */
const hash = (n: number) => {
  const x = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return x - Math.floor(x);
};

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

const REVEAL_MS = 1700;
const BAND = 7;
const SCRIBBLE_MS = 1100;
/** Seconds each boil tracing is held. */
const BOIL = 0.17;
const SEED = 20261001;

interface Sprite {
  c: HTMLCanvasElement;
  x: number;
  y: number;
  w: number;
  h: number;
}

interface Ember {
  x: number;
  y: number;
  vy: number;
  sway: number;
  phase: number;
  born: number;
  life: number;
  size: number;
  gold: boolean;
}

/** The pencil-work over the plate, in drawing order. */
function scribbles(l: PosterLayout, seed: number, title: Rect | undefined, font: string): Mark[] {
  const pen = new Pen(new Rng(seed));
  pen.fontFamily = font;
  const { sun, art, panel } = l;
  const aw = art.x1 - art.x0;
  const ah = art.y1 - art.y0;
  const nib = clamp(aw / 620, 0.9, 1.5);

  // A loose ring round the light, gone over twice.
  pen.stroke(ellipsePoly(sun.x, sun.y, sun.r * 2.1, sun.r * 1.75, -0.22, 64), {
    w: nib * 1.2,
    a: 0.85,
    passes: 2,
    closed: true,
    wobble: 0.012,
  });

  // An arrow off the ring to a note in the margin.
  const a0: Pt = [sun.x + Math.cos(-0.5) * sun.r * 2.15, sun.y + Math.sin(-0.5) * sun.r * 1.8];
  const a1: Pt = [Math.min(l.width - 40, sun.x + aw * 0.34), sun.y - ah * 0.2];
  if (!l.portrait) {
    const mid: Pt = [(a0[0] + a1[0]) / 2 + 10, Math.min(a0[1], a1[1]) - ah * 0.06];
    const path = catmull([a0, mid, a1], 16);
    pen.stroke(path, { w: nib, a: 0.8, passes: 1, wobble: 0.01, overshoot: 0 });
    const q = path[path.length - 3];
    const ang = Math.atan2(a1[1] - q[1], a1[0] - q[0]);
    for (const side of [-1, 1]) {
      pen.line(a1, [a1[0] - Math.cos(ang + side * 0.5) * 9, a1[1] - Math.sin(ang + side * 0.5) * 9], {
        w: nib,
        a: 0.8,
        passes: 1,
        overshoot: 0,
      });
    }
    pen.text('lux · 光', a1[0] + 6, a1[1] - 8, { size: 15, a: 0.85, align: 'left', rot: -0.06 });
  }

  // Ballpoint hatching across a corner of the panel.
  const hx = panel.x1 - (panel.x1 - panel.x0) * 0.32;
  const hy = panel.y0 - 10;
  const hw = (panel.x1 - panel.x0) * 0.38;
  const hh = (panel.y1 - panel.y0) * 0.26;
  pen.hatch(
    [
      [hx, hy + hh * 0.2],
      [hx + hw * 0.9, hy],
      [hx + hw, hy + hh * 0.85],
      [hx + hw * 0.1, hy + hh],
    ],
    { angle: -0.95, gap: 5.5, w: nib * 1.1, a: 0.7, skip: 0.18, overshoot: 4 },
  );

  // A cross over the two pilgrims at the foot of the plate.
  const px = art.x0 + aw * 0.488;
  const py = art.y0 + ah * 0.8;
  if (py < l.height - 20) {
    const k = 9 * nib;
    pen.line([px - k, py - k], [px + k, py + k], { w: nib * 1.2, a: 0.8, passes: 2 });
    pen.line([px + k, py - k], [px - k, py + k], { w: nib * 1.2, a: 0.8, passes: 2 });
  }

  // And the name struck under, the way a title is marked up in proof.
  if (title) {
    const y = title.y1 + 4;
    const x0 = title.x0 + 4;
    const x1 = title.x0 + (title.x1 - title.x0) * 0.72;
    const pts: Pt[] = [];
    for (let i = 0; i <= 24; i += 1) {
      const t = i / 24;
      pts.push([x0 + (x1 - x0) * t, y + Math.sin(t * Math.PI * 3) * 2.2]);
    }
    pen.stroke(pts, { w: nib * 1.5, a: 0.75, passes: 2, wobble: 0.004 });
  }
  return pen.marks;
}

/** Renders marks into a canvas cropped to their bounds. */
function spriteOf(marks: Mark[], ink: string, dpr: number, pad = 6): Sprite {
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
  // Text marks carry only an anchor; leave room for the lettering.
  x0 -= pad;
  y0 -= pad + 24;
  const w = Math.max(1, x1 + pad + 120 - x0);
  const h = Math.max(1, y1 + pad - y0);
  const c = document.createElement('canvas');
  c.width = Math.ceil(w * dpr);
  c.height = Math.ceil(h * dpr);
  const sc = c.getContext('2d')!;
  sc.setTransform(dpr, 0, 0, dpr, -x0 * dpr, -y0 * dpr);
  renderMarks(sc, marks, { ink, paper: 'transparent' }, 0, marks.length);
  return { c, x: x0, y: y0, w, h };
}

export function initPoster(canvas: HTMLCanvasElement): PosterHandle {
  const ctx = canvas.getContext('2d');
  if (!ctx) return { destroy: () => undefined };

  const css = getComputedStyle(document.documentElement);
  const read = (name: string, fallback: string) => css.getPropertyValue(name).trim() || fallback;
  const inks: Inks = {
    deep: read('--cobalt-deep', '#2b3dbd'),
    cobalt: read('--accent', '#5b74ff'),
    bone: read('--ink', '#e8e3d6'),
    ink: read('--bg', '#0b0b0e'),
    gold: read('--gold', '#f2b35e'),
  };
  const pink = read('--pink', '#ff3d7f');
  const mono = read('--font-mono', 'monospace');
  const display = read('--font-display', 'serif');
  const hero = canvas.parentElement;
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const img = new Image();
  img.decoding = 'async';
  img.src = canvas.dataset.src ?? '';

  let width = 0;
  let height = 0;
  let dpr = 1;
  let l: PosterLayout | null = null;
  let field: Field | null = null;
  let atlas: Atlas | null = null;
  let base: HTMLCanvasElement | null = null;
  let slot = new Uint8Array(0);
  let tone = new Uint8Array(0);
  let lit: number[] = [];
  let marks: Mark[] = [];
  let sprites: Sprite[] = [];
  let embers: Ember[] = [];
  let shimmer: number[] = [];
  let shimmerAt = -1;
  let revealStart = 0;
  let scribbleStart = 0;
  let frame = 0;
  let lastIdle = 0;
  let visible = true;
  let paused = false;
  let destroyed = false;
  const start = performance.now();
  const cursor = { x: 0, y: 0, in: false, on: 0 };

  const inPanel = (col: number, row: number) => {
    if (!l) return false;
    const x = col * l.cw;
    const y = row * l.ch;
    return x >= l.panel.x0 && x < l.panel.x1 && y >= l.panel.y0 && y < l.panel.y1;
  };

  /** Prints one cell from the atlas. */
  const print = (c: CanvasRenderingContext2D, col: number, row: number, s: number, t: number) => {
    if (!atlas || !l || s === 0) return;
    c.drawImage(atlas.canvas, s * atlas.sw, t * atlas.sh, atlas.sw, atlas.sh, col * l.cw, row * l.ch, l.cw, l.ch);
  };

  /** Wipes a cell back to its ground — paper-dark, or the panel — and prints over it. */
  const overprint = (col: number, row: number, s: number, t: number) => {
    if (!l) return;
    const x = col * l.cw;
    const y = row * l.ch;
    if (inPanel(col, row)) {
      ctx.fillStyle = pink;
      ctx.fillRect(x, y, l.cw, l.ch);
      print(ctx, col, row, s, Tone.Ink);
    } else {
      ctx.clearRect(x, y, l.cw, l.ch);
      print(ctx, col, row, s, t);
    }
  };

  const build = () => {
    const rect = canvas.getBoundingClientRect();
    width = Math.max(1, Math.round(rect.width));
    height = Math.max(1, Math.round(rect.height));
    dpr = Math.min(window.devicePixelRatio || 1, width < 720 ? 1.5 : 2);
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    l = layoutPoster(width, height, img.naturalWidth / img.naturalHeight || 0.9);
    field = sampleField(img, l);
    atlas = buildAtlas(l.cw, l.ch, dpr, mono, inks);

    const { cols, rows } = l;
    const n = cols * rows;
    slot = new Uint8Array(n);
    tone = new Uint8Array(n);
    lit = [];
    for (let row = 0; row < rows; row += 1) {
      for (let col = 0; col < cols; col += 1) {
        const i = row * cols + col;
        const v = field.v[i];
        const m = field.mask[i];
        let s = v > 0.05 ? glyphFor(v, col, row) : 0;
        let t: number = toneFor(v);
        // The fringe of the plate breaks up into printed squares.
        if (m > 0.04 && m < 0.5) {
          const h = hash(i);
          if (v > 0.12 && h < 0.55 * (1 - m / 0.5)) {
            s = BLOCK;
            t = Tone.Deep;
          } else if (s === 0 && h > 0.97 - m * 0.06) {
            s = DOT;
            t = Tone.Deep;
          }
        }
        // The panel's bare side gets a halftone ramp, densest at its outer edge.
        if (s === 0 && inPanel(col, row)) {
          const across = (col * l.cw - l.panel.x0) / (l.panel.x1 - l.panel.x0 || 1);
          if (bayer(col, row) < 0.3 * (1 - across) ** 2) s = DOT;
        }
        slot[i] = s;
        tone[i] = t;
        if (s > 0 && s < RAMP.length) lit.push(i);
      }
    }

    // The static print: the panel, then every settled cell.
    base = document.createElement('canvas');
    base.width = canvas.width;
    base.height = canvas.height;
    const bc = base.getContext('2d')!;
    bc.setTransform(dpr, 0, 0, dpr, 0, 0);
    bc.fillStyle = pink;
    bc.fillRect(l.panel.x0, l.panel.y0, l.panel.x1 - l.panel.x0, l.panel.y1 - l.panel.y0);
    for (let row = 0; row < rows; row += 1) {
      for (let col = 0; col < cols; col += 1) {
        const i = row * cols + col;
        if (slot[i]) print(bc, col, row, slot[i], inPanel(col, row) ? Tone.Ink : tone[i]);
      }
    }

    const titleEl = hero?.querySelector('.poster-title');
    let title: Rect | undefined;
    if (titleEl) {
      const r = titleEl.getBoundingClientRect();
      const c = canvas.getBoundingClientRect();
      title = { x0: r.left - c.left, y0: r.top - c.top, x1: r.right - c.left, y1: r.bottom - c.top };
    }
    marks = scribbles(l, SEED, title, display);
    sprites = [0, 1, 2].map((k) => spriteOf(scribbles(l!, SEED + 101 + k, title, display), inks.bone, dpr));

    embers = [];
    shimmer = [];
    shimmerAt = -1;
    revealStart = performance.now();
    scribbleStart = revealStart + REVEAL_MS * 0.7;
  };

  // --- frames ----------------------------------------------------------------

  const drawReveal = (now: number) => {
    if (!l || !base) return;
    const { cols, rows, ch } = l;
    const p = clamp((now - revealStart) / REVEAL_MS, 0, 1);
    const e = 1 - (1 - p) ** 2;
    const lead = e * (rows + BAND) - BAND;
    const settled = Math.max(0, Math.floor(lead));
    const step = Math.floor(now / 50);
    ctx.clearRect(0, 0, width, height);
    if (settled > 0) {
      const sy = Math.min(base.height, Math.round(settled * ch * dpr));
      ctx.drawImage(base, 0, 0, base.width, sy, 0, 0, width, sy / dpr);
    }
    for (let row = settled; row < Math.min(rows, settled + BAND); row += 1) {
      const k = (row - lead) / BAND;
      for (let col = 0; col < cols; col += 1) {
        const i = row * cols + col;
        const s = slot[i];
        const h = hash(i * 31 + step);
        if (inPanel(col, row)) {
          ctx.fillStyle = pink;
          ctx.fillRect(col * l.cw, row * l.ch, l.cw, l.ch);
        }
        if (s) {
          const g = h < k ? 1 + Math.floor(hash(i + step) * (RAMP.length - 1)) : s;
          print(ctx, col, row, g, inPanel(col, row) ? Tone.Ink : k > 0.6 ? Tone.Bone : tone[i]);
        } else if (h < 0.05 * k) {
          print(ctx, col, row, 1 + Math.floor(hash(i + step * 3) * 6), Tone.Deep);
        }
      }
    }
  };

  /** Gold rays turning round the light — only ever over cells already lit. */
  const rays = (t: number) => {
    if (!l || !field) return;
    const { sun, cw, ch, cols, rows } = l;
    const R = sun.r * 2.6;
    const c0 = Math.max(0, Math.floor((sun.x - R) / cw));
    const c1 = Math.min(cols - 1, Math.ceil((sun.x + R) / cw));
    const r0 = Math.max(0, Math.floor((sun.y - R) / ch));
    const r1 = Math.min(rows - 1, Math.ceil((sun.y + R) / ch));
    const spin = t * 0.07;
    const breathe = 0.5 + 0.5 * Math.sin(t * 1.3);
    for (let row = r0; row <= r1; row += 1) {
      for (let col = c0; col <= c1; col += 1) {
        const i = row * cols + col;
        if (!slot[i] || slot[i] >= RAMP.length) continue;
        const dx = (col + 0.5) * cw - sun.x;
        const dy = (row + 0.5) * ch - sun.y;
        const d = Math.hypot(dx, dy);
        if (d > R) continue;
        const a = Math.atan2(dy, dx);
        const ray = Math.cos(a * 14 + spin * 14);
        const reach = 1 - d / R;
        if (ray > 0.9 - reach * 0.35 * breathe || d < sun.r * (0.45 + breathe * 0.25)) {
          overprint(col, row, d < sun.r * 0.5 ? RAMP.length - 1 : slot[i], Tone.Gold);
        }
      }
    }
  };

  const doShimmer = (now: number) => {
    if (!lit.length) return;
    const tick = Math.floor(now / 140);
    if (tick !== shimmerAt) {
      shimmerAt = tick;
      shimmer = [];
      const want = Math.max(6, Math.round(lit.length * 0.006));
      for (let k = 0; k < want; k += 1) shimmer.push(lit[Math.floor(hash(tick * 97 + k) * lit.length)]);
    }
    if (!l) return;
    for (const i of shimmer) {
      const col = i % l.cols;
      const row = (i / l.cols) | 0;
      overprint(col, row, 1 + Math.floor(hash(i + shimmerAt) * (RAMP.length - 1)), tone[i]);
    }
  };

  /** The lantern: lifts the plate's hidden greys and warms what it touches. */
  const lantern = (now: number) => {
    if (!l || !field) return;
    cursor.on += ((cursor.in ? 1 : 0) - cursor.on) * 0.1;
    if (cursor.on < 0.02) return;
    const { cw, ch, cols, rows } = l;
    const R = Math.min(width, height) * 0.17 * (0.6 + 0.4 * cursor.on);
    const c0 = Math.max(0, Math.floor((cursor.x - R) / cw));
    const c1 = Math.min(cols - 1, Math.ceil((cursor.x + R) / cw));
    const r0 = Math.max(0, Math.floor((cursor.y - R) / ch));
    const r1 = Math.min(rows - 1, Math.ceil((cursor.y + R) / ch));
    const step = Math.floor(now / 90);
    for (let row = r0; row <= r1; row += 1) {
      for (let col = c0; col <= c1; col += 1) {
        const d = Math.hypot((col + 0.5) * cw - cursor.x, (row + 0.5) * ch - cursor.y);
        if (d >= R) continue;
        const i = row * cols + col;
        const k = (1 - d / R) ** 1.6 * cursor.on;
        const v = Math.max(field.v[i], field.raw[i] * 0.95 * k + field.v[i] * (1 - k) + k * 0.12 * field.mask[i]);
        if (v < 0.06) continue;
        let s = glyphFor(v, col, row);
        if (hash(i * 13 + step) < k * 0.14) s = 1 + Math.floor(hash(i + step) * (RAMP.length - 1));
        if (!s) continue;
        overprint(col, row, s, k > 0.34 ? Tone.Gold : k > 0.16 ? Tone.Bone : toneFor(v));
      }
    }
  };

  const doEmbers = (now: number, dt: number) => {
    if (!l) return;
    const want = width < 720 ? 8 : 16;
    while (embers.length < want && lit.length) {
      const i = lit[Math.floor(Math.random() * lit.length)];
      embers.push({
        x: ((i % l.cols) + 0.5) * l.cw,
        y: (((i / l.cols) | 0) + 0.5) * l.ch,
        vy: 10 + Math.random() * 22,
        sway: 4 + Math.random() * 10,
        phase: Math.random() * Math.PI * 2,
        born: now + Math.random() * 3000,
        life: 2600 + Math.random() * 3200,
        size: Math.random() < 0.3 ? 3 : 2,
        gold: Math.random() < 0.62,
      });
    }
    embers = embers.filter((e) => now - e.born < e.life);
    for (const e of embers) {
      const age = now - e.born;
      if (age < 0) continue;
      e.y -= e.vy * dt;
      const x = e.x + Math.sin(age / 700 + e.phase) * e.sway;
      const a = Math.sin(Math.PI * (age / e.life)) * (0.55 + 0.45 * Math.sin(age / 90 + e.phase));
      ctx.globalAlpha = clamp(a, 0, 1);
      ctx.fillStyle = e.gold ? inks.gold : pink;
      ctx.fillRect(Math.round(x), Math.round(e.y), e.size, e.size);
    }
    ctx.globalAlpha = 1;
  };

  const drawScribbles = (now: number, t: number) => {
    if (now < scribbleStart || !marks.length) return;
    const p = clamp((now - scribbleStart) / SCRIBBLE_MS, 0, 1);
    if (p < 1) {
      renderMarks(ctx, marks, { ink: inks.bone, paper: 'transparent' }, 0, Math.ceil(p * marks.length));
      return;
    }
    const sp = sprites[reduced ? 0 : Math.floor(t / BOIL) % 3];
    if (sp) ctx.drawImage(sp.c, sp.x, sp.y, sp.w, sp.h);
  };

  let lastNow = 0;
  const composite = (now: number) => {
    if (!base) return;
    const t = (now - start) / 1000;
    const dt = lastNow ? Math.min(0.1, (now - lastNow) / 1000) : 0;
    lastNow = now;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    if (now - revealStart < REVEAL_MS) {
      drawReveal(now);
    } else {
      ctx.clearRect(0, 0, width, height);
      ctx.drawImage(base, 0, 0, width, height);
      if (!reduced) {
        doShimmer(now);
        rays(t);
        lantern(now);
        doEmbers(now, dt);
      }
    }
    drawScribbles(now, t);
  };

  const tick = (now: number) => {
    if (destroyed || paused || !visible) return;
    const busy = now - scribbleStart < SCRIBBLE_MS;
    // Once everything is down, 30fps is plenty for what still moves.
    if (busy || now - lastIdle > 32) {
      lastIdle = now;
      composite(now);
    }
    frame = requestAnimationFrame(tick);
  };

  // --- wiring ----------------------------------------------------------------

  const onPointer = (e: PointerEvent) => {
    const rect = canvas.getBoundingClientRect();
    cursor.x = e.clientX - rect.left;
    cursor.y = e.clientY - rect.top;
    cursor.in = e.pointerType !== 'touch' && cursor.x >= 0 && cursor.y >= 0 && cursor.x <= rect.width && cursor.y <= rect.height;
  };
  const onLeave = () => {
    cursor.in = false;
  };

  const resume = () => {
    if (destroyed || paused || !visible || frame || reduced) return;
    frame = requestAnimationFrame(tick);
  };
  const halt = () => {
    cancelAnimationFrame(frame);
    frame = 0;
  };

  const still = () => {
    // Everything already down: no reveal, no scribble-in.
    revealStart = -Infinity;
    scribbleStart = -Infinity;
    composite(performance.now());
  };

  let resizeTimer = 0;
  const onResize = () => {
    window.clearTimeout(resizeTimer);
    resizeTimer = window.setTimeout(() => {
      const rect = canvas.getBoundingClientRect();
      // Mobile toolbars nudge the height on every scroll; that alone is not
      // worth re-printing the whole sheet for.
      if (Math.round(rect.width) === width && Math.abs(Math.round(rect.height) - height) < 80) return;
      halt();
      build();
      still();
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

  const go = () => {
    if (destroyed || !img.naturalWidth) return;
    build();
    if (reduced) still();
    else {
      observer.observe(canvas);
      window.addEventListener('pointermove', onPointer, { passive: true });
      document.documentElement.addEventListener('pointerleave', onLeave);
      window.addEventListener('blur', onLeave);
      resume();
    }
    window.addEventListener('resize', onResize);
    document.addEventListener('visibilitychange', onVisibility);
    hero?.setAttribute('data-ready', '');
  };

  // The glyphs are set in the mono face and the headline is measured for the
  // underline, so wait (briefly) for fonts as well as the plate itself.
  const settle = new Promise((r) => setTimeout(r, 900));
  const fonts = document.fonts
    ? Promise.all([document.fonts.ready, document.fonts.load(`600 14px ${mono}`)])
    : Promise.resolve();
  Promise.all([img.decode().catch(() => undefined), Promise.race([fonts, settle])]).then(go, go);

  return {
    destroy: () => {
      destroyed = true;
      halt();
      observer.disconnect();
      window.removeEventListener('pointermove', onPointer);
      document.documentElement.removeEventListener('pointerleave', onLeave);
      window.removeEventListener('blur', onLeave);
      window.removeEventListener('resize', onResize);
      document.removeEventListener('visibilitychange', onVisibility);
    },
  };
}
