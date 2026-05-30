# 221 — Optical Flow Music

**Route**: `/dream/221-optical-flow-music`  
**Status**: demoable  
**Cycle**: 255 (adult build)

## What it does

Webcam optical flow → real-time audio synthesis. No ML, no CDN dependencies — pure browser pixel math.

Each animation frame, the prototype computes per-pixel luminance differences between the current frame and the previous one. Those differences are downsampled into a 20×15 flow grid (300 cells). Three aggregate signals drive the audio engine:

| Signal | Derivation | Audio mapping |
|--------|------------|---------------|
| **totalMag** | Average absolute pixel delta across all cells | Filter cutoff (400–6000 Hz); arpeggiation rate (800ms still → 60ms fast) |
| **hBias** | Net rightward vs. leftward pixel flow | Pitch: rightward flow → higher (up to C6); leftward → lower (to C2). Snapped to C major pentatonic. |
| **vBias** | Net downward vs. upward pixel flow | Reverb wet gain (downward motion = more reverb) |

Pitch changes trigger an arpeggiated note event: a fast gain envelope (20ms rise, 140ms decay) fires when the arpeggiation timer elapses, then a new interval is computed from current motion speed.

Exponential moving average (α=0.12) smooths all three signals to avoid jitter from video noise.

## Audio architecture

```
OscillatorNode(sine)
  → BiquadFilterNode(lowpass, Q=1.2) → GainNode(dry 0.7) → GainNode(master) → AnalyserNode → Destination
                                      → ConvolverNode(IR) → GainNode(wet)  ↗
```

The impulse response is 1.4s of exponentially-decaying white noise (generated once at AudioContext init). The convolver gives a room-like reverb without any audio file dependencies.

## Visual design

- Captured frame (webcam or demo blobs) drawn at 40% opacity as background
- Flow arrows: short glowing lines at each grid cell center, direction = motion vector, color = direction (rightward=amber, leftward=violet, upward=teal, downward=rose)
- Arrow color is a smooth weighted blend of the four basis colors based on dx/dy proportions
- 6-band spectrum bar at bottom, same palette as `1-live` (analyser on the synthesizer output)
- HUD: current note name + motion % top-left

## Demo mode

Synthetic animation: three colored blobs bouncing off canvas edges with slight sinusoidal pulsing. Generates realistic optical flow gradients that drive the audio in a musically interesting way — slow drifts produce slow, low arpeggios; boundary bounces create burst patterns.

## What's new

Prior prototypes use audio as input (mic → visual). `110-webcam-compose` uses video color → music. This is the first prototype where **motion** (not color, not audio) is the primary musical input. The distinction: you can be completely still in front of a colorful scene (`110-webcam-compose` makes music); here silence means silence — only your movement generates sound.

Directly inspired by Karel's love of `217-dance-avatar` (motion ↔ music linkage) and `107-ocean-presence` (presence → audio output). V2M-Zero (arXiv:2603.11042, Mar 2026) validated the video-to-music paradigm; this is the zero-dep browser implementation.

## Polish ideas

- Multi-oscillator chord: spawn additional oscillators at minor third / fifth for richer texture when totalMag is high
- Motion history trail: accumulate recent high-mag cells as a glow map overlaid on the camera feed
- BPM lock mode: quantize the arpeggiation interval to nearest musical subdivision of a detected tempo
- Threshold control: slider for the flow detection sensitivity (useful for low-light webcams)
