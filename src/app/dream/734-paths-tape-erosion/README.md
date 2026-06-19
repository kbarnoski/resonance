# Tape Erosion

**Dream prototype 734** — Paths series

Karel Barnoski's solo piano recording "Welcome Home" plays as a long, slow generative arc — slowly disintegrating and re-forming over approximately seven minutes. The spectrum thins and smears; motifs vanish and ghost back transformed, never an exact repeat. A living, eroding memory of his music rendered as decaying magnetic tape.

---

## Named References

**William Basinski — *The Disintegration Loops* (2002)**
Basinski accidentally documented the physical decay of his old 1980s tape loops while digitizing them. The magnetic oxide shed from the tape with each playback pass; the music literally fell apart in real time, never to be recovered. Each loop became a unique meditation on entropy, loss, and the materiality of recorded sound. This piece builds a software analogue: a fragment shader erodes the spectral image on every frame, the field accumulating memory and decay as magnetic domains do.

**Brian Eno — *Music for Airports* (1978) / *Reflection* (2017)**
Eno established ambient music as a long-form, self-evolving system — "as ignorable as it is interesting." *Music for Airports* used tape loops of varying lengths to produce perpetual non-repetition. *Reflection* took that further with an iOS generative system that never repeats in a human lifetime. The 5-movement arc here borrows that sense of gradual, inevitable change, with smooth interpolation between states so no transition is perceptible in real time.

**Ryoji Ikeda — Spectral-Feedback Lineage**
Ikeda's data/noise art treats raw signal as visual material — spectrograms, test tones, and binary data become luminous bodies. His aesthetic: high contrast, precise frequency mapping, the data as the art itself. The feedback loop in the WebGL display shader lets the spectrogram image accumulate its own history, smear under erosion parameters, and dissolve into noise — the visual and sonic decay are one.

---

## Architecture

### Files

| File | Purpose |
|------|---------|
| `audio.ts` | Fetch Karel's recording · fallback synth · grain engine · ErosionEngine interface |
| `movements.ts` | 5-movement state machine with smooth interpolation · GLErosionParams + ErosionParams |
| `webgl.ts` | Raw WebGL2 ping-pong FBO spectrogram · Canvas2D fallback |
| `page.tsx` | React component · UI · loop · cleanup |

### Audio Engine

Karel's recording is played through a granular engine: short 80–140ms Hann-windowed grains are scheduled ahead of time with a slowly-advancing scrub position (the recording's "read head" advances at 0.4× speed, taking ~2–4 minutes to traverse). Each movement modulates:

- **Rate drift** — playback rate deviation per grain (±15%)
- **LP cutoff** — tape head high-frequency roll-off
- **Dropout probability** — random grain silencing (tape damage)
- **Reverb wet** — convolution reverb wash (decayed space)
- **Grain density** — grains per second
- **Master gain** — overall level

A soft sub-bass drone (C2) keeps the piece from ever going fully silent.

### WebGL2 Renderer

Two ping-pong R32F float framebuffers accumulate the spectral field. Each frame:

1. **FFT upload** — 1024-bin frequency data normalized to [0,1] and uploaded as a 1×1024 float texture
2. **Feedback pass** — samples the previous FBO with Gaussian smear (horizontal + vertical), applies exponential decay, horizontal advection (tape movement), and random magnetic noise; deposits the new FFT column on the right edge
3. **Display pass** — applies the Ryoji Ikeda-inspired colormap (black → indigo → teal → warm white) with scanline noise and vignette

The erosion parameters (decay, smear, bleed, noise, brightness, advection velocity) are smoothly interpolated between movements by the state machine.

### Movements

| Movement | Duration | Character |
|----------|----------|-----------|
| **Intact** | 1:10 | Full recording, minimal erosion, crisp spectral image |
| **Eroding** | 1:30 | Dropout begins, smear grows, LP cutoff drops |
| **Sparse** | 1:40 | Fragments only, heavy reverb, field dissolving |
| **Ghost** | 1:40 | Near-silent; barely-there traces, maximum smear/decay |
| **Reforming** | 1:30 | Parameters walk back toward coherence; never fully intact |

Transitions use a 12-second crossfade zone with a smoothstep curve so movements bleed into each other imperceptibly.

### Graceful Degradation

- **No audio fetch** → offline-rendered fallback synth (detuned C major arpeggio, ~12s, loops), amber notice in UI
- **No WebGL2 / no EXT_color_buffer_float** → Canvas2D scrolling spectrogram with comparable colormap, amber notice in UI
- **Never blank-screen** — the canvas renders from the first animation frame regardless of which path was taken

---

## Colophon

Built for the Resonance dream lab. Audio: Karel Barnoski, "Welcome Home" (solo piano). No recording, no external network writes. Read-only GET to `/api/audio/549fc519-f7fc-4c38-a771-adaad2edbc81`.
