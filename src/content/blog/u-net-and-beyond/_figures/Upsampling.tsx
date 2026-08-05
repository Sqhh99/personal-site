import { useMemo, useState } from 'react';
import { useFigureCanvas } from '@figures/useFigureCanvas';
import { fade, useThemeColors } from '@figures/useThemeColors';
import { Canvas, FigureBody, Panel, Readout, SegmentedControl, Slider } from '@figures/controls';
import { box, frame, label, polyline } from '@figures/plot';

/**
 * Where checkerboard artefacts come from, computed rather than described.
 *
 * A transposed convolution of kernel k and stride s writes k output cells per
 * input cell, spaced s apart. Output cell p therefore collects
 *   count(p) = #{ i : 0 ≤ p − i·s < k }
 * contributions, and unless s divides k that count alternates. The gain panel
 * is literally the operator applied to an input of all ones, so the pattern in
 * it is not an illustration of the artefact — it is the artefact.
 */

const N = 20;

function makeSource(): Float64Array {
  const src = new Float64Array(N * N);
  for (let y = 0; y < N; y += 1) {
    for (let x = 0; x < N; x += 1) {
      const u = (x + 0.5) / N;
      const v = (y + 0.5) / N;
      const disc = (u - 0.36) ** 2 + (v - 0.4) ** 2 < 0.045 ? 1 : 0;
      const bar = u > 0.55 && u < 0.86 && v > 0.24 && v < 0.34 ? 1 : 0;
      const wedge = v - u > 0.28 && v < 0.9 && u > 0.1 ? 0.7 : 0;
      src[y * N + x] = Math.max(disc, bar, wedge);
    }
  }
  return src;
}

const SOURCE = makeSource();

interface Grid {
  data: Float64Array;
  size: number;
}

function transposedConv(src: Float64Array, n: number, kernel: number, stride: number): Grid {
  const m = (n - 1) * stride + kernel;
  const data = new Float64Array(m * m);
  for (let y = 0; y < n; y += 1) {
    for (let x = 0; x < n; x += 1) {
      const v = src[y * n + x];
      if (v === 0) continue;
      for (let dy = 0; dy < kernel; dy += 1) {
        const oy = y * stride + dy;
        for (let dx = 0; dx < kernel; dx += 1) {
          data[oy * m + x * stride + dx] += v;
        }
      }
    }
  }
  return { data, size: m };
}

function bilinear(src: Float64Array, n: number, factor: number): Grid {
  const m = n * factor;
  const data = new Float64Array(m * m);
  for (let y = 0; y < m; y += 1) {
    const sy = Math.min(n - 1, Math.max(0, (y + 0.5) / factor - 0.5));
    const y0 = Math.floor(sy);
    const y1 = Math.min(n - 1, y0 + 1);
    const fy = sy - y0;
    for (let x = 0; x < m; x += 1) {
      const sx = Math.min(n - 1, Math.max(0, (x + 0.5) / factor - 0.5));
      const x0 = Math.floor(sx);
      const x1 = Math.min(n - 1, x0 + 1);
      const fx = sx - x0;
      const top = src[y0 * n + x0] * (1 - fx) + src[y0 * n + x1] * fx;
      const bottom = src[y1 * n + x0] * (1 - fx) + src[y1 * n + x1] * fx;
      data[y * m + x] = top * (1 - fy) + bottom * fy;
    }
  }
  return { data, size: m };
}

/** Uniform k×k convolution, edges clamped, normalised so a flat field stays flat. */
function boxBlur(grid: Grid, kernel: number): Grid {
  const { data: src, size } = grid;
  const data = new Float64Array(size * size);
  const half = Math.floor(kernel / 2);
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      let sum = 0;
      for (let dy = 0; dy < kernel; dy += 1) {
        const sy = Math.min(size - 1, Math.max(0, y + dy - half));
        for (let dx = 0; dx < kernel; dx += 1) {
          const sx = Math.min(size - 1, Math.max(0, x + dx - half));
          sum += src[sy * size + sx];
        }
      }
      data[y * size + x] = sum / (kernel * kernel);
    }
  }
  return { data, size };
}

type Method = 'transposed' | 'resize';

