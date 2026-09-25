# Journey design spec — Karel's definition (codified 2026-09-21)

The reference standard is **Snowflake** (`first-snow`) and the hand-built
featured journeys. What makes them work, in Karel's words: *"perspective,
zoom, details, and cosmic depth all come together with asymmetry and
incredible design dynamics to create amazingly interesting unfolding
journeys."* And the failure mode to never repeat: *"these are essentially
music videos, not static images on a fireplace."*

## The laws

0. **THEME IS DERIVED FROM THE MUSIC — the founding law (Karel, 2026-09-23).**
   Every journey's image theme comes from three inputs, in this order: the
   track's MUSICAL ANALYSIS (key/mode, tempo, note density, register,
   velocity, dynamic arc — compute a profile from the stored notes), its
   MOOD, and its NAME. Never from the title alone, and never by borrowing
   another journey's material. *"This is literally the entire point of this
   app and project."* Failure case to never repeat: The First / The First
   (Expanded) were themed as ice-thaw off the word "first" — but the music
   is F Major, dense, low-register, warm; the right theme was an amber
   underground dawn. Check the theme AGAINST the profile before authoring:
   cold sparse themes need cold sparse music.
   - **Material exclusivity:** ice/frost/snow/crystal/aurora belong to
     Snowflake alone (Welcome Home may use snow only as the winter dark the
     hearth defeats). If two journeys would share a dominant material,
     one of them is wrong.
   - **Summoning-risk words — never use in prompts:** "silhouette(s)",
     "figure(s)", "streets", "station", any negation of people ("without a
     single figure" summons one). A cathedral/hall WITH A FLOOR summons a
     congregation — remove the floor or fill the ground with the theme's
     own material.

1. **A journey is a SHOT LIST, not a location.** The six phases are six
   radically different shots of one theme — never the same scene, POV, or
   framing twice. If every phase could be a crop of the same photograph,
   the journey is broken.
   - **Every phase is itself a mini shot-list (Karel, 2026-09-23).** One
     prompt per phase means the viewer stares at ~a minute of variations
     of one image — "a photo series, not a music video." Every phase gets
     an `aiPromptSequence` of 3 shots that travel (different register /
     world / POV expressing the same narrative beat), so an 18-shot
     journey plays like Ghost: continuous travel, worlds within worlds.
     The harvest and the live player both consume the sequence in order
     across the phase.
   - **Spirit entities as abstract hints (Karel, 2026-09-23) — all
     journeys, not just SBL/ML.** One or two shots per journey may
     half-gather light into an ALMOST-figure: "half-gathered",
     "translucent and featureless", "made only of light", "dissolving at
     its edges". Never a clean or realistic human form — that remains
     Ghost's alone. **They are our earthly ancestors (Karel, later
     2026-09-23):** write them as ancient, warm, of-the-earth — elders
     greeting over a river confluence, low earthen presences keeping the
     mycelial fire, a procession of spore-light returning home — not
     generic ghosts. Lean INTO more of them, and into more worlds nested
     inside worlds (a gill-cathedral inside a lantern-cap inside a wood).
   - **No non-nature material metaphors.** Silk/thread/braid/weave/rope
     vocabulary renders as literal cordage (the Interplay lesson) —
     express duets and joinings through waters, winds, mists, and light.
     And the Welcome Home lesson: NO winter exemption after all — snow
     read as off-theme; homecoming is a verdant golden-dusk valley. The
     ice family is Snowflake's alone, fully, no exceptions.
   - **Shaders: never let phases[].shaderModes sit empty** — empty means
     the engine falls back to ONE default shader and the whole album
     looks the same. Run `scripts/assign-journey-shaders.mjs` after
     building any journey; it seeds the registry's own
     regenerateJourneyShaders per journey (~30 distinct shaders each,
     LRU variety across journeys). The viewer should never sense a
     limited set.
2. **Scale traversal is mandatory.** Across its six phases every journey
   must move through at least four scale registers: microscopic detail,
   intimate/object scale, landscape, aerial/planetary, cosmic/abstract.
   The order varies per journey (and should differ BETWEEN journeys).
3. **Theme = motif family, not a place.** Each track owns 3–4 signature
   elements (materials, forms, light behavior, palette). Phases recombine
   the motifs at different scales — abstract enough that the cinematic
   perspective rotation can breathe, specific enough to stay this track's
   world.
4. **Asymmetry and declared composition.** Explicit off-center weight,
   diagonal energy, declared backgrounds (DARK / PURE WHITE / etc.),
   generous negative space. Centered postcard symmetry only as a rare
   deliberate exception (e.g. a mandala whose subject IS the circle).
5. **Unfolding, not looping.** Motion language in every prompt — things
   build, break, travel, decay. Phase N should feel like a consequence of
   phase N-1.
   - **Progress through SPACE AND TIME (Karel, 2026-09-23).** The Mexican
     Boy lesson: register variety alone isn't enough if all six shots share
     one place, one palette, one hour of light — on the wall that reads as
     the same image for six minutes ("boring"). Every journey must (a) move
     through space — each phase a different vantage or world, with at least
     one full cosmic or abstract escape (galaxy / mandala / void register),
     and (b) move through time — the light state must evolve across the arc
     (dusk→night→dawn, build→peak→rest, storm→clearing). Audit test: no
     location noun in 4+ phases unless the place IS the subject (Isolation's
     island) — and even then, time must visibly pass.
6. **NO humans, ever — not even silhouettes.** Ghost is the single
   exception (her figure is the design). FLUX inserts scale-figures into
   vast empty landscapes: anchor foregrounds with objects/details, write
   "completely uninhabited", and NEVER write "no people" in a positive
   prompt (negation summons the noun — the moon lesson).
7. **No moons/planets/orbs by occupation.** Fill every open sky with the
   theme's own material (clouds, aurora, dust, falling light, canopy).
   FLUX ignores negative prompts; positive occupation is the only lever.
8. **Spirit energy (SBL + March Light).** Occasionally — one or two
   phases per journey, subtle — a light-form with almost-presence: an
   intentional current of luminous mist, a slow ribbon of pale light that
   moves as if aware, a drifting veil that pauses. Formless as breath,
   never figurative, never humanoid, never literal. Vary the phrasing per
   journey.
9. **Phase boundaries follow the track's real energy arc** (analysis-
   derived; see `analysis-phase-bounds.ts` and the album builders).
10. **House basics**: film grain zero, altered-states language only,
    smooth transitions, name-only title cards, palette per track,
    shader categories spread across the registry.

## Process notes

- Prompt length ~45–110 words; length serves shot specificity, never
  scene-lock. The perspective/interpretation/mood rotation adds per-frame
  variety ONLY when the prompt leaves it room.
- Verify with eyes before declaring done: sample threshold + transcendence
  + integration frames per journey; check for moons, figures, and
  six-of-the-same-shot.
