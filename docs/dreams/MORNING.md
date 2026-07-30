# Morning digest — last updated 2026-07-30 (cycle 953, WIDE)

> **Last night opened a whole category the lab had never touched in ~950 pieces: sonifying live data from *outside the room*. Every prototype so far makes sound from mic / camera / keys / a dropped file. This one lets the *world itself* be the score — and the first world I reached for was the planet.**

Open the lab: https://getresonance.vercel.app/dream

## New since yesterday
- **[3856-terra](/dream/3856-terra)** — **the living planet is the score.** A slowly spinning globe replays the **real last hour of global earthquakes** (live USGS feed) compressed into ~90 seconds. Each quake blooms a shockwave ring where it actually happened and strikes a bell — **bigger = louder + longer ring-out, deeper = darker, and it pans across the stereo field by longitude** (a Japan quake rings on your right, California on your left). A drone swells on busy minutes and hushes on quiet ones. **Why open it:** it's real data from *right now* — the Earth as an instrument — and it's the first time the lab has ever let an external live stream be the music. Drag to spin it; the slider scrubs the replay speed. It self-demos with a seeded synthetic quake field the instant it loads, so it works even with no network. Reference: the Hayden Planetarium's *Seismic Sound Lab*.

## In progress / partial
- **WIDE cycle:** one idea (*live external data as the living score*), three unrelated sources built in parallel, shipped the strongest. **Two banked runners-up are rebuild-ready (IDEAS §953) — this category has at least 3 great pieces in it:**
  - **3888-aurora** ⭐⭐ HIGH — the live **solar wind + geomagnetic storm** (real NOAA space-weather) plays a cosmic-ambient **aurora** you sink into, drug-free (WebGPU, slow, no strobe). *This is the one that most directly serves your psychedelic / cosmic-ambient direction — my pick to ship next.*
  - **3872-babel** ⭐ — **hear the whole world editing Wikipedia in real time**: every edit on Earth becomes a pluck (adds = bells, deletes = darker strings, bots hum underneath, each language its own timbre), drifting as an SVG constellation. Reimagines Hatnote's classic "Listen to Wikipedia" on our palette.

## Research findings worth a look
- **§953:** the dive found the *gap*, not a gadget — the lab has sonified mic/camera/keys/files but **never an external real-time stream**, and 2026 is full of them: **Helioradar AV** (live space-weather → sound+light, Feb 2026), the **Seismic Sound Lab** (the Earth as acoustic space), Hatnote's **Listen to Wikipedia**. Framed by **SIGGRAPH Real-Time Live! 2026** (Jul 21, 9 days ago). The category *is* the finding — terra is its first cash.

## Open questions for Karel
- **Which live world next?** I banked aurora (space weather) and babel (Wikipedia edits) and could ship either tonight. Aurora fits your cosmic-ambient direction best — want that as the follow-up, or a different stream (weather, ISS passes, ocean tides, a market's heartbeat)?
- **Should the world play *your* piano?** The obvious deepening: pipe a live stream through one of your Path tracks as the carrier, so the earthquakes (or the solar wind) are voiced by your own recording instead of a synth bell.
- **Note on the build:** terra passes the exact checks Vercel runs (type + lint, both clean) and auto-deploys; a full local build can't finish in the sandbox purely because of an open-file limit against 900+ pages (the current live code hits the same limit locally — it's the environment, not the piece).
