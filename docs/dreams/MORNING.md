# Morning digest — last updated 2026-07-30 (cycle 954, WIDE)

> **Conjure a chord out of thin air with your hand. Hold a clean, steady, open shape and a rich chord blooms + a cloud of light gathers around your hand; let your fingers go sloppy, shaky, or drift out of frame and the whole thing decoheres — the sound detunes into noise, the light scatters. The *cleanliness of the shape itself* is the instrument.**

Open the lab: https://getresonance.vercel.app/dream

## New since yesterday
- **[3880-conjure](/dream/3880-conjure)** — **the lab's first real hand-in-the-air chord instrument.** Point a webcam at your hand; MediaPipe reads all 21 finger joints *continuously* (not a fixed set of poses). Height sets the chord's pitch (a smooth glide, no scale snapping), spread/pinch voice the upper extensions, palm openness opens the filter. But the whole thing hangs on **coherence** — hold an even, still, open shape and it *conjures*; go sloppy and it *decoheres* into detuned noise while an 18,000-particle field scatters. **Why open it:** it's the first piece where holding a clean gesture is the entire stake (not a button, not a pose ID, not a fail-buzzer), and it cashes two clusters you've loved — camera/body **and** particle-compute — in one piece. No hand or no webcam? A seeded synthetic hand demos it the instant you press Start; no fancy GPU? It falls back to a Canvas2D version of the same thing, so it never shows a dead screen.

## In progress / partial
- **WIDE cycle:** three unrelated *stakes-carrying* pieces built in parallel, each on a sensor the recent nights went cold on (voice, hands, tilt); shipped the strongest. **Two banked runners-up are rebuild-ready (IDEAS §954):**
  - **3896-callback** ⭐⭐ HIGH — **earn a canon from memory.** Hear a short phrase once, *sing it back*, and only an accurate echo commits as a looping layer (a wrong echo frays and you retry). Real pitch-tracking, no snap-to-scale. The cleanest revival of the "a decision you can get wrong" register — my pick to ship next on any non-camera slot.
  - **3904-lodestar** ⭐ — **hunt a room's hidden resonances by tilting your phone.** Six voices hide in an invisible space; sweep a listening beam by tilting and lock each one in. The one piece that gets *better* on your actual phone (real tilt).

## Research findings worth a look
- **§954:** the dive steered off my own recent ruts (three recording-corpus pieces in a row) toward two cold frontiers — **hand-landmark air-instruments** (Air-Hand Piano, IEEE 2026; browser GestureSynth) and **sung pitch-memory** (PitchBench, arXiv 2026). The Resonance flip for conjure: every existing hand-instrument treats the hand as a *pose to classify*; I made the *cleanliness of the shape* the continuous stake instead.

## Open questions for Karel
- **Does coherence *feel* right?** I can't hold up a real hand here — the bloom/decohere logic is sound but the "how clean must my shape be" threshold wants your eye on a real camera. Too twitchy? Too forgiving? Tell me and I'll tune it.
- **Sing-back next, or keep chasing gesture?** callback (sing a phrase back from memory) is banked and ship-ready — want that tonight, or a second hand piece (two-hand conjuring: left hand voices, right hand filters)?
- **Note on the build:** conjure passes the exact checks Vercel runs (type + lint, both clean) and auto-deploys; the full local build can't finish in the sandbox only because of an open-file limit against 900+ pages — the environment, not the piece.
