# 220 — Kids Fireworks

**For**: kids (4+)  
**Cycle**: 254  
**Status**: demoable

## What it does

Tap anywhere on the dark night sky to launch a glowing rocket. The rocket travels upward to the tap point over ~0.75 seconds — then explodes into 22 colored sparks that fall with gravity while a pentatonic chord rings out.

Five color zones left-to-right map to five pitches:
| Zone | Color | Pitch |
|------|-------|-------|
| Far left | Violet | C4 (261 Hz) |
| Left-center | Emerald | E4 (330 Hz) |
| Center | Amber | G4 (392 Hz) |
| Right-center | Rose | A4 (440 Hz) |
| Far right | Cyan | C5 (523 Hz) |

All five notes are C major pentatonic — any combination of simultaneous explosions is harmonious.

## What's new

**First kids prototype with a projectile-arc mechanic.** All 219 prior kids prototypes produce sound within 50ms of a tap (tap-direct) or within a short drift window (bubble-bath, firefly-web collision). Fireworks introduces a clean 0.75s *travel window*: the child sees exactly where their rocket is headed and waits for the burst. The anticipation — watching the rocket climb — is the mechanic. Three similar prototypes with "delayed reward":
- `203-kids-lantern-launch` (5–10s float before top-exit bell)
- `218-kids-xylophone-drops` (1.2s fall before ring)
- `220-kids-fireworks` (0.75s climb before explosion) — shortest window, highest kinetic energy

The projectile visual + directional travel is qualitatively different from the other two: the child deliberately AIMed the rocket and is waiting to see it hit. The spatial alignment between the launch origin (always bottom-center) and the variable tap target makes each firework's arc unique.

## Interaction design

- **Tap sky**: launch rocket toward tap point — audio fires on explosion, not on tap
- **Multiple taps**: up to 7 simultaneous rockets; can create chords (multiple colors exploding nearly simultaneously)
- **Tap low on screen**: short arc, explosion near the ground; higher tap = taller arc
- **Color = pitch**: child discovers left = low (violet = deep) / right = high (cyan = bright) through ear + eye
- **Auto-demo**: 3 rockets auto-launch at 0.9s / 1.85s / 2.8s after page open so the canvas is never empty/silent before the first touch

## Audio design

Triangle oscillator chord at the explosion moment:
- Fundamental at full pentatonic pitch: 0.30 gain, 1.4s decay
- 2nd harmonic (×2): 0.11 gain
- 3rd harmonic (×3): 0.04 gain

The three partials together produce a bright bell-like tone — not as pure as a sine, not as buzzy as a square. Short enough to not overlap badly at 80ms launch intervals, long enough to ring after the sparks fade.

## Visual design

- **72 twinkling stars** (random positions, sinusoidal opacity variation, unique phase per star)
- **Rocket**: 5px glowing head (shadowBlur 22) + 6-dot fading trail stepping back along trajectory
- **Explosion**: 22 sparks at random radial velocities (75–220 px/s), vy biased upward (−85 px/s initial kick), gravity 290 px/s²
- **Sparks**: fade alpha + shrink radius over 1.6s; removed when alpha = 0 or y > screen + 60px

## Love signals

- `169-kids-marble-run` ❤️ — physics-based anticipation; marble falling before the xylophone rings
- `166-kids-lantern` ❤️ — upward float journey before the reward fires at the top
- `133-kids-ripple-pond` ❤️ — tap → spatial visual event → sound at the event site
- `82-kids-color-piano` ❤️ — BANDIMAL color = pitch system (left=low/violet, right=high/cyan)
- `218-kids-xylophone-drops` — immediate predecessor in the "anticipation" series

## Polish ideas

- **Mic mode**: mic RMS → rocket spawn rate (hum = constant rockets)
- **Multi-color explosion**: instead of single palette index per rocket, split the 22 sparks across neighboring palette colors for a rainbow burst
- **Ground flash**: brief ellipse at the bottom-center launch point on each launch (muzzle flash)
- **Emoji burst label**: small "✦" or pitch name fades in at explosion point for 0.5s (readable on phonics)
- **Confetti mode**: when 5+ rockets explode within 2s, canvas fills with gold confetti rain for 1s
