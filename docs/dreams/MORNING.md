# Morning digest — last updated 2026-07-28 (cycle 928, WIDE)

> **Why tonight looks different.** The lab had quietly grown *two* ruts at once: in the last 10 pieces, half were psychedelic/cosmic **and** half were "a hand playing an instrument with stakes." So the diversity gate banned *both* vibes and I went **WIDE** into three registers the lab hasn't touched this window — **music about the real world · a piece about memory · an EDM drop** — and shipped the first.

Open the lab: https://getresonance.vercel.app/dream

## New since yesterday
- **[3224-seismic](/dream/3224-seismic)** — **the living Earth plays a slow bell-choir.** Every real recent earthquake becomes a struck resonant voice: **depth sets the pitch** (shallow rings high, 700 km deep rings low), **magnitude sets the ring** (a M6 tolls long and full, a M2 is a soft tick), **longitude pans it** across the field — and a play head sweeps a **24-hour clock**, ringing each quake as it crosses its real origin time. Drag the clock to scrub and you play a stretch of the planet's day by hand. It's "music *about* something" — the register the lab was thinnest on.
  - **Try it:** it opens auto-sweeping the day silently; press **Start audio** and the bells ring. Press **"Load live quakes"** to merge the *real* current USGS feed on top of the baked snapshot (if the network blocks it, it says so and keeps playing the snapshot — it never breaks).
  - **Why I trust it for a silent review:** I can't listen headless, so I measured it — a shallow M6.4 rings at 648 Hz / 4.4 s over 7 partials; a deep M2.8 at 79 Hz / 1.1 s over 3; pan tracks longitude cleanly. And the whole thing runs off a network-free baked snapshot, so it's guaranteed to render.

## Also explored tonight (2 more — banked, IDEAS §928)
Two unrelated directions, both built + headlessly verified, both worth a future ship:
- **3232-decay** ⭐⭐ — **a phrase that *forgets*.** Each note's memory fades on an **Ebbinghaus forgetting curve**; as it fades the sound crushes, drops grains, smears, and finally goes silent — and the only way to keep a note is to **re-affirm** it (spaced-repetition, like flashcards). Play a phrase, then choose what to rehearse; over a minute the loop becomes a portrait of what you paid attention to. **The freshest *technique* in the lab — nothing in 881 prototypes has done this.** Held only because seismic reads faster on a phone.
- **3240-drop** ⭐⭐ — **your journey engine as an EDM build-and-drop.** A generative build (riser, accelerating snare roll, climbing tension) where **you** decide the drop moment — hold it a beat longer for a bigger drop — with a real sidechain pump. This is the alternate journey-arc you asked for. **It's ready to ship — say the word and it goes next cycle.**

## Open questions for Karel
- **3240-drop is the thing you explicitly asked for** (EDM build-and-drop as an alternate arc). I banked it tonight only because WIDE ships the *most surprising* one and seismic won on surprise — but it's built and ready. Want it shipped next cycle?
- **3224-seismic wants your ear.** The mapping is provable, but whether the bells actually *sound* like a gamelan is a real-ear call. Open it, hit "Load live quakes," and tell me if the depth→pitch spread is musical or needs re-tuning.
- **AI-pipeline chains (music→image→video) still 0×** — ~15 juries overdue. The single most novel unbuilt thing, but it spends your FAL_KEY budget, so I won't start it autonomously. **One word ("go, cap $X/run") unblocks it.**

## Housekeeping
- Winner-only compile build passed **EXIT 0** (the container's 4096-fd cap still blocks a full-route local `npm run build` — infra, un-raisable; Vercel deploys the full pipeline fine). Zero new npm deps; no api route (client-side Web Audio + Canvas2D; the live feed is a public CORS endpoint). Losers banked as text, never committed.
- Note: `origin/main` had been force-rebased since last night — I reset local main to it (remote is authoritative) before building, so nothing was lost.
