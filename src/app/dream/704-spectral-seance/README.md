# 704 · Spectral Séance

**The one question:** *What if a sound could dream a picture — and then the
picture became the next instrument you hear?*

A genuine **closed audio → image → audio loop**, where the return trip is
**literal re-sonification**: the dreamed image is played back column-by-column
as a spectrogram. The image becomes the instrument.

Route: `/dream/704-spectral-seance`

---

## The loop

1. **Inharmonic generative bed.** An evolving spectral drone whose partials use
   deliberately *non-integer* ratios (`1, 2.07, 3.31, 4.62, 5.4, 6.83, 8.19,
   9.74`). It never collapses into a familiar chord — it stays a *texture*, not
   a tension-and-resolution cadence. The partial amplitudes morph slowly on
   their own breathing envelopes.

2. **Spectral descriptor.** An `AnalyserNode` (FFT) taps the bed and reduces it
   to a small descriptor: low / mid / high band split, spectral centroid
   (brightness), spectral flatness (roughness), and density.

3. **Dream the image.** The descriptor is mapped through a *controlled
   vocabulary* into an austere prompt (e.g. bright + sparse → "high thin
   filaments of white light on black, austere data grid"; dark + rough →
   "granular charcoal noise field"). The prompt is POSTed to a guarded
   `fal-ai/flux/schnell` route, throttled to at most one real call per ~45 s.

4. **THE RETURN TRIP — re-sonify the image.** The returned (or fallback) image
   is downsampled into a tiny `128 × 48` offscreen buffer and treated as a
   **spectrogram / score**:
   - each **column** = a moment in time,
   - each **row** = a frequency bin (bottom = low pitch, top = high pitch,
     log-spaced across ~80 Hz – 6 kHz).

   A bank of **48 oscillators** (one per row) is driven so that *pixel
   brightness in row r, column c = amplitude of oscillator r at time c*. A
   vertical **cyan scan-line** sweeps left→right across the displayed image in
   lock-step with the audio playback column — you literally **see and hear** the
   picture being played, Ikeda-style.

5. **Close the loop.** The re-sonified spectrum is itself part of what the
   analyser hears next, so its spectrum feeds the next descriptor → next prompt
   → next image → next re-sonification. When a sweep completes (or a new dream
   arrives) the renderer cross-fades to the next image.

---

## Lineage

This sits squarely in the **image-as-spectrogram** tradition:

- **Ryoji Ikeda** — austere monochrome data-spectacle; the black ground, white
  and cyan accents, the grid, the precise scan.
- **Iannis Xenakis — *UPIC*** — drawing on a surface that is read as sound; the
  picture *is* the score.
- **The *ANS synthesizer*** — Evgeny Murzin's photo-optic instrument that
  sounds an image column-by-column as a spectrogram. The return trip here is the
  direct descendant of that idea.

It extends the lab's ceiling build **`689-dream-chapters`** — which only went
audio → image (one-way) — into a **true round trip**: image → audio as well.

---

## Bulletproof no-key fallback (non-negotiable)

The flux route returns **501** when `FAL_KEY` is unset (which it usually is in
preview). The client detects *any* non-200 / network error / cross-origin taint
and falls back to a **procedural deterministic image** drawn on a canvas, seeded
by the spectral descriptor: a domain-warped interference / line-field that looks
like an austere data-image and *still changes with the sound* (bright moods →
high thin filaments and pinpoints; dark moods → low banded strata; rough moods →
grain). That procedural image is re-sonified through the **same** column-by-
column path.

**Open the page with no key → it still dreams an image AND plays it back as
sound, with zero network.** The status line shows
`dreaming (procedural)` in green so it's clearly fine without a key, or
`dreaming live (flux)` in cyan when a key is configured.

---

## Tags

- **Input:** autonomous / generative + AI-image. No mic, no touch as primary —
  it runs itself; one "Begin" gesture unlocks audio (and it auto-starts after
  ~2.5 s if untouched). Visuals animate silently before audio.
- **Output:** **WebGL2** raster. The spectrogram image + sweeping cyan scan-line
  are a textured quad rendered in a fragment shader (cross-fade, grid, vignette,
  scanline). Canvas2D is used *only* for the tiny offscreen pixel-sampling
  buffer and the procedural fallback image — never as the primary visual output.
  If `getContext("webgl2")` is null, a graceful notice shows and **audio keeps
  running**.
- **Technique:** image-as-spectrogram / cross-modal closed-loop re-sonification
  — the literal return trip.
- **Vibe:** Ryoji Ikeda austere data-spectacle — black ground, white / cyan,
  grid, precise.

---

## Safety / lifecycle

- Master gain hard-capped at `0.34` through a **lowpass + DynamicsCompressor**;
  the 48-voice bank uses tiny per-voice gains and smoothly ramped column updates
  (no zipper clicks). It is never harsh or loud.
- AudioContext is created/resumed inside the "Begin" gesture (iOS).
- Full teardown on unmount: all oscillators stopped, AudioContext closed, the
  WebGL2 render loop cancelled, all timers cleared, resize listener removed.
- No new npm dependencies — Web Audio + raw WebGL2 + a tiny Canvas2D sampler.

## Files

- `page.tsx` — UI, begin/auto-start, the loop driver (column stepper + dream
  throttle), status HUD, teardown.
- `audio.ts` — inharmonic bed, analyser descriptor, the re-sonifier oscillator
  bank, the safe master chain.
- `dream.ts` — descriptor → prompt vocabulary, flux client, procedural fallback
  image.
- `resonify.ts` — the return trip: image → `128 × 48` spectrogram of per-column
  amplitudes.
- `render.ts` — WebGL2 textured-quad renderer with the sweeping scan-line.
- `api/route.ts` — guarded `fal-ai/flux/schnell` route (501 with no key).
