# 841 — Hum & Stack

## The one question
**What if a 4-year-old could *hum any note* and then stack friendly creatures on top of their own voice to build a chord — choosing warm / bright / spicy flavors — so harmony grows out of their actual voice instead of a pre-approved scale?**

## What it does
1. The child taps the big **"tap to start"** button. This creates the `AudioContext` and requests the microphone (one user gesture, immediate response).
2. They **hum or sing**. A hand-written **monophonic pitch detector** (McLeod Pitch Method / normalized square difference function with parabolic peak refinement — see `detectPitch`) finds their fundamental in real time. A glowing **root creature** sits at that pitch and follows it as they slide up and down.
3. They tap big color+glyph **flavor buttons** to **stack a harmony creature** that sings an interval *relative to their live detected pitch*:
   - **WARM** ♥ — thirds / sixth (3, 4, 8 semitones)
   - **BRIGHT** ★ — fifth / octave (7, 12, 19 semitones)
   - **SPICY** ✦ — seventh / second / tritone (10, 2, 6 semitones)
   Each stacked voice continuously **retunes to track the child's voice**, so the whole chord is built on *them*. Stacking the same flavor cycles through its intervals; the tower can grow up to 5 voices (capped so it never gets harsh).
4. **"↓ let go"** releases the top creature with a gentle fade.

## Why this gives harmonic agency over the child's own voice
The fundamental is **not** a pre-approved note from a fixed scale — it is the child's live pitch, detected frame by frame. Harmony is constructed *upward from whatever they sing*, the way the overtone series builds from a fundamental. The child decides how tall the chord gets and what flavor each layer is.

**Consonance vs. dissonance is a creature's MOOD, not right/wrong.** Consonant stacks (thirds/fifths) glow steady and hum smoothly with triangle tones. Spicy stacks (seventh / second / tritone) use a sawtooth with a **+7-cent beating detune partner** and a **shimmer LFO**, and the creature visibly **wobbles, sparkles, and shimmers** — clearly playful and exciting, never a fail. Spicy is a *choice with a fun consequence*, so the child has real harmonic agency rather than being corralled into "safe" notes.

A soft ambient bed (two breathing triangle drones an octave apart) always plays, so it is never silent. Everything runs through a 2.6 kHz low-pass with gentle envelopes and modest gain — no harsh or scary transients.

## No-mic fallback (works on desktop, no permission)
If the mic is denied or unavailable, a clearly visible `text-rose-300` message appears and a row of **bold colored root pads** lets the child pick a root note. Harmony then stacks on that pad exactly the same way — fully demoable without a microphone.

## Named reference
- The **overtone series / just-intonation interval stacking** — harmony built upward from a fundamental — but here *the fundamental is the child's own live voice*.
- The **Toca Band** "tap a character, it sings in relation to the others" interaction model — reimagined so the bottom of the band is the child's real-time pitch instead of a fixed loop.

## Tags
- **INPUT** = mic / voice (real-time pitch), with a colored button-root fallback.
- **OUTPUT** = Canvas2D friendly creature characters — round squishy bodies, eyes, smiles, glow, sparkles (warm/bouncy/Toca-Boca-ish, not geometric/Ikeda).
- **TECHNIQUE** = real-time monophonic pitch detection (MPM / NSDF autocorrelation, written from scratch — no library) + an interval-stacking harmony engine whose voices continuously retune to the detected fundamental.
- **PALETTE** = bright friendly kids; each creature a bold saturated color; the root creature's hue is mapped from the sung pitch.

## Implementation notes
- Single self-contained client component (`page.tsx`), `"use client"`, default export. No new npm dependencies, no API route.
- Pitch detection: `detectPitch()` — RMS gate, NSDF over lags up to half the window, first peak above 0.8× the max NSDF, parabolic interpolation, clamped to a 70–1100 Hz hum range.
- Mic is connected to an `AnalyserNode` only (never routed to output), so there is no feedback.
