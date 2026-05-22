# 90 — Puddle Jumper

**For**: kids (4+)
**Route**: `/dream/90-kids-puddle-jumper`
**Status**: demoable
**Cycle**: 100

## What it is

A full-screen interactive pond. Tap anywhere to drop a stone — a brief bright splash appears, three concentric ripple rings expand outward, and a soft pentatonic "bloop" plays. When a ripple ring reaches a screen edge it reflects, spawning a dimmer ghost-ring from the mirror point. Multiple taps build a layered visual and sonic texture.

No mic, no motion sensors, no permissions required. Every tap works. Infinite play.

## Design decisions

**Why pentatonic?**
C-major pentatonic (C D E G A, two octaves) — no combination of notes sounds wrong together. X position on the canvas maps to the 10-note range: left = low (C3), right = high (A4). A 4-year-old dragging their hand across the screen automatically plays a glissando.

**Why ripple reflection?**
Reflected rings make the screen feel alive even when the child stops tapping — "echoes" of earlier splashes keep drifting. It's also a simple physics analogy a 4yo can intuit: ripples bounce off walls like balls.

**Reflection math:**
When ring at `(cx, cy)` with radius `r` first crosses the left wall (x=0), a ghost ring spawns at `(-cx, cy)` with the same radius. The canvas clips the circle naturally; only the visible arc appears. Alpha × 0.42, speed × 0.62. Depth capped at 2 to bound spawn count.

**"Lighter" blend mode:**
Rings use `globalCompositeOperation = "lighter"` — overlapping rings additively sum to white, which looks like glowing water. Multiple taps near each other create bright intersection points.

**Ambient pad:**
Three-note C-major pad (C3 E3 G3) at gain ~0.02, low-pass filtered to 480 Hz. Fades in over 3 seconds, runs for 10 minutes. Eliminates the "broken/silent" feeling and makes single taps sound like they're part of a musical context.

**Sound design:**
Sine oscillator pitched at `freq × 1.8`, dropping to `freq × 0.38` in 70ms then returning to `freq` by 220ms (the characteristic "bloop" arc). Low-pass sweeps from 2600 → 700 Hz. Gain decays over 720ms. Result: soft, mellow water drop — not harsh, safe for next-room listening.

## Visual parameters

| Parameter | Value |
|-----------|-------|
| Trail opacity | 0.20/frame (~3s persistence) |
| Base ripple speed | 90–134 px/s |
| Base ripple decay | 0.52–0.74 alpha/s |
| Reflected speed | 62% of parent |
| Reflected alpha start | 42% of parent |
| Max ripples (cap) | 100 |
| Background | #040e23 dark navy |

## Polish ideas (future cycles)

- Subtle ambient particles (dust motes, tiny circles drifting upward at 1px/s) to make the pond feel alive before first tap
- Dragon-fly or lily-pad CSS sprites in corners for world-building
- "Night → day" sky gradient that slowly shifts over the session (adds soft color tones to ripples)
- Parent mode (long-press corner): change key / tempo / color theme
- Two-finger harmony: second finger always plays a perfect fifth above the first
- 15-minute fade-out to lullaby (per KIDS.md principle #10)
