**For**: kids (4+)

# Shape Drums — build a polyrhythm by spinning shapes

A dark, playful canvas holds 1–5 big rotating polygons, each a bold saturated
color with glowing white "ping dots" on every vertex. A faint trigger line
crosses the top of each shape; every time a vertex sweeps past it, that shape
PINGS a warm note and flashes a ripple. A triangle pings 3 times per rotation,
a hexagon 6 — so the **number of sides the child chooses IS the rhythm
subdivision**, and the **spin speed IS the tempo**. Two shapes of different
sides spinning at related speeds drift in and out of phase, so the child has
literally *built* a polyrhythm (3-against-2, 4-against-3) — rhythmic agency,
not a pre-approved melody. There is no wrong move and no fail state.

## Named references implemented
- **Polyrhythm-as-rotating-polygons** visualizations ("Polyrhythms in shapes" /
  thekidshouldseethis, and Musical Toys "Polyrhythm"): sides = subdivision,
  rotation = pulse, vertex-crossing = trigger.
- **Steve Reich phasing / pendulum-wave lineage**: two periodic patterns at
  related speeds drifting in and out of phase is the core musical motion here.

## How the audio works
- Pure Web Audio API, no samples, no network. One shared `AudioContext`,
  created and `resume()`-d behind the first tap (a "Tap to start" overlay gates
  it for iOS).
- Each shape carries one tone of a single warm **Dadd9-ish stacked chord**
  (D3 / A3 / D4 / F#4 / B4). Because pitch is fixed to that chord, *every*
  combination of shapes is consonant — the child shapes RHYTHM, never harmony.
- Pings are synthesized as a soft marimba/bell tone: 3 detuned partials
  (sine + soft octave + triangle fifth) through a fast-but-soft gain envelope
  (`linearRampToValueAtTime` attack, `setTargetAtTime` decay — never an instant
  jump, so no clicks), a lowpass that closes over the tail, and a light feedback
  delay for warmth. A quiet sustained triangle-wave **pad** on the two lowest
  chord tones keeps it from ever being silent. Levels are low — safe for a
  sleeping toddler nearby.
- Scheduling is a per-frame **vertex-crossing edge detector** in the rAF loop:
  each frame computes the polygon's rotation phase, and when the integer vertex
  count past the trigger line changes, a ping is scheduled at `currentTime`.

## How the visuals work
- Full-bleed Canvas2D animated via `requestAnimationFrame`. Near-black radial
  background; each polygon drawn with a saturated stroke + glow, white vertex
  dots, an expanding ripple flash on ping, and a faint trigger line across its
  top. Shapes auto-shrink/relayout as you add more so 4–5 still fit.

## Interaction (no reading required)
- Big round **+** (80px) adds a shape (cycles triangle → square → pentagon →
  hexagon → … defaults), capped at 5.
- **Tap a shape** cycles its sides 3→8 then wraps, with immediate sound + visual.
- **Tap a shape's center** removes it (last shape stays — never empty).
- One **giant speed button per shape** (64px) cycles musically-related ratios
  ×0.5 / ×1 / ×1.5 / ×2 of a base tempo so polyrhythms stay clean. Turtle/rabbit
  icons read without words.

## Tags
- **INPUT**: touch / pointer
- **OUTPUT**: Canvas2D (full-bleed `requestAnimationFrame`)
- **TECHNIQUE**: polyrhythm-as-rotating-polygons / vertex-crossing scheduler
- **PALETTE/VIBE**: playful, bold saturated colors on near-black, geometric,
  calm-but-lively

## Known limitations
- Scheduling is a per-frame edge-detect, not a look-ahead queue, so at very fast
  speeds + high tab load timing can jitter a few ms (fine for a prototype, not
  studio-tight).
- If a frame is very long, multiple vertices could cross in one frame; only one
  ping fires for that shape that frame (rare at these tempos).
- Graceful no-audio path renders the visuals plus a small "sound is off" notice
  rather than throwing.
