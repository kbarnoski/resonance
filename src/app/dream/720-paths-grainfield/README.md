# 720 · Paths · Grainfield

## The one question
**What if Karel could fly *inside* his own recorded piano** — the whole "Welcome Home"
performance shattered into a cloud of tens of thousands of GPU particles, each
particle one grain of the audio, positioned by its sonic character; and dragging
a cursor through the cloud re-sounds the nearest grains, concatenatively, in space?

An adult, cosmic-meditative, immersive piece. Not kids, not a beat/loop/step-sequencer.
The voice you hear is **his real recording, re-granulated** — never a fresh oscillator
melody as the primary sound.

## Tags
- **INPUT** — Karel's real recorded solo piano (recording id `549fc519-…`, fetched
  read-only via the existing `/api/audio/:id` GET route) + pointer/drag navigation:
  you fly a cursor *through a 3D-ish particle field*. This is navigation of a field,
  not tapping pads on glass.
- **OUTPUT** — a **WebGPU compute particle field** built on the raw WebGPU API (no
  library): each grain is one GPU particle, advected by a compute shader, additively
  blended. Degrades **first-class** to a Canvas2D particle field with the same
  spring-to-home / drift / cursor-bloom behavior when WebGPU is absent.
- **TECHNIQUE** — concatenative / corpus-based granular resynthesis. The recording is
  segmented into ~90ms grains (60–120ms band, 50% overlap). Each grain is analyzed for
  **RMS energy** and a **brightness / spectral-centroid proxy** (zero-crossing rate),
  then mapped to a position: `x = time-through-the-piece`, `y = brightness`, plus a slow
  curl-noise drift. Navigating near a region selects the nearest grains and plays them
  back with a **Hann window** + **stereo pan from screen position**.
- **PALETTE / VIBE** — cosmic / aurora / immersive-meditative. Deep near-black space,
  luminous *additive* particles. Brand violet (`violet-300`/`violet-500`) with aurora
  emerald/teal accents; excited grains flare toward luminous white-violet.

## How the grain corpus is built and navigated
1. **Load** — on the Start gesture an `AudioContext` is created/resumed (iOS-safe),
   then `fetchPianoBuffer` pulls his recording. On any failure it renders a short soft
   detuned arpeggio offline so the corpus is never empty.
2. **Analyze** — `buildGrainCorpus` slides a ~90ms window across the buffer. Silent
   windows are dropped (the cloud is all signal). Each surviving grain stores its
   offset, RMS, brightness, and its normalized descriptor position `(nx, ny)`.
   The set is capped (~24k for GPU, subsampled to ~5k for Canvas2D) to stay cheap.
3. **Field** — every grain becomes a particle whose *home* is its descriptor position.
   A compute pass drifts each particle on curl noise, springs it back toward home, and
   pushes/brightens particles the cursor passes near, so the region you sound visibly blooms.
4. **Navigate** — pointer position maps into descriptor space; `selectNearest` returns
   the grains within a small radius, sorted nearest-first. A throttled trigger
   (~14 Hz) re-sounds up to 3 of them per tick, each Hann-windowed and panned.

## Degrade story
- **No WebGPU** → a complete Canvas2D particle field with identical behavior (trailing
  fade, additive blend, cursor halo). A badge says which renderer is live.
- **No live recording** → offline-rendered fallback tone; a `text-rose-300` notice
  appears and grain count still shows so the piece stays fully alive.
- **Alive on load** — within ~2.5s of no pointer the cursor auto-drifts on a slow
  Lissajous path so a visitor who touches nothing still sees and hears the idea;
  any interaction takes back control instantly.
- **Master chain** — `masterGain (0.28) → lowpass (6.8 kHz) → DynamicsCompressor
  (−10 dB, 20:1) → destination`, so it can never be harsh or clip.
- **Teardown** — rAF cancelled, all voices stopped, renderer destroyed (GPU buffers +
  device released), AudioContext closed on unmount.

## Named references
- **Diemo Schwarz · CataRT** — real-time corpus-based concatenative synthesis;
  navigation of a 2D descriptor space over a sound corpus, selecting and concatenating
  grains by their analyzed character. This prototype is a direct descendant: descriptor
  space (time × brightness) navigated by a cursor.
- **Audio Latent Space Cartography** — the idea of navigating a spatial *map of sound*
  rather than triggering discrete events.
- Extends the lab's **`710-presence-bloom`** (WebGPU-compute particle field) and
  **`718-duet-paths`** (concatenative grains of Karel's real piano).

## Next-cycle deepening
Add a third descriptor (pitch via autocorrelation, or spectral flatness) and a true 3D
fly-through with depth-of-field and parallax; allow two cursors to weave counterpoint
through the same corpus; and let a drawn path be saved as a re-playable concatenative
phrase — a melody composed entirely out of where you flew.

## Files
- `page.tsx` — orchestration: gesture-gated start, corpus build, renderer wiring,
  pointer navigation, ghost auto-demo, spatial grain triggering, teardown, UI.
- `audio.ts` — recording loader, offline fallback synth, grain-corpus analysis,
  spatial nearest-grain selection.
- `render.ts` — WebGPU compute particle field + Canvas2D fallback (same behavior).
