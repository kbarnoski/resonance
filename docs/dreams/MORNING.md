# Morning digest — last updated 2026-07-02 ~14:20 UTC (cycle 634)

> **Yesterday's jury (2026-07-02)** said the lab is ossifying into "tap a dark GPU field and hear it sing" (tap 6×, GPU-shader 10×, black-void ~13/15) and named the cure: **break the input, the palette, and the void** — specifically, ship the MIDI chromesthesia color-organ, cash the dichotic piece, and mandate a non-black palette. This cycle does all three. See `docs/dreams/JURY.md`.

Psychedelic era · adult · kids paused. Cycle 634 was **WIDE** — 3 explorers, each cashing a jury provocation on a different fresh input × output × palette; ship the most Karel-serving.

## New since yesterday
- **⭐ `/dream/1107-chromatic-organ`** — *a live chromesthesia color-organ you play.* Press ▶, then play the computer keys (`A S D F G H J K` white, `W E T Y U` black, `Z`/`X` octave) or plug in a **MIDI keyboard** — every pitch bursts into its **Scriabin colour** (his 1910 *clavier à lumières* mapping) and **polyphony interferes into shimmering moiré**, all on a **warm paper-white daylight ground** (pigment on a page, not glow on black). One note drives both an FM voice and the shader, so sound and colour can't drift apart. *Why open it:* it's the **first piece in weeks you can actually _play_** — a live-performance instrument for a pianist — and it deliberately breaks the lab's black-void house style. Leave it idle 4s and it plays itself. **It wants your hands: does it feel playable, and does a chord shimmer?**

## In progress / partial (banked, not shipped — see IDEAS §634)
- **⭐ `1108-two-ears`** — *the music that exists only in your head.* Diana Deutsch's **dichotic illusions** (octave / scale / tritone) via strict per-ear routing — put on headphones and most of what you hear is in neither earbud. **Audio-first, zero-GPU, paper-white diagram** — the jury's explicitly-named next ship (it fixes the *output* monotony harder than anything). Built complete; banked only because 1107 reads better at a glance (dichotic needs headphones). **Say the word and it ships next.**
- **`1109-oceanic-breath`** — *breathe yourself into an altered state.* Fast **breathwork** (à la Grof; grounded in a PLOS One study, Aug 2025) drives a warm-dawn bloom + swelling drone toward "oceanic boundlessness." Boldest warm-palette break of the three; banked because its output is Canvas2D (on the ban list) — needs a WebGL rework, then it ships.

## Research findings worth a look (RESEARCH §634)
- The dive corroborated the jury's two named cures — **Deutsch's dichotic illusions** (the sound is manufactured *in the listener*) and **Scriabin's chromesthesia** — and turned up a fresh one: **Fincham et al., PLOS One (27 Aug 2025)** — high-ventilation breathwork's altered-state intensity tracks **CO₂ drop**, and it's the *breathing*, not the music, that carries the state (→ seeded 1109).

## Open questions for Karel
- **Ship `1108-two-ears` next?** It's the jury's #1 remaining move (audio-first, breaks output+palette at once), built and clean — just needs a green light + your ears on real headphones.
- **`1107` wants your hands** — plug in a MIDI keyboard if you have one; does velocity + polyphony feel like an instrument, or a toy?
- **Standing verification debt:** live-MIDI/GPU/audio pieces still can't be hardware-verified in this box; raising the container's ~4096-fd ceiling (or a hardware pass) is the recurring Karel-only fix.
