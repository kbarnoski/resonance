# 319 · Hub Score

**Every open browser tab is one sustained voice in a single, server-less,
slowly-breathing just-intonation ensemble — and any tab can take the baton to
conduct the whole room's harmony.**

This is the lab's first networked / multi-instance piece. There is no server and
no clock-sync handshake: the **wall clock itself is the conductor's baton**.

## How to play

1. Open `/dream/319-hub-score` and press **▶ Start / Join the room**. You are
   now one voice, holding one chord-tone of a D-rooted drone. Two gentle
   "ghost" voices already hold the chord so a single tab sounds full.
2. **Open the same URL in a second (and third) tab.** Each new tab joins the
   ensemble as another sustained voice. They all breathe together — watch the
   lanes swell and ebb in lock-step.
3. Tap a **degree** (1/1, 9/8, 6/5 …) to choose which chord-tone *you* sing.
   Your tone snaps to the nearest active chord-tone.
4. Press **Take the baton** to become the conductor. Now `◀ chord / chord ▶`
   steps the shared field through a slow modal progression, and
   brighter/darker, denser/sparser, oct ± reshape the whole room. Every tab
   glides to match. Last tab to take the baton wins.

## The wall-clock-as-baton idea

`globalPhase(Date.now())` is a *pure function* returning a 0..1 phase over a
~30-second cycle. Every same-origin tab that evaluates it at the same instant
gets the same value, so all voices breathe on one synchronized swell with **zero
networking for timing**. The BroadcastChannel only carries *what* to play
(roster, chosen tones, the harmony field, the baton claim) — never *when*. The
shared clock is the ensemble's silent metronome.

## Subsystems

- **`sync.ts`** — the just-intonation set, the chord progression, the wall-clock
  phase + breathing envelope, identity/hue, and the BroadcastChannel message
  protocol (`hello` / `welcome` / `voice` / `field` / `conductor` / `heartbeat`
  / `leave`) with a pruned live roster.
- **`audio.ts`** — the continuous drone ensemble: each voice is an additive
  stack (fundamental + 3 quiet partials) → per-voice lowpass (brightness) →
  breathing-LFO gain (driven by the wall-clock phase) → shared synthesized
  convolver reverb → master brick-wall limiter. All changes glide via
  `setTargetAtTime` (no clicks).
- **`score.ts`** — the Canvas2D living graphic score: a horizontal time-river,
  one lane per player on its JI degree line, the lane's band breathing with its
  live gain; a vertical sweep line marks the wall-clock phase (the visible
  baton); your lane glows, the conductor's carries a caret.
- **`page.tsx`** — wires identity, the BroadcastChannel roster, conductor role,
  ghost voices, the render/breath loop, and the touch UI.

## The just-intonation set

Pure ratios over a **D root** (D3 ≈ 146.832 Hz) — D-Dorian colour realized as
just intonation. Deliberately **not** C-major-pentatonic:

| degree | 1/1 | 9/8 | 6/5 | 4/3 | 3/2 | 8/5 | 9/5 | 2/1 |
|--------|-----|-----|-----|-----|-----|-----|-----|-----|
| ratio  | 1   | 1.125 | 1.2 | 1.333 | 1.5 | 1.6 | 1.8 | 2 |

The conductor steps a small progression of chords (subsets of these degrees):
`{1,6/5,3/2}` (D-minor), `{9/8,4/3,8/5}`, `{1,4/3,9/5}` (quartal),
`{6/5,3/2,2}`, `{1,6/5,8/5}` (Dorian-6 glow).

## References / lineage

- **The Hub** (John Bischoff, Tim Perkis, et al., 1980s) — networked-computer
  band where machines share state over a bus rather than a score.
- **The League of Automatic Music Composers** (1978) — the Hub's predecessor,
  microcomputers listening to and nudging each other.
- **La Monte Young, *Dream House*** — sustained just-intonation tones held
  indefinitely; this is a breathing, distributed Dream House.
- **Ryoji Ikeda** — the clinical visual restraint: thin lines, precise marks,
  a near-black field, sparse accent colour.

## Constraints honored

Audio-visual only · no npm deps · no API route · pure client BroadcastChannel +
Web Audio + Canvas2D. Degrades gracefully: fully playable solo (with ghosts); an
amber notice if BroadcastChannel is missing; audio survives a missing 2D context.

## What's unverified

- The exact dates/membership attributions for The Hub and the League are from
  memory and not re-checked against sources.
- Cross-tab behavior was reasoned through, not load-tested with many
  simultaneous tabs; roster pruning at ~5s and last-writer-wins for the baton
  are simple heuristics, not a consensus protocol.
- `BroadcastChannel` is same-origin and typically same-browser-profile only — it
  will not bridge two different devices or browsers; "the room" is one machine's
  tabs.
- Wall-clock sync assumes tabs share a system clock (true for one machine); it
  does not correct for clock skew across devices.
