import { useState } from 'react';
import { useFigureCanvas } from '@figures/useFigureCanvas';
import { fade, useThemeColors } from '@figures/useThemeColors';
import { Canvas, FigureBody, Panel, Readout, SegmentedControl, Slider } from '@figures/controls';
import { box, circle, dot, fillRoundRect, label, polyline } from '@figures/plot';

/**
 * What a merge operator costs, counted over the actual node graph.
 *
 * A plain U-Net has one fusion node per level: the anti-diagonal X^{i, L-i}.
 * UNet++ fills the whole triangle i + j ≤ L, and every node it adds sits at the
 * resolution of its own level — which is why the extra nodes near the top of
 * the U dominate the memory even though they are cheap in parameters.
 */

const INPUT = 256;

type Variant = 'concat' | 'add' | 'nested';

interface Node {
  level: number;
  column: number;
  size: number;
  channels: number;
  params: number;
  activation: number;
}

function nodesFor(variant: Variant, levels: number, base: number): Node[] {
  const channelsAt = (i: number) => base * 2 ** i;
  const sizeAt = (i: number) => INPUT / 2 ** i;
  const out: Node[] = [];

  const make = (i: number, j: number, fanIn: number): Node => {
    const c = channelsAt(i);
    const s = sizeAt(i);
    const upConv = 4 * channelsAt(i + 1) * c;
    return {
      level: i,
      column: j,
      size: s,
      channels: c,
      params: upConv + 9 * fanIn * c + 9 * c * c,
      // The concatenated input plus the node's own output, fp32, batch of one.
      activation: (fanIn + c) * s * s * 4,
    };
  };

  if (variant === 'nested') {
    for (let i = 0; i < levels; i += 1) {
      for (let j = 1; j <= levels - i; j += 1) {
        // j same-level features already computed, plus one upsampled from below.
        out.push(make(i, j, (j + 1) * channelsAt(i)));
      }
    }
    return out;
  }

  for (let i = 0; i < levels; i += 1) {
    const c = channelsAt(i);
    // Concatenation doubles the fusion input; addition keeps it at C.
    out.push(make(i, levels - i, variant === 'concat' ? 2 * c : c));
  }
  return out;
}

function bytes(value: number): string {
  if (value >= 1e9) return `${(value / 1e9).toFixed(2)} GB`;
  if (value >= 1e6) return `${(value / 1e6).toFixed(1)} MB`;
  return `${(value / 1e3).toFixed(0)} kB`;
}

function compact(value: number): string {
  if (value >= 1e6) return `${(value / 1e6).toFixed(2)}M`;
  if (value >= 1e3) return `${(value / 1e3).toFixed(1)}k`;
  return String(Math.round(value));
}

const VARIANTS: Array<{ value: Variant; label: string }> = [
  { value: 'concat', label: 'concatenate' },
  { value: 'add', label: 'add' },
  { value: 'nested', label: 'nested ++' },
];

