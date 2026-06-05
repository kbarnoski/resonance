**For:** kids (4+)

# 320 · Kids Light Loom

> *What if a 4-year-old could BOW glowing strings of light into sustained, singing tones — not pluck them, but draw them alive by dragging?*

## How to Play

Six glowing vertical strings span the screen. Each is a different color and pitch.

- **Drag a finger along a string** → it lights up and sings a sustained tone
- **Drag slowly** → soft, dark, breathy sound
- **Drag quickly** → bright, loud, singing tone
- **Two fingers** → bow two strings at once for harmonies
- **No wrong notes** — every string harmonizes with every other string

The string **sustains and swells** while your finger moves. When you stop, it gently fades. This is totally different from plucked strings — you're _bowing_, feeding energy in continuously.

## The Bowed-String Model

This is the lab's **first continuous-excitation bowed-string synthesizer** — every prior string in the lab uses Karplus-Strong (one burst of noise, then decay). Bowing is fundamentally different: the bow continuously feeds energy into the string, sustaining it indefinitely.

### Approach (b) — Sawtooth + Noise + Bow-Speed Mapping

Each string is synthesized as:

```
[Sawtooth OSC] + [White Noise] → [Bow Gain] → [HP Filter] → [LP Filter] → [Envelope] → output
```

Key insight from **Helmholtz motion / stick-slip dynamics**:
- **Slow bow** = more noise (scratchy, breathy) + low LP cutoff (dark)
- **Fast bow** = more pure tone + high LP cutoff (bright, loud)
- This mimics the physical stick-slip mechanism where faster bow speed creates stronger, purer Helmholtz motion

The **bow gain** and **LP filter cutoff** both track bow speed via `setTargetAtTime()` — no clicks, smooth and real-time.

### Signal Chain

```
[Saw + Noise] → [bowGain (speed→amp)] → [HP filter] → [LP filter (speed→brightness)]
             → [Envelope (swell in / fade out)] → [Master Gain]
             → [Dry path + Convolver Reverb] → [DynamicsCompressor] → output
```

The **ConvolverNode reverb** is built in code (no audio files) — exponential-decay noise impulse response. The **DynamicsCompressor** is a brick-wall limiter so mashing all strings is never harsh.

## The Scale

**D-Dorian hexachord / just-intonation 5ths over D root:**

| String | Note | Freq (Hz) | Color |
|--------|------|-----------|-------|
| 1 | D2 | 73.42 | Rose-magenta |
| 2 | A2 | 110.0 | Vivid orange |
| 3 | D3 | 146.83 | Amber |
| 4 | G3 | 196.0 | Electric green |
| 5 | A3 | 220.0 | Cyan |
| 6 | D4 | 293.66 | Violet |

> C-major pentatonic is **banned** in this lab. D-Dorian gives a slightly mysterious, modal feel — still consonant with no wrong combinations.

## Subsystems

1. **Bowed-string audio engine** (`audio.ts`) — sawtooth + noise + LP filter with real-time bow-speed mapping; always-on drone (D2+A2); synthetic reverb + compressor safety chain
2. **Multi-touch bow-gesture tracker** (`bow.ts`) — per-pointer velocity computation, EMA smoothing, string hit detection, simultaneous multi-finger support
3. **Three.js glowing-string scene** (`scene.ts`) — emissive THREE.Line geometry with per-frame standing-wave displacement (modes scale with bow energy), additive-blended glow planes, sparkle Points particles near the bow contact
4. **Always-on drone + reverb/limiter** — D2+A2 root+fifth drone fades in on start; synthetic ConvolverNode reverb; DynamicsCompressor brick-wall at -18dBFS threshold

## Named References

- **Stefania Serafin & Christophe Vergez** — *Real-time friction model of the violin* (IRCAM, 2000)
- **Julius O. Smith III** — *Digital Waveguide Bowed Strings* (CCRMA Stanford)
- **Helmholtz motion / stick-slip**: the physical mechanism where the bow alternately sticks and slips against the string, creating the characteristic periodic waveform and sustained tone
- Sibling prototype: **140-kids-string-bridge** — the first plucked-string playground in the lab (Karplus-Strong)

## Graceful Degradation

- **No WebGL** → a `text-rose-300` notice is shown instead of the canvas
- **No Web Audio** → a non-fatal notice appears; the three.js visuals still animate and respond to touch
- **iOS AudioContext** → created inside the "▶ Start Playing" button press (first user gesture), iOS-safe
- **Auto-demo** → string 0 (D2) bows itself gently for ~3.5 seconds on start so the experience is alive at first glance

## Technical Notes

- Output is **three.js / WebGL** — raw `THREE.WebGLRenderer`, `THREE.Line` geometry, `THREE.Points` for sparkles, additive `THREE.MeshBasicMaterial` for glow planes. NOT Canvas2D, NOT a full-screen fragment shader.
- No npm dependencies added — `three` was already in `package.json`
- Multi-touch: each `PointerEvent` id tracked independently; two+ pointers can bow separate strings simultaneously
- All `setTargetAtTime()` for gains — no zipper noise or clicks
- Geometries and materials disposed on React unmount via cleanup effect
