# 1246 · warp

**Route:** `/dream/1246-warp`

## The question

What if Karel's recording wove itself into a living textile — sound as cloth you
can watch grow, thread by thread?

## What it is

Karel's real solo-piano recording plays, and a Canvas2D loom weaves it into a
tapestry in real time. The finished cloth is a record of the piece's dynamics:
you can read the loud, bright passages as dense saturated regions and the quiet
ones as sparse near-linen ground.

## How it works

- **Warp** — 48 fixed threads, each assigned a log-frequency band from ~55 Hz to
  ~8 kHz. Bass sits at the **bottom**, treble at the **top**. They are drawn as
  the tensioned ground on unbleached linen (`#e9e0cf`).
- **Weft** — the time axis. Every ~110 ms one "shuttle pass" reads the live
  spectrum via a real `AnalyserNode.getFloatFrequencyData`, folds it into the 48
  band energies, and lays a new vertical column of interlaced picks.
- **Energy → pick** — a band with strong energy weaves a thick, saturated,
  opaque pick; a quiet band leaves a thin/absent pick so the warp and linen show
  through.
- **Interlace** — over/under is **plain weave** when a band is calm and tips into
  a **2/2 twill** (diagonal floats) once the band gets busy, so busy passages
  grow real twill-like texture. Warp and weft threads are drawn as interlacing
  rounded threads with a faint sheen, so the grid reads as cloth, not pixels.
- **The fell line** advances rightward. When it reaches the right edge the whole
  finished cloth **scrolls left** by one pick and the fresh edge is re-warped, so
  the piece is never blank.

### Orientation note (honest gap)

The brief describes the warp as *vertical*. To honour the two hard directional
constraints simultaneously — frequency mapped bass-bottom→treble-top **and** the
fell line advancing rightward — I rotated the loom 90°: the warp threads run
**horizontally** (one per band) and each shuttle pass is a **vertical** weft
column. This is the only orientation where "bass at the bottom" and "time goes
right" both hold. Everything else (over/under interlace, twill-on-busy, scroll)
is as specified.

## Audio

Playback graph: `BufferSource → gain(0.5) → AnalyserNode → DynamicsCompressor
(limiter) → destination`. Gesture-gated behind **Begin weaving** (browsers block
autoplay). The visuals react to that real playback through the analyser.

- **Real recording** — fetched read-only from the existing public
  `GET /api/audio/549fc519-f7fc-4c38-a771-adaad2edbc81` route. No new API, no
  guard, no mic.
- **Offline fallback** — if the fetch fails (headless/CI/no network) an
  `OfflineAudioContext` renders a gentle ~14 s pentatonic piano sketch (detuned
  partials + soft hammer transients) so the loom always has real harmonic
  content. An honest status line says which one is playing.

## Named reference

**Carsten Nicolai / Alva Noto × HOSOO — *WAVE WEAVE / Sono Obi Landscape*
(Kyoto, Nov 2025 – Mar 2026):** Nicolai converts electronic music into sonograms
and constructs them into fabric so "the fabric functions as an analog recording
medium for the musical performance," with the Jacquard loom cast as "the
progenitor of digital media." This piece is the live, generative inverse — the
recording weaves *itself*, in real time. See also **Anni Albers, *On Weaving***
(1965) on the structural logic of the woven line.

## Palette

Natural-dye textile on unbleached linen — ground `#e9e0cf`, dyes indigo
`#2b3a67`, madder red `#a8402f`, weld ochre `#c9a24b`, walnut `#5c4632`, warp ink
`#3a332a`. Dark-on-light UI. No neon, no glow-on-black.

## Honest gaps / next-cycle deepening

- The weave switches between two states (plain / 2/2 twill); a real Jacquard
  vocabulary (satin, basket, per-thread float control driven by the full
  spectrum) would give far richer texture.
- Resizing the window rebuilds the loom and clears the cloth (size is measured
  once at mount).
- No shuttle "click" transient yet (the optional nicety) — kept silent to avoid
  muddying the piano.
- The band→dye mapping is a fixed bass→treble ramp; mapping hue to spectral
  centroid or harmonic character would tie colour more tightly to the music.
- Future: let the finished cloth be exported as an image "recording," and let the
  weave density feed back into a light granular re-voicing of the source.
