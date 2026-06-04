# 308 · Orbit Choir

**What if a spatial-audio piece had a _narrative over time_ — a circle of voices scattered in dissonance around your head that, over ~6 minutes, slowly orbit inward and converge into one resolving chord — and you navigate / accelerate the resolution by turning your phone (head-tracking)?**

This is the lab's first audio-first / non-screen family member: a head-tracked HRTF spatial piece given a long-form, stateful arc. The room at minute 6 is harmonically different from the room at minute 0 — the scattering literally gathers, and the dissonance literally resolves, while you stand in the middle of it.

## How to use it

1. **Put on headphones.** The spatial field is rendered binaurally (HRTF) and collapses on speakers — two ears is the whole point.
2. **Tap "Begin the orbit."** On iOS this is where device-orientation permission is requested and the AudioContext is resumed (both must happen inside the tap).
3. **Turn your phone / turn your head.** The voice you face swells, and facing it gently nudges _its_ personal resolution forward — so you shepherd voices home and shape the pace of the convergence.
4. **No phone sensor (desktop)?** Drag left/right or use the arrow keys to rotate the listener. A slow auto-tour runs hands-free so the piece demos itself.
5. **Listen for ~6 minutes.** The voices start scattered and detuned into a soft cluster, then orbit inward to an even ring while their pitches glide into a warm chord. When everything resolves, the chord holds and a **Begin again** button appears.

A thin violet ring at the top fills with the arc; a `M:SS — state` label reads `scattered → drifting in → gathering → almost home → resolved`. The faint violet canvas is an orbital _map_ (listener at center, a facing marker, dim dots for the voices drifting together) — a guide, not the point. Keep your eyes closed if you like.

## The technique

- **Voices.** 7 sustained voices, each 2–3 sine `OscillatorNode`s (fundamental + quiet octave/twelfth harmonics) → per-voice `GainNode` (with a slow breathing `OscillatorNode` LFO on its gain) → gentle lowpass `BiquadFilter` → its own `PannerNode` (`panningModel = "HRTF"`, `distanceModel = "inverse"`).
- **Synthesized reverb.** A shared `ConvolverNode` whose impulse response is generated at runtime from decaying, lowpass-smoothed white noise — no audio files, no dependencies.
- **The 6-minute convergence state machine (long-form / stateful).** A per-frame scheduler interpolates BOTH, against an eased global clock:
  - **(a) Azimuth + radius** — each voice orbits from a scattered start azimuth (and a far radius) toward an _even_ slot on the circle (`i / VOICE_COUNT · 2π`) at a gathered-in radius. Position is written to the panner each frame.
  - **(b) Pitch** — each voice glides (via `setTargetAtTime`) from a cluster a semitone-ish off its target up to its **target chord tone**.
  - The target is a **warm A natural-minor add9 with a stacked-fifth glow** (A2 root · E3 · A3 · C4 · E4 · B4 add9 · G4 ♭7) — deliberately _not_ C-major-pentatonic.

  So the spatial field and the harmony resolve _together_: the piece is audibly different at minute 6 than at minute 0. State lives in `useRef`s (AudioContext, voice nodes, yaw, rAF handle) and is fully torn down on unmount / "Begin again."
- **Head-tracking.** `DeviceOrientation.alpha` rotates the `AudioListener` forward vector. Both the modern AudioParam API (`listener.forwardX/Z`, `panner.positionX/Y/Z`) and the legacy method API (`setOrientation` / `setPosition`) are feature-detected and supported. The angular alignment between listener yaw and each voice's azimuth drives a "facing" value that (1) swells that voice's level and canvas dot, and (2) floors its personal resolution forward — turning your head shepherds voices home faster than the macro schedule alone.
- **Graceful degradation.** No DeviceOrientation / desktop → pointer-drag + arrow keys + slow auto-tour, with a `text-rose-300` notice that the sensor isn't active. No Web Audio → a readable `text-rose-300` notice.

## Named references

- **La Monte Young & Marian Zazeela — _Dream House_.** The sustained-tone field you can walk around inside; standing waves that change as you move your head. Orbit Choir is a moving, resolving _Dream House_ in your skull.
- **Éliane Radigue.** Glacially slow drift and beating between near-unison tones — the model for the cents-level detuning that resolves over minutes, not seconds.
- **Pauline Oliveros — _Deep Listening_.** The piece asks for attentional, ritual, whole-body listening rather than a glance at a screen.
- **Research backing:** head movement disambiguates generic, non-individualized HRTF localization (front/back and elevation confusions collapse once the listener turns) — see arXiv **2510.09161**. That is why head-turning is the core interaction, not a gimmick: it both _improves_ localization of each voice and _drives_ the resolution.

## Next-cycle deepening

- **Real stems.** Replace the synth voices with Karel's actual _Welcome Home_ piano stems as the seven voices — same azimuth/pitch convergence machine, real timbre.
- **Haptics.** `navigator.vibrate` a soft pulse the moment a voice you're facing reaches full resolution — a felt confirmation that one came home.
- **Persistence.** Save where the listener left the resolution (`localStorage`) and resume the arc across sessions, so the room remembers how far you'd gathered it.
