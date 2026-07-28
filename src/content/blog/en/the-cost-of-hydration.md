---
title: The cost of hydration
description: Main-thread blocking time, INP/TBT mechanics, JS CPU cost models, and Islands vs Resumability vs RSC — measuring the real cost of client-side hydration.
date: 2026-07-12
tag: Frontend
featured: false
---

Server-side rendering (SSR) solved the blank-screen problem that plagued early single-page applications (SPAs). The server renders HTML, the browser receives bytes, parses markup, and paints text and layout immediately. Paint metrics like First Contentful Paint (FCP) and Largest Contentful Paint (LCP) look fast.

Then the client-side JavaScript bill arrives.

Before the page can respond to user input, the browser must download the framework runtime and component bundles, parse and compile the JavaScript on the main thread, execute top-level scripts, construct an in-memory Virtual DOM tree, reconcile it against the existing HTML DOM, and attach event listeners. 

This process is **hydration**, and on mid-range mobile devices, it is the primary cause of high Total Blocking Time (TBT) and poor Interaction to Next Paint (INP) scores.

## The Browser Execution Pipeline: Visible is Not Interactive

To understand why hydration incurs high CPU cost, consider the exact execution timeline of a server-rendered page undergoing full framework hydration:

```
Server HTML Sent     Browser Paints HTML     JS Downloaded     JS Parse/Compile     DOM Reconciliation     Page Interactive
------|-----------------------|---------------------|-----------------|---------------------|----------------------|----->
      |<=== Visible (FCP) ===>|                     |<================ Main Thread Blocked ================>|
                                                    |<------------ Unusable Window (TBT/INP) -------------->|
```

### The Unusable Window
During the interval between initial paint and hydration completion, the page presents a dangerous illusion: it *looks* interactive, but buttons, drop-down menus, and navigation toggles do not respond because event listeners have not been attached.

When a user taps an un-hydrated button:
1. The browser records a user input event (`pointerdown`, `click`).
2. The main thread is currently executing a 150ms JavaScript Long Task (parsing component modules and running hydration reconciliation).
3. The user event is pushed into the browser's input queue.
4. The event handler cannot run until the long hydration task completes.
5. The delay between user input and frame presentation spikes—directly failing the **INP (Interaction to Next Paint)** metric.

### The Memory & CPU Cost Model of JavaScript
A common mistake is treating 100 KB of JavaScript as equivalent to 100 KB of HTML or image data.

| Resource Type | Network Cost (100 KB Gzipped) | CPU Execution Cost (Mid-Range Mobile ARM) | Memory Overhead |
| :--- | :--- | :--- | :--- |
| **JPEG / WebP Image** | ~100 KB transferred | ~5ms GPU/GPU texture decode | VRAM texture buffer |
| **HTML / CSS Markup** | ~100 KB transferred | ~10ms streaming DOM parse & paint | Standard DOM node tree |
| **JavaScript Bundle** | ~100 KB (~350 KB uncompressed) | **80ms – 180ms** Main-Thread Parse, Bytecode Compile, and Execution | **Triple Tax**: Script text + VDOM tree + Component Instances + Closures |

JavaScript imposes a **triple memory tax**: the raw script text retained in memory, the internal Virtual DOM tree nodes, and the heap closures attached to active event listeners.

## Architecture Matrix: Full Hydration vs RSC vs Islands vs Resumability

To eliminate hydration overhead, modern web architectures take fundamentally different approaches to handling client-side JavaScript:

| Architecture | Initial JS Payload | Hydration CPU Cost | State Sharing Ergonomics | Best Use Cases |
| :--- | :--- | :--- | :--- | :--- |
| **Full SPA / SSR Hydration** (Next.js Pages, Remix) | Large (Full app bundle + framework runtime) | High (Reconciles 100% of DOM tree on main thread) | Seamless (Single React tree & Context API) | Application shells, complex dashboards, highly stateful SaaS apps. |
| **React Server Components** (RSC / Next.js App Router) | Medium (Client components only; server components zero JS) | Medium (Hydrates client boundaries; streams flight data) | Good (Server/Client boundary passing via props) | Content + commerce apps with mixed interactive regions. |
| **Islands Architecture** (Astro, Fresh) | Minimal (Only interactive components ship JS) | Very Low (Independent roots; zero hydration for static HTML) | Moderate (Requires external store/events across islands) | Marketing sites, documentation, blogs, content-heavy sites. |
| **Resumability** (Qwik) | Near Zero (No initial JS execution; lazy event handlers) | Zero (Serializes framework state into HTML; resumes execution on event) | Good (Signals-based reactivity across components) | Large scale e-commerce and high-traffic public web applications. |

