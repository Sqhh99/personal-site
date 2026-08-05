import { useState } from 'react';
import { useFigureCanvas } from '@figures/useFigureCanvas';
import { fade, useThemeColors } from '@figures/useThemeColors';
import { Canvas, FigureBody, Panel, Readout, Slider, Toggle } from '@figures/controls';
import { box, byUp, fillRoundRect, frame, label, polyline } from '@figures/plot';

/**
 * The ResNeXt template: 256 channels in, C groups of width d, 256 out.
 *
 *   params(C, d) = 256·C·d  +  9·C·d²  +  C·d·256  =  512·C·d + 9·C·d²
 *
 * The baseline bottleneck is C = 1, d = 64, which comes to 69,632. Holding that
 * budget fixed and solving the quadratic for d gives 64, 40, 24, 14, 4 at
 * C = 1, 2, 4, 8, 32 — the paper's table, recovered from the formula rather
 * than transcribed.
 */

const WIDE = 256;
const BASELINE_PARAMS = 512 * 64 + 9 * 64 * 64;
const RESOLUTION = 56;
const CARDINALITIES = [1, 2, 4, 8, 16, 32, 64];

function params(cardinality: number, width: number): number {
  return 512 * cardinality * width + 9 * cardinality * width * width;
}

function macs(cardinality: number, width: number): number {
  return params(cardinality, width) * RESOLUTION * RESOLUTION;
}

/** Largest integer branch width whose block still fits the parameter budget. */
function isoWidth(cardinality: number, budget: number): number {
  const exact = (-512 + Math.sqrt(512 * 512 + (36 * budget) / cardinality)) / 18;
  return Math.max(1, Math.round(exact));
}

function compact(value: number): string {
  if (value >= 1e9) return `${(value / 1e9).toFixed(2)}G`;
  if (value >= 1e6) return `${(value / 1e6).toFixed(2)}M`;
  if (value >= 1e3) return `${(value / 1e3).toFixed(1)}k`;
  return String(Math.round(value));
}

