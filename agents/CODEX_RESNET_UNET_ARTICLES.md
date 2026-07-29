# Task: Two interactive essays — ResNet family + U-Net family

Repo: `/home/sqhh99/workspace/personal-site`

You are writing **two** long-form interactive essays for this site. Follow
**exactly** the authoring skill at:

`.claude/skills/write-article/SKILL.md`

Also read one existing article end-to-end before coding figures:

- `src/content/blog/the-shape-of-frequency/index.mdx` + its `_figures/`
- and/or `src/content/blog/four-kinds-of-hole/`

Match their register (explanatory, compute-not-illustrate, British-ish English,
"What to keep" close, no hype).

## Deliverables

### Article A — Residual networks
- Slug: `residual-networks`
- Path: `src/content/blog/residual-networks/`
- `tag: PyTorch` (already in TAGS — do **not** invent a new tag unless necessary)
- `lang: en`
- `featured: false`
- `draft: false` when finished and build-clean
- `date: 2026-07-30` (or today's Asia/Shanghai date if different)

### Article B — U-Net and descendants
- Slug: `u-net-and-beyond`
- Path: `src/content/blog/u-net-and-beyond/`
- Same frontmatter rules as A (`tag: PyTorch`, `lang: en`, `featured: false`, `draft: false` when done)

You may scaffold with:

```bash
npm run new:article -- residual-networks
npm run new:article -- u-net-and-beyond
```

then replace the example figure and rewrite `index.mdx`.

## Content requirements (substance)

### A. ResNet
Explain residual learning from the problem of deep degradation, through the
identity shortcut, to why gradients can travel. Cover the original He et al.
basic block and bottleneck, then **improvements built on the residual idea**
(pick the important ones; depth over laundry list), e.g.:

- ResNet-v2 (pre-activation)
- Wide ResNet (width vs depth intuition)
- ResNeXt (cardinality)
- DenseNet as a contrasting connectivity pattern (brief, honest comparison — not "DenseNet is ResNet")
- Squeeze-and-Excitation / attention-on-channels as a residual-friendly add-on
- Optional short note: modern training recipes (not a full recipe dump)

Math where it earns its keep (residual update $y = F(x) + x$, optional gradient
sketch). Admit approximations.

### B. U-Net
Explain encoder–decoder with skip connections for dense prediction (medical seg
origin is fine as motivation, but keep it engineering-general). Then
**improvements / family members**, e.g.:

- 3D U-Net (idea, not full implementation)
- UNet++ / nested skips (intuition)
- Attention U-Net (what is attended)
- Residual U-Net / ResUNet style blocks
- nnU-Net as "the method is the configuration" (short)
- Optional: diffusion / modern backbones using U-Net-shaped denoisers — one clear paragraph, not a survey dump

## Interactive figures (required)

Each article needs **at least 5** real interactive figures in `_figures/`,
using **only** `@figures/*` (useFigureCanvas, useThemeColors, controls, plot).
**No hard-coded colours. Default export. `client:visible`.**

Include among them (names flexible):

### Shared expectations for architecture / flow figures
These are **interactive diagrams**, not static PNGs:
- hover or click stages to highlight a block and show a readout (channels, spatial size, op name)
- sliders for depth / width / skip strength / noise where meaningful
- play/pause only if animation adds understanding

### ResNet — suggested figure set (adapt as needed)
1. **Degradation toy** — train/val error vs depth for plain stack vs residual (schematic curves computed in JS, not faked screenshots)
2. **Residual block explorer** — toggle basic vs bottleneck; show tensor shapes through convs; highlight shortcut path
3. **Gradient highway** — schematic backward flow with/without identity (animated pulse along edges)
4. **Family map** — interactive graph: ResNet → pre-act / WRN / ResNeXt / SE; click node for one-paragraph readout
5. **Cardinality / width trade** — ResNeXt-style split-transform-merge diagram with cardinality slider

### U-Net — suggested figure set
1. **U-shaped architecture walkthrough** — encoder/bottleneck/decoder stages; click level to show HxWxC
2. **Skip connection ablations** — toggle skips on/off and show a toy "boundary recovery" metric or schematic reconstruction quality
3. **Skip variants** — plain concat vs additive residual skip vs nested (UNet++) diagram
4. **Attention gate** — simplified attention-U-Net gate; slider on gating strength
5. **Family map** — U-Net → 3D / ++ / Attention / ResUNet / nnU-Net; click for readout

Figures must **compute** layout geometry and any toy metrics in the component.
ASCII flowcharts in MDX are not a substitute for the interactive diagrams.

## Prose craft
- ~ similar length to existing essays (roughly 120–200 lines of MDX body is fine; quality > bulk)
- Sections = claims; captions tell the reader **what to do**
- End each article with **What to keep**
- Maths: `$...$` / `$$...$$` with MDX-safe escaping (`\\frac` etc.)
- Import pattern exactly as skill + scaffolder

## Constraints (hard)
- Touch only `src/content/blog/<slug>/` and, if truly needed, `TAGS` in `src/consts.ts`
- Do **not** edit briefs, layouts, pagination, other articles, package.json
- Do **not** commit or push
- Do **not** leave `ExampleFigure.tsx` behind
- Do **not** leave `draft: true` if build is clean and content is complete
- Prefer finishing **both** articles build-clean over one perfect and one broken

## Verification (must run)
```bash
npm run check
npm run build
```
Fix until both pass. Spot-check that both slugs appear in build output under `dist/blog/`.

## Done criteria
- [ ] `residual-networks` and `u-net-and-beyond` directories complete
- [ ] Each has ≥5 interactive figures, theme-safe, reduced-motion safe via hooks
- [ ] Architecture/flow figures are interactive, not static drawings only
- [ ] `npm run check` + `npm run build` clean
- [ ] Short summary of files + any known limitations

Work until both articles are done. Start by reading the skill and one reference article, then scaffold, then implement figures before polishing prose if that reduces risk.
