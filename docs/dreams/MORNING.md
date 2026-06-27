# Morning digest — last updated 2026-06-27 ~04:30 UTC (cycle 569, adult · DEEP)

> **The jury's hardest ADULT asks** (JURY 2026-06-26): #2 *"make the SOUND the primary object — the simulation should be the instrument's resonating body, not a screensaver you pulse a bell off of."* #3 *"build the adult MIDI/desk-controller piece — MIDI is only 1×."* #5 *"keep choosing a register that isn't a dark nebula."* Today's build answers all three at once. See `docs/dreams/JURY.md`.

Open the lab: https://getresonance.vercel.app/dream

## New since yesterday
- **[/dream/979-cantus-engine](/dream/979-cantus-engine) — The Cantus Engine** ⭐ (cycle 569, adult). **Seed a 3–6-note subject and watch Resonance compose a 5-minute, self-developing fugue in front of you — and every note is a *named* Bach/Fux operation you can see fire on the score** (INVERSION, STRETTO, → G major…). No trained weights, no black box: a deterministic engine + a Fux voice-leading scorer pick each voice's pitch, and the same seed plays the same piece every time. It develops over a real arc (Exposition → Episode → Modulation → Stretto → Coda) and drifts a fifth + flips mode each cycle, so **minute 5 sounds genuinely different from minute 1** — the lab's thin "long-form with memory" lane. **Why open it:** it's the directest piece yet to your "personal audio workspace for composers" line, it's pure music (zero GPU sim — the jury's #2 ask), and it's engraved-manuscript, not a nebula (#5). *Just look — it auto-starts the B-A-C-H subject in ~2s; or press **Set subject** and play 5 notes (MIDI keyboard, or computer keys A–K).*

## This was a DEEP fire — 1 concept × 2 interaction models; the twin is banked (IDEAS §569)
- **980-counterpoint-loom ⭐** — the real-time/legible twin: you play a melody and a per-beat **beam search** weaves 1–3 live companion voices under *enforced* species rules — and it **flashes a rose `∥5 ✗` when it rejects a candidate**, so you watch the counterpoint rules fire. Builder dry-ran the engine: **0 parallel fifths/octaves, 0 voice crossings**. Its enforced search is the clean **cycle-2 graft to fix 979's one weak spot** (979's voice-leading is currently greedy/no-lookahead).

## Research that drove it (RESEARCH §569)
- **arXiv:2606.13626** (June 11 2026) — three deep-net families all learning to *imitate* Bach counterpoint from data. The surprising on-mandate move was the **inverse**: a fully *explainable*, deterministic counterpoint machine where every note is traceable to a named rule — the human-legible counterpart to the neural Bach-imitators.

## Open questions for Karel — verification debt (the jury's #1 liability, 3+ juries running)
- Recent ships (979 included) are **compile/lint/type-clean but never run** — no audio/MIDI device in the build container, and Next static-gen dies on the locked ~4096 fd ceiling (`EMFILE`), so I can't self-verify at runtime. **Two real fixes, both need you:** (a) raise the container fd ceiling so static-gen runs locally, or (b) a 2-minute hand-verify on a real device. **979 is the easiest adult piece to hear yet — keyboard-only, no mic/camera/MIDI needed; it auto-plays a developing fugue the instant you open it.** Worth 60 seconds of your ears this morning.
