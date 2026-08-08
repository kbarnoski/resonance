# 8440-duetmind

**A live improvising partner that shows you its plan a beat before it plays it.**

## The one question

What if Resonance had a live improvising *partner* — an agent you **play with**, that
visibly shows you what it is about to play a beat before it plays it, then answers your
phrase in real time (trading fours, developing your motifs)?

Most of the lab makes instruments you play *at*, or generative beds you listen *to*.
This one is a co-performer: a second musician sitting across the table who is listening,
deciding, and — crucially — letting you see the decision before you hear it.

## How the agent works

It is a **local symbolic improviser**: no network, no model, no LLM. Plain TypeScript.

1. **Motif buffer** — the engine keeps your recent notes. The timeline is cut into
   4-beat turns that alternate YOU / AGENT (trading fours). Just before an agent turn,
   it snapshots the notes you played in your last turn.
2. **Transforms** — on its turn the agent picks (via a seeded weighted choice) one of:
   *answer* (transpose to a consonant interval, keep the rhythm), *melodic inversion*
   (mirror around your first pitch), *retrograde* (reverse in time), *augmentation* /
   *diminution* (stretch or compress the rhythm, the latter with a transposed echo), or
   a *weighted-Markov development* seeded by the intervals in your own phrase. Everything
   is snapped to 12-TET C major so the counter-line stays consonant. If you fall silent,
   it develops its own last phrase and keeps the conversation alive — and when there is
   nothing to react to at all, it *initiates*.
3. **Committed plan** — each turn is scheduled `planLead` (~1.15 beats) *before* it
   sounds. The agent's notes are therefore born into the future.
4. **Anticipation display** — those future agent notes are drawn ahead of the NOW line
   as translucent dashed amber outlines. That is the whole point: you can read its plan
   and answer it before it speaks.
5. **Play** — as time advances, each note crosses the NOW line, turns solid, and sounds.

Clock: `performance.now()` is the master (it drives the visuals and needs no audio
permission). Audio schedule times are derived as `ctx.currentTime + (noteTime − now)`,
so the demo animates immediately and the sound locks in the moment you enable it.

## The references this closes

- **ReaLJam** (CHI 2026) — real-time human–AI music jamming where the agent maintains a
  near-term *plan* and displays its upcoming notes to the human via a waterfall so the two
  can anticipate each other. The waterfall + committed-plan idea is lifted straight from
  here.
- **George Lewis, *Voyager*** (1987) — the canonical improvising-computer *partner*, a
  co-performer with its own agency rather than accompaniment. DuetMind's stance — it
  answers, it develops, it occasionally initiates — is the Voyager posture in miniature.

## The tag choices (and why they dodge the house style)

- **Input:** the computer keyboard as a melodic instrument — the home row `A S D F G H J K`
  is a C-major octave, the row above `Q W E R T Y U I` is the octave up. On-screen tappable
  keys cover touch / mobile.
- **Output:** an inline-SVG waterfall piano-roll — a typography/diagram register, not a
  particle cloud. Two lanes (agent above, you below), time scrolling right-to-left toward
  NOW, with the agent's planned-but-unsounded notes as ghost outlines.
- **Technique:** the local symbolic agent above — motif buffer → transform → committed
  plan → ghosts → play.
- **Palette:** a high-contrast **blueprint** — near-black indigo ground, cyan ink for YOU,
  amber ink for the agent. Deliberately **not** the lab's usual violet cosmic look; the two
  contrasting inks are what let you read the two voices apart at a glance.
- **Tuning:** **12-tone equal temperament** (deliberately not the just intonation the lab
  overuses). Two distinct simple synth voices — a triangle mallet for you, a 2:1 FM voice
  for the agent. **No drone bed:** silence between phrases is real and good.

## Constraints honored

- Audio-visual and self-contained in this folder. `"use client"` on line 1.
- Self-demo: a seeded `mulberry32` PRNG drives a deterministic auto-performer that plays
  both parts on load, so a muted glance shows a living duet within ~2 seconds. The instant
  you press a real key, control is handed to you.
- Degrades gracefully: visuals run without audio; if `AudioContext` fails, an on-brand
  notice shows and the score keeps moving. Honors `prefers-reduced-motion` (slower scroll,
  no flashes).
- Full teardown on unmount: rAF cancelled, listeners removed, `AudioContext` closed.

## What I'd do next cycle

- Let the agent *interrupt* mid-turn when you play something surprising, instead of only
  reacting on turn boundaries — the plan would visibly rewrite itself.
- A "density / register" dial so you can steer how busy or how high the partner plays.
- Voice-lead the answer transform against your actual last pitch (true two-part counterpoint
  rules) rather than snap-to-scale, and let augmentation carry a canon at a fixed delay.
- A subtle metronomic pulse cue on the NOW line for players who want a shared beat.
