# 2610 · Prosody + Formant

**What if a machine listened only to _how_ you speak and threw away _what_ you say — playing back and drawing only the melody, rhythm, intensity, and vowel-colour of your voice, never the words?**

A voice goes in; a wordless, humming human comes out. The machine keeps your
pitch contour, your rhythm, your loudness — and, crucially, your **vowel colour**
(the spectral envelope) — while discarding every trace of lexical content. The
result reads as breath, not buzz: it sounds like someone humming the melody of
the sentence you just said, with the sentence gone.

## How it works

**Analysis (`prosody.ts`), per frame:**

- **f0** — normalised **autocorrelation with parabolic interpolation** over a
  2048-sample time-domain frame, giving continuous, microtonal Hz (~70–400).
  Pitch is **never snapped to a scale** — the point is that it is allowed to be
  imperfect and human. A **clarity** value plus RMS gate voiced vs. unvoiced.
- **Spectral envelope** — the FFT magnitude spectrum (`getFloatFrequencyData`)
  is reduced to a coarse envelope: five log-spaced **band energies** plus rough
  **F1/F2** formant-peak estimates. This is what carries vowel colour (/a/ vs
  /i/ vs /u/) with no words attached.
- **Intensity** = RMS; **brightness** = spectral centroid.

**Resynthesis (`synth.ts`)** — the Fant **source-filter** model, all native
Web Audio nodes:

- **Source** — a glottal-ish buzz (a custom `PeriodicWave` with a 1/n harmonic
  falloff) oscillating at the tracked f0, glided with `setTargetAtTime` for
  natural portamento; plus a white-noise breath source for unvoiced frames.
- **Filter** — a parallel bank of `BiquadFilterNode` band-pass **formant
  resonators**. F1/F2 centre frequencies and per-band gains are set **live** from
  the analysed envelope, so vowel colour survives even though the word is gone.
  Voiced buzz and unvoiced breath excite the same bank, so consonants read as
  airy shapes rather than silent gaps.

**Visual (`ribbon.ts`, SVG only — no Canvas)** — a scrolling **prosody + formant
ribbon**: the f0 line is a spine whose **thickness = loudness**; beneath it the
spectral envelope is drawn as **stacked colour strata** along a
violet (`#a78bfa`) → magenta (`#e879f9`) ramp, so you literally see vowel colour
shift. Above, a **"WORDS · DISCARDED"** redaction stream dissolves as it scrolls,
over a **"PROSODY + COLOUR · KEPT"** ribbon, so the concept reads at a glance.
DOM node count is capped (~35: five strata paths, spine + centre line, ≤22
recycled redaction blocks, labels).

**Silent seeded auto-demo** — with no mic, `mulberry32(0x2610)` synthesises a
speech-prosody-plus-vowel contour (declination, stressed peaks, unvoiced gaps,
and a wandering F1/F2 tracing a plausible vowel sequence) that both **draws** the
ribbon and **sounds** the formant resynth on _Play demo_. Randomness comes only
from the seeded PRNG — no `Math.random`/`Date`.

## References

- **arXiv:2606.26083** — _"Real-Time Voice AI Hears but Does Not Listen"_ (June
  2026): shipping voice AI tracks lexical content and is largely deaf to prosody.
  This prototype inverts that finding — it keeps _only_ the prosody (plus vowel
  colour) and throws the words away.
- **Gunnar Fant, _Acoustic Theory of Speech Production_ (1960)** — the
  source-filter / formant theory the resynthesis is built on.
- **arXiv:2603.06079 "StreamVoiceAnon+"** — the mirror image: it keeps _how you
  feel_ and discards _who you are_. This keeps _how you speak_ + your vowel
  colour and discards _what you say_.

## What's unverified headless

There is no audio device or DOM in the build/lint/type environment, so the
following were reasoned about but not heard/seen here:

- Whether the formant resynth reads as a genuinely _wordless voice_ with
  distinguishable /a/–/i/–/u/ colour on real speech (formant estimates from a
  coarse FFT envelope are approximate; Q and gain balance were tuned by ear-model
  reasoning, not live listening).
- Exact loudness/limiter calibration across browsers and output devices.
- getUserMedia permission-prompt timing and AudioContext resume-on-gesture
  behaviour on specific browsers.

## Next steps

- Replace peak-picking F1/F2 with LPC-based formant tracking for cleaner vowel
  separation.
- Add jitter/shimmer modelling to the glottal source for a warmer, less
  synthetic buzz.
- A "colour space" mini-map showing the live F1/F2 point drifting through the
  vowel quadrilateral.
- Optional pitch-median normalisation so different speakers land in a comparable
  ribbon range.
