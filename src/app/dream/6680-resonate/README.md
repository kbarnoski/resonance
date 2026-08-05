# 6680 · Resonate

**"What if you could knock on the world and hear what it's made of?"**

An embodied instrument. You tap or knock near your microphone; the transient is
detected and fires a single *strike*. That identical physical strike rings as
**diamond, quartz/glass, copper, wood, ice, or bone** depending on the material
you've selected — because each material is modelled as its own bank of resonant
modes. Switch material and the very next knock changes what the world is made of.

Route: `/dream/6680-resonate`

## How to play

1. Open the page. It is **already alive**: a seeded "ghost hammer" knocks the
   selected material on a loop, so you see the lattice ring immediately. Audio is
   silent until you interact (browser autoplay policy) — the visual rings anyway.
2. Press **Start · enable mic** (or spacebar / click) to unlock audio and ask for
   the microphone.
3. **Knock, tap, or clap near the mic.** Each transient is a strike; the harder
   the knock, the brighter and louder the ring.
4. Switch material with **number keys 1–6** or the on-screen chips. Switching
   mid-ring is audible on the next strike.
5. No mic? Denied? It stays fully playable: **spacebar** or **click the lattice**
   to strike, and the ghost hammer keeps playing. A `text-destructive` notice
   explains the fallback.

## The material-modal design (TECHNIQUE)

Modal synthesis: a struck body's sound is a sum of exponentially-decaying
sinusoids — its vibrational modes. What makes copper sound unlike wood is three
things, all encoded per material in `materials.ts`:

- **Mode-frequency ratios** — the set of partials relative to the fundamental.
  Stiff crystals (diamond, ice) use free–free *bar* ratios
  (1, 2.756, 5.404, 8.933, …); copper uses **church-bell** partials
  (hum / prime / tierce / quint / nominal); wood uses **tuned marimba-bar**
  ratios (1, 3.9, 7.8); glass/ice use glass-harmonica-like partials.
- **Inharmonicity** — a stiffness stretch `f_n = f0 · r_n · √(1 + B·n²)`, largest
  for diamond and ice.
- **Per-mode decay** — metals ring long and bright; wood and bone are short and
  damped; ice is a high glassy shimmer that cracks away. High modes always shed
  energy faster (frequency-dependent damping), and a short filtered-noise burst
  gives each knock its body.

Strike velocity (from the mic transient's height above baseline) sets the
excitation energy and, via each material's `brightness`, how much of that energy
goes into the upper modes — so a hard hit is brighter, not just louder.

- **Audio** (`synth.ts`): one sine oscillator + gain envelope per mode per
  strike, summed through a compressor.
- **Onset detection** (`onset.ts`): an `AnalyserNode` on the mic; per frame we
  compute RMS energy and spectral flux, fire when a fast envelope leaps above a
  slow-follow baseline, gated by an 85 ms refractory window so one tap = one
  strike.

## See = hear (OUTPUT — pure Canvas2D, zero GPU)

`render.ts` draws a **crystal lattice** (fcc / hex / cubic / amorphous per
material). Every audio mode is mapped to a 2-D standing-wave shape; each node's
displacement is the weighted sum of those shapes, weighted by the mode's **live
energy read straight from the synth's model**. So the lattice literally dances
the same envelope you hear, in each material's own geometry and violet hue. All
motion is smooth decay/drift — no strobe, nothing above ~3 Hz — and
`prefers-reduced-motion` damps the displacement hard.

## Reference (VIBE — scientific / "singing materials")

- **"Singing Materials: Initial experiments in applying sonification to phonon
  spectra"**, arXiv:2603.29037, presented at **ICAD 2026 (28–31 July 2026)** —
  the premise that a material's vibrational spectrum is its audible fingerprint.
- J.-M. Adrien, *The missing link: Modal synthesis* (1991).
- Fletcher & Rossing, *The Physics of Musical Instruments* (bar/plate/bell modes).

## Determinism & cleanup

- No `Math.random`, no `Date.now()`/`new Date()`. A mulberry32 PRNG seeded with
  `0x6680` drives the ghost-hammer timing/velocity and the noise-burst waveform;
  time comes from `performance.now()` and the `AudioContext` clock.
- On unmount: rAF cancelled, all oscillators stopped and disconnected,
  `AudioContext.close()` called, mic tracks stopped and source disconnected.

## Files

- `page.tsx` — client component: rAF loop, mic/keyboard/pointer input, chips, HUD.
- `materials.ts` — the six materials + `modeFreq` / `modeTau`.
- `synth.ts` — modal-synthesis engine + shared visual energy model + PRNG.
- `onset.ts` — mic capture + transient/spectral-flux onset detector.
- `render.ts` — Canvas2D lattice mode-shape renderer.

## Honest limitations

- The mode ratios are physically *motivated*, not measured from real phonon DFT
  data; they're tuned to be clearly distinguishable by ear, not spectroscopically
  exact.
- Onset detection is a simple energy/flux heuristic. In a loud or reverberant
  room it may double-trigger or miss soft taps; the refractory window and
  spectral-flux gate mitigate but don't eliminate this. AGC/echo-cancellation are
  disabled to preserve transients, which can raise the noise floor.
- Distinguishability by ear was tuned by design (fundamentals, decay lengths and
  ratio structure differ a lot between materials) but not verified in a live
  audio session in this build environment.
- One oscillator per mode per strike; very rapid machine-gun knocking creates
  many short-lived nodes. They self-clean on `onended`, but sustained abuse could
  briefly spike voice count.
