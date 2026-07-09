# 1354 · Glyph Canon

**The one question:** *What if a psychedelic instrument were played entirely inside a living monospace TEXT field — and its sense of TIME came from a Steve-Reich phase canon, not a drum beat?*

state: hypnagogic / synaesthetic-text · pole: cosmic-ambient (drifts intense when played densely)

## What it is

A **glyph-terminal**: a full-screen grid of monospace Unicode characters rendered to a `<canvas>` with `fillText` on a fixed character cell grid. The characters *are* the art — no pixel blobs. A slow **log-polar spiral** of glyphs scrolls inward as an ambient hypnagogic field so the screen is never blank.

You **play** it:

- Three QWERTY rows are three octaves of a just-intonation scale:
  `z x c v b n m` (low), `a s d f g h j k l` (mid), `q w e r t y u i` (high).
- On-screen tappable key rows mirror the same notes, so it is phone-playable with no hardware.
- Each keypress fires a soft FM voice **and** injects a bright expanding **glyph-ring** that ages down a luminance ramp `·.:-=+*#%@` (bright → dim).

## The TIME mechanic (the point)

Every note is captured into a short looping **phrase** (8 steps, quantised to the live player's grid). Two independent players replay that same phrase:

- **Player A** (violet stream, "you") at the base step interval.
- **Player B** (teal stream, the twin) at base × **1.012** — a hair slower.

They start in unison and slowly **de-phase**, exactly like Reich's *Piano Phase*. There is **no BPM step-sequencer**: each player is scheduled directly against `audioContext.currentTime` with a ~120 ms look-ahead, so rhythmic TIME emerges purely from the drift between the two voices. You **hear** the phasing (the two streams are stereo-split left/right) and **see** it — two differently-tinted families of expanding glyph-rings that separate and, over minutes, re-align.

**Idle auto-demo:** on Begin a gentle consonant motif is seeded, and if you stay silent for ~4 s a consonant phrase is re-seeded — the canon always plays itself, never a blank/silent screen for a cold phone glance.

## Audio (Web Audio API — output only, no mic)

- Gesture-gated: the `AudioContext` is created/resumed inside the first **Begin** tap.
- Just-intonation lattice over A2 ≈ 110 Hz, ratios `1, 9/8, 5/4, 4/3, 3/2, 5/3, 15/8` across three octaves.
- Each voice is a small FM stack (sine carrier + sine modulator with a decaying index), soft attack, medium release, pitch- and stream-panned. Voice cap 12 with oldest-steal.
- A root + fifth + sub drone bed with a slow (~0.07 Hz) amplitude drift ties it together, plus a light self-contained feedback-delay space.
- Master gain ramps from 0, caps at 0.22, and ends in a `DynamicsCompressor` brick-wall limiter.
- Self-contained — no shared audio helpers imported (lower risk).

## Safety

- **No strobe.** Glyph pulses are *local per-cell* brightenings that fade smoothly; global luminance stays near-constant (the spatial spiral pattern drifts well under 3 Hz). No global luminance flicker is used at all, so no `createSafeFlicker` gate is needed.
- Honors `prefers-reduced-motion` (imported `prefersReducedMotion()` from `_shared/psych/safeFlicker`) by slowing the field.
- **Instant Stop** ramps master gain to 0 in ≤ 80 ms, clears all pulses (freezes the energetic motion), and closes the context. The residual dim field drifts at ~0.1 Hz — effectively still, and safe.
- Full teardown on unmount: cancels `requestAnimationFrame`, removes key listeners, ramps master down and closes the `AudioContext`.
- Degrades gracefully: if Web Audio is unavailable it shows a `text-rose-300` notice and keeps the glyph field animating (the idle demo drives visual-only pulses).

## Named references

- **Steve Reich — *Piano Phase*** — the phasing canon: one pattern against a slightly faster copy of itself.
- **Ryoji Ikeda — *datamatics*** — the clinical data/glyph field aesthetic; restrained near-black ground with phosphor marks.
- The **teletype / ASCII-art lineage** — a musical instrument that expresses itself as characters on a terminal.

## Ambition-floor criteria hit

- Audio-visual: makes both **sound** (JI FM instrument + drone + canon) and **visuals** (living glyph field + drifting ring-streams).
- Answers a single sharp question and finds **TIME somewhere other than a drum grid** (the Reich phase canon).
- Playable immediately (keyboard + on-screen keys), phone-friendly, loads in < 1 s.
- Never blank/silent (idle auto-demo), degrades gracefully, photosensitive-safe, full teardown.

## Honest caveat

Built and static-validated (`tsc --noEmit` clean, `eslint` 0 errors / 0 warnings) but **not eye- or ear-verified in this headless container** — the visual tuning (ring speed, ramp thresholds, field density) and the audio balance (voice levels, limiter behaviour, phase-drift feel) are reasoned estimates and may need a pass on real hardware. The phase-drift period to full re-alignment is long (minutes) by design; the continuous de-phasing is the audible/visible payoff.

## Files

- `page.tsx` — the glyph terminal: canvas render loop, input, UI, teardown.
- `glyph-engine.ts` — Web Audio brain: JI FM voices, drone, and the two-player Reich phase-canon scheduler.
- `README.md` — this file.
