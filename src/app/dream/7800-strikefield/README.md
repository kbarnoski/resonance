# 7800 · strikefield

**The one question:** _What if you could HEAR where a sound is struck — the way
an impact's timbre depends on WHERE on the object it lands?_

A resonant rectangular plate, rendered as a live Chladni standing-wave field
(Canvas2D) and voiced by **acoustic-transfer modal synthesis** (Web Audio). An
autonomous rain of mallets strikes it at varying positions and forces, so it
plays itself the moment you open it. Drop an audio file and its onsets drive the
strikes instead — your music performs the plate.

## The concept

Real percussion timbre depends on strike position. Hit a plate at the centre and
you get one modal mix; hit it near the edge and you get another. Physically, a
strike excites each vibrational mode **in proportion to that mode's shape
amplitude at the contact point** — so if you strike a node of a mode, that mode
stays silent, and if you strike its antinode it rings loudly. Position → timbre.
That coupling is the whole piece, and it is made both audible (the ring changes
as the mallets wander) and visible (the Chladni nodal figure reshapes to show
which modes are alive).

## The math

**Mode shapes.** The plate is a rectangle `Lx × Ly` with simply-supported edges.
Its modes are indexed by `(m,n)` and have the separable standing-wave shape

```
φ_{m,n}(x,y) = sin(mπ x / Lx) · sin(nπ y / Ly)        (x,y normalized 0..1)
```

**Mode frequencies.** On the 2D mode grid (van den Doel & Pai 1998),

```
f(m,n) ∝ sqrt( (m/Lx)² + (n/Ly)² )
```

normalized so the `(1,1)` fundamental sits at 96 Hz. `Lx ≠ Ly` makes the modes
non-degenerate (a richer, slightly-beating spectrum), and a small stiffness term
stretches the upper modes sharp so the plate rings like warm metal rather than a
pure membrane. The bank is `5 × 4 = 20` modes.

**Acoustic transfer — the key mechanic.** A strike at contact point `(sx,sy)`
with force `F` adds energy to every mode `i`:

```
amp_i  +=  | φ_{m_i,n_i}(sx,sy) |  ·  radiativity_i  ·  F
```

Strike a mode's node → weight ≈ 0 → that mode barely sounds. Strike its antinode
→ weight ≈ 1 → it dominates. This analytic transfer is exactly the coupling
NeuroSonic (2026) learns as a neural acoustic-transfer field; here we compute it
in closed form.

**Resonators.** Each mode is a persistent `OscillatorNode` behind a `GainNode`.
A JS-integrated exponential envelope (`amp *= exp(-dt/τ)`, higher modes decaying
faster) drives each gain every frame, so polyphony is bounded to exactly 20
oscillators no matter how fast the mallets fall. Each strike also fires a short
band-passed noise burst — the mallet's contact transient — whose centre
frequency tracks the vertical strike position, an extra audible position cue.
Master chain: bank → gain → lowpass → compressor → out.

## Subsystems

1. **`modal.ts`** — mode-grid math, the acoustic-transfer weighting, and the
   `ModalEngine` oscillator-bank DSP.
2. **`plate.ts`** — Canvas2D reconstruction of the instantaneous displacement
   field `u(x,y,t) = Σ amp_i·cos(2πf_i t)·φ_i(x,y)`, painted as a warm violet
   heatmap with bright nodal (sand) contours and expanding strike blooms.
3. **`onset.ts`** — offline energy-flux onset detection on a dropped, decoded
   audio buffer; each onset's zero-crossing brightness → strike x, its attack
   strength → force.
4. **Autonomous mallet scheduler** (`page.tsx`) — a seeded `mulberry32(0x7800)`
   PRNG schedules strikes at pseudo-random positions/forces/intervals, so the
   plate is alive with zero input.

## Input & degradation

- **Primary / autonomous:** the mallet rain. No input required.
- **Audio-file drop:** the visitor's onsets play the plate; the rhythm and the
  brightness contour of their music sweep the contact point across the mode grid
  so the timbre morphs with the melody. A "Back to the mallet rain" control
  restores the autonomous driver. **No microphone.**
- **Secondary extra:** clicking the plate strikes it where you point.
- **Graceful degradation:** no file dropped → the rain keeps playing.
  AudioContext blocked until a gesture → the visual keeps ringing and a tasteful
  "Tap to begin" affordance appears. If audio or canvas truly fail, an error is
  shown in `text-destructive`. `prefers-reduced-motion` freezes the standing-wave
  phase and slows the mallet rain and blooms.

## Determinism

No `Math.random`, `Date.now`, or `new Date` anywhere — randomness comes from a
seeded `mulberry32` PRNG and all timing from `performance.now()` / the rAF
timestamp, so the lab's deterministic replay holds. Full teardown on unmount
(`cancelAnimationFrame`, `AudioContext.close()`, node disconnects, listener
removal).

## Demoable vs rough

**Demoable.** The concept reads immediately: mallets rain, the Chladni figure
reshapes per strike, and the timbre audibly shifts as the contact point moves
(most obvious when strikes wander between centre and edge, or when a dropped
file's bright and dark onsets land in different plate regions). Silent-screen
legible: blooms and mode patterns ripple before you touch anything, with a live
`strike x/y/force` readout.

**Rough edges.** The onset→position mapping is a musically-plausible heuristic,
not a transcription; the visual phase uses an independent clock rather than the
oscillators' true phase (a faithful representation, not a sample-accurate
mirror); and the stiffness/inharmonicity is a single hand-tuned constant rather
than a measured plate.

## References

- **NeuroSonic** — Zhao et al., "Instant Neural Impact Sound Synthesis with
  Learned Acoustic Transfer," _Computer Animation & Virtual Worlds_, July 2026.
- van den Doel & Pai, "The sounds of physical shapes," _Presence_, 1998.
