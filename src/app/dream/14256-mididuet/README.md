# 14256 · mididuet — a duet with yourself

## The ONE question

**What if you could play a live DUET with yourself — your MIDI keyboard voiced
entirely in grains of your OWN recorded piano, over one of your own
recordings?**

One of Karel's catalog takes plays as the accompaniment **bed** (real audio).
On top, every note he plays is voiced by **concatenative resynthesis** drawn
from his own catalog. He plays his own timbre, live, over his own music. There
is not a single oscillator or synth tone anywhere in the piece.

## The concatenative voice (the core mechanism)

1. **Bed.** On Start, the chosen take is loaded with `loadRealTrackBuffer` and
   played once through as a single `AudioBufferSourceNode` at a gentle gain into
   `safeMaster.input` — the accompaniment.
2. **Grain index.** We load `loadTrackAnalysis` + the decoded buffer for a small
   set of tracks (the bed + up to 2 others — capped at 3 so it loads fast). Each
   analysed note is a real slice of that track's audio at a known pitch, so we
   build `Map<midi, Grain[]>` where `Grain = { buffer, startSec, durSec, midi,
   velocity }`. Per-pitch lists are capped for memory; slices rotate for timbral
   variety.
3. **Note-on → real slice.** A live note at pitch `p`, velocity `v` finds the
   nearest indexed pitch (exact, else closest semitone, tie-broken toward the
   matching pitch class), creates a buffer source from that slice, sets
   `playbackRate = 2**((p - slice.midi)/12)` clamped to `[0.5, 2]` (never
   chipmunky), starts at `slice.startSec`, and windows it with a short
   attack + velocity-scaled envelope on a per-note gain. Note-off releases the
   held grain with a quick fade. This IS Karel's piano, resequenced in real
   time.
4. **Fallback.** If no analysis is available for any track, the voice granulates
   the **bed buffer itself** at a pitch-mapped read position — still real audio,
   never a synth.

## Input — Web MIDI (a lab first) + graceful fallback

- `navigator.requestMIDIAccess()` is feature-checked and wrapped in try/catch;
  every input's `onmidimessage` is parsed for note-on (`0x90`, vel > 0) and
  note-off (`0x80` / note-on-vel-0). The connected device name shows in the
  badge.
- With no Web MIDI or no device, the **computer keyboard** becomes the piano
  (a two-octave AudioKeys layout: `z x c v b n m` lower, `a s d f g h j k l`
  with `w e t y u o p` sharps). The badge reflects the active mode. The keyboard
  is always live so the page is never dead.

## Visual — warm paper/ink piano-roll

Canvas2D on warm paper (`#f2ecdd`). The bed take's notes render as a faint
printed gray roll scrolling under the performance. Karel's live played notes
render as warm sienna/umber ink strokes (`#7a3b1e` / `#b5651d`): height = pitch,
length grows with hold, weight = velocity, with a struck-note head dot. A thin
playhead sits at 60% width. This deliberately breaks the lab's cool-violet
monoculture — sepia ink on paper. UI chrome stays on Resonance semantic tokens.

## Named references

- **CoSaRef** — "Annotation-Free MIDI-to-Audio Synthesis via Concatenative
  Synthesis and Generative Refinement" (arXiv:2410.16785).
- **"The Concatenator: A Bayesian Approach to Real-Time Concatenative
  Musaicing"** (arXiv:2411.04366).

This piece is a lightweight, browser-side cousin: concatenative synthesis with
a personal, single-performer corpus, played live.

## Ambition criteria it hits

- **First Web MIDI in the lab** (0× before this).
- **Karel's own verified catalog only** — bed and voice alike, no off-brand or
  quarantined audio, zero oscillators.
- **A genuinely new technique for the lab** — real-time concatenative resynthesis
  keyed by note analysis, not sample playback or a synth patch.
- **Graceful degradation** — no MIDI still yields a fully playable duet.

## Next-cycle deepening

- **Corpus-aware voicing.** Weight grain choice by velocity and local harmonic
  context (the analysis ships chords) so soft notes pull soft slices and the
  voice tracks the bed's harmony — closer to The Concatenator's Bayesian match.
- **Onset-clean slicing.** Trim each grain to its true attack via spectral-flux
  onset within the slice, removing the previous note's tail.
- **Overlap-add sustain.** Loop-crossfade a held grain's steady state so long
  notes ring without a hard cutoff.
- **Record & re-perform** the duet as a second printed layer to overdub against.
