**For**: kids (4+)

# breath grove

## The one question
What if each slow breath grew a branch of a glowing tree — and over a few minutes your breathing grew a whole luminous grove that *remembered* every breath, so you could watch a timelapse of how it grew?

## How it works

**Breath → Recursive Grove → Timelapse**

1. **Breath detection** (`breath.ts`): the microphone feeds an AudioContext AnalyserNode. Each frame computes a smoothed RMS amplitude. An auto-calibrating noise-floor EMA ensures a quiet child reliably crosses the trigger gate. One event fires per detected exhale, carrying duration + strength.

2. **Grove growth** (`grove.ts`): each exhale calls `applyBreath()`, which — inspired by L-systems (Lindenmayer) recursive branching — may sprout a new sapling, extend existing tips, or split a branch into two, weighted by breath strength and cumulative count. Every segment and blossom is stamped with `breathIdx` (the breath that created it), giving the grove persistent memory. Four stages:
   - Stage 1 (1–4 breaths): bare saplings rise from dark ground
   - Stage 2 (5–9): branches split, first leaves appear
   - Stage 3 (10–14): blossoms open, fireflies drift among branches
   - Stage 4 (15+): night sky deepens to violet, moon + aurora glow, the full grove

3. **Timelapse replay** (`buildTimelapse` in `grove.ts`): because every breath is recorded in `state.breaths`, we can replay the entire growth from breath 0 to now. The timelapse fast-forwards through all saved states — the payoff of "it remembered every breath."

4. **Audio** (`audio.ts`): a pelog-like inharmonic drone of 5 oscillator voices at ~55 / 82.41 / 110 / 164.5 / 185 Hz, each detuned 8–22 cents from 12-TET. This creates the "warm and other" quality of Indonesian gamelan pelog — not Western diatonic. More voices fade in as stages advance (the drone thickens as the grove grows). A soft bell bloom plays per exhale. All audio routes through a DynamicsCompressor limiter so volume can never blast small ears.

5. **Auto-demo**: synthetic breath events fire every ~3.2s (with slight variation) driving the identical detect → grow → audio pipeline. The grove reaches Stage 4 in roughly 45–50 seconds, hands-free — a reviewer with no mic sees and hears the full arc untouched.

## Pelog tonal note

The sound world references Indonesian gamelan pelog tuning: a 5-note scale where intervals are deliberately "out of tune" by Western standards. The ~14-cent sharp first voice, the -19-cent flat second voice, and the -22-cent flat fourth voice create a haunted, ancient, non-Western harmonic space. This is the "inharmonic" quality specified — no pentatonic, no diatonic, no MIDI-adjacent Western scales.

## Named references

- **L-systems (Aristid Lindenmayer, 1968)**: the recursive branching grammar that governs how tips split and extend with each breath.
- **Pelog / Indonesian gamelan**: the inharmonic tonal tuning system informing the drone and bloom frequencies.
- **Long-form generative state/memory/evolution**: the piece is explicitly different at minute 3 than minute 0 — not a loop, but an accreting stateful object that remembers every breath.

## Auto-demo
On load (or "watch the demo") synthetic breaths fire every ~3.2s. Stage 4 is reached after ~15 synthetic breaths (~48s). The timelapse replay button unlocks at Stage 4, allowing a full growth replay. No mic required.

## Unverified surfaces (honest notes)
- **Audio**: built and tested against Web Audio API spec; not verified on physical hardware or iOS devices in this build sandbox. Pelog detuning values are analytically correct but perceptual "rightness" is unverified without listening.
- **Mic calibration**: the noise-floor EMA approach is logically sound for quiet-child reliability; not tested against a real child's breath in this environment.
- **Canvas performance**: as branch count grows (50–200+ segments after Stage 4), per-frame redraw of every segment is O(n). Shadow/glow passes add cost. On low-end devices, frame rate may degrade — a culled draw (skip segments outside viewport, or batch with compositing) would be the next optimization.
- **iOS AudioContext**: the "create inside gesture" pattern is implemented; not device-tested in this sandbox.
