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

## Related finding (same morning)
Cycle-restart frame hitch (83–133 ms, black screen, 0.2 s after `cycle-start`):
probe `scripts/journey-review/probe-cycle.mjs` reproduced it 4/4; with the
logo-resolve canvas hidden it dropped to 1/4 at 67 ms. Cause = the
ParticleResolve canvas starting up (GPU-side, not JS). Removing title particles
(note 3) removes most of it; the fix was paused to fold into that change.
