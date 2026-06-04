# 313 · Kids Tone Tower

**For**: kids (4+)

A growing melody you echo by tapping — and every note you remember **stacks a glowing block onto a tower that grows taller and stays**. Get a note wrong and the top block wobbles and slides off (gentle, never game-over). The consequence of memory is made physical: **the tower IS the song the child remembered.**

## The one question

> What if a ~4-year-old echoed a growing melody and each correct note STACKED a glowing block onto a tower that grows taller and PERSISTS — while a wrong note makes the top block wobble and slide off (gentle, visible consequence, no punishment) — so the consequence of memory is made physical?

This deliberately breaks the lab's over-represented "Canvas2D creature + colored pads" kids form. The consequence here is **spatial / architectural**, not a creature's reaction: right answers BUILD something tall and persistent; wrong answers cost a block the child can rebuild. It is a memory + consequence piece — what the child does persists and grows, and they can make something wrong and fix it.

## How it works

1. Tap **Build it taller ▲** (this resumes/creates the AudioContext and starts a soft pad so it's never silent). A 2-block tower is already standing.
2. The **tower sings its song**: the standing blocks light up bottom→top, each playing its note. This self-demos on Start with no further input.
3. A clear **your turn** cue appears (a pulsing green base + 👆 — no text gating).
4. **Echo the song** by tapping the 4 big colored note-tiles along the bottom (color = pitch). Each tile plays its note immediately on tap (<50 ms).
   - **Correct note** → the matching block lights with a soft landing thud-chime.
   - **Finish the whole song** → a celebratory shimmer rises up the tower, a rising arpeggio plays every block, and the song **grows by one note**: a new glowing block drops and settles on top. The tower is now one taller and persists.
   - **Wrong note** → the top block **wobbles and topples off** with a soft descending "aw" tone (gentle, NOT a buzzer, NOT game-over). The song shrinks by one and is re-sung from the bottom so the child retries. The tower never topples below the starting **2 blocks**.
5. **Generous**: after 2 wrong taps in a round, the tower re-sings its song **slower** so the child can follow. Never a dead end.

The tower is the persistent record of how far the child's memory reached — taller and different at minute 3 than at second 5.

## No reading required

Every affordance is color, shape, icon, and animation. The note-tiles are color-coded to pitch, the "your turn" cue is a pulsing green base plus a pointing finger, and the consequence (a block stacking or toppling) is purely visual + audible. The only text is for the supervising grown-up.

## Scale (and why)

**G-major hexachord** — G A B C D E (G3 = 196.00, A3 = 220.00, B3 = 246.94, C4 = 261.63, D4 = 293.66, E4 = 329.63 Hz). The 4 playable tiles are assigned **G A B D** — a clean, consonant subset chosen to be **deliberately NOT C-major-pentatonic** (banned this cycle). When the song grows, the appended note is drawn **only from the 4 playable tiles** so the child can always echo the note they're given (never an unreachable C or E). The full hexachord is kept as the harmonic backdrop (the pad voices the G/D open fifth).

## Audio

- **Always-safe chain**: every voice → modest master gain (0.5) → **DynamicsCompressor brick-wall limiter** (threshold −10 dB, ratio 20:1, 3 ms attack) → destination, with a parallel synthesized **convolver reverb** (a decaying filtered-noise impulse generated in code — no audio files). The limiter + modest gain keep dense stacking safe for small ears; nothing startles.
- **Warm mallet/marimba voices**: a sine fundamental plus a brighter triangle octave partial with a fast decay (the mallet "edge"), shaped with short percussive envelopes via `setTargetAtTime`.
- **Landing** = the note plus a soft low thump. **Topple** = a single triangle sliding 330→160 Hz (a gentle "aw"), never a buzzer.
- A **soft always-on pad** (a quiet G/D open-fifth drone with a slow vibrato LFO) fades in on Start so the piece never feels broken or silent between turns.

## Named references

- **Simon** (Milton Bradley, 1978) — the growing-sequence call-and-response memory game. The "tower sings, you echo, the sequence grows by one" loop is Simon's, re-bodied as physical stacking.
- **Classic stacking / Jenga / block-tower toys** — the construction metaphor: blocks accumulate into something tall and persistent, and a wrong move costs the top block.
- **JMIR Serious Games (2026)** — game-based, process-oriented music learning beats single-minded pass/fail evaluation in children. This is the pedagogy behind making "wrong" cost a block but **never end the game** — the child always retries, and the tower always rebuilds.

## Tags

- **INPUT**: touch (a row of 4 big colored note-tiles at the bottom, each ≥96px).
- **OUTPUT**: Canvas2D tower-stacking scene — glowing stacked blocks, a growing tower, gentle physics wobble/settle/topple. Not a creature-with-pads, not a full-screen WebGL shader.
- **CORE TECHNIQUE**: echo-the-sequence memory + match detection mapped to block-stacking with persistent growth.
- **VIBE**: warm, constructive, calm "build it taller".

## How it breaks the form

The lab's recent kids prototypes lean on a **creature that reacts** to colored pads. Here the feedback loop is **architectural**: the child's memory literally builds a structure that persists across turns and grows taller over minutes, and a mistake is a **physical, reversible cost** (a block falls; you rebuild it) rather than a creature frown or a no-fail noodle. The tower at minute 3 is a visible record of how far the child's memory reached.

## Files

- `page.tsx` — the route: React client component, game state machine (demo → your-turn → celebrate), the touch tiles, and the Canvas2D render loop.
- `audio.ts` — `ToneTowerAudio`: the always-safe Web Audio engine (mallet voices, landing/topple sounds, pad, reverb, limiter) + the scale/tile/color definitions.
- `tower.ts` — `TowerScene`: the Canvas2D tower-stacking scene and its small block-physics model (settle, gravity, topple, sway, shimmer).

## Unverified surface (honest note)

**Build-verified, not browser-verified.** The code is TypeScript-clean and ESLint-clean and compiles in the Next.js production build, but it has **not** been run in a real browser here. Specifically unverified:

- Exact audio latency on a real device (<50 ms tap-to-sound is the intent, not measured).
- That the gravity-settle / topple physics *feel* right at 60 fps on a phone (tuned by eye, not playtested).
- AudioContext autoplay/resume behavior across iOS Safari / Android Chrome (resume is done inside the Start gesture, which is correct, but untested here).
- The synthesized convolver reverb's loudness balance on real speakers (gain set conservatively).

If Web Audio is unavailable, a `text-rose-300` notice appears and **the tower still builds and animates silently** — the visuals stay alive for a quick phone review.
