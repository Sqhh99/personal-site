import type { CSSProperties, ReactNode, RefObject } from 'react';

/**
 * Shared figure furniture. Every interactive in the essays is built from these,
 * so the controls read as one instrument panel rather than twelve improvisations.
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
      className={`block w-full touch-none select-none rounded-xl bg-surface ${className}`}
      style={{ aspectRatio: String(aspect), ...style }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
    />
  );
}

export function Panel({ children, columns = 2 }: { children: ReactNode; columns?: 1 | 2 | 3 }) {
  const cols = { 1: 'sm:grid-cols-1', 2: 'sm:grid-cols-2', 3: 'sm:grid-cols-3' }[columns];
  return <div className={`mt-4 grid grid-cols-1 gap-x-6 gap-y-3 ${cols}`}>{children}</div>;
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
    <label className="block">
      <span className="flex items-baseline justify-between gap-3">
        <span className="label">{label}</span>
        <span className="font-mono text-[0.7rem] tabular-nums text-accent-deep">
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
        className="mt-1.5 h-1.5 w-full cursor-pointer appearance-none rounded-full bg-sunk"
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
      className={`inline-flex items-center gap-2.5 rounded-full border px-3 py-1.5 font-mono text-[0.7rem] tracking-wider transition-colors ${
        checked
          ? 'border-accent/50 bg-accent/10 text-accent-deep'
          : 'border-line bg-surface text-muted hover:border-line-strong hover:text-ink'
      }`}
    >
      <span
        className={`size-2 rounded-full transition-colors ${checked ? 'bg-accent' : 'bg-line-strong'}`}
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
    <div role="group" aria-label={label}>
      {label && <span className="label mb-1.5 block">{label}</span>}
      <div className="inline-flex flex-wrap gap-1 rounded-lg border border-line bg-sunk p-1">
        {options.map((option) => {
          const selected = option.value === value;
          return (
            <button
              key={option.value}
              type="button"
              aria-pressed={selected}
              onClick={() => onChange(option.value)}
              className={`rounded-md px-2.5 py-1 font-mono text-[0.7rem] tracking-wider transition-colors ${
                selected
                  ? 'bg-surface text-accent-deep shadow-xs'
                  : 'text-muted hover:text-ink'
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
      className="inline-flex items-center gap-2 rounded-full border border-line bg-surface px-3 py-1.5 font-mono text-[0.7rem] tracking-wider text-muted transition-colors hover:border-line-strong hover:text-ink"
    >
      {playing ? (
        <svg viewBox="0 0 24 24" className="size-3 fill-current" aria-hidden="true">
          <rect x="6" y="5" width="4" height="14" rx="1" />
          <rect x="14" y="5" width="4" height="14" rx="1" />
        </svg>
      ) : (
        <svg viewBox="0 0 24 24" className="size-3 fill-current" aria-hidden="true">
          <path d="M7 4.5v15l13-7.5z" />
        </svg>
      )}
      {playing ? 'Pause' : 'Play'}
    </button>
  );
}

/** A small key/value readout for derived quantities the reader should watch. */
export function Readout({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-lg border border-line bg-sunk/50 px-3 py-2">
      <div className="label">{label}</div>
      <div className="mt-0.5 font-mono text-sm tabular-nums text-ink">{value}</div>
      {hint && <div className="mt-0.5 font-mono text-[0.65rem] text-faint">{hint}</div>}
    </div>
  );
}

/** Wraps a figure's canvas + controls. Adds the card chrome. */
export function FigureBody({ children }: { children: ReactNode }) {
  return <div className="rounded-2xl border border-line bg-surface p-3 sm:p-4">{children}</div>;
}
