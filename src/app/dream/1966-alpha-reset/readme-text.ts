// The design notes shown in the modal. Kept in sync with README.md.
export const README_TEXT = `Alpha Reset — sound phase-resets your visual cortex.

THE QUESTION
What if SOUND could reset the phase of your visual cortex, so each note snaps a
drifting, incoherent hallucinatory form-constant field into momentary crystalline
coherence, then it drifts apart again?

THE MECHANISM
A full-screen three.js fragment shader renders four Klüver form constants —
tunnels, spokes, spirals and a honeycomb lattice — in cortical (log r, theta)
space, using the shared log-polar engine (Bressloff–Cowan retina→V1 complex-log
map). Each layer carries its own phase offset. Left alone those offsets DRIFT at
slightly different rates, so the mandala smears out of registration into a flat,
desaturated field of visual snow — incoherence.

A spectral-flux onset detector listens to the audio (running mean + k·std
adaptive threshold over ~0.7 s, rising-edge peak, ~120 ms refractory). EACH
onset fires a fast ease that pulls all the phase offsets back toward a common
value: the geometry snaps into a crisp, saturated, iridescent mandala — then the
incoherent drift pulls it apart again. Rhythmic, dense music keeps it coherent;
sparse or quiet passages let it dissolve into snow. That coherence-snap is the
headline.

Frequency bands set the neural gain: bass → log-polar warp depth / zoom,
mids → form-constant density, highs → kaleidoscope fold count and fine detail,
overall loudness → saturation and iridescence.

THE GROUNDING (real findings)
• Bressloff & Cowan — Klüver form constants are one periodic cortical pattern
  seen through the retina→V1 log-polar map.
• Romei et al. 2012, "Sounds reset rhythms of visual cortex and corresponding
  human visual perception" — brief sounds phase-reset the ~10 Hz alpha rhythm.
• Cecere et al. 2015, Current Biology — an individual's alpha frequency predicts
  the width of their audiovisual temporal-binding window.
This piece evokes that phenomenology; it makes no medical claim.

AUDIO
Drop or choose any audio file (decoded, looped) — or, with no file, a
deterministic seeded arpeggio over a soft drone self-demos the effect: its note
attacks drive the onset detector so the snap is visible with zero input. Audio
starts on your first gesture.

SAFETY
No full-screen high-contrast flicker in the 3–30 Hz band. The coherence snap is
a SPATIAL reorganization of the pattern, never a brightness flash — the global
luminance envelope is slew-limited so it cannot modulate faster than ~3 Hz.
prefers-reduced-motion reduces fold count, slows the drift and softens the onset
response.

WHERE CYCLE 2 COULD GO
Estimate the listener's individual alpha peak from a short eyes-closed calibration
and scale the drift/re-coherence time constants to it (per Cecere 2015); add a
binaural/haptic onset channel; and let sustained coherence slowly deepen the
warp for a longer entropy arc.`;
