# 243 · Spectral Cloud

## The one question

**What if MY OWN MUSIC became a VOLUMETRIC CLOUD OF LIGHT I could orbit?**

Not a waveform, not a bar graph — a *data sculpture*. A rolling few-second
memory of the spectrum, deposited into 3D space as a luminous nebula of points
you can drift around and through. This is the **point-cloud / nebula** reading
of the brief (deliberately distinct from a terrain or a tunnel).

## How the spectrum becomes a cloud

The cloud is a single `THREE.Points` object (additive blending, soft round
sprite, `ShaderMaterial` for per-point size + brightness).

**Deposition mapping** (per frame):

- The analyser's FFT is folded down to `BINS = 192` perceptual bins using a
  power-law (`pow(b/BINS, 1.6)`) so the low end gets more resolution.
- **Angle** around a disk = frequency bin (a full 360° fan).
- **Radius** = frequency bin too — bass sits in the core, highs at the rim.
- **Height (Y) = time.** The cloud is a stack of `RINGS = 96` horizontal disks,
  one per recent frame.
- **Point size + brightness = that bin's energy.** Quiet bins shrink to ~0 and
  go nearly black, so silence reads as genuinely empty space.
- **Hue = frequency:** violet (bass) → cyan (mids) → rose/amber (highs), with
  lightness driven by energy.

**Ring-buffer history.** The lattice of `BINS × RINGS` point *positions* is
allocated exactly once. Each frame writes the newest spectrum into ring
`writeRing`, then advances the head modulo `RINGS`. Older rings keep whatever
color/size they were last given, so the stack is a rolling memory of the music
that scrolls through itself — **no per-frame reallocation**, only the `color`
and `aSize` attributes are updated and flagged `needsUpdate`.

The whole cloud slowly self-rotates, and the camera auto-orbits (a small
self-contained orbit/drag/dolly controller — drag to take over, scroll to
dolly, auto-orbit resumes after you let go).

## The four subsystems

1. **Spectrum → volumetric deposition + ring buffer** (above) — the core.
2. **Onset / beat reactivity.** An energy-flux onset detector (rectified
   spectral flux vs. an adaptive envelope `fluxEnv * 1.6 + 0.8`, with a refractory
   gap). On a strong onset it fires an **expanding spherical shockwave shell** of
   extra-bright points, a **quick camera dolly punch**, and blooms the whole
   cloud (`uBloom`). A live **onset indicator + BPM estimate** (from the running
   inter-onset interval) sits in the corner.
3. **Spectral centroid.** The centroid (brightness of the timbre) biases global
   **hue**, drives the cloud's **dispersion** (bright music blooms wider and
   sparklier via `scale` + `uScale`; dark music condenses), so the sculpture's
   overall *shape* tracks the music's character — not just its loudness.
4. **Dual audio source.** Built-in generative **C-major-pentatonic ambient pad**
   (detuned oscillators + slow filter LFO + wandering plucks so onsets actually
   fire) guarantees the cloud is alive and audible the instant you press Start.
   **File upload** decodes via `decodeAudioData`, loops through the same
   `AnalyserNode`, and invites your own piano recordings. Decode failure shows a
   `text-rose-300` error and keeps the pad running.

## Named references

- **Refik Anadol — *Machine Hallucinations*** and his *data-sculpture* point
  clouds: turning a high-dimensional data stream into a drifting volumetric
  nebula you inhabit. This prototype is the small, audio-reactive cousin of that
  idea — the "data" is your own spectrum's recent history.
- **Ryoji Ikeda — *data.scan* / *test pattern*:** the austere, scientific
  rendering of signal as luminous points and scan-lines in space.

## Next-cycle deepening

- **Persistent per-onset constellations.** Instead of a shell that fades, let a
  strong onset *crystallise* a sparse, permanent cluster of stars at its
  spectral fingerprint — so a whole song slowly builds its own constellation map
  you can revisit.
- **Freeze-and-walk-into-the-cloud.** A "freeze" mode that stops the ring buffer
  and swaps the orbit camera for first-person flight, letting you physically fly
  *through* a captured few seconds of music as a frozen sculpture.
- **GPU compute deposition** (TSL / compute shader) to push `BINS × RINGS` an
  order of magnitude higher for a genuinely dense fog.
- **Real bloom post-pass** (UnrealBloomPass) instead of the per-point brightness
  approximation, for true volumetric glow.
