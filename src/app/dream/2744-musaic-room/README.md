# 2744 · Musaic Room

**The room plays itself back.** A drug-free instrument whose only input is the
microphone. Everything the space has heard is remembered and re-voiced, so over
minutes the room composes an evolving piece out of its own past.

## The one question

If a room could only ever play back what it has already heard, what music would
it compose out of its own past?

## How it works

Classic concatenative / granular **musaicing** in the browser — pure Web Audio +
DSP, **no machine learning**.

1. **Capture.** A `ScriptProcessorNode` reads the live source in fixed **4096-sample
   grains** (~93 ms @ 44.1 kHz).
2. **Features (all real, computed from the live signal).** Per grain:
   - **RMS loudness** — from the raw PCM.
   - **Spectral centroid** (brightness) — from a hand-rolled Hann-windowed
     radix-2 **FFT** magnitude spectrum.
   - **Zero-crossing rate** (noisiness) — the third feature.
   These are normalized (sqrt loudness, log brightness) into a 0–1 vector.
3. **Growing corpus.** Each grain's PCM + feature vector is stored, capped at
   **600 grains** (oldest evicted) so it stays real-time and long-form-stateful.
4. **Match & re-voice.** Each new query grain finds its **nearest neighbour** by
   weighted feature distance, **excluding anything heard in the last ~1 s** so
   the room can't just echo itself. That *past* grain is played back (buffer
   source, cosine edge-fades to kill clicks) **instead of** the live sound.
   Sparse and literal at first; dense and uncanny as the corpus fills.

No pitch quantization / scale-snapping / auto-tune — grains are the raw recorded
material and are free to sound rough and uncanny.

## Visual (Canvas2D)

A live 2D feature map: each corpus grain is a dot (x = spectral centroid /
brightness, y = RMS loudness), fading from violet as it ages. Every frame the
current query grain and its matched neighbour are highlighted, linked by a line,
and the match pulses (slow ~0.7 Hz — no strobe / no full-frame flashing). The
scatter visibly fills as the room is heard.

## What's real vs faked

- **Real:** grain capture, all three features, FFT, nearest-neighbour matching,
  corpus growth/eviction, and grain playback — all live DSP on the input.
- **Faked (fallback only):** if the mic is denied/unavailable, a deterministic
  **demo source** (a mulberry32-seeded tones-and-noise buffer, seed `0x2744`)
  feeds the *identical* pipeline so the piece still demos. It is never heard
  directly — only its mosaic reconstruction is.

## Determinism

No `Math.random`, no `Date.now`, no argless `new Date()`. The only randomness is
a mulberry32 PRNG seeded with `0x2744` (demo source). `performance.now()` is used
for grain timestamps only.

## References

- Diemo Schwarz — **CataRT** / corpus-based concatenative synthesis.
- Zils & Pachet — **"Musical Mosaicing"** (2001).
- 2026 frontier: **"The Concatenator: A Bayesian Approach to Real-Time
  Concatenative Musaicing"** (arXiv:2411.04366); **"Latent Granular Resynthesis
  using Neural Audio Codecs"** (arXiv:2507.19202, July 2026). This prototype is
  the no-ML browser cousin.

## Status

Demoable. Mic path + deterministic demo fallback both wired through one pipeline.
ESLint (`--max-warnings 0`) and `tsc --noEmit` both clean.
