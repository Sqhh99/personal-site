---
name: umber-engraving
description: The site's dark-fantasy look, which is old wood engravings printed in two inks (burnt umber on black) by ordered dither, plus the landing "descent" that implements it. Use this skill to add, swap, re-crop or re-tone a landing plate, or to change a level, sigil, transition, candle, lantern, dust, drift or autoplay. Use it to touch the umber palette tokens, or to carry the look onto a new surface such as a favicon, OG image, essay figure or 404 page. It covers the aesthetic rules, how the shader works, the plate pipeline, the tuning parameters, the pitfalls already hit, and how to verify.
---

# Umber engraving

The landing is one full-screen engraving per "level". There are seven levels, one for each classical planet from Saturn down to the Moon. Each is a Gustave Doré plate printed in **two inks, burnt umber on black, by 8×8 ordered dither**. The page shows no site name and no sentence; the pictures do the talking. Everything else on the site wears the same palette.

Read these before changing anything:

- `src/lib/descent/gl.ts`: the print, a single WebGL1 fragment shader.
- `src/lib/descent/scene.ts`: lifecycle, input, timing and the CPU fallback.
- `src/lib/descent/plates.json`: the plate list, shared by the page and the prep script.
- `src/components/DescentHero.astro`: the markup and the sigil SVGs.
- The `.descent*` block and `:root` tokens in `src/styles/global.css`.
- `scripts/prep-plates.mjs` (`npm run prep:art`): fetch, crop and grade.

## The style: rules that make it read right

The reference is a museum scan of a nineteenth-century wood engraving turned into a terminal wallpaper. **Copy the style, never a specific composition.** The rules:

1. **Exactly two inks.** Lit cells are `--umber` (`#9a8264`) and unlit cells are `--bg` (`#110e0b`). On the plate there are no gradients, no tints, no alpha overlays, no blur and no third colour. Every grey is made of dot density.
2. **Ordered, not diffused.** Use an 8×8 Bayer matrix. Its regular cross-hatch texture rhymes with engraved line. Error diffusion (Floyd–Steinberg) looks like newsprint and is wrong here.
3. **The cell is visible.** One dither cell is about 1.5 CSS px, rounded to whole device pixels, and is scaled up with `image-rendering: pixelated`. The grain must show at arm's length. If you can't see it, the cell is too small.
4. **Everything that moves is exposure.** Darkness, light, transitions, vignettes and dust are all a change to the value *before* the threshold. The result therefore stays in the same grain as the still print. Never lay a CSS gradient, `filter` or `opacity` over the canvas to fake one.
5. **Dark by default.** The tone curves leave most of the plate in black, with the light pooled where Doré put it: a lamp, a doorway, the moon, a figure. Aim for a similar umber density across all plates.
6. **No text, no frames.** Crop away the printed border and caption. The plate bleeds to every edge of the screen (`FIT = 1`); the edges fade to black only where the plate does not reach.
7. **Furniture is a whisper.** Seven hand-drawn planetary sigils sit on a plain black strip so they never land on lit engraving. Each is a 24-unit SVG with 1.4-unit strokes, umber at 0.5 opacity; the active one is in `--accent-deep` with a 1px rule beneath. The header shows only a faint "Menu" (0.55 opacity) on the landing.
8. **Public domain only.** Use Doré (or another pre-1900 engraver) from Wikimedia Commons, and credit each plate in its sigil's `aria-label` and in the README.

The scene list behind the seven levels is: a cave, a knight before a hermit, a sleeper under roots, a stair into darkness, a graveyard, an angel at a tomb, and moonlight. Treat it as a mood, not a checklist. Current picks, top to bottom: *Inferno* I, *Idylls* 1 and 7, *Atala* ×2, *Inferno* II, and *The Raven*.

## How the print works

The **canvas is the dither grid**: one canvas pixel per cell.

- `measure()` sets `cols = ceil(width / cellCss)`, where `cellCss = round(CELL·dpr)/dpr`.
- It then sets the canvas CSS size to exactly `cols·cellCss` by `rows·cellCss`. Whole cells mean the browser's nearest-neighbour scale never doubles a column.
- At 1080p the shader shades about 0.5 Mpx, which is close to free.

