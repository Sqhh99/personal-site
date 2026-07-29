import { useState } from 'react';
import { useFigureCanvas } from '@figures/useFigureCanvas';
import { fade, useThemeColors } from '@figures/useThemeColors';
import { Canvas, FigureBody, Panel, Readout, SegmentedControl, Slider } from '@figures/controls';
import { box, circle, fillRoundRect, frame, label, polyline } from '@figures/plot';

type Variant = 'concat' | 'add' | 'nested';

export default function SkipVariants() {
  const colors = useThemeColors();
  const [variant, setVariant] = useState<Variant>('concat');
  const [levels, setLevels] = useState(3);

  const descriptions = {
    concat: { merge: 'concatenate channels', width: '2C before fusion', cost: 2 },
    add: { merge: 'element-wise addition', width: 'C throughout', cost: 1 },
    nested: { merge: 'densely refined skips', width: 'several fusion nodes', cost: levels + 1 },
  };

  const { canvasRef, aspect } = useFigureCanvas(
    (ctx, { width, height }) => {
      const left = { x: 72, y: height * 0.62 };
      const right = { x: width - 72, y: height * 0.62 };
      const topY = height * 0.2;
      const cardW = Math.min(94, width * 0.18);
      const cardH = 48;
      const drawNode = (x: number, y: number, text: string, active = false) => {
        const b = box(x - cardW / 2, y - cardH / 2, cardW, cardH);
        fillRoundRect(ctx, b, active ? fade(colors.accent, 0.17) : fade(colors['surface-sunk'], 0.78), 9);
        frame(ctx, b, active ? colors.accent : colors.border, 9);
        label(ctx, text, x, y, active ? colors['accent-deep'] : colors.ink, {
          size: 10,
          align: 'center',
          baseline: 'middle',
        });
      };

      drawNode(left.x, left.y, 'encoder C');
      drawNode(right.x, right.y, variant === 'concat' ? 'decoder 2C' : 'decoder C', true);
      polyline(ctx, [[left.x + cardW / 2, left.y], [right.x - cardW / 2, right.y]], fade(colors.ink, 0.35), 1.4);

      if (variant === 'concat' || variant === 'add') {
        const mergeX = width * 0.67;
        polyline(
          ctx,
          [
            [left.x, left.y - cardH / 2],
            [left.x, topY],
            [mergeX, topY],
            [mergeX, right.y - cardH / 2],
          ],
          colors.kraft,
          2.2,
        );
        circle(ctx, mergeX, topY, 13, fade(colors.accent, 0.65), 1.5);
        label(ctx, variant === 'concat' ? '∥' : '+', mergeX, topY, colors.accent, {
          size: 15,
          align: 'center',
          baseline: 'middle',
          weight: '650',
        });
        label(ctx, variant === 'concat' ? 'channel concat' : 'aligned addition', width / 2, topY - 18, colors.muted, {
          size: 10,
          align: 'center',
        });
      } else {
        let previousX = left.x;
        for (let i = 0; i < levels; i += 1) {
          const x = left.x + ((right.x - left.x) * (i + 1)) / (levels + 1);
          const y = topY + (i % 2) * 54;
          polyline(ctx, [[previousX, i === 0 ? left.y - cardH / 2 : topY + ((i - 1) % 2) * 54], [x, y]], fade(colors.kraft, 0.75), 1.7);
          circle(ctx, x, y, 9, fade(colors.accent, 0.75), 1.6);
          label(ctx, `x${i + 1}`, x, y + 3, colors.accent, { size: 8, align: 'center' });
          polyline(ctx, [[left.x, left.y - cardH / 2], [x, y]], fade(colors.faint, 0.28), 1);
          previousX = x;
        }
        polyline(ctx, [[previousX, topY + ((levels - 1) % 2) * 54], [right.x, right.y - cardH / 2]], fade(colors.kraft, 0.75), 1.7);
        label(ctx, 'nested refinement', width / 2, 18, colors.muted, { size: 10, align: 'center' });
      }
      label(ctx, 'same-resolution feature route', width / 2, height - 13, colors.faint, { size: 10, align: 'center' });
    },
    { aspect: 1.9, animate: false },
  );

  const selected = descriptions[variant];

  return (
    <FigureBody>
      <Canvas
        canvasRef={canvasRef}
        aspect={aspect}
        label="Three interactive skip-connection patterns: concatenation, addition, and nested refinement."
      />
      <Panel columns={2}>
        <SegmentedControl
          label="skip variant"
          value={variant}
          options={[
            { value: 'concat', label: 'concatenate' },
            { value: 'add', label: 'add' },
            { value: 'nested', label: 'nested ++' },
          ]}
          onChange={setVariant}
        />
        <Slider
          label="nested refinement nodes"
          value={levels}
          min={2}
          max={5}
          step={1}
          format={(v) => String(v)}
          onChange={setLevels}
        />
      </Panel>
      <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
        <Readout label="merge" value={selected.merge} />
        <Readout label="feature width" value={selected.width} />
        <Readout label="relative fusion work" value={`${selected.cost.toFixed(1)}×`} hint="schematic" />
      </div>
    </FigureBody>
  );
}
