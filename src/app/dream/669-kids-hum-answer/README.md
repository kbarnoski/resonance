# Hum & Answer

**For**: kids (4+), eyes-closed friendly · **Route**: `/dream/669-kids-hum-answer`

## The one question

What if a child hummed one note, closed their eyes, and an unseen friend
answered — not by resolving sweetly right away, but by **leaning on a tense
note and then SIGHING down to rest**, so the child discovers tension → release
with no screen at all?

## What it does

This is the **off-the-glass** piece. The screen stays near-black with a single
soft breathing glow; the whole experience is meant to work with your eyes shut.

1. Tap **Hum a note** (this unlocks the AudioContext and asks for the mic inside
   the gesture, as iOS requires).
2. Hum or sing a single note and hold it for a moment.
3. The app detects your pitch and an **unseen choir answers** — but it builds a
   **suspension chain** over your note as a tonic:
   - it **leans** on a tense held note (a dissonant suspension),
   - then **sighs** down by step to a partial release,
   - leans again, releases again,
   - and finally settles to full rest.

You hear tension be *created* and then *released* — the denial of closure, then
closure. The glow pulses with the post-limiter amplitude and shifts hue:
**violet/blue while a suspension is tense → warm amber as it resolves.** You can
ignore the glow entirely; it is there only for a glancing eye.

## The technique

- **Input:** microphone via `getUserMedia({ audio: true })`. Real-time
  monophonic **pitch detection by autocorrelation** (Chris Wilson's canonical
  Web Audio approach): an **RMS gate** to ignore silence, a **clarity gate** on
  the normalised peak correlation, and **parabolic interpolation** around the
  best lag for sub-sample accuracy. Range ~75–1000 Hz, then **octave-collapse**
  into a child-voice band (~G3–G4) to defend against octave errors. A short
  stability window means we answer a *deliberate* hum, not a passing slide.
- **The answer = a real suspension chain**, not a single echo or harmony. Over
  the detected tonic (with a steady tonic drone an octave below as the rest
  anchor), the moving voice walks three textbook **common-practice suspensions**
  that all resolve **DOWN by step**:
  - **4–3**: the perfect 4th held over the chord, sighing down to the major 3rd
  - **7–6**: the minor 7th leaning to the major 6th
  - **2–1**: the major 2nd settling to the unison (full rest)
  Each tension is held ~1.1 s, then a ~0.3 s downward portamento "sigh", then
  ~0.9 s of rest before the next lean. Deliberately unhurried.
- **Synthesis (NO samples, NO AI):** the answering voices are
  formant-bandpassed sawtooth "ah" voices — a sawtooth through three parallel
  bandpass resonators centred at ~800 / 1150 / 2900 Hz. Built entirely with the
  Web Audio API.
- **Visual:** ONE CSS radial-gradient glow that breathes with amplitude and
  shifts hue with tension. No Canvas2D scene, no WebGL.
- **Safe sound:** master chain is `gain (0.34) → DynamicsCompressor →
  destination`, soft attack/release envelopes, capped per-voice gain (0.16), no
  harsh transients.

## NOT pentatonic / no scale-snap

The point is that the child **meets a tense note** and hears it resolve. The
dissonance is intentional — nothing is hidden behind a "no wrong notes" scale.
The mic note becomes the tonic; the suspensions are genuine voice-leading
dissonances over it.

## Privacy

No API route. The mic stream is analysed entirely on-device and is connected
only to an analyser node — **never routed to output, never recorded, never
stored, never sent over the network.** This is stated on screen.

## Idle / no-mic auto-demo

If mic permission is denied or unavailable, a gentle self-playing demo runs: a
synthesized "child" note triggers the suspension-chain answer every several
seconds, with a `text-rose-300` note explaining the mic is off — so a silent
glance still hears tension → resolution working. On unmount, the MediaStream
tracks, AudioContext, rAF, and all timers are fully cleaned up.

## Named reference

- The **4–3 / 7–6 / 2–1 suspension figures** of common-practice voice leading —
  a suspended dissonance prepared, held, and resolved **down by step**.
- **Tonal closure and its denial as perceived emotional cues in children**
  (developmental music-cognition literature): children perceive closure and the
  denial of closure as emotional states before they can label major vs. minor,
  which makes tension → release the most age-robust harmonic event here.
- Interaction model: **Bobby McFerrin's call-and-response "Circlesong"**
  pedagogy — you sing, the circle answers.

## Honest note on originality

The core **mic → harmonized answer** mechanism has lab precedent
(`280-kids-echo-canyon` already did mic → harmonized echo). The **fresh layer
here is the suspension chain**: the answer is not an echo or a single harmony
but a genuine walk through several common-practice tensions that each resolve
down by step — the pedagogy of *tension → release* is the novel core.

## Unverified

This was built in a sandbox without audio or a microphone. The real-world
**pitch-detection accuracy** (especially on a small child's breathy voice) and
the **felt musicality of the suspensions** (timing of the leans and sighs)
cannot be heard or tuned here and should be checked on a real device.
