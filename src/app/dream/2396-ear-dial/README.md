# 2396 · Perfect Ear

A listen-first pitch-memory **game**. The one question: what if training your
ear were an addictive daily game instead of a chore?

## The idea

Most ear-training tools let you nudge a control while the target tone is still
playing. That is not a memory test — it is chasing the needle. Perfect Ear
enforces a hard split:

- **LISTEN** — the game plays a short sequence of 2–4 soft tones (more in later
  rounds). You cannot touch anything, and you hear the sequence exactly once.
- **RECALL** — silence. You re-dial each remembered pitch with **one** large
  draggable knob. A preview tone tracks the dial so you hunt by ear, then you
  lock each note. Accuracy is scored in **cents**.

That strict listen-then-act separation is the whole design. One expressive
control (the dial) with a clear goal — not two free-floating variables.

## How to play

1. Press **Listen · start round 1** (this also unlocks audio — browsers only
   allow sound after a user gesture).
2. Hear the sequence. Hands off.
3. In recall, **drag the dial** or use **← →** (hold **Shift** for coarse
   ±25¢ steps, otherwise ±5¢). The center readout shows your current note and
   frequency.
4. **Lock** each note with the button or **Enter / Space**.
5. Read your per-note cents error and round score, keep your streak alive, then
   **Next round** — more notes, wider range, less listen time.

Scoring: within 15¢ scores a perfect 100; the score falls linearly to 0 at
160¢ off. A round average ≥ 60 extends your streak.

## Design finding + reference

- **Listen-first / "Dialed Sound Game"** (dev.to, 2026): separating the listen
  and guess phases is what turns a knob-twiddling toy into a genuine skill test.
- **Diana Deutsch**'s research on pitch memory: short-term memory for pitch is
  strikingly fragile and easily disrupted, which is exactly why re-dialing a
  tone seconds after it stops is hard — and satisfying to get right.

## Tech notes

- **Audio:** Web Audio API. Listen tones are scheduled sine (early rounds) /
  triangle (later) oscillators with soft attack/release envelopes. Recall uses
  a single continuous triangle preview oscillator whose frequency follows the
  dial, gated to fade in only while you are actively dialing.
- **Visuals:** Canvas2D. A dark console panel, sequence dots, a 270° dial with
  ticks and needle, and a score view that reveals the true targets (green) next
  to your locked marks (violet).
- **Scoring:** dial position maps log-linearly to MIDI across the round's range;
  error in cents = |dialMidi − targetMidi| × 100.
- **Determinism:** a seeded **mulberry32** PRNG (seed `0x2396`) generates every
  sequence, so runs are identical. A seeded **auto-demo** self-plays one round
  (listen → auto-dial with a realistic near-miss → score → next) after ~2s idle,
  so a silent glance shows the full loop. Real input takes over instantly. No
  `Math.random` / `Date` are used; animation timing is `performance.now()`.
- **Teardown:** on unmount all oscillators are stopped, the preview is torn
  down, `requestAnimationFrame` is cancelled, timers cleared, and the
  `AudioContext` is closed.

## How it degrades

- **No user interaction (silent review):** the auto-demo runs the full loop
  visually. Audio stays silent because no `AudioContext` is created without a
  gesture — the visible game still tells the whole story.
- **No Web Audio support:** all audio calls are guarded and no-op; the visual
  game and scoring still work.
- **Reduced viewport:** the canvas is responsive; the dial scales to the shorter
  dimension.
