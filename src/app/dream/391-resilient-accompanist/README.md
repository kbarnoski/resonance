# 391 · Resilient Accompanist

**Cycle 3 of the Resonance "Accompanist" thread.**

> *"What if the machine accompanist could survive my mistakes — wrong notes,
> skips, hesitations — and gracefully find its place again, instead of derailing?"*

Cycle 1 ([`375-tempo-canon`](../375-tempo-canon)) followed the soloist's **tempo**
with online DTW. Cycle 2 ([`380-expressive-accompanist`](../380-expressive-accompanist))
added **dynamics + articulation** coupling. This cycle adds **robustness**: an
accompanist that *survives the soloist's mistakes* and visibly recovers.

A naive online-DTW follower (cycles 1/2) derails when the soloist plays a
wrong-note run — it commits forward into the wrong place and the accompaniment
follows it off a cliff. This one keeps a second, error-aware follower running in
parallel and hands control over when DTW loses the plot.

---

## How to use

- **Baked fumble demo (default):** auto-plays ~1.5 s after the page loads. If the
  browser blocks autoplay, press **▸ Play fumble demo**. It plays "Twinkle
  Twinkle Little Star" and deliberately stumbles so you can *hear and see* the
  recovery hands-free — ideal on a phone with no MIDI.
- **Keyboard:** home-row keys `a s d f g h j k` are the C-major scale
  (C D E F G A B C′). Play the tune, then deliberately hit a wrong key, skip
  ahead, or pause and repeat a note — watch the supervisor react.
- **MIDI (optional):** press **Connect MIDI**; a connected device drives real
  note velocity into the dynamics coupling.

---

## The dual DTW ⇄ HMM supervisor (the lab-first mechanic)

Two followers run on every played note; a confidence supervisor arbitrates.

```
                       played note (pitch, velocity, duration, dt)
                                      │
                 ┌────────────────────┴────────────────────┐
                 ▼                                          ▼
        ┌──────────────────┐                      ┌──────────────────┐
        │  Online DTW       │                      │  Score HMM        │
        │  (smooth, fast)   │                      │  (robust, error-  │
        │  bounded window,  │                      │   aware: self /   │
        │  path slope=tempo │                      │   skip / back)    │
        └────────┬──────────┘                      └─────────┬────────┘
            confidence ↓                                 MAP state ↓
                 └───────────────► SUPERVISOR ◄───────────────┘
                            (hysteresis gate on DTW confidence)
              conf < 0.42  → hand control to HMM   (robust)
              conf > 0.70  → hand control to DTW   (smooth)
                                      │
                                      ▼
                     accompaniment plays at the TRUSTED position
                     (still coupled to dynamics + articulation, cycle 2)
```

- **Online DTW** — ported from cycles 1/2, in the spirit of Dixon's MATCH:
  forward-only, bounded search window (radius 5), recurrence
  `D(i,j) = cost(i,j) + min(D(i-1,j), D(i,j-1), D(i-1,j-1))`, path slope as a
  local tempo proxy. Smoothest and lowest-latency when the soloist is correct.
  It also reports a **confidence** (EMA of `exp(-localCost)`): a single slip
  dips it, a wrong-note *run* collapses it.
- **Score HMM** — left-to-right hidden Markov chain, one state per score note,
  with explicit **error transitions**: a `self`-loop (hesitation / inserted
  wrong note), `skip` +2/+3 (jumped forward), and a small `back` −1 (repeat).
  Emission probability is high on an exact pitch match but **low-but-nonzero** on
  a mismatch — that floor is the trick: a wrong note only dents a state's
  likelihood, so belief mass survives on the correct neighbourhood and the MAP
  estimate snaps back when the soloist returns. (After Nakamura et al.)
- **Supervisor** — watches DTW confidence with **hysteresis** (`lo = 0.42`,
  `hi = 0.70`) so it doesn't flap: it drops to the HMM only when confidence truly
  collapses, and returns to DTW only once it clearly recovers. The accompaniment
  always plays at the *trusted* follower's position. A soft downward "uh-oh"
  blip marks a handover to the HMM; an upward "found-it" blip marks the return.

