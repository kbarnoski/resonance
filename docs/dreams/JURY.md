# Concept Jury Verdict — 2026-06-06 (UTC)

## Summary
Breadth is genuinely healthy — fifteen pieces, fifteen unlike techniques (beat
tracking, WFC, physarum, speech-melody, sky-score, fill-to-tune, chain-reaction
wave), and C-major-pentatonic is so thoroughly dead that 14 of 15 READMEs name
it only to disavow it. But two ruts are forming under the diversity. The adult
lane has quietly traded last jury's "his-piano → Anadol nebula" for a **new
monoculture: the slow just-intonation ambient drone you don't really play**
(`330-stillness`, `331-voice-cathedral`, `347-the-place`, all Oliveros / La Monte
Young / Eno, minimal renderer). And the screen-viz habit didn't die — it
migrated *again*, from last jury's banned Canvas2D straight into **inline SVG
(5×)**; 13–14 of 15 still output to a screen. The real wins this fortnight are
the **legible/instructional** pieces (`358-beat-mirror`, `353-collapse-score`) —
that's the direction to feed, and the drones are the direction to starve.

## Diversity audit
- **Over-represented input:** **touch — 4×** (325, 341, 350, 355), tied with the
  more telling one: **mic / voice — 4×** (330, 331, 334, 358). Voice-as-input
  surged this window. Karel's-own-recording cooled (2× — 323, 327, down from 4).
- **Over-represented output:** **inline SVG — 5×** (325, 330, 331, 334, 350).
  Last jury banned Canvas2D (which fell to 0 here) — and the full-screen
  lightweight-2D-viz habit simply relocated to SVG. Counting lightweight non-GPU
  renderers together (SVG 5 + DOM/CSS 3 = **8 of 15**), the GPU paths (WebGPU 2,
  raw-WebGL2 3, three.js 2 = 7) are now the minority. **Net: only `346-sound-hunt`
  is truly non-screen.** The renderer keeps moving; the screen-bias doesn't.
- **Over-represented technique:** **none on the discriminating axis — the healthy
  result again.** The fifteen core techniques are genuinely distinct. The only
  ≥4 things are *structural*: the always-on **JI-modal-drone + brick-wall-limiter
  no-fail bed** (≥12×, house style) and **HRTF spatial audio** (3×: 331, 337, 346).
  Neither is a rut by itself.
- **Over-represented vibe:** **kids — 6×** (325, 334, 341, 346, 350, 355; this is
  structural cycle-parity rotation, not a flaw). The flaw is the adult sub-vibe:
  **contemplative JI-ambient-drone — 3×** (330, 331, 347) is the new adult
  convergence, in the exact "too similar" shape the old nebula rut had.
- **BANNED for next cycle:** **touch INPUT · mic/voice INPUT · inline-SVG OUTPUT ·
  adult contemplative-JI-ambient-drone VIBE.** The next adult build must not be a
  slow just-intonation drone rendered to SVG, and must not be touch- or
  voice-driven. Push it toward GPU output + an instrumental/legible/non-screen
  frame.

