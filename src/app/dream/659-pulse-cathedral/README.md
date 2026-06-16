# 659 · Pulse Cathedral

A euphoric EDM **build-and-drop** journey for the Resonance dream lab.

## The one question

> What if Resonance had an EDM **build-and-drop** journey arc — a euphoric
> four-on-the-floor cathedral of light that tensions up through a riser and
> **BREAKS into a drop**, then climbs and never quite lands — and you can punch
> the next DROP with one key?

It is a **journey-engine alternative**: where the app's usual arc is
psychedelic, this one is an EDM build/drop arc that lives squarely in the
ecstatic / euphoric / luminous register. Triumphant, never dark.

## How to use

- Press **▶ Start** to create/resume the AudioContext (this is the iOS unlock
  gesture) and fade the master in. The visuals animate immediately, with or
  without audio.
- **SPACE** or the **DROP ⏷** button forces the next drop early.
- **↑ / ↓** (or the ENERGY −/+ buttons) add and remove layers.
- **TEMPO** slider sweeps 120–130 BPM.
- If you do nothing for ~2.5s, the arc runs itself (BUILD → DROP → SUSTAIN →
  loop) so a silent glance still shows it alive.
- **Design notes** (bottom-right) opens a quick in-app summary and points here.

If WebGL2 is unavailable, a `text-rose-300` notice appears and the nave falls
back to a Canvas2D rendering.

## Subsystems

1. **Look-ahead scheduler** (`synth.ts`) — a Chris-Wilson style scheduler: a
   `setInterval(~25ms)` pump schedules audio events ~120ms ahead of
   `audioCtx.currentTime`. Audio is never clocked off `requestAnimationFrame`.
2. **Layered synth bed** (`synth.ts`, all Web Audio, no samples) — four-on-the-
   floor kick (sine pitch-drop + click), an offbeat rolling bass that is
   **sidechain-ducked by the kick** (a gain node on the "pump bus" is ramped
   down on each kick and released — the audible pump), a detuned supersaw chord
   stack + pad, a plucky bandpassed arp, a filtered **noise riser** that sweeps
   a lowpass up during the BUILD, and a tasteful **impact/crash** at the DROP.
3. **Build/drop ARC state machine** (`arc.ts`) — BUILD (8 bars: density,
   filter cutoff and intensity rising) → DROP (full bed, deepest pump, impact)
   → SUSTAIN (4 bars riding the groove) → back to BUILD. Everything is in a
   bright Lydian-leaning mode. The bass octave is **Shepard-folded** each cycle
   so the energy reads as forever-climbing.
4. **WebGL2 renderer** (`gl.ts`) — a luminous vertical light-column / cathedral
   nave drawn in a fragment shader: brightness pulses with the kick and the
   sidechain duck is *visible* as a brightness dip-and-bloom, light-shafts and
   sparks erupt at the DROP, and color sweeps violet (BUILD) → gold/white
   (DROP). Animates even before audio is unlocked. Canvas2D fallback included.

## Ear-safety

Master chain is `GainNode` (capped ≤ 0.45) → `DynamicsCompressor` →
destination, fading in over ~0.8s on start. All layer gains are capped and the
crash is filtered noise + a soft sub boom — tasteful, not painful.

## References (conceptual lineage)

- **EDM build-and-drop form** — the riser → impact → drop structure that
  organizes festival/progressive-house tracks (tension build, breakdown, drop).
- **Sidechain "pumping" compression** — the French-house / Eric Prydz lineage
  where a pad/bass bus is ducked in time with the kick to create the
  characteristic breathing "pump". Here it is modeled directly with scheduled
  gain automation rather than a compressor sidechain.
- **Roger Shepard**, *"Circularity in Judgments of Relative Pitch"* (1964) — the
  Shepard-tone illusion of an endless climb, echoed by folding the bass octave
  each cycle so the arc reads as forever-rising.
- Real-time **continuous causal music streams** this conceptually echoes:
  Google DeepMind **Lyria RealTime / "Live Music Models"** and **"LiveBand:
  Live Accompaniment Generation in the Audio Domain"** (arXiv 2606.03803, June
  2026). These are cited as honest conceptual lineage — a never-landing, causal,
  continuously-generated arc — and are **not** implemented here with ML; this
  prototype is hand-built Web Audio + WebGL2.
