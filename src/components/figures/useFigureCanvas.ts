import { useEffect, useRef, useState } from 'react';

export interface Frame {
  /** CSS pixels — the context is already scaled for devicePixelRatio. */
  width: number;
  height: number;
  /** Seconds of *running* time. Frozen while the figure is paused or offscreen. */
  time: number;
  /** Seconds since the previous frame, clamped so a backgrounded tab cannot jump the sim. */
  dt: number;
}

export type DrawFn = (ctx: CanvasRenderingContext2D, frame: Frame) => void;

interface Options {
  /** width / height. The canvas fills its container and derives height from this. */
  aspect?: number;
  /** false renders a single frame per state change instead of running a loop. */
  animate?: boolean;
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
export function useFigureCanvas(draw: DrawFn, { aspect = 16 / 9, animate = true }: Options = {}) {
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
      canvas.width = Math.round(rect.width * dpr);
      canvas.height = Math.round(height * dpr);
      sizeRef.current = { width: rect.width, height };
      const ctx = canvas.getContext('2d');
      ctx?.setTransform(dpr, 0, 0, dpr, 0, 0);
    };

    resize();
    const observer = new ResizeObserver(resize);
    observer.observe(canvas);
    return () => observer.disconnect();
  }, [aspect]);

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
    ctx.clearRect(0, 0, width, height);
    drawRef.current(ctx, { width, height, time: timeRef.current, dt });
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

  return { canvasRef, aspect, reduced };
}

export { prefersReducedMotion };
