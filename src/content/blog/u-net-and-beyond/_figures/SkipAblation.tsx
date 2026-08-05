import { useMemo, useState } from 'react';
import { useFigureCanvas } from '@figures/useFigureCanvas';
import { fade, useThemeColors } from '@figures/useThemeColors';
import { Canvas, FigureBody, Panel, Readout, Slider } from '@figures/controls';
import { box, frame, label } from '@figures/plot';

/**
 * A real encoder–decoder round trip on a real 64×64 map.
 *
 * The encoder is repeated 2×2 average pooling. The decoder is bilinear
 * upsampling. The lateral routes carry exactly the difference between a level
 * and the upsampled version of the level below it — a Laplacian pyramid, which
 * is what a skip connection is an approximation of.
 *
 * The important honesty: with every level routed at full strength the
 * reconstruction is *exact*, and with none routed it is the best the bottleneck
 * can do. Neither result is tuned; both fall out of the arithmetic. The old
 * version of this figure computed its answer from the target, which made the
 * skip look better than any real one could be.
 */

const N = 64;

/** Deterministic shapes chosen to have both a large body and thin detail. */
function makeTarget(): Float64Array {
  const map = new Float64Array(N * N);
  for (let y = 0; y < N; y += 1) {
    for (let x = 0; x < N; x += 1) {
      const u = (x + 0.5) / N;
      const v = (y + 0.5) / N;
      let on = 0;
      // A disc with a bite taken out of it.
      if ((u - 0.31) ** 2 + (v - 0.34) ** 2 < 0.032 && (u - 0.22) ** 2 + (v - 0.26) ** 2 > 0.006) on = 1;
      // A thin diagonal filament — the first thing pooling destroys.
      if (Math.abs(v - u + 0.34) < 0.016 && u > 0.42 && u < 0.92) on = 1;
      // A rectangle with a narrow slot.
      if (u > 0.58 && u < 0.9 && v > 0.62 && v < 0.86 && !(u > 0.7 && u < 0.74)) on = 1;
      map[y * N + x] = on;
    }
  }
  return map;
}

function avgPool2(src: Float64Array, n: number): Float64Array {
  const m = n / 2;
  const dst = new Float64Array(m * m);
  for (let y = 0; y < m; y += 1) {
    for (let x = 0; x < m; x += 1) {
      const a = src[2 * y * n + 2 * x];
      const b = src[2 * y * n + 2 * x + 1];
      const c = src[(2 * y + 1) * n + 2 * x];
      const d = src[(2 * y + 1) * n + 2 * x + 1];
      dst[y * m + x] = (a + b + c + d) / 4;
    }
  }
  return dst;
}

/** Bilinear ×2, half-pixel aligned — the `align_corners=False` convention. */
function upsample2(src: Float64Array, n: number): Float64Array {
  const m = n * 2;
  const dst = new Float64Array(m * m);
  for (let y = 0; y < m; y += 1) {
    const sy = Math.min(n - 1, Math.max(0, (y + 0.5) / 2 - 0.5));
    const y0 = Math.floor(sy);
    const y1 = Math.min(n - 1, y0 + 1);
    const fy = sy - y0;
    for (let x = 0; x < m; x += 1) {
      const sx = Math.min(n - 1, Math.max(0, (x + 0.5) / 2 - 0.5));
      const x0 = Math.floor(sx);
      const x1 = Math.min(n - 1, x0 + 1);
      const fx = sx - x0;
      const top = src[y0 * n + x0] * (1 - fx) + src[y0 * n + x1] * fx;
      const bottom = src[y1 * n + x0] * (1 - fx) + src[y1 * n + x1] * fx;
      dst[y * m + x] = top * (1 - fy) + bottom * fy;
    }
  }
  return dst;
}

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Pixels with a differing four-neighbour. */
function boundaryOf(mask: Uint8Array): Uint8Array {
  const edge = new Uint8Array(N * N);
  for (let y = 0; y < N; y += 1) {
    for (let x = 0; x < N; x += 1) {
      const v = mask[y * N + x];
      const differs =
        (x > 0 && mask[y * N + x - 1] !== v) ||
        (x < N - 1 && mask[y * N + x + 1] !== v) ||
        (y > 0 && mask[(y - 1) * N + x] !== v) ||
        (y < N - 1 && mask[(y + 1) * N + x] !== v);
      if (differs) edge[y * N + x] = 1;
    }
  }
  return edge;
}

