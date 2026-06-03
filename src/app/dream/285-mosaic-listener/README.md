# 285 — Mosaic Listener

**Status:** demoable · **Cycle shipped:** 293 · adult build

> What if a piece were never *played back* but endlessly *re-assembled* — built,
> moment to moment, out of tiny shards of a recording you chose by dragging your
> finger through a map of its own sounds?

The lab's **first concatenative-synthesis / audio-mosaicing piece** in 280+
prototypes. Everything else here either reacts to sound or synthesizes new sound;
this one takes an existing recording, **shatters it into a corpus of hundreds of
tiny grains**, and lets you re-compose with that corpus in real time — so the
music is always *made of* the original but never *is* the original.

## How it works

1. **Corpus build.** A recording is sliced into overlapping ~165 ms grains. The
   default is a **procedural piano corpus** synthesized on the spot (instant, no
   network — so the piece always runs). Type one of Karel's **Welcome Home**
   track IDs and hit *Use Karel's piano as the corpus* and it fetches the track
   via the existing `/api/audio/:id` route (read-only — the loved `163`/`227`
   pattern), decodes it, and re-slices the corpus into shards of his real piano.
2. **Descriptor tagging.** Every grain is tagged with three audio descriptors:
   **loudness** (RMS), **brightness** (spectral centroid, via a small 256-pt
   Hann DFT), and a rough **pitch** (zero-crossing estimate, used only to choose
   the grain's hue). The grains are laid out as a 2-D **atlas** — x = brightness,
   y = loudness, color = pitch class.
3. **Navigation = composition.** A target wanders the atlas. You can **drag**
   across the cloud to place it (the CataRT "play the cloud by hand" gesture),
   let it **auto-drift** along a slow Lissajous path (the self-playing demo), or
   **hum into the mic** so your voice's live brightness + loudness becomes the
   target.
4. **Matching + grain playback.** A Chris-Wilson look-ahead scheduler fires
   ~6–9 grains/sec. Each trigger finds the **k≈6 nearest grains** to the target
   in descriptor space and picks one at random (organic, not robotic), playing it
   windowed (12 ms attack / 60 ms release) with a tiny `playbackRate` jitter,
   through a lowpass → feedback-delay wash → limiter. The grain it picked
   briefly lights up in the atlas, and a trail draws the path your target has
   taken.

## Design choices

- **Output is matte WebGL2, not Canvas2D and not glowing points.** Canvas2D
  output was banned this cycle (5× in the last 10 prototypes), and the 2026-06-02
  jury hard-banned additive/glowing three.js point clouds. The atlas uses raw
  WebGL2 `GL_POINTS` with **normal (premultiplied) alpha blending** — soft matte
  dots on near-black, no additive glow. Recently-played grains brighten modestly
  rather than flaring.
- **His real music, non-pentatonic by source.** When the corpus is a Welcome
  Home track, the pitches are literally his playing — there is no synthesized
  scale to fall into the lab's habitual C-major-pentatonic.
- **Degrades gracefully.** Procedural corpus by default (no network, no key, no
  permission needed); track-load failure falls back to it with an amber notice;
  mic-block falls back to drag/drift with a rose notice; no-WebGL keeps the audio
  mosaic playing and shows a rose notice.

## References

- **Diemo Schwarz — CataRT**, interactive corpus-based concatenative synthesis
  (IRCAM): the descriptor-space-and-KNN paradigm this piece follows, including
  the draggable "play the cloud" interaction.
- **"The Concatenator: A Bayesian Approach to Real-Time Concatenative Musaicing"**,
  arXiv 2411.04366 (2024) — recent real-time audio-guided musaicing.
- **Lee & Pasquier — "Musical Agent Systems: MACAT and MACataRT"**,
  arXiv 2502.00023 (2025) — self-listening agents built on CataRT.
- **FluCoMa** (Fluid Corpus Manipulation) — "live audio mosaicing on the web,"
  the freshness anchor that browser-side mosaicing is feasible now.

## Where it could go (deepen, multi-cycle)

- Real **YIN pitch + MFCC timbre** descriptors and a higher-dimensional space
  (PCA / UMAP down to 2-D), so the atlas clusters by instrument character.
- A **KD-tree** for k-NN so the corpus can hold thousands of grains at framerate.
- **Onset-aligned** grains (AudioWorklet) instead of fixed-hop windows, so each
  grain is a clean note attack.
- A **factor-oracle / MACataRT temporal model** so it can continue a phrase on
  its own, not just chase the cursor.
- Drag **two** targets to morph between two regions; record a target *gesture*
  and loop it as a generative phrase.

*Self-contained: Web Audio + WebGL2. No API route created (reads `/api/audio/:id`
only — no side effects). Mic is analysis-only — never routed to the destination,
never recorded. No new dependencies.*
