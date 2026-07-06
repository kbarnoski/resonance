# Morning digest — last updated 2026-07-06 ~22:xx UTC (cycle 685, adult · WIDE)

## ⚠️ Needs your call — the dream loop is BLOCKED
The lab has grown into a **build-scaling ceiling** — and it's already reached at
the current **640-route baseline**. `npm run build` in the agent's ephemeral
container is now **nondeterministic**: it overflows the container's hard **4096
open-file limit** during Next's page-data collection → `EMFILE: too many open
files`. Observed: a 640-route build passed once, but two 641-route builds and a
later 640-route build all EMFILE'd — so it's not merely "one route too many," the
fd budget is exhausted now. **This blocks every future build cycle until it's
relieved** — and the agent's scope fence forbids the fixes (can't touch
`next.config`, ulimit, or delete old routes). Your options:
1. **Raise the container fd limit** (`ulimit -n` in the setup script) — simplest.
2. **Cap Next static-gen concurrency** (`experimental.cpus` / workers in `next.config`).
3. **Archive/relocate old dream routes** to shrink the route table.

I'd suggest (1) — one line, unblocks everything.

## New since yesterday
- **Nothing shipped tonight** — but 3 full prototypes were built and curated; the
  winner just can't be committed until the ceiling above is fixed.
- **⭐ `1244-dayline` (curated winner, built & ready)** — *the Earth is a
  clock-sequencer*: the day/night terminator sweeps a flat world atlas and every
  city it crosses at dawn/dusk rings a note; a drone tracks the sunlit landmass.
  Fully offline solar astronomy, one-glance legible ("hear the sun move around
  the Earth"). Commits as-is the moment the fd-limit is raised.

## Built tonight, banked (IDEAS §685) — a WIDE fire of 3 non-object FORMS
Directly cashing yesterday's jury note "break the FORM, not just the timbre":
- **`1244-dayline`** — a MAP (winner, above).
- **⭐ `1245-antiphon`** — a CONVERSATION: you tap a phrase, a generative partner
  *listens* and answers in the gap (echo / invert / stretch / leave-space, biased
  by how dense you played, with a short motif memory that quotes you back). A
  two-lane scrolling manuscript. The "musical intelligence, not object-to-pluck"
  lane you liked in 1218-shadow. Strong resurrect.
- **`1243-calligram`** — a PAGE: type a poem, each letter both sounds a diatonic
  note and settles as ink into a living concrete-poem that's also a score.

## Research finding worth a look
- **Refik Anadol's *Dataland*** opened **2026-06-20** (LA) — *Machine Dreams:
  Rainforest*, where the artwork IS a living real-world data field. Seeded
  tonight's map/data direction. (RESEARCH.md)

## Open question for Karel
- Which unblock do you want (fd-limit / Next concurrency / archive routes)? Once
  you pick, `1244-dayline` ships next fire and `1245-antiphon` is queued right
  behind it.
