import { useMemo, useState } from 'react';
import { useFigureCanvas } from '@figures/useFigureCanvas';
import { fade, useThemeColors } from '@figures/useThemeColors';
import { Canvas, FigureBody, Panel, Readout, Slider, Toggle } from '@figures/controls';
import { box, byUp, fillRoundRect, label, polyline } from '@figures/plot';

/**
 * Expanding ∏(I + F_l) over L blocks gives 2^L terms, one per subset of blocks
 * a path passes through. So the counts are exactly binomial, and if traversing
 * one branch scales a gradient by a, the mass at path length k is C(L,k)·a^k.
 *
 * Both distributions are computed exactly in log space, which keeps L up to 120
 * honest — C(120,60) is about 10^35 and would not survive a naive product.
 */

const MAX_BLOCKS = 120;

/** log k! by summation. Exact enough well past the range this figure allows. */
const LOG_FACT = (() => {
  const table = new Float64Array(MAX_BLOCKS + 1);
  for (let i = 1; i <= MAX_BLOCKS; i += 1) table[i] = table[i - 1] + Math.log(i);
  return table;
})();

function logChoose(n: number, k: number): number {
  return LOG_FACT[n] - LOG_FACT[k] - LOG_FACT[n - k];
}

interface Distributions {
  /** Share of the 2^L paths that have each length. */
  counts: Float64Array;
  /** Share of total gradient magnitude carried by paths of each length. */
  mass: Float64Array;
  cumulative: Float64Array;
  effectiveDepth: number;
  medianLength: number;
}

function distributions(blocks: number, branchFactor: number): Distributions {
  const counts = new Float64Array(blocks + 1);
  const mass = new Float64Array(blocks + 1);
  const cumulative = new Float64Array(blocks + 1);
  const logA = Math.log(branchFactor);

  let maxCount = -Infinity;
  let maxMass = -Infinity;
  const logCounts = new Float64Array(blocks + 1);
  const logMass = new Float64Array(blocks + 1);
  for (let k = 0; k <= blocks; k += 1) {
    logCounts[k] = logChoose(blocks, k);
    logMass[k] = logCounts[k] + k * logA;
    maxCount = Math.max(maxCount, logCounts[k]);
    maxMass = Math.max(maxMass, logMass[k]);
  }

  let countSum = 0;
  let massSum = 0;
  for (let k = 0; k <= blocks; k += 1) {
    counts[k] = Math.exp(logCounts[k] - maxCount);
    mass[k] = Math.exp(logMass[k] - maxMass);
    countSum += counts[k];
    massSum += mass[k];
  }

  let running = 0;
  let weighted = 0;
  let median = 0;
  let medianFound = false;
  for (let k = 0; k <= blocks; k += 1) {
    counts[k] /= countSum;
    mass[k] /= massSum;
    running += mass[k];
    cumulative[k] = running;
    weighted += k * mass[k];
    if (!medianFound && running >= 0.5) {
      median = k;
      medianFound = true;
    }
  }

  return { counts, mass, cumulative, effectiveDepth: weighted, medianLength: median };
}

