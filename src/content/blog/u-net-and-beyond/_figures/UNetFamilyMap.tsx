import { useRef, useState } from 'react';
import { useFigureCanvas } from '@figures/useFigureCanvas';
import { fade, useThemeColors } from '@figures/useThemeColors';
import { Canvas, FigureBody, Readout } from '@figures/controls';
import { box, fillRoundRect, frame, label, polyline } from '@figures/plot';

const FAMILIES = [
  { name: 'U-Net', idea: 'match a contracting path with an expanding path and lateral skips', axis: 'topology' },
  { name: '3D U-Net', idea: 'replace 2D operations with volumetric ones', axis: 'dimensionality' },
  { name: 'UNet++', idea: 'refine the lateral routes through nested fusion nodes', axis: 'skip topology' },
  { name: 'Attention', idea: 'gate encoder detail using decoder context', axis: 'selection' },
  { name: 'ResUNet', idea: 'use residual blocks inside the U-shaped scaffold', axis: 'block design' },
  { name: 'nnU-Net', idea: 'configure preprocessing, scale and training from the dataset', axis: 'system design' },
];

export default function UNetFamilyMap() {
  const colors = useThemeColors();
  const [selected, setSelected] = useState(0);
  const hitRef = useRef<Array<{ x: number; y: number; w: number; h: number }>>([]);

  const choose = (clientX: number, clientY: number, canvas: HTMLCanvasElement) => {
    const rect = canvas.getBoundingClientRect();
    const x = clientX - rect.left;
    const y = clientY - rect.top;
    const index = hitRef.current.findIndex((b) => x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h);
    if (index >= 0) setSelected(index);
  };

  const { canvasRef, aspect } = useFigureCanvas(
    (ctx, { width, height }) => {
      const nodeW = Math.min(108, width * 0.18);
      const nodeH = 44;
      const centre = box(width / 2 - nodeW / 2, height / 2 - nodeH / 2, nodeW, nodeH);
      const positions = [
        centre,
        box(width * 0.04, height * 0.12, nodeW, nodeH),
        box(width * 0.4, height * 0.06, nodeW, nodeH),
        box(width * 0.78, height * 0.16, nodeW, nodeH),
        box(width * 0.12, height * 0.72, nodeW, nodeH),
        box(width * 0.7, height * 0.72, nodeW, nodeH),
      ];
      hitRef.current = positions;

      for (let i = 1; i < positions.length; i += 1) {
        const b = positions[i];
        polyline(
          ctx,
          [[centre.x + centre.w / 2, centre.y + centre.h / 2], [b.x + b.w / 2, b.y + b.h / 2]],
          i === selected ? fade(colors.accent, 0.8) : fade(colors.faint, 0.34),
          i === selected ? 2.2 : 1.1,
        );
      }

      positions.forEach((b, i) => {
        fillRoundRect(ctx, b, i === selected ? fade(colors.accent, 0.17) : fade(colors['surface-sunk'], 0.78), 9);
        frame(ctx, b, i === selected ? colors.accent : colors.border, 9);
        label(ctx, FAMILIES[i].name, b.x + b.w / 2, b.y + b.h / 2, i === selected ? colors['accent-deep'] : colors.ink, {
          size: FAMILIES[i].name.length > 8 ? 8.5 : 10,
          align: 'center',
          baseline: 'middle',
          weight: '650',
        });
      });
      label(ctx, 'tap a descendant', 14, height - 10, colors.faint, { size: 10 });
    },
    { aspect: 1.78, animate: false },
  );

  return (
    <FigureBody>
      <Canvas
        canvasRef={canvasRef}
        aspect={aspect}
        label="A clickable family map of U-Net descendants and the design dimension each changes."
        className="cursor-pointer"
        onPointerDown={(e) => choose(e.clientX, e.clientY, e.currentTarget)}
        onPointerMove={(e) => {
          if (e.pointerType === 'mouse') choose(e.clientX, e.clientY, e.currentTarget);
        }}
      />
      <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Readout label={FAMILIES[selected].name} value={FAMILIES[selected].idea} />
        <Readout label="design axis" value={FAMILIES[selected].axis} />
      </div>
    </FigureBody>
  );
}
