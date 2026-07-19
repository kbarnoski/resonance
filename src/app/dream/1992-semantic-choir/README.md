# 1992 · Semantic Choir

**The one question:** *What if singing WORDS painted the room with their MEANING — the semantic content of what you sing, extracted by a real in-browser AI chain, becomes the visual and harmonic field?*

This is the lab's first **≥2-model AI-pipeline chain**, running **$0 in the browser** — no server, no API keys, no `package.json` change.

## The chain

1. **Model 1 — ASR:** microphone audio → text, via `Xenova/whisper-tiny.en` (automatic-speech-recognition, Transformers.js).
2. **Model 2 — sentence embedding:** the transcribed phrase → a 384-dim vector, via `Xenova/all-MiniLM-L6-v2` (feature-extraction, mean-pooled + normalised).
3. **Reduction:** the 384-dim vector is projected — through *fixed* pseudo-random axes — into a small set of control params (`reduceField` in `chain.ts`): base hue, hue-spread, turbulence, mirror-symmetry, warp, flow speed, brightness, inharmonicity, a fundamental, and a word-derived partial set. These params drive **both** the visuals and the audio.

Because the projection is deterministic, the **same phrase always paints the same room**, and phrases that *mean* similar things land near each other in colour and timbre — different words give visibly and audibly different textures.

Both models are fetched at **runtime** from a CDN via a dynamic import marked `/* webpackIgnore: true */`, so nothing is bundled and nothing is added to `package.json` (the pattern proven by the repo's depth-well / hand-loom loaders). First use downloads ~40–80 MB with a progress UI; Transformers.js auto-selects WebGPU or wasm.

## How the embedding maps to sound + light

- **Light (`gl.ts`, raw WebGL2 fragment shader — not three.js, not WebGPU, not Canvas2D):** a full-screen **domain-warped interference field** (two-pass fbm warp + travelling-wave interference + fine filaments), with a cartesian **mirror-fold symmetry**. Deliberately *not* a log-polar / concentric form-constant warp. Hue comes straight from the embedding, so the palette spans the wheel — "brass" pulls gold, "snow" pale cyan, "red forest" deep red — rather than defaulting to cosmic violet. Audio level breathes the brightness; a fresh phrase blooms as it settles.
- **Sound (`audio.ts`, Web Audio only):** the *meaning* chooses the sound. Six FM voices sit on an embedding-chosen fundamental at a **word-derived, continuously-varying partial set** (no fixed just-intonation lattice). Brightness tilts the partial gains and opens a low-pass; inharmonicity opens each voice's modulator depth and detunes the stack — so bright/energetic words sound bright and clangorous, calm words pure. Fields crossfade over ~1.3 s.

## Graceful degradation / self-demo

- On load, a **ghost cycle** of four deliberately-distinct example phrases ("ocean at midnight", "a bright brass fanfare", "quiet snow", "deep red forest") auto-advances every 7 s, so the canvas is never blank. Once the embedder loads, the ghost cycle is silently **upgraded to the real reduced embeddings** of those phrases.
- **No mic / mic denied** → the piece falls back to a **typed-text box** and runs only Model 2 on the typed phrase; the full semantic → light/sound mapping still works. (This is also the fast path for the impatient.)
- **Models fail to load** → same typed fallback; error surfaced in on-brand chrome.
- **No WebGL2** → an on-brand notice.
- Audio starts on the first user gesture (autoplay policy); the visual ghost runs immediately at first paint (models load lazily after).

## Named reference

Framed against **Memo Akten's *Learning to See*** (latent-space perceptual mapping) and **Refik Anadol's** data→pigment work — the fresh move is that the *semantic embedding of sung language* is the brush.

## What's rough

- `whisper-tiny.en` mishears short or sung fragments; spoken phrases transcribe far more reliably than sung ones.
- The projection axes are arbitrary: relative distances are meaningful ("quiet snow" ≈ "soft silence"), but there is no absolute "blue = sad" grounding.
- First load of the ASR model is slow; the embedder (needed for the fallback) loads first and is lighter.
- `ScriptProcessorNode` is used for the 16 kHz capture — deprecated but universally available and avoids an AudioWorklet module URL (which would fight the no-bundle rule).

## Files

- `page.tsx` — React shell, phase state machine, render loop, fallbacks, chrome.
- `chain.ts` — the two-model pipeline + embedding → params reduction.
- `gl.ts` — WebGL2 semantic field (fragment shader).
- `audio.ts` — Web Audio FM/additive harmonic field.
- `mic.ts` — 16 kHz mono phrase capture for the ASR model.