## Islands Architecture Mechanics and Cross-Island State

Under the **Islands Architecture**, the default state of the document is static HTML. Interactive components opt *in* to shipping JavaScript as isolated roots.

```
+-----------------------------------------------------------------------------------+
|                              STATIC HTML DOCUMENT BODY                            |
|                                                                                   |
|  +---------------------------+                   +-----------------------------+  |
|  | Header Navigation         |                   | Article Content Paragraphs  |  |
|  | (Pure Static HTML, 0 JS)  |                   | (Pure Static HTML, 0 JS)    |  |
|  +---------------------------+                   +-----------------------------+  |
|                                                                                   |
|  +---------------------------+                   +-----------------------------+  |
|  | Hydrated Island:          |                   | Hydrated Island:            |  |
|  | ThemeToggle               |                   | WebGL Field                 |  |
|  | (client:load, ~1.2 KB JS) |                   | (client:visible, ~45 KB JS) |  |
|  +---------------------------+                   +-----------------------------+  |
+-----------------------------------------------------------------------------------+
```

### Loading Strategy Directives
In Astro, explicit directives govern when component islands hydrate:
- `client:load`: Hydrates immediately during page load. Reserved for critical above-the-fold UI controls (e.g. primary navigation toggles).
- `client:idle`: Hydrates after initial page load when `requestIdleCallback` fires. Used for secondary controls (e.g. search filters).
- `client:visible`: Defers fetching and execution until the element enters the viewport via `IntersectionObserver`. Critical for heavy components (e.g. 3D WebGL canvases, heavy charts).
- `client:media="(max-width: 768px)"`: Hydrates only when a specific CSS media query matches.

### Cross-Island State Without Context Trees
Because component islands are isolated React/Preact roots, they cannot share state via React Context providers. 

