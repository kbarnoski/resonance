# 86 — sound → image → video

**Question**: what does your music *look like* when it moves?

**Route**: `/dream/86-sound-to-video`

---

## Pipeline

```
10s audio capture
      │
      ▼
Acoustic fingerprint
  - RMS energy (loudness bucket)
  - Spectral centroid (bass vs treble character)
  - Zero-crossing rate (tonal vs percussive)
  - 12-bin chroma vector (root note + major/minor)
  - Autocorrelation pitch (dominant frequency Hz)
      │
      ▼
Scene description (natural language)
      │
      ├── Image prompt → FLUX.2 Dev (landscape 16:9, 28 steps)
      │          │
      │          ▼
      │       Cinematic scene image (~15–25s)
      │          │
      └── Motion prompt → LTX-Video (image conditioned, 5s)
                 │
                 ▼
              Looping 5-second animated video (~20–45s)
```

---

## Scene selection matrix

| Energy | Centroid | Scene archetype |
|--------|----------|-----------------|
| low | low | Stone chamber — candle, mist, ancient carved walls |
| low | high | Forest dawn — misty trees, golden first light, dew |
| mid | low | Sea cave — bioluminescent blue water, stalactites |
| mid | high | Sunlit courtyard — golden stone, roses, warm light |
| high | low | Wild headland — storm waves, volcanic rock, sea spray |
| high | high | Cosmic nebula — swirling gas, star clusters, deep space |

---

## Motion prompt logic

| Energy | Motion description |
|--------|-------------------|
| < 0.20 | Extremely slow drift, meditative stillness |
| 0.20–0.45 | Slow camera glide, mist drifting, dreamlike |
| 0.45–0.70 | Flowing push, volumetric light rays, building energy |
| > 0.70 | Dynamic sweep, powerful elemental motion, epic |

---

## Endpoints used

| Step | Model | Endpoint | Cost |
|------|-------|----------|------|
| Image | FLUX.2 Dev | `fal-ai/flux/dev` | ~$0.05 |
| Video | LTX-Video | `fal-ai/lightricks/ltx-video` | ~$0.20 |

Total per generation: ~$0.25. FAL_KEY already in use; no new budget approval needed.

---

## UX flow

1. **Capture** — 10s waveform display + countdown; frame count shows analyzer is running
2. **gen_image** — status "Generating scene image…" + acoustic fingerprint readout
3. **gen_video** — image fades in immediately (1.6s transition); status "Animating…"
4. **done** — image stays visible; video appears below it as an autoplay looping `<video>`
5. **error** — image stays visible if already generated; red error message + retry button via "Demo" / "Start mic"

The progressive reveal (image first, then video) makes the wait feel productive — you see what the scene looks like 25s before the animation completes.

---

## What this prototype is

This is the "AI image gen inside AV" play Karel asked for. The audio isn't a trigger for abstract visuals — it's the semantic input that determines the entire aesthetic of both the image and the motion. A C-major chord at moderate energy generates a warm courtyard scene with a gentle drift. A powerful bass-heavy signal generates a wild headland with crashing waves. The acoustic fingerprint is the actual creative input; FLUX.2 and LTX-Video are the rendering engines.

Different from `57-sound-to-image` in two ways: (1) higher image quality (FLUX.2 Dev vs Schnell), (2) the image comes alive — it's not a static photograph, it's 5 seconds of the scene breathing.

---

## Polish ideas for next cycle

- **Cinematic mode toggle**: offer Veo 3.1 for $2.40/clip — much higher quality animation
- **Audio layer**: generate a MiniMax or ACE-Step ambient track matching the scene, play it alongside the video
- **Scene override**: let user pick a specific Ghost journey scene (Stone Chamber, Forest Dawn, etc.) instead of auto-detection
- **Gallery**: localStorage-save previous generations (image + video URLs) so Karel can compare across playing sessions
- **FLUX.2 endpoint**: swap to `fal-ai/flux-2` when that endpoint confirms stable (may have better quality than `flux/dev`)
