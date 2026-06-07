# Cascade Bloom — Dream 377

**Route:** `/dream/377-kids-cascade-bloom`

---

## The one question

What if a 4-year-old could tap glowing seed-pods that fill with light, and when a pod overflows it BURSTS — flinging light to its neighbours and triggering a chain-reaction *bloom* that cascades across the whole garden, and every burst sings a note? Small taps sometimes cause tiny ripples and sometimes set off a huge avalanche — that surprise IS the toy.

---

## What it is

A bioluminescent garden of 24×16 seed-pods that obeys the Abelian sandpile model (self-organized criticality). Each pod holds 0–3 grains of light. Tapping anywhere adds a grain; when a pod reaches 4 it **topples** — losing 4 grains and giving 1 to each orthogonal neighbour, which can trigger further topples. The cascade resolves over successive animation frames (not all at once) so the avalanche propagates visibly as an expanding ring of light and sound.

Most taps cause a tiny shimmer. Occasionally one tap sends a bloom sweeping the entire screen. The ratio of small to large avalanches follows a power law — this is self-organized criticality in action, and the unpredictability is the game.

---

## Design

### Core mechanic — Abelian sandpile
A 24×16 grid. Each cell holds an integer 0–3. Tap → add 1. Cell ≥ 4 → topple (subtract 4, add 1 to each of 4 orthogonal neighbours; edge grains are lost). Cascades resolved at ≤ 12 topples/frame so the avalanche "wave" is visible at ~60 fps. Self-organized criticality produces power-law avalanche sizes: P(s) ~ s^−(3/2).

### Render — WebGL2 / GLSL ES 3.00
Two textures uploaded each frame:
- `uGrid` (R8): grain count 0–3, normalized 0–1.
- `uFlash` (R32F): per-cell burst flash 0–1.

Fragment shader draws each cell as a rounded seed-pod (SDF-based rounded rectangle) whose hue shifts teal→amber→coral→gold→white with grain count. On topple, an expanding ring burst overlays the cell in white-gold. Background: deep indigo → teal-indigo gradient. Bioluminescent garden vibe.

### Audio — Web Audio API (built from scratch)
- **Bell/mallet voice per topple**: sine fundamental + 2nd partial at ×2.76 (inharmonic, bell-like), quick exponential decay, 2200 Hz lowpass.
- **D-Dorian scale only**: D E F G A B C, D3–A4 (12 notes). Row maps to pitch; no F#, no Bb, no C-major pentatonic.
- **Drone pad**: D2, A2, D3 triangle oscillators with per-LFO detune drift and a breathing lowpass (0.12 Hz LFO on filter cutoff).
- **Limiter**: `DynamicsCompressor` at −8 dB threshold, ratio 20:1 — a 50-note avalanche never clips.
- **Voice cap**: 8 simultaneous voices; oldest gain-ramped to 0 when exceeded.

### Kids design (hard constraints)
- No reading required to play. Giant tap targets (whole cells, ≥64 px on iPad).
- Immediate audible + visible response to every tap.
- **Auto-demo**: if untouched for 4 s, drops a grain on a random cell every 700 ms → hands-free bloom for exhibit/attract mode. First human tap stops it.
- Audio created/resumed only after first user gesture (iOS-safe).
- No fail states, no timers, no harsh sounds.

---

## Typography & palette notes
- Hero title: `text-3xl`/`text-4xl`, `text-white/95`.
- Body/secondary: `text-base text-white/75` or `text-white/80`.
- Accent: `text-amber-300/90`, `text-emerald-300/95` (success), `text-rose-300` (error/warning).
- Background: `bg-[#0a0a1c]` (deep indigo).
- All buttons: `min-h-[44px] px-4 py-2.5`.

---

## Named references

1. **Bak, Tang & Wiesenfeld** — "Self-organized criticality," *Physical Review Letters* 59, 381 (1987). The Abelian sandpile model: toppling rules, power-law avalanche size distribution, self-organized criticality. This is the direct mathematical foundation of the toy's cascade mechanic.

2. **"Echoes of the Land"** (arXiv:2507.14947, 2025). An interactive installation that sonifies a spring-block self-organized-criticality earthquake model as emergent audiovisual cascades — the clearest recent precedent for mapping SOC topple events to musical notes and visual bursts as we do here.

---

## Self-assessment

### What works well
- **Novel technique**: The Abelian sandpile / SOC cascade is genuinely new to this lab and the self-organized criticality property is preserved — the grid builds toward criticality and large avalanches emerge naturally.
- **≥3 subsystems**: (1) sandpile CA + cascade engine, (2) WebGL2 GLSL renderer with dual textures and pod SDF, (3) Web Audio bell synth + D-Dorian mapping + drone pad + DynamicsCompressor limiter, (4) auto-demo attract mode.
- **Named references**: Bak–Tang–Wiesenfeld (1987) + Echoes of the Land arXiv:2507.14947 (2025) — both cited in-code and in the design notes UI.
- **Recent research tie**: arXiv:2507.14947 directly informs the choice to sonify SOC topple cascades as audiovisual events.
- **Kids design**: No reading required; auto-demo attract mode; large tap targets; gentle audio that can never clip.
- **D-Dorian only**: Row-to-pitch mapping is correct D-Dorian, no F#/Bb, no C-major pentatonic.

### What's rough / unverified
- The `TOPPLES_PER_FRAME = 12` constant and `FLASH_DECAY = 0.91` have not been tuned on real 60fps hardware — large avalanches may feel too fast or too slow; a small tweak to `TOPPLES_PER_FRAME` (try 6–20) adjusts drama.
- Pod SDF aspect ratio uses `uGridSize.x / uGridSize.y` which looks correct on widescreen but may appear squished on narrow portrait viewports.
- The R32F flash texture upload path requires `EXT_color_buffer_float` on some WebGL2 implementations; if this causes issues the fallback is to normalize flash to 0–255 and use `gl.R8`.
- Verified via static analysis only — no real-device GPU/audio test.
