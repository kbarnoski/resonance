# Morning digest — last updated 2026-06-23 (cycle 520, kids · DEEP)

## New since yesterday
- **[/dream/862-kids-solfege-signs](/dream/862-kids-solfege-signs)** — **Sing With Your Hand.** A 4-year-old makes the classic music-teacher hand-signs in the air — ✊ fist = *do*, ✋ flat hand = *mi*, ☝️ pointing finger = *ti* — and a choir of glowing creature-orbs sings that note back. Hold and change shapes to build a tune; go still and the choir **echoes your melody** (the Kodály call-and-response game). Why open it: it's **real, named music pedagogy** (the Curwen/Kodály solfège signs taught to children worldwide) made playable by a toddler — the lab's first solfège-sign recognition, and the deepest-payload version of "if you have a body, do something a touchscreen can't." **No camera needed for your 06:30 glance** — a ghost hand is already singing and the big colored sign-buttons play the same choir.

## How this cycle was run
- **DEEP mode** — one concept (solfège-signs → choir), **two rendering approaches** built in parallel; shipped the stronger, banked the other.
- **It resurrects a banked ⭐** — `855-kids-solfege-signs` was parked two cycles ago only to avoid back-to-back hand-tracking builds. This directly answers the jury's "**ship a banked sibling, stop letting them ghost**" (#5) and "force a GPU surface, not Canvas2D" (#1 — it's three.js).
- Today's research found the hook: an **April-2026 paper** recognizing *conducting* as a real-time **musical sign-language** (museum-robust, MediaPipe) — which reframes solfège-signs from "wave your hand" into "recognize a real sign-language and conduct a choir."

## Banked sibling (see IDEAS §520) — built complete
- `863-kids-solfege-choir` ⭐ — the **same idea as a glowing "ladder of light"** (raw-WebGL2): 7 luminous rungs do→ti bottom-to-top, rendering Kodály's pitch-height *literally* (do low, la high). Arguably the smarter visual mapping; de-selected only because raw-WebGL2 was over-used in the recent window. **Top kids resurrect-first.**

## Research worth a look (RESEARCH §520)
- **arXiv 2604.27957 (Apr 2026)** treats conducting as a recognized musical sign-language built for **public-museum robustness** — a direct hint for a Tauri/installation **conductor-driven spatial-audio room** (still the jury's 0× depth-camera gap, #2).

## Open questions for Karel
- 862 is **device-unverified** here (no camera/GPU in the sandbox) — worth a look on your phone to confirm the 7 hand-signs reliably distinguish on a real hand; the classifier favours *distinct shapes* over clinical accuracy, and `classify.ts` thresholds are the thing most likely to want a hands-on nudge.
- Next adult cycle (521): **resurrect `860-marine-gamelan`** (the live ocean plays a bronze gamelan, rough seas detune the metal — jury-loved data register, lowest runtime risk), or keep opening fresh surfaces?
