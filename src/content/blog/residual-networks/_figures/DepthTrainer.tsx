import { useEffect, useRef, useState } from 'react';
import { useFigureCanvas } from '@figures/useFigureCanvas';
import { fade, useThemeColors } from '@figures/useThemeColors';
import { Canvas, FigureBody, Panel, PlayPause, Readout, SegmentedControl, Slider } from '@figures/controls';
import { box, bx, by, byUp, label, polyline } from '@figures/plot';

/**
 * Two networks of identical shape — one plain, one residual — trained live by
 * hand-written gradient descent. Nothing here is a fitted curve: the losses on
 * screen are the losses of the two models in the page.
 *
 * The task is a 1-D regression, small enough that a full-batch step costs a few
 * hundred microseconds and honest enough that depth genuinely hurts the plain
 * stack. It is not ImageNet, and the article says so.
 *
 * The residual branch carries a scale β, defaulting to 1/√L. That is not a
 * cosmetic choice: at β = 1 the residual stream grows with depth, tanh
 * saturates, and past about eight blocks the model diverges — which the reader
 * can confirm with the control, and which is the whole argument of §3.2.
 */

const WIDTH = 12;
const BATCH = 32;
const BUDGET = 1600;
/** Steps run synchronously on reset, so the first frame is already informative. */
const BURN_IN = 80;
const STEPS_PER_FRAME = 6;
const MOMENTUM = 0.9;
const X_MIN = -2.2;
const X_MAX = 2.2;

/** Enough curvature that a shallow net cannot fit it by accident. */
function target(x: number): number {
  return (0.85 * Math.sin(3 * x)) / (1 + 0.3 * x * x);
}

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

/** Every weight and bias lives in one flat array, so the update is one loop. */
const BLOCK = WIDTH * WIDTH + WIDTH;

function offsets(blocks: number) {
  const first = 2 * WIDTH;
  const wout = first + blocks * BLOCK;
  return { win: 0, bin: WIDTH, first, wout, bout: wout + WIDTH, size: wout + WIDTH + 1 };
}

interface Net {
  blocks: number;
  residual: boolean;
  /** Scale on the residual branch. Ignored by the plain network. */
  beta: number;
  p: Float64Array;
  g: Float64Array;
  v: Float64Array;
  /** Activations at every block boundary, reused as backward-pass cache. */
  hs: Float64Array;
  /** tanh of each block's pre-activation, needed for its derivative. */
  fs: Float64Array;
  dh: Float64Array;
  dh2: Float64Array;
  steps: number;
  loss: number;
  history: number[];
  diverged: boolean;
}

function createNet(blocks: number, residual: boolean, gain: number, beta: number, seed: number): Net {
  const o = offsets(blocks);
  const p = new Float64Array(o.size);
  const rnd = mulberry32(seed);

  // Fan-in of one for the input projection, √width for everything after it.
  for (let i = 0; i < WIDTH; i += 1) p[o.win + i] = gaussian(rnd);
  for (let l = 0; l < blocks; l += 1) {
    const base = o.first + l * BLOCK;
    for (let i = 0; i < WIDTH * WIDTH; i += 1) p[base + i] = (gaussian(rnd) * gain) / Math.sqrt(WIDTH);
  }
  for (let i = 0; i < WIDTH; i += 1) p[o.wout + i] = gaussian(rnd) / Math.sqrt(WIDTH);

  return {
    blocks,
    residual,
    beta,
    p,
    g: new Float64Array(o.size),
    v: new Float64Array(o.size),
    hs: new Float64Array((blocks + 1) * WIDTH),
    fs: new Float64Array(Math.max(1, blocks * WIDTH)),
    dh: new Float64Array(WIDTH),
    dh2: new Float64Array(WIDTH),
    steps: 0,
    loss: NaN,
    history: [],
    diverged: false,
  };
}

