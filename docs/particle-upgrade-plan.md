# Particle system — professional upgrade plan

Drafted 2026-10-12 (overnight, during tour pass 6). Karel approves each step; nothing
ships without a sample he has seen and a clean full-catalogue tour.

## Where the engine stands

- GPU sim (WebGL2 float textures), 160k particles on the kiosk, one shared engine
  across journeys; HDR trail target; 25 forms in 5 families, balanced by
  `particle-rotation.ts` (every form 2.7–5% of screen time).
- Souls (`souls.ts`) give each journey its palette, trail, camera and respawn style;
  per-journey motifs and palettes come from the journey's own stills.
- Image forms (emblems, Ghost flashes, blossoms, wings): each particle gets a target
  point on the image, importance-sampled from bright lines (`imgUv`, built in the
  decode worker), and springs to it (`(imgT - p) * 9.0`).
- Hard constraints carried forward: no main-thread GPU readbacks or GL syncs (kiosk
  stall lessons), steady-clock swirl shaders, calm journeys (First Snow, Ghost,
  Inferno), fade-never-drop, Snowflake/Ghost locked except on Karel's note.

## Root cause of "contract and expand"

Each particle's image target is chosen by its index, not by where the particle
is. A particle at the top-left is as likely to be sent to the bottom-right as
anywhere else, so on every image form the whole field converges through the
middle (contract) and then fans out to its targets (expand). Random pairing ⇒
the average path crosses the screen centre.

## The steps (in order, each one a sample → approval → tour)

### 1. Spatial mapping — "arrive where you are" (fixes contract/expand)
Two-stage settle, no CPU readback:
1. **Nearest-ink map.** In the decode worker (already where sampling happens),
   compute a jump-flood nearest-bright-pixel map of each image (e.g. 128×128):
   for every screen cell, the coordinates of the nearest bright texel.
2. **Arrive locally.** In the sim shader a forming particle reads that map at
   its own current position (+ a small hash jitter) and flies to the nearest
   line of the image — every particle moves a short distance, mostly inward
   along its own side. No more crossing through the centre.
3. **Settle along the surface.** Over ~1.5–3 s the target blends from the local
   nearest point to its importance-sampled home (`imgUv`), so density evens out
   and the image stays crisp — particles slide along the drawing rather than
   jumping across the frame.
4. Release is the mirror: dissolve outward from where each particle sits.

Sample: Ghost (blossom moment + final wings) and one Expansion emblem.
Measure: mean travel distance per particle and centre-crossing share before/after
(new probe in `scripts/journey-review/`), plus a filmed side-by-side.
Risk: low — one extra texture fetch in the sim; no new readbacks.
**Fits before the Monday freeze.**

### 2. Motion quality — curl flow + inertia
- Replace remaining per-form force jumps with a divergence-free curl-noise flow
  layer blended per form, so the field always moves like a fluid between forms.
- Critically-damped springs everywhere a target changes (already used for the
  image followers) — no velocity spikes on form hand-offs.
Sample: two journeys with frequent form changes. Post-event.

### 3. Light — the "professional" look
- Soft additive sprites with size-by-depth and a gentle depth-of-field
  (near/far particles bloom softer), HDR tone map tuned per soul.
- Subtle per-particle colour drift within the journey palette so dense forms
  read as a material, not a flat fill.
- Low tier keeps the current look (no DoF).
Sample: Summit + a dark Expansion journey. Post-event.

### 4. Musical intelligence — motion, not brightness
(Kinetic EQ laws stay.) Map phrase-level analysis — section starts, crests,
breaths from the deep summaries — to form changes and density swells, so the
field breathes with the composition rather than the beat. Onsets may burst
particles (allowed) but never move the camera or rotate graphic swirls.
Post-event; pairs naturally with Live Theatre (the mic drives the same hooks).

### 5. New form families (the mass expansion)
Once 1–4 are in: new forms per family (e.g. flocking with obstacle avoidance,
strange attractors, fluid ink in 2.5D, growth/L-systems for organic journeys),
each gated by `particle-diversity` shares and the tour. Sample 2–3 per batch.

## Process for every step
1. Build behind a flag (`?pfx=1` / kiosk diag) — show build untouched.
2. Sample film for Karel; approval.
3. Unit tests (continuity, diversity, no-sync-gpu) + full tour pass — must be as
   clean as pass 6 (the baseline).
4. Flip the flag; deploy once (never while Karel is watching).

## Timing
- Before freeze (Mon 2026-10-12 night): step 1 only, if pass 6 is clean and the
  sample is approved by Monday afternoon. Otherwise ship the pass-6 build.
- After Tramokyo: steps 2–5.

---

## Status 2026-10-12 (evening) and the v2 architecture

**Shipped in the release (`tramokyo-release-2026-10-12`):** step 1 (spatial
pairing) for every journey incl. Snowflake + Ghost; hover hand-offs between
images; recycled motes fade in by age; the neighbour diversity rule; batch 1
forms (aurora, attractor, starburst, smoke rings); sun theme for the light
journeys; +20 % music response.

**Karel's direction (2026-10-12):** "go for it all … I really want to blow
people away and right now we have a screensaver experience but has potential
for a whole nother level." Rollback = `scripts/kiosk-rollback.sh`.

### v2 — effects built from parts (the shader-pool model for particles)
Every effect = **birth × motion × look × music**, each a small GPU building
block, so diversity is combinatorial (hundreds of distinct effects) instead of
one hand-written force law per form:
- **Birth (emitters):** the image's bright structure (importance samples), a
  point / ring / line, the frame edges, the previous form (continuity), a
  depth surface of the still.
- **Motion (force stacks, blended):** curl-noise flow, flocking (boids on a
  spatial hash), strange attractors, orbits / vortices, target forms (the
  current 29), image-follow, gravity / wind, music impulses (bursts on onsets).
- **Look (renderers):** soft glow points (today), depth of field + bloom
  (cinematic look — written, parked in `git stash` "cinematic look"), light
  streaks (velocity-stretched quads), sparkle, smoke sprites, colour drift.
- **Music:** band → attribute map (kinetic EQ laws: motion, never luminance);
  phrase-level hooks from the deep analysis (section starts, crests, breaths)
  drive form changes and density swells.
- **Vibe tiers (Rise Above):** solo piano / far out / ambient & voices / lounge
  & groove / big & intense — each tier weights the building blocks.

### Particles that live in the imagery
The pack has depth maps for the stills: particles drift through the light
beams of a scene, settle on surfaces, flow around the figure, rise from the
brightest structures. (Depth texture + still-space projection in the sim.)

### Order of work (each: sample film → Karel → tour → deploy)
1. Cinematic look (DoF, bloom, colour drift) — sample on 3 journeys.
2. Building-block engine: emitters + force stacks + renderers, behind a flag,
   reproducing today's forms first (no visual change), then new combinations.
3. Imagery-aware particles (depth maps).
4. Phrase-level music + vibe tiers.
5. Recast long phase-owned shader phases (Grasshopper's 67 s / 4 shaders).
