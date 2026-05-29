# 203 — Lantern Launch

**For**: kids (4+) · **Cycle**: 236 · **Status**: demoable

## What it is

Tap anywhere on a dark starry sky to release a glowing paper lantern. The lantern drifts
upward with a gentle sinusoidal sway. When it floats off the top of the screen it plays a
bright bell-chime and scatters sparkles. Up to 8 lanterns coexist — tap fast to fill the
sky.

## Interaction

- **Tap** anywhere → lantern spawns at that point, plays a soft launch tone
- **Left side** → low notes (C3, violet); **right side** → high notes (C4, cyan)
- Two demo lanterns appear automatically so the canvas is alive before first touch
- Ambient C3/G3/C4 sine pad creates a sense of warm space

## Sound design

- **Launch tone**: triangle oscillator, same pitch as the lantern, 0.14 gain, 0.85s decay
- **Exit chime**: triangle fundamental + first octave partial, 0.30 / 0.08 gain, 1.8s decay —
  the exit is notably brighter than the launch; rewards patience
- **Ambient pad**: three sine tones (C3/G3/C4) at gain 0.006 — barely-felt warmth, not a
  competing voice
- **Pitch mapping**: 5 horizontal zones → C3/E3/G3/A3/C4 pentatonic (same mapping as
  `1-live` and all kids prototypes — no wrong notes)

## Visual design

- Paper lantern shape: rounded rectangle body, equator rib, top handle arc, tassel bob
- Each lantern drawn in its pitch-zone color (violet/teal/amber/rose/cyan) with matching
  outer glow shadow
- Horizontal sway: `baseX + sin(phase + age × 0.0009) × 10 px` — smooth, never drifts
- Exit sparkle burst: 14 particles in a ring, fade over ~0.75 s
- Stars: 58 pre-placed twinkling points, stable positions (no per-frame allocation)

## What's new vs. prior kids prototypes

1. **Destination arrival chime**: all prior prototypes play a note at the moment of tap or
   collision. This is the first where the note fires at the *end* of a journey — the lantern
   travels, then sings. Reward is delayed by 5–10 seconds depending on where you tap.

2. **Passive watching is the gameplay**: once released, the lantern floats on its own. The
   child taps, then watches. This is the same "patient growth" paradigm as `143-kids-seed-song`
   but with visible motion instead of static growth — the lantern's path is predictable enough
   that a 4yo can track it.

3. **Layered sky**: multiple lanterns at different heights create a visual collage. Each has
   its own sway phase so they never look synchronized. A full sky of 8 lanterns glows.

4. **No fail state, no button grid**: interaction is entirely positional (where you tap → what
   pitch; height → how long before exit). A child who doesn't understand this still gets a
   glowing thing that makes sound, which is enough.

## Inspired by

- `166-kids-lantern` ❤️ (Karel loved the glowing lantern aesthetic)
- `169-kids-marble-run` ❤️ (physics toy with predictable trajectory)
- Sky Lantern Festival (Yi Peng / Loi Krathong) — the visual metaphor of releasing light
  into the night sky is universally understood

## Polish ideas

- **Mic mode**: RMS amplitude → auto-spawn rate (hum softly → one lantern every 3s; sing
  loud → one every 0.5s). Adds an input modality without adding UI.
- **Wind**: a shared global wind vector slowly oscillates, biasing all lantern sways
  in the same direction. Makes the scene feel like an outdoor night.
- **Collision chime**: when two lanterns pass within 20px of each other, play a short
  interval of their two pitches — a passing-note harmony.
- **Color persistence trail**: each lantern leaves a very faint (alpha 0.03) color streak
  as it rises, showing its path.
