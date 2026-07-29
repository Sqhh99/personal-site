import { useMemo, useState } from 'react';
import { useFigureCanvas } from '../useFigureCanvas';
import { fade, useThemeColors } from '../useThemeColors';
import { Canvas, FigureBody, Panel, Readout, Slider } from '../controls';
import { TAU, box, bx, byUp, circle, dot, label, polyline } from '../plot';

const SAMPLES = 900;
const F_MIN = 0;
const F_MAX = 8;
const SPECTRUM_POINTS = 260;

/**
 * The complex exponential as a winding machine: the signal is wrapped around the
 * origin at the winding frequency, and the centre of mass of the wrapped curve
 * is the transform at that frequency. Its length is the magnitude; its angle is
 * the phase — which is why sliding the signal in time spins the arrow without
 * changing how long it is.
 */
export default function WindingPlane() {
  const colors = useThemeColors();
  const [signalF, setSignalF] = useState(3);
  const [windF, setWindF] = useState(3);
  const [shift, setShift] = useState(0);

  const signal = useMemo(
    () => (t: number) => 1 + Math.cos(TAU * signalF * (t - shift)),
    [signalF, shift],
  );

  /** ∫₀¹ x(t)·e^(−2πift) dt */
  const centroidAt = useMemo(
    () => (f: number) => {
      let re = 0;
      let im = 0;
      for (let i = 0; i < SAMPLES; i += 1) {
        const t = (i + 0.5) / SAMPLES;
        const v = signal(t);
        re += v * Math.cos(TAU * f * t);
        im -= v * Math.sin(TAU * f * t);
      }
      return { re: re / SAMPLES, im: im / SAMPLES };
    },
    [signal],
  );

  const centroid = centroidAt(windF);
  const magnitude = Math.hypot(centroid.re, centroid.im);
  const phase = Math.atan2(centroid.im, centroid.re);

  const spectrum = useMemo(() => {
    const out: number[] = new Array(SPECTRUM_POINTS);
    for (let i = 0; i < SPECTRUM_POINTS; i += 1) {
      const f = F_MIN + ((F_MAX - F_MIN) * i) / (SPECTRUM_POINTS - 1);
      const c = centroidAt(f);
      out[i] = Math.hypot(c.re, c.im);
    }
    return out;
  }, [centroidAt]);

  const specPeak = Math.max(0.05, ...spectrum);

  const { canvasRef, aspect } = useFigureCanvas(
    (ctx, { width, height, time }) => {
      const pad = 16;
      const dial = Math.min(height - pad * 2, width * 0.5);
      const cx = pad + dial / 2;
      const cy = height / 2;
      const scale = (dial / 2 - 14) / 2.2;

      // --- axes -------------------------------------------------------------
      ctx.beginPath();
      ctx.moveTo(cx - dial / 2, cy);
      ctx.lineTo(cx + dial / 2, cy);
      ctx.moveTo(cx, cy - dial / 2);
      ctx.lineTo(cx, cy + dial / 2);
      ctx.strokeStyle = fade(colors.faint, 0.28);
      ctx.lineWidth = 1;
      ctx.stroke();
      circle(ctx, cx, cy, scale, fade(colors.faint, 0.2), 1);
      circle(ctx, cx, cy, scale * 2, fade(colors.faint, 0.14), 1);

      // --- the wound signal ---------------------------------------------------
      const wound: Array<[number, number]> = [];
      const n = 720;
      for (let i = 0; i <= n; i += 1) {
        const t = i / n;
        const v = signal(t);
        const angle = -TAU * windF * t;
        wound.push([cx + v * scale * Math.cos(angle), cy + v * scale * Math.sin(angle)]);
      }
      polyline(ctx, wound, fade(colors.accent, 0.75), 1.6);

      // A dot walking the curve makes the wrapping legible rather than magic.
      const walk = (time * 0.18) % 1;
      const wv = signal(walk);
      const wa = -TAU * windF * walk;
      dot(ctx, cx + wv * scale * Math.cos(wa), cy + wv * scale * Math.sin(wa), 3.5, colors.kraft);

      // --- centre of mass ------------------------------------------------------
      const gx = cx + centroid.re * scale;
      const gy = cy + centroid.im * scale;
      polyline(
        ctx,
        [
          [cx, cy],
          [gx, gy],
        ],
        colors.ink,
        2,
      );
      dot(ctx, gx, gy, 5, colors.ink);
      label(ctx, 'centre of mass', pad + 2, pad + 10, colors.ink, { size: 10 });

      // --- magnitude spectrum ---------------------------------------------------
      const plotX = pad + dial + 28;
      const plot = box(plotX, pad + 8, width - plotX - pad, height - pad * 2 - 16);

      ctx.beginPath();
      ctx.moveTo(plot.x, plot.y + plot.h);
      ctx.lineTo(plot.x + plot.w, plot.y + plot.h);
      ctx.strokeStyle = fade(colors.faint, 0.35);
      ctx.lineWidth = 1;
      ctx.stroke();

      const points: Array<[number, number]> = spectrum.map((v, i) => {
        const u = i / (SPECTRUM_POINTS - 1);
        return [bx(plot, u), byUp(plot, v, specPeak * 1.12)];
      });
      polyline(ctx, points, fade(colors.accent, 0.9), 2);

      const mu = (windF - F_MIN) / (F_MAX - F_MIN);
      const mx = bx(plot, mu);
      polyline(
        ctx,
        [
          [mx, plot.y],
          [mx, plot.y + plot.h],
        ],
        fade(colors.kraft, 0.6),
        1,
      );
      dot(ctx, mx, byUp(plot, magnitude, specPeak * 1.12), 4, colors.ink);

      label(ctx, '|X(f)|', plot.x + 2, plot.y + 2, colors.muted, { size: 10, baseline: 'top' });
      for (let f = 0; f <= 8; f += 2) {
        const tx = bx(plot, (f - F_MIN) / (F_MAX - F_MIN));
        label(ctx, String(f), tx, plot.y + plot.h + 3, colors.faint, {
          size: 9,
          align: 'center',
          baseline: 'top',
        });
      }
    },
    { aspect: 2.1 },
  );

  return (
    <FigureBody>
      <Canvas
        canvasRef={canvasRef}
        aspect={aspect}
        label="A signal wound around the complex plane, its centre of mass, and the magnitude spectrum."
      />
      <Panel columns={3}>
        <Slider
          label="winding frequency"
          value={windF}
          min={F_MIN}
          max={F_MAX}
          step={0.01}
          format={(v) => `${v.toFixed(2)} Hz`}
          onChange={setWindF}
        />
        <Slider
          label="signal frequency"
          value={signalF}
          min={1}
          max={7}
          step={1}
          format={(v) => `${v} Hz`}
          onChange={setSignalF}
        />
        <Slider
          label="time shift"
          value={shift}
          min={0}
          max={1}
          step={0.005}
          format={(v) => `${v.toFixed(3)} s`}
          onChange={setShift}
        />
      </Panel>
      <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
        <Readout label="magnitude" value={magnitude.toFixed(3)} hint="arrow length" />
        <Readout label="phase" value={`${(phase / Math.PI).toFixed(2)}π`} hint="arrow angle" />
        <Readout
          label="on shifting time"
          value={shift === 0 ? 'aligned' : 'rotated'}
          hint="length is unchanged"
        />
      </div>
    </FigureBody>
  );
}
