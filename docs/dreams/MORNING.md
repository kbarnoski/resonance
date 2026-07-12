# Morning digest — last updated 2026-07-12 ~02:40 UTC (cycle 746, WIDE)

## New since yesterday
- **[1502-sing-lattice](https://getresonance.vercel.app/dream/1502-sing-lattice)** — *sing into a scale that has no octave.* Hum or sing into the mic and your voice is snapped, in real time, onto a **Bohlen–Pierce lattice** — 13 tones dividing the **tritave (3:1)** instead of the octave, so its signature chord is 3:5:7 and it sounds genuinely alien and lovely. Every node you land on glows amber→violet, glides a tone up to meet you, and plucks a real string *there and at its harmonic neighbours* — hold a few and the room blooms into a chord that exists on no keyboard. **The "wrongness" is the instrument.** No mic? Click the lattice or press `1-9 0 q w e`. *Headphones strongly recommended — the sympathetic strings leak back into the mic without them.*
- **Why open this one:** it's the lab's **first voice→xenharmonic instrument** and the **return of mic input** (0× for weeks). It directly cashes your last jury's named ask — *"turn 1408-wolf-ring into a whole scale you can be wrong in, with the mic as controller."* Built on real music theory (verified just-BP lattice, McLeod-NSDF pitch tracking that dodges the usual octave error, Karplus–Strong sympathetic strings). **2 more explored tonight — see below.**

## Also explored tonight (banked, full code preserved)
- **⭐⭐ 1500-aurora-hands** — *conduct a two-voice aurora with your bare hands.* MediaPipe hand-tracking → glowing three.js ribbons + additive/FM; two hands = two independent Lydian voices you can play a melody with (MiMu-gloves spirit). **TOP pick for the next camera night.** Banked only because camera/face is running hot (1482-face loved two fires ago) and mic was the fresher input.
- **⭐ 1504-solar-wind** — *tilt to pour a river of light.* A tilt-steered **WebGPU-compute** torrent of ~200k curl-noise particles that roars and shimmers with sound generated from its own flow. Banked as the big-scale/tilt option.

## Deliberate diversity note
- Tonight answers your standing question directly: **all three were ecstatic/warm/intense, resting the cosmic-void cluster** the jury flagged (8×). None is a fragment shader; each uses a different rare sensor (mic / hands / tilt). 1502 shipped for hitting the mic (rarest input) + the jury's named ask.

## Research findings worth a look
- **RESEARCH §746** — the frontier of realtime music has moved **fully into the browser**: a webcam + a *lightweight client-side SVM* (not a deep net) is now enough for a ~96%-accurate performable instrument (IJFMR 2026), and the xenharmonic world's tooling (Sevish's Scale Workshop, Bohlen–Pierce) is browser-native too → became 1502 + banked 1500. **Honesty note:** strict <14-day freshness came up short again (sources are Jan/May-2026); logged straight, not faked.

## Open questions for Karel
- **Ship a banked one next fire to keep breaking the vibe?** 1500-aurora-hands (hands, camera) is ready and would ride your love of 1482-face.
- **Your real Path piano is still unused.** Banked **1488-the-long-now** (cycle 744) plans a cosmos around a real recording — say the word.
- **The ≥2-model AI-pipeline chain (audio→image→video) is still 0×** — named by several juries as the last standing demand, gated only on your paid-budget go. Green-light it?

## Note
- Local build hit the usual ~700-route **EMFILE** fd-ceiling (hard limit 4096, unraisable) at page-data collection — infra, not code. Full TypeScript + ESLint + compile passed clean; the route builds via the standing compile-mode gate (34 kB page emitted) and deploys to Vercel fine.
