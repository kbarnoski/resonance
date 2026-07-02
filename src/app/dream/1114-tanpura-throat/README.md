# Tanpura Throat

**One question:** *What if singing into a tanpura made its sympathetic strings
physically ring back — a drone instrument that resonates with the harmonics of
your voice?*

This is a physical-modeling take on a voice-driven sympathetic-resonance temple.
Instead of pure sine resonators, the temple's voices are **plucked-string
models** (Karplus-Strong waveguides) tuned to a just-intonation drone, excited
into ringing by the energy your voice puts into each partial.

---

## How it works

### Input — the microphone, analysis only

The mic is **measured, never routed to the speakers** (no monitoring, no
feedback howl, nothing recorded or sent). Every animation frame, from the mic
signal we extract:

1. **Fundamental pitch** — time-domain **autocorrelation** with **parabolic
   interpolation** of the correlation peak, RMS-gated and smoothed
   (`pitch.ts → detectPitchHz`). We take the *first* strong peak after the
   correlation dips below zero to avoid octave-down errors.
2. **Per-harmonic energy** — an `AnalyserNode` FFT. For each sympathetic string
   we read the peak magnitude in the bins nearest that string's frequency
   (`pitch.ts → bandEnergyDb` / `normDb`). That reading is the excitation signal
   for the string: the more energy your voice puts on a partial, the harder that
   string is struck.

### Synthesis — a bank of Karplus-Strong sympathetic strings

Twelve **Karplus-Strong** strings (`strings.ts`) are tuned to a just-intonation
set over a fixed **~110 Hz drone root** (Sa 1/1, Re 9/8, Ga 5/4, Ma 4/3, Pa 3/2,
Dha 5/3, Ni 15/8, Sa′ 2/1, Re′ 9/4, Ga′ 5/2, Ma′ 8/3, Pa′ 3/1). Each string is a
digital waveguide built from plain Web Audio nodes:

```
excite ─▶ delay ─▶ damp (lowpass) ─┬─▶ out ─▶ master
            ▲                       │
            └──── feedback gain ◀───┘
```

- The **`DelayNode`** length sets the pitch (`delayTime ≈ 1 / freq`).
- The **feedback `GainNode`** just under 1 makes the string ring and decay over
  seconds (lower strings ring longer).
- A **one-pole-ish lowpass** (`BiquadFilter`) in the loop rolls the highs off a
  little faster each pass — the plucked, physically-decaying timbre a steady sine
  cannot give you. A touch of `Q` adds the bright **jvari**-like bridge edge on
  the attack.
- A **pluck** is a short seeded **noise burst** injected at `excite` with a
  fast-attack / fast-decay envelope — like a finger releasing the string.

Under the strings sits a sustained sub-pad plus a **tanpura drone bed** that
re-plucks the root/fifth/octave strings (Pa–Sa–Sa′–Sa) on a slow ~1 s cycle, so
there is always warmth. Everything sums through a single
**`DynamicsCompressor`** limiter → master gain → destination at a gentle level.

When a partial's energy crosses a rising threshold, or the detected fundamental
lands on a string, a fresh soft excitation is injected into that string and it
rings and decays naturally — the temple **sympathetically answers** the voice.

### Visual — a warm Canvas2D "resonant string mandala"

Deliberately **Canvas2D, not WebGL**, to contrast the sibling approach. Twelve
concentric rings around a glowing drone core; faint radial filaments as warp
threads. When a string is struck its ring **bulges into a decaying standing wave**
(`amp · sin(nodes·θ + phase)`), higher strings carrying more nodes; its glow is
proportional to current ring energy. Warm palette — **brass / amber / gold** with
**deep-indigo** rim accents on a warm-dark **umber/plum** ground (never pure
black). A soft dot orbits at a radius set by your detected note. Brightness is
clamped so it never strobes; a slow global drift breathes the whole mandala.
`prefers-reduced-motion` freezes the rotation and standing-wave animation.

### Never blank, never silent — the autonomous "cantor"

