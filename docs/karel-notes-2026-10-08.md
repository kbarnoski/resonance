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

## Next (after the app is perfected) — set sequence with Karel
"i like opening with snowflake and then going into ghost. then … one of my
expansion tracks [or] two, then go to piano from my formally released stuff
then some expansion and all the time keeping diversity but building so by
the end of the set the biggest and fullest musical tracks conclude the set."
Reordering must never cause a bug: the review rig plans slices from the loop
order, so re-run the handoff checks for every new adjacency after a reorder.

## Event readiness plan (event Thu 2026-10-15 → Sun morning)
1. Feature freeze — fixes only unless Karel asks.
2. Full clean pass on today's build (kiosk closed), fix, re-run until clean.
3. Fallback: 7b26bbb6 (0 errors, 60 fps, 2026-10-07/08 night) — rollback ~5 min.
4. No background work while Karel watches; mains power always.

## Set lists (Karel 2026-10-08 — DRAFT, awaiting his OK)

Selectable set lists (kiosk picks one by name). Sets become explicit id lists (no index slices — reordering can't shift boundaries).

### Main loop
Snowflake EP (Snowflake, Realized, Ghost) → Vigil (Oct 4) → March Light → Surrounded by Light → Welcome Home → Expansion (49, one build, chapter cards ~every 30 min) → Featured journeys.
Open: Kinetic Lab placement (not in Karel's list).

### Expansion build order (calm ascent → storm → daybreak)

1. Northern Plane 5 `13e71555-03d6-4b27-ad32-2c6834559c24`
2. The Other Side 10 `6499ac06-2cb1-4970-b75f-1258587c84d8`
3. Tranquility 30 `4dac5718-517d-4183-ad27-e1a6c583e305`
4. Loire 2 `a96b4696-c02b-4004-a1a5-a0b1eee09308`
5. Never Forget 4 `8f3e82e2-0a30-499f-ba74-5158208a07a0`
6. Redwoods Sway 2 `99b7ad2c-a212-440e-85fa-0c670c1e4296`
7. Tranquility 33 `7b39db5e-68fa-4915-8ff1-83078c18edac`
8. No question 7 `19acdb4c-5a52-4532-99bd-a59652c7ff8e`
9. Northern Plane 3 `e9beec7a-6aa4-41bb-83f0-c827603ed51d`
10. Tranquility 17 `68b4289e-2247-41d6-8b9d-064345da9769`
11. The Other Side 9 `24101852-61ee-4ac9-8fd7-da2ae19ab0a3`
12. Torraine 7 `9d0ad58d-e490-4cc3-b24d-7c97d1fa3c0d`
13. Tranquility 34 `71b71375-8d7f-4e84-86c8-76d9e85a6eb0`
14. Yellow Bird 6 `aeb508d6-6447-4fb5-8468-636924520f82`
15. Nothing 30 `79cad85a-13fa-4db9-b4cd-a507b62a6084`
16. Rise 1 `1f83e254-a0c8-45ec-974f-8b363038a98d`
17. Tranquility 8 `0b4eb01a-9ac7-4a04-8877-05f905b14f8b`
18. Sancerre Cry 4 `4ef43223-42cf-4ce8-9088-7578569f7de6`
19. Torraine 5 `3f42929f-8b8e-4206-a3c8-057bf479d4e7`
20. Tranquility 35 `e181df12-049b-4199-8a1b-4bc1c3edd8e7`
21. Bells 1 `ecf0d90f-7e1b-4ecb-a654-ecea936caca8`
22. Surrounded by Light 19 `21448504-ec00-48c3-8b0a-c92da2cf216a`
23. Amboise 1 `6ff51cde-f4ca-4285-8707-0f77eaf9394c`
24. Tranquility 11 `2ff26268-997a-438f-8dac-d280d50da3a1`
25. Night Wind 2 `4cd35ec2-bc13-4b9a-b26c-9e38e956fb80`
26. Torraine 6 `05664df7-d355-40b7-85d2-e2badf26123a`
27. Tranquility 38 `9662fec9-04fa-4202-9859-8f01cd287aad`
28. Chenin 5 `6ee9f014-8203-437c-b05c-9d8bd0de9d3e`
29. Yellow Bird 3 `6cb979ce-3b76-4851-a0ba-3f100fddfcb3`
30. No question 8 `6407bf5c-7862-49e8-883d-59754c4caf18`
31. Tranquility 21 `4922ecbd-d1ab-4eec-a13d-735dcdc655da`
32. Night Wind 4 `87009cf3-8c07-48eb-88d8-e7acb6a14e41`
33. Surrounded by Light 3 `06b07942-bf94-4513-8e71-ef00508ced3e`
34. Tranquility 36 `4fda2ae1-d3a7-4e23-b5ca-8f696b537ad1`
35. Chenin 3 `86b64938-26ea-40b9-9ea1-461323a049d5`
36. Chemiluminescence `1f5e3884-5317-4146-ba18-4742eaf74ce9`
37. Surrounded by Light 6 `6251d682-b5e4-46b6-98cf-ceb6b609a7bc`
38. Tranquility 3 `666436a4-eabf-4b0a-b6bc-665520daa687`
39. Loire 5A `81683231-3b3c-4542-8696-13dfcf56469a`
40. Cabin Soul 6 `112c3e16-3c98-43ca-902e-a9c2b510ee3d`
41. Velvet Tears 1 `aadbf1d3-5db1-4f80-a60d-f6d0c4a6e7b6`
42. Horses 1 `c7a0c1c2-c5d2-487b-8c54-73b134e6f09a`
43. Night Wind 5 `954a7000-91ba-42eb-b5a7-a8d5bc21c8c2`
44. Rattler 2 `3814f116-5c54-499c-9d9b-355201700fdc`
45. Roll Away 8 `d8705068-f8a9-4dd7-95a5-c6f1160fed22`
46. Singular 4 `8ca69280-944c-4ccb-9f7f-692f3f7f7a6f`
47. Night Wind 11 `e4658610-336d-452f-a4f8-7b652b339db6`
48. Amboise 2 `4d17da19-6834-4005-a944-34c27a88a320`
49. Night Wind 9 `85124aed-c3b4-42e2-870a-b14bc5425b72`

### Rise Above (12)
1. Snowflake 2. Ghost 3. The Other Side 9 4. Chenin 5 5. Welcome Home 6. Openings 7. Calling 8. Surrounded By Light (March Light) 9. Tranquility 36 10. Singular 4 11. Amboise 2 12. Night Wind 9 (finale) — ~40 min
