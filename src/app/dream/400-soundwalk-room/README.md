# 400 · Soundwalk Room

**What if you could WALK THROUGH a spatial-audio room — not just turn your head — and FEEL each voice brush past you as you pass it?**

This is **cycle 2** of the lab's spatial-audio thread. Cycle 1 (`394-soundfield-room`) built a true first-order ambisonic (FOA) B-format field you could **rotate** (turn your head, the field counter-rotates). This cycle adds the two missing dimensions:

- **TRANSLATION** — 6DoF locomotion. You have a 2D position in the room and you *walk through* the field.
- **HAPTICS** — the lab's first. You *feel* each voice via the Vibration API as you brush past it.

Headphones, eyes closed. The screen is only a dim wayfinding map; the audio and the haptics are the real output.

---

## The concept

Seven just-intonation overtone voices stand at fixed positions on the floor of a small (~9×9 m) room. After you tap **Start**, a wandering waypoint auto-pilot walks you on a gentle looping path between them. As you move, each voice **swells** when you approach, **swings around your head** (front → side → behind) as you pass it, and **recedes and dulls** behind you. Walk close enough to a voice and your phone gives a short vibrotactile **tap** whose feel (pulse length, density, flutter) matches that voice's sound. This is the embodied "walk through a sound space" of Janet Cardiff's audio walks, rendered synthetically and made tactile.

---

## The 6DoF translation math (and why)

Because the lab **synthesizes** the sources, we know each source's TRUE world position `(wx, wz)`. That is precisely the input the Google paper — *"Ambisonics soundfield navigation using directional decomposition and path distance estimation"* — needs: it decomposes a recorded field into directional components and estimates the **path distance** to each so it can re-render the field at a translated listener position. We get the directional decomposition for free (each source *is* a known direction), so we focus on the second half: **per-source path-distance re-render.**

Each frame, for the listener at `(lx, lz)` facing `yaw`, and for each source `s`:

