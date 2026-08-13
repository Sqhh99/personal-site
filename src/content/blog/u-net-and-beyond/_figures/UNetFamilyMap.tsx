import { useState } from 'react';
import { useFigureCanvas } from '@figures/useFigureCanvas';
import { fade, useThemeColors } from '@figures/useThemeColors';
import { Canvas, FigureBody, Readout } from '@figures/controls';
import { type Box, box, circle, dot, fillRoundRect, frame, label, polyline } from '@figures/plot';

/**
 * The U-Net family as one scaffold, mutated along a single axis at a time.
 *
 * The U is the invariant. Each descendant lights a different part of it —
 * the blocks, the skips, the volume, or the pipeline around an unchanged
 * graph. Receptive field and fusion-node counts use the same arithmetic as
 * UNetWalkthrough and MergeCost.
 */

const LEVELS = 4;
const BASE = 32;
const INPUT = 256;
const IN_CHANNELS = 1;
const CLASSES = 2;

function receptiveField(levels: number): number {
  let rf = 1;
  let jump = 1;
  for (let i = 0; i < levels; i += 1) {
    rf += 2 * jump;
    rf += 2 * jump;
    rf += jump;
    jump *= 2;
  }
  rf += 2 * jump;
  rf += 2 * jump;
  return rf;
}

/** Full U-Net parameter count, 3×3 (or 3×3×3) spatial kernels. */
function unetParams(dim: 2 | 3): number {
  const k = dim === 2 ? 9 : 27;
  const up = dim === 2 ? 4 : 8;
  let total = 0;
  for (let i = 0; i < LEVELS; i += 1) {
    const c = BASE * 2 ** i;
    const cIn = i === 0 ? IN_CHANNELS : BASE * 2 ** (i - 1);
    total += k * cIn * c + k * c * c;
  }
  const bottom = BASE * 2 ** LEVELS;
  total += k * (bottom / 2) * bottom + k * bottom * bottom;
  for (let i = LEVELS - 1; i >= 0; i -= 1) {
    const c = BASE * 2 ** i;
    const below = BASE * 2 ** (i + 1);
    total += up * below * c + k * (2 * c) * c + k * c * c;
    if (i === 0) total += c * CLASSES;
  }
  return total;
}

interface FusionNode {
  level: number;
  column: number;
  activation: number;
}

function fusionNodes(nested: boolean): FusionNode[] {
  const out: FusionNode[] = [];
  const channelsAt = (i: number) => BASE * 2 ** i;
  const sizeAt = (i: number) => INPUT / 2 ** i;
  const push = (i: number, j: number, fanIn: number) => {
    const c = channelsAt(i);
    const s = sizeAt(i);
    out.push({ level: i, column: j, activation: (fanIn + c) * s * s * 4 });
  };
  if (nested) {
    for (let i = 0; i < LEVELS; i += 1) {
      for (let j = 1; j <= LEVELS - i; j += 1) {
        push(i, j, (j + 1) * channelsAt(i));
      }
    }
    return out;
  }
  for (let i = 0; i < LEVELS; i += 1) {
    push(i, LEVELS - i, 2 * channelsAt(i));
  }
  return out;
}

function bytes(value: number): string {
  if (value >= 1e6) return `${(value / 1e6).toFixed(1)} MB`;
  return `${(value / 1e3).toFixed(0)} kB`;
}

function compact(value: number): string {
  if (value >= 1e6) return `${(value / 1e6).toFixed(2)}M`;
  if (value >= 1e3) return `${(value / 1e3).toFixed(1)}k`;
  return String(Math.round(value));
}

type Kind = 'unet' | '3d' | 'plusplus' | 'attention' | 'resunet' | 'nnunet';

interface Family {
  kind: Kind;
  name: string;
  axis: string;
  idea: string;
  metric: string;
  metricHint: string;
}

const PLAIN_FUSION = fusionNodes(false);
const NESTED_FUSION = fusionNodes(true);
const PLAIN_ACT = PLAIN_FUSION.reduce((s, n) => s + n.activation, 0);
const NESTED_ACT = NESTED_FUSION.reduce((s, n) => s + n.activation, 0);
const RF = receptiveField(LEVELS);
const PARAMS_2D = unetParams(2);
const PARAMS_3D = unetParams(3);

