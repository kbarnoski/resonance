# 15488 · vigil-chord — VIGIL (held-chord approach)

**Karel's music only lives while you sustain it.** His whole ensemble exists only
at the peak of an unbroken vigil; the instant you let go, it forgets.

## The one question

_What does it cost to keep his music alive?_ Here the cost is the listener's own
sustained presence. The subject of the piece is not the recording — it is the
endurance of the person holding it up. This is a conceptual/critical piece, not a
"recording drives a visualizer" toy: the audio never plays itself.

## How the held-chord vigil works

Six of Karel's real recordings are each mapped to one physical key —
**A S D F G H** — and to one Messiaen colour-chord pane of a stained-glass window
rendered in three.js:

| key | recording      | Messiaen colour |
| --- | -------------- | --------------- |
| A   | Interplay      | gold            |
| S   | Bath           | amber           |
| D   | Welcome Home   | red             |
| F   | 2019           | violet          |
| G   | Rolling        | green           |
| H   | Isolation      | blue            |

All six sources loop continuously and in sync (phase-locked, started together at
gain 0), but **every voice is held at silence**. A voice only sounds while its key
is *physically held down*: key-down ramps its gain up fast (~40 ms), key-up ramps
it back to silence faster (~80 ms), so the voice dies almost the instant the vigil
breaks. Its stained-glass pane brightens as the voice enters and darkens on
release.

To hear Karel's full six-voice ensemble in unison you must hold **all six keys at
once, unbroken** — you literally keep his chord alive with your own sustained
chord. Losing window focus (tab away) breaks the vigil too: you cannot sustain
what your hands have left. The verb is embodied and pianist: **you sustain to
sustain.**

- **Reward the full hold.** Pane brightness rises with the average held level to
  the power 2.4, so a partial chord is only a *partial window*. Only when the whole
  chord is sustained do the panes bleed into one luminous chromatic field and the
  oculus — the _cité céleste_ — light fully. Holding all six is genuinely
  demanding; that difficulty is the point, not a toggle.
- **Input works without a keyboard.** The labeled key row doubles as press-and-hold
  touch panes (per-pane pointer capture, `touch-action: none`), so multi-touch =
  holding several panes at once.
- **Degrades gracefully.** No Web Audio → notice. WebGL unavailable → the window is
  hidden but the vigil and the press-hold panes still work. WebGL and audio are
  torn down on unmount (sources stopped, context closed, RAF cancelled, geometries
  / materials / textures disposed, listeners removed).

## Named references

- **Olivier Messiaen** — chord-colour synesthesia; chords seen as specific colours
  tied to the Sainte-Chapelle stained glass ("gold and blue, red and violet"); in
  _Couleurs de la cité céleste_ (1963) "the form of the work depends entirely on
  colours." Each held key is a fixed Messiaen-style colour-chord pane, and the
  sustained chord assembles a window whose full chromatic light only appears when
  the whole chord is held.
- **Sound Scene 2026, Hirshhorn Museum (Smithsonian), May 2026** — _Failed Future
  Bodies_, an endurance work where sustaining (and failing to sustain) IS the
  instrument. This piece shares that thesis.

## Audio

Karel's real catalog ONLY — zero synth/oscillator. One `AudioContext` on the Start
gesture; everything routed through `_shared/visionary/safeMaster`. Six looping
`AudioBufferSourceNode`s (verified ids from `WELCOME_HOME_TRACKS` /
`_shared/welcomeHome`), each → its own `GainNode` → `master.input`, gated by
key-held state. Overall `master.analyser` energy drives only a slow, safe
luminance shimmer (no strobe/flicker).

## Tags (this cycle's jury bans — cleared)

- **INPUT:** sustained multi-key / multi-touch HOLD — load-bearing. Not
  passive/self-propelling, not a steer-slider, not a single knife-edge pointer.
- **OUTPUT:** three.js `WebGLRenderer` stained-glass / chromatic light-field. No
  hand-rolled raw WebGL2; Canvas2D only for offscreen glow textures.
- **TECHNIQUE:** per-key vigil-gated catalog voices (each key = one looping real
  take, gain gated by key-held state).
- **PALETTE:** full chromatic WITH INTENT (Messiaen colour-chords) in the art
  layer — gold, amber, red, violet, green, blue. No achromatic/grayscale, no cool
  cyan/teal/indigo wash. UI chrome stays violet-only per house style.

## Next-cycle deepening

- Voice-leading between panes: hold a chord, release one key and re-take another,
  and let the window "resolve" — track the *shape* of the sustained chord over time
  rather than a flat on/off, rewarding legato transitions.
- A visible "vigil clock": measure the longest unbroken full-hold and let the
  cité céleste accrue depth (more rose tracery, deeper bloom) the longer the vigil
  survives, so endurance leaves a mark instead of resetting instantly.
- Per-voice spectral tint of its own pane (drive each pane's shimmer from a
  per-voice analyser tap) so the glass flickers with the actual grain of that take.
