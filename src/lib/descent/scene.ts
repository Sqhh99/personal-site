/**
 * The landing: a descent through seven levels, one Doré plate each, printed
 * in two inks by ordered dither (see `gl.ts`). One plate fills the screen;
 * the sigils, the arrow keys, the digits 1–7 or a sideways swipe move between
 * them, and left alone the page goes down a level every so often by itself.
 *
 * The first plate is lit from black as soon as it has loaded; the rest load
 * when the browser is idle. Without WebGL the current plate is dithered once
 * on the CPU and simply reprinted on a change. With reduced motion there is
 * no candle, lantern, dust, drift or autoplay — just the print, and an
 * instant change of plate.
 */

import { createPrinter, MOTES, type Printer } from './gl';
import { BAYER8, LEVELS, PLATES, type Plate } from './plates';

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
/** How long a plate stays when no one is touching anything. */
const DWELL_MS = 20000;
/** …and how long the page keeps its hands off after someone does. */
const HOLD_MS = 30000;

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
const ease = (t: number) => (t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2);

/** Where the plate sits on the screen: uv = p · [sx, sy] + [ox, oy]. */
function place(plate: Plate, aspect: number, screen: number, zoom: number, pan: readonly [number, number]) {
  let fx = 1;
  let fy = 1;
  if (screen > aspect) fy = aspect / screen;
  else fx = screen / aspect;
  fx /= FIT * zoom;
  fy /= FIT * zoom;
  const centre = (f: number, focus: number, d: number) => (f >= 1 ? 0.5 : clamp(focus + d, f / 2, 1 - f / 2));
  const cx = centre(fx, plate.focus[0], pan[0]);
  const cy = centre(fy, plate.focus[1], pan[1]);
  return [fx, fy, cx - fx / 2, cy - fy / 2] as const;
}

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
  const buttons = Array.from(root.querySelectorAll<HTMLButtonElement>('[data-level]'));
  if (!canvas) return { destroy: () => undefined };

  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const css = getComputedStyle(root);
  const inks = { ink: css.getPropertyValue('--umber') || '#9a8264', dark: css.getPropertyValue('--bg') || '#110e0b' };
  const printer: Printer | null = createPrinter(canvas, inks);
  const flat = printer ? null : canvas.getContext('2d');

  const images: Array<Promise<HTMLImageElement> | undefined> = [];
  const textures: Array<WebGLTexture | undefined> = [];
  const aspects: number[] = [];

  let cols = 0;
  let rows = 0;
  let cellCss = CELL;
  let width = 0;
  let height = 0;

  const fromHash = LEVELS.indexOf(location.hash.slice(1) as (typeof LEVELS)[number]);
  let cur = fromHash >= 0 ? fromHash : 0;
  let prev = -1;
  let curShown = 0;
  let prevShown = 0;
  let mixStart = 0;
  let mixMs = IGNITE_MS;
  let pending = -1;
  let lit = false;
  let lastInput = -Infinity;

  const lamp = { x: 0, y: 0, tx: 0, ty: 0, s: 0, in: false };
  let motes: Mote[] = [];
  const moteBuf = new Float32Array(MOTES * 3);

  let frame = 0;
  let lastDraw = 0;
  let lastTick = 0;
  let paused = document.hidden;
  let visible = true;
  let destroyed = false;

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

  const zoomAt = (shown: number, now: number) => (reduced ? 1 : 1 + DRIFT * ease(clamp((now - shown) / (DWELL_MS + DESCENT_MS), 0, 1)));
  const panAt = (now: number): [number, number] =>
    reduced ? [0, 0] : [Math.sin(now / 21000) * 0.012, Math.sin(now / 27000 + 1.3) * 0.008];

  // --- the still print, for browsers without WebGL ---------------------------

  const printStill = async () => {
    if (!flat || !cols) return;
    const img = await load(cur);
    const src = document.createElement('canvas');
    src.width = img.naturalWidth;
    src.height = img.naturalHeight;
    const g = src.getContext('2d', { willReadFrequently: true })!;
    g.drawImage(img, 0, 0);
    const px = g.getImageData(0, 0, src.width, src.height).data;
    const plate = PLATES[cur];
    const [sx, sy, ox, oy] = place(plate, aspects[cur], cols / rows, 1, [0, 0]);
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

  const spawn = (now: number): Mote => ({
    x: Math.random() * cols,
    y: rows * (0.25 + Math.random() * 0.8),
    vy: -(1.5 + Math.random() * 3.5),
    sway: 1 + Math.random() * 3,
    phase: Math.random() * Math.PI * 2,
    born: now - Math.random() * 4000,
    life: 5000 + Math.random() * 7000,
  });

  const draw = (now: number) => {
    if (!printer || textures[cur] === undefined) return;
    const t = reduced ? 1 : clamp((now - mixStart) / mixMs, 0, 1);
    const screen = cols / rows;
    const pan = panAt(now);
    const to = PLATES[cur];
    const from = prev >= 0 && t < 1 ? PLATES[prev] : to;
    const fromTex = prev >= 0 ? textures[prev]! : printer.black;

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
      from: t < 1 ? fromTex : textures[cur]!,
      to: textures[cur]!,
      fromXf: place(from, aspects[prev >= 0 ? prev : cur], screen, zoomAt(prevShown, now), pan),
      toXf: place(to, aspects[cur], screen, zoomAt(curShown, now), pan),
      fromTone: from.tone,
      toTone: to.tone,
      mix: t,
      time: now / 1000,
      live: reduced ? 0 : 1,
      lamp: [lamp.x, lamp.y, Math.min(cols, rows) * 0.2, lamp.s],
      motes: moteBuf,
    });
    lastDraw = now;
  };

  const tick = (now: number) => {
    frame = 0;
    if (destroyed || paused || !visible) return;
    const dt = Math.min(0.1, (now - (lastTick || now)) / 1000);
    lastTick = now;
    const moving = now - mixStart < mixMs;

    if (!moving && pending >= 0) {
      const next = pending;
      pending = -1;
      go(next);
    } else if (!moving && lit && now - curShown > DWELL_MS && now - lastInput > HOLD_MS) {
      go((cur + 1) % PLATES.length);
    }

    lamp.x += (lamp.tx - lamp.x) * Math.min(1, dt * 9);
    lamp.y += (lamp.ty - lamp.y) * Math.min(1, dt * 9);
    lamp.s += ((lamp.in ? 1 : 0) - lamp.s) * Math.min(1, dt * 3);

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

  // --- changing level ----------------------------------------------------------

  const sync = () => {
    root.dataset.level = PLATES[cur].id;
    buttons.forEach((b, i) => b.setAttribute('aria-pressed', String(i === cur)));
  };

  const go = (i: number) => {
    const now = performance.now();
    if (i === cur || destroyed) return;
    // Mid-descent, remember only the last place asked for.
    if (frame && now - mixStart < mixMs) {
      pending = i;
      return;
    }
    load(i).then(() => {
      if (destroyed) return;
      const t = performance.now();
      prev = cur;
      prevShown = curShown;
      cur = i;
      curShown = t;
      mixStart = t;
      mixMs = DESCENT_MS;
      sync();
      history.replaceState(null, '', `#${PLATES[i].id}`);
      if (printer) draw(t);
      else void printStill();
    }, () => undefined);
  };

  const step = (d: number) => {
    lastInput = performance.now();
    go((cur + d + PLATES.length) % PLATES.length);
  };

  // --- wiring --------------------------------------------------------------------

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
  };

  const onPointer = (e: PointerEvent) => {
    if (e.pointerType === 'touch') return;
    const rect = canvas.getBoundingClientRect();
    lamp.tx = (e.clientX - rect.left) / cellCss;
    lamp.ty = (e.clientY - rect.top) / cellCss;
    if (!lamp.in) {
      lamp.x = lamp.tx;
      lamp.y = lamp.ty;
    }
    lamp.in = lamp.ty >= 0 && lamp.ty <= rows;
  };
  const onLeave = () => {
    lamp.in = false;
  };

  const onKey = (e: KeyboardEvent) => {
    if (e.defaultPrevented || e.metaKey || e.ctrlKey || e.altKey) return;
    const el = e.target as HTMLElement | null;
    if (el?.closest('input, textarea, select, [contenteditable]')) return;
    if (document.getElementById('site-header')?.dataset.open === 'true') return;
    if (e.key === 'ArrowRight') step(1);
    else if (e.key === 'ArrowLeft') step(-1);
    else if (/^[1-7]$/.test(e.key)) {
      lastInput = performance.now();
      go(Number(e.key) - 1);
    } else return;
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
    const i = LEVELS.indexOf(location.hash.slice(1) as (typeof LEVELS)[number]);
    if (i >= 0) {
      lastInput = performance.now();
      go(i);
    }
  };

  const clicks = buttons.map((b, i) => {
    const fn = () => {
      lastInput = performance.now();
      go(i);
    };
    b.addEventListener('click', fn);
    return fn;
  });

  let resizeTimer = 0;
  const onResize = () => {
    window.clearTimeout(resizeTimer);
    resizeTimer = window.setTimeout(() => {
      const rect = root.getBoundingClientRect();
      // Mobile toolbars nudge the height on every scroll; not worth a reprint.
      if (Math.round(rect.width) === width && Math.abs(Math.round(rect.height) - height) < 80) return;
      measure();
      motes = motes.map(() => spawn(performance.now()));
      if (printer) draw(performance.now());
      else void printStill();
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

  const idle = (fn: () => void) =>
    typeof window.requestIdleCallback === 'function' ? window.requestIdleCallback(fn, { timeout: 3000 }) : setTimeout(fn, 1200);

  measure();
  sync();
  load(cur).then(
    () => {
      if (destroyed) return;
      const now = performance.now();
      curShown = now;
      mixStart = now;
      lit = true;
      root.setAttribute('data-ready', '');
      if (printer) {
        motes = Array.from({ length: width < 720 ? MOTES / 2 : MOTES }, () => spawn(now));
        draw(now);
        resume();
      } else void printStill();
      // Then the other six, nearest first, while nothing else is happening.
      idle(() => {
        for (let k = 1; k < PLATES.length; k += 1) void load((cur + k) % PLATES.length).catch(() => undefined);
      });
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
      buttons.forEach((b, i) => b.removeEventListener('click', clicks[i]));
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
