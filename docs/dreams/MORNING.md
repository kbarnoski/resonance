# Morning digest — last updated 2026-08-03 (cycle 999, WIDE fire)

**Open first:** [/dream/5720-lattice](https://getresonance.vercel.app/dream/5720-lattice) — press **Start** and watch (or plug in a MIDI keyboard and play). Every note lights a point in a slowly-rotating **3D crystal of pitch-space**, and the magic is that **you can see the shape of a chord**: a triad snaps into a small compact triangle, a dissonance spreads into a stretched polygon, and a bright marker glides through the crystal **naming the key you're in**. The demo deliberately plays a ii–V–I so you watch spread seventh-chord shapes *resolve* into a tidy C-major triangle. Reads fully on a silent phone; sound on = clean plucked synth.

## New since yesterday
- **`5720-lattice`** *(shipped — WIDE winner)* — a real-time **tonal microscope** built on **Elaine Chew's Spiral Array** (a real music-theory model where pitches wind up a helix so fifths are neighbours and a triad becomes a compact triangle). The bright drifting dot is Chew's actual **center-of-effect** key-finder. It's **MIDI-first** — the jury's most-named "starved input" (MIDI shipped once and was a standout) — so it's genuinely playable live at the piano: plug in a keyboard and watch your harmony become geometry. Freshest *subject* the lab has taken on in a while, and fully legible on a silent phone (auto-rotates, auto-demos, names each chord's shape + your key).
- **2 more directions explored this fire, banked (see IDEAS §999):**
  - **`5736-globe`** ⭐⭐ *(resurrect first)* — **the planet as an instrument**: a dark WebGL2 globe with 12 real cities as glowing points, each a voice tuned to that city's **live weather right now** (temp→pitch, day/night→octave, humidity→timbre, wind→shimmer), held as a placid always-consonant chord. Click a city to solo it and read its real numbers. Degrades to a baked snapshot offline, so it works even headless. The strongest *range* statement of the three — a piece about the real world.
  - **`5752-grains`** ⭐ — a **GPU granular cloud** that shatters your piano into 4096 grains of microsound (three.js WebGPU renderer with automatic WebGL-fallback so it runs on any phone). This is the research anchor this cycle (see below) — it *renders* everywhere, but its GPU-compute path still wants a real-GPU test drive.

## In progress / partial
- Nothing half-built. One clean WIDE commit; the two runners-up are banked as full briefs (built-clean, then removed), not code.

## Research findings worth a look
- **§999:** the browser GPU-compute lane went **production-real in 2026** — three.js's `WebGPURenderer` + TSL compute, crucially with an **automatic WebGL2 fallback**. That quietly kills our oldest excuse: WebGPU pieces have been banked for *dozens* of cycles as "can't verify headless, wait for a real-GPU slot." With the fallback, a GPU piece renders on the exact phone you review from. `5752-grains` proves the render path works everywhere; the compute kernel itself is the one thing still needing your GPU to confirm.

## Open questions for Karel
- **Stepped back off psychedelic this cycle** (per my own "don't stack" rule after last night's `5688`). `5720` is deliberately analytical/harmonic. Say the word if you'd rather I lean back into altered-states sooner.
- **Which runner-up next?** `5736-globe` (the live-weather planet) is ready to ship as-is; `5752-grains` wants a real-GPU review to unlock its compute path. Preference?
- **Standing yes/no (flagged ~20 cycles):** the **AI-pipeline chain** (music→image→video) — fund a `FAL_KEY` budget so I can build it, or strike it permanently? The jury wants this resolved either way.
