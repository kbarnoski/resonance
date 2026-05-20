# Tap Rhythm — design notes

Route: `/dream/50-tap-rhythm` · Cycle 59 · Zero deps, zero API

## The question

What if a non-pianist could walk up to Resonance and immediately contribute a groove?

## How it works

**Tapping phase**: mic onset detection (same amplitude-threshold approach as `1-live` and `36-pluck-field`) records each tap with a timestamp and amplitude reading. The amplitude classifies the drum type: gentle tap → kick (55–100Hz sine burst), medium → snare (bandpass noise), hard/clap → hi-hat (highpass noise). Visual: expanding pulse rings color-coded by type (violet=kick, cyan=snare, amber=hat).

**Grid quantization**: after 8+ taps and 2s of silence (or the "Build loop" button), the tap timestamps are analyzed:
1. Median inter-onset interval → BPM estimate
2. Each tap's relative timestamp → nearest 16th-note slot in a 2-bar (32-step) grid
3. The grid is built from the quantized positions

**Circular step sequencer**: 32 dots arranged as a clock face. Each dot = one 16th note. Beat boundaries (quarter notes) are slightly larger. A rotating hand sweeps at the detected BPM; active dots light up as the hand passes.

**Scheduling**: `setInterval(20ms)` look-ahead scheduler — fires 60ms ahead using `AudioContext.currentTime`. Same pattern as every Web Audio sequencer: schedule future events slightly ahead to avoid audio glitches even if JS is briefly starved. The visual hand position is computed from `(currentTime - loopStart) / loopDuration * 32`, giving a smooth fractional position.

## Drum synthesis (Web Audio only, no samples)

**Kick**: sine oscillator, frequency glides 100→42 Hz over 120ms. Exponential gain envelope: attack 5ms, decay 500ms. The pitch glide is what makes it feel like a kick rather than a blip — the downward sweep is the body of the drum.

**Snare**: 120ms white noise buffer → bandpass filter (1800 Hz, Q=0.8) → exponential gain envelope (120ms decay). The bandpass carves the characteristic snap frequency while the noise gives the rattly body.

**Hi-hat**: 35ms white noise → highpass filter (8000 Hz) → very fast exponential decay (35ms). Extremely short, very high-frequency — unambiguously "cymbal".

## Audio mapping (drum classification by amplitude)

- `amp < 0.33` → kick (soft tap, barely audible)
- `0.33 ≤ amp < 0.66` → snare (medium tap)
- `amp ≥ 0.66` → hi-hat (hard tap or clap)

Thresholds were tuned so that a gentle desk tap is kick, a firm desk tap is snare, and a hand clap lands as hi-hat. Different input sources (phone tap, table knock, clap) vary, so the tap amplitudes are relative to whatever the mic captures.

## Interaction design

**Three phases**:
1. **Idle**: two buttons — "Tap your rhythm" (mic required) and "Demo" (pre-built 4-on-the-floor, no permissions)
2. **Tapping**: visual pulse rings radiate outward as taps are detected. "X of 8+" counter builds confidence. Auto-commits after 2s of silence once ≥8 taps captured. Manual "Build loop" button appears at 8+.
3. **Sequencing**: circular clock runs continuously. Click any step to toggle it (active/inactive). BPM slider ±20% from detected. "Re-tap" re-opens the mic. "Clear" returns to idle.

**Demo mode** is a hard requirement — most people open this without intending to tap, or on a device where mic permissions are tedious. The 4-on-the-floor preset (kick on every quarter, snare on 2&4, hi-hat on 8ths) is the most universally recognizable drum pattern. Hearing it play immediately communicates what the prototype does.

## Architecture notes

The `drawClock` function is module-level (takes `CanvasRenderingContext2D` + data args directly) to avoid ESLint treating it as a React hook.

Noise buffers (`playSnare`, `playHiHat`) are created fresh on each trigger — a new `AudioBuffer` every time a step fires. At 120 BPM with 32 active hi-hats, this is ~64 allocations/second, each ~6KB. This is acceptable for a prototype. Production would pre-allocate and reuse.

The scheduler uses `bpmRef.current` (not a React state read) so BPM slider changes take effect immediately without restarting the interval.

## What I noticed

The tap-to-grid quantization is surprisingly forgiving. A moderately unsteady 8-tap sequence (±50ms timing inconsistency) still produces a recognizable groove because the median IOI estimate is robust to outliers and the grid quantization snaps to the nearest 16th note. You have to be quite sloppy (± half a 16th note = ±62ms at 120 BPM) to land on the wrong step.

The amplitude classification works better on real-world input than expected. A hand clap is reliably high-amplitude; a finger tap on a laptop keyboard is low. The variance between users is handled by the three-bucket threshold: even if the absolute calibration is off, the relative ordering (gentle < medium < hard) holds.

## Polish ideas

- **Auto-fill**: detect the basic pulse from the tap sequence and offer to fill in the common patterns (add snare on 2&4 if only kick is detected)
- **Drum machine display**: toggle between clock face and a linear 32-step grid (more readable for editing)
- **Tap type selector**: instead of amplitude-based classification, let the user choose kick/snare/hat before each tap burst
- **Loop export**: encode the drum pattern as a WAV and download (32nd-note grid with the Web Audio drum sounds, same WAV encoding as `46-osc-composer`)
- **Velocity-sensitive hits**: store the amplitude at each tap, scale the drum volume accordingly (currently all triggers are at full velocity)
- **Multiple loops**: support 2-4 separate tap sessions that play simultaneously (like `35-loop-station`)

## Live performance fitness

This is the most accessible prototype in the sandbox for non-pianists. At a venue:
- Walk up, clap a groove → drum loop starts within 2s of silence
- Adjust BPM with the slider
- Toggle individual steps to refine the pattern
- Zero API calls, zero latency after the loop is built

The circular clock display reads naturally on a projected screen — the rotating hand makes the loop position obvious even at a distance.
