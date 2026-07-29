import { useState } from 'react';
import { useFigureCanvas } from '../useFigureCanvas';
import { fade, useThemeColors } from '../useThemeColors';
import { Canvas, FigureBody, Panel, Readout, Slider } from '../controls';
import { label, polyline } from '../plot';

const G = 6.6743e-11;
const C = 2.99792458e8;
const M_SUN = 1.98892e30;
const BODY_LENGTH = 1.8; // metres, head to foot
const g0 = 9.80665;

/**
 * Tidal stretch across a body of length L at radius r is 2GML/r³. Measure r in
 * Schwarzschild radii and the mass cancels down to 1/M² — which is why falling
 * through a supermassive horizon is uneventful and a stellar-mass one is not.
 */
function tidalG(massKg: number, radiiFromHorizon: number): number {
  const rs = (2 * G * massKg) / (C * C);
  const r = rs * radiiFromHorizon;
  return (2 * G * massKg * BODY_LENGTH) / (r * r * r) / g0;
}

export default function TidalForces() {
  const colors = useThemeColors();
  const [logMass, setLogMass] = useState(1); // log10 of M / M☉
  const [distance, setDistance] = useState(1);

  const mass = 10 ** logMass * M_SUN;
  const stretch = tidalG(mass, distance);

  // Map many orders of magnitude onto a modest visual deformation.
  const severity = Math.max(0, Math.min(1, (Math.log10(Math.max(stretch, 1e-6)) + 4) / 10));

  const { canvasRef, aspect } = useFigureCanvas(
    (ctx, { width, height, time }) => {
      const pad = 22;
      const cx = width * 0.28;
      const cy = height / 2;

      // --- the falling body ----------------------------------------------------
      const base = Math.min(height * 0.3, 74);
      const wobble = 1 + 0.02 * Math.sin(time * 1.6);
      const halfH = base * (1 + severity * 2.6) * wobble;
      const halfW = (base * 0.34) / (1 + severity * 2.2);

      ctx.beginPath();
      ctx.ellipse(cx, cy, halfW, halfH, 0, 0, Math.PI * 2);
      ctx.fillStyle = fade(colors.kraft, 0.55);
      ctx.fill();
      ctx.strokeStyle = severity > 0.55 ? colors.accent : fade(colors.border, 1);
      ctx.lineWidth = 1.5;
      ctx.stroke();

      // Arrows: the difference in pull between head and feet.
      const arrow = 14 + severity * 30;
      for (const dir of [-1, 1]) {
        const tipY = cy + dir * (halfH + arrow);
        polyline(
          ctx,
          [
            [cx, cy + dir * halfH],
            [cx, tipY],
          ],
          colors.accent,
          1.5,
        );
        polyline(
          ctx,
          [
            [cx - 4, tipY - dir * 5],
            [cx, tipY],
            [cx + 4, tipY - dir * 5],
          ],
          colors.accent,
          1.5,
        );
      }

      label(ctx, 'a 1.8 m body', cx, cy + halfH + arrow + 16, colors.faint, {
        size: 10,
        align: 'center',
      });

      // --- survivability scale --------------------------------------------------
      const sx = width * 0.5;
      const sw = width - sx - pad;
      const sy = height / 2;
      const LO = -6;
      const HI = 12;
      const toX = (log10: number) => sx + ((log10 - LO) / (HI - LO)) * sw;

      polyline(
        ctx,
        [
          [sx, sy],
          [sx + sw, sy],
        ],
        fade(colors.faint, 0.5),
        1,
      );

      for (let e = LO; e <= HI; e += 3) {
        const x = toX(e);
        polyline(
          ctx,
          [
            [x, sy - 4],
            [x, sy + 4],
          ],
          fade(colors.faint, 0.4),
          1,
        );
        label(ctx, `10^${e}`, x, sy + 8, colors.faint, {
          size: 9,
          align: 'center',
          baseline: 'top',
        });
      }

      // 10 g is roughly where a trained human blacks out.
      const limitX = toX(1);
      polyline(
        ctx,
        [
          [limitX, sy - 26],
          [limitX, sy + 26],
        ],
        fade(colors.accent, 0.55),
        1.5,
      );
      label(ctx, 'survivable', limitX - 4, sy - 30, colors.faint, { size: 9, align: 'right' });
      label(ctx, 'fatal', limitX + 4, sy - 30, colors.accent, { size: 9 });

      const markX = toX(Math.max(LO, Math.min(HI, Math.log10(Math.max(stretch, 1e-6)))));
      polyline(
        ctx,
        [
          [markX, sy - 16],
          [markX, sy + 16],
        ],
        colors.ink,
        2,
      );
      label(
        ctx,
        `${stretch < 0.01 ? stretch.toExponential(1) : stretch.toPrecision(3)} g`,
        markX,
        sy - 20,
        colors.ink,
        { size: 10, align: 'center' },
      );
      label(ctx, 'tidal stretch, head to foot (g)', sx, sy + 30, colors.muted, {
        size: 10,
        baseline: 'top',
      });
    },
    { aspect: 2.5 },
  );

  return (
    <FigureBody>
      <Canvas
        canvasRef={canvasRef}
        aspect={aspect}
        label="A body stretched by tidal forces, with the resulting acceleration marked on a logarithmic scale."
      />
      <Panel columns={2}>
        <Slider
          label="black hole mass"
          value={logMass}
          min={0}
          max={10}
          step={0.05}
          format={(v) => `10^${v.toFixed(1)} M☉`}
          onChange={setLogMass}
        />
        <Slider
          label="distance"
          value={distance}
          min={1}
          max={12}
          step={0.05}
          format={(v) => `${v.toFixed(2)} × r_s`}
          onChange={setDistance}
        />
      </Panel>
      <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
        <Readout label="mass" value={`${(10 ** logMass).toPrecision(3)} M☉`} />
        <Readout
          label="tidal stretch"
          value={stretch < 0.01 ? `${stretch.toExponential(2)} g` : `${stretch.toPrecision(3)} g`}
        />
        <Readout
          label="verdict"
          value={stretch > 10 ? 'spaghettified' : 'uneventful'}
          hint={distance <= 1.01 ? 'at the horizon' : `${distance.toFixed(1)} r_s out`}
        />
      </div>
    </FigureBody>
  );
}
