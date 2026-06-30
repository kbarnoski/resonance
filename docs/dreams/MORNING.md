# Morning digest — last updated 2026-06-30 ~12:15 UTC (cycle 610)

> **Jury verdict today**: The shader monoculture broke and this is the lab's most ambitious fortnight yet (12 of 15 hit 4/5, zero duds) — but the sameness just migrated to pointer-on-Canvas2D drifting cosmic-ambient and "bloomy," the `_shared/` refactor is ~7 cycles overdue, and not one of these 15 has been ear- or GPU-verified — tomorrow: pay the infra debt, go embodied/spatial, and finally ship a real cycle-2. See `docs/dreams/JURY.md`.

## Open this first
- **[1067-boundless-breath](https://getresonance.vercel.app/dream/1067-boundless-breath)** — *breathe yourself into an endless ascent.* Tap **Begin breathing · allow mic**, then breathe slowly: your **inhale** gathers a vast ~120k-star field inward toward a luminous core and lifts a Shepard–Risset tone upward; your **exhale** releases the stars to a boundless drift. No mic? It auto-paces a calm ~5.5 breaths/min cycle so it breathes itself. Headphones help. `state: meditative-boundless · pole: cosmic-ambient`.

## Why this one
It's the **breath you can PLAY** the jury asked for (provocation #1: stop shipping lean-back screensavers). The surprise comes from **today's research**: a Shepard–Risset glissando doesn't just *sound* like rising — it induces measurable *auditory vection*, a felt bodily sense of self-motion as strong as a moving visual scene, enough to shift your postural sway. So I paired it with a **congruent visual vection** field (stars streaming radially past you) so eyes and ears get the same "rising forever" cue — transport without the drug. It also brings the scarce **three.js** output back (Canvas2D had hit the 5×-in-10 diversity ban) and finally lands a *played, breath-coupled* Shepard.

## Honest correction
- The lab already has three **passive** Shepard-tone demos (40/132/187) — so the old note calling this "the lab's first Shepard engine" was **wrong**, and I've corrected it everywhere. The real novelty is the **breath-coupled, vection-paired, played** version, not the engine itself.

## Also explored (DEEP — 2 substrates, 1 banked)
- **1068-vection-well** (IDEAS §610) — the same breath→Shepard concept as a WebGL2 *optical-flow tunnel of light* you plunge down. De-selected because, breath-played or not, a single full-screen fragment shader is the exact *form* the jury banned. Banked with a note on how to reframe it off "a shader you stare at."

## Honest caveats
- **Built green, not GPU/ear-verified.** Compile + ESLint (0 issues from the 1067 folder) + project `tsc` (0 errors) all pass; full `npm run build` hit only the standing container EMFILE block (infra, not code — Vercel deploys fine). The **auto-paced breath fallback IS the headless path** (breathes + sounds with no mic). Unverified on a device: the mic breath auto-ranging constants and the *felt* strength of the inhale-vs-exhale contrast.

## Open questions for Karel
- **Is the breath→ascent coupling legible?** The bet is that inhaling visibly speeds the inward star-rush *and* accelerates the upward glide. If the contrast feels weak on your device, I can add true inhale/exhale phase detection (not just amplitude) so exhale actively *descends*.
- **The overdue `_shared/psych/` infra cycle is now ~7 fires deferred.** I re-derived a Shepard engine, JI drone, and convolution reverb yet again this fire — they want extracting into `_shared/psych/` so the next build composes instead of re-synthesising. Want me to spend the next fire on that refactor (invisible at /dream, but unblocks faster/bigger builds)?
- **The fd-ceiling block is still open** — full `npm run build` can't finish locally (container EMFILE at ~4096 open files during static-gen of 1000+ routes). Worth raising the ceiling or blessing `next build --experimental-build-mode compile` as the gate.
