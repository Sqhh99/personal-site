# Task: Mature personal writing site redesign (not a vibe-coding toy)

Workspace: `/home/sqhh99/workspace/personal-site`

## Problem with current site
It reads like a portfolio landing page / AI demo: loud hero, “live” badge, topic chips, Focus grid, About-me essay (“I am… / I build…”), awkward “Xiao Xu — Engineering Notes” branding, decorative logo mark that feels cheap. Mature personal blogs do **not** do this.

## References (study patterns, do NOT copy trademarks/assets)
Borrow layout/typography/rhythm from serious writing sites such as:
- simonwillison.net (writing-first, dense but calm index)
- jvns.ca (Julia Evans — clear hierarchy, friendly but not toy)
- overreacted.io / danluu.com (minimal chrome, content is the UI)
- paulgraham.com / gwern.net (extreme content focus — take restraint, not ugliness)
- stripe.com/blog or linear.app/blog (spacing, type scale, post cards — editorial not SaaS hero)

## Hard requirements (must)
1. **Remove self-introduction / About-me block entirely** — no “I am…”, no role specs grid, no about section on home (EN + ZH).
2. **Remove Focus / “what I work on” marketing grid** from home (or reduce to nothing). Home should feel like a **writer’s front page**, not a resume.
3. **Rebrand copy** — drop awkward “Xiao Xu — Engineering Notes” energy:
   - Site title: short and calm (e.g. `Sqhh99` or `sqhh99.dev` or simply the handle). Prefer **Sqhh99** as the name mark.
   - No long tagline essay in the hero. At most one quiet line, or none.
4. **Favicon / logo** — replace the awkward icon. Use a **simple text wordmark** or a minimal geometric monogram (SVG). No shiny badge, no gradient blob logo, no mascot.
5. **Header** — quiet: wordmark · Writing · language · theme · maybe GitHub as text link. No glassmorphism candy bar if it still feels toy-like; prefer thin border, sticky, high-end editorial.
6. **Home layout** — lead with recent writing list (or featured + list). Strong typography, generous measure, excellent post list/cards that look like a real blog.
7. **Blog index & post pages** — tighten reading experience: title, date, tags, long-form prose. Keep progress bar only if subtle; code blocks stay good.
8. **Kill toy signals**: pulsing “live” dots, exaggerated reveal animations, oversized marketing CTAs, empty Projects theater, Three.js hero if it still makes it feel like a demo. Prefer CSS-only subtle background or nothing. If WaveField stays, make it almost invisible or remove.
9. Keep **EN/ZH i18n** working (routes, switcher, dictionaries, dual posts).
10. Keep Astro static + Tailwind v4 + Cloudflare build green (`npm run build`).
11. Update **both** `src/i18n/ui.ts` EN/ZH strings and `consts.ts` consistently.
12. Do not commit/push.

## Design direction
- Quiet confidence, high information density without clutter
- Editorial serif for titles OR clean sans system — pick one coherent pair and stick to it
- Restraint over decoration; white/ivory space used intentionally
- Dark mode still works, but not cyberpunk

## Done criteria
- Home no longer has About / Focus marketing blocks
- No first-person bio pitch
- Branding no longer “Engineering Notes” toy portfolio
- New simple favicon/wordmark
- `npm run build` green
- Summary of what was removed/changed and which reference patterns were used
