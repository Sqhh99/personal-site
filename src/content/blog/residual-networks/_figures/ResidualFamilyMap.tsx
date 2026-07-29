import { useRef, useState } from 'react';
import { useFigureCanvas } from '@figures/useFigureCanvas';
import { fade, useThemeColors } from '@figures/useThemeColors';
import { Canvas, FigureBody, Readout } from '@figures/controls';
import { box, circle, fillRoundRect, frame, label, polyline } from '@figures/plot';

const FAMILIES = [
  { name: 'ResNet', short: 'learn a residual update around an identity path', change: 'baseline idea' },
  { name: 'v2', short: 'normalise and activate before the weight layers', change: 'ordering' },
  { name: 'Wide ResNet', short: 'spend capacity on wider residual branches', change: 'width' },
  { name: 'ResNeXt', short: 'sum several equally shaped transformations', change: 'cardinality' },
  { name: 'SE', short: 'reweight channels before adding the residual', change: 'channel attention' },
];

export default function ResidualFamilyMap() {
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
      const centre = { x: width * 0.5, y: height * 0.45 };
      const nodeW = Math.min(112, width * 0.19);
      const nodeH = 50;
      const positions = [
        { x: centre.x - nodeW / 2, y: centre.y - nodeH / 2 },
        { x: width * 0.08, y: height * 0.14 },
        { x: width * 0.73, y: height * 0.13 },
        { x: width * 0.08, y: height * 0.68 },
        { x: width * 0.73, y: height * 0.68 },
      ];
      const boxes = positions.map((p) => box(p.x, p.y, nodeW, nodeH));
      hitRef.current = boxes;

      for (let i = 1; i < boxes.length; i += 1) {
        const b = boxes[i];
        polyline(
          ctx,
          [[centre.x, centre.y], [b.x + b.w / 2, b.y + b.h / 2]],
          i === selected ? fade(colors.accent, 0.8) : fade(colors.faint, 0.38),
          i === selected ? 2.2 : 1.2,
        );
      }
      circle(ctx, centre.x, centre.y, 7, fade(colors.accent, 0.2), 1);

      boxes.forEach((b, i) => {
        fillRoundRect(ctx, b, i === selected ? fade(colors.accent, 0.17) : fade(colors['surface-sunk'], 0.74), 10);
        frame(ctx, b, i === selected ? colors.accent : colors.border, 10);
        label(ctx, FAMILIES[i].name, b.x + b.w / 2, b.y + b.h / 2, i === selected ? colors['accent-deep'] : colors.ink, {
          size: i === 2 ? 9 : 10,
          align: 'center',
          baseline: 'middle',
          weight: '650',
        });
      });
      label(ctx, 'tap a branch', 16, height - 12, colors.faint, { size: 10 });
    },
    { aspect: 1.8, animate: false },
  );

  return (
    <FigureBody>
      <Canvas
        canvasRef={canvasRef}
        aspect={aspect}
        label="A clickable map of residual-network descendants and the design axis each changes."
        className="cursor-pointer"
        onPointerDown={(e) => choose(e.clientX, e.clientY, e.currentTarget)}
        onPointerMove={(e) => {
          if (e.pointerType === 'mouse') choose(e.clientX, e.clientY, e.currentTarget);
        }}
      />
      <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Readout label={FAMILIES[selected].name} value={FAMILIES[selected].short} />
        <Readout label="design axis" value={FAMILIES[selected].change} />
      </div>
    </FigureBody>
  );
}
