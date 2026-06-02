# 276 — Balloon Sky (Tritave)

**For**: kids (4+)

A matte cut-paper dusk sky full of big hot-air balloons. The child **tilts the
tablet** to drift a little paper cloud-bird through the sky. Brushing a balloon
makes it **bob, swell, and sing a note**, leaving a puff of paper confetti.
Brush balloons in a row to play a melody; brush two at once to play a chord.
A soft drone hums underneath so it is never silent — and there is no score, no
"wrong", no fail state. Fully reversible, infinitely playable.

## The question it answers

> What if a 4-year-old could play in an alien-but-beautiful tuning that has **no
> octave** — the Bohlen-Pierce scale — by tilting their tablet to float a paper
> creature through a sky of singing balloons?

## Why it is novel

This is the **first non-octave / non-pentatonic tuning in the lab**. Almost all
"kid-safe" music toys lean on the major pentatonic in octave-based 12-TET so
"nothing can sound wrong." Here, *nothing sounds wrong either* — but the
in-key-ness comes from a completely different harmonic universe whose repeat
interval is the **tritave (3:1)**, not the octave (2:1). It sounds organic and
slightly otherworldly, which is exactly the point.

## The Bohlen-Pierce math (made audible)

- **Repeat interval = the tritave, 3:1** (a perfect twelfth, 1901.955 cents) —
  *not* the 2:1 octave.
- Tuning used: **equal-tempered Bohlen-Pierce = 13 equal divisions of the
  tritave (13-EDT)**.
- **Step ratio = 3^(1/13) ≈ 1.08818**, i.e. ≈ 146.3 cents per step.
- Note frequency: `freq(k) = BASE * Math.pow(3, k / 13)` with `BASE = 220 Hz`
  (a warm A3-ish root).
- **The signature BP chord is the just 3:5:7 triad.** In 13-EDT the closest
  degrees are **0, 6, 10** (root, ≈5/3 at step 6, ≈7/3 at step 10), so three of
  the balloons are deliberately seated on that triad. Brush them together and
  the chord sounds *rooted*, not random. Extra balloons (degrees 3, 4, 7, and
  13 = the tritave above the root) give melodic range.
- **Timbre = clarinet-like, on purpose.** BP has a natural affinity with the
  clarinet, whose chalumeau spectrum is dominated by **odd harmonics** and which
  overblows at the tritave rather than the octave. Each balloon voice is
  synthesized as a fundamental plus mostly **odd partials (1, 3, 5, 7, 9)** with
  decreasing gain, a soft (~50 ms) attack and gentle decay, behind a low-pass at
  ~1.6 kHz so nothing is piercing. The odd-harmonic spectrum makes the
  odd-harmonic BP intervals beat cleanly.
- **Drone bed = the BP root + the tritave above** (low level, slow detuned
  shimmer, low-passed) so every balloon note is always heard in context and the
  piece is never silent.

## Subsystems (≥3)

1. **Tilt input + physics drift** — `DeviceOrientationEvent` (`gamma` =
   left/right, `beta` = front/back) maps to a steering acceleration; the
   creature integrates velocity with drag and bounces softly off the edges.
2. **Inline-SVG render/animation engine** — everything is `<svg>` cut-paper
   shapes (`<path>`/`<ellipse>`/`<g>`), animated each frame via
   `requestAnimationFrame` writing transforms through refs (never `setState`
   per frame). Cut-paper lift via `feDropShadow`; subtle paper grain via
   `feTurbulence`. No `<canvas>`, no WebGL.
3. **Odd-harmonic clarinet-like BP synth + drone** — per-balloon voices and the
   always-on drone bed (above), all click-free with ramps / `setTargetAtTime`.
4. **Collision / brush detection** — per-frame distance test between creature
   and each balloon, with a short per-balloon cooldown; simultaneous brushes
   become chords; each brush spawns a paper-confetti puff.

## Input & graceful degradation

| Situation | Behavior |
| --- | --- |
| iOS 13+ tablet | Tap "Tap to begin" triggers `DeviceOrientationEvent.requestPermission()`; on grant, **tilt steers**. Status line: "Tilt to steer". |
| Android / sensor present | Tilt listener attaches directly; **tilt steers**. |
| Desktop / no sensor / denied | **Mouse-move / touch-drag steers** the creature toward the pointer. Status line: "Move to steer (no tilt sensor)". |
| Audio blocked until gesture | The "Tap to begin" gate creates and resumes the `AudioContext` inside the user gesture. |

The piece is fully usable on a laptop at review time; tilt is the headline input.

## Kids design rules honored

- No reading required to play (color + character + motion). Any text is labeling.
- Start button ≥ 64×64 px; immediate (<50 ms) response on every brush.
- No "wrong", no fail/game-over, no scary faces, no sudden-loud transients
  (soft attacks, low-pass, compressor on the master).
- Bold saturated per-balloon colors; always-on drone so it never feels broken.
- After ~14 min the master and drone gently fade toward a lullaby quiet.

## Named reference

The **Bohlen–Pierce scale** was independently discovered by **Heinz Bohlen
(1972)** and by **Max Mathews & John R. Pierce** at Bell Labs in the 1980s.
Composer **Elaine Walker** (of the band ZIA) has been a leading practitioner of
BP music. The **clarinet / odd-harmonic affinity** — the clarinet's spectrum is
mostly odd partials and it overblows at the twelfth (the tritave) — is a
well-known reason BP and the clarinet are a natural pairing.

## Honest limitations

- Tilt mapping assumes the tablet is held at a moderate forward tilt (~35°); it
  is not auto-calibrated to the device's resting angle, so very flat or very
  upright holds drift the neutral point.
- The "clarinet" voice is a simple additive odd-harmonic stack, not a physical
  reed model — it is recognizably reedy but not a true clarinet timbre.
- Brush detection is circular and frame-based; fast passes can occasionally skim
  past a balloon without triggering it.
- The `deviceorientation` listener reference is re-created per render, so the
  add/remove pairing is approximate (harmless here, but worth tightening).
- No real reverb/space; the drone provides context but the room is "dry".

## Next-cycle deepening ideas

- Auto-calibrate the neutral tilt on first reading; add a tiny "re-center" tap.
- Move to a richer BP voice (waveshaping or a lightweight reed model) and add a
  second timbre family for the higher balloons.
- Let balloons drift slowly and re-cluster into different BP chords over time, so
  the harmonic "weather" of the sky changes.
- Optional 3:5:7:9 **tetrad** balloon-cluster that lights up when all four are
  brushed in a short window.
- A gentle generative arpeggio that follows the creature's path through the sky.
