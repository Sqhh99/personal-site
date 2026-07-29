---
name: write-article
description: Author, extend or remove a long-form article on this site — write an article, add a blog post, start a new essay, add or change an interactive figure, delete a post, or match the existing prose and figure style. Covers the per-article directory layout, frontmatter schema, the shared figure library (useFigureCanvas / useThemeColors / controls / plot), the design system rules, and the verification checklist.
---

# Writing an article

Articles on this site are long-form explanatory essays with interactive figures —
in the register of transformer-circuits.pub, with animations in the spirit of
ciechanow.ski. The two that exist are the reference:
`src/content/blog/the-shape-of-frequency/` and
`src/content/blog/four-kinds-of-hole/`. Read one before writing a new one.

## Anatomy

An article is **one directory**. Nothing outside it refers to it.

```text
src/content/blog/
├── the-shape-of-frequency/
│   ├── index.mdx           # frontmatter + prose
│   └── _figures/           # only this article's figures
│       ├── Epicycles.tsx
│       └── …
└── a-short-note.mdx        # a post with no figures stays a single file
```

Both shapes are valid. `src/content.config.ts` globs `*/index.{md,mdx}` and
`*.{md,mdx}` and its `generateId` collapses either to the bare slug, so the URL
is `/blog/<slug>/` in both cases and an article's URL does not change when it
grows figures.

### Frontmatter

```yaml
---
title: The shape of frequency
description: One sentence — the card blurb, the meta description, and the lede.
date: 2026-07-29
tag: Signals          # must be in TAGS in src/consts.ts
lang: en              # the language the prose is written in
featured: false       # at most one true; it takes the large card
draft: true           # visible in dev, excluded from production builds
---
```

Schema lives in `src/content.config.ts`. `tag` is a closed enum deliberately:
an unknown tag fails the build rather than silently producing an empty filter.
Reading time is computed from the body — there is nothing to keep in sync.

Articles are **single-language**. There are no translated pairs; `lang` labels
the prose, and the article is listed in both the English and Chinese UIs.

## Adding one

```bash
npm run new:article -- my-article-slug
```

That creates the directory, an `index.mdx` skeleton and a worked example figure.
Then:

1. Write the piece.
2. Replace `_figures/ExampleFigure.tsx` with real ones.
3. Set `tag`. Only if the topic is genuinely new, add it to `TAGS` in
   `src/consts.ts` — this is the **one** shared file an article may touch.
4. Drop `draft: true`.

## Removing one

```bash
rm -rf src/content/blog/<slug>/
```

That is the entire procedure. No registry, no index, no import to unhook. If it
was the last article carrying a tag, the tag simply stops appearing in the
filter chips — `src/components/BlogListPage.astro` derives them from tags in
use, so nothing needs cleaning up unless you want the enum tidy.

## Figures

A figure is a default-exported React component in the article's `_figures/`,
embedded with `client:visible`:

```mdx
<Figure caption="Sweep the test frequency and watch the shaded lobes stop cancelling.">
  <CorrelationSweep client:visible />
</Figure>
```

Imports: the shared library through the `@figures/*` alias, the article's own
figures relatively.

```tsx
import { useFigureCanvas } from '@figures/useFigureCanvas';
import { fade, useThemeColors } from '@figures/useThemeColors';
import { Canvas, FigureBody, Panel, Slider, Toggle, Readout } from '@figures/controls';
import { TAU, box, curve, baseline, polyline, dot, label, dft } from '@figures/plot';
```

### The two hooks are not optional

- **`useFigureCanvas(draw, { aspect, animate })`** owns devicePixelRatio
  scaling, resize, and — the part that matters on a page carrying a dozen
  canvases — suspending the frame loop when the figure scrolls offscreen or the
  tab is hidden, and rendering a single static frame under
  `prefers-reduced-motion` while staying interactive.
- **`useThemeColors()`** resolves the palette custom properties and re-resolves
  them when the theme toggle flips `data-theme`. **Never hard-code a colour in a
  figure.** Canvas pixels are not styled by CSS, so this hook is the only reason
  a figure survives the light/dark switch. Use `fade(color, alpha)` for
  transparency; it hand-parses hex rather than emitting `color-mix()`.

### What makes a good figure here

Figures **compute**, they do not illustrate. The spectra are a real O(N²) DFT;
the light rays are a real RK4 integration of the null orbit equation. At these
sizes the naive algorithm is fast enough and far more legible than an optimised
one — that honesty is the point of the format.

Each figure should:

- have a sensible static first frame, so it means something before interaction;
- respond to dragging where dragging is the natural verb;
- carry an `aria-label` on the `Canvas` describing what it shows;
- put derived quantities in `<Readout>` tiles so the reader can watch numbers
  move, not just shapes.

## Design system

- **Colour** comes only from the tokens in `src/styles/global.css` (`--ink`,
  `--muted`, `--faint`, `--accent`, `--kraft`, `--surface`, `--surface-sunk`,
  `--border`…). Light and dark are both defined there. Do not introduce a hex
  literal in a component or a figure.
- **Typography** is `.prose` in `global.css`. Do not restyle headings, code or
  tables inside an article.
- **Measure** is 58rem, and figures fill it flush — that alignment is
  deliberate. `.figure-wide` and `.figure-bleed` exist for a figure that
  genuinely earns more room; both articles currently use neither.
- **Figures** are auto-numbered. Write the caption text only; the `Figure N`
  prefix is a CSS counter.
- **Sections** (`##`) are auto-numbered too and populate the floating contents
  pill. `###` nests under them as `1.1`. Nothing deeper appears.
- **Margin notes** — `<MarginNote>` for an aside worth keeping but not worth
  interrupting the paragraph for. Right gutter on wide screens, inline below.
- **Maths** — `$inline$` and `$$display$$`, typeset by KaTeX at build time, so
  no JavaScript ships for it.

## Prose

Match the two existing articles:

- Lead with the idea, not the formalism. Introduce the equation once the reader
  already knows what it is going to say.
- One claim per section. The heading states the claim.
- Captions say what to *do* with the figure — "set the impact parameter to 5.20
  and then to 5.19" — not what it contains.
- Close with a **What to keep** list: the handful of claims worth remembering,
  one sentence each.
- British-ish spelling. No exclamation marks, no second-person hype, no
  "let's dive in". Admit what an approximation gets wrong.

## Before calling it done

```bash
npm run check     # must be clean
npm run build     # must be clean
npm run dev       # then walk the article
```

In the browser:

- every figure animates, responds to its controls, and stops when scrolled away;
- **toggle the theme mid-animation** — every canvas must repaint in the new
  palette without a reload. This is the most likely thing to have broken;
- narrow to mobile: no horizontal page scroll, KaTeX display blocks scroll
  inside their own box, the contents pill collapses to its icon;
- enable `prefers-reduced-motion` in devtools: figures render a static frame and
  remain interactive.
