import { useMemo, useRef, useState } from 'react';
import { useFigureCanvas } from '@figures/useFigureCanvas';
import { fade, useThemeColors } from '@figures/useThemeColors';
import { Canvas, FigureBody, Panel, Readout, SegmentedControl, Slider } from '@figures/controls';
import { box, circle, frame, label, polyline } from '@figures/plot';

/**
 * The additive attention gate of Attention U-Net, trained rather than asserted.
 *
 *   q = ReLU(W_x·x + W_g·g + b)      α = σ(ψ·q + c)      out = α ⊙ x
 *
 * A random ψ would produce an arbitrary map, so the gate here is fitted on the
 * page: a few hundred gradient steps against the object nearest whichever
 * context position was sampled. That is a crude stand-in for end-to-end
 * training, but it is the same objective in spirit — the gate is not told where
 * the objects are, it is told which region the decoder wanted.
 */

const G = 24;
const FEATURES = 6;

interface Regions {
  a: Float64Array;
  b: Float64Array;
  distractor: Float64Array;
}

const CENTRES = { a: [0.27, 0.68], b: [0.73, 0.34] } as const;

function buildRegions(): Regions {
  const a = new Float64Array(G * G);
  const b = new Float64Array(G * G);
  const distractor = new Float64Array(G * G);
  for (let y = 0; y < G; y += 1) {
    for (let x = 0; x < G; x += 1) {
      const u = (x + 0.5) / G;
      const v = (y + 0.5) / G;
      const i = y * G + x;
      if ((u - CENTRES.a[0]) ** 2 + (v - CENTRES.a[1]) ** 2 < 0.026) a[i] = 1;
      if (Math.abs(u - CENTRES.b[0]) < 0.15 && Math.abs(v - CENTRES.b[1]) < 0.12) b[i] = 1;
      // A third structure the encoder responds to and the gate must learn to drop.
      if ((u - 0.74) ** 2 + (v - 0.8) ** 2 < 0.012) distractor[i] = 1;
    }
  }
  return { a, b, distractor };
}

const REGIONS = buildRegions();

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Encoder features: each channel mixes the three structures differently. */
function buildFeatures(seed: number): { x: Float64Array; norm: Float64Array } {
  const rnd = mulberry32(seed);
  const mix = Array.from({ length: FEATURES }, () => [rnd() * 1.4, rnd() * 1.4, rnd() * 1.4]);
  const x = new Float64Array(G * G * FEATURES);
  const norm = new Float64Array(G * G);
  for (let p = 0; p < G * G; p += 1) {
    const u = (p % G) / G;
    const v = Math.floor(p / G) / G;
    let sum = 0;
    for (let c = 0; c < FEATURES; c += 1) {
      const value =
        mix[c][0] * REGIONS.a[p] +
        mix[c][1] * REGIONS.b[p] +
        mix[c][2] * REGIONS.distractor[p] +
        0.12 * Math.sin(6.3 * u + c) * Math.cos(5.1 * v - c);
      x[p * FEATURES + c] = value;
      sum += value * value;
    }
    norm[p] = Math.sqrt(sum);
  }
  return { x, norm };
}

/** Decoder context: a coarse bump around the requested position. */
function contextAt(cx: number, cy: number, amplitudes: number[], out: Float64Array): void {
  for (let p = 0; p < G * G; p += 1) {
    const u = ((p % G) + 0.5) / G;
    const v = (Math.floor(p / G) + 0.5) / G;
    const bump = Math.exp(-(((u - cx) ** 2 + (v - cy) ** 2) / 0.06));
    for (let c = 0; c < FEATURES; c += 1) out[p * FEATURES + c] = amplitudes[c] * bump;
  }
}

interface Gate {
  wx: Float64Array;
  wg: Float64Array;
  bq: Float64Array;
  psi: Float64Array;
  bias: number;
  amplitudes: number[];
  inner: number;
  finalLoss: number;
}

