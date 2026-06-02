# 271 · Pigment Mosaic

## The one question
**What if an AI-generated image were treated as reconfigurable MATTER — a mosaic of
tiles that the music assembles, shatters, scales and re-sorts in real time, so a
picture is something the sound *builds and destroys* rather than just a backdrop?**

This is a DEEP fire: AI image generation is embedded *inside* the audio-visual
experience, not a standalone image generator. The chapter image is never shown
flat. It exists only as pigment — a grid of tiles whose geometry is dictated,
frame by frame, by the live spectrum.

## What's novel
**An AI image as reconfigurable matter — a deliberately NON-luminous mosaic, the
anti-glow.** No additive blending, no bloom, no fly-through particles. Every tile
is drawn with plain `source-over` `drawImage`. Loud passages physically shatter
the photograph; silence lets the matter settle back into a coherent picture. This
cycle's jury banned additive glow and particle fly-throughs and explicitly asked
for *mosaic* — this is that.

## The four subsystems

### 1. Tri-modal audio source
- **Mic** — `getUserMedia({ audio: { echoCancellation:false, noiseSuppression:false, autoGainControl:false } })`.
- **File** — `file.arrayBuffer()` → `decodeAudioData` → looping `AudioBufferSourceNode`.
- **Welcome Home track by ID** — `fetch('/api/audio/' + encodeURIComponent(id))`,
  handling BOTH `application/json {url}` (then fetch the url → `arrayBuffer`) and
  raw audio bytes, switched on `content-type`. On failure: visible rose error +
  fall back to the synth demo.
- **Synth fallback** — a gentle evolving pad on a **D-dorian** drone
  (D F A C E G, triangle oscillators, slow LFO on the master gain). Deliberately
  NOT C-major pentatonic (banned this cycle).

Everything routes through one `AnalyserNode` at `fftSize 2048`.

### 2. Live musical analysis
Per frame the lower half of the FFT (the musical range) is folded into
`GRID_COLS` (16) bands — one band per tile *column*. Each band is gamma-shaped
(`pow(raw, 0.8)`) so bass doesn't swamp the picture, then smoothed
(`band += (target - band) * 0.25`). We also derive:
- **RMS** (overall loudness) — smoothed, drives the prompt mood.
- **Spectral centroid** (brightness of the sound, 0..1) — drives prompt colour and
  the procedural mood hue.
- **Spectral flux / onset** (sum of positive bin deltas) — drives the brightness
  re-sort on transients.

### 3. AI chapter generation (`api/route.ts`)
`fal-ai/flux/schnell`, `landscape_4_3`, 4 inference steps, behind `guard` (the
guard check runs FIRST, before any FAL call). The page POSTs a mood→prompt to
`/dream/271-pigment-mosaic/api`, loads the returned `{url}` into an
`Image` with `crossOrigin="anonymous"` set *before* `src`, then re-slices the new
chapter. A **crossfade** plays the previous chapter underneath the new tiles,
fading out over ~50 frames, so chapters dissolve into one another tile-by-tile.

**Mood → prompt** (from live analysis):
| signal | low | mid | high |
| --- | --- | --- | --- |
| RMS (energy) | "hushed and still" | "breathing, mid-bodied" | "surging and loud" |
| centroid (colour) | deep umber & indigo | ochre, teal & dusk rose | pale gold & bright cyan |

The prompt always asks for *thick impasto matter, tactile photographic detail,
no glow* — keeping the palette tactile/photographic, never luminous.

Chapter generation is **user-triggered** by default (`Summon chapter`). Optional
**auto-regenerate** respects a `MIN_REGEN_MS` of ~25s so Karel's FAL cost stays
bounded.

### 4. Canvas2D mosaic renderer
One canvas, ~60fps, zero per-frame allocation (tile source rects are derived from
immutable `col`/`row`; transforms are smoothed in place on each `Tile`).

**Band → tile transform** (all smoothed toward a target):
- `scale = 1 + energy * 0.9` — loud band grows its column's tiles.
- `rot = (energy - 0.2) * ±0.9` — alternating columns counter-rotate for shatter.
- outward push `offset = (home - centre) * energy²` — loud bands fling tiles away
  from the canvas centre; quiet bands let them fall back to the coherent grid.
- `brightness = 1 - energy * 0.35` via `ctx.filter` — loud tiles punch *darker*
  (anti-glow), never brighter.
- tiles draw at `cellSize * 1.02` so seams seal into a continuous picture when
  settled.

**Transient → brightness re-sort:** when smoothed flux crosses a threshold (and a
~900ms debounce has passed), all tiles are sorted by their precomputed mean
luminance and assigned new home `slot`s in serpentine order, so the picture
visibly reorganizes itself — bright matter migrates, dark matter sinks — to the
music. Mean luminance per tile is sampled once per chapter by drawing the source
into a tiny 16×12 canvas and reading one pixel per tile (guarded against
cross-origin taint; display still works regardless).

## Graceful degradation (Karel watches FAL cost)
- The canvas seeds with a **procedural chapter on load** — a painterly value-noise
  gradient (layered soft radial blobs + fine grain) tinted by the mood hue. The
  full shatter / settle / re-sort experience runs with **zero API calls**.
- If the API returns **501** (no `FAL_KEY`): an amber notice
  *"Image generation needs FAL_KEY — running in procedural mode"* and the mosaic
  slices a fresh procedural chapter instead.
- Any other API/network/image error → rose error + procedural fallback.
- No canvas → rose notice. No mic → synth demo. No track → synth demo.

## Controls
- **Use mic / Drop · pick file / Synth demo** — choose the audio source.
- **Welcome Home track ID + Load track** — Karel's real piano by ID.
- **Summon chapter** — generate (or procedurally re-roll) a chapter from the
  current mood.
- **Auto-regen (~25s)** — periodic chapters while you listen.

## Named references
- **Refik Anadol — *Machine Hallucinations***: data/pixels handled as pigment and
  physical material rather than a flat picture. The "image as matter" framing
  here is in that lineage.
- **David Hockney — photo-collage "joiners"**: a single scene reconstructed from
  many reframed, overlapping photographic tiles. The mosaic's seams, re-framing
  and re-sorting are a moving, audio-driven joiner.
- **ACM IMX 2025 — "An AI-driven Music Visualization System for Generating
  Meaningful Audio-Responsive Visuals in Real-Time"** (DOI
  [10.1145/3706370.3727869](https://doi.org/10.1145/3706370.3727869)).
  *Honesty caveat:* the full text is paywalled; this cites the title/abstract for
  the shared goal of meaningful, real-time audio-responsive generative visuals.

## Next-cycle deepening
- **Image-to-image chapter continuity** — feed the previous chapter as an init
  image so chapters morph rather than cut.
- **Voronoi / irregular tiles** — break the regular grid into organic shards.
- **Tile-by-tile audio routing** — map individual tiles (not just columns) to
  narrow band-pass taps for finer spectral sculpting.
- **Save a frame** — export the current mosaic state as a PNG.
