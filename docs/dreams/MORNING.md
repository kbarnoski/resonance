# Morning digest — last updated 2026-08-14 UTC (cycle 1130)

**DEEP cycle — one concept raced three ways, and it finally ships the piece I've been banking for two cycles.** The perpetual "drawn sound" idea — sing, and your voice is *drawn* as light — got promoted tonight. Three renderings of the oscilloscope tradition raced; the winner is the one that turns your voice into a lockable instrument, not just a pretty tangle.

## New since yesterday
- **[11776-lissaknot](https://getresonance.vercel.app/dream/11776-lissaknot)** — *sing, and your own voice is drawn as living light on a real X-Y oscilloscope — hold a clear note and it snaps into a stable, glowing Lissajous knot.*
  - **Why open this:** it's an instrument you play with your **voice**, on your phone — sing into it. A tiny in-browser pitch tracker locks a held note to a clean integer-ratio figure, so a sustained vowel crystallizes into a knot of light; slur or add a consonant and it scribbles and whips. This is the oscilloscope-music lineage (Jerobeam Fenderson, Norman McLaren, Ben Laposky) made playable. **Muted on your phone it already draws** — a seeded voice sings a slow melody so a knot forms within ~1s with no mic.
  - This is the piece I've flagged "resurrect first" for two cycles running — a DEEP finally cashed it, the same way the Messiaen rose-window cashed the light-organ.

## Also explored (banked, not shipped — see IDEAS §1130)
Two other renderings of the same "voice → drawn light" concept, both built clean, folders removed, ready to resurrect:
- **11744-drawnsound** ⭐⭐⭐ RESURRECT-FIRST — the *faithful* version: ~1,400 ivory light-filaments traced as streamlines through your voice's field. The most robust, most portable base — lost only as the smaller leap (the way the literal light-organ grid lost to the rose-window).
- **11760-filamentchoir** ⭐⭐⭐ — the *massive* version: ~24,000 filaments advected on the GPU (transform feedback). It even passed a full production build — but its GPU headline can't be verified without a real device, and it reuses the exact substrate I shipped last night.

## Research worth a look
- The oscilloscope-music / **XY vector-synthesis** tradition is a *living* practice (Fenderson's OsciStudio, the macumbista Vector Synthesis toolkit, a 2026 GPU scope), and real-time pitch estimation (**PESTO**, arXiv:2508.01488) is now cheap enough to *lock* a sung note into a stable knot — both fed straight into tonight's winner.

## Open questions for you
- **On lissaknot:** does a held note read as *snapping* to a clean knot on a real device, and is singing into it fun? My review is headless — no mic, no speakers.
- **The GPU / sound-on review slot is overdue (now 6+ pieces):** filamentchoir's transform-feedback + attractorveil's + a stack of banked compute pieces all need a real device to judge. A designated "sound-on, real-device review slot" would unlock the whole banked GPU line. Say the word.
- **Standing (40+ cycles):** the AI-pipeline chain (music→image→video) still needs a `FAL_KEY` budget — build it or strike it?
