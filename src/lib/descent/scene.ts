/**
 * The landing: a descent through seven planets, three Doré plates each,
 * printed in two inks by ordered dither (see `gl.ts`). One plate fills the
 * screen. ←/→ or a sideways swipe step through all twenty-one; ↑/↓, the
 * sigils or the digits 1–7 move a whole planet; the ticks under a sigil pick
 * a plate within it; L lays the legend in or takes it away. Left alone the
 * page goes down a plate every so often by itself, and the furniture steps
 * aside (`chrome.ts`).
 *
 * With no plate named in the address, the page opens on the planet that
 * rules the day. The first plate is lit from black as soon as it has loaded;
 * its neighbours load when the browser is idle, the rest when asked for.
 * Without WebGL the current plate is dithered once on the CPU and simply
 * reprinted on a change. With reduced motion there is no candle, lantern,
 * dust, drift or autoplay — just the print, and an instant change of plate.
 */

import { createChrome, createMasks } from './chrome';
import { createPrinter, MOTES, type Printer } from './gl';
import { createLegend } from './legend';
import { BAYER8, chapterStart, parseHash, PLANETS, PLATES, todayPlanet, type Planet, type Plate } from './plates';

export interface DescentHandle {
  destroy: () => void;
}

/** CSS px per dither cell — rounded to whole device pixels, so 2 on an
 *  ordinary screen and 1.5 on a retina one. */
const CELL = 1.5;
/** How much of a cover-crop to show: 1 runs the plate to every edge of the
 *  screen, as the prints in the reference do. */
const FIT = 1;
/** The slow push-in over a plate's stay. */
const DRIFT = 0.04;
const IGNITE_MS = 1900;
const DESCENT_MS = 1500;
/** How long a plate stays when no one is touching anything… */
const DWELL_MS = 20000;
/** …or when its legend is open and someone may be reading. */
const DWELL_READING_MS = 28000;
/** …and how long the page keeps its hands off after someone does. */
const HOLD_MS = 30000;
/** With no pointer moving for this long, the lantern goes wandering… */
const WANDER_IDLE_MS = 6000;
/** …and rests this long at each thing worth seeing in the plate. */
const WANDER_STEP_MS = 5000;

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
const ease = (t: number) => (t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2);
const approach = (v: number, to: number, rate: number, dt: number) => v + (to - v) * Math.min(1, dt * rate);

type Xf = readonly [number, number, number, number];
type Box = [number, number, number, number];

/** Where the plate sits on the screen: uv = p · [sx, sy] + [ox, oy]. */
function place(plate: Plate, aspect: number, screen: number, zoom: number, pan: readonly [number, number]): Xf {
  let fx = 1;
  let fy = 1;
  if (screen > aspect) fy = aspect / screen;
  else fx = screen / aspect;
  fx /= FIT * zoom;
  fy /= FIT * zoom;
  const centre = (f: number, focus: number, d: number) => (f >= 1 ? 0.5 : clamp(focus + d, f / 2, 1 - f / 2));
  const cx = centre(fx, plate.focus[0], pan[0]);
  const cy = centre(fy, plate.focus[1], pan[1]);
  return [fx, fy, cx - fx / 2, cy - fy / 2];
}

/** A point in the plate to the screen, held inside it. */
const toScreen = ([sx, sy, ox, oy]: Xf, [u, v]: readonly [number, number]): [number, number] => [
  clamp((u - ox) / sx, 0.04, 0.96),
  clamp((v - oy) / sy, 0.04, 0.96),
];

interface Mote {
  x: number;
  y: number;
  vy: number;
  sway: number;
  phase: number;
  born: number;
  life: number;
}

