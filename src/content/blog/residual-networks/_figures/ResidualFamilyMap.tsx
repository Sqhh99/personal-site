import { useState } from 'react';
import { useFigureCanvas } from '@figures/useFigureCanvas';
import { fade, useThemeColors, type ThemeColors } from '@figures/useThemeColors';
import { Canvas, FigureBody, Readout } from '@figures/controls';
import { type Box, box, circle, fillRoundRect, frame, label, polyline } from '@figures/plot';

/**
 * The residual family as one block, mutated along a single axis at a time.
 *
 * The identity rail is drawn in the same place for every descendant — that is
 * the invariant the article names. What changes is F. Parameter counts use the
 * same arithmetic as ResidualBlockExplorer and CardinalityTrade:
 *
 *   bottleneck(w) = 256w + 9w² + 256w
 *   resnext(C, d) = 512·C·d + 9·C·d²
 *   SE(C, r)      = 2 C² / r
 */

const STATE = 256;
const WAIST = 64;
const WIDE_K = 2;
const CARDINALITY = 32;
const GROUP_WIDTH = 4;
const SE_REDUCTION = 16;
const RESOLUTION = 56;

function bottleneckParams(waist: number): number {
  return STATE * waist + 9 * waist * waist + waist * STATE;
}

function resnextParams(cardinality: number, width: number): number {
  return 512 * cardinality * width + 9 * cardinality * width * width;
}

function seParams(channels: number, reduction: number): number {
  return (2 * channels * channels) / reduction;
}

const BASELINE = bottleneckParams(WAIST);

type Kind = 'resnet' | 'v2' | 'wide' | 'resnext' | 'se';

interface Family {
  kind: Kind;
  name: string;
  axis: string;
  idea: string;
  params: number;
  metric: string;
  metricHint: string;
}

const FAMILIES: Family[] = [
  {
    kind: 'resnet',
    name: 'ResNet',
    axis: 'baseline idea',
    idea: 'learn a residual update around an identity path',
    params: BASELINE,
    metric: compact(BASELINE),
    metricHint: `bottleneck ${STATE}–${WAIST}–${STATE} at ${RESOLUTION}²`,
  },
  {
    kind: 'v2',
    name: 'v2',
    axis: 'ordering',
    idea: 'normalise and activate before the weight layers',
    params: BASELINE,
    metric: compact(BASELINE),
    metricHint: 'same weights; the add stays linear',
  },
  {
    kind: 'wide',
    name: 'Wide',
    axis: 'width',
    idea: 'spend capacity on wider residual branches',
    params: bottleneckParams(WAIST * WIDE_K),
    metric: `${WIDE_K}× waist`,
    metricHint: `${compact(bottleneckParams(WAIST * WIDE_K))} params · ${(bottleneckParams(WAIST * WIDE_K) / BASELINE).toFixed(2)}× the baseline`,
  },
  {
    kind: 'resnext',
    name: 'ResNeXt',
    axis: 'cardinality',
    idea: 'sum several equally shaped transformations',
    params: resnextParams(CARDINALITY, GROUP_WIDTH),
    metric: `${CARDINALITY}×${GROUP_WIDTH}d`,
    metricHint: `${compact(resnextParams(CARDINALITY, GROUP_WIDTH))} params · aggregate width ${CARDINALITY * GROUP_WIDTH}`,
  },
  {
    kind: 'se',
    name: 'SE',
    axis: 'channel attention',
    idea: 'reweight channels before adding the residual',
    params: BASELINE + seParams(STATE, SE_REDUCTION),
    metric: `r = ${SE_REDUCTION}`,
    metricHint: `+${compact(seParams(STATE, SE_REDUCTION))} for the two FC layers`,
  },
];

function compact(value: number): string {
  if (value >= 1e6) return `${(value / 1e6).toFixed(2)}M`;
  if (value >= 1e3) return `${(value / 1e3).toFixed(1)}k`;
  return String(Math.round(value));
}

function plus(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, color: string) {
  circle(ctx, x, y, r, color, 1.4);
  ctx.beginPath();
  ctx.moveTo(x - r * 0.42, y);
  ctx.lineTo(x + r * 0.42, y);
  ctx.moveTo(x, y - r * 0.42);
  ctx.lineTo(x, y + r * 0.42);
  ctx.strokeStyle = color;
  ctx.lineWidth = 1.3;
  ctx.stroke();
}

