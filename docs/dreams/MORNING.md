# Morning digest — last updated 2026-07-19 (cycle 832, DEEP)

> **You asked in yesterday's brief: "Ship `droplet-cairn` next?"** — done. And it's the boldest thing the lab has shipped in a while: an **audio-first, eyes-closed, HAPTIC** instrument with *no pitch, no scale, no tuning at all.* This cycle went DEEP on the jury's one unaddressed ask — provocation #3, *make memory editable/consequential, not just additive* — under one concept: **composing IS editing.**

> **Tonight: build music from timed IMPACTS, feel every hit in your hand, and UN-build it by knocking a stone off.** Tap in rhythm → each tap drops a stone that *collides*, and the collision is the sound (modal-impact synthesis — struck objects, never notes). Lay a figure as a loop; layers phase against each other (Reich); then **knock a stone off** and hear the loop lose it, or swap a stone's material and hear its timbre change on the next pass. Un-making is a musical event, not an undo.

**Open this first — best with HEADPHONES; the screen is deliberately spare (it's meant for eyes closed):** https://getresonance.vercel.app/dream/1990-impact-cairn — press **Begin**, tap the field in a rhythm, hit **Lay layer**, then **knock a stone off**. On a phone you'll feel each hit (Vibration API). If you just wait, a ghost drummer plays and un-builds the cairn on its own.

## New since yesterday
- **`/dream/1990-impact-cairn`** — *impacts, not notes.* Modal-impact synthesis (inharmonic band-pass modes + ±4% per-hit jitter, four materials: droplet/ceramic/wood/stone) → **no pitch lattice anywhere** (the jury's most radical answer to "escape the JI drone"). Tapped figures become **phasing loop layers** you can **delete (knock a stone off, with an audible tumble), transform (swap material), mute, clear** — editable memory, jury #3. **Audio-first + minimal DOM** — the lab's coldest, most-starving substrate (0× recent). Haptic via `navigator.vibrate` + real `PointerEvent.pressure` velocity. Grounded in **SIGGRAPH 2026 Emerging Technologies** (a MIDI water-droplet impact-sound interface — the program is live *today*).
- **2 more explored, banked (IDEAS §832):** ⭐⭐ **`splice-cassette`** — a destructive SVG-DOM **live-looper** where you record *over* the past, cut, drag-to-phase, and **fracture** clips, and a slowly **drifting scale re-voices old clips on its own** (the past changes meaning) — cashes NIME 2026's "Loop Fracture Loop." ⭐ **`tritave-loom`** — a **Bohlen–Pierce** melody you *weave and un-weave* (pull a thread to un-make a note, SVG-DOM).

## Needs your eyes/ears (I ran headless — no audio/speakers/haptics/touch here)
- Does modal-impact synth read as **struck objects** (not pitches)? Does the knock-off **"tumble"** read as *un-making* vs just a gap? Does the phasing evolve musically? Does the **haptic pulse** land on your phone? All coded defensively, none verified by ear here.
- The visual is intentionally minimal (the piece tests the lab's screen-first bias). If it reads as *too* bare at a glance, that's a dial I can turn up — tell me.

## Research finding worth a look
- **NIME 2026 "Loop Fracture Loop"** (Kiefer & Accorsi, London, ended June 26) + the **Living Looper** lineage reframe the musical loop from *verbatim replay* to something you **fracture and transform** in performance — the exact "un-making is a musical event" the jury asked for, <30 days old. It seeded tonight's DEEP concept and the banked `splice-cassette`. Full note in RESEARCH.md (§832).

## Open questions for Karel
- **Resurrect `splice-cassette` next?** It's the single most complete version of "editable memory" (delete + overwrite + transform + a self-re-voicing past) and the freshest NIME chain — a strong SVG/looper cycle.
- **The AI-pipeline chain (audio→image→video) is still 0×** across ~27 juries — but `1960-depth-well` proved a **$0 in-browser** ML path (Transformers.js/WebGPU), so there's no budget excuse left. Want me to scope one cycle on it?
