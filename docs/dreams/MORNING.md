# Morning digest — last updated 2026-07-19 (cycle 834, WIDE)

> **Tonight closes the jury's last-open thread.** The 2026-07-19 jury asked for three things: get off the GPU, drop the just-intonation crutch, and make your *memory* consequential — "a piece where an earlier gesture is editable and can be un-made." Tonight's winner does all three at once.

> **Composing IS editing.** `1996-splice-cassette` is a live looper drawn as **magnetic tape** where you don't just stack layers — you **overwrite**, **cut**, re-time and **fracture** what you already played. The twist: your notes are stored as scale *degrees*, not fixed pitches, and a **modal scale drifts underneath** (Dorian → … → Ionian, one lap ≈2 min). So a phrase you recorded a minute ago **re-voices itself** — same fingering, new colour — while you watch the notes slide and change hue on the tape. Un-making and re-voicing are the musical events.

**Open this first — desktop Chrome, headphones; a MIDI keyboard is a bonus but NOT required (the QWERTY row `a s d f g h j k` plays it):** https://getresonance.vercel.app/dream/1996-splice-cassette — hit **Begin**, play a few notes to record a loop, then arm **Overwrite** (`o`) and play over it, or **Cut** (`x`) / **Fracture** (`z`). If you just wait, a **ghost performer** self-demos the whole grammar — records, overwrites, cuts, fractures, then lets the mode drift so the phrase re-voices.

## New since yesterday
- **`/dream/1996-splice-cassette`** — *the past is editable, and it re-voices itself.* **SVG-DOM** (off the GPU render family — jury #1), **MIDI + keyboard**, a **drifting diatonic mode** instead of the banned JI partial-stack (jury #2), and a true **destructive overwrite** — the exact "consequential memory" gap the jury flagged as still-open after last cycle's impact-cairn (jury #3). Notes stored as degrees, resolved at schedule time, so recorded phrases re-colour as the mode turns. Ref: NIME 2026 *Loop Fracture Loop* (Kiefer & Accorsi) + the *Living Looper* lineage.
- **2 more explored, banked (IDEAS §834):** ⭐⭐ **`invisible-bells`** — a dark room of resonators you find only by **ear** (true HRTF binaural; warm light blooms only where a bell is currently audible), cashing SIGGRAPH 2026's *Light Architecture*. This is now the **TOP resurrect two fires running** — I'd ship it next on a spatial/installation cycle. ⭐ **`solar-choir`** — the live NOAA solar-wind + Kp index shaping an aurora you see and hear (a data source the lab has never used).

## Needs your eyes/ears (I ran headless — no MIDI/speakers here)
- Does the **destructive overwrite** read as *un-making* — the old notes gone, replaced — or does it feel like just another layer?
- Does the **drifting mode re-voicing your recorded past** land as musical, or as disorienting? (One mode-step every ~17 s; a full lap ~2 min.)
- Is the SVG **tape / splice / cut** legible enough to see what you edited?

## Research finding worth a look
- The freshest 2026 audio work isn't in *rendering* — it's in **tuning & timbre models**: non-linear/inharmonic modal synthesis (nlm, arXiv Mar-2026), spectral washes, Sonic4D spatial audio (Jun-2026). That's the same thing the jury said from the design side ("the JI stack is the new pentatonic"), so all three of tonight's builds attacked the *harmonic model*, each a different non-JI way. Full note in RESEARCH.md (§834).

## Open questions for Karel
- **Ship `invisible-bells` next?** It's been the top banked idea for two fires now and keeps the SIGGRAPH *Light Architecture* spatial-audio chain alive — the freshest "find it by ear" spatial piece the lab has queued.
- **Jury #3 (editable memory) now looks largely closed** — 1990 gave delete+transform, 1996 adds overwrite+cut+fracture+self-re-voicing. I'd rotate *away* from memory pieces next fire rather than over-camp it. Agree?
