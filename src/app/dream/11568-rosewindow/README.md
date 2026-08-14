# 11568 · Rose Window

**The one question:** what if playing a keyboard drew a living cathedral
rose-window — a radial mandala — where each note is a petal in the exact
colour Olivier Messiaen said he *saw* for it, and chords fuse into one
blended illuminated rose?

## What it is

A polar mandala, twelve spokes around a bright central boss, four
concentric rings of petals — 48 petals in all. Play a note and its petal
blooms in a jewel colour drawn from Messiaen's documented sound-colour
vocabulary; play a chord and the lit petals' glow halos add together under
`mix-blend-mode: screen`, fusing into one blended arc of stained glass, the
way real cathedral glass panels bleed light into one another. Every note
also rings an additive detuned-sine organ/celeste voice through a
synthesised cathedral reverb tail.

## How to play it

Three input paths, all live at once, shown in the `input · …` caption
top-right:

- **Web MIDI** — plug in a keyboard; hot-plugging is handled.
- **Touch** — tap anywhere on the rose. The whole window is the hit-surface
  (angle → pitch class, radius → octave ring), not 48 sub-44px slivers, so
  it's genuinely playable with a thumb on a phone. Multi-touch works — each
  finger sounds its own note independently.
- **Computer keyboard** — `a s d f g h j k` (ring 2) and `z x c v b n`
  (ring 1) are both tuned to Messiaen's favourite octatonic scale (Mode 2
  T1), so even the QWERTY fallback plays inside his sound-world.

Sound only starts after the "Enter · unlock sound" button (or any first
tap/keypress) — browsers block audio before a user gesture. The rose itself
is already breathing and self-playing in *silence* the instant the page
loads, so a muted phone on a review call sees the mandala alive within
about a second; the first real input takes over into play mode, and after
~22s of silence the self-demo quietly reclaims the rose.

## The layout

Pitch class → **angle** (12 spokes at 30° apart, pc 0/C at the top,
clockwise — the twelve stone lights of a Gothic rose window). Octave →
**radius ring** (outer ring = octave 3/lowest, inner ring = octave 6,
closest to the light — four rings covering roughly the range of a small
portable keyboard). Velocity → glow ceiling brightness. Register (ring) →
a fixed depth/shimmer tint baked into each petal's base colour: outer rings
mix slightly toward black (deeper, more "leaded"), inner rings mix slightly
toward white (brighter, more luminous) — see `registerTint()` in
`messiaen.ts`.

## The Messiaen colour mapping

Messiaen's synaesthesia, documented across decades of interviews (most
fully in *Music and Color: Conversations with Claude Samuel*, 1986) and his
own *Traité de rythme, de couleur, et d'ornithologie*, tied colour to whole
**chords and modes**, not individual pitch classes — he never published a
"C is red" chart the way Scriabin did. To build a 12-spoke wheel this file
extrapolates one jewel colour per pitch class from the mode-family each
note sits inside most characteristically, drawing only from hues he
actually named:

| PC | Note | Colour | Messiaen's own words (paraphrased) |
|----|------|--------|--------------------------------------|
| 0 | C | Amber-gold `#E8A23A` | Mode 3 — orange-gold ground |
| 1 | C♯ | Blue-violet `#4B2FBE` | Mode 2 T1 — "blue-violet rocks flecked with gold," his favourite |
| 2 | D | Vermilion `#D8481F` | Mode 3 — orange-red |
| 3 | D♯ | Emerald `#1E8F5F` | Mode 2 T3 — green facet |
| 4 | E | Ruby `#A81238` | Mode 6/7 — dominant red |
| 5 | F | Milky pearl `#CFE7DE` | Mode 2 T2 — "milky-white ground" |
| 6 | F♯ | Amethyst `#7C2FA6` | Mode 5 — mauve-violet |
| 7 | G | Grey-gold `#9C8A5E` | Mode 4 — grey stained glass |
| 8 | G♯ | Cobalt `#1E4FA8` | Mode 6 — blue half |
| 9 | A | Topaz `#C98A17` | Mode 2 T2 — "gold and brown" |
| 10 | A♯ | Carmine rose `#B23E72` | Mode 5 — mauve-pink |
| 11 | B | Slate mauve `#6B6478` | Mode 4 — blue-grey mauve |

