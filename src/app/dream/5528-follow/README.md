# 5528 · Follow

**A transparent, browser-native chamber partner that FOLLOWS you.**

You play a piece; a follower tracks your position in a *known reference score*
in real time — breathing with your tempo and rubato, and staying with you even
when you rush, drag, stumble on a wrong note, skip ahead, or repeat a phrase.
Like an automatic page-turner and accompanist that never loses its place.

This is a **new verb** for the lab: not paint the music, not analyze it, not
compose it, not duet against it — **follow** a live performer against a score.

Route: `/dream/5528-follow`

---

## What it is

- **The reference score the follower knows.** Beethoven's *Ode to Joy* theme
  (two 16-beat phrases, C major), encoded as a sequence of
  `{ pitchMidi, beatStart, beatDur }`.
- **A live pitch/onset detector.** The microphone is read through an
  `AnalyserNode`; a dependency-free autocorrelation pitch detector
  (McLeod-style peak-pick with parabolic refinement) plus a stable-pitch onset
  gate turns your playing into a stream of note onsets. Web MIDI would feed
  note-ons directly (cleaner input) — noted as the alternate live input.
- **The follower engine** — the core (see below).
- **The accompanist.** A restrained second voice (Web Audio): warm
  triangle/sine pad chords + a soft bass pulse, through a `DynamicsCompressor`
  limiter, master gain ≤ 0.2, started only on a user gesture. It is driven
  entirely by the follower's estimated beat + tempo, so it audibly speeds up,
  slows down, and **waits** with the soloist.
- **A seeded synthetic performer** so the whole thing self-demos hands-free.

Everything visual is **SVG / DOM** — a scrolling staff with a live follower
cursor, belief heat on each note, a soloist trail, and an alignment ribbon. No
Canvas2D, no WebGL, no three.js.

---

## The follower algorithm (transparent, no training)

An **online DTW / cost-grid forward tracker** (`FollowerEngine` in
`follow.ts`). A belief over score positions is held as an accumulated cost
array `cost[j]` (lower = more likely). Each detected onset runs **one**
relaxation:

```
cost'[j] = emission(pitch, note j) + min over i ( cost[i] + transition(i, j) )
```

- **`emission(pitch, note)`** rewards an exact pitch (0), forgives an octave
  (0.35, common in autocorrelation), mildly forgives a neighbour fumble
  (≤2 semitones → 0.85), and penalises a far miss (1.7) — but **never blocks**,
  so a wrong note costs a little and the tracker holds its place instead of
  derailing.
- **`transition(i, j)`** prefers advancing one note (`d=1` → 0), tolerates
  staying put (`d=0` → 0.55, a trill/held/repeated note), permits forward
  jumps / **skips** (`d>2` → grows with distance) and backward jumps /
  **repeats** (`d<0`). The backward cost is tuned so an *exact* backward match
  beats a *forward fumble*, while a forward *exact* match still always wins in
  clean playing.
- The cost array is renormalised each step (subtract the min) so it never blows
  up and repeats stay reachable.
- **Cold start** is anchored: the very first onset uses a soft position prior
  (`0.3·j`) instead of the DP, otherwise two identical opening notes (E E) let
  the frontier read one note ahead.
- **Confidence** = normalised gap between the best and second-best cost.
- **Belief** = `softmax(−cost)`, surfaced as the heat glow on each score note —
  you can watch the distribution concentrate and spread.
- **Live tempo** is estimated from the timing of recent *confident* advances
  (score-beats elapsed ÷ real seconds elapsed, EMA-smoothed, clamped
  40–300 BPM); the accompanist locks to it.

Every onset is classified into a legible event — `advance`, `skip detected +n`,
`repeat matched −n`, `wrong note ignored` — and streamed to the on-screen log.

### Verified headlessly

A test harness runs the seeded synthetic performance through the engine. With
the current tuning it produces, in order:

- `skip detected +3` (soloist jumps over two notes → follower jumps with it),
- `wrong note ignored (C♯4≠D4)` (follower holds the correct position),
- `repeat matched −3` (soloist repeats a four-note phrase → follower jumps back
  and tracks the repeat),

and the estimated index matches the performer's ground-truth index with **zero**
drift > 1 note (excluding the deliberately wrong note), while the tempo estimate
breathes through the rubato.

---

## The seeded synthetic performer

`buildSyntheticPerformance()` uses a `mulberry32` PRNG seeded `0x5528` to "play"
the reference score with deliberate, visible expressive deviations:

- **rubato** — smooth phrase-level tempo push/pull, a phrase-final ritardando,
  and seeded human jitter,
- **one wrong note** — a semitone fumble the follower ignores,
- **one skip-ahead** — the soloist jumps over two notes,
- **one repeated phrase** — four notes replayed before moving on.

So on load the piece **self-demos hands-free**: you watch the follower track the
synthetic soloist through all four hard cases while the accompaniment stays with
it. Deterministic, so a headless review is reproducible with zero hardware.

---

## How it degrades

- **No mic / no MIDI / headless:** the seeded synthetic performer drives
  everything — the score self-plays (silently until you press *Begin*), the
  follower tracks it, and the accompanist follows once audio is enabled.
- **Mic denied:** an on-brand `text-destructive` notice appears and the
  self-playing demo keeps running.
- **Autoplay policy:** no `AudioContext` is created until the first user
  gesture (*Begin — play along* / *Use my microphone*). Master gain ≤ 0.2
  through a compressor/limiter.
- **Teardown:** the rAF loop, `AudioContext`, mic tracks, and accompanist are
  all stopped on unmount.

---

## Named references

Framed as the transparent, browser-native, **no-training** cousin of:

- **Matchmaker: An Open-Source Library for Real-Time Piano Score Following**
  — arXiv:2510.10087, ISMIR 2025.
- **The ACCompanion** — a reactive + expressive automatic piano accompanist,
  arXiv:2304.12939.
- the classical **Dannenberg (1984) / Raphael** score-following lineage.

Matchmaker and the ACCompanion use trained/statistical alignment and expressive
models; this prototype is a hand-tuned, dependency-free cost grid you can read
top to bottom in one file — the point is *legibility*, not benchmark accuracy.

---

## What's not yet verified

- **Polyphonic input** — the pitch detector is monophonic (one line at a time).
- **Web MIDI** — described and designed for as the alternate live input, but the
  MIDI path is not wired up in this prototype (mic + synthetic performer only).
- **Robustness to heavy background noise / reverberant rooms** on real mic
  input — the onset gate is deliberately simple.
- The emission/transition costs are **hand-tuned**, not learned; heavily
  self-similar scores can admit an alternate valid alignment on a repeat.

---

## Files

- `page.tsx` — the client component: SVG staff + ribbon + readouts + log, the
  transport loop, mic/demo wiring, controls, and the design-notes modal.
- `follow.ts` — reference score, pitch/onset helpers, the `FollowerEngine`, the
  seeded synthetic performer, and the `Accompanist` (Web Audio).
- `README.md` — this file.
