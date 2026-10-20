# Morning digest — last updated 2026-10-20T13:26Z

> **New verb, answering this morning's jury.** Today's verdict (`docs/dreams/JURY.md`) said the last two fires were the *same* HRTF-spatial move, both declining a lab-first — and asked for three things: point the next research dive at a **non-spatial** target (it named *source separation*), **stack #1+#5 together**, and refuse a third spatial-HRTF piece. This fire does all three: a brand-new musical idea — pulling a recording *apart* into two layers — that's the lab's first-ever source separation (#1) *and* implements a paper posted yesterday (#5). Honest caveat: it's still raw-WebGL2 (the jury's new watch), but a completely different engine (living-ink reaction-diffusion, not a spatial swarm), so it changes the verb and the ambition, not just repaints the move.

## New since yesterday
- **`23120-sever` — reach in and pull the *ringing* apart from the *hammers*.** One of your takes is separated — once, at load — into two living layers: the sustained **resonance** and the hammer **attacks**.
  - **Pull your two hands apart** (or drag right) and the two layers cleave — in volume, and the attacks start drifting in time against the sustain. Bring your hands together and they fuse back into the original. **Raise your hands** (or drag up) to brighten the ringing.
  - The split is *visible*: a reaction-diffusion field (think living ink) where the sustain spreads smooth fronts and every hammer-hit injects a ripple — and your hands cleave the whole field into two territories.
  - Under the hood it's a real **harmonic/percussive separation** (a hand-written FFT doing median-filter HPSS) — the first time the lab has ever *separated* one of your recordings instead of just transforming it.
- **Why open it:** press **Separate & play** (a few-second one-time pass), then **drag the mouse** — the whole thing works with no webcam. With a camera, show both hands and pull them apart.
- **status: demoable.** Fully playable with the mouse; the two-hand camera path wants your ~30-second check (I can't point a webcam at myself up here).

## The "huh" (today's research)
- The dive hit a **paper submitted yesterday** — *D-Composer* (arXiv:2610.22535, 19 Oct), on decomposing a recording into its separate sound events. The lab has 1,150+ protos that *transform* your music but not one that **pulls it apart into layers** — so I built that, with the classic median-filter HPSS algorithm. That's a genuine lab-first **and** a fresh research anchor in one piece — two of the three hard "ambition" axes the jury says nothing in weeks has combined. (Still short the third, multi-cycle — that's the next summit.)
- **3 directions explored, 1 shipped.** Both runners-up are banked in IDEAS and are strong near-future ships:
  - **`skein`** — your whole body is a *loom*: arm-span pulls melodic strands taut and they sound, re-weaving the piece into an SVG tapestry.
  - **`mien`** — your **face** conducts: *smile* warms the harmony toward major, *brows* lift the register, *jaw* swells the dynamics. This is the "genuinely new sensor" you've been wanting — held back only because it uses three.js, which has run a few fires in a row.

## Open questions (decisions are yours)
1. **~30-second webcam check:** open `/dream/23120-sever`, Separate & play, then with a camera pull both hands apart. Does the span map cleanly to the cleave, and does the brightness-on-reach feel right? The one thing I can't verify from the cloud.
2. **Want the face one (`mien`) next?** It's built and banked — the clearest "new sensor" in the queue. Say the word and I'll ship it (after three.js rests a fire).
3. **Still open — the "stack 4" summit:** a build that's a lab-first (#1) *and* multi-cycle (#4) *and* on a fresh ≤14-day paper (#5) at once. This fire bagged #1+#5 together; a deliberate 2–3 cycle build could finally land all three. Want me to aim the next ambitious arc there?
