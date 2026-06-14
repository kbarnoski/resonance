# 583 · Piano Mosaic Field

**The one question:** *What if you could reach INTO Karel's recorded piano and re-voice it — painting with his own timbre in real time?*

A **concatenative-musaicing / corpus-based-resynthesis** instrument built over Karel Barnoski's real solo-piano recording. His performance is shattered into a corpus of short overlapping grains; you drag a luminous probe through a 2-D timbre field and the engine continuously selects and overlaps his *closest-matching* grains into a warm, continuous cloud of his own sound.

## What it is

- **Corpus build.** The recording is decoded to a mono `Float32Array` and sliced into overlapping **~120 ms Hann-windowed grains** (50% hop). For each grain we precompute, via a per-grain FFT:
  - **spectral centroid** → brightness (field **X** axis),
  - **RMS loudness**,
  - a **crude dominant pitch** (spectral peak with parabolic interpolation) → register (field **Y** axis).
  Near-silent grains are dropped and the corpus is capped (~1000 grains) so matching stays real-time.
- **Matching (the heart).** On a steady tick (~18 grains/sec) the matcher scores the whole corpus by weighted distance from the cursor target in `(brightness, pitch)` space, with a small loudness preference, a short repeat penalty (so it never machine-guns one grain), and a touch of jitter for organic variation. The best grain is launched. **This is target-driven selection (CataRT-style), not blind random granular scatter** — where you point *means* a timbre, and his corpus answers.
- **Concatenation.** Each grain plays through a Hann gain envelope with ~4–8 voices overlapping at once, so the stream glides and never clicks. A low-pass warmth filter + `DynamicsCompressor` limiter keep it warm and unclipped.
- **Visual.** One point per grain laid out in the timbre field — dim violet-grey at rest, blooming **warm ember** when voiced. A soft luminous probe + warm haze follow the cursor. The field breathes/shimmers while idle, and a slow **Lissajous auto-demo** drives the cursor until you take over (so a silent phone glance still looks alive).

## How to use it

1. Tap **Start** (unlocks the `AudioContext` and builds the corpus — lazy/async after the gesture).
2. **Drag** anywhere (pointer or touch): left↔right = darker↔brighter timbre, down↔up = lower↔higher register.
3. Let go and idle for a couple of seconds to watch the auto-demo re-voice the field on its own.
4. Open **Design notes** for the in-app explanation.

A status chip shows the source: **Karel's piano** (emerald) or **synthesized fallback** (amber). A second chip shows the active render backend and grain count.

## Tags

- **INPUT:** audio-file (Karel's piano) + touch/pointer-drag. *Not* camera, *not* microphone.
- **OUTPUT:** GPU particle field — WebGL2 additive points, with a Canvas2D fallback. *Not* three.js, *not* SVG. WebGPU is detected and reported in the backend label when present.
- **TECHNIQUE:** concatenative musaicing / corpus-based grain **matching**.
- **VIBE:** adult, warm, immersive, tactile. No pentatonic safe-note tapping.

## Graceful degradation

- **Audio source:** `fetch` of the existing public route with a ~4 s abort timeout; handles either a JSON `{url}` redirect or raw bytes. On any failure/timeout it renders ~28 s of gentle lydian solo-piano into an `OfflineAudioContext` and builds the corpus from *that* — the build/match/visual path is byte-for-byte identical; only the source buffer differs. The instrument **always** sounds and **always** has a corpus.
- **Renderer:** WebGPU detected → reported; rendering runs through **WebGL2** (no WGSL build step / no extra deps) and falls back to **Canvas2D** if WebGL2 is unavailable. The public renderer interface is identical across backends.

## Ambition-floor criteria hit

- Audio **and** visual, never a static page; loads to a usable shell in <1 s with all heavy work deferred behind the Start gesture.
- Self-contained in this folder; no new npm deps, no API route, no shared-doc edits.
- Real corpus-based concatenative resynthesis with genuine per-grain spectral features and target-driven matching (not a granular-scatter stand-in).
- House typography: serif hero title, body ≥ 16 px, secondary text ≥ 70% opacity, 44 px tap targets, emerald/amber/violet/rose accent tokens, visible failure state.

## Named references

- **Diemo Schwarz** — *CataRT: real-time corpus-based concatenative synthesis* (2006), the canonical real-time target-driven grain-selection instrument this is modeled on.
- **Tralie & Berger** — *The Concatenator: A Bayesian Approach to Real-Time Concatenative Musaicing* (arXiv:2411.04366, 2024) and **MACataRT** (arXiv:2502.00023, 2026).
- **Curtis Roads** — *Microsound* (MIT Press), the granular-synthesis lineage.

## Unverified

Built in a headless sandbox: the real-audio fetch path and the GPU render path could not be exercised here. The synth-fallback path and the WebGL2/Canvas2D branches are written to the same patterns used elsewhere in the lab, and types check, but live audio decode + on-device rendering should be smoke-tested in a browser.
