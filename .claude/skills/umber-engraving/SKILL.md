---
name: umber-engraving
description: The site's dark-fantasy look, which is old wood engravings printed in two inks (burnt umber on black) by ordered dither, plus the landing "descent" that implements it. Use this skill to add, swap, re-crop or re-tone a landing plate, or to write or fix a plate's legend. Use it to change a planet, sigil, tick, transition, candle, lantern, dust, drift, autoplay, the auto-hiding bar or the legend's veil. Use it to touch the umber palette tokens, or to carry the look onto a new surface such as a favicon, OG image, essay figure or 404 page. It covers the aesthetic rules, how the shader works, the plate and legend pipeline, the tuning parameters, the pitfalls already hit, and how to verify.
---

# Umber engraving

The landing is one full-screen engraving at a time, 21 plates in all. They are grouped in seven chapters, one per classical planet in the old order: Saturn, Jupiter, Mars, Sun, Venus, Mercury, Moon. Each chapter has three plates.

Every plate is a Gustave Doré engraving printed in **two inks, burnt umber on black, by 8×8 ordered dither**. The page has no site name and no words of its own. The only text is an optional legend quoting the lines a plate illustrates. Everything else on the site wears the same palette.

Read these before changing anything:

| File | What it holds |
|---|---|
| `src/lib/descent/gl.ts` | The print: a single WebGL1 fragment shader. |
| `src/lib/descent/scene.ts` | Lifecycle, navigation, timing, the lantern, dust and the CPU fallback. |
| `src/lib/descent/chrome.ts` | The auto-hiding bar and the dither-dissolve masks. |
| `src/lib/descent/legend.ts` | The legend's toggle, persistence and line-by-line ink-in. |
| `src/lib/descent/legends.ts` | Per plate: the source, the verse, and a note in en/zh/ja. |
| `src/lib/descent/plates.json` | The plate list, shared by the page and the prep script. `plates.ts` types it and adds helpers: `chapterStart`, `parseHash`, `todayPlanet`, `ROMAN`, `BAYER8`. |
| `src/components/DescentHero.astro` | Markup, sigil SVGs, all 21 legends rendered server-side, and the today's-plate preload. |
| `src/styles/global.css` | The `.descent*` block and the `:root` tokens. |
| `scripts/prep-plates.mjs` | `npm run prep:art`: fetch, crop and grade the plates. |

## The style: rules that make it read right

The reference is a museum scan of a nineteenth-century wood engraving turned into a terminal wallpaper. **Copy the style, never a specific composition.**

1. **Exactly two inks.** Lit cells are `--umber` (`#9a8264`) and unlit cells are `--bg` (`#110e0b`). On the plate there are no gradients, no tints, no alpha overlays, no blur and no third colour. Every grey is made of dot density.
2. **Ordered dither, not diffusion.** Use an 8×8 Bayer matrix. Its regular cross-hatch texture rhymes with engraved line; Floyd–Steinberg looks like newsprint.
3. **The cell is visible.** One dither cell is about 1.5 CSS px, rounded to whole device pixels. It is scaled up with `image-rendering: pixelated`, and the grain must show at arm's length.
4. **Everything that moves is exposure.** Transitions, light, the vignette, dust, and the veil under the legend are all a change to the value *before* the threshold. Never lay a CSS gradient, `filter` or `opacity` over the canvas.
5. **UI comes and goes in the grain too.** The bar and "Menu" dissolve through 8×8 Bayer masks at the plate's own cell size (`chrome.ts`), and legend lines ink in the same way. Avoid soft CSS fades, except as the reduced-motion fallback.
6. **Dark by default.** Most of each plate sits in black, with light pooled where Doré put it. All 21 plates aim for a similar umber density, which you can check on the contact sheet.
7. **No frames, and text only on request.** The printed border and caption are cropped away, and the plate bleeds to every edge (`FIT = 1`). The legend has no panel; the print sinks to black under it. When there is no WebGL, and so no veil, a `--bg` panel stands in.
8. **Furniture is a whisper.**
   - Seven 24-unit sigils with 1.4-unit strokes, umber at 0.5 opacity; the active one is `--accent-deep`.
   - Under each sigil, three 4 px "cell" ticks. Only the active planet's ticks are clickable and focusable; the others are faint marks.
   - A hairline rule before the book button.
   - All of it sits on a plain black strip.
