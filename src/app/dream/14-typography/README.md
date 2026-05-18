# 14 — Kinetic Typography

**Question**: What if Resonance's language — its vocabulary of frequency, resonance, wave, light — was itself made of sound?

## What it does

Six short phrases cycle every 8 seconds. Each phrase is decomposed into individual letters; each letter is assigned to one of the six frequency bands (sub-bass through high) by position (`index % 6`). Letters are physical objects: they have position, velocity, and a spring that pulls them toward their target (the assembled phrase).

**Audio drives three forces:**
1. **Band scatter** — when a band's energy exceeds 0.22, letters assigned to that band receive random velocity impulses scaled by `(energy - 0.22) × 14`. Bass energy shakes bass letters; treble energy agitates treble letters.
2. **Onset burst** — percussive hits (or demo beats at ~76 BPM) fire all letters radially outward from the canvas center. The spring immediately starts pulling them back.
3. **Drift noise** — a slow sinusoidal noise term (unique phase per letter) keeps letters gently floating even in silence. No letter is ever fully still.

**Color** follows the 1-live band palette: sub-bass letters are violet, bass cyan, low-mid green, mid yellow, high-mid orange, high magenta/red. `shadowBlur` adds a glow proportional to the band's current energy.

**Demo mode** uses math-based synthetic band values (six sinusoids at different frequencies, no Web Audio needed) so the animation is immediately visible without permissions.

## Typography choices

- Font: `monospace` — matches Resonance's UI aesthetic
- Font size: auto-scales to 82% canvas width, range 36–80px
- Character width estimate: `0.62 × fontSize` (standard monospace)
- Letters are centered on their target x, y = canvas midheight
- No explicit line-wrapping (all phrases ≤ 16 chars, fit on one line at minimum 36px on any device)

## Phrases and why these six

```
RESONANCE          — the app name, the concept
SOUND INTO LIGHT   — the core transformation Resonance proposes
BODY OF MUSIC      — the instrument-player unity that piano playing is
EACH NOTE A WAVE   — physics, but poetic
FREQUENCIES        — alone, this word is striking typographically
OF BEING           — the phrase that follows FREQUENCIES, completing a thought
```

The last two are split across two cycles deliberately. When `FREQUENCIES` appears and you're expecting the rest of the phrase, the pause before `OF BEING` lands differently.

## Physics parameters

| Parameter | Value | Notes |
|-----------|-------|-------|
| Spring K | 0.066 | Letters assemble within ~1.5s |
| Damping | 0.76 | Overdamped — no oscillation around target |
| Scatter threshold | 0.22 | Band energy below this → no scatter |
| Scatter multiplier | 14 | At full energy (1.0): ±10.8 px/frame impulse |
| Onset burst | 9 px/frame | Radial from center |
| Drift amplitude | 0.28 px/frame | Slow, sinusoidal |

## Polish ideas for later cycles

1. **Second line** — detect if phrase is too long and wrap to two lines. Makes longer phrases possible ("IN THE SPACE BETWEEN NOTES").
2. **Letter hold** — when a letter's band is silent, it snaps to target faster (musical silence → typographic clarity).
3. **Phrase overlap** — new phrase scatters in from outside while old phrase scatters out. Creates a visual palimpsest.
4. **Typeface variety** — currently `monospace` only. A second font face (serif for "body", sans for "light") could mirror the dual nature of Resonance (classical + electronic).
5. **Poetry integration** — tap the Resonance `/api/poetry` endpoint to pull live fragments from an actual session, rather than the hardcoded 6 phrases. The words the AI generates *about your playing* appear as the visualization *of your playing*.
