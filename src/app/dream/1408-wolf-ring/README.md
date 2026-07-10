# The Wolf Ring — walk the circle of fifths, and play the wolf

## The one question
**What if crossing into a *wrong* interval were a musical move you play on purpose?**

Most of this lab is drowning in always-consonant just-intonation and pentatonic
pieces where a note can never sound wrong. The Wolf Ring makes a specific,
historical, dramatic **wrong place** — the **wolf fifth** — into a landmark you
can visit and lean into. In a real circulating temperament, most fifths and
thirds are *purer and sweeter* than the equal-tempered piano, but that purity is
bought: all the leftover error (the comma) has to be banked somewhere, and in
these old tunings it is dumped almost entirely into one fifth, which then
**howls**. Here that fifth is a place on a 3-D ring you walk into. The wrong note
is the point.

## How to play
- **Begin** starts the audio (a soft held fifth — it is never silent afterward).
- **Tap a tile** to walk around the circle of fifths one step at a time. You hear
  the fifth between where you were and where you land, held as a drone.
- **Drag** anywhere on the stage to rotate the 3-D ring and bring other regions
  to the front. (Arrow keys ← → are a secondary walk fallback.)
- **Flip the temperament** (top bar: 12-TET · ¼-comma meantone · Pythagorean) to
  hear the *same* fifth retuned — the meantone thirds sweeten and the wolf
  appears or vanishes on the spot.
- **Walk onto E♭ from G♯** (or back G♯←E♭): that one edge is the **wolf**. It
  flares rose, the tiles recoil and shear, and the drone beats violently.
- Leave it alone for **5 seconds** and it walks itself around the ring, crossing
  the wolf on every lap so a cold glance still sees the payoff.

The readout shows the fifth's *size in cents*, its *distance from a pure 3:2*, and
its measured *beat rate in Hz* — the wolf's howl made legible.

## Subsystems
1. **`temperament.ts` — the tuning maths.** The 12 notes of each temperament are
   built genuinely by walking the chain of fifths outward from C at that
   temperament's generating fifth, then reduced into one octave. The wolf is
   **not hand-placed** — it *emerges* as the gap where the broken chain wraps
   (G♯ → E♭). Each edge's fifth, its deviation from pure, and its acoustic beat
   rate are derived from the pitch-class arithmetic.
2. **`audio.ts` — the sustained-triad instrument.** Three persistent voices
   (root, major third, fifth), each with partials up to the 3rd harmonic. The 3rd
   partial of the root and the 2nd partial of the fifth coincide for a pure 3:2,
   so a tempered fifth makes them **beat** — the howl is real acoustic roughness
   from real detuning, not an effect. Steps glide the oscillators and pulse a
   swell, so time is gestural. Routed through a code-generated convolution reverb
   for cosmic space, then a master gain (≤ 0.20) and a limiter.
3. **`page.tsx` — the DOM/CSS-3D ring.** 12 real `<button>` tiles arranged with
   `rotateY(i·30°) translateZ(radius)` inside a `preserve-3d` ring under
   perspective. No canvas, no WebGL — a genuine transformed-DOM instrument.

## Temperament maths

| Temperament          | Generating fifth        | Major third           | Wolf fifth (G♯→E♭)      |
|----------------------|-------------------------|-----------------------|-------------------------|
| Equal (12-TET)       | 700.000¢                | 400.000¢              | *none* (all fifths 700¢)|
| ¼-comma meantone     | 696.578¢ (−1/4 comma)   | **386.314¢ — pure 5:4** | **737.637¢ (very wide)**|
| Pythagorean          | 701.955¢ — **pure 3:2** | 407.820¢ (sharp)      | 678.495¢ (narrow)       |

- A pure fifth (3:2) is **701.955¢**. Meantone flattens it by a quarter of the
  syntonic comma so that four fifths make a *pure* major third; 11 such fifths
  leave a wide 737.6¢ wolf to close seven octaves.
- Pythagorean stacks pure 3:2 fifths; the leftover **Pythagorean comma**
  (≈ 23.5¢) becomes a *narrow* 678.5¢ wolf, and the thirds run sharp.
- Beat rate of a fifth = `f · |3 − 2·2^(cents/1200)|` (root ≈ 131–262 Hz here).
  A meantone fifth shivers a couple of Hz; the meantone wolf thrashes ~10–17 Hz.

## References
- **Quarter-comma meantone** — Pietro Aron, *Toscanello in musica* (1523); the
  standard keyboard temperament of the Renaissance/early Baroque.
- **Andreas Werckmeister** (*Musicalische Temperatur*, 1691) and **Francesco
  Antonio Vallotti** — well-temperaments that *circulate* the comma so no key is
  unusable while each keeps its own colour; the direct ancestors of the idea that
  a temperament is a set of expressive trade-offs, not a single "correct" tuning.
- **Adam Neely** — his tuning/temperament videos (on meantone, the comma, and why
  equal temperament is a compromise) are the living reference for this concept.

## What's fragile / honest notes
- The **third above the wolf root** uses each temperament's nominal major-third
  size rather than re-deriving the enharmonically-spelled note through the broken
  chain. The *fifth* (the wolf itself) is fully genuine; the added third is there
  to expose thirds-sweetness on the toggle, kept quieter than the fifth.
- Beat rates depend on register; the ring is anchored one octave from C3, so the
  numbers are honest for these frequencies, not absolute.
- Back-facing tiles show mirrored labels — deliberate: they read as dim ghosts of
  the far side of the ring, not primary controls.
- Drag-vs-tap is disambiguated by a small movement threshold; a very slow tap
  that drifts a few pixels still registers as a walk.
- All motion (wolf recoil, halo pulse) is held at ~1.1 Hz, well under the 3 Hz
  safety ceiling, and is disabled under `prefers-reduced-motion` (colour still
  changes). No strobe anywhere.
