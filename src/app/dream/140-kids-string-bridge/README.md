# String Bridge (kids) — design notes

**For**: kids 4+ · parents · anyone with two fingers

## The core idea

Every previous kids prototype makes the *position* of a finger (or the duration of a hold, or the path of a drag) the musical parameter. This one makes the *relationship between two touch points* the instrument. The string lives in the gap between your hands.

Hold two fingers apart: a glowing string stretches between them and rings with a pentatonic note. Closer together = shorter string = higher pitch (same physical law as a real guitar string or kalimba tine). Farther apart = longer string = lower pitch. Moving your fingers "plucks" the string — each time the distance changes by more than 12px, a new pluck fires.

Single finger also works: the string anchors to canvas center, giving a theremin-like "distance from center = pitch" interaction that solo players discover immediately.

## Physical model

The string is a standing-wave animation:
- Shape: fundamental mode — `sin(π × position_along_string)` × `cos(2π × phase)` — the classic bowed string shape, oscillating back and forth
- Visual rate: proportional to pitch (slow vibration at C2 ≈ 0.8 Hz, faster at C5 ≈ 5.5 Hz) — higher notes visibly vibrate faster
- Amplitude: peaks at pluck → decays to 0.18 floor while held → fades to 0 on release
- Color: violet (C2) → emerald (G3) → amber (C5) — same hue encoding as `1-live`

Audio: triangle oscillator, quick 12ms attack, 450ms decay to sustain at 0.07, 350ms fade on release.

## Distance→pitch mapping

```
freq = 523.25 Hz (C5) × 80px / max(80px, distance)
```

Snapped to C-major pentatonic. Examples:
- 80 px (fingers touching) → C5 = 523 Hz
- 160 px → C4 = 261 Hz  
- 320 px → C3 = 130 Hz
- 640 px → C2 = 65 Hz

Three octaves span the screen diagonal on most phones and tablets.

## What a 4yo discovers

1. First tap: hold one finger → string appears + rings
2. Two fingers: string spans between them → different pitch
3. Move fingers together → string gets higher → instant physics lesson
4. Move fingers apart → string gets lower → "shorter = higher, longer = lower"
5. Quick snap of fingers → pluck burst, string vibrates fast
6. Slow glide → smooth pitch glide like a thereminvox
7. Two children, four fingers → play a chord (two simultaneous strings if quick enough)

No instructions needed. The physical model is legible without reading.

## Zero deps · zero API · zero permissions

Pure Web Audio API + Canvas2D. Runs offline.

## What's next (polish ideas)

- Add a 2nd harmonic overtone (+2nd oscillator at 2× freq, gain 0.12) for a richer string timbre
- Pinch-zoom gesture (two fingers approaching = rising pitch) could be a fun framing
- "Bow mode" — hold still while a continuous tone sustains at constant volume (no pluck decay); one slider between "pluck" and "bow" could be interesting for older kids
- Three-finger chord: track up to 3 fingers, draw 3 strings between adjacent pairs (triangle formation)
