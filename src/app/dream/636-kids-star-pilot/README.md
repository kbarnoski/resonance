# Star Pilot

**The question:** What if a 4-year-old could fly a glowing little ship with a
game controller through a field of musical star-gates — steering with the stick
to weave through tuned gates that sing, and pressing buttons to drop sparkly
drums — turning play into an ever-evolving melody?

A kids prototype in the playful arcade-WONDER register: joyful, active, spacey,
"I'm flying and making music." Built for couch/TV play with a gamepad, but it
always works on a keyboard too.

## How to play

- **Controller (preferred):** push the **left stick** to fly the glowing ship.
  Tap the **face buttons** to drop sparkly percussion.
- **Keyboard (automatic fallback):** **arrow keys** or **WASD** steer. **Space**
  and number keys **1–4** drop drums.
- Fly **through (or near) a glowing star-gate** and it blooms and rings its
  bell-tone. Each gate is tuned to a different note, so weaving between them
  spells out a melody.
- There is **no score, no fail state, nothing to read**. The ship can't crash —
  it softly bounces off the edges. Just fly and listen.
- Press **Start flying** once to turn the sound on (browsers require a tap before
  audio can play).

The last several gates you visit are **remembered and echo back on a slow
pulse**, so the music keeps building on itself — minute 2 sounds different from
minute 0. Leave it alone for ~5 seconds and the ship resumes a gentle
auto-flight, so the scene is never silent and a glance always shows it alive.

## Subsystems (4 — clears the ≥3 bar)

1. **Input: Gamepad API + keyboard fallback.** Each animation frame polls
   `navigator.getGamepads()` for the left-stick axes (with a dead-zone) and reads
   **button press *edges*** (was-up-now-down) so a held button fires a drum only
   once. `gamepadconnected` / `gamepaddisconnected` events switch the on-screen
   hint live. With no pad, arrow/WASD + space/1–4 drive everything.
2. **Flight physics + gate detection.** Stick/keys apply thrust to a ship with
   momentum and drag, a capped top speed, and soft edge-bounce (never a "you
   died" state). Per-frame circle-distance checks ring a gate when the ship
   passes through, gated by a short per-gate cooldown so it can't machine-gun.
3. **Sound: tuned-gate bell synth + sparkly percussion + loop-memory
   sequencer (Web Audio).** Gates ring an additive, slightly-inharmonic
   struck-bell. Buttons drop a mallet/woodblock thump plus a filtered-noise
   shimmer. A slow scheduler walks a short ring-buffer of the most recent gate
   notes and **echoes them back softly** — a self-playing arpeggio that
   accumulates and evolves (genuine state, not a fixed loop).
4. **Visuals: Canvas2D glowing starfield.** A `2d`-context render with a nebula
   background, twinkling parallax stars, bloom-haloed gates, an additive comet
   trail, and the ship as a bright comet pointing along its travel direction.
   All glow done with `globalCompositeOperation = "lighter"`.

## Named reference

This sits in the **play-becomes-music** lineage of **Toshio Iwai's
*Electroplankton*** (Nintendo DS, 2005) — a toy/instrument where steering little
creatures *is* the act of composing — and **Tetsuya Mizuguchi's *Rez* (2001) /
*Child of Eden* (2011)**, where flying through a synaesthetic space fuses
shooting/steering with building a piece of music. Star Pilot takes that "fly
through a synaesthetic music-space" idea and makes the controls toddler-simple:
one stick to fly, any button to drum, and gates that sing back.

## Ambition criteria claimed

- **≥3 distinct subsystems:** 4, listed above (gamepad/keyboard input; flight
  physics + gate detection; bell/percussion/loop-memory synthesis; Canvas2D
  starfield render).
- **Named reference (accurate):** *Electroplankton* (Iwai, Nintendo DS, 2005)
  and *Rez* / *Child of Eden* (Mizuguchi, 2001 / 2011).

## Graceful degradation

- **No gamepad** → keyboard takes over automatically; a clearly visible
  `text-violet-300` hint reads "Connect a controller, or use the arrow keys."
  and `gamepadconnected` upgrades the hint live when a pad is plugged in.
- **No Canvas2D context** → a clear `text-rose-300` notice and the Start button
  is hidden.
- **iOS / autoplay:** the `AudioContext` is created and `resume()`d inside the
  Start-button gesture; the master nodes are pre-built for low latency.
- **Kid-safe master chain:** `master gain → lowpass (~7.5 kHz) →
  DynamicsCompressor (fast ~3 ms attack, high ratio) → destination`, with capped
  per-voice gains and rate-limited drum triggers, so it can never get harsh.
- **Idle auto-demo:** the starfield + ship animate immediately on mount (audio
  stays gated behind Start); after ~5 s of no input the ship resumes a gentle
  wandering auto-flight so the loop-memory keeps the music going by itself.

## Tech / constraints

- Self-contained Next.js client component (`"use client"`), TypeScript.
- **Web Audio API** for sound, **Canvas2D** for visuals (no WebGL/WebGPU/three).
- No new npm dependencies, no API route, no shared-file edits.
