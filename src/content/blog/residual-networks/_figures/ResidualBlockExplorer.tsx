import { useRef, useState } from 'react';
import { useFigureCanvas } from '@figures/useFigureCanvas';
import { fade, useThemeColors } from '@figures/useThemeColors';
import { Canvas, FigureBody, Panel, Readout, SegmentedControl, Slider, Toggle } from '@figures/controls';
import { box, fillRoundRect, frame, label, polyline } from '@figures/plot';

/**
 * The block's cost, counted rather than asserted. Every parameter and multiply
 * on screen comes from the convolution arithmetic below, so changing the width
 * or crossing a stage boundary moves the bars for the reason the article gives.
 *
 * Stride sits on the 3×3 convolution, matching torchvision's ResNet rather than
 * the 2015 paper's stride-on-the-first-1×1.
 */

type Kind = 'basic' | 'bottleneck';

interface Stage {
  name: string;
  detail: string;
  /** Weights plus the batch-norm scale and shift that follow them. */
  params: number;
  /** Multiply–accumulates, counted at the resolution the convolution writes. */
  macs: number;
  channels: number;
  size: number;
}

function conv(kernel: number, cIn: number, cOut: number, outSize: number, name: string, detail: string): Stage {
  return {
    name,
    detail,
    params: kernel * kernel * cIn * cOut + 2 * cOut,
    macs: kernel * kernel * cIn * cOut * outSize * outSize,
    channels: cOut,
    size: outSize,
  };
}

function branchFor(kind: Kind, channels: number, size: number, downsample: boolean): Stage[] {
  const outSize = downsample ? size / 2 : size;
  const cIn = downsample ? channels / 2 : channels;
  const stride = downsample ? 2 : 1;

  if (kind === 'basic') {
    return [
      conv(3, cIn, channels, outSize, '3×3', `conv · BN · ReLU · stride ${stride}`),
      conv(3, channels, channels, outSize, '3×3', 'conv · BN'),
    ];
  }
  const waist = Math.max(8, channels / 4);
  return [
    conv(1, cIn, waist, size, '1×1', 'reduce · BN · ReLU'),
    conv(3, waist, waist, outSize, '3×3', `spatial · BN · ReLU · stride ${stride}`),
    conv(1, waist, channels, outSize, '1×1', 'expand · BN'),
  ];
}

/** A shortcut is only free while the shapes already match. */
function shortcutFor(channels: number, size: number, downsample: boolean): Stage | null {
  if (!downsample) return null;
  const outSize = size / 2;
  const cIn = channels / 2;
  return {
    ...conv(1, cIn, channels, outSize, 'shortcut', 'projection 1×1 · BN · stride 2'),
  };
}

function compact(value: number, unit = ''): string {
  if (value >= 1e9) return `${(value / 1e9).toFixed(2)}G${unit}`;
  if (value >= 1e6) return `${(value / 1e6).toFixed(2)}M${unit}`;
  if (value >= 1e3) return `${(value / 1e3).toFixed(1)}k${unit}`;
  return `${Math.round(value)}${unit}`;
}

