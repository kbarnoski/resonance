# 655 · Breath Sanctuary

> **The one question:** What if Resonance could be experienced with your **eyes
> closed** — a ceremonial sound-space you steer with your **breath alone**?

This is the lab's deliberately rare **audio-first, eyes-closed** piece. The
screen is almost empty by design — a single faint breathing halo. The experience
is the **sound** and the **body**, not the display. Close your eyes, put on
headphones, and breathe slowly into the microphone.

Route: `/dream/655-breath-sanctuary`

---

## How it works

### Input — breath via the microphone (amplitude only)

`getUserMedia({ audio })` → `MediaStreamSource` → lowpass (~1.2 kHz, keeps the
breath band) → `AnalyserNode`. There is **no pitch detection**. Each frame we
compute a time-domain **RMS**, then run a slow **attack / slower-release
envelope follower** so the output tracks the slow swell (inhale) and ebb
(exhale/rest) of breathing. Floor and ceiling adapt to the room so quiet and
loud spaces both work.

A **breath cycle** is a rising-then-falling envelope: when the envelope turns
over above a threshold we fire a **peak** (top of inhale → strike a bowl); when
it returns near rest we count one **cycle**. Cycle count drives the ritual arc.

The mic stream goes **only** to the analyser — it is never connected to any
output, so there is **no feedback / howl risk** even on speakers.

**Graceful degradation:** if mic permission is denied or unavailable, a
`text-rose-300` notice appears and an **autonomous breath LFO** (~5.5 s/breath,
asymmetric: quicker rise, long fall) drives the exact same parameters — so the
piece **always plays**, never a dead page.

### Sound — just-intonation overtone choir + struck singing bowls

- **Overtone choir (additive drone).** Stacked sine partials at **pure
  just-intonation ratios** over a low fundamental — `1, 9/8, 5/4, 4/3, 3/2, 5/3,
  15/8, 2` — so the intervals are **beat-free**. Each partial has its own very
  slow amplitude LFO, so the choir **shimmers and breathes** instead of sitting
  as a dead chord. Breath energy swells loudness and opens a lowpass for
  **brightness**; upper partials are gated by the arc's "openness" so voices
  literally **enter** as the ritual deepens.
- **Singing-bowl resonators (struck modal tones).** A damped resonant model: a
  few **inharmonic** partials per bowl (slightly stretched ratios, not pure
  harmonics) with **long exponential decay** (~5.5–12 s). Struck at the top of
  each breath; during the rest they ring out into a long feedback-delay tail.
  Three bowl sets rotate across the arc. Bowl voices are self-cleaning
  (`onended` disconnects the nodes).

### Ear-safe master chain

`choir + bowl buses → master gain (≤ 0.5) → DynamicsCompressorNode →
destination`. The master fades in over ~5 s and is hard-capped; the delay
feedback stays < 0.8 so the tail is long but stable.

### Ritual arc — stateful over ~5+ minutes (NOT a loop)

Four phases, each advanced once **enough breaths AND enough time** have passed,
so minute 5 is genuinely different from minute 1. State is carried, not looped:

| Phase | Fundamental | Overtones | Bowls | Tail | Hue |
|-------|-------------|-----------|-------|------|-----|
| **Gathering** | C2 (65.4 Hz) | sparse | A | short | violet |
| **Invocation** | C2 | opening | B | medium | indigo |
| **Presence** | down a fourth | wide | C | long | blue |
| **Release** | **down a fifth** (≈43.6 Hz) | full | A | longest | cyan |

Across the arc the **fundamental drifts down a fifth**, **more overtones
enter**, the **bowl set changes**, the **reverb/delay tail lengthens**, and the
halo's **hue drifts** slowly. The arc responds to the breathing — phases need a
breath count to advance, not just a clock.

### Visual — minimal, audio-first (SVG, no WebGL)

A single faint SVG halo + inner glow. Radius and opacity follow the breath
envelope (expands on inhale, contracts on exhale); the stroke hue drifts with
the phase. Plus sparse, readable text: the **phase name**, a gentle
**instruction**, and a **breath / time** counter. Everything else is dark — the
point is to look away from the screen.

---

## Controls

- **Begin · breathe** — creates the `AudioContext` and requests the mic *inside*
  the gesture (iOS-safe), then close your eyes and breathe into the mic.
- **Idle auto-demo** — if nobody presses Begin within ~2.5 s, the sanctuary
  starts in autonomous-breath mode so a silent glance still **hears** the drone
  breathing and **sees** the halo pulse, with zero hardware.

---

## Named references

- **Pauline Oliveros — *Deep Listening* / *Sonic Meditations*** — breath-based,
  body-centered, eyes-closed listening practice. The direct lineage for this
  piece.
- **La Monte Young / Theatre of Eternal Music** — just-intonation sustained
  drone.
- **Tibetan singing bowls** — struck inharmonic modal resonators with long
  decay.
- **Google DeepMind Lyria RealTime / "Live Music Models" (2026)** — the
  continuous, live-steered, never-landing stream paradigm; here the steering
  control is the **breath**.

---

## Known limits

- Browser autoplay policy: the **idle auto-demo** creates the context without a
  gesture, so audio may stay suspended until the first interaction (the visual
  still animates; the drone unlocks on first click/tap). Pressing **Begin**
  always unlocks immediately.
- The breath detector is amplitude-based: very loud rooms, fans, or speech can
  read as "breath." Headphones + a quiet space give the cleanest steering.
- Autonomous fallback is intentionally generic — it breathes for you rather than
  with you; allow the mic for true breath steering.
- No persistence: the ritual restarts fresh each visit (by design — it's a
  continuous stream, not a recording).
