# 2130 · Entity Parliament

**What if a DMT-style entity encounter were an INSTRUMENT YOU PLAY — a parliament of benevolent guide-beings that OPEN and turn their gaze toward you as you hold chords?**

`state: DMT · pole: intense / ecstatic`

Not a piece that plays itself. A ring of ~11 procedurally-drawn guide-beings sleeps in the dark. Sound a Bohlen–Pierce chord and they OPEN their jeweled mandala-eyes, turn their gaze toward you, and together assemble a shared central mandala. Hold more voices and the structure BUILDS — a low tritave drone swells, the eyes widen, a presence ARRIVES. This is the ecstatic entity pole, the opposite of the self dissolving.

## How to play

- **Computer keyboard (always works):** the home row `A S D F G H J K L` plus the top row `Q W E R T Y U I O P` are a contiguous run of Bohlen–Pierce steps — a polyphonic instrument. Hold keys to sustain chords; release to let beings drift back to sleep.
- **Shift** = brighter, harder attack (a velocity accent).
- **Z / X** shift the whole hand a tritave down / up.
- **Move the cursor** — it is the locus of attention. Every being steers its gaze toward wherever you are. Leave it idle and their attention drifts back to the center.
- **MIDI (bonus):** if a device is present it plays BP steps chromatically with expressive, continuous velocity. No device → the computer keyboard is unaffected.
- **Slow glow pulse** is an opt-in luminance drift (off by default), and **Design notes** opens the reference notes.

## It is genuinely multi-parameter (not one knob)

- **How MANY keys you hold** → how much of the ring awakens, and how far the collective presence (drone + central mandala + gaze tightness) swells.
- **WHICH chord shape** (count of distinct BP pitch-classes) → the central mandala's **N-fold symmetry**.
- **Chord SPAN** (widest interval held) → the mandala's radius.
- **Velocity** → each eye's openness, pupil dilation, brightness, and the voice's gain, filter, and shimmer.

## What you are looking at

Each being is a jeweled mandala-eye built from **Klüver form-constants** — tunnel/funnel rings, spiral arms, cobweb spokes, and a lattice of gems — with a dark pupil that dilates with velocity and offsets toward you. Steering is boid-like: gaze eases toward the shared attention point, and convergence tightens as presence rises (McKenna's "self-transforming machine elves" churn in the spiral arms). Faint light threads run from each awake being to the point it is watching.

## Harmony

**Bohlen–Pierce** — 13 equal divisions of the tritave (3:1), step ratio 3^(1/13); not the octave, not a pentatonic, not a just stack. Voices are additive with a predominantly **odd-harmonic (clarinet-like) spectrum**, which makes BP read consonant-but-alien — fitting for an "other" presence. Each held note is one being singing.

## Safety

Any glow pulse is OFF by default and routed through the shared `_shared/psych/safeFlicker` engine: a soft sine, hard-clamped to ≤3 Hz, never a hard strobe, and it honors `prefers-reduced-motion`. The beings' awakening glow is a slow luminance drift, not a flicker. On load the page is never dead: after ~4s of silence a **seeded** autopilot (mulberry32, not `Math.random`) gently sounds a few beings — and the instant you press a key, you take over and it yields.

## Grounding / references

- Michael, Luke & Robinson, *Scientific Reports* 12 (2022), **s41598-022-11999-8** — DMT entity-encounter phenomenology.
- Inhaled-DMT phenomenology corpus, **PMC9130218**. Entity encounters occur in ~45.5% of DMT experiences, share consistent cross-subject phenomenology, skew benevolent, ~32.4% are companion/pedagogical **guide**-type, and the core report is being **SEEN / attended-to** by the presence — used here as the interaction model.
- **Klüver's form-constants** (lattice / tunnel / spiral / cobweb) — the geometry the beings are drawn from.
- **Terence McKenna** — "self-transforming machine elves."
- A recent (2026) theoretical framework proposes a falsifiable test for whether the entities are "real"; "the presence attends to YOU" is treated here as the literal interaction model.

## Tech

`"use client"` React component, Web Audio API + Canvas2D only (no WebGL, no three.js, no shaders), no new npm deps, fully client-side (no network). Files: `page.tsx`, `audio.ts` (synthesis), `parliament.ts` (beings + steering + drawing), `bp.ts` (Bohlen–Pierce + key maps), `rng.ts` (mulberry32). Audio nodes, rAF, MIDI handlers, and listeners are all cleaned up on unmount.