The fragment shader (`gl.ts`) runs these steps for each cell:

1. **Map.** It takes the cell centre `p` (0..1, with y pointing down) to plate UV with `uv = p·xf.xy + xf.zw`. `place()` in `scene.ts` builds `xf` as a cover-fit around the plate's `focus`, plus the Ken-Burns zoom and pan.
2. **Grade.** It samples the plate and multiplies by the edge fade, then applies levels: `pow(clamp((l - lo)/(hi - lo)), gamma)` with `tone = [lo, hi, gamma]`. The lantern lowers `lo` by `0.24·lift`.
3. **Choose plate (descent).** It switches from the old plate to the new one when the cell's turn comes up: `turn = bayer(cell + (3,5)) < clamp(mix·1.4 - p.y·0.4)`. The offset gives a second Bayer order, so the changeover itself looks dithered and sweeps top to bottom.
4. **Expose.** Several terms multiply `exposure`:
   - **Gutter:** `1 - sin(π·mix)·0.8` dims the light through the change.
   - **Candle:** a slow value-noise field (±8%) plus a small flutter (±2.5%).
   - **Lantern:** `1 + 0.55·lift`.
   - **Vignette:** a radial falloff toward the corners.
   - **Foot darkening:** a band under the sigils.
5. **Threshold.** `step(max(0.008, bayer + grain), v·exposure)`. The grain is a ±1.75% jitter that re-rolls at 10 Hz, so edges shimmer like cut line. The `max` floor keeps true black clean.
6. **Motes.** It loops over 24 `vec3(x, y, life)` uniforms in cell units. A mote lights its single cell when `life > threshold·0.8`, so faint motes only show in Bayer's low slots.
7. **Output.** `mix(uDark, uInk, lit)`.

`scene.ts` owns the following:

- **Timing:**
  - `IGNITE_MS = 1900` to light the first plate from a 1×1 black texture.
  - `DESCENT_MS = 1500` for each change.
  - `DWELL_MS = 20000` before autoplay goes down a level.
  - `HOLD_MS = 30000` of no autoplay after any input.
- **Frame rate:** a 30 fps cap when nothing is changing.
- **Input:**
  - The sigil buttons.
  - ←/→ and 1–7, ignored when the menu is open or focus is in an input.
  - A touch swipe (>48 px horizontal).
  - `#venus`-style hashes, written with `history.replaceState`.
  - Changes asked for mid-descent are queued to `pending`, keeping only the last one.
- **Loading:** the first plate (from the hash, or else Saturn) loads immediately and has a `<link rel="preload">`. The rest load nearest-first in `requestIdleCallback`.
- **Pausing:** an `IntersectionObserver` and `visibilitychange` both stop rAF.
- **Fallbacks:**
  - **No WebGL:** `printStill()` dithers the current plate once on the CPU with the same Bayer, tone and edge fade.
  - **`prefers-reduced-motion`:** one still frame, instant changes, and no candle, lantern, motes, drift or autoplay.

## Recipes

### Swap or add a plate

1. Find a public-domain engraving on Wikimedia Commons. Prefer a high-resolution scan with a clean border, since `findPlate()` relies on it.
2. Edit `src/lib/descent/plates.json`:
   ```json
   { "id": "venus", "file": "<Commons file name, no File: prefix>",
     "credit": "Gustave Doré — Atala, 1863", "focus": [0.45, 0.5], "tone": [0.3, 0.92, 1.45] }
   ```
3. Run `npm run prep:art -- --sheet <scratchpad>/sheet.png`. It writes `public/plates/<id>.jpg` and a contact sheet of every plate as the page prints it. **Look at the sheet**, then iterate on `tone` until the new plate's umber density matches its neighbours.
4. Check each file is under about 300 KB. They are currently 171–289 KB as single-channel mozjpeg at q68 and 900 px wide. JPEG beats WebP on engraved line here.
5. Commit the JPEGs. The build never touches the network.

To **add or remove a level**, also change all of the following together:

- `LEVELS` in `plates.ts`
- `SIGILS` in `DescentHero.astro`
- `planet.*` in all three languages (`en`, `zh`, `ja`) in `src/i18n/ui.ts`
- the `[1-7]` key regex in `scene.ts`
- the README plate credits

