# Karel's feedback queue

Every note Karel gives, tracked to done. Claude decides when each lands
(Karel 2026-10-12: "make sure you track all my feedback and in time you decide
when best to update"). Newest notes at the bottom of each section.

Status: ✅ live · 🟡 committed, deploys after the tour · 🔧 in progress · 📋 queued

## Before the release (tonight)
- 🟡 Snowflake after First Light ran on live AI images (one stuck image offline) — kiosk never generates live; a missing pack list is refetched.
- 🟡 Live "bonus" AI images on every journey (Realized) — off on the kiosk.
- 🟡 Realized: fire motif crawl (STEP ×7) — pairing drift slowed.
- 🟡 Ghost: "slight slowness when the particle blob and the lights falling shader happen" — no dropped frames; motion lifted 0.38 → 0.65 after the opening.
- 🟡 Response ladder — solo piano base → far out ×1.1 → ambient ×1.2 → groove ×1.35 → big ×1.6, every journey (Chemiluminescence "50 % more").
- 🟡 Fountain / rising-from-the-bottom forms "often" — one family, capped ~10 % (was ~17 %).
- 🟡 Pinned takes: Calling #903101341, Night Wind 2 #391401299.
- 🟡 Chenin 3: "the literal pictures of grapes and leaves isnt good especially how it ended. keep it abstract" — 11 literal stills out (28 → 17, now ends on an abstract galaxy); same pass: Chenin 5 −6 leaves, Loire 2 −3 leaves, Sancerre Cry 4 −2 (pack list; backup ~/Documents/Resonance/local-images.backup-2026-10-12-literal.json; Amboise 1/2, Loire 5A already abstract).
- 🟡 Field mode (2-4 large copies of a form at different depths): "nice when the particle system shows multiple things rather than always one thing" — +25 % (0.12 → 0.15; Karel: "dont increase it that substantial … another 25% sure"), copies stay large.
- 📋 Ghost: "that same stupid bunching of particles near top around the flashes section" — film the flash section after the tour, fix.
- 📋 Ghost: uv-sync 16-33 ms at Ghost's start (opening emblem sampled on the main thread) — precompute in idle.
- 📋 Replays after the tour: First Light → Snowflake (own stills), Realized (1:40 faint step), Isolation (faint step), Bells 1 (faint step 22:43:30). Pattern: 2 of 3 faint steps land within 40 ms of `particle-out` (the field's last haze vanishing in one frame?), Bells 0.7 s after a switch to the full-frame nebula form — high-res capture, then fix.
- 📋 First Light: "wouldn't use the big solid spinning wheel shader" = DHARMA (confirmed in Bells 1: "that wheel … not a favorite shader. once in a great while ok") → out of First Light (Aureole in), rare loop-wide (recast).

## After the release (first upgrade work)
- 📋 Shader diversity: magma (~14 journeys), parsec (~11), ember (~13) overused; amber (gold + ember) 37 % of shader time — recast with a tighter per-shader cap (≤ ~5 journeys) and a loop-wide hue balance (amber ≤ ~25 %); own tour.
- 📋 MORPHS MISSING for 68 of 100 loop journeys (Karel: "confirm you have morphs for all journeys besides ghost. cant say ive seen them lately") — 34 of them in Rise Above (Grasshopper → Yellow Bird 3, all Expansion tracks). Generate travel morphs through the QA gate: sample 2-3 for Karel → RA first → the rest. ~350-400 clips, ~$150-250 fal, needs Karel's go + budget.
- 📋 The Other Side 10 take #618230075: "cool stuff happening" — offer to pin.
- 📋 LITERAL-IMAGERY AUDIT of every journey's stills (Archetype: abstract — fruit, leaves, objects, animals except Horses 1 / Yellow Bird) — vision pass, drop or regenerate (sample first).
- 📋 Dharma (the spoked wheel) a RARITY loop-wide — ~2 journeys at most (Karel: "once in a great while ok").
- 📋 Bells 1 confirmed big & intense ("has a big beat") — x1.6 in the ladder (🟡 committed).
- 📋 Long phase-owned shader phases (Grasshopper: 67 s / 4 shaders) — bigger casts in the recast.
- 📋 Particle expansion (docs/particle-upgrade-plan.md): cinematic look (stashed), effects-from-parts, imagery-aware particles, phrase-level music, WebGPU.
- 📋 Karel (2026-10-12): "overall i never mind seeing use of cosmos and infinite space" — cosmic / infinite-space shaders, imagery and particle forms are always welcome; in the recast, cool the AMBER share by leaning cosmic (nebulae, star fields, galaxies, deep space), not by banning anything.
- 📋 Karel loved: the LIGHT-RAY shader in Bells 1 (~22:44:30, ZENITH dual — or Seraph primary; "dope … more so than that wheel") — favour it in the recast, esp. the light journeys.
- 📋 Karel loved: the rainbow ROSE form at the end of First Light; the blossom → wings hover hand-off in Ghost — keep and build on.

## Done today (2026-10-12)
- ✅ Ghost opening: Snowflake's murmuration, not green, no ribbons anywhere in Ghost, no lightening, no stall on the final wings, blossom → wings without back-and-forth.
- ✅ Snowflake: swell eases in (no brightness jump), Silk Threads +40 %.
- ✅ Horizon Split titles; title handoff hitch fixed.
- ✅ Audio: playback buffering (no crackle under load).
- ✅ Spatial pairing everywhere; recycled motes fade in; neighbour diversity; 4 new forms; sun theme for light journeys; +20 % response.
