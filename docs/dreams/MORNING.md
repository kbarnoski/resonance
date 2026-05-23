# Morning digest — last updated 2026-05-23 UTC (Cycle 123)

## New since yesterday

- **[/dream/105-pluck-field](/dream/105-pluck-field)** — "Pluck Field" · *Cycle 123*
  24 virtual strings across four octaves — click any string to pluck it. Each string uses
  Karplus-Strong physical modeling: white noise burst → tuned ring-buffer feedback loop →
  decaying periodic wave. The same algorithm behind every digital guitar, harp, and piano
  string synthesizer. You can see the physics: low C2 glows for ~2 seconds; high A5 flashes
  and dies in under 0.5s. Click across a row for a glissando that sounds like a real harp.
  **Why open it**: multi-touch — lay four fingers across the grid and pluck a chord. Then add
  mic and play piano: onsets trigger random strings, turning your playing into a cascading harp
  accompaniment. Zero deps, zero API, zero permissions.

- **[/dream/104-kids-mirror-draw](/dream/104-kids-mirror-draw)** — "Mirror Draw" (kids) · *Cycle 122*
  Draw a line on one side → it mirrors instantly → lift to hear it play as a melody.
  **Why open it**: hand to a child. First kids prototype about bilateral symmetry.

- **[/dream/103-listen-guide](/dream/103-listen-guide)** — "Guided Listening" · *Cycle 121*
  Six 22-second windows, each spotlighting a different frequency band.
  **Why open it**: drag a Welcome Home track onto it and let it teach you what's in your recording.

## In progress / partial

- Nothing in-progress. Clean queue.

## Research findings worth a look

- `chord-canvas` (queued, no deps): chroma vector → chord name + color timeline. First
  music-theory prototype — tells you what chord you're playing in real time. One-cycle build.
- `pluck-field` polish ideas: sustain pedal (hold a key to freeze decay), chord mode (click
  a column header to pluck all 4 octaves of that note simultaneously), reverb impulse via
  ConvolverNode for concert-hall resonance.

## Open questions for Karel

1. **Pluck Field** — try the mic mode with piano: each onset plucks a random string on the
   canvas. Worth promoting to "polished" with reverb + sustain-pedal feature?
2. **Welcome Home track IDs** — `103-listen-guide` file mode is ready. Once you share IDs
   I can pre-load tracks for a one-tap guided session.
3. **Veo 3 budget OK?** — `veo3-ghost` ≈ $2–3.20/clip (Veo 3) or ~$0.55–0.70 (Seedance 2.0).
4. **`82-kids-color-piano` polish** — long-queued typography bump (Cycle 124). Schedule it?
5. **New loves?** Votes API still shows only `82` and `83`. Try: `105-pluck-field` (chord pluck),
   `101-camera-song` (headphones, orbit), `103-listen-guide` (drag a track).
