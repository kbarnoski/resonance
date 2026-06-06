**For**: kids (4+)

# 368 · Kids Rainbow Quest

A friendly unicorn creature asks a 4-year-old to go find a colour in the real world — point the camera at something red, orange, yellow, green, blue, indigo, or violet — and rewards them with a musical fanfare and sparkle burst when they bring it back. Each found colour adds a glowing band to a rainbow arc at the top of the screen. Collect all seven and the arc lights up in sequence as a "rainbow song" plays before looping with a fresh shuffle.

## What's novel

Most kids colour apps are self-contained — you tap something on screen. Rainbow Quest externalises the task: the child must leave the screen and go hunt the physical world with the camera as their finder. The feedback loop — creature glows warmer as you get closer to the right hue, then celebrates when you lock on for ~0.6 s — teaches perceptual colour discrimination without any reading or counting. The "getting warmer" shimmer is musical (a rising high-frequency shimmer tied to the D-Dorian scale) as well as visual, so progress is felt in both senses simultaneously.

## Subsystems

### Color detection
An invisible offscreen `<canvas>` samples every frame from the live `<video>`. `getImageData` extracts the central ~40×40 pixel patch; its RGB values are averaged then converted to HSV. The current HSV is compared to the target's hue with angular distance math, yielding a warmth score (0–1). A match requires hue within tolerance AND minimum saturation (to reject whites and greys) AND minimum brightness. A 0.6 s dwell lock (≈36 frames) prevents accidental triggers.

### Audio engine (`audio.ts`)
- **D-Dorian scale**: D4 E4 F4 G4 A4 B4 C5 — hard-coded; not C-major-pentatonic.
- **Always-on drone**: D3 + A3 (perfect fifth) as soft sine oscillators — the room is never silent.
- **Warmth shimmer**: Three detuned high sine partials (D6 E6 F6) with individual slow LFO tremolo, amplitude-mapped to warmth. Rises subtly as the child points at the right hue.
- **Fanfare**: Three-note ascending chime (root → fifth → octave) in triangle waves + a high sparkle sine tail.
- **Rainbow song**: All 7 D-Dorian notes played in order with a staggered chord bloom at the end.
- **Master chain**: `GainNode(0.72) → DynamicsCompressor(threshold −8 dB, ratio 20:1) → destination`. Brick-wall limiter — sleeping-toddler-next-room safe.
- AudioContext is created **inside the tap handler** (iOS-safe gesture requirement).

### Graceful degrade / auto-demo
If `getUserMedia` is denied or unavailable, the system immediately activates auto-demo mode: a timer ramps the warmth value from 0 → 1 over ~2.2 s, then calls the identical `triggerFound()` path — same fanfare, sparkles, rainbow arc, and rainbow song — looping continuously. The same fallback triggers if the camera stream produces no frames within 2 s. A `text-rose-300` notice explains the demo. The review audience sees the complete quest at 06:30 with no camera needed.

### Visuals (DOM/CSS only)
- Camera feed: a `<video>` element mounted into a container `<div>` via `useEffect` (React does not own it directly because it is created imperatively for `getUserMedia` wiring).
- Warmth glow: a `radial-gradient` overlay whose radius and opacity respond to warmth.
- Rainbow arc: seven `<div>` flex children with Tailwind background colours; collected bands glow.
- Sparkles: absolutely-positioned `<div>` circles with a CSS custom-property animation (`--tx`, `--ty`) launched on `triggerFound`.
- Creature: a large emoji with `drop-shadow` filter scaled by warmth; switches animations on fanfare.
- No Canvas2D rendering, no WebGL, no SVG, no three.js anywhere in the visual layer.

## D-Dorian + Music Pedagogy

The D-Dorian mode (D E F G A B C) carries a warm, modal quality distinct from C-major-pentatonic. Each of the 7 rainbow colours maps to one note:

| Colour  | Note | Frequency |
|---------|------|-----------|
| Red     | D4   | 293.66 Hz |
| Orange  | E4   | 329.63 Hz |
| Yellow  | F4   | 349.23 Hz |
| Green   | G4   | 392.00 Hz |
| Blue    | A4   | 440.00 Hz |
| Indigo  | B4   | 493.88 Hz |
| Violet  | C5   | 523.25 Hz |

This colour–music correspondence echoes the **Reggio Emilia** approach to early childhood: colour, sound, and sensory exploration are "languages" children use to make meaning before formal literacy. The "hundred languages of children" framework (Malaguzzi, 1993) explicitly pairs colour perception with musical and dramatic expression. The warmth shimmer implements a non-verbal feedback loop — no text, no score, no wrong answers — only felt proximity to a goal, a design principle aligned with Reggio's emphasis on intrinsic discovery.

The always-on D + A drone is a perfect fifth — the most acoustically stable interval — chosen to ground the harmonic environment so any of the 7 D-Dorian notes sounds consonant when it rings against it.

## Camera & Privacy

The camera is **analysis-only**: no frames are ever encoded, stored, or transmitted. The `<video>` element is muted and plays inline. The offscreen canvas is never inserted into the DOM. No network requests are made at any point during the session.

## Build status

Build-verified (TypeScript compiles, ESLint passes) but **not browser-verified** — this is a sandbox prototype reviewed from source. Camera access requires a real device or browser with `getUserMedia` support; the auto-demo path runs without camera in any browser environment.
