# Morning digest — last updated 2026-07-29 (cycle 944, WIDE)

Open the lab: https://getresonance.vercel.app/dream

## New since yesterday
- **[3608-atlas](https://getresonance.vercel.app/dream/3608-atlas)** — **open this, then move your cursor slowly through the cloud.** A recording becomes a *place you walk through*: every ~46 ms grain of its sound is a glowing point placed by what it *sounds like* (bright grains upper-right, low/warm grains lower-left), and moving through the cloud triggers the grains nearest you — linger in the bright region and it shimmers, dive low and it drones. You're not scrubbing a timeline; you're **playing the recording's own timbre-space**. Then **drop your own audio file anywhere on the page** and the whole instrument rebuilds from *your* sound. Raw-WebGL2 GPU point cloud; it self-tours on load until your first move. Built on corpus-based concatenative synthesis (Schwarz/CataRT — today's research). Agency coming back after a long no-stakes run, and it sits right in the granular/particle/spectral direction you've loved (`227-paths-granular`, `130-particle-compute`, `243-spectral-cloud`).

## In progress / partial
Two other relationships were built + explored this WIDE cycle, then banked (not shipped) — see IDEAS §944:
- **`3616-relay`** — the freshest *relationship* I've banked: a **relay between strangers** — you inherit a phrase, answer it, and your braid rides on to the next person entirely inside a shareable link (no server). It round-trips exactly across 6 generations. Held for **one** fix: its mic path snaps pitch to a pentatonic scale, which trips your protected "no pentatonic net" rule — a small change unblocks it. The one I most want to ship next.
- **`3600-braid`** — a playable **polymetric loom** (MIDI + keyboard): weave rings of coprime lengths that phase into a canon that doesn't fully repeat for ~5 hours. Clean and hypnotic; held only because its Euclidean-rhythm engine overlaps existing pieces.

## Research findings worth a look
- **A recording as a place, not a timeline** (Schwarz/*CataRT*, IRCAM + TENOR 2023 "Maps as Scores"): the instrument *is* the timbre-space you navigate. That's exactly what `3608-atlas` is. (RESEARCH §944.)
- Banked for later: **C&C 2026 "Sound Clouds"** — engineering *awe* in ambient systems with **no interaction** (vastness + slowness). Held because no-stakes/ambient is over-supplied right now (6 of the last 10); queued for when that register cools.

## Open questions for Karel
- **Try `3608-atlas` with your own piano:** drop a Path recording onto it and navigate your own timbre-space — does it *read* as playing your sound? (A clean way to finally cash your real Path music as a live source.)
- **Unblock `3616-relay`?** One yes and I make the mic mapping continuous and ship the stranger-relay — the freshest new *relationship* in the lab.
- **AI-pipeline chain (music→image→video)** is still 0× — ~10th cycle I've flagged it. It spends `FAL_KEY`, so it needs your explicit **go-ahead + per-run $ cap**. One word unblocks it.
