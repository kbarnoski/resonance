# Echo Drum

**For**: kids (4+)  
**Route**: `/dream/213-kids-echo-drum`  
**Cycle**: 246 — kids build  
**Status**: demoable

---

## What it does

Four full-screen drum pads (BANDIMAL sizing: bigger = lower). Tap any combination in any
rhythm. After 1.5 seconds of silence — or 8 taps — the drum echoes your rhythm back exactly.
Then, one more beat fires: the most-tapped pad plays one final time at the average interval
after your last tap, with a gold sparkle burst.

- **YOUR taps**: pads flash in their normal saturated hue
- **ECHO taps**: cool cyan overlay — visually distinct, so the child knows "the drum is
  talking back"
- **+1 BEAT**: gold ring + 24-sparkle burst — the delight moment, always

Phase indicator at canvas center: pulsing red dot = recording; pulsing cyan dot = echoing.
Colored tap-count dots orbit the center during recording (one per tap, in the pad's color).

---

## Design notes

### Interaction class: call-and-response

All prior drum prototypes (`209-kids-drum-tap`) reward immediate tap feedback. Echo Drum
introduces temporal distance: the child taps, then WAITS. The echo fires after a 1.5-second
silence window. This pause is long enough to surprise — the child's rhythm is a "statement"
that the drum chooses to reply to, not a live effect. The +1 beat extends the surprise: the
drum adds something unexpected.

### WHEN vs WHERE (from `154-kids-clap-back` learnings)

Clap-back taught that 4-year-olds can learn from TIMING feedback when it's non-judgmental.
Echo Drum flips the paradigm: there is no "correct" or "incorrect" timing. Whatever the child
taps is exactly what gets echoed. The feedback is "you were heard" — a fundamentally affirming
experience. Even a single chaotic tap gets echoed back perfectly.

### The +1 beat mechanic

The bonus beat is computed from the average inter-tap interval of the recorded rhythm:

```
avgMs = mean of (taps[i].ms - taps[i-1].ms) for i=1..n
bonus fires at: (lastTap.ms - firstTap.ms) + avgMs
```

This is deliberately statistical, not musical. If the child tapped a perfect 500ms rhythm,
the +1 fires at exactly 500ms after the last echo tap. If the rhythm was irregular, the bonus
falls at the "center of gravity" — which may or may not land on a beat, and that's OK.

The bonus pad is the most frequently tapped pad. If the child mainly hit kick, the drum
responds with kick. This feels like the drum "agreeing with you" on your favorite sound.

### Visual design: two voices

The coolness of the cyan echo overlay vs. the warmth of the pad's native hue creates
a clear "two voices" visual. The child doesn't need to read a label to understand:
warm colors = their voice, cool blue = drum's voice. This is the same principle as
`210-aria-companion` (YOU orange / ARIA blue) applied to a 4yo interaction.

### Why silence detection works for 4-year-olds

A 4yo doesn't understand "now stop so the drum can answer." But they naturally pause to
watch/listen. The 1.5s window is calibrated to be slightly longer than a typical pause
between taps in energetic play (~500ms) but shorter than a deliberate pause (~3s). Most
children will hit the echo window naturally.

If they tap continuously at 200ms intervals, they'll fill 8 taps (MAX_TAPS) and the echo
triggers immediately. The constraint rewards either pausing deliberately or tapping fast
enough to fill the buffer.

---

## Audio

All synthesis via Web Audio API, zero deps, same sources as `209-kids-drum-tap`:

- **Kick** (pad 0, violet): sine oscillator 110→40 Hz sweep, 0.4s
- **Hi-hat** (pad 1, amber): white noise → highpass 7500 Hz, 0.07s
- **Snare** (pad 2, rose): white noise + bandpass 1800 Hz + 185 Hz sine blip, 0.13s
- **Tom** (pad 3, teal): sine oscillator 155→75 Hz sweep, 0.32s

No mic needed. No AudioContext until first tap (browser autoplay policy compliant).

---

## Polish ideas for future cycles

- **Demo round**: on first load, after 3s idle, auto-play a 4-beat demo rhythm on the pads
  (with cyan flash = "watch this") then prompt the child to reply. Shows the mechanic
  without instructions.
- **Multi-echo**: after the +1 beat, echo the full sequence again transposed (all pitches
  up one step) — three repetitions total, each one slightly different.
- **Confetti rain**: on the +1 beat, full-screen burst of colored particles from all four
  pad centers simultaneously. More celebration.
- **Tempo display**: a BPM readout in the center gap, computed from inter-tap intervals,
  so a parent can see how fast the child was tapping.
- **Rhythm shapes**: after 3+ echo rounds, display a small "rhythm fingerprint" strip in
  the top bar — colored blocks showing the pattern of pads and timing from the last round.
