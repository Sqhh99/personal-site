import type { CSSProperties, ReactNode, RefObject } from 'react';

/**
 * Shared figure furniture. Every interactive in the essays is built from these,
 * so the controls read as one instrument panel rather than twelve improvisations.
 *
 * Layout contract (overlay-only — nothing may sit under the canvas):
 *   <FigureBody>
 *     <FigureStage>
 *       <Canvas … />
 *       <Metrics>…</Metrics>   // optional — top-left live-value chips
 *       <Toolbar>…</Toolbar>   // optional — top-right play / toggles / segmented
 *       <Dock>…</Dock>         // optional — bottom-inside-stage sliders & denser controls
 *     </FigureStage>
 *   </FigureBody>
 *
 * All operations and value displays render as overlays INSIDE FigureStage
 * (absolutely positioned over the canvas). A sibling block after </FigureStage>
 * is forbidden — do not reintroduce an under-canvas Panel.
 */

export function Canvas({
  canvasRef,
  aspect,
  label,
  className = '',
  onPointerDown,
  onPointerMove,
  onPointerUp,
  style,
}: {
  canvasRef: RefObject<HTMLCanvasElement | null>;
  aspect: number;
  label: string;
  className?: string;
  onPointerDown?: (e: React.PointerEvent<HTMLCanvasElement>) => void;
  onPointerMove?: (e: React.PointerEvent<HTMLCanvasElement>) => void;
  onPointerUp?: (e: React.PointerEvent<HTMLCanvasElement>) => void;
  style?: CSSProperties;
}) {
  return (
    <canvas
      ref={canvasRef}
      role="img"
      aria-label={label}
      className={`block w-full touch-none select-none bg-surface ${className}`}
      style={{ aspectRatio: String(aspect), ...style }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
    />
  );
}

/** Relative canvas host: overlays (Metrics / Toolbar / Dock) position against this. */
export function FigureStage({ children }: { children: ReactNode }) {
  return <div className="relative isolate overflow-hidden bg-surface">{children}</div>;
}

/**
 * Bottom-inside-stage control dock. Soft translucent backdrop so the plot stays
 * readable underneath. Replaces the old under-canvas Panel entirely.
 */
export function Dock({ children, columns = 2 }: { children: ReactNode; columns?: 1 | 2 | 3 }) {
  const cols = { 1: 'sm:grid-cols-1', 2: 'sm:grid-cols-2', 3: 'sm:grid-cols-3' }[columns];
  return (
    <div
      className={`absolute inset-x-0 bottom-0 z-10 grid grid-cols-1 gap-x-3 gap-y-2 border-t border-line/50 bg-surface/78 px-2.5 py-2 shadow-[0_-8px_24px_rgba(0,0,0,0.04)] backdrop-blur-md ${cols}`}
    >
      {children}
    </div>
  );
}

/** Live values floated onto the canvas — top-left chips. */
export function Metrics({ children }: { children: ReactNode }) {
  return (
    <div className="pointer-events-none absolute left-1.5 top-1.5 z-10 flex max-w-[min(100%-0.75rem,72%)] flex-wrap gap-1 sm:left-2 sm:top-2 sm:gap-1.5">
      {children}
    </div>
  );
}

/** Play / toggles / segmented controls floated onto the canvas — top-right. */
export function Toolbar({ children }: { children: ReactNode }) {
  return (
    <div className="absolute right-1.5 top-1.5 z-10 flex max-w-[min(100%-0.75rem,78%)] flex-wrap items-center justify-end gap-1 sm:right-2 sm:top-2 sm:gap-1.5">
      {children}
    </div>
  );
}

export function Slider({
  label,
  value,
  min,
  max,
  step = 0.01,
  format,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  format?: (v: number) => string;
  onChange: (v: number) => void;
}) {
  return (
    <label className="block min-h-11 min-w-0">
      <span className="flex items-baseline justify-between gap-2">
        <span className="label text-[0.6rem] leading-none">{label}</span>
        <span className="font-mono text-[0.65rem] tabular-nums text-accent-deep">
          {format ? format(value) : value.toFixed(2)}
        </span>
      </span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="mt-1.5 h-2 w-full cursor-pointer appearance-none rounded-full bg-line/80"
        style={{ accentColor: 'var(--accent)' }}
      />
    </label>
  );
}

export function Toggle({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className={`inline-flex min-h-11 items-center gap-1.5 rounded-sm border px-2.5 py-1.5 font-mono text-[0.65rem] tracking-wider shadow-xs backdrop-blur-sm transition-colors ${
        checked
          ? 'border-accent/50 bg-accent/15 text-accent-deep'
          : 'border-line/80 bg-surface/85 text-muted hover:border-line-strong hover:text-ink'
      }`}
    >
      <span
        className={`size-1.5 rounded-full transition-colors ${checked ? 'bg-accent' : 'bg-line-strong'}`}
        aria-hidden="true"
      />
      {label}
    </button>
  );
}

export function SegmentedControl<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label?: string;
  value: T;
  options: ReadonlyArray<{ value: T; label: string }>;
  onChange: (v: T) => void;
}) {
  return (
    <div role="group" aria-label={label} className="min-w-0">
      {label && <span className="label mb-1 block text-[0.6rem] leading-none">{label}</span>}
      <div className="inline-flex max-w-full flex-wrap gap-0.5 rounded-sm border border-line/80 bg-sunk/80 p-0.5 shadow-xs backdrop-blur-sm">
        {options.map((option) => {
          const selected = option.value === value;
          return (
            <button
              key={option.value}
              type="button"
              aria-pressed={selected}
              onClick={() => onChange(option.value)}
              className={`min-h-11 rounded-sm px-2.5 py-1.5 font-mono text-[0.65rem] tracking-wider transition-colors ${
                selected ? 'bg-surface text-accent-deep shadow-xs' : 'text-muted hover:text-ink'
              }`}
            >
              {option.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

export function PlayPause({ playing, onChange }: { playing: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      type="button"
      onClick={() => onChange(!playing)}
      aria-label={playing ? 'Pause animation' : 'Play animation'}
      className="inline-flex min-h-11 items-center gap-1.5 rounded-sm border border-line/80 bg-surface/85 px-2.5 py-1.5 font-mono text-[0.65rem] tracking-wider text-muted shadow-xs backdrop-blur-sm transition-colors hover:border-line-strong hover:text-ink"
    >
      {playing ? (
        <svg viewBox="0 0 24 24" className="size-2.5 fill-current" aria-hidden="true">
          <rect x="6" y="5" width="4" height="14" rx="1" />
          <rect x="14" y="5" width="4" height="14" rx="1" />
        </svg>
      ) : (
        <svg viewBox="0 0 24 24" className="size-2.5 fill-current" aria-hidden="true">
          <path d="M7 4.5v15l13-7.5z" />
        </svg>
      )}
      <span>{playing ? 'Pause' : 'Play'}</span>
    </button>
  );
}

/** Compact on-canvas key/value chip. */
export function Readout({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="pointer-events-auto rounded-sm border border-line/80 bg-surface/88 px-1.5 py-1 shadow-xs backdrop-blur-sm sm:px-2">
      <div className="label text-[0.55rem] leading-none">{label}</div>
      <div className="mt-0.5 font-mono text-[0.7rem] leading-tight tabular-nums text-ink">{value}</div>
      {hint && (
        <div className="mt-0.5 hidden font-mono text-[0.55rem] leading-none text-faint sm:block">{hint}</div>
      )}
    </div>
  );
}

/** Wraps a figure's canvas + in-stage overlays. Adds the card outline. */
export function FigureBody({ children }: { children: ReactNode }) {
  return <div className="overflow-hidden rounded-sm border border-line bg-surface">{children}</div>;
}
