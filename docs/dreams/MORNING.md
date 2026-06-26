# Morning digest — last updated 2026-06-26 ~20:30 UTC (cycle 565, adult · DEEP)

> **Yesterday's jury** asked (provocation #2): *"make the SOUND the primary object — the resonating body — not a GPU sim you pulse a bell off of."* This adult cycle answers it the most literal way I could find: an instrument where the picture **is** the oscillator. See `docs/dreams/JURY.md`.

Open the lab: https://getresonance.vercel.app/dream

## New since yesterday
- **`973-wave-terrain`** ([open it](https://getresonance.vercel.app/dream/973-wave-terrain)) — **the glowing 3D landscape you SEE is literally the sound you HEAR.** An orbit traces a closed path over a height-terrain; the height under it, read at audio rate over one loop, *is* one period of the waveform. So **reshape the land → you sculpt the timbre**, and **spin the orbit faster (play a higher key) → a higher note** — same shape, new pitch. **Why open it:** it's the lab's *first* wave-terrain synth (grep-verified 0×), and it's the directest answer to the jury's "make the sound the object" ask — the terrain isn't a screensaver you read a pitch off, the terrain *is* the oscillator. Play it from the **computer keyboard** (`A–L`/`Q–P` = D-Dorian; `1–5` swap 5 terrain presets = 5 timbres; `[ ]`/arrows reshape the orbit; `M` morphs the land so the timbre slowly evolves) — no mouse, no hardware needed. Wait ~3s and it auto-demos. Grounded in today's dive (RESEARCH §565): wave-terrain is having a 2025–2026 commercial revival (Scaler *Carbon Electra 2*, May 28 2026; Conductive Labs *Terrain* hardware, 2025) yet there's no free browser version — this is that.

## Why this one, this morning
Of two approaches to the same concept, the WebGL2 3D-landscape version shipped over the Canvas2D contour-map version because it's the more *spectacular* realization of "the landscape is the sound" and the stronger non-cosmic register (bronze-relief topographic — jury #5). Both clear the ambition floor 4/5. Note: I burned the first part of the cycle discovering that three obvious "lab-first" picks weren't — `468-kids-bottle-flute` already does the blown waveguide flute, `808-sympathetic-strings` already exists, scanned synthesis is already here — so wave-terrain is the genuinely new one, and it also dodges both currently-hot lanes (functional harmony from 969/972; single-body physical models from 960/970).

## Also explored tonight (banked, not shipped — full seed in IDEAS §565)
- **`974-wave-terrain-map`** ⭐ — the **provable Canvas2D twin**: a top-down contour map with the orbit drawn over it AND a side-by-side **scope** showing the exact carved waveform + spectrum, so you can literally *see* "this loop over this terrain = this waveform = this sound." Bulletproof-everywhere render — the natural phone/installation surface. Resurrect-first, or fold its scope panel into 973 as a toggle.

## Open questions for Karel
- **Verification debt is still the jury's #1 standing liability** (~19 builds now green-by-compile, ~0 actually heard — no audio device in my sandbox; Vercel deploys fine). Good news: **973 is keyboard-only and hearable on any laptop** (like 970-gong) — no mic/camera/GPU-compute needed. **Want me to spend the next cycle hand-verifying the strongest hearable builds (973, 970, then 942/952/960) instead of shipping a 20th unheard one?**
- A natural wave-terrain cycle-2: let you **upload a PNG as the terrain** (à la Carbon Electra 2), or trace your initials / a piano shape into the surface so it spins and sings. Want that next, or the verification pass first?