/** Fraction of `a` boundary pixels with a `b` boundary pixel within one cell. */
function matched(a: Uint8Array, b: Uint8Array): { hits: number; total: number } {
  let hits = 0;
  let total = 0;
  for (let y = 0; y < N; y += 1) {
    for (let x = 0; x < N; x += 1) {
      if (!a[y * N + x]) continue;
      total += 1;
      let found = false;
      for (let dy = -1; dy <= 1 && !found; dy += 1) {
        for (let dx = -1; dx <= 1 && !found; dx += 1) {
          const ny = y + dy;
          const nx = x + dx;
          if (ny >= 0 && ny < N && nx >= 0 && nx < N && b[ny * N + nx]) found = true;
        }
      }
      if (found) hits += 1;
    }
  }
  return { hits, total };
}

const TARGET = makeTarget();
const TARGET_MASK = Uint8Array.from(TARGET, (v) => (v >= 0.5 ? 1 : 0));
const TARGET_EDGE = boundaryOf(TARGET_MASK);

export default function SkipAblation() {
  const colors = useThemeColors();
  const [depth, setDepth] = useState(3);
  const [routed, setRouted] = useState(0);
  const [strength, setStrength] = useState(1);
  const [noise, setNoise] = useState(0.06);

  const result = useMemo(() => {
    // Encoder: the pyramid of pooled levels.
    const levels: Float64Array[] = [TARGET];
    const sizes = [N];
    for (let l = 0; l < depth; l += 1) {
      levels.push(avgPool2(levels[l], sizes[l]));
      sizes.push(sizes[l] / 2);
    }

    // Lateral routes: what each pooling step threw away.
    const details: Float64Array[] = [];
    for (let l = 0; l < depth; l += 1) {
      const coarse = upsample2(levels[l + 1], sizes[l + 1]);
      const detail = new Float64Array(sizes[l] * sizes[l]);
      for (let i = 0; i < detail.length; i += 1) detail[i] = levels[l][i] - coarse[i];
      details.push(detail);
    }

    // Decoder: climb back up, adding whichever lateral routes are enabled.
    const rnd = mulberry32(1337);
    let current: Float64Array = Float64Array.from(levels[depth]);
    for (let i = 0; i < current.length; i += 1) current[i] += noise * (rnd() - 0.5) * 2;
    let size = sizes[depth];
    const enabled = Math.min(routed, depth);
    for (let l = depth - 1; l >= 0; l -= 1) {
      current = upsample2(current, size);
      size *= 2;
      if (l < enabled) {
        for (let i = 0; i < current.length; i += 1) current[i] += strength * details[l][i];
      }
    }

    const mask = Uint8Array.from(current, (v) => (v >= 0.5 ? 1 : 0));
    let intersection = 0;
    let union = 0;
    for (let i = 0; i < mask.length; i += 1) {
      if (mask[i] && TARGET_MASK[i]) intersection += 1;
      if (mask[i] || TARGET_MASK[i]) union += 1;
    }
    const edge = boundaryOf(mask);
    const recall = matched(TARGET_EDGE, edge);
    const precision = matched(edge, TARGET_EDGE);
    const p = precision.total ? precision.hits / precision.total : 0;
    const r = recall.total ? recall.hits / recall.total : 0;

    // How many numbers each route has to carry, per channel.
    const bottleneckValues = sizes[depth] * sizes[depth];
    let lateralValues = 0;
    for (let l = 0; l < enabled; l += 1) lateralValues += sizes[l] * sizes[l];

    return {
      current,
      mask,
      iou: union ? intersection / union : 0,
      boundaryF1: p + r > 0 ? (2 * p * r) / (p + r) : 0,
      bottleneckValues,
      lateralValues,
      enabled,
      coarseSize: sizes[depth],
    };
  }, [depth, routed, strength, noise]);

  const { canvasRef, aspect } = useFigureCanvas(
    (ctx, { width, height }) => {
      const pad = 14;
      const gap = 16;
      const side = Math.min((width - pad * 2 - gap * 2) / 3, height - pad * 2 - 18);
      const top = pad + 14;
      const panels = [0, 1, 2].map((i) => box(pad + i * (side + gap), top, side, side));

      const cell = side / N;
      const paint = (b: ReturnType<typeof box>, value: (i: number) => number, tint: (v: number) => string) => {
        for (let y = 0; y < N; y += 1) {
          for (let x = 0; x < N; x += 1) {
            const v = value(y * N + x);
            if (v <= 0.002) continue;
            ctx.fillStyle = tint(v);
            ctx.fillRect(b.x + x * cell, b.y + y * cell, cell + 0.5, cell + 0.5);
          }
        }
        frame(ctx, b, colors.border, 6);
      };

      paint(panels[0], (i) => TARGET[i], (v) => fade(colors.ink, 0.16 + 0.6 * v));
      paint(
        panels[1],
        (i) => Math.max(0, Math.min(1, result.current[i])),
        (v) => fade(colors.accent, 0.1 + 0.75 * v),
      );
      // Disagreement after thresholding: the segmentation error, not the residual.
      paint(
        panels[2],
        (i) => (result.mask[i] !== TARGET_MASK[i] ? 1 : TARGET_MASK[i] ? 0.14 : 0),
        (v) => (v > 0.5 ? fade(colors.kraft, 0.95) : fade(colors.faint, 0.3)),
      );

      const titles = [
        'target',
        result.enabled > 0 ? `decoder + ${result.enabled} lateral route${result.enabled > 1 ? 's' : ''}` : 'decoder, bottleneck only',
        'thresholded disagreement',
      ];
      titles.forEach((text, i) => {
        label(ctx, text, panels[i].x, top - 5, i === 1 ? colors.accent : colors.muted, { size: 10 });
      });
      label(
        ctx,
        `bottleneck ${result.coarseSize}² · ${(100 * (1 - result.iou)).toFixed(1)}% of the union misclassified`,
        pad,
        height - 6,
        colors.faint,
        { size: 9 },
      );
    },
    { aspect: 2.75, animate: false },
  );

  return (
    <FigureBody>
      <Canvas
        canvasRef={canvasRef}
        aspect={aspect}
        label="A 64 by 64 target map, its reconstruction after pooling and upsampling with a chosen number of lateral routes, and the pixels where the thresholded result disagrees with the target."
      />
      <Panel columns={2}>
        <Slider
          label="pooling steps"
          value={depth}
          min={1}
          max={4}
          step={1}
          format={(v) => `${v} → ${N / 2 ** v}²`}
          onChange={(v) => {
            setDepth(v);
            setRouted((r) => Math.min(r, v));
          }}
        />
        <Slider
          label="lateral routes enabled"
          value={routed}
          min={0}
          max={depth}
          step={1}
          format={(v) => `${v} of ${depth}`}
          onChange={setRouted}
        />
      </Panel>
      <Panel columns={2}>
        <Slider label="skip strength" value={strength} min={0} max={1} step={0.05} format={(v) => v.toFixed(2)} onChange={setStrength} />
        <Slider label="bottleneck noise" value={noise} min={0} max={0.4} step={0.02} format={(v) => v.toFixed(2)} onChange={setNoise} />
      </Panel>
      <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Readout label="IoU" value={result.iou.toFixed(3)} />
        <Readout label="boundary F1" value={result.boundaryF1.toFixed(3)} hint="1-pixel tolerance" />
        <Readout label="bottleneck carries" value={`${result.bottleneckValues} values`} hint="per channel" />
        <Readout label="lateral routes carry" value={`${result.lateralValues} values`} hint="per channel" />
      </div>
    </FigureBody>
  );
}
