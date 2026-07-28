---
title: Why this site exists
description: Engineering constraints, failure modes, and editorial standards — why technical notes must record what breaks, not just what works.
date: 2026-07-27
tag: Notes
featured: true
---

The least useful artifact in software engineering is a polished conclusion detached from its constraints. A design doc states that an architecture handles 50,000 requests per second; it omits that garbage collection pauses spike P99 latency past 3 seconds when heap utilization exceeds 75%. A blog post demonstrates a PyTorch optimization trick; it omits that enabling `torch.compile` on dynamic tensor shapes causes endless recompilation and exhausts host RAM. Six months later, another engineer hits the exact same edge case because the failure boundaries were never written down.

This site is an operational log of those missing boundaries across realtime media, deep learning runtime performance, web systems, and pipeline backpressure.

## The Demo-Article Smell

Most technical writing on the web degrades into portfolio filler. It follows a predictable pattern:
1. State a high-level problem everyone agrees on.
2. Show an idealized 10-line code snippet on `localhost`.
3. Declare victory without showing profiler outputs, flamegraphs, packet loss, or memory allocations.
4. End with a superficial list of best practices.

When applied to production systems, this pattern fails instantly. A WebRTC connection that works on `localhost` collapses on symmetric NATs under corporate firewalls if candidate queuing and JSEP state machine race conditions are ignored. A PyTorch training loop with 98% GPU utilization on `nvidia-smi` may be spending 40% of its wall time stalled on Python GIL synchronization or unpinned CPU memory transfers.

To remain useful as engineering reference notes, every article published here must satisfy four editorial standards:

| Editorial Standard | Demo-Article Failure | Operational Requirement |
| :--- | :--- | :--- |
| **Boundaries & Limits** | "Use WebRTC for sub-second streaming." | Explicitly state network topologies, packet loss thresholds, and candidate gathering timeouts where WebRTC fails without TURN relays. |
| **Measurement & Diagnostics** | "Our custom dataloader is faster." | Provide exact tool invocation (`torch.profiler`, Chrome DevTools, `chrome://webrtc-internals`), exact metrics measured (P99 latency, H2D copy time), and host/device specs. |
| **Failure Modes** | "Add a queue between worker threads." | Document what happens when the queue fills up: memory growth rate, frame drop policy, keyframe corruption, or backpressure propagation. |
| **Actionable Verification** | "Keep your frontend light." | Provide an operational checklist and hard budgets (e.g., TBT < 50ms, JS bundle < 20KB gzipped for interactive components). |

## Core Technical Focus Areas

The articles on this site focus on four domain areas that frequently overlap in real-world systems:

### 1. WebRTC & Realtime Media
Signaling state machine races (JSEP SDP offer/answer exchanges, glare resolution), ICE candidate topologies (Host vs STUN srflx vs TURN relay), RTP/RTCP feedback loops (NACK, PLI, REMB/TWCC), and media pipeline synchronization.

### 2. PyTorch & Deep Learning Systems
CUDA async execution mechanics, DataLoader IPC and memory pinning bottlenecks, DistributedDataParallel (DDP) gradient synchronization overheads, precision trade-offs (FP32 vs FP16 vs BF16), and `torch.compile` graph break diagnostics.

### 3. Media Pipeline Backpressure
Producer/consumer rate mismatches, bounded ring buffer memory structures, audio vs video frame drop policies (GOP structure preservation vs audio time-stretching), and queue age distribution monitoring.

### 4. Frontend Architecture & Hydration Costs
Main-thread blocking time (INP/TBT), JavaScript execution cost models on mobile ARM CPUs, SSR vs Islands vs Resumability architectures, and zero-JS static content delivery.

## Site Architecture & Performance Constraints

This site itself is built under strict operational constraints to avoid the exact frontend anti-patterns criticized in its articles.

```
+-----------------------------------------------------------------------------------+
|                              Server Build Phase (Astro)                           |
|                                                                                   |
|  +-----------------------+   +------------------------+   +--------------------+  |
|  | Markdown Blog Posts   |   | Zod Schema Validation  |   | Static HTML Engine |  |
|  | (EN & ZH Collections) |-->| (Strict Tag/Date Check)|-->| (Zero-JS Markup)   |  |
|  +-----------------------+   +------------------------+   +--------------------+  |
+-----------------------------------------------------------------------------------+
                                          |
                                          v
+-----------------------------------------------------------------------------------+
|                              Client Runtime Environment                           |
|                                                                                   |
|  +-----------------------------+  +------------------------+  +----------------+  |
|  | Hydrated Component Island 1 |  | Component Island 2     |  | Pure Static    |  |
|  | ThemeToggle (client:load)   |  | Filter (client:idle)   |  | HTML Content   |  |
|  | ~1.2 KB JS              |  | ~3.4 KB JS             |  | 0 KB JS        |  |
|  +-----------------------------+  +------------------------+  +----------------+  |
+-----------------------------------------------------------------------------------+
```

### Static Markup First
The site uses [Astro](https://astro.build) with content collections. Markdown files are schema-validated at build time using Zod (`src/content.config.ts`). If an invalid tag or date format is introduced, the build fails immediately rather than generating broken runtime UI state.

### JavaScript Budget & Island Scoping
Client-side JavaScript is treated as a performance penalty. Only three isolated component islands execute client-side JS:
- **Theme Toggle (`client:load`)**: Synchronizes dark/light preference with `localStorage` and system media queries.
- **Search & Tag Filter (`client:idle`)**: Filters server-rendered article cards directly in the DOM without triggering network fetches or framework re-renders.
- **Background Canvas (`client:visible`)**: Deferring WebGL shader execution until the canvas enters the viewport via `IntersectionObserver`.

All core content—including code blocks, tables, and typography—is pure, static HTML/CSS by the time it leaves the build pipeline.

### Cloudflare Deployment & Runtime Simplicity
The output is deployed as pure static assets to Cloudflare Workers. There is no database, no server-side rendering node process, and no dynamic hydration engine running on the edge.

## Standing Rules for Written Notes

Every technical note published here must adhere to three operational rules:

1. **Write during active debugging**: Notes are written when the failure mode is still active, confusing, and un-obvious. Once a fix is deployed, hindsight bias makes the solution feel trivial, causing critical diagnostic steps to be forgotten.
2. **Include exact reproduction / verification steps**: If a profiler command or code snippet is listed, it must be executable against documented hardware and framework versions.
3. **Keep the negative paths in the post**: Explaining why alternative approaches failed is more valuable than describing the final working diff.
