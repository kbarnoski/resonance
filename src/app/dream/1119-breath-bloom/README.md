# Breath Bloom — `1119-breath-bloom`

## The one question

**What if your breath *grew* a garden?** Each slow exhale unfurls one more
segment of a living, procedurally-growing plant and rings one more note of a
chime, so a long, calm session slowly builds a whole blooming form and a whole
chord out of nothing but your breathing.

This shares its core concept with a sibling piece (breath as the sole
instrument, with a genuine breath-vs-voice discriminator) but takes a different
technical route: instead of an atmospheric reed field, this is a **long-form
generative-growth** piece with **memory**. The garden and the chord are
genuinely *different* after five minutes than after one — state accumulates and
evolves; nothing loops.

- **Input:** breath (microphone, analysed as *breath energy*, not pitch).
- **Output:** procedural vector botany on Canvas2D — bezier stems, leaves, and
  soft glowing blooms grown from a root.
- **Technique:** a spectral-flatness breath-vs-voice discriminator driving a
  growth state machine + additive bell/chime synthesis.
- **Palette:** warm daylight — pale sky-cream ground, sage/rose/amber plant
  tones, a low warm sun. **Pole:** calm cosmic-ambient.

## The breath discriminator (`breath.ts`)

The instrument must answer to a *broadband exhale* but heavily attenuate a
sustained hum, whistle, or sung note at the same loudness. It does that with
**spectral flatness**:

```
flatness = geometric-mean(power) / arithmetic-mean(power)   over ~200 Hz–8 kHz
```

- ~1 for broadband breath (energy spread across all bins),
- ~0 for a tonal hum/whistle (energy piled into a few bins).

A band **energy** (mean magnitude → dB) is normalised over
`ENERGY_DB_MIN..ENERGY_DB_MAX`, then gated:

```
drive = energyNorm * smoothstep(FLATNESS_FLOOR_LOW, FLATNESS_FLOOR_HIGH, flatness)
```

`drive` is EMA-smoothed. A rising edge above a threshold that later falls =
one **completed exhale** = one growth event. The continuous `drive` also drives
live sway, bloom shimmer, sun breathing, and the wind/drone bed.

All the tunables are named consts: `FLATNESS_FLOOR_LOW/HIGH`,
`ENERGY_DB_MIN/MAX`.

### Never blank: the seeded breeze

`mulberry32(seed)` powers a deterministic **breeze** that emits raised-cosine
pseudo-exhales at seeded intervals whenever there is no mic, mic access is
denied, or no real breath arrives for ~`IDLE_SECONDS` (2 s). The breeze feeds
the *same* edge detector as the mic, so growth events fire through one code
path either way. This is the fully-exercisable path on a desktop with no mic
(the **Simulate breath** button forces it).

## Growth + memory (`growth.ts`)

The plant is **data**: branches (chains of *relative* turns so the whole plant
bends coherently when sway is added) and blooms. Each exhale:

- extends the youngest living branch — segment length scales with exhale
  strength, with a gentle upward (gravitropic) restoring bias;
- occasionally **forks** (seeded);
- opens a **flower** every few segments;
- drifts the stem hue and, every 12 breaths, bumps a **register** that
  transposes the octave and rotates the flower palette — this is the long-form
  evolution.

State persists for the whole session; **Reset garden** clears it (new seed).

## Audio (`audio.ts`)

Each growth event rings **one additive bell voice**: a fundamental plus
inharmonic partials (`1, 2.01, 2.99, 4.21, 5.43`) with a 6 ms attack and long
exponential decays — the struck-bell / fūrin timbre. Successive events climb an
**ascending just-intonation pentatonic** (`1, 9/8, 5/4, 3/2, 5/3`), so the
overlapping decays accumulate into an evolving chord that literally grows with
the plant. Under it sits a soft, breath-modulated drone + filtered-noise wind
bed. Everything passes a `DynamicsCompressor` limiter before the destination.

**The mic is analysis-only — it is never connected to the audio graph.**

## Visual (`render.ts`, `page.tsx`)

Canvas2D. Warm dawn/botanical ground, a low warm sun wash, stems as tapering
bezier strokes, almond leaves, and blooms as soft filled petals with a radial
glow. Sway is added at draw time from the relative-angle walk so the tip moves
most; blooms shimmer with live drive. `prefers-reduced-motion` calms all motion.

## Named references

- **Aeolian harp** — wind as the sole, uncommanded player.
- **L-systems / procedural botany** — Lindenmayer; Prusinkiewicz &
  Lindenmayer, *The Algorithmic Beauty of Plants*.
- **Japanese wind chime (fūrin)** — the struck inharmonic bell timbre.
- **Brian Eno** — generative / long-form ambient, evolution over repetition.
- **Pauline Oliveros — *Deep Listening*** — breath and attention as practice.
- Research grounding: breath-controlled instruments and breath biofeedback are a
  live 2026 line ("Breathe with Me" biosignal embodiment, HRI 2026;
  "Breathing Space / Viscereality" breath + cardiac biofeedback).

## Honest caveats

- **Not ear-verified headless.** The build type-checks and lints clean, but the
  actual sound/visual has not been auditioned in this environment.
- **The seeded breeze is the exercisable path.** With no mic it grows on its
  own, deterministically — that path is well-covered.
- **`FLATNESS_FLOOR_*` and `ENERGY_DB_*` need a live-mic tuning pass.** The
  discriminator maths is correct, but the thresholds were set by reasoning, not
  measured against a real mic in a real room; expect to nudge them.
