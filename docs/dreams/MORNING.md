# Morning digest — last updated 2026-06-12 08:35 UTC

**Cycle 398 · KIDS · DEEP (3 approaches, one concept) → shipped `537-kids-sky-murmuration`.**
Open it: **https://getresonance.vercel.app/dream/537-kids-sky-murmuration**

## New since yesterday
- **🐦✨ 537-kids-sky-murmuration** — *look up into a deep 3D dusk sky where thousands of glowing starlings swirl as one — and the murmuration SINGS.* Shepherd the flock with a finger; when the cloud splits into sub-flocks you **hear it split into harmony**, and it resolves to a chord when it re-merges. A living weather of birds you stand under. Built on **three.js** (a `THREE.Points` cloud, depth-coded near-warm/far-violet, fog, a drifting camera for real 3D depth) driven by an emergent **boids** flock (Reynolds rules), with the flock's collective state — cohesion, height, sub-flock count — *being* the music.
  - *Why open it:* it's the "massively bigger" swing you asked for, on the one renderer the lab had gone cold on (three.js, 0× in the recent window) — and it deliberately steers off yesterday's drawing-ML so the kids set isn't two "draw → magic" pieces in a row. For a 4yo: no reading, no wrong move, just a beautiful flock that follows your finger.
  - **Hands-free check:** with zero interaction a "ghost shepherd" wanders the sky, splitting and merging the flock + singing from frame one — so a glance always shows a swirling, singing, splitting murmuration. (No WebGL? It falls back to a Canvas2D dot-flock that still flocks + sings.)

## Explored but not shipped (2 more — see IDEAS §398)
- **535-kids-starling-choir** — the same flock on **raw WebGL2 transform feedback** (a true GPU boids sim, ~2.5k birds). The most technically ambitious, but its float-texture + GPU-readback path is fragile on iOS Safari (the iPad), so it lost to three.js. Resurrect when we want to scale to 5–10k birds.
- **536-kids-lantern-shoal** — the same flock as friendly **Canvas2D lantern-fish** with eyes + tails — the *best* legibility for a literal 4yo (you see individual friends). It lost only on diversity: Canvas2D was already heavily used, so shipping it would have made the lab repetitive. Great candidate to fold its character-art into 537.

## Open questions for you
- **Does the split→merge read as harmony on your speaker?** The one thing I can't verify here: whether the 2–4 sub-flock voices are *audibly* distinct as the cloud divides and rejoins (the cluster threshold may need a tune). If a split sounds like one blur rather than two pitches, tell me and I'll sharpen it.
- **Does 3D depth read on the phone, or only on the iPad?** The depth cue is the slow camera drift + fog + near/far colour. Curious whether it feels volumetric on a small screen.
- Want 537's **cycle-2** to add a hawk-shadow the flock parts around (a gentle tension that resolves), or to let two kids each shepherd a harmonising sub-flock (the Together-spine crossover)?

## Heads-up
- Build-verified (full `npm run build`, exit 0, 434/434 pages), **not** browser-verified — no three.js/WebGL/audio in the cloud sandbox. Ghost-shepherd auto-demo + Canvas2D dot-flock fallback are the safety nets.
- Process note for me: the two non-winner builders were still running when I removed their folders and re-created them, breaking the first build — I now stop a non-winner's agent before deleting its folder. Logged in STATE for the orchestration playbook.
