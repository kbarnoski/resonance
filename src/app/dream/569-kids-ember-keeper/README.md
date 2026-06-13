**For**: kids (4+)

# Ember Keeper

**What if** a child had a glowing creature that lives in the device, remembers
every visit, and grows a genuinely **bigger, different body each day** they come
back — and never resets to zero?

This is the *morphology-evolution* approach to a cross-day living companion: the
body you see is not stored as pixels or a model file. It is **regrown from a
saved genome** every time the page loads. The genome only ever accumulates, so
the creature you meet on day 5 is structurally larger and differently-shaped than
the one you met on day 1.

---

## How the cross-day persistence + morphology works

1. **Persistence (never resets).** A JSON genome lives in `localStorage` under
   `resonance.ember-keeper.v1`. Every visit only *adds*: `visits`, `distinctDays`,
   `totalHumSeconds`, a learned pentatonic `palette`, and an append-only list of
   growth `tokens`. There is no decrement and no reset path anywhere in the code.

2. **Day-aware growth (the big visible change).** On load we compare the stored
   `lastVisitDay` to `new Date().toDateString()`. If it is a **new calendar day**,
   the creature gains one new **"day" token** → a big glowing limb placed on a
   golden-angle (phyllotaxis) spiral around the core. So today's body is visibly
   bigger than yesterday's.

3. **Within-day growth (small).** Humming a new pentatonic note, or tapping to
   pet, appends a **"hum" token** → a small frond near the core, and brightens the
   ember. Smaller than a day-limb, but still permanent.

4. **Deterministic regrowth.** Each token carries a stable `id` and `degree`.
   `makeBody()` seeds a `mulberry32` PRNG from the token id, so the *same* genome
   always regrows the *same* body — limbs do not jump around between loads. This
   is the D'Arcy Thompson idea made literal: morphology is the repeated, rule-based
   addition of parts driven by a few accumulating numbers.

5. **It greets you.** On wake the creature sings a short, wordless "hello again"
   phrase built from its learned `palette`, and the part that grew since last time
   sparkles into place (scale + emissive pop over ~2.6s).

6. **Feeding by voice.** Mic → `AnalyserMode` float buffer → autocorrelation pitch
   detection (the Chris Wilson method, a practical cousin of YIN, in `pitch.ts`) →
   quantised to **C-major pentatonic** so nothing is ever "wrong" → the degree is
   echoed back softly and added to the palette + a new frond. **The mic is
   analysis-only**: the analyser is a dead-end node (never connected to the
   speakers), samples are read per-frame and discarded, and only the derived
   pentatonic *degree* (an integer) is ever saved.

---

## Named references

- **Tamagotchi** (Aki Maita / Bandai, 1996) — a creature that lives in the device,
  remembers you, and rewards *returning*. The soul of this piece.
- **Steve Grand's *Creatures*** (1996) — an organism with internal, accumulating
  state that drives outward behaviour and form.
- **D'Arcy Thompson, *On Growth and Form*** (1917) — growth as rule-based addition
  of parts; phyllotaxis/golden-angle limb placement is taken directly from here.

---

## localStorage schema (`resonance.ember-keeper.v1`)

```jsonc
{
  "v": 1,
  "bornOn": "Mon Jun 09 2026",   // toDateString of first wake
  "lastVisitDay": "Fri Jun 13 2026",
  "visits": 5,                    // total wakes, monotonic
  "distinctDays": 4,              // distinct calendar days → drives big limbs
  "totalHumSeconds": 96,          // all-time hum time
  "palette": [0, 2, 4, 5, 7],     // learned pentatonic degrees (sorted, unique)
  "tokens": [                     // append-only body parts, never shrinks
    { "id": 0, "kind": "day", "degree": 0 },
    { "id": 4, "kind": "hum", "degree": 2 }
  ],
  "nextTokenId": 10               // monotonic, gives each new part a unique seed
}
```

Pentatonic degrees map onto C-major pentatonic from C3–C5 via `PENTATONIC_OFFSETS`.

---

## Controls

- **Wake the keeper** — primary button. Creates the `AudioContext` *inside* the
  gesture (iOS unlock), greets you, and asks for the mic.
- **Hum / sing** — feeds the creature, teaches it notes, grows fronds.
- **Tap the keeper** — pet it. Works with or without a mic (graceful degradation):
  a tiny growth + a warm chime.
- **🌙 next day** (secondary, top-right) — the **time-travel affordance**. Simulates
  a calendar day passing so a reviewer can watch a brand-new limb grow on demand,
  in seconds, without waiting overnight. It still only ever *adds*.

---

## Fresh-device demo seed (for the 06:30 review)

On an **empty** `localStorage`, `makeDemoGenome()` fabricates a believable history
— **5 visits across 4 days**, a learned 5-note palette, and 10 growth tokens (4 big
day-limbs + 6 fronds). So a reviewer glancing at a fresh device immediately sees a
rich, many-limbed creature that breathes from frame one and sings on wake — not an
empty seed. The seeding is intentionally obvious in `genome.ts` and only runs when
storage is empty.

---

## Graceful degradation

- **Mic denied / unsupported** → `text-rose-300` notice; the creature stays fully
  tappable to pet + grow, and still sings.
- **WebGL context failure** → `text-rose-300` notice + a **DOM/CSS** fallback
  creature (a glowing orb with one petal per growth token) that still glows, grows,
  and plays sound. (No Canvas2D fallback, per brief.)
- **Private mode / quota** → `saveGenome` fails silently; the creature still plays
  for the session.

## Kids-safe audio

Master chain: `gain → BiquadFilter lowpass(8kHz) → DynamicsCompressor(-10, 20:1)
→ destination`. All gain changes via `setTargetAtTime` (soft attack/release, no
transients). C-major pentatonic only, C3–C5.

---

## Unverified surface (honest list)

- **iOS Safari** mic + `AudioContext` unlock path is coded to spec but not tested
  on a physical device.
- **Pitch detection** is tuned for humming/singing in a quiet room; very noisy
  rooms or very low/high voices may quantise oddly (it can never sound "wrong",
  but the *learned* note may not match intent).
- **Real multi-day behaviour** (waiting actual calendar days) is exercised only via
  the 🌙 time-travel control and `loadAndVisit`'s `toDateString` comparison; it has
  not been observed across real wall-clock days.
- **localStorage growth** is unbounded by design (append-only). After hundreds of
  parts the scene would get crowded/slow; no cap or LOD is implemented yet.
- **DST / timezone edge cases** around `toDateString()` day-boundary detection are
  untested.
- Limb count vs. frame rate on low-end devices is unprofiled.
