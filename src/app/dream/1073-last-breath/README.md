# Last Breath — design notes

Route: `/dream/1073-last-breath`

An instrument about impermanence and surrender. The one question:
what if a piece of music only existed while you were willing to LET GO of it?

## The concept

A sound that lives only while you hold a single point of contact, decays and
erodes a little every time you listen, and can never be heard the same way
twice. The cost is real: every moment of listening permanently spends the
sound's material, and once it is gone it is gone — until a deliberate reset
that destroys the version you made.

This is a conceptual / critical piece about irreversibility and ego-dissolution:
the phenomenology of "letting go." You are not given control. You are placed in
the altered-state stance of surrender — you can keep the sound alive a little
longer by holding, but holding is exactly what kills it. The only stances
available are to hold and lose, or to let go and lose. Both are loss. That is
the point.

## How it works

- **Hold to live.** Press and hold one point (pointer or touch), or hold Space /
  Enter. While held, the sound clarifies and the material rings.
- **Release to vanish.** The instant you let go, every voice begins to fade. The
  sound is gone while you are not holding it.
- **Listening erodes.** The sound is a finite pool of 9 additive partials
  (`PARTIAL_COUNT`), each with its own `integrity` 0..1, tuned to a calm
  just-intonation chord (`RATIOS`). Every second of holding permanently lowers
  their integrity (`ERODE_PER_SEC`), weighted so the brightest partials crumble
  first (`crumbleWeight`). The chord slips out of true via accumulating detune
  drift, and the whole spectrum darkens (drone drive falls, reverb wet rises).
  The erosion **persists for the entire session**; releasing and holding again
  never restores it. Re-engaging the hold costs a little extra each time
  (`ERODE_PER_HOLD`), so you can never listen for free.
- **Reset destroys.** "Begin again (erase & reset)" restores the full material —
  and erases the eroded version you were listening to. There is no undo. The
  sound you made will not return.

The piece is genuinely different at minute three than at minute one, and it
trends toward silence. You are watching, and hearing, a thing disappear.

## Architecture

- `page.tsx` — `"use client"` austere UI: Begin gate, the press-and-hold target
  (pointer + touch + keyboard), the SVG eroding-state readout (thinning ring,
  % material, per-partial bars), the destructive reset with its warning, the
  in-page notes toggle (no `/README.md` route), and full teardown on unmount.
- `decay.ts` — the irreversible audio engine. Owns the `AudioContext`. A finite
  pool of partials that erode permanently with held time; `hold()` / `release()`,
  a `remaining` getter via `sample()`, and the erosion update on rAF. Composes
  `_shared/psych/droneBank.ts` (a very quiet sub foundation) and
  `_shared/psych/convolutionVoid.ts` (the cavernous valedictory tail). Master →
  gentle `DynamicsCompressorNode` limiter → destination.
- `notes.ts` — the design-notes string rendered in-page (mirrors this file).

## The visual readout

Deliberately austere — minimal SVG/DOM, not a particle spectacle, no Canvas2D,
no three.js. A ring whose remaining arc thins as the material is spent; a numeric
"% material" remaining; a row of bars, one per partial, so you can watch the
bright ones fall first; and a quiet violet luminance that dims as the sound dies.
Audio is the primary identity here; the visuals are a legible meter of loss.

## Witness path (no input required)

If no one holds the piece within ~4.5s of Begin, it holds itself
(`WITNESS_DELAY_MS` / `WITNESS_HOLD_MS`), demonstrates the
living → eroding → vanishing arc, then lets go and settles — so a 06:30 glance
with zero interaction still hears and sees the concept. Any real hold cancels the
self-demonstration. Erosion is perceptible within seconds; a full session trends
toward silence over a couple of minutes.

## References

- **William Basinski, *The Disintegration Loops* (2002)** — tape loops that
  physically crumbled as they were played back, the recording documenting its own
  decay. The canonical artwork of music that destroys itself as it plays. Here the
  "tape" is a pool of partials and the "playhead" is your willingness to keep
  holding.
- ***Anicca*** (impermanence) in Buddhist thought, and the "letting go" /
  ego-dissolution phenomenology of surrender. Evoked as feeling, not a medical
  claim.

## Safety

No strobe; only slow fades (photosensitive-epilepsy safe). Master limiter caps
peaks. Calm, spacious, valedictory throughout — never intense, never a bloom.

## What I'd deepen

- Give each partial a distinct timbral fingerprint so the crumbling is more
  spectrally vivid (formants, slow inharmonicity).
- A faint granular "tape hiss" floor that grows as integrity falls, so the
  silence at the end is textured rather than clean.
- Let the detune drift seed a final, broken chord just before silence — a last
  exhalation that is recognizably the same chord, wrecked.
- Optional persistence of the erosion across reloads (localStorage) so the
  irreversibility outlives the page session — a sound you can only ever destroy.