const FAMILIES: Family[] = [
  {
    kind: 'unet',
    name: 'U-Net',
    axis: 'topology',
    idea: 'match a contracting path with an expanding path and lateral skips',
    metric: `${RF} px field`,
    metricHint: `${compact(PARAMS_2D)} params · ${LEVELS} levels, base ${BASE}`,
  },
  {
    kind: '3d',
    name: '3D U-Net',
    axis: 'dimensionality',
    idea: 'replace 2D operations with volumetric ones',
    metric: '27 vs 9',
    metricHint: `kernel weights · resolution doubling is ×8, not ×4 · ${compact(PARAMS_3D)} params`,
  },
  {
    kind: 'plusplus',
    name: 'UNet++',
    axis: 'skip topology',
    idea: 'refine the lateral routes through nested fusion nodes',
    metric: `${NESTED_FUSION.length} vs ${PLAIN_FUSION.length} nodes`,
    metricHint: `fusion activations ${bytes(NESTED_ACT)} · ${(NESTED_ACT / PLAIN_ACT).toFixed(2)}× concatenation`,
  },
  {
    kind: 'attention',
    name: 'Attention',
    axis: 'selection',
    idea: 'gate encoder detail using decoder context',
    metric: '1 α / location',
    metricHint: `${LEVELS} gates, one coefficient per spatial site`,
  },
  {
    kind: 'resunet',
    name: 'ResUNet',
    axis: 'block design',
    idea: 'use residual blocks inside the U-shaped scaffold',
    metric: 'two skip kinds',
    metricHint: 'short residual add at one scale · long concat across the bottleneck',
  },
  {
    kind: 'nnunet',
    name: 'nnU-Net',
    axis: 'system design',
    idea: 'configure preprocessing, scale and training from the dataset',
    metric: 'same U',
    metricHint: `${compact(PARAMS_2D)} params · the graph is unchanged`,
  },
];

function isoBar(
  ctx: CanvasRenderingContext2D,
  b: Box,
  fill: string,
  stroke: string,
  extrude: boolean,
  topFill: string,
) {
  const dx = extrude ? Math.min(7, b.w * 0.16) : 0;
  const dy = extrude ? Math.min(5, b.h * 0.32) : 0;
  if (extrude) {
    ctx.beginPath();
    ctx.moveTo(b.x + 4, b.y);
    ctx.lineTo(b.x + 4 + dx, b.y - dy);
    ctx.lineTo(b.x + b.w + dx, b.y - dy);
    ctx.lineTo(b.x + b.w, b.y);
    ctx.closePath();
    ctx.fillStyle = topFill;
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(b.x + b.w, b.y);
    ctx.lineTo(b.x + b.w + dx, b.y - dy);
    ctx.lineTo(b.x + b.w + dx, b.y + b.h - dy - 2);
    ctx.lineTo(b.x + b.w, b.y + b.h - 2);
    ctx.closePath();
    ctx.fillStyle = fade(stroke, 0.2);
    ctx.fill();
  }
  fillRoundRect(ctx, b, fill, 5);
  frame(ctx, b, stroke, 5);
}

function residualLoop(ctx: CanvasRenderingContext2D, b: Box, side: 'left' | 'right', color: string) {
  const x = side === 'left' ? b.x - 7 : b.x + b.w + 7;
  const inset = side === 'left' ? b.x : b.x + b.w;
  polyline(
    ctx,
    [
      [inset, b.y + 4],
      [x, b.y + 4],
      [x, b.y + b.h - 4],
      [inset, b.y + b.h - 4],
    ],
    color,
    1.6,
  );
}

