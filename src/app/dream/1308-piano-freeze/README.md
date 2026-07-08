# 1308 · Piano Freeze

Reach into Karel's recorded solo piano with your bare hand, scrub through it, and
pin a single moment into an infinite shimmering drone.

## What it is

Karel's fixed solo-piano recording (_Welcome Home_) is made plastic and
re-performable with the body. A granular resynthesis engine reads the recording
as a stream of overlapping Hann grains, and the **read position** (where grains
are sampled from) moves _independently_ of grain playback — so scrubbing is
smooth and pitch-independent, and "freezing" a moment falls straight out of the
same machine.

## How to use it

1. Press **Start** — the piano loads (or a synthesized fallback if the recording
   is unreachable) and a slow auto-scrub begins immediately, so it's audibly and
   visually alive with no input.
2. Press **Enable camera to freeze with your hand** for the full instrument:
   - **Move your hand left ↔ right** — scrub the playhead through the whole
     recording (left = start, right = end).
   - **Raise your hand up** — **FREEZE**: the read position stops chasing and the
     overlapping grains re-read one slice endlessly = a Paulstretch-style infinite
     shimmer. The spectral curtain crystallizes; the amber playhead halo swells.
   - **Pinch ↔ spread** (thumb-tip to index-tip) — tilt the spectrum darker
     (pinch) or brighter (spread) via a low-shelf / high-shelf pair.
3. **No camera?** A mouse driver is always available: move left/right to scrub,
   hold the pointer near the top of the canvas to freeze, and scroll the wheel to
   tilt the tone. If you leave it alone, a gentle auto-drift keeps it breathing.

The source in use (real recording vs. fallback) is shown under the title.

## The technique

- **Granular player.** ~135 ms Hann-windowed grains, ~60% overlap, a ~20 ms
  lookahead scheduler, capped at 48 concurrent grains. Grains always play at
  rate 1 (± a few cents of detune), so the read position and pitch are fully
  decoupled — time-stretch without pitch-shift.
- **Freeze = chase-weight × (1 − freeze).** The read position eases toward the
  hand's target; scaling that easing by `(1 − freeze)` means at full freeze the
  read point simply stops. Per-grain read-jitter and detune (both scaled by the
  freeze amount) keep the held slice glistening rather than buzzing.
- **Parallel dry path.** When frozen, a second, _clean_ grain stream (no jitter,
  no detune) fades in alongside the shimmer so the frozen moment stays legible
  while it holds — nothing is hard-muted.
- **Master chain.** grains → low/high-shelf tilt → analyser → master gain →
  `DynamicsCompressor` limiter → out. Master gain ramps from 0 with
  `setTargetAtTime` (never clicks); Stop ramps to 0 in ~60 ms, then closes the
  context.
- **Visuals.** A scrolling spectral curtain (Canvas2D, violet/indigo) driven by
  an `AnalyserNode` FFT. On freeze the scroll halts and crystallizes with a slow
  (<3 Hz) cyan-white shimmer — no strobe; brightness only ever drifts. An amber
  playhead timeline shows scrub position over the recording, and a mirrored
  webcam thumbnail draws amber landmark dots when hand-tracking is live.
- `prefers-reduced-motion` lowers scroll and shimmer rates.

## References

- **Robert Henke / Monolake** — granular time-stretching and buffer-scrubbing as
  a performable gesture.
- **Paulstretch** (Nasca Octavian Paul) — extreme, smooth spectral time-smearing;
  the model for the frozen infinite drone.
- **Sampleson _Aeronaut_ (2026)** — spectral freeze held _against_ a parallel
  looper so the source moment never fully disappears; the direct inspiration for
  the dry-parallel legibility path.

## Next-cycle deepening

- **Two-hand span** → freeze _width_: let a second hand set how wide a slice the
  frozen grains sample from (a point vs. a smeared chord), à la a granular cloud.
- **Depth (z) as grain density / spray**, so pushing the hand toward the camera
  thickens the cloud.
- **Layered freezes** — pin several moments at once into a stacked chord of
  drones, each with its own tilt, and cross-fade between them.
- **Pitch handle** — a gesture to transpose the frozen grains independently of
  the read point (true granular pitch/time separation), turning frozen moments
  into playable harmony.
- **WebGL curtain** for a denser, higher-resolution spectral crystal on capable
  devices.
