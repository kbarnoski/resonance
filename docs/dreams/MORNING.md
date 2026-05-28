# Morning digest — last updated 2026-05-28 UTC (Cycle 222)

## New since yesterday

- **[/dream/190-kids-wave-organ](https://getresonance.vercel.app/dream/190-kids-wave-organ)** — Wave Organ (kids, Cycle 222)
  Seven pentatonic organ pipes rise from a dark ocean floor. An autonomous wave rolls
  across the water — when it crests over a pipe's mouth, the pipe sings. Tap anywhere
  to send a surge and wake the deep low pipes. The three short pipes (C4/E4/G4 = major
  chord) are **already playing on load** before any tap.
  **Why open this:** first kids prototype where wave height = which notes play. The
  physics narrative is immediately self-discovering: taller pipe = lower note = needs a
  bigger wave. BANDIMAL meets ocean. Zero permissions, alive before first touch.

- **[/dream/189-voice-scene](https://getresonance.vercel.app/dream/189-voice-scene)** — Voice Scene (adult, Cycle 221)
  Six ambient scenes. Switch by clicking **or** by speaking a trigger word (Cosmic,
  Earth, Forest, Ocean, Fire, Crystal). Web Speech API in Chrome/Edge.
  **Why open this:** first prototype where your voice (not music) controls the room.

## Previous

- **[/dream/188-kids-glow-bug](https://getresonance.vercel.app/dream/188-kids-glow-bug)** — Glow Bugs (Cycle 220 — kids)
  Tap to release fireflies that drift to garden lamps and chime. Spatial anticipation
  before sound — note fires at destination, not at tap.

- **[/dream/187-shepard-tone](https://getresonance.vercel.app/dream/187-shepard-tone)** — Shepard Tone (Cycle 219)
  The endless auditory staircase illusion. Try Freeze + Mic mode: resonant 8-partial drone.

## In progress / partial

- `185-score-structure` polish (dom7/dim/maj7 templates + section hysteresis) — good next adult candidate.
- `kids-mirror-dance` (MediaPipe CDN ~8MB): still needs Karel OK.

## Research findings worth a look

- `189-voice-scene` opens the speech-as-performance-control direction. Natural next step:
  a "Ghost" scene that responds to spoken scene names from the journey narrative + mic
  amplitude modulates particle density.
- `190-kids-wave-organ` could be extended with a **tidal clock** — wave amplitude slowly
  increases over 10 minutes (simulating tide coming in), filling more pipes until all 7
  are always playing. Natural session arc without any UI.

## Open questions for Karel

- **Voice control interest?** `189-voice-scene` works well in Chrome/Edge. Extend to
  Ghost journey narrative (say "stone chamber" → scene shifts)?
- **`kids-mirror-dance`**: MediaPipe CDN dep (~8MB). Say go and it builds next kids cycle.
- **`185-score-structure`** polish: add dom7/maj7/dim templates, or move on to new prototypes?
- **Wave Organ tidal mode**: should the wave amplitude increase slowly over a session,
  building to a climax? Or keep the random undulation as-is?
