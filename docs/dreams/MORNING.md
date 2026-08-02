# Morning digest — last updated 2026-08-02 ~02:15 UTC (cycle 985, DEEP fire)

> **Tonight I finally built the room.** For weeks the jury has said the same thing —
> *"the spatial/installation lane is a graveyard of banked ideas; either build the room
> or stop banking it."* So this DEEP is a **room you cross, not a screen you watch**: a
> boundless dark cathedral where a choir of eight voices is spatialized in a full sphere
> around your head (true HRTF binaural), and you drift from a scattered dark **void**,
> down a **tunnel**, into a warm **light** that pulls all the voices into a single chord.
> Turn your head (or drag) and the whole sound-field swings around you. It's a drug-free
> **near-death threshold** — cosmic-ambient, not intense — reviving the psychedelic
> direction on the calm pole. **Headphones make it; but the visuals tell the whole story
> silently too.**

## New since yesterday — open this first
- **[5048-narthex](https://getresonance.vercel.app/dream/5048-narthex)** — *a room you
  cross, not a screen you watch.* **Self-demos on load** (a seeded ~13s descent plays the
  full void→tunnel→light journey hands-free, so you see the arc even on a silent phone).
  Press **Enter** for sound; then **put on headphones** and turn your head (iOS) or
  drag to look around — the choir is placed in 3-D space around you and swings as you turn.
  *Why open it: it's the lab's **first shipped "room you inhabit"** — the spatial/installation
  lane you kept flagging is finally built, not banked. This is `5016-vestibule` reborn (the
  one I said I'd resurrect first).* Canvas2D — always paints, no GPU needed.
- **2 more built + banked** (DEEP — three technical approaches to the same room; IDEAS §985):
  - **`5064-cupola` ⭐⭐ (resurrect first)** — the most ambitious of the three: you *hear the
    room change as you move* — a live moving-listener acoustic model recomputes the reverb
    per position (boxy → vast → infinite-bright) as you fall down a WebGL2 tunnel. It's the
    direct build of today's research; held only because WebGL2 is over-used lately and its
    payoff needs real GPU + headphones to judge.
  - **`5080-antechamber` ⭐⭐** — the room that **senses you're there** via the camera (raw
    motion, no face/pose ML): lean toward it and you're drawn toward the light. The
    installation reading of "build the room."

## Under the hood (worth noting)
- Research chain: RESEARCH §985 read **PathRIR (arXiv:2607.23293, 28 Jul 2026)** — new work
  making a room's acoustic signature fast enough to recompute *as a listener moves*, so a room
  stops being a fixed reverb and becomes a place you inhabit. The winner leans on it (cosmic
  cathedral reverb); the banked `5064-cupola` implements the moving-listener model literally.
- Honest note: HRTF `PannerNode`s + Canvas2D are known primitives (and `42-binaural` is a lab
  prior) — no technique-novelty claim. The fresh thing is that **this is the first room-you-inhabit
  the lab has ever shipped** (the whole spatial lane was banked, never built), plus the direct
  research chain and reviving psychedelic on the **cosmic-ambient** pole (last two were intense).
- No network, no API route, no mic — HRTF audio + Canvas2D + optional phone head-tracking only.

## Open questions for Karel (yes/no — blocked on you, not the agent)
- **AI-pipeline chain** (music→image→video) — flagged ~13 cycles + every jury: **fund a
  per-prototype `FAL_KEY` budget and build it, or strike it from the queue permanently?**
- **Did the room land?** `5048-narthex` is best on headphones. If the spatial choir works for you,
  the next move is to fold in `5064-cupola`'s moving-acoustics so the *room itself* re-renders as
  you cross it (not just the voices) — worth a DEEP deepening cycle?
- **Real two-device WebRTC** room + **depth-camera** spatial-audio room — still want these, or park?

*Ledger: WIDE due next fire (983 D · 984 W · 985 D → 986 WIDE). Both jury-named DEEP peaks
(`4520-seismarium`, `4776-contour`) stay extended; tonight cashed the jury's OTHER most-repeated
provocation — the spatial/"room" graveyard is finally shipped, not banked. Watch: WebGL2 is 2×
recent (982/984) and banked-ready via `5064` — rest it a beat before the next GPU piece.*
