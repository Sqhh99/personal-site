# Task: Deepen blog posts (kill demo-article smell)

Workspace: `/home/sqhh99/workspace/personal-site`

## Diagnosis
The five posts read like polished **template essays** for a portfolio demo:
- correct high-level points, thin on **numbers, failure modes, tooling commands, decision tables**
- few concrete “what I measured / what broke / what I changed”
- ZH posts are shorter translations of the same thin EN
- ends with neat morals instead of operational checklists

They must feel like **engineering notes someone would bookmark**, not onboarding blog filler.

## Scope
Rewrite **all 5 posts in EN and ZH** (10 files):

EN:
- `src/content/blog/en/why-this-site-exists.md`
- `src/content/blog/en/webrtc-before-the-connection-opens.md`
- `src/content/blog/en/where-pytorch-training-time-goes.md`
- `src/content/blog/en/backpressure-in-media-pipelines.md`
- `src/content/blog/en/the-cost-of-hydration.md`

ZH counterparts under `src/content/blog/zh/` — full deep translations (not abridged). Same slugs, dates, tags; improve titles/descriptions if needed but keep URLs (filename = slug) stable.

## Quality bar (each post)
1. **Length:** aim ~1200–2200 English words (or equivalent depth in ZH). Not padding — every section earns its place.
2. **Structure:** problem → wrong defaults → concrete mechanics → measurement/debug → tradeoffs → short checklist.
3. **Concrete artifacts:** include some mix of:
   - realistic code with edge cases
   - example metrics / orders of magnitude (label as typical ranges if not a lab notebook)
   - tables (failure mode → symptom → fix)
   - commands/tools (chrome://webrtc-internals, torch.profiler, etc.) where relevant
4. **Voice:** calm technical first-person engineer notes OK, but **no personal bio**, no “I am a software engineer who…”, no resume tone. Site brand is Sqhh99; content is the point.
5. **Honesty:** prefer “usually / often / in practice” over fake precision; do not invent proprietary internal metrics as facts.
6. **Frontmatter:** keep schema (`title`, `description`, `date`, `tag`, `featured`). `why-this-site-exists` can stay `featured: true`. Tags must remain in: WebRTC | PyTorch | Frontend | Systems | Notes.
7. **why-this-site-exists:** reframe as editorial note on *how notes are written* and site constraints — less “about me”, less build-log vanity; can keep brief stack note if useful to readers of the tech posts.
8. Do **not** change site layout/components unless a content collection schema issue appears.
9. Run `npm run build` at the end; fix if content breaks the build.
10. Do not commit/push.

## Per-post angle upgrades
- **WebRTC:** ICE candidate types matrix; trickle vs non-trickle bugs; TURN cost; state machine traps; how to read webrtc-internals; common NAT scenarios.
- **PyTorch:** data loader math; GPU util vs SM efficiency; grad sync; compile/recompile; torch.profiler workflow; common false bottlenecks.
- **Backpressure:** queue policies with latency budgets; audio vs video; drop/degrade strategies; observability (age histogram).
- **Hydration:** INP/TBT linkage; islands vs resumability vs RSC at concept level without hype; when not to use islands; cost model of JS.
- **Why site exists:** writing constraints worth preserving; anti-demo standards for future posts.

## Done
- All 10 markdown files substantially deeper
- Build green
- Short summary of what changed per post
