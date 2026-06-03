# Morning digest — last updated 2026-06-03 ~16:30 UTC (cycle 297)

> **The jury said "stop shipping orphans" — so today I committed to a multi-cycle build for the first time ever, and shipped breadth that was already paid for.** Yesterday's verdict: zero multi-cycle builds in 15+ cycles, three spatial/MIDI pieces banked-but-never-shipped, and "ban the audio→visual driver for one cycle." This adult cycle clears three of those at once. See `docs/dreams/JURY.md`.

## New since yesterday
- **[/dream/291-harmonograph](https://getresonance.vercel.app/dream/291-harmonograph)** — open this **at a piano / MIDI keyboard if you can** (it also plays from your computer keys `a w s e d f t g…` or the on-screen piano). Play a chord and it **draws itself** as a Victorian harmonograph — each note a pendulum. Then hit **Pure tuning (Just Intonation)**: watch the tangled figure **clean up into a near-closed loop** at the same instant the beating audibly settles. *Why open it: it's the lab's first "harmony-as-visible-geometry" instrument, it's built for a pianist, and toggling pure-vs-equal lets you literally see the difference between consonance and a tempered chord.*

## Why this one matters (jury-wise)
- It's the banked **MIDI harmonograph** finally shipped (you'd "already paid for" it — it was build-verified twice and left in IDEAS). 
- It's the **first time I've claimed a multi-cycle commitment** (the jury's #1 gripe). Cycle 2 will add: sustain-pedal = freeze/accrete the figure, mod-wheel → pendulum damping, per-note color, and **SVG/PNG export so a chord becomes a printable artifact**.
- Output isn't a screen-visualizer-of-sound — the *geometry generates* the sound, and it can echo notes out to real MIDI gear. (The jury asked to break that "sound→picture" rut.)
- I deliberately did NOT do the queued "deepen 287-mirror-choir" — a 2nd body-tracking + matte-canvas piece in 3 cycles would've failed the diversity gate. Harmonograph is a clean fresh axis. Say the word if you'd rather I'd stuck with the choir.

## Also explored (banked, not shipped)
- **phase-scope** — an XY oscilloscope where a single **Pure⇄Equal slider** locks the Lissajous figure still while a beat-meter falls to 0 Hz. Elegant "see+hear consonance lock," but it's a tuning *demo*, not a played instrument. In IDEAS.md — could become a "scope mode" inside 291.

## Open questions for Karel
- 291 is **build-verified, not browser-verified**: the JI "cleanup" reads best on *sustained* chords (staccato clears the trail first). A 10-sec test on the deploy — hold a major triad, toggle Pure — would tell us if it lands. The cyc-2 sustain-pedal-hold is the fix if it's too fast.
- Want me to keep the **multi-cycle thread** going on 291 next adult cycle, or pivot back to shipping the other banked breadth (`ensemble-tabs` networked piece)?
- Force-push doc-drift persists (STATE/RESEARCH rewinds on each forced update), but all prototypes + INDEX are intact. Worth pinning AGENT.md so it stops reverting to the stale version.
