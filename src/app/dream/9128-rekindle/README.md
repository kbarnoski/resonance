# 9128-rekindle

**Transcribe a piano recording, then hear it reharmonized.**

Route: `/dream/9128-rekindle`

## The one question

What if you could drop in a real piano recording, have a neural net transcribe
it to notes live in your browser, and then hear it **reharmonized** — the same
melody re-voiced under a new harmony you steer?

## What it is

- **Input — an audio file.** Drag & drop or pick any WAV/MP3, or press
  **“Try a Resonance recording”** to pull piano audio from the existing
  same-origin, read-only route `GET /api/audio/[id]` (it probes a few ids and
  degrades gracefully if none are reachable).
- **Neural transcription.** Spotify’s [`@spotify/basic-pitch`](https://github.com/spotify/basic-pitch-ts)
  (a small TF.js model) transcribes the audio into note events — pitch, onset,
  duration, velocity. The audio is resampled to mono @ 22.05 kHz in an
  `OfflineAudioContext` before it hits the model.
- **Reharmonization (the fresh verb).** The key is estimated with a
  Krumhansl–Schmuckler pitch-class correlation, then a **new** functional chord
  progression is generated beneath the preserved melody using the
  [`tonal`](https://github.com/tonaljs/tonal) music-theory library — ii–V
  insertion, modal interchange, tritone substitution and open/pedal-ish
  voicings. Steer it with four styles (**Warm / Modal / Cinematic / Sparse**)
  and a **harmonic-density** slider.
- **Output — an inline SVG piano-roll** in a cream/ink illuminated-manuscript
  palette: melody notes as ink blocks on top, reharmonized chords as sepia/gold
  blocks beneath, with a sweeping play-head. The reharmonization is **visible on
  a muted phone** — change the style or density and watch the chord layer morph.
- **A/B playback.** Web Audio soft-FM voices play the melody plus the new
  harmony (**Reharmonized, A**) or the bare melody alone (**Original, B**). No
  drone bed — every voice is note-gated.

## How to use it

1. The page auto-runs a **seeded, silent demo** on the built-in phrase — the
   piano-roll animates and reharmonizes within ~1s, no audio and no model
   download required.
2. Pick a **style** and drag the **density** slider; the SVG updates live.
3. Tap **Play** (first tap starts audio). Toggle **A / B** to compare.
4. Press **Try a Resonance recording** or drop your own file to run real neural
   transcription.

## Determinism

All randomness comes from `mulberry32(0x9128)` (see `prng.ts`). There is no
`Math.random()` or `Date.now()` anywhere; timing uses `performance.now()` and
`AudioContext.currentTime`.

## Files

- `page.tsx` — UI, SVG piano-roll, seeded visual demo, playback wiring.
- `transcribe.ts` — basic-pitch wrapper (dynamic import), resampling, the
  built-in fallback phrase, melody extraction.
- `reharmonize.ts` — key estimation + functional reharmonization via `tonal`.
- `audio.ts` — Web Audio FM/additive synth engine (created on first gesture).
- `prng.ts` — seeded mulberry32 PRNG.

## Named references

- Bittner, Bosch, Rubinstein, Meseguer-Brocal, Ewert, *“A Lightweight
  Instrument-Agnostic Model for Polyphonic Note Transcription”*, ICASSP 2022 —
  the model behind Spotify `basic-pitch`.
- Functional-harmony reharmonization practice (ii–V insertion, tritone
  substitution, modal interchange, chromatic mediants).
- `tonal` — the JavaScript music-theory library used for chord spelling.

## Honest limitations

- **Model download may be slow or blocked.** basic-pitch fetches its TF.js
  weights from a CDN at transcribe time. On slow networks, offline, or behind a
  strict CSP/proxy this can fail — the piece then falls back to the built-in
  phrase and says so (in `text-destructive`). The demo, reharmonizer and
  piano-roll never depend on the model.
- **`/api/audio/[id]` may not resolve.** The route serves signed Supabase URLs;
  ids can be 404s and the cross-origin signed URL can be blocked by CORS. On any
  failure the prototype tells you and keeps the built-in phrase.
- **Transcription is monophonic-melody-focused.** basic-pitch is polyphonic, but
  we greedily extract a single melody line to reharmonize, so dense chordal
  recordings lose inner voices.
- **Key estimation is heuristic.** Short or ambiguous phrases can be mis-keyed;
  the reharmonization still produces a coherent, if unexpected, progression.
