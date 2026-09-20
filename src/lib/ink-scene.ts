/**
 * The landing scene: a wood-engraving drawn live.
 *
 * A tone field describes the picture — a path of light leading into a black
 * opening under a canopy, trunks arching over it, undergrowth in the corners —
 * and an engraver's hand turns tone into ink: short curved strokes for leaves,
 * long strokes along the grain for bark, streaks converging on the vanishing
 * point for the path, cross-hatching where it is brightest. White ink on black
 * paper, because the site is dark; the composition reads the same either way.
 *
 * Strokes are generated once per size into three depth layers, revealed in an
 * order that blooms outward from the opening, then composited each frame with
 * a little parallax and a very slow dolly. A figure in a suit walks in on top.
 */

type Kind = 'leaf' | 'bark' | 'path' | 'none';
type Layer = 0 | 1 | 2; // background, midground, foreground

interface Sample {
  tone: number; // 0 = paper untouched (black), 1 = densest ink (white)
  theta: number; // stroke direction
  kind: Kind;
  layer: Layer;
}

interface Stroke {
  pts: Float32Array; // x0 y0 x1 y1 …
  width: number;
  alpha: number;
  layer: Layer;
  key: number; // reveal order
}

export interface InkSceneHandle {
  destroy: () => void;
}

// --- noise --------------------------------------------------------------------

