# Ghost SFX — design notes

**Route**: `/dream/53-ghost-sfx`  
**Cycle**: 64  
**Status**: demoable (pending endpoint confirmation)

## What it does

Six Ghost narrative scenes, each with three AI-generated ambient sound clips
placed in 3D space around the listener via Web Audio HRTF PannerNode.

Click a scene → three API calls fire concurrently to `fal-ai/elevenlabs/sound-generation`.
Each returned MP3 is decoded to an AudioBuffer and looped through a PannerNode
at the scene's prescribed position (azimuth, elevation, distance from listener).

Press ▶ Play → all three sources loop simultaneously. Wear headphones —
the HRTF model renders the directional illusion correctly above ~1 kHz.

Canvas: top-down sphere view. F = listener's forward direction. Dots show each
source's azimuth and distance. Elevation (±°) is shown below each label and
applied to the PannerNode but not shown in the 2D top-down projection.

## Architecture

- `page.tsx`: client component. `loadScene()` fires 3 concurrent `fetch` calls
  to `/dream/53-ghost-sfx/api`. Each response URL is decoded via `AudioContext.decodeAudioData`.
  Play creates `AudioBufferSourceNode → PannerNode → GainNode → destination` per source.
  Toggle mute via `GainNode.gain.setTargetAtTime()` (smooth 50ms transition).
  Canvas runs in a `requestAnimationFrame` loop inside a `useEffect`.

- `api/route.ts`: server route. Calls `fal-ai/elevenlabs/sound-generation` with the
  scene's text prompt. Returns `{ url }`. FAL_KEY never exposed to browser.

## Scene acoustic design

| Scene | Front | Right | Back/Left |
|-------|-------|-------|-----------|
| Stone Chamber | Piano (−30°, 0°) | Water drip (+75°, −20°) | Hum (+160°, +5°) |
| Root Portal | Root tone (0°, −30°) | Bird call (+45°, +25°) | Leaves (−60°, 0°) |
| Underground Pool | Deep resonance (0°, −40°) | Ripple (+80°, 0°) | Ceiling drip (+150°, +35°) |
| Tiny Planet | Wind (0°, 0°) | Bird pass (+90°, +55°) | Shimmer (−90°, +40°) |
| Forest Dawn | Piano (+10°, 0°) | Canopy (+20°, +60°) | Stream (−85°, −10°) |
| Cosmic Ascension | Vast drone (0°, 0°) | Harmonic rise (+60°, +30°) | Sub pulse (0°, −50°) |

## Polish ideas

- **Crossfade between scenes**: instead of stopping/restarting, fade old sources out
  as new ones generate. Requires pre-loading the next scene's clips.
- **Live mic mode**: mix HRTF-positioned generated sounds with `1-live` band energy
  so the Ghost scene reacts to live audio.
- **Source drag on canvas**: let Karel drag dots to reposition sources in real time,
  updating `PannerNode.setPosition()` live.
- **Session storage cache**: store generated clip URLs per scene in `sessionStorage`
  so re-selecting a scene replays without re-generating.
- **Longer clips**: generate 10–15s clips for less noticeable loop points.