/** Forward pass, leaving `hs` and `fs` populated for the backward pass. */
function forward(net: Net, x: number): number {
  const o = offsets(net.blocks);
  for (let i = 0; i < WIDTH; i += 1) {
    net.hs[i] = Math.tanh(net.p[o.win + i] * x + net.p[o.bin + i]);
  }
  for (let l = 0; l < net.blocks; l += 1) {
    const wBase = o.first + l * BLOCK;
    const bBase = wBase + WIDTH * WIDTH;
    const hIn = l * WIDTH;
    const hOut = hIn + WIDTH;
    for (let i = 0; i < WIDTH; i += 1) {
      let z = net.p[bBase + i];
      const row = wBase + i * WIDTH;
      for (let j = 0; j < WIDTH; j += 1) z += net.p[row + j] * net.hs[hIn + j];
      const f = Math.tanh(z);
      net.fs[hIn + i] = f;
      // The whole architectural difference is this line.
      net.hs[hOut + i] = net.residual ? net.hs[hIn + i] + net.beta * f : f;
    }
  }
  const last = net.blocks * WIDTH;
  let y = net.p[o.bout];
  for (let i = 0; i < WIDTH; i += 1) y += net.p[o.wout + i] * net.hs[last + i];
  return y;
}

function trainStep(net: Net, lr: number, xs: Float64Array, ts: Float64Array): void {
  if (net.diverged || net.steps >= BUDGET) return;
  const o = offsets(net.blocks);
  net.g.fill(0);
  let squared = 0;

  for (let s = 0; s < BATCH; s += 1) {
    const x = xs[s];
    const y = forward(net, x);
    const e = y - ts[s];
    squared += e * e;

    const dy = e / BATCH;
    const last = net.blocks * WIDTH;
    net.g[o.bout] += dy;
    for (let i = 0; i < WIDTH; i += 1) {
      net.g[o.wout + i] += dy * net.hs[last + i];
      net.dh[i] = dy * net.p[o.wout + i];
    }

    for (let l = net.blocks - 1; l >= 0; l -= 1) {
      const wBase = o.first + l * BLOCK;
      const bBase = wBase + WIDTH * WIDTH;
      const hIn = l * WIDTH;
      net.dh2.fill(0);
      for (let i = 0; i < WIDTH; i += 1) {
        const f = net.fs[hIn + i];
        const dz = (net.residual ? net.beta : 1) * net.dh[i] * (1 - f * f);
        net.g[bBase + i] += dz;
        const row = wBase + i * WIDTH;
        for (let j = 0; j < WIDTH; j += 1) {
          net.g[row + j] += dz * net.hs[hIn + j];
          net.dh2[j] += net.p[row + j] * dz;
        }
      }
      // The identity term: gradient that never touched this block's weights.
      if (net.residual) for (let j = 0; j < WIDTH; j += 1) net.dh2[j] += net.dh[j];
      net.dh.set(net.dh2);
    }

    for (let i = 0; i < WIDTH; i += 1) {
      const h0 = net.hs[i];
      const dz = net.dh[i] * (1 - h0 * h0);
      net.g[o.win + i] += dz * x;
      net.g[o.bin + i] += dz;
    }
  }

  const mse = squared / BATCH;
  if (!Number.isFinite(mse) || mse > 1e6) {
    net.diverged = true;
    return;
  }
  for (let i = 0; i < net.p.length; i += 1) {
    net.v[i] = MOMENTUM * net.v[i] - lr * net.g[i];
    net.p[i] += net.v[i];
  }
  net.steps += 1;
  net.loss = mse;
  net.history.push(mse);
}

const SEEDS = { a: 7, b: 23, c: 91 } as const;
type SeedKey = keyof typeof SEEDS;
type BetaMode = 'depth' | 'one';

