# 184 — Gravity Harp

**For**: kids (3+)  
**Cycle**: 216 (kids build)  
**Route**: `/dream/184-kids-gravity-harp`

Six glowing strings stretched horizontally across a dark canvas. Drop a colored ball — it falls through the strings, each one plucking a Karplus-Strong note as the ball passes. Ball bounces off the floor and rises back through the same strings in reverse. A single dropped ball plays the full pentatonic scale descending, then ascending.

## Interaction

- **Tap anywhere**: drops a glowing ball at that x-position from the top of the canvas
- **Multiple taps**: up to 8 balls fall simultaneously, creating polyrhythmic patterns
- Two demo balls auto-spawn on load — no touch required to hear the harp
- Settled balls on the floor are replaced by new taps (oldest ball removed)

## Core design insight: pass-through physics

Elastic bouncing (vy reversal) would trap each ball near the top string — a ball dropped from
rest can't reach the lower strings after bouncing. Instead, strings are energy-absorbing curtains:
each crossing reduces |vy| by 38% (vy × 0.62) while keeping the same direction. The ball passes
through all 6 strings, decelerat​ing with each one, reaches the floor, bounces elastically (0.80),
and traverses all 6 again in reverse. The ball eventually settles near the bottom strings where
it barely has energy to cross, producing a quiet bass drone.

## Sound

**Karplus-Strong synthesis** — each string is a pre-computed AudioBuffer:
- P = round(sampleRate / freq) samples of white noise (initial excitation)  
- Followed by P × 700 samples computed as: `d[i] = 0.997 × 0.5 × (d[i−P] + d[i−1])`  
- The IIR lowpass (d[i-1] term) + feedback gain (0.997) produces natural string decay

String pitches (C major pentatonic, top → bottom = high → low):
| String | Pitch | Color    | Visual Hz |
|--------|-------|----------|-----------|
| 1      | C5    | violet   | 8.0       |
| 2      | A4    | emerald  | 7.0       |
| 3      | G4    | amber    | 6.0       |
| 4      | E4    | rose     | 5.0       |
| 5      | D4    | sky      | 4.5       |
| 6      | C4    | lavender | 4.0       |

Ambient C2 + G2 sine pad (gains 0.010 / 0.007) from first tap — space feels inhabited before
the first ball reaches a string.

## Physics

- Gravity: 0.30 px/frame² (terminal velocity capped at 22 px/frame)
- String crossing: vy × 0.62 per crossing (pass-through, 38% energy absorbed)
- Floor bounce: vy × −0.80 (20% energy loss, ball returns to ~64% of peak height)
- Side walls: vx sign-flip × 0.72
- 90 ms per-string cooldown prevents double-triggering on adjacent frames
- Settled threshold: |vy| < 1.5 on floor contact → vy = 0 (ball rests)

## Inspiration

- `169-kids-marble-run` ❤️ — physics-based discovery, spatial pitch layout
- `105-pluck-field` ❤️ — Karplus-Strong synthesis, physical modeling
- `98-kids-drum-circle` ❤️ — immediate percussive response, no wrong interactions
- `133-kids-ripple-pond` ❤️ — tap to spawn objects that trigger musical events

## Polish ideas

- **Chord glow**: when 2+ balls hit adjacent strings within 50 ms, blend their colors at the
  intersection point (a brief white-ish cross-glow). Rewards simultaneous multi-tap.
- **Drift**: give each ball a slow x-drift toward the nearest unoccupied horizontal zone so
  balls spread across the canvas rather than clustering under the tap point.
- **Auto-harp mode**: a button that periodically spawns a ball at random x every 3s — ambient
  self-playing music with no interaction needed. Sleeping baby mode.
- **String labels**: tiny pitch names (C5, A4…) at the right edge of each string, text-white/40,
  for curious parents who want to know the notes.
