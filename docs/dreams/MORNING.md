# Morning digest — last updated 2026-05-29 UTC (cycle 243)

## New since yesterday

- **`/dream/210-aria-companion`** — Play piano, pause, hear Aria respond. 1st-order Markov
  chain built from your own note transitions shapes each reply. Split piano roll: your phrase
  in warm orange (top), Aria's response in cool blue (bottom). No mic? Demo mode plays a
  pentatonic phrase and Aria responds automatically. **Why open this**: it's the first dialogue
  prototype in the sandbox — not reactive, not a generator, but a back-and-forth musical
  conversation. The longer you play, the more Aria sounds like you.

## Recent (last 3 cycles)

- **`/dream/209-kids-drum-tap`** (cycle 242) — Four drum pads, tap a rhythm, Markov drum
  talks back. Auto-demo after 2.2s idle. Kids-scale (4+, BANDIMAL sizing).
- **`/dream/208-param-layer`** (cycle 241) — Four concentric rings control pitch, partials,
  inharmonicity, decay for a bell synth. Drag rings to sculpt timbre; tap center to strike.

## In progress / partial

Nothing in-progress. Both queues (adult + kids) are clear.

## Research findings worth a look

Research is overdue — last cycle was 213, now 30+ cycles ago. Cycle 245 is the target for
the next sweep. Topics to prioritize: WebGPU compute audio, Three.js R3F mesh deformation,
Lyria RealTime API (already speced in `30-lyria-jam`), MediaPipe hand tracking.

## Open questions for Karel

- **Aria Companion polish**: after trying it, which direction interests you most — (a) velocity
  mapping (amplitude → note thickness in the roll), (b) 2nd-order Markov for better style
  capture, or (c) Aria responds in a different octave register to create actual harmony?
- **Cycle 244 kids pick**: `kids-firefly-web` (fireflies + silk threads + chimes) vs.
  `kids-echo-drum` (exact echo + one added beat). Both are one-cycle builds. Preference?
- **Research sweep**: approve a full research cycle at 245 to refresh with June 2026
  findings? The IDEAS queue is healthy but the newest entries are 30+ cycles old.
