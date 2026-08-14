# 11776-lissaknot — Lissajous Knot

**Sing, and your own voice is drawn as living light.**

A genuine X-Y oscilloscope in the browser, played with your voice. This is the
oscillographic *drawn sound* tradition made into an instrument: the beam's
horizontal deflection oscillates at the drone-root rate, the vertical deflection
at the partial you sing, and the pair traces a **Lissajous figure**. Hold a clear
note and its pitch locks the figure into a stable, glowing knot; slur it or clip
it with a consonant and the figure scribbles and whips.

Route: `/dream/11776-lissaknot`

## Lineage / references

- **Jerobeam Fenderson — *Oscilloscope Music*.** The modern touchstone for
  vector-scope "drawn sound": two audio channels steer an X-Y beam so sound *is*
  the image.
- **macumbista *Vector Synthesis* toolkit** (Derek Holzer). Cathode-ray /
  vector-display synthesis practice — driving a beam directly rather than a
  raster.
- **Norman McLaren.** Hand-drawn optical soundtracks — image and sound as one
  gesture.
- **Ben Laposky — *Oscillons*.** Mid-century oscilloscope art; the original
  glowing Lissajous figures on a phosphor screen.
- **PESTO real-time pitch estimation** (arXiv:2508.01488) — the nod behind the
  in-browser pitch tracker; this prototype uses a much smaller YIN-lite estimator
  in the same real-time spirit.

## How the X-Y scope + pitch-lock works

1. **Pitch (`pitch.ts`).** `estimatePitch()` runs a YIN-lite
   cumulative-mean-normalized difference function (a normalized autocorrelation)
   over a 2048-sample time-domain window from the mic and returns `{freq,
   clarity}`. Clarity is high for a clean held tone, low for noise/consonants.
2. **Lock (`pitch.ts`).** `quantizeRatio()` folds the sung frequency over the
   drone root into `[0.5, 4]` and finds the nearest simple fraction (small
   numerator/denominator). When clarity **and** closeness are high the ratio
   *snaps* — the figure crystallizes into a clean integer-ratio knot. Otherwise
   the true detuned ratio is drawn, and the figure precesses.
3. **Beam path (`beam.ts`).** Builds the Lissajous samples: `x = sin(den·u)`,
   `y = sin(ky·u + phase)`, with a harmonic-enrichment term (driven by vocal
   brightness) that folds the plain ellipse into an ornate knot. A locked figure
   traces one clean closed loop; an unlocked one traces several precessing turns.
4. **Render (`gl.ts`).** WebGL2, `preserveDrawingBuffer`. Each frame: a dim
   indigo fade quad (phosphor decay) → additive glow **points** (halo) → an
   additive `gl.LINE_STRIP` (crisp beam core). A bright head sweeps the loop; a
   vocal onset briefly swells brightness and size (a whip, never a full-frame
   flash). Additive accumulation makes a held knot bloom to a steady glow.
5. **Sound (`audio.ts`).** A soft reference drone (root + fifth) always sounds so
   the scope has a signal, plus a resonator voice that glides to the locked pitch
   — it sings your held note back. Everything is routed through
   `createSafeMaster` + `createVoidReverb`, never `ctx.destination`. The mic tap
   is time-domain only and never connected to the output (no feedback).

## Muted-phone contract

With no mic and no audio, a seeded `DemoVoice` (`demo.ts`, `mulberry32`) sings a
slow held-note melody from mount, so a knot forms and morphs within ~1s. Nothing
uses `Math.random`, `Date.now`, or the wall clock — the demo is identical every
visit.

## Safety

No strobe. The persistent beam glows and decays smoothly; the onset whip is a
brief brightness swell, not a flash. `prefersReducedMotion()` slows the beam-head
sweep and the figure's drift and lengthens the phosphor persistence.

## Honest limits

- **Two mic taps.** The prototype opens the shared `useMicAnalyser`
  (onset/centroid) *and* its own time-domain analyser (pitch) on one gesture.
  That is two `getUserMedia` streams from the same device — a single permission
  prompt, but heavier than one stream.
- **Monophonic.** The pitch estimator tracks one fundamental. Chords, whistling
  overtones, and very noisy rooms confuse it; low clarity simply means the figure
  stays in its precessing (unlocked) state.
- **YIN-lite, not YIN.** The estimator is deliberately small for a phone
  browser: no full-buffer search, throttled to every other frame. Octave errors
  are possible on very breathy voices — they show up as a knot at double/half the
  expected lobe count.
- **The "second partial" is the drone root, not a tracked overtone.** The X axis
  is the fixed reference rate rather than an independently tracked second partial,
  which keeps the lock musically legible (you sing *intervals*) at the cost of
  literal two-partial tracking.