function hash(ix: number, iy: number): number {
  let h = (ix * 374761393 + iy * 668265263) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

function smooth(t: number): number {
  return t * t * (3 - 2 * t);
}

function noise(x: number, y: number): number {
  const ix = Math.floor(x);
  const iy = Math.floor(y);
  const fx = smooth(x - ix);
  const fy = smooth(y - iy);
  const a = hash(ix, iy);
  const b = hash(ix + 1, iy);
  const c = hash(ix, iy + 1);
  const d = hash(ix + 1, iy + 1);
  return a + (b - a) * fx + (c - a) * fy + (a - b - c + d) * fx * fy;
}

function fbm(x: number, y: number, octaves = 4): number {
  let sum = 0;
  let amp = 0.5;
  let norm = 0;
  for (let i = 0; i < octaves; i += 1) {
    sum += amp * noise(x, y);
    norm += amp;
    x = x * 2.03 + 17.1;
    y = y * 2.01 + 9.7;
    amp *= 0.5;
  }
  return sum / norm;
}

function smoothstep(a: number, b: number, t: number): number {
  const u = Math.min(1, Math.max(0, (t - a) / (b - a)));
  return u * u * (3 - 2 * u);
}

function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

// --- geometry helpers -----------------------------------------------------------

interface Curve {
  p0: [number, number];
  p1: [number, number];
  p2: [number, number];
  /** Half-width at t = 0 and t = 1, in scene units (fractions of the height). */
  w0: number;
  w1: number;
  layer: Layer;
}

/** Nearest point on a quadratic Bézier, by coarse sampling then one refinement. */
function nearestOnCurve(c: Curve, x: number, y: number): { t: number; d: number; tx: number; ty: number } {
  let bestT = 0;
  let bestD = Infinity;
  for (let i = 0; i <= 16; i += 1) {
    const t = i / 16;
    const mt = 1 - t;
    const px = mt * mt * c.p0[0] + 2 * mt * t * c.p1[0] + t * t * c.p2[0];
    const py = mt * mt * c.p0[1] + 2 * mt * t * c.p1[1] + t * t * c.p2[1];
    const d = (px - x) * (px - x) + (py - y) * (py - y);
    if (d < bestD) {
      bestD = d;
      bestT = t;
    }
  }
  for (const dt of [-1 / 32, 1 / 32, -1 / 64, 1 / 64]) {
    const t = Math.min(1, Math.max(0, bestT + dt));
    const mt = 1 - t;
    const px = mt * mt * c.p0[0] + 2 * mt * t * c.p1[0] + t * t * c.p2[0];
    const py = mt * mt * c.p0[1] + 2 * mt * t * c.p1[1] + t * t * c.p2[1];
    const d = (px - x) * (px - x) + (py - y) * (py - y);
    if (d < bestD) {
      bestD = d;
      bestT = t;
    }
  }
  const t = bestT;
  const tx = 2 * (1 - t) * (c.p1[0] - c.p0[0]) + 2 * t * (c.p2[0] - c.p1[0]);
  const ty = 2 * (1 - t) * (c.p1[1] - c.p0[1]) + 2 * t * (c.p2[1] - c.p1[1]);
  return { t, d: Math.sqrt(bestD), tx, ty };
}

// --- the picture ----------------------------------------------------------------

/**
 * Scene coordinates: y runs 0 (top) to 1 (bottom) over the canvas height, and
 * x is centred, running −A/2..A/2 where A is the aspect ratio. Every feature
 * is described in these units so the composition survives a resize.
 */
class Picture {
  readonly aspect: number;
  readonly horizon = 0.56;
  readonly vanish: [number, number];
  readonly opening: { x: number; y: number; rx: number; ry: number };
  readonly curves: Curve[];
  readonly bushes: Array<{ x: number; y: number; rx: number; ry: number }>;

  constructor(aspect: number) {
    this.aspect = aspect;
    const half = aspect / 2;
    // Narrow screens get a narrower opening so the trees still frame it.
    const squeeze = Math.min(1, aspect / 1.5);
    this.vanish = [0.02, 0.5];
    this.opening = { x: 0.02, y: 0.4, rx: 0.3 * squeeze, ry: 0.26 };
    this.curves = [
      // Near trunks, one each side, leaning in over the opening.
      { p0: [-half * 0.92, 1.05], p1: [-half * 0.55, 0.35], p2: [-0.22, 0.06], w0: 0.075, w1: 0.03, layer: 2 },
      { p0: [half * 0.98, 1.05], p1: [half * 0.6, 0.3], p2: [0.3, 0.02], w0: 0.07, w1: 0.028, layer: 2 },
      // Far trunks behind them.
      { p0: [-half * 0.55, 0.62], p1: [-half * 0.42, 0.28], p2: [-0.05, 0.0], w0: 0.03, w1: 0.014, layer: 1 },
      { p0: [half * 0.5, 0.6], p1: [half * 0.38, 0.22], p2: [0.12, -0.02], w0: 0.028, w1: 0.012, layer: 1 },
      // A bough arching over the top of the opening.
      { p0: [-half * 0.7, 0.16], p1: [0.0, -0.08], p2: [half * 0.75, 0.2], w0: 0.026, w1: 0.022, layer: 1 },
      // Low branches reaching in from the sides.
      { p0: [-half, 0.5], p1: [-half * 0.5, 0.45], p2: [-0.3, 0.3], w0: 0.02, w1: 0.008, layer: 2 },
      { p0: [half, 0.42], p1: [half * 0.55, 0.4], p2: [0.34, 0.27], w0: 0.018, w1: 0.008, layer: 2 },
    ];
    this.bushes = [
      { x: -half * 0.86, y: 0.98, rx: half * 0.42, ry: 0.28 },
      { x: half * 0.9, y: 0.95, rx: half * 0.38, ry: 0.3 },
      { x: -half * 0.35, y: 1.06, rx: half * 0.2, ry: 0.16 },
    ];
  }

  sample(x: number, y: number): Sample {
    const o = this.opening;
    const dxo = (x - o.x) / o.rx;
    const dyo = (y - o.y) / o.ry;
    const openingDist = Math.sqrt(dxo * dxo + dyo * dyo);
    const ragged = 1 + 0.2 * (fbm(x * 5 + 3, y * 5 + 1, 3) - 0.5) * 2 + 0.08 * (noise(x * 16 + 1, y * 16 + 5) - 0.5);
    if (openingDist < ragged) return { tone: 0, theta: 0, kind: 'none', layer: 0 };
    // Ink thins out as it approaches the void, and the rim around it sits
    // furthest back in the parallax stack.
    const rim = smoothstep(ragged, ragged + 0.42, openingDist);
    const nearOpening = openingDist < ragged + 0.55;

    let sample: Sample;
    const horizon = this.horizon + 0.02 * (noise(x * 3 + 5, 7) - 0.5);

    // Trunks and branches take precedence over what is behind them.
    let trunk: { c: Curve; d: number; t: number; tx: number; ty: number; w: number } | null = null;
    for (const c of this.curves) {
      const n = nearestOnCurve(c, x, y);
      const w = c.w0 + (c.w1 - c.w0) * n.t;
      if (n.d < w && (!trunk || c.layer >= trunk.c.layer)) trunk = { c, ...n, w };
    }

    // Foreground undergrowth in the bottom corners.
    let bush = 0;
    for (const b of this.bushes) {
      const dx = (x - b.x) / b.rx;
      const dy = (y - b.y) / b.ry;
      const d = Math.sqrt(dx * dx + dy * dy) + 0.25 * (fbm(x * 7 + 11, y * 7, 3) - 0.5);
      bush = Math.max(bush, 1 - smoothstep(0.7, 1.05, d));
    }

    if (trunk) {
      const across = trunk.d / trunk.w; // 0 at the core, 1 at the edge
      const along = trunk.t * 6;
      const moss = fbm(along * 1.8 + 2, across * 5 + trunk.c.p0[0] * 3, 3);
      const knot = smoothstep(0.78, 0.9, noise(along * 2.3 + 4, trunk.c.p1[1] * 7));
      const edge = smoothstep(0.55, 1, across);
      const core = 1 - 0.55 * (1 - smoothstep(0, 0.5, across));
      const far = trunk.c.layer === 1 ? 0.8 : 1;
      const tone = clamp01((0.12 + 0.36 * moss * core + 0.5 * edge * edge + 0.25 * knot) * far);
      const theta = Math.atan2(trunk.ty, trunk.tx) + (noise(along * 4, across * 5) - 0.5) * 0.4;
      sample = { tone, theta, kind: 'bark', layer: trunk.c.layer };
    } else if (bush > 0.02) {
      const clump = fbm(x * 11 + 1, y * 11 + 4, 3);
      const speck = hash(Math.floor(x * 150), Math.floor(y * 150)) > 0.86 ? 0.45 : 0;
      const tone = clamp01((0.18 + 0.45 * clump + speck) * bush + (1 - bush) * this.ground(x, y, horizon).tone);
      const theta = (fbm(x * 8, y * 8, 2) - 0.5) * 2.4 + 0.6;
      sample = { tone, theta, kind: 'leaf', layer: 2 };
    } else if (y > horizon) {
      sample = this.ground(x, y, horizon);
    } else {
      sample = this.canopy(x, y);
    }

    if (nearOpening) {
      sample.tone *= rim;
      if (sample.layer > 0 && openingDist < ragged + 0.3) sample.layer = 0;
    }
    return sample;
  }

  private ground(x: number, y: number, horizon: number): Sample {
    const depth = (y - horizon) / (1 - horizon); // 0 at the horizon, 1 at the bottom edge
    const centre = 0.03 + 0.06 * Math.sin(depth * 4.2) + 0.04 * (noise(y * 6, 2) - 0.5);
    const halfWidth = 0.035 + 0.62 * depth * depth + 0.2 * depth;
    const off = Math.abs(x - centre) / halfWidth;
    const [vx, vy] = this.vanish;
    const radial = Math.atan2(vy - y, vx - x);
    if (off < 1) {
      // Streaks that converge on the vanishing point: noise stretched along the ray.
      const r = Math.hypot(x - vx, y - vy);
      const streak = fbm(radial * 9, r * 2.2 + 3, 3);
      const grain = noise(x * 60, y * 60);
      const edgeDark = 1 - 0.35 * smoothstep(0.7, 1, off);
      const tone = clamp01((0.5 + 0.34 * streak + 0.12 * grain) * edgeDark * (0.55 + 0.45 * depth));
      return { tone, theta: radial + (noise(x * 20, y * 20) - 0.5) * 0.3, kind: 'path', layer: 1 };
    }
    // Undergrowth beside the path.
    const clump = fbm(x * 9 + 7, y * 9, 3);
    const tone = clamp01(0.16 + 0.42 * clump + (hash(Math.floor(x * 140), Math.floor(y * 140)) > 0.88 ? 0.3 : 0)) * (0.6 + 0.4 * depth);
    return { tone, theta: (fbm(x * 6, y * 6, 2) - 0.5) * 2.2 + radial * 0.3, kind: 'leaf', layer: depth > 0.45 ? 2 : 1 };
  }

  private canopy(x: number, y: number): Sample {
    const clump = fbm(x * 6 + 2, y * 6 + 8, 4);
    const cell = noise(x * 15 + 3, y * 15 + 1);
    // Big dark hollows between the masses of leaves.
    const hollow = smoothstep(0.34, 0.52, fbm(x * 2.6 + 9, y * 2.6 + 4, 2));
    const top = 0.6 + 0.4 * smoothstep(0, 0.35, y); // denser and darker at the very top
    const sideLight = 0.75 + 0.25 * smoothstep(0.2, 0.9, Math.abs(x) / (this.aspect / 2)); // brighter out at the edges
    const mass = Math.pow(clamp01(clump * 1.25 - 0.1), 1.4);
    const tone = clamp01((0.18 + 0.7 * mass) * (0.5 + 0.5 * cell) * hollow * top * sideLight + (cell > 0.8 ? 0.3 : 0));
    const theta = (fbm(x * 7 + 5, y * 7 + 2, 2) - 0.5) * 2.6 + 0.8;
    return { tone, theta, kind: 'leaf', layer: 1 };
  }
}

// --- engraving ------------------------------------------------------------------

function generateStrokes(picture: Picture, width: number, height: number): Stroke[] {
  const strokes: Stroke[] = [];
  const spacing = 3; // grid pitch in CSS px
  const half = picture.aspect / 2;
  const toScene = (px: number, py: number): [number, number] => [px / height - half, py / height];
  const o = picture.opening;
  let seed = 7;
  const rand = () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 4294967296;
  };

  const trace = (px: number, py: number, theta: number, length: number, curl: number): Float32Array => {
    const step = 2.2;
    const n = Math.max(2, Math.round(length / step));
    const pts = new Float32Array((n + 1) * 2);
    let x = px;
    let y = py;
    let a = theta;
    pts[0] = x;
    pts[1] = y;
    for (let i = 1; i <= n; i += 1) {
      x += Math.cos(a) * step;
      y += Math.sin(a) * step;
      a += curl;
      pts[i * 2] = x;
      pts[i * 2 + 1] = y;
    }
    return pts;
  };

  for (let gy = 0; gy < height + spacing; gy += spacing) {
    for (let gx = 0; gx < width + spacing; gx += spacing) {
      const px = gx + (rand() - 0.5) * spacing;
      const py = gy + (rand() - 0.5) * spacing;
      const [sx, sy] = toScene(px, py);
      const s = picture.sample(sx, sy);
      if (s.kind === 'none' || s.tone < 0.07) continue;
      // Ink density follows tone; the brightest areas also take a cross-hatch.
      if (rand() > s.tone * 1.15) continue;

      let length: number;
      let curl: number;
      let width0: number;
      if (s.kind === 'leaf') {
        length = 3 + 7 * rand() + 4 * s.tone;
        curl = (rand() - 0.5) * 0.28;
        width0 = 0.75 + 0.55 * rand();
      } else if (s.kind === 'bark') {
        length = 5 + 16 * s.tone * rand();
        curl = (rand() - 0.5) * 0.08;
        width0 = 0.7 + 0.5 * s.tone;
      } else {
        length = 6 + 34 * s.tone * rand();
        curl = (rand() - 0.5) * 0.02;
        width0 = 0.6 + 0.5 * s.tone;
      }
      const dxo = (sx - o.x) / o.rx;
      const dyo = (sy - o.y) / o.ry;
      const key = Math.sqrt(dxo * dxo + dyo * dyo) + 0.35 * (fbm(sx * 4 + 20, sy * 4 + 20, 2) - 0.5);
      const alpha = 0.5 + 0.5 * s.tone;
      strokes.push({ pts: trace(px, py, s.theta, length, curl), width: width0, alpha, layer: s.layer, key });

      if (s.tone > 0.64 && rand() < (s.tone - 0.64) * 2.2) {
        const cross = s.theta + (s.kind === 'path' ? 1.35 : 1.15) + (rand() - 0.5) * 0.3;
        strokes.push({
          pts: trace(px, py, cross, length * 0.75, curl),
          width: width0 * 0.85,
          alpha: alpha * 0.85,
          layer: s.layer,
          key: key + 0.12,
        });
      }
    }
  }
  strokes.sort((a, b) => a.key - b.key);
  return strokes;
}

