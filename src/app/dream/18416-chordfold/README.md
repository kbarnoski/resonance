# 18416-chordfold — Harmonize your recording in the chord of the moment

**Status**: demoable

**The one question.** What if your two hands harmonized your own piano recording *in the key and chord of the moment* — pull your hands apart and the single take fans open into a chord of ITSELF that is diatonic to whatever chord the piece is actually playing right now, re-voicing live as the harmony moves?

This is **cycle-2 of 18352-fluxweave**. Fluxweave added a *fixed* consonant stack (+7/+12/+4/−5). Chordfold changes one thing deeply: the stack becomes **chord-aware**, and the light grows a new harmony-driven color register.

## How to use it

Play one of Karel's real piano tracks, then conduct the harmony with two hands (or watch the labelled demo drive do it autonomously).

- **Hands together → unison.** Only the dry, untouched take is audible.
- **Pull your hands apart → the chord fans open — diatonic to the moment.** As the separation grows, pitch-shifted copies of the same take fade in one by one, each snapped to a tone of the chord sounding *right now*.
- **Hold through a chord change → the stack re-voices.** When the underlying harmony moves, the four voice targets move with it, gliding smoothly to the new chord tones; the current's hue drifts with the harmony too.
- **Raise both hands → the harmony swells and the current quickens.** Average hand height sets the overall level of the added voices and the flow energy.
- **Move faster → the light stirs and the chord shimmers.** Each hand is a vortex source (speed = swirl strength); hand speed also breathes a small ±cents shimmer across the voices.

A small always-on readout shows the current chord and the voicing word (e.g. `F△ · opening`). Press `f` for fullscreen, `i` for the in-piece info overlay.

## The chord-aware mechanism

On play, after the track id is known, the piece also calls `loadTrackAnalysis(id)` and stores the returned time-sorted `chords[]` (and `key_signature`). The looping source records its start at `ctx.currentTime`; each frame the playback position is `(ctx.currentTime − start) mod buffer.duration`, and a binary search finds the chord active at that position (holding the most recent chord across gaps).

Each chord symbol is parsed into a **pitch-class set**, robustly across Karel's messy real symbols (`F5`, `C/D`, `A/A#/F`, `Csus4`, `A#maj9/F`, `FMadd9/C`, `Dm7#5/F`, `Amb6b9/F`, …): the symbol is split on `/`, every token contributes its own root pitch-class (per-token `tokenPitchClass`), and the first token's quality suffix adds standard chord-quality intervals (minor/major third, perfect/dim/aug fifth, sus2/sus4, 6/7/maj7/9/11/13 and common `b`/`#` alterations), with lowercase `m` read as minor and uppercase `M`/`maj` as major. The union is the chord's pitch-class set.

From that set, the chord-tone intervals above the root are computed across ~2 octaves (a rising, de-duplicated list including 0/12/24). Four anchor targets — ≈third (4), ≈fifth (7), ≈octave (12), ≈tenth (16) — are each snapped to the **nearest** available interval in that list. Those four semitone values drive the four granular voices. Because transposing the whole take by an interval that lies *between* chord tones keeps chord tones mapping onto chord tones, the fan stays diatonic to this chord; as the chord changes, the targets change and the stack re-voices live.

The four `AudioWorkletNode`s (processor `chordfold-pitch`) are built with `processorOptions.semitones = 0`, so the base ratio is 1.0 and the entire transposition is carried on the a-rate `detune` param. Each frame sets `detune = interval·100 + shimmer` via `setTargetAtTime(…, 0.12)`, so re-voicing is a smooth glissando rather than a jump. The dry take plays untouched at rate 1.0; hand separation fans the voices in, hand height sets the wet level; a small hand-speed shimmer (±~10 cents) rides on top without pulling a voice out of the chord. Every audio path terminates in the shared ear-safety master bus.

## Harmonic-chroma palette

A new color register (fluxweave's nacreous pearl is *not* reused). The current's hue is set by the chord root around the circle of fifths (`hue = ((root·7) mod 12)/12`); a warm/cool temperature is set by major-vs-minor (`chordIsMinor`). Saturation stays low and pearlescent — a restrained tint, never a rainbow. Hue is lerped toward its target (~0.05/frame, shortest path around the wheel) so color drifts gently and never snaps, and the deep near-black background is preserved. Over a minor passage the current cools and the fan sounds minor; over a major chord it warms and the fan sounds major — harmony made both audible and visible.

## Degrades

- **No WebGPU adapter** → a reduced Canvas2D current with the identical hands → harmonizer chain and the same harmonic-chroma tint.
- **No camera / permission denied / model fail** → a labelled autonomous demo drive keeps weaving the chord.
- **No AudioWorklet** → the dry take still plays and the current still flows.
- **No chord analysis** (null or empty) → a fixed consonant stack (+7/+12/+4/+16) and a neutral key-seeded tint, with an on-screen note that harmony data is unavailable.

## References

- Bridson, Hourihan & Nordenstam (2007), *Curl-Noise for Procedural Fluid Flow* (SIGGRAPH) — the divergence-free curl-of-noise advection substrate.
- MIDIBack (arXiv:2609.28008, 2026-09-23) — harmony-aware anchor for re-voicing a source performance to its own live chord track rather than a fixed stack.
