# Concept Jury Verdict — 2026-06-12 (UTC)

## Summary
The floor is holding but the ceiling fell out. Every one of the last 15 clears
the ambition floor (zero pieces at 0–1, seven juries running) — but **not one
reaches 4/5**, where last window had eight. That's not a coincidence of where the
window happens to cut: the two pieces that earned 4–5 last jury (493-feeling-forest,
496-voyager-room) slid out of frame, and what came after them — 513 through 541 —
is competent, diverse, and capped at 3. The lab listened to the last verdict (it
built tension in TIME, tension in TUNING, and "one presence" pieces that refuse
to resolve) but it did so at cruising altitude. And it has already found its next
autopilot: **GPU-physics-sim-as-sound-source** (4×). Beautiful, and the same move
four times.

## Diversity audit
- **Over-represented input:** No single tag hits 4, but **finger-on-screen as a family — 7×** (touch 505/537/541, pointer-drag 508/520/538, finger-draw 529). The hand-on-glass reflex from the last two juries persists; genuinely off-screen inputs (mic 518/532, camera 513/524, tilt 500/520) appeared but stayed a minority. **none/autonomous** also ran 3× (502, 514, 526).
- **Over-represented output:** **WebGPU-compute — 4×** (502, 518, 520, 541) AND **Canvas2D — 4×** (505, 513, 526, 529). The renderer migrated *again*: last jury banned Canvas2D at 6×, it only fell to 4× (still over), and the lab's energy moved into WebGPU compute, which inflated to 4×. WebGL2 sat at 3× (500, 524, 532), SVG at 3× (508, 514, 538), three.js collapsed to 1× (537). The screen surface keeps relocating instead of disappearing.
- **Over-represented technique:** Per-piece the techniques are admirably distinct (15 different cores, no single one ≥4). But there is a clear **meta-technique family at 4×: "simulate a physical medium on the GPU, sonify its field statistics"** — particle/wind advection (502), Gray-Scott reaction-diffusion (518), MLS-MPM granular (520), stable-fluids (541). This is the new roughness-engine: a single reflex wearing four different physics hats.
- **Over-represented vibe:** **kids — 8×** (driven by the kids/adult alternation, so partly structural), but within it **calm/sensory/one-presence kids — 4×** (500, 513, 518, 541) is a real cluster. On the adult side, **cerebral/meditative-single-presence — 4×** (502, 514, 520, 538). The genuinely good news folded inside this: "inhabit, don't solve" (513 hush, 514 never-lands, 518 becomes-something-new, 520 angle-of-repose) is the last jury's provocation #2 obeyed — the monoculture this time is at least the one we *asked* for.
- **BANNED for next cycle:** WebGPU-compute OUTPUT (4×) · Canvas2D OUTPUT (4×) · the **GPU-physics-sim→drone** TECHNIQUE family (4×) · finger-on-screen INPUT as the default reach (7×) · calm-sensory-kids VIBE (4×). Build something whose sound source is **not** a simulated physical medium, that renders **off** Canvas2D and WebGPU, and that takes input from something other than a finger on glass.

## Ambition floor stats (last 15 prototypes)
- **Hit 0–1 criteria: 0** — the floor holds. Seven juries deep, the local-minimum "pentatonic + canvas, no backing" build is genuinely extinct. Credit where due.
- **Hit 2–3 criteria: 15** — *all of them.* Seven sit at exactly 2 (500, 513, 514, 524, 526, 529, 537), eight at exactly 3 (502, 505, 508, 518, 520, 532, 538, 541).
- **Hit 4–5 criteria: 0** — **the headline, and the problem.** Down from 8 last window. The #4+#5 stack the last jury named as "the 5/5 the lab keeps missing by one" is not just still missing — even the standalone 4-hitters are gone. And **#5 (bind a <14-day finding) regressed from 3-of-15 to 1-of-15**: only 538 honestly binds fresh research (§399 microtonal wave). The research-first rule has quietly decayed into negative-steering ("cs.SD is server-ML, #5 unclaimable" — carried since §386) instead of producing binds.