### Tune a plate

These are the starting values and what each one does.

| Field | Range | Effect |
|---|---|---|
| `tone[0]` (lo, black point) | 0.18–0.32 | Raise it to sink more of the plate into black, which suits busy, bright scans. Lower it for plates that are already dark, such as *Inferno* II at 0.18. |
| `tone[1]` (hi, white point) | 0.80–0.94 | Lower it to bring the lights to solid umber sooner. |
| `tone[2]` (gamma) | 1.25–1.5 | Higher values press the mid-tones down into sparse dots. Around 1.45 gives the "lamp in a cave" read. |
| `focus` | 0..1 for x and y | Where the cover-crop holds on screens of a different aspect. Check it at 390×844. Portrait phones crop hard, so keep figures inside the crop. |

### Tune the whole print

| Parameter | Location | Notes |
|---|---|---|
| `CELL` | `scene.ts` | Grain size. 1.5 gives 2 device px at dpr 1 and 3 device px at dpr 2. |
| `FIT` | `scene.ts` | Keep it at 1. Values below 1 show black bands at the sides. |
| `DRIFT` | `scene.ts` | Push-in over one dwell (4%). |
| Candle | `gl.ts` | `breath·0.16` and `flutter·0.025`. Stay subtle: more than about ±10% reads as broken video. |
| Lantern | `gl.ts` and `scene.ts` | Radius `min(cols,rows)·0.2`, black-point drop 0.24, exposure gain 0.55. Ease rates are 9/s for position and 3/s for strength. |
| Gutter depth | `gl.ts` | `0.8`. |
| Sweep slope | `gl.ts` | `p.y·0.4`. |
| Inks | `--umber` and `--bg` | Read from computed style when the scene starts. |

### Carry the look to another surface

- **A static asset** (favicon, OG card): pre-render it in exactly two hex colours, `#9a8264` on `#110e0b`. Use square cells (see `public/favicon.svg`: a dithered sun built from 4-unit `<rect>`s) or run `ditherPreview()` from `prep-plates.mjs`.
- **A canvas figure:** import `BAYER8` from `plates.ts` and threshold per cell. Read the inks with `useThemeColors`, never hard-coded values.
- **Site chrome:** the umber tokens are already global. Type is `--ink` / `--muted` / `--faint`, links are `--accent`, and emphasis is `--accent-deep`. Don't reintroduce pink, gold or cobalt, all of which were removed in the retheme.

## Pitfalls already hit

- **Dots in pure black.** Grain jitter pushed the threshold below 0, so `v = 0` cells lit up. Keep the `max(0.008, …)` floor.
- **Doubled columns or moiré.** These come from a canvas CSS size that isn't a whole number of cells, or from a cell that isn't a whole number of device pixels. Keep `measure()` as it is.
- **Black side bands.** These come from `FIT < 1`.
- **CLAHE in prep.** It flattens Doré's tonal range and bloats the files. Use `normalise` plus a 0.5 blur only.
- **Garbage contact sheet.** A decoded JPEG may come back as 3-channel. Call `.extractChannel(0)` before raw access.
- **Commons rate limits.** Calls without a descriptive User-Agent get HTML instead of an image. Keep the UA, the retries and the 800 ms gap.
- **Mobile URL-bar resizes.** Height changes under 80 px are ignored on purpose. Don't "fix" this; reprinting on every scroll is the bug.
- **Lighting the first plate:** use `printer.black` as the "from" texture, not the plate itself, or the ignite has nothing to come up from.

## Verify

1. Run `npm run check` and `npm run build`. Both must report 0 errors. With this repo's Windows Node on WSL, use `npm run …`, not `npm.cmd`.
2. Run `npm run prep:art -- --sheet …` if any plate changed, and look at the sheet.
3. Run `astro preview`. Screenshot with playwright-core (`channel: 'chrome'`) at 1440×900 and 390×844. Cover each `#<level>`, a frame about 700 ms after pressing →, the lantern on hover, `/zh/` with `reducedMotion: 'reduce'`, and Chrome launched with `--disable-webgl` for the CPU fallback.
4. Check that there is no horizontal overflow and no console errors.
5. Check that `aria-pressed` follows the active plate, and that the sigils are reachable with Tab.
