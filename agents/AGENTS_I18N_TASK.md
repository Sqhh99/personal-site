# Task: Add Chinese / English i18n to personal-site

Workspace: `/home/sqhh99/workspace/personal-site`

## Goal
Add a **working EN ↔ ZH (中文)** language switch for the personal blog.

## Preferred approach (pick and implement one solid stack)
**Recommended for this Astro static site:**
1. **Astro built-in i18n routing** (`i18n.locales`, `defaultLocale`, prefix strategy) — e.g. `/` + `/zh/` or `/en/` + `/zh/`.
2. **UI dictionaries** (`src/i18n/ui.ts` or `en.json` / `zh.json`) for nav, hero, about, footer, buttons, empty states, 404.
3. **Blog posts:** support Chinese content without breaking existing English posts:
   - Prefer dual files or locale in slug/collection (e.g. `why-this-site-exists.md` + `why-this-site-exists.zh.md`, or `blog/en/...` + `blog/zh/...`).
   - At minimum: translate **all chrome/UI** fully; provide **Chinese versions of existing posts** (full translation of the 5 posts) OR a clear fallback (show EN post with notice if ZH missing).
   - Best outcome: UI 100% + all 5 posts available in both languages.

4. **Language switcher** in Header (EN | 中文), preserve current path when switching when a counterpart exists; otherwise go to locale home/blog index.
5. Persist preference: `localStorage` + optional cookie; respect first visit with browser `Accept-Language` if easy.
6. Set `<html lang="en|zh-CN">` correctly per page.
7. Keep **static build** for Cloudflare (`astro build` → `dist`). No SSR requirement unless absolutely needed.
8. Update sitemap for both locales if applicable; RSS can stay default locale or dual — document choice.

## Constraints
- Keep Astro 5 + Tailwind v4 + existing design system (ivory/coral).
- Do not remove English content.
- Do not break `npm run build`.
- Minimal new JS islands; switcher can be a small React island or plain `<a>` links (links preferred for static).
- `site` remains `https://sqhh99.dev`.

## Skills
Use installed skills under `~/.gemini/antigravity-cli/skills/` as relevant: `astro`, `frontend-ui-engineering`, `frontend-seo`, `senior-frontend`, `frontend-design`.

## Done criteria
1. User can switch EN ↔ 中文 from the header on all main pages.
2. UI strings appear in the selected language.
3. Blog listing/posts work per locale (with translations or graceful fallback).
4. `npm run build` succeeds.
5. Print summary: approach chosen, files added/changed, how to add a new bilingual post.

## Out of scope
- Do not commit/push.
- Do not change Cloudflare account config.