export default function UNetFamilyMap() {
  const colors = useThemeColors();
  const [selected, setSelected] = useState(0);
  const family = FAMILIES[selected];

  const { canvasRef, aspect } = useFigureCanvas(
    (ctx, { width, height }) => {
      const pad = width < 520 ? 10 : 16;
      const well = box(pad, 10, width - pad * 2, height - 20);
      fillRoundRect(ctx, well, fade(colors['surface-sunk'], 0.42), 14);
      frame(ctx, well, colors.border, 14);

      const kind = family.kind;
      const extrude = kind === '3d';
      const nested = kind === 'plusplus';
      const gated = kind === 'attention';
      const residual = kind === 'resunet';
      const pipeline = kind === 'nnunet';
      const narrow = width < 560;

      label(ctx, family.name, well.x + 14, well.y + 20, colors.ink, { size: 11, weight: '650' });
      label(ctx, `axis · ${family.axis}`, well.x + 14, well.y + 34, colors.faint, { size: 10 });
      label(ctx, family.metric, well.x + well.w - 14, well.y + 20, colors['accent-deep'], {
        size: 11,
        align: 'right',
        weight: '650',
      });

      const knobs = ['spacing', 'patch', 'batch', 'depth', 'loss', 'ensemble'];
      const innerTop = well.y + (pipeline ? 68 : 48);
      const inner = box(well.x + (narrow ? 16 : 28), innerTop, well.w - (narrow ? 32 : 56), well.y + well.h - 22 - innerTop);
      const rowH = inner.h / (LEVELS + 0.85);
      const barH = Math.min(26, rowH * 0.48);
      const maxW = inner.w * (narrow ? 0.3 : 0.28);
      const minW = inner.w * 0.12;
      const midX = inner.x + inner.w / 2;

      const enc: Box[] = [];
      const dec: Box[] = [];
      for (let i = 0; i < LEVELS; i += 1) {
        const t = i / (LEVELS - 1);
        const w = maxW + (minW - maxW) * t;
        const y = inner.y + i * rowH + (rowH - barH) / 2;
        const loopPad = residual ? 10 : 0;
        enc.push(box(inner.x + loopPad, y, w, barH));
        dec.push(box(inner.x + inner.w - w - loopPad, y, w, barH));
      }
      const bottomW = minW * 1.15;
      const bottom = box(midX - bottomW / 2, inner.y + LEVELS * rowH + 2, bottomW, barH);

      if (pipeline) {
        const shown = narrow ? knobs.filter((_, i) => i % 2 === 0) : knobs;
        const gap = 6;
        const pillW = Math.min(70, (well.w - 28 - gap * (shown.length - 1)) / shown.length);
        const rowW = shown.length * pillW + (shown.length - 1) * gap;
        const startX = well.x + (well.w - rowW) / 2;
        shown.forEach((text, i) => {
          const pill = box(startX + i * (pillW + gap), well.y + 48, pillW, 14);
          fillRoundRect(ctx, pill, fade(colors.kraft, 0.2), 4);
          label(ctx, text, pill.x + pill.w / 2, pill.y + 8, colors.kraft, { size: 8, align: 'center', baseline: 'middle' });
        });
        ctx.beginPath();
        ctx.roundRect(inner.x - 6, inner.y - 2, inner.w + 12, inner.h + 4, 10);
        ctx.strokeStyle = colors.kraft;
        ctx.lineWidth = 1.4;
        ctx.setLineDash([4, 4]);
        ctx.stroke();
        ctx.setLineDash([]);
      }

      // Skip structure lives between the two columns — that is the varying axis
      // for UNet++, Attention, and the long route of ResUNet.
      if (nested) {
        const nodes = NESTED_FUSION;
        const peak = nodes.reduce((m, n) => Math.max(m, n.activation), 1);
        const at = (level: number, column: number) => {
          const y = enc[level].y + enc[level].h / 2;
          const left = enc[level].x + enc[level].w + 10;
          const right = dec[level].x - 10;
          const span = Math.max(1, LEVELS - level);
          const u = column / span;
          return { x: left + u * (right - left), y };
        };
        for (const node of nodes) {
          const to = at(node.level, node.column);
          if (node.column > 0) {
            const from = at(node.level, node.column - 1);
            polyline(ctx, [[from.x, from.y], [to.x, to.y]], fade(colors.kraft, 0.45), 1);
          }
          if (node.level < LEVELS - 1 && node.column > 0) {
            const below = at(node.level + 1, node.column - 1);
            polyline(ctx, [[below.x, below.y], [to.x, to.y]], fade(colors.accent, 0.4), 1);
          }
          const r = 2.4 + 5.5 * Math.sqrt(node.activation / peak);
          dot(ctx, to.x, to.y, r, fade(colors.accent, 0.7));
        }
      } else {
        for (let i = 0; i < LEVELS; i += 1) {
          const y = enc[i].y + enc[i].h / 2;
          const x1 = enc[i].x + enc[i].w + 3;
          const x2 = dec[i].x - 3;
          polyline(ctx, [[x1, y], [x2, y]], residual ? fade(colors.kraft, 0.85) : fade(colors.kraft, 0.55), residual ? 2 : 1.3);
          if (gated) {
            const gx = (x1 + x2) / 2;
            ctx.beginPath();
            ctx.arc(gx, y, 6, 0, Math.PI * 2);
            ctx.fillStyle = fade(colors.accent, 0.2);
            ctx.fill();
            circle(ctx, gx, y, 6, colors.accent, 1.3);
            label(ctx, 'α', gx, y + 1, colors['accent-deep'], { size: 8, align: 'center', baseline: 'middle' });
          }
        }
      }

      const barFill = (lit: boolean) => (lit ? fade(colors.accent, 0.2) : fade(colors.surface, 0.95));
      const barStroke = (lit: boolean) => (lit ? colors.accent : colors['border-strong']);
      const barTop = (lit: boolean) => (lit ? fade(colors.accent, 0.12) : fade(colors.manilla, 0.55));
      const blockLit = residual;
      const volumeLit = extrude;

      enc.forEach((b, i) => {
        isoBar(ctx, b, barFill(blockLit || volumeLit), barStroke(blockLit || volumeLit), extrude, barTop(blockLit || volumeLit));
        if (residual) residualLoop(ctx, b, 'left', colors.accent);
        if (!narrow || i === 0) {
          label(ctx, `${BASE * 2 ** i}`, b.x + 6, b.y + b.h / 2, colors.muted, { size: 8, baseline: 'middle' });
        }
      });
      dec.forEach((b) => {
        isoBar(ctx, b, barFill(blockLit || volumeLit), barStroke(blockLit || volumeLit), extrude, barTop(blockLit || volumeLit));
        if (residual) residualLoop(ctx, b, 'right', colors.accent);
      });
      isoBar(ctx, bottom, barFill(volumeLit), barStroke(volumeLit), extrude, barTop(volumeLit));

      polyline(
        ctx,
        [
          [enc[LEVELS - 1].x + enc[LEVELS - 1].w / 2, enc[LEVELS - 1].y + enc[LEVELS - 1].h],
          [enc[LEVELS - 1].x + enc[LEVELS - 1].w / 2, bottom.y + bottom.h / 2],
          [bottom.x, bottom.y + bottom.h / 2],
        ],
        fade(colors.ink, 0.35),
        1.2,
      );
      polyline(
        ctx,
        [
          [bottom.x + bottom.w, bottom.y + bottom.h / 2],
          [dec[LEVELS - 1].x + dec[LEVELS - 1].w / 2, bottom.y + bottom.h / 2],
          [dec[LEVELS - 1].x + dec[LEVELS - 1].w / 2, dec[LEVELS - 1].y + dec[LEVELS - 1].h],
        ],
        fade(colors.ink, 0.35),
        1.2,
      );

      if (!pipeline) {
        label(ctx, 'encoder', enc[0].x, inner.y - 6, colors.muted, { size: 9 });
        label(ctx, 'decoder', dec[0].x + dec[0].w, inner.y - 6, colors.muted, { size: 9, align: 'right' });
      }
      if (!narrow) {
        label(ctx, `${INPUT}²`, enc[0].x + enc[0].w + 8, enc[0].y + enc[0].h / 2, colors.faint, {
          size: 8,
          baseline: 'middle',
        });
        label(
          ctx,
          `${INPUT / 2 ** (LEVELS - 1)}²`,
          enc[LEVELS - 1].x + enc[LEVELS - 1].w + 8,
          enc[LEVELS - 1].y + enc[LEVELS - 1].h / 2,
          colors.faint,
          { size: 8, baseline: 'middle' },
        );
      }

      const footnote = narrow
        ? ''
        : kind === 'resunet'
          ? 'kraft laterals carry detail · accent loops are residual adds'
          : kind === 'nnunet'
            ? 'the U is the same graph — the method is the configuration around it'
            : kind === '3d'
              ? 'each bar is a volume; doubling a side multiplies voxels by eight'
              : kind === 'plusplus'
                ? 'node area ∝ fusion activation memory'
                : kind === 'attention'
                  ? 'each gate is one map α, multiplied onto the skip'
                  : 'lateral skips join equal resolutions';
      if (footnote) {
        label(ctx, footnote, well.x + 14, well.y + well.h - 12, colors.faint, { size: 9 });
      }
    },
    { aspect: 1.78, animate: false },
  );

  return (
    <FigureBody>
      <Canvas
        canvasRef={canvasRef}
        aspect={aspect}
        label={`A U-Net family specimen. ${family.name} changes ${family.axis}: ${family.idea}.`}
      />
      <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6" role="group" aria-label="U-Net family">
        {FAMILIES.map((entry, i) => {
          const on = i === selected;
          return (
            <button
              key={entry.kind}
              type="button"
              aria-pressed={on}
              onClick={() => setSelected(i)}
              className={`rounded-lg border px-2.5 py-2 text-left transition-colors ${
                on
                  ? 'border-accent/50 bg-accent/10'
                  : 'border-line bg-sunk/50 hover:border-line-strong'
              }`}
            >
              <div className={`font-mono text-[0.7rem] tracking-wider ${on ? 'text-accent-deep' : 'text-ink'}`}>
                {entry.name}
              </div>
              <div className="mt-0.5 font-mono text-[0.65rem] text-faint">{entry.axis}</div>
            </button>
          );
        })}
      </div>
      <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Readout label={family.name} value={family.idea} />
        <Readout label="design axis" value={family.axis} />
        <Readout label="what it costs" value={family.metric} hint={family.metricHint} />
      </div>
    </FigureBody>
  );
}
