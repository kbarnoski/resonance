# 135 — Wheel Song (kids)

**Question**: What if a spinning color wheel could play music?

**For**: kids 3+ · Zero permissions · Zero API · Zero deps

---

## Interaction

A five-segment color wheel spins continuously in the dark. A golden triangle (the "striker") is fixed at 12 o'clock position just outside the rim. Each time a segment passes the striker, that segment's pentatonic note plays as a warm reverb-soaked bell tone:

- **Violet** → C3 (lowest)
- **Rose** → E3
- **Amber** → G3
- **Emerald** → A3
- **Cyan** → C4 (highest)

**Tap anywhere** to add spin momentum. The faster the wheel spins, the faster the notes play — and the louder and brighter the segment flash when it strikes.

The wheel starts at a gentle auto-spin pace (~0.8 rad/s, one note every ~5 seconds per segment). A few taps bring it up to tempo. The wheel naturally decelerates back to a slow drift if untouched.

A subtle continuous tone rises in pitch as speed increases (C2 drone → A3 hum) — barely audible, but the space never goes silent.

---

## Design decisions

**Speed = musical energy**: The only variable the child controls is spin speed (via taps). Slow spin = spaced-apart contemplative notes; fast spin = a rapid rolling melody of all five colors. This maps rotational physics directly to musical density.

**Pentatonic C-major**: All five notes are consonant — any succession sounds musical. A child who taps rapidly and hears the colors fly past the striker gets a bright ascending-then-repeating melody that never sounds wrong.

**Striker at 12 o'clock**: The fixed position makes the "moment of playing" spatially predictable — the child can WATCH a color approach the golden triangle and anticipate the note. This teaches the connection between visual position and sound.

**No fail state**: The wheel never stops completely (minimum drift 0.3 rad/s). There is no wrong way to use this.

**Multi-touch friendly**: Each finger contact on `pointerdown` adds a spin impulse, so two hands on a tablet spin the wheel up faster.

---

## Audio architecture

- 5 per-strike `OscillatorNode` (triangle wave) → `GainNode` (ADSR envelope) → `ConvolverNode` (reverb) + direct path → master `GainNode`
- Reverb impulse: exponentially-decaying white noise (1.3 s), synthesized at runtime — no audio files
- Continuous tone: sine `OscillatorNode` → `GainNode`, frequency and gain updated each frame via `setTargetAtTime` (smoothed transitions)
- All nodes created and connected in `handleStart` on the user gesture (correct AudioContext timing)

---

## Polish ideas

- **Color trail**: leave a brief glowing arc in the segment's color at the striker position when it strikes, fading over 200ms. Visual residue of the note that just played.
- **BPM display**: compute current BPM from inter-strike intervals. Show in corner.
- **Note name flash**: briefly display the note name (C3, E3, G3, A3, C4) above the striker when a segment passes through.
- **Reverse mode**: add a second striker at 6 o'clock (12 o'clock reverse). Tapping the bottom half of the screen spins counterclockwise. Two opposing strikers = descending and ascending melodies from opposite taps.
- **Slower decay option**: a "gentle" / "lively" toggle that adjusts the deceleration constant — useful for kids who prefer slower, more meditative sounds.
