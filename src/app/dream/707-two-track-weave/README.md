# 707 · Two-Track Weave

**The one question:** *What new music appears when two of Karel's pieces breathe
at once — and you can slide the balance anywhere between them?*

Choose any two recordings from the catalog. They play together, each looping,
each drawn as its own luminous ribbon — one warm, one cool — braided across the
dark. A single equal-power crossfade slider is the instrument: slide toward one
and its ribbon swells and brightens while the other recedes to a hush; every
point between is a duet that never existed before.

30 pieces × any pair × any balance = a generative chamber for his own music.

## How it works

- Two independent chains: each track → its own `createSafeMaster` (so neither
  voice, nor the blend, can turn harsh) → speakers.
- Both sources `loop = true`, started together. The crossfade maps to
  `setGain(cos)` / `setGain(sin)` — equal power, so total loudness stays steady.
- Each `safeMaster.analyser` (time-domain) draws its ribbon; ribbon amplitude
  scales with that voice's current gain, so the visual balance follows the audio.
- Canvas2D, additive braided waveforms.
