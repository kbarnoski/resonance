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
