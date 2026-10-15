/**
 * The furniture of the landing — the bar of sigils and the header's "Menu" —
 * steps out of the way when no one is using it, and comes back at a touch.
 *
 * It leaves the way the plate itself is printed: by ordered dither. Nine
 * masks, each an 8×8 Bayer tile with 0, 8, 16 … 64 of its cells open, are
 * stepped through in turn, so the bar breaks up into the same grain, at the
 * same cell size, as the picture behind it. With reduced motion it simply
 * fades.
 */

import { BAYER8 } from './plates';

const STEPS = 8;

export interface Masks {
  /** Redraw the tiles for a new cell size (CSS px, and device px). */
  resize: (cellCss: number, cellDevice: number) => void;
  /** Dissolve elements in or out, one dither level at a time. Elements after
   *  the first start `stagger` ms later each. */
  run: (els: readonly HTMLElement[], dir: 'in' | 'out', ms: number, stagger?: number) => Promise<void>;
}

export function createMasks(reduced: boolean): Masks {
  let tiles: string[] = [];
  let size = 12;
  const timers = new WeakMap<HTMLElement, number>();

  const set = (el: HTMLElement, level: number) => {
    const s = el.style;
    if (level >= STEPS) {
      s.removeProperty('mask-image');
      s.removeProperty('-webkit-mask-image');
      s.visibility = '';
      return;
    }
    s.visibility = level <= 0 ? 'hidden' : '';
    const url = `url(${tiles[Math.max(0, level)]})`;
    s.setProperty('mask-image', url);
    s.setProperty('-webkit-mask-image', url);
    s.setProperty('mask-size', `${size}px ${size}px`);
    s.setProperty('-webkit-mask-size', `${size}px ${size}px`);
  };

  return {
    resize(cellCss, cellDevice) {
      size = cellCss * 8;
      const c = document.createElement('canvas');
      c.width = c.height = cellDevice * 8;
      const g = c.getContext('2d');
      if (!g) return;
      tiles = Array.from({ length: STEPS + 1 }, (_, k) => {
        g.clearRect(0, 0, c.width, c.height);
        g.fillStyle = '#000';
        for (let i = 0; i < 64; i += 1) {
          if (BAYER8[i] * 64 < k * 8) g.fillRect((i % 8) * cellDevice, Math.floor(i / 8) * cellDevice, cellDevice, cellDevice);
        }
        return c.toDataURL();
      });
    },
    run(els, dir, ms, stagger = 0) {
      // With reduced motion the stylesheet fades instead.
      if (reduced || !tiles.length) return Promise.resolve();
      return Promise.all(
        els.map(
          (el, n) =>
            new Promise<void>((resolve) => {
              window.clearTimeout(timers.get(el));
              // Coming in, the first level shows at once, so a Tab pressed to
              // wake the bar can already land in it.
              let k = dir === 'in' && n === 0 ? 1 : 0;
              const tick = () => {
                k += 1;
                set(el, dir === 'in' ? k : STEPS - k);
                if (k < STEPS) timers.set(el, window.setTimeout(tick, ms / STEPS));
                else resolve();
              };
              set(el, dir === 'in' ? k : STEPS);
              timers.set(el, window.setTimeout(tick, n * stagger));
            }),
        ),
      ).then(() => undefined);
    },
  };
}

export interface Chrome {
  /** Someone did something: show the furniture and restart the idle clock. */
  poke: () => void;
  shown: () => boolean;
  destroy: () => void;
}

interface ChromeOptions {
  masks: Masks;
  /** Never hide while this is true (a descent the visitor started, say). */
  busy?: () => boolean;
  onChange?: (shown: boolean) => void;
}

/** How long the furniture waits before it goes. */
const IDLE_MS = 3500;
const DISSOLVE_MS = 420;
/** Mouse travel, in CSS px, that counts as someone being there. */
const NUDGE_PX = 24;

export function createChrome(root: HTMLElement, bar: HTMLElement, { masks, busy, onChange }: ChromeOptions): Chrome {
  const header = document.getElementById('site-header');
  const menu = document.getElementById('menu-toggle');
  const parts = [bar, ...(menu ? [menu] : [])];
  let shown = true;
  let hovering = false;
  let timer = 0;
  let travel = 0;
  let last: { x: number; y: number } | null = null;

  const state = (v: boolean) => {
    root.dataset.chrome = v ? 'shown' : 'hidden';
    document.documentElement.dataset.descentChrome = v ? 'shown' : 'hidden';
  };

  const holding = () =>
    hovering ||
    bar.contains(document.activeElement) ||
    (menu !== null && menu === document.activeElement) ||
    header?.dataset.open === 'true' ||
    (busy?.() ?? false);

  const hide = () => {
    if (!shown) return;
    if (holding()) {
      schedule();
      return;
    }
    shown = false;
    state(false);
    onChange?.(false);
    void masks.run(parts, 'out', DISSOLVE_MS);
  };

  const schedule = () => {
    window.clearTimeout(timer);
    timer = window.setTimeout(hide, IDLE_MS);
  };

  const poke = () => {
    schedule();
    if (shown) return;
    shown = true;
    state(true);
    onChange?.(true);
    void masks.run(parts, 'in', DISSOLVE_MS);
  };

  const onMove = (e: PointerEvent) => {
    if (e.pointerType === 'touch') return;
    if (last) travel += Math.hypot(e.clientX - last.x, e.clientY - last.y);
    last = { x: e.clientX, y: e.clientY };
    if (travel > NUDGE_PX) {
      travel = 0;
      poke();
    }
  };
  const onEnter = () => {
    hovering = true;
  };
  const onLeave = () => {
    hovering = false;
    schedule();
  };

  state(true);
  schedule();
  window.addEventListener('pointermove', onMove, { passive: true });
  window.addEventListener('pointerdown', poke, { passive: true });
  window.addEventListener('keydown', poke);
  window.addEventListener('wheel', poke, { passive: true });
  bar.addEventListener('pointerenter', onEnter);
  bar.addEventListener('pointerleave', onLeave);

  return {
    poke,
    shown: () => shown,
    destroy() {
      window.clearTimeout(timer);
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerdown', poke);
      window.removeEventListener('keydown', poke);
      window.removeEventListener('wheel', poke);
      bar.removeEventListener('pointerenter', onEnter);
      bar.removeEventListener('pointerleave', onLeave);
      delete document.documentElement.dataset.descentChrome;
      parts.forEach((el) => {
        el.style.removeProperty('mask-image');
        el.style.removeProperty('-webkit-mask-image');
        el.style.visibility = '';
      });
    },
  };
}
