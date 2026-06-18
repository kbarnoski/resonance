# 719 — Kids Stomp Zoo

**The one question:** *What if a kid could make a whole parade of googly creatures jump by STOMPING their feet in front of the camera?*

A laugh-first, off-glass audio-visual toy for a 4-year-old on an iPad or phone. The front camera watches the room. When the child **jumps and STAMPS their feet**, a parade of six bold googly creatures squashes then launches into the air in a Mexican-wave ripple, dust puffs fly, the screen shakes, a warm flash pops, and a friendly comical **tuba BONK** fires. The more they stomp, the groovier the marching bassline walks. No chords, no tension-and-resolution — just a silly marching-band **GROOVE**.

## How to use

1. Tap **▶ STOMP!** (this starts audio + asks for the camera, all in one tap — needed for iOS).
2. Stand back so the camera can see your **feet and legs**.
3. **Jump and stomp!** Each stomp launches the parade and bonks the tuba.
4. Keep stomping to walk the groovy bassline. About every 20 seconds there's a quick **freeze-dance** moment (the bed drops out, the creatures freeze with a ❄, then it kicks back in) — a giggle beat.

No reading required. No wrong moves — "no wrong, only different." If the camera is unavailable or denied, a **ghost auto-stomper** keeps the parade bonking on a groovy rhythm so the page is always alive, and a friendly rose notice invites you to stomp along anyway.

## How it works

- **Input (off-glass):** `getUserMedia({ video: { facingMode: "user" } })`. Each frame is drawn to a tiny 64×48 offscreen canvas and compared to the previous frame (frame-difference). Motion energy is measured **only in the lower ~45% band** (feet/legs). A sharp **rise** above an adaptive baseline, past a forgiving threshold, = a stomp onset, with a ~180 ms refractory period so one stomp = one bonk.
- **Output (Canvas2D):** six saturated googly creatures do a squash-then-launch gravity arc, staggered into a ripple across the parade. Dust puffs on landing, screen-shake and a warm flash on each bonk.
- **Audio (Web Audio API):** the BONK is a filtered sawtooth + sine sub (warm round tuba honk), cycling a low marching bassline through `[55, 49, 62, 44, 58]` Hz so repeated stomps walk a groovy bass figure — rhythm, not a cadence. An always-on gentle oom-pah + shaker bed keeps it from ever being silent.
- **Safety chain:** master gain ≤ 0.3 → lowpass ≤ 7000 Hz → DynamicsCompressor (threshold −10, ratio 20) → destination. No sudden loud or high-pitched transients.
- **On-device only:** nothing is recorded or transmitted; no network calls. Full teardown stops audio nodes, cancels the animation frame, stops the camera tracks, and removes listeners on unmount.

## Named reference

**BodyBeats** — research into whole-body musical interfaces for children, mapping movement qualities to sound via **Rudolf Laban's Theory of Effort**. Also informed by **VTech's Toy Fair 2026** "your movement is the controller" thesis: the body, not the touchscreen, drives the play.

## Tags

`webcam whole-body STOMP/JUMP input (off-glass)` · `Canvas2D parade output` · `lower-frame-band frame-difference motion-onset → percussion` · `silly marching-parade vibe`
