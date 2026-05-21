# 4-operator — Venue Operator Panel

## What this explores

What does running Resonance from a venue's tech booth look like? This mock
explores the dual-view paradigm: the operator watches the performer view on
the left while maintaining full control from the right — without the performer
ever seeing the control layer.

## Scenes

Six scenes map to a loosely-structured journey arc:

| # | Name | Phase | Aesthetic |
|---|------|-------|-----------|
| 1 | Void | Pre | Slow star drift, indigo. Opening / pre-show. |
| 2 | Threshold | I | Cyan mist shafts and dust motes. The call. |
| 3 | Bloom | II | Concentric rings radiating from center, green. |
| 4 | Current | III | Lissajous curves shifting phase with the beat. |
| 5 | Ascension | IV | Orange particles rising and bursting on beat. |
| 6 | Terminus | V–VI | Magenta spiral vortex pulling everything inward. |

## Controls

| Action | Input |
|--------|-------|
| Switch scene | Click scene card in right panel |
| Scene hotkeys | Keyboard keys 1–6 |
| BPM tap | Click TAP button or press Space |
| Clear BPM | "clear" link below the BPM display |
| Crowd noise meter | Start mic → microphone monitors ambient sound |
| Mic gain | Slider, range 0.5–4× |
| MIDI scene trigger | MIDI notes C3–A3 (MIDI notes 48–53) |
| MIDI tap beat | CC 48 |

## Design notes

**Dip-to-black transitions** are intentional. Jarring crossfades feel
amateurish in live performance contexts; a brief blackout (350ms total,
smooth ramp) lets the audience and performer breathe between scenes.
The technique is standard in broadcast and live AV.

**BPM drives all scenes.** When no BPM is set, scenes run at a default
80 BPM for visual continuity — you always see a rhythmic pulse. The tap
algorithm keeps the last 8 taps and averages inter-tap intervals, which
is more robust than just using the latest interval (one misfire doesn't
wreck the estimate).

**Each scene is self-contained.** Particle arrays are allocated per
scene and cleared on transition. No shared state bleeds between scenes.

**Performer view is intentionally minimal.** In a real deployment, the
performer screen is a separate monitor (via OS display mirroring). The
operator controls never appear on the performer display.

## What's missing (next iteration)

- Crossfade mode (dual offscreen canvas) as an alternative to dip-to-black
- MIDI CC → gain fader learn mode
- Crowd noise threshold → auto advance to next scene
- Scene sequence preset (e.g. "run a full 45-minute arc automatically")
- OSC output for Resolume/TouchDesigner/QLAB integration
- Tauri wrapping for true offline venue operation (kiosk mode)
