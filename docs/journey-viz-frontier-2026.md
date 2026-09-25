# Journey Visuals — Frontier Deep-Dive (2026-09-25)

**The question (Karel):** have we truly pushed the limits of layering, visuals,
and movement we can do dynamically?

**The verdict: no — and that is good news.** The *design system* (analysis-derived
themes, 18-shot traveling phases, spirit-hints, 30-shader programs) is
frontier-grade. The *renderer* executing it is using a fraction of its own
dynamic range: motion that exists but is imperceptible, audio-reactivity that
is wired but switched off, post-processing at homeopathic doses, and a third
of our frames rendering at 100+ fps of unused GPU. The ceiling is far away,
and most of the distance is closable with code we already own.

Sources: full pipeline audit (file:line refs throughout) + external research
(fal video pricing, 3D Ken Burns literature, WebGPU baseline status).

---

## Part 1 — What the stack actually does today (audit findings)

Up to **16 composited layers** per frame: 5 concurrent WebGL shader canvases
(primary A/B crossfade, dual A/B in screen-blend, tertiary), the AI-image 2D
canvas, drifting clone overlays, a post-processing canvas (vignette + bloom +
halation + particles), Ghost's flash system, poetry. 234 fragment shaders in
the registry, 286 modes. That architecture is genuinely strong. But:

### The seven findings that matter

1. **Motion is imperceptible.** The AI layer HAS Ken Burns pan/zoom — tuned to
   ~1.5% zoom and <1% pan over an image's 20-second life (a 50s animation on a
   20s layer, `ai-image-layer.tsx:78,348-349`). The viewer cannot see it. Our
   "movement" is in practice a 6s crossfade.
2. **Audio reactivity is OFF everywhere it matters.** Every built-in journey
   renders shaders on synthetic sine waves (`smoothMotion`) because
   `audioReactive` defaults false and nothing sets it. The 3D scenes accept the
   analyser and ignore it (underscore params). The AI layer receives
   `audioAmplitude`/`audioBass` and never reads them. The music does not touch
   the pixels.
3. **Post-processing is homeopathic.** Peak bloom alpha ≈ 0.075, halation ≈
   0.022, vignette ≈ 0.22 — and `particleDensity` maxes at 0.08 catalog-wide =
   **4 particles** on screen. The knobs exist; the catalog whispers into them.
4. **The master mix fader is frozen.** `shaderOpacity` is 0.60 for every
   journey except Ghost — so the AI layer sits at a constant 0.40, in
   screen-blend (dark imagery can only vanish). The single biggest
   composition variable in the system is a constant.
5. **Dead capability, already paid for:** `chromaticAberration`,
   `colorTemperature`, `intensityMultiplier` computed per-frame and consumed by
   nothing; `ambientLayers` (wind/rain/drone/chime/fire) interpolated every
   frame with no consumer; four finished 3D scenes (**aurora, bonfire, lotus,
   field** — incl. an 8,000-point nebula and 5,000-point fire) implemented but
   unregistered; `palette` never reaches a single shader (colors are hard-coded
   per shader file); climax/drop/silence events only fire from analysis data
   the pack path never provides.
6. **GPU headroom is measured, not hypothetical.** 1,502 fps samples: median
   74, p90 120 (vsync-pinned), 37% ≥ 100 fps. The historical bottleneck was
   WebGL context churn (solved with explicit teardown), not fragment cost.
   The player is WebGL1; WebGPU is now baseline in every major browser.
7. **Two latent bugs** (fix regardless): the shared-link player ignores
   `--shader-opacity` entirely; a user whose last viz mode was AI-only gets an
   opaque black-filled AI canvas covering all shaders in journeys.

---

## Part 2 — The frontier (external research, Sept 2026)

- **Image-to-video is commodity-priced:** Wan 2.6 ~$0.05/s, Seedance ~$0.20 and
  Kling 3 ~$0.35 per 5s clip. A living 5s loop per shot ≈ $4.50/journey;
  the entire show's imagery in true motion ≈ **~$200 one-time**.
