# Task: Unified collection pagination architecture (blog + brief + future columns)

Repo: `/home/sqhh99/workspace/personal-site`  
Model preference: implement carefully, mature Sqhh99 writing-first UI (no vibe toys).  
Do **not** commit/push unless asked.

## Problem
- Blog list already has pagination (10/page, `/blog/page/N/`) but it is **blog-specific** (`BlogListPage`, `BlogPager`, `BLOG_PAGE_SIZE`, `getBlogListUrl`).
- Brief list (`/brief/`, `/zh/brief/`) dumps **all** briefs (~25+) with no pager.
- User will add more columns later — we must **not** copy-paste pager per column.

## Architecture (implement this)

### 1. Generic pagination core — `src/lib/pagination.ts`
Export (names can be refined but keep clear):

```ts
export const DEFAULT_PAGE_SIZE = 10;

export type PageSlice<T> = {
  items: T[];          // items on this page only (for true slice helpers)
  page: number;        // 1-based
  pageSize: number;
  totalItems: number;
  totalPages: number;  // max(1, ceil(total/pageSize))
  hasPrev: boolean;
  hasNext: boolean;
};

export function paginate<T>(all: T[], page: number, pageSize = DEFAULT_PAGE_SIZE): PageSlice<T>;

/** Page 1 → base `/blog/` ; page 2+ → `/blog/page/2/` (trailing slash). */
export function getPagedListUrl(basePath: string, page: number): string;

/** Static paths for pages 2..N (empty if totalPages <= 1). */
export function pagedListStaticPaths(totalItems: number, pageSize = DEFAULT_PAGE_SIZE): { page: number }[];
```

- `basePath` examples: `'/blog'`, `'/zh/blog'`, `'/brief'`, `'/zh/brief'` (normalize slashes once).
- Move blog helpers to wrap this; **delete duplication** of slice math in `posts.ts` where possible (`BLOG_PAGE_SIZE` can re-export `DEFAULT_PAGE_SIZE` or column override).

### 2. Column registry — `src/lib/columns.ts` (or `src/content/columns.ts`)
A small typed registry so adding a column is config + thin routes + card:

```ts
export type ColumnId = 'blog' | 'brief'; // extend later

export type ColumnConfig = {
  id: ColumnId;
  /** URL segment without lang prefix, e.g. 'blog' | 'brief' */
  segment: string;
  pageSize: number; // default 10
  /** i18n key prefixes or explicit label keys for list chrome */
  i18n: {
    nav: string;       // e.g. 'nav.writing'
    title: string;     // page <title>
    heading: string;
    description: string; // used after count
    empty: string;
    paginationLabel: string; // aria
  };
};
```

Provide `getColumnBasePath(id, lang)`, `listColumns()`, etc.

Future column = new content collection + registry entry + card + 4 route shells — **no new pager implementation**.

### 3. Generic UI — rename/generalize
- Replace blog-only `BlogPager.astro` with **`Pager.astro`** (or `CollectionPager.astro`):
  - Props: `currentPage`, `totalPages`, `prevUrl?`, `nextUrl?`, `lang`, `id?`, `ariaLabel`
  - Style: keep current calm mono/rounded controls (already good).
- Blog-specific list chrome can stay in `BlogListPage.astro` **or** become `CollectionListLayout.astro` that accepts slots:
  - slot `toolbar` (optional — blog PostFilter)
  - slot `grid` (cards)
  - footer always renders shared `Pager`

Prefer **shared layout + shared pager**; column pages only supply data + cards.

### 4. Wire columns

#### Blog (refactor, behavior preserved)
- EN/ZH `/blog/`, `/blog/page/[page]/` keep working.
- Use generic pagination URLs + `Pager`.
- PostFilter integration stays; still hide SSR pager while filtering; client filter pagination uses **same pageSize** from column config / DEFAULT_PAGE_SIZE.
- Prefer rendering **only current page cards in the visible set**; if full DOM still needed for site-wide filter, document why — but structure code so brief (no filter) only SSRs current page items (lighter HTML).

#### Brief (add pagination)
- EN: `src/pages/brief/index.astro` + `src/pages/brief/page/[page].astro`
- ZH: `src/pages/zh/brief/index.astro` + `src/pages/zh/brief/page/[page].astro` (mirror existing i18n routing)
- pageSize **10**
- Extract brief card markup into `BriefCard.astro` (optional but preferred) to keep list page thin.
- No PostFilter required for briefs unless trivial to share later — **do not** force blog filter onto briefs.
- Bottom prev/next + page status; i18n via shared pager keys.

### 5. i18n
- Lift pager strings to **shared** keys used by all columns, e.g.:
  - `pager.prev`, `pager.next`, `pager.status` (`Page {current} of {total}` / `第 {current} / {total} 页`), `pager.label`
- Blog-specific keys can alias or remain for backward compat briefly; prefer one source.
- Briefs get any missing list strings only if needed; reuse pager.* .

### 6. Helpers for static paths (DRY routes)
Add something like:

```ts
// used by every column's page/[page].astro
export async function columnPageStaticPaths(column: ColumnId, lang: Language) { ... }
```

Thin route files should be ~15–25 lines each.

### 7. Out of scope
- Do not redesign home, header brand, or blog post detail pages (except back-links if broken).
- Do not change brief markdown content.
- Do not run force-push; do not commit/push.
- Do not add About/self-promo UI.

## Acceptance
- [ ] `npm run build` passes
- [ ] `/brief/` shows ≤10 cards; with current ~25 briefs, `/brief/page/2/` and `/brief/page/3/` exist (and ZH mirrors)
- [ ] `/blog/` pagination still works; filter still not limited to one SSR page in a broken way
- [ ] Shared `pagination.ts` + shared `Pager` ; blog-specific pager naming removed or thin wrappers only
- [ ] Adding a hypothetical third column would only need registry + collection + card + thin routes (state this in a short comment atop `columns.ts`)
- [ ] Final summary of files changed

## Style
Mature writing-first Sqhh99. Match existing borders, accent sparingly, mono labels. User rejects vibe-coding toy UI.

## Suggested order of work
1. Add `pagination.ts` + tests via quick node/ts checks or mental verify with current counts  
2. Generalize Pager  
3. Column registry  
4. Refactor blog to use them  
5. Implement brief list + page routes  
6. i18n cleanup  
7. `npm run build` and fix
