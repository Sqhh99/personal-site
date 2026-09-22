/**
 * The astronaut — the one thing on the landing page that is drawn rather than
 * generated, so it gets real anatomy: a suit with a pack behind it, a chest
 * module, ribbed joints at every bend, patches, hoses, and a dark visor with
 * the sky reflected in it.
 *
 * Everything is laid out in *suit units*: x to the right, y **up**, origin
 * between the boots, 1.0 from sole to the crown of the helmet. `place` is the
 * only thing that knows about pixels, so the figure survives any size.
 */

import { Pen, capsulePoly, catmull, circlePoly, ellipsePoly, roundRectPoly, type Pt } from './pen';

type U = [number, number];

export interface AstronautOpts {
  /** Lamp on the helmet, flag in the raised hand — off for a small drawing. */
  detail?: number;
}

export function drawAstronaut(pen: Pen, cx: number, footY: number, h: number, opts: AstronautOpts = {}) {
  const detail = opts.detail ?? 1;
  const P = (x: number, y: number): Pt => [cx + x * h, footY - y * h];
  const L = (u: number) => u * h;
  const map = (pts: U[]): Pt[] => pts.map(([x, y]) => P(x, y));
  const limb = (a: U, b: U, r0: number, r1 = r0) => capsulePoly(P(a[0], a[1]), P(b[0], b[1]), L(r0), L(r1));
  const nib = h * 0.0042;

  /** The shaded crescent along one side of a limb — light comes from upper left. */
  const limbShade = (a: U, b: U, r0: number, r1: number, inner = 0.15): Pt[] => {
    const pa = P(a[0], a[1]);
    const pb = P(b[0], b[1]);
    const ang = Math.atan2(pb[1] - pa[1], pb[0] - pa[0]);
    const nx = Math.cos(ang - Math.PI / 2);
    const ny = Math.sin(ang - Math.PI / 2);
    const R0 = L(r0);
    const R1 = L(r1);
    const out: Pt[] = [];
    for (let i = 0; i <= 8; i += 1) {
      const t = i / 8;
      out.push([pa[0] + (pb[0] - pa[0]) * t + nx * (R0 + (R1 - R0) * t) * 0.97, pa[1] + (pb[1] - pa[1]) * t + ny * (R0 + (R1 - R0) * t) * 0.97]);
    }
    for (let i = 8; i >= 0; i -= 1) {
      const t = i / 8;
      out.push([pa[0] + (pb[0] - pa[0]) * t + nx * (R0 + (R1 - R0) * t) * inner, pa[1] + (pb[1] - pa[1]) * t + ny * (R0 + (R1 - R0) * t) * inner]);
    }
    return out;
  };

  /** Ribbed joint: a few arcs wrapping across the limb where it bends. */
  const ribs = (at: U, along: U, r: number, count: number, spread: number) => {
    const p = P(at[0], at[1]);
    const ang = Math.atan2(-along[1], along[0]);
    const nx = Math.cos(ang + Math.PI / 2);
    const ny = Math.sin(ang + Math.PI / 2);
    const R = L(r);
    for (let i = 0; i < count; i += 1) {
      const d = (i - (count - 1) / 2) * L(spread);
      const base: Pt = [p[0] + Math.cos(ang) * d, p[1] + Math.sin(ang) * d];
      const bulge = L(0.009);
      pen.curve(
        [
          [base[0] + nx * R * 0.94, base[1] + ny * R * 0.94],
          [base[0] + Math.cos(ang) * bulge, base[1] + Math.sin(ang) * bulge],
          [base[0] - nx * R * 0.94, base[1] - ny * R * 0.94],
        ],
        { w: nib * 0.75, a: 0.72, passes: 1, wobble: 0.01, overshoot: 0 },
      );
    }
  };

  // -- ground: the figure has weight, so it casts something -------------------
  {
    const shadow = ellipsePoly(cx + L(0.03), footY + L(0.012), L(0.235), L(0.042));
    pen.dots(shadow, Math.round(70 * detail), nib * 0.5, 0.5);
    pen.hatch(shadow, { angle: -0.35, gap: nib * 2.6, w: nib * 0.55, a: 0.3, skip: 0.35 });
  }

  // -- life-support pack, behind everything -----------------------------------
  {
    const pack = roundRectPoly(cx - L(0.206), footY - L(0.838), L(0.412), L(0.234), L(0.052));
    pen.shape(pack, { fill: 'paper', w: nib, wobble: 0.004 });
    pen.hatch(pack, { angle: -0.75, gap: nib * 2.4, w: nib * 0.55, a: 0.38, skip: 0.2 });
    // A lid seam and the two tank edges that read through the fabric cover.
    pen.line(P(-0.206, 0.788), P(0.206, 0.788), { w: nib * 0.75, a: 0.6, passes: 1, overshoot: 0 });
    for (const s of [-1, 1]) {
      pen.line(P(s * 0.152, 0.83), P(s * 0.152, 0.615), { w: nib * 0.65, a: 0.5, passes: 1, overshoot: 0 });
    }
  }

  // -- legs: left one takes the weight, right one is easy ---------------------
  const hipL: U = [-0.085, 0.545];
  const kneeL: U = [-0.108, 0.305];
  const ankL: U = [-0.118, 0.1];
  const hipR: U = [0.085, 0.545];
  const kneeR: U = [0.108, 0.3];
  const ankR: U = [0.128, 0.1];

  for (const [hip, knee, ank, shade] of [
    [hipR, kneeR, ankR, 0.62] as const,
    [hipL, kneeL, ankL, 0.3] as const,
  ]) {
    const thigh = limb(hip, knee, 0.079, 0.061);
    const shin = limb(knee, ank, 0.059, 0.05);
    pen.shape(thigh, { fill: 'paper', w: nib, wobble: 0.005 });
    pen.hatch(limbShade(hip, knee, 0.079, 0.061, 1 - shade), { angle: -0.6, gap: nib * 2, w: nib * 0.6, a: 0.55, skip: 0.1 });
    pen.shape(shin, { fill: 'paper', w: nib, wobble: 0.005 });
    pen.hatch(limbShade(knee, ank, 0.059, 0.05, 1 - shade), { angle: -0.6, gap: nib * 2, w: nib * 0.6, a: 0.55, skip: 0.1 });
    ribs(knee, [knee[0] - hip[0], knee[1] - hip[1]], 0.058, 3, 0.026);
    ribs([ank[0], ank[1] + 0.03], [0, -1], 0.05, 2, 0.022);
  }

  // -- boots ------------------------------------------------------------------
  for (const [ank, flip, shade] of [
    [ankR, 1, 0.6] as const,
    [ankL, -1, 0.32] as const,
  ]) {
    const bx = cx + L(ank[0]) - L(0.072) + flip * L(0.012);
    const boot = roundRectPoly(bx, footY - L(0.105), L(0.145), L(0.105), L(0.026));
    pen.shape(boot, { fill: 'paper', w: nib * 1.1, wobble: 0.004 });
    pen.hatch(boot, { angle: -0.6, gap: nib * 2.1, w: nib * 0.6, a: 0.5, skip: 1 - shade });
    // Cuff, toe cap, and a sole with tread.
    pen.line([bx + L(0.006), footY - L(0.088)], [bx + L(0.139), footY - L(0.088)], { w: nib * 0.8, a: 0.8, passes: 1 });
    pen.curve(
      [
        [bx + L(0.012), footY - L(0.035)],
        [bx + L(0.072), footY - L(0.05)],
        [bx + L(0.133), footY - L(0.035)],
      ],
      { w: nib * 0.8, a: 0.75, passes: 1, overshoot: 0 },
    );
    const sole = roundRectPoly(bx - L(0.006), footY - L(0.026), L(0.157), L(0.028), L(0.008));
    pen.shape(sole, { fill: 'paper', w: nib, wobble: 0.004 });
    for (let i = 1; i < 6; i += 1) {
      const tx = bx - L(0.006) + (i / 6) * L(0.157);
      pen.line([tx, footY - L(0.024)], [tx, footY - L(0.004)], { w: nib * 0.6, a: 0.6, passes: 1, overshoot: 0 });
    }
  }

  // -- hips and torso ---------------------------------------------------------
  const torso = catmull(
    map([
      [-0.128, 0.54],
      [-0.158, 0.655],
      [-0.176, 0.752],
      [-0.128, 0.802],
      [0, 0.818],
      [0.128, 0.802],
      [0.176, 0.752],
      [0.158, 0.655],
      [0.128, 0.54],
      [0, 0.508],
    ]),
    10,
    true,
  );
  pen.shape(torso, { fill: 'paper', w: nib * 1.15, wobble: 0.003 });
  // The turn of the body into shadow on the right, and under the chest.
  pen.hatch(
    catmull(map([[0.075, 0.52], [0.13, 0.63], [0.168, 0.74], [0.12, 0.8], [0.085, 0.79], [0.108, 0.66], [0.07, 0.55]]), 8, true),
    { angle: -0.65, gap: nib * 2, w: nib * 0.62, a: 0.6, skip: 0.08 },
  );
  pen.hatch(catmull(map([[-0.12, 0.555], [0, 0.528], [0.12, 0.555], [0.1, 0.585], [0, 0.565], [-0.1, 0.585]]), 8, true), {
    angle: -0.4,
    gap: nib * 1.9,
    w: nib * 0.6,
    a: 0.5,
    skip: 0.1,
  });
  // Fabric: a few soft folds pulled from the waist to the shoulder.
  for (const [ax, ay, bx, by] of [
    [-0.055, 0.545, -0.08, 0.72],
    [0.03, 0.54, 0.052, 0.7],
    [-0.005, 0.55, 0.005, 0.62],
  ] as const) {
    pen.curve(map([[ax, ay], [(ax + bx) / 2 - 0.012, (ay + by) / 2], [bx, by]]), { w: nib * 0.7, a: 0.45, passes: 1, overshoot: 0 });
  }
  // Waist ring where the hard upper torso meets the soft lower half.
  pen.curve(map([[-0.13, 0.575], [0, 0.558], [0.13, 0.575]]), { w: nib * 0.9, a: 0.8, passes: 1, overshoot: 0 });
  pen.curve(map([[-0.128, 0.6], [0, 0.583], [0.128, 0.6]]), { w: nib * 0.7, a: 0.6, passes: 1, overshoot: 0 });

  // -- shoulders --------------------------------------------------------------
  for (const s of [1, -1] as const) {
    const pad = ellipsePoly(cx + s * L(0.163), footY - L(0.774), L(0.052), L(0.036), s * 0.3);
    pen.shape(pad, { fill: 'paper', w: nib, wobble: 0.005 });
    if (s > 0) pen.hatch(pad, { angle: -0.6, gap: nib * 2, w: nib * 0.6, a: 0.5, skip: 0.15 });
    ribs([s * 0.163, 0.774], [s, 0.35], 0.034, 2, 0.024);
  }

  // -- arms: left hangs, right is up --------------------------------------------
  const shL: U = [-0.168, 0.755];
  const elbL: U = [-0.246, 0.6];
  const wrL: U = [-0.228, 0.468];
  pen.shape(limb(shL, elbL, 0.054, 0.047), { fill: 'paper', w: nib, wobble: 0.005 });
  pen.hatch(limbShade(shL, elbL, 0.054, 0.047, 0.55), { angle: -0.6, gap: nib * 2.1, w: nib * 0.6, a: 0.4, skip: 0.15 });
  pen.shape(limb(elbL, wrL, 0.047, 0.041), { fill: 'paper', w: nib, wobble: 0.005 });
  pen.hatch(limbShade(elbL, wrL, 0.047, 0.041, 0.55), { angle: -0.6, gap: nib * 2.1, w: nib * 0.6, a: 0.4, skip: 0.15 });
  ribs(elbL, [elbL[0] - shL[0], elbL[1] - shL[1]], 0.046, 3, 0.022);
  ribs([wrL[0], wrL[1] + 0.012], [0, -1], 0.042, 2, 0.018);

  const shR: U = [0.168, 0.755];
  const elbR: U = [0.268, 0.694];
  const wrR: U = [0.312, 0.826];
  pen.shape(limb(shR, elbR, 0.054, 0.047), { fill: 'paper', w: nib, wobble: 0.005 });
  pen.hatch(limbShade(shR, elbR, 0.054, 0.047, 0.4), { angle: -0.6, gap: nib * 2, w: nib * 0.62, a: 0.55, skip: 0.1 });
  pen.shape(limb(elbR, wrR, 0.047, 0.041), { fill: 'paper', w: nib, wobble: 0.005 });
  pen.hatch(limbShade(elbR, wrR, 0.047, 0.041, 0.4), { angle: -0.6, gap: nib * 2, w: nib * 0.62, a: 0.55, skip: 0.1 });
  ribs(elbR, [elbR[0] - shR[0], elbR[1] - shR[1]], 0.046, 3, 0.022);

  // Gloves: a mitt with a thumb and knuckle ribs, not a blob.
  const glove = (at: U, rot: number, thumb: number, shade: number) => {
    const g = ellipsePoly(cx + L(at[0]), footY - L(at[1]), L(0.05), L(0.058), rot);
    pen.shape(g, { fill: 'paper', w: nib * 1.05, wobble: 0.005 });
    pen.shape(
      ellipsePoly(cx + L(at[0]) + Math.cos(thumb) * L(0.044), footY - L(at[1]) - Math.sin(thumb) * L(0.044), L(0.024), L(0.017), thumb),
      { fill: 'paper', w: nib * 0.85, wobble: 0.008 },
    );
    pen.hatch(g, { angle: -0.6, gap: nib * 2, w: nib * 0.55, a: shade, skip: 0.3 });
    for (let i = 0; i < 3; i += 1) {
      const y = at[1] + 0.022 - i * 0.017;
      pen.curve(map([[at[0] - 0.036, y], [at[0], y + 0.006], [at[0] + 0.036, y]]), { w: nib * 0.6, a: 0.55, passes: 1, overshoot: 0 });
    }
  };
  glove([wrL[0] - 0.006, wrL[1] - 0.04], -0.15, -1.1, 0.4);
  glove([wrR[0] + 0.022, wrR[1] + 0.046], 0.5, 1.9, 0.55);

  // -- chest module, patches, hoses ---------------------------------------------
  {
    const dcm = roundRectPoly(cx - L(0.098), footY - L(0.742), L(0.196), L(0.118), L(0.016));
    pen.shape(dcm, { fill: 'paper', w: nib * 1.05, wobble: 0.004 });
    pen.hatch(roundRectPoly(cx + L(0.04), footY - L(0.742), L(0.058), L(0.118), L(0.014)), {
      angle: -0.6,
      gap: nib * 1.9,
      w: nib * 0.55,
      a: 0.4,
      skip: 0.2,
    });
    // A readout of little cells, two dials, and a switch guard.
    for (let r = 0; r < 2; r += 1) {
      for (let c = 0; c < 3; c += 1) {
        pen.shape(roundRectPoly(cx - L(0.086) + c * L(0.03), footY - L(0.732) + r * L(0.028), L(0.023), L(0.021), L(0.004)), {
          w: nib * 0.6,
          passes: 1,
          fill: r === 0 && c === 1 ? 'ink' : null,
          fillAlpha: 0.75,
        });
      }
    }
    for (const [dx, dr] of [
      [0.038, 0.019],
      [0.075, 0.013],
    ] as const) {
      pen.shape(circlePoly(cx + L(dx), footY - L(0.708), L(dr), 20), { w: nib * 0.7, passes: 1 });
      pen.line([cx + L(dx), footY - L(0.708)], [cx + L(dx) - L(dr) * 0.8, footY - L(0.708) - L(dr) * 0.6], { w: nib * 0.6, passes: 1, overshoot: 0 });
    }
    pen.shape(roundRectPoly(cx - L(0.086), footY - L(0.66), L(0.08), L(0.022), L(0.006)), { w: nib * 0.65, passes: 1 });
    for (let i = 1; i < 4; i += 1) {
      pen.line([cx - L(0.086) + (i / 4) * L(0.08), footY - L(0.658)], [cx - L(0.086) + (i / 4) * L(0.08), footY - L(0.64)], { w: nib * 0.5, a: 0.6, passes: 1, overshoot: 0 });
    }
    // One corrugated hose out of the left port, tucked down to the waist.
    {
      const spine = catmull(map([[-0.1, 0.706], [-0.134, 0.672], [-0.139, 0.622], [-0.112, 0.592]]), 14);
      const r = L(0.014);
      const side = (sign: number) =>
        spine.map(([x, y], i): Pt => {
          const p = spine[Math.max(0, i - 1)];
          const q = spine[Math.min(spine.length - 1, i + 1)];
          const dx = q[0] - p[0];
          const dy = q[1] - p[1];
          const m = Math.hypot(dx, dy) || 1;
          return [x + (-dy / m) * r * sign, y + (dx / m) * r * sign];
        });
      const a = side(1);
      const b = side(-1);
      pen.shape([...a, ...b.slice().reverse()], { fill: 'paper', outline: false });
      pen.stroke(a, { w: nib * 0.9, a: 0.9, passes: 1, wobble: 0.004, overshoot: 0 });
      pen.stroke(b, { w: nib * 0.9, a: 0.9, passes: 1, wobble: 0.004, overshoot: 0 });
      for (let i = 2; i < spine.length - 2; i += 4) {
        pen.line(a[i], b[i], { w: nib * 0.55, a: 0.55, passes: 1, overshoot: 0 });
      }
    }
    // Shoulder flag patch and a mission roundel.
    const patch = roundRectPoly(cx - L(0.172), footY - L(0.742), L(0.056), L(0.04), L(0.005));
    pen.shape(patch, { fill: 'paper', w: nib * 0.7, passes: 1 });
    for (let i = 1; i < 4; i += 1) {
      pen.line([cx - L(0.17), footY - L(0.742) + (i / 4) * L(0.04)], [cx - L(0.118), footY - L(0.742) + (i / 4) * L(0.04)], {
        w: nib * 0.55,
        a: i === 2 ? 0.75 : 0.45,
        passes: 1,
        overshoot: 0,
      });
    }
    const roundel = circlePoly(cx + L(0.124), footY - L(0.694), L(0.026), 22);
    pen.shape(roundel, { fill: 'paper', w: nib * 0.75, passes: 1 });
    pen.hatch(roundel, { angle: 0.6, gap: nib * 1.8, w: nib * 0.5, a: 0.35, skip: 0.2 });
    star(pen, cx + L(0.124), footY - L(0.694), L(0.012), nib * 0.6);
    // Thigh pouch on the left leg.
    const pouch = roundRectPoly(cx - L(0.158), footY - L(0.462), L(0.062), L(0.078), L(0.012));
    pen.shape(pouch, { fill: 'paper', w: nib * 0.9, wobble: 0.006 });
    pen.line([cx - L(0.158), footY - L(0.434)], [cx - L(0.096), footY - L(0.434)], { w: nib * 0.65, a: 0.7, passes: 1, overshoot: 0 });
    pen.hatch(pouch, { angle: -0.6, gap: nib * 2.4, w: nib * 0.5, a: 0.3, skip: 0.35 });
  }

  // -- neck ring ----------------------------------------------------------------
  {
    const ring = ellipsePoly(cx, footY - L(0.833), L(0.086), L(0.032));
    pen.shape(ring, { fill: 'paper', w: nib * 1.05, wobble: 0.004 });
    pen.shape(ellipsePoly(cx, footY - L(0.842), L(0.072), L(0.025)), { w: nib * 0.75, passes: 1 });
    pen.hatch(ring, { angle: -0.3, gap: nib * 1.8, w: nib * 0.55, a: 0.45, skip: 0.3 });
    for (const s of [-1, 1] as const) {
      pen.shape(roundRectPoly(cx + s * L(0.082) - L(0.012), footY - L(0.845), L(0.024), L(0.022), L(0.005)), { fill: 'paper', w: nib * 0.7, passes: 1 });
    }
  }

  // -- helmet ---------------------------------------------------------------------
  {
    const helmetY = footY - L(0.915);
    const shell = circlePoly(cx, helmetY, L(0.108), 52);
    pen.shape(shell, { fill: 'paper', w: nib * 1.25, wobble: 0.0025 });
    // Side lamps and the antenna, before the visor so the visor sits on top.
    if (detail > 0.6) {
      for (const s of [-1, 1] as const) {
        pen.shape(roundRectPoly(cx + s * L(0.104) - L(0.016), helmetY - L(0.052), L(0.032), L(0.03), L(0.008)), { fill: 'paper', w: nib * 0.8, passes: 1 });
        pen.line([cx + s * L(0.088), helmetY - L(0.03)], [cx + s * L(0.104), helmetY - L(0.028)], { w: nib * 0.7, passes: 1, overshoot: 0 });
      }
      pen.line([cx - L(0.07), helmetY - L(0.082)], [cx - L(0.104), helmetY - L(0.172)], { w: nib * 0.8, a: 0.9, passes: 2, overshoot: 0 });
      pen.dot(cx - L(0.104), helmetY - L(0.176), nib * 1.6);
    }
    // The visor: the one solid black in the figure, with the sky in it.
    const visor = catmull(
      [
        [cx, helmetY - L(0.072)],
        [cx + L(0.076), helmetY - L(0.03)],
        [cx + L(0.072), helmetY + L(0.042)],
        [cx, helmetY + L(0.062)],
        [cx - L(0.072), helmetY + L(0.042)],
        [cx - L(0.076), helmetY - L(0.03)],
      ] as Pt[],
      12,
      true,
    );
    pen.shape(visor, { fill: 'ink', fillAlpha: 0.93, w: nib * 1.1, wobble: 0.004 });
    // Reflection: a sweep of light, a horizon, and two stars — in paper.
    pen.stroke(
      catmull([[cx - L(0.058), helmetY + L(0.012)], [cx - L(0.026), helmetY - L(0.052)], [cx + L(0.016), helmetY - L(0.064)]] as Pt[], 10),
      { w: nib * 2.2, a: 0.95, passes: 1, ink: false, overshoot: 0 },
    );
    pen.stroke(
      catmull([[cx - L(0.048), helmetY + L(0.03)], [cx - L(0.012), helmetY - L(0.04)], [cx + L(0.03), helmetY - L(0.056)]] as Pt[], 10),
      { w: nib * 0.9, a: 0.8, passes: 1, ink: false, overshoot: 0 },
    );
    pen.stroke(
      catmull([[cx - L(0.062), helmetY + L(0.03)], [cx, helmetY + L(0.04)], [cx + L(0.062), helmetY + L(0.022)]] as Pt[], 10),
      { w: nib * 0.8, a: 0.7, passes: 1, ink: false, overshoot: 0 },
    );
    star(pen, cx + L(0.04), helmetY + L(0.006), L(0.016), nib * 0.8, false);
    star(pen, cx + L(0.056), helmetY - L(0.024), L(0.009), nib * 0.7, false);
    // Visor rim: a double line, heavier where the shell turns away.
    pen.stroke(visor, { w: nib * 1.1, a: 1, passes: 1, closed: true, wobble: 0.004 });
    pen.stroke(
      catmull([[cx - L(0.082), helmetY - L(0.024)], [cx - L(0.05), helmetY + L(0.058)], [cx + L(0.02), helmetY + L(0.076)]] as Pt[], 10),
      { w: nib * 0.9, a: 0.7, passes: 1, overshoot: 0 },
    );
    // The shell turning into shadow on the right, and under the jaw.
    pen.hatch(
      catmull(
        [
          [cx + L(0.072), helmetY - L(0.07)],
          [cx + L(0.108), helmetY],
          [cx + L(0.07), helmetY + L(0.082)],
          [cx + L(0.05), helmetY + L(0.07)],
          [cx + L(0.086), helmetY],
          [cx + L(0.056), helmetY - L(0.06)],
        ] as Pt[],
        8,
        true,
      ),
      { angle: -0.5, gap: nib * 1.9, w: nib * 0.6, a: 0.55, skip: 0.1 },
    );
    pen.hatch(ellipsePoly(cx, helmetY + L(0.09), L(0.07), L(0.026)), { angle: -0.4, gap: nib * 1.8, w: nib * 0.55, a: 0.45, skip: 0.25 });
    // A seam over the crown so the helmet is a made object.
    pen.curve([[cx - L(0.085), helmetY - L(0.056)], [cx, helmetY - L(0.088)], [cx + L(0.085), helmetY - L(0.056)]] as Pt[], {
      w: nib * 0.75,
      a: 0.6,
      passes: 1,
      overshoot: 0,
    });
  }
}

