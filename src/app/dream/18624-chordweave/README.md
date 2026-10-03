# 18624-chordweave — Four-part voice leading in the chord of the moment

**Status**: demoable

**The one question.** What if your two hands harmonized your own piano recording *in the key and chord of the moment* — pull your hands apart and the single take fans open into a chord of ITSELF, re-voiced by *proper four-part part-writing* that moves the whole stack the least total distance as the harmony changes, so the voices glide smoothly and never cross?

This is **cycle-3 of the chordfold lineage** (18352-fluxweave → 18416-chordfold → this). Fluxweave added a *fixed* consonant stack (+7/+12/+4/−5). Chordfold made that stack *chord-aware* but snapped each of the four anchors to its nearest chord tone **independently and statelessly**. Chordweave changes one thing deeply: it replaces that per-voice greed with a **global voice-leading solver**, and makes the harmonic rhythm visible with a chord-change surge.

## How to use it

Play one of Karel's real piano tracks, then conduct the harmony with two hands (or watch the labelled demo drive do it autonomously).

- **Hands together → unison.** Only the dry, untouched take is audible.
- **Pull your hands apart → the chord fans open.** As the separation grows, pitch-shifted copies of the same take fade in one by one.
- **Hold through a chord change → the stack re-voices with minimal total motion.** The four voice targets move together, gliding smoothly to the new chord tones without crossing; the current blooms on every chord boundary and the hue drifts with the harmony.
- **Raise both hands → the harmony swells and the current quickens.** Average hand height sets the overall level of the added voices and the flow energy.
- **Move faster → the light stirs and the chord shimmers.** Each hand is a vortex source (speed = swirl strength); hand speed also breathes a small ±cents shimmer across the voices.

A small always-on readout shows the current chord, the voicing word, and a `· weaving` hint while a glide is in progress (e.g. `F△ · opening · weaving`). Press `f` for fullscreen, `i` for the in-piece info overlay.

## The voice-leading mechanism

On play, after the track id is known, the piece calls `loadTrackAnalysis(id)` and stores the returned time-sorted `chords[]` (and `key_signature`). The looping source records its start at `ctx.currentTime`; each frame the playback position is `(ctx.currentTime − start) mod buffer.duration`, and a binary search finds the chord active at that position (holding the most recent chord across gaps).

Each chord symbol is parsed into a **pitch-class set** — robustly across Karel's messy real symbols (`F5`, `C/D`, `A/A#/F`, `Csus4`, `A#maj9/F`, `Dm7#5/F`, …) — by the **unchanged** chordfold parser (split on `/`, every token contributes its root pitch-class, and the first token's quality suffix adds the standard chord-quality intervals). From that set the rising chord-tone intervals above the root are built across ~2 octaves (`risingCandidates`), filtered to the opening ambitus (≈0..28 semitones).

**Global minimum-total-motion assignment.** This is the cycle-3 upgrade. Chordfold's `computeVoicing` snapped each of the four fixed anchors (≈3rd/5th/8ve/10th) to its nearest chord tone *independently* — ignoring where the voices already were and never considering the four voices jointly, so it could produce crossing or sub-optimal part-writing. Chordweave is **stateful**: on a chord change, given the PREVIOUS four intervals (`voicingRef.current`), `computeVoicingWeave` finds the assignment of the four voices to four **distinct** candidates that **minimizes the sum of absolute semitone motion** of all four voices together, with a small crossing penalty that breaks ties in favour of assignments that preserve the previous voice order (**non-crossing part-writing**). With only four voices and the six nearest candidates per voice this is a cheap brute-force over distinct 4-tuples. The payoff over the per-voice-greedy sibling: **when a swap of two voices gives less total motion than each moving independently, the solver takes the swap** — genuinely smooth four-part voice leading. The FIRST voicing after play-start (no previous) falls back to chordfold's absolute-nearest snap seeded from the anchors. All results are clamped to ≈0..28 semitones and kept distinct.