9. **Public domain only.**
   - **Plates:** Doré or another pre-1900 engraver, from Wikimedia Commons.
   - **Verse:** only from public-domain texts, checked against Project Gutenberg. Use Cary for Dante, Tennyson, Milton, Poe, and the English text of the Doré *Atala*.
   - An ellipsis marks a cut, never a change.
   - **Credits:** each tick's `aria-label` and each legend's credit line carry `Gustave Doré — work, year`.
10. **Keep plates safe for a landing.** Avoid plates where nudity is the centrepiece. For example, *Inferno* plate 15 (Francesca) was swapped out for plate 14 (the hurricane).

## How the print works

The **canvas is the dither grid**: one canvas pixel per cell.

- `measure()` sets `cols = ceil(width / cellCss)`, where `cellCss = round(CELL·dpr)/dpr`.
- It then sizes the canvas in CSS to exactly whole cells, so the nearest-neighbour scale never doubles a column.
- The same cell size goes to `masks.resize()` for the UI dissolves.

The fragment shader (`gl.ts`) runs these steps for each cell:

1. **Map.** It maps the cell centre `p` (0..1, with y pointing down) to plate UV with `uv = p·xf.xy + xf.zw`. `place()` builds `xf` as a cover-fit around `focus`, plus the push-in and pan. `toScreen()` inverts it, to put plate points such as lights on screen.
2. **Grade.** It applies the edge fade, then `pow(clamp((l - lo)/(hi - lo)), gamma)` with `tone = [lo, hi, gamma]`. The lantern lowers `lo` by `0.24·lift`.
3. **Descent, direction-aware.**
   - It computes `sweep = mix·1.5 − s·0.5`, where `s` is `p.y` going deeper (`uDir = 1`) and `1 − p.y` going back.
   - A cell switches plate when its turn comes, `bayer(cell + (3,5)) < sweep`.
   - The old plate's exposure falls as the sweep passes, `1 − smoothstep(0, 0.5, sweep)`.
   - The new plate **catches outward from its lamp**: `smoothstep(d − 0.3, d + 0.05, front)`. Here `d` is the aspect-corrected distance to `uToLight`, and `front` eases from 0 to 1.35 over `mix` 0.25 to 1.
   - Igniting the first plate from `printer.black` uses the same maths.
4. **Expose.**
   - **Candle:** ±8% noise plus a ±2.5% flutter.
   - **Lantern:** `× (1 + 0.55·lift)`.
   - **Vignette.**
   - **Foot darkening:** `0.55·uFoot`, which eases to 0 while the bar is hidden.
   - **Veil:** a rounded box with a long dithered shore, `1 − smoothstep(−0.03, 0.16, dist)`, scaled by `uVeilAmt`.
5. **Threshold.** `step(max(0.008, bayer + grain), v·exposure)`. The floor keeps true black clean.
6. **Motes.** 24 `vec3(x, y, life)` cells. They are gated by `min(exposure, 1)`, so dust never shows under the legend.

`scene.ts` owns the rest.

- **Navigation:**
  - ←/→ step through all 21 plates, wrapping.
  - ↑/↓ change planet.
  - 1–7 jump to a planet.
  - `L` toggles the legend.
  - The sigils go to a chapter's first plate; the ticks go to a specific plate.
  - A swipe steps one plate.
  - The hash is `#venus` or `#venus-2`, written with `replaceState`.
  - A change asked for mid-descent is queued, keeping only the last one.
