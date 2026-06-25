# Shake the Critters! 🫨

**Route:** `/dream/935-kids-shake-critters`

Tags: `INPUT=devicemotion-shake · OUTPUT=three.js-GPU · TECHNIQUE=PhISEM-stochastic-shaker + shake-rhythm-loop · VIBE=bright-playful-critter-band`

## What it is

A shake-driven toy for a 4-year-old. Shake the iPad like a rattle and a little
band of glowing, gummy jelly-creatures comes alive — squashing, jiggling, and
puffing sparkles in bold primary colors on a warm, bright, daylight sky. The
harder you shake, the denser and brighter the rattle gets. When you pause, the
critters keep grooving: the rhythm you just shook is caught into a loop and
played back, so a warm stomp-and-shaker groove accretes as you play.

It is **timbre + rhythm, never pitch melody.** There are no chimes, no notes to
get "right," no wrong moves. You sculpt *texture and groove*, not a tune — the
deliberate opposite of a calm pentatonic lullaby.

## How a kid plays it

- Press the big **Shake me!** button.
- Shake the device (or drag a finger / mouse anywhere) — rattle blooms instantly.
- Shake harder → more critters jiggle, more sparkles, a brighter rattle (never
  louder — kids-safe).
- Stop shaking → your rhythm is **caught** and the critters keep grooving it.
- Shake again → another loop layers on (up to 3; oldest drops). A 🧹 button
  clears the groove.
- Leave it alone → it gently auto-plays itself so it's never silent or still.

No reading is required: colors, characters, and motion carry all the meaning.
There are **no fail states** — there is nothing to miss, only texture to make.

## Input model

- **Primary — devicemotion shake.** Shake energy is computed from
  `event.acceleration` (falling back to `accelerationIncludingGravity` minus a
  gravity baseline): the acceleration magnitude plus its rate-of-change (jerk),
  smoothed. On iOS, the Start gesture calls `DeviceMotionEvent.requestPermission()`
  before subscribing.
- **Fallback (always works).** No sensor / permission denied / desktop → a
  pointer or touch **drag** acts as the shake; drag speed maps to shake energy.
  The piece plays fully by mouse-swiping on a plain desktop browser.
- **Idle auto-demo.** After ~3s with no input, a gentle low-energy auto-shake
  kicks in so a glancing reviewer sees and hears it grooving within a moment of
  pressing Start, with no device motion at all.

## The PhISEM audio model

The rattle is synthesized in the Web Audio API with **PhISEM-style stochastic
shaker synthesis** (no audio files, no audio libs). A shaker is modeled as N
virtual beans in a gourd: each animation frame a running "sound-level" reservoir
is bumped by shake energy and decays exponentially, driving a per-frame
**collision probability**. Each collision is a very short filtered-noise grain —
white noise through a resonant bandpass tuned to the shaker's shell resonance
(~1.7–6 kHz) with a few-millisecond exponential decay — and summing many grains
produces the characteristic rattle. Shake energy maps to **collision rate and
resonance brightness**, never to loudness: harder shaking makes *more and
brighter* grains, not a louder sound. Three distinct voices (a soft maraca, a
woody cabasa, a bright shaker) plus a low **stomp** thud on hard onsets make the
critters sound like a small band, over an always-on **warm drone pad** so the
app is never silent.

> Citation: **Perry Cook, *Physically Informed Stochastic Event Modeling
> (PhISEM)*, ICMC/CMJ 1997 — stochastic particle-collision shaker synthesis.**

A **kids-safe master chain** is mandatory: master-gain ceiling well below
clipping → lowpass ~6 kHz → soft limiter/compressor. No sudden loud transients,
no high ringing — safe for a sleeping toddler in the next room.

## The loop-capture groove

A rolling ~3.2-second buffer continuously samples the shake-energy envelope.
When the child stops shaking, that window is frozen into a **loop** the critters
re-trigger on repeat — the PhISEM voices fire from the captured envelope, so a
groove keeps playing back. Repeated shaking stacks layered loops (capped at 3,
oldest drops) so a warm rhythm builds up additively rather than getting
cluttered.

## How it differs from a pentatonic chime toy

A pentatonic chime toy gives you *pitches* arranged so any tap sounds "nice" —
the music is in the notes. This piece has **no melody and no pitch to play**: a
single warm drone holds underneath while everything you control is **timbre**
(rattle density + brightness) and **rhythm** (the groove you shake and loop).
Music comes from texture and time, not pitch.

## Visual

three.js on the GPU: five blobby icosphere critters with a custom
vertex-displacement shader (layered noise) so they look soft and jelly-like.
They squash, stretch, and jiggle with shake energy; collisions puff colored
sparkle particles off them; a soft rim-glow / tonemap gives a bloom-like feel.
The palette is bright, saturated, daylight-playful — each critter its own bold
primary color on a warm bright sky. If WebGL is unavailable, a friendly fallback
notice shows and the audio still plays.

## Research note

RESEARCH §548 (2026): PhISEM remains the foundational real-time shaker model;
modern 2026 granular/particle-synthesis plugins descend from it — chosen as the
lab's first shake-driven stochastic-shaker instrument, music from texture+rhythm
not pitch.
