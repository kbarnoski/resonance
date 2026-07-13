# 1596 — lectio

**The one question:** *What if each struck note of a real piano recording turned the next word of a page of luminous scripture — so the performance literally reads the text aloud, one word per note?*

A tall vertical **codex column** of seeded pseudo-scripture (rows of pronounceable pseudo-words) is painted near-invisible on a near-black page. A bright **reading light** illuminates one word at a time — a hot candlelight head with a dim amber afterglow trailing above it — and a just-intonation FM "reader" synth speaks each word as it lands. Left alone it reads hands-free on a seeded internal pulse and loops, so the piece is **never blank and never silent**.

## The headline: an onset-detection score-follower

Load a real piano recording (the **Load audio** button, or drag-and-drop onto the page). It plays through a `MediaElementSource → AnalyserNode`, and each animation frame a **spectral-flux onset detector** runs over the live spectrum:

- **Spectral flux** = the sum of positive bin-to-bin magnitude increases between successive spectra. A note attack is a broadband rise in energy, so flux spikes on each struck note (Bello et al., *A Tutorial on Onset Detection in Music Signals*, IEEE TSALP 2005).
- A spike becomes an **onset** when it exceeds an **adaptive threshold** (running mean + k·std over a ~0.7 s window), is a local peak, and lies outside a short **refractory window** so each attack fires exactly once.
- **Every detected onset advances the reading light to the next word.** A run of fast notes rushes through a line; a held chord lets a word glow. The built-in synth **ducks** to a soft under-bed so the loaded piano leads.

This is a deliberately lightweight cousin of real-time audio-to-score alignment. Where **Online Time Warping** (Dixon, 2005) and **Matchmaker** (arXiv:2510.10087, real-time piano score following, 2025) align a live performance to a *known* score, this follower reads a **monotonic cursor** straight from the performance's attacks — no score, one word per note. That lineage is the reference; the mechanism here is intentionally simpler and self-contained.

## How to load audio

- Click **Load audio** and pick any `audio/*` file (mp3, wav, ogg, m4a, flac…), **or**
- Drag a file anywhere onto the page and drop it.

Loading a file is a user gesture, so it also starts the (gesture-gated) `AudioContext`. The badge in the top-right switches from `reading: internal pulse` to `reading: piano onsets`.

## Output surface & fallbacks

- **Output is typographic DOM via the CSS Custom Highlight API** ([MDN](https://developer.mozilla.org/en-US/docs/Web/API/CSS_Custom_Highlight_API)). Eight buckets `read0…read7` (hot head → dim afterglow) are pre-registered once; every frame the reading light is drawn by re-ranging real `Range` objects over the codex Text node — **zero per-glyph DOM, no Canvas, no WebGL**.
- **Progressive enhancement:** where `CSS.highlights` is unavailable, the codex is built from real `<span data-read>` nodes and the light is drawn by toggling classes `rd0…rd7`. A live badge reads **native highlights** vs **fallback**.
- **Bad audio file:** a `text-destructive` message appears and the reading simply continues on its internal pulse.

## Secondary controls

- **Space** — pause / resume the reading (the under-bed keeps sounding).
- **→ / n** — step the reading light one word by hand (a keyboard reader for the text).

Input is **audio-file + buttons only** — no microphone, no voice input.

## Determinism & safety

- Everything seeds from a `mulberry32` PRNG and times from `performance.now()` / `AudioContext.currentTime`. No wall-clock or unseeded-entropy calls anywhere.
- Master gain ≤ 0.15 through a `DynamicsCompressor`; loaded audio shares the compressor; ≤ 12 concurrent voices; full teardown on unmount (`ctx.close()`, node disconnect, `cancelAnimationFrame`, `revokeObjectURL`).
- No strobe; luminance changes ≤ 3 Hz. `prefers-reduced-motion` slows the pulse and caps the advance rate.

## References & lineage

- **CSS Custom Highlight API** — MDN.
- **Spectral-flux onset detection** — Bello et al., *A Tutorial on Onset Detection in Music Signals*, IEEE TSALP 2005.
- **Online Time Warping** — Dixon, 2005; **Matchmaker** — arXiv:2510.10087 (real-time piano score following). The audio-to-score-alignment lineage this onset follower relates to.
- **Illuminated manuscript** / ***lectio divina*** — the visual and contemplative reference: the slow, meditative reading of scripture one phrase at a time.
- Asemic writing (Henri Michaux) — text that reads as meaning without reference.

## Plan context

This is **cycle-2 of the 1588-glossolalia banked plan** (a multi-cycle arc): 1588 flooded the whole field with language and resolved it with steered apertures; 1596 narrows that to a single reading light welded to an external audio file. **Cycle-3** folds in Karel's real recorded *Path* piano and the sibling followers.

## Files

- `page.tsx` — client component: painter (Custom Highlight API + span fallback), rAF reading loop, controls, drag-drop.
- `verse.ts` — seeded `mulberry32` morpheme generator → the codex (words with offsets, tails, line indices, and a seeded JI pitch contour).
- `synth.ts` — just-intonation FM "reader" synth: under-bed drone, per-word voice, duck, external-audio routing, safety ceiling.
- `onset.ts` — audio-file loader + spectral-flux onset detector (adaptive threshold + refractory window).