export default function DepthTrainer() {
  const colors = useThemeColors();
  const [blocks, setBlocks] = useState(20);
  const [lr, setLr] = useState(0.03);
  const [gain, setGain] = useState(0.85);
  const [betaMode, setBetaMode] = useState<BetaMode>('depth');
  const [seedKey, setSeedKey] = useState<SeedKey>('a');
  const [playing, setPlaying] = useState(true);
  const [, setTick] = useState(0);

  const beta = betaMode === 'one' ? 1 : 1 / Math.sqrt(blocks);

  const dataRef = useRef<{ xs: Float64Array; ts: Float64Array } | null>(null);
  if (!dataRef.current) {
    const xs = new Float64Array(BATCH);
    const ts = new Float64Array(BATCH);
    for (let i = 0; i < BATCH; i += 1) {
      xs[i] = X_MIN + ((X_MAX - X_MIN) * i) / (BATCH - 1);
      ts[i] = target(xs[i]);
    }
    dataRef.current = { xs, ts };
  }

  const netsRef = useRef<{ plain: Net; residual: Net } | null>(null);
  const frameRef = useRef(0);

  // Both networks are rebuilt from the same seed whenever the architecture or
  // the optimiser changes, so the two curves always start from matched draws.
  useEffect(() => {
    const { xs, ts } = dataRef.current!;
    const plain = createNet(blocks, false, gain, 1, SEEDS[seedKey]);
    const residual = createNet(blocks, true, gain, beta, SEEDS[seedKey]);
    for (let i = 0; i < BURN_IN; i += 1) {
      trainStep(plain, lr, xs, ts);
      trainStep(residual, lr, xs, ts);
    }
    netsRef.current = { plain, residual };
    setTick((t) => t + 1);
  }, [blocks, gain, lr, beta, seedKey]);

  const { canvasRef, aspect } = useFigureCanvas(
    (ctx, { width, height, dt }) => {
      const nets = netsRef.current;
      const data = dataRef.current;
      if (!nets || !data) return;

      if (dt > 0 && playing) {
        for (let i = 0; i < STEPS_PER_FRAME; i += 1) {
          trainStep(nets.plain, lr, data.xs, data.ts);
          trainStep(nets.residual, lr, data.xs, data.ts);
        }
        frameRef.current += 1;
        if (frameRef.current % 8 === 0) setTick((t) => t + 1);
      }

      const pad = 14;
      const split = Math.round(width * 0.58);
      const lossBox = box(pad + 30, pad + 14, split - pad * 2 - 30, height - pad * 2 - 26);
      const fitBox = box(split + 22, pad + 14, width - split - 22 - pad, height - pad * 2 - 26);

      // Loss, on a log scale — the interesting part is an order of magnitude.
      const logMin = -3.4;
      const logMax = 0.4;
      const ly = (mse: number) =>
        byUp(lossBox, Math.min(logMax, Math.max(logMin, Math.log10(mse))) - logMin, logMax - logMin);

      for (let e = -3; e <= 0; e += 1) {
        const gy = ly(10 ** e);
        polyline(ctx, [[lossBox.x, gy], [lossBox.x + lossBox.w, gy]], fade(colors.faint, 0.18), 1);
        label(ctx, `1e${e}`, lossBox.x - 6, gy, colors.faint, { size: 9, align: 'right', baseline: 'middle' });
      }

      const drawHistory = (net: Net, color: string) => {
        if (net.history.length < 2) return;
        const points: Array<[number, number]> = [];
        const stride = Math.max(1, Math.floor(net.history.length / 480));
        for (let i = 0; i < net.history.length; i += stride) {
          points.push([bx(lossBox, i / BUDGET), ly(net.history[i])]);
        }
        const lastIndex = net.history.length - 1;
        points.push([bx(lossBox, lastIndex / BUDGET), ly(net.history[lastIndex])]);
        polyline(ctx, points, color, 2.1);
      };
      drawHistory(nets.plain, colors.kraft);
      drawHistory(nets.residual, colors.accent);

      label(ctx, 'training loss', lossBox.x, lossBox.y - 4, colors.muted, { size: 10 });
      label(ctx, 'plain', lossBox.x + lossBox.w, lossBox.y - 4, colors.kraft, { size: 10, align: 'right' });
      label(ctx, 'residual', lossBox.x + lossBox.w - 38, lossBox.y - 4, colors.accent, { size: 10, align: 'right' });
      label(
        ctx,
        `${Math.min(nets.residual.steps, BUDGET)} / ${BUDGET} full-batch steps`,
        lossBox.x,
        lossBox.y + lossBox.h + 14,
        colors.faint,
        { size: 9 },
      );

      // What the two models currently think the function is.
      const yRange = 1.05;
      const targetPoints: Array<[number, number]> = [];
      const plainPoints: Array<[number, number]> = [];
      const residualPoints: Array<[number, number]> = [];
      const samples = 90;
      for (let i = 0; i <= samples; i += 1) {
        const u = i / samples;
        const x = X_MIN + (X_MAX - X_MIN) * u;
        targetPoints.push([bx(fitBox, u), by(fitBox, target(x), yRange)]);
        if (!nets.plain.diverged) {
          const yp = forward(nets.plain, x);
          plainPoints.push([bx(fitBox, u), by(fitBox, Math.max(-yRange, Math.min(yRange, yp)), yRange)]);
        }
        if (!nets.residual.diverged) {
          const yr = forward(nets.residual, x);
          residualPoints.push([bx(fitBox, u), by(fitBox, Math.max(-yRange, Math.min(yRange, yr)), yRange)]);
        }
      }
      polyline(ctx, [[fitBox.x, by(fitBox, 0, yRange)], [fitBox.x + fitBox.w, by(fitBox, 0, yRange)]], fade(colors.faint, 0.22), 1);
      polyline(ctx, targetPoints, fade(colors.ink, 0.42), 2.4);
      polyline(ctx, plainPoints, colors.kraft, 1.8);
      polyline(ctx, residualPoints, colors.accent, 2.2);
      label(ctx, 'fit vs target', fitBox.x, fitBox.y - 4, colors.muted, { size: 10 });
      label(ctx, 'target', fitBox.x + fitBox.w, fitBox.y - 4, fade(colors.ink, 0.55), { size: 10, align: 'right' });

      if (nets.plain.diverged) {
        label(ctx, 'plain stack diverged', fitBox.x, fitBox.y + fitBox.h + 14, colors.kraft, { size: 9 });
      }
      if (nets.residual.diverged) {
        label(ctx, 'residual stack diverged', fitBox.x, fitBox.y + fitBox.h + 25, colors.accent, { size: 9 });
      }
    },
    { aspect: 2.3, animate: playing },
  );

  const nets = netsRef.current;
  const plainLoss = nets?.plain.diverged ? NaN : (nets?.plain.loss ?? NaN);
  const residualLoss = nets?.residual.diverged ? NaN : (nets?.residual.loss ?? NaN);
  const ratio = plainLoss / residualLoss;
  const show = (v: number) => (Number.isFinite(v) ? v.toExponential(2) : 'diverged');

  return (
    <FigureBody>
      <Canvas
        canvasRef={canvasRef}
        aspect={aspect}
        label="Two networks of matching shape, one plain and one residual, trained live: their training-loss curves and their current fits to the target function."
      />
      <Panel columns={3}>
        <Slider label="blocks" value={blocks} min={2} max={28} step={1} format={(v) => String(v)} onChange={setBlocks} />
        <Slider label="learning rate" value={lr} min={0.005} max={0.08} step={0.005} format={(v) => v.toFixed(3)} onChange={setLr} />
        <Slider label="init gain" value={gain} min={0.6} max={1.6} step={0.05} format={(v) => v.toFixed(2)} onChange={setGain} />
      </Panel>
      <div className="mt-4 flex flex-wrap items-center gap-3">
        <PlayPause playing={playing} onChange={setPlaying} />
        <SegmentedControl
          label="residual branch scale"
          value={betaMode}
          options={[
            { value: 'depth', label: 'β=1/√L' },
            { value: 'one', label: 'β=1' },
          ]}
          onChange={setBetaMode}
        />
        <SegmentedControl
          label="initial draw"
          value={seedKey}
          options={[
            { value: 'a', label: 'A' },
            { value: 'b', label: 'B' },
            { value: 'c', label: 'C' },
          ]}
          onChange={setSeedKey}
        />
      </div>
      <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
        <Readout label="plain training MSE" value={show(plainLoss)} />
        <Readout label="residual training MSE" value={show(residualLoss)} />
        <Readout
          label="plain ÷ residual"
          value={Number.isFinite(ratio) ? `${ratio.toFixed(1)}×` : '—'}
          hint={`same width and depth · β = ${beta.toFixed(3)}`}
        />
      </div>
    </FigureBody>
  );
}