export function initDescent(root: HTMLElement): DescentHandle {
  const canvas = root.querySelector<HTMLCanvasElement>('canvas');
  const bar = root.querySelector<HTMLElement>('.descent-bar');
  const sigils = Array.from(root.querySelectorAll<HTMLButtonElement>('.descent-sigil'));
  const ticks = Array.from(root.querySelectorAll<HTMLButtonElement>('.descent-tick'));
  if (!canvas || !bar) return { destroy: () => undefined };

  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const css = getComputedStyle(root);
  const inks = { ink: css.getPropertyValue('--umber') || '#9a8264', dark: css.getPropertyValue('--bg') || '#110e0b' };
  const printer: Printer | null = createPrinter(canvas, inks);
  const flat = printer ? null : canvas.getContext('2d');
  if (printer) root.dataset.gl = '';

  const images: Array<Promise<HTMLImageElement> | undefined> = [];
  const textures: Array<WebGLTexture | undefined> = [];
  const aspects: number[] = [];

  let cols = 0;
  let rows = 0;
  let cellCss = CELL;
  let width = 0;
  let height = 0;

  const fromHash = parseHash(location.hash);
  let cur = fromHash >= 0 ? fromHash : chapterStart(todayPlanet());
  let prev = -1;
  let dir = 1;
  let curShown = 0;
  let prevShown = 0;
  let mixStart = 0;
  let mixMs = IGNITE_MS;
  let pending: { i: number; dir: number } | null = null;
  let lit = false;
  let lastInput = -Infinity;
  /** Set once the visitor has changed plate, so the bar stays put through
   *  the descents they start. */
  let asked = false;

  // The lantern follows the pointer while it moves, and wanders the plate's
  // points of interest when it doesn't.
  const lamp = { x: 0, y: 0, tx: 0, ty: 0, s: 0, ts: 0 };
  let lastPointer = -Infinity;
  let pointerIn = false;
  const wander = { k: 0, since: 0 };
  let motes: Mote[] = [];
  const moteBuf = new Float32Array(MOTES * 3);
  /** The current plate's light, in screen fractions. */
  let source: [number, number] = [0.5, 0.4];

  // The legend's veil, eased so the plate sinks away under it and comes back.
  const veil = { box: [0, 0, 0, 0] as Box, target: [0, 0, 0, 0] as Box, amt: 0, to: 0 };
  let foot = 1;

  let frame = 0;
  let lastDraw = 0;
  let lastTick = 0;
  let paused = document.hidden;
  let visible = true;
  let destroyed = false;

  const masks = createMasks(reduced);

  // --- plates ----------------------------------------------------------------

  const load = (i: number) => {
    images[i] ??= new Promise<HTMLImageElement>((resolve, reject) => {
      const img = new Image();
      img.decoding = 'async';
      img.onload = () => {
        aspects[i] = img.naturalWidth / img.naturalHeight;
        if (printer) textures[i] = printer.upload(img);
        resolve(img);
      };
      img.onerror = reject;
      img.src = PLATES[i].src;
    });
    return images[i];
  };
  const prefetch = (i: number) => void load((i + PLATES.length) % PLATES.length).catch(() => undefined);

  const idle = (fn: () => void) =>
    typeof window.requestIdleCallback === 'function' ? window.requestIdleCallback(fn, { timeout: 3000 }) : setTimeout(fn, 1200);

  /** The plates either side, and the head of the next planet. */
  const neighbours = () =>
    idle(() => {
      prefetch(cur + 1);
      prefetch(cur - 1);
      const next = PLANETS[(PLANETS.indexOf(PLATES[cur].planet) + 1) % PLANETS.length];
      prefetch(chapterStart(next));
    });

  const zoomAt = (shown: number, now: number) => (reduced ? 1 : 1 + DRIFT * ease(clamp((now - shown) / (DWELL_MS + DESCENT_MS), 0, 1)));
  const panAt = (now: number): [number, number] =>
    reduced ? [0, 0] : [Math.sin(now / 21000) * 0.012, Math.sin(now / 27000 + 1.3) * 0.008];
  const xfAt = (i: number, shown: number, now: number) =>
    place(PLATES[i], aspects[i] ?? 0.75, cols / rows, zoomAt(shown, now), panAt(now));

  // --- the still print, for browsers without WebGL ---------------------------

  const printStill = async () => {
    if (!flat || !cols) return;
    const i = cur;
    const img = await load(i);
    if (i !== cur) return;
    const src = document.createElement('canvas');
    src.width = img.naturalWidth;
    src.height = img.naturalHeight;
    const g = src.getContext('2d', { willReadFrequently: true })!;
    g.drawImage(img, 0, 0);
    const px = g.getImageData(0, 0, src.width, src.height).data;
    const plate = PLATES[i];
    const [sx, sy, ox, oy] = place(plate, aspects[i], cols / rows, 1, [0, 0]);
    const [lo, hi, gamma] = plate.tone;
    const out = flat.createImageData(cols, rows);
    const ink = [0, 1, 2].map((k) => parseInt(inks.ink.trim().slice(1 + k * 2, 3 + k * 2), 16));
    const dark = [0, 1, 2].map((k) => parseInt(inks.dark.trim().slice(1 + k * 2, 3 + k * 2), 16));
    const edge = (t: number) => clamp(Math.min(t, 1 - t) / 0.04, 0, 1);
    for (let r = 0; r < rows; r += 1) {
      for (let c = 0; c < cols; c += 1) {
        const u = ((c + 0.5) / cols) * sx + ox;
        const v = ((r + 0.5) / rows) * sy + oy;
        const x = clamp(Math.floor(u * src.width), 0, src.width - 1);
        const y = clamp(Math.floor(v * src.height), 0, src.height - 1);
        const l = (px[(y * src.width + x) * 4] / 255) * edge(u) * edge(v);
        const t = Math.pow(clamp((l - lo) / (hi - lo), 0, 1), gamma);
        const on = t > BAYER8[(r % 8) * 8 + (c % 8)];
        out.data.set(on ? ink : dark, (r * cols + c) * 4);
        out.data[(r * cols + c) * 4 + 3] = 255;
      }
    }
    canvas.width = cols;
    canvas.height = rows;
    flat.putImageData(out, 0, 0);
  };

  // --- the live print ----------------------------------------------------------

  /** Dust rises from where the plate's light is; `scatter` spreads a fresh
   *  batch up the whole column instead, so it doesn't arrive all at once. */
  const spawn = (now: number, scatter = false): Mote => ({
    x: (source[0] + (Math.random() - 0.5) * 0.24) * cols,
    y: (scatter ? Math.random() : source[1] + Math.random() * 0.35) * rows,
    vy: -(1.5 + Math.random() * 3.5),
    sway: 1 + Math.random() * 3,
    phase: Math.random() * Math.PI * 2,
    born: now - Math.random() * 4000,
    life: 5000 + Math.random() * 7000,
  });

  const draw = (now: number) => {
    if (!printer || textures[cur] === undefined) return;
    const t = reduced ? 1 : clamp((now - mixStart) / mixMs, 0, 1);
    const fromI = prev >= 0 && t < 1 ? prev : cur;
    const toXf = xfAt(cur, curShown, now);
    const fromXf = fromI === cur ? toXf : xfAt(fromI, prevShown, now);
    source = toScreen(toXf, PLATES[cur].light[0]);

    moteBuf.fill(0);
    if (!reduced) {
      motes.forEach((m, i) => {
        const age = (now - m.born) / m.life;
        moteBuf[i * 3] = m.x + Math.sin(now / 900 + m.phase) * m.sway;
        moteBuf[i * 3 + 1] = m.y;
        moteBuf[i * 3 + 2] = Math.sin(Math.PI * clamp(age, 0, 1)) * 0.9;
      });
    }

    printer.draw({
      from: t < 1 ? (prev >= 0 ? textures[prev]! : printer.black) : textures[cur]!,
      to: textures[cur]!,
      fromXf,
      toXf,
      fromTone: PLATES[fromI].tone,
      toTone: PLATES[cur].tone,
      mix: t,
      dir,
      toLight: source,
      veil: veil.box,
      veilAmt: reduced ? veil.to : veil.amt,
      foot: reduced ? (chrome.shown() ? 1 : 0) : foot,
      time: now / 1000,
      live: reduced ? 0 : 1,
      lamp: [lamp.x, lamp.y, Math.min(cols, rows) * 0.2, lamp.s],
      motes: moteBuf,
    });
    lastDraw = now;
  };

  const reprint = () => {
    if (printer) draw(performance.now());
    else void printStill();
  };

  const steerLamp = (now: number, dt: number) => {
    const wandering = !pointerIn || now - lastPointer > WANDER_IDLE_MS;
    if (wandering) {
      const points = PLATES[cur].light;
      if (now - wander.since > WANDER_STEP_MS) {
        wander.k = (wander.k + 1) % points.length;
        wander.since = now;
      }
      const [x, y] = toScreen(xfAt(cur, curShown, now), points[wander.k]);
      lamp.tx = x * cols;
      lamp.ty = y * rows;
      lamp.ts = 0.6;
    } else lamp.ts = 1;
    const follow = wandering ? 0.8 : 9;
    lamp.x = approach(lamp.x, lamp.tx, follow, dt);
    lamp.y = approach(lamp.y, lamp.ty, follow, dt);
    lamp.s = approach(lamp.s, lamp.ts, 3, dt);
  };

  const tick = (now: number) => {
    frame = 0;
    if (destroyed || paused || !visible) return;
    const dt = Math.min(0.1, (now - (lastTick || now)) / 1000);
    lastTick = now;
    const moving = now - mixStart < mixMs;
    const dwell = legend.open() ? DWELL_READING_MS : DWELL_MS;

    if (!moving && pending) {
      const next = pending;
      pending = null;
      go(next.i, next.dir);
    } else if (!moving && lit && now - curShown > dwell && now - lastInput > HOLD_MS) {
      go((cur + 1) % PLATES.length, 1);
    } else if (lit && now - curShown > dwell * 0.6) prefetch(cur + 1);

    steerLamp(now, dt);
    veil.amt = approach(veil.amt, veil.to, 4, dt);
    veil.box = veil.box.map((v, k) => approach(v, veil.target[k], 6, dt)) as Box;
    foot = approach(foot, chrome.shown() ? 1 : 0, 2.5, dt);

    motes = motes.map((m) => {
      if (now - m.born > m.life) return spawn(now);
      m.y += m.vy * dt;
      return m;
    });

    // The candle is slow; 30fps is plenty once nothing is changing plate.
    if (moving || now - lastDraw > 32) draw(now);
    frame = requestAnimationFrame(tick);
  };

  const resume = () => {
    if (destroyed || paused || !visible || frame || reduced || !printer) return;
    lastTick = 0;
    frame = requestAnimationFrame(tick);
  };
  const halt = () => {
    cancelAnimationFrame(frame);
    frame = 0;
  };

  // --- changing plate ----------------------------------------------------------

  const sync = () => {
    const plate = PLATES[cur];
    root.dataset.level = plate.id;
    root.dataset.planet = plate.planet;
    sigils.forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.planet === plate.planet)));
    ticks.forEach((b) => {
      b.setAttribute('aria-pressed', String(b.dataset.plate === plate.id));
      // Only the planet you are in offers its plates; the rest are marks.
      b.tabIndex = b.dataset.planet === plate.planet ? 0 : -1;
    });
  };

  const go = (i: number, d = Math.sign(i - cur) || 1) => {
    const now = performance.now();
    if (i < 0 || i === cur || destroyed) return;
    // Mid-descent, remember only the last place asked for.
    if (frame && now - mixStart < mixMs) {
      pending = { i, dir: d };
      return;
    }
    load(i).then(() => {
      if (destroyed) return;
      const t = performance.now();
      prev = cur;
      prevShown = curShown;
      cur = i;
      dir = d;
      curShown = t;
      mixStart = t;
      mixMs = DESCENT_MS;
      wander.k = 0;
      wander.since = t;
      sync();
      legend.show(i, reduced ? 0 : DESCENT_MS);
      history.replaceState(null, '', `#${PLATES[i].id}`);
      if (printer && !reduced) {
        source = toScreen(xfAt(i, t, t), PLATES[i].light[0]);
        motes = motes.map(() => spawn(t, true));
      }
      reprint();
      neighbours();
    }, () => undefined);
  };

  const touch = () => {
    lastInput = performance.now();
    asked = true;
  };
  const step = (d: number) => {
    touch();
    go((cur + d + PLATES.length) % PLATES.length, d);
  };
  const planet = (d: number) => {
    touch();
    const k = (PLANETS.indexOf(PLATES[cur].planet) + d + PLANETS.length) % PLANETS.length;
    go(chapterStart(PLANETS[k]), d);
  };

  // --- wiring --------------------------------------------------------------------

  const chrome = createChrome(root, bar, {
    masks,
    // Checked against the clock, not the frame loop, which reduced motion
    // never starts.
    busy: () => asked && performance.now() - mixStart < mixMs,
    onChange: () => {
      if (reduced) reprint();
    },
  });

  /** The legend's box in screen fractions, padded so the type has room. */
  const measureVeil = () => {
    const box = legend.box();
    veil.to = box ? 1 : 0;
    if (!box || !cols) return;
    const r = canvas.getBoundingClientRect();
    const w = cols * cellCss;
    const h = rows * cellCss;
    const pad = 28;
    veil.target = [(box.left - r.left - pad) / w, (box.top - r.top - pad) / h, (box.right - r.left + pad) / w, (box.bottom - r.top + pad) / h];
    // Opening from nothing, the box is already where it will be; only the
    // depth of the veil eases.
    if (veil.amt < 0.01 || reduced) veil.box = [...veil.target];
  };

  const legend = createLegend(root, {
    masks,
    onChange: () => {
      measureVeil();
      if (reduced || !frame) reprint();
    },
  });

  const measure = () => {
    const rect = root.getBoundingClientRect();
    width = Math.round(rect.width);
    height = Math.round(rect.height);
    const dpr = window.devicePixelRatio || 1;
    const device = Math.max(1, Math.round(CELL * dpr));
    cellCss = device / dpr;
    cols = Math.ceil(width / cellCss);
    rows = Math.ceil(height / cellCss);
    // Exactly whole cells, so the CSS scale-up never doubles a column.
    canvas.style.width = `${cols * cellCss}px`;
    canvas.style.height = `${rows * cellCss}px`;
    printer?.resize(cols, rows);
    masks.resize(cellCss, device);
    measureVeil();
  };

  const onPointer = (e: PointerEvent) => {
    if (e.pointerType === 'touch') return;
    const rect = canvas.getBoundingClientRect();
    lamp.tx = (e.clientX - rect.left) / cellCss;
    lamp.ty = (e.clientY - rect.top) / cellCss;
    pointerIn = lamp.ty >= 0 && lamp.ty <= rows;
    lastPointer = performance.now();
  };
  const onLeave = () => {
    pointerIn = false;
  };

  const onKey = (e: KeyboardEvent) => {
    if (e.defaultPrevented || e.metaKey || e.ctrlKey || e.altKey) return;
    const el = e.target as HTMLElement | null;
    if (el?.closest('input, textarea, select, [contenteditable]')) return;
    if (document.getElementById('site-header')?.dataset.open === 'true') return;
    if (e.key === 'ArrowRight') step(1);
    else if (e.key === 'ArrowLeft') step(-1);
    else if (e.key === 'ArrowDown') planet(1);
    else if (e.key === 'ArrowUp') planet(-1);
    else if (/^[1-7]$/.test(e.key)) {
      touch();
      go(chapterStart(PLANETS[Number(e.key) - 1]));
    } else if (e.key === 'l' || e.key === 'L') legend.toggle();
    else return;
    e.preventDefault();
  };

  let swipe: { x: number; y: number } | null = null;
  const onDown = (e: PointerEvent) => {
    if (e.pointerType === 'touch') swipe = { x: e.clientX, y: e.clientY };
  };
  const onUp = (e: PointerEvent) => {
    if (!swipe) return;
    const dx = e.clientX - swipe.x;
    const dy = e.clientY - swipe.y;
    swipe = null;
    if (Math.abs(dx) > 48 && Math.abs(dx) > Math.abs(dy) * 1.5) step(dx < 0 ? 1 : -1);
  };

  const onHash = () => {
    const i = parseHash(location.hash);
    if (i >= 0) {
      touch();
      go(i);
    }
  };

  const clicks: Array<[HTMLButtonElement, () => void]> = [
    ...sigils.map((b): [HTMLButtonElement, () => void] => [
      b,
      () => {
        touch();
        go(chapterStart(b.dataset.planet as Planet));
      },
    ]),
    ...ticks.map((b): [HTMLButtonElement, () => void] => [
      b,
      () => {
        touch();
        go(parseHash(b.dataset.plate ?? ''));
      },
    ]),
  ];
  clicks.forEach(([b, fn]) => b.addEventListener('click', fn));

  let resizeTimer = 0;
  const onResize = () => {
    window.clearTimeout(resizeTimer);
    resizeTimer = window.setTimeout(() => {
      const rect = root.getBoundingClientRect();
      // Mobile toolbars nudge the height on every scroll; not worth a reprint.
      if (Math.round(rect.width) === width && Math.abs(Math.round(rect.height) - height) < 80) return;
      measure();
      motes = motes.map(() => spawn(performance.now(), true));
      reprint();
    }, 200);
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

  measure();
  sync();
  legend.show(cur);
  load(cur).then(
    () => {
      if (destroyed) return;
      const now = performance.now();
      curShown = now;
      mixStart = now;
      wander.since = now;
      lit = true;
      root.setAttribute('data-ready', '');
      if (printer) {
        source = toScreen(xfAt(cur, now, now), PLATES[cur].light[0]);
        lamp.x = lamp.tx = source[0] * cols;
        lamp.y = lamp.ty = source[1] * rows;
        motes = Array.from({ length: width < 720 ? MOTES / 2 : MOTES }, () => spawn(now, true));
        draw(now);
        resume();
      } else void printStill();
      neighbours();
    },
    () => root.setAttribute('data-ready', ''),
  );

  observer.observe(root);
  window.addEventListener('pointermove', onPointer, { passive: true });
  document.documentElement.addEventListener('pointerleave', onLeave);
  window.addEventListener('blur', onLeave);
  window.addEventListener('keydown', onKey);
  window.addEventListener('hashchange', onHash);
  root.addEventListener('pointerdown', onDown);
  root.addEventListener('pointerup', onUp);
  window.addEventListener('resize', onResize);
  document.addEventListener('visibilitychange', onVisibility);

  return {
    destroy: () => {
      destroyed = true;
      halt();
      observer.disconnect();
      chrome.destroy();
      legend.destroy();
      clicks.forEach(([b, fn]) => b.removeEventListener('click', fn));
      window.removeEventListener('pointermove', onPointer);
      document.documentElement.removeEventListener('pointerleave', onLeave);
      window.removeEventListener('blur', onLeave);
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('hashchange', onHash);
      root.removeEventListener('pointerdown', onDown);
      root.removeEventListener('pointerup', onUp);
      window.removeEventListener('resize', onResize);
      document.removeEventListener('visibilitychange', onVisibility);
    },
  };
}
