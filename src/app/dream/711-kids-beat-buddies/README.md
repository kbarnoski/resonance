# 711 · Kids Beat Buddies

**One-line concept:** Two little kids sit on opposite sides of one tablet and build a silly band together — every pad they tap snaps onto ONE shared looping groove, so the result is always a beat, never noise.

## How to play

1. Tap **Start the band**.
2. Two children sit facing each other across a flat tablet. The **top half is rotated 180°** so the top player reads it right-way-up from across the table. Top zone = warm/orange (Player A), bottom zone = cool/teal (Player B).
3. Each kid taps their **big silly-sound pads** (drum, boing, honk, slide-whistle). A tap doesn't fire raw — it **quantizes** onto the next grid step and then **loops** as a stacked layer (Incredibox-style), thickening the groove.
4. Two googly **conductor blobs** in the middle bop on every beat, grow brighter as more layers stack, and flash when a pad fires.
5. When **both kids are active at once**, the buddies **high-five** with confetti. No winning, no competition — pure co-play.
6. Leave it alone ~2.5s and an **auto-demo** gently taps pads itself so a passing reviewer sees+hears the groove build.

No reading needed — it's all big colorful shapes and tapping.

## Named reference

**Incredibox / Sprunki** — each pad is a stackable looping beat layer locked to a shared clock, and a little character bops to it. Also nods to **Toshio Iwai's Tenori-on** (a shared lit grid-instrument played by touch).

## Technique

A single Web Audio **look-ahead scheduler** (~25ms `setInterval`, scheduling ~104 BPM 16th-notes ~120ms ahead) runs **ONE clock for both players**. Tapping a pad registers/removes a *looping layer* with a fixed 16th-note pattern; the scheduler fires every active layer's voice on its steps, so adding pads builds a shared thickening groove and removing them thins it. A base pulse (soft synth kick + shaker) always keeps time. All sounds are **pure Web Audio synthesis** (oscillators + envelopes + filters + a tiny noise buffer for the shaker) through a safe master chain: `gain(0.28) → lowpass(7500Hz) → DynamicsCompressor → destination`. Visuals are **Canvas2D**: googly creatures, hit splashes synced to scheduled audio time, and confetti.

**Tags:** two-player same-device INPUT · Canvas2D OUTPUT · shared-clock quantized loop-stacking groove TECH · silly co-op band VIBE.

## Ambition-floor self-rating

Hits **4 of 5**:

1. **Technique never used in lab — YES.** First two-player / multi-user kids piece; shared-clock loop-*stacking* quantizer driving two co-located players on a split+rotated screen is new here.
2. **≥3 distinct subsystems — YES.** (a) shared look-ahead groove scheduler + synth voices, (b) split/rotated two-player tap UI with per-zone state, (c) Canvas2D reactive creatures/splashes/confetti, (d) idle auto-demo driver.
3. **Borrows from a named reference — YES.** Incredibox / Sprunki stackable looping layers; Tenori-on shared touch-instrument.
4. **Multi-cycle commitment — YES.** Builds toward a fuller two-player co-op kids line; clean teardown and idle-demo make it reusable/extensible.
5. **Cites a recent research finding — NO.** Deliberately a play piece about shared groove, not grounded in a specific recent paper.
