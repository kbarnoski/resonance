# Morning digest — last updated 2026-05-24 UTC (Cycle 164)

## New since yesterday

- **[/dream/133-kids-ripple-pond](/dream/133-kids-ripple-pond)** — Ripple Pond polish · *Cycle 164* · `demoable` ✨
  Two meaningful additions: (1) **stone-drop animation** — when you tap, two tight inner rings (28 px, 15 px) plus a white dot pop at the impact point for 350 ms before the main ripple expands. Looks like a stone entering water, not just a circle appearing. (2) **edge-bounce rings** — when a ripple reaches a screen edge, a reflected ghost ring (38% opacity) travels back from the virtual image source. The pond now behaves like a physical bounded space. Zero deps, zero API, for kids 3+.

- **[/dream/138-lmdm-echo](/dream/138-lmdm-echo)** — Echo Chamber · *Cycle 163* · `demoable`
  Record a piano phrase → AI echoes your harmonic meaning back. Mic + FAL_KEY required ($0.006/gen).

- **[/dream/137-kids-hold-glow](/dream/137-kids-hold-glow)** — Hold & Glow · *Cycle 162* · `demoable`
  Hold-duration as musical parameter. Zero deps, zero API.

## In progress / partial

Nothing in-progress.

## Notable: votes (unchanged)

13 loves: `82-kids-color-piano` ❤️ `83-kids-tilt-rain` ❤️ `130-tsl-particle-compute` ❤️ `111-kids-shape-loop` ❤️ `107-ocean-presence` ❤️ `106-beat-cut` ❤️ `105-pluck-field` ❤️ `104-kids-mirror-draw` ❤️ `101-camera-song` ❤️ `100-kids-paint-song` ❤️ `98-kids-drum-circle` ❤️ `86-sound-to-video` ❤️ `84-wave-fluid` ❤️

## Research / queued

- **Cycle 165 (adult)** — `mood-xy` (Russell circumplex emotion synthesis: drag a dot on valence × arousal canvas → real-time music, zero deps, one cycle) or `loop-station` polish.
- **Polish: `138-lmdm-echo`** — mini chromagram overlay, "Variation" mode (±8 BPM), editable prompt tags, WAV download.
- **Polish: `135-kids-wheel-song`** — note-name flash above striker on each segment crossing.

## Open questions for Karel

1. **Echo Chamber latency** — ACE-Step takes ~10–20 s to generate. OK as "reply letter" experience, or needs a progress countdown?
2. **Echo Chamber BPM** — reliable with ≥3 onsets only; short staccato phrases fine, single sustained chords fall back to 72 BPM default. OK?
3. **Ghost 3D orbit** — Pixal3D: Ghost image → animated 3D GLB, ~$0.30/gen via FAL_KEY. Worth building?
4. **Welcome Home track IDs** — `72-paths-visualizer` + `76-cymatics-on-piano-path` blocked ~80+ cycles. Still outstanding.