function token(
  ctx: CanvasRenderingContext2D,
  b: Box,
  title: string,
  sub: string,
  colors: ThemeColors,
  filled = false,
) {
  fillRoundRect(ctx, b, filled ? fade(colors.accent, 0.14) : fade(colors['surface-sunk'], 0.9), 8);
  frame(ctx, b, filled ? colors.accent : colors.border, 8);
  label(ctx, title, b.x + b.w / 2, b.y + b.h / 2 - (b.h > 40 ? 6 : 5), filled ? colors['accent-deep'] : colors.ink, {
    size: b.w < 48 ? 10 : 11,
    align: 'center',
    weight: '650',
  });
  label(ctx, sub, b.x + b.w / 2, b.y + b.h / 2 + 9, colors.muted, { size: 8, align: 'center' });
}

function stage(
  ctx: CanvasRenderingContext2D,
  b: Box,
  title: string,
  sub: string,
  colors: ThemeColors,
  lit: boolean,
) {
  fillRoundRect(ctx, b, lit ? fade(colors.accent, 0.16) : fade(colors.surface, 0.94), 8);
  frame(ctx, b, lit ? colors.accent : colors['border-strong'], 8);
  label(ctx, title, b.x + b.w / 2, b.y + b.h / 2 - 6, lit ? colors['accent-deep'] : colors.ink, {
    size: b.w < 52 ? 9 : 11,
    align: 'center',
    weight: '650',
  });
  label(ctx, sub, b.x + b.w / 2, b.y + b.h / 2 + 10, colors.muted, { size: 8, align: 'center' });
}

