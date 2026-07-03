# 1130 · Spectral Scrub

**The one question:** _What if you could reach into Karel's real recorded piano
and physically scrub, freeze, and stretch it through time — turning his actual
Welcome Home tracks into a playable spectral instrument you sculpt with your
hands?_

You don't press play. You grab the recording and drag it through time. Drag
left/right to scrub and time-stretch (slow it to a crawl, freeze it into a held
shimmering chord, or run it backwards); drag up/down to sculpt the timbre. The
whole screen is a live spectral field you're painting in.

## What it is

A granular time-scrub / spectral-freeze instrument whose hero visual is a WebGL2
fragment-shader spectral field driven by the live audio.

- **Input — active drag-scrub.** The full-screen shader _is_ the instrument
  surface: horizontal drag = read position + time-stretch, vertical drag =
  spectral sculpt (filter cutoff). A precise waveform strip at the bottom gives
  fine scrub control. Nothing plays passively — you move it.
- **Output — WebGL2 fragment shader.** A full-screen GLSL shader samples a live
  scrolling spectrogram texture (fed each frame from an `AnalyserNode`) with
  domain-warped, flowing coordinates so the FFT reads as drifting pigment.
- **Core technique — granular time-scale modification + spectral freeze.**

## How the granular time-scrub works

The engine (`audio.ts`, `makeGranularEngine`) decodes the recording to an
`AudioBuffer`, then runs a look-ahead grain scheduler. Every ~28 ms it fires a
short (~110 ms) Hann-windowed grain from a moving read head `posSec`. Because
each grain plays at its **natural** sample rate, the _rate at which the read
head advances_ — not the grain playback rate — controls time:

- **Play** advances `posSec` at 1×.
- **Slow** advances it at ~0.28× → the piano stretches, pitch unchanged.
- **Freeze** holds `posSec` still (with a few ms of read-head jitter to kill the
  metallic loop) → the current instant blooms into a sustained shimmer you can
  hold indefinitely.
- **Reverse** advances `posSec` backwards → time runs backward, pitch intact.

While you drag, `posSec` is slaved directly to your finger, so grains
resynthesize continuously at whatever position you scrub to — the pitch-stable
"scrubbing a frozen sound" feel. This is the granular / overlap-add
approximation of **phase-vocoder time-scale modification** (Flanagan & Golden,
1966), which decoupled a signal's time axis from its pitch by resynthesizing
from short-time spectral frames — the same decoupling, done here in the time
domain with windowed grains for robustness and zero external deps.

Vertical drag maps to a biquad low-pass cutoff (exp 180 Hz → 15 kHz), so you
literally wipe brightness in and out of the sound; the shader mirrors that
cutoff as a glowing horizontal band.

## How the spectral shader works

`shader.ts` keeps a ring-buffer `R8` texture (`bins × HISTORY`). Each frame the
newest byte spectrum is written into one row via `texSubImage2D`; the fragment
shader samples it with `fract(uScroll - age)` so time scrolls smoothly, then
warps the sample coordinates with fbm value-noise and blooms across neighbouring
frequency bins. Magnitude drives a deep-ocean → teal → electric-cyan → violet →
white-hot ramp on near-black. A playhead caustic and the sculpt-cutoff band
react to the live level. This is **Refik Anadol's "data as pigment"** spectral
aesthetic — the FFT rendered as a living, flowing field rather than a chart.

## The audio source (three tiers, all self-contained)

1. **Path recording by id** — paste a recording id →
   `GET /api/audio/:id` → `{ url }` → `decodeAudioData`. Real Welcome Home
   piano. (Read-only call to the existing prod route; no route created here.)
   If the cross-origin url can't be decoded (CORS/codec), it falls back to an
   `<audio crossOrigin>` + `MediaElementSource`: scrub still works via
   `currentTime`; granular freeze is unavailable and the UI says so.
2. **Drop / choose your own audio file** — `decodeAudioData` on the file.
3. **Synth demo** — a short offline-rendered detuned-triangle piano phrase so
   the field is never blank/silent. Clearly labelled as a placeholder.

## Graceful degradation & teardown

- No WebGL2 → `text-rose-300` notice + a Canvas2D scrolling spectrogram.
- No Web Audio → `text-rose-300` notice.
- On unmount: cancel rAF, stop all grain nodes, disconnect the graph, remove the
  fallback `<audio>` element, close the `AudioContext`, and `loseContext()` the
  GL context. No audio survives navigation.

## What I'd deepen next cycle

- A true phase-vocoder STFT path (analysis/synthesis FFT with phase-locking) for
  cleaner extreme stretches than granular gives.
- Two-handed multitouch: one finger freezes a spectral region while the other
  scrubs — smearing chords across the field.
- Paint-to-EQ: sculpt individual frequency bands directly on the shader instead
  of a single cutoff, making the "spectral field you sculpt" literal.
- Persist frozen grains as a re-triggerable chord bank.

## References

- J. L. Flanagan & R. M. Golden, "Phase Vocoder," _Bell System Technical
  Journal_, 1966 — time-scale modification by decoupling time from pitch.
- Refik Anadol — "data as pigment" spectral-field / latent-space aesthetic.
