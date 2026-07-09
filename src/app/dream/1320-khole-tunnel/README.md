# 1320 · K-Hole Tunnel

_Part of the 3-sibling DEEP concept **"Unbinding."** This is the tunnel sibling._

## The one "what if"

What if a drug-free screen could evoke the ketamine k-hole / near-death
tunnel-to-light — and make you feel the dissociative **unbinding of the senses**,
where the sound you hear comes loose from the light you see?

## Design notes

### The desync engine (`desync.ts`)

The signature mechanic. A small ring buffer of `(time, value)` samples:

- Every render frame the page **pushes** the current visual pulse drive (0..1) —
  the ~3 Hz breath you SEE.
- The audio never reads that value directly. It calls **`readLagged()`**, which
  linearly interpolates the drive from `lagSeconds` ago — the throb you HEAR.
- `lagSeconds` is a slow sine (~0.05 Hz) wandering between **0.3 s and 1.2 s**, so
  the heard beat trails the seen flash by a continuously **drifting** offset.
- **`setDissociation(d)`** (0..1) widens the lag range and speeds the drift. At
  rest the offset is small and nearly steady; at depth it swings the full
  0.3→1.2 s and wobbles faster. The world un-binds MORE the deeper you go.

The engine is pure math (no React, no Web Audio) so either sense can read the
same clock — a literal enactment of sensory uncoupling.

### The ~3 Hz anchor (real rhythmic TIME)

The pulse rides its **own steady, undilated clock** at `PULSE_HZ = 2.7` (halved to
1.35 Hz under `prefers-reduced-motion`). When you hold, the *scene* clock dilates
toward `0.35×` (time distension) — but the pulse keeps ticking, so the piece is
never a beatless drone. `2.7 Hz` sits deliberately below the `3 Hz` full-field
luminance ceiling, and the visual breath is a shallow (~14%) continuous sine, not
a strobe.

### K-hole / NDE phenomenology

Disembodied forward drift down a faint tunnel of soft rings toward a distant warm
being of light; a **hypoxic vignette** constricting toward the centre as you
approach; a smooth **gamma clarity-swell** (`1 - exp(-x)` ceiling, ≤180 ms, no
flash) on sustained arrival; a gentle chromatic smear that grows with depth. The
reported shape of the ketamine k-hole and the near-death tunnel — enacted, not
illustrated.

### References

- **James Turrell** — Ganzfeld works: light treated as a physical object you
  inhabit rather than an image you look at. The filling warm core and the
  vignette-constricted field borrow that "light-as-object" pull.
- **Bera et al. 2026**, _"Cortical Mechanisms Contributing to Ketamine-Induced
  Dissociation"_ — dissociation as the **uncoupling of sensory input from
  awareness**, carried on a retrosplenial **~3 Hz** rhythm. The desync engine is a
  direct model of that uncoupling; the pulse rate is chosen to echo the rhythm.

## Controls

- **Begin** — gesture-gates the audio (browsers require a user gesture). The void
  is already alive and auto-drifting before you press it.
- **Hold anywhere** — you are drawn toward the light: time dilates, the vignette
  constricts, bloom warms, dissociation (and the desync) rises.
- **Release** — you fall back toward the dark; everything eases back.
- **Move the pointer** — steer the disembodied float (look direction).
- **Design notes** (bottom-right) — toggles this text as an in-page overlay.

## Audio

Master gain ≤ 0.26 with a `DynamicsCompressor` limiter and a 1.2 s fade-in. The
IDENTITY is the desynced rhythmic throb: a warm sub sine plus a filtered mid tone
whose amplitude and cutoff pulse on the **lagged** drive. A thin just-intonation
drone bed, a downward Shepard undertow (the plunge), and a code-generated cavern
reverb add depth without becoming the subject. Full teardown on unmount (cancel
rAF, stop oscillators, close `AudioContext`, remove listeners, delete GL program
and buffer).

## Next-cycle deepening

- Per-sense lag: let vision lead OR trail unpredictably, and occasionally invert,
  so the direction of unbinding itself becomes unstable.
- Haptic third channel (Vibration API) on its own lag tap — bind/unbind touch too.
- A "re-binding" release ritual: on let-go, briefly snap audio and visual back
  into lock for one beat before drifting apart again (the return-to-body).
- Breath-driven dissociation via mic envelope instead of hold, for a hands-free
  descent.
- Wire up the two Unbinding siblings so the desync offsets are shared/contrasted
  across the triptych.
