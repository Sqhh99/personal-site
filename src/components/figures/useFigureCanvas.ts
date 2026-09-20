import { useEffect, useRef, useState } from 'react';

/**
 * Height of the strip reserved at the top of every canvas for the HUD readout
 * and the corner controls. The draw callback never sees it: its origin sits
 * just below the band, so figure coordinates start at the plot, and `hud()`
 * from plot.ts writes into the band by resetting that translation.
 */
export const HUD_BAND = 40;

export interface Frame {
  /** CSS pixels — the context is already scaled for devicePixelRatio. */
  width: number;
  /** Height of the drawable plot, i.e. the canvas minus the HUD band above it. */
  height: number;
  /** Seconds of *running* time. Frozen while the figure is paused or offscreen. */
  time: number;
  /** Seconds since the previous frame, clamped so a backgrounded tab cannot jump the sim. */
  dt: number;
}

export type DrawFn = (ctx: CanvasRenderingContext2D, frame: Frame) => void;

interface Options {
  /** width / height of the plot. The canvas fills its container and derives its height from this, plus the HUD band. */
  aspect?: number;
  /** false renders a single frame per state change instead of running a loop. */
  animate?: boolean;
  /** Height of the HUD band in CSS px. Figures with a chip row on top use a taller band so the readout sits below it. */
  hudBand?: number;
}

function prefersReducedMotion(): boolean {
  return typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/**
 * The drawing substrate every figure sits on.
 *
 * Handles the four things that are tedious to get right once per figure and
 * impossible to remember to get right twelve times: devicePixelRatio scaling,
 * resize, and — the two that actually matter for a page carrying a dozen
 * canvases — suspending the loop when the figure scrolls out of view or the tab
 * is hidden, and honouring `prefers-reduced-motion` by rendering a still frame
 * that stays fully interactive.
 */
export function useFigureCanvas(draw: DrawFn, { aspect = 16 / 9, animate = true, hudBand = HUD_BAND }: Options = {}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const drawRef = useRef(draw);
  drawRef.current = draw;

  const [onscreen, setOnscreen] = useState(false);
  const [reduced, setReduced] = useState(false);

  // Sizing ------------------------------------------------------------------
  const sizeRef = useRef({ width: 0, height: 0 });

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      if (rect.width === 0) return;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const height = rect.width / aspect;
      // The band is added on top of the aspect-derived plot height, so a
      // figure's proportions are exactly what its `aspect` says.
      canvas.style.height = `${height + hudBand}px`;
      canvas.width = Math.round(rect.width * dpr);
      canvas.height = Math.round((height + hudBand) * dpr);
      sizeRef.current = { width: rect.width, height };
      const ctx = canvas.getContext('2d');
      ctx?.setTransform(dpr, 0, 0, dpr, 0, 0);
    };

    resize();
    const observer = new ResizeObserver(resize);
    observer.observe(canvas);
    return () => observer.disconnect();
  }, [aspect, hudBand]);

  // Visibility --------------------------------------------------------------
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const observer = new IntersectionObserver(
      ([entry]) => setOnscreen(entry.isIntersecting),
      { rootMargin: '120px' },
    );
    observer.observe(canvas);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const media = window.matchMedia('(prefers-reduced-motion: reduce)');
    const sync = () => setReduced(media.matches);
    sync();
    media.addEventListener('change', sync);
    return () => media.removeEventListener('change', sync);
  }, []);

  // Frame loop --------------------------------------------------------------
  const timeRef = useRef(0);
  const running = animate && onscreen && !reduced;

  const paint = (dt: number) => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    const { width, height } = sizeRef.current;
    if (!ctx || width === 0) return;
    ctx.clearRect(0, 0, width, height + hudBand);
    ctx.save();
    ctx.translate(0, hudBand);
    drawRef.current(ctx, { width, height, time: timeRef.current, dt });
    ctx.restore();
  };

  useEffect(() => {
    if (!running) return;

    let frame = 0;
    let last = performance.now();

    const tick = (now: number) => {
      // Clamp: a hidden tab can hand back a multi-second delta on resume.
      const dt = Math.min((now - last) / 1000, 1 / 20);
      last = now;
      timeRef.current += dt;
      paint(dt);
      frame = requestAnimationFrame(tick);
    };

    const onVisibility = () => {
      last = performance.now();
    };
    document.addEventListener('visibilitychange', onVisibility);
    frame = requestAnimationFrame(tick);

    return () => {
      cancelAnimationFrame(frame);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [running]);

  // Static repaint. Deliberately dependency-free: it runs after every render, so
  // any control change repaints a paused or reduced-motion figure immediately.
  useEffect(() => {
    if (running) return;
    const frame = requestAnimationFrame(() => paint(0));
    return () => cancelAnimationFrame(frame);
  });

  // Repaint once on resize even while paused.
  useEffect(() => {
    const onResize = () => {
      if (!running) requestAnimationFrame(() => paint(0));
    };
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, [running]);

  return { canvasRef, aspect, reduced, hudBand };
}

export { prefersReducedMotion };
