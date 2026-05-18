# /dream/5-arcs — Journey Arc Engine v2

**Question**: what if Resonance journeys could have shapes other than the 6-phase psychedelic arc?

## What this is

An interactive prototype that renders five alternative journey arcs — each with its own phase structure, color palette, particle behavior, and pacing — driven by either synthetic demo audio or live mic input.

Five arcs:

| Arc | Phases | Real duration | Visual identity |
|-----|--------|---------------|-----------------|
| Psychedelic | 6 | 60 min | Radial color fields, heavy dissolution phase |
| EDM Build-and-Drop | 5 | 10 min | Grid→rise→scatter, white drop explosion |
| Cinematic | 7 | 90 min | Amber warmth → red tension → blinding climax |
| Ritual | 4 | 45 min | Earth tones, slow ceremony, fire eruption |
| Sleep | 5 | 8 hr | Lavender→deep indigo→dreamy REM→dawn gold |

Demo mode compresses each arc to 60 seconds so all phases are immediately playable.

## Technical choices

- Canvas 2D only — no WebGL needed. The visual style is particle-based (6 behaviors: orbit, rise, scatter, grid, wave, dissolve) with radial glow layers driven by band energy.
- Synthetic audio: each phase drives sinusoidal oscillators at different speeds per band so the visual responds even without a microphone. The Sleep arc deliberately suppresses onset flashes.
- Phase timeline: proportionally-sized chips at the bottom showing duration weights. Clicking a chip during playback jumps immediately to that phase.
- Arc-switch while running: re-seeds phase durations and resets the particle pool immediately without stopping.

## What this forces you to articulate

The psychedelic arc has specific phase durations baked from clinical literature (short induction, long peak). The other arcs force explicit answers to: how long is "build"? where does the emotional peak sit? how do you define "resolution"? The cinematic arc turns out to need 2:1:1:1:2:2 weights; the EDM arc is almost inverted (short intro, long euphoric plateau).

## What to try next

- Audio file playback per arc (an EDM track during "drop" vs ambient drone during "gathering") so sound and structure match
- Phase transition animations — short cross-dissolve rather than instant color cut
- BPM-locked onset rate in EDM arc (tie particle spawn rate to tap tempo)
- Crowd/group mode: multiple arc instances synchronized via WebRTC or broadcast channel
- Export arc definition as JSON → import into the Resonance journey engine
