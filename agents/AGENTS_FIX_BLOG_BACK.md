# Task: Fix double arrow on blog post back link

Same problem as the fixed briefs issue — the blog post pages have a double `←←` on the back-to-writing link.

**Root cause:** `src/i18n/ui.ts` line 49 and 112 have `blog.back` as `'← Back to writing'` / `'← 返回文章列表'`, AND the template in both `src/pages/blog/[...slug].astro` and `src/pages/zh/blog/[...slug].astro` already has a `<span>←</span>` before rendering `{t('blog.back')}`.

**Fix:** Remove the `←` prefix from the `blog.back` translation in `src/i18n/ui.ts` (both EN and ZH). Keep the `<span>←</span>` in the template — that single arrow is intentional for the hover animation.

**Do not change anything else.** Do not commit/push. Do not touch brief pages (already fixed).

## Done criteria
- No double arrow on blog post back links
- `npm run build` passes