/** A four-point sparkle — the only decorative mark the sketch allows itself. */
export function star(pen: Pen, x: number, y: number, r: number, w: number, ink = true) {
  const arm = (dx: number, dy: number) =>
    pen.curve([[x - dx, y - dy], [x + dx * 0.06, y + dy * 0.06], [x + dx, y + dy]] as Pt[], { w, a: ink ? 0.9 : 0.85, passes: 1, ink, overshoot: 0, wobble: 0.01 });
  arm(0, r);
  arm(r * 0.72, 0);
}

/** The flag the raised hand is holding, planted into the ground beside it. */
export function drawFlag(pen: Pen, cx: number, footY: number, h: number, cloth = true) {
  const P = (x: number, y: number): Pt => [cx + x * h, footY - y * h];
  const L = (u: number) => u * h;
  const nib = h * 0.0042;
  pen.line(P(0.4, -0.005), P(0.3, 1.16), { w: nib * 1.5, a: 1, passes: 2, wobble: 0.003, overshoot: 0 });
  if (cloth) drawPennant(pen, cx, footY, h, 0);
  // A little heap of regolith where the pole went in.
  pen.dots(ellipsePoly(cx + L(0.4), footY + L(0.004), L(0.05), L(0.018)), 26, nib * 0.5, 0.55);
}

