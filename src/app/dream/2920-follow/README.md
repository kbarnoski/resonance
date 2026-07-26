# 2920-follow — "Follow"

**The one question:** _What if Resonance had an accompanist that follows YOU — you
sing a known melody live, at your own tempo, with rubato and pauses, and it plays
the accompaniment locked to YOUR position, not a click track?_

This is a **human instrument**. You are responsible for the melody moment to
moment; the accompaniment is a partner that listens and stays with you. It is not
a self-playing simulation you watch — the seeded virtual singer exists only as the
no-mic fallback so the piece is demoable headless.

## How to play

1. Press **Start singing** and allow the microphone.
2. Sing **"Little Lantern"** — the glowing amber ribbon is the score (F major,
   sits in the E4–D5 middle-voice range). Sing it however you like: linger on a
   note, take a breath, rush a phrase.
3. The violet **playhead** marks the position the follower infers for you. Pads,
   bass and arpeggio blooms fire as it crosses each beat — they **wait** when you
   hold and **catch up** when you leap ahead.

No microphone? Press **Play the demo singer**: a seeded virtual performer sings
the tune with rubato, breath pauses and pitch wobble through the exact same
follower, so you can watch the tracking work.

## How the online-DTW score following works

- **Reference** (`reference.ts`) — "Little Lantern" as `{ pitchMidi, beat,
  durBeats }`, plus a per-segment chord track (pad + bass). The score is stored in
  **beats, not seconds** — the singer owns the tempo. It is sampled into an evenly
  spaced pitch **contour** for alignment.
- **Live pitch** (`pitch.ts`) — mic → `AnalyserNode` time-domain buffer → a
  YIN-style difference function with **parabolic interpolation** for sub-sample
  refinement → a **continuous float MIDI** pitch. An RMS + clarity gate rejects
  silence and breath. Pitch is never snapped to a scale.
- **Follower** (`follower.ts`) — an online forward-path DTW. For each live frame
  it evaluates a **banded, monotone** accumulated-cost recursion over the
  reference frames around the current head:

  ```
  D'[j] = localCost(j) + min( D[j], D[j-1], D[j-2] )
  ```

  The head is the band's arg-min; it advances monotonically, **waits** when the
  singer is silent (silence simply doesn't move it), and **catches up** on a leap.
  Local cost is an octave-folded semitone distance (a singer an octave off still
  tracks). The band is normalized each frame so cost stays bounded. A smoothed
  live BPM is derived from head-beat crossings — for display and arp rate only;
  **position is the DTW head, never a wall clock.**
- **Accompaniment** (`audio.ts`) — pads (detuned triangles → lowpass), bass, and
  arps fire **event-driven** on the head crossing each beat boundary, through a
  delay "room" into a master gain capped at **0.15**. Continuous log-frequency
  pitch; no grid snapping. The mic connects to the analyser only — never to the
  destination — so there is no feedback.

## Determinism

The virtual singer is driven entirely by `mulberry32(0x2920)` (`rng.ts`). No
`Math.random`, no `Date.now`/`new Date`. `performance.now()` is used only for RAF
timing and BPM estimation, so the headless demo performs identically every run.

## Visuals

SVG (not Canvas2D), with bounded element pools (trail, blooms) mutated by ref for
performance. A warm "lantern path": the reference ribbon, a tempo-stretching
playhead sitting at the DTW head, your live pitch trace, and chord blooms when the
accompaniment fires. Honors `prefers-reduced-motion` (calmer blooms/trail). No
strobing.

## References

- Roger B. Dannenberg, _An On-Line Algorithm for Real-Time Accompaniment_ (ICMC
  1984).
- Simon Dixon, _MATCH: A Music Alignment Tool Chest_ — online DTW.
- _Matchmaker_ (arXiv:2510.10087, 2025) — real-time music alignment.
- _The ACCompanion_ (IJCAI 2023, arXiv:2304.12939) — expressive automatic
  accompaniment.

## Honest limitations

- **Monophonic** — one sung line only; harmony/chords in the voice confuse the
  pitch tracker.
- **Room noise** — browser pitch detection degrades in noisy or reverberant
  rooms; the RMS/clarity gate trades some sensitivity for fewer false notes.
- **Monotone follower** — it doesn't jump backward, so if you restart the tune
  mid-way use **Restart from the top**. It also assumes you actually sing _this_
  melody; it aligns contour, not lyrics.
- **Latency** — a few tens of ms between your onset and the accompaniment; fine
  for a duet feel, not for tight percussive lock.
