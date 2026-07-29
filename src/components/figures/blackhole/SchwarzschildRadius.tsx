import { useState } from 'react';
import { useFigureCanvas } from '../useFigureCanvas';
import { fade, useThemeColors } from '../useThemeColors';
import { Canvas, FigureBody, Panel, Readout, SegmentedControl, Slider } from '../controls';
import { circle, dot, label, polyline } from '../plot';

const G = 6.6743e-11;
const C = 2.99792458e8;
const M_SUN = 1.98892e30;

/** log10 metres spanned by the ruler: a grain of sand to a hundred light-years. */
const AXIS_MIN = -4;
const AXIS_MAX = 18;

interface Body {
  label: string;
  mass: number;
  radius: number;
}

const BODIES: Record<string, Body> = {
  earth: { label: 'Earth', mass: 5.972e24, radius: 6.371e6 },
  sun: { label: 'Sun', mass: M_SUN, radius: 6.957e8 },
  neutron: { label: 'neutron star', mass: 1.4 * M_SUN, radius: 1.2e4 },
  stellar: { label: 'stellar hole', mass: 10 * M_SUN, radius: 2.95e4 },
  sgra: { label: 'Sgr A*', mass: 4.3e6 * M_SUN, radius: 1.27e10 },
};

const TICKS: Array<{ at: number; text: string }> = [
  { at: -3, text: '1 mm' },
  { at: 0, text: '1 m' },
  { at: 3, text: '1 km' },
  { at: 6, text: '1000 km' },
  { at: 9, text: 'Sun-sized' },
  { at: 12, text: 'Solar system' },
  { at: 16, text: '1 light-year' },
];

function format(metres: number): string {
  if (metres >= 9.461e15) return `${(metres / 9.461e15).toPrecision(3)} ly`;
  if (metres >= 1e9) return `${(metres / 1e9).toPrecision(3)} Gm`;
  if (metres >= 1e3) return `${(metres / 1e3).toPrecision(3)} km`;
  if (metres >= 1) return `${metres.toPrecision(3)} m`;
  return `${(metres * 1000).toPrecision(3)} mm`;
}

/**
 * Escape velocity taken to its limit. Every mass has a radius at which light no
 * longer gets out; the whole question is whether anything can push the mass in
 * that far. Ordinary matter misses by twenty-odd orders of magnitude.
 */
