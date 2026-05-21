# Resonance Dream Lab — Exploratorium concept

**Created**: 2026-05-21 by Karel + Claude.
**Status**: Concept spec — not yet built. This document is a brief the Dream Agent (and Karel) can refine into specific prototypes.

---

## The pitch

Imagine a small room at the **Exploratorium** (San Francisco) where a visitor — or several visitors at once — walks in and **becomes the music**. No screens, no buttons. The room **listens** (mics + cameras), **interprets** (body position, movement, voice, footfalls), and **responds** (projection-mapped visuals on the walls + spatialized audio from speakers around the room). Each visitor's body is an instrument; the collective is a piece.

The piece is **always different** — the room reads who's there and what they're doing in real time. A toddler running in circles makes a polyrhythmic loop; an adult standing still and humming makes a sustained drone; two people moving together cross-fade into a duet.

The Exploratorium's "Listen" collection (Listening Vessels, Archimedes, the Bone Conduction exhibits) already explores how visitors **perceive** sound. The Resonance Dream Lab inverts that — visitors **make** sound, embodied and collectively. It's a calm, contemplative counterpart to the louder physics exhibits.

---

## Why Exploratorium specifically

- They already have the "Seeing & Listening Gallery" — sound + perception is part of their DNA.
- Their **Listening Vessels** (parabolic dishes 80 feet apart) prove visitors *love* sound-as-exhibit, but those are passive. Resonance flips it: you don't just listen, you compose.
- Their audience skews kid-and-family — pairs naturally with the **Kids** zone (KIDS.md). A 4-year-old should be able to enter, do something, and the room sings back.
- They've shown willingness to host artist-driven works in their After Dark series (adult-only evenings).

---

## What the visitor experiences

Walking in:
- The room is dim, ambient, contemplative. A soft pad drones from invisible speakers all around. Walls are projection surfaces — slow shifting shaders, like watching a calm pond.
- A small floor mat near the entrance with a footprint diagram and one sentence: **"Move slowly. The room is listening."**

Standing in the room:
- An overhead RGB-depth camera identifies your body. The projector picks out a soft glow on the wall directly behind you — the room is aware you're there.
- You hum a note. The drone shifts to harmonize with your pitch. The glow on the wall pulses with your voice's loudness.
- You take a step. A short melodic phrase plays from the direction you stepped toward — like the room is whispering back.
- You stand still. The piece settles around you. Your stillness is heard.
- You raise an arm. A new instrument joins — a piano flourish, then sustained pad. Drop the arm: it fades.

If a second visitor enters:
- Their glow is a different color. The room cross-fades the harmonization between the two of you, finding intervals that make musical sense (fifths, fourths, thirds).
- Move together: the two voices align. Move apart: they branch into call-and-response.
- Children naturally find this — adults take longer to let go.

Leaving:
- Step back onto the entry mat: the room slowly fades the piece you made into a final cadence and resolves. A 3-second silence, then the ambient drone returns for the next visitor.

---

## Technical architecture (browser-first, low-budget)

Goal: prove the concept on **commodity hardware** before committing to bespoke installation engineering.

### Sensors

| Sensor | What it does | Cost / source |
|---|---|---|
| **2× RGB-depth cameras** (Intel RealSense D455 or Azure Kinect) | Body skeleton tracking, position in room, multi-visitor (up to 6 concurrent) | ~$500 each, off-the-shelf |
| **MediaPipe + plain webcams** (fallback / supplement) | Face/hand landmarks; cheaper alternative if depth cameras are overkill | Free, runs in browser |
| **2× directional mics** (Shure SM7B or AT4040) | Voice / hum capture; reject room noise | ~$300 each |
| **Pressure-sensitive floor mat** (entry zone only) | Detect first-step entry trigger | $200 commercial mat |

### Compute

- One mid-tier PC (M2 Mac Mini or equivalent NVIDIA box) running Chromium fullscreen
- All processing in **WebGPU + AudioWorklet** in-browser — no native install, no GPU drivers, runs on the Resonance dream stack we already have
- MediaPipe Pose runs at 30fps on integrated GPU
- RealSense → WebRTC → browser via a tiny Node bridge

### Output

| Output | What it does | Cost |
|---|---|---|
| **2× short-throw projectors** (Optoma GT2000HDR) | Wall projection mapping | ~$1,500 each |
| **4-channel speaker array** | Stereo + 2 surround = basic spatialization | $1,000 |
| **Ambient light strips** (Philips Hue / DMX) | Subtle color reinforcement around the room edges | $400 |

Total bill of materials: **~$5,500**. Cheaper than most museum AV installs.

### Software

