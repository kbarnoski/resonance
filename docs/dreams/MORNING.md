# Morning digest — last updated 2026-05-22 UTC (Cycle 117)

## What happened this cycle

**Cycle 117 was a research cycle.** Last research was Cycle 95 (22 cycles ago, far past the 3-cycle threshold). All 5 seeds from that sweep are now built. This cycle surveyed: new fal.ai video models (Veo 3, Seedance 2.0), ElevenMusic, and three major AV artist works (Immersive Garden's Awwwards SOTD, Memo Akten's Whitney commission, Refik Anadol's DATALAND museum). 5 new prototype seeds queued for upcoming build cycles.

## 5 new seeds (Cycle 117)

| Route | Name | Deps | Cycles |
|-------|------|------|--------|
| `/dream/100-camera-song` | Camera orbiting = music: 6 journey orbs, HRTF gain falloff | R3F + drei (installed) | 1 |
| `/dream/101-ocean-presence` | Mouse presence disturbs WebGPU fluid → audio from velocity | WebGPU (no API) | 2 |
| `/dream/102-veo3-ghost` | Ghost LoRA → Veo 3 Fast cinematic video + native audio | FAL_KEY + budget OK | 1 |
| `/dream/103-listen-guide` | Guided listening of Karel's Paths recordings, attention lens | existing audio endpoint | 1 |
| `/dream/104-beat-cut` | Boids flock + onset detector → hard-cut camera snap (camSequencer) | R3F + drei (installed) | 1 |

**Highest priority builds**: `camera-song` (novel paradigm, zero deps) and `listen-guide` (uses Karel's real recordings, directly implements §165).

## Research highlights

- **Camera IS music** (§174) — Immersive Garden's "Artisans d'Idées" (Awwwards SOTD 2026) uses audio coupled to camera state instead of a clock. Your navigation through a 3D space IS the music. `camera-song` brings this to the Journey theme constellation.

- **Presence-driven fluid → sound** (§175) — Memo Akten's "The Thinking Ocean" (Whitney artport, Feb 2026) — WebGPU fluid driven by human presence, with audio synthesized from the fluid velocity field. Not audio-reactive; presence-reactive. `ocean-presence` inverts the typical audio→visual pattern entirely.

- **Veo 3 native audio on fal.ai** (§171) — $0.40/s Fast with synchronized audio (dialogue, ambience, foley) generated in the same pass as video. Closes the long-queued `ghost-animate` gap. `veo3-ghost` needs Karel's budget OK (~$2–3.20/clip).

- **Seedance 2.0** (§172) — ByteDance `bytedance/seedance-2.0/image-to-video`, ~$0.55–0.70 for 5s with native audio. 3× cheaper than Veo 3 Fast. Could run as a side-by-side quality comparison inside `veo3-ghost`.

- **ElevenMusic** (§173) — ElevenLabs AI music API, April 2026. Text → full song with vocals, 7/day free. Fourth music backend, potentially buildable now if ELEVENLABS_API_KEY is in Vercel env.

- **DATALAND** (§176) — Refik Anadol's Museum of AI Arts opens June 20, 2026 in LA. "Large Nature Model" trained on Smithsonian ecological data. Multi-species ecosystems with World Models → inspires `ecosystem-sim` (species interactions = sound).

- **Beat-cut camera** (§177) — Elekktronaut TD Tutorial #65 (May 12, 2026): camSequencer hard-cuts camera presets on audio onset. Hard cut (not lerp) = cinematic montage quality. `beat-cut` ports this to R3F/drei.

## Kids zone — full status

| Cycle | Prototype | Status | Notes |
|-------|-----------|--------|-------|
| 92 | `82-kids-color-piano` | demoable | **Karel loved ❤** |
| 96 | `83-kids-tilt-rain` | demoable | **Karel loved ❤** |
| 98 | `88-kids-hum-to-paint` | demoable | hum → colored brush strokes |
| 100 | `90-kids-puddle-jumper` | demoable | tap pond → ripples; zero permissions |
| 102 | `91-kids-character-band` | demoable | 5 animals, Toca Band-style |
| 104 | `92-kids-ghost-lullaby` | demoable | Ghost floats, tap/drag → notes |
| 106 | `93-kids-share-screen` | demoable | Two-finger co-play; pentatonic harmony |
| 108 | `94-kids-ghost-echo` | demoable | Spirit pond — tap → Ghost appears + fades |
| 110 | `95-kids-breath-bubbles` | demoable | Blow → bubbles float + pop |
| 112 | `97-kids-star-catch` | demoable | Tap falling stars → collect notes → replay |
| 114 | `98-kids-drum-circle` | demoable | 6 percussion pads; first rhythm prototype |
| 116 | `99-kids-panning-safari` | demoable | 5 animals + spatial panning; 🎧 headphones |

Cycle 118 is a kids cycle (118 % 2 = 0). No kids entries in the new seeds; needs a fresh kids prototype or a pick from earlier IDEAS.md.

## In progress / partial

Nothing blocked. `76-cymatics-on-piano-path` still waiting on Welcome Home track IDs.

## Open questions for Karel

1. **Welcome Home album track IDs** — `76-cymatics-on-piano-path` and `72-paths-visualizer` want to play your actual recordings. Needs audio IDs from the `journey_paths` table.
2. **Veo 3 budget OK?** — `veo3-ghost` costs ~$2–3.20/clip (Veo 3 Fast) or $0.55–0.70 (Seedance Fast). Worth building once you say go. Closes the "Ghost needs motion" gap.
3. **New loves?** Votes API still shows only `82` and `83`. Worth a listen: `99-kids-panning-safari` (new — best with headphones), `98-kids-drum-circle`, `81-cassette-speed`.
4. **CassetteAI vs ACE-Step** — after running `81-cassette-speed`, is the quality gap acceptable for quick-sketch use? That decides whether `6-compose` should switch backends.
5. **Venue demo** — `96-projection-mapping-sandbox` is ready for a real projector test.
6. **ElevenMusic** — is ELEVENLABS_API_KEY in Vercel env? If yes, music-with-vocals prototype is immediately buildable (free tier: 7/day).
