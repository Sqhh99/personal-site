# personal-site

Personal site and engineering blog — long-form explanatory essays with interactive
figures, plus a daily AI news brief, behind a landing page of seven dithered Doré
engravings. Built with Astro, deployed as static files to Cloudflare.

**Stack:** Astro · TypeScript · Tailwind CSS v4 · MDX content collections ·
React islands · KaTeX · Cloudflare Workers Static Assets

## Structure

```text
src/
├── consts.ts            # site metadata, nav, tag vocabulary
├── content.config.ts    # blog + brief collections and their schemas
├── content/
│   ├── blog/            # one directory per article (see below)
│   └── brief/           # daily AI briefs, one flat file per day
├── i18n/                # EN/ZH UI strings and locale helpers
├── lib/                 # post/brief queries, pagination, column registry
├── styles/global.css    # palette tokens, base styles, .prose, essay layout
├── layouts/             # BaseLayout, PostLayout
├── components/
│   ├── *.astro          # static markup — ships no JavaScript
│   ├── figures/         # shared figure library (canvas hooks, controls, plot)
│   └── react/           # PostFilter
└── pages/               # routes (EN unprefixed, ZH under /zh), rss.xml.ts
scripts/new-article.mjs  # npm run new:article
scripts/check-brief.mjs  # npm run check:brief — daily brief QA gate
scripts/prep-plates.mjs   # npm run prep:art — fetches and prepares the landing's seven plates
public/                  # favicon, robots.txt, art/ — copied verbatim
```

The UI is bilingual (EN/ZH); **articles are not**. Each article is written in one
language and appears in both listings.

## Commands

| Command | Does |
| --- | --- |
| `npm install` | Install dependencies |
| `npm run dev` | Dev server on <http://localhost:4321> |
| `npm run build` | Static build into `dist/` |
| `npm run preview` | Serve the built output |
| `npm run check` | Type-check `.astro`, `.ts` and `.tsx` |
| `npm run new:article -- <slug>` | Scaffold a new article directory |
| `npm run check:brief [-- YYYY-MM-DD]` | QA gate for a daily brief: shape/links/dates in code, tone/hedging/dedup via TypeSafe (needs `TYPESAFE_API_KEY`; add `--no-ai` for code checks only) |
| `npm run prep:art` | Re-fetch and prepare the landing's plates (output is committed); `-- --sheet out.png` also writes a dithered contact sheet |
| `npm run deploy` | Build, then `wrangler deploy` |

## Adding a post

An article is **one self-contained directory**. Creating it is one command; deleting it
is `rm -rf` on that directory, with nothing else to unhook.

```bash
npm run new:article -- my-post
```

```text
src/content/blog/my-post/
├── index.mdx            # frontmatter + prose
└── _figures/            # only this article's interactive figures
```

A post with no figures can stay a single file, `src/content/blog/my-post.mdx`. Either way
the URL is `/blog/my-post/`.

`tag` must be one of the values in `TAGS` in `src/consts.ts` — anything else fails the
build rather than silently rendering an empty filter, and it is the only shared file an
article ever needs to touch. `draft: true` hides a post from production builds but keeps
it visible in `npm run dev`. Reading time is computed from the body.

**The full authoring guide — figure conventions, design rules and prose style — lives in
[`.claude/skills/write-article/SKILL.md`](.claude/skills/write-article/SKILL.md)**, and
loads automatically as a skill in Claude Code.

## Interactivity

Everything ships as its own island; the page is server-rendered otherwise.

- **Landing descent** (`DescentHero.astro` + `src/lib/descent/`) — the first screen is
  one of seven Gustave Doré wood engravings, a "level" for each classical planet from
  Saturn down to the Moon, printed in two inks — burnt umber on black — by 8×8 ordered
  dither. No name and no text: a row of planetary sigils (or ←/→, 1–7, a swipe, or
  `#venus` in the URL) moves between plates, and left alone it goes down a level every
  20 s. `gl.ts` is a single WebGL1 shader on a canvas of one pixel per dither cell,
  scaled up crisp; every effect is a change of exposure ahead of the threshold, so it
  stays in the grain: the descent (the old plate gutters out cell by cell and the next
  catches), a candle flicker, a lantern under the pointer that drops the black point,
  dust motes and a slow push-in. Without WebGL the plate is dithered once on the CPU;
  under `prefers-reduced-motion` it is a still print. `plates.json` lists the plates
  with their focus and tone and is shared with `npm run prep:art`, which crops them out
  of their Wikimedia Commons scans into `public/plates/`.
  Plates: *Inferno* I and II (1861), *Idylls of the King* (1868), *Atala* (1863),
  *The Raven* (1884) — all public domain.
- `PostFilter` (`client:load`) — search and tag filtering. The cards themselves are
  server-rendered; the island only toggles visibility, so every post stays in the HTML.
- **Article figures** (`client:visible`) — Canvas 2D React components built on
  `src/components/figures/`. `useFigureCanvas` handles devicePixelRatio, resize, and
  suspends the frame loop when a figure is offscreen or the tab is hidden;
  `useThemeColors` resolves the palette tokens for canvas drawing. Both honour
  `prefers-reduced-motion` by rendering a static frame.

## Configuration

- **Domain** — `site` in `astro.config.mjs`. Sitemap, RSS and canonical URLs all derive from
  it, so it is the only place the origin is written down. **Change it before deploying.**
- **Content** — name, links, nav and the tag vocabulary live in `src/consts.ts`.
  UI strings for both locales live in `src/i18n/ui.ts`.
- **Palette** — CSS custom properties at the top of `src/styles/global.css`, exposed to
  Tailwind via `@theme inline`. One theme: black pen on paper.

## Deploying to Cloudflare

**Preferred (Workers + Git / deploy command = `npx wrangler deploy`)** — `wrangler.jsonc`
runs `npm run build` via its `build.command`, then uploads `./dist`. No separate build
step is required in the dashboard if the deploy command is only Wrangler.

**Pages-style Git settings** (if you configure build explicitly) — build command
`npm run build`, output directory `dist`. Do **not** set the deploy command to bare
`npx wrangler deploy` without a prior build unless `wrangler.jsonc` includes
`build.command` (it does in this repo).

**Local / CLI** —

```bash
npm run deploy   # astro build && wrangler deploy
```
