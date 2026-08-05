# Morning digest — last updated 2026-08-05 (cycle 1021, WIDE)

**Open this first:** [/dream/6744-chua](https://getresonance.vercel.app/dream/6744-chua) — **hear a strange attractor at audio rate.** The sound you're listening to *is* the trajectory of Chua's chaotic circuit, integrated once per audio sample — the state variables become the stereo waveform. Turn the one big **route to chaos** knob and you walk the classic period-doubling cascade by ear: a pure limit-cycle tone folds into subharmonics (period-2, period-4), then breaks into broadband-but-pitched double-scroll chaos. The phase portrait tumbles as a cloud of little dots (pure DOM, zero GPU), and a live **chaos meter** (a real largest-Lyapunov estimate) glows exactly when the sound has gone genuinely chaotic. *Steer the route to chaos by ear.* *(Sound on; hit Start, then drag the α slider slowly — or just watch/listen as it auto-sweeps.)*

## New since yesterday
- **`6744-chua`** (shipped, WIDE winner) — an **audio-rate strange-attractor synthesizer**. The waveform is the chaos itself, not a mapping painted on top; one knob is the whole route to chaos.
- **Under the hood, a real capability unlock:** this is the lab's **first genuine AudioWorklet** — custom DSP running per-sample on the audio render thread (Chua's ODE integrated in RK4, a Blob-loaded processor posting the trajectory up for the visual). AudioWorklet had only ever been listed as "future work" in old READMEs; now it's a working pattern any future prototype can reuse. It also degrades to a main-thread fallback so it still sounds on browsers without it. **8th straight non-GPU cycle**, pure-DOM output.

## Also built this fire (2 more instruments, built clean, banked — IDEAS §1021)
- **`6760-terra`** (resurrect-first) — **a day of the Earth's earthquakes, played.** Pulls the *live USGS feed* and turns the last 24h of real quakes into a keyboard-conducted instrument on a world map — each quake a struck bell (magnitude→loudness, depth→pitch, longitude→pan) over a tectonic drone. Self-demos offline with a seeded synthetic day. The most immediately legible of the three; fills the thin "real-world data as music" cell.
- **`6776-cadence`** — **your speech becomes an instrumental score.** Talk (or type) and your words + prosody are written live as SVG notation and played on a mallet/bell voice (no voice synthesis — respects your pull-back-on-voice call). Statements fall, questions rise.

## Research finding worth a look (RESEARCH §1021)
- 2026's in-browser audio has quietly become a real DSP machine: **AudioWorklet + WebAssembly** is now the default for serious synthesis (FAUST→WASM, Rust→WASM synths on the render thread). That's what made today's per-sample chaos integration a few-hundred-line page instead of a native app. Honest caveat: the chaos math itself is foundational (Chua 1983, Bidlack 1992) — the fresh part is the browser plumbing + it being the lab's first real worklet.

## Open questions for Karel
1. **Next fire is DEEP-due (1022).** Two natural big swings: (a) **cycle 2 of the living-tuning line** (`6728-commawalk`'s declared multi-cycle — the roughness-minimization "tuning follows timbre" engine, or a drawbar UI that visibly moves the optimal tuning), or (b) a **DEEP on the AudioWorklet capability just unlocked** — a real per-sample physical-model instrument raced across two DSP approaches. Your steer?
2. **AI-pipeline chain** (music→image→video) still needs `FAL_KEY` funded, else strike it permanently (~39 cycles queued — the jury wants this *decided*, not re-banked).
3. **8 straight non-GPU cycles.** The GPU register has rested a while; a measured real-sensor psychedelic return (or a WebGPU piece) is on the table whenever you want the screen to light up again — your call.
