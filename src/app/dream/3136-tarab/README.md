# 3136 · Tarab

**Route:** `/dream/3136-tarab`

## The one question

**What if pressing a single key woke a whole body of sympathetic strings — the
note you _decide_ to play joined by everything that rings in sympathy behind
it?**

A MIDI / keyboard instrument. Twenty-five playable strings stand in front; a
rack of twenty-two _tarab_ (sympathetic) strings hangs behind. Strike one key
and it blooms into a chord of ringing overtones — the strings that resonate are
the strings you both hear decay and watch shiver.

## How the sympathetic coupling is modelled

The core technique is **modal / sympathetic-resonance coupling** (a resonator
bank), implemented as **shared-partial spectral overlap**:

- Each string is treated as a set of partials. A struck driver at `f0` radiates
  partials `k·f0`; a tarab string tuned to `fs` owns partials `j·fs`.
- The coupling between them is the best coincidence of any driver partial with
  any tarab partial, weighted `1/(k·j)` so the lowest-order agreements dominate:

  ```
  coupling(f0, fs) = max over k,j in 1..6 of
      (1/(k·j)) · exp( -( cents(k·f0, j·fs) / 30 )² )
  ```

- This yields the physical ordering of sympathetic resonance on a sarangi/sitar:
  **unison = 1.0, octave ≈ 0.5, perfect fifth ≈ 0.17, fourth ≈ 0.08**, etc.
  Strings below a 0.06 threshold stay dark and silent.

When you play a note, the driver is a Karplus-Strong pluck at its **true pitch**,
and every tarab string above threshold is triggered with amplitude proportional
to its coupling, a slow sympathetic build-up (attack grows as coupling falls),
and a long (up to ~6 s) decay. A lone key press therefore produces a clearly
richer, longer sound than a dry oscillator — the whole point of the piece.

The tarab rack is tuned in **just intonation** (a warm, Bilaval-leaning raga:
`1, 9/8, 5/4, 4/3, 3/2, 5/3, 15/8` across three octaves), while the keybed is
**honest equal temperament** — there is deliberately **no quantizer** rounding
your pitch onto a scale. Because the two tunings differ, a consonant note blooms
fully while an out-of-key note only shimmers: choosing the right note _is_ the
instrument.

## Audio → geometry weld

Every tarab string is a **real three.js line** whose interior vertices displace
along a decaying standing wave (`sin(π·u·mode)` envelope pinned at nut and
bridge, times a per-string shimmer). Displacement amplitude comes from the same
coupling map that drives the audio, so the string you _watch_ ring is exactly
the string you _hear_ ring. This is real geometry — not a raymarch or a
fullscreen shader — with an UnrealBloom pass only for warm glow.

## Named references

- The **tarab** sympathetic strings of the **sarangi / sitar** — the physical
  instrument this models.
- La Monte Young, **_The Well-Tuned Piano_** — the sympathetic-resonance /
  just-intonation shimmer aesthetic.
- Jean-Marie Adrien, **“The missing link: modal synthesis”** (1991) — the
  classical view of each string as a resonant mode and coupling as spectral
  overlap.

## Tags

- **INPUT:** Web MIDI (`navigator.requestMIDIAccess`), primary. Fallback:
  computer keyboard.
- **OUTPUT:** three.js instanced line geometry (front rack + sympathetic rack),
  vertices displaced by a standing wave; UnrealBloom post pass only.
- **CORE TECHNIQUE:** modal / sympathetic-resonance coupling (Karplus-Strong
  resonator bank + shared-partial coupling law).
- **PALETTE / VIBE:** warm resonant instrument, violet-leaning ramp, dark
  ground; decision-stakes, not cosmic.

## Controls

- **Start the instrument** — creates the AudioContext (after the gesture) and
  builds the scene.
- **Web MIDI** — plug in a controller; note-on events strike the keybed at their
  true pitch.
- **Computer keyboard** (no MIDI needed):
  - `A S D F G H J K L` — white keys
  - `W E T Y U` — black keys
  - `Z` / `X` — shift octave down / up
- **Autoplay / demo** — plays a deterministic seeded phrase through the exact
  same code path, so the piece self-demonstrates with no input device and no
  speakers required.
- **Read the design notes** — in-app modal summarising this file.

## Determinism

No `Math.random`, `Date.now`, or argless `new Date()` anywhere. All randomness
(Karplus excitation, string phases, demo phrase) comes from `mulberry32(seed)`
with constant seeds; all timing uses `performance.now()`.

## Known limitations

- WebGL line width is fixed at 1px on most platforms, so string "thickness" is
  conveyed by brightness + bloom rather than geometric width.
- Sustained fast playing overlaps many long tarab voices; they are bounded only
  by the coupling threshold and the master gain / compressor, not a hard voice
  cap.
- Plucks are one-shot (a plucked string rings out), so MIDI note-off does not
  damp the sound — there is no sustain-pedal / palm-mute gesture.
- If WebGL is unavailable, the strings are not drawn (a `text-destructive`
  notice appears) but the sympathetic audio and autoplay still work.
