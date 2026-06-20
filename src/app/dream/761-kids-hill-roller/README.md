# 761 · Sunny Hill Roller

**For**: kids (4+). Bright, sunny, joyful, no reading required.

## The one question

**"What if a 4-year-old could COMPOSE a melody by sculpting sunny hills with their
finger, then TILT the device to roll a ball over their own shape — and the ball
rolling over THEIR hills plays THEIR melody?"**

## How it works

1. **Sculpt.** Nine rolling hills sit across a daylight scene (blue sky, smiling
   sun, green/gold hills). Drag any hill up or down with a finger — big touch
   targets, an `↕` handle on every crest. Each hill's **height = a pitch** in
   C-major-pentatonic, so nothing is ever "wrong"; taller hill = higher note.
   Releasing a hill **previews its note**.
2. **Roll.** Tilt the device (left/right `gamma`) to speed / slow / reverse a
   glossy ball that rolls along the surface under gravity (LocoRoco-style: the
   ball follows the slope you drew). Each hill **crest** the ball crosses
   **rings that hill's note** — so the shape the child drew IS the melody.
3. **Loop.** The ball exits right, re-enters left, and replays the drawn tune —
   a living loop the child can keep re-sculpting.

If there's no tilt sensor / permission is denied / no orientation events arrive
within ~2s, it shows a `text-rose-300` notice and falls back to a big **Roll!**
button + auto-sweep so the ball still rolls and plays. After ~3s idle a ghost
auto-demo nudges the ball so a silent glance still sees and hears the idea.

## Tags

- **INPUT** = device tilt (`DeviceOrientationEvent.gamma`; iOS permission asked
  inside the first Start tap) + finger-drag to sculpt. No mic, no camera.
- **OUTPUT** = inline SVG / DOM (sky, sun, clouds, hills as a filled path, glossy
  ball), animated via refs + `requestAnimationFrame`. No canvas / WebGL / three.js.
- **TECHNIQUE** = sculpt-a-heightfield-melody, then ball physics rolls over it;
  every crest crossed rings a note.
- **VIBE** = bright sunny daylight, exuberant.

## Audio

Self-built Web Audio synth (no audio deps). Marimba/bell-ish voices = triangle
fundamental + soft sine partials (2×, 3×) with exponential decay. Kid-safe chain:
all voices → `masterGain` (0.28) → `lowpass` (7000 Hz) → `DynamicsCompressor`
(threshold −10, ratio 20:1) → destination. An always-on soft ambient pad (C2 + G2
with a slow shimmer) keeps it from ever feeling broken. Notes pan by the ball's
screen x. The `AudioContext` is created only inside the first Start tap.

## Why this is fresh

The "musical marble run / rolling-ball-plays-the-track" register is having a
2025–26 moment — **Marbles Music** (Steam), **Toy Theater *Music Marbles***,
and procedurally-generated marble runs (**Hackaday, 2025-11-09**) — but in all of
them the child only **watches** marbles drop. Here the child **builds the track by
sculpting**, so the shape IS their composition.

Named lineage:
- **LocoRoco** — tilt-the-world rolling physics.
- The **2025–26 musical-marble-run wave** (above).
- Sibling lab piece **238-kids-tilt-world** rolls a marble over *fixed* pads; the
  distinction here is that the child **sculpts / composes the hills first**.

## Honesty note

**Not browser-verified.** This environment has no `node_modules` installed, so the
page could not be built, type-checked, lint-run, or opened in a browser here. The
code was hand-audited against the lab's SSR/ESLint rules (`"use client"` first
line; no browser globals at module top level or during render; no `use`-prefixed
helpers; no `: any`; no unused imports; ref-based rAF with correct hook deps).
Tilt behavior on a real iOS device and exact audio balance still need a hands-on
pass.
