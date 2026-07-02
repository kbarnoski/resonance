# 1107 · Chromatic Organ — a pianist's chromesthesia color-organ

**The one question:** What if playing notes made you *see* the music — a live
synesthete's-eye view where every pitch bursts into its own saturated colour and
polyphony interferes into shimmering moiré, all in bright daylight rather than a
dark void?

This is a **live-performance instrument**, not a tap-to-seed toy. You play it
with a MIDI keyboard or the computer keys, and a single note event drives *both*
the synth voice and the shader — so what you hear and what you see can never
drift apart.

## Play it

- **Web MIDI** — plug in a keyboard; the piece calls `navigator.requestMIDIAccess()`
  and listens for note-on/note-off with velocity. Absent or blocked, it degrades
  silently to the computer keyboard.
- **Computer keyboard (always on)** — white keys `A S D F G H J K` = C D E F G A B C;
  black keys `W E T Y U` = C# D# F# G# A#. `Z` / `X` shift the octave. Key-repeat
  is ignored so held notes sustain cleanly.
- **Idle arpeggio** — after ~4s of silence a slow, deterministic (seeded by step
  index, no runtime `Math.random`) arpeggio fades in so a phone glance is never
  blank or silent. Any real input interrupts it instantly.

## The Scriabin mapping

Colours come from Alexander Scriabin's **clavier à lumières** ("keyboard of
light") — the colour-organ part he scored into his 1910 tone-poem *Prometheus:
The Poem of Fire*. Scriabin laid the twelve pitch-classes around the **circle of
fifths** and gave each a colour. The canonical table, as hard-coded in
`chromesthesia.ts`:

| Pitch | Scriabin colour            | Circle-of-fifths position |
|-------|----------------------------|---------------------------|
| C     | red                        | 0                         |
| G     | orange (rosy-orange)       | 1                         |
| D     | yellow                     | 2                         |
| A     | green                      | 3                         |
| E     | sky / whitish blue         | 4                         |
| B     | pale blue (bluish-white)   | 5                         |
| F#    | bright blue / blue-violet  | 6                         |
| Db    | violet                     | 7                         |
| Ab    | purple / lilac             | 8                         |
| Eb    | steel (metallic flesh-grey)| 9                         |
| Bb    | rosy steel (metallic)      | 10                        |
| F     | deep red (crimson)         | 11                        |

- **Octave → brightness.** Higher octaves lift the colour lighter and tighten the
  lattice spacing.
- **Velocity → intensity.** Harder strikes deposit more saturated pigment and a
  brighter FM attack.

## How polyphony becomes moiré

Each sounding note contributes an aspect-corrected **plane wave** to a WebGL2
fragment shader (`renderer.ts`), oriented by its pitch-class around the circle
and with a spatial frequency set by its pitch. The shader **superimposes** (sums)
every active note's wave. Two waves of nearby frequency/orientation beat against
each other, and the fringes of that beat are where pigment is deposited — so two
or more notes literally interfere into **shimmering moiré lattices**. This is the
magic: a single note is a clean set of coloured bands; a chord is a living
interference pattern whose colour is the velocity-weighted blend of the notes at
each fringe.

Sustained notes leave a gentle **ping-pong feedback afterglow**: each frame the
previous buffer is decayed *toward warm paper* (not toward black) and fresh
pigment is composited on top. Because the decay target is bright, the mean
brightness stays roughly constant — the afterglow fades like watercolour drying,
with **no strobe**.

## Palette decision — daylight, not the void

The lab's default look is glow-on-black. This piece deliberately refuses that. It
lives on a **warm paper-white ground** (`#f4efe6` / paper `[0.965, 0.95, 0.92]`)
that the Scriabin colours bloom *onto*, like pigment on a page — closer to
Scriabin's synesthetic vividness and to saturated flat-colour fields (Anadol,
Ikeda) than to a dark nebula. The feedback decays toward that paper, so even a
dense chord reads as luminous colour on light, never neon on black. This is the
single most important art constraint on the build and it is enforced in the clear
colour, the decay target, and the UI (dark translucent chips over the bright
canvas for contrast).

## Audio

`audio.ts` is a **2-operator FM** engine (Web Audio API): a carrier
`OscillatorNode` frequency-modulated by a modulator (2:1 ratio) through a
modulation-index `GainNode` whose envelope makes the attack bright and the
sustain mellow — a warm Rhodes/bell character. Each voice has an ADSR amplitude
envelope. Voices sum into a master gain → a `DynamicsCompressor` (threshold −6,
ratio 12, as a limiter) → `destination`. Polyphony is capped at **8 voices with
oldest-voice stealing**. The `AudioContext` is created and resumed only behind
the **▶ Play / Start** gesture, per autoplay policy.

## Graceful degradation & accessibility

- **No MIDI** → keyboard stays live and the status chip says so.
- **No WebGL2** → a readable notice replaces the canvas instead of crashing.
- **Never blank/silent** after Start — the idle arpeggio guarantees motion + sound.
- **`prefers-reduced-motion`** → wave temporal speed and afterglow drift are
  damped and the decay is held calmer.

## Next-cycle deepening

1. **Detected-chord → palette mode.** Analyse the held pitch-set (major / minor /
   whole-tone / octatonic) and morph the whole ground toward that chord's Scriabin
   "mystic" tint — Scriabin's own harmonic-colour idea taken to the sonority level.
2. **MIDI-CC morph.** Map a mod-wheel / expression pedal to spatial frequency and
   decay so a performer can sweep the moiré from coarse bands to fine shimmer live.
3. **Real-hardware MIDI pass.** Test on physical controllers (aftertouch →
   pigment density, pitch-bend → wave orientation) and add a channel/device picker
   for multi-keyboard rigs.

## Files

- `page.tsx` — client component: input handling (MIDI + keyboard + idle), render
  loop, UI, design-notes panel.
- `renderer.ts` — WebGL2 ping-pong feedback color-organ (plane-wave superposition
  → moiré).
- `audio.ts` — 2-op FM polyphonic synth with limiter and voice-stealing.
- `chromesthesia.ts` — the Scriabin colour table and note/frequency helpers.