export default function ResidualFamilyMap() {
  const colors = useThemeColors();
  const [selected, setSelected] = useState(0);
  const family = FAMILIES[selected];

  const { canvasRef, aspect } = useFigureCanvas(
    (ctx, { width, height }) => {
      const pad = width < 520 ? 10 : 16;
      const well = box(pad, 8, width - pad * 2, height - 16);
      fillRoundRect(ctx, well, fade(colors['surface-sunk'], 0.4), 14);
      frame(ctx, well, colors.border, 14);

      const narrow = width < 560;
      const headerH = 36;
      const railH = 22;
      const barBlock = 38;
      const tokenW = narrow ? 42 : 56;
      const plusR = narrow ? 9 : 12;
      const cardY = well.y + headerH + railH;
      const cardH = Math.max(40, Math.min(narrow ? 52 : 64, well.h - headerH - railH - barBlock - 8));
      const tokenH = Math.min(52, cardH - 2);
      const railY = well.y + headerH + 6;
      const barY = well.y + well.h - 30;

      label(ctx, family.name, well.x + 14, well.y + 18, colors.ink, { size: 11, weight: '650' });
      label(ctx, `axis · ${family.axis}`, well.x + 14, well.y + 32, colors.faint, { size: 10 });
      label(ctx, family.metric, well.x + well.w - 14, well.y + 18, colors['accent-deep'], {
        size: 11,
        align: 'right',
        weight: '650',
      });

      const xBox = box(well.x + 14, cardY + (cardH - tokenH) / 2, tokenW, tokenH);
      const yBox = box(well.x + well.w - 14 - tokenW, cardY + (cardH - tokenH) / 2, tokenW, tokenH);
      const plusX = yBox.x - 12 - plusR;
      const plusY = xBox.y + xBox.h / 2;
      const fLeft = xBox.x + xBox.w + 12;
      const fRight = plusX - plusR - 12;
      const fArea = box(fLeft, cardY, Math.max(48, fRight - fLeft), cardH);

      polyline(
        ctx,
        [
          [xBox.x + xBox.w / 2, xBox.y],
          [xBox.x + xBox.w / 2, railY],
          [yBox.x + yBox.w / 2, railY],
          [yBox.x + yBox.w / 2, yBox.y],
        ],
        colors.kraft,
        2.2,
      );
      label(ctx, 'short route', (xBox.x + yBox.x + yBox.w) / 2, railY - 7, colors.kraft, {
        size: 9,
        align: 'center',
      });

      token(ctx, xBox, 'x', narrow ? `${STATE}ch` : `${RESOLUTION}²×${STATE}`, colors);
      token(ctx, yBox, 'y', narrow ? `${STATE}ch` : `${RESOLUTION}²×${STATE}`, colors, true);
      plus(ctx, plusX, plusY, plusR, colors.ink);
      polyline(ctx, [[plusX + plusR + 3, plusY], [yBox.x - 3, plusY]], fade(colors.ink, 0.4), 1.3);
      polyline(ctx, [[xBox.x + xBox.w + 3, plusY], [fArea.x - 2, plusY]], fade(colors.ink, 0.4), 1.3);
      polyline(ctx, [[fArea.x + fArea.w + 2, plusY], [plusX - plusR - 3, plusY]], fade(colors.ink, 0.4), 1.3);

      const kind = family.kind;
      const waist = kind === 'wide' ? WAIST * WIDE_K : WAIST;

      if (kind === 'resnext') {
        const lanes = narrow ? 4 : 6;
        const inset = 8;
        const bundle = box(fArea.x + 2, fArea.y + 2, fArea.w - 4, fArea.h - 4);
        fillRoundRect(ctx, bundle, fade(colors.accent, 0.08), 8);
        frame(ctx, bundle, fade(colors.accent, 0.45), 8);
        const laneH = Math.min(7, (bundle.h - inset * 2) / (lanes * 1.65));
        const totalH = lanes * laneH + (lanes - 1) * laneH * 0.65;
        const top = bundle.y + (bundle.h - totalH) / 2;
        for (let i = 0; i < lanes; i += 1) {
          fillRoundRect(
            ctx,
            box(bundle.x + inset, top + i * laneH * 1.65, bundle.w - inset * 2, laneH),
            fade(colors.accent, 0.45),
            2,
          );
        }
      } else {
        const n = kind === 'se' ? 4 : 3;
        const gap = Math.max(5, Math.min(10, fArea.w * 0.035));
        const w = (fArea.w - gap * (n - 1)) / n;
        const titles = kind === 'se' ? ['1×1', '3×3', '1×1', 'SE'] : ['1×1', '3×3', '1×1'];
        const subs =
          kind === 'se'
            ? [`${STATE}→${waist}`, `${waist}`, `${waist}→${STATE}`, `r=${SE_REDUCTION}`]
            : kind === 'v2'
              ? ['BN·ReLU', 'BN·ReLU', 'BN·ReLU']
              : [`${STATE}→${waist}`, `${waist}`, `${waist}→${STATE}`];
        titles.forEach((title, i) => {
          const b = box(fArea.x + i * (w + gap), fArea.y, w, fArea.h);
          const lit = (kind === 'wide' && i === 1) || (kind === 'se' && i === 3) || kind === 'v2';
          stage(ctx, b, title, subs[i], colors, lit);
          if (i < titles.length - 1) {
            polyline(
              ctx,
              [
                [b.x + b.w + 1, plusY],
                [b.x + b.w + gap - 1, plusY],
              ],
              fade(colors.ink, 0.3),
              1.1,
            );
          }
        });
        if (kind === 'v2') {
          label(ctx, 'linear add', plusX, plusY + plusR + 11, colors.accent, { size: 8, align: 'center' });
        }
      }

      if (fArea.y + fArea.h + 18 < barY - 10) {
        label(ctx, 'learned update  F', fArea.x + fArea.w / 2, fArea.y + fArea.h + 12, colors.muted, {
          size: 9,
          align: 'center',
        });
      }

      const bar = box(well.x + 14, barY, well.w - 28, 16);
      fillRoundRect(ctx, bar, fade(colors.border, 0.5), 4);
      const peak = Math.max(...FAMILIES.map((item) => item.params));
      fillRoundRect(ctx, box(bar.x, bar.y, Math.max(8, (family.params / peak) * bar.w), bar.h), fade(colors.accent, 0.78), 4);
      const mark = bar.x + (BASELINE / peak) * bar.w;
      ctx.beginPath();
      ctx.moveTo(mark, bar.y - 2);
      ctx.lineTo(mark, bar.y + bar.h + 2);
      ctx.strokeStyle = fade(colors.ink, 0.32);
      ctx.lineWidth = 1;
      ctx.setLineDash([2, 3]);
      ctx.stroke();
      ctx.setLineDash([]);
      label(ctx, `parameters vs the ${compact(BASELINE)} bottleneck`, bar.x, bar.y - 6, colors.muted, { size: 9 });
      label(ctx, `${compact(family.params)}  ·  ${(family.params / BASELINE).toFixed(2)}×`, bar.x + bar.w, bar.y - 6, colors.faint, {
        size: 9,
        align: 'right',
      });
    },
    { aspect: 1.88, animate: false },
  );

  return (
    <FigureBody>
      <Canvas
        canvasRef={canvasRef}
        aspect={aspect}
        label={`A residual block specimen. ${family.name} changes ${family.axis}: ${family.idea}.`}
      />
      <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5" role="group" aria-label="Residual family">
        {FAMILIES.map((entry, i) => {
          const on = i === selected;
          return (
            <button
              key={entry.kind}
              type="button"
              aria-pressed={on}
              onClick={() => setSelected(i)}
              className={`rounded-lg border px-2.5 py-2 text-left transition-colors ${
                on ? 'border-accent/50 bg-accent/10' : 'border-line bg-sunk/50 hover:border-line-strong'
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
        <Readout label="this block" value={family.metric} hint={family.metricHint} />
      </div>
    </FigureBody>
  );
}
