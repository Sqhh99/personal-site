---
title: The cost of hydration
description: Server rendering gives you HTML quickly. Hydration is the bill that arrives afterwards, and most pages pay it for nothing.
date: 2026-07-12
tag: Frontend
featured: false
---

Server-side rendering solved the blank-screen problem: HTML arrives, the browser paints, the
user sees content. Then the framework downloads, parses and executes on the client, walks the
tree it was just handed, and re-establishes everything the server already knew.

That second step is hydration, and it is not free. For a page that is mostly text, it is the
single largest thing standing between "visible" and "usable".

## Visible is not interactive

The gap is easy to miss because the page *looks* finished. Content is painted. Nothing spins.
But the JavaScript that makes the menu open has not run yet, so a tap does nothing, and the
user taps again.

This is the thing Interaction to Next Paint actually captures, and why a page can score well
on paint metrics and still feel broken. The framework has to be downloaded, parsed, executed,
and only then can it attach the listeners — during which the main thread is busy and every
input sits in a queue.

For a typical marketing or content page the hydration work is almost entirely wasted, because
the components it is reconstructing are never going to change. Static text does not need a
component instance.

## Islands: hydrate what moves

The islands model inverts the default. The page is HTML. Individual components opt *in* to
shipping JavaScript, and each becomes an independent root with its own bundle.

```astro
---
import ThemeToggle from '../components/ThemeToggle';
import WaveField from '../components/WaveField';
---

<h1>Static heading — zero JavaScript</h1>

<ThemeToggle client:load />
<WaveField client:visible />
```

The directive is the interesting part, because it makes the loading strategy a property of the
component rather than of the framework:

- `client:load` — hydrate immediately. For anything above the fold that must respond at once.
- `client:idle` — wait for `requestIdleCallback`. For controls that can afford a beat.
- `client:visible` — wait for an IntersectionObserver. The right default for anything below
  the fold, and essential for anything expensive.
- `client:only` — skip server rendering entirely. Necessary when a component touches browser
  APIs that have no server equivalent.

`client:visible` is what makes heavy components tolerable. The 3D field on this site's home
page pulls in a WebGL library considerably larger than everything else on the page combined.
Because it is an island, that cost is a separate chunk that is fetched only when the element
scrolls into view — and if you never scroll, or WebGL is unavailable, you never pay it.
Nothing else on the page waits for it.

## The trade you are making

Islands are not strictly better. They are a trade, and the trade is real:

**State does not cross island boundaries.** Two islands are two React roots. They cannot share
a context or a store through the tree. You coordinate through URL state, `localStorage`,
custom events, or a store library with a framework-agnostic subscription — all of which are
more friction than passing a prop.

**Server-rendered markup can contradict the client.** A theme toggle that reads
`localStorage` will render one thing on the server and another on the client. You resolve the
theme in a blocking inline script before paint, and have the island read what that script
decided rather than deciding again.

**Islands multiply.** If every third element is interactive, you have a framework page with
extra steps and worse ergonomics. The model pays off when the interactive share is small — a
blog, docs, a marketing site. For an application shell where nearly everything is stateful, a
single root is the simpler and probably faster answer.

## The question worth asking

Not "which framework is fastest", but: *what fraction of this page actually needs to be
interactive?*

If the answer is most of it, ship an app. If the answer is a theme toggle and a search box —
which, for a site like this one, it is — then almost all of the JavaScript a conventional
setup would send is being spent reconstructing paragraphs that were already sitting in the
HTML, correct, since the first byte.