export default function CardinalityTrade() {
  const colors = useThemeColors();
  const [exponent, setExponent] = useState(5);
  const [freeWidth, setFreeWidth] = useState(4);
  const [isoBudget, setIsoBudget] = useState(true);

  const cardinality = CARDINALITIES[exponent];
  const width = isoBudget ? isoWidth(cardinality, BASELINE_PARAMS) : freeWidth;
  const blockParams = params(cardinality, width);
  const aggregate = cardinality * width;

  const { canvasRef, aspect } = useFigureCanvas(
    (ctx, { width: w, height }) => {
      const pad = 16;
      const splitX = Math.round(w * 0.44);

      // Left — split, transform, merge, drawn at the chosen cardinality.
      const shown = Math.min(cardinality, 16);
      const input = box(pad, height * 0.44, 62, 44);
      const output = box(splitX - pad - 62, height * 0.44, 62, 44);
      fillRoundRect(ctx, input, fade(colors['surface-sunk'], 0.8), 8);
      frame(ctx, input, colors.border, 8);
      label(ctx, `${WIDE} ch`, input.x + input.w / 2, input.y + input.h / 2, colors.ink, {
        size: 10,
        align: 'center',
        baseline: 'middle',
      });
      fillRoundRect(ctx, output, fade(colors.accent, 0.14), 8);
      frame(ctx, output, colors.accent, 8);
      label(ctx, 'sum', output.x + output.w / 2, output.y + output.h / 2, colors['accent-deep'], {
        size: 10,
        align: 'center',
        baseline: 'middle',
      });

      const laneTop = 26;
      const laneBottom = height - 24;
      const step = (laneBottom - laneTop) / shown;
      const startX = input.x + input.w + 18;
      const endX = output.x - 18;
      for (let i = 0; i < shown; i += 1) {
        const y = laneTop + step * (i + 0.5);
        const thickness = Math.max(3, Math.min(14, step * 0.5, width * 0.55));
        const lane = box(startX, y - thickness / 2, endX - startX, thickness);
        polyline(ctx, [[input.x + input.w, input.y + input.h / 2], [lane.x, y]], fade(colors.faint, 0.35), 1);
        fillRoundRect(ctx, lane, fade(colors.kraft, 0.55), Math.min(3, thickness / 2));
        polyline(ctx, [[lane.x + lane.w, y], [output.x, output.y + output.h / 2]], fade(colors.accent, 0.32), 1);
      }
      label(
        ctx,
        cardinality > shown ? `${cardinality} branches · ${width} ch each` : `${cardinality} × ${width} ch`,
        (startX + endX) / 2,
        14,
        colors.muted,
        { size: 10, align: 'center' },
      );

      // Right — aggregate width across the whole family at a fixed budget.
      const plot = box(splitX + 34, pad + 18, w - splitX - 34 - pad, height - pad * 2 - 30);
      let peak = 0;
      const bars = CARDINALITIES.map((c) => {
        const d = isoWidth(c, BASELINE_PARAMS);
        const total = c * d;
        peak = Math.max(peak, total);
        return { c, d, total };
      });
      const barGap = plot.w / bars.length;
      bars.forEach((entry, i) => {
        const h = (entry.total / (peak * 1.14)) * plot.h;
        const b = box(plot.x + i * barGap + barGap * 0.16, plot.y + plot.h - h, barGap * 0.68, h);
        const selected = entry.c === cardinality;
        fillRoundRect(ctx, b, selected ? fade(colors.accent, 0.75) : fade(colors.accent, 0.24), 3);
        label(ctx, `${entry.d}`, b.x + b.w / 2, b.y - 6, selected ? colors['accent-deep'] : colors.faint, {
          size: 9,
          align: 'center',
        });
        label(ctx, String(entry.c), b.x + b.w / 2, plot.y + plot.h + 12, selected ? colors.ink : colors.faint, {
          size: 9,
          align: 'center',
        });
      });
      for (const frac of [0.5, 1]) {
        const gy = byUp(plot, frac * peak, peak * 1.14);
        polyline(ctx, [[plot.x, gy], [plot.x + plot.w, gy]], fade(colors.faint, 0.18), 1);
        label(ctx, String(Math.round(frac * peak)), plot.x - 6, gy, colors.faint, {
          size: 9,
          align: 'right',
          baseline: 'middle',
        });
      }
      label(ctx, `aggregate width at ${compact(BASELINE_PARAMS)} parameters`, plot.x, plot.y - 6, colors.muted, {
        size: 10,
      });
      label(ctx, 'cardinality →', plot.x + plot.w, height - 6, colors.faint, { size: 9, align: 'right' });
      label(ctx, 'branch width above each bar', plot.x, height - 6, colors.faint, { size: 9 });
    },
    { aspect: 1.9, animate: false },
  );

  const budgetRatio = blockParams / BASELINE_PARAMS;

  return (
    <FigureBody>
      <Canvas
        canvasRef={canvasRef}
        aspect={aspect}
        label="A split-transform-merge residual branch at a chosen cardinality, beside the aggregate branch width the whole family reaches at a fixed parameter budget."
      />
      <Panel columns={2}>
        <Slider
          label="cardinality"
          value={exponent}
          min={0}
          max={CARDINALITIES.length - 1}
          step={1}
          format={() => String(cardinality)}
          onChange={setExponent}
        />
        <Slider
          label="width per branch"
          value={width}
          min={1}
          max={64}
          step={1}
          format={(v) => `${v} ch${isoBudget ? ' (solved)' : ''}`}
          onChange={(v) => {
            setIsoBudget(false);
            setFreeWidth(v);
          }}
        />
      </Panel>
      <div className="mt-4">
        <Toggle label="hold the 69,632-parameter budget" checked={isoBudget} onChange={setIsoBudget} />
      </div>
      <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Readout label="parallel transforms" value={String(cardinality)} />
        <Readout label="aggregate width" value={`${aggregate} ch`} hint={`${cardinality} × ${width}`} />
        <Readout label="block parameters" value={blockParams.toLocaleString()} hint={`${budgetRatio.toFixed(2)}× baseline`} />
        <Readout label="block MACs" value={compact(macs(cardinality, width))} hint={`at ${RESOLUTION}² resolution`} />
      </div>
    </FigureBody>
  );
}
