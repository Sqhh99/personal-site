type Star = {
  x: number;
  y: number;
  r: number;
  a: number;
  layer: 0 | 1 | 2;
  spike: boolean;
};

function clamp(n: number, a: number, b: number) {
  return Math.max(a, Math.min(b, n));
}

function hexToRgb(hex: string): [number, number, number] {
  const digits = hex.trim().replace('#', '');
  const full =
    digits.length === 3
      ? digits
          .split('')
          .map((d) => d + d)
          .join('')
      : digits;
  return [
    parseInt(full.slice(0, 2), 16) || 0,
    parseInt(full.slice(2, 4), 16) || 0,
    parseInt(full.slice(4, 6), 16) || 0,
  ];
}

function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Sparse observatory field: cached stars, a faint gravitational ring, one
 * satellite tick. Pointer parallax is damped and layer-split so the field
 * pivots rather than sliding as a poster. Pauses off-tab and under
 * prefers-reduced-motion (still frame, designed three-quarter pose).
 */
export function initAtmosphere(canvas: HTMLCanvasElement): () => void {
  const ctx = canvas.getContext('2d');
  if (!ctx) return () => undefined;

  const reduceMq = window.matchMedia('(prefers-reduced-motion: reduce)');
  const coarseMq = window.matchMedia('(pointer: coarse)');
  let reduce = reduceMq.matches;
  let width = 0;
  let height = 0;
  let stars: Star[] = [];
  let raf = 0;
  let last = 0;
  let running = false;
  let angle = 0.32;
  let targetX = 0;
  let targetY = 0;
  let smoothX = reduce ? 0.28 : 0;
  let smoothY = reduce ? -0.12 : 0;
  let colors = readColors();

  function readColors() {
    const style = getComputedStyle(document.documentElement);
    return {
      ink: style.getPropertyValue('--ink').trim() || '#eee8dc',
      accent: style.getPropertyValue('--accent').trim() || '#d4b483',
      kraft: style.getPropertyValue('--kraft').trim() || '#8aa0b5',
    };
  }

  function countForSize() {
    const k = clamp(Math.sqrt((width * height) / (1440 * 900)), 0.4, 1.2);
    return Math.round(90 * k);
  }

  function catalog() {
    const rand = mulberry32(99_019);
    const n = countForSize();
    const next: Star[] = [];
    for (let i = 0; i < n; i += 1) {
      const roll = rand();
      const layer: 0 | 1 | 2 = roll < 0.62 ? 0 : roll < 0.9 ? 1 : 2;
      next.push({
        x: rand(),
        y: rand(),
        r: layer === 0 ? 0.45 + rand() * 0.55 : layer === 1 ? 0.7 + rand() * 0.7 : 1.05 + rand() * 0.85,
        a: layer === 0 ? 0.18 + rand() * 0.22 : layer === 1 ? 0.32 + rand() * 0.28 : 0.55 + rand() * 0.35,
        layer,
        spike: layer === 2 && rand() < 0.35,
      });
    }
    stars = next;
  }

  function resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    width = window.innerWidth;
    height = window.innerHeight;
    if (width < 2 || height < 2) return;
    canvas.width = Math.floor(width * dpr);
    canvas.height = Math.floor(height * dpr);
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    catalog();
  }

  function wrap(v: number, span: number) {
    return ((v % span) + span) % span;
  }

  function depth(layer: 0 | 1 | 2) {
    return layer === 0 ? 6 : layer === 1 ? 14 : 26;
  }

  function rgba(hex: string, alpha: number) {
    const [r, g, b] = hexToRgb(hex);
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
  }

  function drawStars() {
    const ink = colors.ink;
    const accent = colors.accent;
    for (const star of stars) {
      const x = wrap(star.x * width + smoothX * depth(star.layer), width);
      const y = wrap(star.y * height - smoothY * depth(star.layer) * 0.7, height);
      ctx.fillStyle = rgba(star.spike ? accent : ink, star.a);
      ctx.beginPath();
      ctx.arc(x, y, star.r, 0, Math.PI * 2);
      ctx.fill();

      if (!star.spike) continue;
      const spike = 5 + star.r * 3;
      ctx.strokeStyle = rgba(accent, star.a * 0.28);
      ctx.lineWidth = 0.6;
      ctx.beginPath();
      ctx.moveTo(x - spike, y);
      ctx.lineTo(x + spike, y);
      ctx.moveTo(x, y - spike);
      ctx.lineTo(x, y + spike);
      ctx.stroke();
    }
  }

  function drawRing() {
    const cx = width * (0.72 + smoothX * 0.03);
    const cy = height * (0.38 - smoothY * 0.025);
    const rx = Math.min(width, height) * 0.38;
    const ry = rx * 0.42;

    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(-0.18 + smoothX * 0.04);
    ctx.strokeStyle = rgba(colors.accent, 0.14);
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.ellipse(0, 0, rx, ry, 0, 0, Math.PI * 2);
    ctx.stroke();

    ctx.strokeStyle = rgba(colors.kraft, 0.08);
    ctx.beginPath();
    ctx.ellipse(0, 0, rx * 0.62, ry * 0.62, 0, 0, Math.PI * 2);
    ctx.stroke();

    const satX = Math.cos(angle) * rx;
    const satY = Math.sin(angle) * ry;
    ctx.fillStyle = rgba(colors.accent, 0.72);
    ctx.beginPath();
    ctx.arc(satX, satY, 1.7, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  function draw() {
    if (width < 2 || height < 2) return;
    ctx.clearRect(0, 0, width, height);
    drawStars();
    drawRing();
  }

  function step(dt: number) {
    const alpha = 1 - Math.pow(1 - 0.055, dt * 60);
    smoothX += (targetX - smoothX) * alpha;
    smoothY += (targetY - smoothY) * alpha;
    if (!reduce) angle += dt * ((Math.PI * 2) / 96);
  }

  function frame(now: number) {
    if (!running) return;
    const dt = Math.min(1 / 30, last ? (now - last) / 1000 : 0.016);
    last = now;
    step(dt);
    draw();
    raf = requestAnimationFrame(frame);
  }

  function start() {
    if (running || document.hidden) return;
    running = true;
    last = 0;
    raf = requestAnimationFrame(frame);
  }

  function stop() {
    running = false;
    cancelAnimationFrame(raf);
  }

  function composeStill() {
    targetX = 0.28;
    targetY = -0.12;
    smoothX = 0.28;
    smoothY = -0.12;
    angle = 0.7;
    draw();
  }

  const onTheme = () => {
    colors = readColors();
    draw();
  };
  const themeObs = new MutationObserver(onTheme);
  themeObs.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ['data-theme'],
  });

  const ro = new ResizeObserver(() => {
    resize();
    if (reduce) composeStill();
    else draw();
  });
  ro.observe(document.documentElement);

  const onVis = () => {
    if (document.hidden) stop();
    else if (reduce) composeStill();
    else start();
  };
  const onReduce = () => {
    reduce = reduceMq.matches;
    if (reduce) {
      stop();
      composeStill();
    } else {
      targetX = 0;
      targetY = 0;
      start();
    }
  };

  const onPointer = (event: PointerEvent) => {
    if (reduce || event.pointerType === 'touch' || coarseMq.matches) return;
    targetX = (event.clientX / Math.max(width, 1)) * 2 - 1;
    targetY = (event.clientY / Math.max(height, 1)) * 2 - 1;
  };
  const onLeave = () => {
    if (reduce) return;
    targetX = 0;
    targetY = 0;
  };

  resize();
  if (reduce) composeStill();
  else start();

  document.addEventListener('visibilitychange', onVis);
  document.addEventListener('pointermove', onPointer, { passive: true });
  document.addEventListener('pointerleave', onLeave);
  reduceMq.addEventListener('change', onReduce);

  return () => {
    stop();
    ro.disconnect();
    themeObs.disconnect();
    document.removeEventListener('visibilitychange', onVis);
    document.removeEventListener('pointermove', onPointer);
    document.removeEventListener('pointerleave', onLeave);
    reduceMq.removeEventListener('change', onReduce);
  };
}
