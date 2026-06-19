# 738 · Song Sprout

> What if a 4-year-old had a single glowing creature that **listens**, **remembers**
> the little songs they hum, and slowly **grows up** — so over minutes it gets
> bigger and braver and starts singing the child's own melodies back, recombined
> into something new?

The dream lab's first long-form, stateful **kids** piece. Unlike the instant
cause→effect kids toys that reset, the Song Sprout has **memory** and **evolves
over minutes**. The sprout you meet at minute 1 (a tiny baby-blue spark, thin
voice) is genuinely different from the one at minute 5 (a big warm-gold being
with a fuller, vibrato'd voice that sings developed versions of what you taught
it).

## What it is

One luminous 3D creature made of additively-blended `THREE.Points` glow sprites
with a soft bright core, floating in a near-dark fogged space. It is a friendly
blob — not a realistic animal. It breathes, leans toward your voice, brightens
when listening, and pulses when it sings.

## How to use

1. Tap **"Sing to your sprout"** (grants mic) or **"Just watch it grow"** (no mic).
2. Hum or sing a few short notes.
3. **Go quiet and listen** — when you fall silent the sprout answers with a
   little melody recombined from what it has heard.
4. Keep feeding it phrases over a few minutes and watch/hear it mature.

If you do nothing (or deny the mic), a **ghost auto-demo** runs: a virtual child
hums little phrases on its own, so the sprout listens, grows, and sings back
completely hands-free on load. The piece is alive and sounding with zero
permission and zero interaction.

## Design notes

- **Memory engine (`memory.ts`)** is the heart. Detected phrases are snapped to
  a warm consonant scale and stored as fragments (scale-degree contours +
  rhythms). A saturating growth curve (`1 − e^(−notes/26)`) advances as memories
  accumulate. `composeReply` recombines remembered fragments — transposing,
  reordering, reversing, contour-inverting, warping rhythm, and (when mature)
  adding a resolving tail tone. It is an **answer, never a literal echo**, and it
  gets more elaborate as the sprout grows (1 fragment → 2 → 3 woven together).
- **Growth is a real, designed property.** With maturity: more particles become
  active (600 → 2600), the body scales up, colour shifts baby-blue → violet →
  warm gold, the voice gains an octave layer + FM warmth + vibrato + longer
  release, the drone bed fills out, and replies come a little more often. A
  legible life-stage label ("a tiny spark" → "a grown song-being") makes it
  obvious.
- **Audio (`audio.ts`)** is Web Audio only. Mic → `AnalyserNode` is
  **analysis-only, never routed to `destination`**. Pitch is estimated with cheap
  autocorrelation over the time-domain buffer. The sprout's voice is synthesized
  (sine carrier + FM partial + octave + vibrato + per-voice lowpass). Scale is
  **D-Dorian** across child-comfortable octaves, so it is never out of tune.
- **Kids-safe master chain (mandatory):** all voices → master gain (≤ 0.3) →
  lowpass (~7500 Hz) → compressor (threshold −10, ratio 20:1) → destination.
  Soft master fade-in, always-on warm drone bed. Never harsh, never loud.
- **Graceful degradation:** no mic → rose notice + ghost demo. No WebGL →
  inline Canvas2D fallback (`fallback.ts`) that still grows, glows, and sings.
  AudioContext unlocks on the Start gesture (iOS-safe).

## Named references

- **Tamagotchi / *Creatures* / *Seaman*** — artificial-life companions that
  remember and develop over time; the "single pet that grows up" frame.
- **Brian Eno** generative / long-form ambient — the tender, beat-free,
  ever-unfolding sound bed and the idea of music as a slowly-evolving system.
- **George Lewis, *Voyager*** — the machine-improviser that *answers* you;
  call-and-response that transforms rather than parrots the input.

## Honest unverified note

Written to match the lab's patterns and re-read for type/lint/SSR safety, but
**not run in a browser or built in this session** (no `tsc`/`eslint`/dev server
were executed here). The autocorrelation pitch tracker is intentionally cheap
and coarse — it captures rough contour, not precise transcription, and may
mis-track in noisy rooms or with very young/quiet voices; phrases are snapped to
scale so mis-tracks still sound consonant. Growth/reply cadence timings are
tuned by feel and may want adjustment after live testing with a real child.
