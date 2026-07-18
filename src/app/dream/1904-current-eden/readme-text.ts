// Plain-text design notes surfaced in the in-app modal. Kept in sync with
// README.md (which carries the fuller self-assessment).

export const README = `Current Eden — conduct a living ecology like a river.

THE MECHANIC
Three dye-tagged species (madder, saffron, indigo) live in a mass-conserving,
multi-kernel Flow-Lenia cellular automaton on the GPU. Each species convolves
its OWN ring kernel (radii 3 / 5 / 7 texels) so they behave like distinct
organisms. Mass is transported by reintegration tracking along a per-species
flow F = k·∇(growth) − p·∇(mass) + current. There is no birth term — nothing
adds mass from nothing — so species simply sit in their home wells and never
meet on their own.

YOUR PART
Drag (mouse or touch) to paint a velocity field into a separate current
texture. It is added to every species' transport flow and physically herds
them together. The current decays with a ~2.5s half-life, so you must keep
conducting. Where two dyes co-occur, an "encounter" is measured (a tiny 32×32
GPU readback every 4th frame).

THE SOUND
The most-massive species sets a home mode — Phrygian, Lydian or Dorian (no
pentatonic). An encounter pivots the mode and shifts the tonal centre; a strong
collision bites with Hijaz (double-harmonic) bells. Sustained single-species
dominance eases the centre home and thins the texture. Zero overlap = a lone
sustained drone: dead without a human.

The autopilot is a deterministic slow drift that only grazes the species — it
keeps the screen alive but the real chords are the ones you cause.

Warm daylight textile palette: madder-red / saffron / indigo dye combed along
the current on a linen ground. No strobe; brightness drifts slowly and is
clamped below pure white. Reduced-motion is honoured.`;
