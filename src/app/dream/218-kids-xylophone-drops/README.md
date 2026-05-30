# 218-kids-xylophone-drops

**For**: kids (4+)
**Cycle shipped**: 252
**Status**: demoable

## What it does

Five colored bars sit at the bottom of the screen in a staircase — tallest on the left (lowest pitch), shortest on the right (highest pitch). Drops fall from the top of the screen, each aimed at a bar. When a drop hits a bar it rings with a pentatonic note and the bar glows. Drops auto-spawn every 1.8 seconds, and the child can tap anywhere in the sky to spawn a drop in that column, or tap directly on a bar to ring it immediately.

All five bars are tuned to C major pentatonic (C4, E4, G4, A4, C5). Every drop harmonizes with every other — no wrong notes possible.

## Design notes

**BANDIMAL rule** — taller bars play lower notes. This mirrors real xylophones and marimbas where longer resonators vibrate more slowly. A child who notices "the big purple bar makes the deep sound" has discovered acoustic physics through play with no instruction.

**Anticipation window** — drops take about 1.2 seconds to fall from spawn to bar (at 60 fps, GRAVITY=0.18 px/frame² and V0=2 px/frame). This gap creates temporal investment: the child watches a drop falling and anticipates its ring. The colored drop telegraphs which note is coming. Contrast with prototypes where tap = immediate sound — this one rewards watching as well as tapping.

**Ambient auto-spawn** — drops spawn every 1.8 seconds even without interaction. The prototype is never silent or static. A child can sit back and listen/watch, or lean in and spawn more drops.

**Three seed drops at load** — bars 0, 2, 4 (violet, emerald, rose) spawn automatically at 80ms, 440ms, 800ms after mount. The child hears the first ring within 2 seconds of opening the page — no cold start.

**Tap-bar = instant ring** — for kids who want immediate gratification, tapping directly on a bar rings it without waiting for a drop. The pointer handler checks `cy >= barTop - 10` to give a generous 10px touch buffer above each bar.

**Drop visual** — colored circle with a white specular highlight (30% opacity, offset upper-left). This gives each drop a satisfying "liquid" appearance and makes them visually distinct from the bars they're heading toward.

## Audio

- Triangle oscillator (soft, wood-like xylophone timbre)
- Attack: instant (setValueAtTime 0.5)
- Decay: exponential, 0.5 → 0.001 over 0.9 seconds
- Frequencies: C4 261.63 Hz · E4 329.63 Hz · G4 392.00 Hz · A4 440.00 Hz · C5 523.25 Hz
- AudioContext initialized on first tap (browser autoplay policy)

## Polish ideas

- **Mic mode**: RMS amplitude → drop spawn rate (play or clap = faster rain of drops)
- **Teardrop shape**: elongated circle in the direction of motion (more physics-accurate)
- **Wider range**: extend to 7 or 8 bars spanning C3–C5 (a full 15-note pentatonic range)
- **Confetti burst**: when all 5 bars ring within 500ms of each other, full-screen sparkle
- **BPM-synced spawn**: drops fall in rhythm at a settable BPM (drop becomes a sequencer)
- **Gravity slider**: let older kids adjust how fast drops fall (parent mode)
- **Multiple drops per column**: allow 2-3 simultaneous drops per column for dense polyrhythm
