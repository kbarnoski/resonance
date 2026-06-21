# Body Ribbons

**Route:** `/dream/811-kids-body-ribbons`

## The one question

What if a 4-year-old's whole **BODY is a continuous musical score** — they wave their arms and dance, and their moving hands draw glowing ribbons across the screen that sing as they move, the way Xenakis's UPIC turned a child's drawing into music?

## How to play

Stand back so your whole body shows. Move your arms. That's it.

- **Left arm** draws a gold/amber ribbon and sings through the left voice
- **Right arm** draws a rose/violet ribbon and sings through the right voice
- **Raise your arms high** → higher notes (C-major pentatonic, never a wrong note)
- **Move fast** → louder, brighter ribbons; hold still → the note softly sustains then fades
- **Both arms raised high together** → gentle gold sparkles rain down
- An always-on warm drone (C2 + G2) means there is never dead silence

No camera permission? It plays and draws on its own with a dancing ghost body within 2 seconds.

## The mapping (body → music)

| Body | Sound | Visual |
|------|-------|--------|
| Wrist **height** (y position) | Pitch — C-major pentatonic, 2 octaves, snapped so no wrong notes | Ribbon traces the path through the pitch-space |
| **Speed** of movement | Loudness + ribbon brightness | Thicker, brighter trail segments |
| Wrist **horizontal position** (x) | Timbre shift (vibrato depth) | Trail extends left/right across screen |
| **Nose** position | Soft shimmer voice, offset pitch | — |
| Both wrists **above 0.4** | Gentle sparkle chord burst | Gold sparkles rain from wrist positions |

**Audio chain:** master gain (≤ 0.28) → lowpass BiquadFilter (7 kHz) → DynamicsCompressor (−10 dB threshold, 20:1 ratio) → destination. Attack ≥ 40 ms, release 1–3 s, portamento 80 ms.

## Technology

- **MediaPipe Pose Landmarker** (lite model, CDN runtime import, never bundled): 33 body landmarks at ~30 fps
- **Inline SVG** ribbons: Catmull-Rom smooth paths, multi-pass glow (gaussian filter) + bright core, age-faded via per-segment opacity
- **Web Audio API**: triangle oscillators with vibrato LFO, always-on C2+G2 sine drone pad, shimmer voice
- Coordinate space: MediaPipe y-down (0..1) → body-space y-up (−1..1); SVG viewBox `"-1 -1.2 2 2.4"` with `scaleY(-1)` transform so y-up renders naturally

## Named references

**Iannis Xenakis — UPIC** (1977). The Unité Polyagogique Informatique du CEMAMu: a graphic score interface where children drew curves on a tablet and heard them as synthesized sound. Xenakis wrote: "music becomes a game for children: they draw, they hear." *Body Ribbons* is the full-body version — the child's moving body IS the drawing tool, IS the score.

**¡Otro!** (IAIA Digital Dome premiere, April 2026, Rosanna Tavarez / Drew Trujillo). Real-time movement → sonification + generative imagery in an immersive dome. The current-art anchor for this lineage of embodied sonic instrument.

**Frid et al. — Interactive Sonification of Spontaneous Movement of Children** (Frontiers in Psychology, 2016). Children spontaneously read movement qualities out of sound and back again; cross-modal gesture-to-pitch mapping is legible even to very young children without instruction.

## Ambition self-rating

**7 / 10.** The UPIC-body mapping is clear and immediately playful. The SVG ribbon accumulation gives a real sense of a living score drawing itself. The audio chain is clean and safe. What's missing: (1) no persistent "score replay" (the UPIC's defining feature was playing back the drawn score), (2) SVG performance may degrade after long sessions with many path elements, (3) the sparkle and shimmer triggers are subtle — a 4-year-old might not discover them.

## Next-cycle deepening

**Score replay loop:** Record the last 8 seconds of body motion, then play it back as a slowly fading ghost ribbon while the child continues drawing new ribbons on top — giving the UPIC's core experience of "draw, then hear it play back." Add a gentle chime trigger (e.g. clapping hands together, detected via wrist proximity) to initiate replay. This would transform the prototype from an instrument into a genuine real-time composition tool.
