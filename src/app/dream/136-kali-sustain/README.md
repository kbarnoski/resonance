# 136 — Kali Sustain

A sustained harmonic drone that cycles through six just-intonation intervals above a C2 root. Each ratio holds for twelve seconds, then glides to the next over twelve seconds. No samples, no synthesis beyond sine waves.

## The Six Intervals

| Ratio | Name | Character |
|-------|------|-----------|
| 3∶2 | Perfect Fifth | Open, ancient, universal |
| 4∶3 | Perfect Fourth | Ambiguous, suspended |
| 5∶4 | Major Third | Warm, optimistic |
| 6∶5 | Minor Third | Tender, slightly melancholic |
| 7∶4 | Harmonic Seventh | Outside 12-TET — otherworldly flat seventh |
| 9∶8 | Whole Tone | Tense, wanting resolution |

Full cycle: 6 × 24s = **144 seconds** (~2.4 min).

## Audio Architecture

| Node | Role |
|------|------|
| `rootOsc` (sine, C2) | Foundation drone |
| `lfo` (0.05 Hz → rootOsc.frequency) | Subtle sub-Hz beating, keeps the root alive |
| `harmOsc` (sine, ratio × root) | The interval voice — glides between ratios |
| `octOsc` (sine, root × 2) | Octave warmth, very quiet |
| `master` (GainNode) | 2.5s fade-in on start; 0.4s fade-out on stop |

The harmony frequency updates every 200ms via `setTargetAtTime` with a 250ms time constant — smooth but never pre-scheduled, so mic mode stays responsive.

## Mic Mode

When "Mic mode" is selected, autocorrelation pitch detection runs on 2048-sample windows every 600ms. If a pitch is detected in 40–500 Hz that differs from the current root by more than 2%, the root shifts: `rootOsc` and `octOsc` retune with a 300ms time constant. The harmony voice follows automatically.

## Visual

The ratio clock shows six nodes around a circle, one per interval. A glowing dot sweeps clockwise, dwelling at each node during hold, drifting toward the next during glide. An inner arc tracks phase within the current 24s window — solid during hold, dashed during glide. Background hue interpolates between the active and next interval's palette.

## Resonance Connection

This prototype explores the *sustained harmonic* — the opposite of a melody. Instead of moving through time quickly, it asks the ear to settle into a single interval and feel its character. Fits the "transcendent listening" use case for Resonance: long sessions of intentional hearing rather than passive background playback.

**Inspiration:** Kali Malone's pipe organ works (especially *The Sacrificial Code*), where just-intonation ratios are held long enough to feel architectural rather than ornamental.

## Polish Ideas

- Add a second harmonic voice moving to complementary ratio (e.g., 5:4 when root is on 3:2 → chord)
- Reverb tail (ConvolverNode or simple feedback delay)
- Export the 144s journey as a WAV blob
- Let user pin a favourite ratio indefinitely
