# Morning digest — last updated 2026-05-29 UTC (Cycle 235)

## New since yesterday

- **[/dream/202-membrane-drum](https://getresonance.vercel.app/dream/202-membrane-drum)** (Cycle 235 — adult build)
  — **Membrane Drum.** A circular drumhead simulated with the 2D wave equation (64×64 grid).
  Tap anywhere on the drum to excite a Gaussian displacement; the wave radiates outward,
  reflects off the fixed rim, and forms visible standing patterns (blue = compressed, amber =
  rarefied). Sound comes from 6 oscillators tuned to Bessel zero ratios — the inharmonic
  overtones of a real drum (1.00 × 1.59 × 2.14 × 2.30 × 2.92 × 3.60) — not from a preset.
  Off-centre strikes bring out the asymmetric modes; centre strikes emphasise the breathing
  mode. Tension slider → wave speed + fundamental (55–143 Hz). Damping → decay time.
  Centre-point waveform trace below the drum. Physics as music.

## In progress / partial

Nothing marked WIP.

## Research notes

- Last full research sweep was Cycle 213 — now 22 cycles ago. Overdue. Cycle 236 (kids) is
  fixed; Cycle 237 (adult) should be a full research sweep unless Karel flags a priority build.
- `param-layer` (IDEAS §2179) still queued — DEMON-inspired 4-ring hierarchical timbre synth.
  Could be Cycle 237 if research is deferred.

## Open questions for Karel

- Membrane Drum insight: off-centre strikes produce noticeably different timbres (stronger
  m=1 modes). Worth adding a strike-position guide overlay (faint concentric rings labelling
  mode zones)? Would make the physics more discoverable.
- Tension range: currently 55–143 Hz fundamental. Could extend to bass (20 Hz) for a
  felt rumble, but requires checking Safari AudioContext stability at very low freqs.
- `param-layer` is the sibling prototype to this (hierarchical synth control surface).
  Should it wait for Cycle 237, or does Karel want it sooner?
