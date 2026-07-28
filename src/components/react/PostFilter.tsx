import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';

export interface PostFilterLabels {
  searchPlaceholder?: string;
  filterAll?: string;
  showing?: string;
  postSingular?: string;
  postPlural?: string;
  emptyText?: string;
  previousPage?: string;
  nextPage?: string;
  pageStatus?: string;
  pagination?: string;
  searchAria?: string;
  clearSearch?: string;
  filterByTag?: string;
}

interface Props {
  /** Tags that actually occur in the post list, in display order. */
  tags: string[];
  /** Id of the server-rendered grid this island filters. */
  targetId: string;
  emptyId: string;
  /** Server pager to hide while a site-wide filter is active. */
  ssrPagerId: string;
  /** Empty server-rendered element where the filtered pager is portalled. */
  clientPagerId: string;
  pageSize: number;
  currentPage: number;
  labels?: PostFilterLabels;
}

export default function PostFilter({
  tags,
  targetId,
  emptyId,
  ssrPagerId,
  clientPagerId,
  pageSize,
  currentPage,
  labels = {},
}: Props) {
  const filterAllLabel = labels.filterAll ?? 'All';
  const [active, setActive] = useState(filterAllLabel);
  const [query, setQuery] = useState('');
  const [visibleCount, setVisibleCount] = useState<number | null>(null);
  const [matchedCount, setMatchedCount] = useState(0);
  const [filterPage, setFilterPage] = useState(1);
  const [pagerTarget, setPagerTarget] = useState<HTMLElement | null>(null);

  const options = useMemo(() => [filterAllLabel, ...tags], [tags, filterAllLabel]);
  const filtering = active !== filterAllLabel || query.trim().length > 0;
  const totalFilterPages = Math.max(1, Math.ceil(matchedCount / pageSize));
  const activeFilterPage = Math.min(filterPage, totalFilterPages);

  useEffect(() => {
    setPagerTarget(document.getElementById(clientPagerId));
  }, [clientPagerId]);

  useEffect(() => {
    const grid = document.getElementById(targetId);
    const empty = document.getElementById(emptyId);
    const ssrPager = document.getElementById(ssrPagerId);
    if (!grid) return;

    const term = query.trim().toLowerCase();
    const cards = Array.from(grid.querySelectorAll<HTMLElement>('[data-post]'));
    const matches = cards.filter((card) => {
      const matchesTag = active === filterAllLabel || card.dataset.tag === active;
      const matchesTerm = !term || (card.dataset.search ?? '').includes(term);
      return matchesTag && matchesTerm;
    });

    const totalPages = Math.max(1, Math.ceil(matches.length / pageSize));
    const page = filtering ? Math.min(filterPage, totalPages) : currentPage;
    const start = (page - 1) * pageSize;
    const visibleCards = new Set(matches.slice(start, start + pageSize));

    for (const card of cards) {
      card.hidden = !visibleCards.has(card);
      if (visibleCards.has(card)) {
        card.classList.add('is-visible');
      }
    }

    if (filtering && page !== filterPage) setFilterPage(page);
    setMatchedCount(matches.length);
    setVisibleCount(visibleCards.size);
    if (empty) empty.hidden = visibleCards.size > 0;
    if (ssrPager) ssrPager.hidden = filtering;
  }, [
    active,
    query,
    filterPage,
    filtering,
    targetId,
    emptyId,
    ssrPagerId,
    filterAllLabel,
    pageSize,
    currentPage,
  ]);

  const postUnit = visibleCount === 1 ? (labels.postSingular ?? 'post') : (labels.postPlural ?? 'posts');
  const pageStatus = (labels.pageStatus ?? 'Page {current} of {total}')
    .replace('{current}', String(activeFilterPage))
    .replace('{total}', String(totalFilterPages));

  const changeFilterPage = (page: number) => {
    setFilterPage(page);
    document.getElementById(targetId)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  const pagerControlClass =
    'inline-flex min-w-20 items-center justify-center rounded-full border border-line bg-surface/80 px-3 py-2 font-mono text-[0.7rem] tracking-wider text-muted transition-colors';

  return (
    <>
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
              onChange={(event) => {
                setQuery(event.target.value);
                setFilterPage(1);
              }}
              placeholder={labels.searchPlaceholder ?? 'Search posts by title, tag, or topic...'}
              aria-label={labels.searchAria ?? 'Search writing'}
              className="w-full bg-transparent text-[0.925rem] text-ink outline-none placeholder:text-faint/80"
            />
            {query && (
              <button
                type="button"
                onClick={() => {
                  setQuery('');
                  setFilterPage(1);
                }}
                aria-label={labels.clearSearch ?? 'Clear search query'}
                className="grid size-5 place-items-center rounded-full bg-surface-sunk text-faint hover:text-ink transition-colors"
              >
                <svg viewBox="0 0 24 24" className="size-3" fill="none" stroke="currentColor" strokeWidth={2}>
                  <path d="M18 6L6 18M6 6l12 12" />
                </svg>
              </button>
            )}
          </label>

          {visibleCount !== null && (
            <p className="font-mono text-[0.725rem] tracking-wide text-faint" aria-live="polite">
              {labels.showing ?? 'Showing'} <span className="font-medium text-ink">{visibleCount}</span> {postUnit}
            </p>
          )}
        </div>

        <div className="flex flex-wrap gap-2" role="group" aria-label={labels.filterByTag ?? 'Filter by tag'}>
          {options.map((tag) => {
            const selected = tag === active;
            return (
              <button
                key={tag}
                type="button"
                aria-pressed={selected}
                onClick={() => {
                  setActive(tag);
                  setFilterPage(1);
                }}
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

      {pagerTarget && filtering && matchedCount > 0 && createPortal(
        <nav
          aria-label={labels.pagination ?? 'Writing pagination'}
          className="mt-12 flex items-center justify-between gap-3 border-t border-line/70 pt-7"
        >
          <button
            type="button"
            disabled={activeFilterPage <= 1}
            onClick={() => changeFilterPage(activeFilterPage - 1)}
            className={`${pagerControlClass} enabled:hover:border-line-strong enabled:hover:text-ink disabled:cursor-not-allowed disabled:opacity-45`}
          >
            <span aria-hidden="true">←</span>
            <span className="ml-2">{labels.previousPage ?? 'Previous'}</span>
          </button>

          <span className="text-center font-mono text-[0.7rem] tracking-wider text-faint">
            {pageStatus}
          </span>

          <button
            type="button"
            disabled={activeFilterPage >= totalFilterPages}
            onClick={() => changeFilterPage(activeFilterPage + 1)}
            className={`${pagerControlClass} enabled:hover:border-line-strong enabled:hover:text-ink disabled:cursor-not-allowed disabled:opacity-45`}
          >
            <span className="mr-2">{labels.nextPage ?? 'Next'}</span>
            <span aria-hidden="true">→</span>
          </button>
        </nav>,
        pagerTarget,
      )}
    </>
  );
}
