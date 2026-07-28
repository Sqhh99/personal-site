---
title: Why this site exists
description: A place to write down the constraints, not just the conclusions — and a short account of how it is built.
date: 2026-07-27
tag: Notes
featured: true
---

The useful part of an engineering problem is rarely the answer. It is the set of constraints
that made that answer the right one — the thing that gets deleted from the commit message,
left out of the docs, and lost entirely by the time someone asks six months later why it works
this way.

This site is where I write those down.

## What goes here

Four subjects, mostly because they keep turning out to be the same subject:

- **WebRTC and realtime media** — signalling, ICE, media pipelines, latency budgets.
- **PyTorch and deep learning** — training loops, profiling, inference performance.
- **Web engineering** — TypeScript, rendering strategies, shipping less JavaScript.
- **Systems and performance** — concurrency, backpressure, measurement.

A dropped video frame and a stalled training step are the same problem viewed from different
angles: something upstream produced faster than something downstream consumed, and nobody
decided in advance what should happen next.

Posts here try to keep the conditions attached to the conclusion. What was measured, on what
hardware, under what load, and what would make the conclusion wrong. A benchmark without its
conditions is an anecdote.

## How it is built

The previous version was a single HTML file plus about seven hundred lines of hand-written
JavaScript that string-rendered the entire DOM, including a small Markdown parser I had
written myself. It worked. It was also a dead end: no types, no routing, and posts that lived
behind a query parameter where no crawler would ever find them.

This one is [Astro](https://astro.build) with content collections. Posts are Markdown files
with a Zod-validated frontmatter schema, which means a typo in a tag name fails the build
rather than rendering an empty filter. Every post is a real, statically generated URL.

Three components ship JavaScript: the theme toggle, the search and tag filter on the writing
index, and the shader field on the home page. Everything else is HTML by the time it leaves
the server. The filter is deliberately arranged so the post cards are server-rendered and the
island only toggles their visibility — the full list is in the HTML whether or not the
JavaScript ever runs.

Styling is Tailwind v4, with the palette defined once as CSS custom properties and exposed
through `@theme inline` so the light and dark variants swap at runtime instead of being baked
in at build time. The type is Newsreader over Inter.

It deploys as static files to Cloudflare Workers Static Assets. There is no server, no
database and no build step more complicated than `astro build`.

## The standing rule

Write the post when the problem is still annoying. Once something is understood it becomes
obvious, and obvious things do not get written down — which is exactly why the same problem
costs a full afternoon the second time.
