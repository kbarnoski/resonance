# 5160 · Data Pigment

`input:audio-file · output:WebGL2 · technique:semi-Lagrangian dye advection · vibe:cosmic-ambient/oceanic`

## The one question

What if Karel's real piano recording were rendered as living, breathing
data-pigment — a boundless oceanic flow-field of coloured dye that the music
itself paints, advects, and blooms — a drug-free cosmic-ambient /
oceanic-boundlessness state?

## How it works

A WebGL2 **ping-pong dye field** does the whole thing on the GPU. Two half-float
RGBA textures are swapped every frame:

- **Velocity field** — advects itself semi-Lagrangian (`prevPos = uv - v·dt`,
  bilinear sample) and is stirred by a **curl-noise** force plus a slow
  centre-rotation "swell". The swirl amplitude follows overall loudness and the
  swell follows bass, so heavy left-hand chords make the whole ocean heave. Slow
  and breathing — modulation is smoothed over seconds, not frames.
- **Dye (pigment) field** — a colour field carried along that velocity, with a
  very gentle dissipation so the image *accumulates* a long memory rather than
  flickering.
- **Deposit** — Karel's spectrum (`AnalyserNode`, fftSize 2048) is split into
  **five bands** (sub · low · mid · high · air). Each band injects pigment of its
  own colour — deep indigo-blue for the sub through pale magenta for the air,
  along the shared violet→magenta oceanic ramp — at a slowly orbiting anchor, so
  the *shape* of a chord becomes the *shape* of the cloud. Simple broadband
  spectral-flux **onset detection** blooms a radial ring of pigment.
- **Present** — a 4-tap bloom, a Reinhard-ish tonemap and a vignette so the
  result reads as a luminous pigment cloud, not TV static.

### Autonomous on load

On mount the field is **already alive**: a seeded ambient generator (mulberry32)
drives synthetic band swells and occasional blooms through the identical fluid,
so a silent phone viewer sees the whole idea with no interaction. A single
primary button, **"Play Karel's piano"**, starts the AudioContext (browsers
require a gesture) and hands the pigment over to the real recording.

## How Karel's audio is fetched

Reuses the proven recipe: `GET /api/audio/{DEFAULT_UUID}` → `{ url }` →
`fetch(url)` → `decodeAudioData` → looping `AudioBufferSourceNode` →
`AnalyserNode` → master gain (2 s ramp-in) → destination. `DEFAULT_UUID` is
`549fc519-f7fc-4c38-a771-adaad2edbc81` (Karel's Path piano).

## How it degrades

- **Audio fetch/decode fails** (offline, 404, CORS, no `decodeAudioData`) → a
  seeded **cosmic-ambient pad** (detuned sine/triangle drones, slow filter LFO,
  long reverb) plays through the same analyser. A plain "recording unavailable"
  note uses `text-muted-foreground`; only a genuine load error uses
  `text-destructive`.
- **Before any click / silent phone** → the seeded ambient generator keeps the
  ocean painting itself.
- **No WebGL2 / no float render targets** → a Canvas2D fade-feedback fallback
  (rotational drift + additive radial pigment) driven by the identical stroke
  stream, with a `text-destructive` notice.
- **`prefers-reduced-motion`** → gentler curl, slower settle, no blooms.

## Named references

- **Refik Anadol — _Dataland_**, the world's first AI art museum, opened Los
  Angeles 2026 (NPR, 29 July 2026, "machines are collaborators"). Anadol's
  signature move is treating **data as pigment**: vast, slow, breathing flows of
  latent nature-data rendered as living paint. Here the "pigment" is the spectral
  energy of Karel's piano, injected into and carried by a fluid flow.
- **Jos Stam — _Stable Fluids_ (SIGGRAPH 1999)**: the semi-Lagrangian advection
  scheme that makes the GPU dye field unconditionally stable over long runs.
