# Dream Chapters

**One question:** What if a long-form generative journey could *remember everything it has dreamed* — each musical movement minting an AI-generated "chapter card" image, so the piece accumulates a visible GALLERY of its own past, growing in depth as it plays?

## What it is

A 5+ minute hands-off audio-visual meditation. On **Begin**, a generative engine starts a slow evolving piece — sustained pads plus sparse plucked motifs over a drifting **D-Dorian / Aeolian** modal centre (no pentatonic, no I-IV-V loop). It progresses through a fixed sequence of named phases on a timeline:

> **Threshold → Drift → Deepening → Aurora → Return**

Each phase is ~45-70s and carries its own harmonic colour, voicing, density and tempo, so the music genuinely changes character movement to movement (open fifths → suspended/airy → minor-7th depth → bright maj7-add9 aurora → warm return). After **Return** the journey loops, and memory keeps accumulating across cycles.

## The accumulating-gallery long-form chain

This is a real **AI image pipeline inside an audio-visual piece**, and its defining move is **long-form memory made visible**:

1. **Phase boundary reached** → the engine composes a short evocative image prompt for that movement's mood from a controlled adjective/noun vocabulary (e.g. *Aurora* → "a vast aurora over a still black lake, luminous green and violet ribbons of light, mirror reflections, cinematic, dreamlike"). The active phase name + its prompt are shown on-screen.
2. **POST** the prompt to `api/route.ts` (`fal-ai/flux/schnell`).
3. The returned card **floats up at the front** of a **three.js** receding depth-field of textured planes — newest card largest/nearest, every older card pushed further back, all slowly drifting and parallaxing.
4. The camera **auto-drifts** through the corridor of accumulated dreams; a gentle drag lets you glance around, but touch is never the primary input.

So the screen is a corridor of the piece's own past. **The gallery at minute 5 is visibly fuller than at minute 1 — memory you can SEE.**

## Graceful fallback (the safety contract)

The gallery **keeps growing forever with ZERO network**. If the API errors for any reason — no `FAL_KEY` (501), rate-limit / daily quota (429), model error (5xx), or the returned image fails to load — the piece mints a **procedural chapter card** instead:

- `drawProceduralCard()` renders the phase's mood to an offscreen canvas as a layered gradient + luminous blob/value-noise field + horizon band + grain, all in that phase's palette, **deterministic from the prompt hash** (so a given chapter always looks the same).
- That canvas becomes the plane's texture via `THREE.CanvasTexture`. A returned model image is also routed through a canvas, so texture handling is uniform and cross-origin tainting never produces a blank plane (`crossOrigin = "anonymous"`, `onerror` → procedural).
- A readable amber note — **"dreaming locally (no model key)"** — appears. Never a broken-image icon.

Other degradations: **no WebGL** → amber notice + a Canvas2D/HTML stacked-card gallery listing every chapter and prompt. On unmount everything is torn down: geometry/materials/textures disposed, renderer disposed, `requestAnimationFrame` cancelled, timers cleared, `AudioContext` closed.

## Named references

- **Refik Anadol** — latent *data-paintings* / *Machine Memoirs*: machine memory as a navigable visual archive. The accumulating, recede-into-depth gallery is a direct nod to treating a generative system's own history as something you walk back through.
- **Brian Eno** — *Music for Airports* / generative long-form: the slow-evolving, phase-structured, hands-off meditation rather than a beat-driven loop.
- **Contemporary cousin** — the current **TouchDesigner + StreamDiffusion** "audio-reactive AI" trend generates imagery *per frame* in lockstep with sound. Dream Chapters deliberately goes the other way: **slow and long-form**, one deliberate image per multi-minute movement, prized as a remembered chapter rather than a reactive surface.

## Ambition criteria hit

- **AI image pipeline inside an A/V piece** (the lab's #1 requested-but-missing direction) — real `flux/schnell` calls wired to a live generative score.
- **Long-form memory made visible** — named multi-minute phases; one card per movement; a 3D depth-field that is demonstrably fuller later than earlier.
- **Genuinely audio-visual** — Web Audio generative engine (pads + sparse modal motifs, reverb, LFO shimmer) AND a real three.js scene, neither static.
- **Bulletproof fallback** — runs and accumulates **forever with no key, no network**.

## Files

- `page.tsx` — generative audio engine, phase timeline, three.js depth-field gallery, procedural-card fallback, HUD, WebGL/Canvas2D degradation.
- `api/route.ts` — guarded `fal-ai/flux/schnell` endpoint (mandatory `guard()` + `FAL_KEY` check).
