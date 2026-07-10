# Gravity Choir

**The one question:** What if a swarm didn't *react* to music, but **generated** it — a cosmic gravitational swarm whose orbital motion *is* the sound?

## The inversion

Almost every particle piece is *audio-reactive*: sound comes first, and the visuals dance to it. **Gravity Choir runs the arrow backwards.** The geometry comes first — the swarm sonifies its own orbital dynamics. Nothing here listens to audio. The motes fall, orbit, and stream, and *that motion* is measured and turned into sound.

## How it works

- **The cloud.** A single `THREE.Points` point-cloud of **24,000 motes** rendered with a custom additive `ShaderMaterial` (soft round sprites, size attenuation, colour ramped violet → cyan by speed) over a deep star-void.
- **The physics.** Positions and velocities are integrated on the **CPU each frame** (`sim.ts`) under softened inverse-square gravity toward each attractor, a very weak global spring (keeps the field bounded and boundless-looking), and a little drag. A hard velocity clamp is the final safety, so the field can never blow up. Swallowed motes respawn far out, so density stays alive and the sky keeps streaming.
- **The sonification (the whole point).** Each attractor is a *star* tuned to a pitch and holds one sustained **additive voice** (a fundamental sine plus a quiet octave and twelfth). Every frame the simulation measures, per star, three geometric facts and hands them to `audio.ts`:
  - **density** — how many motes are inside its periapsis *resonance shell* → blooms the tone's amplitude,
  - **mean speed** — of those motes → opens a gentle low-pass filter and adds a whisper of detune,
  - **crossings** — motes that swung *into* the shell this frame → fire soft enveloped sine **grains**.
- **Emergent time.** The rhythm you hear is written by the orbital periods themselves — a slow, evolving cosmic drone whose pulse emerges from the swarm's own dynamics, not from any sequencer or drum machine.

## Controls

- **Start the choir** — creates/resumes the AudioContext on the gesture; two stars are already singing.
- **Click the void** to place a new star (up to six); **click an existing star** to select it.
- **Number keys 1–7** set the selected star's pitch from an A-minor-pentatonic set (A2 · C3 · D3 · E3 · G3 · A3 · C4). The on-screen pitch row does the same.
- **Remove star**, **Mute**, and **Stop** (ramps audio to silence in ~60 ms and freezes the swarm).
- **Read the design notes** reveals this write-up inline.

## References & divergence

- **"Party"** (2026) — a WebGPU particle-physics playground.
- **Robert Borghesi, *ASTRODITHER*** (2026) — Three.js WebGPU/TSL audio-reactive particles.

Both are gorgeous GPU swarms driven **by** audio. Gravity Choir diverges on two axes: it runs on **plain WebGL** (a CPU integrator + `THREE.Points`) for broad device support with no WebGPU dependency, and it **reverses the causality** — the swarm is the *instrument*, not the visualiser.

## Honest novelty self-assessment

GPU and point-cloud particle fields have deep lab prior art, and CPU n-body toys are decades old — the rendering and the physics here are well-trodden ground. The genuinely fresh part is narrow but real: a **gravitational swarm that plays *itself***, its music emerging from orbital geometry (periapsis density, speed, and crossings) rather than reacting to a track. Where it's weakest: the CPU integrator caps particle count (24k, not the millions a WebGPU build could push), and with many stars the drone can crowd toward a wash rather than distinct voices — the sonification mapping is deliberately gentle and could be pushed much further.
