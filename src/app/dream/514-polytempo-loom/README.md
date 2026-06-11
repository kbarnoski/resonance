# Polytempo Loom — design notes

**Route**: `/dream/514-polytempo-loom`
**Status**: demoable
**Zero deps · Zero API · Zero permissions**

---

## The one question

> "What if a piece's only tension lived in TIME — many voices on perfectly consonant pitches
> but running at simultaneously different, IRRATIONAL tempo ratios, drifting eternally out
> of and toward phase, and NEVER landing a shared downbeat?"

---

## The idea

Five voices play the same melodic cell — a rising/falling motif drawn from D pentatonic
across two octaves. Every pitch is consonant. There is zero harmonic tension: no dissonance,
no voice leading, no tonal pull. Every note is "correct."

The only drama is metric. Each voice runs at its own fixed tempo, set by an irrational ratio
relative to a base of 72 BPM:

| Voice | Ratio | Approx. BPM | Nature |
|-------|-------|-------------|--------|
| 0 | 1 | 72.0 | rational baseline |
| 1 | √2 | 101.8 | irrational — never terminates |
| 2 | φ (golden ratio) | 116.5 | irrational — transcendental relationship to φ |
| 3 | e/2 | 97.9 | transcendental |
| 4 | π/2 | 113.1 | transcendental |

Because no two ratios share a common rational factor, the voices have no common period. They
can never simultaneously return to beat 1. Near-alignments happen — brief, aurally salient
moments when two or three voices cluster close together — but these are statistical proximity
events, not structural downbeats. The loom drifts forever.

This is the whole point. There is no resolution because there is no rational attractor. The
listener inhabits the drift; they do not fix it.

---

## The Nancarrow lineage

Conlon Nancarrow (1912–1997) wrote his *Studies for Player Piano* — 51 studies for
mechanically-driven piano — over three decades, largely in isolation in Mexico City. Unable
to realize his music with human performers, he punched the rolls himself.

The mature studies explore **tempo canons** at rational and irrational ratios:

- **Study No. 36** — a canon at 17:18:19:20 (near-irrational feel, very dense)
- **Study No. 40 "Transcendental"** — a two-voice canon at the ratio **e : π**. Both
  constants are transcendental (not roots of any polynomial with rational coefficients), and
  their ratio is almost certainly irrational. Kyle Gann has written that this study "probably
  never aligns." At 3:30 there is a near-coincidence — the voices approach each other —
  before drifting away again, never to meet.
- **Study No. 33** (√2 series) and related pieces — canons at √2, where the ratio is
  algebraic-irrational. The period ratio between voices is √2 : 1, so Voice 2 completes
  exactly √2 beats for every 1 beat of Voice 1. Since √2 is irrational, the cycle length
  in beats is infinite.

Polytempo Loom uses the same principle: ratios from {1, √2, φ, e/2, π/2}. The "stir the
loom" slider modulates how extreme the mutual drift is, but even at minimum spread every
ratio remains irrational. There is no "align" button, no solve, no reset to zero-phase. The
absence of resolution IS the composition.

Kyle Gann's annotated catalogue of the Nancarrow studies (ganntrax.com) is the primary
secondary source for this lineage.

---

## The polytempo engine

The scheduler follows the **"A Tale of Two Clocks"** pattern (Chris Wilson, 2013):

1. A `setInterval` fires every **25 ms** on the JavaScript thread.
2. On each tick, the scheduler looks ahead **120 ms** into `AudioContext.currentTime`.
3. Any note whose scheduled time falls within that window is passed directly to Web Audio's
   precise internal clock via `OscillatorNode.start(time)` — no rounding, no drift.
4. Each voice maintains its own `nextBeatTime` counter, incrementing by its own
   `beatPeriodS` on each scheduled note.

This means tempo accuracy is governed by the Web Audio clock (sample-accurate, independent
of GC pauses or tab throttling), not by JavaScript timing. The 25 ms interval is only for
filling the lookahead buffer; the actual note timing is deterministic.

**Spread slider**: `spreadFactor` scales the deviation of each ratio from 1. At
`spread = 1.0`, ratios are {1, √2, φ, e/2, π/2} × 72 BPM. At `spread = 0.3`, all
voices cluster near 72 BPM (slow mutual drift). At `spread = 2.0`, the voices are wide
apart (fast mutual drift). At no value do any two ratios become rational, because
`1 + (r - 1) × s` preserves irrationality for irrational `r` and any rational `s > 0`.

