import { useEffect, useMemo, useState } from 'react';

const ALL = 'All';

interface Props {
  /** Tags that actually occur in the post list, in display order. */
  tags: string[];
  /** Id of the server-rendered grid this island filters. */
  targetId: string;
  emptyId: string;
}

/**
 * Renders only the controls. The cards themselves stay server-rendered Astro
 * markup — this toggles their visibility — so every post is still in the HTML
 * for crawlers and for readers without JavaScript.
 */
export default function PostFilter({ tags, targetId, emptyId }: Props) {
  const [active, setActive] = useState(ALL);
  const [query, setQuery] = useState('');

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
        // A card that was hidden when the reveal observer first ran would stay
        // at opacity 0 forever, so mark anything we un-hide as already revealed.
        card.classList.add('is-visible');
        shown += 1;
      }
    }

    if (empty) empty.hidden = shown > 0;
  }, [active, query, targetId, emptyId]);

  return (
    <div className="flex flex-col gap-5">
      <label className="flex h-12 items-center gap-3 rounded-xl border border-line bg-surface px-4 transition-colors focus-within:border-accent">
        <svg
          viewBox="0 0 24 24"
          className="size-4 shrink-0 text-faint"
          fill="none"
          stroke="currentColor"
          strokeWidth={1.7}
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
          placeholder="Search posts"
          aria-label="Search posts"
          className="w-full bg-transparent text-[0.95rem] text-ink outline-none placeholder:text-faint"
        />
      </label>

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
                'rounded-full border px-3.5 py-1.5 font-mono text-[0.7rem] tracking-wider transition-colors duration-200',
                selected
                  ? 'border-transparent bg-accent text-surface'
                  : 'border-line bg-surface text-muted hover:border-line-strong hover:text-ink',
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
