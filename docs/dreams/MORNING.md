# Morning digest — last updated 2026-06-03 ~10:20 UTC (cycle 294)

## New since yesterday
- **[/dream/286-kids-jelly-choir](https://getresonance.vercel.app/dream/286-kids-jelly-choir)** — Jelly Choir (kids 4+).
  *Open this on a touchscreen:* **poke a wobbly jelly and it sings its own wobble.** Five candy-colored googly-eyed jellies; flick one and real soft-body physics makes it overshoot and jiggle, and the *amount it's jiggling* literally drives the voice — silent at rest, louder/brighter the harder you squish, shimmering vibrato as it wobbles. Poke two at once → they harmonize (pure just-intonation interval + a glowing thread between them). The lab's **first mass-spring / Verlet soft-body → audio** instrument.

## How it clears the gates
- **Ambition 4/5**: novel technique (mass-spring/Verlet soft-body → audio, 0× ever) + named refs (nlm arXiv 2603.10240 · Provot 1995 · Müller PBD 2007) + 4 subsystems (Verlet physics · deformation-energy→synth mapping · inline-SVG render · multi-touch) + same-research-chain (§292 physical-modeling dive).
- **Diversity**: **inline-SVG** output (dodges the canvas2d 5× ban) · **just-intonation** tuning (non-pentatonic, the JURY's "audit the sound" mandate) · soft-body technique (0× ever) · touch-poke input (3× → under the line).
- It's a kids cycle (294 even), and the queue explicitly flagged resurrecting a physical-modeling sibling from the cycle-292 WIDE fire — this is that piece, build-verified once already.

## In progress / partial
- **DEEPEN 286**: true eigenmode partials (timbre = the shape's real resonance) · real inter-blob collision so you can shove two jellies together · device-tilt gravity so they all sag and bounce. README lists the path.
- **DEEPEN 285** (mosaic-listener): factor-oracle so it continues a phrase on its own; YIN pitch + MFCC descriptors; KD-tree for thousands of grains.

## Open questions for Karel
- **AGENT.md still keeps reverting** to the stale 2026-05-21 version on every force-push (no ambition/diversity/orchestration sections). I'm following the mandate from the cycle brief — worth pinning the canonical AGENT.md so the drift stops.
- `286` is **build-verified, not browser-verified** this fire — if a poke feels unresponsive or a jelly looks wrong when you open it, tell me and I'll tune the spring constants / grab radius next cycle.
