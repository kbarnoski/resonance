# Tempo Canon

**The one question:** *What if Resonance could be your accompanist — following YOU
through a known piece instead of you following a fixed click?*

Tempo Canon is a live score-follower. You play the melody of Beethoven's
"Ode to Joy" (the right-hand line); the system aligns your live performance to
the reference score in real time and plays the bass + chord accompaniment (the
left hand) **locked to your position and tempo** — speeding up when you rush,
slowing when you ritard. The signature of this prototype is that you can
literally *see* the alignment: the **warping path** — a diagonal that bends as
you rush or drag — is the centerpiece visual.

Route: `/dream/375-tempo-canon`

---

## How the follower works — online (streaming) DTW

The engine (`dtw.ts`) is **online / streaming Dynamic Time Warping**, in the
spirit of Simon Dixon's **MATCH** (online time warping, 2005). Instead of
building the full N×M cost matrix offline, it grows an alignment path one note
at a time as live notes arrive.

On each incoming played note we:

1. **Local cost** — compute a pitch distance between the played note and each
   reference note inside a **bounded search window** ahead of the last committed
   column (`windowRadius = 5`). The cost is pitch-class aware so octave slips are
   cheap and exact matches are free.
2. **DTW recurrence** — extend the accumulated-cost frontier with the classic
   recurrence over three predecessors:
   `D(i,j) = cost(i,j) + min( D(i-1,j), D(i,j-1), D(i-1,j-1) )`
   where *i* is the live-note row and *j* is the reference column. This is the
   forward/online form: only the current and previous frontier rows are kept,
   and only columns inside the window are evaluated.
3. **Commit** — take the reference column with the lowest accumulated cost in the
   window as the new score position. Commits are forward-only (the position never
   jumps backward), which keeps the accompaniment from stuttering.
4. **Tempo from path slope** — local tempo is the **slope of the warping path**:
   reference columns advanced per live note over a short history. Slope ≈ 1 means
   you're in step; **steeper than 45° (slope > 1) means you're rushing**;
   **shallower (slope < 1) means you're dragging**. That slope modulates the
   reported BPM and the accompaniment's note durations so the left hand breathes
   with your rubato.

The committed `(row, col)` cells are exactly the warping path the GPU draws.

---

## The built-in demo — verifiability with no hardware

The headline feature is the **"Play demo ▸"** button. It runs the follower
against a **baked "known performance"** of the melody with expressive rubato
(`makePerformance()` in `score.ts`): a steady intro, an **accelerando** through
the middle, then a **ritardando** into the final held note, plus small,
deterministic per-note timing jitter. Notes are emitted one at a time, on
wall-clock timers, exactly as if a human were playing.

The follower never sees the score positions — it only receives pitches over time
and must align them. So the whole piece **self-verifies with no microphone, no
MIDI device, and no camera/GPU-capture**: you press one button and watch the
warping path bend (steepening during the accelerando, flattening during the
ritard) while the accompaniment locks on and changes tempo with it. This is the
default, unmissable path.

---

## Input modes

1. **Demo (required, default):** the baked rubato performance described above.
2. **Computer keyboard:** the home-row keys `a s d f g h j k` map to the
   pitches of the melody in D major (D E F# G A B C# D'). Key labels are shown
   on the page; the last key flashes.
3. **Web MIDI:** "Connect MIDI" calls `navigator.requestMIDIAccess()` and listens
   for note-on messages from a real keyboard. If Web MIDI is unsupported or
   access is denied, it shows a clear status line and never throws.

---

## Why GPU / WebGL2, and why the warping path

The visual (`gl.ts`) is raw **WebGL2** with custom vertex/fragment shaders — not
SVG, not Canvas2D. The plot puts **reference score time on the X axis** and
**your performance time on the Y axis**. On it we draw:

- the **warping path** as a glowing, interpolated polyline that bends in real
  time — the most legible possible picture of "the machine is following you";
- the faint **45° in-step guide** so rushing/dragging is visible as deviation;
- the **bounded DTW search window** as a translucent band ahead of the cursor;
- the **current cell** as a bright pulsing cursor;
- **accompaniment fires** as expanding soft rings on the path, one per chord.

The path is the whole point: a static picture of an alignment matrix is the
clearest way to show *why* the accompaniment moves the way it does, and it must
react on every note, which the GPU handles smoothly. If WebGL2 is unavailable
the page shows a readable notice and the follower + audio still run.

---

## Audio

`audio.ts` is Web Audio synthesis only — no samples, no audio libraries. A
piano-ish voice is a pair of slightly detuned oscillators through a fast-attack /
exponential-decay gain envelope. Two roles:

- **Melody echo** (optional, soft) — a quiet confirmation of the note you played.
- **Accompaniment** (the star) — a functional bass note + chord triad fired by
  the follower at your committed score position, using the piece's real harmony
  in D major (I / V / vi / IV functional bass). The chord's decay scales with the
  slope-derived tempo, so it rings longer when you drag and shorter when you rush.

---

## References

- **Matchmaker: an open-source library for real-time piano score following**,
  arXiv **2510.10087** (Oct 2025) — systematically compares DTW vs HMM
  followers; the framing of streaming, note-level alignment here follows that
  line of work.
- **Simon Dixon, "Live Tracking of Musical Performances Using On-Line Time
  Warping"** (2005) — the MATCH system; the bounded-window, forward-only online
  DTW used here is directly in this tradition.

---

## Honest caveats

- This prototype is **build-verified** (TypeScript strict + ESLint clean) but has
  **not** been verified in a live browser or against a real MIDI device in this
  session. The demo path is designed precisely so it can be verified without any
  hardware.
- Thresholds are **reasoned, not tuned on data**: the window radius (5), the
  pitch-cost weights, the BPM smoothing (EMA 0.6/0.4) and the slope→tempo
  blend are sensible starting points, not optimized against a corpus.
- The follower is forward-only and intentionally simple: it does not model
  trills, wrong notes beyond cost penalties, or large skips/repeats the way a
  production HMM/DTW hybrid (à la Matchmaker) would.