export default function MergeCost() {
  const colors = useThemeColors();
  const [variant, setVariant] = useState<Variant>('concat');
  const [levels, setLevels] = useState(4);
  const [base, setBase] = useState(32);

  const nodes = nodesFor(variant, levels, base);
  const totals = VARIANTS.map((v) => {
    const set = nodesFor(v.value, levels, base);
    return {
      value: v.value,
      label: v.label,
      params: set.reduce((sum, n) => sum + n.params, 0),
      activation: set.reduce((sum, n) => sum + n.activation, 0),
      count: set.length,
    };
  });
  const current = totals.find((t) => t.value === variant)!;
  const baselineActivation = totals.find((t) => t.value === 'concat')!.activation;

  const { canvasRef, aspect } = useFigureCanvas(
    (ctx, { width, height }) => {
      const pad = 16;
      const splitX = Math.round(width * 0.6);

      // The node triangle: encoder column on the left, decoder columns after it.
      const grid = box(pad + 16, pad + 18, splitX - pad * 2 - 16, height - pad * 2 - 30);
      const cols = levels + 1;
      const colStep = grid.w / cols;
      const rowStep = grid.h / (levels + 1);
      const at = (i: number, j: number) => ({
        x: grid.x + (j + 0.5) * colStep,
        y: grid.y + (i + 0.5) * rowStep,
      });

      const peak = nodes.reduce((m, n) => Math.max(m, n.activation), 1);
      const live = new Set(nodes.map((n) => `${n.level}:${n.column}`));

      // Every position in the triangle, so the unused ones read as unused.
      for (let i = 0; i <= levels; i += 1) {
        for (let j = 0; j <= levels - i; j += 1) {
          const p = at(i, j);
          if (j === 0) {
            circle(ctx, p.x, p.y, 7, fade(colors.ink, 0.4), 1.3);
            continue;
          }
          if (!live.has(`${i}:${j}`)) {
            dot(ctx, p.x, p.y, 2, fade(colors.faint, 0.35));
            continue;
          }
          const node = nodes.find((n) => n.level === i && n.column === j)!;
          const r = 4 + 9 * Math.sqrt(node.activation / peak);
          dot(ctx, p.x, p.y, r, fade(colors.accent, 0.55));
          circle(ctx, p.x, p.y, r, colors['accent-deep'], 1.1);
        }
      }

      // Routes into each live node: laterally along its level, and up from below.
      for (const node of nodes) {
        const to = at(node.level, node.column);
        for (let j = 0; j < node.column; j += 1) {
          const from = at(node.level, j);
          polyline(ctx, [[from.x + 8, from.y], [to.x - 8, to.y]], fade(colors.kraft, 0.42), 1);
        }
        const below = at(node.level + 1, node.column - 1);
        polyline(ctx, [[below.x, below.y - 6], [to.x, to.y + 6]], fade(colors.accent, 0.4), 1.2);
      }

      for (let i = 0; i <= levels; i += 1) {
        label(ctx, `${INPUT / 2 ** i}²`, grid.x - 8, at(i, 0).y, colors.faint, {
          size: 8,
          align: 'right',
          baseline: 'middle',
        });
      }
      label(ctx, 'encoder', at(0, 0).x, grid.y - 6, colors.muted, { size: 9, align: 'center' });
      label(ctx, 'fusion nodes →', at(0, 1).x, grid.y - 6, colors.muted, { size: 9 });
      label(ctx, 'node area ∝ activation memory', grid.x - 8, height - 6, colors.faint, { size: 9 });

      // Right — the three variants side by side on the two budgets that matter.
      const chart = box(splitX + 10, pad + 18, width - splitX - 10 - pad, height - pad * 2 - 30);
      const maxParams = Math.max(...totals.map((t) => t.params));
      const maxAct = Math.max(...totals.map((t) => t.activation));
      const rowGap = chart.h / totals.length;
      totals.forEach((entry, i) => {
        const y = chart.y + i * rowGap + 6;
        const barH = Math.min(11, rowGap * 0.22);
        const selected = entry.value === variant;
        label(ctx, entry.label, chart.x, y - 3, selected ? colors.ink : colors.faint, { size: 9 });
        const pw = (entry.params / maxParams) * chart.w;
        fillRoundRect(ctx, box(chart.x, y + 3, pw, barH), fade(colors.kraft, selected ? 0.85 : 0.35), 3);
        label(ctx, compact(entry.params), chart.x + pw + 5, y + 3 + barH / 2, colors.faint, {
          size: 8,
          baseline: 'middle',
        });
        const aw = (entry.activation / maxAct) * chart.w;
        fillRoundRect(ctx, box(chart.x, y + 6 + barH, aw, barH), fade(colors.accent, selected ? 0.85 : 0.32), 3);
        label(ctx, bytes(entry.activation), chart.x + aw + 5, y + 6 + barH * 1.5, colors.faint, {
          size: 8,
          baseline: 'middle',
        });
      });
      label(ctx, 'parameters', chart.x, chart.y - 6, colors.kraft, { size: 9 });
      label(ctx, 'activations', chart.x + 66, chart.y - 6, colors.accent, { size: 9 });
    },
    { aspect: 1.85, animate: false },
  );

  return (
    <FigureBody>
      <Canvas
        canvasRef={canvasRef}
        aspect={aspect}
        label="The fusion-node graph of a U-Net decoder with node area proportional to activation memory, beside a comparison of parameters and activation memory for concatenation, addition and nested skips."
      />
      <Panel columns={3}>
        <SegmentedControl label="merge" value={variant} options={VARIANTS} onChange={setVariant} />
        <Slider label="resolution levels" value={levels} min={2} max={5} step={1} format={(v) => String(v)} onChange={setLevels} />
        <Slider label="base channels" value={base} min={16} max={64} step={16} format={(v) => String(v)} onChange={setBase} />
      </Panel>
      <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Readout label="fusion nodes" value={String(current.count)} />
        <Readout label="fusion parameters" value={compact(current.params)} />
        <Readout label="fusion activations" value={bytes(current.activation)} hint={`at ${INPUT}² input`} />
        <Readout
          label="vs concatenation"
          value={`${(current.activation / baselineActivation).toFixed(2)}×`}
          hint="activation memory"
        />
      </div>
    </FigureBody>
  );
}
