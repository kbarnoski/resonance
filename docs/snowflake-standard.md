# The Snowflake Standard — a journey is a music video you travel through

Codified 2026-10-05 from Snowflake (`first-snow`), the mastered reference take,
after Karel's note on the kiosk:

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

This doc is the checkable definition. `scripts/audit-snowflake-standard.mjs`
scores every non-mastered kiosk-loop journey against it (rule IDs below are
the audit's check IDs). It extends — never replaces — `journey-design-spec.md`
(laws 0–10), `feedback_cosmic_sparse_interlude`, the morph laws and the
transitions-never-abrupt law. Snowflake, Realized and Ghost are mastered and
are never edited to meet it; Snowflake is the reference row.

---

## 1. What Snowflake actually does (measured, not remembered)

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

---

## 2. The Standard — rules (audit IDs)

### L — Visionary, never literal (Karel 2026-10-05)
- **L1** ≤ 15 % of shots literal. A shot is literal when it names an
  everyday object/structure/creature (room, window, bell, barn, boat, bird,
  horse, vine…) or a plain nature scene (meadow, lake, valley, forest,
  clouds, sea…) **without transfiguring it** — made of light, impossible
  scale or physics, fractal/kaleidoscopic structure, worlds-within-worlds,
  cosmic dissolve, particles.
- The analysis' imagery cues are literal by nature ("a stone cloister at
  dusk", "a window glowing amber"); the design's job is to translate them:
  the cue's *light, motion and scale* survive, its *objects* do not.
- Vocabulary: visionary, surreal, dreamlike, otherworldly, kaleidoscopic,
  luminous, made of light. **Never** "psychedelic", DMT or any drug word
  (altered-states law).

### S — Shot list (the phases' `aiPromptSequence`, which the harvest consumes in order)
- **S1** ≥ 12 genuinely different shots (Jaccard < 0.5 between word sets).
  Six phases × three shots; re-using "close study: a single seed…" in five
  phases is the slideshow.
- **S2** ≥ 4 scale registers across the journey: sparse · micro · intimate ·
  interior · abstract · aerial · cosmic. **Every shot declares its register
  in its first words** (an unclassed shot has no scale = no camera).
- **S3** ≥ 60 % of adjacent shots change register (micro ↔ macro).
- **S4** No place noun in more than 3 phases (spec law 5).
- **S5** ≥ 1 cosmic/abstract escape — and it sits where the music peaks.
- **S6** ≥ 25 % of shots carry camera language (descending through,
  rising up through, pulling back to reveal, drifting toward, inside…). Each
  shot's last beat hands the camera to the next shot.
- **S7** The opening shot is sparse: one small subject on dark, off-centre.
- **Arc template** (adapt to the analysis, never fixed): sparse open → micro
  → interior/intimate → **valley: black + one small close-up** (at the
  music's real valley) → build (camera rises/pulls back, layers join) →
  **cosmic at the peak** (scale matches the peak) → resolution to a small
  form (or a lit crest if the music ends resurgent) — ideally a visual
  bookend of the opening motif.

### H — Shaders (the real engine, replayed over the track's real duration)
- **H1** ≥ 10 distinct shaders on screen (Snowflake: 14). *Policy tension:*
  the loop-wide diversity caps (≤ 5 uses per support, ≥ 10-journey spacing)
  currently hold every cast journey at 7 — see the plan.
- **H2** No shader on screen > 35 % of the track; a single declared lead
  ≤ 50 % (Kinetic Lab "one lead" law).
- **H4** No shader continuously on screen > 25 % of the track (≈ one phase).
- **H5** Mean live layers ≤ 1.8 (Snowflake ≈ 1.3): one voice in quiet
  phases, the dual earned by the build (≥ 0.6), the tertiary only at the
  climax (≥ 0.85). Kinetic (Expansion) journeys too — band-reactive motion
  is kept, but layers are earned, not locked on.
- **Choreography** (`JourneyPhase.shaderOwned`, engine since 2026-10-05):
  each phase owns its pool; a support lives in one phase (two adjacent at
  most); sparse phases get one or two dark shaders (mean ≲ 10); a shader
  may return only as a recapitulation the music itself makes (e.g. the
  opening voice at the coda); the outgoing phase's shaders leave within
  ~4 s of the boundary.

### P — Pack stills (pixels, 64 px)
- **P1** ≤ 20 % of distinct stills are near-duplicates (16 px zero-mean
  correlation ≥ 0.85) of another. 24 variations of one god-ray = slideshow.
- **P2** ≤ 35 % centred subjects (bright-mass centroid within 6 % of centre).
- **P3** Median near-black share ≥ 45 % — room to layer on top.

### M — Motion
- **M1** ≥ 80 % of phase boundaries carry a travel morph (Kling O3, the
  proven negative-space recipe: "sparse luminous X forms … most of the frame
  remains deep black negative space at every moment"), QA zero-spike, cover
  still + nudged shader at the end, finale melt. Morphs are designed as
  **camera moves between the two shots they join** (push into, pull back
  to reveal, rise through, descend into) — not generic dissolves.

### C — Cadence (latest real kiosk lap in the flight recorder)
- **C1** ≥ 3.5 distinct stills/min (Snowflake 4.3; image-tempo law: 11 s
  max visible age, 10 s replacement).
- **C2** ≤ 10 % repeated stills within a lap.
- **C3** No shader present (any layer) > 35 % of a real lap (Snowflake 23 %).

### Sparse moments (law, carried by the engine + the shot list)
- Opening ramp (first 40 s) = one image, one shader.
- One sparse interlude at the music's valley: one small still, one or two
  dark shaders (`sparseInterludeActive`). A shot list must put its "black +
  one small close-up" shot at that valley, and its build shot right after.

---

## 3. How to run

```
nvm use 20
node scripts/audit-snowflake-standard.mjs --md=/tmp/scorecard.md --json=/tmp/scorecard.json
node scripts/audit-snowflake-standard.mjs --only=<journeyId,...>   # spot-check
```

Read-only. The engine replay uses the same casts/kinetic/stillness code the
kiosk runs (morph quiet windows aside). The flight-recorder lens uses the
latest lap ≥ 1 min per journey; journeys without a lap since the log began
show "no run". Re-run after any recast, re-harvest or engine change; the
2026-10-05 baseline lives in `docs/snowflake-standard-scorecard.md`.