function trainGate(seed: number, inner: number): Gate {
  const rnd = mulberry32(seed ^ 0x51ed270b);
  const scale = 1 / Math.sqrt(FEATURES);
  const wx = Float64Array.from({ length: inner * FEATURES }, () => (rnd() - 0.5) * 2 * scale);
  const wg = Float64Array.from({ length: inner * FEATURES }, () => (rnd() - 0.5) * 2 * scale);
  const bq = new Float64Array(inner);
  const psi = Float64Array.from({ length: inner }, () => (rnd() - 0.5) * 2 * scale);
  const amplitudes = Array.from({ length: FEATURES }, () => 0.5 + rnd());
  let bias = 0;

  const { x } = buildFeatures(seed);
  const g = new Float64Array(G * G * FEATURES);
  const q = new Float64Array(inner);
  const dq = new Float64Array(inner);
  const gwx = new Float64Array(wx.length);
  const gwg = new Float64Array(wg.length);
  const gbq = new Float64Array(inner);
  const gpsi = new Float64Array(inner);
  const vwx = new Float64Array(wx.length);
  const vwg = new Float64Array(wg.length);
  const vbq = new Float64Array(inner);
  const vpsi = new Float64Array(inner);
  let vbias = 0;

  const steps = 320;
  const lr = 0.5;
  const momentum = 0.9;
  let loss = 0;

  for (let step = 0; step < steps; step += 1) {
    // One decoder request per step, uniformly over the map.
    const cx = rnd();
    const cy = rnd();
    contextAt(cx, cy, amplitudes, g);
    const nearA = (cx - CENTRES.a[0]) ** 2 + (cy - CENTRES.a[1]) ** 2;
    const nearB = (cx - CENTRES.b[0]) ** 2 + (cy - CENTRES.b[1]) ** 2;
    const wanted = nearA < nearB ? REGIONS.a : REGIONS.b;

    gwx.fill(0);
    gwg.fill(0);
    gbq.fill(0);
    gpsi.fill(0);
    let gbias = 0;
    loss = 0;

    for (let p = 0; p < G * G; p += 1) {
      let s = bias;
      for (let k = 0; k < inner; k += 1) {
        let z = bq[k];
        for (let c = 0; c < FEATURES; c += 1) {
          z += wx[k * FEATURES + c] * x[p * FEATURES + c] + wg[k * FEATURES + c] * g[p * FEATURES + c];
        }
        q[k] = z > 0 ? z : 0;
        s += psi[k] * q[k];
      }
      const alpha = 1 / (1 + Math.exp(-s));
      const t = wanted[p];
      loss -= t * Math.log(alpha + 1e-9) + (1 - t) * Math.log(1 - alpha + 1e-9);

      const ds = (alpha - t) / (G * G);
      gbias += ds;
      for (let k = 0; k < inner; k += 1) {
        gpsi[k] += ds * q[k];
        dq[k] = q[k] > 0 ? ds * psi[k] : 0;
      }
      for (let k = 0; k < inner; k += 1) {
        if (dq[k] === 0) continue;
        gbq[k] += dq[k];
        for (let c = 0; c < FEATURES; c += 1) {
          gwx[k * FEATURES + c] += dq[k] * x[p * FEATURES + c];
          gwg[k * FEATURES + c] += dq[k] * g[p * FEATURES + c];
        }
      }
    }
    loss /= G * G;

    for (let i = 0; i < wx.length; i += 1) {
      vwx[i] = momentum * vwx[i] - lr * gwx[i];
      wx[i] += vwx[i];
      vwg[i] = momentum * vwg[i] - lr * gwg[i];
      wg[i] += vwg[i];
    }
    for (let k = 0; k < inner; k += 1) {
      vbq[k] = momentum * vbq[k] - lr * gbq[k];
      bq[k] += vbq[k];
      vpsi[k] = momentum * vpsi[k] - lr * gpsi[k];
      psi[k] += vpsi[k];
    }
    vbias = momentum * vbias - lr * gbias;
    bias += vbias;
  }

  return { wx, wg, bq, psi, bias, amplitudes, inner, finalLoss: loss };
}

const SEEDS = { a: 5, b: 61, c: 907 } as const;
type SeedKey = keyof typeof SEEDS;

