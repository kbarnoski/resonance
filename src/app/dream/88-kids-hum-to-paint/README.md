# 88 — Kids: Hum to Paint

**For**: kids (4+), parents as co-players  
**Route**: `/dream/88-kids-hum-to-paint`  
**Status**: demoable

## What it does

Hum or sing any pitch — your voice paints a glowing brush stroke on the canvas in real time. Higher voice → stroke at the top of the screen. Lower voice → stroke at the bottom. The stroke color maps to your pitch: low notes paint warm reds/oranges, mid notes paint greens, high notes paint cool blues and violet.

After 30 seconds (or whenever you tap "Replay"), the painting plays back as a melody — each recorded pitch plays in left-to-right order while a white scan line sweeps across the canvas.

## Design principles applied

- **No reading required** — only icons and giant buttons
- **Immediate response** — first brush stroke appears within one animation frame of pitch being detected
- **No wrong notes** — every pitch maps to a beautiful color; nothing fails
- **Embodied** — voice as instrument, one of the most accessible for a 4yo
- **Looping ambient pad** — soft C3/E3/G3 sine pad plays throughout so silence never feels broken
- **Tap-target ≥ 64px** — Start button is 160×160px, Replay is 90px tall

## How pitch detection works

Autocorrelation on a 2048-sample window at 44.1kHz (~46ms analysis window):
1. Compute normalized autocorrelation function (NACF)
2. Find the first trough, then the highest peak after it
3. If peak correlation ≥ 0.82, accept frequency = sampleRate / lag
4. Parabolic interpolation between integer lag bins for sub-sample precision
5. Smoothed Y position (α=0.20 EMA) so the brush stroke moves fluidly without jitter

RMS gate: signal must exceed 0.012 RMS to trigger — ignores room noise and breath.

## Color mapping

Pitch range: 80 Hz (very low voice) → 700 Hz (high child voice)  
Mapped on log scale to hue: 0° (red) → 270° (violet)

| Approx pitch | Hue | Color |
|---|---|---|
| E2 ~82 Hz | 0° | red |
| B2 ~123 Hz | 40° | orange |
| E3 ~165 Hz | 80° | yellow-green |
| B3 ~247 Hz | 120° | green |
| E4 ~330 Hz | 160° | cyan |
| B4 ~494 Hz | 200° | blue |
| E5 ~660 Hz | 270° | violet |

## Replay

Notes are sampled at ~2 Hz (every 28 RAF frames). The melody array stores `{freq, x}` per sample. On replay:
- All notes scheduled via Web Audio API in advance (`scheduleTone` at `currentTime + offset`)
- A CSS `div` scan line sweeps from x=0% to x=96% over the replay duration
- Duration = `max(3s, noteCount × 0.38s)` — prevents very short songs from rushing

## Polish ideas

- Let the child tap the painting to hear the note at that X position
- Add a "star burst" particle effect when the brush changes color dramatically
- Offer a "pick a friend" character overlay (ghost, whale, star) that dances with the melody
- Add a second-finger gesture that lets a parent hum alongside (two-color duet)
- After replay, offer to save the painting as a PNG