---

## The SVG loom

The visual is a **piano-roll loom** rendered entirely in inline SVG (no Canvas 2D, no WebGL):

- Five horizontal lanes, one per voice.
- Each lane shows dots (note-onset marks) scrolling leftward. All lanes scroll at the same
  **pixel-per-second rate** (58 px/s), but the *spacing* between marks in each lane reflects
  that voice's own beat period. Faster voices have denser mark clusters.
- A vertical dashed "NOW" line sits at 22% from the left edge. Marks to the right are
  upcoming; marks to the left are past (rendered at lower opacity).
- When a note fires, its mark briefly brightens and a colored glow filter activates.
- The SVG animates via `requestAnimationFrame` updating DOM directly (no React re-renders
  during animation) — the mark groups are updated by clearing and repopulating `<g>` elements
  on each frame.

Near-vertical alignments of marks across lanes are **moiré effects** — they are not
structural events. The eye wants to read them as downbeats; the ear confirms no accent.
This perceptual tension between visual near-alignment and sonic non-resolution is the
central aesthetic of the piece.

**Before Begin**: the loom animates in "silent" mode using `performance.now()` as the clock.
Marks are pre-populated and continue to scroll. Audio starts on user gesture (required for
iOS/Chrome autoplay policy).

---

## Audio design

- **Pitch set**: D pentatonic across 2 octaves (D4–B5), 10 notes. No semitones, no tritones,
  no leading tones. Every pitch combination is aurally restful.
- **Timbre**: sine wave fundamental + one inharmonic partial at 2.756× the fundamental
  (approximating a bell/kalimba overtone). Both decay exponentially — the fundamental fades
  in ~1.6 s, the partial in ~0.7 s. No sustain, no vibrato.
- **Master bus**: `GainNode → DynamicsCompressor → destination`. Compressor set as a
  brick-wall limiter (ratio 20:1, threshold −12 dBFS, attack 3 ms, release 150 ms). Protects
  ears even if spread is cranked to 2.0 and all voices fire simultaneously.

---

## What's unverified

This prototype was built without audio or browser testing. The following are untested:

1. **Tempo-ratio feel at spread × 2.0**: at very high spread, the fastest voice (π/2 ratio
   × 2.0 ≈ 226 BPM) may sound machine-gun rapid rather than musical. May need a BPM cap.
2. **Moiré legibility**: the near-alignment moments are predicted to be visible as brief
   vertical clusters. Whether these are salient enough — or too frequent/rare — is untested.
3. **SVG performance on mobile**: 5 lanes × 44 marks × DOM manipulation at 60 fps is
   moderate load. On low-end devices this may drop frames; a canvas fallback was deliberately
   not added per the brief's requirement.
4. **AudioContext autoplay on iOS Safari**: the handler correctly creates and resumes the
   AudioContext inside the click callback, which should satisfy iOS policy, but is untested.
5. **Spread slider during playback**: changing spread mid-playback adjusts `beatPeriodS` for
   future notes but does not reschedule already-queued notes. A brief tempo lurch may occur.

---

## Next-cycle deepening

- **Phase proximity heatmap**: track the pairwise "near-alignment probability" across all
  10 voice pairs and render it as a background luminance gradient — brighter when voices are
  statistically closer in phase.
- **Infinite scroll depth**: currently uses a rolling 44-mark window per lane. Could extend
  the visible horizon to show 3–4 minutes ahead, giving a "score view" of future texture.
- **Microtonal spread**: currently all voices share the same 10 pitch cells. A deeper version
  would let each voice occupy a slightly detuned transposition of the pentatonic, creating
  cluster chords when they near-align in time — harmonic density as a function of metric
  proximity.
- **Nancarrow-authentic accelerandi**: Study No. 21 uses continuously accelerating lines
  (tempo-glide). A future mode could add smooth per-voice acceleration, making the phase
  relationships evolve non-linearly over longer time spans.
- **True canon form**: rather than independent cell-cycling, play a genuine canon — Voice 1
  plays the same notes as Voice 0 but offset by a fixed interval. With irrational tempo
  ratios the canon "answer" and "subject" drift through each other endlessly, a true
  Nancarrow polytempo canon.
