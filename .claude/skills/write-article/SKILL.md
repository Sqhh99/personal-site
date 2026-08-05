---
name: write-article
description: Author, extend or remove a long-form article on this site — write an article, add a blog post, start a new essay, add or change an interactive figure, delete a post, or match the existing prose and figure style. Covers the per-article directory layout, frontmatter schema, the shared figure library (useFigureCanvas / useThemeColors / controls / plot), the design system rules, and the verification checklist.
---

# Writing an article

Articles on this site are long-form explanatory essays with interactive figures —
in the register of transformer-circuits.pub, with animations in the spirit of
ciechanow.ski. **Read one end-to-end before writing a new one** — layout, caption
tone, and figure structure are defined by those files, not by abstract rules alone.

Read `src/content/blog/residual-networks/` first. It is the reference for the
three-level heading tree and for figures that genuinely compute:
`DepthTrainer.tsx` trains two real networks in the page, `SignalPropagation.tsx`
multiplies real random matrices, `PathEnsemble.tsx` evaluates exact binomials.
`src/content/blog/u-net-and-beyond/` is the second reference.
`the-shape-of-frequency/` and `four-kinds-of-hole/` are older and still carry a
flat, h2-only outline — match their prose, not their structure.

This skill is for **blog essays only**. Daily AI briefs live under
`src/content/brief/` with a different schema and pipeline — do not mix the two.

## Anatomy

An article is **one directory**. Nothing outside it refers to it by path.

```text
src/content/blog/
├── the-shape-of-frequency/
│   ├── index.mdx           # frontmatter + prose + local imports
│   └── _figures/           # only this article's figures
│       ├── Epicycles.tsx
│       └── …
└── a-short-note.mdx        # a post with no figures may stay a single file
```

Both shapes are valid. `src/content.config.ts` globs `*/index.{md,mdx}` and
`*.{md,mdx}` and its `generateId` collapses either to the bare slug, so the URL
is `/blog/<slug>/` (and `/zh/blog/<slug>/` for the Chinese chrome) in both cases.
An article's URL does not change when it grows figures.

### What you may touch

| Path | When |
| --- | --- |
| `src/content/blog/<slug>/` | Always — the article itself |
| `src/consts.ts` → `TAGS` | Only if a **new** tag is genuinely required |
| Nothing else | Do not edit layouts, pagination, i18n, brief content, or other articles to “make room” |

### Frontmatter

```yaml
---
title: The shape of frequency
description: One sentence — the card blurb, the meta description, and the lede.
date: 2026-07-29
tag: Signals          # must be in TAGS (src/consts.ts)
lang: en              # language of the prose (en | zh)
featured: false       # at most one true site-wide; it takes the large card
draft: true           # visible in dev, excluded from production builds
---
```

Schema lives in `src/content.config.ts`. Current closed `tag` enum:

`Signals` · `Physics` · `WebRTC` · `PyTorch` · `Frontend` · `Systems` · `Notes`

An unknown tag **fails the build**. Reading time is computed from the body —
there is nothing to keep in sync.

Articles are **single-language**. There are no translated pairs; `lang` labels
the prose. Listing is **not** filtered by UI locale: every published article
appears on both `/blog/` and `/zh/blog/` (`getPosts()` in `src/lib/posts.ts`).
The surrounding chrome (nav, back link, date format) follows the route locale.

`draft` defaults to `false` in the schema; the scaffolder sets `draft: true`
deliberately so unfinished work never ships. Drop the flag only when the piece
is ready for production.

## Adding one

```bash
npm run new:article -- my-article-slug
```

Slug rules (enforced by the script): lowercase words joined by hyphens,
`^[a-z0-9]+(?:-[a-z0-9]+)*$`. That becomes the URL segment.

Creates `src/content/blog/<slug>/index.mdx` and
`_figures/ExampleFigure.tsx`. Then:

1. Write the piece in `index.mdx`.
2. Replace `_figures/ExampleFigure.tsx` with real figures (or delete it if the
   post has no interactives and you collapse to a lone file).
3. Set `tag`. Only if the topic is genuinely new, add it to `TAGS` in
   `src/consts.ts` — this is the **one** shared file an article may touch.
4. Drop `draft: true`.
5. Run the verification checklist below.

Dev URL: `http://localhost:4321/blog/<slug>/` (Chinese chrome:
`/zh/blog/<slug>/` — same article body).

## Removing one

```bash
rm -rf src/content/blog/<slug>/
# or, for a single-file post:
rm src/content/blog/<slug>.mdx
```

That is the entire procedure. No registry, no index, no import to unhook. If it
was the last article carrying a tag, the tag simply stops appearing in the
filter chips — `BlogListPage` derives chips from tags in use. Optionally tidy
the `TAGS` enum later; not required for correctness.

## Figures

A figure is a **default-exported** React component in the article's `_figures/`,
embedded with **`client:visible`** (not `client:load` — do not pay for every
canvas on first paint):

