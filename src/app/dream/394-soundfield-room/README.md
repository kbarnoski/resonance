# 394 · Soundfield Room

**What it is:** A spatial-audio room you navigate by turning your head (or dragging on desktop). Six slowly-evolving just-intonation drone voices float around you in 3D. The entire soundfield is encoded as first-order Ambisonic B-format, rotated coherently with your device orientation, and decoded to binaural audio via HRTF — the way the field rotates as a unified whole (not as individual sources) is the central design idea.

**How to use:** Open on a phone with headphones. Tap "Enter Space", grant orientation permission when prompted. Close your eyes. Turn your head slowly. If no sensor is available (desktop, permission denied, or quiet sensor) an auto-demo rotation begins after ~3 seconds; drag left/right to control manually.

---

## The Ambisonics Technique

### 1 · Encoding — source → B-format

Each voice at azimuth `az` (radians, 0=front, positive=clockwise), elevation `el` (0=horizon, positive=up) is encoded into four B-format channels using first-order real spherical harmonics with SN3D normalisation (ACN channel order):

```
W  (ACN 0):  gain = 1/√2                       — omnidirectional pressure
Y  (ACN 1):  gain = sin(az) · cos(el)          — left-right
Z  (ACN 2):  gain = sin(el)                     — up-down
X  (ACN 3):  gain = cos(az) · cos(el)          — front-back
```

All six voices are encoded and **summed** into four shared B-format bus gain nodes: `busW`, `busX`, `busY`, `busZ`. This sum _is_ the B-format representation of the entire field.

### 2 · Rotation — head tracking

When the listener turns their head by yaw θ, the field must appear to stay stationary in world space — which means rotating the field in the opposite direction relative to the listener. For a pure yaw rotation, only the horizontal (X, Y) pair changes:

```
X' = X·cos(θ) + Y·sin(θ)
Y' = −X·sin(θ) + Y·cos(θ)
Z' = Z
```

The full implementation (in `ambisonics.ts`) uses a proper 3×3 SO(3) rotation matrix composed from yaw, pitch, and roll (Euler angles from `DeviceOrientationEvent`):

```
R = Ry(yaw) · Rx(pitch) · Rz(roll)
```

Instead of restructuring the Web Audio graph (which would require a complex cross-connect network), we apply the **inverse rotation** (R^T = R^{−1} for orthogonal matrices) to each virtual speaker's direction, then recompute the decode coefficients. This is mathematically equivalent to rotating the field.

### 3 · Decoding — B-format → binaural (virtual loudspeakers)

We place 8 virtual loudspeakers around the listener:
- 6 on the horizontal plane at 0°, 60°, 120°, 180°, 240°, 300°
- 2 elevated at ±45° above front and back

Each virtual speaker `k` receives a decoded signal using **max-rE** weights for first-order ambisonics (from Zotter & Frank 2019):

```
g_W   = 1/√2   ≈ 0.7071    (omni weight)
g_XYZ = √3/2   ≈ 0.8660    (dipole weight)

decoded_k = g_W·W + g_XYZ·(X·cos(az_k)·cos(el_k)
                           + Y·sin(az_k)·cos(el_k)
                           + Z·sin(el_k))
```

After rotation, the decode coefficients `(cos(az_k)cos(el_k), sin(az_k)cos(el_k), sin(el_k))` are replaced by the rotated speaker directions, making the whole field appear to rotate.

Each decoded speaker signal feeds a `PannerNode` with `panningModel: 'HRTF'` placed at the corresponding fixed position in 3D space. The browser's built-in HRTF database convolves each speaker's signal with head-related transfer functions, creating true binaural localisation. Summed across all 8 speakers, this is the binaural output.

This is the same architecture as JSAmbisonics (polarch) and Google Omnitone, implemented from scratch in plain Web Audio API nodes.

### Web Audio graph topology

```
[OscillatorNodes] → [EncoderGains: W, X, Y, Z] → [busW, busX, busY, busZ]
                                                          ↓ (×8 speakers)
                                         [wGain, xGain, yGain, zGain] → [sumGain] → [PannerNode HRTF]
                                                                                         ↓ (×8, summed)
                                                                                   [masterGain] → [DynamicsCompressor] → [destination]
```

---

## Tonal Palette

NOT D-Dorian. NOT C-pentatonic. Just intonation on A, using the natural overtone series of A2 (110 Hz):

| Voice | Note  | Frequency | Ratio to A2 | Position         | Timbre                    |
|-------|-------|-----------|-------------|------------------|---------------------------|
| 0     | A2    | 110.00 Hz | 1/1         | Front            | Pure sine sub             |
| 1     | E3    | 165.00 Hz | 3/2         | Right 120°       | Detuned sawtooth pair     |
| 2     | A3    | 220.00 Hz | 2/1         | Behind           | Triangle + sine octave    |
| 3     | C#4   | 275.00 Hz | 5/2         | Left 120°        | FM bell (carrier+mod)     |
| 4     | E4    | 330.00 Hz | 3/1         | Up-right 45°/45° | Unison chorus triangles   |
| 5     | G4♭   | 385.00 Hz | 7/2         | Low-left 45°/−30°| Sawtooth bandpass (nasal) |

Voices 4 and 5 are placed at non-zero elevation to demonstrate the Z axis of the soundfield. Each voice has independent slow amplitude and filter-cutoff LFOs (0.03–0.15 Hz) so the field breathes without periodicity.

---

## Named References

- **JSAmbisonics** (Politis / polarch): https://github.com/polarch/JSAmbisonics  
  The canonical JavaScript FOA/HOA library; this prototype implements the same B-format encode/rotate/decode pipeline from scratch.

- **Google Omnitone**: https://github.com/GoogleChrome/omnitone  
  Google's spatial audio renderer for WebVR/WebXR; uses a similar virtual loudspeaker decode approach with Web Audio HRTF panners.

- **Zotter & Frank, "Ambisonics: A Practical 3D Audio Theory for Recording, Studio Production, Sound Reinforcement, and Virtual Reality"**, Springer 2019 — source of max-rE decode weights.

---

## What is Unverified

Since this sandbox has no audio output or orientation sensor, the following are asserted but not confirmed by listening:

1. **Binaural imaging quality**: The Web Audio HRTF dataset is generic (not individualised), so localisation may be imprecise, especially for elevation. This is inherent to the Web Audio API.
2. **Rotation smoothness**: The `setTargetAtTime(value, now, 0.02)` smoothing constant (20ms) should prevent clicks during fast head movements, but the optimal value was not empirically tuned.
3. **iOS DeviceOrientationEvent**: The requestPermission flow has been written per Apple's spec but not tested on an actual iOS device.
4. **Gain staging**: The master gain (0.85) through a DynamicsCompressor limiter (threshold −6dB, ratio 20:1) should prevent clipping, but the actual loudness balance between voices was not verified by ear.
5. **Decode matrix correctness**: The rotation-by-inverse-speaker-direction approach is mathematically equivalent to rotating B-format channels, but this equivalence was not verified with a reference implementation.
