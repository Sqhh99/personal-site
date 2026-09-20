import { useEffect, useId, useRef, useState, type CSSProperties, type ReactNode, type RefObject } from 'react';
import { HUD_BAND } from '@figures/useFigureCanvas';

/**
 * Shared figure furniture.
 *
 * Layout contract (canvas-first — the plot must never be covered):
 *   <FigureBody>
 *     <FigureStage>
 *       <Canvas … />                 // plot sized by aspect ratio, under a HUD band
 *       <PlayCorner … />             // optional — 36px control in the band, top-right
 *       <ParamsPopover>…</ParamsPopover>  // optional — ⋯ in the band, opens params
 *       <ChipBar>…</ChipBar>         // optional — family/preset chips, band row one
 *     </FigureStage>
 *   </FigureBody>
 *
 * Every canvas starts with a HUD band (useFigureCanvas reserves HUD_BAND px):
 * live values written with plot.ts `hud()` sit on its left, the corner
 * controls on its right, and nothing in the band can collide with the plot
 * below. A figure with a ChipBar passes a taller `hudBand` so the chips take
 * row one and the readout row two (see CHIP_BAND).
 * Do not reintroduce Dock (covers the plot) or Panel (replaces the plot below).
 */

/** Where `hud()` starts its first line under a ChipBar: the 38px two-line chip row plus a gap. */
export const CHIP_HUD_Y = 44;
/** Band height for figures with a ChipBar: the chip row, then up to three HUD lines. */
export const CHIP_BAND = CHIP_HUD_Y + 40;

export function Canvas({
  canvasRef,
  aspect,
  hudBand = HUD_BAND,
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
  /** Must match what the figure passed to useFigureCanvas; the hook sets the same height once mounted. */
  hudBand?: number;
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
      // Server-rendered height, so the page does not shift when the hook
      // measures and applies the same value on hydration.
      style={{ height: `calc(${(100 / aspect).toFixed(4)}cqw + ${hudBand}px)`, ...style }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      onClick={onClick}
    />
  );
}

/** Relative canvas host. Overlays live in the HUD band — never a strip that eats the plot. */
export function FigureStage({ children }: { children: ReactNode }) {
  return <div className="relative isolate overflow-hidden bg-surface @container">{children}</div>;
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

/** Play/pause in the HUD band, to the left of the ⋯ button. */
export function PlayCorner({ playing, onChange }: { playing: boolean; onChange: (v: boolean) => void }) {
  return (
    <div className="absolute right-10.5 top-0.5 z-10">
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
 * ⋯ in the HUD band's top-right corner that opens a lightweight popover for rare
 * parameters. Closed, it occupies only the band; open, the panel floats over
 * the plot rather than being a permanent dock.
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
    <div ref={rootRef} className="absolute right-0.5 top-0.5 z-10 flex flex-col-reverse items-end gap-1.5">
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

/**
 * Compact chip strip for family/preset pickers — the first row of the HUD band
 * (pair with `hudBand: CHIP_BAND`). One row that scrolls sideways on narrow
 * screens, so it never wraps down over the readout.
 */
export function ChipBar({ children, label }: { children: ReactNode; label?: string }) {
  return (
    <div
      role="group"
      aria-label={label}
      className="absolute left-1 right-11 top-1 z-10 flex gap-1 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
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
      className={`shrink-0 rounded-sm border px-2 py-1 text-left transition-colors ${
        selected ? 'border-accent/50 bg-accent/10' : 'border-line/80 bg-surface/85 hover:border-line-strong'
      }`}
    >
      <div className={`font-mono text-[0.65rem] leading-tight tracking-wider ${selected ? 'text-accent-deep' : 'text-ink'}`}>{label}</div>
      {detail && <div className="font-mono text-[0.55rem] leading-tight text-faint">{detail}</div>}
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
