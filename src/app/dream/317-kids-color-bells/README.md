# 317 — Kids Color Bells

**Why open this:** Hold a red toy up to the camera and a warm bell rings — the room becomes your instrument, and every color you find gets added to a little song you can play back.

## How it works

1. **Tap Start** — AudioContext is resumed in the gesture (iOS-safe), then the rear camera is requested via `getUserMedia({video:{facingMode:'environment'}})`. Camera permission denied? Falls back to six big touch buttons automatically.
2. **Point the camera at a colored object** — a live video feed fills the screen. A "magic circle" reticle is drawn at the center. Every animation frame, the video is drawn to an offscreen canvas and the average RGB inside the reticle box is computed and converted to HSV.
3. **Hold the color steady for ~0.5 s** — the reticle shows a clockwise progress arc. Once the hold completes, that color's bell rings, a full-screen color wash flashes, and a bead is added to the growing strand at the bottom.
4. **Tap ▶ Play song** — the bead strand replays as a melody. Each bead lights up as it sounds. Tap 🧺 to clear and start again.

## Camera-color sampling (the novel technique)

No ML, no body tracking, no optical flow. Just:

```
offscreen canvas ← drawImage(video)
ImageData ← getImageData(center box)
average R, G, B of sampled pixels
→ convert to HSV
→ if saturation > 0.25 and value > 0.18: map hue to one of 6 bins
→ if same bin held for 500 ms: ring that bell
```

The threshold values are generous for real-room objects under variable lighting. The 0.5 s hold prevents machine-gunning while still feeling snappy to a 4-year-old.

## Scale + color → note mapping

**D major hexachord** (D E F♯ G A B) — ascending with the rainbow.

| Color  | Hue range     | Note | Freq   |
|--------|---------------|------|--------|
| Red    | 340°–15°      | D3   | 146.83 Hz |
| Orange | 15°–45°       | E3   | 164.81 Hz |
| Yellow | 45°–75°       | F♯3  | 185.00 Hz |
| Green  | 75°–165°      | G3   | 196.00 Hz |
| Blue   | 165°–265°     | A3   | 220.00 Hz |
| Violet | 265°–340°     | B3   | 246.94 Hz |

Warm colors map to the lower, warmer-feeling notes; cool colors ascend the scale. The hexachord avoids C-major-pentatonic (banned this cycle) and has a folk-song, marimba-friendly character.

## Audio architecture

- **Bell voice:** FM bell synthesis — a sine carrier with an inharmonic modulator (ratio 2.756×, fast-decaying modulation depth) plus a bright 2nd-partial sine. Gives a warm marimba/gamelan bell rather than a harsh tone.
- **Signal chain:** bell → dry/wet split → synthesized ConvolverNode reverb (1.2 s exponential-decay noise IR) → DynamicsCompressor (threshold −18 dB, ratio 12:1) → master gain 0.5. Nothing can clip small ears.
- **Always-on pad:** D3 + A3 + D4 sines at very low gain fade in over 2.5 s so it's never silent.

## Graceful degradation

If camera is unavailable or denied:
- `text-rose-300` error notice is shown.
- Six large (≥68 px) color buttons appear — tap any to ring the bell and add a bead.
- An automatic demo sequence rings a few colors so it's alive immediately with no camera and no user action.
- Camera status shown: emerald "Camera on" or amber "Touch mode".

## Named references

- **Toshio Iwai — *SimTunes* (1996):** grid cells' colors directly mapped to instruments and pitches. Color Bells extends this to the physical world: any colored object in the room triggers sound.
- **Color-organ lineage — Castel's *clavecin oculaire* (1725), Len Lye, Oskar Fischinger:** the long tradition of treating color as pitch, light as music. "The room is your instrument."

## Ambition

`ambition: camera region-color sampling (technique never used in the lab) + 4 integrated subsystems (camera sampler · FM bell audio engine · Canvas2D scene renderer · song-memory state machine)`

## Known / unverified items

- FM ratio 2.756 for bell timbre is empirically chosen; exact optimal ratio varies by fundamental frequency and may need tuning.
- Synthesized reverb IR is white-noise decay — real room IRs would sound richer.
- On iOS, `getUserMedia` with `facingMode: 'environment'` works only in Safari (not Chrome/Firefox). The demo correctly falls through to touch mode if denied.
- Color sampling does not white-balance against ambient light; very yellow/green indoor lighting can skew readings (generous thresholds mitigate this).
