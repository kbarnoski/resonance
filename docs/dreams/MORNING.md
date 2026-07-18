# Morning digest — last updated 2026-07-18 (cycle 819, WIDE)

> **Jury verdict (2026-07-18):** the triple-ban held — but the lab dug two fresh grooves (touch-input 6×, WebGL2 7×). The fixes it asked for: a **non-touch input on a non-WebGL2 substrate**, and **give a piece real memory of what you did**. Tonight's cycle does both, deliberately, three times over. See `docs/dreams/JURY.md`.

**Open this first:** https://getresonance.vercel.app/dream/1932-canon-loom — press **Start**, then play the keyboard (a MIDI controller if you have one plugged in, otherwise the **QWERTY home row** `a s d f g h j k l` is a 2-octave C-major scale, top row for the sharps). Watch each note knot itself into the scrolling cloth — and keep listening: the loom **plays your past notes back as a canon** under whatever you play next. Play a phrase, stop, and hear it come around again beneath you. It won't sit still without you (the ghost only demos until you touch a key).

## New since yesterday
- **`/dream/1932-canon-loom` — the notes you play never disappear.** Every note becomes a permanent **indigo thread** on a Nancarrow-style punched roll (time scrolls sideways past a gold read-head; pitch is vertical). The roll is a loop, so **every thread re-fires each time it comes around** — your earlier self accompanies your present self, and the fabric visibly densifies as you weave. This is the jury's **#4** ("push compositional MEMORY, not reactivity") made literal: *what you played 90 seconds ago is still sounding and still constraining the piece.*
- **It breaks BOTH new grooves at once (jury #1):** input is **MIDI/keyboard** (not touch), output is **Canvas2D** (the single least-used renderer in the lab right now, 1× — the sharpest possible answer to the WebGL2 pile-up at 7×). And the thread *is* both the woven mark and the scheduled note — one object, the sound-is-image identity you've liked before.
- **WIDE cycle — explored 3, shipped the strongest.** Two runners-up (both built to demoable, both clean) banked to IDEAS §819:
  - **⭐⭐ `1936-breath-fresco`** — breathe (not sing); each exhale paints a lasting band of pigment + a lasting drone-partial on a **WebGPU** wall (with a Canvas2D fallback). Lost because its "sustained hold → fading tone" mechanic is too close to *last* night's 1930 — I didn't want two similar pieces in a row. Worth resurrecting on a dedicated WebGPU cycle with a fresh memory twist.
  - **⭐ `1934-gait-loop`** — **dance** in front of the camera; your movement phrases record and loop back so you stack motion on motion (three.js). Lost on a jury-banned pentatonic scale + it can't self-demo well on your phone without a camera.

## Honest caveats
- Headless container = **no MIDI, no display, no speakers.** I typechecked, linted, and ran the authoritative compile build (all clean, route emitted, no leftover-candidate leak) — but I could not play it. Your keyboard settles the feel: does the canon read as *your past accompanying you* (vs. mush as it densifies)? Is the ~1-frame scheduler jitter audible on the warm pluck? Does the ghost weaver hand the loom over to you cleanly?

## Open questions for Karel
- **1930 cycle 3?** The jury's sharpest open thread (its #3) is 1930's **adaptive-JI drift toggle** — "strict physics (the pure chord slowly drifts) vs. adaptive pure (it locks)," making the 300-year-old comma-pump audible and playable. I went WIDE tonight (two DEEP nights in a row already); the next fire is a natural moment for that DEEP. Want it, or is Harmonices "done at II"?
- **Which non-touch input next?** Tonight rotated to MIDI/keyboard + Canvas2D. **Camera** (1934) and **WebGPU/breath** (1936) are both banked and both thin — I can resurrect either next WIDE. Preference?
- **The AI-pipeline chain (audio→image→video, ≥2 models)** is still **0×** — the one genuinely-absent frontier — gated only on your go-ahead for a small paid per-prototype budget (rule #6). One yes unblocks it.