export default function ResidualBlockExplorer() {
  const colors = useThemeColors();
  const [kind, setKind] = useState<Kind>('bottleneck');
  const [channels, setChannels] = useState(256);
  const [size, setSize] = useState(56);
  const [downsample, setDownsample] = useState(false);
  const [active, setActive] = useState(1);
  const hitRef = useRef<Array<{ x: number; y: number; w: number; h: number }>>([]);

  const branch = branchFor(kind, channels, size, downsample);
  const shortcut = shortcutFor(channels, size, downsample);
  const stages = shortcut ? [...branch, shortcut] : branch;
  const totalParams = stages.reduce((sum, s) => sum + s.params, 0);
  const totalMacs = stages.reduce((sum, s) => sum + s.macs, 0);

  // The same block written the other way, for the comparison the article makes.
  const other: Kind = kind === 'basic' ? 'bottleneck' : 'basic';
  const otherMacs =
    branchFor(other, channels, size, downsample).reduce((sum, s) => sum + s.macs, 0) + (shortcut?.macs ?? 0);

  const pick = (clientX: number, clientY: number, canvas: HTMLCanvasElement) => {
    const rect = canvas.getBoundingClientRect();
    const x = clientX - rect.left;
    const y = clientY - rect.top;
    const index = hitRef.current.findIndex((b) => x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h);
    if (index >= 0) setActive(index);
  };

  const { canvasRef, aspect } = useFigureCanvas(
    (ctx, { width, height }) => {
      const pad = 18;
      const gap = 13;
      const diagramH = height * 0.56;
      const cardH = Math.min(60, diagramH * 0.42);
      const cardY = diagramH - cardH - 6;
      const cardW = (width - pad * 2 - gap * (branch.length - 1)) / branch.length;
      const boxes = branch.map((_, i) => box(pad + i * (cardW + gap), cardY, cardW, cardH));

      for (let i = 0; i < boxes.length - 1; i += 1) {
        const a = boxes[i];
        const b = boxes[i + 1];
        polyline(ctx, [[a.x + a.w, a.y + a.h / 2], [b.x, b.y + b.h / 2]], fade(colors.ink, 0.4), 1.5);
      }

      boxes.forEach((b, i) => {
        const selected = i === active;
        fillRoundRect(ctx, b, selected ? fade(colors.accent, 0.16) : fade(colors['surface-sunk'], 0.72), 9);
        frame(ctx, b, selected ? colors.accent : colors.border, 9);
        label(ctx, branch[i].name, b.x + b.w / 2, b.y + 19, selected ? colors['accent-deep'] : colors.ink, {
          size: 11,
          align: 'center',
          weight: '650',
        });
        label(ctx, `${branch[i].size}² × ${branch[i].channels}`, b.x + b.w / 2, b.y + 39, colors.muted, {
          size: 9,
          align: 'center',
        });
      });

      // The shortcut, drawn over the branch it bypasses.
      const first = boxes[0];
      const last = boxes[boxes.length - 1];
      const skipY = Math.max(14, cardY - 34);
      const shortcutColor = shortcut ? colors.kraft : colors.accent;
      polyline(
        ctx,
        [
          [first.x + first.w / 2, first.y],
          [first.x + first.w / 2, skipY],
          [last.x + last.w / 2, skipY],
          [last.x + last.w / 2, last.y],
        ],
        shortcutColor,
        2.4,
      );
      label(
        ctx,
        shortcut
          ? `shortcut: 1×1 projection, ${compact(shortcut.params)} params`
          : 'shortcut: identity, 0 params, 0 MACs',
        (first.x + last.x + last.w) / 2,
        skipY - 8,
        shortcutColor,
        { size: 10, align: 'center' },
      );

      // Where the multiplies actually go.
      const bar = box(pad, diagramH + 26, width - pad * 2, 26);
      fillRoundRect(ctx, bar, fade(colors['surface-sunk'], 0.6), 6);
      let cursor = bar.x;
      const segments = stages.map((stage, i) => {
        const w = (stage.macs / totalMacs) * bar.w;
        const seg = box(cursor, bar.y, Math.max(0, w), bar.h);
        const isShortcut = shortcut !== null && i === stages.length - 1;
        fillRoundRect(
          ctx,
          seg,
          i === active ? fade(colors.accent, 0.7) : fade(isShortcut ? colors.kraft : colors.accent, 0.28),
          4,
        );
        if (w > 34) {
          label(
            ctx,
            `${((stage.macs / totalMacs) * 100).toFixed(0)}%`,
            seg.x + seg.w / 2,
            seg.y + seg.h / 2,
            i === active ? colors.surface : colors.muted,
            { size: 9, align: 'center', baseline: 'middle' },
          );
        }
        cursor += w;
        return seg;
      });
      hitRef.current = shortcut ? [...boxes, segments[segments.length - 1]] : boxes;

      label(ctx, 'share of block multiply–accumulates', bar.x, bar.y - 7, colors.muted, { size: 10 });
      label(ctx, `${compact(totalMacs)} MACs total`, bar.x + bar.w, bar.y - 7, colors.faint, {
        size: 9,
        align: 'right',
      });
      label(ctx, 'hover or tap a stage', pad, height - 8, colors.faint, { size: 9 });
      label(
        ctx,
        `${kind === 'basic' ? 'basic block' : 'bottleneck'} · ${size}² in · ${channels} out channels`,
        width - pad,
        height - 8,
        colors.muted,
        { size: 9, align: 'right' },
      );
    },
    { aspect: 1.95, animate: false },
  );

  const chosen = stages[Math.min(active, stages.length - 1)];

  return (
    <FigureBody>
      <Canvas
        canvasRef={canvasRef}
        aspect={aspect}
        label="A residual block with its stages, its shortcut, and a bar showing how the block's multiply-accumulates are distributed across those stages."
        className="cursor-pointer"
        onPointerMove={(e) => pick(e.clientX, e.clientY, e.currentTarget)}
        onPointerDown={(e) => pick(e.clientX, e.clientY, e.currentTarget)}
      />
      <Panel columns={3}>
        <SegmentedControl
          label="block"
          value={kind}
          options={[
            { value: 'basic', label: 'basic' },
            { value: 'bottleneck', label: 'bottleneck' },
          ]}
          onChange={(value) => {
            setKind(value);
            setActive(0);
          }}
        />
        <Slider
          label="output channels"
          value={channels}
          min={64}
          max={512}
          step={64}
          format={(v) => String(v)}
          onChange={setChannels}
        />
        <Slider
          label="input resolution"
          value={size}
          min={14}
          max={56}
          step={14}
          format={(v) => `${v}²`}
          onChange={setSize}
        />
      </Panel>
      <div className="mt-4">
        <Toggle
          label="stage boundary — stride 2, channels double"
          checked={downsample}
          onChange={(v) => {
            setDownsample(v);
            setActive(0);
          }}
        />
      </div>
      <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Readout label="selected stage" value={chosen.name} hint={chosen.detail} />
        <Readout label="block parameters" value={compact(totalParams)} />
        <Readout label="block MACs" value={compact(totalMacs)} />
        <Readout
          label={`${other} at same width`}
          value={`${(otherMacs / totalMacs).toFixed(2)}×`}
          hint="multiplies, equal output width"
        />
      </div>
    </FigureBody>
  );
}
