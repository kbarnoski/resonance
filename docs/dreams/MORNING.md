# Morning digest — last updated 2026-08-09 (cycle 1065, DEEP)

Open the lab: https://getresonance.vercel.app/dream

## New since yesterday
- **[8632-nearfield](/dream/8632-nearfield)** — **DRAW A CRUSHED SOUND NEAR.** A little piano-bell loop arrives *ruined*: band-limited, muffled, thin, and far away — like music heard through a wall. You **hum or sing into the mic**, and your loudness is the "lean-in": the louder you are, the more it's drawn **near**, and it **blooms** into full, vivid, present sound while a dark gauze **veil parts** over a spectral waterfall and the missing highs & lows visibly fill back in. The restoration is real rule-based DSP — a harmonic exciter regenerates the highs, a subharmonic synth rebuilds the body, a tilt-EQ + room pull it from far/wet to near/dry. **No AI, no drug — just the act of un-muffling a sound, made into the instrument.** **Why open it:** it self-plays on load (a seeded ~10s demo cycles far→near on a synthetic spectrogram, so it reads fully on a **muted phone**), then hum at it and watch the veil part.
- *2 more explored this fire, banked as ⭐⭐ seeds in IDEAS §1065* — **`8648-gauze`** (RUB THE GAUZE OFF band-by-band — restore just the highs, or just the lows, with your finger, and hear each frequency band *arrive*; the richest DSP idea) and **`8664-farbell`** (ANSWER a distant bell on the keyboard and each note you play pulls it one step nearer — call it home). Both built clean; curated out on the axes below.

## Why this one (DEEP curate)
- One concept — *restoring a sound IS the instrument* — built three ways: **hum it near** / **wipe it clear** / **answer it near**. `8632` won on **diversity** (it dodges the two loudest standing complaints at once — raw-WebGL2, off the over-used three.js pile, and mic input, off the over-used pointer/tilt), **live-performance fitness** (you vocalize into it — stage-playable, not desk-bound like the other two), and the **most robust muted read** (a synthetic demo that runs before any audio even exists).
- Grounded in this week's research: arXiv:2608.00572 "AnyBand" (Aug 2026, neural bandwidth-extension). The papers treat un-muffling as *offline repair*; nobody makes the restoration a real-time thing you *do*. This does.
- It also opens a register the lab had none of — **presence/restoration** — deliberately off the machine-partner "co-composition" rut of the last several ships and off yesterday's elemental thunder.

## In progress / partial
- None mid-build. `8632` is demoable. Next-cycle deepenings in its README — the biggest: a true pitch-tracker so it restores **arbitrary imported audio**, which means **your real Path piano recordings could be drawn through the veil**.

## Research findings worth a look
- **§1065 (RESEARCH.md):** AnyBand spectral-infilling (arXiv:2608.00572, Aug 2026). The un-built move was to make *restoration a felt VERB*. 8632 does it with pure rule-based DSP (exciter + subharmonic + envelope reshaping), no ML.

## Open questions for Karel
- **Try it with your mic:** does the far→near **bloom** sound dramatic, and does hum-loudness→nearness feel right? The gain/mix constants are reasoned, not ear-tuned — the one thing I couldn't set without your real mic + speakers.
- Want the veil pointed at your **actual Path recordings** next (needs a real pitch-tracker), or ship one of the two banked runners-up (`8648-gauze`, `8664-farbell`) first?
- **STRATEGIC (flagged ~11 cycles):** grep-0 "first-ever technique" novelty is exhausted (I killed 3 concept-dups this cycle before building — synth-inversion, arrangement, auditory-illusions all already exist). Worth formally shifting the ambition bar to reward *fresh verb + scope/fusion + diversity*?
- Long-standing yes/no (~31 cycles): the **AI-pipeline chain** (music→image→video) — fund a `FAL_KEY` budget or strike it permanently?
