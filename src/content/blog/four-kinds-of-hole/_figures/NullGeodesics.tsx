import { useMemo, useState } from 'react';
import { useFigureCanvas } from '@figures/useFigureCanvas';
import { fade, useThemeColors } from '@figures/useThemeColors';
import { Canvas, FigureBody, Panel, Readout, Slider, Toggle } from '@figures/controls';
import { circle, dot, label, polyline } from '@figures/plot';

// Geometric units: G = c = 1, M = 1. The horizon is then at r = 2, the photon
// sphere at r = 3, and the critical impact parameter is 3√3 ≈ 5.196.
const M = 1;
const HORIZON = 2 * M;
const PHOTON_SPHERE = 3 * M;
const B_CRIT = 3 * Math.sqrt(3) * M;

const R_START = 45;
const D_PHI = 0.004;
const MAX_STEPS = 9000;

interface Ray {
  points: Array<[number, number]>;
  captured: boolean;
  deflection: number;
}

/**
 * Integrates the null orbit equation d²u/dφ² + u = 3Mu², u = 1/r, by RK4.
 *
 * The 3Mu² on the right is the entire difference between Newton and Einstein
 * here. Delete it and light bends by half as much, and nothing is ever captured.
 */
function trace(b: number): Ray {
  const u0 = 1 / R_START;
  const inside = 1 / (b * b) - u0 * u0 + 2 * M * u0 * u0 * u0;
  if (inside <= 0) return { points: [], captured: false, deflection: 0 };

  let u = u0;
  let du = Math.sqrt(inside);
  let phi = 0;

  const points: Array<[number, number]> = [];
  const accel = (uu: number) => 3 * M * uu * uu - uu;

  for (let step = 0; step < MAX_STEPS; step += 1) {
    const r = 1 / u;
    if (r < HORIZON) return { points, captured: true, deflection: 0 };
    if (r > R_START * 1.4) break;

    // Plot in the plane with the hole at the origin; φ measured from the start.
    points.push([r * Math.cos(phi), r * Math.sin(phi)]);

    const k1u = du;
    const k1d = accel(u);
    const k2u = du + (D_PHI / 2) * k1d;
    const k2d = accel(u + (D_PHI / 2) * k1u);
    const k3u = du + (D_PHI / 2) * k2d;
    const k3d = accel(u + (D_PHI / 2) * k2u);
    const k4u = du + D_PHI * k3d;
    const k4d = accel(u + D_PHI * k3u);

    u += (D_PHI / 6) * (k1u + 2 * k2u + 2 * k3u + k4u);
    du += (D_PHI / 6) * (k1d + 2 * k2d + 2 * k3d + k4d);
    phi += D_PHI;

    if (u <= 0) break;
  }

  // Total turning minus the straight-line π gives the deflection angle.
  return { points, captured: false, deflection: phi - Math.PI };
}

/**
 * Light around a Schwarzschild hole, integrated live. Below b = 3√3 M every ray
 * is swallowed; just above it, rays loop the photon sphere an arbitrary number
 * of times before escaping.
 */
export default function NullGeodesics() {
  const colors = useThemeColors();
  const [b, setB] = useState(6.2);
  const [fan, setFan] = useState(true);

  const highlighted = useMemo(() => trace(b), [b]);
  const fanRays = useMemo(() => {
    if (!fan) return [];
    const out: Ray[] = [];
    for (let i = 0; i < 13; i += 1) {
      out.push(trace(1.2 + i * 1.35));
    }
    return out;
  }, [fan]);

  const { canvasRef, aspect } = useFigureCanvas(
    (ctx, { width, height, time }) => {
      const cx = width * 0.62;
      const cy = height / 2;
      const view = 26; // half-width of the plotted region, in M
      const scale = Math.min(width / (view * 2.6), height / (view * 1.35));

      const px = (x: number) => cx + x * scale;
      const py = (y: number) => cy - y * scale;

      const drawRay = (ray: Ray, color: string, weight: number) => {
        if (ray.points.length < 2) return;
        polyline(
          ctx,
          ray.points.map(([x, y]) => [px(x), py(y)] as [number, number]),
          color,
          weight,
        );
      };

      for (const ray of fanRays) {
        drawRay(ray, fade(ray.captured ? colors.faint : colors.kraft, 0.55), 1);
      }

      // Photon sphere: the radius at which light can orbit, unstably.
      ctx.setLineDash([4, 5]);
      circle(ctx, px(0), py(0), PHOTON_SPHERE * scale, fade(colors.kraft, 0.8), 1);
      ctx.setLineDash([]);

      // The horizon.
      ctx.beginPath();
      ctx.arc(px(0), py(0), HORIZON * scale, 0, Math.PI * 2);
      ctx.fillStyle = colors.ink;
      ctx.fill();
      circle(ctx, px(0), py(0), HORIZON * scale, fade(colors.accent, 0.7), 1.5);

      drawRay(highlighted, colors.accent, 2.25);

      // A photon travelling the highlighted path, to give the geometry a tempo.
      if (highlighted.points.length > 4) {
        const idx = Math.floor((time * 260) % highlighted.points.length);
        const [hx, hy] = highlighted.points[idx];
        dot(ctx, px(hx), py(hy), 3.5, colors.accent);
      }

      label(ctx, 'horizon  r = 2M', px(0), py(0) + HORIZON * scale + 14, colors.accent, {
        size: 10,
        align: 'center',
      });
      label(
        ctx,
        'photon sphere  r = 3M',
        px(0),
        py(0) - PHOTON_SPHERE * scale - 8,
        colors.kraft,
        { size: 10, align: 'center' },
      );

      label(
        ctx,
        highlighted.captured ? 'CAPTURED' : `deflected ${((highlighted.deflection * 180) / Math.PI).toFixed(1)}°`,
        16,
        22,
        highlighted.captured ? colors.accent : colors.muted,
        { size: 11 },
      );
      label(ctx, `b = ${b.toFixed(2)} M   ·   b_crit = 5.196 M`, 16, 38, colors.faint, { size: 10 });
    },
    { aspect: 2.2 },
  );

  return (
    <FigureBody>
      <Canvas
        canvasRef={canvasRef}
        aspect={aspect}
        label="Light rays bending around a Schwarzschild black hole, some escaping and some captured."
      />
      <Panel columns={1}>
        <Slider
          label="impact parameter b"
          value={b}
          min={0.5}
          max={20}
          step={0.005}
          format={(v) => `${v.toFixed(3)} M`}
          onChange={setB}
        />
      </Panel>
      <div className="mt-4 flex flex-wrap items-center gap-2">
        <Toggle label="Show ray fan" checked={fan} onChange={setFan} />
      </div>
      <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
        <Readout label="impact parameter" value={`${b.toFixed(3)} M`} />
        <Readout
          label="outcome"
          value={highlighted.captured ? 'captured' : 'escapes'}
          hint={b < B_CRIT ? 'below b_crit' : 'above b_crit'}
        />
        <Readout
          label="deflection"
          value={
            highlighted.captured ? '—' : `${((highlighted.deflection * 180) / Math.PI).toFixed(1)}°`
          }
          hint={highlighted.deflection > Math.PI ? 'more than a full loop' : undefined}
        />
      </div>
    </FigureBody>
  );
}
