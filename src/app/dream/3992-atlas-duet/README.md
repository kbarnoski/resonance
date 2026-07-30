# 3992 · Atlas · Duet

**Route:** `/dream/3992-atlas-duet`

## The one question

**What if you weren't alone in a recording's timbre-space — what if a self-listening
machine voice foraged the same cloud beside you, a duet partner that listens to the
path you just traced and answers with its own complementary path through the sound?**

A deep deepening of `3608-atlas` (a real corpus-based concatenative-synthesis
instrument). Atlas made a recording a *place* you could walk to play. Atlas · Duet
puts a second forager in that place: a machine voice that self-listens and answers.

## Subsystems

- **`duet-corpus.ts`** — corpus builder. Slices an audio buffer into ~46 ms grains,
  measures real spectral descriptors per grain (FFT centroid, RMS, autocorrelation
  pitch/periodicity, flatness, spread), and projects every grain to a 2-D atlas
  position. Also renders the deterministic default phrase (seed `0x3992`). Adds a
  per-grain `pitchHz` Float32Array so the agent can search for consonant grains
  without object churn.
- **`duet-audio.ts`** — `DuetEngine`: **two** independent k-nearest granular
  playheads (`GranularVoice`) foraging the same corpus, mixed under one soft-clip.
  The **human** voice is panned slightly left (−0.35), the **agent** slightly right
  (+0.35) for legibility. Each voice exposes the pitch of the grain it is *currently
  sounding* (`voicedPitchHz`) — that is what the agent self-listens to. Agent
  "presence" rides a per-voice output gain.
- **`duet-gl.ts`** — `DuetRenderer`: raw WebGL2 `gl.POINTS` cloud on the violet ramp,
  plus the duet overlay — human halo, agent bead, a fading agent trail
  (`gl_VertexID`-aged points), and a connecting `gl.LINES` segment whose brightness
  rides harmonic consonance.
- **`duet-agent.ts`** — `DuetAgent`: the self-listening co-creative brain (below).
- **`page.tsx`** — wiring, seeded human stand-in, pointer handover, presence slider,
  file-drop, HUD, design-notes modal, full teardown.

## The agent's self-listening rules (MACataRT-style)

The agent keeps a rolling **~3 s memory** of the human's trajectory (throttled
samples + a smoothed gesture-speed estimate). Each frame it blends three
deterministic, legible rules into one target, then moves toward it (faster while
actively responding), with a tiny seeded jitter so it feels alive:

1. **Complementarity** — target ≈ `(-humanX, -humanY)`: it drifts toward the region
   you are *not* in. Dwell in the bright/high corner and it fills the dark/low one.
2. **Call-and-response** — when your smoothed speed crosses a threshold (a "phrase"),
   `gestureRecent` lifts and decays over ~1.2 s. While it is high, the agent aims at
   your position **~0.55 s ago, reflected to the far side** — echoing your recent
   gesture a beat later, in the complementary region.
3. **Self-listening / consonance** — throttled every ~0.18 s it scans the corpus for
   a grain whose pitch forms a **just interval** with the pitch you are currently
   sounding (choosing downward ratios when you sit high, upward when you sit low) and
   that lands in the complementary brightness region, and steers toward it. A
   separate consonance readout (`ratioConsonance` of the two voices' live grain
   pitches) drives the connecting line's brightness and the HUD meter.

Blend weights are fixed and deterministic (`0.5` complement, `0.42·gestureRecent`
response, `0.45` consonance). The **presence** control scales both the agent's output
gain and how far from centre it is willing to stray (`reach = 0.3 + 0.7·presence`),
so the coupling can be felt end-to-end.

## Descriptor → space mapping

- **x** = spectral centroid (brightness), log-scaled + 2nd/98th-percentile normalized → `[-0.95, 0.95]`
- **y** = pitch / periodicity (autocorrelation), log-scaled + percentile normalized → `[-0.95, 0.95]`
- **colour t** = violet ramp from brightness blended with loudness
- **point size / grain gain** = RMS loudness

## How to use

1. Open the route. A **seeded human stand-in** is already wandering, so the duet is
   audibly happening — tap **"Tap for sound"** (or click/press any key) to unlock the
   AudioContext and you hear two voices conversing (human left, agent right).
2. **Move the pointer** over the cloud — the first drag hands the human voice to you
   (badge flips **auto → you**); the agent keeps answering *your* real cursor.
3. Slide **agent presence** to feel the coupling — from a shy, near-silent partner to
   a bold one that ranges the whole space.
4. **Drop your own audio** to rebuild the atlas and duet inside your own recording.

Watch the **connecting line** brighten when the two voices agree, and the **answering**
tag appear in the HUD a beat after you make a fast gesture.

## Reference

**MACataRT** — Nyame-Tawiah & Sturm et al., *"Musical Agent Systems: MACAT and
MACataRT"* (arXiv 2502.00023, 2025): an audio-mosaicing agent that self-listens and
traces its own path through a CataRT corpus. This prototype is directly
research-chained to that paper (RESEARCH §957). Built on Diemo Schwarz's CataRT /
corpus-based concatenative synthesis (IRCAM) and TENOR 2023, *"Maps as Scores:
Timbre-Space Representations."*

## Next-cycle deepening idea

Give the agent a **memory of the whole duet, not just your last gesture**: let it
build its own low-rank model of which corpus regions the two of you have already
explored together and steer toward *unvisited* consonant territory — a partner that
develops the piece over minutes (introducing, recalling, and varying motifs) rather
than answering phrase-by-phrase. A second slider ("leading ↔ following") would let
Karel flip who proposes and who accompanies.
