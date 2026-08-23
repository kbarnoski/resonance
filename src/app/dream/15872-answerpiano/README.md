# 15872 · Answer Piano

**One question — _What if Karel's own recording performed a live counter-line on YOUR hardware synth?_**

Karel's real recorded piano plays as the **only audible sound**. As it plays, a
knowledge-based accompaniment compiler reads his chords and current melody note
and, in real time, **emits a harmonized MIDI counter-voice out through the Web
MIDI OUTPUT** to whatever synth or DAW the visitor has connected — so the
visitor's own hardware answers his piano.

This is the lab's **first piece that _emits_ MIDI.** A prior piece (15808 · MIDI
Duet) took MIDI *in*; none had ever sent MIDI *out*. The counter-line is **MIDI
data only — it is never synthesised to audio inside the page** (see Rule 10).

## Tags

- **INPUT / subsystem — Web MIDI OUTPUT.** `navigator.requestMIDIAccess()` →
  iterate `access.outputs` → `output.send([status, note, vel], timestamp)`. This
  is the never-before-run subsystem for the lab.
- **OUTPUT surface — inline-SVG dual piano-roll.** Two lanes meeting at a central
  horizontal **NOW** line: his real notes descend from the top toward NOW and are
  absorbed there when they sound; your emitted MIDI counter-line rises from the
  bottom to meet the same line at the moment each note fires on your device. SVG
  DOM only — no full-canvas shader, no three.js, no WebGL.
- **TECHNIQUE — knowledge-based chord→MIDI accompaniment compiler + real-time
  causal Web MIDI scheduling.**
- **PALETTE — warm chromatic, notes coloured by pitch-class** via
  `pitchClassHue`.

## How it works

1. **Audio.** `loadRealTrackBuffer(ctx, id)` decodes one of Karel's verified
   tracks into an `AudioBuffer`, played through a single `AudioBufferSourceNode`
   connected into `createSafeMaster(ctx).input` — the shared ear-safety master
   (high-shelf cut, lowpass safety cap, brick-wall limiter). Nothing else is ever
   connected to audio output.
2. **Analysis.** `loadTrackAnalysis(id)` returns his time-sorted note roll and
   chord progression (plus key/tempo). A playhead = `ctx.currentTime − startTime`
   walks the take each animation frame.
3. **Compiler (rule-based, causal).** Each frame it locates the current chord
   (last chord whose `time ≤ playhead`) and his current melody note (highest note
   sounding now), then — gated by a density-derived interval — builds a small
   counter-voice and emits it.
4. **Emit.** For a real output it schedules a note-on and a matched note-off with
   a small causal look-ahead (`output.send(msg, performance.now() + 140ms)`), and
   registers the same note on the SVG roll so it rises to the NOW line exactly as
   it sounds. Notes are clamped to 0..127; a transpose control shifts the whole
   line; every `send` is wrapped so a device pulled mid-stream never throws.

### Voicings (the knowledge layer)

- **Thirds / Sixths** — snap a chord tone a third / sixth above his live melody.
- **Pad** — sustained triad tones a little under his register.
- **Bass** — root (and, at higher density, fifth) an octave down.
- **Arpeggio** — chord tones walked one at a time.

**Density** sets how often notes are emitted (mapped against the analysed tempo);
**transpose** shifts the counter-line ±24 semitones.

## Named reference

**MazzikaAI** — _"a knowledge-based performance-to-prompt compiler for real-time
… accompaniment … natural language as the actuator of a real-time control loop …
subsecond key-to-audible update latency."_ (**arXiv:2608.10360**, August 2026).

Answer Piano's compiler is the **same shape**: a knowledge/rule layer turns his
live-advancing performance into an accompaniment stream, subsecond and causal —
**except the actuator is Web MIDI to real hardware, not a neural model.**
Corroborating live-accompaniment work: **LiveBand** (**arXiv:2606.03803**).

## No-device fallback

If `requestMIDIAccess` is unavailable (Firefox/Safari/no permission) **or** no
output device is present, the piece **still plays his recording** and **still
animates the full dual roll** — his notes plus the *would-be* counter-line drawn
as dashed **ghost** notes — with an on-brand `text-destructive` notice:

> _"No MIDI output connected — connect a synth or DAW and your hardware will
> answer his piano."_

**Zero audio is synthesised in this state** — the visual carries the concept
alone. `access.onstatechange` is handled, so plugging a device in mid-session
turns the ghosts into real emitted notes without a reload.

## Hard-rule compliance

- **Rule 10 — his real catalog is the only audio.** The only sound is his decoded
  buffer through the safe master. **No oscillator / synth / noise / other sample.**
  The counter-line is control data sent to external hardware and is **never
  sounded inside the page.** (The temptation to "preview" it audibly is
  explicitly refused.)
- **Audio-visual, live.** Real sound + a live-animating SVG; never a static page.
- **No drug references** anywhere in copy, comments, tags, README, or slug.
- **Self-contained.** Imports only from `../_shared/*` (`welcomeHome`,
  `trackAnalysis`, `visionary/safeMaster`) and React. No new npm dependencies, no
  API route. Web Audio + Web MIDI + SVG/React only.
- **Ear safety.** All audio routed through `createSafeMaster`; MIDI carries no
  loudness risk (it triggers the visitor's own gear at their own levels).

## Type-safety note

`@types/webmidi` is not installed. The page declares **minimal local interfaces**
(`MidiOut`, `MidiOutputsMap`, `MidiAccessLike`, `RequestMidi`) and reaches
`requestMIDIAccess` through an `unknown` cast, so it compiles whether or not the
DOM lib ships Web MIDI types and never depends on external typings.

## Honest caveats

- **Not device-verified in a headless environment.** The Web MIDI *output* path
  (`output.send(...)` reaching a real synth/DAW, and `onstatechange` hot-plug) was
  written to spec but **could not be exercised against physical hardware here.**
  A reviewer should open it in Chrome/Edge with a MIDI device (or a virtual port
  such as the IAC Driver / loopMIDI) and confirm notes arrive, note-offs land, and
  the panic (`CC120`/`CC123`) silences hung notes on Stop.
- **Analysis may be absent.** If `loadTrackAnalysis` returns null or a take has no
  chords, emission is disabled and a notice is shown — his recording still plays.
- The compiler is deliberately **sparse accompaniment, not a wall**; density and
  voicing are the knobs a reviewer should push to judge musicality.
