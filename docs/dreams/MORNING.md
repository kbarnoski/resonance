# Morning digest — last updated 2026-06-28 (cycle 586)

Open the lab: https://getresonance.vercel.app/dream

## New since yesterday — Cycle 586 (KIDS · WIDE, 3 non-pointer explorers, shipped 1)
- **`1020-kids-breath-flute` — a 4-year-old *blows or hums* into the tablet and a glowing column of air actually SINGS a real flute, synthesized from physics in real time (not a sample). Tap a big glowing hole to pick the note.** **Why open this:** it's the lab's **first wind instrument** — a genuine jet-drive *digital-waveguide* flute (the Cook/Smith STK model), where the child's breath loudness is the air pressure driving the bore. It directly answers your two standing asks for the kids lane: **real music** (a G-Mixolydian *mode*, not a no-wrong-notes pentatonic toy) and **verification** — it ships with a passing tuning self-test (all 7 notes land in tune at both sample rates). Mic-breath also **breaks the pointer reflex** the jury keeps flagging. No mic? The holes still puff, and it auto-plays a little phrase when idle — so it's never silent.
- ⚠️ **Not heard yet:** no audio/mic in my box. Compile + dream-zone lint are green (✓ Compiled successfully in 38s) and the waveguide is *math-verified* tuned (Goertzel sweep, ±7–19¢), but the breath feel + mic permission want a minute on a real phone.

## Also explored this fire (built complete, banked — not shipped) — see IDEAS §586
- **`1021-kids-marble-bells`** ⭐ resurrect-first — **tilt the tablet like a tray**; a glowing marble rolls under real gravity and rings jewel-colored chime-pegs on a moving I–IV–V–vi chord clock. Lovely and it copies the 1015 recipe (real harmony + a passing test) — held back **only** because "a physics sim is the instrument" is the exact groove the jury just asked us to vary. First to revive next kids fire.
- **`1022-kids-scarf-choir`** — **wave a scarf in front of the camera**; pure optical-flow motion conducts a warm I–vi–IV–V choir of aurora ribbons (camera never shown, processed locally). Held back because the camera lane is still hot (`1008` shipped days ago).

## Why this shape (KIDS · WIDE · non-pointer · real harmony)
- Your jury said the kids lane should **copy 1015** (real functional harmony + an engine-as-body + a passing unit test) and **stop the pentatonic-Karplus toys**, and (again) **break the 7× pointer reflex**. So: three orthogonal *non-pointer* inputs (breath / tilt / camera), every one on real functional harmony, every one with a passing self-test. Shipped the one that ALSO adds a *never-used synthesis class* and pays the verification debt. Today's research (SwanSphere, 29 May 2026 — even real-time *spatial* audio is now neural-diffusion) → today's build: the contrarian, offline, **verifiable** pure-physics instrument.

## Open questions for Karel
- The breath-flute and the two banked builds are all **headless-verified but unheard** — the unheard pile is the jury's #4. Worth one cycle that just hand-checks `1020` + `1019` + `977` on a real device?
- Kids lane: next fire, **resurrect `1021-marble-bells`** (tilt + real harmony, the resurrect-first), or push a fresh non-pointer idea?
- Still-open doc-debt: RESEARCH dives for cycles 579–582 were referenced but never appended (§583–§586 are clean). Backfill in a research lull?
