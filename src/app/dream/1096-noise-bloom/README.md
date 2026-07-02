# Noise Bloom

**A melody hidden below hearing — add noise to bring it into being.**

Route: `/dream/1096-noise-bloom`

- **state:** hypnagogia / sensory-deprivation threshold
- **pole:** eerie-liminal
- **input:** one large noise-level dial (drag vertically or arrow keys)
- **output:** audio-first + a minimal Canvas2D field that mirrors the emergence
- **technique:** stochastic resonance (sub-threshold signal + tunable noise)
- **vibe:** hypnagogic / liminal / threshold-of-sleep

## The one question

What if the only way to HEAR a hidden melody was to add NOISE to it — and you
played the noise level like an instrument?

## How the stochastic-resonance engine works

The melody is synthesized very quietly (`audio.ts`), at or just below
comfortable audibility — a slow phrase in D Dorian played on soft triangle +
octave-sine voices with gentle attack/release, looping with small per-cycle
variation so minute 3 differs from minute 0. On its own it is hard to hear
cleanly.

A broadband white-noise buffer, band-shaped (bandpass ~720 Hz) around the
melody's spectral region, is added on top. **Its gain is your instrument.**

The perceptual emergence is modelled explicitly rather than left to chance.
`resonanceClarity(noise, center)` returns a `clarity` value as a function of the
noise-level control:

- an **inverted-U** — a Gaussian in the noise control centered on a slowly
  drifting sweet-spot;
- multiplied by a hard **sub-threshold floor** below ~0.1 noise, so at very low
  noise the signal is genuinely inaudible.

So: too little noise → `clarity ≈ 0` (silence / faint hiss); at the sweet-spot →
`clarity ≈ 1` (the faint signal rides the noise into perception); too much noise
→ `clarity` falls again as the noise masks it. That non-monotonic "more noise
helps, up to a point" shape *is* stochastic resonance. Because random noise
supplies the extra energy that pushes a sub-threshold signal over the detection
threshold, adding noise can *increase* the effective signal-to-noise the
listener perceives.

`clarity` does two things: (a) it modestly boosts the buried melody's amplitude
so the bloom is unmistakable — but real added noise does most of the unmasking —
and (b) it drives the visual field. The sweet-spot itself drifts slowly (the
threshold "breathes"), so the hunt stays alive.

## The visual mirror (`render.ts`)

A dark grain field. At low clarity the particles scatter as pure static; as
clarity climbs toward the sweet-spot they cohere into slow drifting luminous
filaments and a central bloom that pulses with each emerging note; past the
sweet-spot they dissolve back into chaos. All motion is slow luminance /
coherence drift, well under 3 Hz — no strobe or flicker.

## References

- **Krauss et al., "The Stochastic Resonance model of auditory perception,"
  bioRxiv 2020** — proposes internal noise lifting sub-threshold signals across
  the detection threshold, unifying tinnitus, the Zwicker tone illusion, and
  residual inhibition.
- **Predictive coding + stochastic resonance (arXiv:2204.03354)** — noise as an
  active ingredient in perceptual inference near threshold.
- **The Ganzfeld / sensory-deprivation lineage** — uniform, featureless noise
  fields breed phantom percepts at the threshold of sleep (the hum, hypnagogic
  sound); this piece stages that liminal edge.

## How to play it

1. Press **Start listening** (this unlocks the AudioContext inside the gesture —
   required on iOS).
2. Drag the big noise dial up and down, or focus it and use the arrow keys
   (`PageUp`/`PageDown` for bigger jumps), to hunt for the sweet-spot.
3. Watch the **clarity meter** and the violet **sweet-spot marker** on the dial;
   listen for the melody to shimmer into being as the field coheres.
4. Let go and, after a few seconds, the piece resumes an **auto-sweep** that
   demonstrates itself hands-free — it eases the noise up through the sweet-spot
   and back so the melody blooms out of static with zero interaction.

## What's unfinished

- The perceptual boost is a modelled nudge, not a true per-listener threshold;
  calibrating to headphones/room would sharpen the effect.
- The noise band is fixed; tracking it to the current note could deepen the SR.
- No recording or seed-sharing of a found sweet-spot.
