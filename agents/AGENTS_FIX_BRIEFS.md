# Task: Fix two issues on the brief pages

## Issue 1: Double left arrow ←← on back link
File: `src/pages/brief/[...slug].astro`, line ~51

Current:
```astro
<span class="transition-transform duration-300 group-hover:-translate-x-1" aria-hidden="true">←</span> {t('briefs.back')}
```

And `t('briefs.back')` is `'← Back to briefs'` / `'← 返回简报列表'` — so the arrow appears twice.

Fix: Remove the `←` from the span in the template, OR remove it from the translation strings in `src/i18n/ui.ts`. Keep only ONE arrow. Put the arrow in the template as the `<span>` (consistent with blog pages), and remove the `←` from `src/i18n/ui.ts` translations for `briefs.back`.

## Issue 2: Language switcher doesn't work on `/brief/` pages
The `getLocalizedPath` function in `src/i18n/utils.ts` has a special case that keeps `/brief/` paths unchanged when switching language. The brief content is Chinese-only, but the UI text should still switch between EN/ZH dictionaries.

Fix approach: Remove the special brief case from `getLocalizedPath`. Then:
- EN → ZH: `/brief/` → `/zh/brief/` and `/brief/2026-07-28/` → `/zh/brief/2026-07-28/`
- ZH → EN: `/zh/brief/` → `/brief/` and `/zh/brief/2026-07-28/` → `/brief/2026-07-28/`

To make `/zh/brief/` pages work:
- Create `/home/sqhh99/workspace/personal-site/src/pages/zh/brief/index.astro` — same content as EN brief index but with `lang='zh'` hardcoded
- Create `/home/sqhh99/workspace/personal-site/src/pages/zh/brief/[...slug].astro` — same content as EN brief slug page but with `lang='zh'` hardcoded

Both reuse the same `getBriefs()` data from `src/lib/briefs.ts` — no separate content files needed.

The `/zh/brief/` pages should be exact copies of the EN pages but with `const lang = 'zh'` and back-links pointing to `/zh/brief/`.

## Do not modify
- Do not change blog pages, consts, or main content
- Do not commit/push
- Do not delete existing brief content

## Done criteria
- Back link shows exactly one arrow ←
- `/brief/` and `/zh/brief/` both work
- Header language switcher properly toggles between them
- `npm run build` succeeds
