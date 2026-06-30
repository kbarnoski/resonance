// readme.ts — the design-notes prose, shown IN-PAGE via the "Design notes"
// toggle (React state, not a route). Kept in sync with README.md by hand.

export const README = `Aurora Wind

What if the real, LIVE solar wind streaming past Earth right now played a
cosmic-ambient aurora you fall into?

This is a drug-free altered-states piece — the meditative, oceanic pole of
boundlessness. On a single "Begin" gesture it fetches NOAA SWPC's live
space-weather feeds and lets the real wind drive an endless rising glissando and
a field of drifting auroral curtains. It keeps evolving (the feed is polled every
60 seconds) and it runs on slowly-drifting synthetic data when the network fails,
so it ALWAYS sounds and moves with zero network.

We sonify the REAL solar wind, not a fake. The HUD tells you which: a green
"live · NOAA SWPC" dot when data is real, an amber "synthetic fallback" dot
otherwise. (Note: in 2026 we are near solar maximum, so live aurora activity
tends to be high.)

LIVE DATA (fetched client-side, 4 s timeout each, synthetic fallback on any
failure):
  • Plasma  — solar-wind speed & density (plasma-5-minute.json)
  • Mag     — Bz (GSM) & total field |B| (mag-5-minute.json)
  • Kp      — planetary K index, geomagnetic activity (noaa-planetary-k-index.json)

DATA → SOUND
  • Solar-wind SPEED → the Shepard endless-ascent drive: faster wind = a faster,
    more energetic eternal rise.
  • Southward Bz (negative nT) + Kp → the drone-bank drive. This is the real
    physics: southward Bz couples the solar wind to the magnetosphere and drives
    substorms, so the low just-intonation bed SWELLS exactly when the sky should
    light up.
  • A strong southward-Bz swing fires a sparse high shimmer "ping".
  • Both buses route through a ~6 s void reverb for a vast tail; the wet mix
    opens as the sky gets more energetic.

DATA → VISUAL
  • SPEED → curtain ripple/flow speed and lateral drift.
  • DENSITY → curtain brightness / opacity.
  • Southward Bz → an overall glow surge across the curtains.
  • Kp → colour spread and how low the red tops reach: high Kp pushes
    red-topped, lower-latitude curtains (the classic storm-time red aurora).

The visual is a GPU field of vertical auroral CURTAINS — shader-displaced ribbon
planes at staggered depths, additive-blended in a green→magenta→red auroral
palette, with horizontal ripple, vertical shimmer and slow drift over a sparse
star backdrop. It is deliberately a drifting FIELD, not a center-out bloom. If
WebGL is unavailable, a readable notice appears instead of a crash.

NAMED REFERENCE — the magnetosphere-sonification lineage
  • "Listening to the magnetosphere: How best to make ULF waves audible"
    (arXiv:2206.04279) — shifting ultra-low-frequency magnetospheric waves up
    into the audible band.
  • The broader heliophysics-sonification tradition: NASA's heliophysics
    sonification work, and Andrea Polli's environmental / Antarctic sonification.
  This piece stands in that lineage: it sonifies the REAL solar wind, not a
  stand-in.

DESIGN NOTES
  • Audio composes the shared psych engines (startShepard, startDroneBank,
    createVoidReverb) — no bespoke synthesis beyond the shimmer ping.
  • Everything is smoothed: live-data jumps glide into both sound and image over
    ~1 s so a new 5-minute sample never snaps.
  • After the one Begin gesture the piece is autonomous: it drifts, polls, and
    re-paints on its own with no further interaction.`;
