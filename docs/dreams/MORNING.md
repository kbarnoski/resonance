# Morning digest — last updated 2026-07-23 (cycle 879, DEEP)

> **Day 2 of your jury's "full week off altered-states."** #1 asked for *"a game, a genuinely useful tool, a joke, a piece about the outside world."* #2 asked me to *"kill the two-knobs-no-master template — allow a single expressive control."* So I built the lab's **first real game** — and it turns out the lab has never shipped one (grep-0× across ~880 routes: hundreds of "experiences," never a piece with a score, rounds, and win/lose). A game inherently wants one control + a goal — the exact anti-template.

Open the lab: https://getresonance.vercel.app/dream · **best on a laptop with sound on.**

## New since yesterday — `2396-ear-dial` (*Perfect Ear*)
**Ear training as an addictive game instead of a chore.**
The game plays a short run of soft tones **once**, then goes silent. You re-dial
each remembered pitch on one big knob — a preview tone tracks the dial so you
hunt by ear — and it scores you **to the cent**. Streak, best score, and it gets
harder each round (more notes, wider range, less time to listen).
→ https://getresonance.vercel.app/dream/2396-ear-dial
- **The lab's first game.** Real state machine, real scoring, win/lose — not a
  mood piece. Directly answers your "build a game" and "one control, one goal."
- **Made for your audience.** Resonance is a tool for pianists/composers; an
  ear-trainer is the most *useful* game for exactly them. Named refs: the
  "Dialed Sound Game" listen-first finding + Diana Deutsch on pitch memory.
- **The design is the listen/recall split** — you hear the sequence *once*; the
  dial is dead while it plays. That's what makes it memory, not needle-chasing.

## How this cycle ran
- **DEEP mode** — one concept ("your ear is the controller"), 3 parallel builders,
  3 different auditory skills. Shipped the pitch game. **2 banked in IDEAS §879:**
  - ⭐⭐ **`2398-echo-hunt`** — *find an invisible sound by ear.* A spatial hide-and-
    seek: a hidden beacon pings in 3D (HRTF) and you sweep an aim to catch it.
    Held back only because the binaural payoff needs headphones. **Next headphones cycle.**
  - ⭐ **`2400-back-beat`** — *Simon-says, but for groove.* Hear a drum phrase, play
    it back tighter each round, scored to the millisecond. A complete rhythm game.

## Open questions for you
- Do you want a small **suite of games** in this shell (interval / chord-quality /
  the spatial + rhythm ones already built), or was one game the point?
- A love-tap on `2396` and I'll add a **daily-challenge** mode (one shared puzzle
  a day) and let it grade you against yesterday.
- Two lanes the jury keeps flagging still need your go-ahead: the **AI-pipeline
  chain** (needs a FAL_KEY budget) and a **true two-device shared room** (WebRTC).

## Honest caveat
- Headless here (no speakers): whether the tones read as memorable and the
  cents-scoring feels fair is reasoned + build-verified only, not heard. All gates
  pass (ESLint + full compile-mode build, exit 0). The seeded auto-demo self-plays
  the whole listen→dial→score loop on load (visually — browsers won't start audio
  without a click), so it demos on any device the moment you press Start.
