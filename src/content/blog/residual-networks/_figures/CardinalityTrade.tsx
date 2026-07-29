import { useState } from 'react';
import { useFigureCanvas } from '@figures/useFigureCanvas';
import { fade, useThemeColors } from '@figures/useThemeColors';
import { Canvas, FigureBody, Panel, Readout, Slider } from '@figures/controls';
import { box, fillRoundRect, frame, label, polyline } from '@figures/plot';

export default function CardinalityTrade() {
  const colors = useThemeColors();
  const [cardinality, setCardinality] = useState(8);
  const [branchWidth, setBranchWidth] = useState(8);
  const shown = Math.min(cardinality, 16);
  const approximateParams = cardinality * (2 * 64 * branchWidth + 9 * branchWidth * branchWidth);

  const { canvasRef, aspect } = useFigureCanvas(
    (ctx, { width, height }) => {
      const pad = 18;
      const input = box(pad, height * 0.38, 78, 50);
      const output = box(width - pad - 78, height * 0.38, 78, 50);
      const startX = input.x + input.w + 34;
      const endX = output.x - 34;
      const usableH = height - 42;
      const gap = usableH / shown;

      fillRoundRect(ctx, input, fade(colors['surface-sunk'], 0.8), 9);
      frame(ctx, input, colors.border, 9);
      label(ctx, '64 ch', input.x + input.w / 2, input.y + input.h / 2, colors.ink, {
        align: 'center',
        baseline: 'middle',
      });
      fillRoundRect(ctx, output, fade(colors.accent, 0.14), 9);
      frame(ctx, output, colors.accent, 9);
      label(ctx, 'sum', output.x + output.w / 2, output.y + output.h / 2, colors['accent-deep'], {
        align: 'center',
        baseline: 'middle',
      });

      for (let i = 0; i < shown; i += 1) {
        const y = 22 + gap * (i + 0.5);
        const branch = box(startX, y - Math.min(8, gap * 0.28), Math.max(28, endX - startX), Math.min(16, gap * 0.56));
        polyline(ctx, [[input.x + input.w, input.y + input.h / 2], [branch.x, y]], fade(colors.faint, 0.4), 1);
        fillRoundRect(ctx, branch, fade(colors.kraft, 0.2 + (i % 2) * 0.06), 4);
        frame(ctx, branch, fade(colors.kraft, 0.72), 4);
        polyline(ctx, [[branch.x + branch.w, y], [output.x, output.y + output.h / 2]], fade(colors.accent, 0.38), 1);
        if (gap > 16) {
          label(ctx, `${branchWidth} ch`, branch.x + branch.w / 2, y, colors.muted, {
            size: 8,
            align: 'center',
            baseline: 'middle',
          });
        }
      }
      if (cardinality > shown) {
        label(ctx, `+ ${cardinality - shown} more branches`, width / 2, height - 8, colors.faint, {
          size: 9,
          align: 'center',
        });
      }
      label(ctx, 'split', input.x + input.w + 8, input.y - 12, colors.muted, { size: 10 });
      label(ctx, 'transform', width / 2, 13, colors.muted, { size: 10, align: 'center' });
      label(ctx, 'merge', output.x - 8, output.y - 12, colors.muted, { size: 10, align: 'right' });
    },
    { aspect: 1.75, animate: false },
  );

  return (
    <FigureBody>
      <Canvas
        canvasRef={canvasRef}
        aspect={aspect}
        label="A split-transform-merge residual branch whose cardinality and branch width can be changed."
      />
      <Panel columns={2}>
        <Slider
          label="cardinality"
          value={cardinality}
          min={1}
          max={32}
          step={1}
          format={(v) => String(v)}
          onChange={setCardinality}
        />
        <Slider
          label="width per branch"
          value={branchWidth}
          min={4}
          max={32}
          step={4}
          format={(v) => `${v} ch`}
          onChange={setBranchWidth}
        />
      </Panel>
      <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
        <Readout label="parallel transforms" value={String(cardinality)} />
        <Readout label="aggregate width" value={`${cardinality * branchWidth} ch`} />
        <Readout label="toy parameter count" value={approximateParams.toLocaleString()} hint="three convolutions, biases omitted" />
      </div>
    </FigureBody>
  );
}
