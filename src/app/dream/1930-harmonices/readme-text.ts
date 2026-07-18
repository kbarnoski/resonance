export const README = `# 1930 — harmonices

**What if orbital resonance were an instrument you play by TILTING your phone —
and the music were the REAL just intonation the orbits give you, never a
pentatonic fake?**

A brass-on-parchment orrery: a central star and five planets orbiting under real
softened gravity, integrated by a symplectic velocity-Verlet leapfrog. You tilt
the device (or move the pointer on a laptop) to add a gentle directional
acceleration — a bias to the whole gravity field — and use it to pump and steer
orbital energy. When two planets drift into a small-integer period ratio they
**capture into resonance**, and a just-intonation dyad of exactly that ratio
sounds and sustains. Hold still and the orbits circularize toward a lone drone:
the piece is dead without a human actively tilting it.

## How to play

1. Press **Tilt to play**. On a phone this asks for motion-sensor permission
   (iOS requires the tap). On a laptop, if no sensor speaks up within a second,
   it falls back to **pointer = tilt** — move your mouse from the centre and the
   gravity field leans that way. The active mode is shown in the readout.
2. Watch the period-ratio meters. Nudge a neighbouring pair until its ratio
   crosses 3:2, 2:1, 4:3, 5:3, 5:4… A **deep-red lock arc** snaps between the
   two planets and their two voices jump to the exact just interval.
3. Tilt away to break the lock; the interval dissolves. Stop moving and the
   whole orrery decays toward the star's lone drone.

## The physics

- **Integrator.** Velocity-Verlet (leapfrog) — symplectic, so orbital energy
  doesn't drift over long runs. Gravity is softened (\`1/(r²+ε²)\`) so a close
  pass never blows up to infinity.
- **Tilt.** A uniform acceleration added to every body's equation of motion — a
  literal bias of the gravity field, exactly as a tilted table biases a marble.
- **Period read-out.** Each frame we take every planet's osculating Keplerian
  period from its vis-viva energy (\`a = -μ/2ε\`, \`T = 2π√(a³/μ)\`). That is the
  instantaneous "note length" of the orbit.
- **Capture.** When a pair's period ratio comes within tolerance of a small
  integer fraction, a restoring nudge snaps the ratio to the exact value and
  holds it — a stylised mean-motion resonance, which in nature really does
  librate and trap orbits at integer ratios (this is why the Galilean moons and
  TRAPPIST-1 sit locked). Hysteresis keeps a lock from chattering.
- **Cage & death.** A hard semi-major-axis cage and an eccentricity clamp keep
  the system bounded and on the plate. When you stop tilting, a circularizing
  term drains the orbital eccentricity that resonance libration feeds on, and
  every voice glides to the drone.

## The harmony — just intonation, not pentatonic

Orbital resonance is *already* just intonation. A 3:2 period ratio is a pure
fifth; 2:1 is an octave; 5:4 a pure major third; 5:3 a just major sixth. So this
piece voices the true ratios: the star sounds a low drone at the root, each
planet is a voice that glides with its period, and a captured pair locks its two
voices to the **exact integer frequency ratio** of its resonance — the deeper
planet snapped to a just degree of the star's lattice, the other set precisely
p/q above it. Nothing is rounded to a scale.

This is the whole point. The celebrated ESO sonifications of resonant systems —
**TOI-178** and **TRAPPIST-1** — both de-risk the mapping down to a *pentatonic*
scale, a pretty crutch that discards the very physics being celebrated. Here the
resonance and the interval are the same number.

## References

- **Johannes Kepler, _Harmonices Mundi_ (1619)** — "the music of the spheres";
  Kepler literally sought musical ratios in planetary motion. This is that idea
  made playable, with the ratios coming from a live integrator rather than his
  eccentricity extremes.
- **The Antikythera mechanism / orrery tradition** — a geared brass model of the
  heavens; the visual language (engraved plate, ticks, brass bodies) is borrowed
  from it.
- **ESO's TOI-178 and TRAPPIST-1 sonifications** — cited here as the *foil*: the
  pentatonic crutch this piece refuses.

## Self-assessment

**Ambition:** high — a real symplectic N-body engine, an osculating-period
resonance detector with capture/hysteresis, and a genuine just-intonation voice
engine, all driven by device tilt with a pointer fallback, in one self-contained
folder.

**What works:** the integrator is stable and bounded under adversarial tilt; the
capture moment is legible — you see the red arc snap and hear the exact interval
appear at the same instant; the calm-death drone honours the "dead without a
human" brief; the JI mapping is honestly derived from the period ratios.

**What's rough:** the capture-assist is a stylised restoring force, not an
emergent mean-motion resonance from the mutual gravity alone (which is too slow
to feel in seconds), so the lock is helped into place — the README is honest
about that. Recovery from a long constant overdrive is slow, and on a real phone
the tilt scaling may want per-device tuning.
`;
