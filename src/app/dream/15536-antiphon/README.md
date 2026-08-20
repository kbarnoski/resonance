# 15536 · antiphon

**"What if five of Karel's separate takes were scattered across a dark cathedral
as distinct voices calling and answering each other antiphonally — and you had
to WALK between them to stand inside his own counterpoint, the mix being nothing
but where you're standing in the room?"**

## The concept

Six of Karel's real recordings are placed at fixed points in a cathedral **nave**:

| Voice (real take) | Station |
| --- | --- |
| Interplay | left choir stall · front |
| Bath | right choir stall · front |
| 2019 | the altar (far center) |
| Rolling | right choir stall · rear |
| Welcome Home | left choir stall · rear |
| Isolation | the narthex (behind you) |

Each voice loops its own real buffer continuously and is spatialized by its own
Web Audio **`PannerNode`** (`panningModel: "HRTF"`, `distanceModel: "inverse"`,
`refDistance 3.5`, `rolloffFactor 1.1`, `maxDistance 60`) at its 3D coordinate.
The Web Audio **`AudioListener`** is your body. There is no "mix" control — the
mix is your position and facing.

## The load-bearing verb: NAVIGATE

- **WASD / arrow keys** walk the listening point through the nave (W/↑ forward,
  S/↓ back, A/D strafe), with smooth inertial velocity + damping.
- **Q / E** (or **← / →**) rotate the facing direction, so the antiphony swings
  left ↔ right around your head.
- **Touch d-pad** (forward / back / turn-left / turn-right, all ≥44 px) for
  mobile.
- Movement is clamped inside the nave walls. There is **no pointer-drag** control
  — navigation is entirely keyboard/d-pad, per this cycle's ban.

Step toward a stall and its take dominates your ears; cross the nave and it
recedes and swings behind you.

## The antiphonal relationship (≥5 real takes in genuine conversation)

Over the spatial field runs a slow **antiphonal cycle**. A continuous pointer
`P = ctx.currentTime / STEP` travels the six stations in physical order
(left → right → altar → back → narthex → around). For each voice a raised-cosine
envelope over its circular distance from `P` sets its per-voice **`GainNode`**
swell via `setTargetAtTime` with a glacial `0.4 s` time-constant, clamped ≤ 0.9:

- the voice the pointer is on **calls** (swells up, glows bone → amber);
- the take just behind it **answers** — an asymmetric, longer tail
  (`W_BEHIND 1.7` vs `W_AHEAD 0.85`) keeps it ringing in oxblood as the new call
  arrives, so **one or two voices overlap in genuine call-and-response** at all
  times;
- the rest hold a quiet bed (`0.1`) so the whole field stays faintly alive.

All six of Karel's takes are in simultaneous / answering relationship — the
catalog as a corpus conversing with itself, **not** one take through a transform.

## Audio source

**Karel's REAL catalog only. Zero synthesis.** Every voice is one real looping
recording loaded via `loadRealTrackBuffer` (verified anon-servable Welcome Home /
catalog ids). No `OscillatorNode`, no `createOscillator`, no `createConstantSource`.

Signal path per voice: `bufferSource → PannerNode → per-voice GainNode →
safeMaster.input`. A passive `analyser` tap off the source adds a subtle
own-amplitude shimmer to the glow. Nothing connects to `ctx.destination` directly
— the shared `createSafeMaster` bus is the only path to the speakers.

## Visual

three.js: a dark warm-stone nave — a receding floor grid to a vanishing point,
tall column silhouettes lining both sides, an altar slab, and a glowing
voice-node at each take's position. A slightly-raised third-person chase camera
follows the walking point; a bone-white "you are here" ring + an amber facing
arrow sit on the floor. Palette is a two-tone **bone-white + oxblood-red** register
on near-black candle-lit stone (no grayscale, no cyan/teal/indigo, no rainbow).

## Graceful degrade

- **No WebGL** → the three layer is skipped and a DOM/SVG **top-down nave map**
  renders instead (voice circles that brighten/colour with the antiphon, a
  you-are-here marker + facing line), with audio + WASD navigation fully live.
- **HRTF unsupported** → falls back to `"equalpower"` panning.
- **Audio fails to load** → `text-destructive` message; partial failures skip the
  dead takes and keep the rest answering.
- `prefers-reduced-motion` disables camera bob.

## Named references

- The **2026 Spatial Sound Forum** (Berlin): spatial sound as "shaped by bodies,
  rooms and shared attention — sound as an environment, not a fixed event."
- **Antiphonal / *cori spezzati*** practice — Giovanni Gabrieli at San Marco,
  Venice, spatially separated choirs answering across the basilica.
- Janet Cardiff's **_The Forty Part Motet_** — each voice its own point in space
  you walk among.

## Honest notes on what's unverified

I can't hear or see this run, so:

- **Balance of the antiphony vs. spatial attenuation is untuned by ear.** `STEP`,
  the bed level, the two envelope widths, and the panner distance constants were
  chosen by reasoning, not listening; the call may feel too fast/slow or the bed
  too loud/muddy with six real piano takes summing at once. The safeMaster
  limiter should prevent anything harsh, but the musical read is unconfirmed.
- **HRTF front/back disambiguation** of the altar vs. narthex voices depends on
  the browser's HRTF and headphones; on speakers the "behind you" voice may not
  localize clearly.
- **`setTargetAtTime` called every frame** on the swell gains (chasing a
  smoothly-moving target with a 0.4 s constant) is standard and click-free in
  theory, but I haven't confirmed it stays smooth under real frame-rate jitter.
- **Third-person camera + listener coupling**: the AudioListener sits at the
  walking point while the camera trails it — verified in code, but whether the
  visual and the binaural image feel co-located is a by-ear judgment I couldn't make.
- The **DOM fallback map** was written blind against the same engine; its
  coordinate mapping is plausible but unverified visually.

## Self-check

- Zero `createOscillator` / `createConstantSource` / `OscillatorNode`. ✅
- Zero direct `ctx.destination` — everything through `safeMaster.input`. ✅
- Cross-prototype imports only from `../_shared/`. ✅
- No `api/` route added. ✅
