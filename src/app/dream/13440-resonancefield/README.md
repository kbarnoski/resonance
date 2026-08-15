# 13440 · Resonance Field — Sympathetic Resonance (WebGPU compute)

Karel's **real** piano recording plays, and its note-roll excites a physical model
of the **whole instrument**. The product is literally named *Resonance*; this
piece takes the name at its word and renders the thing ordinary note-visualizers
throw away: the **sympathetic afterglow**.

## The concept

Every piano string is a resonator. With the dampers lifted, a struck note sets
neighbouring strings ringing wherever they **share a partial** — the octave above
rings on your fundamental's 2nd partial, the twelfth on the 3rd, the fifth on the
3:2, and so on. This is **sympathetic string resonance**, and it is the physical
basis of the instrument's bloom and sustain. A visualizer that only lights the
key being pressed misses all of it.

Here the instrument is modelled as a **coupled-oscillator lattice**: one damped
resonator per key (MIDI 21–108, `f_i = 440 · 2^((midi−69)/12)`), plus a
precomputed coupling kernel. For every pair of strings we measure how close their
frequency ratio lands to a simple ratio (within ~24 cents) and assign a weight —
**octave, twelfth and fifth dominate**, with the double octave, fourth, major
tenth and major third contributing less. The kernel is mutual (sympathy runs both
ways) and stored as a flat top-K table per string so it uploads straight to the
GPU.

## The model (the math *is* the reading)

Per frame, for each resonator cell `i`:

```
e_i ← e_i · damp                       // slow multi-second sympathetic tail (τ≈3.2s)
e_i += inject_i                        // his onset this frame: velocity² (+ a soft
                                       //   sustain while the key is still held)
e_i += SPREAD · Σ_j w_ij · inject_j    // sympathetic bleed: pull a fraction of each
                                       //   harmonic PARTNER's fresh onset energy
```

The coupling deliberately reads the **onset** vector, not accumulated energy, so
each partner receives a single *selective* impulse and then rings down on its own
tail. That is what keeps the field honest: a struck C lights its octave / twelfth
/ fifth as vertical harmonic **ridges** that linger for seconds, while unrelated
strings stay dark — instead of an energy-diffusion model that would wash the whole
keyboard to a uniform glow. The brightness curve is `1 − e^(−2.1·e)`, mapped
through a warm-through-violet ramp on graphite.

The excitation is **his** real note-roll from `loadTrackAnalysis(id).notes`
(`midi / time / duration / velocity`), synced to the audio clock via
`ctx.currentTime − startedAt`. Structure comes from his playing, **not** an FFT.

## Why WebGPU compute suits it

The resonator-bank integration is **embarrassingly parallel**: every cell's update
is the same handful of reads (its previous state, its onset, its ≤12 coupling
partners) and one write. That is exactly the shape a compute shader is built for.
Each frame a WGSL `@compute` pass:

1. reads the previous state from one storage buffer,
2. applies decay + his onset + the sympathetic pull across the coupling table,
3. writes the new state to a second storage buffer (**ping-pong**, swapped every
   frame), and
4. writes the coloured energy straight into a **storage texture** column (a ring
   buffer — the render pass unwraps it so the newest column sits at the right
   edge, giving a scrolling time-bloom for free).

A second render pass samples that texture with a small neighbourhood gather for
the bloom glow. Pitch runs up the vertical axis; time scrolls horizontally.

## The CPU fallback (what a headless reviewer sees)

Many machines — and the headless review box — have no WebGPU. The piece detects
`navigator.gpu` and `requestAdapter()`; if either is missing it runs the
**identical** model on the CPU at lower resolution (220 scroll columns) into a
Canvas2D bloom: the same decay + onset + coupling step, written column-by-column
into an offscreen image that is scaled up with smoothing and an additive blurred
pass for the glow. A `text-muted-foreground` note marks the fallback path. On
first paint — before any click — a seeded muted demo clock already drives the
model from the note-roll (or a seeded synthetic roll for tracks with no published
analysis), so the field is blooming click-free when the reviewer arrives.

## Honest caveat

This is a **plausibility model** of coupled strings, not a measurement of Karel's
specific instrument. The coupling weights, cents tolerance and decay time are
tuned by ear, and real soundboard coupling depends on bridge impedance, string
inharmonicity and room — none of which we measure. Read the bloom as an expressive
lens on the harmonic relationships *inside his playing*, not as acoustics.

## Audio

Real catalog only, via the shared helpers: `REAL_TRACKS` for the selector,
`loadRealTrackBuffer(ctx, id)` → an `AudioBufferSourceNode` → `createSafeMaster`'s
`input` (never `ctx.destination` directly). No synth, no oscillators, no mic.

## Reference

CHI 2026, **"Visualising Pianists' Touch"** — reconstructing key-motion from audio
alone. It reads expressive piano gesture straight out of the sound, which is the
same spirit as the excitation-driven visualisation here: let the recording, not an
instrumented keyboard, drive the picture. See also the classical literature on
sympathetic string resonance and coupled-oscillator lattices for the physics the
model leans on.

## Next-cycle deepening

- **Inharmonicity + real partial spectra.** Give each string a stiffness-shifted
  partial series (`f_n = n·f₀·√(1+B·n²)`) and derive the coupling kernel from
  *actual* partial coincidences rather than idealised ratios — the ridges would
  bend the way a real piano's do.
- **Two-band decay.** Split each resonator into a fast struck-string component
  (damped hard on note-off) and a slow soundboard tail, so releasing a key visibly
  snuffs its fundamental while the sympathetic glow lingers.
- **Beating.** Model the slow amplitude beating between near-coincident partials
  as a shimmer on the ridges — the audible "life" of a real sustain.

## DEEP §1142 — folded from the two runners-up (multi-cycle commitment)

This shipped as the winner of a 3-renderer DEEP race on the same concept; the
best ideas from the two banked approaches (IDEAS §1142) fold in here as the
next cycles:

- **Cycle 2 — a "keyboard view" toggle (from `13424-sympathetics`).** The banked
  WebGL2 *string bank* is the most legible reading — 88 vertical filaments laid
  out as the literal keyboard, so you see *which* strings wake. Add a view toggle
  so this one piece offers both the abstract scrolling bloom (structure over time)
  and the literal instrument (structure over the keyboard), driven by the same
  compute state.
- **Cycle 3 — sympathy that travels in depth (from `13456-resonancehall`).** The
  banked three.js hall let you watch energy run *along a coupling edge into the
  distance* to a partner string. Fold that "energy-in-motion" cue into the bloom
  as a brief directional streak from a struck ridge to the partner ridge it wakes,
  so the transfer reads as motion, not just co-illumination.
- Plus the physics deepenings above (inharmonicity, two-band decay, beating), and
  the standing lever: a **real-device / sound-on pass** asking whether the model's
  afterglow matches what Karel hears his piano actually do.
