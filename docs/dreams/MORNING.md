# Morning digest — last updated 2026-09-22T01:1xZ (cycle 1253)

> **Jury verdict today**: The lab did exactly what the last three juries ordered — three non-embodied, self-verifying pieces in a row (earthquakes, a take that remembers itself, the ISS overhead) — so today's tone is earned momentum, not alarm; keep the lane, but point the next feed at something human instead of the sky, and let's finally get one of these actually opened. See `docs/dreams/JURY.md`.

> **The non-embodied real-world-data lane now has THREE shots — and this one moves on its own.** After `tremor` (earthquakes) and `strand` (a take remembering itself), tonight I cashed the jury's exact order — "deepen the lane, a second live feed" — and shipped `overhead`: the International Space Station, crossing the sky **right now**, plays one of your real takes as it passes, and you hear it dim and go reverb-distant the instant it slips into Earth's shadow. No camera, no second person; it proves itself before you tap Begin.

Open the lab: https://getresonance.vercel.app/dream

## New since yesterday
- **[17728-overhead](https://getresonance.vercel.app/dream/17728-overhead)** — **the one crewed outpost overhead conducts your piano.** A near-black globe with the live ISS marker tracking its real orbit; its latitude transposes the take, its longitude pans it so the sound orbits your head as it circles the Earth, and crossing the day/night terminator slowly crossfades a bright, present timbre into a dark, low-passed, reverb-wide one — *you hear it pass into night.* **Why open this:** it's alive and moving the moment you look, and it reads on a cold muted glance — the globe already tracks a sample orbit before you even start the audio.

## In progress / partial
- **`17728-overhead` is `demoable`** and self-verifying: the offline synthetic orbit sweeps a full day→night→day pass in ~80s with zero network, so the whole mapping shows on a phone with no permission. The one thing I couldn't confirm from the cloud: whether the live `wheretheiss.at` feed's CORS resolves from the deployed origin (if not, it silently shows the labeled "sample orbit (offline)" and still plays your take) — a 5-second tap tells us which.
- **Two more sky-feed pieces built demoable-clean and banked (IDEAS §1253), one `rm -rf` from shipping:** `firmament` (the sun & moon over *your* location turn the take from a day-voice to a night-voice as they set and rise — minimal SVG on ink, tsc-clean, the boldest diversity move; I'll ship it next) and `aurora` (the geomagnetic storm level of the sky as a slow evolving curtain of your piano).

## Research worth a look
- **2026's living sky emits open, keyless, real-time feeds** — geomagnetic storm level (NOAA Kp), the ISS's exact position, the sun/moon over you — and nobody's using them as a *musical score* for a fixed recording. That's the whole thread: extend `tremor` from the ground to the sky. The design principle (arXiv 2605.21874, 2026) is that a live feed wants *continuous* sound, not discrete triggers — so `overhead` is one gliding voice, not a burst of events.

## Open questions for you
- **Does `overhead` land — does it earn your first vote in weeks?** If it does, the "world/sky feeds" family is real and I deepen it (`firmament` next, then aurora/tides). If it stays flat like the 17xxx run, tell me whether the whole autonomous-feed lane needs a different kind of provocation.
- **Still treating camera-conducting as closed** unless you re-open it — say the word either way.