function drawStrokes(ctx: CanvasRenderingContext2D, strokes: Stroke[], from: number, to: number, ink: string) {
  ctx.strokeStyle = ink;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  for (let i = from; i < to; i += 1) {
    const s = strokes[i];
    ctx.globalAlpha = s.alpha;
    ctx.lineWidth = s.width;
    ctx.beginPath();
    ctx.moveTo(s.pts[0], s.pts[1]);
    for (let j = 2; j < s.pts.length; j += 2) ctx.lineTo(s.pts[j], s.pts[j + 1]);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
}

// --- the figure -----------------------------------------------------------------

/**
 * A suited figure seen from behind, walking toward the opening. Drawn as
 * outlined shapes filled with paper and shaded with hatching, so it sits on
 * the engraving as the one thing not made of texture.
 */
function drawFigure(ctx: CanvasRenderingContext2D, x: number, footY: number, h: number, t: number, ink: string, paper: string) {
  const bob = Math.sin(t * 1.7) * h * 0.006;
  const sway = Math.sin(t * 0.85) * 0.02;
  ctx.save();
  ctx.translate(x, footY + bob);
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';

  // Ground shadow: paper where the path's ink would be.
  ctx.fillStyle = paper;
  ctx.globalAlpha = 0.9;
  ctx.beginPath();
  ctx.ellipse(0, 0, h * 0.2, h * 0.035, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.globalAlpha = 1;

  const capsule = (x0: number, y0: number, x1: number, y1: number, r: number) => {
    const a = Math.atan2(y1 - y0, x1 - x0);
    ctx.beginPath();
    ctx.arc(x0, y0, r, a + Math.PI / 2, a - Math.PI / 2);
    ctx.arc(x1, y1, r, a - Math.PI / 2, a + Math.PI / 2);
    ctx.closePath();
  };
  const roundRect = (x0: number, y0: number, w: number, hh: number, r: number) => {
    ctx.beginPath();
    ctx.roundRect(x0, y0, w, hh, r);
  };
  /** Fill with ink, outline with paper, then hatch the shadow side with paper. */
  const finish = (shape: () => void, shadeAngle: number, shadeFrom: number, ribs = 0) => {
    shape();
    ctx.fillStyle = ink;
    ctx.fill();
    ctx.save();
    shape();
    ctx.clip();
    // Hatching: paper lines whose density grows toward the shadow side.
    ctx.strokeStyle = paper;
    ctx.lineWidth = Math.max(0.8, h * 0.0045);
    const span = h * 0.9;
    const dx = Math.cos(shadeAngle);
    const dy = Math.sin(shadeAngle);
    for (let d = -span; d < span; d += h * 0.011) {
      const p = (d + span) / (2 * span);
      if (p < shadeFrom) continue;
      ctx.globalAlpha = 0.45 + 0.55 * smoothstep(shadeFrom, 1, p);
      const cx = -dy * d;
      const cy = -h / 2 + dx * d;
      ctx.beginPath();
      ctx.moveTo(cx - dx * span, cy - dy * span);
      ctx.lineTo(cx + dx * span, cy + dy * span);
      ctx.stroke();
    }
    // Ribbing on the suit.
    if (ribs) {
      ctx.globalAlpha = 0.35;
      ctx.lineWidth = Math.max(0.6, h * 0.0035);
      for (let y = -h; y < 0; y += h * ribs) {
        ctx.beginPath();
        ctx.moveTo(-h, y);
        ctx.lineTo(h, y);
        ctx.stroke();
      }
    }
    ctx.restore();
    ctx.globalAlpha = 1;
    shape();
    ctx.strokeStyle = paper;
    ctx.lineWidth = Math.max(1.2, h * 0.008);
    ctx.stroke();
  };

  // Legs, then arms, torso, pack, helmet — back to front. Light comes from
  // the left, so every part is hatched more heavily toward its right side.
  const shade = -0.9;
  finish(() => capsule(-h * 0.075, -h * 0.38, -h * 0.095 - sway * h, -h * 0.07, h * 0.062), shade, 0.5, 0.06);
  finish(() => capsule(h * 0.075, -h * 0.38, h * 0.1 + sway * h, -h * 0.07, h * 0.062), shade, 0.42, 0.06);
  finish(() => roundRect(-h * 0.17, -h * 0.075, h * 0.145, h * 0.075, h * 0.025), shade, 0.5);
  finish(() => roundRect(h * 0.025, -h * 0.075, h * 0.145, h * 0.075, h * 0.025), shade, 0.42);
  finish(() => capsule(-h * 0.2, -h * 0.68, -h * 0.27 + sway * h * 0.6, -h * 0.36, h * 0.052), shade, 0.55, 0.055);
  finish(() => capsule(h * 0.2, -h * 0.68, h * 0.27 - sway * h * 0.6, -h * 0.36, h * 0.052), shade, 0.35, 0.055);
  finish(() => { ctx.beginPath(); ctx.arc(-h * 0.27 + sway * h * 0.6, -h * 0.33, h * 0.05, 0, Math.PI * 2); }, shade, 0.5);
  finish(() => { ctx.beginPath(); ctx.arc(h * 0.27 - sway * h * 0.6, -h * 0.33, h * 0.05, 0, Math.PI * 2); }, shade, 0.4);
  finish(() => roundRect(-h * 0.19, -h * 0.76, h * 0.38, h * 0.42, h * 0.07), shade, 0.5);
  finish(() => roundRect(-h * 0.15, -h * 0.8, h * 0.3, h * 0.37, h * 0.035), shade, 0.55);
  // Pack details: two vertical slots, a valve, and a hose running to the side.
  ctx.strokeStyle = paper;
  ctx.lineWidth = Math.max(0.9, h * 0.005);
  ctx.globalAlpha = 0.85;
  for (const sx of [-h * 0.07, h * 0.07]) {
    ctx.beginPath();
    ctx.roundRect(sx - h * 0.035, -h * 0.74, h * 0.07, h * 0.16, h * 0.01);
    ctx.stroke();
    for (let i = 1; i < 4; i += 1) {
      ctx.beginPath();
      ctx.moveTo(sx - h * 0.035, -h * 0.74 + i * h * 0.04);
      ctx.lineTo(sx + h * 0.035, -h * 0.74 + i * h * 0.04);
      ctx.stroke();
    }
  }
  ctx.beginPath();
  ctx.arc(0, -h * 0.51, h * 0.03, 0, Math.PI * 2);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(h * 0.15, -h * 0.6);
  ctx.quadraticCurveTo(h * 0.26, -h * 0.58, h * 0.22, -h * 0.45);
  ctx.lineWidth = Math.max(1.4, h * 0.012);
  ctx.strokeStyle = ink;
  ctx.stroke();
  ctx.lineWidth = Math.max(0.7, h * 0.004);
  ctx.strokeStyle = paper;
  ctx.stroke();
  ctx.globalAlpha = 1;
  // Collar and helmet.
  finish(() => { ctx.beginPath(); ctx.ellipse(0, -h * 0.79, h * 0.095, h * 0.032, 0, 0, Math.PI * 2); }, 0, 0.55);
  finish(() => { ctx.beginPath(); ctx.arc(0, -h * 0.89, h * 0.11, 0, Math.PI * 2); }, shade, 0.48);
  // A crown highlight on the helmet.
  ctx.strokeStyle = paper;
  ctx.lineWidth = Math.max(1, h * 0.006);
  ctx.globalAlpha = 0.5;
  ctx.beginPath();
  ctx.arc(0, -h * 0.89, h * 0.08, -2.6, -1.6);
  ctx.stroke();
  ctx.globalAlpha = 1;
  ctx.restore();
}

// --- driver --------------------------------------------------------------------

export function initInkScene(canvas: HTMLCanvasElement): InkSceneHandle {
  const ctx = canvas.getContext('2d');
  if (!ctx) return { destroy: () => undefined };

  const style = getComputedStyle(document.documentElement);
  const ink = style.getPropertyValue('--ink').trim() || '#ece9e2';
  const paper = style.getPropertyValue('--bg').trim() || '#050505';
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  let width = 0;
  let height = 0;
  let dpr = 1;
  let strokes: Stroke[] = [];
  let layers: HTMLCanvasElement[] = [];
  let layerCtx: CanvasRenderingContext2D[] = [];
  let drawn = 0; // strokes already inked into the layers
  let revealStart = 0;
  let revealDuration = 3200;
  let frame = 0;
  let visible = true;
  let destroyed = false;
  const pointer = { x: 0, y: 0 };
  const eased = { x: 0, y: 0 };
  const motes = Array.from({ length: 22 }, (_, i) => ({ x: hash(i, 3), y: hash(i, 5), s: 0.4 + hash(i, 9), r: 0.6 + hash(i, 11) }));
  const start = performance.now();

  const build = (instant: boolean) => {
    const rect = canvas.getBoundingClientRect();
    width = Math.max(1, Math.round(rect.width));
    height = Math.max(1, Math.round(rect.height));
    dpr = Math.min(window.devicePixelRatio || 1, 1.5);
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
    const picture = new Picture(width / height);
    strokes = generateStrokes(picture, width, height);
    layers = [0, 1, 2].map(() => {
      const c = document.createElement('canvas');
      c.width = canvas.width;
      c.height = canvas.height;
      return c;
    });
    layerCtx = layers.map((c) => {
      const lc = c.getContext('2d')!;
      lc.setTransform(dpr, 0, 0, dpr, 0, 0);
      return lc;
    });
    drawn = 0;
    revealStart = performance.now();
    if (instant) inkUpTo(strokes.length);
  };

  const inkUpTo = (count: number) => {
    // Layers are drawn in reveal order, so each frame only inks the new strokes.
    for (let i = drawn; i < count; i += 1) {
      const s = strokes[i];
      drawStrokes(layerCtx[s.layer], strokes, i, i + 1, ink);
    }
    drawn = count;
  };

  const composite = (now: number) => {
    const t = (now - start) / 1000;
    const p = clamp01((now - revealStart) / revealDuration);
    const reveal = drawn / Math.max(1, strokes.length);
    // Slow dolly toward the opening, and parallax from the pointer.
    const dolly = reduced ? 1 : 1 + 0.035 * (1 - Math.exp(-t / 45));
    eased.x += (pointer.x - eased.x) * 0.04;
    eased.y += (pointer.y - eased.y) * 0.04;

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = paper;
    ctx.fillRect(0, 0, width, height);
    ctx.save();
    ctx.translate(width / 2, height * 0.42);
    ctx.scale(dolly, dolly);
    ctx.translate(-width / 2, -height * 0.42);
    const shift = [2, 7, 14];
    layers.forEach((layer, i) => {
      const k = shift[i] * (i === 0 ? 1 : -1);
      ctx.drawImage(layer, eased.x * k, eased.y * k * 0.6, width, height);
    });
    ctx.restore();

    // The figure walks in once most of the picture is on the paper.
    const figureIn = smoothstep(0.55, 1, Math.max(reveal, p));
    if (figureIn > 0) {
      ctx.save();
      ctx.globalAlpha = figureIn;
      // Portrait screens put the figure right of centre, clear of the tagline.
      const portrait = width / height < 1;
      const h = height * (portrait ? 0.24 : 0.32);
      const fx = width / 2 + (portrait ? width * 0.16 : -height * 0.04) - eased.x * 10;
      drawFigure(ctx, fx, height * 0.965 - eased.y * 6 + (1 - figureIn) * 10, h, reduced ? 0 : t, ink, paper);
      ctx.restore();
    }

    // Dust in the light.
    if (!reduced) {
      ctx.fillStyle = ink;
      for (const m of motes) {
        const mx = ((m.x + t * 0.006 * m.s) % 1) * width;
        const my = ((m.y + Math.sin(t * 0.3 + m.x * 9) * 0.004 + t * 0.0025 * m.s) % 1) * height;
        ctx.globalAlpha = 0.18 + 0.3 * Math.abs(Math.sin(t * 0.9 + m.x * 20));
        ctx.beginPath();
        ctx.arc(mx, my, m.r, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
    }
  };

  const tick = (now: number) => {
    if (destroyed) return;
    if (drawn < strokes.length) {
      const p = clamp01((now - revealStart) / revealDuration);
      const e = p < 0.5 ? 2 * p * p : 1 - Math.pow(-2 * p + 2, 2) / 2;
      inkUpTo(Math.round(e * strokes.length));
    }
    composite(now);
    const settled = drawn >= strokes.length && reduced;
    if (visible && !settled) frame = requestAnimationFrame(tick);
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

  let resizeTimer = 0;
  const onResize = () => {
    window.clearTimeout(resizeTimer);
    resizeTimer = window.setTimeout(() => {
      const rect = canvas.getBoundingClientRect();
      if (Math.round(rect.width) === width && Math.round(rect.height) === height) return;
      build(true);
      composite(performance.now());
    }, 200);
  };

  const observer = new IntersectionObserver(([entry]) => {
    const was = visible;
    visible = entry.isIntersecting;
    if (visible && !was) frame = requestAnimationFrame(tick);
  });

  build(reduced);
  observer.observe(canvas);
  if (!reduced) {
    window.addEventListener('pointermove', onPointer, { passive: true });
    canvas.addEventListener('pointerleave', onLeave);
  }
  window.addEventListener('resize', onResize);
  frame = requestAnimationFrame(tick);

  return {
    destroy: () => {
      destroyed = true;
      cancelAnimationFrame(frame);
      observer.disconnect();
      window.removeEventListener('pointermove', onPointer);
      canvas.removeEventListener('pointerleave', onLeave);
      window.removeEventListener('resize', onResize);
    },
  };
}