export default function PathEnsemble() {
  const colors = useThemeColors();
  const [blocks, setBlocks] = useState(54);
  const [branchFactor, setBranchFactor] = useState(0.55);
  const [showCumulative, setShowCumulative] = useState(true);

  const dist = useMemo(() => distributions(blocks, branchFactor), [blocks, branchFactor]);

  // Closed forms, for comparison with the summed values above.
  const predictedDepth = (blocks * branchFactor) / (1 + branchFactor);
  const log10Paths = (blocks * Math.LN2) / Math.LN10;

  const { canvasRef, aspect } = useFigureCanvas(
    (ctx, { width, height }) => {
      const pad = 16;
      const plot = box(pad + 26, pad + 16, width - pad * 2 - 26, height - pad * 2 - 28);

      let peak = 0;
      for (let k = 0; k <= blocks; k += 1) peak = Math.max(peak, dist.counts[k], dist.mass[k]);
      const span = peak * 1.12;
      const barW = plot.w / (blocks + 1);

      for (let k = 0; k <= blocks; k += 1) {
        const x = plot.x + k * barW;
        const w = Math.max(1, barW - Math.min(1.6, barW * 0.25));
        const countH = (dist.counts[k] / span) * plot.h;
        fillRoundRect(
          ctx,
          box(x, plot.y + plot.h - countH, w, countH),
          fade(colors.kraft, 0.42),
          Math.min(2, w / 3),
        );
        const massH = (dist.mass[k] / span) * plot.h;
        fillRoundRect(
          ctx,
          box(x, plot.y + plot.h - massH, w, massH),
          fade(colors.accent, 0.72),
          Math.min(2, w / 3),
        );
      }

      if (showCumulative) {
        const points: Array<[number, number]> = [];
        for (let k = 0; k <= blocks; k += 1) {
          points.push([plot.x + (k + 0.5) * barW, byUp(plot, dist.cumulative[k], 1)]);
        }
        polyline(ctx, points, fade(colors.ink, 0.5), 1.6);
        const half = byUp(plot, 0.5, 1);
        ctx.setLineDash([3, 4]);
        polyline(ctx, [[plot.x, half], [plot.x + plot.w, half]], fade(colors.faint, 0.5), 1);
        ctx.setLineDash([]);
        label(ctx, 'cumulative gradient mass', plot.x + plot.w, plot.y + 12, fade(colors.ink, 0.6), {
          size: 9,
          align: 'right',
        });
      }

      // Where the gradient actually comes from, versus where the paths are.
      const markLine = (k: number, color: string, text: string, above: boolean) => {
        const x = plot.x + (k + 0.5) * barW;
        polyline(ctx, [[x, plot.y], [x, plot.y + plot.h]], color, 1.6);
        label(ctx, text, x + 4, above ? plot.y + 11 : plot.y + 26, color, { size: 9 });
      };
      markLine(blocks / 2, fade(colors.kraft, 0.95), `median path ${(blocks / 2).toFixed(0)}`, true);
      markLine(dist.effectiveDepth, colors['accent-deep'], `effective ${dist.effectiveDepth.toFixed(1)}`, false);

      for (const frac of [0, 0.25, 0.5, 0.75, 1]) {
        const k = Math.round(blocks * frac);
        label(ctx, String(k), plot.x + (k + 0.5) * barW, plot.y + plot.h + 13, colors.faint, {
          size: 9,
          align: 'center',
        });
      }
      label(ctx, 'path length — blocks a route actually passes through', plot.x, plot.y - 5, colors.muted, {
        size: 10,
      });
      label(ctx, 'paths', plot.x + plot.w - 62, plot.y - 5, colors.kraft, { size: 10, align: 'right' });
      label(ctx, 'gradient', plot.x + plot.w, plot.y - 5, colors.accent, { size: 10, align: 'right' });
    },
    { aspect: 2.2, animate: false },
  );

  let shortMass = 0;
  const cutoff = Math.min(blocks, 20);
  for (let k = 0; k <= cutoff; k += 1) shortMass += dist.mass[k];

  return (
    <FigureBody>
      <Canvas
        canvasRef={canvasRef}
        aspect={aspect}
        label="Exact binomial distribution of path lengths through a residual stack, overlaid with the share of gradient magnitude each path length carries."
      />
      <Panel columns={2}>
        <Slider label="blocks (L)" value={blocks} min={8} max={MAX_BLOCKS} step={2} format={(v) => String(v)} onChange={setBlocks} />
        <Slider
          label="per-branch gradient factor"
          value={branchFactor}
          min={0.05}
          max={1}
          step={0.05}
          format={(v) => v.toFixed(2)}
          onChange={setBranchFactor}
        />
      </Panel>
      <div className="mt-4">
        <Toggle label="cumulative curve" checked={showCumulative} onChange={setShowCumulative} />
      </div>
      <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Readout label="distinct paths" value={`10^${log10Paths.toFixed(1)}`} hint={`2^${blocks}`} />
        <Readout label="mean path length" value={(blocks / 2).toFixed(1)} hint="unweighted" />
        <Readout
          label="effective depth"
          value={dist.effectiveDepth.toFixed(2)}
          hint={`La/(1+a) = ${predictedDepth.toFixed(2)}`}
        />
        <Readout label="gradient from ≤ 20 blocks" value={`${(shortMass * 100).toFixed(1)}%`} />
      </div>
    </FigureBody>
  );
}
