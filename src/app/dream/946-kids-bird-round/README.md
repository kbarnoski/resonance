# Bird Round — design notes

**Status**: demoable

Drag a glowing bird up and down a dawn treetop to sing a little tune, let go, and a whole flock sings it back as a round.

## How it works

1. **Drag → melody capture.** The child drags the bird; vertical position is pitch (up = high), the horizontal sweep is time. Pointer/touch moves are recorded as a `time → pitch` array (`DragSample[]`), and the bird chirps the snapped pitch live under the finger.
2. **Quantize + snap.** On release, the drag is folded onto a small step grid (8 steps over 4 beats) and each slot's pitch is snapped to a **C-major pentatonic** scale (`makeMelodyFromDrag`). Empty slots hold the previous note so the contour reads as a continuous song. Short/empty drags fall back to a pleasant default tune.
3. **Shared-clock canon scheduler.** A single Web-Audio look-ahead clock (`makeScheduler`) anchors one loop start time. Every bird is a voice reading the SAME melody at a fixed time offset (one beat per added voice) — a real **round / canon**. Because all voices share one scale and one tempo grid, the time-offset copies stack into harmonious counterpoint.
4. **Chirp synth.** A bright friendly bird whistle: triangle+sine blend with a quick upward pitch-glide attack, light vibrato, and a short bell/pluck envelope (`runChirp`). A quiet tonic+fifth pad sits underneath.
5. **WebGL2 renderer.** Hand-written raw GLSL (no three.js): warm-gold dawn sky, a leafy canopy silhouette, and additive glowing birds with light-trails whose bodies pulse when they sing. Birds bob to the pitch they're singing.

## Safe sound

Master chain is `gain (ceiling 0.26) → lowpass (~7 kHz) → DynamicsCompressor → destination`. Adding birds does NOT get louder — the master gain is normalized by `1/√voices`. AudioContext is created and resumed only after the Start gesture, and fully torn down (close context + cancel rAF + clear scheduler interval) on unmount.

## Kids design

iPad/mobile first, no reading required to play: big icon Start (▶️), big "add a bird" button (🐦➕, ≥72px) and reset (🔄). Dragging chirps instantly; releasing instantly starts the loop. If idle ~2s after Start, it auto-sings a default melody and adds a second bird so a hands-off glance hears a little round within ~1–2s; any touch takes over.

## Named references

- **The musical round / canon** ("Row, Row, Row Your Boat") — one melody, time-offset copies made harmonious by a shared scale + tempo. Reich-style phasing is the adult cousin.
- **Melodic contour is the most salient melodic feature for young children** — so capturing the up/down contour the child drags and singing it back is developmentally age-true.
- **Electroplankton / Toshio Iwai** — the playful "place creatures, they sing" lineage.

## Graceful degradation

- No WebGL2 → Canvas2D renders the same dawn-treetop scene with additive glowing birds.
- No AudioContext → the visual scene still runs; the Start gate still proceeds.

## Ambition

Hits criterion #2 (≥3 distinct subsystems: drag-to-melody capture/quantizer + shared-clock canon scheduler + chirp synth + WebGL2 renderer) and criterion #3 (named references: round/canon, melodic-contour developmental finding, Electroplankton/Iwai).
