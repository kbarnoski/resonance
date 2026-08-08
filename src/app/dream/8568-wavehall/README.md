# 8568-wavehall

**See a phrase travel the hall.** A top-down architectural cross-section of an
apsidal nave, rendered in raw WebGL2, where a cast phrase becomes a visible
acoustic wavefront that sweeps the plan, reflects off the walls, and — as the
front reaches the far side — fires an HRTF-spatialized tap so the sound audibly
*arrives* from that direction. A partner across the hall answers. Antiphonal
call-and-response: no shared clock, no unison, never locking.

## The one question
What if you could SEE a cast phrase travel a hall as an acoustic wavefront —
watch it sweep a top-down cross-section, reflect off the walls, and *hear* it
arrive from each surface as the front reaches it — while a partner answers from
across the hall, the two of you trading phrases the room carries between you?

## The mechanic
- **The hall.** A rectangular/apsidal nave in top-down plan: graphite ground,
  crisp wall line-work, two stalls — LEFT (warm amber, you) and RIGHT (cool teal,
  partner). Rendered entirely in a hand-written WebGL2 fragment shader
  (`gl.ts`): `getContext("webgl2")`, own vertex + fragment GLSL, compiled and
  linked by hand, full-screen triangle.
- **Casting.** `A S D F G H` each cast one pitch of an **equal-tempered**
  hexatonic set (minor pentatonic + octave over 12-TET — no just intonation, no
  drone). Build up to 6 notes; a pause ends and *sends* the phrase. Pointer /
  tap fallback maps horizontal position to a pitch.
- **The visible wavefront.** Each note emanates an expanding luminous ring from
  its stall. Walls reflect it by the **image-source method**: each wall mirrors
  the source and the reflected ring appears to radiate from that mirrored image
  (exact for a first-order bounce). Reflections fade in as the direct front
  reaches each wall. Multiple in-flight fronts overlap additively.
- **HRTF taps as the front arrives.** Every note fires Web Audio `PannerNode`s
  with `panningModel = "HRTF"`, each **DELAYED through a `DelayNode`** by its
  travel time (distance ÷ speed): the direct arrival at the listener (you, at the
  LEFT stall) plus four first-order wall reflections. You see the front hit a wall
  and hear the tap arrive from that direction at that instant — the room's impulse
  response made audible + visible. A bounded (<1.0) feedback delay gives the tail.
- **The answer.** The partner answers from the opposite stall in a contrasting
  timbre, its wavefront sweeping back. The reply is a **transform** of your call
  — transpose / retrograde / inversion / ornament — a genuine response, not an
  echo.
- **Co-presence.** `BroadcastChannel` sends the call as a note-list (control data,
  never audio); each device synthesizes + renders locally, so there is no shared
  clock. `#room=<id>` in the URL pairs two tabs. Degrades to solo + ghost if the
  channel is unavailable.
- **Never locks.** No unison, no phase-lock. The reward is watching + hearing
  phrases traverse the room.

## Self-demo
On load, zero permissions, a single tab: a deterministic seeded ghost
(`mulberry32(0x8568)`) periodically CALLS from one stall and ANSWERS from the
other, so the call → travel → arrive → answer arc reads silently on a muted
phone. Audio unlocks on the first gesture. A real second tab is detected via a
heartbeat and the ghost yields.

## Files
- `page.tsx` — client shell, simulation + conductor loop, input, HUD, notes modal.
- `gl.ts` — raw WebGL2 renderer: hall geometry, wavefront + image-source shader.
- `audio.ts` — HRTF tap engine, image-source arrival timing, feedback tail.
- `music.ts` — equal-tempered pitch set, seeded PRNG, answer transforms.
- `sync.ts` — BroadcastChannel transport + presence.

## Named references
- Image-source method / geometric room acoustics — the reflection model for both
  the visible rings and the audible arrivals.
- Whispering-gallery acoustics — sound carried across a hall by its surfaces.
- Giovanni Gabrieli / Venetian *cori spezzati* — spatial antiphony, choirs
  answering across a nave.
- Alvin Lucier, *I Am Sitting in a Room* — the room itself as the instrument /
  transfer function.
- Extends the lab's `7912-entrain-moire` co-presence lineage — recast from
  entrainment/lock to call-and-response with visible propagation.

## Honest gaps + next-cycle deepenings
- **First-order reflections only.** Image sources are computed to depth 1 (four
  walls). Second-order bounces and the apsidal focusing (a real whispering
  gallery) are drawn decoratively but not modelled acoustically. Next: recursive
  image sources + curved-wall foci.
- **Legibility over physics.** The front is a stylized ray/wavefront picture, not
  a PDE field — speed and ring width are tuned for readability, and audio arrival
  reuses the same geometric distances rather than a measured IR.
- **HRTF is listener-fixed.** The listener sits at the LEFT stall; a moveable
  listener (drag your position, re-spatialize live) would make the hall explorable.
- **Answer grammar is compact.** Four transforms with seeded selection; a longer
  memory (motivic development across several exchanges) would deepen the dialogue.
- **Transport is same-origin.** BroadcastChannel pairs tabs on one machine; a real
  WebRTC/websocket relay would let two rooms actually answer each other.
