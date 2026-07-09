# 1326 — Voice Cathedral

**Route:** `/dream/1326-voice-cathedral`
**Pole:** cosmic-ambient (meditative, spacious, luminous, timeless)

## The one question

> What if your own held voice could build a vast luminous meditative space? Hum
> or sing a sustained tone into the mic and it is granularly captured, frozen,
> and multiplied into a slowly-blooming cathedral of light; sustain longer and
> the boundaries of the cloud dissolve toward white — the non-dual "oceanic
> boundlessness" of deep meditation — your single voice becoming a boundless
> choir.

This is the meditative pole: awareness becoming "expansive, boundless, subtle,"
spacious emptiness, luminosity, and the collapse of figure/ground (the *Oceanic
Boundlessness* altered-states dimension). It evokes a phenomenology and makes **no
medical claims.**

## Living reference / lineage

- **Julianna Barwick** (living) — looped-voice cathedral ambient: one voice,
  captured and stacked into a luminous choral space. The core inspiration.
- **Pauline Oliveros / Deep Listening** — sustained attention to a held tone and
  the room it rings in.
- **Éliane Radigue** — slow, patient sustained drone as a whole world.

## How it works — the technique

The gesture is a **sustained held tone**, not a click or a strike.

1. **Mic → AnalyserNode ONLY.** The mic never connects to `destination`, so there
   is **no feedback path** and nothing can howl. Nothing is recorded or sent — the
   voice is heard only on this device.
2. **Pitch + loudness.** A dependency-free YIN-lite autocorrelation detector
   (`pitch.ts`) estimates the sung fundamental; RMS gives loudness. The pitch is
   snapped to a **C-major pentatonic** scale so the seeded drone is always
   consonant.
3. **Granular capture + freeze.** A rolling ~3 s buffer of the captured voice is
   granulated: short Hann-windowed grains are scheduled continuously and read from
   the **live** buffer while you sing, and from **frozen snapshot layers** that
   keep ringing after you stop — a slowly-decaying granular freeze. Holding a
   steady tone commits a new frozen layer, so successive held tones **accumulate
   into a choir** (up to 6 layers, each decaying over ~15–20 s of silence).
4. **The cathedral space.** Grains are pitch-spread into octaves and fifths and
   fed through a long code-built **convolution reverb** (`_shared/psych/
   convolutionVoid`), over a low fixed drone bed (`_shared/psych/droneBank`, C2)
   and a pitch-following seed drone. As the space grows, the reverb blooms wetter
   and the drone opens.
5. **Boundlessness arc.** Sustaining climbs a `boundless` value. Visually the
   luminous voice-cloud (Canvas2D, pale golds → warm white) dissolves
   **edge → center → white** and the dark ground lightens toward a boundless field
   of light. Silence lets it settle back into a dark spacious void. This is the
   felt payload.

## Controls

- **Begin — sing your space**: gesture-gates the AudioContext and requests the
  mic. Before Begin, a gentle visual bloom already drifts so the piece is alive on
  a cold glance.
- Then just **hold a hum**. The longer and steadier the tone, the more voices
  freeze into the choir and the more boundless the light becomes.
- **Read the design notes**: an in-page overlay toggle (bottom-right).

## Safety & graceful degradation

- **No mic / denied**: an audible synthesized **demo voice** (a sustained hum)
  drives the whole piece so it is alive without permission, plus a `text-rose-300`
  notice inviting mic access. `navigator.mediaDevices` is guarded for SSR/absence.
- **No strobe.** Cosmic-ambient: only slow smooth luminance drift and a
  breath-paced ~0.1 Hz macro swell. The dissolve to white is **eased in**
  (smoothstep, capped alpha) so it is never a harsh full-white blowout.
- **prefers-reduced-motion** slows all motion (imported from
  `_shared/psych/safeFlicker`).
- Master gain **≤0.24**, 1.5 s fade-in, a `DynamicsCompressor` limiter before
  `destination`, hard caps on grains (40), layers (6) and motes (320).
- **Full teardown on unmount**: cancels rAF, stops all grain sources / oscillators
  / drone, stops all mic MediaStream tracks, and closes the AudioContext.

## What I'd deepen next

- An **AudioWorklet** grain engine for sample-accurate scheduling and denser
  clouds without main-thread jitter.
- **Per-layer spatial panning** so the accumulating choir widens around the
  listener.
- A **breath / onset detector** so an inhale momentarily parts the white — making
  the boundlessness breathe with you.