- Re-use the dream zone's existing WebGPU + Three.js stack — same code that runs `/dream/15-webgpu-fluid`, `/dream/21-three-mesh-av`, etc.
- New module: **MediaPipe → AudioWorklet bridge** — body landmark deltas become MIDI-like control signals
- Spatial audio: Web Audio API's `PannerNode` with HRTF for the headphone version (which is where prototypes start), then 4-channel surround for the install
- Projection mapping: a calibration UI we ship as a regular `/dream/77-projection-mapping-sandbox` prototype (already in the IDEAS queue) — quad-warp + edge-blend in WebGPU

---

## Station / zone ideas (multiple parallel installations)

The lab doesn't have to be one big room. Could be **5 small interactive stations** along a single wall, each ~6ft wide, each a different mode:

1. **Voice → Color station** — hum / sing into a single mic. Pitch becomes a colored brush stroke on the wall. Build a painting in 30 seconds. Calm, single-visitor.
2. **Body → Drum station** — step pads on the floor; each step plays a percussion sound. Multi-visitor can groove together. (Existing tech: floor-mounted pressure sensors, no cameras needed.)
3. **Two-Person Harmony station** — two listening vessels (riffing on the Exploratorium's classic) at 10ft apart. Each visitor's voice picked up; the two voices harmonize live, then the room plays them back as a duet. Highest emotional impact.
4. **Movement Mirror station** — a single visitor in front of a depth camera. Their silhouette is projected on the wall, and their movement drives an audio-reactive shader. Strange-attractor visuals (we have this — `/dream/10-strange`) follow the visitor's gestures.
5. **Group Cymatics station** — a vibrating plate visible through plexiglass, real Chladni patterns. Visitors hum and the patterns form. Bridges the digital prototypes with physical material. (Lower tech-budget, higher wonder-budget.)

A 6th, "lounge" station: a quiet bench facing a projection. Past visitors' contributions are stitched into an ambient piece that plays continuously. Your turn at one of the active stations becomes part of the lounge piece — closing the loop.

---

## What this becomes if it works

If the small install runs for 3 months and visitors respond, the natural escalation:

- **A bigger room** — full ~600 sqft with 360° projection and 8-channel surround. Possible at SF MOMA or Asian Art Museum.
- **A traveling version** — flight-cased modular install for galleries, festivals, science museums (Boston Museum of Science, Smithsonian).
- **A research collaboration** — Stanford CCRMA or NYU Music Tech for studies on embodied music-making + accessibility.
- **A consumer at-home version** — your phone + 2 Bluetooth speakers in a dim room. Resonance's existing app gets a "lab mode."

---

## Risk + reality check

- Depth-camera + MediaPipe tracking in a public space with multiple bodies is **flaky** under bad lighting / occlusion. We'd want a fallback (single-mic mode) when tracking fails.
- Multi-visitor audio: cross-talk between mics, false triggering. Real install would need acoustic isolation per station.
- Museum partnerships are slow — pitch → curator review → installation slot is typically 6–18 months.
- The Exploratorium specifically: highly selective, has a long-standing Tactile Dome / Listening Gallery legacy to honor.

The 5-station modular approach is the safer path — each station is independently valuable and the install can be scoped to whatever space the museum offers.

---

## How the agent should use this doc

The Exploratorium concept is **R&D direction**, not a near-term build target. The agent's role:

- During build cycles: prototype the **browser equivalents** of these stations (e.g., `77-projection-mapping-sandbox` is already in IDEAS — that's directly seeded by this doc).
- During research cycles: monitor for fresh material on **MediaPipe room-scale tracking**, **WebGPU compute shaders for projection mapping**, **museum-scale generative installations** (Refik Anadol's *Latent City* at BRUSK 2026 is a great reference point), and update this doc when new techniques emerge.
- Tag any prototype directly inspired by an Exploratorium station: `**Inspired by**: EXPLORATORIUM.md station 4` in the README.

The dashboard can eventually surface an "Install candidates" filter: prototypes that work in headphone + screen form AND could scale to room form.

---

## Sources (initial — to extend)

- [Exploratorium "Listen" collection](https://www.exploratorium.edu/exhibits/collection/listen) — Listening Vessels, Archimedes, Bone Conduction
- [Exploratorium Sound subject](https://www.exploratorium.edu/exhibits/subject/sound)
- MediaPipe Pose (Google AI) — 33 landmarks at 30+fps on commodity webcams
- Refik Anadol Studio — *Latent City* at BRUSK (May–Nov 2026), reference for museum-scale AI-driven audio-visual installation
- Bristol+Bath Creative R&D — MediaPipe-to-OSC bridge for expanded performance (proven pattern for body→audio mapping)
