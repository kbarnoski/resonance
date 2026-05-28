# Morning digest — last updated 2026-05-28 UTC (Cycle 223)

## New since yesterday

- **[/dream/191-eco-bloom](https://getresonance.vercel.app/dream/191-eco-bloom)** — Eco-Bloom (adult, Cycle 223)
  An L-system fractal plant grows from a seed, branch by branch, with each iteration
  playing a Karplus-Strong pentatonic chord. Tap to advance iterations; the prototype
  auto-cycles. 4 iterations max → 2,401 glowing segments; violet trunk fades to emerald
  leaf-tips on near-black background.
  **Why open this:** first fractal/recursive-structure prototype in the sandbox. The plant's
  branching depth = harmonic depth — the visual structure IS the chord progression.
  Patient, contemplative pace. Different from every reactive prototype before it.

- **[/dream/190-kids-wave-organ](https://getresonance.vercel.app/dream/190-kids-wave-organ)** — Wave Organ (kids, Cycle 222)
  Seven pentatonic organ pipes rise from an ocean floor. Wave height = which pipes play.
  Already playing (C4/E4/G4) on load. Tap to surge. Physics self-explains the tuning.

## Previous

- **[/dream/189-voice-scene](https://getresonance.vercel.app/dream/189-voice-scene)** — Voice Scene (Cycle 221)
  Speak "cosmic", "earth", "forest" etc. → scene shifts. Six ambient environments.

- **[/dream/188-kids-glow-bug](https://getresonance.vercel.app/dream/188-kids-glow-bug)** — Glow Bugs (Cycle 220 — kids)
  Fireflies drift to garden lamps, chime on arrival. Note fires at destination, not tap.

## In progress / partial

- `185-score-structure` polish (dom7/dim/maj7 templates + section hysteresis) — good next adult candidate.
- `anemone-av`: Three.js organic bioluminescent 3D form (TSL displacement) — deferred 3×, prime for next adult cycle.
- `kids-mirror-dance` (MediaPipe CDN ~8MB): still needs Karel OK.

## Research findings worth a look

- `191-eco-bloom` opens the **generative score** direction: structure generates sound,
  not the reverse. Next step: parametric rules (let Karel choose angle or substitution rule)
  so the plant shape itself is the composition instrument.
- `190-kids-wave-organ` tidal clock idea: wave amplitude slowly increases over 10 minutes,
  filling more pipes until all 7 ring. Built-in session arc without UI.

## Open questions for Karel

- **eco-bloom variants**: want other L-system rules selectable (Sierpinski, coral, dragon curve)?
  Or should the current plant receive mic input (amplitude → branch angle spread)?
- **Voice control direction?** `189-voice-scene` works in Chrome/Edge. Extend to Ghost journey
  narrative scenes ("stone chamber" → ambient shift)? Or that's enough?
- **`kids-mirror-dance`**: MediaPipe CDN dep (~8MB). Say go and it builds next kids cycle.
- **`anemone-av`**: Three.js 3D organic form has been queued 3 cycles. Should it be the next
  adult prototype, or is there something from the research queue you'd rather see first?
