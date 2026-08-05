import { useMemo, useState } from 'react';
import { useFigureCanvas } from '@figures/useFigureCanvas';
import { fade, useThemeColors } from '@figures/useThemeColors';
import { Canvas, FigureBody, Panel, Readout, SegmentedControl, Slider } from '@figures/controls';
import { box, bx, byUp, label, polyline } from '@figures/plot';

/**
 * Actual matrix products, not a metaphor for them. Each block gets a fresh
 * random Jacobian J ~ N(0, g²/n) and a vector is pushed forward through the
 * stack and pulled backward through its transpose, measuring the norm at every
 * boundary. Plain layers multiply; residual layers multiply by (I + βJ).
 *
 * Averaging the *squared* norm over independent draws — rather than the log —
 * is what lets the measurement sit on top of the closed-form prediction instead
 * of a Jensen-gap below it.
 */

const DIM = 20;
const CHAINS = 12;

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function gaussian(rnd: () => number): number {
  const u = Math.max(rnd(), 1e-9);
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * rnd());
}

function normSquared(v: Float64Array): number {
  let s = 0;
  for (let i = 0; i < v.length; i += 1) s += v[i] * v[i];
  return s;
}

interface Trace {
  /** Mean squared norm at each block boundary, relative to a unit start. */
  forward: Float64Array;
  backward: Float64Array;
}

function propagate(blocks: number, gain: number, beta: number, residual: boolean, seed: number): Trace {
  const forward = new Float64Array(blocks + 1);
  const backward = new Float64Array(blocks + 1);
  const x = new Float64Array(DIM);
  const y = new Float64Array(DIM);
  const scale = gain / Math.sqrt(DIM);

  for (let c = 0; c < CHAINS; c += 1) {
    const seedC = seed + c * 7919;
    const mats: Float64Array[] = [];
    const rndM = mulberry32(seedC);
    const rndV = mulberry32(seedC ^ 0x9e3779b9);

    for (let i = 0; i < DIM; i += 1) x[i] = gaussian(rndV);
    let n2 = normSquared(x);
    for (let i = 0; i < DIM; i += 1) x[i] /= Math.sqrt(n2);
    forward[0] += 1;

    for (let l = 0; l < blocks; l += 1) {
      const m = new Float64Array(DIM * DIM);
      for (let i = 0; i < DIM * DIM; i += 1) m[i] = gaussian(rndM) * scale;
      mats.push(m);
      for (let i = 0; i < DIM; i += 1) {
        let s = 0;
        const row = i * DIM;
        for (let j = 0; j < DIM; j += 1) s += m[row + j] * x[j];
        y[i] = residual ? x[i] + beta * s : s;
      }
      x.set(y);
      forward[l + 1] += normSquared(x);
    }

    // Backward through the transposes of exactly the same matrices.
    const v = x;
    for (let i = 0; i < DIM; i += 1) v[i] = gaussian(rndV);
    n2 = normSquared(v);
    for (let i = 0; i < DIM; i += 1) v[i] /= Math.sqrt(n2);
    backward[blocks] += 1;

    for (let l = blocks - 1; l >= 0; l -= 1) {
      const m = mats[l];
      for (let j = 0; j < DIM; j += 1) {
        let s = 0;
        for (let i = 0; i < DIM; i += 1) s += m[i * DIM + j] * v[i];
        y[j] = residual ? v[j] + beta * s : s;
      }
      v.set(y);
      backward[l] += normSquared(v);
    }
  }

  for (let i = 0; i <= blocks; i += 1) {
    forward[i] /= CHAINS;
    backward[i] /= CHAINS;
  }
  return { forward, backward };
}

type BetaMode = 'one' | 'depth' | 'zero';
const BETA_LABEL: Record<BetaMode, string> = {
  one: 'β = 1',
  depth: 'β = 1/√L',
  zero: 'β = 0',
};

const SEEDS = { a: 11, b: 404, c: 1729 } as const;
type SeedKey = keyof typeof SEEDS;

