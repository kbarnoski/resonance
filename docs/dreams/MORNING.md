# Morning digest — last updated 2026-06-23 (cycle 522, kids · WIDE)

## New since yesterday
- **[/dream/866-kids-rainstick-sky](/dream/866-kids-rainstick-sky)** — **Rainstick Sky.** A 4-year-old gently **shakes the tablet like a rainstick** and a calm rain of warm pentatonic chimes falls; **hold still** and it settles into a sleepy drone of slowly drifting glowing stars. **Why open it:** it's the **calm bedtime kids piece the jury keeps asking for** — 7 of the last 8 kids builds were bright/warm-active, only one was calm; this resets the balance. The clever bit: shaking changes **only how *much* rain falls, never how *loud* or harsh** — a hard shake just makes more soft drops. That bounded mapping IS the safety ("auditable safe envelope," from a Feb-2026 paper on music for sensory-sensitive kids). The rain is 60,000 particles computed on the GPU (**WebGPU compute** — the scarcest surface in the lab, exactly the one the jury wants more of). **No setup for your 06:30 glance** — with no accelerometer it auto-rains and chimes on its own within a second, and falls back from WebGPU → WebGL2 → audio-only so it never dies.

## How this cycle was run
- **WIDE mode** — 3 orthogonal kids explorers built in parallel, each on a GPU surface (Canvas2D is hard-banned; raw-WebGL2 hit its over-use cap), each on a *different* off-touch/off-mic input. Shipped the strongest, banked the other two.
- I **did not** resurrect the queued `863-solfege-choir` — it's a second solfège piece right after last night's `862`, exactly the "too similar" trap. Went wide with fresh directions instead.
- Today's research grounded the calm piece: **arXiv 2602.22813 (Feb 2026)** formalizes the "safe envelope" we've used as boilerplate on every kids build for ~40 cycles — and makes that bounded input→output mapping the *centerpiece*, not a footnote.

## Banked siblings (see IDEAS §522) — both built complete + verified clean
- `867-kids-shadow-zoo` ⭐ — conduct a zoo of glowing creatures with your **whole body** in front of the camera (frame-difference motion, no landmarks — a flailing toddler is the ideal user). Myron Krueger *Videoplace*. **Top kids resurrect-first** (de-selected only on three.js over-use + camera-dependence).
- `868-kids-monster-keys` — every chromatic note plays, and a **dissonant clash becomes a friendly wobble-monster you *calm*** by adding a consonant note (real tension→resolution, no fail state). This is the directest answer yet to the jury's "give a kid the freedom to be **wrong**" ask (#3) — worth resurrecting soon.

## Open questions for Karel
- 866 is **device-unverified** here (no accelerometer/GPU/audio in the sandbox) — worth a shake on a real iPad to confirm the shake→density feel and that the rain reads as *calming* rather than busy; the `densityToRate` cap and droplet decay are the likeliest things to nudge.
- Two open jury threads are now both addressable from the bank: **#3 freedom-to-be-wrong** (ship `868`) and **#2 depth-camera / spatial-audio room** (still 0×; `852-motet-room-walk` is the nearest candidate). Which do you want next?
- Renderer watch: **WebGPU is back on the board** (859 → 866). WebGL2 was at its cap; three.js and WebGPU are the surfaces to favor next.
