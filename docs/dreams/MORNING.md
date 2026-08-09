# Morning digest — last updated 2026-08-09 (cycle 1066, WIDE)

Open the lab: https://getresonance.vercel.app/dream

## New since yesterday
- **[8680-dripsong](/dream/8680-dripsong)** — **AUTHOR A WATER-CLOCK.** Touch a still dark pool to place drips; each one sends a ripple and *plinks*. The trick: the plink's pitch is the **real physics of a dripping tap** — a "plink" isn't the splash, it's a tiny air bubble ringing at its Minnaert resonance (bubble size sets pitch; the tone glides *up* as the bubble shrinks). So a **big drop bloops low, a small drop plinks high**, with the genuine rising-chirp. Place several taps at different rates and they weave a shifting, never-quite-repeating polyrhythm — a musical clepsydra you compose. **Why open it:** it self-plays on load (a seeded 4-tap canon rippling on a **muted phone**), then place your own taps and drag to size them. No AI — just the actual acoustics of water, turned into an instrument.
- *2 more explored this fire, banked as seeds in IDEAS §1066* — **⭐⭐⭐ `8696-wireworld`** (WIRE A LOGIC CIRCUIT THAT PLAYS ITSELF — draw wires on a grid, electrons race them and fire notes as they pass; build a self-perpetuating loop and it's a generative sequencer — the freshest idea, resurrect first) and **⭐⭐ `8712-mobile`** (HANG A CALDER MOBILE AND PLAY IT BY LEANING — tilt your phone and a kinetic hanging sculpture sways and chimes; pure DOM/CSS, no canvas). Both built clean; curated out on the axes below.

## Why this one (WIDE curate)
- Three unrelated verbs on three deliberately different **non-GPU** substrates (Canvas / SVG / DOM-CSS) — a clean sweep off the raw-WebGL2 look the last three ships all used, and off the banned three.js. `8680` won on **the research chain** (it's the only lane built from this week's dive), **highest ambition**, the **freshest technique** (physically-modeled plink — grep-0 across 8600+ prototypes), and the tightest coupling (the physics literally *is* the tuning).
- Grounded in this week's research: **SIGGRAPH 2026 Real-Time Live!** showed a MIDI water-droplet impact instrument (July 2026); the physics is the settled Cambridge finding (Phillips & Agarwal 2018) that the plink is an entrained-bubble resonance. The lab has ~30 water/rain pieces but every one just *triggers* a sample — none modeled the actual sound. This one does.

## In progress / partial
- None mid-build. `8680` is demoable. Biggest next-cycle deepening (README): a real 2D wave-pool so the ripples feed *back* into the audio, and **feed your real Path piano as each drop's timbre** — so you'd be dripping *your* sound.

## Research findings worth a look
- **§1066 (RESEARCH.md):** SIGGRAPH-2026 water-droplet interface + Minnaert bubble resonance (f·r ≈ 3.26). The un-built move was to make a drip's *real physics* the tuning system, not a trigger.

## Open questions for Karel
- **Try it:** does the plink read as a real "plink" on your speaker, and does the multi-tap canon feel alive? The physics is right; the mix constants are reasoned, not ear-tuned.
- Two strong banked ideas ready to build next — the **Wireworld circuit-sequencer** (⭐⭐⭐) or the **Calder mobile** (⭐⭐, our first pure-DOM/CSS piece). A preference?
- **STRATEGIC (flagged ~12 cycles):** "first-ever technique" novelty is exhausted (I confirmed 4 grep-0 targets and killed 5 saturated ones this cycle). Formally shift the ambition bar to reward *fresh verb + scope + diversity*?
- Long-standing yes/no (~32 cycles): the **AI-pipeline chain** (music→image→video) — fund a `FAL_KEY` budget or strike it?
