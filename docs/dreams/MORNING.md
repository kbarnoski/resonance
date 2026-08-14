# Morning digest — last updated 2026-08-14 (cycle 1135, WIDE)

## New since yesterday
- **[13040-spectralhold](https://getresonance.vercel.app/dream/13040-spectralhold)** — sing or play **one instant** into the mic, tap **Freeze**, and it rings forever as a still luminous chord; stack up to ~6 frozen breaths into a self-choir you conduct. **Why open this:** it's the first piece in a while where the mic is the *primary* instrument, not decoration — nothing sounds until you freeze, so it's genuinely *played*. It answers the jury head-on: kill the self-drone, make the audio come from *you*. **Needs headphones/speakers + a mic** — by design it does NOT work muted (that's the point).

## How it works (30-sec version)
- A real **phase-vocoder spectral freeze** on a hand-rolled FFT: it snapshots the live spectrum and resynthesises that frame forever via overlap-add IFFT, with **identity phase-locking** (Laroche & Dolson 1999) so the held tone is a still chord, not a metallic buzz. Each freeze becomes a persistent violet "shelf" of partials on the near-black canvas.
- First-in-lab as a mechanism (grepped: `1308-piano-freeze` freezes via *granular*, `vocodrift` is phase-vocoder *time-stretch* — neither is an identity-phase-locked freeze you can stack into a choir).

## Also explored this fire (2 more, banked to IDEAS §1135)
- **flowfield** ⭐⭐⭐ — webcam **optical flow** → a granular/plucked instrument you play by *moving*; stillness is silence. Clean build; lost only because optical-flow→music already exists in the lab and camera-embodied was 3 cycles ago. Resurrect on a distinct hook (flow stretching *your* Path piano).
- **recurrence** ⭐⭐ — a real track's **self-similarity matrix**, click a cell to hear why two moments rhyme. Lost as a near-verbatim re-tread of `5384-cartograph`; resurrect only with a genuinely new angle (auto-chaptering, or a path *through* the matrix as a re-composition).

## Open questions for you
- **Was killing the "works-muted-on-a-phone" reflex the right call?** spectralhold is deliberately silent until you play it — the opposite of the recent self-drone template. Sound-on + a mic needed to judge whether the frozen chords are beautiful or brittle.
- **The lab is getting conceptually inbred** — two of three explorers this fire had close prior art (that's *why* they lost). Worth a steer on which thin category to force next: AI-pipeline chain (needs a FAL_KEY budget — build or strike?), or multi-user across the real internet (not just same-device tabs)?

## Verify / caveats
- `npm run build` = clean (EXIT 0), `/dream/13040-spectralhold` compiled static. NOT ear-verified (headless, no mic/speakers) — whether the frozen-frame resynthesis is click-free on a real device wants your ear; a silent fallback vowel-synth (freezable) keeps the page alive when the mic is denied.
