#!/usr/bin/env node
/**
 * Scaffolds a self-contained article directory.
 *
 *   npm run new:article -- my-article-slug
 *
 * Creates src/content/blog/<slug>/ holding index.mdx and a _figures/ directory
 * with one worked example. Nothing outside that directory is touched, which is
 * the whole point of the layout — see .claude/skills/write-article/SKILL.md.
 */

import { mkdir, writeFile, access } from 'node:fs/promises';
import { join } from 'node:path';

const slug = process.argv[2];

if (!slug) {
  console.error('Usage: npm run new:article -- <slug>');
  process.exit(1);
}

if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) {
  console.error(`Invalid slug "${slug}". Use lowercase words joined by hyphens — it becomes the URL.`);
  process.exit(1);
}

const dir = join('src', 'content', 'blog', slug);
/** Forward slashes read better in messages, including on Windows. */
const shown = dir.split(/[\\/]/).join('/');

try {
  await access(dir);
  console.error(`${shown} already exists. Pick another slug, or delete that directory first.`);
  process.exit(1);
} catch {
  // Does not exist, which is what we want.
}

const today = new Date().toISOString().slice(0, 10);
const title = slug.replace(/-/g, ' ').replace(/^./, (c) => c.toUpperCase());

const indexMdx = `---
title: ${title}
description: One sentence. It is the card blurb, the meta description and the lede under the headline, so make it carry weight.
date: ${today}
# Must be one of TAGS in src/consts.ts — the build fails on anything else.
tag: Notes
lang: en
featured: false
draft: true
---

import Figure from '@figures/Figure.astro';
import MarginNote from '@figures/MarginNote.astro';
import ExampleFigure from './_figures/ExampleFigure.tsx';

Open with the idea, not the formalism. One or two paragraphs that say what this
piece is going to establish and why it is worth the reader's time.

## First section

Sections are numbered automatically and appear in the contents pill. Keep one
claim per section.

<Figure caption="Say what the reader should do with the figure, not what it contains. 'Drag the frequency slider through a component and watch the shaded lobes stop cancelling' beats 'a plot of correlation against frequency'.">
  <ExampleFigure client:visible />
</Figure>

<MarginNote>
An aside that is worth saying but would derail the paragraph. Sits in the right
gutter on wide screens, inline below it otherwise.
</MarginNote>

Inline maths is $e^{i\\pi} + 1 = 0$; display maths is:

$$
X(f) = \\int_{-\\infty}^{\\infty} x(t)\\,e^{-2\\pi i f t}\\,dt
$$

## What to keep

- Close with the handful of claims worth remembering.
- Each one a sentence, no more.
`;

const exampleFigure = `import { useState } from 'react';
import { useFigureCanvas } from '@figures/useFigureCanvas';
import { fade, useThemeColors } from '@figures/useThemeColors';
import { Canvas, FigureBody, Panel, Slider } from '@figures/controls';
import { TAU, baseline, box, curve } from '@figures/plot';

/**
 * A worked example of the figure shape. Delete it once you have a real one.
 *
 * The two hooks are not optional furniture: \`useFigureCanvas\` owns the
 * devicePixelRatio scaling and suspends the loop when the figure scrolls out of
 * view, and \`useThemeColors\` is the only reason the canvas survives the theme
 * toggle — canvas pixels are not styled by CSS, so never hard-code a colour.
 */
export default function ExampleFigure() {
  const colors = useThemeColors();
  const [frequency, setFrequency] = useState(3);

  const { canvasRef, aspect } = useFigureCanvas(
    (ctx, { width, height, time }) => {
      const plot = box(18, 18, width - 36, height - 36);
      baseline(ctx, plot, fade(colors.faint, 0.4));
      curve(ctx, plot, (u) => Math.sin(TAU * frequency * (u - time * 0.2)), colors.accent, {
        width: 2.5,
      });
    },
    { aspect: 21 / 9 },
  );

  return (
    <FigureBody>
      <Canvas canvasRef={canvasRef} aspect={aspect} label="A travelling sine wave." />
      <Panel columns={1}>
        <Slider
          label="frequency"
          value={frequency}
          min={1}
          max={9}
          step={0.01}
          format={(v) => \`\${v.toFixed(2)} Hz\`}
          onChange={setFrequency}
        />
      </Panel>
    </FigureBody>
  );
}
`;

await mkdir(join(dir, '_figures'), { recursive: true });
await writeFile(join(dir, 'index.mdx'), indexMdx, 'utf8');
await writeFile(join(dir, '_figures', 'ExampleFigure.tsx'), exampleFigure, 'utf8');

console.log(`Created ${shown}/
  index.mdx
  _figures/ExampleFigure.tsx

It is marked draft: true, so it shows in \`npm run dev\` but not in a production
build. Set the tag, write the piece, then drop the draft flag.

  npm run dev   →  http://localhost:4321/blog/${slug}/
`);
