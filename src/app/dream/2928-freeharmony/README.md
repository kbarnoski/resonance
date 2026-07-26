# 2928 · Free Harmony

**The one question:** *What if Resonance had a live accompanist that follows your
HARMONY with no reference score — you sing (or hum, or play) anything freely, and
in real time it finds your key and lays the right chord under your voice,
re-harmonizing a beat or two after you modulate?*

This is a **scoreless** free harmonizer — the opposite of a click track. The
human is fully responsible for the melody moment-to-moment: real stakes, and an
agent that can genuinely be wrong. Framed against **"A Design Space for Live
Music Agents" (arXiv:2602.05064, 2026)**, this piece is the *scoreless
harmonic-follower* point in that design space: no score to align to, only your
live pitch and a music-theory model of where the key is going.

## Tags

- **INPUT:** mic / live voice (human performing, responsible moment-to-moment).
- **OUTPUT:** WebGL2 fragment-shader "harmony aurora" (Canvas2D graceful fallback).
- **CORE TECHNIQUE:** Krumhansl–Schmuckler key-finding on a decaying pitch-class
  histogram → functional-harmony chord choice with voice-leading + hysteresis.
- **VIBE:** cosmic / harmonic-aurora, immersive.

## How the engine works

1. **`pitch.ts` — YIN pitch detection.** A `requestAnimationFrame` loop pulls the
   mic's time-domain buffer from an `AnalyserNode` (`getFloatTimeDomainData`). YIN
   with cumulative-mean normalization + parabolic interpolation yields a **continuous
   MIDI pitch** (never snapped to a scale). An RMS + clarity **voicing gate** keeps
   silence and noise out of the histogram.

2. **`harmony.ts` — Krumhansl–Schmuckler key-finding.** A **12-bin pitch-class
   histogram decays exponentially (~2.4 s half-life)**, fed by confident pitches
   weighted by duration. Every ~200 ms the histogram is Pearson-correlated against
   all **24 rotated Krumhansl–Kessler major/minor key profiles**; the best
   correlation names the current key (tonic + mode). From the key + the current
   sung pitch class, a **diatonic triad** is chosen by functional preference
   (I/IV/V/vi favoured; harmonic-minor dominant so V resolves), with:
   - **voice-leading** — octave placement minimizes motion from the previous chord;
   - **hysteresis** — chords hold ≥ 1.5 s unless a change is *strongly* favoured.

   The ~2.4 s histogram half-life is deliberate: the detected key **lags** the
   singer, so the accompaniment re-harmonizes *a beat or two after* you modulate —
   like a real player catching up, not a quantizer snapping instantly.

3. **`audio.ts` — the accompanist's voice.** A small polyphonic synth: a bass root,
   a 3-voice sustained pad (voiced chord tones), a gentle arp, and — in Auto mode —
   a soft lead that sings the virtual improviser's line. All frequencies glide with
   `setTargetAtTime` (no clicky note-ons); master gain ≤ 0.15.

4. **`viz.ts` — the harmony aurora (WebGL2).** A single full-screen triangle + one
   fbm domain-warp fragment shader. **Hue** tracks the tonic's position on the
   circle of fifths, biased into the Resonance violet arc (indigo → violet →
   magenta — no garish full spectrum). **Bloom** pulses on chord changes;
   **turbulence** tracks sung pitch height + key stability. Canvas2D fallback if
   WebGL2 is unavailable.

5. **`rng.ts` — seeded virtual improviser.** `mulberry32(0x2928)` drives a slowly
   wandering, occasionally-modulating melodic line that feeds the **same**
   pitch → harmony → audio → viz path, so the piece is fully alive with no mic
   granted and on a headless render. Toggle between **Sing (mic)** and
   **Auto (virtual improviser)**.

## Named references

- **ReaLchords** — Wu et al., *ReaLchords: Real-time Chord Accompaniment via
  Online Reinforcement Learning* (arXiv:2506.14723, 2025). An RL agent that learns
  this same live "chord-under-a-live-melody" reflex. **Free Harmony is its
  deterministic music-theory cousin** — same reflex, hand-built from theory instead
  of learned.
- **Krumhansl–Schmuckler / Krumhansl–Kessler key-finding** — Carol L. Krumhansl,
  *Cognitive Foundations of Musical Pitch* (Oxford, 1990). The tonal-hierarchy
  profiles and the correlation method used here.
- **"A Design Space for Live Music Agents"** (arXiv:2602.05064, 2026) — the framing
  above; this piece occupies the *scoreless harmonic-follower* coordinate.

## Degrade-gracefully behaviour

- **No mic permission** → automatic fall back to the virtual improviser with a
  `text-destructive` notice.
- **WebGL2 unavailable** → Canvas2D fallback aurora with a notice.

## Next-cycle deepening

- Weight the histogram by *pitch salience* (attack + vibrato) rather than raw
  duration, and add a short-term "melodic-arrival" prior so cadences land on I.
- Extend functional harmony to secondary dominants and modal interchange, and let
  the hysteresis margin adapt to the singer's phrase rate (fast phrasing → looser
  hold, so the agent stays out of the way).
- Add an inversion planner to the voice-leading so bass motion is stepwise, and let
  the aurora's turbulence encode *harmonic tension* (distance from tonic) rather
  than raw pitch height.
