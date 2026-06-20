# Morning digest — last updated 2026-06-20 ~14:00 UTC · cycle 490

**Open first:** https://getresonance.vercel.app/dream

## New since yesterday
- **[773-kids-parade-caller](https://getresonance.vercel.app/dream/773-kids-parade-caller)** 🥁🎤 (kids, 4+) — **Say a word, hear a parade.** A 4-year-old says "el-e-phant" and it marches in as a 3-hit drum gallop; "cat" is one big BOOM; "but-ter-fly" trips along in triplets. Each word's **syllable rhythm** (not its pitch) becomes a looping percussion pattern, and words pile up into a bright daytime parade band you build just by talking. **Why open it:** it's the first time the lab uses speech as *rhythm* — every earlier "say a word" piece (752, 570) turned words into pentatonic *notes*; this turns them into a *beat* (the konnakol idea — spoken syllables ARE the rhythm, taught to kids from age 3). Bright, loud, exuberant — the active/joyful kids register the jury asked for, not another solemn glow. On a silent glance it auto-parades on its own; tap **🎤 Tap & talk** to add your own words, or use the picture-word buttons if the mic's shy.
- *2 more bright/active kids directions built + banked — an SVG **Marble Symphony** (`774`, drop marbles down a Wintergatan-style machine, gravity rings the bells) and a Canvas2D **Stamp Band** (`775`, stamp characters on a grid a playhead sweeps into a looping song, à la Toshio Iwai's *Electroplankton*). See IDEAS §490.*

## In progress / partial
- Nothing mid-build. Kids **WIDE** fire: 3 unrelated bright/active directions in parallel (speech-rhythm / marble-physics / step-sequencer), shipped the most surprising — speech-as-rhythm, the one bound to today's research — and banked 2 as seeds.

## Research findings worth a look
- **Konnakol = spoken syllables ARE percussion**, and it's a *children's* rhythm pedagogy (the SaPa academy starts 3-year-olds on "Indian beatboxing"). The grep that anchored it: the lab already runs live speech recognition in two kids pieces — but **both map words to pitch; none ever to rhythm.** So "your word's syllables become a drum pattern" is a genuine lab-first, and it lands off the grain-cloud and off the GPU-shader field in one move. (RESEARCH §490.)

## Open questions for Karel
- **Still the renderer/infra constraint.** GPU-shader-fields are jury-banned, so this kids fire deliberately used **Canvas2D** (winner) and **SVG/DOM** (the banked marble machine) — both the scarce renderers the jury wants. Same standing question from the last few fires: keep pushing the thin lanes (SVG/DOM, audio-first, physics), or lift the GPU-shader ban to reopen the visual lane? Picking one unblocks the rotation.
- **Kids resurrect-first:** **`774-kids-marble-symphony`** ⭐ — SVG/DOM physics marble machine, the scarcest renderer, love-aligned to your loved `169-kids-marble-run`, runs on a phone with zero permissions. **Adult next (cycle 491):** the jury's depth ask — return to extend a ceiling nobody has (`734-tape-erosion` live-input cycle-2, or `729-portal` to 3+ players).
- Standing infra: the dream build still can't run Next static-gen in this container (4096 fd ceiling — pristine main fails identically at the same `next-font-manifest.json` open). Compile + lint + types verified green every fire; Vercel deploys fine. The fix is raising the container ulimit, not code.
