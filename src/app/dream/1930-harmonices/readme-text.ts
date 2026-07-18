export const README = `# 1930 — Harmonices III

**Cycle 3 of the tilt-played orrery — the lab's first three-cycle piece.** The
instrument is the same: a symplectic N-body orrery under real softened gravity,
tilted to pump planets into whole-number period ratios that sound as the TRUE
just intonation the physics already is — never a pentatonic fake. Cycle 2 let you
*compose* with it (crystallized chords). Cycle 3 lets you *tune* it — and hear the
300-year-old comma that pure intonation can never escape.

## What cycle 3 adds — the comma pump, made playable

A just-intonation lattice doesn't close. Build a chord by chaining PURE intervals
(exactly what capturing one resonance after another does) and the chord's centre
walks off the star's fixed pitch: two stacked pure major thirds land ~41¢ shy of
the lattice; a I–vi–ii–V–I in strict JI sinks a whole syntonic comma (81/80 ≈
21.5¢) per turn. Cycle 3 exposes this as a live toggle under the harmonic ledger:

- **STRICT (honest physics).** Every capture keeps its exact pure ratio, so the
  chord's centre **drifts against the star drone and you hear the beating grow**.
  The \`drift +N¢\` readout and the meter needle climb off centre. This is what
  pure intonation actually does — normally hidden inside equal temperament.
- **ADAPTIVE (spread the comma).** A real-time relaxation nudges every voice a
  fraction of a comma so the centre **locks back to the star** — beating dies,
  \`drift → ~0¢\`, needle re-centres. The cost is shown honestly as \`retuned ±N¢\`.
  It is the browser cousin of Stange & Wick's least-squares JI scheme
  (arXiv:1706.04338) and Nemire's Pivotuner (arXiv:2306.03873).

Flip the toggle live and the whole crystallized chord **glides** into or out of
lock against the fixed drone. To hear it clearly: crystallize a couple of **thirds
(5:4)** — fifths and octaves sit on the lattice and barely drift, which is itself
the lesson (some chains close, some don't).

## Cycle 2 recap (the compositional substrate cycle 3 tunes)

1. **Chord crystallization (the headline).** In cycle 1 every lock was
   transient — the interval sounded only while the pair held the ratio. Now,
   hold a lock steady for **3.5 seconds** and it **crystallizes**: its exact
   just interval is deposited as a persistent sustained sine dyad into a growing
   **chord stack**, and it keeps sounding even after the two planets drift
   apart. So across a session you build a chord of pure ratios, one capture at a
   time. The stack holds up to **three dyads (≤6 tones)** — capture a fourth and
   the oldest is dropped. Each crystal **fades out over ~32 s unless renewed**
   (re-capturing the same interval refreshes it), so if you walk away the whole
   composed chord decays back to the star's lone drone. The piece stays honestly
   dead without a human.

2. **Conjunction bells.** Whenever two planets cross the same heliocentric
   sight-line (a conjunction), a bright inharmonic bell rings — pitched to a just
   degree of the star's lattice — and a sight-line flash streaks across the two
   bodies. Hysteresis fires it once per pass. This gives the piece regular
   sparkle even before any lock forms.

3. **Warped gravity-well field + a Laplace-chain seed.** Faint equipotential
   contour rings of the star's well are drawn under the orbits and visibly
   **lean in the tilt direction** — the membrane the marbles roll on, so the
   tilt's effect on the field is legible (Canvas2D, phone-cheap; they are real
   equipotentials of Φ = −μ/√(r²+ε²) + tilt·r). And **"Seed a resonant chain"**
   snaps the five planets into a pre-locked TRAPPIST-1-style Laplace chain
   (successive 3:2 / 4:3 / 5:4 neighbours) so a first-time visitor hears a rich
   consonant chord within a couple of seconds — then, if nobody tilts, it decays
   like everything else.

## How to play

1. Press **Tilt to play** (or **Start with a resonant chain** for the instant
   chord). On a phone this asks for motion-sensor permission; on a laptop it
   falls back to **pointer = tilt** within a second.
2. Nudge a neighbouring pair until its ratio crosses 3:2, 2:1, 4:3, 5:3, 5:4… A
   **deep-red lock arc** snaps between the two planets and their voices jump to
   the exact just interval. The arc **ripens** (brightening halo) as you hold it.
3. Hold ~3.5 s and the arc **sets** — it etches a brass ratio-ring onto the plate
   and the interval joins the **harmonic ledger** below the orrery, sustaining on
   its own. Stack a few and you have a chord.
4. Stop moving and everything decays: locks break, crystals fade, and the orrery
   circularizes to the lone drone.

## The physics (recap)

- **Integrator.** Velocity-Verlet (leapfrog) — symplectic, so orbital energy
  doesn't drift over long runs. Gravity is softened (1/(r²+ε²)) so a close pass
  never blows up.
- **Tilt.** A uniform acceleration added to every body — a literal bias of the
  gravity field. The contour field renders the *same* biased potential.
- **Period read-out.** Each frame we take every planet's osculating Keplerian
  period from vis-viva (a = −μ/2ε, T = 2π√(a³/μ)).
- **Capture.** Within tolerance of a small-integer ratio, a restoring nudge
  snaps the ratio exact and holds it — a stylised mean-motion resonance, with
  hysteresis so a lock doesn't chatter.
- **Death.** Stop tilting and a circularizing term drains the eccentricity that
  resonance libration feeds on; voices and crystals fade to the drone.

## The harmony — just intonation, not pentatonic

Orbital resonance is *already* just intonation: 3:2 is a pure fifth, 2:1 an
octave, 5:4 a pure major third, 5:3 a just major sixth. This piece voices the
true ratios — a captured pair locks its two voices to the **exact integer
frequency ratio**, and a crystallized interval sustains at exactly that ratio.
Nothing is rounded to a scale. The celebrated ESO sonifications of resonant
systems — **TOI-178** and **TRAPPIST-1** — both de-risk the mapping down to a
*pentatonic* scale, discarding the very physics being celebrated. Here the
resonance and the interval are the same number.

## References

- **Johannes Kepler, _Harmonices Mundi_ (1619)** — "the music of the spheres";
  ratios drawn from a live integrator rather than his eccentricity extremes.
- **The Antikythera / orrery tradition** — the engraved brass plate visual
  language, now including the crystallized chord engravings.
- **ESO's TOI-178 and TRAPPIST-1 sonifications** — cited as the *foil*: the
  pentatonic crutch this piece refuses. TRAPPIST-1 also lends its Laplace-chain
  architecture to the seed preset.
- **Stange & Wick, _Playing Music in Just Intonation_ (arXiv:1706.04338)** and
  **Nemire, _Pivotuner_ (arXiv:2306.03873)** — the adaptive-JI / moving-pivot
  retuners cycle 3's adaptive mode implements in miniature.

## Self-assessment

**Cycle 3 status:** the tuning math is numerically verified (strict holds a
−13.7¢ drift; adaptive locks to ~0¢; reversible) but **not ear-verified** here —
whether the drift audibly beats and the ~0.2 s lock-glide reads as "sliding into
tune" wants a real phone + speakers.

**What works:** crystallization is legible — the arc ripens, blooms as it etches
a labelled brass ring onto the plate, and the interval appears in the harmonic
ledger with a draining life-bar while the dyad keeps sounding after the planets
separate. The composed chord honestly decays: each crystal's ~32 s life is only
refreshed by re-capturing, so walking away collapses the whole stack to the
drone. The seed preset delivers an immediate consonant chord; the well-field
warp makes the tilt's effect on the field readable.

**What's rough:** the capture-assist is still a stylised restoring force, not an
emergent resonance from mutual gravity alone. The ≤3-dyad cap keeps the chord
lean (a deliberate safety trade). Conjunction-bell density depends on the
current geometry, so quiet stretches happen; and on a real phone the tilt
scaling may want per-device tuning.
`;
