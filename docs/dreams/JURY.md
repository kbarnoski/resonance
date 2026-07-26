# Concept Jury Verdict — 2026-07-26

## Summary
The lab did the hard thing again: yesterday's verdict said *drop the keyboard,
kill the AI bandmate, extend the long-form and multi-user seams* — and this
window **actually did all four**. The QWERTY rut aged out (8× → 2×), zero new
"AI you jam with" pieces shipped, `2912-ensemble` is the first-ever multi-user
piece, and `2672-somnus` is a real second long-form-memory piece. Genuinely
responsive. **But the lab escaped one monoculture straight into another:** *7 of
the last 15 pieces are "take a named scientific system — orbital resonance,
chaos, Faraday waves, space weather, thermohaline collapse, active nematics,
emission spectra — map it continuously to pitch, draw the diagram as the score,
and let it play itself while you watch."* The AI bandmate you jammed with became
a science-fair exhibit you observe. Ambition is still absurdly high (0
local-minimum builds, 11 at 4–5/5); the problem, again, is not ambition — it's
that everything now converges on the same *kind*.

## Diversity audit
- Over-represented input: **input-free / self-playing** (6×: 2656, 2672, 2712, 2728, 2816, 2848) — the keyboard rut is gone, but half the window has *no human hand on it at all*. Input-free is the new keyboard. (Real-sensor inputs are otherwise healthily spread: tilt 2×, mic 2×, camera 2×, network 1×.)
- Over-represented output: **Canvas2D** (6×: 2688, 2728, 2744, 2768, 2808, 2848), with **SVG** right behind (5×: 2626, 2656, 2672, 2712, 2912). Note the reversal — the 07-25 jury *celebrated* "Canvas2D dropped to 2×, the ban worked"; one window later it's the single most-used output. WebGL2 sits at 4× (2664, 2816, 2864, 2888).
- Over-represented technique: **sonification of a named scientific / physical / dynamical system, continuous pitch, diagram-as-score** (7×: 2688 orbital, 2712 spectra, 2728 logistic map, 2768 Faraday PDE, 2816 space weather, 2848 thermohaline tipping, 2888 active nematic). Additive/partial-bank voicing is the near-universal synth under it (≥6×).
- Over-represented vibe: **clinical / scientific "lab readout" — the live-diagram-as-score aesthetic** (5×: 2626, 2712, 2728, 2744, 2848). It's the visual signature of the technique rut: a named system + a live telemetry panel + a playhead.
- **BANNED for next cycle:** the "sonify a named scientific/physical/dynamical system" technique (physics sim / chaos map / dynamical system / real-data feed alike — the well is over-pumped this window) · **input-free self-playing as the default posture** (a human must be able to change the outcome moment-to-moment) · the clinical diagram-as-score readout vibe · AND **still do not re-add the JI/pentatonic safety net** — continuous pitch stays; that win is protected.

## Ambition floor stats (last 15 prototypes)
Criteria: (1) novel technique · (2) ≥3 subsystems · (3) named reference · (4) multi-cycle · (5) research <14d.
- **Hit 0–1 criteria — the local-minimum builds:** **0.** Third window running with none. The floor mandate is permanently internalised.
- **Hit 2–3 criteria:** 4 — `2626-tritave`, `2688-orrery`, `2712-emberline`, `2728-bifurcation` (the textbook-system pack; competent, but each is predictable *from the template alone*).
- **Hit 4–5 criteria — the ones to extend:** 11 — `2656-loom` (**5/5**), `2664-quantum`, `2672-somnus`, `2744-musaic-room`, `2768-faraday`, `2808-palimpsest`, `2816-heliograph`, `2848-overturning` (**5/5**), `2864-stillpoint`, `2888-mesolife`, `2912-ensemble`.

Distribution holds versus 07-25 (0 / 4 / 11 both windows). The floor is not the
lever anymore. **The lever is *kind*, not *quality*** — eleven excellent builds
that all sonify a physical system are still a monoculture. Every ship needs a new
critic, and the sharp one this window is aimed at a subtle trap: **killing the
just-intonation safety net was supposed to buy expressive *danger* — pitch with
something at stake. But coupling free continuous pitch to a slow physical
parameter just produces a gliding drone. The pitch is "free," yet nothing is at
risk, because no human is choosing it.** Danger requires an agent who can be
wrong. Seven of these pieces removed the safety net and then removed the player
too.

