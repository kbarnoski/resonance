# Morning digest — last updated 2026-06-26 (cycle 555, adult · DEEP)

> **Yesterday's jury** (`docs/dreams/JURY.md`) made two big asks: **make music from real PITCH/melody again** — the lab had buried pitch under "drone + texture" boilerplate (#2) — and **stop the GPU monoculture**: three.js is banned, push elsewhere (#1). My diversity audit found the swing-back has gone all the way: **WebGPU and raw-WebGL2 are now BOTH over the cap**, so the only fresh renderer left is plain **Canvas2D**. So tonight: real melody as the whole idea, on Canvas2D, from a direction the lab has never gone.

Open the lab: https://getresonance.vercel.app/dream

## New since yesterday
- **[/dream/952-maqam-calligraphy](/dream/952-maqam-calligraphy)** — **A living Arabic _taqsim_ that improvises itself for ~5½ minutes in exact microtonal cents, and writes itself as a luminous ink-and-gold calligraphic line.** Press Begin (or just watch) and a single ornamented melody wanders the maqam: it opens low at rest, climbs to the pivot, **modulates to a related maqam at the peak**, then descends home — genuinely different at minute 5 than minute 1. *Why open it:* it's the lab's **first non-Western, melodic-modal** piece, and the visual is the payoff — the line is drawn against a faint **12-TET "ghost grid"** so you can literally **see the quarter-tones glow between the piano's cracks**. This is "pitch IS the idea" answered from a place the lab has never been (no chords, no voice-leading engine — pure melodic line + a tanbura drone).

## Explored but not shipped (1 more — banked in IDEAS §555)
- **951-maqam-road ⭐ (resurrect-first)** — the *same* taqsim engine, but the journey is a **road winding through a warm dusk landscape** (sayr literally means "the road"): the road climbs with pitch, each note drops an aging lantern, modulations are forks. Lovely and equally solid — lost only because 952's calligraphy makes the exact cents *visible*, which is the sharper idea. A natural cycle-2 deepening.

## Why this shape (cycle 555)
- **DEEP** (adult alternation: 551 DEEP, 553 WIDE → 555 DEEP). One ambitious concept (a long-form self-modulating microtonal taqsim), two Canvas2D lenses; shipped the one that makes pitch visible.
- Implements **today's** research: a 2026 corpus paper (**AMICOR**, _Language Resources and Evaluation_) notes there's no maqam-*native* microtone synthesis — tools keep rounding maqam to the Western piano grid. So I built the exact-cents, never-rounded engine the literature says is missing.
- Ambition honest **4/5** (lab-first technique + ≥4 subsystems + named refs + dated research). Clears every diversity ban — including the two GPU renderers that just hit the cap.

## Open questions for Karel
- **Verification debt (jury #3) is the loudest open item** — 952 is the ~20th build-green-but-**unheard** prototype (no audio device in the container). It's lower-risk than recent builds (Canvas2D + a plain Web-Audio synth — no WebGPU/model/network), but I still can't confirm the oud/tanbura *sounds* right or that the 5½-min arc paces well. Worth a cycle (or the infra fd-ceiling fix) to actually run 927/942/950/952 on a real device before a 21st unheard build?
- **Does the maqam idea land for you?** If yes, there's a rich multi-cycle thread here: an Iqa' (rhythmic-cycle) mode, a real oud sample-bank, or a "hear what 12-TET throws away" A/B instrument. If it feels too niche, I'll let it stay a one-off.
- **Canvas2D is now the only un-banned renderer** — the GPU monoculture fully inverted in one fortnight. Heads-up that the next few cycles may lean Canvas2D until WebGPU/WebGL2 age out of the audit window.
