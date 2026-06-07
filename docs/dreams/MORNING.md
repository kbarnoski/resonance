# Morning digest — last updated 2026-06-07 (UTC) (cycle 345)

> **Jury (2026-06-07)**: breadth is a costume — 7/15 ship raw WebGL2, 9/15 live in D-Dorian, and only ONE of 15 is off-screen. Bans this cycle: WebGL2/three.js output · MIDI/touch input · D-Dorian. Today obeys all of them — and finally builds the spatial-audio shelf the jury said we keep researching and never shipping. See `docs/dreams/JURY.md`.

## New since yesterday
- **[/dream/394-soundfield-room](/dream/394-soundfield-room)** — **Soundfield Room** (adult). Headphones, eyes closed, turn your head — six just-intonation drone voices float around you in 3D and the **whole soundfield rotates as one coherent space**. *Why open it:* the lab's **first true Ambisonic soundfield** — B-format encode → a 3×3 head-tracking rotation → 8-virtual-speaker HRTF binaural — the genuine leap past our older per-source binaural toys (7-spatial / 29-scene panned each source alone; this rotates the *whole field*). It's **off-screen-first** (the screen is just a dim radar) and it auto-demos: open it on a phone and the space slowly sweeps around you with no input.
- This is the most direct answer to the jury's **#5** ("you keep *researching* the 2026 ambisonics wave and never building it — spend a DEEP cycle on the off-screen/spatial-audio/haptic shelf"), and it leads with the two **expensive** ambition criteria the jury said are nearly absent: **genuinely-recent research** (two ambisonics-encoding papers from **June 4, 2026** — SHB-AE & Flow-HOA, ~3 days old, directly on-technique — the freshest anchor in ~8 dives) **+ multi-cycle commitment** (cycle 1 of a spatial thread). Built from scratch on the JSAmbisonics / Google Omnitone pipeline.

## Explored but not shipped (2 more, banked — IDEAS §345, copies in /tmp)
- **396-soundwalk** — you *walk through* the field (drift forward, voices approach + recede) and **feel** each voice via phone **haptics** (Vibration API) — the lab's first haptic output; Janet Cardiff audio-walk lineage. The designated **394 cycle-2 deepening** (walk + feel a true B-format space).
- **395-listener-orbit** — the lightweight version: rotate the *AudioListener* (not the field) with the browser's built-in HRTF. The simple baseline / mobile fallback.

## In progress / partial
- New **spatial-audio thread** opened (394 = cycle 1). Plan: rotate (cyc1) → walk-through + haptics (cyc2, fold in 396) → **your *Welcome Home* tracks as the voices in the room** (cyc3). Other live threads: Accompanist at cycle-3 (391) · Drop-Engine journey-engine (387) · the kids vowel-mirror (393).

## Open question for Karel
- "Coherent field rotation" vs. "eight moving speakers" is a *perceptual* bet I can't test without ears + a tilting phone. **Put on headphones, open 394, close your eyes, slowly turn** — does the whole room rotate as one space, or do you hear discrete points moving? Your answer decides whether cycle 347 deepens 394 into the full walk-through-with-haptics room, or whether the simpler **395-listener-orbit** approach sounds just as good for less.
