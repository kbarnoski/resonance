# 4616 · Pressing

**The one question:** _What if every note you play is etched permanently the
instant you play it — one take, no undo, and when it's full it becomes the
record that loops forever?_

## The stakes — irreversible commitment

Pressing is a performance instrument about the cost of a single live take. You
perform **once**. Arm the take and a cutting stylus starts an inward spiral
across a blank record. The instant a note sounds it is cut into the groove at
the stylus's current position — there is no editing pass, no undo, no re-record
of that moment. When the stylus reaches the centre the take is complete and your
one performance plays back, looped forever, as the artifact.

The emotional core is restraint: because you can't take anything back, every
note is a committed decision. A hard note cuts a deep bright groove; a held one
under MPE pressure cuts a deeper wiggle. Silence is also permanent — an untouched
stretch of groove stays smooth forever.

## How it works

1. **Cut (etch).** The groove is an inward Archimedean spiral sampled into a
   fixed array (`groove.ts`). Each committed note deposits a permanent Gaussian
   bump into an `etchDepth` field indexed by the spiral parameter `t`. The
   field only ever accumulates — nothing is un-etched. The groove's local radius
   (a DC bulge) and a high-frequency wiggle are displaced by that field, exactly
   like a lathe-cut master where the cut _is_ the signal.
2. **Input → groove.** Velocity → etch depth and audio amplitude/brightness.
   MPE / channel-pressure → deeper groove wiggle. Any pitch snaps to a C-major
   pentatonic so a cold reviewer hears something consonant immediately.
3. **Permanent-buffer playback.** When the take fills (or on the seeded demo), a
   playhead rotates the groove and re-triggers each etched note as it crosses
   it — the same buffer, looped forever. Live performance and playback share one
   polyphonic synth (`audio.ts`: two detuned saws → lowpass → envelope).

## Inputs

- **Web MIDI** (`navigator.requestMIDIAccess`, `midi.ts`) — note-on velocity is
  the etch depth; MPE 1.1 channel-pressure / poly-aftertouch deepens the wiggle.
- **Computer keyboard (always works)** — `a s d f g h j k` = a rising pentatonic
  run from C4, shown in the UI.
- **Seeded auto-take (self-demo)** — a deterministic mulberry32 melody (seed
  `0x9e3779b9`) etches the whole groove on load and loops immediately, so a
  reviewer on a cold phone with no MIDI and no key presses still sees a filled
  groove and hears the looped take after the first tap unlocks audio.

## Renderer

Inline SVG only — the groove is a single `<path>` rebuilt each frame from the
etch field, with a faint guide spiral beneath it, a spindle, and a glowing
cutting-stylus/tonearm. No Canvas2D, WebGL, or WebGPU.

## Named references

- **Direct-to-disc / lathe-cut recording** — the lathe cuts the master live and
  no edit is possible; the cut is the master.
- **Alvin Lucier, _I Am Sitting in a Room_ (1969)** — the process of committing
  sound becomes the artifact itself.

## Research chain

The **2026 Web MIDI / MPE 1.1 per-note continuous expression** frontier: each
note carries its own velocity and pressure, and that per-note investment is
exactly the thing you can't take back — so the groove records it and refuses to
forget.

## Determinism

No `Math.random`, `Date.now`, or argless `new Date()`. Randomness is mulberry32
with a fixed seed; timing is `performance.now()` via rAF timestamps.

## Ambition floor cleared

- **#2 ≥3 subsystems:** Web MIDI parser + keyboard fallback + real-time
  groove-etch geometry + polyphonic synth + permanent-buffer playback loop +
  seeded auto-take.
- **#3 named references:** Lucier + lathe-cut (above).
- **#5 today's research:** Web MIDI / MPE 2026 (above).

## Next-cycle deepening

- Render the pressed take as an exportable WAV/mp3 "test pressing" you can keep.
- Use full MPE per-note pitch bend to warp the groove sideways, not just deepen
  the wiggle.
- A "B-side": let the finished record be re-armed as a new cut layered over the
  old one, so takes accrete like a palimpsest.
- Groove wear: each playback loop faintly sands the wiggle, so the artifact ages.