Separately, and more faithfully, `detectMode()` in `messiaen.ts` actually
matches the set of currently-held pitch classes against Messiaen's real
**Mode 1** (whole tone, 2 transpositions) and **Mode 2** (octatonic, 3
transpositions) pitch-class sets, and when three or more held notes fit one
cleanly, the whole rose washes toward that mode's documented colour (a
soft, screen-blended `--mode-c` overlay) — this part is a genuine detector,
not decoration. Mode 2 T1 washes the rose blue-violet, which is exactly why
the QWERTY fallback is tuned to that scale: play a few keys together and
you'll usually see Messiaen's favourite colour bloom across the window.

## The CSS-compositor technique

Zero canvas, zero WebGL/WebGPU, zero SVG path art. `rosewindow.module.css`
is the entire renderer:

- **Tracery** — a `repeating-conic-gradient` for the 12 stone spokes plus a
  hand-placed `radial-gradient` for the 4 ring guides, both static.
- **48 glow petals** — one `radial-gradient` + `filter: blur(...)` div per
  (pitch-class, ring) cell, all painted as siblings under
  `mix-blend-mode: screen` inside an `isolation: isolate` stage, so
  adjacent lit petals' halos genuinely *add* into new colours rather than
  simply overlapping.
- **48 crisp petals** — a second, smaller, un-blurred layer on top for
  sharp jewel identity even when nothing nearby is lit.
- **The boss** — a bright central glow, screen-blended, colour and alpha
  driven by chord activity and the detected mode.
- A single `requestAnimationFrame` loop writes exactly one custom property
  per changed petal (`--a`, the glow alpha) directly via
  `element.style.setProperty()` — React state never changes per frame, so
  there is no React re-render in the hot path.
- The only thing that visibly *rotates* is the decorative tracery layer, at
  one revolution per ~3.5 minutes (or ~15 minutes under reduced-motion) —
  the petals themselves stay put so tap targets never drift.

## References

- Olivier Messiaen's chord→colour synaesthesia and his seven **Modes of
  Limited Transposition**, documented in *Music and Color: Conversations
  with Claude Samuel* (1986) and his *Traité de rythme, de couleur, et
  d'ornithologie*.
- The Gothic **rose-window** tradition — Chartres, Notre-Dame de Paris — as
  the formal template for a radial mandala of coloured light.

## Honest limitations

- The 12-pitch-class colour wheel is an artistic extrapolation from
  Messiaen's documented palette, **not** a transcription of an actual
  Messiaen chart — he associated colour with chords/modes, not single
  notes, and this is said plainly above rather than overclaimed.
- Only Mode 1 (whole tone) and Mode 2 (octatonic) are actually pattern-
  matched by `detectMode()`. Modes 3–7 inform the per-pitch-class jewel
  hues but are not separately detected as chords — extending the detector
  to all seven modes (and all of their transpositions) was cut for scope;
  the honest three-and-five-set detector was kept over a fudged "closest
  match to everything" heuristic.
- There is no true optical dispersion, caustics, or light refraction —
  "stained glass" here means jewel-toned gradients and additive colour
  mixing, not a physically simulated glass material.
- Four octave rings is a deliberate compression of the full keyboard range;
  MIDI notes outside octaves 3–6 clamp to the nearest edge ring rather than
  scrolling the mandala.
- No `Math.random`, `Date.now()`, or `new Date()` anywhere in the code —
  the self-playing chorale is driven entirely by an inline `mulberry32`
  PRNG seeded on the literal constant `11568` (this prototype's own route
  number), and all timing comes from `performance.now()` / the animation
  frame clock.
