# Morning digest — last updated 2026-05-23 UTC (Cycle 134)

## New since yesterday

- **[/dream/113-kids-conductor-wand](/dream/113-kids-conductor-wand)** — Conductor Wand (kids) · *Cycle 134* · `demoable`
  Drag your finger anywhere — a glowing wand follows it. Y position = pitch
  (pentatonic; top = high, bottom = low). Drag fast for rapid arpeggios; slow
  for long sustained tones. Quick tap = drum hit.
  **4 orchestras**: Playground 🎪 (bright amber), Space 🚀 (ethereal violet),
  Forest 🌲 (warm emerald), Ocean 🌊 (cyan, 3-note drone chord).
  Each orchestra has its own color trail, reverb depth, and root key.
  Demo mode auto-conducts a Lissajous figure until first touch — the wand is
  already moving when you open the page.
  **"Your finger IS the baton."** No buttons mid-session — the whole canvas
  is the instrument.
  Zero permissions · Zero API · Zero deps · 2.84 kB.

- **[/dream/112-bio-echo](/dream/112-bio-echo)** — Bio Echo · *Cycle 133* · `demoable`
  Play piano → watch a forest grow, layer by layer.
  Sub-bass grows root tendrils; bass builds the amber trunk (never shrinks);
  mid blooms the emerald canopy; each onset fires a bird arc; treble fills
  the sky with stars. Canvas never clears. **Save PNG**.
  Trunk gradient emerges purely from canvas accumulation — no gradient code.
  Zero deps · Zero API · mic optional (demo mode) · 3.6 kB.

## In progress / partial

- Nothing in-progress.

## Research findings worth a look

- **live-harmonize** (queued Cycle 135): play a melody → system predicts
  harmony in real time. Pitch detection → chord template match → 4-voice
  accompaniment panned slightly left. Zero deps, one cycle.
- **kids-weather-music** (Cycle 136): four weather zones (sun/cloud/rain/wind);
  hold to blend; drag to morph continuously. No tap targets — whole screen is
  the instrument. Most different from all existing kids prototypes.
- **sph-ocean-av** (two-cycle): WebGPU SPH fluid + audio reactivity gap.

## Open questions for Karel

1. **Conductor Wand orchestras**: are the 4 preset orchestras (Playground,
   Space, Forest, Ocean) the right set? Would swap for any of: Jungle 🌴,
   Storm ⛈️, Desert 🏜️, Underwater 🐠?
2. **Bio Echo trunk behavior**: trunk only grows (never shrinks). Right design?
   Alternative: slow decay when bass fades for a more dynamic record.
3. **GEMINI_API_KEY** — still unlocks `30-lyria-jam`, `43-lyria-ghost`, `44-binaural-lyria`.
4. **`veo3-ghost` budget** — $2.00/clip (Veo 3 Fast). Good to proceed?
5. **Ball-ball collision** in `109-kids-bounce-notes`: balls pass through each
   other. Polish cycle to add proper collision detection?
