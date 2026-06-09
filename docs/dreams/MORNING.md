# Morning digest — last updated 2026-06-09 (UTC, cycle 365)

## New since yesterday
- **`441-latent-listening-room`** ([open](https://getresonance.vercel.app/dream/441-latent-listening-room)) — **a generative ambient piece that continuously *dreams a picture of itself*, and the picture bends the music back.** Press Begin: a slow pad+arpeggio plays, and every ~6s its live spectral character (brightness / energy / dominant note) writes a prompt → an AI image is regenerated and **cross-fades** over the last one with a slow drift → the returning image's color **bends the audio** (brighter → opens the filter + shimmer, warmer → longer reverb). Audio → image → audio, a closed loop. **Why open it:** this is exactly the lane you said interests you most right now — **AI image generation *inside* an audio-visual piece, where the image responds to and shapes the sound** — and it rides your loved `323-latent-condensation`. *(Live, it dreams real FAL images; if the key/network isn't reachable it falls to a synthesized plasma+particle field driven by the same spectrum, so it's never blank — watch the status line: "dreaming live" vs "synthesized field.")*
- This was a **WIDE** adult fire — **3 explorers, 3 frontier-different directions, strongest shipped.** Cleared the ambition floor at 2/5 (≥3 subsystems + Anadol/Akten/arXiv refs); dodged every jury ban (mic / SVG / Kuramoto / just-intonation).

## In progress / partial
- Nothing mid-thread. Two strong, near-ship-ready banked siblings from tonight (below).

## Banked tonight (IDEAS §365 — both build-reviewed, ~ready to ship)
- **`442-body-orchestra`** — the lab's **first adult full-body spatial 'room'**: step back from the webcam and **conduct** a spatial ensemble — raise a hand → a voice swells and pans to your wrist; spread your arms → pads bloom. (MediaPipe Pose + StereoPanner + ghost-conductor fallback.) The literal answer to the jury's "the body spatial room is the single biggest untouched first." *One fix before it ships: I built it on D-Dorian (the retired bed) — needs re-voicing.*
- **`443-the-vanishing`** — the "go weird" piece: a 10-voice ensemble that **permanently loses a voice every time you look away** (switch tabs / leave the window / sit idle), moving only toward silence — irreversible, no replay. A genuinely new input (your *attention*) and the purest refuse-to-resolve answer. Essentially ready as-is.

## Research findings worth a look
- **RESEARCH §365**: arXiv 2604.07612 (Apr 2026) — latent-diffusion as a real-time musical **co-performer** (conditioned on live audio, feeding back). `441` is a browser-native, image-domain instantiation of that feedback framing.

## Open questions for Karel
1. **`441`**: does the live FAL image path connect+look good from your network, and does ~1 new image / 7s read as "breathing with the music" — or too slow/too fast? (The synthesized fallback is what runs without a key.)
2. You wanted AI-image-**inside**-AV. Is `441`'s closed audio↔image↔audio loop the right shape, or would you rather the image drive *more* of the sound (or vice-versa)?
3. Which banked sibling next — **`443`** (the attention/loss piece, ready now) or **`442`** (the body conductor's room, after I swap it off D-Dorian)?
