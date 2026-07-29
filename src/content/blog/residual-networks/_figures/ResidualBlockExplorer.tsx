import { useRef, useState } from 'react';
import { useFigureCanvas } from '@figures/useFigureCanvas';
import { fade, useThemeColors } from '@figures/useThemeColors';
import { Canvas, FigureBody, Panel, Readout, SegmentedControl, Slider, Toggle } from '@figures/controls';
import { box, fillRoundRect, frame, label, polyline } from '@figures/plot';

type Kind = 'basic' | 'bottleneck';
type Stage = { name: string; op: string; channels: number };

export default function ResidualBlockExplorer() {
  const colors = useThemeColors();
  const [kind, setKind] = useState<Kind>('basic');
  const [channels, setChannels] = useState(64);
  const [projection, setProjection] = useState(false);
  const [active, setActive] = useState(0);
  const hitRef = useRef<Array<{ x: number; y: number; w: number; h: number }>>([]);

  const stages: Stage[] =
    kind === 'basic'
      ? [
          { name: 'input', op: 'identity', channels },
          { name: '3×3', op: 'conv · BN · ReLU', channels },
          { name: '3×3', op: 'conv · BN', channels },
          { name: 'sum', op: 'add · ReLU', channels },
        ]
      : [
          { name: 'input', op: 'identity', channels },
          { name: '1×1', op: 'reduce · BN · ReLU', channels: Math.max(8, channels / 4) },
          { name: '3×3', op: 'spatial · BN · ReLU', channels: Math.max(8, channels / 4) },
          { name: '1×1', op: 'expand · BN', channels },
          { name: 'sum', op: 'add · ReLU', channels },
        ];

  const handlePointer = (clientX: number, clientY: number, canvas: HTMLCanvasElement) => {
    const rect = canvas.getBoundingClientRect();
    const x = clientX - rect.left;
    const y = clientY - rect.top;
    const found = hitRef.current.findIndex((b) => x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h);
    if (found >= 0) setActive(found);
  };

  const { canvasRef, aspect } = useFigureCanvas(
    (ctx, { width, height }) => {
      const pad = 20;
      const gap = 12;
      const mainY = height * 0.31;
      const cardH = Math.min(66, height * 0.27);
      const cardW = (width - pad * 2 - gap * (stages.length - 1)) / stages.length;
      const boxes = stages.map((_, i) => box(pad + i * (cardW + gap), mainY, cardW, cardH));
      hitRef.current = boxes;

      for (let i = 0; i < boxes.length - 1; i += 1) {
        const a = boxes[i];
        const b = boxes[i + 1];
        polyline(ctx, [[a.x + a.w, a.y + a.h / 2], [b.x, b.y + b.h / 2]], fade(colors.ink, 0.45), 1.5);
      }

      boxes.forEach((b, i) => {
        fillRoundRect(ctx, b, i === active ? fade(colors.accent, 0.16) : fade(colors['surface-sunk'], 0.72), 9);
        frame(ctx, b, i === active ? colors.accent : colors.border, 9);
        label(ctx, stages[i].name, b.x + b.w / 2, b.y + 20, i === active ? colors['accent-deep'] : colors.ink, {
          size: 11,
          align: 'center',
          weight: '650',
        });
        label(ctx, `${stages[i].channels} ch`, b.x + b.w / 2, b.y + 42, colors.muted, {
          size: 9,
          align: 'center',
        });
      });

      const start = boxes[0];
      const end = boxes[boxes.length - 1];
      const skipY = mainY - 40;
      const shortcutColor = active === 0 || active === boxes.length - 1 ? colors.accent : fade(colors.kraft, 0.9);
      polyline(
        ctx,
        [
          [start.x + start.w / 2, start.y],
          [start.x + start.w / 2, skipY],
          [end.x + end.w / 2, skipY],
          [end.x + end.w / 2, end.y],
        ],
        shortcutColor,
        2.4,
      );
      label(
        ctx,
        projection ? 'shortcut: 1×1 projection' : 'shortcut: identity',
        (start.x + end.x + end.w) / 2,
        skipY - 8,
        shortcutColor,
        { size: 10, align: 'center' },
      );
      label(ctx, 'hover or tap a stage', pad, height - 16, colors.faint, { size: 10 });
      label(ctx, `${kind === 'basic' ? 'basic block' : 'bottleneck'} · 56×56 spatial`, width - pad, height - 16, colors.muted, {
        size: 10,
        align: 'right',
      });
    },
    { aspect: 2.05, animate: false },
  );

  const chosen = stages[Math.min(active, stages.length - 1)];

  return (
    <FigureBody>
      <Canvas
        canvasRef={canvasRef}
        aspect={aspect}
        label="An interactive residual block showing operations, tensor channels, and the shortcut path."
        className="cursor-pointer"
        onPointerMove={(e) => handlePointer(e.clientX, e.clientY, e.currentTarget)}
        onPointerDown={(e) => handlePointer(e.clientX, e.clientY, e.currentTarget)}
      />
      <Panel columns={2}>
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
        <Slider label="output channels" value={channels} min={32} max={256} step={32} format={(v) => String(v)} onChange={setChannels} />
      </Panel>
      <div className="mt-4 flex flex-wrap items-center gap-3">
        <Toggle label="projection shortcut" checked={projection} onChange={setProjection} />
      </div>
      <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
        <Readout label="selected stage" value={chosen.name} hint={chosen.op} />
        <Readout label="tensor" value={`56 × 56 × ${chosen.channels}`} />
        <Readout label="shortcut" value={projection ? 'learned 1×1' : 'parameter-free'} />
      </div>
    </FigureBody>
  );
}
