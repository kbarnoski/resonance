# 1930 — Harmonices II

**Cycle 2 of `1930-harmonices`, the tilt-played orrery.** A symplectic N-body
orrery under real softened gravity: tilt the phone (or move the pointer) to bias
the gravity field and pump two planets into a small-integer period ratio, which
CAPTURES into resonance and sounds the TRUE just-intonation dyad of exactly that
ratio — never a pentatonic fake. Hold still and everything circularizes to a
lone drone: dead without a human. Cycle 2 turns the instrument into something you
**compose** with.

## What cycle 2 adds

### 1. Chord crystallization (the headline)

In cycle 1 every resonance lock was transient — the interval sounded only while
the pair held the ratio. Now:

- **Hold a lock continuously for ~3.5 s and it CRYSTALLIZES.** Its exact just
  interval is deposited as a **persistent sustained sine dyad** into a growing
  **chord stack** that keeps sounding _after_ the two planets drift apart.
- Across a session you therefore **build a chord of pure ratios**, one capture at
  a time.
- The stack is capped at **3 dyads = ≤6 crystallized tones** (drop-oldest when
  full), so the oscillator count stays bounded. All crystals route through the
  existing master → lowpass → compressor safety chain.
- Each crystal **fades out over ~32 s unless renewed** — re-capturing the same
  interval refreshes its life. Walk away and the whole composed chord decays to
  the lone drone. This is a hard requirement: the piece must collapse with no one
  driving it.
- **Visualization:** each crystallized interval is engraved as a fine brass
  ratio-ring on the plate (with a bloom at the moment it "sets"), and appears in
  the HUD **harmonic ledger** with its interval name and a draining life-bar. The
  transient lock arc "ripens" (a brightening halo) as the hold nears 3.5 s, then
  blooms into the engraving.

**How the machinery fits together:** the render loop tracks each crystal's `life`
in seconds; every frame all lives decrement by `dt`, but any lock currently held
past the threshold resets its crystal's `life` to full. Per-frame the loop pushes
`life / MAX_LIFE` as the dyad's gain level (`setCrystalLevel`, ramped) and reaps
crystals whose life hits zero. The audio engine owns the oscillators keyed by
`"p:q"`; the page owns the life/visual state. No renewal means no held lock,
which means no tilt — so the decay is honest.

### 2. Conjunction bells

A bright, slightly inharmonic bell rings whenever two planets pass through
**conjunction** (their heliocentric angles align within a small tolerance), with
per-pair hysteresis so it fires once per pass, not every frame. The bell is
pitched to a just degree of the star's lattice (from the faster planet's period),
capped at 3 simultaneous bells, and draws a brief sight-line flash across the two
bodies. This gives regular sparkle even before a lock forms. Bells are gated off
once the piece is mostly calm, so they don't self-play a dead orrery.

### 3. Warped gravity-well field + Laplace-chain seed

- **Contour field:** faint equipotential rings of the star's well, rendered under
  the orbits, that visibly **lean in the tilt direction**. They are true
  equipotentials of `Φ = −μ/√(r²+ε²) + tilt·r` (Newton-solved per ray) — the same
  biased potential the integrator uses — so the tilt's effect on the field is
  legible. Canvas2D only; kept faint so it never fights the orbits.
- **Seed a resonant chain:** a button that snaps the five planets into a
  pre-locked TRAPPIST-1-style Laplace chain (successive 3:2 / 4:3 / 5:4
  neighbours) so a first-time visitor hears a rich consonant chord within ~2 s —
  then, if they don't tilt, it decays like everything else. Available both from
  the idle overlay ("Start with a resonant chain") and while playing.

## Physics recap

- **Integrator:** velocity-Verlet (symplectic) → no secular energy drift.
- **Softening:** `1/(r²+ε²)` gravity, so close passes never blow up.
- **Tilt:** a uniform acceleration added to every body's equation of motion.
- **Period read-out:** osculating Keplerian period from vis-viva
  (`a = −μ/2ε`, `T = 2π√(a³/μ)`).
- **Capture:** within tolerance of a small-integer ratio, a restoring nudge snaps
  the ratio exact and holds it (stylised mean-motion resonance, with hysteresis).
- **Death:** when still, a circularizing term drains eccentricity; voices and
  crystals fade to the drone.

## Determinism / safety

- No `Math.random`, `Date.now`, or argless `new Date()` anywhere. Paper grain
  uses the base LCG seeded `0x1930`; animation timing uses `performance.now()`.
- Master gain ≤ 0.17; every param change ramped (`setTargetAtTime` /
  `exponentialRampToValueAtTime`) — no zipper clicks. Full teardown of all
  oscillators (star, planets, pings, bells, crystals) + `ctx.close()` on
  stop/unmount.
- No external deps, no CDN, no network, no API route. Web Audio + Canvas2D only.
- Degrades: no motion sensor → pointer = tilt; Web Audio unavailable → runs
  silent with a `text-destructive` notice; `prefers-reduced-motion` → thin
  trails, no grain, static (unwarped) contours.

## References

- **Johannes Kepler, _Harmonices Mundi_ (1619)** — "the music of the spheres,"
  made playable with ratios from a live integrator.
- **The Antikythera mechanism / orrery tradition** — the engraved brass plate
  visual language, now carrying the crystallized chord engravings.
- **ESO's TOI-178 and TRAPPIST-1 sonifications** — cited as the _foil_: the
  pentatonic crutch this piece refuses. TRAPPIST-1's Laplace-chain architecture
  is borrowed for the seed preset.

## Self-assessment

**What works.** Crystallization is legible end-to-end: the lock arc ripens, blooms
as it etches a labelled brass ring onto the plate, and the interval joins the
harmonic ledger with a draining life-bar while its dyad keeps sounding after the
planets separate — you can clearly hear and see a chord being _built_. The decay
is honest: a crystal's ~32 s life is only refreshed by re-capturing, so with no
one tilting, locks break, no renewals occur, and the whole stack collapses to the
lone drone. The seed preset gives an immediate consonant chord for headless
review, and the warped well-field makes the tilt's effect on the gravity field
readable.

**What's rough.** The capture-assist remains a stylised restoring force rather than
an emergent mean-motion resonance from mutual gravity alone (too slow to feel in
seconds). The ≤3-dyad cap keeps composed chords lean — a deliberate safety trade
for a bounded oscillator count. Conjunction-bell density depends on live geometry,
so there are quiet stretches, and on a real phone the tilt scaling may want
per-device tuning.
