# Task: Publish AI Daily Briefs on personal-site

## Source
26 markdown files at `/home/sqhh99/.hermes/cron/output/ff591e084f77/`  
Each file = one day's AI news brief, formatted with a cron header then the actual content.  
Files: `2026-07-04_08-03-28.md` through `2026-07-28_08-02-24.md` (July 4 – July 28, 2026, ~25 days / 2 extra runs = 26 files).

## Target
`/home/sqhh99/workspace/personal-site/` — the Astro blog.

## What to do

1. **Read all 26 source files**. For each:
   - Parse the date from filename (e.g. `2026-07-28_08-02-24.md` → `2026-07-28`).
   - Strip the cron metadata header (everything before the first `📰/🤖` icon or the actual news listing). The actual brief content starts after the `## Prompt` block and its `[IMPORTANT:...]` instruction — crop everything down to the news content itself.
   - Rewrite each into a clean Astro content collection markdown post with proper frontmatter.

2. **Create a new content collection** for briefs:
   - Add `brief` to `src/content.config.ts` (similar to `blog` collection schema — `title`, `description`, `date`, `tags` optional, also add `source` field for "Cron AI" or similar).
   - Frontmatter format per post:
     ```yaml
     title: "🤖 AI 新闻简报 · 2026-07-28"
     description: "Daily AI news brief for July 28, 2026"
     date: 2026-07-28
     tags: ["AI", "新闻"]
     source: "每日 AI 新闻简报"
     featured: false
     ```
   - The content body after frontmatter = the actual news brief (clean, no cron headers).

3. **Store the briefs** at `src/content/brief/2026-07-28.md` (use the date-only slug).

4. **Create a "Briefs" index page** at `src/pages/brief/index.astro`:
   - Layout similar to blog index but for briefs: date, title, brief excerpt link.
   - Link in header nav (add `Briefs | 简报` to NAV and `src/i18n/ui.ts`).

5. **Create individual brief pages** at `src/pages/brief/[...slug].astro`:
   - Pattern similar to blog slug page but for brief collection.
   - Show date, full content, back link to brief index.

6. **Add navigation entry**:
   - In `src/consts.ts` NAV: add `Briefs` link for EN and `src/i18n/ui.ts` for both locales.
   - In Header.astro, the nav currently shows Home + Writing. **Add a link to `/brief/`**.
   - Also add the briefs page link in the Header component and i18n dictionaries.

7. **No ZH duplicate needed** — the briefs are already in Chinese. Just one page listing all briefs under `/brief/`.

8. Run `npm run build` and fix until green.

## Done criteria
- `/brief/` lists all ~26 briefs with dates.
- Each brief is readable.
- Header has "Briefs" link.
- Build passes.

## Out of scope
- Do not modify existing blog posts or pages.
- Do not commit/push.
- Keep the existing mature design and i18n framework.
