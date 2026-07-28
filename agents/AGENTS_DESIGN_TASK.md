# Task: Personal blog visual redesign (supervised)

You are optimizing **Sqhh99's personal engineering blog** at `/home/sqhh99/workspace/personal-site`.

## Stack (do not replace)
- Astro 5 static site
- Tailwind CSS v4 (`@tailwindcss/vite`)
- MDX content collections
- Light React islands only: ThemeToggle, PostFilter, WaveField (Three.js)
- Deploy: Cloudflare Workers static assets via `wrangler.jsonc` → `./dist`

## Goals
1. **Visual quality up**: more distinctive, polished personal-blog look — not generic AI purple-gradient SaaS.
2. Keep the warm ivory/coral direction if it still works; refine typography, spacing, hierarchy, cards, header/footer, blog index, post pages.
3. Improve **readability** for long technical posts (prose, code blocks, measure, contrast light+dark).
4. Keep **performance**: static-first; do not bloat JS. WaveField may stay `client:visible`.
5. Preserve content, routes, RSS, sitemap, `site: https://sqhh99.dev`, content collection schema.
6. Prefer editing existing files (`global.css`, layouts, components, `consts.ts`) over inventing a new framework.

## Skills to use (installed under ~/.gemini/antigravity-cli/skills)
Prioritize: `redesign-existing-projects`, `frontend-design`, `ui-ux-pro-max`, `high-end-visual-design`, `design-taste-frontend`, `emil-design-eng`, `tailwind-design-system`, `astro`, `frontend-seo`, `styleseed-design-review`.

## Process
1. Read README + key source files (layout, global.css, Hero, Header, Footer, PostCard, blog pages).
2. Short design plan (palette/type/spacing/motion).
3. Implement the redesign in code.
4. Run `npm run build` and fix errors until green.
5. Summarize what changed and why.

## Out of scope
- Do not change domain / Cloudflare account settings.
- Do not commit or push unless asked.
- Do not delete blog posts.
