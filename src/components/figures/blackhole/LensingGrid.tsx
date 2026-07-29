import { useRef, useState } from 'react';
import { useFigureCanvas } from '../useFigureCanvas';
import { useThemeColors } from '../useThemeColors';
import { Canvas, FigureBody, Panel, Slider, Toggle } from '../controls';
import { circle, label } from '../plot';

const BUF_W = 380;
const BUF_H = 170;

function rgb(hex: string): [number, number, number] {
  const m = /^#([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return [128, 128, 128];
  const n = parseInt(m[1], 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/**
 * Weak-field lensing, rendered per pixel.
 *
 * For each point in the image we ask where its light started: a ray arriving at
 * angular radius θ from the lens was bent by θ_E²/θ, so it came from θ − θ_E²/θ
 * on the background. Sampling the background there and painting it here is the
 * whole renderer.
 */
export default function LensingGrid() {
  const colors = useThemeColors();
  const [strength, setStrength] = useState(0.42);
  const [drifting, setDrifting] = useState(true);
  const [showShadow, setShowShadow] = useState(true);
  const imageRef = useRef<ImageData | null>(null);
  const bufferRef = useRef<HTMLCanvasElement | null>(null);
  const lensRef = useRef({ x: 0.5, y: 0.5 });
  const draggingRef = useRef(false);

  const { canvasRef, aspect } = useFigureCanvas(
    (ctx, { width, height, time }) => {
      if (!imageRef.current || imageRef.current.width !== BUF_W) {
        imageRef.current = ctx.createImageData(BUF_W, BUF_H);
      }
      const image = imageRef.current;
      const data = image.data;

      const [br, bg, bb] = rgb(colors['surface-sunk']);
      const [gr, gg, gb] = rgb(colors.kraft);
      const [sr, sg, sb] = rgb(colors.accent);

      // Aspect-corrected coordinates: x in [-1.1, 1.1], y scaled by the buffer.
      const halfW = 1.1;
      const halfH = (halfW * BUF_H) / BUF_W;
      const lx = (lensRef.current.x * 2 - 1) * halfW;
      const ly = (lensRef.current.y * 2 - 1) * halfH;

      const drift = drifting ? time * 0.045 : 0;
      const thetaE2 = strength * strength;

      for (let py = 0; py < BUF_H; py += 1) {
        const y = ((py / (BUF_H - 1)) * 2 - 1) * halfH;
        for (let px = 0; px < BUF_W; px += 1) {
          const x = ((px / (BUF_W - 1)) * 2 - 1) * halfW;

          const dx = x - lx;
          const dy = y - ly;
          const r = Math.hypot(dx, dy);

          let u = x;
          let v = y;
          if (r > 1e-4) {
            // Deflect: pull the sampled point inward by θ_E²/θ.
            const shift = thetaE2 / r;
            u = lx + dx * (1 - shift / r);
            v = ly + dy * (1 - shift / r);
          }

          // --- background: a ruled grid with a few stars on it ------------------
          const su = u + drift;
          const sv = v;
          // Distance to the nearest grid line, in cells; bright when close.
          const cellU = su * 6;
          const cellV = sv * 6;
          const dU = Math.min(cellU - Math.floor(cellU), Math.ceil(cellU) - cellU);
          const dV = Math.min(cellV - Math.floor(cellV), Math.ceil(cellV) - cellV);
          const line = Math.max(
            Math.max(0, 1 - dU * 26),
            Math.max(0, 1 - dV * 26),
          );

          let star = 0;
          for (let s = 0; s < 5; s += 1) {
            const stx = Math.sin(s * 12.9898) * 0.9;
            const sty = Math.cos(s * 78.233) * 0.45;
            const d2 = (su - stx) * (su - stx) + (sv - sty) * (sv - sty);
            star = Math.max(star, Math.exp(-d2 * 900));
          }

          const mixG = Math.min(1, line * 0.75);
          const i = (py * BUF_W + px) * 4;
          data[i] = br + (gr - br) * mixG + (sr - br) * star;
          data[i + 1] = bg + (gg - bg) * mixG + (sg - bg) * star;
          data[i + 2] = bb + (gb - bb) * mixG + (sb - bb) * star;
          data[i + 3] = 255;
        }
      }

      ctx.imageSmoothingEnabled = true;
      // Paint the buffer through an offscreen canvas so it scales to the element.
      ctx.save();
      ctx.beginPath();
      ctx.roundRect(0, 0, width, height, 12);
      ctx.clip();
      if (!bufferRef.current) {
        bufferRef.current = document.createElement('canvas');
        bufferRef.current.width = BUF_W;
        bufferRef.current.height = BUF_H;
      }
      bufferRef.current.getContext('2d')?.putImageData(image, 0, 0);
      ctx.drawImage(bufferRef.current, 0, 0, width, height);

      // The hole itself. The thin-lens map above has no shadow of its own, so
      // this is drawn on: it marks roughly where the strong-field region begins.
      const cxPx = lensRef.current.x * width;
      const cyPx = lensRef.current.y * height;
      const einsteinPx = (strength / halfW) * (width / 2);

      if (showShadow) {
        ctx.beginPath();
        ctx.arc(cxPx, cyPx, einsteinPx * 0.34, 0, Math.PI * 2);
        ctx.fillStyle = '#000';
        ctx.fill();
      }
      ctx.setLineDash([4, 5]);
      circle(ctx, cxPx, cyPx, einsteinPx, colors.accent, 1.25);
      ctx.setLineDash([]);
      ctx.restore();

      label(ctx, 'Einstein radius', cxPx, cyPx - einsteinPx - 6, colors.accent, {
        size: 10,
        align: 'center',
      });
      label(ctx, 'drag the hole', 12, height - 10, colors.faint, { size: 10 });
    },
    { aspect: BUF_W / BUF_H },
  );

  const moveLens = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    lensRef.current = {
      x: Math.max(0.05, Math.min(0.95, (e.clientX - rect.left) / rect.width)),
      y: Math.max(0.1, Math.min(0.9, (e.clientY - rect.top) / rect.height)),
    };
  };

  return (
    <FigureBody>
      <Canvas
        canvasRef={canvasRef}
        aspect={aspect}
        label="A ruled background grid distorted by gravitational lensing, with an Einstein ring around the hole."
        className="cursor-grab"
        onPointerDown={(e) => {
          draggingRef.current = true;
          e.currentTarget.setPointerCapture(e.pointerId);
          moveLens(e);
        }}
        onPointerMove={(e) => {
          if (draggingRef.current) moveLens(e);
        }}
        onPointerUp={() => {
          draggingRef.current = false;
        }}
      />
      <Panel columns={1}>
        <Slider
          label="lens mass (Einstein radius)"
          value={strength}
          min={0.05}
          max={0.75}
          onChange={setStrength}
        />
      </Panel>
      <div className="mt-4 flex flex-wrap items-center gap-2">
        <Toggle label="Background drift" checked={drifting} onChange={setDrifting} />
        <Toggle label="Draw shadow" checked={showShadow} onChange={setShowShadow} />
      </div>
    </FigureBody>
  );
}