- **Opening plate:** the hash if it names a plate, else the first plate of `todayPlanet()`. The old weekday rulers are Sun, Moon, Mars, Mercury, Jupiter, Venus, Saturn. An `is:inline` script in the component runs the same logic to inject the `<link rel=preload>`, since a static page can't know the day.
- **Timing:**
  - `IGNITE_MS 1900` and `DESCENT_MS 1500`.
  - `DWELL_MS 20000`, rising to `DWELL_READING_MS 28000` while the legend is open.
  - `HOLD_MS 30000` after any input.
  - At 60% of a dwell, the next plate is prefetched.
- **Loading:** the current plate loads first. When idle, the plates at ±1 and the next planet's first plate load. Anything else loads on demand, because `go()` awaits `load(i)`.
- **Lantern:** it follows a fine pointer while it moves. After `WANDER_IDLE_MS 6000`, or on touch, it wanders the plate's `light[]` points, `WANDER_STEP_MS 5000` per point, at strength 0.6 with slow easing.
- **Dust** spawns around `light[0]` on screen, ±12% across, and rises. It is re-scattered on every plate change.
- **Pausing and fallbacks:**
  - `IntersectionObserver` and `visibilitychange` pause rAF.
  - With no WebGL, `printStill()` prints on the CPU.
  - With reduced motion there is one still frame, instant changes, and no candle, lantern, wander, motes, drift or autoplay. Draws are then triggered by events, through `reprint()`.

`chrome.ts`:

- **Hiding:** after `IDLE_MS 3500` the bar and `#menu-toggle` hide.
  - The state is set on `.descent[data-chrome]` and `html[data-descent-chrome]`.
  - The cursor is hidden on fine pointers.
- **Coming back:** on `pointerdown`, `keydown`, `wheel`, or more than 24 px of mouse travel in one movement (travel is forgotten after a 300 ms pause, `NUDGE_GAP_MS`).
- **Never hides while:**
  - the pointer is over the bar
  - keyboard focus (`:focus-visible`) is in the bar or on "Menu". A clicked sigil keeps focus too, so plain focus would hold the bar up for good
  - the menu is open
  - a descent the visitor started is still running (`busy`, checked against the clock, not the frame loop)
- **Dissolve:** `createMasks().run(els, 'in'|'out', ms, stagger)` steps through 9 coverage tiles: 0, 8 … 64 of the 64 cells.
  - Level 0 sets `visibility: hidden`.
  - Coming in, level 1 is set immediately, so a Tab that wakes the bar can land in it.
  - Under reduced motion it is a no-op, and the CSS fades instead.

`legend.ts`:

- **Default state:** shut, at every width; it shows only when the book or `L` opens it. An open legend is kept in `sessionStorage['descent.legend']` (wrapped in try/catch), so it survives a reload in the tab but a new visit starts on the bare plate.
- **Changing plates:** the old article dissolves out over 40% of the change. The new article's `[data-line]` children then ink in, 6% staggered.
- **Accessibility:** `aria-live` is `polite` only while the legend is open.
- **Veil:** a `ResizeObserver` reports box changes. `measureVeil()` converts the box to screen fractions, padded by 28 px. `veil.amt` and `veil.box` ease in the tick.

## Recipes

### Swap or add a plate

1. Find a public-domain engraving on Commons. A search via `api.php?list=search&srnamespace=6` works, and a numbered contact sheet of candidates helps.
   - Low-resolution scans of about 670 px are soft. Prefer 900 px or more; the output width is 900.
   - To identify an Idylls or *Paradise Lost* plate's scene, the `globalusage` pages often carry the original caption. Wikisource djvu pages of the Doré editions are an example.
2. Add or edit its `plates.json` entry:

   ```json
   { "id": "venus-2", "planet": "venus", "file": "<Commons file name>", "work": "Inferno, Canto V",
     "year": 1861, "focus": [0.5, 0.5], "tone": [0.05, 0.82, 1.15], "light": [[0.6, 0.32], [0.35, 0.28]] }
   ```

   - If the scan's sky is paper-white, `findPlate()` will grab the wrong run of rows. Add `"crop": [x0, y0, x1, y1]` as fractions of the scan; Mercury III needed this.
