# Morning digest — last updated 2026-10-16T01:30Z

> **Jury verdict today**: The lab took both notes — `datum` finally broke the violet-glow look with a stark black/white/red phase-vocoder, and `faultline` sonified live earthquakes (the first real-world-data piece ever) — but it's still painting on the same 2D canvas (8 of the last 15), and the shared-room lane is the last one still empty. See `docs/dreams/JURY.md`.

> **Took the jury's #1 note: broke the LOOK, not just the engine.** After six straight fires of violet-glow-on-near-black Canvas2D (the monoculture the jury flagged), tonight's piece is a stark **Ikeda datamatics** register — black/white/red hard data-geometry, zero glow — driven by the lab's first real-time **phase vocoder**. The next piece genuinely looks unlike the last six.

## New since yesterday
- **`21120-datum` — your piano pulled apart into its raw spectral DATA, and you reach in to bend it.** A real-time phase vocoder (a hand-written FFT running in an audio worklet) does a true STFT on one of your takes, so you can **time-stretch** it (0.25×–4×), **freeze** it (it shimmers in place, doesn't buzz) and **phase-blur** it into ghosts — all in real time, pitch intact. The black/white/red grid on screen IS the engine's own magnitude+phase data, not a decoration.
  - **Why open it:** it's a decisive break from the violet-glow look you called a rut — stark Ikeda data-matics — and it's the DSP made honest: the picture is literally the spectrum you're conducting. Headphones, press Play, move the mouse left–right to stretch time, hold still to freeze.
  - **status: demoable** — fully playable/audible with the mouse alone; the hand-camera path (fist→freeze, open→blur) is untested headless and wants your ~30-sec check when web returns.

## Also explored (banked, not shipped)
- `mosaicfield` — **fly through a 3-D constellation of your piano's own notes and re-sequence it in space.** Every note becomes a glowing cell floating by pitch and time; sweep a gate through the cloud and each cell you cross re-triggers its own slice of your recording, so your motion re-orders your performance (concatenative "musaicing"). A genuinely volumetric three.js look-break (the jury's exit (b)) and the next sound-verb in the rotation. Fully built, one re-build from shipping (IDEAS §1301).

## Research find worth a look
- **SpectroFX (2025)** treats the STFT spectrogram as an *editable canvas* with non-iterative phase-vocoder reconstruction — the architecture that makes a real-time, conductable vocoder feasible in a browser; **Phaze** confirms the audio-worklet delivery; and **Ryoji Ikeda's 2026 run** (`data-verse`, `data.gram` at CERN) is the living datamatics reference `datum` draws its look from. (RESEARCH §2026-10-16.)

## The freeze (one-line, unchanged)
- 🟠 Web prod still frozen ~12 days — same one-command fix (`npm audit fix` → commit `package-lock.json`, 2 high + 1 critical in the tfjs chain, re-verified first-hand this fire: c1299/c1300 routes 404 in prod); it's out of my fence. `datum` + the whole pile (12+) flush the instant it lands. Still reading it as intentional while you're on the installation — say the word and I'll go fully silent on it.

## Open questions (decisions are yours)
1. **Next after the look-break?** This fire rotated the LOOK (datamatics) and the verb (spectral-phase). The two biggest things still open: `mosaicfield` (volumetric three.js, one re-build away) and the still-0× **WebRTC shared-listening-room** — the one genuinely unbuilt DEEP concept, worth claiming as a 2–3-cycle build. Want me to ship mosaicfield next, start the shared room, or keep rotating single-fire pieces?
2. **Datamatics as a recurring register?** If the stark black/white/red Ikeda look lands for you, I can treat it as a standing alternative to the violet-glow house look (not every fire, but in rotation) so the lab has two visual registers instead of one.
