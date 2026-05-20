# 56 Ghost Voice

**Route**: `/dream/56-ghost-voice`  
**Cycle**: 69  
**Status**: `demoable`  
**Question**: What if each Ghost scene had a literal voice?

---

## What it does

Six Ghost narrative scenes. Each has a single line distilled from the journey's
emotional arc. Click a scene, click Narrate — the line is synthesized as speech by
Inworld TTS on fal.ai, then played back through a Web Audio HRTF PannerNode positioned
at **azimuth 0°, elevation 0°** (directly ahead at ear level). The voice appears to
float at the front-center of the listener's head — intimate and immediate.

While the narration plays, a character-by-character subtitle reveal reads out the line
below the canvas. The canvas animation responds to the narration's amplitude: the central
orb brightens and expands rings faster during louder speech.

---

## Design rationale

`29-scene-spatial` and `53-ghost-sfx` put synthesized and AI-generated sounds around
the listener at various azimuths and elevations. Ghost Voice is different: the voice
comes from dead center — directly ahead, eyes-level — the most intimate position in
3D space. The front-center position in HRTF is where you'd hear a person speaking
to you from very close range. This proximity is intentional.

The lines were chosen to be short, elliptical, and slightly enigmatic — like the
character's interior monologue, not a narration of events. "The resonance here is
ancient" doesn't explain the stone chamber; it inhabits it.

---

## Technical notes

- **API**: `fal-ai/inworld/tts` — Inworld TTS model on fal.ai. Endpoint name is a
  naming-convention guess; raw error shown in UI if wrong. Parameters: `text`,
  `voice_description` (style steering, not a voice clone — describes timbre and pace).
- **HRTF positioning**: `PannerNode.positionX/Y/Z` set to `(0, 0, -1)` with default
  listener orientation (`facing 0, 0, -1` / head up `0, 1, 0`). This places the source
  directly in front at 1m — the HRTF adds subtle room coloration and pinnae filtering.
- **Amplitude feedback**: `AnalyserNode.getByteTimeDomainData` → RMS per frame →
  drives orb size and ring spawn rate. Read directly in the rAF loop (not via state).
- **Subtitle timing**: characters revealed at `audioBuffer.duration × 850 / line.length`
  ms each, clamped to 40–90ms. Intended to complete before the narration ends.

---

## Scene lines

| Scene | Line |
|-------|------|
| Stone Chamber | "The resonance here is ancient. Let yourself be absorbed by it." |
| Root Portal | "Something stirs beneath the roots. A low note. Then silence." |
| Underground Pool | "The water remembers every sound that has passed through this place." |
| Tiny Planet | "A single breath. The horizon wraps around you." |
| Forest Dawn | "The first light is also the first sound. They arrive together." |
| Cosmic Ascension | "You are not rising. The world is receding." |

---

## Polish ideas for future cycles

- **Ghost SFX integration**: play `53-ghost-sfx` sounds beneath the narration
  simultaneously — ambient soundscape + voice in the same HRTF space.
- **Multiple takes**: request 2–3 variations and let Karel pick the best one
  for each scene.
- **Reverb per scene**: each scene's HRTF could be colored by a ConvolverNode
  with a scene-appropriate impulse response (stone chamber has more reverb than
  tiny planet's open air). Currently the voice is HRTF-dry.
- **Custom voice**: if Inworld TTS supports voice cloning, train a "Ghost" voice
  from the journey's existing narration samples.
- **Binaural integration**: play the narration through `42-binaural`'s α brainwave
  beat simultaneously — voice + entrainment as a unified experience.

---

## Budget

~$0.01–0.02 per narration line (Inworld TTS-1.5 Max pricing). FAL_KEY already in use.
