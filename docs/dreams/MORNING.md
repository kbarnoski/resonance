# Morning digest — last updated 2026-07-09 06:30 UTC

**Open the lab:** https://getresonance.vercel.app/dream

Cycle 713 · **psychedelic** · **WIDE** (3 orthogonal explorers, ship the strongest). Tonight's theme: **spread the input off the ruts.** The last 10 pieces leaned hard on pointer (5×), camera (3×) and your real piano (3×) — so all three explorers were PLAYED via a *different* non-pointer input: **your voice**, a **MIDI keyboard**, and **device tilt**.

## New since yesterday — open this first
- **[/dream/1326-voice-cathedral](https://getresonance.vercel.app/dream/1326-voice-cathedral)** — **hum a sustained tone and your own held voice builds a vast cathedral of light.** Your mic *is* the instrument (not a loudness bar): it's granularly captured, and holding a steady tone freezes a layer that keeps ringing — stack a few and one voice becomes a boundless choir, the cloud dissolving toward white (the "oceanic boundlessness" of deep meditation). **Grant the mic and hum for ~10 s** — that's the whole payoff. No mic? A demo voice runs so it's alive anyway. Cosmic-ambient. (Julianna Barwick / Deep Listening.)
- **Why this won of the three:** boldest diversity move (a Canvas2D + voice piece, breaking a two-cycle shader-field streak), lowest-risk to ship blind, most surprising, and it rides your loved hum/voice/loop cluster (158-kids-hum-paint, 172-loop-station, 101-camera-song).

## Explored + banked (2 more, full source saved)
- **⭐⭐ 1324-dream-machine** — a Dreamachine you *play* on a MIDI keyboard: each note fires a photosensitive-SAFE (≤3 Hz) pulse that blooms form-constants, sustained chords walk an "entropy axis" toward dense imagery. **Highest ambition of the three** + the research explorer — banked only because MIDI isn't playable on a phone at 06:30. Worth shipping in a keyboard slot; you're the natural audience.
- **⭐⭐ 1325-chrysanthemum** — tilt your phone to bloom a jeweled DMT "chrysanthemum" (kaleidoscope + iridescence). The best *phone* toy of the three; banked as the least-novel technique + a 3rd straight shader.

## Research worth a look (RESEARCH §713)
- A **2026 empirical re-mapping** of the exact form-constant taxonomy this lab has cited as theory for months: bioRxiv (2026-02-18) analysed **10,598 drawings** from closed-eye stroboscopic sessions, and the new **6D-VHQ** scores hallucinations on measurable axes (entropy, geometric→semantic). It re-legitimises the "flicker payload" we've under-built for safety — and directly shaped 1324's entropy-axis.

## Open questions for you
- **Verification debt:** 1326 is build-green + code-read but I can't hear it (headless, no mic/speakers). The grain/reverb balance and whether the voice *audibly* builds a boundless space want your ears — **hum into it and tell me if it runs hot or thin.**
- **The 0× ceiling still stands:** a ≥4-subsystem **AI-pipeline** chain (audio→image→video) needs your per-prototype **paid budget** — I won't spend unattended. Say the word and I'll build it.
- **Infra:** two clean `_shared/psych` promotions are queued — `entropyController.ts` (from 1324) and `desync.ts` (from §712). Both make future pieces faster to build.
- **fd-ceiling:** local `npm run build` still EMFILEs at 4096 fds (~660 routes); I ship via compile-mode + Vercel builds fine. Raising `ulimit -n` or archiving old routes would remove the workaround.
