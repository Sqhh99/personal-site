import { useState } from 'react';
import { useFigureCanvas } from '@figures/useFigureCanvas';
import { fade, useThemeColors } from '@figures/useThemeColors';
import { Canvas, FigureBody, Panel, PlayPause, Readout, SegmentedControl, Slider } from '@figures/controls';
import { dot, label, polyline } from '@figures/plot';

type Mode = 'plain' | 'residual';

export default function GradientHighway() {
  const colors = useThemeColors();
  const [mode, setMode] = useState<Mode>('residual');
  const [depth, setDepth] = useState(12);
  const [jacobian, setJacobian] = useState(0.82);
  const [playing, setPlaying] = useState(true);
  const delivered = mode === 'plain' ? jacobian ** depth : (1 + 0.12 * (jacobian - 1)) ** depth;

  const { canvasRef, aspect } = useFigureCanvas(
    (ctx, { width, height, time }) => {
      const pad = 24;
      const y = height * 0.62;
      const x0 = pad;
      const x1 = width - pad;
      const step = (x1 - x0) / depth;
      const pulse = playing ? (time * 0.23) % 1 : 0.52;

      for (let i = 0; i < depth; i += 1) {
        const xa = x0 + i * step;
        const xb = x0 + (i + 1) * step;
        polyline(ctx, [[xa, y], [xb, y]], fade(colors.faint, 0.55), 1.3);
        dot(ctx, xa, y, Math.min(4.5, step * 0.18), fade(colors.ink, 0.72));
      }
      dot(ctx, x1, y, Math.min(4.5, step * 0.18), fade(colors.ink, 0.72));

      if (mode === 'residual') {
        const highwayY = height * 0.28;
        polyline(
          ctx,
          [
            [x0, y],
            [x0, highwayY],
            [x1, highwayY],
            [x1, y],
          ],
          fade(colors.accent, 0.8),
          2.4,
        );
        label(ctx, 'identity contribution', (x0 + x1) / 2, highwayY - 10, colors.accent, {
          size: 10,
          align: 'center',
        });
        const px = x1 - pulse * (x1 - x0);
        dot(ctx, px, highwayY, 5, colors.accent);
      }

      const plainX = x1 - pulse * (x1 - x0);
      const attenuation = mode === 'plain' ? Math.max(0.18, delivered) : 0.55;
      dot(ctx, plainX, y, 3 + 3 * attenuation, mode === 'plain' ? colors.kraft : fade(colors.kraft, 0.75));
      label(ctx, 'loss / output', x1, y + 22, colors.muted, { size: 10, align: 'right' });
      label(ctx, 'early layer', x0, y + 22, colors.muted, { size: 10 });
      label(ctx, 'backward →', x1, height - 12, colors.faint, { size: 10, align: 'right' });
    },
    { aspect: 2.15, animate: playing },
  );

  return (
    <FigureBody>
      <Canvas
        canvasRef={canvasRef}
        aspect={aspect}
        label="An animated backward gradient pulse through a plain chain or a residual identity path."
      />
      <Panel columns={3}>
        <SegmentedControl
          label="network"
          value={mode}
          options={[
            { value: 'plain', label: 'plain' },
            { value: 'residual', label: 'residual' },
          ]}
          onChange={setMode}
        />
        <Slider label="blocks" value={depth} min={4} max={32} step={1} format={(v) => String(v)} onChange={setDepth} />
        <Slider label="local derivative" value={jacobian} min={0.65} max={1.05} format={(v) => v.toFixed(2)} onChange={setJacobian} />
      </Panel>
      <div className="mt-4 flex items-center gap-3">
        <PlayPause playing={playing} onChange={setPlaying} />
      </div>
      <div className="mt-4 grid grid-cols-2 gap-3">
        <Readout label="toy gradient reaching first block" value={delivered.toExponential(2)} />
        <Readout
          label="path arithmetic"
          value={mode === 'plain' ? 'product of derivatives' : 'identity + residual terms'}
          hint="schematic scalar approximation"
        />
      </div>
    </FigureBody>
  );
}
