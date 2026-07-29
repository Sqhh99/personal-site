import { useRef, useState } from 'react';
import { useFigureCanvas } from '@figures/useFigureCanvas';
import { fade, useThemeColors } from '@figures/useThemeColors';
import { Canvas, FigureBody, SegmentedControl } from '@figures/controls';
import { TAU, box, bx, by, dft, label, polyline } from '@figures/plot';

const N = 256;

type Preset = 'sine' | 'square' | 'pulse' | 'chirp' | 'clear';

function preset(kind: Preset): number[] {
  const out = new Array<number>(N).fill(0);
  for (let i = 0; i < N; i += 1) {
    const t = i / N;
    if (kind === 'sine') out[i] = 0.8 * Math.sin(TAU * 4 * t);
    else if (kind === 'square') out[i] = Math.sin(TAU * 3 * t) >= 0 ? 0.7 : -0.7;
    else if (kind === 'pulse') out[i] = Math.abs(t - 0.5) < 0.03 ? 0.9 : 0;
    else if (kind === 'chirp') out[i] = 0.75 * Math.sin(TAU * (2 + 18 * t) * t);
  }
  return out;
}

/**
 * Draw a waveform with a finger or a mouse; the spectrum underneath is a plain
 * O(N²) DFT of exactly what you drew. A smooth curve puts everything in the low
 * bins, a sharp corner sprays energy across all of them.
 */
export default function DrawYourOwn() {
  const colors = useThemeColors();
  const samplesRef = useRef<number[]>(preset('sine'));
  const [, forceRender] = useState(0);
  const [kind, setKind] = useState<Preset>('sine');
  const drawingRef = useRef(false);
  const lastIndexRef = useRef<number | null>(null);
  const boundsRef = useRef({ x: 0, w: 1, y: 0, h: 1 });

  const repaint = () => forceRender((v) => v + 1);

  const applyPreset = (next: Preset) => {
    setKind(next);
    samplesRef.current = preset(next);
    repaint();
  };

  const writeAt = (clientX: number, clientY: number, canvas: HTMLCanvasElement) => {
    const rect = canvas.getBoundingClientRect();
    const b = boundsRef.current;
    const u = (clientX - rect.left - b.x) / b.w;
    const v = -((clientY - rect.top - b.y) / b.h - 0.5) * 2;
    const index = Math.round(u * (N - 1));
    if (index < 0 || index >= N) return;

    const value = Math.max(-1, Math.min(1, v));
    const last = lastIndexRef.current;
    // Interpolate across the gap so a fast drag does not leave holes.
    if (last !== null && Math.abs(index - last) > 1) {
      const step = index > last ? 1 : -1;
      const from = samplesRef.current[last];
      for (let i = last + step; i !== index; i += step) {
        const f = (i - last) / (index - last);
        samplesRef.current[i] = from + (value - from) * f;
      }
    }
    samplesRef.current[index] = value;
    lastIndexRef.current = index;
    repaint();
  };

  const { canvasRef, aspect } = useFigureCanvas(
    (ctx, { width, height }) => {
      const pad = 16;
      const gap = 16;
      const w = width - pad * 2;
      const waveH = (height - pad * 2 - gap) * 0.52;
      const specH = height - pad * 2 - gap - waveH;

      const wave = box(pad, pad, w, waveH);
      const spec = box(pad, pad + waveH + gap, w, specH);
      boundsRef.current = { x: wave.x, w: wave.w, y: wave.y, h: wave.h };

      // --- the drawing surface ------------------------------------------------
      ctx.beginPath();
      ctx.roundRect(wave.x, wave.y, wave.w, wave.h, 10);
      ctx.fillStyle = fade(colors['surface-sunk'], 0.55);
      ctx.fill();
      ctx.strokeStyle = fade(colors.border, 0.9);
      ctx.lineWidth = 1;
      ctx.stroke();

      ctx.beginPath();
      ctx.moveTo(wave.x, by(wave, 0));
      ctx.lineTo(wave.x + wave.w, by(wave, 0));
      ctx.strokeStyle = fade(colors.faint, 0.3);
      ctx.setLineDash([3, 4]);
      ctx.stroke();
      ctx.setLineDash([]);

      const samples = samplesRef.current;
      polyline(
        ctx,
        samples.map((v, i) => [bx(wave, i / (N - 1)), by(wave, v)] as [number, number]),
        colors.ink,
        2,
      );
      label(ctx, 'drag to draw', wave.x + 8, wave.y + 14, colors.faint, { size: 10 });

      // --- its spectrum -------------------------------------------------------
      const { mag } = dft(samples);
      const shown = 64;
      const peak = Math.max(0.02, ...mag.slice(0, shown));
      const barW = spec.w / shown;

      for (let k = 0; k < shown; k += 1) {
        const h = (mag[k] / (peak * 1.1)) * spec.h;
        const x = spec.x + k * barW;
        ctx.beginPath();
        ctx.roundRect(x + barW * 0.18, spec.y + spec.h - h, barW * 0.64, Math.max(h, 0.6), 1.5);
        ctx.fillStyle = fade(colors.accent, 0.85);
        ctx.fill();
      }

      ctx.beginPath();
      ctx.moveTo(spec.x, spec.y + spec.h);
      ctx.lineTo(spec.x + spec.w, spec.y + spec.h);
      ctx.strokeStyle = fade(colors.faint, 0.35);
      ctx.lineWidth = 1;
      ctx.stroke();

      label(ctx, 'magnitude per bin', spec.x + 2, spec.y + 2, colors.muted, {
        size: 10,
        baseline: 'top',
      });
      for (let k = 0; k <= 64; k += 16) {
        label(ctx, String(k), spec.x + k * barW, spec.y + spec.h + 3, colors.faint, {
          size: 9,
          align: 'center',
          baseline: 'top',
        });
      }
    },
    { aspect: 1.9, animate: false },
  );

  return (
    <FigureBody>
      <Canvas
        canvasRef={canvasRef}
        aspect={aspect}
        label="A waveform you can draw, with its discrete Fourier transform magnitudes below."
        className="cursor-crosshair"
        onPointerDown={(e) => {
          drawingRef.current = true;
          lastIndexRef.current = null;
          e.currentTarget.setPointerCapture(e.pointerId);
          writeAt(e.clientX, e.clientY, e.currentTarget);
        }}
        onPointerMove={(e) => {
          if (!drawingRef.current) return;
          writeAt(e.clientX, e.clientY, e.currentTarget);
        }}
        onPointerUp={() => {
          drawingRef.current = false;
          lastIndexRef.current = null;
        }}
      />
      <div className="mt-4">
        <SegmentedControl
          label="start from"
          value={kind}
          options={[
            { value: 'sine', label: 'sine' },
            { value: 'square', label: 'square' },
            { value: 'pulse', label: 'pulse' },
            { value: 'chirp', label: 'chirp' },
            { value: 'clear', label: 'clear' },
          ]}
          onChange={applyPreset}
        />
      </div>
    </FigureBody>
  );
}
