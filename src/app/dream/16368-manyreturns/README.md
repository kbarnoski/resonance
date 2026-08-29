# 16368 · Many Returns

_Canon lineage, cycle 3 — 15824-canon → 16256-revenant → **16368-manyreturns**._

## What it is

A single one of Karel's real piano takes, grown into a **phase choir**. Not two
voices answering each other — a whole ensemble of the SAME recording, each copy
looping at a slightly different, incommensurate length, so the copies drift
through phase against one another forever and never re-sync. You both **see** and
**hear** the drift: the ensemble's phase-portrait is a field of hands sweeping
one shared clock at different rates, blooming wherever two of them coincide.

It is genuinely different at minute five than at minute one — because the drift
accumulates and the choir ages.

## How to play

- **Begin the choir** — loads the take and commits the first voice. The ensemble
  then builds itself: a fresh voice enters every 4–6 seconds until ~5 are live.
  Walk away for thirty seconds on a phone and you'll already have a rich drifting
  choir with no input.
- **Add a voice** — commit the next incommensurate loop length yourself.
- **Thin the choir** — retire the oldest voice.
- **Click a hand** on the canvas — mute / unmute that individual voice.
- **Loop window** (5–10 s) and **drift spread** (0.3–2×) — shape how new voices
  relate: a longer window slows every hand; a wider drift spread makes the phases
  part faster. These reshape the composition, not just decorate it.
- **Take** — rebuild the whole ensemble from a different recording in Karel's
  verified catalog (Welcome Home + Snowflake).

## The incommensurate-loop mechanism (the heart)

A ~7-second window is chosen from the decoded take. Each voice ("ghost") is its
OWN `AudioBufferSourceNode` with `loop = true` and `loopStart` / `loopEnd` set to
give it a slightly different loop LENGTH — ratios ≈ **1.000, 1.037, 1.081, 1.129,
1.181, 1.237** (coprime-ish, so no two lengths share a common multiple and no two
voices ever come back into sync). A tiny per-voice detune (±~22 cents) and stereo
pan spread the choir across the field. There is **no granular grain-triggering** —
these are whole-buffer decoupled loops, the way tape loops of unequal length
drift on their own.

Every voice's gain terminates in the shared `safeMaster` bus — nothing reaches
`ctx.destination` directly.

## The phase-portrait visual (Canvas2D)

One shared **clock-ring**. Each live voice is a **hand** sweeping the ring; its
angle is the voice's current loop phase and its rate is proportional to
`1 / loopLength`, so the hands form an ever-shifting fan that never repeats. Where
two hands **coincide** (angular alignment within an epsilon — the exact
phase-coincidence that defines the drift) a soft radial **bloom** fires: these are
the visual "beats" of the piece, and they give the master a gentle level pulse.

Layered on top: faint **moiré chord-lines** connect the hand tips, and
**wear-rings** accumulate radial ticks wherever coincidences keep landing — a slow
memory trace of the drift that builds over minutes, so the portrait genuinely
evolves rather than looping. All texture comes from layered translucent hands and
wear, **no film-grain / noise overlay**.

## The aging / disintegration model

Each voice has its own `GainNode` + lowpass `BiquadFilter`. As a voice ages, its
cutoff slowly closes (≈6500 → 470 Hz over ~4 minutes) and its gain dims, so the
oldest voices recede into a dark wash while new ones enter bright. Live voices are
capped at 7; adding past the cap retires the oldest (fade + stop). Age reads
visually too: the newest hand is a sharp **bone** signal, older hands blur and
fade into the pewter wash — the picture mirrors the sound.

## Palette

**Ashlight / faded-archive** — a near-black pewter ground, each hand a different
desaturated grey tint (a narrow muted band, ~9% saturation), and one brighter
bone/off-white signal for the newest voice. Grey-forward, like layered faded
photographs.

## References

- **Brian Eno — _Music for Airports_ (1978)** — built from seven tape loops of
  incommensurate length that drift and recombine indefinitely. The core mechanism
  here.
- **Steve Reich — _Piano Phase_ / phase music** — identical material played at
  gradually diverging rates so the copies move out of and back toward alignment.
- **William Basinski — _The Disintegration Loops_** — loops that decay a little on
  each pass; the model for each voice's aging into a dark wash.

## Constraints honored

- Audio source = Karel's real catalog only (`loadRealTrackBuffer`); no
  oscillators/synths/generated tone, no `/api/featured`, no invented ids.
- `safeMaster` on every audible path; nothing reaches `ctx.destination` directly.
- No granular grain-triggering, no film grain, no substance references.
- Canvas2D only (no WebGL / WebGPU / three.js).
- Self-contained; cross-imports only from `_shared/`.
- Degrades gracefully (no Web Audio / no 2D context / load failure → on-brand
  notice, no crash) and cleans up all nodes + rAF on unmount.
