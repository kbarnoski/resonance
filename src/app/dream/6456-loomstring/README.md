# 6456 · Loomstring

**Route:** `/dream/6456-loomstring`

> What if you could *play* a woven net of strings — a cat's-cradle loom of vector
> lines where poking one intersection sends ripples racing along **both** axes,
> and every crossing rings a note?

A 2-D lattice of SVG strings — eight horizontal crossing eight vertical — hangs in
the dark like a spider's web on a loom. Poke or drag any crossing with pointer /
touch: a transverse pulse is injected into both strings at that point, waves
propagate outward along the coupled mesh, and wherever a wavefront reaches a
crossing peg it rings a plucked note. The polyline you watch bend **is** the wave
state that produces the sound.

## How it works

- **Visuals = the physics.** Each string is a discretised 1-D wave equation: `N =
  49` transverse-displacement samples with fixed ends, integrated with a
  leapfrog-style velocity scheme (`v += C²·∇²u; u += v`), globally damped. The
  `<polyline>` vertices *are* those samples — nothing is faked for the eye.
- **Coupled mesh.** The eight horizontal and eight vertical strings share every
  crossing, where they exchange transverse **momentum** each step. That coupling
  is what makes a poke on one string spill into the perpendicular one, so a single
  ripple races along both axes — a small, honest 2-D digital-waveguide mesh.
- **The pegs ring.** When a crossing's summed displacement crosses a threshold
  (with hysteresis + per-node cooldown), it fires a hand-built **Karplus–Strong**
  plucked voice: a delay-line buffer with a lowpass feedback loop, pre-rendered
  once per octave and pitch-shifted by `playbackRate`. No samples, no libraries.
- **Position is the score.** Row → just-intonation pitch class (just major scale),
  column → octave. Top-right rings brightest, bottom-left deepest.
- **Audio safety.** A code-built convolution reverb (seeded-noise impulse) plus a
  `DynamicsCompressor` limiter; master gain `0.16`; a 22-voice cap and per-node
  cooldown so a heavy strum stays bounded and never clips. Displacement is
  hard-clamped, and coupling only *redistributes* momentum (never adds energy), so
  the mesh cannot blow up.
- **Alive on load.** A slow seeded ripple crosses the web every ~2 s (silent until
  the first gesture unlocks audio), and yields instantly the moment you touch it.

## Constraints honoured

- **Pure SVG, zero GPU** — no three.js / WebGL / WebGPU / `<canvas>`. Every string
  is a `<polyline>`; the RAF loop writes `points` straight to the DOM (16 crisp +
  16 blurred glow lines + 64 pegs), so React renders the structure once.
- **Pointer Events** (`pointerdown/move/up/cancel`, `setPointerCapture`) — mouse
  and touch. It's a *played* instrument with a quiet attract mode, not an arc.
- **Determinism** — all randomness runs through `mulberry32` seeded `0x6456`. No
  `Math.random`, no `Date.now`/`new Date`; timing is `performance.now` + RAF.
- **Graceful degradation** — audio resumes on first gesture; a "tap to play" hint
  shows until then; errors surface as a `text-destructive` notice (never a white
  screen); `prefers-reduced-motion` dampens amplitude and injection strength.
- **Full teardown** — RAF cancelled, listeners removed, audio nodes disconnected,
  `AudioContext.close()` on unmount.

## References

- Karplus & Strong, *Digital Synthesis of Plucked-String and Drum Timbres*
  (Computer Music Journal, 1983) — the plucked-string voice.
- Van Duyne & Smith, *The 2-D Digital Waveguide Mesh* (ICMC, 1993) — the coupled
  crossing-mesh technique.
- *Four Decades of Digital Waveguides* (arXiv:2604.12878, 2026) — the waveguide
  lineage.
- Toshio Iwai, *TENORI-ON* — the played-grid / instrument-as-lattice spirit.

## Honest rough edges

- The crossing coupling is **momentum exchange**, not a rigorous shared-junction
  waveguide scattering junction — it reads and sounds like a coupled mesh and is
  unconditionally stable, but a purist would derive the junction admittances.
- Because octave buffers are pitch-shifted by `playbackRate`, higher notes are
  slightly shorter and brighter than a per-note Karplus–Strong render would be.
- Ring detection is displacement-threshold + hysteresis, so a very gentle wave can
  glide past a peg without firing; the threshold is tuned for a lively-but-not-
  spammy strum, which is a deliberate trade.
- Pokes snap to the nearest crossing rather than the exact point on a string —
  crossings are the musical grid, so this keeps the instrument legible.
