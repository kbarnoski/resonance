# Concept Jury Verdict — 2026-07-25

## Summary
The lab did the hard thing twice in a row: last week's verdict demanded a sound
engine that can genuinely sound *bad*, and this window **executed it almost
perfectly** — **11 of the last 15** pieces explicitly tear out the
just-intonation safety net and brag about it in their README (free-ratio
Lissajous, chromatic tension weapons, a 909/303 acid line, Bohlen–Pierce with no
octave, pure-noise applause with no pitch at all). The JI lattice now survives
only in the two carryover real-world-data pieces. Ambition is still absurdly high
(zero local-minimum builds, eleven at 4–5/5). **But every ship needs a new
critic, and the new rut is a case of careful-what-you-wish-for:** the 07-24 jury
said "extend `2502-duel` — the negamax-as-musician is worth three prototypes," so
the lab built *four* AI-musical-partner pieces and routed **8 of 15** inputs
through a QWERTY keyboard. The pointer rut the last jury killed came back as a
keyboard rut, and "an AI you jam with" hardened from a standout into a template.

## Diversity audit
- Over-represented input: **QWERTY keyboard-as-instrument** (8×: 2522, 2530, 2538, 2558, 2566, 2578, 2626, 2664) — last jury banned "poke a screen"; the lab overcorrected into "type on a keyboard." Neither is the body.
- Over-represented output: **SVG** (6×: 2502, 2530, 2558, 2610, 2626, 2656) and **WebGL2** (6×: 2522, 2538, 2566, 2578, 2590, 2664) tied. The good news buried here: **Canvas2D dropped to 2×** (2474, 2494) — last week's Canvas2D ban worked completely.
- Over-represented technique: **AI musical agent that plans with/against you** (4×: 2502 negamax, 2530 alpha-beta minimax, 2578 beam-search, 2664 superposition agents). Tied runner-up: **physical-model / source-filter synthesis** (4×: 2482 modal, 2558 KL waveguide, 2590 vocal source-filter, 2610 formant resynth).
- Over-represented vibe: **"you vs / with an AI bandmate" game** (4×: 2502, 2530, 2578, 2664), with **voice-as-subject** the rising second (3×: 2558, 2590, 2610) despite Karel's standing "pull way back on voice."
- **BANNED for next cycle:** QWERTY-keyboard-as-primary-input · the "an AI plays music with or against you" concept (adversarial OR cooperative — the well is over-pumped) · voice-as-subject (third window running) · AND **do not re-add the JI/pentatonic safety net** — the danger win is the one thing to protect.

## Ambition floor stats (last 15 prototypes)
Criteria: (1) novel technique · (2) ≥3 subsystems · (3) named reference · (4) multi-cycle · (5) research <14d.
- **Hit 0–1 criteria — the local-minimum builds:** **0.** Second window running with none. The floor mandate is permanently internalised.
- **Hit 2–3 criteria:** 4 — `2474-worldwire`, `2494-signal`, `2522-xyscope`, `2626-tritave`
- **Hit 4–5 criteria — the ones to extend:** 11 — `2482-collide`, `2502-duel`, `2530-trap`, `2538-driver`, `2558-khoomei`, `2566-ovation`, `2578-goad` (**5/5**), `2590-tremor`, `2610-prosody-formant`, `2656-loom` (**5/5**), `2664-quantum`

The distribution held its ground versus 07-24 (then 0 / 7 / 8). The problem was
never ambition and is not thematic monoculture — it is that the *route* to
killing the safety net was almost always the same route: a keyboard instrument,
often with a planning AI on the other side.

