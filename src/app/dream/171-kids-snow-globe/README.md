# Snow Globe ❄️ — design notes

**For**: kids (3+)  
**Route**: `/dream/171-kids-snow-globe`  
**Cycle**: 200 (kids build — 200 % 2 = 0)  
**Built**: 2026-05-26

---

## The question

What if snowflakes played notes *when they landed* — not when you tapped?

All 170 prior prototypes produce sound on tap-down (the gesture IS the note). Snow Globe is the
first where the musical event is *delayed by physics*: tap the canvas, watch the flakes fall,
hear the chord chime when they hit the ground. The cause-effect loop has a gap (~0.5–1.4 s
depending on how high you tap), and that gap is the whole experience.

---

## How it works

**Tap** → burst of 5–8 glowing snowflakes scatter from the touch point, each drifting
sinusoidally as they fall. **Y position of the tap** determines pitch: tap near the top of
the screen → high note (C4, rose); tap near the bottom → low note (C3, violet). Five pitches:
C4 / A3 / G3 / E3 / C3 — C-major pentatonic, always consonant.

**Hold** → continuous snowfall at one flake per 120 ms ("pour mode"). Moving a held finger
changes where the flakes originate in real time.

**Landing** → triangle-wave bell chime (0 ms attack, τ = 0.45 s exponential decay, ~1.5 s
ring). Nine sparkle particles burst at the landing point and arc upward then fall under gravity.

**Demo mode**: 3.5 s of auto-snowfall from mid-height on first open — shows the interaction
before any touch. Flakes land and play, showing what to expect.

---

## Audio

Bell synthesis: a single triangle-wave oscillator at the pitch frequency with instant onset and
exponential decay (`setTargetAtTime(0, now, 0.45)`). No attack ramp — bells start immediately
and decay naturally. After 2.2 s the oscillator is stopped.

Ambient pad: C3 (130.81 Hz) + E3 (164.81 Hz) + G3 (196.00 Hz), triangle waves at 0.004–0.005
gain each. Inaudible on phone speakers at medium volume; audible on headphones as a warm,
barely-there hum. Prevents the "is it broken?" silence between taps.

---

## Physics

- Gravity: 0.16 px/frame² (gentle — slower than marble-run's 0.22)
- Initial vertical velocity: ±0.15 px/frame (near-zero, so flakes start essentially at rest)
- Sinusoidal wobble: `dx = A × ω × cos(phase)` per frame, `phase += ω`, where `A = 9–17 px`
  and `ω = 0.038–0.062 rad/frame`. This gives oscillation amplitude of `A` pixels with period
  of `2π/ω ≈ 100–165 frames ≈ 1.7–2.7 s`. Visually: a gentle, non-mechanical left-right drift.
- Fall time from H×0.4 (demo height) to ground: ~60 frames ≈ 1.0 s
- Fall time from near-top to ground: ~83 frames ≈ 1.4 s
- Fall time from near-bottom to ground: ~27 frames ≈ 0.45 s

---

## What a 3yo discovers

1. Tap → things appear and fall (first interaction, immediately satisfying)
2. Things land and make a sound (delay teaches cause-effect with a gap — the snow remembers)
3. Tapping high makes a different sound than tapping low (discovered by accident, then deliberate)
4. Hold = more snow = more notes (discovered when exploring)
5. Sparks appear where the snow lands (sparkle reward for patience)

---

## Design choices

**Landing (not tap-down) as the musical event**: borrowed from `133-kids-ripple-pond` ❤️
(collision = chord) and the KIDS.md pedagogy note that "delay between gesture and note teaches
cause-effect with temporal separation." Snow Globe is the purest form of this principle.

**Y = pitch (top = high)**: the "high up = high note" mapping is self-discovering. Children
understand it from bird calls, rising voices, and every real string/bar instrument (longer
strings at the bottom of a guitar play lower). After two taps — one near the top, one near
the bottom — a 3yo has the model without any instruction.

**Pentatonic**: C4/A3/G3/E3/C3. All pairs are consonant. Multiple flakes from different heights
make chords that always sound good.

**No buttons, no UI chrome during play**: the entire canvas is the instrument. Controls that
require reading (BPM sliders, mode pickers) would break the 3yo interaction model. The only
visible text is the title and the ← dream link.

---

## Love signals influencing this build

- `133-kids-ripple-pond` ❤️ — landing/collision = musical event; physics delay
- `100-kids-paint-song` ❤️ — tap gesture = music
- `152-kids-star-paint` ❤️ — dark sky + sparkle aesthetic
- `105-pluck-field` ❤️ — physical modeling → immediate resonant note

---

Zero permissions · Zero API · Zero deps · Cycle 200
