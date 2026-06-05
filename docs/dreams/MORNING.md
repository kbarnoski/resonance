# Morning digest — last updated 2026-06-05 (UTC), cycle 321

> **I shipped the second non-screen piece you asked for.** The jury's #2 provocation was "build the SECOND non-screen piece — `308-orbit-choir` found the freshest axis the lab owns and nothing followed it." So I went DEEP on that one concept (three technical approaches in parallel) and shipped a live-voice → HRTF spatial choir that **names the notes you sang** (your "make it legible, not a nebula" ask, #1).

Open the lab: https://getresonance.vercel.app/dream
**Put on headphones** — the whole point is the sound *around* you.

## ⭐ Open this first (adult — build a choir around your head with your voice)
- **[331-voice-cathedral](https://getresonance.vercel.app/dream/331-voice-cathedral)** — **sing one steady note and it blooms into a sustained voice placed somewhere on an orbiting ring around your head.** Sing again and again and you **stack a one-person overtone cathedral** — up to nine voices circling you over a just-intonation drone. *Why open it:* the chord you build is **printed by name** (`D · A · F♯ · C♯`) — you recognize what you sang, it isn't an anonymous cloud. The screen is just a dim radar; the piece lives in the air. (No mic / not alone? Hit **Auto-demo** and it sings a rising arpeggio into the space itself.)

## Why this one won (DEEP — 1 concept, 3 approaches, 1 shipped)
- **It's the literal answer to two of your jury provocations at once:** #2 (the second non-screen piece, in `308`'s HRTF-orbit lineage — voices that actually orbit your head) and #1 (legible — it *names the notes*, doesn't render a nebula).
- **It's the piece we kept promising.** `voice-cathedral` has been the flagged "next adult build" since cycle 320; it shipped clean, built in SVG from the start (no Canvas2D — the renderer you banned) with a brick-wall limiter so nine voices never clip.
- **Most verifiable of the three.** Pure Web Audio + SVG — no GPU/WGSL blind spot, paying down the jury's note that `323`/`327` never ran on real hardware.

## Also explored this fire (built, banked in IDEAS.md)
- **332-overtone-mirror** — the bolder, stranger one: sing **one** note and the app pulls apart its **harmonic series**, placing each overtone as a separate voice around you — your own timbre exploded into a sphere. The biggest "huh, didn't know we could do that"; it lost only because the effect is hard to verify by ear without real headphones. **Flagged as the next adult build, paired with a real-device listen.**
- **333-antiphon** — sing a *phrase* and a stone cathedral answers it back as a **spatial canon**, copies returning from rotating positions until you've built a round alone.

## Threads / what's next
- **Kids (322):** the jury's #3 ask — **turn-taking / two-child** (the `319` wall-clock-sync idea) or **real-world-data for kids**, *not* another "it grows while you're away." Off touch.
- **Adult (323):** ship **332-overtone-mirror** (with a real-headphones verify pass) or `333-antiphon`.
- **Verification debt:** `323` + `327` have still never run on a real GPU — worth one cycle on real hardware before the next big WebGPU build.

## Open questions for you
- **AI-pipeline-chain** (image gen *inside* an AV piece) is still your most-wanted, never-built direction — blocked on a paid FAL budget. It's a one-word call: **grant a per-cycle budget and I build it next adult fire.**
- **331 is build-verified, not browser-verified** — the unknowns are perceptual (HRTF feel on headphones; the "one breath = one voice" pitch-gating timings). The Auto-demo exercises the full chain mic-free if you want to hear it without singing.
