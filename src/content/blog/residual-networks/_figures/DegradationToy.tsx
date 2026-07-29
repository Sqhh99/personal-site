import { useMemo, useState } from 'react';
import { useFigureCanvas } from '@figures/useFigureCanvas';
import { fade, useThemeColors } from '@figures/useThemeColors';
import { Canvas, FigureBody, Panel, Readout, Slider } from '@figures/controls';
import { box, bx, byUp, dot, label, polyline } from '@figures/plot';

const DEPTHS = Array.from({ length: 75 }, (_, i) => 8 + i * 2);

export default function DegradationToy() {
  const colors = useThemeColors();
  const [depth, setDepth] = useState(56);
  const [difficulty, setDifficulty] = useState(0.62);

  const curves = useMemo(() => {
    const plainTrain = DEPTHS.map((d) => {
      const useful = 0.23 * (1 - Math.exp(-d / 24));
      const optimisation = difficulty * 0.22 * Math.max(0, (d - 34) / 116) ** 1.45;
      return 0.43 - useful + optimisation;
    });
    const residualTrain = DEPTHS.map(
      (d) => 0.43 - 0.29 * (1 - Math.exp(-d / 42)) + 0.015 * Math.max(0, (d - 118) / 32) ** 2,
    );
    return {
      plainTrain,
      residualTrain,
      plainVal: plainTrain.map((v, i) => v + 0.035 + 0.00016 * DEPTHS[i]),
      residualVal: residualTrain.map((v, i) => v + 0.035 + 0.00013 * DEPTHS[i]),
    };
  }, [difficulty]);

  const index = Math.max(0, Math.min(DEPTHS.length - 1, Math.round((depth - 8) / 2)));
  const gain = curves.plainVal[index] - curves.residualVal[index];

  const { canvasRef, aspect } = useFigureCanvas(
    (ctx, { width, height }) => {
      const pad = { left: 42, right: 18, top: 20, bottom: 32 };
      const plot = box(pad.left, pad.top, width - pad.left - pad.right, height - pad.top - pad.bottom);
      const yMin = 0.12;
      const yMax = 0.5;
      const y = (v: number) => byUp(plot, v - yMin, yMax - yMin);
      const x = (d: number) => bx(plot, (d - 8) / (156 - 8));

      for (const value of [0.2, 0.3, 0.4]) {
        const gy = y(value);
        polyline(ctx, [[plot.x, gy], [plot.x + plot.w, gy]], fade(colors.faint, 0.2), 1);
        label(ctx, `${Math.round(value * 100)}%`, plot.x - 7, gy, colors.faint, {
          size: 9,
          align: 'right',
          baseline: 'middle',
        });
      }

      const draw = (values: number[], color: string, widthLine: number, dashed = false) => {
        if (dashed) ctx.setLineDash([4, 4]);
        polyline(
          ctx,
          values.map((v, i) => [x(DEPTHS[i]), y(v)] as [number, number]),
          color,
          widthLine,
        );
        ctx.setLineDash([]);
      };

      draw(curves.plainVal, fade(colors.kraft, 0.9), 2.2);
      draw(curves.plainTrain, fade(colors.kraft, 0.55), 1.3, true);
      draw(curves.residualVal, colors.accent, 2.5);
      draw(curves.residualTrain, fade(colors.accent, 0.55), 1.3, true);

      const markerX = x(depth);
      polyline(ctx, [[markerX, plot.y], [markerX, plot.y + plot.h]], fade(colors.ink, 0.28), 1);
      dot(ctx, markerX, y(curves.plainVal[index]), 4, colors.kraft);
      dot(ctx, markerX, y(curves.residualVal[index]), 4, colors.accent);

      for (const d of [8, 32, 56, 100, 152]) {
        label(ctx, String(d), x(d), plot.y + plot.h + 8, colors.faint, {
          size: 9,
          align: 'center',
          baseline: 'top',
        });
      }
      label(ctx, 'depth →', plot.x + plot.w, height - 5, colors.muted, { size: 10, align: 'right' });
      label(ctx, 'plain', plot.x + 8, plot.y + 14, colors.kraft, { size: 10 });
      label(ctx, 'residual', plot.x + 50, plot.y + 14, colors.accent, { size: 10 });
      label(ctx, 'solid: validation · dashed: training', plot.x + plot.w, plot.y + 14, colors.faint, {
        size: 9,
        align: 'right',
      });
    },
    { aspect: 1.75, animate: false },
  );

  return (
    <FigureBody>
      <Canvas
        canvasRef={canvasRef}
        aspect={aspect}
        label="Computed schematic training and validation errors for plain and residual stacks as depth changes."
      />
      <Panel columns={2}>
        <Slider label="inspect depth" value={depth} min={8} max={156} step={2} onChange={setDepth} />
        <Slider
          label="plain-stack difficulty"
          value={difficulty}
          min={0.2}
          max={1}
          format={(v) => v.toFixed(2)}
          onChange={setDifficulty}
        />
      </Panel>
      <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
        <Readout label="plain validation" value={`${(curves.plainVal[index] * 100).toFixed(1)}%`} />
        <Readout label="residual validation" value={`${(curves.residualVal[index] * 100).toFixed(1)}%`} />
        <Readout label="residual advantage" value={`${(gain * 100).toFixed(1)} points`} hint="schematic, not benchmark data" />
      </div>
    </FigureBody>
  );
}
