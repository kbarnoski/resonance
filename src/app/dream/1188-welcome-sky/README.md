# 1188 · Welcome Sky

## The one question
*What if Karel's own recorded piano didn't just play — but slowly painted the
**sky** it belongs under? What if a piece of music had a **time of day** — dawn
when it begins, golden dusk when it ends — so the sky at minute 5 is a different
world than the sky at minute 1?*

A bright, daylit, high-key **volumetric raymarched cloudscape** that Karel's real
solo-piano recording paints and animates in real time. It is long-form and
**stateful**: a single global day-phase advances with playback position, so the
scene genuinely transforms over minutes — dawn → midday → golden-hour dusk — not
a loop.

## How it works
- **Audio (3 tiers, never blank or silent):**
  1. Karel's real "Welcome Home" piano recording (`549fc519-…`), fetched through
     the existing read-only route `GET /api/audio/<id>` (handles both response
     shapes: JSON `{url}` or raw bytes) → emerald chip.
  2. A dropped or picked local audio file → violet chip.
  3. An offline-rendered ~16 s gentle detuned-partial piano arpeggio (real
     harmonic + percussive content, deterministic) → amber chip.
  Graph while playing: `source → reverb(convolver) + dry → DynamicsCompressor
  (limiter) → master gain (~0.2, ramped) → destination`, with a parallel
  `AnalyserNode` (fftSize 2048) tapped for analysis. Audio only starts on the
  **Begin** gesture.
- **Analysis (per frame):** RMS `energy`, spectral `flux` (positive-difference
  onset strength), spectral `centroid` (brightness), all smoothed so nothing
  jumps. Plus `progress = currentTime / duration` — the day-phase clock.
- **Render:** raw **WebGL2** fragment shader on a full-screen triangle. It
  raymarches a layered fbm cloud slab lit by a single sun (48 view steps, 5-step
  light march for self-shadowing), with a Rayleigh-ish sky gradient, sun disc +
  bloom, powder edge-darkening, filmic tone-map and a soft vignette. If WebGL2 is
  missing it degrades to a Canvas2D painterly-gradient sky with soft blurred
  cloud blobs that still breathe with energy (amber "simplified sky" notice). The
  sky renders immediately on mount with a slow idle drift, before any audio.

## Mapping (music → sky)
| Signal | Drives | Feel |
| --- | --- | --- |
| `progress` 0→1 | **Sun elevation + azimuth across a full day arc; whole palette** | dawn rose & low → midday blue & high → dusk amber & low. **The long-form state.** |
| `energy` (RMS) | Cloud coverage + thickness + sun bloom / exposure | louder = thicker, more dramatic, brighter-lit clouds; quiet = clear open sky |
| `centroid` (brightness) | Warm↔cool light tint; wispy-high vs heavy-low clouds | brighter notes lift clouds into cool cirrus |
| `flux` (onsets) | Brief soft brightening pulse + light-shaft glow near the sun | a gentle puff of light, never a strobe |

Even in silence the clouds drift and the sun sits at its progress-appropriate
place.

## Named references
- **J.M.W. Turner** & **John Constable** — cloud/light studies where the sky is
  the emotional subject.
- **Brian Eno**, *77 Million Paintings* (2006) — generative, ever-different
  visual ambient.
- **Refik Anadol** — data-driven luminous atmospheres.

## Safety
Photosensitive-epilepsy conscious: **no strobe, no rapid full-screen luminance
flashing.** All brightness changes are slow lerps / small time constants; flux
rises on an onset but decays slowly. Audio is gesture-gated; master gain is
conservative (~0.2, only ramped via `setTargetAtTime`) behind a
`DynamicsCompressor` limiter. `prefers-reduced-motion` calms the cloud drift.
Full teardown on unmount: RAF cancelled, audio nodes stopped/disconnected,
`ctx.close()`, GL context lost.

## Honest gaps
- The day-phase is `currentTime / duration`, clamped to 1. Because the source
  loops, once a short source (e.g. the 16 s fallback) completes one pass the sky
  settles at dusk and stays there — the full sweep is best felt with the real
  multi-minute recording.
- The raymarch is fixed at 48/5 steps at up to 1.75× DPR; on weak GPUs it will
  still run but softly. There is no temporal reprojection, so extremely low-end
  hardware may see mild shimmer in the cloud interior.
- Centroid/flux calibration is tuned for solo piano; very different material
  will still map sensibly but the "weather" ranges may sit high or low.
