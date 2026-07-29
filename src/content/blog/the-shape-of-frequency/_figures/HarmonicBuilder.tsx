import { useState } from 'react';
import { useFigureCanvas } from '@figures/useFigureCanvas';
import { fade, useThemeColors } from '@figures/useThemeColors';
import { Canvas, FigureBody, Panel, PlayPause, Slider, Toggle } from '@figures/controls';
import { TAU, baseline, box, curve, label } from '@figures/plot';

const HARMONICS = [1, 2, 3];

/**
 * Three harmonics with independent amplitude and phase, and their sum. The point
 * of the figure is that the sum can look nothing like its parts.
 */
export default function HarmonicBuilder() {
  const colors = useThemeColors();
  const [amps, setAmps] = useState([1, 0.5, 0.3]);
  const [phases, setPhases] = useState([0, 0, 0]);
  const [showParts, setShowParts] = useState(true);
  const [playing, setPlaying] = useState(true);

  const setAt = (list: number[], i: number, v: number) =>
    list.map((old, j) => (i === j ? v : old));

  const { canvasRef, aspect } = useFigureCanvas(
    (ctx, { width, height, time }) => {
      const drift = playing ? time * 0.35 : 0;
      const pad = 18;
      const plot = box(pad, pad, width - pad * 2, height - pad * 2);

      const component = (i: number) => (u: number) =>
        amps[i] * Math.sin(HARMONICS[i] * TAU * (u - drift) + phases[i]);

      const total = amps.reduce((a, b) => a + b, 0);
      const range = Math.max(1.05, total * 1.05);

      baseline(ctx, plot, fade(colors.faint, 0.45));

      if (showParts) {
        const tints = [colors.kraft, colors.faint, colors['border-strong']];
        HARMONICS.forEach((_, i) => {
          curve(ctx, plot, component(i), fade(tints[i], 0.85), { range, width: 1.5 });
        });
      }

      curve(
        ctx,
        plot,
        (u) => component(0)(u) + component(1)(u) + component(2)(u),
        colors.accent,
        { range, width: 2.75 },
      );

      label(ctx, 'sum', plot.x + 6, plot.y + 14, colors.accent, { size: 10 });
      if (showParts) {
        label(ctx, 'components', plot.x + 44, plot.y + 14, colors.faint, { size: 10 });
      }
    },
    { aspect: 21 / 9, animate: playing },
  );

  return (
    <FigureBody>
      <Canvas
        canvasRef={canvasRef}
        aspect={aspect}
        label="Three sine harmonics and the wave formed by adding them together."
      />
      <Panel columns={3}>
        {HARMONICS.map((h, i) => (
          <Slider
            key={`a${h}`}
            label={`amplitude · ${h}f`}
            value={amps[i]}
            min={0}
            max={1}
            onChange={(v) => setAmps(setAt(amps, i, v))}
          />
        ))}
        {HARMONICS.map((h, i) => (
          <Slider
            key={`p${h}`}
            label={`phase · ${h}f`}
            value={phases[i]}
            min={0}
            max={TAU}
            format={(v) => `${(v / Math.PI).toFixed(2)}π`}
            onChange={(v) => setPhases(setAt(phases, i, v))}
          />
        ))}
      </Panel>
      <div className="mt-4 flex flex-wrap items-center gap-2">
        <PlayPause playing={playing} onChange={setPlaying} />
        <Toggle label="Show components" checked={showParts} onChange={setShowParts} />
      </div>
    </FigureBody>
  );
}
