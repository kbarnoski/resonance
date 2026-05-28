# Morning digest — last updated 2026-05-28 UTC (Cycle 221)

## New since yesterday

- **[/dream/189-voice-scene](https://getresonance.vercel.app/dream/189-voice-scene)** — Voice Scene (adult)
  Six ambient scenes: Cosmic, Earth, Forest, Ocean, Fire, Crystal. Each has its own particle
  field (rise / fall / drift / wave / burst / swirl), drone synthesis (root + fifth), and
  pentatonic arpeggio. Switch by **clicking a button** or **speaking a trigger word** via Web
  Speech API (Chrome/Edge). Say "cosmic" → the particles rise in violet. Say "fire" → radial
  burst in rose/amber at 108 BPM. Say "ocean" → sinusoidal wave drift in teal at 42 BPM.
  Hue lerps smoothly, drone pitches glide, arpeggio restarts.
  **Why open this:** first prototype where the control modality is your voice. Natural live
  performance use: speak a word and the room changes. Also works as a pure AV experience —
  the button row is always available for all browsers.

- **[/dream/188-kids-glow-bug](https://getresonance.vercel.app/dream/188-kids-glow-bug)** — Glow Bugs (Cycle 220 — kids)
  Tap anywhere to release a glow-bug. It drifts toward a garden lamp. Arrival = bell chime.
  Demo bugs auto-spawn. BANDIMAL: bigger lamp = lower pitch. First kids prototype with spatial
  anticipation before sound.

## Previous

- **[/dream/187-shepard-tone](https://getresonance.vercel.app/dream/187-shepard-tone)** — Shepard Tone (Cycle 219)
  The endless auditory staircase illusion. First psychoacoustics prototype.
  Try Freeze + Mic mode: resonant 8-partial drone generator.

- **[/dream/186-kids-breath-bloom](https://getresonance.vercel.app/dream/186-kids-breath-bloom)** — Breath Bloom (Cycle 218)
  Breathing flower, 5 pentatonic petals. Alive on load before any tap.

## In progress / partial

- `185-score-structure` polish (dom7/dim/maj7 templates + section hysteresis) — good next adult candidate.
- `kids-mirror-dance` (MediaPipe CDN ~8MB): still needs Karel OK to build.

## Research findings worth a look

- `189-voice-scene` opens a new prototype direction: speech as a live performance control surface.
  Next steps: custom vocabulary, mic energy layer driving particle density, transition duration slider.
- Psychoacoustics follow-ups from `187-shepard-tone`: Risset rhythm, Deutsch scale illusion,
  tritone paradox — all zero-dep browser-buildable.

## Open questions for Karel

- **Voice control interest?** `189-voice-scene` proves the Web Speech API works well in this context.
  Would you want to extend this — e.g., a "Ghost" scene that responds to spoken scene names
  from the journey narrative, or mic volume modulating the particle field?
- **`kids-mirror-dance`**: MediaPipe CDN dep (~8MB). Say go and it builds next kids cycle.
- **`185-score-structure`** polish: add dom7/maj7/dim chord templates, or move to new prototype?
