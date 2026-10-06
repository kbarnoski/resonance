# Morning digest — last updated 2026-10-06T~01:00Z

> **Jury verdict today** (`docs/dreams/JURY.md`): "prove vicinity wasn't a one-night stunt — ship a *second* non-single-take piece immediately (antiphon/cantor are ready), before minting anything new." **Done, in this very fire.** (Note its #3 bans three.js for fresh *mints*; cantor is a jury-named burn-down of a sibling already built in three.js — the sanctioned exception — but the next fresh mint owes a rested render path.)

> **Burn-down fire: drew the backlog down AND broke the monoculture.** The jury wanted the single-take source ban broken and the backlog finished down, not re-grown. Today ships one banked sibling — the lab's **first voice-as-control piece** — so the shelf drops (~9→~8) and the source axis breaks via a brand-new input modality in the same move.

## New since yesterday
- **[19440-cantor](https://getresonance.vercel.app/dream/19440-cantor) — SING with his piano and it resonates at your pitch.** Why open this: it's the lab's first piece where your **voice** is the controller. One of Karel's real takes (default *Bath*) plays as the carrier; a bank of resonators sits on the recording and tracks your sung note, lifting **his piano's own energy** near that pitch out over the dry take — you don't add a tone, you make his piano ring at the note you sing. Open your mouth to bloom the resonance; tilt your head to bend it. **Put on headphones.**
- **The DSP core is already proven — only the capture needs you.** The novel part (voice → pitch → resonator retuning) is **verified headless**: a selftest feeds 8 synthetic sung tones (G2–A5) and the detector nails every one within ±0¢ (silence correctly ignored). The one thing I can't feel up here: whether the **live mic** pitch feels immediate while you actually sing, and whether the mouth-gate thresholds + wet/dry balance sit right on your ears. ~30-second check — if the bloom feels too eager or too shy it's a one-number fix.

## How this cycle was run
- **BURN-DOWN (single winner, bank nothing).** Resurrected + hardened the banked `cantor` (IDEAS §1281). Chose it over the other ready sibling `antiphon` because it breaks the source ban via a *new modality* (the voice = the jury's own "mic-as-secondary-over-catalog" example) rather than extending 707. Upgraded its pitch detector from plain autocorrelation to **YIN/CMNDF** (kills the octave errors a voice's harmonics cause) and added the headless selftest.
- Research anchor: YIN/CMNDF for low-latency monophonic singing-voice pitch (de Cheveigné & Kawahara) — chosen deliberately; nothing in the last 30 days displaces it for a single voice.

## Still on the board
- **`antiphon`** is the other ready banked sibling (your body conducts a call-and-response between *two* takes) — a quick burn-down ship next fire if you want the shelf lower.
- The biggest unbuilt "bigger concept" is still jury #5: a **two-person shared HRTF room over WebRTC** (multi-user + spatial, extending vicinity) — worth doing, but it's a deliberate multi-cycle build, not a one-fire rush.

## Open question for you
- **cantor's mic path — does it sing?** If the live pitch tracking + mouth-gate land, this opens a whole voice-as-control lane (self-harmony drones, vowel-formant resonance). If it feels laggy or the gate is fiddly, tell me which and it's a small tuning pass. Otherwise I'll default next fire to shipping `antiphon`.
