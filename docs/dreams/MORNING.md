# Morning digest — last updated 2026-06-02 (cycle 277, adult · DEEP orchestration)

## New since yesterday
- **[256-live-duet-harmonist](https://getresonance.vercel.app/dream/256-live-duet-harmonist)** — **play *chords* and a jazz accompanist answers in real time: rootless voicings + a walking bass that lock to the rhythm of *your* playing, not a fixed metronome.** It hears your harmony (12-bin chroma → 36-template chord match → 160 ms settle), comps with Mark-Levine rootless/drop-2 voicings, walks a bass into each change, and places it all on a pulse it infers from your attacks (spectral-flux onsets → tempo → a Chris-Wilson two-clocks scheduler). **Why open this:** it's the **harmony half of the "AI band"** — where `251-trader` ❤️ trades melodic fours, this one lays a living harmonic bed under your chords (the polyphony 251 can't). **No mic? It auto-plays Dm7→G7→Cmaj7→Am7 at 88 BPM** — open it and you'll hear a jazz trio immediately. Best on a real piano into the mic.
- This was a **DEEP 2-builder fire** on one concept: a simpler fixed-clock comping bed vs. this jazz/onset-sync version. The jazz one won on ambition (4/5 floor); the simpler one is **banked build-verified** as a demo-reliable fallback.

## In progress / partial
- **The "AI band" arc is now 2 of 3 members:** melody (`251-trader` ❤️) + harmony (`256-harmonist`, today). The **third — Groover** (drums/tempo, build-verified, ~728 lines) — is queued for cycle 279 to complete the reactive trio you play with.
- **Banked kids siblings** still waiting (build-verified): `254-kids-blow-bloom` (blow on the iPad → dandelion seeds ring notes; lab's first breath input) and `255-kids-sing-garden` (sing → bedtime sky). Next kids cycle (278) ships one.

## Research findings worth a look
- **ReaLchords** (arXiv 2506.14723, Jun 2025) — an online model that comps chords *simultaneously* with a melody, RL-shaped on a reward that scores **harmonic and temporal coherency separately**. That two-axis framing (right notes / right time) is the named backbone for the harmonist, and the obvious next step: split the bed's quality into those two scores and let a tiny online policy adapt. Full note in RESEARCH.md §277.

## Open questions for Karel
- **256's tempo-sync uses spectral flux — weak on legato piano (your instrument).** It degrades gracefully (falls back to 80 BPM; voicings don't need the tempo), but a one-off **"tune the live-duet family by ear" session** (256 + the queued Groover) would make them stage-ready. Want me to schedule that polish cycle?
- **If 256's onset-sync feels off when you play it,** I have the simpler fixed-clock version (`250`) banked and build-verified — say the word and I'll ship it as a "safe mode" toggle.
- Still steering output away from the three.js glut (6 of last 10) — 256 is canvas2d. Flag if you'd rather I lean back toward three.js.
