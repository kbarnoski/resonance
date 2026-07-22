# 2252 · Eternal Return

**The one question:** What if attention could dilate a single moment of music
into an eternal *now* you can stand inside — a radiant chord-cloud that hangs
while the music keeps flowing underneath?

A modal phrase plays on by itself. Press and hold anywhere and the recently
sounded notes stop dissipating: they freeze in mid-air and bloom into an
over-bright chord-cloud. Meanwhile the phrase keeps arriving underneath, in
objective time. Let go and the cloud resumes drifting apart — the *return* to
flowing time.

- **Input:** pointer press-and-hold (multi-pointer).
- **Output:** CSS compositor — absolutely-positioned `<div>` light-layers with
  radial-gradient backgrounds, animated only via inline `transform` / `opacity`
  / `filter`, composited with `mix-blend-mode: screen`. No canvas, no WebGL, no
  SVG art layer.
- **Technique:** attention → time-dilation of musical note-events, with dual
  time-streams.
- **Harmony:** C **Lydian** (root C3; degrees 0 2 4 6 7 9 11) — a bright,
  floating mode whose raised 4th gives the "cosmic" colour. Deliberately **not**
  pentatonic, **not** a just-intonation stack, **not** Bohlen-Pierce. Pitch is
  quantised and stable.
- **Pole:** cosmic-ambient "eternal now" building toward an ecstatic
  over-bright plenum.

## Cycle-2 lineage — from `2244-deep-now`

`2244-deep-now` ("The Deep Now") made subjective time-dilation a *played*
mechanic: press-and-hold raised an attention level that slowed and hung abstract
SVG echoes. This piece — cycle-2 — keeps that mechanic verbatim (a slew-limited
attention follower driving `timeScale = 1/(1+6A)`), but changes two things:

1. **Real musical material.** Instead of abstract echoes, a seeded generative
   glass-piano voice plays a gentle C-Lydian phrase. Each *note event* spawns one
   light-layer, tightly bound (audio event → visual layer).
2. **A CSS-compositor light-bloom** replaces the SVG-DOM substrate. Overlapping
   radial-gradient layers composite with `screen`, so held, hanging notes *add*
   their light into a swelling plenum.

## The time-dilation mechanic + dual time-streams

- **Attention `A`** is a slew-limited follower in `[0,1]` with **asymmetric**
  rise/decay (rise τ ≈ 0.6 s, decay τ ≈ 1.1 s) — it gathers a little slowly and
  lets go slowly, so holding *feels* like holding. It rises while ≥ 1 pointer is
  down (a `Set<pointerId>` supports several fingers at once).
- **`timeScale = 1 / (1 + 6·A)`** — 1 at rest, ~0.14 at deep attention.
- **The attended stream freezes + blooms.** Each light-layer advances its life by
  `dt × timeScale`, so at high `A` layers barely age — they *hang*. Their scale
  and opacity also bloom by ~`1/timeScale` (bounded to ×6), so the held moment
  grows brighter and larger; overlaps pile into an over-bright hanging
  chord-cloud — the eternal now. A central plenum glow swells with `A`.
- **The objective stream never stops.** The `PhraseScheduler` (in `audio.ts`)
  advances on real elapsed seconds, *not* scaled time — new notes keep arriving
  at objective tempo regardless of `A`. You hear the phrase flow on while you
  watch a slice of it hang. That is the dual time-streams.
- **Pitch is never dilated.** Dilation stretches time / lifetime / note-release /
  reverb-bloom, *not* pitch — attended notes get a hugely lengthened release and
  a blooming reverb-wet send (~`1/timeScale`, bounded), but their frequencies are
  held exactly stable. On release, `A` decays, `timeScale` → 1, and the cloud
  resumes dissipating.
- **Pointer expressivity:** x nudges which register the bloom favours; y nudges
  the bloom's softness (blur). `A` (attention) is always the master.

## Audio (`audio.ts`, class `EternalReturnAudio`)

- Built-in seeded generative voice: additive soft-attack / long-release "glass
  piano" tones (a small partial stack with a mild inharmonic stretch, `s ≈ 2.04`,
  for shimmer), warm, in C Lydian.
- `PhraseScheduler` emits note events at an objective tempo via a gentle seeded
  walk over the modal grid (stepwise-biased, with occasional leaps and breaths).
  It is free of any `AudioContext` dependency, so the visual phrase keeps flowing
  even before audio starts (silent headless review) and if Web Audio is missing.
- Routing: notes → bus → `DynamicsCompressor` → master gain **0.16** →
  destination, with a code-generated void reverb send whose wet blooms with `A`.
- **Optional file-drop:** drop an audio file → `decodeAudioData` → played through
  the same graph, with a time-domain onset detector spawning layers on transients.
  Degrades gracefully (a message, phrase continues) if unsupported or undecodable.
- **No network, no fetch, no API routes, no external URLs.** Fully offline. If
  Web Audio is unavailable, a `text-destructive` notice shows and visuals
  continue.

## Determinism & self-demo

- Seeded `mulberry32` (`rng.ts`), literal seed `0x2252`. Three derived streams
  keep the *musical phrase* identical whether or not the user plays: the
  scheduler uses `SEED`, the autopilot uses `SEED ^ 0x9e3779b9`, layer jitter uses
  `SEED ^ 0x1b56c4e9`.
- **No** `Math.random`, `Date.now`, or argless `new Date()` anywhere. Timing comes
  from rAF timestamps and `AudioContext` time.
- A ~15 s seeded **autopilot** runs from mount, before any input: it raises /
  holds / releases attention on a seeded schedule (short flowing taps interleaved
  with long swelling holds), so the arc *flow → attend → hanging bloom → release*
  self-demonstrates. Live pointer input overrides it immediately; it resumes
  after ~7 s of no input.

## Safety

- All luminance pulsing routes through `createSafeFlicker` (`_shared/psych`),
  default **off**, hard-capped ≤ 3 Hz, soft sine (never a hard strobe).
- `prefersReducedMotion()` reduces drift and the plenum's breathing. When in
  doubt the piece uses slow luminance drift, not flicker.

## Next-cycle deepenings

1. **Load Karel's real Path piano recordings** as the source: drop-in or bundled,
   with the onset detector spawning pitch-mapped layers from actual performed
   material — dilating a real recorded phrase rather than a synthetic one.
2. **Pitch-aware onset colour for dropped files:** run a light FFT / chroma
   estimate on transients so file-drop layers land at the correct pitch-class X
   (right now they seed a position), unifying the two note sources.
3. **A "carried moment" you can set down elsewhere:** let a long hold *crystallise*
   the frozen chord-cloud into a persistent, quietly-ringing sculpture you can
   leave hanging in the field and walk a new phrase around — several eternal nows
   coexisting with the still-flowing stream.

## References

- PsyPost, 2026-03-20 — "Psilocybin alters time perception by disrupting working
  memory and attention." Time dilation reads as over-processing / increased
  sensory gain, **not** a changed internal pacemaker.
- Marc Wittmann, *Felt Time* (MIT Press) — subjective duration expands with
  attention and arousal.
- bioRxiv, 2026-05-13 — "A Deep Dive into the Cognitive Soundscape of Flow:
  Finding Your Groove." Engaged / analytical listening deepens flow, which warps
  subjective time.
