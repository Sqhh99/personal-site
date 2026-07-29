import { useState } from 'react';
import { useFigureCanvas } from '../useFigureCanvas';
import { fade, useThemeColors } from '../useThemeColors';
import { Canvas, FigureBody, Panel, Readout, Slider } from '../controls';
import { circle, dot, label, polyline } from '../plot';

// Geometric units with M = 1, so a and Q are already in units of M.
const M = 1;

interface Metric {
  name: string;
  note: string;
}

function classify(a: number, q: number): Metric {
  if (a * a + q * q > M * M) {
    return { name: 'naked singularity', note: 'no horizon — forbidden by cosmic censorship' };
  }
  const spinning = a > 0.005;
  const charged = q > 0.005;
  if (!spinning && !charged) return { name: 'Schwarzschild', note: 'mass only · 1916' };
  if (!spinning && charged) return { name: 'Reissner–Nordström', note: 'mass + charge · 1918' };
  if (spinning && !charged) return { name: 'Kerr', note: 'mass + spin · 1963' };
  return { name: 'Kerr–Newman', note: 'mass + charge + spin · 1965' };
}

const PRESETS: Array<{ label: string; a: number; q: number }> = [
  { label: 'Schwarzschild', a: 0, q: 0 },
  { label: 'Reissner–Nordström', a: 0, q: 0.7 },
  { label: 'Kerr', a: 0.85, q: 0 },
  { label: 'Kerr–Newman', a: 0.6, q: 0.5 },
];

/**
 * The four metrics as four regions of one two-dimensional parameter space.
 *
 * The no-hair theorem says a stationary hole is fixed by mass, charge and spin.
 * Normalise by the mass and only two numbers are left — so every black hole in
 * general relativity is one point on this disc.
 */
