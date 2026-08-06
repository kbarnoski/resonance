# 7640 — Replay

**The one question:** what if you could watch your own memory *dream itself back*
— author a short memory, then let a traveling wave sweep the field and re-fire
each remembered event as the wavefront crosses it?

`concept: REPLAY — a hallucination is a MEMORY replayed by a traveling wave`
`pole: cosmic-ambient (low dose) → accelerating NDE rush (high dose)`

## The research anchor

A Salk Institute review in *Neuron* (2026-07-21) argues neural **traveling
waves** are the visual cortex's computational engine — that they "replay
sequential temporal memories" across the cortical sheet. In parallel, 2026
psychedelic studies frame hallucination as **recalled memory replayed as vision**
— "partial dreaming." This piece makes the thesis literal: the memory is fixed;
a wave travels; the sequence re-fires on loop. You watch (and hear) a stored
memory being replayed by a wavefront.

## The mechanic (approach B — radial wave under an inverse log-polar warp)

This is **not** a continuous-field simulation (no Kuramoto, no
reaction–diffusion, no neural-field). The wave is an **analytic moving
phase-front**, and here it is **radial**: an expanding ring emanating from the
centre.

- **Author the memory.** Pointer-drag draws a path; it is resampled into a
  fixed, discrete list of timed events `{x, y, tNorm, degree}` (height → scale
  degree). Keys `A S D F G H J` also play and drop events (each keypress steps
  outward on a golden-angle spiral). A seeded default memory (deterministic
  mulberry32) lets **Start** demo instantly.
- **The wave travels in cortical space.** The whole field is drawn through the
  inverse **log-polar** warp (`_shared/psych/logpolar.ts` — the retina→V1 map is
  a complex log, so concentric rings ↔ cortical stripes). Each event's radius is
  turned into a cortical coordinate via `screenToCortex`. The wavefront advances
  at a constant rate in **log-radius**, so its screen radius (`exp(u)`)
  accelerates outward — an NDE **tunnel rush** toward the periphery.
- **Ignition.** When the front's log-radius passes an event's, that event
  **ignites**: a phosphor bloom + a note. Because a **ping-pong feedback buffer**
  redraws each frame slightly zoomed-out about the centre (constant
  multiplicative zoom = constant velocity in log-radius), every bloom smears
  down the tunnel wall as a colour-trail (LSD-tracer phenomenology). The fixed
  memory is drawn crisp on top (dots + gesture line) so you can see the wave
  cross it.
- **Dose / entropy** (default low, 0.20): raises the wave rate, deepens the
  feedback zoom and adds a twist (funnel → spiral), and spawns a 2nd/3rd
  expanding ring. Low = slow luminous tunnel drift; high = accelerating,
  fragmenting rush.

## Sound

Each ignition triggers a voice on a **just-intonation** 7-note modal scale
(`1, 9/8, 6/5, 4/3, 3/2, 8/5, 9/5` — anti-pentatonic, minor-leaning). Pitch =
degree; **register tracks radius**, so the outward rush climbs ~2 octaves and is
audible, not just visible. Underneath runs a **Shepard–Risset endless descent**
(`_shared/psych/shepard.ts`, `dir: -1`) — the tunnel plunge — and every voice
feeds a feedback delay for the tracer tail. All gains move via
`setTargetAtTime`; the AudioContext and rAF are fully torn down on unmount.

## Usage

1. **Start replay** — begins sound + the sweep; the default memory replays at
   once.
2. **Draw** a gesture anywhere and release to author a new memory (replaces the
   old). **Keys A–J** append/play notes.
3. **Dose** slider moves between the cosmic-ambient and intense-rush poles.

## Safety

No hard strobe. The only luminance modulation is a slow breathing drift routed
through `_shared/psych/safeFlicker.ts` at 0.15 Hz — far below the ≤3 Hz gate.
The tunnel motion is smooth zoom, never a flip.

## Honest limitations

- Canvas2D feedback smear reads as a tunnel but is coarser than a per-pixel
  shader warp; the log-polar texture is drawn as analytic rings, not a true
  per-fragment `exp()` field.
- Replay order is by **radius**, not authoring order, so a gesture whose time and
  radius disagree replays re-sequenced (this is intentional — the wave, not the
  clock, drives it — but it means the melody is not a literal playback of the
  drawn order).
- Many simultaneous ignitions (a stroke at constant radius) fire near-together
  and can crowd the voice count; there is no hard polyphony cap.
- Keyboard events accumulate; **Clear memory** resets them.
