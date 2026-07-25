# 2578 · Goad

**The one question:** *What if you traded fours with an AI improviser that
PLANS several exchanges ahead — an adversary whose goal is to bank* tension *against you, forcing you to resolve what it leaves unresolved, using dissonance as
a weapon rather than trying to sound nice?*

Goad generalises the lab's turn-based counterpoint game (a 3-ply negamax AI over
a fixed cantus firmus) into free-phrase **trading fours**, driven by a continuous
**tension-field beam-search planner**.

## How it plays

- You and an AI alternate **4-bar phrases** (8 events each) over a continuously
  ringing **C-major drone** — the shared harmonic ground.
- On load a **seeded auto-demo** self-plays a whole dialogue (a synthetic human
  vs. the AI) with zero input, so the full call-and-response unfolds silently.
- Press **Trade fours** to take over. Play notes on the computer keyboard — one
  chromatic octave in piano layout: `a w s e d f t g y h u j k o l` →
  C4…D5. Deliberately chromatic, so you can reach for genuinely rough intervals.
- After your 8 notes commit, the AI plans and answers (you hear it). It tries to
  hand you a **cliff**; your job is to **resolve** it by moving stepwise back
  toward the drone's chord tones (C, E, G).
- **Play the exchange** sweeps a playhead across the whole dialogue with audio.
- A running scoreboard (*AI banked* vs. *You resolved*) and a one-line **verdict**
  tell you who controlled the tension.

## The tension scalar

Tension is a real, continuous number in `[0,1]` per event (`tension.ts`),
a weighted sum of three ingredients:

1. **Sensory dissonance / roughness.** Each melody note's first six harmonic
   partials are scored against the drone chord's partials with the
   **Sethares** partial-pair roughness function
   `d = a₁a₂(e^(−b₁sx) − e^(−b₂sx))`, the closed form of the
   **Plomp & Levelt (1965)** critical-band dissonance curve (max roughness near
   a quarter of the critical band, smooth at unison/octave/fifth). Because the
   drone actually rings, a tritone or minor 2nd genuinely **beats** — the
   roughness is audible, not notional.
2. **Voice-leading distance.** A saturating `|Δpitch|` leap term.
3. **Metric & harmonic expectation.** A per-pitch-class instability weight —
   leading tone (B), active 4th (F) and tritone (F♯) score high — amplified on
   strong beats. A tendency tone left on a phrase's final event adds a
   *held-over-the-barline* bonus: the **banked** cliff handed to the next player.

## The beam-search planner

On its turn the AI (`planner.ts`) runs a **beam search** over its own next
phrase: at each of the 8 steps it extends every surviving partial phrase by each
chromatic candidate pitch, then prunes back to the top **K = 10** by a heuristic
(cheap-to-carry so far, loud at the end). Each surviving complete phrase is then
scored by the adversarial objective:

```
value = 1.00·banked + 0.85·humanResidual − 0.34·meanInteriorTension
```

- **banked** — tension handed to you at the barline (maximise).
- **humanResidual** — the *lowest* tension your best resolution can reach,
  estimated by a greedy stepwise-descent model of the human (`bestResolutionResidual`).
  The AI prefers cliffs you **cannot** fully defuse, so it plans past its own
  phrase into your reply — a **≥2-exchange** lookahead. Judging a move by the
  opponent's best answer is exactly the sign-flipped lookahead of
  **Shannon (1950)**.
- **meanInteriorTension** — the tension the AI must carry itself (minimise): it
  stays in control and deploys dissonance as a *weapon*, not as flailing.

The chosen phrase yields a taunting intent readout (e.g. *"held the tritone over
the barline — resolve it or lose ground"*).

## Output — the tension landscape

The payload visual (`landscape-gl.ts`) is a hand-rolled **WebGL2** scrolling
landscape: the whole dialogue's tension scalar drawn as a filled mountain range,
height = tension, colour = the canonical violet→magenta ramp (hot magenta crests
= cliffs the AI banked; violet valleys = resolution), with a glowing crest line.
An **SVG overlay** aligns note markers, phrase boundaries, `YOU`/`AI` labels,
banked-cliff flags, the playhead and your live cursor to the same window. While
the playhead sweeps, the window slides so you watch the curve scroll.

## Determinism & degradation

- Hand-written **`mulberry32(0x2578)`** (`rng.ts`); **no** `Math.random`,
  `Date.now`, or `new Date()`. The auto-demo and every **New dialogue** replay
  bit-for-bit.
- No `AudioContext` (or a gesture-less demo): a `text-destructive` notice shows
  and the landscape keeps running.
- No **WebGL2**: an SVG fallback draws the same filled curve.
- Full teardown on unmount — oscillators stopped, drone stopped, `ctx.close()`,
  `cancelAnimationFrame`, WebGL context released via `WEBGL_lose_context`.

## Files

- `page.tsx` — client component: dialogue state machine, keyboard input,
  auto-demo, audio unlock, scoreboard/verdict, GL canvas + SVG overlay, design
  notes.
- `tension.ts` — the tension scalar: Sethares roughness, instability, banked
  cliff, resolution estimate, pitch naming.
- `planner.ts` — beam-search adversarial planner + synthetic human + intent text.
- `synth.ts` — Web Audio: continuous drone + two melody timbres (you vs. AI),
  free 12-TET, playhead-driven playback.
- `landscape-gl.ts` — WebGL2 scrolling tension landscape.
- `rng.ts` — deterministic mulberry32 + seed helpers.

## References

- **Plomp, R. & Levelt, W. J. M.** (1965). "Tonal Consonance and Critical
  Bandwidth." *JASA* 38(4). — the roughness/dissonance curve.
- **Sethares, W. A.** (1998/2005). *Tuning, Timbre, Spectrum, Scale.* — the
  closed-form partial-pair roughness summed over spectra used here.
- **Shannon, C. E.** (1950). "Programming a Computer for Playing Chess."
  *Philosophical Magazine* 41. — adversarial lookahead (score a move by the
  opponent's best reply).
- **Lewis, G. E.** *Voyager* (1987–). — foundational software that improvises
  *against/with* a human rather than to please, the ancestor of an adversarial
  co-improviser.
- **arXiv:2511.17879** — "Generative Adversarial Post-Training Mitigates Reward
  Hacking in Live Human–AI Music Interaction" (rev. May 2026). — modern framing
  of adversarial training in live human-AI musical interaction.

## Next-cycle deepening

- **Moving harmony.** Swap the static drone for a 2–4 chord loop so roughness is
  measured against *changes*; the AI could bank tension by anticipating the next
  chord (implied resolution).
- **Timbral roughness.** Let the AI reshape its own spectrum (partial
  amplitudes), not just pitch — Sethares roughness depends on spectrum, so it
  could weaponise timbre, not only interval.
- **Deeper lookahead / real negamax.** Replace the single greedy human model with
  a full alternating search (AI → human-resolver → AI) and iterative-deepening,
  reporting true ply and node counts.
- **Rubato & rhythm.** Give phrases variable rhythm and let *metric* suspension
  (holding across the barline in time, not just pitch) become a controllable
  tension axis.
- **Off-main-thread search** via an AudioWorklet/Worker so beam width can grow
  without dropping frames.