## Standouts (positive)
- `2656-loom` (**5/5**) — the rarest lane in the whole lab, now with a second member. A piece that keeps an **explicit growing memory of motifs** and weaves the future out of the past (Schoenberg's developing variation made mechanical), audibly a different piece at minute 8 than at second 0, ending in a real recapitulation. The jury has said for weeks that long-form-stateful is held by exactly one piece (`2388-round`); this is the second. **Extend THIS seam.**
- `2558-khoomei` — the lab's **first true physical-model waveguide** (Kelly–Lochbaum vocal tract running sample-by-sample in an AudioWorklet, à la *Pink Trombone*). Biphonic overtone singing produced by the *physics*, not a second oscillator. A genuinely new synthesis substrate, not another additive/sampled voice.
- `2626-tritave` — the cleanest single execution of the mandate: an actual **non-octave temperament** (Bohlen–Pierce, 3:1 divided in 13) where the octave literally does not exist and cannot be faked pretty. Plus the lab's **first Web MIDI** integration. Small, pointed, correct.
- `2538-driver` — the lab's **first rhythm-first engine** after a very long pitch-obsessed run: a generative 909/303 club machine that walks an intro→build→drop arc and provably never plays the same bar twice. Groove, not consonance, as the substrate.
- `2566-ovation` — the lab's **first no-pitch piece** (pure granular noise, Kuramoto-synchronised applause) *and* its first warm joke. You conduct a crowd from one awkward clapper into a locked rhythmic ovation and hear the phase-transition happen. Physics + humour + a technique the lab had never touched.

## Pruning candidates (concept-level, NOT for deletion — immutability rule still holds)
- `2578-goad` — the **third** adversarial-planner-against-your-melody in one window (after `2502-duel` and `2530-trap`). The craft is real and the Sethares/Plomp-Levelt roughness model is the nicest tension engine of the three — but conceptually it is `2530-trap` with a beam search instead of minimax and a drone instead of a cantus firmus. The last jury said "worth three prototypes"; the lab shipped exactly three and the third is diminishing returns. Redundant concept, excellent craft.
- `2610-prosody-formant` — voice-as-subject returning (third voice piece this window) into a lane the lab has mined heavily and that Karel explicitly asked to pull back on. "Keep how you speak, throw away what you say" is a lovely idea, but it is an analysis→resynth voice tool, and the analysis-resynth-voice groove is old ground.
- `2474-worldwire` + `2494-signal` — the two JI-lattice survivors. Both snap the world's data to a consonant scale so it "always sounds nice" — precisely the safety net the other thirteen abandoned. Fine outward-facing pieces, but they are the concept this window climbed out of, sitting in the same catalog as the pieces that climbed.

## Provocations for tomorrow's dream cycle
1. **Moratorium on the AI bandmate.** Four "an AI plays music with/against you" pieces in one window (2502/2530/2578 adversarial + 2664 cooperative) is a monoculture, not a seam. The negamax-musician was worth three; it has had four. Ban the concept for a week — adversarial and cooperative alike.
2. **Get your hands off the keyboard.** Input converged to QWERTY (8/15) — the keyboard is the new pointer. Build for a real sensor as the *primary* surface: camera/body (only `2590` this window), mic (only `2610`), **MIDI as the instrument not a bonus**, tilt/orientation, or genuinely input-free generative. One piece, not-a-keyboard, non-negotiable.
3. **AI-pipeline chains are STILL at zero — now the third jury in a row to say it, 4+ weeks overdue.** music→image→video, or lyric→cover-art→looping-animation (fal.ai / replicate, both still untouched). This is the single most novel unbuilt thing in the lab. It spends Karel's FAL_KEY budget, so it needs his **explicit go-ahead + a per-run budget** — this is flagged loud on MORNING.md again; Karel, please rule on it so the agent can stop deferring.
4. **True cross-machine multi-user is still unbuilt.** `2418-two-rooms` (WebRTC duet) has been banked for weeks; two people, two devices, one shared field, with a QR-SDP handshake helper to self-demo. Biggest untouched category on the diversity menu.
5. **Extend `2656-loom`, NOT the AI-partner seam.** The long-form-stateful lane (a real arc, memory, evolution — different at minute 8 than second 0) is the rarest and most valuable in the lab and now has exactly two members. *That* is the seam worth three prototypes: a piece that remembers, that has a beginning-middle-end, that earns its length. Point the next DEEP cycle here.

## Karel-facing line
You asked the lab to let sound get dangerous and it did — 11 of 15 pieces can now genuinely sound bad, and `2656-loom` and `2558-khoomei` are the peaks — but killing the safety net turned almost everything into a QWERTY instrument you jam with an AI bandmate; tomorrow, keep the danger, drop the keyboard, and stop building AI partners.
