/**
 * The landing scene: a wood-engraving drawn live, black ink on paper.
 *
 * The picture is built the way an engraver would build it, back to front:
 * a black opening cut into the paper; a canopy of overlapping leaf clumps,
 * each one filled with paper before its marks go down so it hides what is
 * behind it; trunks as ribbons of bark grain with mossy tops and hatched
 * undersides; a bright path of streaks converging on the vanishing point;
 * ferns and undergrowth in the corners; and a suited figure walking in.
 *
 * Every element becomes an "op" — a closure that draws it — sorted into three
 * depth bands and, within a band, ordered by distance from the opening, so the
 * reveal blooms outward from the dark while respecting occlusion. The bands
 * are composited each frame with a little parallax and a very slow dolly.
 */

type Band = 0 | 1 | 2; // far, middle, near

interface Op {
  band: Band;
  key: number;
  /** Rough cost, so the reveal paces by ink laid down rather than op count. */
  weight: number;
  draw: (ctx: CanvasRenderingContext2D) => void;
}

export interface InkSceneHandle {
  destroy: () => void;
}

// --- noise and randomness -----------------------------------------------------

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

function fbm(x: number, y: number, octaves = 3): number {
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

class Rng {
  private s: number;
  constructor(seed: number) {
    this.s = seed >>> 0 || 1;
  }
  next(): number {
    this.s = (this.s * 1664525 + 1013904223) >>> 0;
    return this.s / 4294967296;
  }
  range(a: number, b: number): number {
    return a + (b - a) * this.next();
  }
}

// --- curves ---------------------------------------------------------------------

interface CurvePoint {
  x: number;
  y: number;
  tx: number;
  ty: number;
  /** Unit normal, flipped so it points toward the lit (upper) side. */
  nx: number;
  ny: number;
  t: number;
}

/** Samples a Catmull-Rom spline through the points, with tangents and normals. */
function spline(points: Array<[number, number]>, samples: number): CurvePoint[] {
  const out: CurvePoint[] = [];
  const n = points.length;
  for (let i = 0; i <= samples; i += 1) {
    const u = (i / samples) * (n - 1);
    const k = Math.min(n - 2, Math.floor(u));
    const s = u - k;
    const p0 = points[Math.max(0, k - 1)];
    const p1 = points[k];
    const p2 = points[k + 1];
    const p3 = points[Math.min(n - 1, k + 2)];
    const s2 = s * s;
    const s3 = s2 * s;
    const x = 0.5 * (2 * p1[0] + (-p0[0] + p2[0]) * s + (2 * p0[0] - 5 * p1[0] + 4 * p2[0] - p3[0]) * s2 + (-p0[0] + 3 * p1[0] - 3 * p2[0] + p3[0]) * s3);
    const y = 0.5 * (2 * p1[1] + (-p0[1] + p2[1]) * s + (2 * p0[1] - 5 * p1[1] + 4 * p2[1] - p3[1]) * s2 + (-p0[1] + 3 * p1[1] - 3 * p2[1] + p3[1]) * s3);
    let tx = 0.5 * ((-p0[0] + p2[0]) + 2 * (2 * p0[0] - 5 * p1[0] + 4 * p2[0] - p3[0]) * s + 3 * (-p0[0] + 3 * p1[0] - 3 * p2[0] + p3[0]) * s2);
    let ty = 0.5 * ((-p0[1] + p2[1]) + 2 * (2 * p0[1] - 5 * p1[1] + 4 * p2[1] - p3[1]) * s + 3 * (-p0[1] + 3 * p1[1] - 3 * p2[1] + p3[1]) * s2);
    const len = Math.hypot(tx, ty) || 1;
    tx /= len;
    ty /= len;
    let nx = -ty;
    let ny = tx;
    if (ny > 0) {
      nx = -nx;
      ny = -ny;
    }
    out.push({ x, y, tx, ty, nx, ny, t: i / samples });
  }
  return out;
}

// --- the engraver ---------------------------------------------------------------

/**
 * Turns the picture into ops. Works in pixels; the composition is laid out in
 * scene units (y 0..1 over the height, x centred) and scaled by the height so
 * it survives any viewport.
 */
class Engraver {
  readonly ops: Op[] = [];
  private readonly rng = new Rng(20260920);
  private readonly W: number;
  private readonly H: number;
  private readonly S: number; // pixels per scene unit
  private readonly aspect: number;
  private readonly ink: string;
  private readonly paper: string;
  private readonly opening: { x: number; y: number; rx: number; ry: number };
  private readonly horizon = 0.58;
  private readonly vanish: [number, number];

  constructor(width: number, height: number, ink: string, paper: string) {
    this.W = width;
    this.H = height;
    this.S = height;
    this.aspect = width / height;
    this.ink = ink;
    this.paper = paper;
    const squeeze = Math.min(1, this.aspect / 1.6);
    this.opening = { x: 0.02, y: 0.34, rx: 0.3 * squeeze, ry: 0.27 };
    this.vanish = [0.02, 0.56];
  }

  /** Scene → pixels. */
  private px(x: number, y: number): [number, number] {
    return [this.W / 2 + x * this.S, y * this.S];
  }

  /** Normalised distance from the opening's centre: 1 is its nominal edge. */
  private openingDist(x: number, y: number): number {
    const o = this.opening;
    return Math.hypot((x - o.x) / o.rx, (y - o.y) / o.ry);
  }

  private openingEdge(x: number, y: number): number {
    return 1 + 0.22 * (fbm(x * 4 + 3, y * 4 + 1, 3) - 0.5) * 2 + 0.06 * (noise(x * 18 + 1, y * 18 + 5) - 0.5);
  }

  private push(band: Band, x: number, y: number, weight: number, draw: Op['draw']) {
    const key = this.openingDist(x, y) + 0.3 * (fbm(x * 3 + 20, y * 3 + 20, 2) - 0.5);
    this.ops.push({ band, key, weight, draw });
  }

  build() {
    this.drawOpening();
    this.drawCanopy();
    this.drawTrunks();
    this.drawGround();
    this.drawForeground();
    this.ops.sort((a, b) => a.band - b.band || a.key - b.key);
  }

  // -- the opening ---------------------------------------------------------------

  private drawOpening() {
    const o = this.opening;
    const pts: Array<[number, number]> = [];
    for (let i = 0; i < 72; i += 1) {
      const a = (i / 72) * Math.PI * 2;
      const ex = o.x + Math.cos(a) * o.rx * 1.08;
      const ey = o.y + Math.sin(a) * o.ry * 1.08;
      const r = this.openingEdge(ex, ey);
      pts.push(this.px(o.x + Math.cos(a) * o.rx * r * 1.08, o.y + Math.sin(a) * o.ry * r * 1.08));
    }
    const ink = this.ink;
    // The hole itself, then a halo of radial hatching that lets the paper
    // darken into it rather than stopping at a hard line.
    this.ops.push({
      band: 0,
      key: -1,
      weight: 40,
      draw: (ctx) => {
        ctx.fillStyle = ink;
        ctx.beginPath();
        ctx.moveTo(pts[0][0], pts[0][1]);
        for (const [x, y] of pts.slice(1)) ctx.lineTo(x, y);
        ctx.closePath();
        ctx.fill();
      },
    });
    const rng = this.rng;
    const [cx, cy] = this.px(o.x, o.y);
    const lines: Array<[number, number, number, number, number]> = [];
    for (let i = 0; i < 2600; i += 1) {
      const a = rng.range(0, Math.PI * 2);
      const r0 = this.openingEdge(o.x + Math.cos(a) * o.rx, o.y + Math.sin(a) * o.ry) * 1.02;
      const d = rng.range(0, 1);
      const r1 = r0 + d * d * 0.55;
      const [x0, y0] = this.px(o.x + Math.cos(a) * o.rx * r1, o.y + Math.sin(a) * o.ry * r1);
      const len = rng.range(4, 16) * (1 - d * 0.6);
      lines.push([x0, y0, Math.atan2(y0 - cy, (x0 - cx) * (o.ry / o.rx)), len, 0.3 + 0.6 * (1 - d)]);
    }
    this.ops.push({
      band: 0,
      key: -0.5,
      weight: lines.length,
      draw: (ctx) => {
        ctx.strokeStyle = ink;
        ctx.lineWidth = 0.9;
        ctx.lineCap = 'round';
        for (const [x, y, a, len, alpha] of lines) {
          ctx.globalAlpha = alpha;
          ctx.beginPath();
          ctx.moveTo(x, y);
          ctx.lineTo(x + Math.cos(a) * len, y + Math.sin(a) * len);
          ctx.stroke();
        }
        ctx.globalAlpha = 1;
      },
    });
  }

  // -- foliage ---------------------------------------------------------------------

  /**
   * One clump of leaves: a lobed blob filled with paper, then leaf marks whose
   * density carries the shading (dense on the underside and toward the dark),
   * then a contour that is firm below and faint above.
   */
  private clump(band: Band, sx: number, sy: number, r: number, dark: number, key = sx, fixedKey?: number) {
    const rng = this.rng;
    const [cx, cy] = this.px(sx, sy);
    const R = r * this.S;
    const n = 30;
    const seed = rng.range(0, 100);
    const outline: Array<[number, number]> = [];
    for (let i = 0; i < n; i += 1) {
      const a = (i / n) * Math.PI * 2;
      const lobe = 1 + 0.18 * Math.sin(a * 5 + seed) + 0.14 * Math.sin(a * 9 + seed * 2) + 0.16 * (noise(Math.cos(a) * 2 + seed, Math.sin(a) * 2) - 0.5);
      outline.push([cx + Math.cos(a) * R * lobe, cy + Math.sin(a) * R * 0.85 * lobe]);
    }
    const marks: Array<[number, number, number, number, number]> = [];
    const density = 0.06 + 0.24 * dark;
    const count = Math.round(Math.PI * R * R * density);
    for (let i = 0; i < count; i += 1) {
      const a = rng.range(0, Math.PI * 2);
      const d = Math.sqrt(rng.next()) * 0.95;
      const x = cx + Math.cos(a) * R * d;
      const y = cy + Math.sin(a) * R * 0.85 * d;
      // Shade: bottom and right of the clump, and its rim, take more ink.
      const shade = 0.25 + 0.75 * clamp01(0.5 + 0.5 * Math.sin(a) * d + 0.25 * Math.cos(a) * d) + 0.4 * smoothstep(0.7, 0.95, d);
      if (rng.next() > shade * (0.55 + dark * 0.6)) continue;
      marks.push([x, y, rng.range(0, Math.PI * 2), rng.range(1.4, 3.4), rng.range(0.75, 1)]);
    }
    const hatch = dark > 0.55 ? (dark - 0.55) / 0.45 : 0;
    const ink = this.ink;
    const paper = this.paper;
    const lw = 0.85;
    this.ops.push({
      band,
      key: fixedKey ?? this.openingDist(sx, sy) + 0.3 * (fbm(key * 3 + 20, sy * 3 + 20, 2) - 0.5),
      weight: count + 20,
      draw: (ctx) => {
        ctx.beginPath();
        ctx.moveTo(outline[0][0], outline[0][1]);
        for (let i = 1; i <= n; i += 1) {
          const p = outline[i % n];
          const q = outline[(i + 1) % n];
          ctx.quadraticCurveTo(p[0], p[1], (p[0] + q[0]) / 2, (p[1] + q[1]) / 2);
        }
        ctx.closePath();
        ctx.fillStyle = paper;
        ctx.fill();
        if (hatch > 0.72) {
          // The darkest clumps are cut almost solid, with a little paper left in the marks.
          ctx.fillStyle = ink;
          ctx.globalAlpha = (hatch - 0.72) / 0.28 * 0.92;
          ctx.fill();
          ctx.globalAlpha = 1;
        }
        if (hatch > 0) {
          // Near-black clumps: fill with close hatching before the leaf marks.
          ctx.save();
          ctx.clip();
          ctx.strokeStyle = ink;
          ctx.lineWidth = 0.9;
          ctx.globalAlpha = 0.45 + 0.55 * hatch;
          const step = 4 - 2.4 * hatch;
          for (let d = -R * 1.5; d < R * 1.5; d += step) {
            ctx.beginPath();
            ctx.moveTo(cx + d - R, cy - R * 1.5);
            ctx.lineTo(cx + d + R, cy + R * 1.5);
            ctx.stroke();
          }
          ctx.restore();
        }
        ctx.strokeStyle = ink;
        ctx.lineWidth = lw;
        ctx.lineCap = 'round';
        for (const [x, y, a, s, alpha] of marks) {
          ctx.globalAlpha = alpha;
          ctx.beginPath();
          ctx.arc(x, y, s, a, a + 1.9);
          ctx.stroke();
        }
        // Contour: firm on the shaded underside, nearly absent on the lit top.
        ctx.lineWidth = 1;
        for (let i = 0; i < n; i += 1) {
          const p = outline[i];
          const q = outline[(i + 1) % n];
          const my = (p[1] + q[1]) / 2 - cy;
          const under = clamp01(0.5 + (my / (R * 0.85)) * 0.7);
          ctx.globalAlpha = 0.15 + 0.8 * under * (0.5 + 0.5 * dark);
          ctx.beginPath();
          ctx.moveTo(p[0], p[1]);
          ctx.quadraticCurveTo(p[0] + (q[0] - p[0]) * 0.5 + (rng.next() - 0.5) * 2, p[1] + (q[1] - p[1]) * 0.5 - 1.5, q[0], q[1]);
          ctx.stroke();
        }
        ctx.globalAlpha = 1;
      },
    });
  }

  private drawCanopy() {
    const half = this.aspect / 2;
    const step = 0.03;
    // Far canopy: small dark clumps, especially crowding the opening's rim.
    for (let y = -0.05; y < this.horizon + 0.05; y += step) {
      for (let x = -half - 0.05; x < half + 0.05; x += step) {
        const jx = x + this.rng.range(-0.4, 0.4) * step;
        const jy = y + this.rng.range(-0.4, 0.4) * step;
        const d = this.openingDist(jx, jy);
        const edge = this.openingEdge(jx, jy);
        if (d < edge - 0.12) continue;
        const nearRim = smoothstep(edge + 0.65, edge - 0.05, d);
        const massive = fbm(jx * 2.2 + 4, jy * 2.2 + 9, 3);
        if (this.rng.next() > 0.55 + 0.4 * massive) continue;
        const r = 0.018 + 0.03 * this.rng.next() * (0.6 + massive);
        const light = fbm(jx * 1.3 + 30, jy * 1.3 + 7, 2);
        const dark = clamp01(0.5 + 0.6 * nearRim + 0.5 * (0.5 - light) + 0.6 * smoothstep(0.4, -0.05, jy));
        this.clump(0, jx, jy, r, dark, jx);
      }
    }
    // Middle canopy: bigger, lighter clumps in masses, leaving the opening clear.
    const step2 = 0.045;
    for (let y = -0.05; y < this.horizon; y += step2) {
      for (let x = -half - 0.05; x < half + 0.05; x += step2) {
        const jx = x + this.rng.range(-0.5, 0.5) * step2;
        const jy = y + this.rng.range(-0.5, 0.5) * step2;
        const d = this.openingDist(jx, jy);
        const edge = this.openingEdge(jx, jy);
        if (d < edge + 0.08) continue;
        const mass = fbm(jx * 1.8 + 11, jy * 1.8 + 2, 3);
        if (this.rng.next() > mass * 1.3 - 0.15) continue;
        const r = 0.03 + 0.045 * this.rng.next() * (0.5 + mass);
        const rim = smoothstep(edge + 0.85, edge + 0.1, d);
        const light = fbm(jx * 1.3 + 30, jy * 1.3 + 7, 2);
        const dark = clamp01(0.28 + 0.6 * rim + 0.55 * (0.5 - light) + 0.55 * smoothstep(0.38, -0.05, jy));
        this.clump(1, jx, jy, r, dark, jx);
      }
    }
  }

  // -- trunks ------------------------------------------------------------------------

  private trunk(band: Band, points: Array<[number, number]>, w0: number, w1: number, gnarl = 1) {
    const rng = this.rng;
    const curve = spline(points.map(([x, y]) => this.px(x, y)), 90);
    const width = (t: number) => (w0 + (w1 - w0) * t) * this.S * (1 + 0.12 * gnarl * Math.sin(t * 9 + points[0][0] * 7));
    const left: Array<[number, number]> = [];
    const right: Array<[number, number]> = [];
    for (const p of curve) {
      const w = width(p.t);
      left.push([p.x + p.nx * w, p.y + p.ny * w]);
      right.push([p.x - p.nx * w, p.y - p.ny * w]);
    }
    // Bark grain: lines along the trunk at offsets across it; the underside
    // gets more of them, closer together, and the lit top almost none.
    const grain: Array<{ pts: Array<[number, number]>; lw: number; alpha: number }> = [];
    for (let i = 0; i < 260; i += 1) {
      const u = rng.range(-1, 1);
      const under = clamp01((u + 1) / 2); // 0 lit edge, 1 shadow edge
      if (rng.next() > 0.18 + 0.82 * under) continue;
      const wob = rng.range(0, 100);
      const t0 = rng.range(0, 0.92);
      const t1 = t0 + rng.range(0.05, 0.22);
      const pts: Array<[number, number]> = [];
      for (const p of curve) {
        if (p.t < t0 || p.t > t1) continue;
        const w = width(p.t);
        const off = (-u + 0.14 * (noise(p.t * 9 + wob, u * 3) - 0.5) * 2) * w * 0.94;
        pts.push([p.x + p.nx * off, p.y + p.ny * off]);
      }
      if (pts.length > 2) grain.push({ pts, lw: 0.55 + 1.4 * under * rng.next(), alpha: 0.5 + 0.5 * under });
    }
    // Cross ticks on the underside, and knots.
    const ticks: Array<[number, number, number, number]> = [];
    for (const p of curve) {
      const w = width(p.t);
      for (let k = 0; k < 3; k += 1) {
        if (rng.next() > 0.35) continue;
        const u = rng.range(0.15, 0.95);
        const x = p.x - p.nx * u * w;
        const y = p.y - p.ny * u * w;
        const len = rng.range(2, 6);
        ticks.push([x, y, x + p.nx * len * (rng.next() > 0.5 ? 1 : -1) + p.tx * rng.range(-1, 1), y + p.ny * len]);
      }
    }
    const knots: Array<[number, number, number, number]> = [];
    for (let i = 0; i < 2 + Math.round(gnarl * 2); i += 1) {
      const p = curve[Math.floor(rng.range(10, 80))];
      const w = width(p.t);
      knots.push([p.x + p.nx * rng.range(-0.4, 0.3) * w, p.y + p.ny * rng.range(-0.4, 0.3) * w, w * rng.range(0.18, 0.3), rng.range(0, Math.PI)]);
    }
    const ink = this.ink;
    const paper = this.paper;
    const mid = curve[45];
    const [msx, msy] = [(mid.x - this.W / 2) / this.S, mid.y / this.S];
    const trunkKey = this.openingDist(msx, msy) + 0.3 * (fbm(msx * 3 + 20, msy * 3 + 20, 2) - 0.5);
    this.ops.push({ band, key: trunkKey, weight: 300, draw: (ctx) => {
      ctx.beginPath();
      ctx.moveTo(left[0][0], left[0][1]);
      for (const [x, y] of left) ctx.lineTo(x, y);
      for (let i = right.length - 1; i >= 0; i -= 1) ctx.lineTo(right[i][0], right[i][1]);
      ctx.closePath();
      ctx.fillStyle = paper;
      ctx.fill();
      ctx.save();
      ctx.clip();
      ctx.strokeStyle = ink;
      ctx.lineCap = 'round';
      for (const g of grain) {
        ctx.globalAlpha = g.alpha;
        ctx.lineWidth = g.lw;
        ctx.beginPath();
        ctx.moveTo(g.pts[0][0], g.pts[0][1]);
        for (let i = 1; i < g.pts.length; i += 1) ctx.lineTo(g.pts[i][0], g.pts[i][1]);
        ctx.stroke();
      }
      // Underside: close diagonal hatching so the trunk turns away into shadow.
      ctx.lineWidth = 0.9;
      ctx.globalAlpha = 0.9;
      ctx.beginPath();
      for (const p of curve) {
        const w = width(p.t);
        for (let u = 0.3; u < 1.02; u += 0.09) {
          const x = p.x - p.nx * u * w;
          const y = p.y - p.ny * u * w;
          const k = 2 + 4.5 * (u - 0.3) / 0.7;
          ctx.moveTo(x - k, y - k * 0.8);
          ctx.lineTo(x + k, y + k * 0.8);
          if (u > 0.62) {
            ctx.moveTo(x - k * 0.8, y + k);
            ctx.lineTo(x + k * 0.8, y - k);
          }
        }
      }
      ctx.stroke();
      ctx.lineWidth = 0.7;
      ctx.globalAlpha = 0.7;
      for (const [x0, y0, x1, y1] of ticks) {
        ctx.beginPath();
        ctx.moveTo(x0, y0);
        ctx.lineTo(x1, y1);
        ctx.stroke();
      }
      ctx.lineWidth = 0.8;
      for (const [x, y, r, a] of knots) {
        for (let k = 1; k <= 3; k += 1) {
          ctx.globalAlpha = 0.8 - k * 0.15;
          ctx.beginPath();
          ctx.ellipse(x, y, r * k * 0.45, r * k * 0.28, a, 0, Math.PI * 2);
          ctx.stroke();
        }
      }
      ctx.restore();
      // Edges: the shadow edge heavy, the lit edge light.
      ctx.globalAlpha = 1;
      ctx.lineWidth = 1.7;
      ctx.beginPath();
      ctx.moveTo(right[0][0], right[0][1]);
      for (const [x, y] of right) ctx.lineTo(x, y);
      ctx.stroke();
      ctx.globalAlpha = 0.45;
      ctx.lineWidth = 0.9;
      ctx.beginPath();
      ctx.moveTo(left[0][0], left[0][1]);
      for (const [x, y] of left) ctx.lineTo(x, y);
      ctx.stroke();
      ctx.globalAlpha = 1;
    } });
    // Moss all over the trunk, drawn just after it: light and sparse on the
    // lit top, dense and dark on the underside, spilling past both edges.
    let order = 0;
    for (const p of curve) {
      const w = width(p.t);
      const n = 1 + Math.floor(rng.next() * 3);
      for (let k = 0; k < n; k += 1) {
        const u = rng.range(-1.05, 1.05); // -1 lit edge … 1 shadow edge
        const under = clamp01((u + 1) / 2);
        if (rng.next() > 0.14 + 0.3 * under) continue;
        const [sx, sy] = [(p.x - p.nx * w * u - this.W / 2) / this.S, (p.y - p.ny * w * u) / this.S];
        order += 1e-6;
        this.clump(band, sx, sy, (0.12 + 0.26 * rng.next()) * (w / this.S), clamp01(0.3 + 0.55 * under + 0.15 * rng.next()), sx, trunkKey + order);
      }
    }
    // Over the moss: the edges again, and a shadow band that pulls the
    // underside together into one dark form.
    this.ops.push({ band, key: trunkKey + 0.001, weight: 60, draw: (ctx) => {
      ctx.save();
      ctx.beginPath();
      ctx.moveTo(left[0][0], left[0][1]);
      for (const [x, y] of left) ctx.lineTo(x, y);
      for (let i = right.length - 1; i >= 0; i -= 1) ctx.lineTo(right[i][0], right[i][1]);
      ctx.closePath();
      ctx.clip();
      ctx.strokeStyle = ink;
      ctx.lineCap = 'round';
      ctx.lineWidth = 0.8;
      ctx.beginPath();
      for (const p of curve) {
        const w = width(p.t);
        for (let u = 0.62; u < 1.02; u += 0.07) {
          const x = p.x - p.nx * u * w;
          const y = p.y - p.ny * u * w;
          const k = 1.5 + 4 * (u - 0.62) / 0.4;
          ctx.moveTo(x - k, y - k * 0.7);
          ctx.lineTo(x + k, y + k * 0.7);
        }
      }
      ctx.globalAlpha = 0.85;
      ctx.stroke();
      ctx.restore();
      ctx.strokeStyle = ink;
      ctx.lineJoin = 'round';
      ctx.globalAlpha = 1;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(right[0][0], right[0][1]);
      for (const [x, y] of right) ctx.lineTo(x, y);
      ctx.stroke();
      ctx.globalAlpha = 0.5;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(left[0][0], left[0][1]);
      for (const [x, y] of left) ctx.lineTo(x, y);
      ctx.stroke();
      ctx.globalAlpha = 1;
    } });
  }

  private drawTrunks() {
    const half = this.aspect / 2;
    // Far trunks and the bough, behind the middle canopy.
    this.trunk(0, [[-half * 0.62, 0.7], [-half * 0.5, 0.42], [-half * 0.3, 0.18], [-0.08, -0.04]], 0.04, 0.02);
    this.trunk(0, [[half * 0.6, 0.66], [half * 0.5, 0.36], [half * 0.28, 0.12], [0.16, -0.06]], 0.036, 0.018);
    this.trunk(1, [[-half * 0.85, 0.2], [-half * 0.4, 0.02], [0.1, -0.06], [half * 0.5, 0.05], [half * 0.9, 0.22]], 0.032, 0.03, 1.4);
    // Near trunks, thick and gnarled, framing the opening from both sides.
    this.trunk(2, [[-half * 1.02, 1.08], [-half * 0.9, 0.78], [-half * 0.72, 0.56], [-half * 0.62, 0.4], [-half * 0.42, 0.2], [-half * 0.3, 0.06], [-0.2, -0.06]], 0.085, 0.03, 1.8);
    this.trunk(2, [[half * 1.04, 1.02], [half * 0.94, 0.7], [half * 0.78, 0.5], [half * 0.7, 0.34], [half * 0.5, 0.16], [half * 0.38, 0.04], [0.28, -0.06]], 0.08, 0.028, 1.8);
    // Low boughs reaching in.
    this.trunk(2, [[-half * 1.02, 0.5], [-half * 0.7, 0.44], [-half * 0.45, 0.34], [-0.28, 0.28]], 0.03, 0.01, 1.2);
    this.trunk(2, [[half * 1.02, 0.44], [half * 0.72, 0.4], [half * 0.5, 0.33], [0.32, 0.26]], 0.028, 0.01, 1.2);
  }

  // -- ground ----------------------------------------------------------------------

  private pathHalfWidth(y: number): number {
    const depth = clamp01((y - this.horizon) / (1 - this.horizon));
    return 0.03 + 0.28 * depth + 0.42 * depth * depth;
  }

  private pathCentre(y: number): number {
    const depth = clamp01((y - this.horizon) / (1 - this.horizon));
    return this.vanish[0] + 0.05 * Math.sin(depth * 3.6) - 0.03 * depth;
  }

  private drawGround() {
    const rng = this.rng;
    const half = this.aspect / 2;
    const ink = this.ink;
    const paper = this.paper;
    const [vx, vy] = this.vanish;
    const [vpx, vpy] = this.px(vx, vy);

    // The path polygon, with wobbling edges.
    const leftEdge: Array<[number, number]> = [];
    const rightEdge: Array<[number, number]> = [];
    for (let y = this.horizon - 0.02; y <= 1.08; y += 0.02) {
      const c = this.pathCentre(y);
      const w = this.pathHalfWidth(y);
      const wob = 0.12 * (noise(y * 9, 3) - 0.5) * w;
      leftEdge.push(this.px(c - w + wob, y));
      rightEdge.push(this.px(c + w - wob, y));
    }
    // Streaks converging on the vanishing point, sparse down the bright middle.
    const streaks: Array<[number, number, number, number, number, number]> = [];
    const N = Math.round(3600 * this.aspect);
    for (let i = 0; i < N; i += 1) {
      const y = this.horizon + Math.pow(rng.next(), 0.7) * (1.1 - this.horizon);
      const c = this.pathCentre(y);
      const w = this.pathHalfWidth(y);
      const u = rng.range(-1, 1);
      const middle = 1 - Math.abs(u);
      const far = 1 - clamp01((y - this.horizon) / 0.3);
      if (rng.next() < middle * middle * 0.95 * (1 - far * 0.9)) continue;
      const [x0, y0] = this.px(c + u * w, y);
      const a = Math.atan2(y0 - vpy, x0 - vpx);
      const len = rng.range(3, 14) * (0.3 + 0.7 * clamp01((y - this.horizon) / 0.4));
      const dir = rng.next() > 0.5 ? 1 : -1;
      streaks.push([x0, y0, a, len * dir, 0.6 + 0.5 * rng.next(), 0.3 + 0.55 * (Math.abs(u) * 0.7 + far * 0.6)]);
    }
    // Ripples across the path, spaced by perspective.
    const ripples: Array<Array<[number, number]>> = [];
    for (let d = 0.02; d < 1; d += 0.018 + d * 0.06) {
      const y = this.horizon + d * (1.05 - this.horizon);
      const c = this.pathCentre(y);
      const w = this.pathHalfWidth(y);
      if (rng.next() > 0.85) continue;
      const pts: Array<[number, number]> = [];
      const u0 = rng.range(-1, -0.2);
      const u1 = rng.range(0.2, 1);
      for (let u = u0; u <= u1; u += 0.08) {
        pts.push(this.px(c + u * w, y + 0.004 * Math.sin(u * 7 + y * 30) + 0.006 * (noise(u * 5, y * 40) - 0.5)));
      }
      ripples.push(pts);
    }
    const pebbles: Array<[number, number, number, number]> = [];
    for (let i = 0; i < 1600 * this.aspect; i += 1) {
      const y = this.horizon + 0.05 + Math.pow(rng.next(), 0.6) * (1 - this.horizon);
      const c = this.pathCentre(y);
      const w = this.pathHalfWidth(y);
      const u = rng.range(-1, 1);
      if (rng.next() < (1 - Math.abs(u)) * 0.6) continue;
      const [x0, y0] = this.px(c + u * w, y);
      pebbles.push([x0, y0, rng.range(1, 4) * (0.4 + (y - this.horizon)), rng.range(0.4, 0.9)]);
    }
    this.push(1, vx, 0.85, 400 + streaks.length, (ctx) => {
      ctx.beginPath();
      ctx.moveTo(leftEdge[0][0], leftEdge[0][1]);
      for (const [x, y] of leftEdge) ctx.lineTo(x, y);
      for (let i = rightEdge.length - 1; i >= 0; i -= 1) ctx.lineTo(rightEdge[i][0], rightEdge[i][1]);
      ctx.closePath();
      ctx.fillStyle = paper;
      ctx.fill();
      ctx.save();
      ctx.clip();
      ctx.strokeStyle = ink;
      ctx.lineCap = 'round';
      for (const [x, y, a, len, lw, alpha] of streaks) {
        ctx.globalAlpha = alpha;
        ctx.lineWidth = lw;
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(x + Math.cos(a) * len, y + Math.sin(a) * len);
        ctx.stroke();
      }
      ctx.lineWidth = 0.7;
      ctx.globalAlpha = 0.5;
      for (const pts of ripples) {
        ctx.beginPath();
        ctx.moveTo(pts[0][0], pts[0][1]);
        for (let i = 1; i < pts.length; i += 1) ctx.lineTo(pts[i][0], pts[i][1]);
        ctx.stroke();
      }
      ctx.lineWidth = 1.1;
      for (const [x, y, len, alpha] of pebbles) {
        ctx.globalAlpha = alpha;
        ctx.beginPath();
        ctx.moveTo(x - len / 2, y);
        ctx.lineTo(x + len / 2, y + 0.3);
        ctx.stroke();
      }
      ctx.restore();
      ctx.globalAlpha = 1;
    });

    // Undergrowth either side of the path: dense small clumps, then grass
    // tufts along the path's edge.
    const step = 0.028;
    for (let y = this.horizon - 0.03; y < 1.06; y += step) {
      for (let x = -half - 0.05; x < half + 0.05; x += step) {
        const jx = x + rng.range(-0.5, 0.5) * step;
        const jy = y + rng.range(-0.5, 0.5) * step;
        const c = this.pathCentre(jy);
        const w = this.pathHalfWidth(jy);
        const off = Math.abs(jx - c) / w;
        if (off < 0.95) continue;
        if (rng.next() > 0.75) continue;
        const depth = clamp01((jy - this.horizon) / (1 - this.horizon));
        const r = (0.014 + 0.028 * rng.next()) * (0.7 + 0.8 * depth);
        const dark = clamp01(0.4 + 0.3 * smoothstep(2.2, 1, off) + 0.2 * rng.next() - 0.15 * depth);
        this.clump(1, jx, jy, r, dark, jx);
      }
    }
    const tufts: Array<{ x: number; y: number; s: number; blades: Array<[number, number, number]> }> = [];
    for (let y = this.horizon + 0.03; y < 1.05; y += 0.02) {
      for (const side of [-1, 1]) {
        if (rng.next() > 0.7) continue;
        const c = this.pathCentre(y);
        const w = this.pathHalfWidth(y);
        const [px0, py0] = this.px(c + side * w * rng.range(0.85, 1.08), y);
        const s = (4 + 14 * (y - this.horizon)) * (1 + rng.next());
        const blades: Array<[number, number, number]> = [];
        for (let k = 0; k < 6; k += 1) blades.push([rng.range(-1.2, 1.2) + side * 0.3, rng.range(0.6, 1.1), rng.range(-0.5, 0.5)]);
        tufts.push({ x: px0, y: py0, s, blades });
      }
    }
    this.push(1, vx, 0.95, tufts.length * 6, (ctx) => {
      ctx.strokeStyle = ink;
      ctx.lineWidth = 0.9;
      ctx.lineCap = 'round';
      ctx.globalAlpha = 0.85;
      for (const t of tufts) {
        for (const [a, l, c] of t.blades) {
          ctx.beginPath();
          ctx.moveTo(t.x, t.y);
          ctx.quadraticCurveTo(t.x + a * t.s * 0.4 + c * t.s, t.y - t.s * l * 0.6, t.x + a * t.s * 0.8, t.y - t.s * l);
          ctx.stroke();
        }
      }
      ctx.globalAlpha = 1;
    });
  }

  // -- foreground --------------------------------------------------------------------

  private frond(band: Band, sx: number, sy: number, angle: number, length: number) {
    const rng = this.rng;
    const [x0, y0] = this.px(sx, sy);
    const L = length * this.S;
    const bend = rng.range(-0.5, 0.5);
    const stem: Array<[number, number]> = [];
    for (let i = 0; i <= 18; i += 1) {
      const t = i / 18;
      const a = angle + bend * t * t * 1.4;
      const prev = stem[i - 1] ?? [x0, y0];
      stem.push([prev[0] + Math.cos(a) * (L / 18), prev[1] + Math.sin(a) * (L / 18)]);
    }
    const leaflets: Array<[number, number, number, number]> = [];
    for (let i = 2; i < 18; i += 1) {
      const [x, y] = stem[i];
      const t = i / 18;
      const dir = Math.atan2(stem[i][1] - stem[i - 1][1], stem[i][0] - stem[i - 1][0]);
      const len = L * 0.16 * (1 - t) * (0.6 + 0.4 * Math.sin(t * Math.PI));
      for (const s of [-1, 1]) {
        const a = dir + s * rng.range(0.9, 1.3);
        leaflets.push([x, y, x + Math.cos(a) * len, y + Math.sin(a) * len]);
      }
    }
    const ink = this.ink;
    this.push(band, sx, sy, leaflets.length, (ctx) => {
      ctx.strokeStyle = ink;
      ctx.lineCap = 'round';
      ctx.globalAlpha = 0.95;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(x0, y0);
      for (const [x, y] of stem) ctx.lineTo(x, y);
      ctx.stroke();
      ctx.lineWidth = 1.15;
      for (const [ax, ay, bx, by] of leaflets) {
        ctx.beginPath();
        ctx.moveTo(ax, ay);
        ctx.quadraticCurveTo((ax + bx) / 2, (ay + by) / 2 - 2, bx, by);
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
    });
  }

  private drawForeground() {
    const rng = this.rng;
    const half = this.aspect / 2;
    for (const side of [-1, 1]) {
      // A mass of big leafy clumps in the corner.
      for (let i = 0; i < 26; i += 1) {
        const sx = side * half * rng.range(0.55, 1.05);
        const sy = rng.range(0.72, 1.06);
        const r = rng.range(0.035, 0.08);
        this.clump(2, sx, sy, r, rng.range(0.3, 0.6), sx);
      }
      // Ferns fanning up out of it.
      for (let i = 0; i < 14; i += 1) {
        const sx = side * half * rng.range(0.55, 1);
        const sy = rng.range(0.84, 1.04);
        const angle = -Math.PI / 2 - side * rng.range(0.1, 1);
        this.frond(2, sx, sy, angle, rng.range(0.14, 0.3));
      }
    }
  }
}

// --- the figure ------------------------------------------------------------------

/**
 * A suited figure from behind, mid-stride toward the opening: helmet, the
 * big pack with its panels and hoses, a soft suit shaded with hatching. Black
 * line on paper, like everything else, but drawn as a designed object rather
 * than a texture, so it reads as the one thing in the picture that is not
 * made of leaves.
 */
function drawFigure(ctx: CanvasRenderingContext2D, x: number, footY: number, h: number, t: number, ink: string, paper: string) {
  // Breath only: ≥8s period, ≤2px travel — anything snappier reads as shake.
  const bob = Math.sin(t * ((Math.PI * 2) / 8)) * Math.min(2, h * 0.002);
  const sway = Math.sin(t * ((Math.PI * 2) / 10.5)) * 0.003;
  ctx.save();
  ctx.translate(x, footY + bob);
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  const lw = Math.max(1.1, h * 0.0045);

  const capsule = (x0: number, y0: number, x1: number, y1: number, r0: number, r1 = r0) => {
    const a = Math.atan2(y1 - y0, x1 - x0);
    ctx.beginPath();
    ctx.arc(x0, y0, r0, a + Math.PI / 2, a - Math.PI / 2);
    ctx.arc(x1, y1, r1, a - Math.PI / 2, a + Math.PI / 2);
    ctx.closePath();
  };
  /** Paper fill, hatching on the shadow side, contour rings, black outline. */
  const part = (shape: () => void, opts: { shadow?: number; rings?: [number, number, number] | null; angle?: number; outline?: number } = {}) => {
    const { shadow = 0.45, rings = null, angle = 1.15, outline = lw } = opts;
    shape();
    ctx.fillStyle = paper;
    ctx.fill();
    ctx.save();
    shape();
    ctx.clip();
    ctx.strokeStyle = ink;
    ctx.lineWidth = Math.max(0.7, h * 0.0022);
    // Shadow hatching: the viewer's left is away from the light in the opening.
    const span = h * 1.2;
    const dx = Math.cos(angle);
    const dy = Math.sin(angle);
    for (let d = -span; d < span; d += h * 0.0095) {
      const p = (d + span) / (2 * span); // 0 at left, 1 at right
      if (p > shadow) continue;
      ctx.globalAlpha = 0.35 + 0.65 * smoothstep(shadow, 0, p);
      const cx = -dy * d;
      const cy = -h / 2 + dx * d;
      ctx.beginPath();
      ctx.moveTo(cx - dx * span, cy - dy * span);
      ctx.lineTo(cx + dx * span, cy + dy * span);
      ctx.stroke();
    }
    if (rings) {
      const [y0, y1, step] = rings;
      ctx.globalAlpha = 0.55;
      for (let y = y0; y < y1; y += step) {
        ctx.beginPath();
        ctx.moveTo(-h, y);
        ctx.quadraticCurveTo(0, y + step * 0.6, h, y);
        ctx.stroke();
      }
    }
    ctx.restore();
    ctx.globalAlpha = 1;
    shape();
    ctx.strokeStyle = ink;
    ctx.lineWidth = outline;
    ctx.stroke();
  };

  // Ground shadow.
  ctx.fillStyle = ink;
  ctx.globalAlpha = 0.85;
  ctx.beginPath();
  ctx.ellipse(h * 0.01, h * 0.005, h * 0.17, h * 0.03, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.globalAlpha = 1;

  // Legs mid-stride: the left one forward and planted, the right pushing off.
  part(() => capsule(-h * 0.065, -h * 0.47, -h * 0.08 - sway * h, -h * 0.26, h * 0.062, h * 0.056), { shadow: 0.55, rings: [-h * 0.44, -h * 0.28, h * 0.035] });
  part(() => capsule(-h * 0.08 - sway * h, -h * 0.26, -h * 0.085 - sway * h, -h * 0.07, h * 0.055, h * 0.05), { shadow: 0.55, rings: [-h * 0.24, -h * 0.09, h * 0.035] });
  part(() => capsule(h * 0.065, -h * 0.47, h * 0.085 + sway * h, -h * 0.27, h * 0.062, h * 0.056), { shadow: 0.35, rings: [-h * 0.44, -h * 0.29, h * 0.035] });
  part(() => capsule(h * 0.085 + sway * h, -h * 0.27, h * 0.095 + sway * h, -h * 0.09, h * 0.055, h * 0.05), { shadow: 0.35, rings: [-h * 0.25, -h * 0.11, h * 0.035] });
  part(() => { ctx.beginPath(); ctx.roundRect(-h * 0.15 - sway * h, -h * 0.075, h * 0.135, h * 0.075, h * 0.02); }, { shadow: 0.6 });
  part(() => { ctx.beginPath(); ctx.roundRect(h * 0.03 + sway * h, -h * 0.095, h * 0.135, h * 0.075, h * 0.02); }, { shadow: 0.3 });
  // Torso: shoulders down to the hips.
  part(() => {
    ctx.beginPath();
    ctx.moveTo(-h * 0.165, -h * 0.8);
    ctx.quadraticCurveTo(-h * 0.19, -h * 0.68, -h * 0.13, -h * 0.46);
    ctx.lineTo(h * 0.13, -h * 0.46);
    ctx.quadraticCurveTo(h * 0.19, -h * 0.68, h * 0.165, -h * 0.8);
    ctx.quadraticCurveTo(0, -h * 0.86, -h * 0.165, -h * 0.8);
    ctx.closePath();
  }, { shadow: 0.5, rings: [-h * 0.56, -h * 0.46, h * 0.03] });
  // Arms hanging, gloves.
  part(() => capsule(-h * 0.17, -h * 0.76, -h * 0.22 + sway * h * 0.5, -h * 0.6, h * 0.048), { shadow: 0.6, rings: [-h * 0.74, -h * 0.6, h * 0.03] });
  part(() => capsule(-h * 0.22 + sway * h * 0.5, -h * 0.6, -h * 0.21 + sway * h, -h * 0.44, h * 0.044), { shadow: 0.6, rings: [-h * 0.58, -h * 0.45, h * 0.03] });
  part(() => { ctx.beginPath(); ctx.ellipse(-h * 0.21 + sway * h, -h * 0.4, h * 0.042, h * 0.05, 0.2, 0, Math.PI * 2); }, { shadow: 0.55 });
  part(() => capsule(h * 0.17, -h * 0.76, h * 0.22 - sway * h * 0.5, -h * 0.6, h * 0.048), { shadow: 0.3, rings: [-h * 0.74, -h * 0.6, h * 0.03] });
  part(() => capsule(h * 0.22 - sway * h * 0.5, -h * 0.6, h * 0.21 - sway * h, -h * 0.44, h * 0.044), { shadow: 0.3, rings: [-h * 0.58, -h * 0.45, h * 0.03] });
  part(() => { ctx.beginPath(); ctx.ellipse(h * 0.21 - sway * h, -h * 0.4, h * 0.042, h * 0.05, -0.2, 0, Math.PI * 2); }, { shadow: 0.3 });
  // The pack.
  part(() => { ctx.beginPath(); ctx.roundRect(-h * 0.13, -h * 0.84, h * 0.26, h * 0.32, h * 0.014); }, { shadow: 0.42, angle: 1.4 });
  ctx.strokeStyle = ink;
  ctx.lineWidth = Math.max(0.9, h * 0.003);
  const panel = (x0: number, y0: number, w: number, hh: number, inner = true) => {
    ctx.beginPath();
    ctx.roundRect(x0, y0, w, hh, h * 0.006);
    ctx.stroke();
    if (inner) {
      ctx.globalAlpha = 0.6;
      ctx.beginPath();
      ctx.roundRect(x0 + h * 0.008, y0 + h * 0.008, w - h * 0.016, hh - h * 0.016, h * 0.004);
      ctx.stroke();
      ctx.globalAlpha = 1;
    }
  };
  panel(-h * 0.11, -h * 0.82, h * 0.1, h * 0.07);
  panel(h * 0.01, -h * 0.82, h * 0.1, h * 0.07);
  panel(-h * 0.11, -h * 0.735, h * 0.22, h * 0.075, false);
  for (let i = 1; i < 6; i += 1) {
    ctx.beginPath();
    ctx.moveTo(-h * 0.11 + i * h * 0.0367, -h * 0.735);
    ctx.lineTo(-h * 0.11 + i * h * 0.0367, -h * 0.66);
    ctx.stroke();
  }
  panel(-h * 0.11, -h * 0.645, h * 0.09, h * 0.085);
  for (let i = 0; i < 5; i += 1) {
    ctx.globalAlpha = 0.7;
    ctx.beginPath();
    ctx.moveTo(-h * 0.1, -h * 0.63 + i * h * 0.014);
    ctx.lineTo(-h * 0.03, -h * 0.63 + i * h * 0.014);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
  ctx.beginPath();
  ctx.arc(h * 0.055, -h * 0.6, h * 0.03, 0, Math.PI * 2);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(h * 0.055, -h * 0.6, h * 0.014, 0, Math.PI * 2);
  ctx.stroke();
  panel(h * 0.015, -h * 0.555, h * 0.085, h * 0.028, false);
  // Straps over the shoulders and hoses to the hip.
  ctx.lineWidth = Math.max(1, h * 0.004);
  for (const s of [-1, 1]) {
    ctx.beginPath();
    ctx.moveTo(s * h * 0.08, -h * 0.84);
    ctx.quadraticCurveTo(s * h * 0.11, -h * 0.87, s * h * 0.13, -h * 0.8);
    ctx.stroke();
  }
  const hose = (ox: number) => {
    ctx.beginPath();
    ctx.moveTo(h * 0.13, -h * 0.66 + ox);
    ctx.bezierCurveTo(h * 0.2, -h * 0.66 + ox, h * 0.19, -h * 0.5, h * 0.14, -h * 0.47 + ox * 0.5);
  };
  ctx.lineWidth = Math.max(2.4, h * 0.016);
  ctx.strokeStyle = paper;
  hose(0);
  ctx.stroke();
  hose(h * 0.02);
  ctx.stroke();
  ctx.lineWidth = lw;
  ctx.strokeStyle = ink;
  hose(0);
  ctx.stroke();
  hose(h * 0.02);
  ctx.stroke();
  ctx.lineWidth = Math.max(0.7, h * 0.0025);
  ctx.globalAlpha = 0.6;
  for (let i = 0; i < 9; i += 1) {
    const u = 0.1 + i * 0.1;
    const mt = 1 - u;
    const hx = mt * mt * mt * h * 0.13 + 3 * mt * mt * u * h * 0.2 + 3 * mt * u * u * h * 0.19 + u * u * u * h * 0.14;
    const hy = mt * mt * mt * -h * 0.66 + 3 * mt * mt * u * -h * 0.66 + 3 * mt * u * u * -h * 0.5 + u * u * u * -h * 0.47;
    ctx.beginPath();
    ctx.moveTo(hx - h * 0.008, hy - h * 0.006);
    ctx.lineTo(hx + h * 0.008, hy + h * 0.006);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
  // Collar ring and helmet.
  part(() => { ctx.beginPath(); ctx.ellipse(0, -h * 0.83, h * 0.075, h * 0.026, 0, 0, Math.PI * 2); }, { shadow: 0.5 });
  part(() => { ctx.beginPath(); ctx.arc(0, -h * 0.905, h * 0.085, 0, Math.PI * 2); }, { shadow: 0.42, angle: 1.0, outline: lw * 1.2 });
  ctx.strokeStyle = ink;
  ctx.lineWidth = Math.max(0.9, h * 0.003);
  ctx.globalAlpha = 0.7;
  ctx.beginPath();
  ctx.arc(0, -h * 0.905, h * 0.085, 0.35, Math.PI - 0.35);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(0, -h * 0.905, h * 0.06, -2.5, -1.5);
  ctx.stroke();
  ctx.globalAlpha = 1;
  ctx.restore();
}

// --- driver ---------------------------------------------------------------------

export function initInkScene(canvas: HTMLCanvasElement): InkSceneHandle {
  const ctx = canvas.getContext('2d');
  if (!ctx) return { destroy: () => undefined };

  const style = getComputedStyle(document.documentElement);
  const ink = style.getPropertyValue('--ink').trim() || '#141414';
  const paper = style.getPropertyValue('--bg').trim() || '#f2f0ea';
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  let width = 0;
  let height = 0;
  let dpr = 1;
  let ops: Op[] = [];
  let totalWeight = 1;
  let layers: HTMLCanvasElement[] = [];
  let layerCtx: CanvasRenderingContext2D[] = [];
  let drawn = 0;
  let drawnWeight = 0;
  let revealStart = 0;
  const revealDuration = 4200;
  let frame = 0;
  let visible = true;
  let destroyed = false;
  const pointer = { x: 0, y: 0 };
  const eased = { x: 0, y: 0 };
  const start = performance.now();
  /** After the engraving finishes, bake layers and only breathe the figure. */
  let frozen = false;
  let layerCache: HTMLCanvasElement | null = null;


  const inkUpTo = (weight: number) => {
    while (drawn < ops.length && drawnWeight < weight) {
      const op = ops[drawn];
      op.draw(layerCtx[op.band]);
      drawnWeight += op.weight;
      drawn += 1;
    }
  };

  const build = (instant: boolean) => {
    const rect = canvas.getBoundingClientRect();
    width = Math.max(1, Math.round(rect.width));
    height = Math.max(1, Math.round(rect.height));
    // Cap DPR so retina does not keep a double-density stroke budget alive.
    dpr = Math.min(window.devicePixelRatio || 1, width < 720 ? 1.25 : 1.75);
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
    const engraver = new Engraver(width, height, ink, paper);
    engraver.build();
    ops = engraver.ops;
    totalWeight = ops.reduce((sum, op) => sum + op.weight, 0) || 1;
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
    drawnWeight = 0;
    revealStart = performance.now();
    frozen = false;
    layerCache = null;
    if (instant) inkUpTo(Infinity);
  };

  const bakeLayers = () => {
    const cache = document.createElement('canvas');
    cache.width = canvas.width;
    cache.height = canvas.height;
    const c = cache.getContext('2d')!;
    c.setTransform(dpr, 0, 0, dpr, 0, 0);
    c.fillStyle = paper;
    c.fillRect(0, 0, width, height);
    for (const layer of layers) {
      c.drawImage(layer, 0, 0, width, height);
    }
    layerCache = cache;
    frozen = true;
    pointer.x = 0;
    pointer.y = 0;
    eased.x = 0;
    eased.y = 0;
  };

  const composite = (now: number) => {
    const t = (now - start) / 1000;
    const reveal = drawnWeight / totalWeight;

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    if (frozen && layerCache) {
      ctx.drawImage(layerCache, 0, 0, width, height);
      ctx.save();
      const portrait = width / height < 1;
      const h = height * (portrait ? 0.34 : 0.44);
      const fx = width / 2 + (portrait ? width * 0.14 : -height * 0.08);
      drawFigure(ctx, fx, height * 0.93, h, reduced ? 0 : t, ink, paper);
      ctx.restore();
      return;
    }

    const dolly = reduced ? 1 : 1 + 0.03 * (1 - Math.exp(-t / 50));
    eased.x += (pointer.x - eased.x) * 0.04;
    eased.y += (pointer.y - eased.y) * 0.04;

    ctx.fillStyle = paper;
    ctx.fillRect(0, 0, width, height);
    ctx.save();
    ctx.translate(width / 2, height * 0.4);
    ctx.scale(dolly, dolly);
    ctx.translate(-width / 2, -height * 0.4);
    const shift = [3, 7, 13];
    layers.forEach((layer, i) => {
      const k = shift[i] * (i === 0 ? 1 : -1);
      ctx.drawImage(layer, eased.x * k, eased.y * k * 0.6, width, height);
    });
    ctx.restore();

    const figureIn = smoothstep(0.8, 1, reveal);
    if (figureIn > 0) {
      ctx.save();
      ctx.globalAlpha = figureIn;
      const portrait = width / height < 1;
      const h = height * (portrait ? 0.34 : 0.44);
      const fx = width / 2 + (portrait ? width * 0.14 : -height * 0.08) - eased.x * 9;
      drawFigure(ctx, fx, height * 0.93 - eased.y * 5 + (1 - figureIn) * 12, h, reduced ? 0 : t, ink, paper);
      ctx.restore();
    }
  };

  const tick = (now: number) => {
    if (destroyed) return;
    if (drawn < ops.length) {
      const p = clamp01((now - revealStart) / revealDuration);
      const e = p < 0.5 ? 2 * p * p : 1 - Math.pow(-2 * p + 2, 2) / 2;
      inkUpTo(e * totalWeight);
    } else if (!frozen) {
      bakeLayers();
    }
    composite(now);
    // Reduced motion: stop after settle. Otherwise keep a cheap breath loop.
    if (visible && !reduced && (drawn < ops.length || frozen)) {
      frame = requestAnimationFrame(tick);
    }
  };

  const onPointer = (e: PointerEvent) => {
    if (frozen || reduced) return;
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
      if (!reduced) bakeLayers();
      composite(performance.now());
      if (visible && !reduced) frame = requestAnimationFrame(tick);
    }, 200);
  };

  const observer = new IntersectionObserver(([entry]) => {
    const was = visible;
    visible = entry.isIntersecting;
    if (visible && !was && !reduced) frame = requestAnimationFrame(tick);
  });

  build(reduced);
  if (reduced) {
    bakeLayers();
    composite(performance.now());
  }
  observer.observe(canvas);
  if (!reduced) {
    window.addEventListener('pointermove', onPointer, { passive: true });
    canvas.addEventListener('pointerleave', onLeave);
  }
  window.addEventListener('resize', onResize);
  if (!reduced) frame = requestAnimationFrame(tick);

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
