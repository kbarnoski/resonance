# 9864 · Handroom

**The one question:** What if instead of _walking_ a room, you stood still and
**conducted** it — reached your bare hands into a binaural 3-D field and
physically grabbed, lifted, and placed the just-intonation voices around your
own head, sculpting the spatial chord with your hands?

This is the **CONDUCT IT** approach to an embodied binaural room. You don't
travel; the sound does — around you.

## How it works

- **Fixed listener.** The Web Audio `AudioListener` is pinned at the origin,
  facing −Z, up +Y. That's you: the head marker at the center of the canvas. You
  never move.
- **Six hand-grabbed HRTF voices.** A just-intonation / harmonic-series chord —
  ratios `1/1, 9/8, 5/4, 3/2, 5/3, 15/8` over a ~131 Hz fundamental (C3) — where
  each voice is a 2-op FM oscillator → per-voice lowpass → gain → its **own**
  `PannerNode` (`panningModel:"HRTF"`, `distanceModel:"inverse"`) placed on a
  sphere around your head. Moving a voice updates its panner position via
  `setTargetAtTime`, so it audibly travels around you.
- **Grab = pull + place.** Bring a hand near a voice and grab: it is pulled in
  close (smaller radius → the inverse distance model makes it **swell**), and
  your hand's screen position then places it in azimuth (around the head) and
  **height**.
- **Height → timbre.** A voice's `y` drives its per-voice lowpass cutoff (and a
  small gain lift): lift a voice and it literally **blooms** brighter. Let go and
  it springs home, and the chord re-voices.
- Everything sums through the shared ear-safety master (`createSafeMaster`, gain
  0.16).

## The input degrade ladder (all four tiers)

1. **MediaPipe Hands** (opt-in, behind "Start camera"). `@mediapipe/tasks-vision`
   `HandLandmarker`, dynamically imported from the jsDelivr CDN (WASM + model
   from the Google storage CDN), wrapped in try/catch. Landmark 9 / palm center
   = the hand cursor; thumb-tip ↔ index-tip distance = pinch → grab. Mirrored
   horizontally.
2. **Frame-diff blob fallback.** If MediaPipe fails to load, a webcam
   frame-difference bright-motion centroid becomes one "hand"; grab = dwell (hold
   still over a voice for ~0.4 s).
3. **Pointer fallback.** No camera → drag voices directly with pointer/touch
   (press-hold = grab).
4. **Seeded synthetic conductor (the muted-phone read).** On load, with no camera
   and no interaction, a deterministic `mulberry32(0x9864)` "ghost hand" grabs
   voices one at a time and orbits them around the head on a ~24 s loop, so the
   chord re-voices and the glyphs visibly swell / recede / brighten with **zero
   input**. The visual conducts from frame one; audio starts on the first user
   gesture. A slow orbit of the whole view keeps motion obvious even muted.

**Graceful degrade:** no `getUserMedia` → camera tiers are skipped with a
`text-destructive` note; pointer + auto-conductor still run. HRTF unsupported →
`panningModel:"equalpower"`. No `AudioContext` → the visual room runs silently.
Every CDN / model load is wrapped so a failure never breaks the page.
`prefers-reduced-motion` slows the orbit and conductor and softens the easing.

## Files

- `page.tsx` — React page, Canvas2D render loop, hand slots + grab integration,
  UI chrome, degrade orchestration.
- `field.ts` — 3-D source geometry, spherical placement, hand→target mapping, and
  the orbiting perspective 3-D→2-D projection.
- `audio.ts` — the Web Audio graph: fixed listener + six FM/HRTF panner voices,
  height→timbre, distance→loudness.
- `hands.ts` — the degrade ladder: MediaPipe loader, frame-diff tracker, seeded
  `Conductor`, camera feature-detect.
- `prng.ts` — `mulberry32(0x9864)`, the single deterministic source of all
  randomness/timing (no `Math.random` / `Date.now` / `new Date`).

## References

- Web Audio spatialization: `PannerNode` (HRTF) + a fixed `AudioListener` — the
  binaural-panning primitive this piece is built on.
- MediaPipe Hands / `@mediapipe/tasks-vision` `HandLandmarker` — the browser
  hand-tracking-instrument lineage of 2026.
- Spatial-sound-installation lineage: **Bernhard Leitner**'s _Ton-Räume_ (sound
  as sculpted architecture you stand inside) and **Maryanne Amacher**'s
  structure-borne, room-specific sound — the chord as a space you inhabit rather
  than a signal you face.

## Next-cycle deepening (multi-cycle commitment)

This is cycle 1 of the embodied-binaural-room line. Grafting the strongest ideas
from the two sibling approaches raced this fire (banked in IDEAS §1091):

- **Give the conducted room real walls (from `9848-shadowroom`, WALK IT).** Add a
  first-order image-source early-reflection layer (Allen & Berkley 1979) so a
  voice you place near a wall throws a delayed, air-absorbed HRTF reflection — the
  sculpture gains acoustic depth, not just direction. This is the one subsystem
  the CONDUCT approach lacks and the WALK sibling proved out.
- **Two hands + a body (from `9880-poseroom`, POSE IT).** Let both hands grab
  independently (bimanual chord voicing), and optionally use torso lean to walk
  the fixed listener slightly — fusing "conduct the sources" with "move yourself,"
  so you can both sculpt and step through the sound.
- **Persist a voicing.** Save the sculpted spatial chord (positions + heights) to
  `localStorage` so you can return to a room you shaped — the installation/Tauri
  path where Karel stands at a camera + headphones and keeps a favorite voicing.

**Status**: demoable
