# The Journey Archetype — a journey is a music video you travel through

One document for what every journey must be: **Karel's creative laws, in his
words**, and directly under each law the **measurable check(s)** that prove it
(audit IDs from `STD` in `scripts/lib/snowflake-standard.mjs`) plus the tool
that enforces it. A law with no measurable check says **eye check**.

Merged 2026-10-09 (Karel: "merge it") from `docs/journey-design-spec.md`
(the creative laws, codified 2026-09-21) and `docs/snowflake-standard.md` (the
measurable standard + audit, codified 2026-10-05). Both are now stubs pointing
here. It also sits alongside — never replaces — `feedback_cosmic_sparse_interlude`,
the morph laws and the transitions-never-abrupt law.

## Scope (Karel, 2026-10-09)

- **Every journey must meet the Archetype — including Realized** (journey id
  `inferno`, the loop's Realized). At the merge Realized fails **L1** (literal
  28 %) and **P1** (near-duplicate stills 40 %); it is a target, not an
  exemption. (Realized was unlocked from mastering on 2026-10-05 — Karel:
  *"realized btw does need all of the sound responsive and other global
  features we applied to all others. just snowflake and ghost are locked down
  for now"*.)
- **Snowflake (`first-snow`) is the reference.** It is mastered, scored as the
  reference row, and never edited to meet the Archetype.
- **Ghost is the one unique exception** — *"ghost is truly the unique one and
  very special."* Ghost follows its own Ghost arc law and spec
  (`docs/ghost-journey-spec.md`), not the Archetype's shot/still rules. It is
  mastered and excluded from the audit.
- History: the 2026-10-05 Standard (codified from Snowflake, the mastered
  reference take, after Karel's note on the kiosk) said "Snowflake, Realized
  and Ghost are mastered and are never edited to meet it; Snowflake is the
  reference row." Realized's exemption ended with its unlock (2026-10-05) and
  is now explicit in this scope (2026-10-09).

## Where it comes from

The reference standard is **Snowflake** (`first-snow`) and the hand-built
featured journeys. What makes them work, in Karel's words (2026-09-21):
*"perspective, zoom, details, and cosmic depth all come together with
asymmetry and incredible design dynamics to create amazingly interesting
unfolding journeys."* And the failure mode to never repeat: *"these are
essentially music videos, not static images on a fireplace."*

Karel's kiosk note, 2026-10-05:

> "i tend to see distance images a bit like a slide show ... im really
> expecting incredible journeys that are following the design and arc
> definition that snowflake has with micro and macro and a POV journey more
> like a music video than a slide show of photos. also a lot of the shaders
> stick around for the whole journey ... times when there is a shader with
> black and like a small close up image and then cool build up and
> transitions into more complexity and cosmic etc. ... as if youre moving
> through them not watching wallpaper."

And the same day: **"i never want these to look too literal. these are
visionary and surreal ... not literal."**

### Tools (who enforces what)

| Tool | What it checks / does |
|---|---|
| `scripts/audit-snowflake-standard.mjs` | Scores every non-mastered kiosk-loop journey on all IDs (L, S, H, P, M, C); Snowflake = reference row. Read-only. |
| `scripts/lib/snowflake-standard.mjs` | `STD` thresholds + the shot-list/literalness lenses (`auditShots`, `register`, `literal`). Change it and this doc together. |
| `scripts/mv-rollout/apply-shotlists.mjs` | Refuses a shot list that fails L1/S1–S7 (`--check` = validate only); writes phases, `aiPromptSequence`, `sparse`, `shaderOwned: true`. |
| `scripts/mv-rollout/harvest-stills.mjs` + `pick-stills.mjs` | Stills per shot slot (≥ 3 slots per phase); pick scores negative space, off-centre weight, near-duplicates (P1–P3 lenses) before human QA. |
| `scripts/mv-rollout/harvest-morphs.mjs` + `install.mjs` | Travel morphs at every phase boundary (M1), zero-spike / no-flare-streak QA; installs into the pack. |
| `scripts/assign-journey-shaders.mjs` | Seeds every phase's `shaderModes` (~30 per journey, LRU variety) — never empty. |
| `src/lib/journeys/journey-engine.ts` | Runtime: phase-owned choreography (`shaderOwned`), conductor gates (dual ≥ 0.6, tertiary ≥ 0.85 on non-kinetic), stillness, sparse interlude, kinetic layer mode. |
| `analysis-phase-bounds.ts` + album builders | Phase boundaries from the track's real energy arc. |

---

## 1. The laws (Karel's words) and their checks

### Law 0 — THEME IS DERIVED FROM THE MUSIC — the founding law (Karel, 2026-09-23)

Every journey's image theme comes from three inputs, in this order: the
track's MUSICAL ANALYSIS (key/mode, tempo, note density, register, velocity,
dynamic arc — compute a profile from the stored notes), its MOOD, and its
NAME. Never from the title alone, and never by borrowing another journey's
material. *"This is literally the entire point of this app and project."*
Failure case to never repeat: The First / The First (Expanded) were themed as
ice-thaw off the word "first" — but the music is F Major, dense,
low-register, warm; the right theme was an amber underground dawn. Check the
theme AGAINST the profile before authoring: cold sparse themes need cold
sparse music.

- **Materials are open (Karel, 2026-10-09):** *"i dont need snow to be held
  to just snowflake. we have such a big set of journeys its all good. that
  was an earlier time."* Snow/ice/frost/crystal/aurora may appear in any
  journey whose music supports a cold theme (law 0 still decides). The
  harvesters keep the ice-family negative only on shots that don't ask for
  it, so it never leaks into a warm shot by accident
  (`materialNegativeFor` in prompt-decoration.ts). *(Superseded: the
  2026-09-27 "ice family belongs to Snowflake alone" rule.)*
- **Summoning-risk words — never use in prompts:** "silhouette(s)",
  "figure(s)", "streets", "station", any negation of people ("without a
  single figure" summons one). A cathedral/hall WITH A FLOOR summons a
  congregation — remove the floor or fill the ground with the theme's own
  material.

**Check:** eye check (theme vs analysis profile — no automated lens).
Material/summoning words: `scripts/fix-material-law-prompts.mjs` repairs
prompts; S4 catches place nouns like "station". The analysis' imagery cues
are input, then translated per L1 below.

### Law 1 — A journey is a SHOT LIST, not a location

The six phases are six radically different shots of one theme — never the
same scene, POV, or framing twice. If every phase could be a crop of the same
photograph, the journey is broken.

- **Every phase is itself a mini shot-list (Karel, 2026-09-23).** One prompt
  per phase means the viewer stares at ~a minute of variations of one image —
  "a photo series, not a music video." Every phase gets an
  `aiPromptSequence` of 3 shots that travel (different register / world /
  POV expressing the same narrative beat), so an 18-shot journey plays like
  Ghost: continuous travel, worlds within worlds. The harvest and the live
  player both consume the sequence in order across the phase.
- **Spirit entities as abstract hints (Karel, 2026-09-23) — all journeys, not
  just SBL/ML.** One or two shots per journey may half-gather light into an
  ALMOST-figure: "half-gathered", "translucent and featureless", "made only
  of light", "dissolving at its edges". Never a clean or realistic human form
  — that remains Ghost's alone. **They are our earthly ancestors (Karel,
  later 2026-09-23):** write them as ancient, warm, of-the-earth — elders
  greeting over a river confluence, low earthen presences keeping the
  mycelial fire, a procession of spore-light returning home — not generic
  ghosts. Lean INTO more of them, and into more worlds nested inside worlds
  (a gill-cathedral inside a lantern-cap inside a wood).
- **No non-nature material metaphors.** Silk/thread/braid/weave/rope
  vocabulary renders as literal cordage (the Interplay lesson) — express
  duets and joinings through waters, winds, mists, and light. And the
  Welcome Home lesson: snow read as off-theme THERE; homecoming is a
  verdant golden-dusk valley. (The wider "ice family is Snowflake's alone"
  rule was lifted 2026-10-09 — see law 0.)

**Checks** (the phases' `aiPromptSequence`, which the harvest consumes in
order — `auditShots` in the audit and in `apply-shotlists.mjs`):
- **S1 — shots (conflict resolved 2026-10-09):** **3 shots written per phase
  (18 per 6-phase journey), of which ≥ 12 are genuinely distinct** (greedy
  clustering at Jaccard < 0.5 between word sets). Six phases × three shots;
  re-using "close study: a single seed…" in five phases is the slideshow.
- **P1** (the same law in pixels) — ≤ 20 % of distinct stills are
  near-duplicates (16 px zero-mean correlation ≥ 0.85) of another. 24
  variations of one god-ray = slideshow. Lens in `pick-stills.mjs` + audit.
- Spirit entities, cordage words, winter: eye check.

### Law 1b — Shaders: never let `phases[].shaderModes` sit empty

Empty means the engine falls back to ONE default shader and the whole album
looks the same. Run `scripts/assign-journey-shaders.mjs` after building any
journey; it seeds the registry's own regenerateJourneyShaders per journey
(~30 distinct shaders each, LRU variety across journeys). The viewer should
never sense a limited set.

Karel 2026-10-05: *"a lot of the shaders stick around for the whole
journey"* — one shader voice at a time, always changing.

**Resolved 2026-10-09:** the **pool** may be large (~30 seeded by
`assign-journey-shaders.mjs`), but the **measured standard is what plays**:
≥ 10 distinct shaders ON SCREEN per play, with share/run limits. (The real
`JourneyEngine` is replayed over the track's real duration by the audit.)

- **H1** ≥ 10 distinct shaders on screen per play (Snowflake: 14). *Policy
  tension (2026-10-05):* the loop-wide diversity caps (≤ 5 uses per support,
  ≥ 10-journey spacing) then held every cast journey at 7 — see the plan.
- **H2** No shader on screen > 35 % of the track; a single declared lead
  ≤ 50 % (**H3**, Kinetic Lab "one lead" law).
- **H4** No shader continuously on screen > 25 % of the track (≈ one phase).
- **H5 / H5k** — layers, see law 10b.
- **C3** No shader present (any layer) > 35 % of a real kiosk lap (Snowflake
  23 %) — flight-recorder lens.
- **Choreography** (`JourneyPhase.shaderOwned`, engine since 2026-10-05;
  set by `apply-shotlists.mjs`): each phase owns its pool; a support lives in
  one phase (two adjacent at most); sparse phases get one or two dark shaders
  (mean ≲ 10); a shader may return only as a recapitulation the music itself
  makes (e.g. the opening voice at the coda); the outgoing phase's shaders
  leave within ~4 s of the boundary. Eye check beyond H1–H4.
- Never-empty `shaderModes`: enforced by running `assign-journey-shaders.mjs`
  (no audit ID; H1 fails if a journey falls back to one shader).

### Law 2 — Scale traversal is mandatory

Across its six phases every journey must move through at least four scale
registers: microscopic detail, intimate/object scale, landscape,
aerial/planetary, cosmic/abstract. The order varies per journey (and should
differ BETWEEN journeys).

**Checks:**
- **S2** ≥ 4 scale registers across the journey: sparse · micro · intimate ·
  interior · abstract · aerial · cosmic (the classifier also knows
  landscape). **Every shot declares its register in its first words** (an
  unclassed shot has no scale = no camera).
- **S3** ≥ 60 % of adjacent shots change register (micro ↔ macro) — Snowflake
  changes register on 8 of 12 adjacent stills.
- Order differing between journeys: eye check.

### Law 3 — Theme = motif family, not a place

Each track owns 3–4 signature elements (materials, forms, light behavior,
palette). Phases recombine the motifs at different scales — abstract enough
that the cinematic perspective rotation can breathe, specific enough to stay
this track's world.

**Check:** eye check (S4 below guards the "not a place" half).

### Law 4 — Asymmetry and declared composition

Explicit off-center weight, diagonal energy, declared backgrounds (DARK /
PURE WHITE / etc.), generous negative space. Centered postcard symmetry only
as a rare deliberate exception (e.g. a mandala whose subject IS the circle).

**Checks** (pack stills, pixels at 64 px):
- **P2** ≤ 35 % centred subjects (bright-mass centroid within 6 % of centre).
- **P3** Median near-black share ≥ 45 % — room to layer on top.
- **S7** The opening shot is sparse: one small subject on dark, off-centre.
- Diagonal energy / declared background: eye check.

### Law 5 — Unfolding, not looping

Motion language in every prompt — things build, break, travel, decay. Phase N
should feel like a consequence of phase N-1.

- **Progress through SPACE AND TIME (Karel, 2026-09-23).** The Mexican Boy
  lesson: register variety alone isn't enough if all six shots share one
  place, one palette, one hour of light — on the wall that reads as the same
  image for six minutes ("boring"). Every journey must (a) move through space
  — each phase a different vantage or world, with at least one full cosmic or
  abstract escape (galaxy / mandala / void register), and (b) move through
  time — the light state must evolve across the arc (dusk→night→dawn,
  build→peak→rest, storm→clearing). Audit test: no location noun in 4+ phases
  unless the place IS the subject (Isolation's island) — and even then, time
  must visibly pass.

**Checks:**
- **S4** No place noun in more than 3 phases.
- **S5** ≥ 1 cosmic/abstract escape — and it sits where the music peaks
  (placement: eye check).
- **S6** ≥ 25 % of shots carry camera language (descending through, rising
  up through, pulling back to reveal, drifting toward, inside…). Each shot's
  last beat hands the camera to the next shot.
- **M1** ≥ 80 % of phase boundaries carry a travel morph (Kling O3, the
  proven negative-space recipe: "sparse luminous X forms … most of the frame
  remains deep black negative space at every moment"), QA zero-spike, cover
  still + nudged shader at the end, finale melt. Morphs are designed as
  **camera moves between the two shots they join** (push into, pull back to
  reveal, rise through, descend into) — not generic dissolves.
  `harvest-morphs.mjs` + `install.mjs`; audit counts `t<k>` slots in
  `local-clips.json`.
- Time visibly passing (light state evolving): eye check.

### Law 6 — NO humans, ever — not even silhouettes

Ghost is the single exception (her figure is the design). FLUX inserts
scale-figures into vast empty landscapes: anchor foregrounds with
objects/details, write "completely uninhabited", and NEVER write "no people"
in a positive prompt (negation summons the noun — the moon lesson).

**Check:** eye check (sample frames for figures).

### Law 7 — No moons/planets/orbs by occupation

Fill every open sky with the theme's own material (clouds, aurora, dust,
falling light, canopy). FLUX ignores negative prompts; positive occupation is
the only lever.

**Check:** eye check (sample frames for moons).

### Law 8 — Spirit energy (SBL + March Light)

Occasionally — one or two phases per journey, subtle — a light-form with
almost-presence: an intentional current of luminous mist, a slow ribbon of
pale light that moves as if aware, a drifting veil that pauses. Formless as
breath, never figurative, never humanoid, never literal. Vary the phrasing
per journey.

**Check:** eye check.

### Law 9 — Phase boundaries follow the track's real energy arc

Analysis-derived; see `analysis-phase-bounds.ts` and the album builders
(`apply-shotlists.mjs` sets start/end from analysis sections and
`intensityMultiplier` from the measured curve).

**Check:** eye check (no audit ID). Morph placement at boundaries: M1.

### Law 10 — House basics

Film grain zero, altered-states language only, smooth transitions, name-only
title cards, palette per track, shader categories spread across the registry.

**Checks:** eye check, except — transitions: M1; shader spread: H1–H4.

#### Law 10a — Visionary, never literal (Karel 2026-10-05)

*"i never want these to look too literal. these are visionary and surreal
... not literal."* Abstract particle interpretations beat literal scenes
(Karel 2026-09-28).

- **L1** ≤ 15 % of shots literal. A shot is literal when it names an
  everyday object/structure/creature (room, window, bell, barn, boat, bird,
  horse, vine…) or a plain nature scene (meadow, lake, valley, forest,
  clouds, sea…) **without transfiguring it** — made of light, impossible
  scale or physics, fractal/kaleidoscopic structure, worlds-within-worlds,
  cosmic dissolve, particles. (`literal()` lens; audit + `apply-shotlists.mjs`.)
- The analysis' imagery cues are literal by nature ("a stone cloister at
  dusk", "a window glowing amber"); the design's job is to translate them:
  the cue's *light, motion and scale* survive, its *objects* do not.
- Vocabulary: visionary, surreal, dreamlike, otherworldly, kaleidoscopic,
  luminous, made of light. **Never** "psychedelic", DMT or any drug word
  (altered-states law) — eye check.

#### Law 10b — One voice, layers are earned (shader layers)

Karel 2026-10-05: *"times when there is a shader with black and like a small
close up image and then cool build up and transitions into more complexity
and cosmic."*

- **H5 (non-kinetic journeys — today Snowflake; Ghost is exempt)** Mean live
  layers ≤ 1.8 (Snowflake ≈ 1.3, measured 1.31): one voice in quiet phases,
  the dual earned by the build (≥ 0.6), the tertiary only at the climax
  (≥ 0.85).
- **H5k (kinetic journeys) — mean live layers ≤ 2.8.** Resolved 2026-10-09.
  Kinetic = every journey except Snowflake and Ghost (Karel's standing
  decision 2026-10-09: *"i only want snowflake and ghost exempt from kinetic.
  every other one should be fully kinetic"* — dual always on, tertiary at any
  intensity; kinetic is activation only and never changes a journey's
  per-journey shader prefs). The 2026-10-05 wording "Kinetic (Expansion)
  journeys too — band-reactive motion is kept, but layers are earned, not
  locked on" is superseded by this.
  *How 2.8 was set:* from what the engine produces. In kinetic mode
  (`isFullKineticJourney`, `journey-engine.ts` ~704) the dual is always
  allowed on non-owned phases, and tertiary moments (~909, scheduled in
  `scheduleTertiaryMoments`) are short windows of 0.10–0.16 of the track
  separated by 0.015–0.05 gaps from p0.05 to p0.96, with no intensity gate —
  ≈ 75 % tertiary coverage, so 1 + 1 + ~0.75. The audit replay over the
  whole loop (2026-10-09) measured **2.73–2.77** for free-rotation kinetic
  journeys and **1.36–1.7** for phase-owned/scripted ones (Realized 1.7). So
  H5k ≤ 2.8 passes the kinetic stack as designed and fails only a journey
  pinned to a constant triple. On `shaderOwned` phases the engine keeps the
  non-kinetic gates (dual earned, tertiary ≥ 0.85), so those still land near H5.
  Enforced in `audit-snowflake-standard.mjs` (`H5` column uses `STD.H5k_layers`
  when `KIN.isFullKineticJourney(journey)`).

#### Law 10c — Sparse moments (law, carried by the engine + the shot list)

From `feedback_cosmic_sparse_interlude`: every journey gets a sparse dark
story beat.

- Opening ramp (first 40 s) = one image, one shader.
- One sparse interlude at the music's valley: one small still, one or two
  dark shaders (`sparseInterludeActive`). A shot list must put its "black +
  one small close-up" shot at that valley, and its build shot right after.
- **S7** opening shot sparse (automated); valley placement: eye check
  (`apply-shotlists.mjs` writes the authored `sparse` phase).

#### Law 10d — Cadence (image-tempo law)

Measured from the latest real kiosk lap in the flight recorder
(`docs/glitch-events.jsonl`):

- **C1** ≥ 3.5 distinct stills/min (Snowflake 4.3; image-tempo law: 11 s max
  visible age, 10 s replacement).
- **C2** ≤ 10 % repeated stills within a lap.
- **C3** see law 1b.

### Arc template (adapt to the analysis, never fixed)

Sparse open → micro → interior/intimate → **valley: black + one small
close-up** (at the music's real valley) → build (camera rises/pulls back,
layers join) → **cosmic at the peak** (scale matches the peak) → resolution
to a small form (or a lit crest if the music ends resurgent) — ideally a
visual bookend of the opening motif. Eye check (S5/S7 cover the cosmic
escape and the sparse open).

---

## 2. What Snowflake actually does (measured, not remembered) — the reference

Sources: the latest full kiosk lap in the flight recorder (session `xsl66f`,
`docs/glitch-events.jsonl` line 24325), the scripted take
(`pinned-takes.ts`), the pack (`public/tramokyo-pack/…/first-snow`), and the
real `JourneyEngine` replayed by the audit.

**Still sequence of one lap (3:02, 13 distinct stills, 0 repeats, 4.3/min):**

| # | still | register | what it is |
|---|---|---|---|
| 0 | gen-106 (pinned intro) | sparse · cosmic | one particle spiral, small, on black |
| — | morph t0b | travel | glowing path → camera rides it into dense frost |
| 1 | gen-010 | micro · **white ground** | macro frost fractal — polarity flip |
| 2 | gen-017 | micro | frost edge, white |
| 3 | gen-104 | sparse | particle crescent on black |
| — | morph t1 | travel | white fractal → vortex ring on black (macro → cosmic) |
| 4 | gen-023 | cosmic | dense vortex, violet core |
| 5 | gen-032 | cosmic | galaxy spiral of powder |
| — | morph t2 | travel | vortex → camera descends into the powder surface (cosmic → micro) |
| 6 | gen-042 | micro-landscape | powder cloudscape |
| 7–11 | gen-127/124/113/114/112 | **sparse gestures** | one arc · a dust field · one thread · one ring · one wisp — each a single gesture on black (stillness window 0.43–0.51 sits here) |
| — | morph t3 (finale) | travel | arc → wisp settling on a reflective floor; finale shader forced, morph melts out |
| 12 | gen-103 | sparse | small ring on a particle floor — the ending |

**The grammar this encodes**
1. **Opens on one small gesture on black.** Never a full composition.
2. **Scale whiplash, not drift.** Register changes on 8 of 12 adjacent stills:
   sparse → micro (and a white-ground polarity flip) → sparse → cosmic → cosmic
   → micro → sparse… Micro and macro alternate; no two neighbours are the
   same shot.
3. **Every chapter turn is a camera move.** 4 Kling travel morphs (t0b, t1,
   t2, t3 ≈ one per 45 s, exactly at phase boundaries) carry the camera from
   one world into the next — that is the "POV journey". Heroes are disabled
   app-wide (wan judder); the morphs are the only living video.
4. **The second half earns density with shaders, not with busier stills.**
   From the valley on, stills are single gestures on black; complexity builds
   from the dual shader (enters at p0.70, the build), clones and Ken Burns.
5. **One shader voice at a time, always changing.** 14 distinct shaders in
   3 minutes; primary rotates every ~11–14 s (3.6 switches/min); a dual only
   in the build (p0.70–0.86); no tertiary. Mean live layers ≈ 1.3. **No
   shader is on screen more than 23 % of the lap** (measured), none persists
   longer than ~one phase.
6. **Sparse → build → cosmic → resolved small form.** The valley is a
   stillness hold of single gestures + one dark shader; the build adds the
   dual; the finale morph lands on a small resolved form and melts out.
7. **Negative space everywhere.** Median 48 % of every still's pixels are
   near-black; 31 % centred (the deliberate ring/spiral motifs), the rest
   asymmetric.
8. **Material:** particles — glitter, powder, dust — never literal snow
   scenes. Abstract particle interpretations beat literal scenes (Karel
   2026-09-28).

Snowflake's shot-list checks (L/S) are not scored: its hand-curated pack's
shot list IS its stills, not phase prompts.

---

## 3. Process notes

- Prompt length ~45–110 words; length serves shot specificity, never
  scene-lock. The perspective/interpretation/mood rotation adds per-frame
  variety ONLY when the prompt leaves it room.
- Verify with eyes before declaring done: sample threshold + transcendence +
  integration frames per journey; check for moons, figures, and
  six-of-the-same-shot. (Every "eye check" above is part of this pass.)
- Validate a shot list BEFORE applying it:
  `node --env-file=.env.local scripts/mv-rollout/apply-shotlists.mjs <set> --check`.
- After building any journey run `scripts/assign-journey-shaders.mjs`.
- Score staged work before install with the audit's `--stage=<overlay.json>`.

---

## 4. How to run

```
nvm use 20
node scripts/audit-snowflake-standard.mjs --md=/tmp/scorecard.md --json=/tmp/scorecard.json
node scripts/audit-snowflake-standard.mjs --only=<journeyId,...>   # spot-check
node scripts/audit-snowflake-standard.mjs --no-images              # skip P lenses
node scripts/audit-snowflake-standard.mjs --stage=<overlay.json>   # score staged work
```

Read-only. The engine replay uses the same casts/kinetic/stillness code the
kiosk runs (morph quiet windows aside). The flight-recorder lens uses the
latest lap ≥ 1 min per journey; journeys without a lap since the log began
show "no run". Re-run after any recast, re-harvest or engine change; the
2026-10-05 baseline lives in `docs/snowflake-standard-scorecard.md` (scored
before H5k existed — its H5 column judged kinetic journeys by 1.8).
