**For**: kids (4+)

# 🌻 Sing the Garden

## What & why
A 4-year-old hums or sings, and their voice doesn't just *place* flowers — it
**grows an organic garden whose spiral arrangement emerges on its own**, the way
a real sunflower head self-organizes. The garden is a warm-daylight three.js
WebGL point-field (thousands of pollen/petal points) that keeps slowly breathing
and growing even when the room is quiet, so it is visibly richer at minute 5 than
at minute 1. The question it answers: *what if a child's voice seeded a living,
self-organizing field instead of a static drawing?*

## How to play (no reading needed)
1. Tap the big **🌱 Start singing** button.
2. Hum, sing, or say "laaa" — every sound grows a glowing flower with a soft bell.
3. Hold a note to make a bloom swell and grow faster; go quiet and the garden
   gently sways and **sings itself back** with a soft bell arpeggio from the
   flowers you already grew.
4. **No mic?** The garden auto-sings ("ghost hum") so it is fully demoable on a
   desktop, and you can **tap anywhere** to plant flowers (higher tap = higher note).
5. A small **Design notes** link (top-right) reveals what's happening.

## Mappings
- **Pitch** → flower **hue** (low = warm rose/gold, high = cool sky/violet),
  octave-collapsed and snapped to a **C-major pentatonic** so there is never a
  wrong note.
- **Loudness (RMS)** → how **vigorously** the field grows and how **bright** the
  bloom pulse is.
- **Held note** → growth accelerates and the field swells (breathing).
- **Silence** → gentle sway + autonomous self-organizing growth + a soft
  generative bell arpeggio from already-grown sites.

## The technique (emergent phyllotaxis)
The golden-angle sunflower spiral is **not hardcoded**. Instead, a growth front
sits at a radius that slowly expands; each sung note deposits a new growth site
in the **largest angular gap** on the current front, and a local **inhibition**
field damps sites placed too close to existing ones. Repeatedly filling the
largest gap self-organizes the angular increment toward the golden angle
(~137.5°) — a lightweight, reaction-diffusion-flavoured version of phyllotaxis as
an *emergent* process rather than a formula. The garden therefore grows *into
being* under the child's voice and keeps organizing itself afterward.

## Audio (kid-safe)
- Pure Web Audio API. No samples, no network, no AI, no recording stored. Mic is
  used **only** for live pitch/RMS analysis — never wired to output, never saved.
- Master chain: `gain 0.28 → lowpass 7000 Hz → compressor (−10 dB, 20:1) →
  destination`. No loud transients, no high ringing.
- Always-on soft **C2 + G2** ambient pad so it never feels broken.
- AudioContext is created/resumed inside the first tap (iOS requirement).
- Pitch detection is hand-rolled **autocorrelation (Chris Wilson ACF)** with a
  noise-floor gate — no npm dependency.

## Graceful degradation
- Mic denied/unavailable → visible `text-rose-300` notice + working auto-singer
  and tap-to-grow fallback.
- WebGL unavailable → friendly notice, no crash.
- Full teardown on unmount: animation frame cancelled, AudioContext closed,
  three.js geometry/material/renderer disposed, mic tracks stopped.

## Named references
- **arXiv 2509.06498, "Phyllotaxis in a Keller-Segel model" (Sept 2025)** —
  phyllotaxis as an emergent self-organizing process (largest-gap + inhibition),
  the core technique implemented here.
- **H. Vogel (1979), "A better way to construct the sunflower head"** — the
  golden-angle (r = c·√n, θ = n·137.5°) baseline the emergent process converges
  toward.
- **Mort Garson, *Mother Earth's Plantasia* (1976)** — the gentle synth-garden
  vibe.
- **Chris Wilson autocorrelation pitch detection** — the ACF technique used.

## Design notes
Smoothness with thousands of points comes from a single `THREE.Points` system
with a custom `ShaderMaterial`: sway and breathing happen in the vertex shader,
and only per-site pulse/size/position attributes are touched on the CPU. The
field has memory and state (sites persist and keep growing), so the piece is
genuinely long-form: leave it running and the spiral fills in by itself. Warm
daylight palette, dark monospace UI chrome — calm and living, not clinical or
dark-cosmic.
