import { useMemo, useState } from 'react';
import { useFigureCanvas } from '@figures/useFigureCanvas';
import { fade, useThemeColors } from '@figures/useThemeColors';
import { Canvas, FigureBody, Panel, Readout, Slider, Toggle } from '@figures/controls';
import { box, bx, byUp, label, polyline } from '@figures/plot';

const N = 160;

function targetAt(u: number) {
  return (u > 0.13 && u < 0.32) || (u > 0.48 && u < 0.82) ? 1 : 0;
}

export default function SkipAblation() {
  const colors = useThemeColors();
  const [skips, setSkips] = useState(true);
  const [skipStrength, setSkipStrength] = useState(0.72);
  const [noise, setNoise] = useState(0.22);

  const data = useMemo(() => {
    const target = Array.from({ length: N }, (_, i) => targetAt(i / (N - 1)));
    const coarse = target.map((_, i) => {
      let sum = 0;
      let weight = 0;
      for (let j = 0; j < N; j += 1) {
        const d = (i - j) / (9 + noise * 30);
        const w = Math.exp(-0.5 * d * d);
        sum += target[j] * w;
        weight += w;
      }
      const drift = noise * 0.14 * Math.sin(i * 0.37 + 0.8);
      return Math.max(0, Math.min(1, sum / weight + drift));
    });
    const reconstruction = coarse.map((v, i) => {
      if (!skips) return v;
      const detail = target[i] - v;
      return Math.max(0, Math.min(1, v + skipStrength * detail));
    });
    const predicted = reconstruction.map((v) => (v >= 0.5 ? 1 : 0));
    let intersection = 0;
    let union = 0;
    let boundaryError = 0;
    for (let i = 0; i < N; i += 1) {
      intersection += predicted[i] && target[i] ? 1 : 0;
      union += predicted[i] || target[i] ? 1 : 0;
      if (i > 0) {
        const tEdge = Math.abs(target[i] - target[i - 1]);
        const pEdge = Math.abs(reconstruction[i] - reconstruction[i - 1]);
        boundaryError += Math.abs(tEdge - pEdge);
      }
    }
    return {
      target,
      coarse,
      reconstruction,
      iou: intersection / Math.max(1, union),
      boundary: Math.max(0, 1 - boundaryError / 8),
    };
  }, [noise, skipStrength, skips]);

  const { canvasRef, aspect } = useFigureCanvas(
    (ctx, { width, height }) => {
      const pad = 18;
      const gap = 18;
      const bandH = (height - pad * 2 - gap) / 2;
      const top = box(pad, pad, width - pad * 2, bandH);
      const bottom = box(pad, pad + bandH + gap, width - pad * 2, bandH);

      const drawSignal = (b: ReturnType<typeof box>, values: number[], color: string, lineWidth: number) => {
        polyline(
          ctx,
          values.map((v, i) => [bx(b, i / (N - 1)), byUp(b, v, 1.08)] as [number, number]),
          color,
          lineWidth,
        );
      };
      drawSignal(top, data.target, fade(colors.ink, 0.72), 1.5);
      drawSignal(top, data.coarse, colors.kraft, 2.2);
      drawSignal(bottom, data.target, fade(colors.faint, 0.5), 1.3);
      drawSignal(bottom, data.reconstruction, colors.accent, 2.6);

      const thresholdTop = byUp(top, 0.5, 1.08);
      const thresholdBottom = byUp(bottom, 0.5, 1.08);
      polyline(ctx, [[top.x, thresholdTop], [top.x + top.w, thresholdTop]], fade(colors.faint, 0.25), 1);
      polyline(ctx, [[bottom.x, thresholdBottom], [bottom.x + bottom.w, thresholdBottom]], fade(colors.faint, 0.25), 1);
      label(ctx, 'bottleneck reconstruction', top.x + 4, top.y + 12, colors.kraft, { size: 10 });
      label(ctx, skips ? 'decoder + high-resolution skip' : 'decoder without skip', bottom.x + 4, bottom.y + 12, colors.accent, {
        size: 10,
      });
      label(ctx, 'target', top.x + top.w, top.y + 12, colors.ink, { size: 10, align: 'right' });
    },
    { aspect: 1.72, animate: false },
  );

  return (
    <FigureBody>
      <Canvas
        canvasRef={canvasRef}
        aspect={aspect}
        label="A computed one-dimensional segmentation reconstructed with or without a high-resolution skip."
      />
      <Panel columns={2}>
        <Slider
          label="skip strength"
          value={skipStrength}
          min={0}
          max={1}
          format={(v) => v.toFixed(2)}
          onChange={setSkipStrength}
        />
        <Slider label="input noise" value={noise} min={0} max={0.7} format={(v) => v.toFixed(2)} onChange={setNoise} />
      </Panel>
      <div className="mt-4">
        <Toggle label="use encoder skip" checked={skips} onChange={setSkips} />
      </div>
      <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
        <Readout label="toy IoU" value={data.iou.toFixed(3)} />
        <Readout label="boundary recovery" value={`${(data.boundary * 100).toFixed(1)}%`} />
        <Readout label="detail route" value={skips ? 'high resolution' : 'through bottleneck'} />
      </div>
    </FigureBody>
  );
}
