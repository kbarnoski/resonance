# 2100 · Veil Cathedral

## The one question

**What if your own piano recording became a vast breathing cathedral of light you drift through — the music's spectrum sculpting a volumetric field of luminous points in real time, a cosmic-ambient space you inhabit rather than watch?**

## Tags

- **Input:** `audio-file` — drop your own track (ideally solo piano / ambient), decoded via `decodeAudioData` — plus a **seeded generative piano-ish carrier** that self-plays by default (always alive headless, zero input). No mic, no pointer, no camera, no tilt.
- **Output:** `three.js` — a real-time volumetric point-field (~44k `THREE.Points`) forming a slowly breathing toroidal "cathedral" nave the camera drifts through.
- **Core technique:** FFT analysis (`AnalyserNode`) → point-field density / brightness / hue / motion. A slow autonomous camera path travels **through** the volume.
- **Palette:** cosmic-ambient / luminous — deep indigo/violet void with warm light blooms.
- **State:** self-contained, client-only, deterministic (fixed-seed `mulberry32`).
- **Pole:** cosmic-ambient.

## How to use

1. Press **Begin — enter the cathedral** (starts the `AudioContext` inside the gesture). A seeded ambient-piano carrier plays immediately, so the piece self-demos with no input.
2. Once inside, **drop an audio file** onto the canvas (or use *Drop or choose an audio file*). It is decoded and cross-ducked in, routed through the **same** `AnalyserNode`, so your track drives the geometry.
3. Best in a dark, quiet room. It evolves over minutes — the nave slowly rotates and the warm bloom hue drifts.

## What drives what

The `AnalyserNode` FFT is split into three musical bands, each sculpting a point-group:

| Band | Drives |
| --- | --- |
| **Bass** | the deep **volume swell** — the whole field breathes outward (GPU vertex shader) |
| **Mid** | **mid-shell shimmer** — the nested cylindrical walls / vaulted ribs |
| **High** | the **sparkle aura** — the soft outer cloud of light |

Overall loudness sets a slew-limited global brightness. The field is a toroidal nave — nested shells + repeated vertical ribs (arch stations) + an outer aura — and the camera travels **around the ring** (through the tube), so travel is endless with no teleport and it reads as architecture, not a screensaver. Additive point-sprites give the luminous "inhaled light" look.

## Audio chain

`carrier + file → mix → AnalyserNode → DynamicsCompressor (limiter) → master gain (exp fade-in ~1.5 s, peak ≤ 0.85) → out`. The carrier is soft-attack / long-release voices over a detuned drone bed on a minor-pentatonic scale — continuous/pad, never struck bells or inharmonic glass. A dropped file cross-ducks the carrier out.

## Determinism

A fixed-seed `mulberry32` (`prng.ts`) lays out every point position and the carrier's note order, and animation is driven from `AudioContext.currentTime` / a rAF accumulator (never `Math.random()` or `Date.now()` in the loop), so it renders and sounds identically headless.

## Safety

No strobe. Global brightness is slew-limited (≤ ~0.9 / s) so even a loud bass transient cannot flash the field; all luminance oscillation stays well under 3 Hz. `prefers-reduced-motion` slows the camera and thins the cloud.

## How it degrades

- **No WebGL** → an on-brand `text-destructive` notice (the point-field *is* the piece, so a text notice is the honest fallback).
- **No Web Audio** → a `text-destructive` notice.
- Everything server-renders safely; all browser globals live behind the Begin gate.

## Influence

Inspired by **Refik Anadol's DATALAND** (The Grand LA, opened June 2026) — volumetric data-architecture you move through — with the volumetric point-cloud lineage of **Marpi** and **Android Jones**.
