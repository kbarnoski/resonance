# 17264 · Vestibule — "The five are waiting"

**A front door, not a sixth stack.** Status: demoable.

## The one question
*What if the fix for a broken review loop isn't another bold piece, but a threshold room that makes the five already-built pieces impossible to walk past?*

## Why this exists
Six fires in a row the lab shipped bold, thin-shelf pieces —
`17120-breathline`, `17136-tidemark`, `17168-hearth`, `17200-hall`,
`17232-tunesignal` — and **not one has been opened** (zero votes for ~2 weeks).
The build engine is healthy; the review loop is the only broken thing. The
2026-09-14 jury's #1 provocation was explicit: stacking a seventh unverified
build "is no longer courage — it's a substitute for the one verification." The
honest move is "a piece engineered to be impossible to ignore on a cold muted
phone glance ... build the lure hearth deserves." This is that lure.

## What it does
A single threshold page holds the five unopened pieces as five **living doors**.
Each door renders a lightweight Canvas2D evocation of its piece's signature
motion, alive from the first frame with **no interaction** (autonomous drift),
and deepens when Karel presses play on his real take — **one shared analyser
drives every door**. A hero stage enlarges one door and auto-cycles through all
five (6.5s); tap a door to feature it, tap Enter to walk through.

- **breathline** → a warm aperture inhaling on a slow ~0.3 Hz breath + fast tremor.
- **tidemark** → warm sediment strata with a drifting bright tideline crest.
- **hearth** → a central warmth blob orbited by faint "remembered presences."
- **hall** → a neutral ember light-wall, violet only at the luminance peaks.
- **tunesignal** → 1-bit static that resolves into a radial figure and back —
  tunesignal's own resolving *signal*, the actual subject of that piece (not a
  decorative grain pass; grain is banned lab-wide and confined here to nothing).

## Constraints honored
- **Audio = catalog only.** `loadRealTrackBuffer → createSafeMaster.input`;
  looping bufferSource; **no `ctx.destination`, no synth/oscillator, no mic**.
  Visuals read `master.analyser` (ABSOLUTE rule 10 clean).
- **Reads on a cold muted glance** — every door animates before any audio.
- **Degrades:** audio load fail → on-brand `text-destructive` notice, doors keep
  drifting; `prefers-reduced-motion` freezes tremor/auto-cycle to a still hero.
- Typography: semantic tokens throughout, `text-base`+ body, `text-2xl`+ heads,
  44px tap targets. Art-layer hex confined to the canvases.

## Not a thin-shelf ambition build
This is a **curation / front-door cycle**. The jury banned a sixth stacked
concept; the diversity audit governs ambition builds, not a portal whose whole
job is to re-front existing work. It incidentally clears 2/5 of the ambition
floor (≥3 subsystems: catalog loader/decoder + safeMaster analyser bus + five
distinct door renderers + auto-cycling hero + nav routing; and it's the lab's
first portal/index AV piece), but its reason to exist is the loop, not the floor.

Ref: the 2026 install trend of *living, movement-reactive gallery portals*
(Utsubo interactive-installation survey; "reactive environments shaped by
visitor movement," 2026) — a threshold where each work breathes until entered.

## Open question for Karel
Of the five, which is worth deepening? One ♥ on any door turns two-plus weeks of
bold work into a direction. If none land, the next honest move is a genuine
pause — not a seventh piece.