Each of the four `AudioWorkletNode`s (processor `chordweave-pitch`) is built with `processorOptions.semitones = 0`, so the base ratio is 1.0 and the entire transposition is carried on the a-rate `detune` param. Each frame sets `detune = interval·100 + shimmer` via `setTargetAtTime(…, 0.15)` — the ~0.15 s time constant is tuned so the now-minimal, non-crossing motion reads by ear as smooth part-writing. The dry take plays untouched at rate 1.0; hand separation fans the voices in, hand height sets the wet level; a small hand-speed shimmer (±~10 cents) rides on top without pulling a voice out of the chord. Every audio path terminates in the shared ear-safety master bus (`createSafeMaster`).

## Chord-change surge

On every chord boundary (`idx !== lastChordIdxRef.current`) a `chordSurge` scalar is set to `1.0` and decayed each frame (`surge ·= exp(−dt/0.5)`, clamped ≥ 0) so the harmonic rhythm is visible as a breath in the current. On the GPU it is passed as **one extra float** in the Sim uniform struct (placed at byte offset 64, matching an 80-byte buffer and a 20-element `Float32Array` writer — WGSL rounds the 17-member struct up to 80 bytes): the advect shader adds a small outward velocity impulse from the domain centre, and the point shader briefly lifts emission. The **same** scalar drives the Canvas2D fallback (outward impulse + brightness lift), so both renderers show the bloom. It is a smooth decaying bloom over ~0.5 s — strobe-safe, never a hard flash, and no film grain / noise overlay.

## Harmonic-chroma palette

The current's hue is set by the chord root around the circle of fifths (`hue = ((root·7) mod 12)/12`); a warm/cool temperature is set by major-vs-minor (`chordIsMinor`). Saturation stays low and pearlescent — a restrained tint, never a rainbow. Hue is lerped toward its target (~0.05/frame, shortest path around the wheel) so color drifts gently and never snaps; the deep near-black background is preserved.

## Degrades

- **No WebGPU adapter** → a reduced Canvas2D current with the identical hands → harmonizer chain, the same harmonic-chroma tint, and the same chord-change surge.
- **No camera / permission denied / model fail** → a labelled autonomous demo drive keeps weaving the chord (three-state status: `tracking · live` / `demo · autonomous` / lost).
- **No AudioWorklet** → the dry take still plays and the current still flows.
- **No chord analysis** (null or empty) → a fixed consonant stack (+7/+12/+4/+16) and a neutral key-seeded tint, with an on-screen note that harmony data is unavailable.

## Next deepening (cycle-4 notes)

Two ideas from the DEEP sibling this cycle forked off (`chordglide`, a per-voice *greedy* glide) are worth folding in later — kept here rather than banked as a new concept, since the backlog is already deep:

- **An explicit JS-walked portamento.** Instead of relying on `detune`'s `setTargetAtTime` ramp, walk each rendered interval toward its target in JS at a ~0.16 s time constant and feed `detune` a fast ramp that carries only the shimmer — so the glide, not the smoothing constant, governs the heard motion and the voice-leading is audible by construction.
- **Musical padding for thin chords.** When a chord exposes fewer than four distinct rising tones (a bare root → only {0,12,24}), `risingCandidates` currently pads the pool with synthetic +1-semitone steps so the solver always has four distinct targets. Padding instead by *doubling real chord tones* at octave offsets (as the greedy sibling's doubling fallback does) would keep every voice on an actual chord tone over bare chords, rather than risking a voice a semitone above the octave.

## References

- Bridson, Hourihan & Nordenstam (2007), *Curl-Noise for Procedural Fluid Flow* (SIGGRAPH) — the divergence-free curl-of-noise advection substrate.
- MIDIBack (arXiv:2609.28008, 2026-09-23) — harmony-aware anchor for re-voicing a source performance to its own live chord track rather than a fixed stack.
- Classical four-part voice-leading / minimal-motion part-writing — the principle of moving each voice the shortest distance to the next chord, keeping voices from crossing.
- Dmitri Tymoczko, *A Geometry of Music* — the geometry of voice leading, in which smooth harmony corresponds to nearest-neighbor motion between chords; the solver here picks that nearest-neighbor voicing explicitly.
- Minimal Audio *Lucid* (2026) grain scale-lock — fixed-key counterpoint to this piece: where Lucid locks grains to a chosen scale, chordweave advances the idea by locking the harmonizer to the take's OWN moving chords.
