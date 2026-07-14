# 1682 · cadence-forge

**The one question:** *What if you could PLAY equal-tempered functional harmony
that actually modulates and BITES — and watch a real tonal-tension curve rise
and resolve as you do?*

This is the deliberate opposite of a consonant just-intonation drone: a played
classical-harmony instrument. You perform Roman-numeral scale degrees on the
computer keyboard; the engine realizes each numeral with real four-voice
(SATB) voice-leading, fires applied dominants and diminished sevenths that
carry genuine tritones, pivots to related keys, and plots a live tonal-tension
ribbon on a Canvas2D as you go.

## Interaction (play-the-numeral)

- **`A S D F G H J`** = **I ii iii IV V vi vii°** — the seven diatonic triads of
  the current key (numerals update on modulation and in minor keys).
- **Hold `Shift` + a home-row key** = the **applied / secondary dominant** that
  tonicizes that degree (e.g. `Shift+G` → **V7/V**). A chromatic dominant
  seventh with a real tritone that bites.
- **`K`** = **V7** (the key's dominant seventh). **`L`** = **vii°7** (fully
  diminished seventh — two stacked tritones, the highest dissonance here).
- **`M`** (or `Space`) = **modulate via a pivot chord** to a related key —
  cycling dominant → relative minor → subdominant → home. It plays the common
  (pivot) chord, then the new key's `V7 → I`, and updates the on-screen key.
- **`N`** = **deceptive cadence** — plays `V7` then resolves to **vi** instead
  of I, as a distinct two-chord gesture.
- On-screen buttons mirror every move for mouse/touch.

## The music theory

- **Equal temperament (12-TET, A4 = 440):** `freq = 440 · 2^((midi − 69)/12)`.
- **Voice-leading:** each chord is realized as bass + tenor/alto/soprano. A
  small search over pitch-class-to-voice assignments keeps common tones, moves
  the upper voices by the smallest interval to the nearest chord tone, prefers
  full chord coverage (root in the bass, thirds/sevenths up top), and reports
  total semitone motion. Chords are never just stacked root-position triads.
- **Minor keys** use the harmonic-minor leading tone for V and vii° so the
  dominant is genuinely major/diminished.

### Tension: a weighted scalar per chord

Modeled on the **TIV tonal-tension model** (Navarro-Cáceres & Bernardes,
*Entropy* 2020), with the published weight vector:

| component            | what it measures                                              | weight |
| -------------------- | ------------------------------------------------------------ | ------ |
| dissonance           | mean interval-class dissonance of the chord's pitch classes  | 0.402  |
| hierarchical tension | distance of the chord's function from tonic (I low → vii°7 1) | 0.246  |
| tonal distance       | chroma-vector **cosine distance** from the key's tonic triad | 0.202  |
| voice-leading        | total semitone motion from the previous voicing (/24)        | 0.193  |

Each component is normalized to `0..1`; the final tension is the weighted sum
divided by the weight total (1.043) and clamped to `0..1`. The hierarchical
weighting of chord functions follows **Lerdahl, *Tonal Pitch Space* (2001)**.

- *Dissonance* uses interval-class weights (tritone / minor-2nd high, thirds
  low) averaged over all chord-tone pairs, so V7 and vii°7 read high, I reads
  low.
- *Tonal distance* is the cosine distance between the 12-d binary chroma vector
  of the chord and that of the current key's tonic triad — 0 for I, ~1 for a
  fully-diminished chord sharing no tones.

The ribbon scrolls left→right with the newest chord at the playhead; peaks
(dominant/diminished tension) are tagged `▲` in bright violet, tonic-return
dips are tagged `▽` in muted grey.

## Audio

Pure Web Audio API — no samples, no npm audio libs. Each voice is a small
oscillator stack (sawtooth + sine, gentle ADSR, fixed per-voice detune) summed
through a shared master `GainNode` (**gain 0.12 ≤ 0.14**) → lowpass → a
`DynamicsCompressor` → destination. The previous chord is released as the next
one enters, so it sounds like tense functional harmony, not a pad wash. If
`AudioContext` is unavailable the visual keeps running and an on-brand notice
is shown.

## Deterministic ghost self-demo

On mount a fixed cadential phrase self-plays and loops whenever the visitor is
idle: **I – vi – IV – V7/V – V7 – I**, then a pivot **modulation**, then a
**deceptive cadence** (V7 → vi). It drives the identical
realize → voice → tension → render path, so a headless review box is never
blank or silent. It is strictly deterministic — no `Math.random`, `Date.now`,
`new Date`, or `performance.now`-seeded values in executable code. The
sequencer and all animation run on an integer **frame counter**, fully
decoupled from the audio clock, so the ribbon animates even before audio is
unlocked and never freezes if autoplay is gated. Any per-voice variation
(detune) is a fixed constant.

## Known limits

- Modulation cycles a small fixed set of related keys (dominant / relative
  minor / subdominant / home) rather than free key choice.
- The voice-leading search optimizes common tones + minimal motion + chord
  coverage; it does not enforce every classical rule (no explicit
  parallel-fifth/octave avoidance), and bass motion favors root position.
- The tension model is a compact re-implementation of the TIV weighting, not
  the full Tonal Interval Vector DFT pipeline; components are cited
  approximations (mean interval-class dissonance, chroma cosine distance).
- Diminished-seventh dissonance is measured as mean interval-class dissonance,
  so its raw dissonance component reads high but not saturated; the
  hierarchical weight pushes vii°7 to the top overall.