- **First-frame→last-frame video** (Kling/Wan/Seedance all support keyframes)
  generates one continuous camera move BETWEEN two stills — literally the
  music-video transition between our 18 shots, pre-renderable offline.
- **2.5D depth parallax** ("3D Ken Burns"): depth maps precomputed per image
  (Depth Anything V2 — runs in-browser on WebGPU, or offline at harvest), then
  a virtual camera drifts *through* the still with real parallax. Offline-safe,
  near-zero marginal cost.
- **WebGPU compute** is standard practice for particle/fluid systems at
  10⁵–10⁶ elements, audio-driven — vs our 4 canvas motes.
- **Feedback-buffer passes** (previous-frame texture → trails, flow, echo — the
  TouchDesigner idiom) are the single most-used technique in the reference AV
  work we cite (Anadol, Tschepe) and we have none.

---

## Part 3 — Roadmap, ranked by (visible impact ÷ effort)

### Tier 1 — pure code, zero spend, days not weeks
1. **Make Ken Burns visible.** Duration = layer life; zoom travel 8–15%, pan
   5–8%, per-shot direction variety. One constant block. The show stops being
   a slideshow the same day.
2. **Turn the music on.** Drive `u_bass/u_mid/u_treble` from the real analyser
   for all journeys (keep synthetic as fallback); feed amplitude into AI-layer
   opacity breathing, Ken Burns rate, and particle spawn. For the offline pack,
   precompute a per-track energy envelope from the stored analysis at pack
   build — deterministic, no runtime cost.
3. **Unfreeze the mix.** Author `shaderOpacity` per phase across the catalog
   (0.35–0.85 arcs — imagery-forward thresholds, shader-forward transcendence).
4. **Real doses in post.** particleDensity 0.2–0.8, bloom/halation ranges that
   actually register; wire the three dead knobs (`chromaticAberration` as a
   shader/CSS pass, `colorTemperature` as a canvas filter, `intensityMultiplier`
   as the event-response gain).
5. **Register the four dead 3D scenes** (aurora/bonfire/lotus/field) and make
   all 3D scenes read the real analyser (the uniforms are already threaded).
6. **Palette → shaders.** Add a `u_palette` uniform set from `frame.palette`;
   even tinting a subset of the 234 shaders makes every journey's shader work
   feel authored for that track.
7. **Events for everyone.** Derive climax/drop/silence events from stored
   analysis at pack build so the flash/shockwave system works beyond Ghost.
8. Fix the two latent bugs (shared-player opacity; aiOnly black-cover).

### Tier 2 — precompute at harvest, offline-safe, modest spend
9. **Depth-parallax the pack (~$0–20).** Depth map per pack image at harvest;
   new WebGL image layer samples image+depth for slow volumetric camera drift.
   This is the "photo becomes a place" upgrade, works fully offline.
10. **Travel clips at phase boundaries (~$30–60 selectively).** First/last-frame
    video between the last shot of phase N and first of N+1 — one continuous
    camera move across the biggest visual cuts. Start with transcendence
    boundaries only.
11. **Living hero shots (~$200 full show).** 5s img2vid loops for each phase's
    peak shot (loop-crossfaded). Do 1–2 journeys as a pilot first.

### Tier 3 — engine evolution, weeks
12. **Feedback-buffer pass** (prev-frame texture): trails, flow-echo, the
    Anadol/TouchDesigner idiom. Needs a WebGL2 pipeline for the 2D shaders.
13. **WebGPU compute particles** (10⁵ audio-driven points replacing the 4
    motes), with WebGL fallback per device tier.

### Sequencing recommendation
Tier 1 items 1–4 first — they change what the audience sees this week for $0.
Then 9 (depth parallax) as the flagship pack upgrade before the next Tramokyo
run. Pilot 10/11 on two journeys and judge with eyes before committing the
full spend. Tier 3 after the installation ships.

---

*Audit: full-pipeline subagent pass with file:line evidence, 2026-09-25.
External: fal/Wan/Kling/Seedance pricing pages, FILM/3D-Ken-Burns literature,
WebGPU baseline reporting (Web Almanac 2025: 65% of new 3D web apps).*