1. **World vector:** `dx = wx − lx`, `dz = wz − lz`
2. **Path distance:** `d = max(hypot(dx, dz), D_MIN)` (anti-blast floor)
3. **Relative azimuth:** `az = atan2(dx, dz) − yaw` (0 = ahead; subtracting heading swings the whole field exactly like 394's rotation)
4. **Distance attenuation:** `g = min(G_MAX, D_REF / d)` — inverse-distance law, clamped so a voice you walk onto can't blast
5. **Air / near-field low-pass:** cutoff interpolates from `LP_NEAR` (≈9 kHz, right next to a source) down to `LP_FAR` (≈900 Hz, far wall) — distant = duller, near = open
6. **Parallax falls out for free:** as you walk past a voice, `atan2(dx, dz)` sweeps front → side → behind, so the binaural image swings around you with no extra code. This is the "wow," and it is a direct consequence of recomputing `az` from the live `(lx, lz)`.

### Why PannerNode-per-source (not a hand-rolled FOA decode)

394 hand-rolled the FOA `encode → rotate → virtual-speaker-HRTF-decode` chain because it rendered a single **rotating** field. For 6DoF **translation** the cleanest, most robust path is **one HRTF `PannerNode` per source** placed at its relative `(x, y, z)`:

- the browser's HRTF already does binaural placement;
- distance gain and parallax follow directly from updating `panner.position` each frame;
- there is no virtual-speaker quantisation, and 7 sources can never drift out of sync.

It is less "ambisonic-pure" than a full decode but produces identical perceptual results here. We keep the ambisonic *vocabulary* (directional decomposition + path-distance estimation) and let the panner be the final decode stage. We render **relative** to a listener fixed at the origin facing −z (we move the sources around the listener) to avoid cross-browser `AudioListener` orientation quirks.

The master chain is `master gain → DynamicsCompressor brick-wall limiter → destination` so the room can never blast your ears.

---

## The Sound2Hap haptic mapping

**Sound2Hap** (arXiv:2601.12245, CHI 2026) *learns* an audio→vibrotactile mapping so what you feel matches what you hear. We can't ship a trained model in a sandbox, so we implement the **idea** with light signal processing:

- Each voice carries its **own `AnalyserNode`** tapping its pre-spatial signal. We read its live time-domain frame and compute an RMS (loudness) envelope.
- When the walker enters a voice's `HAPTIC_RADIUS` (1.5 m), we fire **one** vibration burst — a "pass event" — whose pattern is derived from that voice's character:
  - **pulse length & gap scale inversely with pitch** (higher voice → shorter, buzzier flutter; low sub → long slow thud),
  - **pattern density (1–4 pulses) scales with proximity + live RMS** (closer + louder → denser),
  - so the burst literally encodes *which voice, how close, how loud*. The Vibration API can't set amplitude, so we use pulse **duration** as our intensity lever.
- We **throttle**: a voice re-arms only after you've moved away (its gain drops below a threshold), plus a global 260 ms cooldown, so we never spam `navigator.vibrate()` every frame — one tap per genuine pass.

---

## Inputs & outputs

- **INPUT:** device-orientation heading (`DeviceOrientationEvent`, permission requested inside the Start tap on iOS 13+) sets where you're facing; an **auto-walk** auto-pilot drives locomotion; **drag-to-steer** nudges the walk direction. (No MIDI, no keyboard, no touch-as-instrument.)
- **OUTPUT:** binaural spatial audio (Web Audio HRTF panners) + **Vibration-API haptics** + a dim top-down Canvas2D map. No WebGL, no three.js.

---

## Graceful degradation

- **No device orientation** (denied / desktop) → heading follows the auto-walk; drag to steer; a `text-rose-300` notice shows. Auto-walk still runs.
- **No Vibration API** (most desktops, iOS Safari) → no `vibrate()` calls; a `text-rose-300` notice shows; the map **ring-pulses** on each pass as a visual fallback so the "brush past" is still legible.
- **No Canvas2D** → a `text-rose-300` notice shows; the audio walk keeps running (eyes-closed by design anyway).
- Everything is cleaned up on **Stop** and on **unmount**: rAF cancelled, oscillators/LFOs stopped, `navigator.vibrate(0)`, listeners removed, AudioContext closed.

---

## Ambition criteria it hits

- **6DoF translation**, not just rotation — the new physics vs. 394.
- **Parallax** that swings a voice front → side → behind as you pass — perceptually striking and falls out of the math.
- **Audio-driven haptics** — the lab's first tactile output, with a defensible Sound2Hap-style derivation.
- **Hands-free auto-demo** — tap Start, do nothing, and within seconds voices swell, pass, recede, the dot moves, and (if supported) you feel taps. Built for the 06:30 phone glance.
- **Ears-safe** — inverse-distance gain clamp + brick-wall limiter.

---

## Unverified surface (honest note)

There is **no audio, no motion sensor, and no haptics hardware in this sandbox**, so the following have NOT been heard/felt/measured and are verified only by reading the code, TypeScript, and lint:

- Actual binaural quality and how convincingly the parallax swing reads through real HRTF.
- Whether the air/near-field low-pass and inverse-distance constants feel balanced by ear (the constants in `soundwalk.ts` are first-guess and tuned by intuition).
- Real `navigator.vibrate` pattern feel on a phone, and whether the per-pass throttle/cooldown values feel right in the hand.
- `DeviceOrientationEvent` axis/sign conventions across iOS/Android (we treat `alpha` directly as yaw; it may need an offset or inversion on real hardware).

All of these are tuning surfaces, not architectural risks — the wiring, cleanup, and degradation paths are the parts that are code-verifiable, and those pass.

---

## Files

- `page.tsx` — UI, Start/Stop, rAF loop, drag-to-steer, device-orientation, map draw, degradation notices, cleanup.
- `synth.ts` — seven just-intonation overtone voices, per-voice analyser taps, brick-wall master chain.
- `soundwalk.ts` — the 6DoF `SoundwalkField` (path-distance re-render via per-source HRTF panners) + the `Walker` auto-pilot.
- `haptics.ts` — the Sound2Hap-style `HapticDriver` (pass-event detection, per-voice pattern derivation, throttle) + RMS reader.

## References

- Google, *"Ambisonics soundfield navigation using directional decomposition and path distance estimation"* — the 6DoF translation recipe.
- **Sound2Hap** — arXiv:2601.12245, CHI 2026 — audio→vibrotactile haptic generation; we ship a lightweight signal-processing version.
- Janet Cardiff — audio walks; the embodied "walk through a sound space" lineage.
- Zotter & Frank, *Ambisonics*, Springer 2019 — max-rE FOA decode weights (the ambisonic vocabulary this engine inherits from 394).
