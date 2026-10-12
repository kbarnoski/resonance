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
- 📋 Ghost: "that same stupid bunching of particles near top around the flashes section" — film the flash section after the tour, fix.
- 📋 Ghost: uv-sync 16-33 ms at Ghost's start (opening emblem sampled on the main thread) — precompute in idle.
- 📋 Replays after the tour: First Light → Snowflake (own stills), Realized (1:40 faint step), Isolation (faint step).
- 📋 First Light: "wouldn't use the big solid spinning wheel shader" = DHARMA (confirmed in Bells 1: "that wheel … not a favorite shader. once in a great while ok") → out of First Light (Aureole in), rare loop-wide (recast).

## After the release (first upgrade work)
- 📋 Shader diversity: magma (~14 journeys), parsec (~11), ember (~13) overused; amber (gold + ember) 37 % of shader time — recast with a tighter per-shader cap (≤ ~5 journeys) and a loop-wide hue balance (amber ≤ ~25 %); own tour.
- 📋 Dharma (the spoked wheel) a RARITY loop-wide — ~2 journeys at most (Karel: "once in a great while ok").
- 📋 Bells 1 confirmed big & intense ("has a big beat") — x1.6 in the ladder (🟡 committed).
- 📋 Long phase-owned shader phases (Grasshopper: 67 s / 4 shaders) — bigger casts in the recast.
- 📋 Particle expansion (docs/particle-upgrade-plan.md): cinematic look (stashed), effects-from-parts, imagery-aware particles, phrase-level music, WebGPU.
- 📋 Karel loved: the rainbow ROSE form at the end of First Light; the blossom → wings hover hand-off in Ghost — keep and build on.

## Done today (2026-10-12)
- ✅ Ghost opening: Snowflake's murmuration, not green, no ribbons anywhere in Ghost, no lightening, no stall on the final wings, blossom → wings without back-and-forth.
- ✅ Snowflake: swell eases in (no brightness jump), Silk Threads +40 %.
- ✅ Horizon Split titles; title handoff hitch fixed.
- ✅ Audio: playback buffering (no crackle under load).
- ✅ Spatial pairing everywhere; recycled motes fade in; neighbour diversity; 4 new forms; sun theme for light journeys; +20 % response.
