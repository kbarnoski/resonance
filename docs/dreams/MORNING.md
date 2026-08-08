# Morning digest — last updated 2026-08-08 (cycle 1063, DEEP)

Open the lab: https://getresonance.vercel.app/dream

## New since yesterday
- **[8568-wavehall](/dream/8568-wavehall)** — **SEE a cast phrase travel a hall.** A top-down architectural cross-section (raw WebGL2, hand-written GLSL) where the note you play becomes a **visible acoustic wavefront** that sweeps the plan, reflects off the walls (image-source method), and fires an **HRTF-spatialized tap the instant the front reaches each surface** — so you *see* the sound hit the far wall and *hear* it arrive from that direction. A partner across the hall **answers** in a contrasting timbre (a transform of your call), the two of you trading phrases the room carries between you — **never locking** (antiphony, not entrainment). **Why open it:** it self-plays on load with zero permissions (a seeded ghost calls-and-answers), reads fully on a **muted phone**, then hand it a 2nd tab (`?room=`) for a real duet. The room's impulse response made both visible and audible — the architecture IS the delay line. Graphite + amber/teal, **no violet, no drone** (deliberately off the house style the jury flagged).
- *2 more explored this fire, banked as ⭐⭐ seeds in IDEAS §1063* — **`8552-vaultduet`** (three.js real 3D **stone hall** you stand inside; HRTF whispering-gallery circling the dome) and **`8536-antiphonhall`** (pure DOM/SVG, the phone-perfect zero-GPU version — the most robust **two-tab test** you can try right now). Both built clean; curated out on the axes below.

## Why this one (DEEP curate)
- One concept — *two strangers trade phrases across a shared resonant hall; the architecture is the delay line; never lock* — raced across **3 substrates**. `8568` won on **surprise** (the visible wavefront is the freshest image), **muted-review fitness** (its payoff is visual, not headphone-dependent), and **output diversity** — three.js is the jury's #1 over-representation right now (5×), so even 8552's beautiful stone hall reads as "another three.js piece"; 8568's raw-WebGL2 is off that pile.
- **This closes two of the jury's loudest still-open asks in one fire:** the *second* co-presence piece (as call-and-response, not entrainment) **and** a *true spatial-audio room*. The lab now has two shipped co-presence pieces (`7912` entrainment + `8568` antiphony) — the "one-off" critique is answered.

## In progress / partial
- None mid-build. `8568` is demoable; next-cycle deepenings (a moveable listener you drag to re-spatialize live, 2nd-order reflections + apsidal foci, a motif-memory ghost, a real cross-machine WebRTC relay) are in its README.

## Research findings worth a look
- **§1063 (RESEARCH.md):** HRTFformer (arXiv:2510.01891) + the ASAudio spatial-audio survey (arXiv:2508.10924) — the 2026 frontier is perfecting the per-ear HRTF *filter* for **one passive listener**; the un-built move is **two networked ears in one shared acoustic where the room is the instrument they trade across**. 8568 implements that directly (with the generic Web Audio HRTF; a personalized/uploaded HRTF is the named next step).

## Open questions for Karel
- **Try the duet:** open `/dream/8568-wavehall` in two tabs (add `?room=nave` to both) — does the call-and-response *read* as two people answering across a room? On headphones, do the wall-arrivals localize? (I could only self-review it muted + single-tab.)
- Still-open jury asks I banked rather than shipped: the immersive three.js **stone hall** (`8552`, wants headphones) and the WebRTC relay so two *different machines* (not two tabs) share a hall. Want the cross-machine relay next, or push a different lane?
- Long-standing yes/no (flagged ~29 cycles): the **AI-pipeline chain** (music→image→video) — fund a `FAL_KEY` budget or strike it permanently?
