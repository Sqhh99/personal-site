import { useMemo, useState } from 'react';
import { useFigureCanvas } from '@figures/useFigureCanvas';
import { fade, useThemeColors } from '@figures/useThemeColors';
import { Canvas, FigureBody, Panel, Readout, Slider } from '@figures/controls';
import { box, fillRoundRect, frame, label, polyline } from '@figures/plot';

const GRID = 14;

export default function AttentionGate() {
  const colors = useThemeColors();
  const [gateX, setGateX] = useState(0.66);
  const [gateY, setGateY] = useState(0.42);
  const [strength, setStrength] = useState(5);

  const weights = useMemo(() => {
    const values: number[] = [];
    for (let y = 0; y < GRID; y += 1) {
      for (let x = 0; x < GRID; x += 1) {
        const u = (x + 0.5) / GRID;
        const v = (y + 0.5) / GRID;
        const feature = 0.55 * Math.exp(-((u - 0.28) ** 2 + (v - 0.68) ** 2) / 0.035)
          + 0.85 * Math.exp(-((u - 0.68) ** 2 + (v - 0.4) ** 2) / 0.026);
        const context = Math.exp(-((u - gateX) ** 2 + (v - gateY) ** 2) / 0.075);
        values.push(1 / (1 + Math.exp(-strength * (feature + context - 0.85))));
      }
    }
    return values;
  }, [gateX, gateY, strength]);

  const mean = weights.reduce((sum, v) => sum + v, 0) / weights.length;
  const active = weights.filter((v) => v > 0.5).length / weights.length;

  const { canvasRef, aspect } = useFigureCanvas(
    (ctx, { width, height }) => {
      const pad = 18;
      const mapSize = Math.min(height - pad * 2, width * 0.54);
      const map = box(pad, pad, mapSize, mapSize);
      const cell = mapSize / GRID;

      for (let y = 0; y < GRID; y += 1) {
        for (let x = 0; x < GRID; x += 1) {
          const a = weights[y * GRID + x];
          const b = box(map.x + x * cell + 0.5, map.y + y * cell + 0.5, cell - 1, cell - 1);
          fillRoundRect(ctx, b, fade(a > 0.5 ? colors.accent : colors['surface-sunk'], 0.2 + 0.72 * a), 2);
        }
      }
      frame(ctx, map, colors.border, 8);
      const gx = map.x + gateX * map.w;
      const gy = map.y + gateY * map.h;
      polyline(ctx, [[gx - 8, gy], [gx + 8, gy]], colors.ink, 1.4);
      polyline(ctx, [[gx, gy - 8], [gx, gy + 8]], colors.ink, 1.4);

      const flowX = map.x + map.w + 28;
      const nodeW = width - flowX - pad;
      const nodes = [
        { y: pad + 8, text: 'encoder feature x' },
        { y: height * 0.39, text: 'decoder context g' },
        { y: height * 0.69, text: 'sigmoid α' },
      ];
      nodes.forEach((n, i) => {
        const b = box(flowX, n.y, nodeW, 36);
        fillRoundRect(ctx, b, i === 2 ? fade(colors.accent, 0.15) : fade(colors['surface-sunk'], 0.72), 8);
        frame(ctx, b, i === 2 ? colors.accent : colors.border, 8);
        label(ctx, n.text, b.x + b.w / 2, b.y + b.h / 2, i === 2 ? colors['accent-deep'] : colors.ink, {
          size: 9,
          align: 'center',
          baseline: 'middle',
        });
      });
      polyline(ctx, [[flowX + nodeW / 2, nodes[0].y + 36], [flowX + nodeW / 2, nodes[2].y]], fade(colors.kraft, 0.7), 1.5);
      polyline(ctx, [[flowX + nodeW / 2, nodes[1].y + 36], [flowX + nodeW / 2, nodes[2].y]], fade(colors.kraft, 0.7), 1.5);
      label(ctx, 'α ⊙ x → decoder', flowX + nodeW / 2, height - 11, colors.muted, { size: 10, align: 'center' });
    },
    { aspect: 1.72, animate: false },
  );

  return (
    <FigureBody>
      <Canvas
        canvasRef={canvasRef}
        aspect={aspect}
        label="A computed spatial attention gate combining encoder features and decoder context into per-pixel weights."
      />
      <Panel columns={3}>
        <Slider label="gate x" value={gateX} min={0.05} max={0.95} format={(v) => v.toFixed(2)} onChange={setGateX} />
        <Slider label="gate y" value={gateY} min={0.05} max={0.95} format={(v) => v.toFixed(2)} onChange={setGateY} />
        <Slider label="gate sharpness" value={strength} min={1} max={12} format={(v) => v.toFixed(1)} onChange={setStrength} />
      </Panel>
      <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
        <Readout label="mean attention" value={mean.toFixed(3)} />
        <Readout label="area passed" value={`${(active * 100).toFixed(1)}%`} hint="α > 0.5" />
        <Readout label="attended object" value={gateX > 0.48 ? 'right-hand region' : 'left-hand region'} />
      </div>
    </FigureBody>
  );
}
