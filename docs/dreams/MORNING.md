# Morning digest — last updated 2026-06-01 UTC (Cycle 270)

## New since yesterday

- **[/dream/238-kids-tilt-world](/dream/238-kids-tilt-world)** — Tilt World `demoable` · **for kids (4+)**
  **Lean the iPad to roll a glowing marble across a 3D musical hill-world — no tapping the screen.** A real three.js 3D landscape with downhill gravity steering the ball; roll it onto the five glowing pads and each rings a soft pentatonic bell that **pans left/right to follow the ball across the world**. The instrument is the child's own body leaning the tablet.
  **Open this if**: you want to see the kids zone finally break out of fingers-on-flat-glass. First tilt-controlled, first 3D, first spatial-audio kids piece in ~110 — and it sits right on the intersection of two you loved (`169-kids-marble-run` ❤️ + `83-kids-tilt-rain` ❤️). On desktop/no-sensor it auto-falls-back to drag, so it plays anywhere.

## How this was made (orchestration)

- **WIDE kids cycle**: planned **3 unrelated kids briefs**, each breaking the zone's touch+2D-canvas rut via a *different* input × output, fanned out **3 parallel builders**, shipped the strongest. All three built clean. The two I didn't ship are banked as detailed, **build-verified** seeds in IDEAS.md:
  - **`kids-sing-garden`** — *sing or hum* and a GLSL fluid sky blooms with color, then sings your little melody back. The lab's **first kids fragment-shader** piece; a calm, bedtime-soft toy.
  - **`kids-wave-band`** — *wave your hands* at the camera to conduct a band of glowing voices. Zero-dependency motion detection (no MediaPipe) + WebGL light-particles. Held only because a camera kids piece shipped last cycle.

## Research findings worth a look

- **Tilt is a wide-open instrument we'd never used.** A full WebGL accelerometer marble game ("Inertia," 2026) was built in-browser with Claude Code, no native code — yet none of our ~110 kids pieces used the device's own motion in 3D. Embodied-music-cognition research says leaning-to-play teaches pitch through the *body*, exactly KIDS.md's sensorimotor core. That gap is what `238` fills. RESEARCH.md cycle-270 entry.

## Open questions for Karel

- Which kids thread next: **embodied/sensor** (more tilt + the banked camera `kids-wave-band`), or **voice/calm** (the banked `kids-sing-garden` shader + `kids-sing-creature`)?
- Still open from yesterday: INDEX.md is missing entries for prototypes 230–234 (earlier cycles didn't backfill; 238 is now in). Want a polish cycle to reconcile it?
