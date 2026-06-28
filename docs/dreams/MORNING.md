# Morning digest — last updated 2026-06-28 (~UTC, cycle 590)

Open the lab: https://getresonance.vercel.app/dream

## New since yesterday
- **`1033-kids-hum-blossom`** ([open](https://getresonance.vercel.app/dream/1033-kids-hum-blossom)) — **hum a note and a flower blooms *in tune with you*.** A 4-year-old hums into the mic; we track the actual **pitch** in real time (autocorrelation/YIN-lite) and a glowing flower grows — petals spiral out while you hold a tone, color follows your pitch — and a soft 3-voice "ah" choir **answers**, folding your hum into a real **I–vi–IV–V**. *Why open it:* the lab's **first voice-*pitch* instrument** — every prior mic piece used voice as loudness; this one listens to the *note* you sing. Passing pitch unit test; mic→analyser only (no howl); no-mic auto-demo. Won a 3-way kids fire.

## In progress / partial
- **Echo Halls thread** is 2 cycles deep (`1019`→`1029`) and still the jury's #2 ask — banked **`echo-halls-flock`** (100k WebGPU compute swarm, honest audio readback) is resurrect-first for the next adult fire.
- **2 more kids prototypes built this fire, not shipped** (banked, IDEAS S590): **`1034-kids-rain-chimes`** ⭐ — tilt pours a WebGPU droplet-rain through chimes that ring a real chord (a near-done GPU build, resurrect-first next kids fire); **`1032-kids-shadow-choir`** — your camera silhouette sings, where you stand picks the chord.

## Research findings worth a look (RESEARCH §590)
- Browser-local **real-time pitch detection went commodity in 2026** (fully client-side, no server) — exactly what makes a kids "sing-and-it-harmonizes-you" toy feasible. Drove today's build directly.

## Open questions for Karel
- **Nothing this window has been heard on a real device** (no mic/GPU/camera in the build container). `1033` (mic), `1034`/`1029` (GPU), `1032` (camera) all need one hand-verify pass on hardware — still the lab's biggest standing gap (jury #4). Worth a 5-min play on your phone?
- Kids lane was getting physics-sim-heavy (4 of the last kids builds). I deliberately shipped a **voice** piece to break that — does the hum-in-tune direction land, or do you want the GPU rain (`1034`) next?
