**For**: kids (4+)

# 371 · Kids Clap-Along

A call-and-response clapping **conversation** with a friendly creature. The
creature claps a short rhythm; the child claps it back **with their real hands**;
the phone *hears* the claps through the microphone (no screen-tapping); and on a
good-enough match the creature delights and the shared rhythm **grows by one
clap** — Simon-style — so the song the two of you share gets longer and longer.

No reading, no score, no fail. A missed match just warmly replays the same
pattern ("let's try together").

Route: `/dream/371-kids-clap-along`

---

## The one question

> What if a 4-year-old could have a clapping CONVERSATION with a friendly
> creature — clap with their real hands, the phone HEARS it, and the shared
> rhythm GROWS each time they clap it back?

## How it works

### 1. Hearing a clap — real onset detection (`onset.ts`)

This is the lab-first technique, implemented for real (not faked). A hand-clap
is a sharp **broadband transient**: for a few milliseconds energy jumps across
the whole spectrum, brightest up high. Each animation frame we:

1. read the microphone's FFT magnitude spectrum from an `AnalyserNode`
   (`getFloatFrequencyData`, dB → linear), with `fftSize` 1024 and
   `smoothingTimeConstant` 0 so transients aren't blurred across frames;
2. compute a **spectral-flux / high-frequency-content (HFC)** novelty — the sum
   of *positive* (half-wave-rectified) bin-to-bin energy increases, **weighted
   toward high bins**, so a bright broadband snap pops while the steady drone,
   voices and low rumble stay quiet;
3. compare it to an **adaptive threshold** — a slow running mean of the novelty
   (times a slack multiplier, plus a floor) — so the detector self-tunes to a
   noisy kitchen or a quiet bedroom instead of using a brittle fixed level;
4. apply a **~140 ms refractory window** so a single clap — including a wobbly
   4-year-old's two-handed double-bounce — counts **once**.

The threshold is deliberately **forgiving**: a soft, off-centre kid clap still
registers.

### 2. The growing conversation (`pattern.ts`)

A small state machine: `intro → calling → waiting → judging → celebrate → …`.
The creature **calls** a rhythm (beat offsets in seconds). During **waiting** we
record the child's detected onset times and greedily match them against the
target beats within a **generous tolerance** (`±0.34 s`), scoring on "did roughly
the right number of claps land near the right places," not millisecond accuracy.
Hit ~60% and it's a **match**: the creature celebrates and the pattern **grows**
by one clap (occasionally a syncopated off-beat for groove). A miss costs
nothing — the same pattern is replayed warmly. The growing shared rhythm *is* the
song.

### 3. One pipeline, three doors

Every input route is judged by the **identical** onset machine:

- **Microphone** — real acoustic claps, read each frame via `sampleMic()`.
- **Pointer / tap "clap"** (mic denied or no mic) — a tap plays a **real
  broadband noise burst** into the *same* analyser, so `sampleMic()` detects it
  exactly like a hand clap.
- **Auto-demo** — if no real claps arrive for ~4.5 s, the piece **plays itself
  hands-free**: the creature calls *and* claps its own answer back, again through
  the same `clap()→analyser→detector` path. (Critical: a reviewer can open this
  on a phone at 06:30 and watch the full call→response→grow loop with zero
  interaction.)

### 4. Sound (`clap-audio.ts`)

