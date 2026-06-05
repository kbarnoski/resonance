# 330 · Stillness

**The one question:** *What if an instrument rewarded SILENCE and attention instead of noise — a room that BLOOMS in your stillness and scatters at the first sound you make?*

This is an **anti-instrument**. It inverts the reactive paradigm that runs through the rest of this lab: here, sound is the enemy. Stay quiet and a drone deepens and a light grows; make a noise and it all collapses.

## How it works

1. **Inverted-silence detector.** The mic's RMS is read every frame and run through a two-constant hysteresis (declared at the top of `page.tsx`): `QUIET = 0.045` and `NOISE = 0.12`.
   - Sustained RMS **below `QUIET`** → the bloom integrates upward, the stillness streak counts up.
   - A **rising edge above `NOISE`** (a clap, a word, a bump) → a **startle**: bloom to 0, streak reset to 0, light scatters, lowpass drops.
   - The ambiguous band between the two thresholds gently lets the bloom recede — you're not quiet *enough* to grow.
2. **Just-intonation drone engine** (`audio.ts`). A drone over a low **E2 root (~82.41 Hz)** with partials at ratios `1, 2, 6/5, 4/3, 3/2, 8/5` (octave, fifth, fourth, minor third, minor sixth — *not* C-major pentatonic). Partials **stagger in** as the bloom deepens and a lowpass opens; on startle they collapse toward silence. Procedural convolver reverb from a noise-burst impulse. Master gain ≤ 0.46 → a brick-wall `DynamicsCompressor` limiter. All changes glide via `setTargetAtTime` — click-free.
3. **Inline-SVG bloom/mote renderer** (`scene.tsx`). A dark one-point-perspective wireframe room; an additive light bloom (radial-gradient core + halo under an SVG `feGaussianBlur`/`feMerge` glow filter); ~46 drifting motes whose brightness/spread track the bloom and which scatter outward on a startle then settle. A live input meter shows the current RMS with the `QUIET` and `NOISE` thresholds marked. **No Canvas2D, no WebGL — SVG only.**
4. **Streak persistence.** The longest stillness streak (seconds) is stored in `localStorage` and shown as "longest stillness: Xs" so returning sessions have a goal.

### No-mic fallbacks (the piece is fully demoable without a microphone)
- **Be quiet (press & hold):** while held, the room *is* quiet and blooms; release emits a noise edge = the startle.
- **Auto-demo (breathing):** a hands-free toggle (on by default) that makes the room bloom-and-rest on a slow ~20s cycle with occasional startle spikes, so it's alive with zero input.
- Mic denied/absent → a `text-rose-300` notice plus the two fallbacks above. A "Begin" button handles the iOS AudioContext resume-on-gesture requirement. Full teardown on unmount (mic tracks stopped, AudioContext closed).

The provenance badge reflects the live mode: emerald **Listening 🎤**, amber **Touch mode ✋**, or violet **Auto-demo (breathing)**.

## Named references

- **John Cage — _4′33″_ (1952):** silence-as-music. This piece is that idea turned inside out — the silence isn't framed, it's *rewarded*, and ambient sound is what breaks the spell.
- **Pauline Oliveros — _Deep Listening_:** attention and quiet as a practice; the streak timer is a small invitation to it.
- **Éliane Radigue:** the sustained, slowly-evolving just-intonation drone aesthetic the audio engine reaches for.

## Ambition-floor criteria hit

- **#2 — ≥3 subsystems:** four, actually — (a) inverted-silence detector with RMS hysteresis, (b) JI drone engine + procedural reverb + limiter, (c) inline-SVG bloom/mote renderer with live meter, (d) longest-streak persistence.
- **#3 — named reference:** Cage / Oliveros / Radigue (above).

## Honest, unverified risks

- **No mic or GPU in the sandbox**, so live mic behaviour and SVG-glow performance under a real device weren't observed end-to-end. The press-&-hold and breathing auto-demo fallbacks make the piece fully demoable regardless.
- **RMS calibration vs. a noisy review room is the main risk:** `QUIET = 0.045` / `NOISE = 0.12` are tuned for a quiet space; a loud room may never dip below `QUIET` (no bloom) or may sit permanently past `NOISE`. This is mitigated by the press-&-hold control, which fully substitutes for "silence," and by the live threshold meter that makes the calibration visible. If needed, the two constants at the top of `page.tsx` are the single tuning point.
- SVG `mixBlendMode: screen` + Gaussian-blur glow is broadly supported but can render slightly differently across browsers; the bloom degrades gracefully to plain opacity compositing.