For hands-free morning review, a seeded autonomous **cantor** — a gliding
vowel-like formant source (two detuned saw oscillators through three bandpass
formant filters, gain swelling between vowels) — is routed into the **same
analyser as the mic**. So with **no microphone and no interaction**, the pitch
and per-partial detection still fire, strings still get struck, and the mandala
still rings on its own. All randomness comes from a seeded **mulberry32** PRNG
(`pitch.ts`) — `Math.random` is never called in the audio/animation loop.

On **Start** the cantor begins immediately (sound and motion within ~1 s), the
mic is requested, and if granted we cross-fade the cantor down so your voice
takes the lead. Status badge: **● listening** (live mic) vs **● auto (sing to
join)**. Denied / no mic degrades gracefully to the cantor with a readable
notice — never a thrown error.

---

## Named references / lineage

- The Indian **tanpura** and its sustained sympathetic drone + **jvari** (buzzing
  bridge) timbre.
- **Sitar / sarangi tarab** sympathetic strings that ring without being touched.
- **Karplus-Strong** plucked-string synthesis — Karplus & Strong, "Digital
  Synthesis of Plucked-String and Drum Timbres," *Computer Music Journal*, 1983.
- **La Monte Young** — *Dream House* (a continuous Just Intonation drone
  environment).
- **Pauline Oliveros** — *Deep Listening*.
- Research anchor (grounding only, **no health claim**): the 2025 *Frontiers in
  Neuroscience* MEG study, "Harmonic vowels and neural dynamics: MEG evidence for
  auditory resonance integration in singing."

---

## Honest note on what is / isn't verifiable here

Without real audio hardware in this build environment I can verify the **code
paths, types, and lint**, and reason about the DSP, but I cannot listen to the
result. Specifically unverified by ear:

- **Tuning accuracy of the Karplus-Strong strings.** Pitch is set by
  `delayTime = 1/freq`; the lowpass in the loop adds a small phase delay, so the
  real pitches sit slightly flat of the just ratios. For a drone ambience this is
  musically fine, but it is *not* a calibrated tuning.
- **Balance / loudness** of drone bed vs. sympathetic answers, and whether the
  limiter is doing the right amount of work, are tuned by estimate.
- **Pitch tracking on a real voice** (vibrato, consonants, room noise) is only
  validated against the synthetic cantor here; the autocorrelation + parabolic
  interpolation is a standard, well-behaved approach but real-mic robustness is
  unproven in this environment.
- Feedback gains are kept safely under unity with a compressor/limiter backstop,
  so runaway buildup from rapid re-plucking should be contained — but this, too,
  is reasoned, not heard.

## Next-cycle deepening (folded in from the DEEP sibling `1113-throat-of-light`)

This shipped as the winner of a 2-approach DEEP fire; the sibling was a
sine-resonator + WebGL2 rose-window take on the same concept. Its best ideas to
graft here next cycle:

- **Alive on cold load.** The sibling emits seeded "phantom blooms" into its
  analyser *while the AudioContext is still suspended*, so its visual is already
  moving before the first click. This piece is a warm-dark screen + Start button
  until you interact — add a pre-gesture Canvas2D idle animation (the drone-bed
  mandala breathing on the seeded PRNG, no audio) so a phone glance is never
  static.
- **A "strings vs. light" voice-bank toggle** — offer the sibling's pure-sine
  resonator timbre as an alternate to the Karplus-Strong strings, so the two
  approaches merge into one instrument.
- **Call-and-response / duet** (see below), vowel→chapel-geometry, and a
  real-hardware Karplus-Strong tuning pass to correct the slightly-flat delay
  pitch noted above.

## Files

- `page.tsx` — client component: UI, the analyse+render loop, the Canvas2D mandala.
- `audio.ts` — the engine: master/limiter, analyser, string bank, drone bed, cantor, mic wiring.
- `strings.ts` — the Karplus-Strong sympathetic-string bank + JI ratios.
- `pitch.ts` — autocorrelation pitch detection, FFT band energy, mulberry32 PRNG.
- `README.md` — this file.
