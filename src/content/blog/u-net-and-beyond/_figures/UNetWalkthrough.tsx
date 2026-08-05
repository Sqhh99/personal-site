import { useRef, useState } from 'react';
import { useFigureCanvas } from '@figures/useFigureCanvas';
import { fade, useThemeColors } from '@figures/useThemeColors';
import { Canvas, FigureBody, Panel, Readout, Slider, Toggle } from '@figures/controls';
import { box, fillRoundRect, frame, label, polyline } from '@figures/plot';

/**
 * The U, costed. Receptive field, parameters and activation memory are all
 * computed from the stage list rather than annotated onto it, so the two things
 * the diagram usually hides become visible: how far the field has to travel
 * before it covers the input, and how badly the shallow stages dominate memory.
 *
 * Receptive field arithmetic, per operation of kernel k and stride s:
 *   rf += (k - 1) · jump ;  jump *= s
 */

type Kind = 'encoder' | 'bottleneck' | 'decoder';

interface Stage {
  name: string;
  kind: Kind;
  /** Depth in the U, 0 at full resolution. */
  level: number;
  size: number;
  channels: number;
  params: number;
  /** Bytes held for the two convolution outputs at fp32, batch of one. */
  activation: number;
  receptive: number;
  detail: string;
}

const IN_CHANNELS = 1;
const CLASSES = 2;

