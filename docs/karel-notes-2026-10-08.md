# Karel's notes — 2026-10-08 (documented, NOT yet fixed — wait for his go)

1. **Form gallery with remove** — a page showing every form the particle system
   makes (emblems AND every other instance: souls/forms, motifs, echoes, angel,
   moments), where Karel can remove the ones he doesn't want. Same workflow as
   the morph-video review.
2. **Form-change stutter** — as the particles change form they "stutter step":
   move a bit slower, then catch up faster. Seems to sometimes lead to glitches
   in the imaging transitions. Shaders looked fine.
   - Lead hypothesis: the universal retarget glide (on any re-aim the speed cap
     drops to 22 % and reopens over 5 s, particle-engine.ts) — that is literally
     "slow, then catch up faster". Fix should be a continuous ease, not a cap.
   - Karel: in SOME journeys the glitch isn't there at all — so it's
     journey-dependent. Compare a clean journey vs a glitchy one (calm profile
     first-snow/ghost/inferno vs the rest? retarget frequency? image-form
     density?) before changing the engine.
   - Karel's hypothesis (strong): music response causes it. CONFIRMED the
     particles ARE audio-driven, and journey-dependently — which matches "some
     journeys don't have it":
       * every frame: bass/mid/treble bands × gain 1.45 feed the sim (uBands,
         particle-engine.ts ~898) — speed swells with the music
       * journeys with playfulness ≥ 0.45: a "bounce" impulse on EVERY note onset
         when the cast is rhythmic, a "scatter" on runs of fast notes, and a
         melody-follow stream (particle-lead-layer.tsx ~1170)
     Plan: make particle motion independent of the music (shaders carry the
     music); measure before/after with the jumpScore tripwire on a glitchy
     journey and a clean one, then decide the retarget glide separately.
   - Data (perf-all, existing recordings): the retarget brake is engaged 35–53 %
     of particle-visible time in EVERY journey (25–42 % hard, cap < 50 %),
     median 43 %. It is everywhere, so it isn't what separates good journeys
     from bad ones; the music response is the journey-dependent part. Particle
     speed itself isn't readable from these runs (the readback is off in normal
     play) — a stutter ranking needs a measurement run with speed sampling on.
3. **Titles without particles** — titles should just come in normally; the
   particle resolve on titles looks cheesy. (Confirm whether this includes the
   Resonance logo on the title screen.)

4. **No default orange/pink** — the same light orange + pink keeps appearing as a
   default, which is wrong. Particle colour must ALWAYS come from the journey's
   theme and the imaging the particles are over. Find every path that falls back
   to the warm orange/pink palette (no image palette yet, between phases, image
   forms, ambient returns) and make the fallback theme-derived instead.

5. **Emblem colour snaps on image change** (The Other Side 9 — Karel: "the
   emblem is so cool", but when the background image changed the particle emblem
   snapped to the new colour, abrupt). Cause (read): particle colour follows the
   current image phase's palette; when the phase/image changes the target palette
   jumps and the field chases it at 0.06 per frame (particle-lead-layer.tsx
   ~1166) — ~0.5 s, which reads as a snap. Fix: a slow, frame-rate-independent
   colour crossfade (~4–6 s) whenever the palette source changes; keep the
   gentle voicing drift as is.

6. **Hard edges** (screenshot: a golden column of motes with a hard straight
   silhouette) — "when the particle has hard edges like this it loses its organic
   integration. try and avoid this." Every form boundary must feather (image-form
   rect bounds, wrap/edge cutoffs, any clip).
7. **Orange/pink is ALSO a rainbow-sweep artefact** (screenshot: a girih/mandala
   graded pink → orange → gold) — the spectrum hue spread swept from a warm base
   gives a sunset band. A rainbow must be a real spectrum (or the image's hues),
   never the pink-orange-gold sweep.
8. **Snowflake: form sits too long** (screenshot: the rainbow kaleido) — "ensure
   we dont do this in journeys". Holds were raised to 17–21 s (calm) on
   2026-10-07 ("you change again" note) — find the middle. Also: "in snowflake i
   def visually notice some glitches as a result of the particle system" —
   Snowflake is a primary target for the stutter study.

## Related finding (same morning)
Cycle-restart frame hitch (83–133 ms, black screen, 0.2 s after `cycle-start`):
probe `scripts/journey-review/probe-cycle.mjs` reproduced it 4/4; with the
logo-resolve canvas hidden it dropped to 1/4 at 67 ms. Cause = the
ParticleResolve canvas starting up (GPU-side, not JS). Removing title particles
(note 3) removes most of it; the fix was paused to fold into that change.

## Status (updated through the day)
- DONE b15fd5ac: titles without particles (3); colour from imaging, no warm
  default (4: 46 → 3 journeys >15 pts warmer than their imaging); every colour
  change glides on a ~5 s spring (5).
- DONE d1d4e0b4: form review station /review/forms (1); Snowflake gen-130 →
  "vision a" (Karel's pick), depth map regenerated.
- IN TEST (stutter, 2): cause found — (a) the engine pinned the speed cap at
  ~25 % for the whole time an image form was moving, then released it
  (crawl → surge); (b) per-band clocks sped up / slowed down with the music;
  (c) beat bounces / scatters / melody stream; (d) every exponential follow
  started at full speed. Fix: calm frame (rest tempo, slow 6 s tide only), no
  impulses, image pull on a critically damped spring, no continuous brake,
  gentle retarget glide (55 % floor), springs on every form/shape/placement
  follow. Measured before/after with record.mjs --motion + motion-report.mjs.
- IN TEST: hard edges (6) — image-form sampler feathers the frame border and
  the luminance gate; rainbow sweep (7) — non-rainbow forms keep to the
  imaging's hues (0.3 rad, was 0.8); holds (8) 12–15 s (calm 13–16).
- Measurement gotcha: 4 parallel review browsers + the kiosk tripped the
  particle watchdog in the TEST browsers (particles off → frozen diag); motion
  runs use --parallel 2 and the report rejects disabled runs.

## Afternoon notes (kiosk relaunched on f5de536c, ~12:05)
- Opening freeze (1.1 s as Snowflake's first emblem forms; 0.5-1 s at some
  handoffs) — REPRODUCED at dpr 2 (probe-open.mjs), bisected to b15fd5ac:
  removing the particle titles left the particle canvas `visibility:hidden`
  while absent; its first full-size re-promotion stalled the GPU. Fix (pending
  deploy): canvas stays composited (opacity floor 0.001, never hidden,
  will-change). Old build 7b26 + titles restored = no stall (3/3 runs).
- "particle form burst in the transition after ghost to the title" — REAL: the
  next journey read the canvas's target opacity ("0") mid-fade, thought the
  field was gone and fired the scatter-wide entrance. Fix (pending): carry the
  ON-SCREEN opacity through the handoff.
- "in chemo i saw the emblem jump or pop off" — overlapped my bisect build +
  probes (12:26-12:32); recheck on clean data.
- "in ghost when those lights coming down shader is happening they are slowed
  by the particle system" — Ghost ran during a build (12:26-12:30); recheck clean.
  If real: shader time vs frame rate, GPU load of particles at dpr 2.
