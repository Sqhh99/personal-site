# personal-site

Personal site and engineering blog — notes on WebRTC, PyTorch, web engineering and systems.
Built with Astro, deployed as static files to Cloudflare.

**Stack:** Astro · TypeScript · Tailwind CSS v4 · MDX content collections · React islands ·
React Three Fiber · Cloudflare Workers Static Assets

## Structure

```text
src/
├── consts.ts            # site metadata, nav, focus areas, about copy
├── content.config.ts    # blog collection + frontmatter schema
├── content/blog/        # posts (.md / .mdx)
├── lib/posts.ts         # post queries, reading time, date formatting
├── styles/global.css    # palette tokens, base styles, prose
├── layouts/             # BaseLayout
├── components/
│   ├── *.astro          # static markup — ships no JavaScript
│   └── react/           # the only interactive parts
└── pages/               # routes, plus rss.xml.ts
public/                  # favicon, robots.txt — copied verbatim
```

## Commands

| Command | Does |
| --- | --- |
| `npm install` | Install dependencies |
| `npm run dev` | Dev server on <http://localhost:4321> |
| `npm run build` | Static build into `dist/` |
| `npm run preview` | Serve the built output |
| `npm run check` | Type-check `.astro` and `.ts` |
| `npm run deploy` | Build, then `wrangler deploy` |

## Adding a post

Create `src/content/blog/my-post.md` — the filename becomes the URL (`/blog/my-post/`):

```markdown
---
title: Post title
description: One sentence, used for the card and the meta description.
date: 2026-07-27
tag: WebRTC
featured: false
---

Body text…
```

`tag` must be one of the values in `TAGS` in `src/consts.ts`; anything else fails the build
rather than silently rendering an empty filter. `draft: true` hides a post from production
builds but keeps it visible in `npm run dev`. Reading time is computed from the body — there
is nothing to keep in sync.

## Interactivity

Three components ship JavaScript, each as its own island:

- `ThemeToggle` (`client:load`) — the initial theme is resolved by a blocking inline script in
  `BaseLayout.astro` so the palette never flashes.
- `PostFilter` (`client:load`) — search and tag filtering. The cards themselves are
  server-rendered; the island only toggles visibility, so every post stays in the HTML.
- `WaveField` (`client:visible`) — the shader field on the home page. Three.js loads as a
  separate chunk only when the hero is in view, and the animation freezes under
  `prefers-reduced-motion`. A CSS gradient stands in if it never loads.

## Configuration

- **Domain** — `site` in `astro.config.mjs`. Sitemap, RSS and canonical URLs all derive from
  it, so it is the only place the origin is written down. **Change it before deploying.**
- **Content** — name, links, nav, focus areas and About copy live in `src/consts.ts`.
- **Palette** — CSS custom properties at the top of `src/styles/global.css`, exposed to
  Tailwind via `@theme inline` so light and dark swap at runtime.

## Deploying to Cloudflare

**Git integration** — connect the repo; build command `npm run build`, output directory
`dist`.

**Wrangler** — `wrangler.jsonc` already points at `dist`:

```bash
npm run deploy
```
