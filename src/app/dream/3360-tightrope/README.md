# 3360 · Tightrope

**The question:** _What if every note you played had to keep a tightrope walker from falling?_

A melodic instrument played on the computer keyboard, rendered as a real 3‑D
three.js scene, where **harmonic tension has physical consequences.** A stylised
walker balances on a wire strung across a dark circus space. You play notes; each
note is measured against the sounding key, and its **tension** becomes a lateral
force on his balance. A well‑chosen note steadies him and strides him toward the
far platform. A run of jarring, out‑of‑key notes topples him — the music collapses
to silence and you restart. The wrong note is genuinely punished: this is a
_decision_ instrument, and the decision can be wrong.

## Interaction

- **Input — computer keyboard.** A tracker/piano layout across two QWERTY rows.
  Lower row is a full chromatic octave (white keys `Z X C V B N M`, sharps on
  `S D G H J`); upper row is the octave above (`Q W E R T Y U`, sharps `2 3 5 6 7`).
  Every chromatic pitch is reachable, so dissonance — and danger — is always one
  keypress away.
- **Goal.** Cross the wire. Keep the tension low and musical and the walker
  advances; the HUD shows distance to safety and a live balance meter.
- **Stakes.** Gravity and a trickle of noise constantly threaten him (an inverted
  pendulum — the further he leans, the harder gravity pulls). Only your notes hold
  him up. Reach for the tritone (`G` = F♯3, or `5` = F♯4) a few times and he goes
  over.

## The tension model — after Lerdahl

The tension function is inspired by **Fred Lerdahl, _Tonal Pitch Space_ (2001)**,
which quantifies harmonic and melodic tension as _distance_ in a structured pitch
space. We don't implement the full model; we fold three of its ingredients into a
single scalar tension ∈ [0, 1] per note, against a fixed key (C major) whose tonic
sounds as a drone (`harmony.ts`):

1. **Region distance** — how far the note's pitch‑class sits from the tonic on the
   circle of fifths (tonic near, tritone at the far edge).
2. **Chord‑tone status** — tonic‑triad tone (home) vs. diatonic colour tone vs.
   out‑of‑key chromatic note.
3. **Melodic‑leap dissonance** — the interval class of the step from the previous
   note (semitone and tritone jar; fifth and third are smooth).

`tension = 0.62 · harmonic + 0.38 · melodic`, clamped to [0, 1].

## Tension → balance mapping (`physics.ts`)

The walker is an inverted‑pendulum balance: a lean angle and its angular velocity,
decoupled from rendering so the same stakes run against the 2‑D fallback meter.

- **Low tension → a steady hand.** Pulls the lean back toward centre, bleeds off
  angular velocity, and advances progress along the wire.
- **High tension → a shove.** Adds angular velocity in the note's lateral
  direction (sharp‑side notes push right, flat‑side left) and stalls or reverses
  progress.
- **Fall.** If `|lean|` exceeds ~34°, he falls: a downward audio collapse gesture,
  then silence, and a restart.

## Audio (`synth.ts`, Web Audio)

Fully synthesized. A low tonic drone (C + G) sounds the key so tension is
_audible_, not just theoretical. Each keypress plucks a clean two‑partial tone with
a fast decay envelope through a light feedback‑delay space; dissonant notes are
voiced brighter and slightly sourer. As the walker wobbles, a detune LFO swells on
the drone. When he falls, the drone bends down and collapses.

## Visuals (`scene.ts`, three.js — real geometry, not a shader)

An actual 3‑D scene: a wire along the depth axis from a near start platform to a
far (glowing) safety platform; a walker built from primitives (torso, head, legs,
and a long balance pole) that leans visibly and recedes into the distance as he
progresses; a single circus spotlight that tracks him; and an **instanced** audience
of ~180 pillars lining the wire that lean in and pulse when he wobbles. The wire
shimmers from cool grey toward hot pink with tension. Minimal lighting, dark and
restrained. If WebGL is unavailable the scene degrades to a styled 2‑D balance
meter and the instrument keeps playing.

## Files

- `page.tsx` — orchestration, HUD, keyboard instrument, 2‑D fallback.
- `harmony.ts` — the Lerdahl‑inspired tension model + keyboard→pitch map.
- `physics.ts` — the inverted‑pendulum balance and progress.
- `synth.ts` — Web Audio drone, plucks, wobble swell, collapse.
- `scene.ts` — the three.js circus.

## Reference

Fred Lerdahl, _Tonal Pitch Space_. Oxford University Press, 2001 — the source of
the tension‑as‑distance idea driving the balance.
