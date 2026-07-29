import { useRef, useState } from 'react';
import { useFigureCanvas } from '@figures/useFigureCanvas';
import { fade, useThemeColors } from '@figures/useThemeColors';
import { Canvas, FigureBody, Panel, Readout, Slider, Toggle } from '@figures/controls';
import { box, fillRoundRect, frame, label, polyline } from '@figures/plot';

type Stage = { name: string; side: number; channels: number; kind: 'encoder' | 'bottleneck' | 'decoder' };

export default function UNetWalkthrough() {
  const colors = useThemeColors();
  const [levels, setLevels] = useState(4);
  const [baseChannels, setBaseChannels] = useState(32);
  const [showSkips, setShowSkips] = useState(true);
  const [selected, setSelected] = useState(0);
  const hitRef = useRef<Array<{ x: number; y: number; w: number; h: number }>>([]);

  const encoders: Stage[] = Array.from({ length: levels }, (_, i) => ({
    name: `encoder ${i + 1}`,
    side: 256 / 2 ** i,
    channels: baseChannels * 2 ** i,
    kind: 'encoder',
  }));
  const bottleneck: Stage = {
    name: 'bottleneck',
    side: 256 / 2 ** levels,
    channels: baseChannels * 2 ** levels,
    kind: 'bottleneck',
  };
  const decoders: Stage[] = Array.from({ length: levels }, (_, i) => {
    const scale = levels - 1 - i;
    return {
      name: `decoder ${i + 1}`,
      side: 256 / 2 ** scale,
      channels: baseChannels * 2 ** scale,
      kind: 'decoder',
    };
  });
  const stages = [...encoders, bottleneck, ...decoders];
  const picked = stages[Math.min(selected, stages.length - 1)];

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
      const gap = Math.max(5, Math.min(11, width * 0.012));
      const cardW = (width - pad * 2 - gap * (n - 1)) / n;
      const cardH = Math.min(64, height * 0.24);
      const maxLevel = levels;
      const boxes = stages.map((stage, i) => {
        const level = stage.kind === 'encoder' ? i : stage.kind === 'bottleneck' ? maxLevel : maxLevel - 1 - (i - levels - 1);
        return box(pad + i * (cardW + gap), 24 + level * ((height - cardH - 58) / maxLevel), cardW, cardH);
      });
      hitRef.current = boxes;

      for (let i = 0; i < boxes.length - 1; i += 1) {
        const a = boxes[i];
        const b = boxes[i + 1];
        polyline(ctx, [[a.x + a.w, a.y + a.h / 2], [b.x, b.y + b.h / 2]], fade(colors.ink, 0.45), 1.5);
      }

      if (showSkips) {
        for (let i = 0; i < levels; i += 1) {
          const from = boxes[i];
          const to = boxes[boxes.length - 1 - i];
          const y = Math.max(10, Math.min(from.y, to.y) - 13 - i * 3);
          polyline(
            ctx,
            [
              [from.x + from.w / 2, from.y],
              [from.x + from.w / 2, y],
              [to.x + to.w / 2, y],
              [to.x + to.w / 2, to.y],
            ],
            i === selected || boxes.length - 1 - i === selected ? colors.accent : fade(colors.kraft, 0.5),
            i === selected || boxes.length - 1 - i === selected ? 2.3 : 1.2,
          );
        }
      }

      boxes.forEach((b, i) => {
        const active = i === selected;
        fillRoundRect(ctx, b, active ? fade(colors.accent, 0.17) : fade(colors['surface-sunk'], 0.78), 7);
        frame(ctx, b, active ? colors.accent : colors.border, 7);
        const stage = stages[i];
        label(ctx, stage.kind === 'bottleneck' ? 'bottom' : stage.kind === 'encoder' ? `E${i + 1}` : `D${i - levels}`, b.x + b.w / 2, b.y + 18, active ? colors['accent-deep'] : colors.ink, {
          size: 9,
          align: 'center',
          weight: '650',
        });
        label(ctx, `${stage.side}`, b.x + b.w / 2, b.y + 37, colors.muted, { size: 8, align: 'center' });
        label(ctx, `${stage.channels}c`, b.x + b.w / 2, b.y + 52, colors.faint, { size: 8, align: 'center' });
      });

      label(ctx, 'resolution', pad, height - 9, colors.faint, { size: 9 });
      label(ctx, '↓ contract', width * 0.28, height - 9, colors.muted, { size: 9, align: 'center' });
      label(ctx, 'expand ↑', width * 0.72, height - 9, colors.muted, { size: 9, align: 'center' });
    },
    { aspect: 1.82, animate: false },
  );

  return (
    <FigureBody>
      <Canvas
        canvasRef={canvasRef}
        aspect={aspect}
        label="A clickable U-shaped encoder-decoder with tensor resolution, channels, and lateral skip connections."
        className="cursor-pointer"
        onPointerDown={(e) => choose(e.clientX, e.clientY, e.currentTarget)}
        onPointerMove={(e) => {
          if (e.pointerType === 'mouse') choose(e.clientX, e.clientY, e.currentTarget);
        }}
      />
      <Panel columns={2}>
        <Slider
          label="resolution levels"
          value={levels}
          min={3}
          max={5}
          step={1}
          format={(v) => String(v)}
          onChange={(v) => {
            setLevels(v);
            setSelected(0);
          }}
        />
        <Slider
          label="base channels"
          value={baseChannels}
          min={16}
          max={64}
          step={16}
          format={(v) => String(v)}
          onChange={setBaseChannels}
        />
      </Panel>
      <div className="mt-4">
        <Toggle label="lateral skips" checked={showSkips} onChange={setShowSkips} />
      </div>
      <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
        <Readout label="selected" value={picked.name} hint={picked.kind} />
        <Readout label="spatial size" value={`${picked.side} × ${picked.side}`} />
        <Readout label="channels" value={String(picked.channels)} />
      </div>
    </FigureBody>
  );
}