export default function AttentionGate() {
  const colors = useThemeColors();
  const [seedKey, setSeedKey] = useState<SeedKey>('a');
  const [inner, setInner] = useState(8);
  const [sharpness, setSharpness] = useState(1);
  const [centre, setCentre] = useState({ x: 0.72, y: 0.36 });
  const dragging = useRef(false);

  const features = useMemo(() => buildFeatures(SEEDS[seedKey]), [seedKey]);
  const gate = useMemo(() => trainGate(SEEDS[seedKey], inner), [seedKey, inner]);

  const evaluated = useMemo(() => {
    const g = new Float64Array(G * G * FEATURES);
    contextAt(centre.x, centre.y, gate.amplitudes, g);
    const alpha = new Float64Array(G * G);
    const q = new Float64Array(gate.inner);
    let passed = 0;
    let mean = 0;
    let objectEnergy = 0;
    let objectKept = 0;
    let clutterEnergy = 0;
    let clutterKept = 0;

    const nearA =
      (centre.x - CENTRES.a[0]) ** 2 + (centre.y - CENTRES.a[1]) ** 2 <
      (centre.x - CENTRES.b[0]) ** 2 + (centre.y - CENTRES.b[1]) ** 2;
    const wanted = nearA ? REGIONS.a : REGIONS.b;

    for (let p = 0; p < G * G; p += 1) {
      let s = gate.bias;
      for (let k = 0; k < gate.inner; k += 1) {
        let z = gate.bq[k];
        for (let c = 0; c < FEATURES; c += 1) {
          z += gate.wx[k * FEATURES + c] * features.x[p * FEATURES + c] + gate.wg[k * FEATURES + c] * g[p * FEATURES + c];
        }
        q[k] = z > 0 ? z : 0;
        s += gate.psi[k] * q[k];
      }
      const a = 1 / (1 + Math.exp(-sharpness * s));
      alpha[p] = a;
      mean += a;
      if (a > 0.5) passed += 1;
      const energy = features.norm[p];
      if (wanted[p]) {
        objectEnergy += energy;
        objectKept += energy * a;
      } else {
        clutterEnergy += energy;
        clutterKept += energy * a;
      }
    }

    return {
      alpha,
      mean: mean / (G * G),
      passed: passed / (G * G),
      objectRetained: objectEnergy ? objectKept / objectEnergy : 0,
      clutterRetained: clutterEnergy ? clutterKept / clutterEnergy : 0,
      target: nearA ? 'left disc' : 'right block',
    };
  }, [centre, gate, features, sharpness]);

  const layoutRef = useRef<{ panels: Array<{ x: number; y: number; w: number; h: number }> }>({ panels: [] });

  const drag = (clientX: number, clientY: number, canvas: HTMLCanvasElement) => {
    const rect = canvas.getBoundingClientRect();
    const px = clientX - rect.left;
    const py = clientY - rect.top;
    for (const panel of layoutRef.current.panels) {
      if (px >= panel.x && px <= panel.x + panel.w && py >= panel.y && py <= panel.y + panel.h) {
        setCentre({
          x: Math.min(1, Math.max(0, (px - panel.x) / panel.w)),
          y: Math.min(1, Math.max(0, (py - panel.y) / panel.h)),
        });
        return;
      }
    }
  };

  const { canvasRef, aspect } = useFigureCanvas(
    (ctx, { width, height }) => {
      const pad = 14;
      const gap = 16;
      const side = Math.min((width - pad * 2 - gap * 2) / 3, height - pad * 2 - 18);
      const top = pad + 14;
      const panels = [0, 1, 2].map((i) => box(pad + i * (side + gap), top, side, side));
      layoutRef.current.panels = panels;

      const cell = side / G;
      const paint = (b: ReturnType<typeof box>, value: (p: number) => number, tint: (v: number) => string) => {
        for (let p = 0; p < G * G; p += 1) {
          const v = value(p);
          if (v <= 0.004) continue;
          ctx.fillStyle = tint(Math.min(1, v));
          ctx.fillRect(b.x + (p % G) * cell, b.y + Math.floor(p / G) * cell, cell + 0.6, cell + 0.6);
        }
        frame(ctx, b, colors.border, 6);
      };

      let maxNorm = 0;
      for (let p = 0; p < G * G; p += 1) maxNorm = Math.max(maxNorm, features.norm[p]);

      paint(panels[0], (p) => features.norm[p] / maxNorm, (v) => fade(colors.ink, 0.1 + 0.62 * v));
      paint(panels[1], (p) => evaluated.alpha[p], (v) => fade(colors.accent, 0.06 + 0.86 * v));
      paint(
        panels[2],
        (p) => (features.norm[p] / maxNorm) * evaluated.alpha[p],
        (v) => fade(colors['accent-deep'], 0.06 + 0.86 * v),
      );

      // The decoder's request, drawn on every panel it applies to.
      for (const panel of panels) {
        const gx = panel.x + centre.x * panel.w;
        const gy = panel.y + centre.y * panel.h;
        circle(ctx, gx, gy, 9, fade(colors.ink, 0.75), 1.4);
        polyline(ctx, [[gx - 5, gy], [gx + 5, gy]], fade(colors.ink, 0.75), 1.2);
        polyline(ctx, [[gx, gy - 5], [gx, gy + 5]], fade(colors.ink, 0.75), 1.2);
      }

      const titles = ['encoder feature ‖x‖', 'gate α', 'passed α ⊙ x'];
      titles.forEach((text, i) => label(ctx, text, panels[i].x, top - 5, i === 0 ? colors.muted : colors.accent, { size: 10 }));
      label(ctx, 'drag anywhere to move the decoder context g', pad, height - 6, colors.faint, { size: 9 });
      label(ctx, `gate loss after training ${gate.finalLoss.toFixed(3)}`, width - pad, height - 6, colors.faint, {
        size: 9,
        align: 'right',
      });
    },
    { aspect: 2.75, animate: false },
  );

  return (
    <FigureBody>
      <Canvas
        canvasRef={canvasRef}
        aspect={aspect}
        label="An encoder feature map, the attention coefficients a trained gate assigns to it given a draggable decoder context, and the gated result."
        className="cursor-crosshair"
        onPointerDown={(e) => {
          dragging.current = true;
          e.currentTarget.setPointerCapture(e.pointerId);
          drag(e.clientX, e.clientY, e.currentTarget);
        }}
        onPointerMove={(e) => {
          if (dragging.current) drag(e.clientX, e.clientY, e.currentTarget);
        }}
        onPointerUp={() => {
          dragging.current = false;
        }}
      />
      <Panel columns={3}>
        {/* Buttons, not a slider: changing this retrains the gate, which costs
            about a tenth of a second and would stutter under a drag. */}
        <SegmentedControl
          label="intermediate channels"
          value={String(inner)}
          options={[
            { value: '4', label: '4' },
            { value: '8', label: '8' },
            { value: '16', label: '16' },
          ]}
          onChange={(v) => setInner(Number(v))}
        />
        <Slider
          label="gate sharpness"
          value={sharpness}
          min={0.25}
          max={4}
          step={0.25}
          format={(v) => `${v.toFixed(2)}×`}
          onChange={setSharpness}
        />
        <SegmentedControl
          label="weight draw"
          value={seedKey}
          options={[
            { value: 'a', label: 'A' },
            { value: 'b', label: 'B' },
            { value: 'c', label: 'C' },
          ]}
          onChange={setSeedKey}
        />
      </Panel>
      <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Readout label="requested region" value={evaluated.target} hint="nearest object to the context" />
        <Readout label="mean α" value={evaluated.mean.toFixed(3)} hint={`${(evaluated.passed * 100).toFixed(0)}% of cells above 0.5`} />
        <Readout label="requested energy kept" value={`${(evaluated.objectRetained * 100).toFixed(0)}%`} />
        <Readout label="everything else kept" value={`${(evaluated.clutterRetained * 100).toFixed(0)}%`} />
      </div>
    </FigureBody>
  );
}
