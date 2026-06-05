# 341 · Star Pair

**The one question:** *What if TWO young children, each on their own screen, could
hear musical consonance happen BETWEEN them in real time — by each sliding their
own glowing star up and down until the two stars sing in tune and LINK with a beam
of light?*

This is the lab's first real-time **simultaneous two-child co-play** piece. The
magic is interpersonal: two humans, two stars, each holding one voice, discovering
the lock *between* them.

---

## How to play (no reading required)

1. Tap **Play together ▸**. A warm drone fades in; your **violet star** and your
   friend's **cyan star** appear on two glowing arcs.
2. **Drag** your violet star up and down its arc. Up = higher pitch, down = lower.
   (Dragging is the reliable primary control for little hands.)
3. Or **hum** — the mic listens (analysis only) and moves your star to your pitch.
4. When the two stars are out of tune you'll *hear the beating* (a wobble/roughness)
   and *see* the stars jitter; a faint dotted line reaches between them and grows
   as you get closer.
5. When you find a consonant interval (within ±35 cents of a pure ratio) the stars
   **LOCK**: a bright **beam of light** links them, the beating stops, the stars
   pulse together, a soft chime + shimmer plays, and **sparkles ✨ burst** along the
   beam. That discrete, unmistakable "the two stars connected!" moment is the heart
   of the toy.

**Two screens:** open `/dream/341-kids-star-pair` in two tabs/devices on the same
origin. Each shows its own violet star and the other's cyan star, synced live. The
badge reads **friend 👫** (violet) when a real peer is present.

**Solo / one phone:** if no second player appears within ~3 seconds, a gentle
**robot 🤖** drives the friend-star — drifting slowly and *pausing near
consonances* so a lone child (or a reviewer on one device) can chase and catch the
beam-lock. The whole find-the-lock loop is fully playable by one person.

---

## Subsystems (all in this folder)

| file | role |
|------|------|
| `page.tsx` | client component; Start gesture, drag, single rAF loop, wiring |
| `audio.ts` | Web Audio: always-on D drone + two voices + lock chime/shimmer, master through a brick-wall limiter |
| `tuning.ts` | pitch ↔ arc-position mapping + just-intonation consonance scoring |
| `sync.ts` | BroadcastChannel presence + pitch sharing (no server) |
| `pitch.ts` | analysis-only mic pitch detection (autocorrelation) |
| `scene.ts` | **raw WebGL2** renderer — stars, beam, sparkles, background |

**Renderer:** raw WebGL2 + hand-written GLSL ES 3.00 only. Two programs
(background gradient/starfield/arcs quad; additive glow-quads streamed into one
dynamic VBO for the stars, beam, and sparkles). **No SVG, no Canvas2D, no
three.js, no WebGPU.** If WebGL2 is unavailable, a rose notice shows and audio +
the tuning loop keep running.

**Audio:** Web Audio API only, everything synthesized. The acoustic **beating you
hear is real** — the two voices physically interfere; we do not fake it. The whole
master bus passes through a `DynamicsCompressor` configured as a brick-wall limiter
(low threshold, high ratio, fast attack) so it can never blast.

**Mic:** the `MediaStreamSource` feeds **only** an `AnalyserNode`; it is never
connected to a destination, never recorded, stored, uploaded, or routed anywhere.
No network calls of any kind. `AudioContext` and `getUserMedia` are both created
inside the Start tap (iOS rule).

---

## Just-intonation consonance set

We score the interval between the two stars against pure small-integer ratios,
folded into one octave (so 3:2 and 3:1 both read as "a fifth"). Lock window is a
**generous ±35 cents** — these are four-year-olds.

| ratio | name | cents above unison |
|-------|------|--------------------|
| 1:1 | unison | 0 |
| 6:5 | minor third | 315.6 |
| 5:4 | major third | 386.3 |
| 4:3 | perfect fourth | 498.0 |
| 3:2 | perfect fifth | 702.0 |
| 5:3 | major sixth | 884.4 |
| 2:1 | octave | 1200 |

Drone root: **D2 ≈ 73.42 Hz**; the two playable voices ride an exponential arc
from ≈ D4 (×4 ≈ 293.7 Hz) up to ≈ 624 Hz, so equal screen distance = equal musical
interval.

---

## Named references

- **Hermann von Helmholtz, *On the Sensations of Tone* (1863/1875).** The sensory
  theory of consonance and dissonance as the *absence vs. presence of audible
  beating/roughness* between partials. This piece makes that idea literally
  playable: out of tune → real beats you hear and see; pure ratio → the beats
  vanish and the beam locks.
- **`319-hub-score` (this lab).** The serverless `BroadcastChannel` lineage —
  same-origin tabs gossiping presence + state with no server and no network writes.
  `sync.ts` is that pattern pared down to exactly what two co-players need: each tab
  broadcasts its own star's pitch + heartbeat ~3×/sec.
- **Reggio Emilia pedagogy — group synchrony & joint attention.** The Reggio
  tradition treats learning as relational and collaborative; shared attention on a
  third object (here, the beam between the stars) scaffolds young children's
  social-musical discovery. The reward is explicitly *interpersonal* — it only
  happens when two voices meet.
- **Distinction from the SOLO `272-kids-tune-purr` (honest).** `272` is a *solo*
  tuning toy: one child tunes creatures against a *fixed drone*, and the reward is
  per-creature ("it stopped wobbling and started to purr"). `341` is different in
  kind: **two humans, each holding one live voice**, and the consonance happens
  *between them*. The lock is a single shared, discrete event (the beam) rather than
  a private per-creature state. The robot-friend solo fallback here is a *graceful
  degradation* of a fundamentally two-player design, not the primary mode.

---

## Unverified surface (honest)

- **Two-device cross-network play is NOT supported.** `BroadcastChannel` is
  same-origin, same-browser-profile only — it syncs tabs/windows on one machine (or
  is approximated per-device, where each device just sees the robot). True
  child-on-phone-A ↔ child-on-phone-B over a network would need a real transport
  (WebRTC/WebSocket), which this prototype deliberately does not build. The "two
  children on their own screens" promise is currently best demonstrated with two
  tabs/windows on one device.
- **Mic pitch detection is approximate.** The autocorrelation estimator is tuned for
  a child's hum (~120–1000 Hz) and biased toward stability over precision; octave
  errors and dropouts are possible in noisy rooms. Drag is the reliable primary;
  hum is a delightful secondary. Not validated against real 4-year-old voices.
- **Robot-friend "musicality" is heuristic.** It drifts and pauses near consonances
  with simple probabilities; it is tuned to *feel* catchable, not proven optimal.
- **Limiter settings are conservative but not measured.** Levels were chosen by ear
  for safety, not validated on a calibrated SPL meter across devices.
- **Beat visualization is a screen-space approximation.** Star jitter amplitude and
  speed are derived from |f1 − f2| via hand-tuned constants, not a physically exact
  rendering of the beat envelope (the *audio* beating, however, is real).
- **Not tested on real iOS/iPad hardware** in this environment; iOS-safe patterns
  (gesture-created context + getUserMedia, `100dvh`, `touch-none`) are followed but
  unverified on-device.
