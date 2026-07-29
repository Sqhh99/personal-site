import { useMemo, useState } from 'react';
import { useFigureCanvas } from '@figures/useFigureCanvas';
import { fade, useThemeColors } from '@figures/useThemeColors';
import { Canvas, FigureBody, Panel, Readout, SegmentedControl, Slider } from '@figures/controls';
import { TAU, box, bx, by, byUp, dft, label, polyline } from '@figures/plot';

const N = 256;
const FLOOR_DB = -75;

type Window = 'rect' | 'hann';

/**
 * A single pure tone, and what the transform makes of it depending on whether a
 * whole number of its cycles happens to fit in the record. At 8.0 cycles the
 * energy lands in one bin; at 8.5 it smears across all of them.
 */
export default function SpectralLeakage() {
  const colors = useThemeColors();
  const [cycles, setCycles] = useState(8.5);
  const [window, setWindow] = useState<Window>('rect');

  const { samples, windowed } = useMemo(() => {
    const raw = new Array<number>(N);
    const win = new Array<number>(N);
    for (let i = 0; i < N; i += 1) {
      const t = i / N;
      const w = window === 'hann' ? 0.5 * (1 - Math.cos((TAU * i) / (N - 1))) : 1;
      raw[i] = Math.sin(TAU * cycles * t);
      win[i] = raw[i] * w;
    }
    return { samples: raw, windowed: win };
  }, [cycles, window]);

  const mag = useMemo(() => dft(windowed).mag, [windowed]);

  const db = useMemo(() => {
    const peak = Math.max(1e-9, ...mag);
    return mag.map((v) => Math.max(FLOOR_DB, 20 * Math.log10(Math.max(v, 1e-9) / peak)));
  }, [mag]);

  // How much of the total energy sits outside the two bins nearest the tone.
  const spill = useMemo(() => {
    const total = mag.reduce((s, v) => s + v * v, 0) || 1;
    const centre = Math.round(cycles);
    let inBand = 0;
    for (let k = centre - 1; k <= centre + 1; k += 1) {
      if (k >= 0 && k < mag.length) inBand += mag[k] * mag[k];
    }
    return 1 - inBand / total;
  }, [mag, cycles]);

  const { canvasRef, aspect } = useFigureCanvas(
    (ctx, { width, height }) => {
      const pad = 16;
      const gap = 16;
      const w = width - pad * 2;
      const waveH = (height - pad * 2 - gap) * 0.4;
      const specH = height - pad * 2 - gap - waveH;

      const wave = box(pad, pad, w, waveH);
      const spec = box(pad, pad + waveH + gap, w, specH);

      // --- the record ---------------------------------------------------------
      ctx.beginPath();
      ctx.moveTo(wave.x, by(wave, 0));
      ctx.lineTo(wave.x + wave.w, by(wave, 0));
      ctx.strokeStyle = fade(colors.faint, 0.3);
      ctx.lineWidth = 1;
      ctx.setLineDash([3, 4]);
      ctx.stroke();
      ctx.setLineDash([]);

      polyline(
        ctx,
        samples.map((v, i) => [bx(wave, i / (N - 1)), by(wave, v, 1.15)] as [number, number]),
        fade(colors.faint, 0.45),
        1,
      );
      polyline(
        ctx,
        windowed.map((v, i) => [bx(wave, i / (N - 1)), by(wave, v, 1.15)] as [number, number]),
        colors.ink,
        1.75,
      );

      // The discontinuity at the seam is the entire cause of leakage, so show it.
      const wrapGap = Math.abs(windowed[N - 1] - windowed[0]);
      ctx.beginPath();
      ctx.moveTo(wave.x + wave.w, wave.y);
      ctx.lineTo(wave.x + wave.w, wave.y + wave.h);
      ctx.strokeStyle = fade(colors.accent, 0.25 + Math.min(0.6, wrapGap * 0.5));
      ctx.lineWidth = 2;
      ctx.stroke();

      label(ctx, 'one record', wave.x + 4, wave.y + 12, colors.muted, { size: 10 });
      label(
        ctx,
        `seam jump ${wrapGap.toFixed(2)}`,
        wave.x + wave.w - 4,
        wave.y + 12,
        wrapGap > 0.1 ? colors.accent : colors.faint,
        { size: 10, align: 'right' },
      );

      // --- the spectrum, in dB -------------------------------------------------
      const shown = 32;
      const barW = spec.w / shown;

      for (const line of [0, -20, -40, -60]) {
        const y = byUp(spec, line - FLOOR_DB, -FLOOR_DB);
        ctx.beginPath();
        ctx.moveTo(spec.x, y);
        ctx.lineTo(spec.x + spec.w, y);
        ctx.strokeStyle = fade(colors.faint, 0.18);
        ctx.lineWidth = 1;
        ctx.stroke();
        label(ctx, `${line}`, spec.x + spec.w + 2, y, colors.faint, { size: 9, baseline: 'middle' });
      }

      for (let k = 0; k < shown; k += 1) {
        const value = db[k] ?? FLOOR_DB;
        const y = byUp(spec, value - FLOOR_DB, -FLOOR_DB);
        const h = spec.y + spec.h - y;
        const near = Math.abs(k - cycles) < 1;
        ctx.beginPath();
        ctx.roundRect(spec.x + k * barW + barW * 0.2, y, barW * 0.6, Math.max(h, 0.8), 1.5);
        ctx.fillStyle = near ? colors.accent : fade(colors.accent, 0.32);
        ctx.fill();
      }

      ctx.beginPath();
      ctx.moveTo(spec.x, spec.y + spec.h);
      ctx.lineTo(spec.x + spec.w, spec.y + spec.h);
      ctx.strokeStyle = fade(colors.faint, 0.35);
      ctx.lineWidth = 1;
      ctx.stroke();

      label(ctx, 'magnitude (dB)', spec.x + 2, spec.y + 2, colors.muted, {
        size: 10,
        baseline: 'top',
      });
      for (let k = 0; k <= 32; k += 8) {
        label(ctx, String(k), spec.x + k * barW, spec.y + spec.h + 3, colors.faint, {
          size: 9,
          align: 'center',
          baseline: 'top',
        });
      }
    },
    { aspect: 1.75, animate: false },
  );

  return (
    <FigureBody>
      <Canvas
        canvasRef={canvasRef}
        aspect={aspect}
        label="A windowed pure tone and its spectrum in decibels, showing spectral leakage."
      />
      <Panel columns={2}>
        <Slider
          label="cycles in the record"
          value={cycles}
          min={6}
          max={11}
          step={0.02}
          format={(v) => v.toFixed(2)}
          onChange={setCycles}
        />
        <div className="flex items-end">
          <SegmentedControl
            label="window"
            value={window}
            options={[
              { value: 'rect', label: 'rectangular' },
              { value: 'hann', label: 'Hann' },
            ]}
            onChange={setWindow}
          />
        </div>
      </Panel>
      <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
        <Readout
          label="alignment"
          value={Math.abs(cycles - Math.round(cycles)) < 0.02 ? 'on a bin' : 'between bins'}
        />
        <Readout label="energy spilled" value={`${(spill * 100).toFixed(1)}%`} hint="outside ±1 bin" />
        <Readout label="window" value={window === 'hann' ? 'Hann' : 'rectangular'} />
      </div>
    </FigureBody>
  );
}
