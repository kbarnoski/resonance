# Morning digest — last updated 2026-07-02 ~22:20 UTC (cycle 638)

> **Where we are:** the 2026-07-02 jury's three *structural* complaints are the input, the output, and the palette all collapsing (tap 6×, GPU-shader 10× of 15, black-void ~13/15). This cycle went **WIDE** and spent the whole diversity budget on exactly those axes: three explorers, each a fresh non-tap input × non-GPU-shader output × warm palette. Shipped the one that breaks the most at once.

Psychedelic era · adult · kids paused. Cycle 638 = **WIDE** — 3 orthogonal explorers, ship the most jury-aligned, bank the rest.

## New since yesterday
- **⭐ `/dream/1116-gait-loom`** — *walking IS the instrument.* Hold your phone and walk; your footstep cadence (read from the accelerometer) sets the tempo and phase of a slow **Steve Reich–style phasing raga**, and an **SVG** mandala unfurls one petal per step. Two voices share a warm pentatonic cell — one locked to your gait, one drifting ~3% faster — so they slide in and out of alignment like *Piano Phase*, but the metronome is your body. *Why open it:* it breaks the lab's hardest ruts at once — **SVG output** (we had essentially none; it's all Canvas/WebGL), **gait input** (first adult one), on a warm terracotta palette. **Best on a phone, walking** — but the "Simulate walking" button demos the whole thing on a desktop with no sensor.

## Explored but banked (built complete, not shipped — see IDEAS §638)
- **⭐ `1115-exhale-reeds`** — *blow into the mic and a field of sumi-e reeds sings.* Detects your **breath, not your voice** (a spectral-flatness trick: a broadband exhale drives it, a hum doesn't), bending ink-wash reeds on rice-paper. The freshest *technique* of the three — **resurrect-next**; needs one live-mic tuning pass.
- **`1117-tide-drone`** — *the ocean's real tides as the score.* Live NOAA tide data → an additive drone built from the genuine tidal constituents (à la Kelvin's tide-predicting machine), woven into a Canvas2D loom. Strong, but it'd be the **third live-data piece in a row** (after aurora + Schumann) — banked until that lane cools.

## Research worth a look (RESEARCH §638)
- A recent **gait-sonification / rhythmic-entrainment** line (Audio Mostly 2024; MDPI *Sensors* 2024; a 2025 wearable-gait study) shows the body's **central pattern generator** syncs walking rhythm to musical rhythm — a genuine two-way body↔music coupling. That's the grounding for `1116`. (The literature is clinical rehab; the piece makes **no health claim** — the meditative feel is what the piece creates.)

## Open questions for Karel
- **`1116` wants your phone in your pocket on a walk:** do your real footsteps drive the raga, and can you *feel* the two voices phase? (Thresholds are literature-tuned, not calibrated to a real phone yet.)
- **Ship `1115-exhale-reeds` next?** It's build-complete — the breath-reed instrument — banked only to ship the freshest *output* this cycle. Say the word.
- **Standing verification debt:** motion/audio/mic pieces still can't be hardware-verified in this box — a real-device pass (or raising the ~4096-fd static-gen ceiling) remains the recurring Karel-only fix.
