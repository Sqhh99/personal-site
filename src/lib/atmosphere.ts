type Mote = {
  x: number;
  y: number;
  fall: number;
  slip: number;
  spin: number;
  spinRate: number;
  roll: number;
  rollRate: number;
  scale: number;
  alpha: number;
  w: number;
  h: number;
  hue: number;
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

/**
 * A few paper scraps / muted petals behind the type.
 * Tumble is a horizontal scale through zero so each scrap goes edge-on;
 * sideways slip is driven by that same angle. Pauses off-tab and under
 * prefers-reduced-motion (still frame parked in the margins).
 */
export function initAtmosphere(canvas: HTMLCanvasElement): () => void {
  const ctx = canvas.getContext('2d');
  if (!ctx) return () => undefined;

  const reduceMq = window.matchMedia('(prefers-reduced-motion: reduce)');
  let reduce = reduceMq.matches;
  let width = 0;
  let height = 0;
  let motes: Mote[] = [];
  let raf = 0;
  let last = 0;
  let running = false;
  let colors = readColors();

  function readColors() {
    const style = getComputedStyle(document.documentElement);
    return {
      kraft: style.getPropertyValue('--kraft').trim() || '#c9a07a',
      manilla: style.getPropertyValue('--manilla').trim() || '#ead8b6',
      accent: style.getPropertyValue('--accent').trim() || '#c45c3e',
    };
  }

  function countForSize() {
    const k = clamp(Math.sqrt((width * height) / (1440 * 900)), 0.45, 1.15);
    return Math.max(6, Math.round(11 * k));
  }

  function spawn(partial: Partial<Mote> = {}): Mote {
    return {
      x: Math.random() * Math.max(width, 1),
      y: Math.random() * Math.max(height, 1),
      fall: 10 + Math.random() * 20,
      slip: 7 + Math.random() * 14,
      spin: Math.random() * Math.PI * 2,
      spinRate: (0.3 + Math.random() * 0.85) * (Math.random() < 0.5 ? -1 : 1),
      roll: Math.random() * Math.PI * 2,
      rollRate: (0.08 + Math.random() * 0.35) * (Math.random() < 0.5 ? -1 : 1),
      scale: 0.4 + Math.random() * 0.7,
      alpha: 0.09 + Math.random() * 0.14,
      w: 8 + Math.random() * 7,
      h: 13 + Math.random() * 9,
      hue: Math.random(),
      ...partial,
    };
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
    const n = countForSize();
    if (motes.length === 0) {
      motes = Array.from({ length: n }, () => spawn());
    } else if (motes.length < n) {
      while (motes.length < n) motes.push(spawn({ y: -20 }));
    } else {
      motes.length = n;
    }
  }

  function fillFor(mote: Mote, back: boolean) {
    const hex = mote.hue < 0.5 ? colors.kraft : mote.hue < 0.82 ? colors.manilla : colors.accent;
    const [r, g, b] = hexToRgb(hex);
    return `rgba(${r}, ${g}, ${b}, ${back ? mote.alpha * 0.55 : mote.alpha})`;
  }

  function drawMote(mote: Mote) {
    const tumble = Math.cos(mote.spin);
    ctx.save();
    ctx.translate(mote.x, mote.y);
    ctx.rotate(mote.roll);
    ctx.scale(tumble * mote.scale, mote.scale);
    ctx.fillStyle = fillFor(mote, tumble < 0);
    ctx.beginPath();
    ctx.moveTo(0, -mote.h / 2);
    ctx.quadraticCurveTo(mote.w / 2, -mote.h / 8, 0, mote.h / 2);
    ctx.quadraticCurveTo(-mote.w / 2, -mote.h / 8, 0, -mote.h / 2);
    ctx.fill();
    ctx.restore();
  }

  function draw() {
    if (width < 2 || height < 2) return;
    ctx.clearRect(0, 0, width, height);
    for (const mote of motes) drawMote(mote);
  }

  function step(dt: number) {
    for (const mote of motes) {
      mote.spin += mote.spinRate * dt;
      mote.roll += mote.rollRate * dt;
      mote.x += Math.sin(mote.spin) * mote.slip * dt;
      mote.y += mote.fall * dt;
      if (mote.y > height + 24) Object.assign(mote, spawn({ y: -24, x: Math.random() * width }));
      if (mote.x < -24) mote.x = width + 24;
      if (mote.x > width + 24) mote.x = -24;
    }
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
    if (running || reduce || document.hidden) return;
    running = true;
    last = 0;
    raf = requestAnimationFrame(frame);
  }

  function stop() {
    running = false;
    cancelAnimationFrame(raf);
  }

  function composeStill() {
    motes.forEach((mote, i) => {
      const left = i % 2 === 0;
      mote.x = left ? 18 + (i % 3) * 22 : width - 72 + (i % 3) * 18;
      mote.y = 72 + (i / Math.max(motes.length, 1)) * Math.max(height - 140, 80);
      mote.spin = 0.35 + (i % 5) * 0.28;
      mote.roll = (i % 3) * 0.35 - 0.35;
    });
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
    else if (!reduce) start();
  };
  const onReduce = () => {
    reduce = reduceMq.matches;
    if (reduce) {
      stop();
      composeStill();
    } else {
      start();
    }
  };

  resize();
  if (reduce) composeStill();
  else start();

  document.addEventListener('visibilitychange', onVis);
  reduceMq.addEventListener('change', onReduce);

  return () => {
    stop();
    ro.disconnect();
    themeObs.disconnect();
    document.removeEventListener('visibilitychange', onVis);
    reduceMq.removeEventListener('change', onReduce);
  };
}
