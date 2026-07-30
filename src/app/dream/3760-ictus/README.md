# 3760 · Ictus

**Your whole body conducts the beat.** The moment a hand or foot strikes a
virtual surface places a downbeat on the bar grid; between strikes, your limb
positions continuously morph the timbre.

> An _ictus_ is the instant of a conductor's beat — the downstroke where the
> pulse actually lands.

## The one question it answers

What if the timing of your body's **contacts** — not a passive "energy → drone"
mirror — _were_ the instrument? Strikes must land **on** the beat: land on-grid
and the contact locks into a looping pattern that plays back; land off-grid and
it audibly flams/ghosts and is rejected.

## How to use

1. **Start the grid** — begins the 90-BPM metronome, the orbiting playhead, and
   a continuous pad. (Sound + motion immediately, as required.)
2. **Use my camera** — loads MediaPipe Pose. Strike downward with a hand or foot
   to place a contact. Land it on a grid slot and it _locks_ (clean hit +
   blooming post that pulses each loop); miss and it _flams_ (darker doubled
   hit + a red ghost that drifts off the ring).
3. **Between strikes**, move: lean your torso to open the filter, spread your
   arms to widen the chord voicing, raise your hands to lift the register.
4. **No camera / desktop review:** press **1 2 3 4** (or **f g h j**, or
   **space**) to strike the four limb voices against the same grid, and move the
   pointer to shape the pad; tapping the scene also strikes a zone-mapped limb.
   The full timing game — lock vs. flam, groove meter, looping playback — is
   playable with keyboard + pointer alone.

The **groove-lock meter** is the stakes readout: it rises as strikes land tight
(reward sharpest at the slot centre) and falls on flams and idle time. Above
60% the ring saturates to violet — "in the pocket."

## Technique — contact-aware metric placement

- **Strike detection** (`strike.ts`): each tracked limb's vertical velocity is
  smoothed; a strike fires on the **rising edge** of a downward-velocity spike
  crossing its virtual strike plane, with a refractory gap and re-arm so one
  physical strike is exactly one contact.
- **Quantisation** (`sequencer.ts`): a contact's bar-relative time is rounded to
  the nearest eighth-note slot of a fixed 90-BPM 4/4 grid. `|error| ≤ 100 ms` →
  **lock** into the loop store; otherwise **flam**.
- **Looping playback**: a monotonic slot cursor triggers every locked cell
  exactly once per pass — the one authoritative clock for both the audio voices
  and the visual pulse, so sound and light never drift.
- **Continuous control**: `computeTimbre()` maps torso lean → filter cutoff,
  arm spread → chord voicing width, hand height → register, applied to the pad
  every frame between strikes.

## Subsystems (6)

1. Camera capture (`getUserMedia` → hidden `<video>`)
2. MediaPipe Tasks-Vision **PoseLandmarker**, loaded from CDN at runtime
   (`poseLoader.ts`) — wrists + ankles
3. Strike detection — downward-velocity spikes crossing a plane (`strike.ts`)
4. Metric grid + loop store + groove meter (`sequencer.ts`)
5. Web Audio instrument — 4 synthesised strike voices (kick / snare / tom / hat),
   a body-shaped pad, and a metronome (`audio.ts`)
6. three.js scene — tilted bar-grid ring, slot posts, orbiting playhead,
   blooming per-limb markers, red ghosts, floating limb orbs (`scene.ts`)

## Named reference

Borrows the **bar-equivariant, contact-aware** motion→music idea from
**MotionBeat: Motion-Aligned Music Representation via Embodied Contrastive
Learning** (ICASSP 2026) — the insight that bodily _contacts_ are the natural
carriers of musical beat/downbeat, distinct from continuous motion. This
prototype does **not** implement their model; it borrows the
_contact-as-beat_ framing as an **interaction grammar**.

## Known limits

- The `pose_landmarker_lite` model tracks ankles reliably only when the feet are
  in frame — on a seated desktop webcam, hand strikes are the dependable input.
- Playback and quantisation are driven from `requestAnimationFrame` (~16 ms
  granularity) rather than Web Audio look-ahead scheduling; more than tight
  enough for a demo groove at 90 BPM, but not sample-accurate.
- Strike thresholds (`strike.ts`) are tuned for a brisk downward motion; very
  gentle taps may not register on camera. The keyboard/pointer fallback has no
  such ambiguity.
- Palette note: raw HSL colours appear only inside the WebGL art (violet arc);
  all UI chrome uses semantic tokens.
