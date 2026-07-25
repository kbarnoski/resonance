# Morning digest — last updated 2026-07-25 (cycle 897, DEEP)

## New since yesterday
- **[2610-prosody-formant](/dream/2610-prosody-formant)** — *a machine that listens only to HOW you speak and throws away WHAT you say.* Speak into your mic: it keeps your melody, rhythm, loudness **and vowel colour** and plays back a wordless, humming human — never a recoverable word. **Open this and talk to it** (it needs mic + speakers to really land — the whole payoff is whether the resynth reads as *your voice, wordless*). No mic? "Play demo" draws + sounds a seeded speech contour so it's still legible.
  - Why now: this is the **force-ship** of the prosody idea you saw me bank twice (§894, §896) — held both times only because it's mic-gated and I can't ear-test it headless, never on quality. Direct cash of arXiv:2606.26083 ("voice AI hears but does not listen").
  - How it works: autocorrelation f0 (continuous microtonal Hz, no scale-snapping — kills the just-intonation crutch the jury banned) + a coarse spectral envelope → a Fant source-filter voice through a live formant bank. SVG-only visual: an f0 spine over stacked violet→magenta vowel-colour strata, with a "WORDS · DISCARDED" stream dissolving above "PROSODY + COLOUR · KEPT."

## Explored but not shipped (2 more — see IDEAS §897)
- **2602-prosody-yin** ⭐⭐ — same idea with a **true YIN** tracker (the most octave-robust pitch of the three). Next-cycle move is to **fuse** its tracker into the shipped formant piece, not ship a second one.
- **2606-prosody-grain** — the prosody rebuilt as an airier **granular grain-cloud**. Biggest sonic surprise, least voice-like; saved for a texture cycle.

## Research finding worth a look (RESEARCH §897)
- **StreamVoiceAnon+ (arXiv:2603.06079)** — 2026 streaming voice-conversion now surgically keeps one axis of a voice and discards another (it removes *who you are*, keeps *how you feel*). That's the exact mirror of today's piece (removes *what you say*, keeps *how you said it*) — the whole field is converging on "a voice is separable axes."

## Open questions for Karel
- **Does the wordless voice actually read as *your* voice?** This is the one I most need your ear on — talk to 2610 and tell me if the vowel colour survives or if it mushes. If it's close, the YIN fusion (2602) should sharpen the pitch.
- **AI-pipeline chains (music→image→video) are still ZERO — 3+ weeks overdue.** They'd spend your FAL_KEY image budget, so I won't start one autonomously. Give me an explicit go-ahead + a per-run budget and I'll build the first model→model→model chain.
- Input diversity is healthy now — two cycles off the keyboard (camera, then mic). I'll keep pulling camera/mic/MIDI/tilt before snapping back to QWERTY.
