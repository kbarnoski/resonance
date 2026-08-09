# 8856 · Pendulums

## The one question

**What if a pendulum wave were something you HEAR** — a row of swinging
sound-sources of graduated length, each sighing a Doppler vibrato at its own
swing period, so the ensemble drifts in and out of phase into a slowly
breathing chorus?

## How the graduated-length pendulum wave maps to a breathing Doppler chorus

The stage is a horizontal rail with **14 bobs** hanging on strings of graduated
length. The lengths are tuned the classic way (`length ∝ period²`) so that in
one common cycle — here **`TOTAL_CYCLE ≈ 48 s`** — the longest bob completes 32
swings, the next 33, and so on up to 45. Because those counts are consecutive
integers, released **together** at `t = 0` (all at full displacement, a cosine
release) the bobs begin in unison, then their tiny period differences fan them
out through every phase relationship — the traveling "snake," standing waves,
apparent chaos — before they all re-align and the whole apparatus snaps back
into unison. That re-convergence is the ~48 s breath of the piece.

An **ear** (listener `L`) sits below the rail. For each bob we take its position
and velocity analytically from the swing angle, form the radial velocity toward
`L`, and apply `dopplerFactor = C / (C + v_r)` (clamped `[0.5, 2]`), with the
stage-unit speed of sound `C` tuned so a passing bob bends its pitch by about
**±2 semitones**. The pitch is driven into the oscillator with
`frequency.setTargetAtTime(…, 0.015)` so it **glides** — a real vibrato, not a
stair-step — at each bob's swing frequency. The bob's horizontal position also
sweeps a `StereoPanner` L↔R and opens a lowpass on approach, so the wave you see
crossing the stage is the wave you hear crossing the stereo field.

The base pitches climb an **equal-tempered major-pentatonic** run up the row
(NOT just intonation, no held drone bed): at rest it is a gentle rising chord,
and the Doppler adds the moving shimmer on top. As the pendula drift out of
phase the individual vibratos decorrelate and the chord shivers apart into
shimmer; as they re-converge the vibratos re-align and it re-fuses. That is the
breathing chorus.

**Input.** Device-orientation tilt is the primary control (feature-detected,
with the iOS `requestPermission()` prompt issued inside the Begin handler):
leaning the phone shifts the gravity direction, tilting the swing equilibrium so
the whole fan leans. A full pointer fallback works on desktop — press and drag
left/right across the stage to lean gravity, release to spring back to level —
and **Release all** resets the master clock to re-sync the wave. If the sensor
is unavailable the page shows a small note and continues on pointer.

**Self-demo.** A seeded `mulberry32(0x8856)` supplies the only randomness (stable
per-bob detune); the master clock is `performance.now()`, resettable on release.
On load, before any audio, the bobs are already released and running the full
choreography, so the piece is mesmerizing purely from motion on a muted screen.
Begin simply makes that same motion audible.

## References

- **Christian Doppler (1842)** — *Über das farbige Licht der Doppelsterne* —
  the moving-source frequency shift that is the entire sonic mechanism.
- The **pendulum-wave** physics demonstration (Harvard Natural Sciences
  lecture-demo lineage, NSF apparatus) — graduated-length pendula tuned to a
  common cycle.
- **Steve Reich** phase music (*Piano Phase*, *It's Gonna Rain*) — the
  in/out-of-phase drift used here as the structural analogue.
- **John Chowning (1972)** — *The Synthesis of Complex Audio Spectra by Means of
  Frequency Modulation* — the spectral-motion thinking behind warm, evolving
  timbres.
- 2026 grounding: **DynamicSound (arXiv:2601.15433)** — physically-driven
  spatial-audio synthesis for moving sources.

## Honest self-assessment

The muted read is genuinely strong: the fanning-and-refusing wave of ember bobs
against graphite hairlines is hypnotic with zero input, which was the design
target. The audible chorus is musical — the pentatonic base plus decorrelating
±2-semitone vibratos really does breathe and re-fuse over the cycle — though the
Doppler depth is subtler than a literal siren, by intent, to stay consonant. The
pointer fallback is fully functional on desktop.

### Next-cycle deepenings

- **Real gravity + energy loss** so the ensemble slowly *decays* like the actual
  apparatus (amplitude damping per bob), instead of swinging forever.
- **Tilt-to-pump** — use the orientation/drag energy to *pump amplitude back in*,
  parametrically driving the swings rather than only shifting equilibrium.
- **A real piano tone per bob** (sampled or physically-modeled string) fed
  through the same Doppler/pan path, for a richer, more percussive chorus.