export default function SchwarzschildRadius() {
  const [body, setBody] = useState<keyof typeof BODIES>('sun');
  const [logMass, setLogMass] = useState(Math.log10(M_SUN));
  const [logRadius, setLogRadius] = useState(Math.log10(BODIES.sun.radius));
  const colors = useThemeColors();

  const mass = 10 ** logMass;
  const radius = 10 ** logRadius;
  const rs = (2 * G * mass) / (C * C);
  const collapsed = radius <= rs;
  const compression = radius / rs;

  const choose = (key: string) => {
    const next = BODIES[key];
    if (!next) return;
    setBody(key as keyof typeof BODIES);
    setLogMass(Math.log10(next.mass));
    setLogRadius(Math.log10(next.radius));
  };

  const { canvasRef, aspect } = useFigureCanvas(
    (ctx, { width, height, time }) => {
      const pad = 30;
      const axisY = height * 0.62;
      const w = width - pad * 2;
      const toX = (log10: number) =>
        pad + ((log10 - AXIS_MIN) / (AXIS_MAX - AXIS_MIN)) * w;

      // --- the ruler ---------------------------------------------------------
      polyline(
        ctx,
        [
          [pad, axisY],
          [pad + w, axisY],
        ],
        fade(colors.faint, 0.55),
        1,
      );

      for (const tick of TICKS) {
        const x = toX(tick.at);
        polyline(
          ctx,
          [
            [x, axisY - 4],
            [x, axisY + 4],
          ],
          fade(colors.faint, 0.45),
          1,
        );
        label(ctx, tick.text, x, axisY + 9, colors.faint, {
          size: 9,
          align: 'center',
          baseline: 'top',
        });
      }

      const xActual = toX(Math.log10(radius));
      const xRs = toX(Math.log10(rs));

      // --- the gap that has to be closed ---------------------------------------
      ctx.beginPath();
      ctx.roundRect(Math.min(xRs, xActual), axisY - 26, Math.abs(xActual - xRs), 20, 4);
      ctx.fillStyle = fade(colors.accent, collapsed ? 0.05 : 0.14);
      ctx.fill();

      const marker = (x: number, text: string, color: string, up: number) => {
        polyline(
          ctx,
          [
            [x, axisY],
            [x, axisY - up],
          ],
          color,
          1.5,
        );
        dot(ctx, x, axisY, 3.5, color);
        label(ctx, text, x, axisY - up - 4, color, { size: 10, align: 'center' });
      };

      marker(xRs, `horizon  ${format(rs)}`, colors.accent, 30);
      marker(xActual, `actual radius  ${format(radius)}`, colors.ink, 58);

      if (!collapsed) {
        label(
          ctx,
          `squeeze by 10^${Math.log10(compression).toFixed(1)}`,
          (xRs + xActual) / 2,
          axisY - 14,
          colors.muted,
          { size: 10, align: 'center' },
        );
      }

      // --- a to-scale inset, when the two radii are close enough to draw --------
      const insetR = Math.min(height * 0.24, 52);
      const icx = width - pad - insetR - 4;
      const icy = height * 0.2;

      if (compression < 400) {
        const scale = insetR / Math.max(radius, rs);
        const bodyPx = radius * scale;
        const rsPx = rs * scale;

        if (collapsed) {
          // The horizon itself, with light grazing the photon sphere at 1.5 r_s.
          ctx.beginPath();
          ctx.arc(icx, icy, rsPx, 0, Math.PI * 2);
          ctx.fillStyle = colors.ink;
          ctx.fill();
          circle(ctx, icx, icy, rsPx * 1.5, fade(colors.kraft, 0.5), 1);
          const spin = time * 0.6;
          for (let i = 0; i < 3; i += 1) {
            const a = spin + (i * Math.PI * 2) / 3;
            dot(ctx, icx + Math.cos(a) * rsPx * 1.5, icy + Math.sin(a) * rsPx * 1.5, 2, colors.kraft);
          }
        } else {
          ctx.beginPath();
          ctx.arc(icx, icy, bodyPx, 0, Math.PI * 2);
          ctx.fillStyle = fade(colors.kraft, 0.5);
          ctx.fill();
        }
        circle(ctx, icx, icy, rsPx, colors.accent, 1.5);
        label(ctx, 'to scale', icx, icy + insetR + 6, colors.faint, {
          size: 9,
          align: 'center',
          baseline: 'top',
        });
      }

      label(
        ctx,
        collapsed ? 'a horizon exists' : 'no horizon — light escapes',
        pad,
        pad - 8,
        collapsed ? colors.accent : colors.muted,
        { size: 11 },
      );
    },
    { aspect: 2.4, animate: collapsed && compression < 400 },
  );

  return (
    <FigureBody>
      <Canvas
        canvasRef={canvasRef}
        aspect={aspect}
        label="A logarithmic length ruler comparing an object's actual radius with its Schwarzschild radius."
      />
      <Panel columns={2}>
        <Slider
          label="mass"
          value={logMass}
          min={22}
          max={40}
          step={0.05}
          format={(v) => `${(10 ** v / M_SUN).toPrecision(3)} M☉`}
          onChange={(v) => setLogMass(v)}
        />
        <Slider
          label="radius"
          value={logRadius}
          min={AXIS_MIN}
          max={AXIS_MAX}
          step={0.05}
          format={(v) => format(10 ** v)}
          onChange={(v) => setLogRadius(v)}
        />
      </Panel>
      <div className="mt-4 flex flex-wrap items-center gap-3">
        <SegmentedControl
          label="preset"
          value={body}
          options={Object.entries(BODIES).map(([key, value]) => ({
            value: key as keyof typeof BODIES,
            label: value.label,
          }))}
          onChange={choose}
        />
      </div>
      <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
        <Readout label="Schwarzschild radius" value={format(rs)} />
        <Readout
          label="compression needed"
          value={collapsed ? 'none' : `10^${Math.log10(compression).toFixed(1)}×`}
        />
        <Readout label="state" value={collapsed ? 'black hole' : 'ordinary matter'} />
      </div>
    </FigureBody>
  );
}
