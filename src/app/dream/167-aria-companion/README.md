# Aria — Piano Companion

**Route**: `/dream/167-aria-companion`  
**Built**: Cycle 195 (2026-05-26)  
**Status**: `demoable`

## What it is

A turn-taking piano dialogue prototype. Play any melody into your mic; after
two seconds of silence, Aria responds with her own phrase — derived not from
a fixed library but from the note transitions you just played.

The interaction model: **call → silence → response → listen again**. There is
no fixed tempo, no score, no backing track. Aria speaks when you stop.

## How it works

**Pitch detection**: AMDF autocorrelation on a 4096-sample time-domain buffer
at 30Hz. Identical algorithm to `155-piano-hands` and `13-piano-canvas`.
Detects C3–C6 (MIDI 48–84). Threshold 0.965 normalized correlation — works
cleanly for piano, less reliable for voice overtones.

**Note segmentation**: A note event starts when a stable pitch is detected,
ends when the pitch changes by ≥1 semitone or silence lasts >80ms.

**Markov chain**: A first-order bigram table maps every `(from_midi, to_midi)`
transition seen in the session to a count. The table grows across every
call-and-response. When Aria generates her reply, she walks the bigram from
the last note you played, sampling the next note weighted by observed
frequency. Unseen transitions fall back to a pentatonic neighbor (C-major
pentatonic, within 8 semitones of the current note).

**Tempo mirroring**: Aria estimates your average note duration from the
captured phrase and plays her response at 88% of that speed (slightly slower
— she listens more than she hurries).

**Synthesis**: Triangle wave fundamental + 2nd harmonic at 26% gain.
Attack 16ms, exponential decay. Piano-adjacent timbre without any sample
files.

## Visual

Two scrolling piano roll panels (Canvas2D):
- **YOU** (top, warm orange bars): your detected notes scroll left in real time
- **ARIA** (bottom, cool blue bars): Aria's scheduled notes appear from the
  right cursor as their scheduled time arrives

MIDI range C3–C6 (36 semitones). Octave C-note grid lines. "Now" cursor at
right edge. Note height scaled to 1.6× the raw semitone height for
readability.

A thin fill bar on the right edge of the YOU panel fills orange as you play,
reaching full brightness when ≥6 notes are captured. Three pulsing blue dots
appear in Aria's panel during the "thinking" phase.

## Markov table behavior

Early in the session (first 2-3 phrases): Aria has little data; responses
are mostly pentatonic, somewhat random.

After 5+ phrases: the bigram reflects your actual playing. If you favor
ascending major 3rds, Aria will favor them too. If you circle around a root
note, Aria will too. The table is never reset between phrases, so Aria learns
throughout the entire session.

## Polish ideas

- **Visualize the bigram** — show the transition probabilities as a 12×12
  pitch-class heatmap in a corner panel. Karel could see what intervals Aria
  has learned.
- **Anticipation ghost bars** — show Aria's planned notes as semi-transparent
  ghost bars in the ARIA panel *during* the thinking phase, before they fire.
  From the `39-anticipate` prototype design (CHI 2025, ReaLJam transparency).
- **Longer phrases** — current response is 7-13 notes. Let Karel set
  "response length" to match the phrase length he just played.
- **Harmonic shaping** — bias the Markov sampling toward diatonic neighbors
  of the last user note. Currently pure bigram + pentatonic fallback.
- **Inversion response** — optionally respond with the inversion of the user's
  phrase intervals (×−1 each interval). A mirror dialogue.

## Research basis

- Aria-Duet (NeurIPS 2025, arXiv:2511.01663) — turn-taking piano AI duet.
  `aria-companion` is the browser Markov-chain analogue: same dialogue
  paradigm, zero ML inference, runs entirely client-side.
- "Design Space for Live Music Agents" (arXiv:2602.05064, Feb 2026) — 184-system
  taxonomy identifying "dialogue agents" as the least-explored category.
- `39-anticipate` — `aria-companion` without the anticipation layer. That
  prototype builds the visual anticipation on top of the same Markov dialogue.
