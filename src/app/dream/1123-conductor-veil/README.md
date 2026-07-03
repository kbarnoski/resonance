# 1123 · Conductor's Veil

**What if you could conduct an unseen ensemble with a continuous baton gesture — and hear phrasing, tempo, and dynamics answer your hand in real time?**

Move a baton (pointer or finger) across a warm, luminous field and a string-and-pad ensemble follows. This is a live-performance / installation piece: calm, sunset-warm, never blank and never silent.

## The interaction

- **Up-down strokes → tempo.** Each downward stroke's *low point* is a downbeat; the interval between downbeats sets the tempo.
- **Hand height → register + brightness.** A higher hand lifts the whole ensemble up to +1.2 octaves and opens a lowpass for brightness.
- **Gesture energy → dynamics.** Faster, larger motion raises the master level and deepens vibrato + tremolo.

## The primitive: downbeat from vertical-velocity reversal → EMA-BPM

`conductor.ts` tracks the baton's normalized position, velocity and curvature every frame. The core detector watches vertical velocity `vy`:

1. While `vy > 0` the baton is **descending** (screen-y increasing). We track the peak downward speed.
2. When `vy` crosses to negative — the **bottom of the stroke** — and the peak downward speed cleared a threshold, we register a **downbeat**.
3. The inter-downbeat interval feeds an **EMA-smoothed BPM**, clamped to ~40–160 BPM. Implausibly short intervals (faster than 160 BPM) are ignored so jitter doesn't spike the tempo.

This directly implements the *phase-within-a-bar* idea from the 2026 virtual-orchestra anchor, reduced to a robust 1-D heuristic: the beat is the turnaround at the bottom of the gesture.

## The ensemble: no wrong notes

`audio.ts` voices four lightly-detuned oscillator "sections" (saw + triangle each) over a sustaining pad drone (root + sub-octave). Every chord is drawn from **one just-intonation major scale** — `{1, 9/8, 5/4, 4/3, 3/2, 5/3, 15/8, 2}` — over a warm A2 (~110 Hz) root, cycling I–IV–vi–V. Because every tone is a consonant member of that single scale, any voicing at any register is in tune with every other: there are no wrong notes. Each detected downbeat advances and re-voices the chord.

Signal path: sections + drone → tone bus → brightness lowpass → tremolo → master → **DynamicsCompressor limiter** → destination, with a parallel **ConvolverNode hall reverb** whose impulse response is **synthesized** (decaying filtered noise rendered through an `OfflineAudioContext` — no file fetch). Master peak is held conservative (~0.13).

## The never-blank / never-silent path

A deterministic **`mulberry32` ghost conductor** (fixed seed `0x1120c04f`) traces a gentle down-up beat pattern whenever no human is moving, routed through the *same* downbeat detector so it sounds and animates on a cold glance. Real pointer input takes over the instant the user moves; the ghost resumes after ~1.3 s of stillness. No `Math.random` runs on any per-frame path — all wobble comes from the seeded PRNG (the render module has its own seeded PRNG for ribbon parameters).

## The visuals

`render.ts` (Canvas2D) streams **aurora ribbons** from the baton — peach / rose / gold / violet / amber — that billow wider and brighter with dynamics, over a **deep-plum → warm-ember** vertical gradient (a warm dark sunset, never a black void). A luminous fading **baton trail** follows the hand, and each downbeat drops **one soft radial bloom** that decays over ~1 s (slow luminance only — no strobe/flicker). `prefers-reduced-motion` calms the ribbon drift and freezes the bloom fades.

## References

- **Max Mathews — *Radio Baton*** (gestural conducting controller).
- ***Personal Orchestra* / *You're the Conductor*** (Ars Electronica) — conduct-a-recording installations.
- **arXiv:2604.27957 (2026), "Real-Time Control of a Virtual Orchestra by Recognition of Conducting Gestures"** — a dome installation estimating phase-within-a-bar from a conductor's gesture; the direct anchor for this piece.

## Honest caveats

- **Not pointer/ear-verified on real hardware here.** The audio graph and gesture math are written to spec but haven't been driven with a real pointer/touch device or listened to on a physical rig in this environment.
- **The downbeat heuristic assumes roughly vertical strokes.** Horizontal or highly diagonal gestures produce weaker/noisier downbeats; a full system would estimate a 2-D beat plane.
- **The ghost conductor is the exercised path.** On a cold load with no interaction, it is the ghost — not real conducting — that you see and hear; treat the human path as the intended, but less-exercised, experience.
