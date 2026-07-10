# Morning digest — last updated 2026-07-10 (cycle 724, PSYCHEDELIC · DEEP)

**Open the lab:** https://getresonance.vercel.app/dream

## New since yesterday — ▶ `/dream/1384-gravity-choir-points` (cycle 724 · DEEP)
**Gravity Choir — a swarm that doesn't react to music, it *makes* it.**
Why open this: place a few gravitational **stars** in a boundless star-void; **24,000** motes fall
into orbit around them — and their **orbital motion IS the sound**. Every particle piece you've seen
is *audio-reactive* (sound first, visuals dance). This runs the arrow **backwards**: the geometry
comes first, and the swarm sonifies its own orbits — density near a star's periapsis blooms its tone,
motes swinging through fire soft grains. The rhythm is **emergent** from the orbital periods; there's
no sequencer, no drum grid.
- **Play it:** two stars sing on Start · **click the void** to place a star (up to 6) or click one to
  select it · **number keys 1–7** tune the selected star (A-minor-pentatonic, always consonant).
- Cashes the jury's **#1** (get off Canvas2D → a **point-cloud** surface) and **#2** (TIME off the
  drum grid) in one move; runs on plain WebGL so it plays on any device.
- **Best on desktop/laptop.** Give it a moment on Start, then place a star and tune it.

## How this fire worked (DEEP — one concept, three builds)
- I built **one** concept — *a gravity swarm that sonifies its own motion* — three ways in parallel,
  and shipped the most robust: `1384` (three.js point-cloud). The other two are banked:
  - **⭐⭐ `1382-gravity-choir-gpu`** — the SAME choir on a **raw WebGPU compute shader** (100k motes).
    The freshest substrate (the jury's #1 want), and it *does* build — de-selected only because WebGPU
    won't render for Safari/many browsers at review time. **Top ship-next** once a WebGPU-verified path
    is confirmed.
  - **⭐ `1386-gravity-choir-conduct`** — **conduct the swarm by tilting your phone** (gather toward
    light → the choir swells; scatter → a whisper). Phone-delightful; banked to make the gesture more
    *played* before it ships.

## Open questions for Karel
- **Does the choir read as distinct voices, or a wash?** With several stars the drones can blend —
  the sonification is deliberately gentle and has lots of headroom. Your ear would tell.
- **Want the WebGPU 100k-mote version (`1382`) shipped next?** It's built and compiles; it needs a
  browser with WebGPU (Chrome/Edge) to shine. Say the word and it's the next fire.
- **The 5/5 rung is still 0×:** the ≥4-model **AI-pipeline chain** (audio→image→video) needs your
  per-prototype **paid-budget** call — I won't spend it unattended. 9th time raised.
