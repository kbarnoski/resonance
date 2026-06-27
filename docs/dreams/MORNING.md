# Morning digest — last updated 2026-06-27 (~16:15 UTC)

> **Jury verdict (2026-06-27)**: the lab fixed the old ruts but settled into new ones — the adult lane ran one "explainable-inverse-of-a-neural-frontier" formula four times, and **977-echo-room-gpu** (walk among HRTF-spatialized recordings of your past selves) was the only 5/5 yet nothing extended it. Two loudest asks: *extend 977 into a multi-cycle spatial instrument* and *retire the formula — do pure timbre / spatial presence, on a real GPU path*. See `docs/dreams/JURY.md`.

Cycle 575 · **adult** · DEEP (3 walk-the-room explorers, orchestrated). Shipped 1, banked 2. **This fire answers the jury head-on: it extends 977 into a walkable tuned space and is pure standing-wave timbre — no harmony explainer, on a WebGPU path.**

## New since yesterday
- **[/dream/992-dream-house](https://getresonance.vercel.app/dream/992-dream-house)** — *Dream House.* **Walk your body through a field of sustained just-intoned sine drones — move even slightly and some overtones bloom while others fade, so the music is pure standing-wave timbre you sculpt with your position. No notes, no wrong notes.**
  - *Why it's different:* a deliberate browser port of **La Monte Young & Marian Zazeela's _Dream House_** — the real installation is on view at the MELA Foundation in TriBeCa *right now, through 2026-06-21* — and the DEEP extension of 977 the jury asked for. Eight permanently-running sine oscillators at pure just ratios over a body-felt ~72.6 Hz root; your position sets each partial's loudness by proximity to its spatial "well," detuned twins shimmer as you move, and an HRTF field re-pans the whole drone around you as you walk among the sources. It is the jury's "pure timbre / spatial presence" answer — zero harmony-explaining — on the scarce, encouraged **WebGPU** path.
  - *Try it:* tap to enter — it auto-starts a drone and slowly drifts, so it's already sounding at a glance; then **move your pointer (or "Start camera" for full-body pose)** and listen to the overtones rebalance. Best with headphones for the HRTF.
  - *Love-aware:* pulled by `148-spatial-palette`❤️, `107-ocean-presence`❤️, `243-spectral-cloud`❤️ — spatial-presence + spectral.

## Also explored (banked, not shipped — IDEAS §575)
- **991-dream-rooms** ⭐ RESURRECT-FIRST (adult) — a song as a **building**: a 3×3 circle-of-fifths floor plan where **walking through a doorway is a real key modulation**, your ghost loops live in the room where you made them (muffled "through the walls" until you enter), and a top-down operator map shows the whole building. The most literal "extend 977 into a room you walk between."
- **993-resonant-halls** — a cruciform **cathedral where each hall has its own acoustics**: a procedurally-synthesised convolution reverb + tuned room modes per space, so the same voice changes sound as you cross a doorway. The room itself is the instrument. (Heaviest/riskiest unheard — 5 parallel convolvers — so banked for a tuned revival.)

## Research finding worth a look (RESEARCH §575)
- **La Monte Young & Marian Zazeela's _Dream House_ is on view at the MELA Foundation (TriBeCa) through 2026-06-21** — a 32-tone just-intoned sine-drone + magenta-light environment where "the sound changes with where you stand: move six inches and one frequency blooms while another fades." That live show drove this whole fire (with Cardiff's _Forty Part Motet_ as companion).

## Open questions for Karel
- **992 wants a real-device listen with headphones** — the just-intonation beating, well width, and HRTF panning are reasoned but not yet heard. One play would let me tune them.
- **Next adult step (multi-cycle 977 thread):** make 992 an actual *building* — fold in 991's walk-between-rooms + doorway modulation and 993's per-room reverb, plus 977's record/replay ghosts, and add a Tauri/installation operator map. Want me to push that next, or deepen one of the banked siblings first?
- Two infra fixes still need you: (a) raise the container ~4096-fd ceiling so Next static-gen runs locally, or (b) a hand-verify pass on a real GPU+camera device. Everything builds green + Vercel-deploys.
