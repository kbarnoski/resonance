# 15424-negative — THE NEGATIVE SCORE

> His notes are the dark holes; you hear and see the silences between.

A conceptual/critical piece whose subject is what Karel leaves **out**. A
full-chromatic ribbon scrolls past a playhead. The luminous, colored field is
his **silence** — the breath, the pedal air, the reverb tails, the rests. His
actual **notes** are **dark holes punched out** of that field: an inverted
piano roll where he plays → the ribbon goes dark, and where he is silent → it
glows in color that tracks the harmony. The audio agrees with the image: an
inverted-gain envelope ducks his notes to a faint ghost and opens on the
interstices, so what you hear is the room between the notes.

## The one question

*What if you could SEE and HEAR the negative of Karel's score — his notes as
dark holes punched out of a luminous field, and the bright, colored ribbon
between them (his silences) is what you hear, his notes ducked to a ghost?*

## Named references

- **John Cage, _4′33″_ (1952)** — structural silence as the work itself; the
  frame makes the ambient interstice the content.
- **Miles Davis, "it's the notes you don't play"** — the music as much in the
  withholding as the sounding.
- **"The Music of Silence" (J Neurosci, 2021)** — the brain generates
  _inverted-polarity_ imagined responses during musical rests, actively filling
  the missing melody. This piece is the literal inversion: it hands your ear the
  rests and withholds the notes, letting you supply them.
- **Negative space / notan** in visual art — the subject read through its
  absence; light where the figure is not.

## How the engine works

1. **Start** (a user gesture) creates/resumes an `AudioContext` and loads the
   selected track's real buffer (`loadRealTrackBuffer`) plus its analysis
   (`loadTrackAnalysis`).
2. One `BufferSource` → a modulation `envGain` → the shared `createSafeMaster`
   bus (never `ctx.destination` directly). `startTime` + `elapsed =
   ctx.currentTime - startTime` is the playback clock.
3. From `notes[]` we build the **union of note-active intervals** (merged with a
   40 ms gap). Its complement within the track is the **interstices**. A single
   `requestAnimationFrame` loop reads `elapsed`, binary-searches the intervals
   (with ~30 ms lookahead so the duck lands just before an onset), and calls
   `envGain.gain.setTargetAtTime` **only when the target changes**:
   - inside a note → duck toward the **floor** (fast, 0.05 s),
   - inside an interstice → open toward **Air** (slower, 0.08 s, so tails swell).
4. **Reveal** slider (0..1, default 0.15) lerps the note-region floor from
   `0.03` (pure negative space) up to `~0.9` (his full notes audible, for A-B).
   **Air** slider opens the interstices (`0.55..1.0`).
5. **Loop**: `src.onended` re-arms a fresh `BufferSource` so it self-propels for
   review.
6. **Fallback**: if `notes[]` is empty, interstices are derived from the
   buffer's own RMS envelope (50 ms windows, relative threshold). The UI badges
   this as "amplitude fallback".

The same openness value that gates the audio drives the visual brightness at the
playhead, so image and sound agree: bright when you hear the room, dark when his
notes duck it out. Shimmer along the playhead is driven by `master.analyser`.

## The visual (Canvas2D)

- Background **field** = luminous full-chromatic column strips; each column's
  hue comes from the chord root active at that time (`chordRoot` →
  `pitchClassHue`) plus a slow positional drift so the ribbon sweeps the whole
  wheel across the piece — not one tint.
- **Notes** = dark rounded lozenges (holes) positioned by pitch (`midi → y`,
  clamped to the played range) and time (`time → x`), punched out of the field.
- **Playhead** fixed at 1/3 from the left; the ribbon scrolls past it. Only
  notes in the visible window are drawn (binary-searched in the sorted roll).
- devicePixelRatio-aware and resize-aware.
- **Degrade**: if `getContext('2d')` is null, audio still plays with a DOM
  openness meter. **prefers-reduced-motion**: the scroll clock is quantized to
  0.5 s steps rather than gliding; color/brightness stay legible.

## Tags

- **INPUT**: self-propelling playback + steer sliders (Reveal / Air), not
  pointer-drag.
- **OUTPUT**: Canvas2D scrolling negative-score ribbon.
- **TECHNIQUE**: negative-space / inverted-gain interstitial listening.
- **PALETTE**: full-chromatic (harmony → hue across the whole wheel).

## Audio provenance

Karel's real catalog only — Welcome Home + Snowflake, via the verified
`REAL_TRACKS`. Zero synthesis: the only sound is the decoded real buffer, gated
through `safeMaster`. Default track: **Bath**.

## Honest notes / unverified

- Analysis coverage varies per track; note/chord rolls may be sparse or empty.
  Empty note roll → the amplitude RMS fallback (badged). Sparse chords → the hue
  leans on positional drift, still full-chromatic but less harmony-locked.
- The RMS fallback threshold (16% of peak, 50 ms windows) is a heuristic tuned
  by ear on a couple of tracks; on very reverberant material it will read tails
  as "note" and slightly shrink the interstices.
- At Reveal 0 the piece is deliberately quiet — the whole point — so on a very
  sparse recording there can be long near-silences. That is the concept, not a
  bug; nudge Reveal/Air up to confirm sound is flowing.
- Hue mapping uses the shared warm-anchored circle-of-fifths (`pitchClassHue`);
  "full-chromatic" here means the whole wheel is traversed over the track, not a
  perceptually uniform per-key palette.
