# Vectorscope — design notes

## What this asks

"What if the geometry of musical intervals were visible?"

A Lissajous figure is what you see when you plot two sinusoids against each other on an
oscilloscope. Jules Antoine Lissajous described them in 1857 using mirrors and tuning forks.
Each harmonic ratio produces a distinct topological figure:
- 1:1 (unison) → ellipse or straight line
- 1:2 (octave) → figure-eight
- 2:3 (fifth) → three-lobed knot
- 3:4 (fourth) → four-crossing figure
- etc.

The figures ONLY close if the ratio is rational. Irrational ratios produce endless non-repeating
curves — the visual equivalent of an irrational interval (tritone, major 7th). This connects to
why Western tuning spent centuries fighting over temperament: the ear wants closed figures.

## Phase portrait mode

With mic input, the prototype switches to a **phase portrait** (or delay-coordinate embedding).
Instead of plotting two independent signals, it plots:

  X = signal[t]
  Y = signal[t + delay]

This is equivalent to the attractor reconstruction technique formalized by Floris Takens in 1981.
For a pure sine wave, this is an ellipse (the harmonic delay creates a phase-shifted copy).
For a real piano note, it's a more complex closed curve because the waveform has overtones.

What reveals itself at different delay settings:
- **Short delay (5ms)**: nearly diagonal — signal and its very-recent past are almost identical
- **~Quarter-period delay**: near-circular for a fundamental frequency (clearest ellipse)
- **Long delay (80ms)**: reveals longer-range correlations in the audio texture; chords become
  multi-armed figures; percussion creates explosive outward sprays

## Visual design

**CRT phosphor persistence**: background fades very slowly (alpha = 0.025/frame in demo,
0.055/frame in mic). This accumulates the trajectory over ~1–2 seconds. Regions where the
trajectory slows (reversal cusps, slow arcs) accumulate more light → brighter. This is exactly
how a real oscilloscope CRT phosphor works: higher beam dwell time = more light.

**Color = direction of travel**: each segment's hue is computed from the angle of the trajectory
tangent (atan2(dy, dx)). Going right = red/orange. Going up = green/cyan. Going left = cyan/blue.
Going down = indigo/magenta. A clockwise ellipse traces a full rainbow. A figure-eight shows
complementary color families in its two lobes.

**36-bucket batching**: segments are sorted into 36 Path2D objects by 10° hue bucket. Only 36
`ctx.stroke(path)` calls per frame regardless of N (vs N individual calls). Keeps the renderer
fast even with 2048 segments/frame.

## Technical choices

- **fftSize = 8192** (mic mode): 8192 samples at 44100 Hz = 186ms of audio. Allows up to 80ms
  delay with 2048 segments remaining to plot.
- **smoothingTimeConstant = 0** (mic mode): time-domain data should be raw. Frequency smoothing
  would blur the waveform in time, degrading the phase portrait resolution.
- **N_LISS = 900** (demo mode): more than enough to draw the full parametric figure. Higher modes
  (5:6) need t ∈ [0, 5×2π] with 900 points = ~28 points per full oscillation cycle. Clean.
- **Phase drift** (demo): `phaseOff = π/2 + sin(t × 0.22) × 0.65` keeps the figure in the
  "closed" regime (near π/2) while slowly oscillating ±0.65 rad. A figure at exactly 0° or 180°
  collapses to a line; this keeps it always visible while showing the morphing behavior.

## Polish ideas

1. **Stereo vectorscope**: if the browser gives stereo mic/line input (L/R channels), route
   left → X and right → Y. This is the standard studio vectorscope — shows stereo width,
   mono compatibility, and phase issues. A mono signal is a diagonal line; wide stereo spreads.
   Would need Web Audio's `ChannelSplitterNode`.

2. **Frequency sweep**: add an "auto-frequency-sweep" demo mode where f2/f1 slowly sweeps from
   1.0 to 2.0. The figure starts as an ellipse, passes through all the integer ratios (one closed
   figure after another), and degenerates to chaos between ratios. Audio engineers call this
   "flying through the harmonic series."

3. **Lissajous audio**: connect the two demo oscillators to the audio output (at low gain). You'd
   hear the two tones beating against each other while watching the figure form. The beating rate
   = the rate at which the phase slowly drifts. When the figure is open (phase ≠ 90°), the
   beating is audible.

4. **Live interval detection**: for mic mode, add real-time fundamental detection (autocorrelation,
   same as `13-piano-canvas`) and display the nearest named interval when two pitches are detected.
   "You're playing a fifth → the figure should be a three-lobe knot."

5. **Symmetry indicator**: count the number of lobes/crossings in the current figure and display
   the topological knot class. 1:2 = figure-8 (genus 1), 2:3 = trefoil, etc.
