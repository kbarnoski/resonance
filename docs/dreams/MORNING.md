# Morning digest — last updated 2026-05-24 UTC (Cycle 150)

## New since yesterday

- **[/dream/127-kids-starfish](/dream/127-kids-starfish)** — Starfish Garden · *Cycle 150* · `demoable`
  Five starfish on an ocean floor. Touch one → all 5 notes of its pentatonic chord sound at once (with reverb tail), arms ripple outward and glow. Biggest (amber, centre) plays the G3 cluster; violet (left) plays C3; blue plays C4. Every combination of taps is consonant — no wrong notes. Seaweed sways in the background, micro-bubbles drift upward. **First kids prototype where a single tap produces a full chord** — give to Maia.

- **[/dream/126-arc-steer](/dream/126-arc-steer)** — Arc Steer · *Cycle 149* · `demoable`
  The `5-arcs` question, finally heard. Six phase prompts (Opening → Descent → Awakening → Peak → Integration → Return), each a 30 s ACE-Step generation. Press **▶ Begin Journey** and listen to the arc play through the bloom visualizer. All six prompts are editable. ~$0.04/run. FAL_KEY required. **Open this — most audibly surprising prototype in weeks.**

## In progress / partial

Nothing in-progress. Cycle 151 (odd) is an adult build — top candidates: `anemone-av` (Three.js R3F bioluminescent 3D form, zero new deps) or `tap-rhythm` (mic onset → step sequencer, zero deps, live performance).

## Research findings worth a look

- **Chord-per-tap design space.** `127-kids-starfish` shows that one tap can encode a full harmonic cluster without overwhelming a 4yo. Each starfish's chord is a consecutive 5-note pentatonic window starting from a different root. Tapping two starfish = two overlapping windows = an 8-10 note field. The overlap is always consonant (all notes from C-major pentatonic). This design works because the child hears richness, not complexity.
- **Arc prompts are compositional briefs.** The 6 ACE-Step tag strings in `arc-steer` ("sparse piano, introspective, major key, vast reverb, slow 28 BPM, long silence between phrases") are the same vocabulary a composer would use. A future direction: auto-populate these prompts from journey phase descriptions in `src/lib/journeys/journeys.ts`.

## Open questions for Karel

1. **Kids starfish chords** — the violet starfish plays C3/E3/G3/A3/C4 and the blue plays C4/E4/G4/A4/C5. Try tapping violet and blue simultaneously: you get a 2-octave C-major pentatonic spread.
2. **Arc-steer prompts** — the 6 default prompts are opinionated. Try running it and editing the Peak phase to "solo piano, no orchestra" — the contrast with the surrounding phases is striking.
3. **GEMINI_API_KEY** — unlocks `30-lyria-jam`, `43-lyria-ghost`, `44-binaural-lyria`. Still waiting.
4. **Veo 3 Ghost animate budget** — ~$0.75/clip (Veo 3 Fast). Still waiting.
5. **Welcome Home track IDs** — needed for `72-paths-visualizer` and `76-cymatics-on-piano-path`. Blocked ~73 cycles.
