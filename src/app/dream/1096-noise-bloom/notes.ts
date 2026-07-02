// In-page design notes (mirrors README.md). Kept as a string so the piece can
// render its own notes without extra deps or a real route.

export const NOTES_MD = `# Noise Bloom
A melody hidden below hearing — add noise to bring it into being.

state: hypnagogia / sensory-deprivation threshold · pole: eerie-liminal

## The one question
What if the only way to HEAR a hidden melody was to add NOISE to it — and you
played the noise level like an instrument?

## How the SR engine works
The melody is synthesized very quietly, at or below comfortable audibility. On
its own it is hard to hear cleanly. A broadband noise source (band-shaped around
the melody's region) is added on top, and its gain is your instrument.

Perceptual emergence is modelled as a resonance curve — clarity as a function of
noise level. It is an inverted-U (a Gaussian in the noise control) centered on a
slowly drifting sweet-spot: too little noise and the signal stays sub-threshold
(clarity ~0); at the sweet-spot the faint signal rides the noise into perception
(clarity ~1); too much noise masks it again. That non-monotonic "more noise
helps, up to a point" shape is stochastic resonance. Clarity nudges the melody's
amplitude so the bloom is unmistakable, while real added noise does most of the
unmasking, and it drives the visual field.

## References
- Krauss et al., "The Stochastic Resonance model of auditory perception,"
  bioRxiv 2020 — unifies tinnitus, the Zwicker tone illusion, and residual
  inhibition under sub-threshold signals lifted by internal noise.
- Predictive-coding + stochastic resonance (arXiv:2204.03354).
- The Ganzfeld / sensory-deprivation lineage: uniform noise fields breed
  phantom percepts at the threshold of sleep (the hum, hypnagogic sound).

## How to play it
Press Start (unlocks audio). Drag the big noise dial up and down, or focus it
and use the arrow keys, to hunt for the sweet-spot. Watch the clarity meter and
listen for the melody to shimmer into being; the field coheres into luminous
filaments as you close in. The sweet-spot drifts, so the hunt keeps moving. Let
go and the piece auto-sweeps to demonstrate itself hands-free.

## What's unfinished
- The perceptual boost is a modelled nudge, not a true per-listener threshold;
  calibration to headphones/room would sharpen it.
- Noise band shaping is fixed; tracking it to the current note could deepen SR.
- No recording / seed sharing of a found sweet-spot.
`;
