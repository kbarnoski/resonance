# 5272-rebus · The Anarchic Field

## The one question

**What if you could watch reality dissolve into structured hallucination the
way the brain actually does it on psychedelics — top-down predictions flooding
down into the sensory field as the gating that normally holds them back
relaxes?**

## What it is

A drug-free, intense altered-states piece that literalizes the leading
neuroscience model of psychedelic hallucination — **REBUS** ("RElaxed Beliefs
Under pSychedelics", Carhart-Harris & Friston 2019) — as a live, two-layer
predictive-coding loop you can watch cross the threshold.

Everything is Canvas2D + Web Audio, self-contained, deterministic, and it
self-demos hands-free on load.

## The mechanism (predictive coding / REBUS)

Two layers live on one ~160×100 lattice (`field.ts`):

- **Sensory (bottom-up)** — the live mic FFT spectrum (`AnalyserNode
  .getByteFrequencyData`) painted into the field, plus seeded grain. Noisy,
  jittery, driven by your voice/room. If the mic is denied it falls back to a
  seeded synthetic spectrum so the piece still plays (with a `text-destructive`
  notice).
- **Prediction (top-down)** — a **Gray-Scott reaction-diffusion** field. Left
  alone it self-organizes: geometric spots near threshold, branching organic
  worms at the peak. This is the cortex's prior / hallucination generator, and
  the structure is genuinely emergent, not a fixed texture.

Each frame the prediction tries to explain the sensory input:

```
error       = sensory − prediction
prediction += rate · precision · error          // precision = gating g
display     = g · sensory + (1 − g) · prediction // precision-weighted blend
```

At **g ≈ 1 (sober)** the bottom-up error is trusted with high precision, so the
prediction is yanked back onto the sensory signal every frame — the display is
faithful and jittery. As the single **gating parameter `g` drops** along the
auto "dose" arc (`runArc` in `page.tsx`, also nudged lower by a louder voice),
that correction fades, the reaction-diffusion prior runs free, and **structured
imagery blooms out of what was noise.** Making that crossover visible and
beautiful is the whole point.

The arc runs sober → peak → return on a slow loop and can also be scrubbed by
hand; "Resume auto-arc" hands it back to the self-demo.

## Audio (`audio.ts`)

Real generative synthesis — no samples, no keyboard instrument. Four drone
voices + two shimmer-bell voices (six total) through a single
`DynamicsCompressor` limiter. Sober = thin, quiet, mildly dissonant, jittering
with sensory energy; as the field blooms the four voices glide onto a
just-intoned chord (1 : 5/4 : 3/2 : 2), a low-pass filter opens for brightness,
and shimmer-bells ring on strong emergent visual features. Audio starts on the
first gesture (**Begin**); the visuals paint from load.

## Determinism / safety

- All randomness is a hand-written `mulberry32(0x5272)` PRNG. No `Math.random`,
  no `Date.now` / `new Date`. Timing is `performance.now()`.
- On load, with no mic granted, the seeded synthetic sensory signal + the auto
  g-arc paint the whole sober→bloom→return story hands-free.
- **No strobing.** The only global brightness motion is a ~0.12 Hz luminance
  drift plus smooth crossfades — far below the 3 Hz photosensitive limit.

## Named references

- **Carhart-Harris & Friston (2019), "REBUS and the Anarchic Brain"**,
  _Pharmacological Reviews_ — the model this piece literalizes.
- **"Neural mechanisms of psychedelic visual imagery" (2024)**, _Molecular
  Psychiatry_ — psilocybin fMRI showing reduced top-down inhibition from
  visual-association regions down to early visual cortex (top-down flooding,
  measured).
- Karl Friston — free-energy principle / predictive coding (the substrate).

## Files

- `page.tsx` — `"use client"` component, UI, render loop, gating arc, mic +
  audio lifecycle, full teardown.
- `field.ts` — the two-layer predictive-coding sim (Gray-Scott prior + sensory
  layers + precision-weighted update) and the seeded PRNG.
- `render.ts` — Canvas2D `ImageData` renderer, sober→bloom palette crossfade,
  slow luminance drift, vignette.
- `audio.ts` — generative drone + shimmer-bell engine through a limiter.

## Honest notes — what needs Karel's real device / ears

- **Audio was not heard** (built headless). The synthesis graph, chord glide,
  filter sweep, and bell triggering are coded and type-check, but the actual
  timbre, the sober-dissonance vs. bloom-consonance contrast, and the master
  level (0.18) want a real listen and likely a small mix tune.
- **Mic path is unverified live.** The `getUserMedia` → `AnalyserNode` → sensory
  mapping is standard but hasn't run against a real microphone; how strongly a
  real voice should nudge `g` (currently `−voiceEnergy·0.45`) needs feel-tuning.
- **Reaction-diffusion regime.** `FEED=0.037 / KILL=0.06` gives a branching
  "mitosis" look; the exact geometric-then-organic progression and how fast it
  blooms as `g` drops is worth eyeballing on-device — a phone GPU/CPU check for
  the 160×100 grid at 60fps would confirm the performance target.
- **Perceptual crossover timing.** `ARC_PERIOD=32s` is a guess for a satisfying
  sober→peak→return; may want lengthening for a gallery loop.
