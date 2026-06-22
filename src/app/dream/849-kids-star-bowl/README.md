**For**: kids (4+)

# Star Bowl (slug: `849-kids-star-bowl`)

**One sentence:** Tilt the tablet like a bowl of glowing stars — pool them in the calm center for a warm, resolved chord, tip them out to the spiky rim to hear a soft, safe dissonance, then tilt home to *resolve* it: a real harmonic decision made with the body, not just a steered vibe.

## The mechanic — tilt → dissonance → resolution

- ~48 glowing star-marbles roll inside a 3D bowl under simulated gravity. The gravity vector comes from **device-orientation tilt** (`beta`/`gamma`). Tilt the device and the marbles slide.
- The bowl has a **calm center well** and an **outer spiky rim**. The cluster's mean radius (0 = center, 1 = rim) drives the harmony:
  - **Center:** a warm, fully-consonant chord over a low A2 drone (root + fifth + octave + tenth). Stars glow round and gentle; the center well glows bright and warm.
  - **Toward the rim:** two "tension voices" glide up toward a soft minor-2nd / tritone cluster, gentle beating partials and a slow shimmer-tremolo swell in, and the star shader grows prickly spikes that shiver. It reads as "ooh, wobbly," never harsh or scary.
  - **Tilt back home:** the tension voices glide back to consonance via `setTargetAtTime`, the shimmer fades, stars round out, and a soft consonant **bloom** rewards the return. This audible resolution is the whole point.
- An always-on drone/pad means it is never silent. Auto-drift keeps an untouched device gently rolling and sounding within ~2s.

## Tags (diversity slot)

- **INPUT:** device-orientation TILT (primary; pointer-drag + auto-drift fallback).
- **OUTPUT:** GPU — three.js. Bowl + additive `THREE.Points` star-marbles with a custom round↔spiky glow shader, a translucent dish/rim/guide-rings, and a glowing center well. (No Canvas2D — hard-banned this cycle.)
- **CORE TECHNIQUE:** tilt-gravity marble physics → position-in-bowl → consonance↔dissonance harmony with glide-resolution.
- **VIBE:** calm bedtime night-blue (`#0b1830`), soft blue-white-silver.

## Ambition: #2 + #3

- **#2 (≥3 subsystems → here 4):** (1) device-orientation physics/permission handling, (2) tilt-driven marble gravity simulation (`physics.ts`), (3) position→consonance/dissonance harmony engine with `setTargetAtTime` glide-resolution (`audio.ts`), (4) three.js additive-glow render with a round↔spiky shader (`scene.ts`).
- **#3 (named references):**
  - The **dissonance→consonance "tension and release" pedagogy** — MasterClass 2026, *"Dissonance in Music"*; and the *"Dissonance to Consonance"* family-learning lesson plan (mapflc.com): dissonance resolving to consonance brings relief, and the journey builds the child's confidence. Star Bowl makes the "wrong" sound deliberately reachable AND resolvable.
  - The love-aligned tilt lineage **`83-kids-tilt-rain`** (device-orientation tilt for toddlers, night-sky register).
  - **Brian Eno**-style calm ambient generative bedtime drone (slow detune drift, no sudden events).

## Safety chain (mandatory)

All sound routes through: `sources → masterGain (0.24, ≤0.28) → BiquadFilter lowpass (5200–6400Hz, ≤7000) → DynamicsCompressor(threshold -10, ratio 20:1) → destination`. Soft attacks (≥40–50ms), no sudden loud transients, no high ringing. Even the dissonant rim stays subtle (tension voices peak at gain ~0.16). No analyser is wired to output. Master fades in/out gently.

## Fallbacks (genuinely functional)

- **No device-orientation** (desktop, or permission denied) → **pointer drag-to-tilt** the bowl, plus auto-drift so an untouched device keeps rolling/sounding within ~2s. Notice: `text-rose-300` "Tilt not available — drag to tilt."
- **No WebGL** → `text-rose-300` notice; audio keeps running.
- **No Web Audio** → visuals stay alive; `text-rose-300` notice.

## Teardown

On unmount: cancels rAF, removes orientation/pointer/resize listeners, disposes all three.js geometries/materials + `renderer.dispose()` + `forceContextLoss()`, and `audioCtx.close()` (after a short fade).

## Files

- `page.tsx` — client component: Start gesture (audio + iOS permission), main loop, fallbacks, HUD, design-notes panel.
- `physics.ts` — tilt-gravity marble simulation and cluster-radius readout.
- `audio.ts` — Web Audio harmony engine + kids-safety chain.
- `scene.ts` — three.js bowl + glowing star-marble renderer.