export default function SignalPropagation() {
  const colors = useThemeColors();
  const [blocks, setBlocks] = useState(40);
  const [gain, setGain] = useState(1);
  const [betaMode, setBetaMode] = useState<BetaMode>('one');
  const [seedKey, setSeedKey] = useState<SeedKey>('a');

  const beta = betaMode === 'one' ? 1 : betaMode === 'zero' ? 0 : 1 / Math.sqrt(blocks);

  const traces = useMemo(() => {
    const seed = SEEDS[seedKey];
    return {
      plain: propagate(blocks, gain, 1, false, seed),
      residual: propagate(blocks, gain, beta, true, seed),
    };
  }, [blocks, gain, beta, seedKey]);

  // Closed form for the expected squared norm ratio, one factor per block.
  const plainPerBlock = gain * gain;
  const residualPerBlock = 1 + beta * beta * gain * gain;
  const plainTotal = plainPerBlock ** (blocks / 2);
  const residualTotal = residualPerBlock ** (blocks / 2);

  const { canvasRef, aspect } = useFigureCanvas(
    (ctx, { width, height }) => {
      const pad = 14;
      const gap = 34;
      const panelW = (width - pad * 2 - gap - 34) / 2;
      const left = box(pad + 34, pad + 16, panelW, height - pad * 2 - 28);
      const right = box(left.x + panelW + gap, pad + 16, panelW, height - pad * 2 - 28);

      // One shared vertical scale so the two panels are directly comparable.
      let lo = 0;
      let hi = 0;
      for (const trace of [traces.plain, traces.residual]) {
        for (const series of [trace.forward, trace.backward]) {
          for (let i = 0; i < series.length; i += 1) {
            const v = 0.5 * Math.log10(Math.max(series[i], 1e-300));
            lo = Math.min(lo, v);
            hi = Math.max(hi, v);
          }
        }
      }
      lo = Math.floor(Math.min(lo, -0.5));
      hi = Math.ceil(Math.max(hi, 0.5));
      const span = Math.max(1, hi - lo);
      const py = (b: ReturnType<typeof box>, logValue: number) =>
        byUp(b, Math.min(hi, Math.max(lo, logValue)) - lo, span);

      const decadeStep = Math.max(1, Math.round(span / 6));
      const drawPanel = (
        b: ReturnType<typeof box>,
        title: string,
        pick: (t: Trace) => Float64Array,
        /** Blocks traversed by the time the signal reaches index l. */
        traversed: (l: number) => number,
      ) => {
        for (let e = Math.ceil(lo); e <= hi; e += decadeStep) {
          const gy = py(b, e);
          polyline(ctx, [[b.x, gy], [b.x + b.w, gy]], fade(colors.faint, e === 0 ? 0.4 : 0.15), 1);
          label(ctx, e === 0 ? '1' : `1e${e}`, b.x - 6, gy, colors.faint, {
            size: 9,
            align: 'right',
            baseline: 'middle',
          });
        }

        const series = (trace: Trace, color: string, lineWidth: number) => {
          const values = pick(trace);
          const points: Array<[number, number]> = [];
          for (let l = 0; l < values.length; l += 1) {
            points.push([bx(b, l / blocks), py(b, 0.5 * Math.log10(Math.max(values[l], 1e-300)))]);
          }
          polyline(ctx, points, color, lineWidth);
        };

        // Predictions first, so the measurements are drawn over them.
        ctx.setLineDash([3, 4]);
        for (const perBlock of [plainPerBlock, residualPerBlock]) {
          const predicted: Array<[number, number]> = [];
          for (let l = 0; l <= blocks; l += 1) {
            predicted.push([bx(b, l / blocks), py(b, (traversed(l) / 2) * Math.log10(perBlock))]);
          }
          polyline(ctx, predicted, fade(colors.ink, 0.38), 1.2);
        }
        ctx.setLineDash([]);

        series(traces.plain, colors.kraft, 2);
        series(traces.residual, colors.accent, 2.4);

        label(ctx, title, b.x, b.y - 5, colors.muted, { size: 10 });
        label(ctx, 'block index', b.x + b.w, b.y + b.h + 13, colors.faint, { size: 9, align: 'right' });
      };

      drawPanel(left, 'forward activation norm', (t) => t.forward, (l) => l);
      drawPanel(right, 'backward gradient norm', (t) => t.backward, (l) => blocks - l);

      label(ctx, 'plain', left.x + left.w, left.y - 5, colors.kraft, { size: 10, align: 'right' });
      label(ctx, 'residual', left.x + left.w - 34, left.y - 5, colors.accent, { size: 10, align: 'right' });
      label(ctx, 'dashed: closed form', right.x + right.w, right.y - 5, fade(colors.ink, 0.5), {
        size: 9,
        align: 'right',
      });
    },
    { aspect: 2.35, animate: false },
  );

  const fmt = (v: number) => {
    if (!Number.isFinite(v)) return '—';
    if (v === 0) return '0';
    const exp = Math.log10(v);
    return exp > 4 || exp < -4 ? v.toExponential(1) : v.toPrecision(3);
  };

  return (
    <FigureBody>
      <Canvas
        canvasRef={canvasRef}
        aspect={aspect}
        label="Measured forward activation norms and backward gradient norms through a stack of random Jacobians, for plain and residual layers, against their closed-form predictions."
      />
      <Panel columns={3}>
        <Slider label="blocks (L)" value={blocks} min={4} max={64} step={2} format={(v) => String(v)} onChange={setBlocks} />
        <Slider label="branch gain (g)" value={gain} min={0.2} max={1.6} step={0.05} format={(v) => v.toFixed(2)} onChange={setGain} />
        <SegmentedControl
          label="branch scale"
          value={betaMode}
          options={[
            { value: 'one', label: 'β=1' },
            { value: 'depth', label: 'β=1/√L' },
            { value: 'zero', label: 'β=0' },
          ]}
          onChange={setBetaMode}
        />
      </Panel>
      <div className="mt-4">
        <SegmentedControl
          label="random draw"
          value={seedKey}
          options={[
            { value: 'a', label: 'A' },
            { value: 'b', label: 'B' },
            { value: 'c', label: 'C' },
          ]}
          onChange={setSeedKey}
        />
      </div>
      <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Readout label="plain gain over L" value={fmt(plainTotal)} hint={`g^L = ${gain.toFixed(2)}^${blocks}`} />
        <Readout label="residual gain over L" value={fmt(residualTotal)} hint={`(1+β²g²)^{L/2}`} />
        <Readout label="per-block factor" value={`${Math.sqrt(plainPerBlock).toFixed(3)} → ${Math.sqrt(residualPerBlock).toFixed(3)}`} />
        <Readout label="branch scale" value={BETA_LABEL[betaMode]} hint={beta === 0 ? 'exact identity' : `β = ${beta.toFixed(3)}`} />
      </div>
    </FigureBody>
  );
}
