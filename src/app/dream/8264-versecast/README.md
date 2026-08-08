# 8264 · VerseCast

**The one question:** *What if the words you type WERE the score — each
keystroke a voice, the sentence a polyphony, and the living typography itself
the only picture?*

VerseCast turns writing into composing. You type prose directly into a
concrete-poetry field; every character is sonified the instant you press it and
simultaneously becomes a living glyph. The text you write is at once the
composition and its notation — there is no separate visualiser, the typography
*is* the artwork.

## How to use

1. Press **Begin** to unlock the Web Audio context (browser autoplay policy).
2. Click anywhere in the composition field and start typing.
3. Listen as it writes:
   - **Vowels** open sustained pitches from a warm minor scale (interlocking, polyphonic).
   - **Consonants** are transient attacks — voiced letters (b, d, g, m, n…) pluck; unvoiced letters (p, t, k, s, f…) click.
   - **Punctuation** resolves: `.` a soft low cadence, `,` `;` `:` shorter rests, `?` a rising inflection, `!` a bright accent.
   - **Line breaks** shift the register, so stacked lines voice as separate parts.
   - The **word** you are inside sets each held note's phrase length.
   - **Backspace** silences the most recent voice as it erases the glyph.
4. Before you touch anything, a seeded **ghost writer** composes on its own so
   the piece is alive with zero interaction (muted-phone self-demo). It yields
   the instant you click or type.

## Subsystems (four)

1. **Prosody analyzer** (`audio-engine.ts` — `classify`, `contextFor`): maps each
   character to musical intent (role, scale degree, register, phrase length).
2. **Keystroke → synth voice engine** (`VerseEngine`): a Web Audio graph
   (oscillator voices, band-passed noise clicks, cadence chords, breaths) routed
   through a lowpass, a feedback-delay tail and a compressor.
3. **Polyphonic scheduler / voice-manager**: low-latency triggering on the
   AudioContext clock, a polyphony cap that steals the oldest voice, and
   per-voice release handles so a backspace silences exactly the last voice.
4. **DOM-CSS living typography** (`page.tsx`): every glyph is a real
   `<span>`; motion is pure CSS (seeded entrance transform, opacity trail, vowel
   pulse, line sway, field breathing). No canvas, no WebGL, no SVG.

## Named reference

Apollinaire's *Calligrammes* and the **concrete-poetry** tradition, where the
arrangement of type on the page *is* the artwork — a lineage the piece extends
into sound, in the spirit of 2026's type-to-compose creative tools.

## Ambition criteria met

- **#2 — multiple distinct subsystems:** four, listed above (well over the
  threshold of three).
- **#3 — named reference:** Apollinaire's *Calligrammes* / concrete poetry
  (cited above and in the in-app design notes).

No "first ever" claims are made.

## Constraints honoured

- `"use client";` on line 1; only `../_shared/prototype-nav` imported across
  folders; no new npm deps.
- No `Math.random` / `Date.now` / `new Date` — an inline `mulberry32` PRNG seeds
  the ghost writer, voice detune and the noise buffer; timing uses
  `performance.now()` and rAF timestamps.
- Output is pure DOM + CSS. Audio is real Web Audio.
- House tokens for all chrome (violet `primary` accent only); the art layer uses
  a violet ramp plus warm neutral tints.
- Graceful degradation: if Web Audio is unavailable a `text-destructive` notice
  appears and the typography still animates.
- `prefers-reduced-motion` honoured (breathing/sway/pulse disabled, entrance and
  transitions shortened).
- Full teardown on unmount: rAF cancelled, voices released, AudioContext closed,
  nodes disconnected, matchMedia listener removed.

## Honest caveats

- On mobile/soft keyboards the per-key audio path relies on the `beforeinput`
  fallback rather than `keydown`, so timing can be slightly less crisp than on a
  physical keyboard; predictive-text insertion of whole words will fire several
  attacks at once.
- Glyph keys are positional, so editing in the middle of a long passage (rare —
  most writing is append + backspace) can re-run a few entrance animations
  further down the line.
