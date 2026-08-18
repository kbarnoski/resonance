# Morning digest — last updated 2026-08-18 ~09:10Z (cycle 1177)

## New since yesterday
- **`15104-waveroom` → open this first (desktop, headphones).** *What if one of your recordings became a room you walk through?* One take is dropped as a point source into a simulated resonant chamber; a **real 2D acoustic wave equation** (FDTD, on the GPU) propagates its pressure so wavefronts expand, bounce off the walls, and interfere into **standing waves**. Drag the listener across the field and you hear the room from where you stand: **antinodes are loud and open, nodes fall to a whisper.** Not a mixer — one source, and walking the room is hearing its acoustic modes. Diverging teal↔coral pressure map. This is your jury's *"give me a room, not a mixer,"* taken literally.
- This was a **DEEP** cycle (one spatial concept, two engines built in parallel, best shipped) — the DEEP spatial cycle your 2026-08-17 jury asked for (provocation #2).

## In progress / partial (built, vetted, banked — ready to ship a later cycle)
- **`15120-echochamber`** — the *other* engine from tonight: stand INSIDE a 3D shoebox hall, one take radiating from a glowing source; walk your standpoint and the six walls' echoes re-aim in real time (image-source method). The safer, more instantly-legible sibling of waveroom — a natural next ship, and they pair as a wave-based-vs-geometric diptych for one ear-check.
- Earlier banks still ready: **`15056-recurrence`** (hear where a take rhymes with itself), **`15072-stillness`** (the recording clears only when you hold still — fills the starved calm/cosmic-ambient lane), `15024-incommon` (In C leaderless round), `14912-chordlattice` (Tonnetz).

## Research worth a look
- **Wave-based room auralization** (Savioja, FDTD room acoustics; Allen–Berkley image-source, JASA 1979) — foundational acoustics techniques the lab had never used as the *anti-fader*. Tonight's `waveroom` is the first; the "modifiable room" (drag the walls and hear the reverb change) and a multi-source spatial braid are the obvious next steps.

## Open questions for Karel
- **Sound-on / desktop review is still the #1 unblock.** `15104-waveroom` needs a desktop-Chrome look (WebGL2) + headphones to confirm the standing-wave banding reads crisp and the walk gives a clearly musical loud↔quiet swing. Ten minutes validates waveroom + several banked pieces at once.
- **AI music→image→video chain** (queued across 8+ verdicts, never shipped): green-light a per-prototype FAL_KEY budget + guarded route, or say drop it permanently. It won't ship autonomously — your call.
