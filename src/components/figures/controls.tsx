import { useEffect, useId, useRef, useState, type CSSProperties, type ReactNode, type RefObject } from 'react';

/**
 * Shared figure furniture.
 *
 * Layout contract (canvas-first — the plot must never be covered):
 *   <FigureBody>
 *     <FigureStage>
 *       <Canvas … />                 // sizes via aspect ratio; fully visible
 *       <PlayCorner … />             // optional — tiny 36px corner control
 *       <ParamsPopover>…</ParamsPopover>  // optional — ⋯ opens lightweight params
 *       <ChipBar>…</ChipBar>         // optional — compact family/preset chips
 *     </FigureStage>
 *   </FigureBody>
 *
 * Live values belong in the canvas draw loop (HUD text), not HTML overlays.
 * Do not reintroduce Dock (covers the plot) or Panel (replaces the plot below).
 */

export function Canvas({
  canvasRef,
  aspect,
  label,
  className = '',
  onPointerDown,
  onPointerMove,
  onPointerUp,
  onClick,
  style,
}: {
  canvasRef: RefObject<HTMLCanvasElement | null>;
  aspect: number;
  label: string;
  className?: string;
  onPointerDown?: (e: React.PointerEvent<HTMLCanvasElement>) => void;
  onPointerMove?: (e: React.PointerEvent<HTMLCanvasElement>) => void;
  onPointerUp?: (e: React.PointerEvent<HTMLCanvasElement>) => void;
  onClick?: (e: React.MouseEvent<HTMLCanvasElement>) => void;
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
      onClick={onClick}
    />
  );
}

/** Relative canvas host. Overlays must be tiny corner affordances — never a strip that eats the plot. */
export function FigureStage({ children }: { children: ReactNode }) {
  return <div className="relative isolate overflow-hidden bg-surface">{children}</div>;
}

/** Wraps a figure's canvas + optional corner affordances. Adds the card outline. */
export function FigureBody({ children }: { children: ReactNode }) {
  return <div className="overflow-hidden rounded-sm border border-line bg-surface">{children}</div>;
}

/** Compact 36px icon button used for play / params. */
export function IconButton({
  label,
  onClick,
  pressed,
  children,
  className = '',
}: {
  label: string;
  onClick: () => void;
  pressed?: boolean;
  children: ReactNode;
  className?: string;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      aria-pressed={pressed}
      onClick={onClick}
      className={`inline-flex size-9 items-center justify-center rounded-full border border-line/80 bg-surface/90 text-muted shadow-xs backdrop-blur-sm transition-colors hover:border-line-strong hover:text-ink ${
        pressed ? 'border-accent/50 text-accent-deep' : ''
      } ${className}`}
    >
      {children}
    </button>
  );
}

/** Tiny bottom-left play/pause that does not obscure the plot. */
export function PlayCorner({ playing, onChange }: { playing: boolean; onChange: (v: boolean) => void }) {
  return (
    <div className="absolute bottom-2 left-2 z-10">
      <IconButton label={playing ? 'Pause animation' : 'Play animation'} onClick={() => onChange(!playing)} pressed={playing}>
        {playing ? (
          <svg viewBox="0 0 24 24" className="size-3.5 fill-current" aria-hidden="true">
            <rect x="6" y="5" width="4" height="14" rx="1" />
            <rect x="14" y="5" width="4" height="14" rx="1" />
          </svg>
        ) : (
          <svg viewBox="0 0 24 24" className="size-3.5 fill-current" aria-hidden="true">
            <path d="M7 4.5v15l13-7.5z" />
          </svg>
        )}
      </IconButton>
    </div>
  );
}

/**
 * Bottom-right ⋯ that opens a lightweight popover for rare parameters.
 * Anchored to the corner so the main plot stays visible underneath the closed button;
 * when open the panel floats above empty margin rather than a permanent dock.
 */
export function ParamsPopover({
  children,
  label = 'Figure parameters',
  title = 'Parameters',
}: {
  children: ReactNode;
  label?: string;
  title?: string;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const panelId = useId();

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    const onPointer = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('keydown', onKey);
    document.addEventListener('mousedown', onPointer);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('mousedown', onPointer);
    };
  }, [open]);

  return (
    <div ref={rootRef} className="absolute bottom-2 right-2 z-10 flex flex-col items-end gap-1.5">
      {open && (
        <div
          id={panelId}
          role="dialog"
          aria-label={title}
          className="max-h-[min(52vh,22rem)] w-[min(18rem,calc(100vw-2.5rem))] overflow-y-auto rounded-sm border border-line/80 bg-surface/95 p-2.5 shadow-md backdrop-blur-md"
        >
          <div className="mb-2 font-mono text-[0.6rem] tracking-wider text-faint">{title}</div>
          <div className="grid grid-cols-1 gap-2.5">{children}</div>
        </div>
      )}
      <IconButton
        label={label}
        pressed={open}
        onClick={() => setOpen((v) => !v)}
        className="font-mono text-[0.85rem] leading-none"
      >
        <span aria-hidden="true">⋯</span>
      </IconButton>
    </div>
  );
}

/** Compact chip strip for family/preset pickers — sits in a corner, never replaces the diagram. */
export function ChipBar({ children, label }: { children: ReactNode; label?: string }) {
  return (
    <div
      role="group"
      aria-label={label}
      className="absolute left-2 right-12 top-2 z-10 flex max-w-[calc(100%-3.5rem)] flex-wrap gap-1"
    >
      {children}
    </div>
  );
}

export function Chip({
  label,
  detail,
  selected,
  onSelect,
}: {
  label: string;
  detail?: string;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      onClick={onSelect}
      className={`rounded-sm border px-2 py-1 text-left transition-colors ${
        selected ? 'border-accent/50 bg-accent/10' : 'border-line/80 bg-surface/85 hover:border-line-strong'
      }`}
    >
      <div className={`font-mono text-[0.65rem] tracking-wider ${selected ? 'text-accent-deep' : 'text-ink'}`}>{label}</div>
      {detail && <div className="font-mono text-[0.55rem] text-faint">{detail}</div>}
    </button>
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
    <label className="block min-w-0">
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
        className="mt-1.5 h-1.5 w-full cursor-pointer appearance-none rounded-full bg-line/80"
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
      className={`inline-flex items-center gap-1.5 rounded-sm border px-2 py-1 font-mono text-[0.65rem] tracking-wider transition-colors ${
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
      <div className="inline-flex max-w-full flex-wrap gap-0.5 rounded-sm border border-line/80 bg-sunk/80 p-0.5">
        {options.map((option) => {
          const selected = option.value === value;
          return (
            <button
              key={option.value}
              type="button"
              aria-pressed={selected}
              onClick={() => onChange(option.value)}
              className={`rounded-sm px-2 py-1 font-mono text-[0.65rem] tracking-wider transition-colors ${
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
