import { useMemo, useState } from 'react';
import { useFigureCanvas } from '../useFigureCanvas';
import { fade, useThemeColors } from '../useThemeColors';
import { Canvas, FigureBody, Panel, PlayPause, SegmentedControl, Slider } from '../controls';
import { TAU, circle, dot, label, polyline } from '../plot';

type Shape = 'square' | 'sawtooth' | 'triangle';

/** Fourier sine coefficients, indexed by harmonic number starting at 1. */
function coefficients(shape: Shape, terms: number): Array<{ n: number; a: number }> {
  const out: Array<{ n: number; a: number }> = [];
  for (let k = 0; out.length < terms && k < terms * 4; k += 1) {
    const n = k + 1;
    if (shape === 'square') {
      if (n % 2 === 0) continue;
      out.push({ n, a: 4 / (Math.PI * n) });
    } else if (shape === 'sawtooth') {
      out.push({ n, a: ((n % 2 === 1 ? 1 : -1) * 2) / (Math.PI * n) });
    } else {
      if (n % 2 === 0) continue;
      const sign = ((n - 1) / 2) % 2 === 0 ? 1 : -1;
      out.push({ n, a: (sign * 8) / (Math.PI * Math.PI * n * n) });
    }
  }
  return out;
}

const CYCLES = 2.4;

/**
 * The Fourier series as machinery: a chain of circles, each turning n times
 * faster than the last, whose tip height *is* the partial sum. Drop the term
 * count to 1 and the square wave is a sine; raise it and the corners appear.
 */
export default function Epicycles() {
  const colors = useThemeColors();
  const [shape, setShape] = useState<Shape>('square');
  const [terms, setTerms] = useState(5);
  const [speed, setSpeed] = useState(0.35);
  const [playing, setPlaying] = useState(true);

  const coeffs = useMemo(() => coefficients(shape, terms), [shape, terms]);
  const reach = useMemo(() => coeffs.reduce((sum, c) => sum + Math.abs(c.a), 0), [coeffs]);

  const { canvasRef, aspect } = useFigureCanvas(
    (ctx, { width, height, time }) => {
      const theta = playing ? time * speed * TAU : 0;

      const pad = 14;
      const dialSize = Math.min(height - pad * 2, width * 0.42);
      const cx = pad + dialSize / 2;
      const cy = height / 2;
      // Keep the chain comfortably inside the dial whatever the term count.
      const scale = (dialSize / 2 - 10) / Math.max(reach, 0.4);

      const traceX = pad + dialSize + 26;
      const traceW = width - traceX - pad;

      // Partial sum, evaluated at an arbitrary phase.
      const partial = (angle: number) =>
        coeffs.reduce((sum, c) => sum + c.a * Math.sin(c.n * angle), 0);

      // --- the chain of circles -------------------------------------------
      let px = cx;
      let py = cy;
      ctx.save();
      coeffs.forEach((c, i) => {
        const r = Math.abs(c.a) * scale;
        if (r > 1.2) {
          circle(ctx, px, py, r, fade(colors.faint, i === 0 ? 0.5 : 0.28), 1);
        }
        const nx = px + c.a * scale * Math.cos(c.n * theta);
        const ny = py - c.a * scale * Math.sin(c.n * theta);
        polyline(
          ctx,
          [
            [px, py],
            [nx, ny],
          ],
          fade(colors.kraft, 0.9),
          1.25,
        );
        px = nx;
        py = ny;
      });
      ctx.restore();

      const tipY = cy - partial(theta) * scale;

      // --- the traced wave --------------------------------------------------
      const points: Array<[number, number]> = [];
      const samples = 420;
      for (let i = 0; i <= samples; i += 1) {
        const u = i / samples;
        points.push([traceX + u * traceW, cy - partial(theta - u * TAU * CYCLES) * scale]);
      }
      polyline(ctx, points, colors.accent, 2.5);

      // Connector: the tip and the leading edge of the trace are the same number.
      polyline(
        ctx,
        [
          [px, py],
          [traceX, tipY],
        ],
        fade(colors.accent, 0.4),
        1,
      );
      dot(ctx, px, py, 3.5, colors.accent);
      dot(ctx, traceX, tipY, 3, colors.accent);

      // Zero line for the trace.
      ctx.beginPath();
      ctx.moveTo(traceX, cy);
      ctx.lineTo(traceX + traceW, cy);
      ctx.strokeStyle = fade(colors.faint, 0.3);
      ctx.lineWidth = 1;
      ctx.setLineDash([3, 4]);
      ctx.stroke();
      ctx.setLineDash([]);

      label(ctx, `${coeffs.length} term${coeffs.length === 1 ? '' : 's'}`, pad + 2, pad + 10, colors.faint, {
        size: 10,
      });
      label(ctx, 'time →', traceX + traceW, height - pad + 2, colors.faint, {
        size: 10,
        align: 'right',
      });
    },
    { aspect: 2.5, animate: playing },
  );

  return (
    <FigureBody>
      <Canvas
        canvasRef={canvasRef}
        aspect={aspect}
        label="A chain of rotating circles whose tip traces a square wave."
      />
      <Panel columns={2}>
        <Slider
          label="terms"
          value={terms}
          min={1}
          max={24}
          step={1}
          format={(v) => String(v)}
          onChange={setTerms}
        />
        <Slider
          label="speed"
          value={speed}
          min={0.05}
          max={1}
          format={(v) => `${v.toFixed(2)}×`}
          onChange={setSpeed}
        />
      </Panel>
      <div className="mt-4 flex flex-wrap items-center gap-3">
        <SegmentedControl
          value={shape}
          options={[
            { value: 'square', label: 'square' },
            { value: 'sawtooth', label: 'sawtooth' },
            { value: 'triangle', label: 'triangle' },
          ]}
          onChange={setShape}
        />
        <PlayPause playing={playing} onChange={setPlaying} />
      </div>
    </FigureBody>
  );
}