## Ambition floor stats (last 15 prototypes)
- **Hit 0–1 criteria: 0** — same as last jury, and the same caveat holds: because
  every cycle does a dated dive (#5) and every README cites a named reference (#3),
  **#3 is auto-satisfied on every build** and #5 nearly so. Clearing criteria no
  longer proves much; #1 (novel technique) and #4 (multi-cycle) are the only ones
  that force new ground.
- **Hit 2–3 criteria: 13** — the center of mass, and it got heavier. Three sit at
  exactly the floor (2): `330-stillness`, `331-voice-cathedral`, `350-bump-along`.
- **Hit 4–5 criteria: 2** — `325-paper-boat` (4: first long-form stateful *kids*
  piece, harmonic-arc + memory + persistence) and `358-beat-mirror` (4: lab-first
  beat tracker + ≥3 subsystems + named ref + research). **This is down hard from
  last jury's 7** — and that's the honest worry of the fortnight: the 5/5s and the
  multi-cycle threads (308, 322, the Mirror-Canon and harmonograph threads) have
  all slid out of the 15-window, and *nothing has replaced them*. No new 5/5; no
  multi-cycle thread advanced. STATE shows Mirror-Canon-cycle-2 and harmonograph-
  cycle-4 queued, deferred, queued, deferred — the lab keeps choosing a fresh WIDE
  explorer over the deepening it promised. Breadth is up; peak ambition dipped.

## Standouts (positive)
- **358-beat-mirror**: the headline. The lab's first real-time beat/tempo tracker,
  and the strongest *verification posture* we've shipped — the internal 112 BPM
  groove is a known answer, so the pipeline proves itself on a phone with no mic.
  Legible (BPM readout + heard-vs-predicted scope) and a real live-performance tool.
- **353-collapse-score**: first Wave Function Collapse in the lab, and you can
  *watch the music decide itself* — superposition cells collapse, constraints
  ripple, the playhead sounds it. Deterministic seed-replay, long-form auto-continue.
  Novel technique + genuine legibility in one.
- **345-speech-melody**: the only keyboard/text input in the window and the lab's
  first natural-language→music mapping (Janáček's *nápěvky mluvy*). Type a line,
  watch your words light up as they sound. A genuinely fresh input axis.
- **346-kids-sound-hunt**: the *only* non-screen piece in the 15 — turn your body
  to find singing animals in HRTF space. Directly attacks the lab's screen bias
  instead of relocating it.

## Pruning candidates (concept-level, NOT for deletion — immutability rule still holds)
- **331-voice-cathedral**: a local-minimum because it's `308-orbit-choir` with a
  voice instead of a tour — same HRTF spatial JI drone, same Oliveros / Hykes /
  La Monte Young references, and its own README cites 308 as its lineage. 2/5, no
  novel technique. What was missing: a reason to exist beyond "308, but you sing
  the voices in." A redundant variation on a loved piece is exactly the move the
  ambition floor exists to stop.
- **350-kids-bump-along**: the fortnight's clearest regression. It reverted to
  **C-major pentatonic** (C3 E3 G3 A3 C4 E4 G4) while all 14 siblings went out of
  their way to reject it; its README is the thinnest of the 15 (no typography
  notes, no honest-verification section the others all carry); and it's a simple
  one-tap touch toy. The chain-reaction *mechanic* is a fresh idea — the *execution*
  is the kids local minimum. Missing: D-Dorian, and any memory/consequence.

## Provocations for tomorrow's dream cycle
- **Starve the adult drone monoculture.** Three slow JI-ambient drones in a row
  (330/331/347) is the new "too similar." Ban the just-intonation-drone-to-SVG
  adult piece for a week. Feed the *legible/instructional* lane instead — the real
  win this fortnight (358, 353, 345). Build the obvious next one: a real-time
  **score-follower / live-accompaniment** tool (the banked live-accompanist that
  lost curation 3× on verifiability — solve it the way 358 did, with a known
  internal answer), or a **chord/key analyzer** that names the harmony you play.
- **Stop relocating the screen — leave it.** The viz habit fled WebGL2 → Canvas2D
  → now inline-SVG (5×). Only `346-sound-hunt` is genuinely off-screen. Spend a
  cycle on a *second* non-screen piece — audio-only, voice-only, or haptic. The
  off-screen shelf is the real gap; SVG is not an escape from it.
- **Actually deepen something.** No multi-cycle thread advanced this window despite
  two being queued repeatedly. Pick ONE — Mirror-Canon cycle-2 (Round⇄Phase) is
  the cleanest — and *ship the deepening* instead of deferring it for a fourth
  fresh WIDE explorer. The lab keeps promising depth and buying breadth.
- **The freshness mandate has quietly failed ~6 dives running** — every recent
  research dive honestly reports "no <30-day client-buildable hit" and pivots to a
  foundational reference (1995 / 1761 / 1739 / 2005) + a lab-gap audit. That's fine
  and honest, but the named recent artists in AGENT.md (Memo Akten, Refik Anadol,
  Bileam Tschepe) haven't been *built on* in this window. Either formally relax the
  mandate to "lab-gap + foundational is a valid dive" (the agent already operates
  this way), or pick ONE recent named work and implement its specific technique.
- **Hold the pentatonic line.** `350` let C-major-pentatonic back in. Don't.

## Karel-facing line
A genuinely strong fortnight on *legibility* — `358-beat-mirror` and
`353-collapse-score` are real wins — but starve the new adult monoculture (three
slow just-intonation drones in a row) and notice the screen habit just hid inside
SVG.
