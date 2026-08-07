# 7784 · Huygens

The dream lab's first **Wave Field Synthesis / Huygens-construction** piece —
drawn as legible vector geometry rather than a sampled pixel field.

## What it is

A wall of forty point sources sits along the top edge. Each throws an expanding
circular **secondary wavelet**. A single steerable **virtual source** sets every
emitter's emission delay, and the sound's reconstructed wavefront emerges as the
common **tangent envelope** of all those wavelets — the bright violet curve you
watch sweep through the room. Steer the virtual source and the envelope morphs
from a flat plane wave, through a converging arc, into a focused bloom.

## The physics, in plain terms

Huygens' principle (1690): every point on a wavefront is itself a source of a
spherical (here circular) secondary wavelet, and the wavefront an instant later
is the **common tangent envelope** of all of them. Fresnel added the phase
bookkeeping that makes the envelope the place where the wavelets add up *in
phase*.

Give each emitter `P_n` a delay `τ_n = |S − P_n| / c` set by its distance to a
virtual source `S`. At time `t` an emitter has been emitting for `t − τ_n`, so
its active wavelets are circles of radius `r = c·(t − τ_n − jT)` for the most
recent wavefront periods `j`. The envelope of those circles is — exactly — a
circle centred on `S`:

- **Source far behind the array** (delays `τ_n = (|S−P_n| − d_min)/c`): the
  envelope is a circle of radius `c·t + d_min` centred on `S`. When `S` is very
  far away that arc is locally flat — a **plane wave** sweeping straight down.
- **Source pulled into the room** with time-reversed timing
  (`τ_n = (d_max − |S−P_n|)/c`, nearest emitter fires *last*): the envelope is a
  circle of radius `d_max − c·t` that **shrinks and collapses onto `S`** — a
  converging wave that pops into a **focus** each period, where every wavelet
  meets in phase.

Because the drawn wavelets and the drawn envelope come from the *same* timing
math, you literally see the envelope kiss each individual wavelet.

This is Berkhout's holophonic idea (JAES 1988): control the wavefront by
controlling a line array's per-element timing — the basis of Wave Field
Synthesis.

## Controls

- **Tilt** (phone): front/back tilt walks the virtual source from far behind the
  array (plane wave) into the room and onto the listener (focus); left/right
  tilt slides it across. iOS asks for motion permission after **Begin**.
- **No sensor / permission denied / desktop:** a seeded deterministic drift
  (mulberry32, seed `0x7784`) walks the source through every regime so the page
  self-demos with zero input. `prefers-reduced-motion` slows the drift.
- **Read the design notes** opens an in-page explainer.

## Audio

Over a just-intonation drone bed (55 Hz root + fifth + octave, lowpassed, with a
~0.06 Hz swell LFO), a "virtual source" tone is placed binaurally: a small
per-ear **ITD** (DelayNode difference) and **ILD** (GainNode difference) derived
from the source's angle to a listener near bottom-centre, merged to stereo. Each
launched wavefront rings the tone softly; when the source focuses onto the
listener the tone swells louder and more present. Audio starts only after the
Begin gesture; if Web Audio is unavailable the construction runs silently with a
`text-destructive` note.

## Honest limitations

- The envelope is drawn **analytically** from the virtual-source geometry and
  laid over the individually simulated wavelets — it is not solved numerically
  from the wavelet field. (The two agree because they share the timing model.)
- This is a **2D didactic evocation**, not a full 2.5D WFS field solve: no
  amplitude tapering, no secondary-source directivity, no room reflections.
- Binaural placement is a coarse ITD/ILD approximation, not an HRTF convolution.

## References

- C. Huygens, *Traité de la Lumière* (1690) — the secondary-wavelet envelope.
- A.-J. Fresnel — phase/interference completing the Huygens–Fresnel principle.
- A. J. Berkhout, "A holographic approach to acoustic control," *JAES* 36 (1988)
  — wavefront synthesis from array timing.
- J. Ahrens, *Analytic Methods of Sound Field Synthesis* (Springer, 2012).
- *Communications Physics* (Nature, 2025), "active time-reversal metasurface
  turns walls into sound routers" — fresh grounding for steerable, focusing
  wavefront control.