```mdx
import Figure from '@figures/Figure.astro';
import MarginNote from '@figures/MarginNote.astro';
import CorrelationSweep from './_figures/CorrelationSweep.tsx';

<Figure caption="Sweep the test frequency and watch the shaded lobes stop cancelling.">
  <CorrelationSweep client:visible />
</Figure>
```

Optional width on the wrapper (default fills the essay measure):

```mdx
<Figure width="wide" caption="…">   <!-- or "bleed" -->
  <MyFigure client:visible />
</Figure>
```

`caption` is rendered as HTML (`set:html`) so light markup like `<em>f</em>` is
allowed — match the existing essays; do not dump unescaped user content.

### Imports

- Shared library: always through the **`@figures/*`** alias (defined in
  `tsconfig.json` → `src/components/figures/*`). Do not use long relative paths
  into `src/components/figures/`.
- This article's figures: **relative** `./_figures/Name.tsx`.
- **Never** import another article's `_figures/`. Copy or re-implement; coupling
  across posts is forbidden by design.

```tsx
import { useFigureCanvas } from '@figures/useFigureCanvas';
import { fade, useThemeColors } from '@figures/useThemeColors';
import {
  Canvas,
  FigureBody,
  Panel,
  Slider,
  Toggle,
  SegmentedControl,
  PlayPause,
  Readout,
} from '@figures/controls';
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

### Control kit (stay inside it)

Build the panel from `@figures/controls` only unless you are extending the
shared library on purpose:

| Piece | Role |
| --- | --- |
| `FigureBody` | Card chrome around canvas + controls |
| `Canvas` | Requires `aria-label` via `label=` |
| `Panel` | `columns={1\|2\|3}` control grid |
| `Slider` | Continuous parameters |
| `Toggle` / `SegmentedControl` | Binary / enum modes |
| `PlayPause` | Animation run state |
| `Readout` | Derived numbers the reader should watch |

Prefer **Canvas 2D + these hooks**. `three` / `@react-three/fiber` are in the
repo for legacy/other islands; new essay figures should not introduce a 3D stack
unless the subject truly requires it and you accept the weight.

### What makes a good figure here

Figures **compute**, they do not illustrate. The spectra are a real O(N²) DFT;
the light rays are a real RK4 integration of the null orbit equation; the ResNet
loss curves come from two networks doing real gradient descent in the page. At
these sizes the naive algorithm is fast enough and far more legible than an
optimised one — that honesty is the point of the format.

Three ways a figure fails this test, all of which have shipped here and been
rewritten:

1. **The fitted curve.** Plotting a hand-tuned analytic expression that *looks
   like* the phenomenon — `0.43 - useful + difficulty * ...` — teaches the reader
   the author's intuition, not the subject. Run the real thing at a small size
   instead, or plot the exact closed form and say that is what it is.
2. **The circular demo.** An ablation whose "reconstruction" is computed from the
   ground truth cannot show anything about reconstruction. Derive the result from
   the inputs the real system has.
3. **The labelled box.** A diagram of named rectangles with no arithmetic behind
   it is a slide, not a figure. If a diagram is genuinely the right form — a
   family map, a block layout — give it real numbers to carry: parameters, MACs,
   memory, receptive field.

Where a computed figure is necessarily a toy, say so in the caption *and* in the
prose, and name what does and does not transfer.

Each figure should:

- have a sensible static first frame, so it means something before interaction;
- respond to dragging where dragging is the natural verb;
- carry an `aria-label` on the `Canvas` describing what it shows;
- put derived quantities in `<Readout>` tiles so the reader can watch numbers
  move, not just shapes;
- keep CPU honest when many figures share a page (the offscreen pause is
  mandatory, not a nice-to-have).

## Design system

- **Colour** comes only from the tokens in `src/styles/global.css` (`--ink`,
  `--muted`, `--faint`, `--accent`, `--kraft`, `--surface`, `--surface-sunk`,
  `--border`, `--accent-deep`, …). Light and dark are both defined there. Do not
  introduce a hex literal in a component or a figure.
- **Typography** is `.prose` / `.essay` in `global.css`. Do not restyle headings,
  code or tables inside an article.
- **Measure** is `--measure: 58rem` in `global.css`. Figures fill it flush by
  default — that alignment is deliberate. `Figure` `width="wide" | "bleed"`
  (classes `.figure-wide` / `.figure-bleed`) exist for a figure that genuinely
  earns more room; no article currently uses either.
- **Figures** are auto-numbered. Write the caption text only; the `Figure N`
  prefix is a CSS counter.
- **Sections** are auto-numbered and populate the floating contents pill. See
  the heading tree below — the numbering, the margin numbers and the outline are
  one system.
- **Margin notes** — `<MarginNote>` for an aside worth keeping but not worth
  interrupting the paragraph for. Right gutter on wide screens, inline below.
- **Maths** — `$inline$` and `$$display$$`, typeset by KaTeX at **build time**
  (`remark-math` + `rehype-katex` in `astro.config.mjs`), so no KaTeX JS ships.
  In MDX, backslashes in LaTeX often need escaping (`\\frac`, `\\sin`). Prefer
  matching the existing essays' escaping style; if a formula breaks the MDX
  parse, fix escaping rather than dropping to Unicode fakes.
- **Code blocks** use Shiki dual themes (github-light / github-dark); no extra
  setup in the article.

## The heading tree

An essay is outlined **three levels deep**, and the outline is load-bearing:
`PostLayout.astro` indexes h2/h3/h4, numbers them `1` / `1.1` / `1.1.1`, and
renders them as an indented tree with guide rails in the contents panel. The same
numbers appear in the left margin of the prose, so a number quoted in the panel
can be found in the body without counting headings.

| Level | Markdown | Role |
| --- | --- | --- |
| Section | `##` | One claim. The heading states it. |
| Subsection | `###` | One move within that claim — a mechanism, a caveat, a variant. |
| Point | `####` | A named paragraph group: a specific case, a derivation step, a cost. |

