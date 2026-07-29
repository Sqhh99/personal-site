import { useRef, useState } from 'react';
import { useFigureCanvas } from '../useFigureCanvas';
import { fade, useThemeColors } from '../useThemeColors';
import { Canvas, FigureBody, Panel, PlayPause, Readout, Slider } from '../controls';
import { circle, dot, label, polyline } from '../plot';

const M = 1;
const SPOKES = 16;
const R_MAX = 9;

/** Equatorial frame-dragging rate for Kerr: ω = 2Mar / (r⁴ + a²r² + 2Ma²r). */
function omega(r: number, a: number): number {
  const denom = r * r * r + a * a * r + 2 * M * a * a;
  return (2 * M * a) / denom;
}

/**
 * Spacetime itself rotating. The spokes start straight and radial; each point on
 * them is then carried around at the local dragging rate, which falls off as
 * 1/r³. Nothing is orbiting here — these are markers held as still as the
 * geometry allows, and inside the ergosphere "still" is not an option.
 */
export default function FrameDragging() {
  const colors = useThemeColors();
  const [a, setA] = useState(0.9);
  const [playing, setPlaying] = useState(true);
  const clockRef = useRef(0);
  const lastRef = useRef(0);

  const rPlus = M + Math.sqrt(Math.max(0, M * M - a * a));
  const ergo = 2 * M; // In the equatorial plane the static limit sits at 2M for any spin.

  const { canvasRef, aspect } = useFigureCanvas(
    (ctx, { width, height, time }) => {
      // Own clock, so changing the spin or pausing does not teleport the spokes.
      const delta = Math.max(0, time - lastRef.current);
      lastRef.current = time;
      if (playing) clockRef.current += delta;
      const t = clockRef.current;

      const cx = width / 2;
      const cy = height / 2;
      const scale = Math.min(width, height * 1.8) / (R_MAX * 2.35);

      // --- ergoregion --------------------------------------------------------
      ctx.beginPath();
      ctx.arc(cx, cy, ergo * scale, 0, Math.PI * 2);
      ctx.arc(cx, cy, rPlus * scale, 0, Math.PI * 2, true);
      ctx.fillStyle = fade(colors.kraft, 0.2);
      ctx.fill('evenodd');
      circle(ctx, cx, cy, ergo * scale, fade(colors.kraft, 0.85), 1.25);

      // --- dragged spokes ------------------------------------------------------
      for (let s = 0; s < SPOKES; s += 1) {
        const phi0 = (s / SPOKES) * Math.PI * 2;
        const points: Array<[number, number]> = [];
        for (let i = 0; i <= 160; i += 1) {
          const r = rPlus + 0.04 + ((R_MAX - rPlus - 0.04) * i) / 160;
          const phi = phi0 + omega(r, a) * t * 6;
          points.push([cx + r * scale * Math.cos(phi), cy + r * scale * Math.sin(phi)]);
        }
        polyline(ctx, points, fade(colors.faint, 0.5), 1);
        const [ex, ey] = points[0];
        dot(ctx, ex, ey, 2, fade(colors.accent, 0.8));
      }

      // --- horizon --------------------------------------------------------------
      ctx.beginPath();
      ctx.arc(cx, cy, rPlus * scale, 0, Math.PI * 2);
      ctx.fillStyle = colors.ink;
      ctx.fill();
      circle(ctx, cx, cy, rPlus * scale, fade(colors.accent, 0.8), 1.5);

      label(ctx, 'ergoregion', cx, cy - ergo * scale - 8, colors.kraft, {
        size: 10,
        align: 'center',
      });
      label(ctx, `r₊ = ${rPlus.toFixed(2)} M`, cx, cy + rPlus * scale + 13, colors.accent, {
        size: 9,
        align: 'center',
      });
      label(ctx, `a = ${a.toFixed(2)} M`, 14, 20, colors.muted, { size: 10 });
      label(
        ctx,
        a < 0.02 ? 'no spin — spokes stay straight' : 'spokes wind up: space is turning',
        14,
        height - 12,
        colors.faint,
        { size: 10 },
      );
    },
    { aspect: 1.9 },
  );

  return (
    <FigureBody>
      <Canvas
        canvasRef={canvasRef}
        aspect={aspect}
        label="Radial marker lines around a spinning black hole, winding up because spacetime is dragged around it."
      />
      <Panel columns={1}>
        <Slider
          label="spin a / M"
          value={a}
          min={0}
          max={0.999}
          step={0.001}
          format={(v) => v.toFixed(3)}
          onChange={setA}
        />
      </Panel>
      <div className="mt-4 flex flex-wrap items-center gap-2">
        <PlayPause playing={playing} onChange={setPlaying} />
        <button
          type="button"
          onClick={() => {
            clockRef.current = 0;
          }}
          className="inline-flex items-center rounded-full border border-line bg-surface px-3 py-1.5 font-mono text-[0.7rem] tracking-wider text-muted transition-colors hover:border-line-strong hover:text-ink"
        >
          Reset
        </button>
      </div>
      <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
        <Readout label="outer horizon" value={`${rPlus.toFixed(3)} M`} />
        <Readout label="static limit" value="2.000 M" hint="equatorial" />
        <Readout
          label="dragging at r₊"
          value={omega(rPlus, a).toFixed(4)}
          hint="ω in units of 1/M"
        />
      </div>
    </FigureBody>
  );
}
