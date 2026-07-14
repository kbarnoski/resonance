# 1692 · Friction Loom

**The one question:** What if a pointer-drag gesture were a *bow* — dragging across strings with real stick-slip friction, giving the scratch → pitch → over-pressure continuum that a plucked model can't?

A small field of six sympathetic strings (D-major pentatonic, D4→D5) rendered on Canvas2D over a warm rosin/wood ground. The pointer is the bow. There are no keys and no triggers: sound exists only while you are dragging, and the *gesture itself* — how fast, how hard, across which string — is the whole performance.

## How to play

1. Press **Start bowing** (needed to resume the AudioContext under browser autoplay rules).
2. Press and drag on the loom. The pointer is the bow hair.
   - **Vertical drag** over a string = a bowing stroke along that string.
   - **Horizontal drag** = move the bow to a different string (a light strum-with-friction as you cross each one).
   - **Slow** drag → an airy surface harmonic (the hair barely grips).
   - **Medium, steady** drag → a singing Helmholtz tone.
   - **Fast / hard** drag → the bow over-presses into a raucous multi-slip *bite*.
   - **Stop** → the string decays to silence. Bowed = sustained *while bowing*, gesture-articulated, never a drone.
3. Release the pointer and a deterministic **ghost bow** takes back over, sweeping the airy → singing → bite continuum by itself so the piece is never blank or silent.

The on-canvas readout shows live bow speed, pressure, the current regime, per-string brightness, and a LIVE/GHOST badge.

## The friction model

Each string is a **digital-waveguide bowed string**: two velocity-wave delay lines (a nut segment and a bridge segment) form the string, terminated by a sign-inverting nut reflection and a lossy one-pole bridge reflection. At the bow contact, **every audio sample** runs the classic bow-string interaction:

1. read the velocity waves arriving at the bow from each side;
2. sum them → the string velocity under the bow;
3. `delta = bowVelocity − stringVelocity` (the *slip velocity*);
4. pass `delta` through a friction characteristic `bowTable(delta)` — near `delta = 0` the hair **grips** (reflection ≈ 1, "stick"); as `|delta|` grows it **slips** and the reflection collapses toward 0;
5. scatter `delta · bowTable(delta)` back into both outgoing waves.

The grip/slip alternation self-sustains the Helmholtz corner that circulates the loop; the bow tops up the energy lost at the bridge each period. **Bow speed** maps to loudness/brightness; **bow force** widens the `bowTable` slope so the grip persists over a larger slip range — light grip thins the tone toward a whistling harmonic, heavy grip over-presses into a crushed multi-slip bite. A faint bridge cross-talk term couples the six strings so idle strings ring sympathetically. It runs in an `AudioWorkletProcessor` built from a **Blob URL** (no external file, no network); see `worklet-source.ts`.

**Determinism:** the ghost bow is derived entirely from a frame counter (`Math.sin` of the frame index) — no `Math.random`, no `Date.now`, no wall-clock in the music path. `performance.now`-style timing (via the rAF timestamp) drives only the purely-visual Helmholtz-corner animation.

**Safety:** the master bus is `worklet → lowpass → DynamicsCompressor → gain(0.12) → destination`; the worklet clamps its internal velocities, `tanh`-saturates the bus, and the bridge loss (<1) removes energy every loop, so the limit cycle settles instead of exploding and the model cannot blow up.

**Graceful degradation:** if Web Audio or AudioWorklet is unavailable, an on-brand notice appears and the visual + ghost keep running (the canvas envelope is driven locally from the bow gesture).

## References

- McIntyre, Schumacher & Woodhouse, *"On the oscillations of musical instruments"*, JASA 74(5), 1983 — the canonical stick-slip bow-string interaction / Helmholtz-motion model this waveguide implements.
- Chris Chafe (CCRMA) — physical-model bowed strings; the same friction loop underlies his bowed digital waveguides.
- Related: Julius O. Smith, *Physical Audio Signal Processing*, "The Bowed String" (the STK `Bowed` topology this follows).

## Honest limitations

- The `bowTable` is the STK-style hyperbolic approximation of the friction curve, not a full elasto-plastic / LuGre bristle model with a Stribeck hump — the stick/slip transition is a single smooth reflection function rather than a hysteretic bristle. It is audibly convincing across all three regimes but a purist would hear a slightly simplified slip character.
- Bow velocity **and** force are both derived from a single 2-D pointer (per-frame speed), so you cannot independently hold a slow bow at high pressure the way a real player can; the continuum is traversed primarily by speed.
- Delay lengths are integer (no fractional-delay interpolation), so pitches are quantised to the nearest sample period — fine at this register, slightly off perfect tuning at the top string.
- Sympathetic coupling is a scalar bridge cross-talk term, not a modelled bridge admittance, so the sympathetic ring is suggestive rather than physically exact.
- The visualised Helmholtz corner runs on a slowed *visual* clock for legibility; it depicts the motion, it is not a sample-accurate readout of the string state.

## Not to be confused with

`320-kids-light-loom` is the lab's kids' continuous-bow *light toy*. This is the adult gestural instrument: a real MSW-1983 stick-slip nonlinearity, a multi-string sympathetic field, and the full scratch → tone → over-pressure continuum.