/**
 * The pennant on its own, so it can be redrawn every frame. `t` is seconds;
 * a wave runs out from the pole and grows toward the free corner.
 */
export function drawPennant(pen: Pen, cx: number, footY: number, h: number, t: number) {
  const nib = h * 0.0042;
  const P = (x: number, y: number): Pt => {
    const d = Math.max(0, (0.302 - x) / 0.16);
    const wave = Math.sin(t * 2.6 - d * 2.4);
    return [cx + (x + Math.cos(t * 2.6 - d * 2.4) * 0.004 * d) * h, footY - (y + wave * 0.014 * d) * h];
  };
  const cloth = catmull(
    [P(0.302, 1.14), P(0.21, 1.125), P(0.14, 1.07), P(0.148, 1.02), P(0.235, 1.035), P(0.303, 1.015)],
    12,
    true,
  );
  pen.shape(cloth, { fill: 'paper', w: nib * 1.1, wobble: 0.006 });
  pen.hatch(cloth, { angle: 0.55, gap: nib * 2.4, w: nib * 0.6, a: 0.45, skip: 0.2 });
  pen.curve([P(0.29, 1.104), P(0.22, 1.086), P(0.16, 1.052)], { w: nib * 0.7, a: 0.6, passes: 1, overshoot: 0 });
}
