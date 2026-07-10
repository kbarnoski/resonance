# 1398 · Ear of Static

**What / why open this.** Sweep a listening focus across a bed of pure filtered
noise and dwell — a hidden melody *resolves itself out of the hiss*, as if it had
been ringing there all along. This is auditory pareidolia made an instrument:
seven tuned resonances are genuinely running inside the static from the first
sound (gated to silence), so when you park your ear over one and it rings out,
the experience is not "I triggered a note" but "I *found* what was already there."
The visuals are a WebGL2 "spectral ear" ribbon — dim drifting hiss that sharpens
and brightens under your focus, with bright pitched ridges where a resonance
locks. It stages the "perception is controlled hallucination" thesis: the brain's
generative model, running loose over noise, finds structure.

## Named references

- **Musical-ear syndrome / auditory pareidolia** — hearing music or voices in
  unstructured sound; the phenomenological seed of the whole piece.
- **Alvin Lucier, *I Am Sitting in a Room* (1969)** — resonances latent in a
  space brought out by repeated filtering until the words dissolve into ringing
  tone. The bandpass "rings read the same noise" here is a nod to that.
- **Anil Seth, *Being You* (2021)** — perception as a controlled hallucination /
  the brain's best-guess generative model. Dwelling "confirms the prior" and the
  melody snaps into being.
- **Klaus Conrad, *Apophänie* (1958)** — the coining of apophenia: unmotivated
  seeing/hearing of connectedness. The generous alignment tolerance is the
  deliberate over-fitting that makes seeking reliably rewarded.

## How it works

- `resonances.ts` — a `mulberry32(seed)` PRNG (fixed `SEED`; no `Math.random` /
  `Date.now`) seeds ~7 resonances snapped to a 5-limit just-intonation grid,
  min-spacing-constrained across a normalized `[0,1]` frequency ribbon. Each gets
  a looping 3–5 note melodic contour expressed as **scale indices** into a shared
  just scale, so every fragment is always in-key.
- `audio.ts` — `EarAudio`: a deterministic looping noise buffer → wide bandpass →
  dynamic notch → hiss gain → master (peak ≤ 0.20, ramped from silence over
  ~2.2 s) → `DynamicsCompressor` limiter → destination. Each resonance has a
  bandpass **ring reading the same noise** (Q + gain climb with alignment) plus an
  **always-running, gain-gated melody oscillator** driven by a small look-ahead
  scheduler (timing for the melodic fragment only — not a step grid). As a
  resonance resolves, a soft notch thins the broadband noise **at that pitch**, so
  the melody emerges from a gap in the hiss. A shared low `startDroneBank` bed and
  `createVoidReverb` void sit underneath.
- `shader.ts` — WebGL2 full-screen triangle, GLSL ES 3.00. Dim animated hiss that
  sharpens/brightens under the focus; bright striated ridges where resonances
  resolve. Only global luminance motion is a **< 0.5 Hz** sine drift (SAFETY: no
  strobe). `prefers-reduced-motion` freezes the hiss animation and the drift.
- `page.tsx` — gesture-gated `AudioContext` (created on the Begin tap), pointer
  sweep + the `A S D F G H J K L ;` band-jump keys + arrow nudge + space-lock,
  dwell-charge, idle self-demo, and a WebGL2-absent SVG focus-meter fallback that
  still runs the audio.

## Design notes — mapping constants

- **Alignment tolerance** `ALIGN_TOLERANCE = 0.06` (ribbon units), a *wide*
  gaussian (`alignment()`), so a sweep meets a resonance's pull well before dead
  center — seeking is reliably rewarded (the apophenia point).
- **Dwell** `DWELL_MS = 350` with `DWELL_MOVE_TOL = 0.007` and `ALIGN_MIN = 0.22`:
  hold roughly still over a resonance for ~0.35 s and its fragment locks into a
  held consonant weave; `space` pins it. Sweeping away decays the charge.
- **Mix balance** (all under master ≤ 0.20): broadband hiss `HISS_BASE = 0.06`
  (thinned up to 40% and notched at the resolving pitch), per-resonance ring
  `RING_PEAK = 0.055` (rises with alignment²), melodic note `MELODY_PEAK = 0.07`
  (gated by alignment² × dwell). The ring gives the "it was always there" tone;
  the melody is what your ear finally *recognises*; the bed-thinning is what makes
  the emergence read as revelation rather than an added layer.
- **Idle self-demo**: after `IDLE_MS = 5000` untouched, the focus glides
  (`IDLE_EASE`) to a random resonance every ~5.5 s so a cold visitor immediately
  sees and hears the effect; the first real input takes over.

## Knocks (honest)

- **Mix balance wants a real screen and speakers to tune.** The ring-vs-melody-vs-
  bed-thinning balance was set by ear against the Web Audio graph in the abstract;
  on laptop speakers the sub-drone and the notch depth in particular may want
  adjusting. The three-way balance is the whole illusion, and it is the most
  fragile part.
- **The sub-mechanics have a distant lab-prior.** Filtered-noise beds, JI voices,
  bandpass "rings", and look-ahead schedulers are all well-trodden. The *fresh*
  axis here is the **interaction model**: an auditory-pareidolia instrument where
  a listening focus resolves latent resonances that were always running — the
  "found, not triggered" phenomenology — rather than any one synthesis trick.
- **The pareidolia framing is a claim, not a guarantee.** Whether a given listener
  experiences genuine "it was always there" pareidolia vs. "I moved a filter"
  depends on attention and expectation; the gated always-running voices and the
  generous tolerance are the levers that push toward the former.