export default function Upsampling() {
  const colors = useThemeColors();
  const [method, setMethod] = useState<Method>('transposed');
  const [kernel, setKernel] = useState(3);
  const [stride, setStride] = useState(2);

  const { output, gain, stats } = useMemo(() => {
    const ones = new Float64Array(N * N).fill(1);
    const run = (src: Float64Array): Grid =>
      method === 'transposed' ? transposedConv(src, N, kernel, stride) : boxBlur(bilinear(src, N, stride), kernel);

    const out = run(SOURCE);
    const g = run(ones);

    // Ignore a kernel-wide border, where every operator is non-uniform anyway.
    const margin = kernel + stride;
    let lo = Infinity;
    let hi = -Infinity;
    for (let y = margin; y < g.size - margin; y += 1) {
      for (let x = margin; x < g.size - margin; x += 1) {
        const v = g.data[y * g.size + x];
        lo = Math.min(lo, v);
        hi = Math.max(hi, v);
      }
    }
    if (!Number.isFinite(lo)) {
      lo = 1;
      hi = 1;
    }
    return { output: out, gain: g, stats: { lo, hi, ratio: hi / Math.max(lo, 1e-9) } };
  }, [method, kernel, stride]);

  const { canvasRef, aspect } = useFigureCanvas(
    (ctx, { width, height }) => {
      const pad = 14;
      const gap = 16;
      const side = Math.min((width - pad * 2 - gap * 2) / 3, height - pad * 2 - 34);
      const top = pad + 14;
      const panels = [0, 1, 2].map((i) => box(pad + i * (side + gap), top, side, side));

      const paint = (b: ReturnType<typeof box>, grid: Grid, max: number, tint: (v: number) => string) => {
        const cell = b.w / grid.size;
        for (let y = 0; y < grid.size; y += 1) {
          for (let x = 0; x < grid.size; x += 1) {
            const v = grid.data[y * grid.size + x] / max;
            if (v <= 0.004) continue;
            ctx.fillStyle = tint(Math.min(1, v));
            ctx.fillRect(b.x + x * cell, b.y + y * cell, cell + 0.6, cell + 0.6);
          }
        }
        frame(ctx, b, colors.border, 6);
      };

      let outMax = 0;
      for (let i = 0; i < output.data.length; i += 1) outMax = Math.max(outMax, output.data[i]);

      paint(panels[0], { data: SOURCE, size: N }, 1, (v) => fade(colors.ink, 0.14 + 0.62 * v));
      paint(panels[1], output, outMax || 1, (v) => fade(colors.accent, 0.08 + 0.8 * v));
      // Gain is shown as deviation from the interior mean, not as magnitude —
      // an operator that doubles everything uniformly is not the problem here.
      const mid = (stats.lo + stats.hi) / 2 || 1;
      const gainMax = Math.max(stats.hi, 1e-6);
      const spread = stats.hi - stats.lo;
      paint(panels[2], gain, gainMax, (v) => {
        // A perfectly even operator has no deviation to show, not infinite ones.
        const d = spread < 1e-9 ? 0 : (v * gainMax - mid) / spread;
        return d >= 0
          ? fade(colors.kraft, 0.18 + 0.75 * Math.min(1, d * 2))
          : fade(colors.accent, 0.18 + 0.75 * Math.min(1, -d * 2));
      });

      // A horizontal slice through the gain, where the alternation is countable.
      const profile = box(pad, top + side + 12, width - pad * 2, height - top - side - 12 - 14);
      const row = Math.floor(gain.size / 2);
      const points: Array<[number, number]> = [];
      for (let x = 0; x < gain.size; x += 1) {
        const v = gain.data[row * gain.size + x];
        const norm = stats.hi > stats.lo ? (v - stats.lo) / (stats.hi - stats.lo) : 0.5;
        points.push([profile.x + (x / (gain.size - 1)) * profile.w, profile.y + profile.h - norm * profile.h * 0.86]);
      }
      polyline(ctx, [[profile.x, profile.y + profile.h * 0.57], [profile.x + profile.w, profile.y + profile.h * 0.57]], fade(colors.faint, 0.25), 1);
      polyline(ctx, points, colors['accent-deep'], 1.6);

      const titles = ['input', method === 'transposed' ? 'transposed convolution' : 'bilinear resize, then convolve', 'per-cell gain'];
      titles.forEach((text, i) => label(ctx, text, panels[i].x, top - 5, i === 0 ? colors.muted : colors.accent, { size: 10 }));
      label(ctx, 'gain along one row', profile.x, profile.y + 9, colors.faint, { size: 9 });
      label(
        ctx,
        kernel % stride === 0 ? 'stride divides kernel — gain is flat' : 'stride does not divide kernel — gain alternates',
        profile.x + profile.w,
        profile.y + 9,
        kernel % stride === 0 ? colors.muted : colors.kraft,
        { size: 9, align: 'right' },
      );
    },
    { aspect: 2.55, animate: false },
  );

  return (
    <FigureBody>
      <Canvas
        canvasRef={canvasRef}
        aspect={aspect}
        label="A small input map, its upsampled output, and the per-cell gain the upsampling operator applies, with a profile of that gain along one row."
      />
      <Panel columns={3}>
        <SegmentedControl
          label="operator"
          value={method}
          options={[
            { value: 'transposed', label: 'transposed conv' },
            { value: 'resize', label: 'resize + conv' },
          ]}
          onChange={setMethod}
        />
        <Slider label="kernel" value={kernel} min={2} max={6} step={1} format={(v) => `${v}×${v}`} onChange={setKernel} />
        <Slider label="stride" value={stride} min={2} max={4} step={1} format={(v) => String(v)} onChange={setStride} />
      </Panel>
      <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Readout label="output size" value={`${output.size}²`} hint={`from ${N}²`} />
        <Readout label="interior gain" value={`${stats.lo.toFixed(2)} – ${stats.hi.toFixed(2)}`} />
        <Readout label="worst ratio" value={`${stats.ratio.toFixed(2)}×`} hint="brightest ÷ dimmest cell" />
        <Readout
          label="k mod s"
          value={String(kernel % stride)}
          hint={kernel % stride === 0 ? 'even coverage' : 'uneven coverage'}
        />
      </div>
    </FigureBody>
  );
}
