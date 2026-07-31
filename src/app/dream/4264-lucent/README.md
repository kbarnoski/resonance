# 4264 · Lucent — a living lightscape painted by Karel's piano

**Pitch.** What if Karel's own piano recording generated a slowly evolving,
dreamlike *lightscape* — a GPU flow-field the music continuously paints and
advects — so a long performance becomes a living cloud of light that is
materially different at minute 5 than at minute 1? Not a reactive visualizer
that resets every note, but a *pigment field* with memory: every attack blooms a
plume, the plume drifts and curls on a fluid velocity field, and the whole image
accumulates into something you could never have predicted from any single moment.

## How to use it

- Press **Start**. The piece fetches Karel's real Path piano recording
  (`/api/audio/549fc519-…`), decodes it to a looping buffer, and begins painting
  itself. A **LIVE** badge means the real recording loaded.
- If the recording can't be fetched or decoded (network / CORS / 404), it falls
  soft to a **seeded felt-piano synth** that drives the *identical* analysis — the
  piece always sounds and always paints. The badge then reads **SYNTH**.
- Paste a different **Audio UUID** to try another take, then Start again.
- Move the pointer over the field for a gentle secondary "wind" push. The music
  always leads; the pointer is strictly ornamental.
- **Design notes** in-app summarizes the mapping. Photosensitive-safe: the piece
  is inherently slow and smooth, with no strobing.

## Tags

`INPUT audio-file (Karel's real Path piano via /api/audio) · OUTPUT WebGL2 ping-pong flow-field (Canvas2D fallback) · TECHNIQUE semi-Lagrangian advection feedback + live spectral-feature deposition (long-form memory) · VIBE dreamlike / ambient / luminous`

## How the spectral → light mapping works

One `AnalyserNode` feeds everything. Each frame `analysis.ts` reduces the
magnitude spectrum to three perceptual features, and `deposit.ts` turns them into
light deposits:

| Feature | Meaning | Drives |
| --- | --- | --- |
| **Spectral centroid** | spectrum "center of mass" — the correlate of perceived timbral *brightness* (Grey & Gordon) | **hue** on the violet ramp **and** the **vertical position** of new light (bright timbres rise & pale; dark ones sink toward indigo) |
| **RMS loudness** | broadband energy | deposit **brightness + size** |
| **Spectral flux** (onset energy, half-wave-rectified frame-to-frame increase; Bello et al. 2005) | attack transients | the **number of new plumes** — a loud attack bursts a cluster; a sustained tone trickles one |

The deposits are additive point-sprite plumes painted into a **WebGL2 ping-pong
feedback flow-field** (`gl.ts`):

1. A **velocity field** advects itself semi-Lagrangian and is stirred by a
   curl-noise force plus a faint buoyancy, so light *smears and swirls* like ink
   in water.
2. A **light/dye field** is advected by that velocity and multiplied by a very
   slow global fade (~0.993/frame) — enough to prevent clip-to-white, but the
   field genuinely **accumulates**. This feedback is the long-form memory: minute
   5 is not minute 1.
3. The dye is presented to screen with a cheap 4-tap bloom and a Reinhard-style
   tonemap over the violet→pale-light ramp.

If WebGL2 or float render targets are unavailable, `gl.ts` returns a **Canvas2D
fade-feedback** field driven by the same stroke stream (a low-res buffer redrawn
with a slight drift + additive radial deposits). Determinism throughout: no
`Math.random`/`Date.now` — all stochastic choices draw from `mulberry32(0x4264)`
and timing uses `performance.now()` / the audio clock.

## Named references

- **Refik Anadol** — data/flow "pigment" fields and machine-hallucination
  lightscapes; the aesthetic north star for an accumulating cloud of light.
- **Jos Stam, "Stable Fluids" (1999)** — the semi-Lagrangian advection scheme the
  velocity/dye feedback is built on.
- **Grey & Gordon** — spectral centroid ≈ perceived timbral "brightness"; the
  basis for the centroid→hue/height mapping.
- **Bello et al. (2005)** — spectral-flux onset detection, used for the
  attack-burst plumes.
- **"Glow with the Flow: AI-Assisted Creation of Ambient Lightscapes for Music
  Videos"** (arXiv:2602.08838, 2026) — the contemporary reference for
  music → ambient-lightscape generation.

## Files

- `page.tsx` — client component: header/chrome, audio load + fallback, render loop, full teardown.
- `analysis.ts` — `AnalyserNode` → `SpectralFrame` (centroid / RMS / flux).
- `deposit.ts` — `SpectralFrame` → light-deposit `Stroke[]` (the mapping).
- `gl.ts` — WebGL2 ping-pong flow-field renderer + Canvas2D fallback.
- `synth.ts` — seeded felt-piano fallback engine.
- `rng.ts` — `mulberry32` + the `0x4264` seed.
