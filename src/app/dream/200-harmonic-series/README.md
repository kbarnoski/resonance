# 200 — Harmonic Series Explorer

**Route**: `/dream/200-harmonic-series`  
**Status**: `demoable`  
**Cycle**: 233 (2026-05-29)

## What it is

Every pitched sound — piano, flute, violin, voice — is the sum of sine waves at integer multiples of a fundamental frequency. The first partial is the note you hear; the higher partials (harmonics) shape the timbre (tone color). This prototype makes that structure visible and audible simultaneously.

## How to use

1. Click **▶ Start demo** — C3 (130 Hz) plays through a natural harmonic series (1/n rolloff)
2. Toggle individual rows to mute or solo partials — hear how the timbre changes
3. Try presets to hear classic instrument timbres:
   - **Flute**: almost pure fundamental, barely any harmonics
   - **Clarinet**: only ODD partials (1st, 3rd, 5th…) — a physical consequence of its closed cylindrical bore
   - **Violin**: all harmonics with slow rolloff — rich, complex
   - **Bell**: slightly *inharmonic* ratios (not exact integers) — why bells feel different from string instruments
4. Click **🎤 Start mic** and play a sustained piano note — the fundamental locks to your pitch automatically

## Design choices

- 16 rows = 16 partials. Row color follows the `1-live` band palette (violet=low, amber/magenta=high)
- Natural harmonic rolloff (1/n) = what most sounds actually do
- Bell preset uses BELL_RATIOS (non-integer multipliers like 1.5, 2.47, 2.98…) — approximating the stretched partial series of a real bell
- Amplitude bars update live even in demo mode; toggle on/off is instant
- Mic mode uses the same 4096-point autocorrelation as `13-piano-canvas` and `24-piano-roll`

## What this reveals

| What you hear | What the partials say |
|---|---|
| Flute: pure, breathy | Nearly no harmonics — almost a perfect sine |
| Clarinet: hollow | Even harmonics absent — the instrument's geometry forces this |
| Violin: warm, complex | Dense harmonic cloud with slow rolloff |
| Organ: full, cathedral | All harmonics equally loud |
| Bell: metallic, shimmery | Inharmonic partials — no integer relationship |
| Brass: brassy, nasal | 2nd–5th partials dominate the fundamental |

## Polish ideas

- Add a "blend" slider per row (not just on/off) for continuous timbre sculpting
- Show the summed waveform as a composite trace below all rows
- Export current partial configuration as a JSON "instrument" file
- Mic mode: show detected frequency bin confidence as a secondary bar
- A "reverse" mode: record a sound and run FFT to show WHICH preset it most resembles
