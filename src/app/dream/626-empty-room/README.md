# 626 — Empty Room

**An eyes-closed, audio-first binaural piece.** Put on headphones, close your
eyes, and stand inside an otherwise empty room. Several invisible "presences"
drift around you in 3D space — each a soft, sustained voice in a dark modal
register (close, intimate, slightly haunted; an empty-cathedral feeling, not
warm or cozy). When you **turn to face** a presence, it brightens, opens up, and
sings more clearly while the others recede. Active listening is the whole game.

## The one question it answers

What if Resonance could be experienced with your **eyes closed** — an off-screen
piece where invisible musical presences move around you in 3D and you turn to
face them?

## How to use

1. Press **"Enter the dark — put on headphones."** This creates/resumes the
   `AudioContext` inside your tap (required on iOS) and, on iOS 13+, requests
   motion-sensor permission.
2. **On a phone/tablet:** hold the device up and **turn your body**. Your facing
   direction is read from `DeviceOrientationEvent` (compass heading).
3. **On desktop / no motion sensor:** **drag** anywhere on the screen left/right
   to turn.
4. Close your eyes. Sweep slowly. When a voice snaps into focus — louder, nearer,
   brighter — you are facing it. Hold there, then move on to find the next.
5. If you do nothing for ~2.5s the heading **auto-rotates** so the room sweeps
   past on its own; the moment you turn or drag, you take the helm again.

The screen is deliberately near-black. It shows only an austere compass/radar
(a faint ring, a forward marker, one dot per presence, the faced one haloed) as a
**fallback aid** — the piece lives in the headphones.

## Technique

- **True binaural spatialization** via Web Audio `PannerNode` with
  `panningModel: "HRTF"` and `distanceModel: "inverse"`. Each presence is a node
  positioned in 3D world space; the `AudioListener`'s forward vector rotates as
  you turn (modern `listener.forwardX/Z` AudioParams, with a feature-detected
  fallback to the deprecated `setOrientation`).
- **Generative moving-presence engine.** Each of the 5 presences has its own
  slow orbit `azimuth(t)`, a radius wobble (`radius(t)`) that occasionally brings
  it close past your head, two slightly detuned oscillators (sine + triangle) for
  a breathing voice, a per-voice breath tremolo LFO, and slow multi-minute pitch
  detune drift so the room is genuinely different at minute 4 than at minute 1
  (it evolves, it does not loop).
- **Facing reward.** Per frame we compute the angle between your heading and each
  presence's azimuth; `cos(angle)` (sharpened with a cubic) drives a smoothed
  `faced` value that swells the voice gain and opens a lowpass "brightness"
  filter — distant/unfaced voices are quiet and muffled, the faced one is loud
  and open.
- **Empty-cathedral tail.** A damped feedback delay gives a soft, cold reverb
  sense without an impulse-response file.
- **Pitch material.** A low, dark modal set (G Phrygian-ish over a drone) with
  half-step (b2) and tritone tension available — unsettling, not major-key.

## Inputs / Outputs / Vibe

- **Input:** device-orientation (phone) with pointer/touch **drag fallback**.
- **Output:** audio-only Web Audio binaural, plus a minimal austere Canvas2D
  compass on near-black. No WebGL, no three.js, no extra dependencies.
- **Vibe:** intimate, dark, unsettling, contemplative — edges, not comfort.

## Graceful degradation

- **No `DeviceOrientation.requestPermission` / declined / no sensor** → falls back
  to drag-to-turn and the on-screen text says so.
- **No HRTF panner support** → falls back to equal-power `StereoPannerNode`
  spatialization (azimuth relative to heading), with an amber on-screen note.
- **Idle (silent reviewer)** → auto-rotating heading so presences still sweep
  across the stereo field and the compass still turns, with zero interaction.
- Audio/orientation calls are wrapped so nothing throws if an API is missing.

## Named references

- **Janet Cardiff** — *The Forty Part Motet* and *Her Long Black Hair*
  (walk-among-voices spatial sound; standing inside a moving choir of voices).
- **Pauline Oliveros** — *Deep Listening* (attention as the instrument).
- HRTF / binaural background: **ImmersiveFlow** (arXiv 2601.12950) and the
  **ASAudio** spatial-audio survey (arXiv 2508.10924).

## Honest limitations

- HRTF quality is the browser's generic head model — it is not personalized, so
  front/back confusion can occur; **headphones are essential** (speakers collapse
  the effect entirely).
- `DeviceOrientationEvent.alpha` (compass heading) varies in reliability and
  reference frame across devices/browsers and can drift; for a reviewer on
  desktop the drag fallback is the reliable path.
- Only the horizontal plane (azimuth) is used for turning; presences have a small
  fixed vertical offset but you cannot yet look up/down.
- No HTTPS-gated `absolute` orientation calibration — heading is relative, so the
  "north" you start facing is wherever you happened to be pointing.
- The compass is intentionally minimal and not meant to be looked at while
  playing; it exists so a silent glance still reads as something alive.
