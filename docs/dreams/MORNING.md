# Morning digest — last updated 2026-06-30 ~16:30 UTC (cycle 604)

## Open this first
- **[1059-piano-flock](https://getresonance.vercel.app/dream/1059-piano-flock)** — *conduct YOUR piano with a school of light.* Press **Conduct**, then move your pointer: a luminous flock chases your hand, and the *shape* it takes — tight or scattered, fast or slow, high or low — re-voices your real *Welcome Home* piano grain by grain. A tight, aligned herd snaps the notes onto a consonant just-intonation scale; let it scatter and the same piano blooms into a wide, detuned cosmic cloud; a sudden contraction fires a chord-like onset burst. The flock isn't decorated by the music — **the flock IS the instrument.** `state: psilocybin / cosmic drift · pole: cosmic-ambient`.

## Why this one
This finally brings back the two things the last jury asked for, in one build: **WebGPU compute as the resonating body** (a real GPU boids flock — cohesion/alignment/separation in a WGSL compute pass, ~14k boids) **and your actual piano as the carrier wave** (CataRT-style concatenative synthesis — the flock's emergent statistics navigate a grain corpus carved from your recording). The fresh idea is the fusion: the audio-research frontier (MACataRT, "The Concatenator") frames granular synthesis as *an agent navigating a corpus* — so here the **flock's shape literally is that navigation agent.** No WebGPU on your device? It falls back to a genuinely-good Canvas2D flock running the *same* audio mapping, so it still plays.

## Also explored (banked, not shipped)
DEEP fire — ONE concept, **two substrates**, shipped the stronger:
- **1060-piano-current** ⭐ (IDEAS §604) — *stir a divergence-free curl-noise river with your hand and it granulates the same piano.* The **fully-verifiable, runs-on-any-device** Canvas2D sibling (gorgeous braided currents, no WebGPU). Lost only because 1059 was the queued resurrect-first + the WebGPU-compute discharge — but it's the perfect low-risk pick next time, and its two best ideas (audio→flow feedback; confluence → real harmonic intervals) are folded into 1059's notes.

## Honest caveats
- **Not GPU/ear-verified.** No WebGPU/audio in the build container, so the GPU compute path + the grain↔flock coupling *feel* are type-/lint-clean but unseen — the Canvas2D fallback is what runs headlessly. You'll be the first to hear it. (This is the 3rd green-but-GPU-unseen ship in a short run; 1060 above is the antidote — fully verifiable — when you want certainty.)
- Pitch tagging is rough monophonic autocorrelation, so on dense chords the per-grain pitch is approximate (register-level, not exact harmony).

## Open questions for Karel
- **The fd-ceiling block is still open.** Full `npm run build` can't finish locally (container `EMFILE` at ~4096 open files during static-gen of 1000+ routes — infra, not code; compile+lint+type-check all pass, and Vercel deploys fine). Worth raising the ceiling or blessing `next build --experimental-build-mode compile` as the gate so I stop shipping on a partial local build.
- Want the **`_shared/psych/` infra cycle** next (extract `feedback.ts` / `droneBank.ts` / `shepard.ts`, re-derived ~5× now), or keep shipping instruments?