## Standouts (positive)
- `2672-somnus` — **the genuine second long-form-MEMORY piece** the last jury begged for (after `2656-loom`), and it's not a knockoff: a night's sleep architecture (Wake→N1→N2→N3→REM ×5) that *consolidates its own motifs* — admits by day, replays-and-strengthens in slow-wave, splices dreams in REM, forgets the weak — so a motif born at 23:00 recapitulates at dawn recognisable-but-drifted. It *earns* its 8 minutes with real neuroscience (Wilson & McNaughton, Diekelmann & Born) rather than a fade. The rarest lane in the lab now has three members. **Extend THIS.**
- `2912-ensemble` — **the first-ever multi-user piece**, closing the single most-named gap in five weeks of juries (#4, standing). The load-bearing idea is right: *control events, not audio* — broadcast "pluck at x," re-synthesise Karplus–Strong locally, so it's serverless, low-latency, and self-demoable solo via a seeded ghost + a BroadcastChannel two-tab loopback. Grounded in Chafe/SoundWIRE. A human plays it, and a *second* human can too — the opposite of the window's watch-a-simulation drift.
- `2848-overturning` — the best-executed of the science-sonification pack, and the one that transcends the template: a real bistable Stommel two-box model with a genuine **fold catastrophe and hysteresis**, whose live **early-warning signals** (rising variance, lag-1 autocorrelation → 1, critical slowing down) *drive the sound you hear* — so the collapse is a phase transition you can hear coming, not a scripted swell. Structure you perceive, not a readout you decode.
- `2888-mesolife` — the science-sonification piece that's a genuine *visual* invention, not a diagram: a self-stirring active nematic on the GPU (ping-pong field, ±½ topological defects that swim and spin) rendered as real **crossed-polarizer birefringence optics** — oil-film iridescence, not a telemetry panel. First active-nematic substrate in the lab.
- Honorable: `2656-loom` (5/5, carried from last window) remains the reference for the memory lane `2672` now joins.

## Pruning candidates (concept-level, NOT for deletion — immutability rule still holds)
- `2712-emberline` + `2728-bifurcation` — the two most *predictable* pieces in the window. Both are "sonify the textbook": emission spectra → additive chord, logistic map → pitch. The craft and the numerics are clean, the named references (Balmer/Rydberg; Robert May 1976) are real — but you could have written the one-line spec from the technique menu without seeing the build. This is the local minimum of the *new* rut: correct, cited, and inevitable.
- `2688-orrery` — third body in the same pack; orbital-resonance-as-interval is a lovely mapping, but it's the template with a tilt sensor bolted on, and the "hear the moons lock" payoff is a slow glide, not a decision.
- The pack as a whole (`2688`/`2712`/`2728`/`2768`/`2816`/`2848`/`2888`) is *excellent craft on one idea*. Keep `2848` and `2888` as the peaks; the middle ones are diminishing returns on "map a named system to a drone."

## Provocations for tomorrow's dream cycle
1. **Moratorium on science-sonification.** Seven "sonify a named physical/mathematical/data system, continuous pitch, diagram-as-score" pieces in one window is a rut, not a seam. Ban the whole *kind* for a week — physics sim, dynamical system, chaos map, and real-world-data-feed sonification alike. If the pitch of a piece is a readout of a slow parameter and no human choice sits between the parameter and the note, reject it.
2. **Put a hand back on the instrument.** 6/15 self-play with no human input — input-free is the new keyboard. Next cycle a human must be able to *change the outcome moment-to-moment*: not "watch a simulation evolve," but "play something and be responsible for it." The banked **`2920-follow`** (a reactive accompanist that follows *your* singing via online-DTW — a human performing, not a simulation observed) is the single most product-relevant thing waiting. Ship it.
3. **Canvas2D quietly tripled (2× → 6×) and is now the top output.** Not a ban — it's a fine tool — but the last jury's win reversed in one window, which means bans decay fast. Watch it, and prefer the output the *piece* needs, not the one that's easy to draw a diagram in.
4. **AI-pipeline chains are STILL at zero — now the FOURTH jury in a row.** music→image→video, lyric→cover-art→loop (fal.ai / replicate, both untouched). It spends Karel's FAL_KEY budget, so it needs his **explicit go-ahead + a per-run cap**. Karel — this is the single most novel unbuilt thing in the lab and it has been deferred four juries running. One word unblocks it.
5. **Extend the two peaks — memory and multi-user — not the textbook.** `2672-somnus`/`2656-loom` (a piece that *remembers* and is different at minute 8 than second 0) and `2912-ensemble` (two humans, one field) are the seams with real headroom. `2912`'s cross-device WebRTC tier is still unverified from here (no second device) — a next cycle could add the QR-SDP handshake helper so the real network path self-demos, and `2928-seaboard` (banked MPE instrument) is a human-hands-on companion to provocation #2.

## Karel-facing line
The lab did exactly what you asked — dropped the keyboard, killed the AI bandmate, built the multi-user and memory pieces — and then walked into a science-fair rut: 7 of 15 now sonify a textbook system and play themselves while you watch; the two real peaks (`2672-somnus`'s dreaming memory, `2912-ensemble`'s serverless duet) are humans and memory, not simulations — so tomorrow, put a hand back on the instrument and stop sonifying the textbook.
