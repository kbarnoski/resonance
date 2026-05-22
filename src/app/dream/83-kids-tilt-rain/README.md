# 83 — Kids Tilt Rain

**For**: kids (4+)  
**Route**: `/dream/83-kids-tilt-rain`  
**Status**: demoable  
**Built**: Cycle 96, 2026-05-22

---

## What it does

Colored raindrops fall from the top of the screen. Tilt the iPad (or phone) left and right like a tray to slide a glowing basket underneath them. Catching a drop plays a musical note — colored drops, colored notes, no wrong answers.

After catching 5+ notes, a **Replay** button appears that plays the caught sequence back as a melody.

---

## Controls

| Device | Basket control |
|--------|----------------|
| iPad / iPhone | Tilt left/right (DeviceOrientation gamma) |
| Android phone | Tilt left/right (no permission needed) |
| Desktop | Move mouse left/right over canvas |
| Any touchscreen | Drag finger across the canvas |

---

## Design decisions (kids UX rules applied)

- **No reading required** — the only text on the play screen is the note count (`♪ 3`) and the Replay button, both legible at a glance.
- **Tap-target** — Start button is 220×72px, Replay is similarly large.
- **Immediate sound** — note plays within ~14ms of catch (Web Audio API schedules precisely).
- **No fail state** — missed drops just fall off screen. No penalty, no sound effect, no disappointment.
- **Pentatonic scale** — C D E G A C D (no wrong notes, always harmonious).
- **Background pad** — C3/E3/G3 sine pad at 3% gain; the app never feels "dead" between catches.
- **Safe sounds** — triangle wave + 2nd harmonic sine. Warm, piano-adjacent, no harsh transients.
- **iOS permission** — `DeviceOrientationEvent.requestPermission()` called on the Start button tap (must be a user gesture); graceful fallback if denied.

---

## Sound synthesis

Each note: `OscillatorNode (triangle, freq)` + `GainNode (0.18) + OscillatorNode (sine, freq×2)` → shared `GainNode` with ADSR envelope:

- Attack: 14ms linear ramp  
- Sustain: 80ms hold  
- Release: 800ms exponential decay to silence  

This gives a warm bell-piano quality that children find pleasant.

---

## Physics

- **Gravity**: +0.045 px/frame (≈ 2.7 px/s²) added to `vy` each frame at 60fps
- **Spawn interval**: starts at 1350ms, decreases by 5ms per drop (floor: 680ms) — gentle ramp up in challenge
- **Basket collision**: AABB test: `dropY + R ≥ basketTop` AND `|dropX − basketCX| < basketW/2 + 5`
- **Basket follow**: exponential smoothing `0.16` applied to tilt-to-position mapping — smooth, laggy enough to feel physical

---

## Polish ideas (future cycles)

- Add a small face/expression to each drop (emoji overlay or Canvas2D arc eyes)
- Let drops of the same color "link" when caught near each other → chord
- After 16 catches, show a "rainbow" celebration animation
- Parent mode (long-press corner): change key / tempo / scale type
- Portrait lock hint for best tilt experience
