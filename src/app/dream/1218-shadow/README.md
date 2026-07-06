# 1218 · shadow

**state:** responsive-duet · **pole:** warm/contemplative
**route:** `/dream/1218-shadow`

## The one question

> What if Resonance could **harmonize you in real time** — you play a single-note
> melody, and a "shadow" partner voices it into full four-part chorale / close-harmony
> a beat behind you, choosing the harmony by **minimizing voice motion** (real
> voice-leading), so a one-finger line blooms into a moving choir of chords under
> your hand?

This is the "jazz responsive" alternative to a fixed journey engine. The intelligence
here is **harmonic / voice-leading** — not pitch-tracking, not motif memory. For every
note you play, the machine decides the best chord and the smoothest four-voice path to
get there.

## How it works (three real subsystems)

### 1. `harmony.ts` — the voice-leading harmonizer

For each melody note (in a chosen key + mode) it:

1. **Picks a chord.** Builds the seven diatonic triads (chorale) or sevenths (close /
   jazz) for the key. In minor it borrows the harmonic-minor **V / V7** so real
   cadences with a leading tone are available. It keeps every chord that contains your
   note as a chord tone, then scores them by **functional root motion** — descending
   fifths (the circle of fifths) strongest, cadences and step motion next,
   retrogressions and static repeats penalised — plus tonal gravity toward I / V / IV.
2. **Voices it in four parts.** A small exhaustive search over SATB range-legal notes
   finds the voicing that **minimises total inner-voice motion** from the previous
   chord, subject to: correct ordering & spacing (upper voices within an octave), bass
   on the root, no doubled leading tone, and a penalty for **parallel perfect fifths /
   octaves** between any voice pair. Combined score = functional weight − motion cost,
   so harmony choice and smoothness trade off the way a human arranger balances them.

Runtime check (A-minor, close voicing) produces `i7 → iv7 → V7 → iiø7 → VII7 → i7`
with the raised leading tone (G♯) appearing exactly in the dominant — real functional
minor, decided per note.

### 2. `engine.ts` — clock, shadow-delay, synthesis

Four independent **struck FM voices** (Chowning-style: sine carrier, sine modulator
with a decaying index for a bright attack, per-voice low-pass for warmth, gentle stereo
spread). Each voice has a slightly different ratio/index/brightness so S/A/T/B stay
legible; the bass is rounder, the soprano more present. The player's note sounds
immediately; the harmonized A/T/B voices are scheduled a musical **shadow delay** (an
eighth or quarter note at the tempo) later, so the choir blooms *under* your hand. A
**look-ahead scheduler** in the Chris Wilson "A Tale of Two Clocks" idiom (~25 ms
interval, ~120 ms horizon onto `audioCtx.currentTime`) drives the scripted Demo melody
so its timing never jitters. Bounded polyphony (oldest-voice stealing), a master gain
that **ramps from 0**, and a `DynamicsCompressor` brick-wall limiter keep it safe.

### 3. `page.tsx` — instrument + voice-leading ribbon

A Canvas2D **voice-leading ribbon**: four gliding lines whose heights are the live
pitches — **jade soprano** on top, **rose** inner voices below — with a moving playhead
and per-voice note-name labels, so you literally see the inner voices move (and see the
shadow arriving to the right of the playhead before it sounds). Below it, a ~2-octave
on-screen keyboard (click / QWERTY) lights jade under your finger and tints the current
chord's tones rose. Readouts show key, mode, chord symbol + roman numeral, and the four
voice notes. Controls: key, major/minor, chorale/close, shadow 1/8·1/4, arpeggiate,
and a **Demo** button that plays a phrase with no interaction. Web MIDI is used if
present; otherwise keyboard/mouse work fully (small note shown).

## Named references

- **Bach** chorale harmonization — four-part voice-leading rules (range, spacing,
  no parallel fifths/octaves, resolve the leading tone).
- **Fux**, *Gradus ad Parnassum* — species counterpoint / independent voice motion.
- **Dmitri Tymoczko**, *A Geometry of Music* — voice leading as **minimal motion** in
  chord space (the objective this harmonizer literally minimises).
- **Chris Wilson**, *A Tale of Two Clocks* — the look-ahead audio scheduler.
- **John Chowning** — FM synthesis (the struck keyboard voice).

**2026 frontier context:** real-time human–AI accompaniment systems (ReaLJam,
arXiv 2502.21267; LiveBand, arXiv 2606.03803, Jun 2026) do this with heavy neural
models. This prototype proves a **lightweight rule-based voice-leading shadow** works
fully client-side, deterministically, with no model and no mic.

## Honest edges

- The harmonizer is diatonic + harmonic-minor borrowing only — no secondary dominants,
  modulation, or modal mixture beyond the minor V; a chromatic note becomes a "colour
  tone" over the best-scoring chord rather than triggering a true chromatic chord.
- Voicing is a bounded greedy/exhaustive search per note with hand-tuned weights, not a
  global optimum over the whole phrase; it can occasionally prefer a slightly larger
  leap when the functional bonus outweighs the motion cost.
- Chords are chosen note-by-note with only one chord of memory, so it reacts rather than
  plans ahead; fast playing above the shadow delay can stack blooms densely.
- Struck FM voices decay (they don't sustain while held), so long-held chords ring and
  fade rather than holding indefinitely — a keyboard/celeste character, not an organ.

## Safety

No strobe. The ribbon scrolls as one slow continuous drift well under 3 Hz; key-flashes
are smooth exponential ramps. `prefers-reduced-motion` is respected for decorative
drift. Audio is gesture-gated (Begin / Demo resumes the AudioContext), the master gain
ramps from 0, and a limiter caps the bus. Full teardown on unmount.

## Next-cycle deepening (from the DEEP fire's two sibling approaches)

This shipped as the winner of a 3-way DEEP fire on one concept — *a responsive duet
partner that answers you*. The two sibling approaches (built complete, folder-clean,
then banked) are the natural extensions:

- **From `1217-tradefours` (motif memory + transformation grammar):** add a
  *melodic* answer on top of the harmonic one. Right now the shadow harmonizes what
  you play *simultaneously*; the trade-fours engine captures your phrase as an abstract
  motif `(scaleDegree, onset, duration, velocity)` and answers with a developed
  variation (diatonic transpose to the changes, inversion, fragmentation + sequence,
  cadential tail). Merging them → a partner that both harmonizes you in the moment
  **and** trades a developed melodic answer at the turnaround, voice-led throughout.
- **From `1216-consort` (real-time mic listening):** replace the keyboard input with
  the ear. A YIN pitch detector + spectral-flux onset + Krumhansl–Schmuckler
  key-finding front-end would let a singer or a mic'd piano drive the shadow harmony
  live — the "jazz responsive" live-performance path — using the *identical* downstream
  voice-leading engine (mic accuracy needs on-hardware verification, so keep the
  keyboard/Demo route as the reliable fallback).
- **Own next step:** widen the harmonic vocabulary past diatonic + harmonic-minor V —
  secondary dominants, tritone subs, and modal mixture — and give it one bar of
  *look-ahead planning* (currently one chord of memory, purely reactive) so it can shape
  a cadence toward where your line is going, not just react to the last note.
