import { useMemo, useState } from 'react';
import { useFigureCanvas } from '@figures/useFigureCanvas';
import { fade, useThemeColors } from '@figures/useThemeColors';
import { Canvas, FigureBody, Panel, Readout, Slider } from '@figures/controls';
import { TAU, baseline, box, bx, by, curve, dot, label, polyline } from '@figures/plot';

const SAMPLES = 600;
const F_MIN = 0.4;
const F_MAX = 12;
const SPECTRUM_POINTS = 320;

/**
 * The transform, done by hand at one frequency at a time.
 *
 * Both components are zero-phase sines, so the sine correlation alone is the
 * whole answer here and the shaded area maps directly onto the spectrum below.
 * Phase — and the second quadrature it forces you to keep — is the next figure.
 */
export default function CorrelationSweep() {
  const colors = useThemeColors();
  const [fA, setFA] = useState(3);
  const [fB, setFB] = useState(7);
  const [ampB, setAmpB] = useState(0.55);
  const [testF, setTestF] = useState(2);

  const signal = useMemo(
    () => (t: number) => Math.sin(TAU * fA * t) + ampB * Math.sin(TAU * fB * t),
    [fA, fB, ampB],
  );

  /** 2∫₀¹ x(t)·sin(2πft) dt — the correlation of the signal with one test tone. */
  const correlate = useMemo(
    () => (f: number) => {
      let sum = 0;
      for (let i = 0; i < SAMPLES; i += 1) {
        const t = (i + 0.5) / SAMPLES;
        sum += signal(t) * Math.sin(TAU * f * t);
      }
      return (2 * sum) / SAMPLES;
    },
    [signal],
  );

  const spectrum = useMemo(() => {
    const out: number[] = new Array(SPECTRUM_POINTS);
    for (let i = 0; i < SPECTRUM_POINTS; i += 1) {
      out[i] = correlate(F_MIN + ((F_MAX - F_MIN) * i) / (SPECTRUM_POINTS - 1));
    }
    return out;
  }, [correlate]);

  const current = correlate(testF);
  const peak = Math.max(1, ...spectrum.map(Math.abs));

  const { canvasRef, aspect } = useFigureCanvas(
    (ctx, { width, height }) => {
      const pad = 16;
      const gap = 14;
      const w = width - pad * 2;
      const bandH = (height - pad * 2 - gap * 2) / 3;

      const top = box(pad, pad, w, bandH);
      const mid = box(pad, pad + bandH + gap, w, bandH);
      const bot = box(pad, pad + (bandH + gap) * 2, w, bandH);

      const range = 1 + ampB + 0.15;

      // --- signal and the test tone ----------------------------------------
      baseline(ctx, top, fade(colors.faint, 0.35));
      curve(ctx, top, (u) => Math.sin(TAU * testF * u), fade(colors.kraft, 0.95), {
        range,
        width: 1.5,
      });
      curve(ctx, top, signal, colors.ink, { range, width: 2.25 });
      label(ctx, 'signal x(t)', top.x + 4, top.y + 12, colors.ink, { size: 10 });
      label(ctx, `test tone  ${testF.toFixed(2)} Hz`, top.x + w, top.y + 12, colors.kraft, {
        size: 10,
        align: 'right',
      });

      // --- their product, shaded by sign ------------------------------------
      const product = (u: number) => signal(u) * Math.sin(TAU * testF * u);
      const pRange = range;

      const positive: Array<[number, number]> = [];
      const negative: Array<[number, number]> = [];
      for (let i = 0; i <= SAMPLES; i += 1) {
        const u = i / SAMPLES;
        const v = product(u);
        const point: [number, number] = [bx(mid, u), by(mid, v, pRange)];
        (v >= 0 ? positive : negative).push(point);
      }

      // Fill the area between the product and zero; positive lobes are what a
      // matching frequency accumulates, negative lobes are what cancels it out.
      const zero = by(mid, 0, pRange);
      ctx.beginPath();
      ctx.moveTo(mid.x, zero);
      for (let i = 0; i <= SAMPLES; i += 1) {
        const u = i / SAMPLES;
        ctx.lineTo(bx(mid, u), by(mid, product(u), pRange));
      }
      ctx.lineTo(mid.x + mid.w, zero);
      ctx.closePath();
      ctx.fillStyle = fade(colors.accent, 0.18);
      ctx.fill();

      baseline(ctx, mid, fade(colors.faint, 0.35));
      curve(ctx, mid, product, colors.accent, { range: pRange, width: 1.75 });
      label(ctx, 'x(t) · sin(2πft)', mid.x + 4, mid.y + 12, colors.accent, { size: 10 });
      label(
        ctx,
        `area = ${current >= 0 ? '+' : ''}${current.toFixed(3)}`,
        mid.x + mid.w,
        mid.y + 12,
        colors.muted,
        { size: 10, align: 'right' },
      );

      // --- the spectrum this sweep traces out --------------------------------
      const midY = bot.y + bot.h / 2;
      ctx.beginPath();
      ctx.moveTo(bot.x, midY);
      ctx.lineTo(bot.x + bot.w, midY);
      ctx.strokeStyle = fade(colors.faint, 0.3);
      ctx.lineWidth = 1;
      ctx.setLineDash([3, 4]);
      ctx.stroke();
      ctx.setLineDash([]);

      const points: Array<[number, number]> = spectrum.map((v, i) => {
        const u = i / (SPECTRUM_POINTS - 1);
        return [bx(bot, u), by(bot, v, peak * 1.15)];
      });
      polyline(ctx, points, fade(colors.accent, 0.85), 2);

      // Marker at the frequency currently under the slider.
      const u = (testF - F_MIN) / (F_MAX - F_MIN);
      const markerX = bx(bot, u);
      const markerY = by(bot, current, peak * 1.15);
      polyline(
        ctx,
        [
          [markerX, bot.y],
          [markerX, bot.y + bot.h],
        ],
        fade(colors.kraft, 0.6),
        1,
      );
      dot(ctx, markerX, markerY, 4, colors.accent);

      for (let f = 2; f <= 12; f += 2) {
        const gx = bx(bot, (f - F_MIN) / (F_MAX - F_MIN));
        label(ctx, String(f), gx, bot.y + bot.h + 1, colors.faint, {
          size: 9,
          align: 'center',
          baseline: 'top',
        });
      }
      label(ctx, 'correlation vs frequency', bot.x + 4, bot.y + 12, colors.muted, { size: 10 });
    },
    { aspect: 1.55, animate: false },
  );

  return (
    <FigureBody>
      <Canvas
        canvasRef={canvasRef}
        aspect={aspect}
        label="A signal multiplied by a test sinusoid, the shaded product area, and the resulting spectrum."
      />
      <Panel columns={2}>
        <Slider
          label="test frequency f"
          value={testF}
          min={F_MIN}
          max={F_MAX}
          step={0.02}
          format={(v) => `${v.toFixed(2)} Hz`}
          onChange={setTestF}
        />
        <Slider
          label="component A"
          value={fA}
          min={1}
          max={11}
          step={1}
          format={(v) => `${v} Hz`}
          onChange={setFA}
        />
        <Slider
          label="component B"
          value={fB}
          min={1}
          max={11}
          step={1}
          format={(v) => `${v} Hz`}
          onChange={setFB}
        />
        <Slider
          label="amplitude of B"
          value={ampB}
          min={0}
          max={1}
          onChange={setAmpB}
        />
      </Panel>
      <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
        <Readout label="test f" value={`${testF.toFixed(2)} Hz`} />
        <Readout label="correlation" value={current.toFixed(3)} hint="the shaded area" />
        <Readout
          label="verdict"
          value={Math.abs(current) > 0.15 ? 'present' : 'absent'}
          hint={Math.abs(current) > 0.15 ? 'lobes reinforce' : 'lobes cancel'}
        />
      </div>
    </FigureBody>
  );
}
