# Stillpoint — a binaural field you navigate with your eyes shut

**Status**: demoable

> *What if Resonance were something you do with your eyes closed — your body
> turns and leans to navigate a 3D binaural field of Karel's piano, and the
> screen is almost dark because the sound IS the piece?*

This is the lab's deliberate **no-screen / audio-only / eyes-closed** piece.
One of Karel's real recordings is split into four perceptual **voices**
(bass / low-mid / mid / air) and each is HRTF-panned to a fixed spot on a dome
**around** your head. The field is **world-locked**: as you turn, his voices
stay put in the room and you face different ones — the voice you face comes
forward, louder and brighter in timbre. As you **lean** toward a voice it comes
closer in *distance* (6DoF translation, not just a volume knob). The reward is
learning, by ear alone, to sculpt where his music lives around your head.

## How it works

**Audio (`audio.ts`).** One looping `AudioBufferSourceNode` of a real take fans
out into a bank of `BiquadFilterNode`s that split it into four contiguous
registers (< 220 Hz · 220–760 · 760–2600 · > 2600 Hz). Each register runs
through its own band gain, a focus gain and a tone lowpass into its **own
`PannerNode`** (`panningModel = "HRTF"`), parked at a distinct azimuth +
elevation on a dome of radius ~3 m around the `AudioListener` at the origin.
The whole field **slowly orbits** at a breath pace (~0.045 Hz) and a slow global
swell rides the mix, so the field feels alive even when you do nothing.

- `setFacing(yaw, pitch)` re-aims the `AudioListener` forward/up vectors so
  turning your body re-faces you within the fixed field (world-locked).
- `setLean(amount)` **translates the listener forward** along the facing vector
  (up to ~2 m). Because every panner uses `distanceModel = "inverse"`
  (`refDistance` 1.2, `rolloffFactor` 1.0), leaning in is *real distance
  attenuation* — the faced voice genuinely gets nearer, not merely louder.

Everything mixes → a field gain → **`createSafeMaster(ctx).input`** (never
`ctx.destination`). The breath-glow reads `safeMaster.analyser`. There are
**0 oscillators and 0 synthesized tones** — every voice is his piano re-placed
in space. On stop the source stops, the master detaches and the context closes.

**Screen (`page.tsx`).** A near-dark `fixed inset-0` Canvas2D stage with one
warm radial breath-glow. Its position tracks the focus-weighted bearing of the
sound relative to your facing; its size and brightness ride analyser loudness
and your lean. The chrome is minimal and hides in immersive mode.

## Input

- **DeviceOrientation (primary).** `alpha` → world-locked yaw (turn your body),
  `beta` → lean (tilt the phone forward to pull the faced voice closer),
  `gamma` → a little elevation. iOS asks for motion permission on the opening
  gesture; if denied, the piece falls back to pointer/keys with a visible note.
- **Pointer drag (full fallback).** Drag sideways → yaw, drag up/down → lean.
- **Keyboard (full fallback).** ← → or A / D turn · ↑ ↓ or W / S lean. This
  path works completely on a desktop with no sensors.
- **Untouched** → the field auto-drifts so every voice sweeps through the front
  over ~30 s (`prefers-reduced-motion` slows the drift rather than stopping it).

The status line always shows the active path: `facing · live` (device),
`facing · pointer`, `facing · keys`, or `auto · drifting`, plus the voice you
face and your lean percent, with a `text-destructive` hint if motion is denied.

## Reference

Chen & Boren, **"A real-time 6DoF HRTF binaural rendering system for
musicians,"** AES Convention 159 (Oct 2025). It adds translational *lean*
(distance) on top of rotational head-tracking and tested favorably on 4 of 5
perceptual attributes. Stillpoint's **lean → distance** control is the
embodiment of that finding: rotation re-faces the field, translation pulls a
voice near.

## Degrade

No audio decode → a designed notice (never a synth stand-in; this piece is only
his piano). Permission denied → pointer / keyboard with a visible note. No
sensors → the keyboard/pointer path is complete and verifiable on desktop.
