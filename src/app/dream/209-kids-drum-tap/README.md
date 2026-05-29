# 209-kids-drum-tap

**For**: kids (4+)

Tap the four colored drum pads. After your rhythm, the drum talks back — eight beats of its own,
shaped by your pattern.

## Design

Four quadrants cover the whole screen (each ≥ half the screen wide):

| Pad | Position | Color | Sound | Size |
|-----|----------|-------|-------|------|
| Kick | top-left | violet | deep boom | largest |
| Hi-hat | top-right | amber | bright shimmer | smallest |
| Snare | bottom-left | rose | crisp crack | medium |
| Tom | bottom-right | teal | mid thud | medium-large |

BANDIMAL sizing rule: bigger circle = lower-pitched drum. Kids discover pitch-by-size intuitively.

Every tap: immediate sound + ripple ring expanding from the tap point. The pad brightens with
a radial glow that decays over ~0.5 s.

## Markov response

After 2+ taps and 1.5 s of silence, a 1st-order Markov chain generates an 8-beat response.

- The transition matrix tracks which pad the child taps *after* each other pad.
- Response is built by walking the matrix: `next = sample(row[lastPad])`.
- First taps use default weights (kick 35%, snare 28%, hihat 20%, tom 17%).
- The longer the child plays, the more the drum mirrors their style.

Response steps: 8 steps at 375 ms each = 3 s total (8th notes at 80 BPM).
The drum pads flash in sequence as the response plays. Four small colored dots at the bottom
pulse to show which pad is active during the response.

## Sound design (Web Audio only, zero deps)

- **Kick**: oscillator 110 Hz → 40 Hz over 180 ms, gain envelope 0.85 → 0 in 400 ms
- **Hi-hat**: 70 ms white noise → highpass 7500 Hz, gain 0.42 → 0 in 70 ms
- **Snare**: 130 ms bandpass noise (1800 Hz, Q=0.7) + 185 Hz sine transient (70 ms), mixed
- **Tom**: oscillator 155 Hz → 75 Hz over 220 ms, gain 0.70 → 0 in 320 ms

## Polish ideas

- Mic mode: onset detection drives response BPM (child's clapping speed = drum speed)
- 16th-note roll: hold a pad → rapid fire (80 ms interval)
- BPM display: detect inter-tap interval and display as a number
- Second layer: tom + kick always play together on beat 1 of the response (anchor downbeat)
- Drumstick icon: animate a stick hitting each pad on trigger (canvas arc animation)