export default function MetricExplorer() {
  const colors = useThemeColors();
  const [a, setA] = useState(0.6);
  const [q, setQ] = useState(0.35);

  const disc = a * a + q * q;
  const naked = disc > M * M;
  const root = naked ? 0 : Math.sqrt(M * M - disc);
  const rPlus = M + root;
  const rMinus = M - root;
  const metric = classify(a, q);
  const extremality = Math.sqrt(Math.min(1, disc));

  const { canvasRef, aspect } = useFigureCanvas(
    (ctx, { width, height, time }) => {
      const pad = 18;
      const paramSize = Math.min(height - pad * 2, width * 0.3);
      const crossW = width - paramSize - pad * 3;

      const cx = pad + crossW / 2;
      const cy = height / 2;
      const scale = Math.min(crossW / 6.4, (height - pad * 2) / 5.2);

      // --- poloidal cross-section (the x–z plane through the axis) ------------
      // Axis of rotation, drawn so "spin" has a visible direction.
      polyline(
        ctx,
        [
          [cx, cy - 2.4 * scale],
          [cx, cy + 2.4 * scale],
        ],
        fade(colors.faint, 0.3),
        1,
      );

      const shape = (radiusAt: (theta: number) => number, close = true) => {
        const pts: Array<[number, number]> = [];
        for (let i = 0; i <= 200; i += 1) {
          const theta = (i / 200) * Math.PI * 2;
          const r = radiusAt(theta);
          if (!Number.isFinite(r) || r <= 0) continue;
          // θ measured from the spin axis; x is equatorial, z is along the axis.
          pts.push([cx + r * Math.sin(theta) * scale, cy - r * Math.cos(theta) * scale]);
        }
        if (close && pts.length > 2) pts.push(pts[0]);
        return pts;
      };

      if (!naked) {
        // Static limit (outer ergosurface): r_E(θ) = M + √(M² − a²cos²θ − Q²).
        const ergo = shape((theta) => {
          const inner = M * M - a * a * Math.cos(theta) * Math.cos(theta) - q * q;
          return inner < 0 ? 0 : M + Math.sqrt(inner);
        });
        if (ergo.length > 2) {
          ctx.beginPath();
          ctx.moveTo(ergo[0][0], ergo[0][1]);
          for (const [x, y] of ergo.slice(1)) ctx.lineTo(x, y);
          ctx.closePath();
          ctx.fillStyle = fade(colors.kraft, 0.22);
          ctx.fill();
          ctx.strokeStyle = fade(colors.kraft, 0.9);
          ctx.lineWidth = 1.25;
          ctx.stroke();
        }

        // Outer horizon — a sphere of Boyer–Lindquist radius r₊.
        ctx.beginPath();
        ctx.arc(cx, cy, rPlus * scale, 0, Math.PI * 2);
        ctx.fillStyle = colors.ink;
        ctx.fill();
        circle(ctx, cx, cy, rPlus * scale, fade(colors.accent, 0.85), 1.5);

        // Inner (Cauchy) horizon — only exists once there is spin or charge.
        if (root > 0.001 && rMinus > 0.001) {
          ctx.setLineDash([3, 4]);
          circle(ctx, cx, cy, rMinus * scale, fade(colors.accent, 0.55), 1);
          ctx.setLineDash([]);
        }
      } else {
        circle(ctx, cx, cy, 1.1 * scale, fade(colors.accent, 0.35), 1);
      }

      // Singularity: a point when there is no spin, a ring when there is.
      if (a > 0.005) {
        const ringR = a * scale;
        ctx.beginPath();
        ctx.ellipse(cx, cy, ringR, ringR * 0.18, 0, 0, Math.PI * 2);
        ctx.strokeStyle = naked ? colors.accent : fade(colors.manilla, 0.95);
        ctx.lineWidth = 1.5;
        ctx.stroke();
      } else {
        dot(ctx, cx, cy, 2.5, naked ? colors.accent : colors.manilla);
      }

      // A hint of rotation for the spinning cases.
      if (a > 0.005 && !naked) {
        const spin = time * (0.4 + a);
        for (let i = 0; i < 3; i += 1) {
          const ang = spin + (i * Math.PI * 2) / 3;
          const rr = (rPlus + 0.55) * scale;
          dot(ctx, cx + Math.cos(ang) * rr, cy + Math.sin(ang) * rr * 0.32, 2, fade(colors.kraft, 0.9));
        }
      }

      label(ctx, metric.name, pad, pad + 2, colors.ink, { size: 12, mono: false, weight: '600' });
      label(ctx, metric.note, pad, pad + 18, colors.faint, { size: 10 });

      if (!naked) {
        label(ctx, 'ergosphere', cx, cy - 2.6 * scale, colors.kraft, { size: 9, align: 'center' });
        label(ctx, `r₊ = ${rPlus.toFixed(3)} M`, cx, cy + rPlus * scale + 14, colors.accent, {
          size: 10,
          align: 'center',
        });
      } else {
        label(ctx, 'no horizon', cx, cy + 2.2 * scale, colors.accent, { size: 11, align: 'center' });
      }

      // --- parameter space ----------------------------------------------------
      const px0 = width - pad - paramSize;
      const py0 = (height - paramSize) / 2;
      const toPx = (v: number) => px0 + v * paramSize;
      const toPy = (v: number) => py0 + paramSize - v * paramSize;

      ctx.beginPath();
      ctx.rect(px0, py0, paramSize, paramSize);
      ctx.fillStyle = fade(colors['surface-sunk'], 0.5);
      ctx.fill();
      ctx.strokeStyle = fade(colors.border, 1);
      ctx.lineWidth = 1;
      ctx.stroke();

      // The extremal arc a² + Q² = M². Everything outside it is forbidden.
      ctx.beginPath();
      for (let i = 0; i <= 120; i += 1) {
        const t = (i / 120) * (Math.PI / 2);
        const x = toPx(Math.cos(t));
        const y = toPy(Math.sin(t));
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.strokeStyle = colors.accent;
      ctx.lineWidth = 1.5;
      ctx.stroke();

      ctx.beginPath();
      ctx.moveTo(toPx(1), toPy(0));
      for (let i = 0; i <= 120; i += 1) {
        const t = (i / 120) * (Math.PI / 2);
        ctx.lineTo(toPx(Math.cos(t)), toPy(Math.sin(t)));
      }
      ctx.lineTo(toPx(1), toPy(1));
      ctx.closePath();
      ctx.fillStyle = fade(colors.accent, 0.1);
      ctx.fill();

      for (const p of PRESETS) {
        dot(ctx, toPx(p.a), toPy(p.q), 2.5, fade(colors.faint, 0.9));
      }

      dot(ctx, toPx(a), toPy(q), 5, naked ? colors.accent : colors.ink);

      label(ctx, 'spin a →', px0, py0 + paramSize + 4, colors.faint, { size: 9, baseline: 'top' });
      label(ctx, '↑ charge Q', px0, py0 - 6, colors.faint, { size: 9 });
      label(ctx, 'extremal', toPx(0.72), toPy(0.78), colors.accent, { size: 9 });
      label(ctx, 'Schw.', toPx(0.02), toPy(0.03), colors.faint, { size: 8, baseline: 'bottom' });
    },
    { aspect: 2.25 },
  );

  return (
    <FigureBody>
      <Canvas
        canvasRef={canvasRef}
        aspect={aspect}
        label="A cross-section of a black hole's horizons and ergosphere, alongside the spin–charge parameter space."
      />
      <Panel columns={2}>
        <Slider
          label="spin a / M"
          value={a}
          min={0}
          max={1.2}
          step={0.005}
          format={(v) => v.toFixed(3)}
          onChange={setA}
        />
        <Slider
          label="charge Q / M"
          value={q}
          min={0}
          max={1.2}
          step={0.005}
          format={(v) => v.toFixed(3)}
          onChange={setQ}
        />
      </Panel>
      <div className="mt-4 flex flex-wrap gap-1 rounded-lg border border-line bg-sunk p-1">
        {PRESETS.map((p) => (
          <button
            key={p.label}
            type="button"
            onClick={() => {
              setA(p.a);
              setQ(p.q);
            }}
            className={`rounded-md px-2.5 py-1 font-mono text-[0.7rem] tracking-wider transition-colors ${
              metric.name === p.label
                ? 'bg-surface text-accent-deep shadow-xs'
                : 'text-muted hover:text-ink'
            }`}
          >
            {p.label}
          </button>
        ))}
      </div>
      <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Readout label="solution" value={metric.name} />
        <Readout label="outer horizon r₊" value={naked ? '—' : `${rPlus.toFixed(3)} M`} />
        <Readout label="inner horizon r₋" value={naked || root < 1e-3 ? '—' : `${rMinus.toFixed(3)} M`} />
        <Readout
          label="extremality"
          value={extremality.toFixed(3)}
          hint={naked ? 'past the limit' : '1.000 is extremal'}
        />
      </div>
    </FigureBody>
  );
}
