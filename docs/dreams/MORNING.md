# Morning digest — last updated 2026-06-01 UTC (Cycle 266)

## New since yesterday

- **[/dream/232-kids-rain-xylophone](/dream/232-kids-rain-xylophone)** — Rain Xylophone `demoable`
  Five BANDIMAL xylophone bars at the bottom. Coloured drops fall from above (~3–4s travel time). Tap a drop to catch it → loud bell + 20-sparkle burst. Miss it → quiet ring as it lands. Tap bars directly any time. Auto-spawns one drop every 1.5s; 2 demo drops at load. Pentatonic C3–C4, zero permissions.
  **Open this if**: you want the first kids chase-mechanic prototype — catching vs. tapping changes the dynamic entirely.

## Previous highlight

- **[/dream/231-mood-xy](/dream/231-mood-xy)** — Mood XY `demoable`
  Drag a dot through an emotion plane (valence × arousal). Music synthesizes to match: **excited·happy** = bright major arpeggios, 120+ BPM; **calm·sad** = sparse diminished, 40 BPM, 3s sustain. First prototype where you set emotional intent and music follows (all prior prototypes react to audio). Zero deps.

## In progress / partial

Nothing in progress. Clean slate for cycle 267.

## Research findings worth a look

- AffectMachine-Pop (Jun 2026) — arousal×valence synthesis, validates 231-mood-xy's two-axis model. See RESEARCH.md §58.

## Open questions for Karel

- **Rain Xylophone feel**: is ~3–4s fall time the right window for kids? Could go faster (more intense) or slower (more contemplative). Easy knob to turn.
- **Mood XY chord root**: currently always C. Should the root drift as valence increases (sharps → flats as you move right)? ~10-line polish.
- **Cycle 267 adult build** (next cycle): top candidates — `shepard-tone` (auditory illusion: endless rising staircase, zero deps), `scene-spatial` (Ghost HRTF 3D audio), or polish `172-loop-station` ❤️.
