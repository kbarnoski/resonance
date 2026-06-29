# 1053 · Ripple Loom

> **What if you could *strike* a still pond of light and play the expanding ripples — warped into psychedelic tunnels and spirals — like an instrument, each ring ringing a consonant bell?**

## What it is

A played thing, not a screensaver. The field rests dark — a faint indigo glow and a quiet drone — until you reach in. **Tap and drag** anywhere and you inject an impulse into a real 2D wave-equation "ripple tank." The expanding rings are then read through the visual cortex's own log-polar map, so what spreads as flat circles on the pond reads on screen as **breathing tunnels, spirals, or a honeycomb lattice**. Each ripple sweeping past a hidden "listener" probe rings a consonant bell. Stop touching and it settles back toward silence and stillness.

## Altered state

- **State:** meditative / cosmic-ambient ripple-void.
- **Pole:** **cosmic-ambient** — calm, slow, boundless. No strobe, no harsh contrast. Warm-cool deep palette: ink-black/indigo floor → teal → soft gold ring crests.

## How to play it

1. Press **Start** (or just touch the field — the first touch resumes audio).
2. **Tap** to strike a single ripple; **drag** to draw a moving line of strikes.
3. Pick a **Form**: Tunnels (concentric come-up), Spirals (diagonal drift), Honeycomb (hex lattice).
4. **Decay** — long ring (the pond keeps singing) ↔ quick settle.
5. **Strike strength** — how hard each touch hits, and how bright/loud the bell.
6. **Bells** — how many listener probes are scattered on the field (2–7), each a different just-intonation pitch.
7. **Shimmer** — an *opt-in*, photosensitive-safe slow luminance drift (off by default), with an instant **Kill**.

It is built to be playable on a phone (touch, large tap targets).

## The technique

**Substrate — a GPU-compute excitable wave field.** The body is a real damped wave equation on a grid, ping-ponged between two height buffers:

```
u_next = (2·u_curr − u_prev) + c²·∇²(u_curr)   then ×damping   (damping < 1 → the pond settles)
```

- **Primary path: WebGPU compute (WGSL).** Three storage buffers (`prev`/`curr`/`next`) are ping-ponged by a `@compute` step shader; a **splat** compute pass injects a gaussian impulse on each strike (additive, since `writeBuffer` can only overwrite); a **render** compute pass warps screen pixels through the log-polar map, modulates by the form constant, colours the crest, and writes a storage texture that is blitted to the canvas.
- **Fallback (mandatory): Canvas2D.** The exact same model on a smaller CPU grid (`wave.ts`), drawn per-pixel with the **JS twins** of the same warp. If `navigator.gpu` is absent or init fails, it falls back automatically with an amber notice. The fallback is a fully playable instrument, just lower-res.
- A tiny CPU "mirror" wave drives the audio probes in both paths, so the bells stay responsive without a per-frame GPU readback stall.

**Composed shared engines (the point of the build):**

- **`_shared/psych/logpolar.ts`** — the load-bearing form-constant / log-polar engine. The WGSL render pass is a transliteration of its `screenToCortex` / `formConstant` / `honeycomb`; the Canvas2D path imports and calls the JS functions directly; `FORM_PHI` selects tunnel (φ=0) / spiral (φ=π/4) and the honeycomb hex-lattice mode. A slowly drifting `phase` makes the tunnels flow inward (the classic come-up motion). `LOGPOLAR_GLSL` (the GLSL ES string) is imported and fingerprinted onto the canvas so a WebGL2 build could splice it verbatim.
- **`_shared/psych/safeFlicker.ts`** — the only luminance-flicker path. The "Shimmer" toggle is opt-in / off by default, hard-clamped ≤3 Hz, soft sine floor (never a hard strobe), with an instant Kill and `prefers-reduced-motion` honored. Its multiplier scales global brightness in both render paths.

**Audio (Web Audio API).** Listener probes are scattered on a golden-angle spiral. Each samples local wave energy; when a ripple crests under it, it rings a short additive **inharmonic bell** (stretched sine partials, fast decay) tuned to a just-intonation pentatonic set, through a generated convolver reverb. A soft sub-octave drone sits underneath so idle ≈ near silence + faint warmth. Audio resumes only on a user gesture.

## References

- **Bressloff, Cowan, Golubitsky, Thomas & Wiener (2001)** — the retina→V1 cortical map as a complex logarithm; planar cortical stripes/hexagons map under the inverse (exp) warp to concentric rings (tunnels), radial spokes, spirals, and lattices. This is the engine in `logpolar.ts`.
- **Heinrich Klüver** — the four *form constants* (lattices/honeycombs, cobwebs, tunnels/funnels/cones, spirals) recurring across psychedelics, migraine, hypnagogia and flicker — a property of visual cortex, mirrored here as the selectable Form modes.

## Next-cycle deepening

Folded in from the parallel DEEP sibling `1054-cortex-paint` (de-selected this fire, banked to IDEAS §601):

- **Optional audio-file carrier.** Let the player drop a *Welcome Home* piano track (`decodeAudioData`) and granulate it at the listener probes instead of the synth bells — so the ripples re-voice Karel's real piano. This finally puts the psych lane's carrier wave on his actual recordings.
- **"Paint a sustained ridge" mode.** Hold to keep injecting along a dragged stroke so a *standing* form-constant persists (a held tunnel/spiral), not only transient expanding rings — the difference between a struck pond and a bowed one.

## What's unverified

- **No GPU or audio in the build container.** This was authored and type/lint-checked but **not run** with a real WebGPU device or audio output. The WGSL compute pipeline (step/splat/render + blit), the bind-group ping-pong, and the bell/drone voicing are unverified at runtime. The Canvas2D fallback and the CPU wave model are the safer demo path on an unknown reviewer device.
- Bell tuning, probe density, decay/strength ranges and the inward `phase` drift speed are hand-tuned by ear-on-paper and likely want a pass on real hardware.
- Performance of the per-pixel Canvas2D inner loop at high DPR is mitigated by rendering at 1/3 resolution and upscaling; very large windows may still want a coarser grid.
