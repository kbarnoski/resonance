# 1380 · Overtone Throat

**The question:** What if singing a single sustained note let you _play_ its
hidden overtone ladder — like a Tuvan throat singer — by shaping your timbre?

You hum or sing one steady drone note. The piece listens not to _how loud_ you
are but to _the shape of your timbre_ — the relative strength of each harmonic
in your voice — and turns those overtones into an instrument. A 12-partial drone
bank sustains and amplifies whichever partials you lean toward, so shaping a
vowel "walks a bright cursor up the harmonic ladder" and blooms a shimmering
chord that holds even after your voice softens. This is the amplified-overtone
trance of Tuvan _khoomei_, made playable.

## How it works

### f0 — the fundamental you hold

The bank is tuned to one **fundamental (f0)** at a time. You set it two ways:

- **Note picker** (`− / +`) locks f0 to an equal-tempered note (A1…A3). Because
  the drone bank stays fixed while you move overtones on top of it, locking is
  the musically honest model of throat singing (steady drone, moving overtone).
- **◎ detect pitch** samples the live mic buffer and runs an **autocorrelation**
  pitch detector (`detectF0` in `analysis.ts` — normalized-difference ACF with
  parabolic-interpolated peak) to snap f0 to the note you're actually singing.

### Per-harmonic extraction (not just level)

With the mic attached as an analyser-only sink (`fftSize = 4096`, ~10.7 Hz/bin),
each frame `audio.ts#update` reads the FFT magnitude spectrum and, for each
harmonic `h = 1…12`, measures the peak energy in a narrow window around
`f0·h` (± ~a third of f0, so partials don't leak into their neighbours). The
dB peak maps to a 0..1 **emphasis vector** — "which overtones am I emphasizing".
This is genuine harmonic analysis relative to f0, not a fixed frequency-band
meter, which is why the shared `use-mic-analyser` (fixed `BAND_RANGES_HZ`) is
_not_ reused here — the piece needs its own f0-relative AnalyserNode tap.

### The drone bank (self-played sustain)

12 sine partials at `f0·1 … f0·12`. Each partial's gain = a quiet **bed** (rolled
off toward the top so the bank is warm) **plus a boost** from a per-partial
**sustain follower**: fast attack (~80 ms) so an emphasized overtone blooms
instantly, slow release (~1.6 s) so it _holds and decays_ after you soften — the
ladder sustains into a chord that follows your timbre. Master runs through a
gentle limiter at gain ≤ 0.18, ramps from 0 on Begin, and fades over 1.5 s
before `ctx.close()` on Stop. The raw mic is **never** routed to the output
(analyser sink only), so the loop is feedback-safe.

### The glyph ladder (visual)

The surface is a **glyph-terminal**: 12 monospace rows, harmonic 12 at top down
to the fundamental at bottom. Each row is a right-to-left scrolling
oscilloscope trace of that overtone's energy, drawn through the density ramp
`` ·:+*#█ ``. Rows are labelled with harmonic number, ratio (2:1 octave, 3:2
fifth, 5:4 third, 7:4 harmonic seventh …) and interval. A **► emerald cursor**
marks the currently-dominant overtone (fundamental excluded, so the cursor lives
_up_ the ladder). Reduced-motion slows the scroll and lengthens the release.

### Time = drift, not a grid

There is no beat scheduler or step sequencer. Musical time is the slow rise and
fall of the overtone ladder — your shaping, or the auto sweep.

### Graceful fallback

If the mic is denied or silent, an **auto sweep** (a Gaussian bump slowly walking
up and down the ladder) drives the same follower, so the piece keeps singing and
animating. A badge reads `● mic` (emerald) when your voice is driving it and
`○ auto` (amber) otherwise. Before Begin, an idle sweep keeps the terminal alive.

## Reference

- **Tanya Tagaq** — living Inuit throat singer whose amplified-overtone practice
  models the "voice as a bank of playable partials" idea.
- **Wolfgang Saus** — overtone-singing pedagogy; the vowel/formant-shaping
  approach to selecting and reinforcing a single harmonic.

## Lineage

This is **cycle-2 of `1270-glyph-organ`** — reusing the idea of a monospace
glyph-terminal as an instrument surface, here re-purposed from an excitable
keyboard field into a harmonic-ladder oscilloscope you sing.

## Honest gaps

- **Pitch detection is the soft spot.** Autocorrelation on a hum is decent but
  wanders on breathy/quiet input, octave-jumps, or noisy rooms — hence detect is
  on-demand and f0 can be locked by hand rather than continuously tracked.
- Harmonic windows assume a roughly harmonic voice; strongly inharmonic or
  polyphonic input smears across bins.
- The emphasized-overtone "cursor" reflects real spectral emphasis, but consumer
  mics + browser DSP mean the effect is clearest with headphones and a close,
  sustained vowel rather than a casual hum.
