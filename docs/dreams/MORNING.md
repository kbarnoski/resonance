# Morning digest — last updated 2026-06-18 (UTC), cycle 470

> **I gave a kid the scarce renderer — and your own piano.** Yesterday's jury banned the Canvas2D monoculture (9×) and the kids loop-groove reflex, and said in the same breath: *"a kid deserves the scarce renderer too — port the WebGPU stack to a kids piece,"* and *"use your real music, it's in only 1 of the last 15 (all adult)."* This kids fire did **both at once**. See `docs/dreams/JURY.md`.

## New since yesterday
- **`721-kids-piano-garden`** ("Papa's Piano Garden") — **a 4-year-old hums, and YOUR real piano blooms into light.** A near-dark field; a child hums or blows softly (mic, analysis-only — never recorded) and glowing petals bloom. The catch: every petal is **a grain of your actual *Welcome Home* recording** — louder breath scatters more, brighter seeds; a low gentle hum settles warm, dark ones low. No beat, no loop, no groove, nothing silly — just a tender, breathing texture. Runs on a **WebGPU compute particle field** (the lab's scarcest renderer, now finally shippable on the iPad a kid actually holds), with a first-class Canvas2D fallback. Touch nothing and a ghost breath keeps it blooming.
  - *Why open it:* it's the jury's #1 + #5 in one build — the WebGPU stack 710 proved, ported to a *child's* hands, sounding *your own playing* instead of a synth. The first time a kids piece uses your real Paths music.

## How this cycle ran
- **Kids WIDE fire:** 3 parallel builders, each on a **different scarce renderer** (the directest attack on the Canvas2D-9× diagnosis) — breath→**WebGPU** (won), hands→**three.js**, tilt→**WebGL2**. All three dodged every jury ban (no Canvas2D-primary, no loop-groove, no touch, no silly).
- Research → build chain (RESEARCH §470): **WebGPU went production-ready on iOS Safari 26 this window** — the blocker that always forced kids WebGPU to fall back to Canvas2D just closed. That's what made "a kid deserves the scarce renderer" real, not aspirational.

## Banked, ready to resurrect (IDEAS §470)
- **`722-kids-star-scoop`** ⭐ — reach UP with your bare hands and **scoop handfuls of glowing stars** from a deep 3D sky that chime (MediaPipe hands → three.js starfield, awe). The off-glass embodied swing; lost only because it leans on two CDNs + MediaPipe Hands already exists in the lab.
- **`723-kids-aurora-sail`** — **tilt the tablet to sail a glowing boat across a singing aurora** (WebGL2 GLSL fbm; the boat reads the light it passes and turns it to a calm modal melody). The bulletproof iOS-safe sibling.

## Open questions for Karel
- On a real iPad: does the WGSL compute path actually run, and does the garden read as *blooming from your piano* by ear? (Build-verified, not device-verified — no GPU/mic in the sandbox; Canvas2D + ghost-breath fallbacks guarantee a sounding glance either way.)
- Next is **adult** (471). Standing resurrect-first: **`722-paths-spectral-cloud`** ⭐ (fly the STFT shape of your recording, Xenakis/Ikeda) or **`713-shadow-duet`** ⭐ (first WebMIDI improviser, for you-the-pianist). Which?
