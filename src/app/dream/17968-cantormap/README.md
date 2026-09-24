# 17968-cantormap

**Status**: wip

Two hands sculpt WHERE one of Karel's own piano recordings lives in a 3-D HRTF room around your head.

## The one question

What if your two hands could grab the voices of one of Karel's own piano
recordings and physically place, move, gather and scatter them around your head
in real 3-D space? The conducted musical parameter here is SPATIALIZATION —
position in a room — a parameter no prior lab piece has conducted.

## Interaction

- One real decoded take is split into four decorrelated band-voices of the SAME
  buffer: lowpass ~250 Hz, bandpass ~250–1500 Hz, bandpass ~1.5–5 kHz, and a
  highpass air band ~3.8 kHz. Each band feeds its own Web-Audio `PannerNode`
  with `panningModel = "HRTF"`, so every band has a genuine position around the
  listener's head.
- A slow, always-on rate-1.0 bed of the FULL take stays centred so sound is
  present before any hand is seen.
- Two tracked hands become two grab points. The nearest voices to a hand follow
  it: hand x → azimuth (left/right), hand height → elevation (Y), pinch
  (thumb–index distance) → pull the voice toward the listener (nearer + louder
  via panner Z + inverse distance model).
- Hands together → all voices GATHER to an intimate mono-ish centre. Hands wide
  and open → the field SCATTERS. No hand seen → the bed keeps playing while the
  voices drift on a clearly-labelled autonomous orbit (a demo state, never faked
  as live control).

## Output

Raw WebGL2 (no three.js): glowing amber-gold orbs — the voices — in a dark
volumetric field, with ping-pong feedback light-trails as they move, all driven
off `safeMaster.analyser`. Canvas2D top-down room view if WebGL2 is unavailable;
pointer-drag fallback if the camera or hand model is unavailable. Palette is warm
amber-gold on near-black. Every audio path terminates at the shared ear-safety
`safeMaster` bus — no oscillators, no synth, no generated tone, only Karel's real
recording through filters and panners.

## Mudra / canon lineage

Cantormap continues the lab's two-hand camera-conducting canon (15824-canon,
15760-conduct, 17344-resonantpair): the hands are a mudra pair whose spatial
relationship — proximity, spread, pinch — is the score. Where the canon pieces
conducted voice/ground, pitch or grain, Cantormap conducts pure PLACE: the hands
are cartographers mapping sound onto the room. Gather-to-centre and scatter-wide
are the mudra's two poles — collapse to intimacy, or expansion into the full
spherical field.

## References

- GestureSync (ACM MMSys 2026) — hand-gesture-driven spatial-audio placement and
  the latency budget for gesture → panner control.
- John Chowning — pioneering work on the perception and synthesis of moving
  sound sources in space; the ancestor of every azimuth/elevation/distance
  mapping used here.
