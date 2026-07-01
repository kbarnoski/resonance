# 1076 · Strange Canon

**What if a chaotic dynamical system were the composer?**

A single deterministic trajectory of René Thomas' cyclically-symmetric strange
attractor is treated as both the musical score and the visual. The line wanders
forever and never exactly repeats, so the piece is endlessly self-composing —
it sounds and moves fully autonomously with zero input.

`state: deterministic-chaos / geometric-organism · pole: intense (kinetic-geometric)`

## The René Thomas attractor (the score)

```
dx/dt = sin(y) − b·x
dy/dt = sin(z) − b·y
dz/dt = sin(x) − b·z
```

Integrated with classic **RK4** at a fixed `dt ≈ 0.02` (`attractor.ts`). The one
dissipation constant `b` is a **bifurcation parameter**: inside the band
`b ∈ [0.12, 0.21]` the flow is chaotic and space-filling; outside it collapses to
a limit cycle (large `b`) or drifts toward a fixed point (small `b`). We clamp
`b` to that safe chaotic band. A rolling ring buffer keeps a few thousand recent
`{x, y, z, t}` samples — that buffer IS the score.

## The signature — a delayed-reader canon

The four canon voices (`audio.ts`) read the **same** history buffer at staggered
simulated-time delays **0 / 1.5 / 3.0 / 4.5 s**, each transposed to a just
interval (`1 · 3/2 · 5/4·2 · 3/2·2`) over a root near 138 Hz. Because the
underlying line is deterministic yet aperiodic, this is a **strict canon over a
melody that never exactly repeats**.

Per voice, from its delayed read-head sample:

- `x → JI pitch` (quantised to a small just scale across ~3 octaves)
- `z → filter cutoff`
- `y → stereo pan`

A note fires on a **rising zero-crossing of `x`** (musical spacing, not one click
per frame), realised as a short 2-op FM pluck with an exponential envelope.
Polyphony is capped at ~8 with scheduled node cleanup. The voice mix routes
through the shared **void reverb → DynamicsCompressor → destination**, with the
shared **drone bank** as a quiet continuous bed driven by trajectory speed.

## Perturbation & bifurcation (the input)

Device-orientation **tilt** (`gamma`) — or, when tilt is unavailable/denied,
**pointer X** — nudges `b` within `[0.12, 0.21]`. This is a bifurcation nudge,
**not** drag-to-sculpt: pushing `b` toward `0.21` audibly tightens the chaos
toward periodicity. The live input source is shown on screen. Input is never
required; the attractor evolves, sounds, and moves on its own.

## The WebGL2 render

Raw **WebGL2** (no three.js, no Canvas2D as primary; `renderer.ts`). The history
buffer is projected through an auto-rotating perspective camera and drawn as an
additive `SRC_ALPHA → ONE` `gl.LINE_STRIP` coloured by **instantaneous speed**
(slow = cyan/violet, fast = gold), with point-sprite glow on the newest samples
and a soft blob marking each voice's read-head. Near-black background; luminance
drifts slowly (no strobe). If WebGL2 is unavailable, a Canvas2D ribbon of the
same projected trajectory renders instead (with a `text-rose-300` notice) while
audio keeps playing.

## References

- René Thomas, *"Deterministic chaos seen in terms of feedback circuits"* (Int. J.
  Bifurcation and Chaos, 1999).
- E. N. Lorenz, *"Deterministic Nonperiodic Flow"* (J. Atmos. Sci., 1963).
- R. Bidlack, *"Musical Attractors: A New Method for Audio Synthesis"* (Computer
  Music Journal).
- SYTHM / *"Sound, Given a Body"* (Symphoenix, Medium, Jun 2026) — the attractor
  as hidden conductor.

## Next-cycle deepening

- Per-voice independent `b` so the canon can bifurcate against itself.
- Poincaré-section triggering for sparser, more deliberate phrasing.
- GPU integration via transform feedback to push the history buffer to ~100k
  points.
- A second attractor (Aizawa / Halvorsen) as a cross-voice modulation source.
