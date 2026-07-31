# 4376 · Drag

## The one question
**What if your own delayed echo, returning across a canyon, could physically drag
your tempo off the beat — and the game is to hold a true pulse against the gravity
of a partner who is literally you, one canyon-width ago?**

You tap a steady pulse. Every tap is echoed back across a "canyon" whose width you
control. The echo pulls at your timing, and a live drift meter shows you losing —
or holding — the beat.

## The real phenomenon (and citation)
This implements a cited result from networked-music research. **Chafe, Cáceres &
Gurevich** ("Effect of temporal separation on synchronization in rhythmic
performance," CCRMA / SoundWIRE) found that when two players perform against a
transmission delay, their tempo systematically **drifts**:

- **SHORT** one-way delays make an ensemble **ACCELERATE** — each player rushes to
  fill the gap they perceive.
- **LONG** one-way delays make it **DECELERATE** — each waits for the other.
- A narrow **sweet spot** (~10–20 ms one-way; the piece uses an EPT of 11.5 ms)
  is where a steady tempo can actually lock.

Nothing here snaps to a grid. The drama is the *involuntary drift itself*.

## The mechanic
- **Tap** a pulse: Space or the on-screen pad (D4), or `A S D F` for pitched taps.
  All pitches are D-major pentatonic, so every tap is consonant — timing is the
  only thing that can be "wrong."
- Each tap is **echoed** across the canyon. The **canyon slider** sets the one-way
  delay (5–500 ms); the echo returns at **2×** (there and back), dimmer, lowpassed
  (distant) and panned to the opposite wall — the "other you."
- A **target-BPM** control sets the pulse you're trying to hold, with an optional
  quiet metronome tick.
- The **drift trace** measures your real inter-tap intervals and scrolls your tempo
  drift vs. target. It rides **sharp** at a narrow canyon and **flat** at a wide
  one. The dashed **Chafe pull** marker shows the drift the theory predicts for the
  current canyon.
- The **gravity instrument**: the true pulse is a still centre line; your tempo is a
  mass pulled off it (up = rush, down = drag). Hold within **±3 BPM for 4 beats** to
  light the **LOCKED** state — the reward and the stake.

## Subsystems
- `audio.ts` — Web-Audio delay-line-as-instrument. Marimba-ish pluck (sine +
  inharmonic 3.9× partial, fast decay) → dry path + a `DelayNode` (2× one-way) with
  a lowpassed feedback loop, `StereoPannerNode`, and a quiet square-wave metronome.
  **No AnalyserNode / FFT — this piece reasons about TIMING, not spectrum.**
- `viz.ts` — pure logic: `mulberry32` seeded PRNG, the Chafe pull law
  `driftTargetBpm`, a `TempoTracker` (EMA of inter-onset intervals → BPM → drift),
  and a seeded `DemoPlayer`. No wall-clock reads.
- `page.tsx` — inline **SVG** instrument (no Canvas2D, no WebGL); pooled ripple
  circles and trace/mass/needle mutated per frame via refs; rAF loop; keyboard/tap
  input; design-notes modal.

## Headless / self-demo
Loads in **demo drift** auto-mode: a seeded virtual player (mulberry32, hardcoded
seed) taps a pulse and visibly drifts sharp under a narrow canyon and flat under a
wide one, so the whole idea reads on a review screen with **zero input** and no
audio required (the SVG animates regardless). Tap and it hands the pulse to you.

No `Math.random` / `Date.now` / `new Date()` anywhere — time comes from
`performance.now` (input/rAF) and `AudioContext.currentTime` (scheduling).

## What's NOT verified headless
- Real audio timbre, panning and the audible delay tail (no speakers in review).
- The **felt** magnitude of the pull on a live human — the demo *bakes in* the
  Chafe law to be legible; a real player supplies their own genuine drift, which is
  what the trace measures.
- Exact latency of the reviewer's own OS/browser audio path.
- SVG rendering fidelity across aspect ratios (uses `meet`, so all art stays
  visible with letterboxing rather than cropping).

## Next-cycle deepening (folded in from the DEEP siblings — cycle 971)
`4376-drag` was the shipped winner of a 3-way DEEP fan on ONE concept — *the
delayed self is a force that acts on the player* (inverted agency vs. `3144-latency`,
where the player quantizes the lag into a canon). The two banked siblings are the
natural next moves for this piece:

- **From `4392-cistern` (⭐⭐ banked, IDEAS §971) — recursive resonant convergence.**
  Right now the echo is a clean lowpassed repeat. Deepen it toward Lucier's *I Am
  Sitting in a Room*: route the feedback tail through a small resonant `BiquadFilter`
  mode-bank so that, at wide canyon widths, holding a pulse doesn't just drift — your
  taps slowly **dissolve into a sustained drone the canyon "wanted."** The tempo game
  and the timbre convergence would then be two readings of the same delay loop.
- **From `4408-parallax` (⭐ banked, IDEAS §971) — spatial multi-tap.** Add a second
  and third echo tap at *different* canyon widths, panned to different positions, so
  the pull becomes a **field of conflicting gravities** — you're holding a pulse
  against three delayed selves at once, and the "sweet spot" becomes a moving target
  you steer between. Turns a duet into a small ensemble of you.
- **Own residual (from the build):** derive the demo's drift from a real two-agent
  coupling model rather than baking the Chafe law; add per-player adaptive lock
  tolerance; visualize the *history* of locks/losses as a trail.
