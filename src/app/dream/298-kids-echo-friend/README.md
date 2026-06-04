# Kids Echo Friend — `/dream/298-kids-echo-friend`

> "What if a kid could SING a little phrase and a friendly creature LISTENED,
> SANG IT BACK, and slowly remembered all the phrases to build a song together?"

A fully-client-side, hands-free, 4-year-old-oriented call-and-response prototype.
The child sings → the creature listens → the creature sings back → it remembers
everything → after a few rounds, it plays a growing little song made of all the
remembered phrases.

**Status: demoable**

---

## How to Use

1. Open `/dream/298-kids-echo-friend` on any modern browser.
2. Tap **"Sing to me ✨"** (≥64px tap target) — this opens the mic and starts the
   audio engine in one gesture (required for AudioContext on iOS Safari).
3. **Sing any short phrase** (2–8 seconds). The creature glows, changes colour,
   and grows with your pitch.
4. **Stop singing** — after ~0.9 s of silence the creature sings your phrase
   back in its warm synth voice, and a glowing orb appears around it to mark the
   memory.
5. Keep singing more phrases. Every third phrase triggers an automatic **"full
   song"** moment where all remembered phrases play in sequence.
6. There is no timer, no score, no fail state. Everything is positive.

---

## Subsystems

### `pitch.ts` — YIN-style monophonic pitch detection
- Implements normalized autocorrelation (NSDF) on the time-domain PCM buffer.
- RMS gate prevents noise from triggering false detections.
- Parabolic interpolation gives sub-sample precision.
- `snapToDorian(hz)` quantizes any detected pitch to the nearest **D-Dorian**
  note (D E F G A B C) across 4 octaves, using log2 distance for perceptual
  evenness. Never atonal.
- `pitchToT(hz)` maps a D-Dorian pitch to 0–1 for visual use.

### `echo-audio.ts` — Audio engine
- `makeAudioEngine()` — creates AudioContext, a **DynamicsCompressor** limiter
  at the output (threshold −18 dB, ratio 8:1) so the creature can never get
  harsh or loud, and an idle **D-drone** (D2+D3 sine oscillators, gain 0.06)
  so the screen is never silent.
- `playCreatureNote()` — warm sine+triangle blend → lowpass filter → short
  feedback delay (130 ms, feedback 0.22) for warmth.
- `schedulePhrase()` — schedules a list of `{hz, duration}` notes starting at
  a given AudioContext time; slight overlap for legato feel.
- `scheduleFullSong()` — schedules all remembered phrases in sequence with
  small inter-phrase gaps.
- `duckDrone()` — gently dips the idle drone while the creature sings back.

### `creature-gl.ts` — WebGL2 shader creature
- Full-screen quad with a hand-written GLSL fragment shader (no three.js, no
  Canvas2D).
- Creature body: SDF blob with two-layer fbm domain warping for organic jiggle.
- Uniforms driven per-frame: `u_pitch` (0–1), `u_singing`, `u_singback`,
  `u_phrases` (memory orb count), `u_amplitude`.
- **Colour palette**: low pitch → warm violet/amber, high pitch → teal/lime.
  Matches the D-Dorian feel of the audio.
- **Memory orbs**: `u_phrases` orbs orbit the creature at increasing angular
  positions, each tinted a different hue.
- **Aurora background**: fbm-based drifting ribbons in violet/teal.
- **Eye dots**: two soft circle SDFs, fade out when the creature is excited.
- `startCreature(canvas)` returns null if WebGL2 is unavailable (caller shows
  a `text-rose-300` notice).

### `page.tsx` — React component
- `"use client"` — all logic runs in the browser.
- `handleStart()` — user-gesture handler that creates AudioContext, requests
  mic (`getUserMedia({audio:true, echoCancellation:false, ...})`), wires the
  mic source to an AnalyserNode (analysis-only — never connected to
  `destination`, never recorded or uploaded).
- `runLoop()` — `requestAnimationFrame` loop that:
  1. Reads time-domain data from the AnalyserNode (or generates demo notes).
  2. Runs `detectPitch()` on the raw PCM buffer.
  3. Drives the phrase state machine (collecting notes → silence detection →
     trigger echo → update memory).
  4. Smooths visual uniforms and pushes them to the shader each frame.
- **`showNotes` toggle** — corner button reveals an in-page design notes panel.

---

## Graceful Degradation

| Condition | Behaviour |
|-----------|-----------|
| Mic permission denied / `getUserMedia` unavailable | Falls back to **auto-demo mode**: a hand-authored sequence of 6 cute D-Dorian phrases drives the *exact same* pitch→creature→echo→memory pipeline on a loop. A `text-rose-300` notice explains what happened. Audio and visuals still run. |
| WebGL2 unavailable | `startCreature()` returns null; a `text-rose-300` notice is shown; audio pipeline still works. |
| iOS Safari | `AudioContext` is created inside `handleStart` (the click handler). `resumeAudio()` calls `ctx.resume()` immediately after creation. |
| No audio at all | Graceful no-op; UI remains visible. |

---

## Scale & Palette

The prototype uses **D-Dorian**: D E F G A B C — a mode with a raised 6th
that feels bright and gently adventurous without the darkness of natural minor.
All detected pitches are quantized to the nearest D-Dorian note via `snapToDorian()`,
so even off-key singing sounds musical.

Visual colour mapping:
- Low D (D2–D3): warm violet / amber
- Mid range (E3–A3): amber / gold → teal
- High D (D4–D5): bright teal / lime

---

## References

- **SingingSDS** (arXiv:2511.20972, Nov 2025) — "a singing-capable dialogue
  system where a character responds by SINGING rather than speaking." This
  prototype is the fully-client, no-AI, kid-sized embodiment of that
  call-and-response-by-singing idea.
- **Pauline Oliveros, *Deep Listening*** — the tradition of listening deeply
  and responding, practised as a meditative musical act.
- **Call-and-response / "Simon" memory game** — the pedagogical pattern of
  echoing back what you hear, building memory and attention span.
- Chris Wilson's classic Web Audio autocorrelation pitch detection demo
  (the NSDF approach used in `pitch.ts`).
- McLeod & Wyvill (2005) — "A Smarter Way to Find Pitch" (NSDF/YIN foundations).
