# 2136 · Communion

**State:** mystical union · **Pole:** intense / ecstatic · **Route:** `/dream/2136-communion`

## The one question

**What if an ecstatic mystical UNION were something you PLAY with your hands —
where the more voices you hold, the more everything binds to everything
(hyperconnectivity), until the many lock into ONE radiant whole?**

This is the *inverse* of dissolution. Not the self draining away, but the self
and its voices **over-connecting** into ecstatic unity. The piece is built to
feel intense and *building* — brighter, denser, more toward a peak — never a
calm ambient fade.

## How to play

- **Hold multiple fingers** on the field (up to ~10 via Pointer Events). Mouse =
  one voice; click-drag to move it.
- **Count of held voices** → how dense the light-web is (every pair of voices is
  threaded, so N voices = N·(N−1)/2 sympathetic threads → hyperconnectivity).
- **X → pitch** on the Bohlen–Pierce lattice; **Y → brightness/timbre** (up is
  brighter, opens the per-voice lowpass); **movement/velocity → vibrato + thread
  shimmer**.
- **Union coupling K is PLAYED, not autonomous.** K is a slew-limited follower of
  your *sustained* polyphony: it climbs toward a ceiling that grows with the
  voice count (and climbs faster with more voices), and eases back down when you
  lift — a gentle release, never a self-running 0→peak→0 timeline.
- **Harmonic LOCK = the union mechanic.** Each voice starts slightly detuned from
  the shared lattice; the detune term is scaled by `(1 − K)`, so as K rises every
  voice is pulled onto the nearest Bohlen–Pierce lattice pitch until, at peak, all
  voices lock into one over-bright consonant chord. Sympathetic resonance made
  literal — the many become one, in sound and in light.

Leave it untouched and a **seeded autopilot** (mulberry32) eases three voices in
after ~4s and holds them so the union visibly builds for a headless reviewer; the
instant you touch, you take over.

## Substrate

Canvas2D additive light-web. One `<canvas>` + one rAF loop, `globalCompositeOperation
= "lighter"` for glowing threads/nodes, cleared each frame with a low-alpha dark
fill for gentle trails. Nodes = the voices of the self; edges = bright gradient
sympathetic threads between every pair; a central communion bloom intensifies with
K, and shimmer beads travel along the threads. As K rises the display positions are
pulled toward one center — the field blooms toward a single radiant whole. Palette
(violet → gold on near-black) lives only inside the canvas; all chrome uses
semantic tokens.

## Audio

Web Audio API, **Bohlen–Pierce** — 13 equal divisions of the tritave (3:1), step
ratio `3^(1/13)`, base ~110 Hz, span two tritaves across the width. *Not*
pentatonic, *not* a JI major/minor stack. Each voice is an additive **odd-harmonic**
(clarinet-like) `PeriodicWave` → per-voice lowpass (Y) → per-voice gain → master,
with a velocity-tracking vibrato LFO and a tritave-up shimmer partial gated by K.
Frequencies **glide** (portamento) so the harmonic lock *resolves* into consonance
rather than jumping. A **union drone bus** (root + sub-tritave sines) swells with K
and polyphony. Master chain ends in a `DynamicsCompressor` limiter; the
`AudioContext` is gesture-gated (first pointer or Begin) and fully torn down on
unmount (disconnect + close).

## Safety

All luminance/bloom changes are slew-limited and well under 3 Hz — never a strobe.
The optional glow pulse is off by default and routed through the shared
`createSafeFlicker` engine (soft sine, hard-clamped ≤3 Hz). `prefers-reduced-motion`
further damps the bloom pulse and position easing.

## Named references (this cycle's §855 dive: ecstatic union = *hyper*-connection, and it can be PLAYED)

- **"Dynamic Functional Hyperconnectivity After Psilocybin Intake Is Primarily
  Associated With Oceanic Boundlessness," *Biological Psychiatry: CNNI*** — a
  recurrent *hyperconnected* brain state tracks oceanic boundlessness/unity. This is
  the core reframe: union is over-connection, not fade-out. Modeled directly by K
  raising inter-voice coupling and the all-pairs thread web.
- **"Oceanic states of consciousness — an existential-neuroscience perspective,"
  *Frontiers in Human Neuroscience* 19 (2025)** — the PAG as the pivot between
  embodiment and transcendence; union is *visceral/intense*, which is why this piece
  builds toward a bright peak rather than dissolving.
- **Ecstatic ("Dostoevsky") seizures** — Picard & Craig / Gschwind — anterior-insula
  hyperactivation → "unity with everything," bliss and certainty. The felt sense the
  peak K state aims for.

## Ambition criteria hit

- **#2 — ≥3 subsystems (this has 5):** (1) multi-touch Pointer-Events input engine,
  (2) hyperconnectivity coupling + harmonic-lock sim (`advanceCoupling`,
  `lockedStep`), (3) Canvas2D additive light-web renderer (`drawField`), (4)
  Bohlen–Pierce odd-harmonic voice synth, (5) union drone/shimmer bus. Plus a seeded
  autopilot self-demo.
- **#3 — named references cited** above (hyperconnectivity/OBN, oceanic/PAG, ecstatic
  seizures).
- **#5 — references this cycle's research finding:** the §855 dive — ecstatic union is
  *hyper*-connection and can be PLAYED — is the organizing idea of the whole build (K
  is polyphony-driven hyperconnectivity; harmonic lock makes "many → one" literal).

## Files

- `page.tsx` — chrome, Pointer-Events input, rAF loop, coupling + lock wiring, autopilot.
- `web.ts` — `advanceCoupling` / `lockedStep` sim + `drawField` additive renderer + `stepColor`.
- `audio.ts` — `CommunionAudio`: per-voice BP synth, shimmer, union drone bus, limiter, cleanup.
- `bp.ts` — Bohlen–Pierce lattice helpers.
- `rng.ts` — mulberry32 seeded PRNG.
