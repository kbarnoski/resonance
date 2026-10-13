# Karel's feedback queue

Every note Karel gives, tracked to done. Claude decides when each lands
(Karel 2026-10-12: "make sure you track all my feedback and in time you decide
when best to update"). Newest notes at the bottom of each section.

Status: ✅ live · 🟡 committed, deploys after the tour · 🔧 in progress · 📋 queued

## Before the release (tonight)
- 🟡 Snowflake after First Light ran on live AI images (one stuck image offline) — kiosk never generates live; a missing pack list is refetched.
- 🟡 Live "bonus" AI images on every journey (Realized) — off on the kiosk.
- 🟡 Realized: fire motif crawl (STEP ×7) — pairing drift slowed.
- 🟡 Ghost title hesitation: the 1024² angel emblem was sampled on the main thread as the title came in (16 ms) — now in the decode worker (4de92ca1).
- 🟡 Ghost: "slight slowness when the particle blob and the lights falling shader happen" — no dropped frames; motion lifted 0.38 → 0.65 after the opening.
- 🟡 Response ladder — solo piano base → far out ×1.1 → ambient ×1.2 → groove ×1.35 → big ×1.6, every journey (Chemiluminescence "50 % more").
- 🟡 Fountain / rising-from-the-bottom forms "often" — one family, capped ~10 % (was ~17 %).
- 🟡 Pinned takes: Calling #903101341, Night Wind 2 #391401299, No question 7 #1643832524 ("a big time keeper").
- 🟡 Chenin 3: "the literal pictures of grapes and leaves isnt good especially how it ended. keep it abstract" — 11 literal stills out (28 → 17, now ends on an abstract galaxy); same pass: Chenin 5 −6 leaves, Loire 2 −3 leaves, Sancerre Cry 4 −2 (pack list; backup ~/Documents/Resonance/local-images.backup-2026-10-12-literal.json; Amboise 1/2, Loire 5A already abstract).
- 🟡 Surrounded by Light emblem: the jellyfish/anemone was "weird … should be light oriented as if surrounded by light" → Karel chose a halo of light around a radiant core (pack emblems/feathery/surrounded-by-light.jpg; old one backed up to ~/Documents/Resonance).
- 🟡 Field mode (2-4 large copies of a form at different depths): "nice when the particle system shows multiple things rather than always one thing" — +25 % (0.12 → 0.15; Karel: "dont increase it that substantial … another 25% sure"), copies stay large.
- 📋 Ghost: "that same stupid bunching of particles near top around the flashes section" — film the flash section after the tour, fix.
- 📋 Ghost: uv-sync 16-33 ms at Ghost's start (opening emblem sampled on the main thread) — precompute in idle.
- 🟡 FAINT STEPS at particle-out FOUND (f215cd2b): the contrast veil (dark ellipse, 1.2 s CSS fade) was hidden the instant the field reached 0 while still at ~10-20 % — the ellipse vanished in one frame (Isolation, Realized 1:40, The Other Side 9; diff = the field's oval). Hidden now 1.6 s after zero. Verify in the replays.
- 📋 Replays after the tour: First Light → Snowflake (own stills), Realized, Isolation, The Other Side 9, Bells 1 (faint step 0.7 s after the nebula switch — different cause), Tranquility 38 (emblem shimmer, likely false positive). Pattern: 2 of 3 faint steps land within 40 ms of `particle-out` (the field's last haze vanishing in one frame?), Bells 0.7 s after a switch to the full-frame nebula form — high-res capture, then fix.
- 📋 First Light: "wouldn't use the big solid spinning wheel shader" = DHARMA (confirmed in Bells 1: "that wheel … not a favorite shader. once in a great while ok") → out of First Light (Aureole in), rare loop-wide (recast).

## After the release (first upgrade work)
- 📋 Shader diversity: magma = the "amber web" (confirmed: Amboise 1 in pass 7, "there ya go using that amber web shader yet again") — ~14 journeys → a few at most; magma (~14 journeys), parsec (~11), ember (~13) overused; amber (gold + ember) 37 % of shader time — recast with a tighter per-shader cap (≤ ~5 journeys) and a loop-wide hue balance (amber ≤ ~25 %); own tour.
- 📋 MORPHS MISSING for 68 of 100 loop journeys (Karel: "confirm you have morphs for all journeys besides ghost. cant say ive seen them lately") — 34 of them in Rise Above (Grasshopper → Yellow Bird 3, all Expansion tracks). Generate travel morphs through the QA gate: sample 2-3 for Karel → RA first → the rest. ~350-400 clips, ~$150-250 fal, needs Karel's go + budget.
- 📋 Liked takes (offer to pin): The Other Side 10 #618230075 ("cool stuff happening"), Northern Plane 5 #417740911 ("good too … good for ambient portal use if needed" — the go-to ambient PORTAL between sections; in RA already the breath before wave 3; Karel: "leave at 27 for now"); Cabin Soul 5 "has a cool beat" (groove x1.35 — move to big?).
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
- 2026-10-12 pass 7 — Tranquility 3: "that version isnt strong so id parking lot it" → PARKED (75e009fd), out of the Expansion loop. (I first parked Night Wind 4 by mistake; reverted before commit.)
- 2026-10-12 pass 7 — Night Wind 4: "dope … has a slight beat so in the chill stuff, not the ambient voice and piano one". Already in RA at #37, the post-peak cool-down after Nothing 30. DECIDED (Karel: "you place it where you see best fit"): stays at #37. With the ≥8 spacing rule (Night Wind 2 at #16, Night Wind 9 at #29), only post-peak slots are open. #37 gives a gentle pulse between Nothing 30's ballad and Tranquility 38.
- 2026-10-12 pass 7 — Sancerre Cry 4: "dope". Already in RA at #25 (wave 2: beat, attitude, groove). No change. Its four literal stills were removed earlier tonight.
- 2026-10-13 LITERAL-IMAGERY AUDIT done (vision pass, 3,451 stills / 113 journeys): 289 clearly literal + 228 borderline. Heaviest: The Reading 36/43 (books), The Harvest 24/43, The Maze 22/43, Sacred Resonance 13/43, Tranquility 34 13/32. Not removed: too big to batch without Karel's eyes (sample-before-batch) → review page for Karel: https://claude.ai/artifact/BHqYr4TnC96GfLPXH5y6pA (literal starts as remove, borderline as keep; choices save to the page's store) — remove what he approves, back up first. Report: scratchpad literal-audit/report.json.
- 2026-10-13 🟡 LITERAL STILLS: Karel reviewed every flagged still on the review page → 224 removed from the pack list (he kept 69 flagged literal, pulled 4 borderline). Only The Reading drops below 12 (7 left) — not in the show. Backup: ~/Documents/Resonance/local-images.backup-2026-10-13-literal-review.json.
- 2026-10-13 🟡 Roll Away 8: "current image is cheesey with those circles" = the looping RIBBONS form → ribbons out of every journey but the locked ones (5c7d4a09; Snowflake keeps its locked look).
- 2026-10-13 Surrounded by Light 19 (Parking Lot): "the image in the background with two halo things" is cheesy → gen-015 (two floating glowing rings) removed from its pack list. (I first pulled the ribbons particle form by mistake; reverted in bdf8a297.)
- 2026-10-13 🟡 Morph check after the literal removals: every morph endpoint compared with the removed stills — Lantern t1 (starts on the husk fruit) and t2 (leaf skeleton) pulled; Surrounded By Light (March Light) t0 opened on a small human figure — pulled. Absent = crossfade; regenerate in the morph batch. Backup ~/Documents/Resonance/local-clips.backup-2026-10-13.json.
- 2026-10-13 🟡 First Light: "the emblem in beginning and end … should be the same. its the end one i like that is a simple sun vibe" → only emblems/feathery/first-light.jpg (the glowing sun ring); the geometric dawn-1 sunrise out of its emblem list (pack local-emblems.json; backup ~/Documents/Resonance/local-emblems.backup-2026-10-13.json).
- 2026-10-13 🟡 Realized: "include some of those cool ass images … white background … lava like and black ash … a section of the journey exploring that space … just like 30 secs with micro and macro" → the 11 white-ground ash/lava stills (scattered every 3rd slot) grouped into slots 20-30 of the expansion phase (≈ p 0.31-0.42, ~37 s), ordered macro detail → black star → wide slopes. Pack only; backup ~/Documents/Resonance/local-images.backup-2026-10-13-pre-realized-white.json. At the ~10 s image tempo ~4 of them show per pass.
- 2026-10-13 🟡 First Light: Dharma (the spoked wheel) STILL showed (the recast that removes it is on the unmerged branch) — "not this shader … i like the other sun ray type one more" → Dharma → SERAPH (light rays) in First Light expansion, on main now; the recast merge must keep seraph there.
- 2026-10-13 💡 Karel: "one day youll want to explore with me some new sun themed shaders" — post-release: design new sun/light shaders together (Seraph is the reference he loves; Dharma banned).
- 2026-10-13 🟡 DHARMA BANNED everywhere ("i cant stand dharma in resonance"): global blocklist + borrow guard + every cast/pack slot replaced (Seraph first). Seraph ALWAYS in First Light and every Surrounded by Light.
- 2026-10-13 📋 Bath: "no ember 3d plane moving shader in bath lol" (= parsec) → in the recast solver (journey ban + test). Bath also loses fountain (live in next deploy).
- 2026-10-13 🟡 Rise Above: The First (Expanded) before Bath (f731e4a1); Testimony 3 = the last solo piano, right before Amboise 1 ("pick me upper gospel vibe … the bridge to more fuller stuff").
- 2026-10-13 🟡 Rise Above: Bath → after Mycelium Dream (the spacey bridge corner), Karel’s pick. Grasshopper "very empty feeling but beautiful" — kept; the recast gives its long phase a bigger cast.
- 2026-10-13 ✅ Yellow Bird ("slow but up beat solo piano and beautiful") stays right after Grasshopper — the lift after the empty one (Karel’s pick).
- 2026-10-13 🟡 SHADER RECAST merged + deployed (27f7eb32): amber 37 → 25 %, Dharma 0 (banned), magma/parsec/ember 5 each, Seraph pinned in First Light + every Surrounded by Light, Bath no ember/parsec (incl. finale-forced), Grasshopper 6-voice illumination, Rise Above neighbours share no shader (except locked Snowflake/Ghost; Yellow Bird/Cosmic Drift dark-nebula+monsoon — no legal swap). Pack 89 phases (backup ~/resonance-pack-backups/), DB updated.
- 2026-10-13 🟡 First Light: Karel LOVES the rainbow HARMONICS form ("love this form in first light"); its "struggle … glitch in forming" = refigure + shader switch + travel morph within 2 s → form changes now wait out shader switches (3 s) and phase boundaries (±4 s).
- 2026-10-13 🟡 Grasshopper middle: "particle cloud seems indecisive … contracts and expands" = STARBURST lunging on every bass hit → calmed to breathing (all journeys).
- 2026-10-13 🟡 Grasshopper: "a quick emblem in middle like a crescent moon which makes no sense" = motif light-a14 (spiral half-formed) → light-a14 + water-5 (true crescent) pruned from the motif library (pack, live now).
- 2026-10-13 🟡 First Light take pinned ("good take on first light"): seed #1090929246 + still script (session 8zjg63); Snowflake take pinned earlier (4b8474f4). Deploy with the next batch.
- 2026-10-13 🟡 Rise Above: Cosmic Drift out; Chemiluminescence after Amboise 1 as the connector into the voices; 📋 Karel to re-hear Mycelium Dream + The Summit and decide.
- 2026-10-13 🟡 Ghost: triangles shader (yantra, ~0:45) "a bit too bright … more transparent" → 65 % (JOURNEY_SHADER_DIM).
- 2026-10-13 🟡 Emblems formed slower after the first journey: Ghost’s emblem is drawn (instant), others decoded only after the switch → field gathered empty, re-aimed ~1 s later. Fixed: next journey’s emblem pre-decoded ~10 s before the switch (9d9d6bcf). Verify on the kiosk: no "retarget image" at ~2.4 s.
- 2026-10-13 🟡 Response ladder steeper (solo ×1.3 … big ×2.5), particles too; Snowflake + Ghost ×1. Snowflake: r2-photon (coloured lines) on before the last morph through the end.
- 2026-10-13 ✅ Morphs for every loop journey (not Ghost): 327 new + the 15 transient Kling refusals retried; clip manifest reconciled from disk (workers had raced it); kiosk server restarted so it serves new pack files (next start snapshots public/ at boot).
- 2026-10-13 🟡 Karel's morning picks — KEEP all nine: the six sun shaders (corona, veil, dawn, halo, wind, aster), the cinematic look, scene motes, the phrase conductor. Cine/motes/conductor default ON (never on Snowflake/Ghost); sun shaders promoted out of the lab and cast into the light journeys (Seraph pins kept). Deploy with the merge.
- 2026-10-13 💡 Post-release particle innovation in progress (behind flags until Karel sees film): living score (?score=1), the bridge across morphs (?bridge=1), harmonic currents (?currents=1).
- 2026-10-13 🟡 "remove the shader that has diagonal white lines go across the screen from resonance" (watching Snowflake) → Spirit Trails (r3-spirittrails, Snowflake p0.354 — its only use) banned globally; cirrus holds that slot. Mastered lock re-snapshotted for his note.
- 2026-10-13 🟡 "i saw it in yellow bird too. ban it" → Chinook (warm wind streams flowing diagonally; Yellow Bird opener) + Monsoon Veil (the diagonal sweep he rejected in The First) banned globally; Expansion pack slots replaced (12 phase edits, backup ~/resonance-pack-backups/shader-recast-2026-10-13c-*); featured casts refilled next.