Instead, state synchronization is decoupled using lightweight micro-stores like [`nanostores`](https://github.com/nanostores/nanostores) or native Custom Events:

```typescript
// src/lib/store.ts
// Lightweight framework-agnostic store (~300 bytes)
import { atom } from 'nanostores';

export type Theme = 'light' | 'dark';
export const $theme = atom<Theme>('dark');

export function toggleTheme() {
  const next = $theme.get() === 'dark' ? 'light' : 'dark';
  $theme.set(next);
  if (typeof localStorage !== 'undefined') {
    localStorage.setItem('theme', next);
  }
}
```

```tsx
// src/components/ThemeToggle.tsx
import React from 'react';
import { useStore } from '@nanostores/react';
import { $theme, toggleTheme } from '../lib/store';

export default function ThemeToggle() {
  const theme = useStore($theme);

  return (
    <button
      onClick={toggleTheme}
      aria-label="Toggle theme"
      className="p-2 rounded-md border border-neutral-700"
    >
      Current Theme: {theme}
    </button>
  );
}
```

### Eliminating Theme FOUC (Flash of Unstyled Content)
A common pitfall with client-side theme hydration is a visible flash of wrong colors when reading `localStorage` inside React's `useEffect`. 

To prevent FOUC, inject a tiny blocking script in the `<head>` of the HTML before CSS rendering finishes:

```html
<!-- Prevent theme FOUC: Executes synchronously before paint -->
<script is:inline>
  (function () {
    const saved = localStorage.getItem('theme');
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    const theme = saved || (prefersDark ? 'dark' : 'light');
    if (theme === 'dark') {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  })();
</script>
```

## Diagnostic Measurement with Chrome DevTools & Real User Monitoring

### Inspecting Long Tasks in Chrome DevTools
1. Open Chrome DevTools -> **Performance** tab.
2. Select **CPU: 4x slowdown** to simulate a mid-range mobile device.
3. Record a page load and initial click interaction.

```
=================================================================================
CHROME DEVTOOLS PERFORMANCE FLAMECHART ANALYSIS
=================================================================================

Main Thread Timeline:
|--- Parse HTML ---|--- Evaluate Script (react-dom) ---|--- Hydrate Component Tree ---|
                    |<----------- LONG TASK (160ms) [RED TRIANGLE] ----------->|
                    
Key Trace Markers to Inspect:
- Event: Compile Script / Evaluate Script (Framework bundle execution)
- Event: Event Listener Binding (addEventListener)
- Event: Recalculate Style & Layout (Triggered by DOM mutation during hydration)
=================================================================================
```

### Measuring INP Attribution with `web-vitals`
Track INP in production using the official `web-vitals` library:

```typescript
import { onINP } from 'web-vitals/attribution';

onINP((metric) => {
  const { inputDelay, processingDuration, presentationDelay, target } = metric.attribution;
  console.log(`[INP Metric]: ${metric.value}ms`, {
    inputDelay,         // Time waiting for main thread long tasks to clear
    processingDuration, // Time spent running the actual event listener code
    presentationDelay,  // Time spent rendering the updated frame
    target,             // DOM element clicked
  });
});
```

If `inputDelay` dominates the INP score, your main thread is blocked by hydration long tasks before the event listener even starts executing.

## Failure Modes & Diagnostic Table

| Hydration Antipattern | Observed Core Web Vital Penalty | Profiler / RUM Indicator | Root Cause & Remediated Pattern |
| :--- | :--- | :--- | :--- |
| **Full App SSR Hydration** | High TBT (> 300ms), Poor INP on mobile devices. | DevTools shows a single contiguous 200ms Long Task during page load (`Evaluate Script`). | Hydrating static content paragraphs. Migrate to Islands Architecture (Astro) or RSC to ship zero JS for static regions. |
| **`useEffect` Theme FOUC** | Visual flash of white background before dark theme applies. | Layout shift event logged during initial hydration phase. | Theme resolved inside client component after paint. Move theme resolution to inline blocking `<head>` script. |
| **Eager Heavy Canvas Loading** | High LCP and CPU spikes on page load. | Network timeline shows large WebGL/Three.js bundle blocking initial resource loading. | Heavy component loaded without viewport checks. Use `client:visible` directive to defer script fetching until element scrolls into view. |
| **Hydration Mismatch Warning** | Console error: `Text content did not match server-rendered HTML`. | Extra DOM recalculation and double render cost. | Client code reading browser-only state (`window.innerWidth`, `Date.now()`) during initial render. Defer client-only state reads to `useEffect` or use client-only islands (`client:only`). |
| **Context Store Explosion** | Poor INP across all components. | React Profiler shows whole-tree re-render when a single state property changes. | Global React Context wrapping independent island components. Replace central Context with atomic micro-stores (Nanostores). |

## Frontend Hydration & Bundle Budget Checklist

- [ ] **Audit Static Content**: Identify regions of the application that do not require state changes; ensure zero JavaScript is shipped for static text and layout.
- [ ] **Apply Island Directives**: Use `client:visible` for below-the-fold interactive components and `client:idle` for non-critical controls.
- [ ] **Inline Blocking Scripts**: Place theme and language detection logic in inline blocking scripts within `<head>` to prevent FOUC.
- [ ] **Set Bundle Budgets**: Enforce strict bundle budgets for interactive island components (e.g. maximum 15 KB gzipped per island).
- [ ] **Decouple Cross-Island State**: Use micro-stores (Nanostores) or native Custom Events instead of wrapping the application in a global React Context provider.
- [ ] **DevTools Throttling**: Test all interactive components with 4x CPU slowdown in Chrome DevTools to verify zero Long Tasks (>50ms) occur during page load.
- [ ] **Monitor Real User INP**: Integrate `web-vitals` RUM reporting and verify P95 INP remains strictly below 200 milliseconds in production.
