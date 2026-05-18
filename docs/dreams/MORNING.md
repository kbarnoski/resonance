# Morning digest — last updated 2026-05-18 UTC (Cycle 23)

## New since yesterday

- **Cycle 23 was a research sweep** (no new prototype). 7 findings in RESEARCH.md §§22-28.
  Three new prototype ideas queued; one existing plan upgraded. Details below.

## Research findings worth a look

**1. HappyHorse-1.0 upstages Seedance 2.0**
Alibaba's new model (launched April 26, 2026 on fal.ai) topped the AI video leaderboard over
Seedance 2.0 and Kling 3.0. It generates video + audio in a single 15B-parameter Transformer
forward pass — no separate MMAudio V2 step. The `ghost-animate` plan now should use HappyHorse.
Budget TBD (pricing not yet published, comparable models run $0.05–0.50/sec on fal).

**2. Google Veo 3.1 also on fal.ai**
$0.40/sec with audio at 1080p. Supports image-to-video AND video extension chaining (up to ~2.5
minutes via 20 × 7s extension steps). Could make a 30-60 second Ghost cinematic arc, not just 8s.

**3. Three.js is already installed — we haven't used it**
`three@0.182`, `@react-three/fiber@9.5`, `@react-three/drei`, and `@react-three/postprocessing`
are all in `package.json`. 20 prototypes and none use 3D mesh geometry. The community in 2026 is
building bioluminescent audio-reactive 3D forms with TSL node materials (compiles to WGSL or GLSL
transparently). This is the most obvious gap in the sandbox. Next prototype: `21-three-mesh-av`.

**4. AudioWorklet pitch shifting = real-time harmony**
The `phaze` project (GitHub) shows a working Web Audio AudioWorklet phase vocoder. Inline-able
as a Blob URL, zero npm deps. Enables a "become your own accompanist" prototype: mic → harmony
copy (+7 semitones / +12 / -12) → HRTF panned to a 3D position. First prototype that *transforms*
audio rather than analyzing or synthesizing from scratch.

**5. Latent Granular Resynthesis (arxiv 2507.19202)**
Training-free timbre transfer: encode a reference sound (cello, thunderstorm) as a neural codec
latent codebook → match your playing grain-by-grain to the nearest codebook entry → decode =
your notes, their timbre. Extends `18-granular` into cross-timbre territory. Needs server-side
inference (Hugging Face Spaces demo exists). Not next-cycle-buildable but worth tracking.

## In progress / partial

- **Sound for cymatics** — `19-cymatics` demo oscillator still silent. One-line fix.

## Open questions for Karel

- **`ghost-animate`**: Now prefer HappyHorse-1.0 (or Veo 3.1) over Seedance 2.0. Both are
  better quality and HappyHorse is now #1 ranked. Both need FAL_KEY + approval. Which do you
  want to try first? HappyHorse for raw quality, or Veo 3.1 for the video-extension capability
  (30-60s cinematic scene vs. 8s clip)?
- **`elevenlabs-compose`**: $0.80/min streaming structured arc music. Still pending your approval.
- **`reference-compose`**: MiniMax Music 2.5 style match, $0.035/track. Still pending FAL_KEY + approval.
