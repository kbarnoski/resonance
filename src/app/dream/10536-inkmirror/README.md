# 10536 · Inkmirror

**A mirror that draws you as a living illuminated manuscript — tracing your
silhouette in self-writing gold-ink calligraphy on vellum, sounding a warm
plucked voice with every stroke it lays.**

## The one question

_What if a mirror drew you as a living illuminated manuscript — tracing your
silhouette in self-writing gold-ink calligraphy on vellum — and every stroke it
laid down sounded a warm plucked voice?_

## The technique — contour-illumination

Not a physics sim, not a particle field, not a fluid. This is image processing →
contour tracing → generative stroke rendering:

1. **Silhouette.** The live camera is reduced to a 96×72 luminance grid. A slowly
   adapting background estimate (EMA, α≈0.02) yields a foreground **presence**
   mask: wherever you recently moved lights up and lingers ~1s before fading.
2. **Contour.** From the mask centroid the mirror casts `N_ANGLES` rays outward
   and reads the boundary radius `r(θ)` — an ordered, closed silhouette outline.
   This single representation is shared by the camera path and the fallback.
3. **Self-writing calligraphy.** A pen sweeps that outline continuously (~one loop
   / 3.6s). Each point it crosses it lays a **broad-nib gold stroke** tangent to
   the edge — thick across the nib, thin along it, like a held quill. Where the
   contour has moved since last frame it writes denser, brighter strokes; older
   strokes illuminate with a gilt glint then fade. Sharpest curves get deep
   ultramarine / vermilion accents.
4. **Sonification.** Every laid stroke plucks a warm gut-string / vielle voice
   (short finger-noise attack + gently inharmonic partials, fast pluck decay).
   Pitch = the stroke's height on the page in a **D-Dorian** modal set; velocity
   = local contour speed. A soft warm pad breathes underneath and glides between
   modal centres — it moves; it is **not** a static just-intonation drone.

## Output

Rendered on **WebGL2** (GLSL ES 3.00): a fullscreen vellum/parchment ground
shader plus **instanced** calligraphic-stroke quads (`drawArraysInstanced`),
premultiplied-alpha gold-leaf shading over cream. No Canvas2D in the art layer
(the offscreen canvas is used only to _sample_ the camera). Palette is jewel-toned
illuminated: warm cream vellum, luminous gold leaf, deep ultramarine, vermilion.

## Named reference & lineage

- **Daito Manabe & Kyle McDonald, _Transformirror_ (2024–2026)** — a real-time
  installation mirror that transforms visitors and sonifies the transformation.
  This is one of three approaches to that shared concept; Inkmirror is the
  **contour-illumination** lane.
- **The illuminated manuscript / Book of Hours** — gold-leaf figure drawing on
  vellum, jewel-toned initials, the gilding of the most turned corners.

## Degrade ladder

1. **Full:** WebGL2 + camera granted + audio → your silhouette is written in gold
   and sings as it draws.
2. **Camera denied / unavailable:** a seeded, deterministic breathing **ghost
   figure** (head + torso + moving arms) runs the _same_ contour → calligraphy →
   sound pipeline. Audio still plays. Badged as camera-denied.
3. **Muted, no interaction (06:30 phone review):** on mount the synthetic figure
   auto-draws in gold ink, **silent, no camera prompt**, badged `auto`, within a
   fraction of a second of load.
4. **No WebGL2:** a `text-destructive` notice explains the art can't draw; the
   plucked voices still run once started.

## House rules

- `"use client"` is line 1. Logic split into `contour.ts` (silhouette→contour→
  strokes), `audio.ts` (safe-master routed voices + moving pad), `rng.ts`.
- No `Math.random` / `Date.now` / `new Date` anywhere — seeded `mulberry32(0x10536)`
  + `performance.now()` + `AudioContext.currentTime` only.
- Camera requested only on the Start tap. Full teardown on unmount (camera tracks
  stopped, RAF cancelled, `ctx.close()`, GL programs/buffers/VAOs deleted).
- Audio routed through the shared `createSafeMaster`. Respects
  `prefers-reduced-motion` (slower pen, longer stroke life, gentler flash).
- Pure client. No API route, no network, no new deps — Web Audio + raw WebGL2.

## Ambition self-assessment

Reaches for genuine sacred-manuscript beauty rather than a novelty filter: the
broad-nib width modulation, the gilt-glint illumination flash, and the
ultramarine/vermilion accenting of high-curvature corners give it a real
Book-of-Hours character, and the pluck-per-stroke coupling makes the sound feel
_written_ rather than reactive. The honest limitation is the radial contour: it
reads a single boundary radius per angle, so deep concavities (a person's gap
between arm and torso) get flattened into the silhouette — it stylises the figure
rather than tracing every notch. For the illuminated-manuscript aesthetic that
simplification reads as intentional, but a marching-squares outline would trace a
truer edge if pushed further.
