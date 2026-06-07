# 397 · Crystal Bloom

**One question:** What if a 4-year-old could **blow or hum** into the microphone and grow a tower of **singing crystal bells** tuned to **pure harmonic ratios** — a glassy, shimmering, beating-free chord that sounds unlike any piano?

This is the lab's foreign-tonal-world / calm, eyes-free piece. It lives in **just intonation** (pure frequency ratios), not equal temperament and not the over-used D-Dorian modal scale.

Route: `/dream/397-kids-crystal-bloom`

---

## How to play

1. Tap the big **✦ Tap to begin ✦** button. (This is the one user gesture that creates and resumes the AudioContext, so everything responds instantly.)
2. **Blow or hum** softly into the mic. A gentle breath lights and rings the lower bells; a louder, sustained hum **climbs the tower**, lighting higher pure-ratio bells in sequence, each ringing as it lights.
3. Hold a steady sound and the whole stacked chord **shimmers** — every lit bell rings together, beating-free. That audible "lock" is the whole point.
4. Stop, and the bells slowly fade back to dim while a soft drone keeps breathing. The tower never goes silent.

**No reading required.** Each bell has its own bold saturated color — color is the language for pre-readers.

### Fallbacks (no fail states)
- **No mic / mic denied / silent for ~3s:** a synthetic breath envelope takes over and blooms the tower hands-free on a calm ~7s loop. The piece is beautiful and audible with zero microphone.
- **Press and hold the tower** (mouse or touch) to breathe it manually.
- Any mic error is shown in `text-rose-300` — failures are never hidden.

The status line tells you which source is driving the tower: *listening to you* (emerald), *press-and-hold breath* (violet), or *breathing on its own* (amber).

---

## The tuning (the soul of the piece)

Fundamental **f0 = 110 Hz (A2)** — warm, never piercing. The bell tower is built from pure just-intonation ratios above it:

| #  | Ratio | Interval            | Frequency (Hz) | Color    |
|----|-------|---------------------|----------------|----------|
| 0  | 1/1   | unison              | 110.00         | rose     |
| 1  | 9/8   | pure major 2nd      | 123.75         | orange   |
| 2  | 5/4   | **pure major 3rd**  | 137.50         | amber    |
| 3  | 4/3   | pure fourth         | 146.67         | lime     |
| 4  | 3/2   | **pure fifth**      | 165.00         | emerald  |
| 5  | 5/3   | pure major 6th      | 183.33         | cyan     |
| 6  | 2/1   | octave              | 220.00         | blue     |
| 7  | 9/4   | pure ninth          | 247.50         | violet   |
| 8  | 5/2   | pure major 10th     | 275.00         | fuchsia  |

A soft sustained **drone on f0 + its pure fifth (3/2)** runs underneath so there is never silence; a very slow LFO makes the drone amplitude "breathe."

### Why pure ratios sound glassy / beating-free (the educational hook)

When two tones are slightly mistuned, their partials drift in and out of phase, producing **beats** — a slow amplitude wobble that the ear hears as roughness. In **just intonation**, every interval is an exact small-integer fraction, so the upper partials of stacked bells land on *exactly the same frequencies*. They phase-lock instead of beating. The result is a still, "glassy," shimmering consonance.

A 12-tone **equal-tempered** piano physically can't do this: it divides the octave into 12 identical steps of 2^(1/12), so its major third is 2^(4/12) ≈ **1.2599**, sharp of the pure 5/4 = **1.25** by about **+14 cents**. That ~14-cent error is exactly what produces the familiar slow beating wobble in a piano chord — and exactly what's *absent* here.

### Synthesis

Each bell is **additive**: a few sine partials at integer multiples of its own frequency (1, 2, 3, plus a soft inharmonic shimmer partial and a faint 6th), with a **fast attack and long exponential shimmer tail** — a struck-crystal envelope. Everything passes through a gentle **soft-clip waveshaper → low-pass (~6 kHz) → compressor/limiter**, so peaks stay gentle: kids-safe, no sudden loud transients, nothing harsh in the highs.

---

## Tags

- **INPUT:** microphone — breath + hum **loudness only** (RMS envelope with a one-pole fast-attack / slow-release follower; **not** pitch detection).
- **OUTPUT:** **SVG** — animated inline SVG via React state/refs and a RAF loop (faceted gem bells, glow halos, refraction sparkles). Not canvas, not WebGL.
- **TECHNIQUE:** just-intonation harmonic-series additive synthesis (pure integer frequency ratios), with a sustained drone and a soft limiter. Web Audio API only — no audio npm deps.
- **VIBE:** crystalline, calm, contemplative, foreign-tonal.

---

## References

- **Harry Partch** — pioneer of just intonation and custom microtonal instruments; the conceptual ancestor of building music from pure integer ratios rather than equal temperament.
- **Scale Workshop** and **Tune.js** — browser-based microtonal / alternative-tuning tooling that makes just-intonation scales playable in the web audio stack.
- **purified-synth / "Pure Intonation" browser sequencer (RubyKaigi 2026)** — recent-research anchor: a browser sequencer demonstrating live pure-intonation playback, motivating this build's beating-free, ratio-locked approach.

---

## Files

- `page.tsx` — UI, inline SVG bell tower, RAF render loop, auto-demo, press-and-hold and mic input handling.
- `ji.ts` — just-intonation ratio table, Web Audio bell synthesis (additive partials + envelope), sustained drone, soft-clip + low-pass + limiter chain.
- `mic.ts` — `getUserMedia` + `AnalyserNode` RMS envelope with one-pole smoothing (loudness only).
- `README.md` — this file.

---

## Ambition-floor self-assessment

- **≥3 distinct subsystems:** yes — (1) mic RMS loudness envelope (`mic.ts`), (2) animated inline-SVG render loop (`page.tsx`), (3) just-intonation additive bell synth + drone + limiter (`ji.ts`).
- **Named reference:** yes — Harry Partch, plus Scale Workshop and Tune.js as browser microtonal tooling.
- **Genuinely-recent research anchor:** yes — the purified-synth / "Pure Intonation" browser sequencer presented at RubyKaigi 2026.
- **Audio-visual, self-contained, kids-safe, degrades gracefully:** yes — produces both sound and visuals, lives entirely in this folder, no API routes, gentle limited audio, and a hands-free synthetic-breath auto-demo so it's beautiful and audible even with the mic denied.
