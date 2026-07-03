# 1124 · Noise Veil

`state: Ganzfeld sensory-homogeneity hallucination · pole: cosmic-ambient (warm→oceanic)`

## The one question

**What if the _sound itself_ composed a drug-free hallucination?** — a Ganzfeld
chamber where you rest your gaze in a soft uniform field and a spectrally-morphable
noise bath (white↔pink↔brown) steers what imagery your own brain manufactures.

## How it works (subsystems)

Four subsystems move as one seeded field:

1. **Spectral-noise engine** (`noise.ts`) — a `mulberry32(seed)` PRNG generates
   three base buffers _once_ (white, pink via Paul Kellet's economy filter, brown
   via a leaky integrator). An **equal-power crossfade** morphs continuously
   between them, so slope `0 = white` (flat), `0.5 = pink` (−3 dB/oct),
   `1 = brown` (−6 dB/oct, sub-heavy "water"). No `Math.random` on any per-frame
   path.
2. **Spatial panner field** (`audio.ts`) — the mixed noise is decorrelated by
   short per-voice delays and spread across **five HRTF `PannerNode`s** that
   slowly orbit the listener, so the bath surrounds you instead of sitting in
   your head. The noise _is_ the instrument — no oscillators, no tonal drone.
3. **Macro-swell controller** (`field.ts`) — a bank of glacial seeded LFOs
   (0.02–0.09 Hz) produces the study's "wave after wave" swells. It is a **pure
   function of time + controls**, read by both audio and visuals, so the image
   animates instantly on load (before any audio) and stays locked to the sound
   once it starts.
4. **three.js volumetric fog** (`scene.ts`) — ~260 large, very soft billboard
   puffs scattered through a 3D box the camera sits _inside_ (real parallax +
   `FogExp2` depth wash, **not** a flat 2D fragment field). Heavy overlap makes a
   near-uniform luminous Ganzfeld field. The slope drives palette and current:
   white → bright even, pink → warm amber glow, brown → **deep teal, slow
   oceanic drift**. Mean luminance stays gentle and high — never a dark void.

**Input:** passive gaze + a spectrum-morph control (slider / ←→ keys) + intensity
(↑↓). No tap-to-seed. **Output:** three.js volumetric soft-fog + spatialized Web
Audio noise. **No flicker at all** — only slow luminance/hue drift; honors
`prefers-reduced-motion` by slowing everything further.

## Tag line

`INPUT: passive gaze + noise-spectrum morph + intensity` ·
`OUTPUT: three.js volumetric fog + spatialized Web Audio noise` ·
`TECHNIQUE: spectrally-shaped 1/f noise synthesis → HRTF panner field → macro-swell → volumetric fog` ·
`PALETTE: warm→oceanic, shifts with noise color` · `POLE: cosmic-ambient`

## How it's distinct from `1043-dreamachine`

The lab already has a flicker-driven Dreamachine that uses a Ganzfeld field. Noise
Veil is different in kind: it is **audio-LED** (spatialized noise is the primary
driver; the visual is a subordinate uniform volumetric field), the
**white↔brown spectral morph is the instrument** (spectrum shapes the imagery
theme — the study's actual finding), and it uses **no flicker whatsoever** (slow
luminance drift only).

## Ambition-floor criteria hit

- **#1 never-used technique** — audio-led, "spectrum-shapes-hallucination-content"
  Ganzfeld; grep-fresh in this lab (nothing else makes the noise's 1/f slope the
  imagery instrument).
- **#2 ≥3 subsystems** — four: spectral-noise engine + spatial panner field +
  macro-swell controller + three.js volumetric fog.
- **#3 named references** — i-Perception 2025 / Metzger / Turrell (below).
- **#5 today's research** — grounded in the 2025 _i-Perception_ Ganzfeld study.

## References

- **Pistolas, Smets & Wagemans**, "Wave after wave: The suggestibility of noise in
  the experience of multisensory hallucinations under multimodal Ganzfeld
  stimulation," _i-Perception_ (SAGE), 2025. Key finding: in a multimodal
  Ganzfeld, the **spectral character of the noise shapes the CONTENT** of the
  hallucination — **brown noise significantly increased water/fluid-themed
  hallucinations vs white**. That 1/f-slope-steers-the-theme result is the
  load-bearing idea here.
- **Wolfgang Metzger**, Ganzfeld (1930) — sensory homogeneity as the substrate.
- **James Turrell**, _Ganzfeld_ light-rooms — the uniform-field lineage.
- **Refik Anadol**, _Dataland_ (Grand LA, June 2026) — framed as echoing
  Turrell/Kusama/Flavin; the contemporary immersive-field context.

## Honesty discipline

**No health or clinical claim.** Ganzfeld imagery is a normal product of sensory
homogeneity, is viewer- and hardware-dependent, and cannot be verified in a
headless box. The piece _induces the conditions_; it does not cause a fixed
experience.

## What to verify on real hardware

- **Headphones are essential** — the HRTF panner field and the white/pink/brown
  distinction collapse on laptop speakers.
- Confirm the **spectral morph is audible and correct**: white should sound
  bright/hissy, brown should sound deep and rumbly/oceanic, with pink between.
- Confirm the fog reads as a **soft uniform field** (rest gaze at the center,
  low light, a minute or two) — not as visible discrete puffs. Adjust puff
  count / opacity if a given display makes structure too legible.
- Confirm **mean luminance stays gentle and high** across the whole slope range —
  brown/teal must not fall to a dark screen on dim panels.
- Whether any imagery actually arises, and whether brown biases it toward
  water/fluid themes, is **inherently subjective and per-viewer** — this box
  can only supply the conditions.