- Always-on soft **D + A drone** pad (so it's never silent), gently breathing.
- **D-Dorian** tuned clap voices — D E F G A B C, **explicitly not**
  C-major-pentatonic — with the creature's call panned/brightened one way and the
  child's answer the other, so call and response feel like two voices. Beats are
  tuned *up the scale* by position, so the growing rhythm reads as a little tune.
- A rising **reward sparkle** on each grow; a soft low "let's try together" cue
  on a gentle retry (never a fail buzzer).
- Everything sums through a `DynamicsCompressor` used as a **hard limiter**, so
  it can never blast a child's ears.

### 5. Visuals (`creature-gl.ts`) — raw WebGL2

Hand-written GLSL ES 3.00: one warm **breathing creature** (soft blob with eyes
that curve into happy arcs when it's delighted; it squashes when it claps and
leans in to listen on the child's turn) above a **row of glowing clap beads** —
one per beat — that **grows** with the song so the child can *see* it getting
longer. Beads light amber for the creature's call and mint for the child's
answer. All layers are composited **matte** (`gl.ONE, gl.ONE_MINUS_SRC_ALPHA`,
premultiplied alpha-over) — **no additive bloom / glow-stacking** (lab house
style). Brightness comes from colour, not blend overflow.

## Graceful degradation

- **iOS / permission:** the `AudioContext` is created and `getUserMedia({audio})`
  is called **inside the Start-button tap gesture** (required on iOS/Safari). The
  mic is routed only into the analyser (never to the speakers → no feedback) and
  is **analysis-only**: never recorded, uploaded, or sent anywhere. No network,
  no API route, no secrets.
- **Mic denied / unavailable:** a readable `text-rose-300` notice appears and the
  **tap-to-clap** fallback turns on — tapping the screen feeds the identical
  onset pipeline, so it's always playable.
- **No claps for a few seconds:** the **auto-demo** takes over so it plays itself.
- **No WebGL2:** a `text-rose-300` notice appears; **audio still runs**.

## Named references

- **Drumball** (Audio Mostly 2024) — a tangible call-and-response drumming system
  inspired by the West African djembe.
- **Steve Reich, *Clapping Music* (1972)** — clapping as composition.
- The **African call-and-response / "talking drum"** tradition.

## Tags

- **INPUT:** microphone / acoustic clap (NOT touch, NOT tilt, NOT camera)
- **OUTPUT:** raw WebGL2 (hand-written GLSL ES 3.00), matte premultiplied
  alpha-over compositing (no additive bloom)
- **CORE TECHNIQUE:** real-time spectral-flux / HFC onset detection (adaptive
  threshold, ~140 ms refractory) + a growing-memory call-and-response engine
- **PALETTE/VIBE:** kids, warm, calm-but-playful; D-Dorian tuned percussion over
  an always-on D+A drone

## Files

- `page.tsx` — Next.js client page: Start gesture, mic permission, the unified
  detect→respond loop, HUD, fallbacks, design notes.
- `onset.ts` — the microphone onset detector (spectral flux + HFC + adaptive
  threshold + refractory); `inject()` lets synthetic transients use the same
  judge.
- `pattern.ts` — the call-and-response growing-memory engine (state machine,
  tolerant matching, grow-on-success).
- `clap-audio.ts` — Web Audio: D-Dorian clap voices, D+A drone, reward/encourage
  cues, the shared analyser + synthetic tap-bus, and the limiter.
- `creature-gl.ts` — the raw WebGL2 renderer (creature + growing bead row).

## Unverified surface (honest note)

This was built in a sandbox with **no real microphone and no GPU**, so the
following could not be empirically tested and are tuned by reasoning, not
measurement:

- **Onset thresholds & weights.** The spectral-flux normalisation, adaptive-mean
  follow rate, threshold multiplier/floor, HFC band and refractory length are
  hand-tuned against the *idea* of a clap's spectrum. On real hardware they may
  need adjustment — too sensitive (room noise / the drone triggering) or too deaf
  (soft kid claps missed). The forgiving defaults lean toward catching claps.
- **Mic vs. self-noise.** The mic is routed into the same analyser as the
  synthetic tap-bus and the drone; in practice the HFC weighting + adaptive
  floor are meant to keep the drone below threshold, but this is unverified on a
  real device with real mic gain / AGC behaviour.
- **Auto-demo vs. real claps overlap.** While the auto-demo is running, its own
  injected claps are indistinguishable from real ones at the detector, so a real
  *mic* clap won't cancel the demo (a screen *tap* reliably will). On a real
  device this edge is mild but real.
- **WebGL2 GLSL** compiled but never rendered here; the `gl_PointSize` bead/eye
  sizes and the "smile arc" shader math are untested visually and may want
  tuning on a real display / DPR.
- Browser FFT timing, `getUserMedia` constraint support (we request
  `echoCancellation/noiseSuppression/autoGainControl: false` to keep the raw
  transient, which some browsers ignore), and iOS gesture-unlock behaviour are
  all assumed-correct from spec, not observed.
