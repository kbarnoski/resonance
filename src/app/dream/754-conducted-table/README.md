# 754 · The Conducted Table

**The one question:** *What if Karel's real piano recording became a long-form
CONDUCTED ENSEMBLE you direct from a top-down "score table" — and friends could
fill the empty chairs from their own phones?*

A bright, warm, top-down conductor's score table rendered in **Canvas2D**. A
semicircle of ~6 glowing ensemble seats faces a conductor position. Each seat
replays PHRASE-fragments of Karel's actual playing; when a seat sounds, an arc
ripples out from the conductor to the seat and the seat blooms.

## How to play

1. **Begin.** (Creates/resumes the AudioContext inside a user gesture — iOS
   safe.) The ghost ensemble starts performing immediately — the piece is ALIVE
   and SOUNDING with zero further interaction.
2. **Conduct the mixer.** Tap any seat (on the canvas *or* its chip) to bring
   that voice IN or OUT. ON seats glow warm with a solid ring; OUT seats go grey
   and dashed.
3. **Shape the music.** Drag the **Tempo** slider (ensemble pulse) and the
   **Dynamics** slider (loudness + density). Your input *biases* the slowly
   evolving arc — it never resets it.
4. **Invite a friend (optional).** "Invite a player" → "Create invite link" →
   share the link. The guest opens it, accepts the seat, and sends their answer
   code back; paste it to connect. Each connected player drives one seat live
   (shown in blue / "LIVE"). The conductor is the host hub; 3+ players are just
   one peer connection per seat.

## Long-form, stateful (5+ minutes of evolution, not a loop)

The look-ahead scheduler (Chris Wilson, *"A Tale of Two Clocks"*) schedules
phrase triggers slightly into the future on the audio clock for steady timing.
On top of that runs a memory-driven arc:

- the **harmonic center** slowly migrates (slow sines + drift), retuning the
  open-fifth drone and biasing which (brightness-sorted) phrases seats choose;
- **density breathes** over ~90s cycles, gating how often seats sound;
- even untouched seats **drift** their phrase choices, register and subdivision
  over minutes.

Minute 5 sounds different from minute 0. Conductor input biases the arc.

## Phrases, not grains

Cycle-1's grain resynthesis is **banned this cycle**. Instead `audio.ts`
segments the decoded buffer into musical PHRASES by **onset/silence detection**:
RMS energy is scanned in ~20ms windows; a phrase starts when energy rises after
a quiet gap and ends after ~250ms of quiet. Phrases are kept at ~0.6–3s; each
seat plays ONE whole phrase via `AudioBufferSourceNode` with a register shift
(`playbackRate`) and a short attack/release envelope. This is a phrase-remix of
his real playing.

## Audio chain

`per-seat GainNode → master GainNode (≤0.3) → BiquadFilter lowpass (≤7500 Hz) →
DynamicsCompressor (threshold −10, ratio 20:1) → destination`, plus a soft
open-fifth root drone for warmth.

## Graceful degradation

- Fetch fails → a ~16s detuned-arpeggio fallback buffer is synthesized offline
  (with rests, so segmentation still finds phrases) and a `text-rose-300` notice
  appears. Never silent.
- WebRTC / CompressionStream unsupported → invite UI hidden, solo only.
- Full teardown on unmount: stops all sources + drones, cancels rAF and the
  lookahead interval, closes all peer connections, closes the AudioContext.

## Solo vs multiplayer

Fully demoable solo — the ghost ensemble performs the whole long-form piece on
one device. Networking is purely additive: a remote player simply takes over a
seat, replacing its ghost performer with their live note-events. Because both
peers hold the identical recording, only `{seat, phrase, vel, t}` events travel.

## References

- Cycle-1: **729-piano-portal-jam** (the 2-player WebRTC note-event duet whose
  networking core this extends to a star / conductor-hub topology).
- Networked-ensemble lineage: **The Hub / League of Automatic Music Composers**;
  **JackTrip**; AES, *"Web-Based Networked Music Performances via WebRTC: A
  Low-Latency PCM Audio Solution."*
- **"A Design Space for Live Music Agents"** (arXiv 2602.05064, Feb 2026) — the
  conductor-biases-an-autonomous-arc model sits in its "human steers, agents
  perform" region.

## Next-cycle deepening

- Per-seat phrase *gesture* recording (a guest records their own short phrases
  into their chair).
- A visible "score scrubber" showing the harmonic-center migration over the
  whole arc, draggable to fast-forward the form.
- Seat-to-seat call-and-response rules so the ensemble develops counterpoint,
  not just density.
