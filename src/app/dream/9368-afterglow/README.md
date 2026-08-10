# 9368 · Afterglow — the recording remembers itself

**One question:** What if Karel's real piano recording never just played back — but slowly
disintegrated, and a granular cloud regrew the lost material from remembered grains, so the
piece dissolves from **him** into **the memory of him**?

A self-decaying, self-reconstituting memory instrument. A hypnagogic, memory-dissolution
state: calm, warm, boundless. Not a loop that repeats — a recording that erodes as it plays,
and remembers itself back into being from its own earliest, cleanest fragments.

---

## The mechanic

**1. Source — Karel's real _Welcome Home_ piano.**
On "Begin the memory" we fetch the read-only audio endpoint
(`/api/audio/549fc519-f7fc-4c38-a771-adaad2edbc81`) behind a 4-second aborting fetch, read the
signed `url`, fetch the file, and `decodeAudioData` it into an `AudioBuffer` — the exact proven
idiom from `4264-lucent`. That immutable buffer is looped and handed to two paths.

**2. Disintegration engine (`audio.ts`).**
The recording is worn thin over a ~78-second arc:

- a **dry path** carries the clean recording and fades out first (gone by ~42% of the arc), so
  the opening genuinely sounds like _him_;
- a parallel **bandpass filterbank** (eight bands spanning the piano's body) carries the rest.
  Each band slowly loses gain and, on its own seeded schedule, flickers into **gaps** — spectral
  bands drop out, the tape wears thin. Each band also has a seeded "death fraction" after which
  it is essentially gone.

All changes are slow `setTargetAtTime` ramps — no clicks, no strobing, only gradual thinning.

**3. Granular regrowth (`grains.ts`).**
A cloud of short (~120–340 ms) enveloped grains reads the **pristine** buffer directly — it never
passes through the erosion filterbank, so the grains _are_ the remembered, un-eroded material.
Grain offsets are biased toward the **opening** of the recording (its earliest, least-eroded
passes), with a gentle seeded pitch spread (mostly ±2 semitones, occasional octave-down for
warmth) and raised-cosine windows. As the source erodes, the cloud's **level and density rise**
to fill the vacated gaps, and its lowpass tone opens downward so it softens as it takes over.

Total energy stays roughly constant while the **material migrates** from his real notes to a soft
cloud of remembered fragments: him → the memory of him.

**4. Never silent — fallback + drop.**
If the fetch/decode fails (network, CORS, timeout, 404, missing `decodeAudioData`), `synth.ts`
synthesises a seeded warm-major "welcome-home" arpeggio (I–IV–vi–V in C major) **directly into an
AudioBuffer** — no live oscillator graph, no `OfflineAudioContext` dependency — and that buffer
disintegrates and regrows through the identical path. You can also **drag-and-drop any audio
file** onto the page to make it the source and let it remember itself instead.

Every source routes through `_shared/visionary/safeMaster` at master gain **0.18** (ear-safety
high-shelf + lowpass cap + limiter).

---

## The visual — inline-SVG afterglow spectral-cloud

An accumulating cloud of soft warm blobs over a warm near-black ground (amber → gold → cream,
built from radial-gradient `<circle>`s under one growing Gaussian-blur filter):

- **Spectral blobs** (his notes) map their brightness/size to the live spectrum (read from the
  safe-master analyser). They dim as the disintegration advances — his notes dissolving.
- **Remembered motes** (the cloud) fade in and diffuse outward as the memory takes over.
- The whole cloud **softens** — the blur `stdDeviation` grows with progress — a literal afterglow.
- Palette is warm-only. Only slow luminance drift; no strobe, no flicker, no fast flashing.

**Muted-review demo:** on mount a seeded `mulberry32(0x9368)` **no-audio demo** drives the cloud
from a pseudo-spectrum, blooming it within ~1 second with no audio and no user action — a muted
glance already sees the art alive. `prefers-reduced-motion` calms the drift and the gap flicker.

---

## References

- **William Basinski, _The Disintegration Loops_ (2002–2003)** — magnetic tape loops that
  literally shed their ferrite with every pass, so the music erodes as it plays. The disintegration
  engine is the digital echo of that idea: the recording decays a little more each loop.
- **Curtis Roads, _Microsound_ (2001)** — the theory and practice of granular synthesis: sound as
  clouds of enveloped micro-events. The regrowth cloud is granular resynthesis in exactly this
  sense — thousands of short grains sampled from the remembered buffer.

---

## Determinism

No `Math.random`, no `Date.now()`, no argless `new Date()`. Every stochastic choice — the synth
phrase, the per-band erosion schedule, the grain offsets/pitch/gain, and the demo pseudo-spectrum
— draws from a `mulberry32` stream seeded on `0x9368`. The only clock read is the **audio clock**
(`ctx.currentTime`), which is deterministic per render. Two runs replay identically.

## Files

- `page.tsx` — route, chrome, inline-SVG cloud, muted demo, drag-and-drop, teardown.
- `audio.ts` — source loader (real fetch + synth fallback), disintegration filterbank engine.
- `grains.ts` — the granular regrowth cloud.
- `synth.ts` — seeded warm-piano AudioBuffer fallback.
- `rng.ts` — `mulberry32` + seed.

## Honest limitations

- The erosion is a **filterbank + per-band gain automation**, not a true FFT spectral resynth. It
  reads clearly as "bands dropping out / tape thinning," but it does not model per-partial phase
  decay the way a real STFT eroder would. This was a deliberate trade for robustness (it cannot
  glitch or explode) and clarity.
- Grains read a fixed buffer, so "remembered early passes" is modelled by **biasing offsets toward
  the start of the recording** rather than capturing literal earlier loop iterations. The felt
  result — the cloud remembers the opening — is the same.
- The bandpass sum only approximately reconstitutes the original spectrum; the eroding timbre is
  slightly more "vowelled" than the dry take. In this piece that reads as part of the dissolution.
- The SVG cloud maps a handful of spectrum bins to blobs; it is an impression of the spectral
  content, not a calibrated spectrogram.
- Very long sessions hold at full disintegration (progress clamps at 1): the cloud persists as the
  steady-state "memory," it does not re-form into the clean recording.