The visualization (**SVG** — the jury banned WebGL2/three.js this cycle) shows a
horizontal score timeline, a green **DTW cursor** (top) and a dashed violet
**HMM cursor** (bottom) drawn distinctly, the trusted one **glowing**, a faint
violet **belief cloud** under the ticks (the HMM's spread hypotheses), a
**confidence band** with the lo/hi threshold guides that visibly dips during
fumbles, and labeled **fumble markers** that pop above the timeline.

---

## What to observe in the baked demo

| # | Moment | What the soloist does | What to observe |
|---|--------|-----------------------|-----------------|
| 1 | **Clean opening** | C C G G A A G (on the score) | Green DTW cursor leads; confidence band sits high (emerald); "in control: DTW". |
| 2 | **Wrong-note run** | three sour off-key notes (F♯, D♯, A♯) | Confidence band plunges through the rose threshold; "wrong note" markers pop; control hands to the **HMM** (violet cursor glows); a downward blip sounds. |
| 3 | **Recovery** | back on the score (G F F …) | Belief re-concentrates; confidence climbs back past the emerald threshold; control returns to **DTW**; upward blip. Accompaniment never derailed. |
| 4 | **Skip-ahead** | jumps forward, omitting two notes | HMM `skip` transition lets the cursor **leap forward** to catch up; a "skip ahead" marker pops; the chord jumps to the right place rather than lagging. |
| 5 | **Hesitation / repeat** | long pause, then an accidental repeated note | The follower **holds its place** (self / back transitions) instead of running away; a "hesitation" marker pops. |
| 6 | **Clean resolution** | resolves onto the tonic C | Confidence settles high, DTW back in control, accompaniment lands the I chord. |

The whole hands-free playthrough is ~10–11 s and makes all four robustness
moments both **audible** (the blips + the chord staying in place) and **visible**
(cursors, confidence dip, fumble markers).

---

## Graceful degradation

- **No MIDI** → keyboard + the baked demo still fully work.
- **Autoplay blocked** → the big **Play fumble demo** button starts it.
- **SVG/render problem** → a `text-rose-300` notice appears but the follower and
  audio keep working.
- **Cleanup** → the RAF loop is cancelled, the `AudioContext` is closed, and MIDI
  listeners are nulled on unmount.

---

## References

- **The ACCompanion** — Cancino-Chacón, Peter, Widmer. *The ACCompanion:
  Combining Reactivity, Robustness, and Musical Expressivity in an Automatic
  Piano Accompanist.* IJCAI 2023. arXiv:2304.12939. (The expressive-coupling +
  robustness framing this thread builds toward.)
- **Nakamura et al.** — *Real-Time Audio-to-Score Alignment of Performances
  Containing Errors and Arbitrary Repeats and Skips* (parallel HMM with
  delayed-decision / anticipation). The error-transition HMM here is a small,
  online homage to this approach.
- **Simon Dixon, MATCH** — *Live Tracking of Musical Performances Using On-Line
  Time Warping* (2005). The bounded-window online DTW follower.

Builds on lab cycles [`375-tempo-canon`](../375-tempo-canon) (online-DTW tempo
following) and [`380-expressive-accompanist`](../380-expressive-accompanist)
(dynamics + articulation coupling), both of which this cycle ports and extends.

---

## Files

- `page.tsx` — UI, SVG visualization, demo autoplay, keyboard + MIDI input, cleanup.
- `score.ts` — Twinkle Twinkle (C major) reference, functional harmony, keyboard
  map, and the scripted **fumbling** baked performance (`makePerformance`).
- `dtw.ts` — online DTW follower (ported from cycles 1/2) + confidence.
- `hmm.ts` — error-aware left-to-right HMM score-position model.
- `supervisor.ts` — the confidence-gated dual follower (the new feature).
- `audio.ts` — Web Audio synthesis: melody echo, expressive accompaniment, handover blips.
- `viz.ts` — pure SVG layout helpers (geometry, colors, confidence polyline).