Rules:

- **Every `##` gets at least two `###`.** A section with one subsection is a
  section that has not been decomposed; either split it further or drop the
  subsection.
- **`####` is optional and used where the material genuinely enumerates** — the
  three block types, the two ways out of an artefact, the parts of a cost. Do not
  add a third level for symmetry.
- **Never skip a level.** An `####` under an `##` with no `###` between breaks
  the numbering, which counts from the nearest ancestor.
- **h5 and deeper never appear in the outline** and have no styling. If you want
  one, you wanted a `####` or a bolded lead-in instead.
- Aim for **6–10 sections** and **15–25 headings in total** for a full essay. Any
  fewer and the panel is a list rather than a map; any more and it is a copy of
  the article.
- Close with a `##` **What to keep** — always the last section, never subdivided.

## Prose

Match the reference articles:

- Lead with the idea, not the formalism. Introduce the equation once the reader
  already knows what it is going to say.
- One claim per section. The heading states the claim.
- Go past the received summary. Where the standard explanation of a thing is
  incomplete — "residual connections fix vanishing gradients" — say what it
  actually does, give the arithmetic, and say what it leaves unfixed. That
  correction is usually the reason the article is worth writing.
- Prefer a checkable number to an adjective: 140-pixel receptive field, 69,632
  parameters, 4:1 gain ratio. Numbers a reader can verify are the difference
  between an essay and a summary.
- Captions say what to *do* with the figure — "set the impact parameter to 5.20
  and then to 5.19" — not what it contains.
- Close with a **What to keep** list: the handful of claims worth remembering,
  one sentence each.
- British-ish spelling for English pieces. No exclamation marks, no second-person
  hype, no "let's dive in". Admit what an approximation gets wrong.
- Chinese pieces (`lang: zh`) should keep the same structure and restraint; UI
  chrome strings stay in `src/i18n/ui.ts` and are not copied into the MDX.

Site brand is the calm **Sqhh99** wordmark. Do not add About blocks, author
resume sections, or demo-marketing chrome inside an essay.

## Out of scope (do not "helpfully" do these)

- Editing `src/content/brief/**` or the daily-brief cron pipeline
- Changing pagination, column registry, or list cards unless the article
  literally cannot build without a bugfix you own
- Renaming site domain / `astro.config.mjs` `site` / deploy config
- Adding a second language file as a "translation pair" (not supported)
- Cross-linking into another post's private `_figures/`

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
- open the contents panel: the outline is a tree, no level is skipped, and the
  numbers run `1` → `1.1` → `1.1.1` without a gap. Below 1100px the margin
  numbers move above their headings — check one at that width;
- enable `prefers-reduced-motion` in devtools: figures render a static frame and
  remain interactive;
- confirm the post is hidden from `npm run build` output while `draft: true`, and
  present after the flag is removed;
- open both `/blog/<slug>/` and `/zh/blog/<slug>/` — body identical, chrome localised.

## Common failure modes

| Symptom | Likely cause |
| --- | --- |
| Build fails on frontmatter | `tag` not in `TAGS`; fix tag or extend `TAGS` |
| Figure missing or dead | Forgot `client:visible`, or not a default export |
| Colours stuck in one theme | Hard-coded hex / skipped `useThemeColors` |
| Fans spin, tab janks | Drew without `useFigureCanvas`, or forced `client:load` on every figure |
| MDX parse error near maths | LaTeX backslashes not escaped for MDX |
| Article missing in production | Left `draft: true` |
| Outline numbers jump, e.g. `2` then `2.0.1` | Skipped a level — an `####` with no `###` above it in the section |
| Contents panel is a flat list | Article has only `##` headings; decompose the sections |
| Empty filter chip forever | Added a tag string in MDX but not to `TAGS` (build should fail — if you bypassed schema, fix properly) |
