# Task: Blog list pagination (10 per page)

Repo: `/home/sqhh99/workspace/personal-site` (Astro + Tailwind v4, bilingual EN/ZH).

## Goal
Paginate the **Writing / 文章** list so each page shows **at most 10 posts**. Add **Previous / Next** controls at the bottom. Keep the mature, calm Sqhh99 design — no vibe-coding toys, no flashy UI.

## Current structure
- EN list: `src/pages/blog/index.astro`
- ZH list: `src/pages/zh/blog/index.astro`
- Cards: `src/components/PostCard.astro`
- Client filter/search island: `src/components/react/PostFilter.tsx` (filters `[data-post]` in `#post-grid`)
- Helpers: `src/lib/posts.ts` (`getPosts`, etc.)
- i18n: `src/i18n/ui.ts` (`blog.*` keys)
- Content: `src/content/blog/en/*` and `zh/*` (only a few posts today; pagination must still work and scale)

## Requirements
1. **Page size = 10** posts (newest-first order from existing `getPosts`).
2. **URL scheme** (SSG-friendly, trailing slash consistent with site):
   - Page 1: `/blog/` and `/zh/blog/`
   - Page 2+: `/blog/page/2/`, `/zh/blog/page/2/`, …
3. **Bottom pager**: Previous + Next (disable or omit when N/A). Optional calm “Page X of Y” / “第 X / Y 页” in mono label style matching the site.
4. **Style**: reuse existing tokens (`border-line`, `text-muted`, `font-mono`, `rounded-full`/`rounded-xl`, accent sparingly). Match Header/PostFilter button language — mature writing-first, not a product marketing pager.
5. **i18n**: add keys under `blog.*` for both EN and ZH (prev page, next page, page status). Do not hardcode Chinese only in EN pages.
6. **Both locales** must get the same behavior.
7. **PostFilter / search**:
   - Prefer a clean design: either (A) server pagination of the full list + filter resets navigation reasonably, or (B) client-side pagination of the currently filtered set (still max 10 visible) with bottom prev/next.
   - Do **not** leave broken UX where search only sees the current SSR page of 10 while claiming site-wide search.
   - Recommended: extract a small shared pager component; if keeping PostFilter, extend it so when query/tag active it paginates the **filtered** DOM set (10 at a time) and hides the SSR pager; when filter is “All” + empty query, SSR pager links work.
8. **Home** (`index.astro` / `zh/index.astro`): do **not** need full blog pagination unless it already lists all posts in a heavy grid — leave home alone if it only shows a few featured items.
9. **Build must pass**: run `npm run build` and fix errors.
10. **Do not** commit/push unless asked. Do not add About blocks or rebrand. Do not touch brief pages unless shared components force a tiny fix.

## Implementation hints
- Add helpers in `src/lib/posts.ts` (e.g. `PAGE_SIZE = 10`, `paginatePosts`, `getBlogListUrl(lang, page)`).
- Prefer `src/pages/blog/page/[page].astro` + keep `blog/index.astro` as page 1 (or shared partial/layout component to avoid duplicating markup 4 times).
- `getStaticPaths` for pages 2..N only when `N > 1`.
- Canonical/nav links to Writing should still point at `/blog/` and `/zh/blog/`.

## Done criteria
- [ ] EN + ZH list paginated at 10/page
- [ ] Prev/Next at bottom, style-consistent, i18n’d
- [ ] Filter/search not silently limited to one SSR page in a confusing way
- [ ] `npm run build` succeeds
- [ ] Brief summary of files changed

User preference: mature writing-first personal site (Sqhh99), Chinese primary operator is XIAO XU.