3. Run `npm run prep:art -- --only venus-2 --sheet <scratch>/sheet.png`. The sheet still shows every plate, three to a row (one chapter), so density can be compared. Tune `tone` until it matches the plate's neighbours; aim for a mean printed value of about 0.08–0.15.
4. Place the `light` points. Render a dithered preview with crosses at each point and check that they sit on the lamp, the moon or the figures. The first point is where the descent ignites and where dust rises.
5. Write the legend in `legends.ts`.
   - **Verse:** 2–5 lines, verbatim from the Gutenberg text, with `…` for any cut.
   - **Source:** for example `Dante, Inferno V · tr. H. F. Cary`.
   - **Note:** 1–2 sentences tying the scene to its planet, in en, zh and ja. Use full-width punctuation in zh, and state no fact you haven't checked.
6. Keep each file under about 300 KB; the current total is about 4 MB. Commit the JPEGs.

To **add a planet or change the count per planet**, also change these together:

- `PLANETS`, `WEEKDAY` and `ROMAN`
- `SIGILS` in `DescentHero.astro`
- `planet.*` in all three languages in `src/i18n/ui.ts`
- the `[1-7]` key regex
- the `--i` stagger centre (`Math.abs(k − 3)`)
- the README credits

### Tune a plate

| Field | Range | Effect |
|---|---|---|
| `tone[0]` (lo) | 0.05–0.55 | Raise it to sink bright scans into black; lower it for dark ones. |
| `tone[1]` (hi) | 0.82–1.25 | Lower it to bring the lights up to solid umber sooner. **Above 1** keeps paper-white areas dotted instead of solid; Limbo uses 1.25. |
| `tone[2]` (gamma) | 1.15–1.6 | Higher values press the mid-tones into sparse dots. |
| `focus` | 0..1 | The cover-crop anchor. Check it at 390×844, where portrait crops are hard. |
| `light[]` | 0..1 | The ignite point (`[0]`), the dust source, and the lantern's wander path. |

### Tune the whole thing

| Parameter | Location | Notes |
|---|---|---|
| `CELL` | `scene.ts` | Grain size. |
| `FIT` | `scene.ts` | Keep it at 1. |
| `DRIFT` | `scene.ts` | Push-in over one dwell (4%). |
| Sweep slope | `gl.ts` | `s·0.5`. |
| Ignite front | `gl.ts` | Softness 0.3–0.05, reach 1.35. |
| Old-plate fade | `gl.ts` | `smoothstep(0, 0.5, sweep)`. |
| Candle | `gl.ts` | 0.16 and 0.025. Stay under about ±10%. |
| Lantern | `gl.ts`, `scene.ts` | Radius `min(cols,rows)·0.2`, black-point drop 0.24, gain 0.55. Follow rate 9/s on the pointer and 0.8/s when wandering; wander strength 0.6. |
| Veil | `gl.ts`, `scene.ts` | Shore `−0.03…0.16` of screen height, padding 28 px, ease rates 4/s (depth) and 6/s (box). |
| Bar | `chrome.ts` | `IDLE_MS`, `DISSOLVE_MS 420`, `NUDGE_PX 24`, `NUDGE_GAP_MS 300`. |
| Legend | `legend.ts` | Swap split 0.4/0.45; ink-in 0.25 with 0.06 stagger. |

### Carry the look to another surface