function buildStages(levels: number, base: number, inputSize: number): Stage[] {
  const stages: Stage[] = [];
  let rf = 1;
  let jump = 1;
  const conv3 = () => {
    rf += 2 * jump;
  };
  const pool2 = () => {
    rf += jump;
    jump *= 2;
  };

  for (let i = 0; i < levels; i += 1) {
    const size = inputSize / 2 ** i;
    const channels = base * 2 ** i;
    const cIn = i === 0 ? IN_CHANNELS : base * 2 ** (i - 1);
    conv3();
    conv3();
    stages.push({
      name: `E${i + 1}`,
      kind: 'encoder',
      level: i,
      size,
      channels,
      params: 9 * cIn * channels + 9 * channels * channels,
      activation: 2 * channels * size * size * 4,
      receptive: rf,
      detail: 'two 3×3 convolutions',
    });
    pool2();
  }

  const bottleneckSize = inputSize / 2 ** levels;
  const bottleneckChannels = base * 2 ** levels;
  conv3();
  conv3();
  const bottleneckRf = rf;
  stages.push({
    name: 'bottom',
    kind: 'bottleneck',
    level: levels,
    size: bottleneckSize,
    channels: bottleneckChannels,
    params: 9 * (bottleneckChannels / 2) * bottleneckChannels + 9 * bottleneckChannels * bottleneckChannels,
    activation: 2 * bottleneckChannels * bottleneckSize * bottleneckSize * 4,
    receptive: bottleneckRf,
    detail: 'widest, coarsest features',
  });

  for (let i = levels - 1; i >= 0; i -= 1) {
    const size = inputSize / 2 ** i;
    const channels = base * 2 ** i;
    const below = base * 2 ** (i + 1);
    // 2×2 up-convolution, then two 3×3 convolutions over the concatenation.
    const params = 4 * below * channels + 9 * (2 * channels) * channels + 9 * channels * channels;
    stages.push({
      name: `D${levels - i}`,
      kind: 'decoder',
      level: i,
      size,
      channels,
      params: params + (i === 0 ? channels * CLASSES : 0),
      activation: 2 * channels * size * size * 4,
      receptive: bottleneckRf,
      detail: i === 0 ? 'fuse, then 1×1 to classes' : 'up-convolve, concatenate, fuse',
    });
  }

  return stages;
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

export default function UNetWalkthrough() {
  const colors = useThemeColors();
  const [levels, setLevels] = useState(4);
  const [base, setBase] = useState(32);
  const [inputSize, setInputSize] = useState(256);
  const [showSkips, setShowSkips] = useState(true);
  const [selected, setSelected] = useState(0);
  const hitRef = useRef<Array<{ x: number; y: number; w: number; h: number }>>([]);

  const stages = buildStages(levels, base, inputSize);
  const picked = stages[Math.min(selected, stages.length - 1)];
  const totalParams = stages.reduce((sum, s) => sum + s.params, 0);
  const totalActivation = stages.reduce((sum, s) => sum + s.activation, 0);
  const peakStage = stages.reduce((best, s) => (s.activation > best.activation ? s : best), stages[0]);
  const bottleneck = stages.find((s) => s.kind === 'bottleneck')!;
  const coverage = bottleneck.receptive / inputSize;

  const choose = (clientX: number, clientY: number, canvas: HTMLCanvasElement) => {
    const rect = canvas.getBoundingClientRect();
    const x = clientX - rect.left;
    const y = clientY - rect.top;
    const index = hitRef.current.findIndex((b) => x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h);
    if (index >= 0) setSelected(index);
  };

  const { canvasRef, aspect } = useFigureCanvas(
    (ctx, { width, height }) => {
      const pad = 16;
      const n = stages.length;
      const diagramH = height * 0.62;
      const gap = Math.max(4, Math.min(10, width * 0.011));
      const cardW = (width - pad * 2 - gap * (n - 1)) / n;
      const cardH = Math.min(58, diagramH * 0.3);
      const rowH = (diagramH - cardH - 26) / levels;

      const boxes = stages.map((stage, i) =>
        box(pad + i * (cardW + gap), 22 + stage.level * rowH, cardW, cardH),
      );
      hitRef.current = boxes;

      for (let i = 0; i < boxes.length - 1; i += 1) {
        const a = boxes[i];
        const b = boxes[i + 1];
        polyline(ctx, [[a.x + a.w, a.y + a.h / 2], [b.x, b.y + b.h / 2]], fade(colors.ink, 0.42), 1.4);
      }

      if (showSkips) {
        for (let i = 0; i < levels; i += 1) {
          const from = boxes[i];
          const to = boxes[boxes.length - 1 - i];
          const railY = Math.max(8, Math.min(from.y, to.y) - 12 - i * 3);
          const lit = i === selected || boxes.length - 1 - i === selected;
          polyline(
            ctx,
            [
              [from.x + from.w / 2, from.y],
              [from.x + from.w / 2, railY],
              [to.x + to.w / 2, railY],
              [to.x + to.w / 2, to.y],
            ],
            lit ? colors.accent : fade(colors.kraft, 0.5),
            lit ? 2.3 : 1.2,
          );
        }
      }

      boxes.forEach((b, i) => {
        const active = i === selected;
        fillRoundRect(ctx, b, active ? fade(colors.accent, 0.17) : fade(colors['surface-sunk'], 0.78), 7);
        frame(ctx, b, active ? colors.accent : colors.border, 7);
        label(ctx, stages[i].name, b.x + b.w / 2, b.y + 17, active ? colors['accent-deep'] : colors.ink, {
          size: 9,
          align: 'center',
          weight: '650',
        });
        label(ctx, `${stages[i].size}²`, b.x + b.w / 2, b.y + 33, colors.muted, { size: 8, align: 'center' });
        label(ctx, `${stages[i].channels}c`, b.x + b.w / 2, b.y + 47, colors.faint, { size: 8, align: 'center' });
      });

      // Activation memory. The shape of this row is the point of the figure.
      const barTop = diagramH + 20;
      const barH = height - barTop - 24;
      const barArea = box(pad, barTop, width - pad * 2, barH);
      const peak = peakStage.activation;
      stages.forEach((stage, i) => {
        const h = (stage.activation / peak) * barArea.h;
        const b = box(boxes[i].x, barArea.y + barArea.h - h, cardW, h);
        fillRoundRect(ctx, b, i === selected ? fade(colors.accent, 0.75) : fade(colors.kraft, 0.45), 3);
      });
      label(ctx, 'activation memory per stage, fp32, batch of one', barArea.x, barArea.y - 6, colors.muted, {
        size: 10,
      });
      label(ctx, bytes(peak), barArea.x + barArea.w, barArea.y - 6, colors.faint, { size: 9, align: 'right' });
      label(ctx, 'tap a stage', pad, height - 7, colors.faint, { size: 9 });
      label(
        ctx,
        `receptive field ${bottleneck.receptive} px at the bottom · input ${inputSize}²`,
        width - pad,
        height - 7,
        colors.muted,
        { size: 9, align: 'right' },
      );
    },
    { aspect: 1.9, animate: false },
  );

  return (
    <FigureBody>
      <Canvas
        canvasRef={canvasRef}
        aspect={aspect}
        label="A U-shaped encoder-decoder with lateral skips, above a bar chart of the activation memory each stage holds."
        className="cursor-pointer"
        onPointerDown={(e) => choose(e.clientX, e.clientY, e.currentTarget)}
        onPointerMove={(e) => {
          if (e.pointerType === 'mouse') choose(e.clientX, e.clientY, e.currentTarget);
        }}
      />
      <Panel columns={3}>
        <Slider
          label="resolution levels"
          value={levels}
          min={2}
          max={5}
          step={1}
          format={(v) => String(v)}
          onChange={(v) => {
            setLevels(v);
            setSelected(0);
          }}
        />
        <Slider label="base channels" value={base} min={16} max={64} step={16} format={(v) => String(v)} onChange={setBase} />
        <Slider
          label="input size"
          value={inputSize}
          min={128}
          max={512}
          step={128}
          format={(v) => `${v}²`}
          onChange={setInputSize}
        />
      </Panel>
      <div className="mt-4">
        <Toggle label="lateral skips" checked={showSkips} onChange={setShowSkips} />
      </div>
      <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Readout label="selected stage" value={`${picked.size}² × ${picked.channels}`} hint={picked.detail} />
        <Readout
          label="receptive field"
          value={`${picked.receptive} px`}
          hint={picked.kind === 'decoder' ? 'inherited through the bottom' : `${((picked.receptive / inputSize) * 100).toFixed(0)}% of the input`}
        />
        <Readout label="parameters" value={compact(totalParams)} hint={`this stage ${compact(picked.params)}`} />
        <Readout
          label="activations held"
          value={bytes(totalActivation)}
          hint={`peak stage ${peakStage.name}, ${((peakStage.activation / totalActivation) * 100).toFixed(0)}%`}
        />
      </div>
      <p className="mt-3 font-mono text-[0.65rem] leading-relaxed text-faint">
        bottom-level receptive field covers {(coverage * 100).toFixed(0)}% of the input edge
      </p>
    </FigureBody>
  );
}