## Standouts (positive)
- **514-polytempo-loom** — the sharpest concept of the window and the cleanest possible answer to *two* of last jury's provocations at once: tension that lives purely in TIME (five voices on consonant pitches at irrational tempo ratios — √2, φ, e/2, π/2 — that can never share a downbeat) AND a piece that flatly refuses to resolve. Zero deps, SVG, Nancarrow/Ligeti lineage. Tension you *count*, not tension you hear beating. This is exactly the lane the roughness-engine ban was meant to open.
- **520-singing-dune** — the engineering swing: the lab's first **MLS-MPM** (material-point-method granular physics, WebGPU), a single dune whose avalanche and angle-of-repose *are* the sound. One presence, no goal, genuinely new sim technique. Where 514 is the idea, 520 is the build.
- **538-xenharmonic-lattice** (honorable) — answered last jury's provocation #1 verbatim (tension in TUNING, Bohlen–Pierce/19-EDO, not beating partials), the lab's first xenharmonic piece in 538 prototypes, and the **only** #5 of the window. Capped at 3 only because it's a one-off — make it a spine and it's the first 4.
- **518-kids-living-ember** (honorable) — the one kids piece with real long-form memory: a hummed-to creature that is demonstrably different at minute 5 than second 30 and never loops home. The rare kids build that isn't a 90-second joyful-awe glow toy.

## Pruning candidates (concept-level, NOT for deletion — immutability rule still holds)
- **524-kids-hand-firebird** — the kids autopilot in full bloom: MediaPipe hands → WebGL2 additive particle creature → open-hand-blooms-and-sings-pentatonic → −6 dB limiter. Every component is a known, comfortable kids move; the named refs (Journey, Akten) decorate rather than drive. 2/5, no lab-first, no bound research, no spine. Gorgeous and forgettable.
- **537-kids-sky-murmuration** — Boids (SIGGRAPH **1987**, the opposite of a fresh technique) + three.js + touch-to-shepherd + harmonizing flocks. A well-worn flocking toy with pentatonic sweetening. Pretty; not where the surprise budget should go.
- **526-jazz-room** — the novelty is real but it's *genre*, not *technique*: "first jazz piece" (#1) bolted to a generative-arc sequencer + Canvas2D, no second subsystem, no research bind, no spine. A competent autopilot in a new costume. The journey-engine-alternative goal (Karel's priority #4) deserves a build that's also technically new.
- **500-kids-aurora-tilt** — flagged by the last jury and still the clearest local-minimum example: tilt + domain-warp fBm shader + modal pad, all textbook, "level to resolve / tilt to tense" is the lightest tension mechanic available. Re-listing it because nothing learned from the last call-out.

## Provocations for tomorrow's dream cycle
1. **Chase a 4/5 — the ceiling, not the floor, is the problem now.** Zero pieces hit 4 this window. The floor is solved; stop celebrating that and go up. Take **514-polytempo-loom** or **520-singing-dune** to cycle 2 AND bind a <14-day finding in the *same* fire — that exact #4+#5 stack has eluded the lab for seven juries. A polytempo piece for two conductors that implements a fresh beat-tracking paper would do it.
2. **Ban the GPU-physics-sim→drone move (4×) — it's the new roughness engine.** Reaction-diffusion, MLS-MPM, stable-fluids, particle-advection all do the identical thing: simulate a medium, read its stats, make it hum. Find tension/sound somewhere that is NOT a simulated physical field — language, data, social coordination, silence.
3. **Take the 0× non-screen lane the menu keeps daring you to test.** Canvas2D (4×) and WebGPU (4×) are both over; the renderer just keeps moving. 513 (hush) and 518 (near-silence) brushed it — go all the way: an **audio-only / voice-only / haptic-only** piece with no screen renderer at all. Prove the screen bias can break.
4. **514 proved metric-dissonance works and had no children.** A whole tension vocabulary — tempo canons, polymeter, Reich phase, Nancarrow studies — got touched once and abandoned, exactly like 490 last window. Build the SECOND time-tension piece, ideally embodied or multi-user (a conducted tempo-canon where two people's gestures set incommensurable tempi).
5. **The research-first rule has decayed — revive it.** #5 dropped to 1-of-15 and the dive has been writing "cs.SD is server-ML, #5 unclaimable" since §386. cs.SD is not the only well: the manual names TouchDesigner (Tschepe, Heckmann, Horikawa), Anadol/Akten/Marpi show news, fal/replicate/HF drops, SIGGRAPH/Ars/MUTEK programs. Mine a client-buildable finding from those and actually bind it.
6. **The kids set is on calm-sensory/joyful-awe autopilot.** 518-living-ember is the one kids piece with memory that rewards return *across days*. Extend THAT — a creature a child finds genuinely changed tomorrow — instead of shipping another beautiful 90-second glow toy (524/537/541 all live here).

## Karel-facing line
The floor held but the ceiling fell — solid, diverse, and not one of the last 15 reached June's feeling-forest/voyager-room ambition (zero at 4/5, down from eight), while "GPU-physics-sim-as-sound" quietly became the new autopilot at 4×; best of the window are 514-polytempo-loom (tension purely in TIME) and 520-singing-dune (lab-first granular physics) — tomorrow, take one to cycle 2 and bind a fresh paper, and chase a 4/5 instead of another gorgeous 3.
