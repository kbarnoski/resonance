# 1930 — Harmonices III

**Cycle 3 of `1930-harmonices`, the tilt-played orrery — the lab's first
three-cycle commitment.** A symplectic N-body orrery under real softened gravity:
tilt the phone (or move the pointer) to bias the gravity field and pump two
planets into a small-integer period ratio, which CAPTURES into resonance and
sounds the TRUE just-intonation dyad of exactly that ratio — never a pentatonic
fake. Hold still and everything circularizes to a lone drone: dead without a
human. Cycle 2 made the instrument something you **compose** with (crystallized
chords). Cycle 3 makes it something you **tune** — it exposes the 300-year-old
comma that pure intonation can never escape, as a live, playable toggle.

## What cycle 3 adds — the comma pump, made playable (the headline)

A just-intonation lattice does not close. Build a chord by chaining PURE intervals
from a moving pivot — which is exactly what capturing one resonance after another
does — and the chord's tonal centre slowly walks off the star's fixed pitch. Two
pure major thirds stacked make 25/16 (~773¢), ~41¢ shy of the lattice's minor
sixth; a I–vi–ii–V–I in strict JI sinks a whole syntonic comma (81/80 ≈ 21.5¢)
per turn. This is the tension Kepler's ratios could never resolve, and it is
normally hidden inside a keyboard's equal temperament. Here it is a switch:

- **STRICT (honest physics).** Every crystallized capture keeps its exact pure
  ratio. The chord is locally pure — but its centre **drifts against the star
  drone (fixed at ROOT), and you hear the beating grow.** The `drift +N¢` readout
  and the needle on the drift meter climb off centre. This is what pure intonation
  actually does; nobody usually lets you hear it.
- **ADAPTIVE (spread the comma).** A real-time relaxation nudges every sounding
  voice a fraction of a comma so the centre **locks back to the star** — the
  beating dies, `drift → ~0¢`, the needle re-centres. The price is reported
  honestly as `retuned ±N¢`: the accumulated comma, spread across the voices
  rather than left to drift. It is the browser analogue of the linear-least-
  squares scheme in Stange & Wick's _Playing Music in Just Intonation_
  (arXiv:1706.04338) and Nemire's _Pivotuner_ (arXiv:2306.03873).

Flip the toggle live and the whole crystallized chord **glides** in or out of lock
(each voice ramps over ~0.2 s). Strict → adaptive: the sour, drifting chord slides
into tune against the drone. Adaptive → strict: it drifts free again. That glide,
against a fixed reference you can hear beat, is a 300-year-old theory problem made
audible and performable in real time — harmony that bites.

**Where to hear it:** capture **thirds** (5:4). Stacking two 5:4 crystals lands
the chord ~14¢ off centre — the drift is obvious. Fifths and octaves (3:2, 2:1)
sit on the lattice and barely drift, which is itself the lesson: some chains close,
some don't. The tuning subsystem lives in its own `tuning.ts` (lattice math,
pure-chain placement, the relaxation solver, and the drift/temper metrics),
numerically de-risked with a standalone harness before shipping (strict holds a
−13.7¢ drift at 0¢ retune; adaptive locks to ~0¢ drift at 41¢ retune; reversible).

## Cycle 2 recap (still here — the compositional substrate cycle 3 tunes)

### 1. Chord crystallization

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
- **Simon Stange & Christoph Wick, _Playing Music in Just Intonation: A
  Dynamically Adapting Tuning Scheme_ (arXiv:1706.04338)** — the live linear-
  least-squares retuner cycle 3's adaptive mode implements in miniature.
- **Nathan Nemire, _Pivotuner_ (arXiv:2306.03873)** — automatic real-time pure
  intonation with a moving pivot; the named reference the concept jury pointed to
  for this cycle-3 extend.

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

The cycle-3 tuning toggle is numerically verified but **not yet ear-verified** in
this headless container: whether the drift beats audibly against the drone before
adaptive locks it, whether the ~0.2 s glide reads as "sliding into tune" and not
as a pitch bend, and whether the drift meter needle tracks what you hear all want
Karel's phone + speakers. The math is proven; the _feel_ is the open question.

**What's rough.** The capture-assist remains a stylised restoring force rather than
an emergent mean-motion resonance from mutual gravity alone (too slow to feel in
seconds). The ≤3-dyad cap keeps composed chords lean — a deliberate safety trade
for a bounded oscillator count. The drift is only pronounced for chains that leave
the lattice (stacked thirds); a fifth/octave chain barely moves, so the seed preset
(a Laplace chain of fifths) is a quiet demo of the toggle — capture a couple of
5:4 thirds to see the needle swing. Conjunction-bell density depends on live
geometry, so there are quiet stretches, and on a real phone the tilt scaling may
want per-device tuning.

## Where cycle 4 could go

Per-crystal "pin" (freeze one voice on the grid so the comma spreads only across
the others); an audible **reference tick** at ROOT so the beating has an explicit
metronome to beat against; a **comma-pump loop preset** (I–vi–ii–V–I) that
demonstrates the full 21.5¢ sink over one bar in strict, then closes it in
adaptive. But per the jury's discipline note ("pick the one thread, ship it, then
rotate"), cycle 3 is likely the natural **close** of this commitment — three
cycles: play it (1), compose with it (2), tune it (3).