- **A static asset** (favicon, OG card): pre-render it in exactly `#9a8264` on `#110e0b`, with square cells. See `public/favicon.svg`, or `ditherPreview()` in `prep-plates.mjs`.
- **A canvas figure:** threshold per cell against `BAYER8` from `plates.ts`, and read the inks with `useThemeColors`.
- **UI that should appear or disappear:** reuse `createMasks()` from `chrome.ts` rather than a CSS fade.
- **Site chrome:** the tokens are already global. Don't reintroduce pink, gold or cobalt. The header, the menu and the writing pages carry the look this way:
  - Type: small-caps mono (`0.66–0.72rem`, tracking `0.14–0.16em`) for every label, Newsreader for titles and for running text.
  - No boxes. A tag, the current menu entry, the active filter and the wordmark are marked by one lit 4–5 px cell (`--accent-deep`); a section break and the end of a post are three cells (`.cell-mark`, `.prose hr`).
  - Numbering by Roman numerals, as the plates are: the menu entries, and the kicker over each column's heading.
  - The menu prints in with `createMasks()` at a 3 px cell (`Header.astro`).
  - Writing and briefs share one list row (`Entry.astro`): date and tag in a left column, the title across, reading time at the right, the whole row a link.
  - A post or brief sets its text at `--text-measure` (46rem) and opens figures, code and tables out to `--measure` (58rem). The head sits on the text's left edge but runs out to the figure width on the right, so titles don't wrap early. Margin notes hang outside the figure width, from 1440 px.

## Pitfalls already hit

- **The bar never hid after a click.** A clicked sigil keeps focus, and "focus in the bar" held it. Hold only for `:focus-visible`.
- **Dots in pure black.** Grain pushed the threshold below 0. Keep `max(0.008, …)`.
- **Doubled columns or moiré.** The canvas CSS size was not a whole number of cells. Keep `measure()` as it is.
- **Black side bands.** These come from `FIT < 1`.
- **CLAHE in prep.** It flattens Doré's tones and bloats the files.
- **Garbage contact sheet.** Use `.extractChannel(0)` before raw access.
- **Commons rate limits.** Keep the descriptive User-Agent, the retries and the 800 ms gap. Use `--only` instead of refetching all 21. Non-ASCII titles must be URL-encoded, or you get a 400.
- **Auto-crop picked half a plate.** On a bright-sky scan the longest dark run of rows is the lower half. Use `crop`.
- **Paper-white solids.** `hi < 1` on a near-white scan prints flat umber blocks; push `hi` above 1.
- **Duplicate GLSL names.** GLSL ES won't let one name be declared twice in `main`. The pointer lantern's distance is `ld`; `d` is the distance to the new plate's lamp.
- **Reduced motion never hid the bar.** `busy` relied on the rAF loop to clear itself. It now checks `mixStart + mixMs` against the clock.
- **Tests that seed `localStorage` with `addInitScript`** re-seed on reload. Test persistence in a context without the seed.
- **Mobile URL-bar resizes** under 80 px are ignored on purpose.
- **Lighting the first plate:** use `printer.black` as the "from" texture, or the ignite has nothing to come up from.

## Verify

1. Run `npm run check` and `npm run build`. Both must report 0 errors. With Windows Node on WSL, use `npm run …`.
2. If a plate changed, run `npm run prep:art -- --only … --sheet …` and look at the sheet.
3. Run `astro preview`. Drive Chrome with playwright-core (`channel: 'chrome'`) at 1440×900 and 390×844 (`isMobile`, `hasTouch`). Cover:
   - every `#<plate>`, ideally on a grid of all 21 with the legend open
   - frames about 500 and 900 ms after → and after ←, which should show opposite sweeps and the lamp igniting
   - the bar hidden after about 4 s, mid-dissolve, and back after a click; staying while focused and while the menu is open
   - `L` toggling the legend, staying open across a reload in the same tab, shut on a fresh visit, and the phone layout
   - `page.clock.install` on a Tuesday with no hash, which should open on Mars
   - `/zh/` with `reducedMotion: 'reduce'`, where the bar should still hide
   - `/ja/` in Chrome with `--disable-webgl --disable-3d-apis`, where the legend gets its own black panel
4. Check that there is no horizontal overflow and no console errors.
5. Check that the sigils' and ticks' `aria-pressed` follow the plate, and that only the active planet's ticks are tabbable.
