# Beat Pulse — design notes

**For**: kids 3+ · Zero permissions · Zero API · Zero deps

## What it does

A large glowing circle pulses at a steady BPM (default 70). Each beat:
- the circle flashes bright with a color from the C-major pentatonic (C3→E3→G3→A3→C4, cycling)
- a quiet triangle-wave pluck plays at half the beat pitch (the metronome voice)
- the note name (C3, E3…) briefly appears inside the circle

The child taps anywhere on the canvas. Every tap plays a louder note and sends sparks flying from the tap point. **On-beat taps** (within 18% of the beat period) produce 20 sparks including a second burst from the circle center; off-beat taps produce 9. No score, no penalty — just a bigger sparkle reward for being close to the beat.

A thin progress arc (barely visible) sweeps clockwise around the circle once per beat, giving a clock-like preview of the next beat. BPM +/− buttons (±10, range 40–120) at the bottom let a parent or older child adjust the tempo.

## Interaction paradigm

Beat Pulse is the first kids prototype about **temporal attention** — tuning in to a rhythmic pulse and matching your tap to it. Prior kids prototypes reward any tap (characters, fish, dots, ripples). This one rewards *when* you tap, not just *that* you tap. The reward gradient is implicit and non-judgmental: on-beat = more sparks, off-beat = fewer, but both produce sparks and sound.

A 3yo will just tap and enjoy the sparks + notes. A 5yo may notice that tapping with the flash produces a bigger explosion and start chasing the beat. An adult will immediately understand the metronome model. Same prototype, three engagement depths.

## Connection to loved prototypes

- `98-kids-drum-circle` ❤️ — the percussion/rhythm connection. Beat Pulse is the next step: instead of tapping drums at will, you tap with a pulse.
- `100-kids-paint-song` ❤️ `111-kids-shape-loop` ❤️ — sparks-as-reward is a proven visual language across the kids zone.
- `105-pluck-field` ❤️ — pentatonic triangle tones give familiar warm timbre.

## Technical notes

- Beat is driven by `beatPhase` (0→1) advancing via `dt / beatDur` each frame. No `setInterval` — the audio context clock and rAF provide microsecond accuracy.
- On-beat window: `beatPhase < 0.18` OR `beatPhase > 0.82` (i.e., within 18% of beat boundary in either direction = ±(0.18 × beatDur)s). At 70 BPM that's ±154ms, a standard "good" timing window.
- BPM changes propagate via `bpmRef.current` synced from React state — no effect restart needed.
- Sparks: array of `{x,y,vx,vy,life,color,r}` updated each frame, gravity +110px/s², mild drag, life decays at 2.0/s. ~30 sparks per large tap, cleaned up within ~0.5s.
