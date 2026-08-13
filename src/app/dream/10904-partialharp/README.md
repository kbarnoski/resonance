# 10904 · Partial Harp

**The one question:** *What if you could SEE the individual harmonic threads inside a
piano recording — and pull one out to silence just that overtone?*

A sound is not one thing. A struck piano note is a bundle of gliding sine tones —
partials — each with its own frequency and its own fading loudness. Partial Harp
decomposes an audio input into those partials in real time, draws each one as a
luminous horizontal thread scrolling across the screen (x = time, y = log-frequency,
brightness = that partial's amplitude), and lets you reach in and mute a single
thread. Because the piece *re-synthesizes* the tracked partials with oscillators,
muting a thread audibly subtracts that one overtone from the sound.

## How it works — the McAulay–Quatieri sinusoidal model

This is a live implementation of the classic **McAulay–Quatieri (1986) sinusoidal
model** — the lineage behind analysis/resynthesis tools like **SPEAR** and IRCAM's
**Loris**. Three stages run every animation frame (`engine.ts`):

1. **Analysis.** A 4096-point FFT (`AnalyserNode.getFloatFrequencyData`) gives the
   spectral magnitude. We peak-pick local maxima above a floor, and **parabolic-
   interpolate** each peak (a quadratic fit over the three dB bins around it) for a
   refined, sub-bin frequency estimate. The loudest ~48 peaks survive.

2. **Partial tracking (the MQ step).** This frame's peaks are matched to the
   previous frame's active partial tracks by **nearest log-frequency within a
   tolerance** (~half a semitone), loudest tracks claiming first. Matched tracks
   glide to the new peak; **unmatched old tracks DIE** (their amplitude is driven to
   zero and they fade out); **loud unmatched peaks are BORN** as new tracks. A capped
   pool of ~40 tracks holds the strongest partials, each carrying
   `{ id, freq, amp, age, missing, bucket, silenced }`.

3. **Resynthesis.** A pre-allocated bank of 40 oscillators re-creates the sound: each
   active track owns one oscillator whose frequency and gain follow the track,
   smoothed with `setTargetAtTime`. A silenced track's oscillator gain goes to 0 — so
   you literally hear the sound with one overtone removed. All oscillators route
   through the shared safe-master limiter; nothing touches `ctx.destination` directly.

**Rendering.** Each track keeps a short history of `{ time, freq, amp }` samples,
drawn as a glowing polyline that scrolls left as time passes. Colour runs violet
(quiet/fresh) → gold (loud) on near-black; newly-born threads bloom in, dying ones
fade. Brightness changes are eased and there is no full-field flashing;
`prefers-reduced-motion` lowers glow and motion amplitude.

## The interaction

- **Start · play built-in phrase** — a seeded, self-contained piano-ish arpeggio
  (`mulberry32(0x10904)`) so the piece self-demos with zero input, even on a muted
  phone. The threads begin animating on mount; audio unmutes on the first gesture
  (autoplay policy).
- **Drop / choose an audio file** — decode any WAV/MP3/OGG and watch its partials.
- **Hover** a thread to read its frequency; **click to MUTE** that overtone;
  **shift-click to SOLO** it (silence all others). Mute/solo are keyed to the
  partial's semitone *bucket*, so the selection survives as tracks are reborn.
- **Clear mutes / solo** resets the selection.

Mute state is keyed by frequency bucket rather than transient track id, which is why
silencing "the third harmonic" keeps holding even as that partial is continuously
re-tracked note to note.

## Cycle-2 deepening

- **Real piano source.** Wire Karel's recorded solo-piano phrases in as the analysis
  source (fully offline; no network dependency), so you're dissecting a real
  performance rather than a synthetic phrase.
- **Per-partial pitch-bend / transpose.** Since each partial owns an oscillator,
  a dragged thread could retune or transpose a single overtone — recomposing the
  timbre by hand.
- **Export the reduced sound.** Render the current (muted/soloed) resynthesis to a
  WAV via `OfflineAudioContext` so you can keep the sound you sculpted.

## Tags

input = audio-file · output = Canvas2D · technique =
sinusoidal-partial-tracking (McAulay–Quatieri) · palette = intimate-luminous,
violet → gold on near-black.
