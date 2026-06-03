# 291 · Harmonograph

> **The question:** What if the chord you play — on a MIDI keyboard, your
> computer keyboard, or an on-screen keyboard — *drew itself* as a Victorian
> harmonograph, so you can literally **see** the geometry of the harmony, while
> it sounds through a synth you can re-tune to pure just intonation?

## What it is

A live instrument. Hold a chord and a multi-pendulum **harmonograph** figure is
traced from the held notes in real time, glowing as an ink-on-dark line. A
prominent **Pure tuning (Just Intonation)** toggle re-tunes both the synth and
the geometry: when consonance locks in, the curve cleans up into a near-closed
spirograph figure *and* the audible beating settles — at the same instant. That
coupling (see it close, hear it settle) is the whole point.

## How the geometry works

Each held note `i` becomes a pendulum with frequency ratio `rᵢ` = (its
frequency) / (lowest held note's frequency). The traced curve over a parameter
`t` (0 .. 40π) is:

```
x(t) = Σ aᵢ·sin(rᵢ·t + φᵢ)·e^(−dᵢ·t)
y(t) = Σ aᵢ·cos(rᵢ·t + φᵢ + kᵢ)·e^(−dᵢ·t)
```

- `aᵢ` (amplitude) scales with note velocity.
- `φᵢ`, `kᵢ` are per-note phase offsets so chords don't collapse onto one axis.
- `dᵢ` is a tiny per-note decay, so the figure spirals gently inward like a real
  decaying pendulum.

**Why JI cleans it up:** when the `rᵢ` are small-integer ratios (a consonant,
justly-tuned chord) the curve is periodic and near-closed. Under 12-TET the
ratios are irrational (e.g. a major third is `2^(4/12) ≈ 1.2599`, not `5/4`), so
the curve never quite repeats — it drifts and tangles. Toggling JI snaps each
ratio to the nearest small-integer just interval (`1/1, 16/15, 9/8, 6/5, 5/4,
4/3, 45/32, 3/2, 8/5, 5/3, 9/5, 15/8, 2/1`, octave-extended) for **both** the
oscillator pitch and the `rᵢ` used to draw.

## Subsystems

1. **Three-way note input → one note-on/note-off path.**
   - **Web MIDI** (`navigator.requestMIDIAccess({ sysex:false })`): binds
     `onmidimessage` to every input, handles note-on (`0x90`, vel > 0) and
     note-off (`0x80` or `0x90` vel 0), re-binds on `onstatechange` (hotplug),
     shows the device name. Feature-detected + try/catch → degrades gracefully.
   - **QWERTY**: `a w s e d f t g y h u j k o l p ;` = chromatic semitones up
     from C of the current octave; `z`/`x` shift octave; auto-repeat is guarded
     with a held-key set; ignored while typing in inputs.
   - **On-screen keyboard**: two octaves of DOM piano keys, ≥44px targets,
     pointer events for multi-touch (pointerdown = on, up/leave/cancel = off).
2. **Warm polyphonic Web Audio synth** (12-voice allocator with voice-stealing):
   per voice = sine osc + detuned (+7¢) triangle osc → lowpass `BiquadFilter`
   (velocity → brighter) → gain with ADSR (A 12ms, D 150ms, S 0.6, R 250ms).
   All voices → shared feedback `DelayNode` (~0.28s, fb 0.35, wet/dry) → master
   gain → `DynamicsCompressor` (limiter) → destination. A very-soft always-on
   low drone keeps the room from being silent. AudioContext is created and
   resumed only on the first user gesture.
3. **JI-lock + chord/ratio analysis**: the toggle re-tunes live voices via
   `setTargetAtTime` and re-draws the figure. A live HUD shows held note names,
   a best-guess chord name, and the active ratio set (e.g. `1/1 : 5/4 : 3/2`).
4. **Raw WebGL2 renderer** (no three.js, no Canvas2D for the figure):
   hand-written GLSL ES 3.00 vertex + fragment shaders, a VAO + VBO. Each frame
   the curve is resampled into ~3000 (x,y) points in JS and `bufferSubData`'d
   into the VBO, drawn as `gl.LINE_STRIP` with additive blending for glow. A
   translucent near-black fullscreen quad fades the previous frame each tick,
   leaving a decaying ink trail. The figure slowly rotates while notes are held
   and shows a gentle idle Lissajous "seed" when nothing is held. DPR-aware and
   resize-aware. If `webgl2` is null → a rose notice and the GL path is skipped.

## MIDI-out (optional, off by default)

If any MIDI output port exists, an **Echo to MIDI out** toggle appears
(default OFF). While ON it forwards held note-on/note-off to the first output
port. Nothing is sent while it's off.

## How it degrades

- **No Web MIDI** (e.g. Safari): amber notice; QWERTY + on-screen keyboard work
  fully.
- **MIDI present, no device**: amber notice prompting use of the keyboard.
- **No WebGL2**: rose notice; audio + keyboards still work.
- All `window` / `navigator` / WebGL / AudioContext access is guarded so SSR and
  unsupported browsers never throw.

## References

- The **harmonograph** — Hugh Blackburn's pendulum apparatus, ~1840s.
- **Lissajous figures** — Jules Antoine Lissajous, 1857.

Honesty note: Web MIDI already appears elsewhere in this lab. The *novel*
technique here is the **harmonograph geometry — harmony rendered as visible
geometry** — and its tight coupling to just-intonation retuning, not MIDI input.

## Tags

- **INPUT**: MIDI / QWERTY / on-screen-keyboard
- **OUTPUT**: raw WebGL2 line geometry
- **TECHNIQUE**: harmonograph parametric geometry + JI retuning
- **VIBE**: theory-literate live instrument, ink-on-dark, restrained

## What a future cycle should deepen

- **Sustain pedal → figure-hold**: freeze the current figure / let it accrete.
- **Mod wheel → pendulum damping** (`dᵢ`): morph from tight closed figures to
  long inward spirals.
- **Per-note color** from a spectral centroid or pitch class, so each pendulum's
  contribution is legible in the trail.
- **SVG / PNG export** of the current figure, so a chord becomes a printable
  artifact.
- A richer chord namer (inversions, extensions) and a microtonal/EDO selector
  beyond 12-TET vs JI.
