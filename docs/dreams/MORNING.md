# Morning digest — last updated 2026-09-30T~01:10Z (17:45 PT fire, cycle 1270)

> **Jury verdict today** (2026-09-30, on the morning inventory fire): The lab finally listened — it spent a whole cycle *finishing* your camera pieces instead of making new ones, and found that four (including `mudra`, the one you loved) were actually broken and had been for weeks, now fixed; `fluxweave` harmonizes your piano into a chord of itself and is genuinely good. Two asks only you can settle: yes/no on the score-follower (offered 7×), and a glance at why `origin/main` keeps getting force-rewritten every fire. See `docs/dreams/JURY.md`. (This 17:45 fire then shipped `18384-throatmorph`, below.)

## New since yesterday
- **`18384-throatmorph`** → https://getresonance.vercel.app/dream/18384-throatmorph
  Open this one. It's the piece that finally **claims criterion D** — the multi-cycle
  commitment the jury has flagged as unclaimed by *anybody* for five verdicts. It's
  timbrefold's banked cycle-2, delivered: your two hands reshape the **vocal tract of
  your own recording continuously** — glassy → woody → vowel — while the pitch and
  melody stay exactly put. Where timbrefold hopped between 5 discrete vowel presets,
  this lifts your recording's OWN spectral envelope with the real cepstrum and morphs
  *that* (the same formant-vs-texture split a plugin called **NEUON — Cepstral Morph**
  shipped 5 days ago). Slide both hands left↔right to sweep the timbre, raise them to
  morph deeper, spread them to slide the vowel. Rendered as an achromatic **ultrasound
  formant-surface** — a genuine palette + render departure from timbrefold's prismatic SVG.

## In progress / partial
- Nothing half-built. This was a DEEP ×2 fire: two DSP approaches to the same concept
  built in parallel; the cepstral-STFT one shipped, the LSF-biquad sibling (`vowelbend`)
  was banked to IDEAS as the safe, guaranteed-clean alternative.

## Research findings worth a look
- **NEUON — Cepstral Morph** (Dystopian Waves, 2026-09-25): cepstral spectral morphing /
  cross-synthesis with independent **formant vs. texture** control — the exact technique,
  productized this week. It points straight at throatmorph's cycle-3: a true two-source
  cross-synthesis (make one of your takes "speak" in the envelope of another).

## Open questions for Karel
- **30-second check:** does throatmorph track your hands on your webcam? (Cloud can't test
  a camera. Audio + demo-drive + pointer paths are verified and the DSP is offline-proven
  transparent-at-rest; only the live-camera feel and the hiss character on real piano are
  unconfirmed.) If it tracks, want its cycle-3 — a two-take cepstral cross-synthesis?
- **Score-follower** (your recording follows *you* via onset/beat detection) is now offered
  7×. It's phone-testable and self-verifying but needs your explicit go over the camera
  directive. Green-light it or I'll stop offering it.
