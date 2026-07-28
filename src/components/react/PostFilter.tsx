import { useEffect, useMemo, useState } from 'react';

const ALL = 'All';

interface Props {
  /** Tags that actually occur in the post list, in display order. */
  tags: string[];
  /** Id of the server-rendered grid this island filters. */
  targetId: string;
  emptyId: string;
}

export default function PostFilter({ tags, targetId, emptyId }: Props) {
  const [active, setActive] = useState(ALL);
  const [query, setQuery] = useState('');
  const [visibleCount, setVisibleCount] = useState<number | null>(null);

  const options = useMemo(() => [ALL, ...tags], [tags]);

  useEffect(() => {
    const grid = document.getElementById(targetId);
    const empty = document.getElementById(emptyId);
    if (!grid) return;

    const term = query.trim().toLowerCase();
    let shown = 0;

    for (const card of grid.querySelectorAll<HTMLElement>('[data-post]')) {
      const matchesTag = active === ALL || card.dataset.tag === active;
      const matchesTerm = !term || (card.dataset.search ?? '').includes(term);
      const visible = matchesTag && matchesTerm;

      card.hidden = !visible;
      if (visible) {
        card.classList.add('is-visible');
        shown += 1;
      }
    }

    setVisibleCount(shown);
    if (empty) empty.hidden = shown > 0;
  }, [active, query, targetId, emptyId]);

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <label className="group relative flex h-12 w-full max-w-md items-center gap-3 rounded-xl border border-line bg-surface/90 px-4 shadow-2xs transition-all duration-200 focus-within:border-accent focus-within:ring-2 focus-within:ring-accent/20 hover:border-line-strong">
          <svg
            viewBox="0 0 24 24"
            className="size-4 shrink-0 text-faint transition-colors group-focus-within:text-accent"
            fill="none"
            stroke="currentColor"
            strokeWidth={1.8}
            strokeLinecap="round"
            aria-hidden="true"
          >
            <circle cx="11" cy="11" r="7" />
            <path d="m20 20-4-4" />
          </svg>
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search posts by title, tag, or topic..."
            aria-label="Search posts"
            className="w-full bg-transparent text-[0.925rem] text-ink outline-none placeholder:text-faint/80"
          />
          {query && (
            <button
              type="button"
              onClick={() => setQuery('')}
              aria-label="Clear search query"
              className="grid size-5 place-items-center rounded-full bg-surface-sunk text-faint hover:text-ink transition-colors"
            >
              <svg viewBox="0 0 24 24" className="size-3" fill="none" stroke="currentColor" strokeWidth={2}>
                <path d="M18 6L6 18M6 6l12 12" />
              </svg>
            </button>
          )}
        </label>

        {visibleCount !== null && (
          <p className="font-mono text-[0.725rem] tracking-wide text-faint">
            Showing <span className="font-medium text-ink">{visibleCount}</span> {visibleCount === 1 ? 'post' : 'posts'}
          </p>
        )}
      </div>

      <div className="flex flex-wrap gap-2" role="group" aria-label="Filter by tag">
        {options.map((tag) => {
          const selected = tag === active;
          return (
            <button
              key={tag}
              type="button"
              aria-pressed={selected}
              onClick={() => setActive(tag)}
              className={[
                'rounded-full border px-4 py-1.5 font-mono text-[0.7rem] tracking-wider transition-all duration-200 active:scale-95',
                selected
                  ? 'border-accent bg-accent text-surface shadow-xs font-semibold'
                  : 'border-line bg-surface/80 text-muted hover:border-line-strong hover:text-ink hover:bg-surface-sunk/50',
              ].join(' ')}
            >
              {tag}
            </button>
          );
        })}
      </div>
    </div>
  );
}
