# Morning digest — last updated 2026-06-05 (UTC), cycle 316

Open the lab: https://getresonance.vercel.app/dream

## ⭐ Open this first (kids 4+ — give it your voice)
- **[322-kids-voice-garden](https://getresonance.vercel.app/dream/322-kids-voice-garden)** — **grow a garden by SINGING.** Tap **▶ Start singing**, then hum or sing: a glint of light appears in the dusk sky (sing *higher* → it appears *higher*, *louder* → it grows *faster*) and glowing branches **race toward your voice** and bloom a note. *Why open it:* the garden keeps its **real age** — it grew while you slept, so it greets you taller this morning — and the harmony slowly shifts color, so it's a genuinely different garden, and key of music, at minute 5. No mic? Tap the sky instead.

## Why this one won (2 explored, 1 shipped — DEEP)
- **A real growth algorithm, a lab-first.** The branches use **space colonization** (Runions/Prusinkiewicz 2007) — tips compete for and *consume* the light, so growth looks alive and *reaches for the child*. In 320+ prototypes we'd only ever done recursive L-systems; this is genuinely new.
- **Diversity-clean under two bans.** Touch input had hit 5× and Canvas2D 4× in the last 10 ships — both *banned* this cycle. 322 answers with the freshest pair we own: **voice input + SVG rendering** (light, 6.3 kB). Scale is D-Lydian, not pentatonic.
- **Ambition 3/5:** novel technique + 4 subsystems (voice analysis · colonization sim · safe harmonic audio · wall-clock persistence) + long-form/multi-cycle (it ages across sessions; README specs a duet/seasons cycle-2).

## Also explored this fire (banked in IDEAS.md)
- **323-kids-coral-bloom** — the same voice-grown, persistent idea via **differential growth**: a bioluminescent reef that *folds into coral* as you sing, in three.js. Gorgeous and near-ship — I banked it because shipping three.js again would have re-made the very monoculture the jury keeps flagging. Resurrect on an adult cycle or once three.js cools.

## Threads / what's next
- **Adult (317):** ship banked **323-stillness** (the Cage "blooms only when you're quiet" inversion — still flagged as the boldest answer to "too similar") or **322-strange-attractor** (your wishlist); or deepen **321-spectral-flight**. Renderer note: lean SVG / audio-only — three.js is now near its limit in the recent window.
- **Kids (318):** resurrect **323-kids-coral-bloom**, or deepen **322** (two-voice duet, seasons over multi-day age, pollinators that replay your melody).

## Open questions for you
- **AI-pipeline-chain** (image gen *inside* an AV piece) is still your most-wanted, never-built direction; it needs paid FAL generation and I won't spend autonomously. **Grant a per-prototype budget (e.g. $X/cycle) and I'll build it next adult fire.**
- **322 is build-verified, not browser-verified** — worth 20 seconds of actual humming at review: does "sing higher = grows higher" feel like *control*, and does the overnight regrowth feel magical? (Touch fallback covers a denied mic.)
