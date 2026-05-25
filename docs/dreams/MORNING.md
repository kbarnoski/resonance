# Morning digest — last updated 2026-05-25 UTC (Cycle 174)

## New since yesterday

- **[/dream/147-kids-beat-pulse](/dream/147-kids-beat-pulse)** — Beat Pulse (kids) · *Cycle 174* · `demoable` ⭐
  Open it: a large circle pulses at 70 BPM. Tap anywhere to play along — sparks fly.
  Tap *with* the flash → 20 sparks + burst from center. Tap off-beat → 9 sparks. No score.
  Colors cycle C3→E3→G3→A3→C4 (pentatonic); note name flashes inside the circle on each beat.
  BPM +/− at the bottom (40–120). **"First kids prototype about tapping with a beat."**
  Every prior kids prototype rewards any tap. This one rewards *when* — via a sparkle gradient,
  not a scoreboard. A 3yo chases sparks; a 5yo chases the beat. Zero permissions. Zero API.

- **[/dream/135-kids-wheel-song](/dream/135-kids-wheel-song)** — Wheel Song polish · *Cycle 174*
  Note-name flash finally landed after 14 kids cycles of deferral (~12 lines). When a segment
  strikes the golden striker, "C3" / "E3" / etc. appears above it for 600ms at 75% opacity.
  Gently educational without being didactic.

- **[/dream/146-eco-bloom](/dream/146-eco-bloom)** — Eco Bloom · *Cycle 173* · `demoable`
  Three L-system trees grow from canvas seeds over ~45s, each branch plucking a Karplus-Strong
  tone. Three-voice pentatonic polyphony. Rain toggle. Birds toggle (appears after ~18s of growth).
  **"The first prototype where patient growth is the entire point."**

## In progress / partial

Nothing in-progress.

## Research findings worth a look

**§206 — Refik Anadol DATALAND: Machine Dreams: Rainforest** — opens June 20, 2026 (26 days).
Direct inspiration for eco-bloom and 143-kids-seed-song. Worth the trip to LA.

**§207 — CHI 2026 6DoF gesture mixing** → `spatial-palette` queued for Cycle 175 (adult).
Draggable synthesis voices on canvas: X=pan, Y=pitch, scroll=filter+reverb. Chord label.
Route: `/dream/148-spatial-palette` (147 is now kids-beat-pulse).

## Open questions for Karel

- **beat-pulse timing window**: ±154ms at 70 BPM feels right. Too forgiving at 120 BPM
  (same absolute ms, but proportionally ±30% of the beat). Should the window scale
  proportionally (e.g. always ±18% of beat duration regardless of BPM)?
- **wheel-song note names**: the current flash shows the note name for 600ms at 75% opacity.
  Is this the right educational intensity — or should it be even subtler (smaller text, shorter)?
- **spatial-palette route**: 147 is kids-beat-pulse, so spatial-palette moves to 148.
  Confirming this is the right next adult build (Cycle 175), or any redirects?
- **eco-bloom mic mode**: ready to land any cycle — bass energy → tree growth rate acceleration.
  Worth the next adult cycle or hold for a stronger new build?
