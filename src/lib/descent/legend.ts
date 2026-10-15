/**
 * The legend: a few lines laid into the screen for the plate on show — what
 * it illustrates, in the words it illustrates, and a note on its planet.
 * There is no panel: the text sits on the bare black where the print has
 * sunk away under it (the veil, in `gl.ts`), and it comes and goes by the
 * same dither as everything else.
 *
 * All twenty-one legends are in the HTML; this only shows one of them. The
 * visitor's choice to have it open or shut is remembered in this browser.
 */

import type { Masks } from './chrome';

const KEY = 'descent.legend';

export interface Legend {
  open: () => boolean;
  toggle: (force?: boolean) => void;
  /** Show plate `i`'s legend; with `ms`, dissolve the old one out over that
   *  time and ink the new one in, a line at a time. */
  show: (i: number, ms?: number) => void;
  /** The legend's box, or null while it is shut. */
  box: () => DOMRect | null;
  destroy: () => void;
}

interface LegendOptions {
  masks: Masks;
  /** Called whenever the box moves, grows or goes. */
  onChange: () => void;
}

const read = (): boolean | null => {
  try {
    const v = localStorage.getItem(KEY);
    return v === null ? null : v === '1';
  } catch {
    return null;
  }
};

const write = (v: boolean) => {
  try {
    localStorage.setItem(KEY, v ? '1' : '0');
  } catch {
    /* private mode, blocked storage: the choice just won't be remembered */
  }
};

export function createLegend(root: HTMLElement, { masks, onChange }: LegendOptions): Legend {
  const aside = root.querySelector<HTMLElement>('.descent-legend');
  const toggles = Array.from(root.querySelectorAll<HTMLButtonElement>('[data-legend-toggle]'));
  const articles = Array.from(root.querySelectorAll<HTMLElement>('.descent-legend [data-plate]'));
  let isOpen = read() ?? window.matchMedia('(min-width: 900px)').matches;
  let cur = -1;
  let swap = 0;

  const lines = (a: HTMLElement) => Array.from(a.querySelectorAll<HTMLElement>('[data-line]'));

  const sync = () => {
    root.dataset.legend = isOpen ? 'open' : 'shut';
    toggles.forEach((b) => b.setAttribute('aria-pressed', String(isOpen)));
    if (aside) {
      aside.hidden = !isOpen;
      aside.setAttribute('aria-live', isOpen ? 'polite' : 'off');
    }
  };

  const observer = new ResizeObserver(() => onChange());
  if (aside) observer.observe(aside);

  const show = (i: number, ms = 0) => {
    if (i === cur || !articles[i]) return;
    const prev = articles[cur];
    const next = articles[i];
    cur = i;
    window.clearTimeout(swap);
    if (!isOpen || !ms || !prev) {
      articles.forEach((a) => (a.hidden = a !== next));
      onChange();
      return;
    }
    // Out with the old during the first half of the change, in with the new
    // during the second, a line at a time.
    void masks.run([prev], 'out', ms * 0.4);
    swap = window.setTimeout(() => {
      articles.forEach((a) => (a.hidden = a !== next));
      prev.style.removeProperty('mask-image');
      prev.style.removeProperty('-webkit-mask-image');
      prev.style.visibility = '';
      onChange();
      void masks.run(lines(next), 'in', ms * 0.25, ms * 0.06);
    }, ms * 0.45);
  };

  const toggle = (force?: boolean) => {
    const v = force ?? !isOpen;
    if (v === isOpen) return;
    isOpen = v;
    write(v);
    if (v) {
      sync();
      const a = articles[cur];
      if (a) void masks.run(lines(a), 'in', 260, 50);
      onChange();
    } else if (aside) {
      // Let the veil lift as the lines dissolve, then put the aside away.
      onChange();
      void masks.run([aside], 'out', 300).then(() => {
        if (isOpen) return;
        aside.style.removeProperty('mask-image');
        aside.style.removeProperty('-webkit-mask-image');
        aside.style.visibility = '';
        sync();
        onChange();
      });
    }
  };

  const clicks = toggles.map((b) => {
    const fn = () => toggle();
    b.addEventListener('click', fn);
    return fn;
  });

  sync();

  return {
    open: () => isOpen,
    toggle,
    show,
    box: () => (isOpen && aside && !aside.hidden ? aside.getBoundingClientRect() : null),
    destroy() {
      window.clearTimeout(swap);
      observer.disconnect();
      toggles.forEach((b, i) => b.removeEventListener('click', clicks[i]));
    },
  };
}
