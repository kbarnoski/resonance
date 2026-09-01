# 16672 · scriptorium

A living-manuscript loop-station where writing walks you through the ARC of a single one of Karel's recordings: each committed line reads from a later region of the piece than the line above it, and no word ever cuts the same grain twice.

**Status:** demoable — audio + form ribbon + shareable score working; not yet reviewed on device.

## What it is

A deepening of `16656-tonguescript`. You type lines; each committed line becomes a looping voice whose words play as enveloped slices of ONE of Karel's real piano recordings (prosody, not meaning: word length → slice duration, letters → offset within the line's region, vowel ratio → brightness/register, punctuation → accents/rests). Different line lengths → different loop cycles → Reich-style phasing polyphony. The whole score persists and can be shared.

## The three deepening moves

1. **Form-voyage / real state.** There is exactly ONE decoded buffer — the manuscript's piece (title track "Welcome Home", with fallbacks). With `L` lines committed, the line at slot `N` reads only from region `[N/L, (N+1)/L] * bufferDuration`. So the first line reads the opening of his piece and each later line reads deeper; committing a new line **re-slots** every voice so the ensemble always spans opening→end. The voyage is deterministic per (text, slot), so a restored/shared manuscript sounds the same. This is what makes minute-5 genuinely ≠ minute-1: the choir sweeps through the form of his recording as you write, not just layers more voices.

2. **Per-word slice variation (non-repetition).** A repeated word does not sound identical each loop. Pitch, brightness and duration stay keyed to the word (identity kept), but the read offset advances a golden-ratio step (`cycle * φ · 0.5`) every loop cycle, wrapping inside the line's current region — so the grain of piano it cuts drifts and the loop breathes rather than ticks.

3. **Stereo placement per line.** Each voice sums through a per-line `GainNode → StereoPannerNode → master.input`. Pan is derived deterministically from the line's slot (spread across the field) nudged by its vowel density, so the manuscript reads as a spread choir. Pan re-places smoothly on re-slot.

## Also

- **Shareable / persistent score.** The manuscript persists to `localStorage` (try/catch) and encodes into the URL hash (`#s=<base64>`) via "Copy score link", so a score can be copied, shared, and restored note-for-note on load. Restore order: URL hash → localStorage → a 3-line seed manuscript (so the piece is alive on the first gesture).
- **Form ribbon (DOM/CSS only).** A horizontal timeline of the whole piece (opening→end) with one lane per line: a region block showing where that voice reads, and a live playhead marker of the exact grain sounding now. The sounding word in each line brightens in time with its loop (glyph playhead), bloom scaled by the master analyser RMS.

## Constraints honoured

- Audio source is Karel's real catalog only (`loadRealTrackBuffer` / `REAL_TRACKS`); every sound is a slice of his one decoded `AudioBuffer`. No oscillator, no noise, no synth.
- Every audible node terminates in `createSafeMaster(ctx).input`; visuals are driven from `master.analyser`. Nothing connects to `ctx.destination`.
- Surface is DOM/CSS typography only — no `<canvas>`, WebGL, WebGPU. No film grain, no strobe; only slow transitions and RMS-scaled bloom.
- Full teardown on unmount: scheduler interval cleared, all sources/gains/panners stopped + disconnected, `master.disconnect()`, `ctx.close()`, `cancelAnimationFrame`.
- Graceful degradation: if no candidate piece decodes, a legible `text-destructive` notice is shown.

## Named references

- **Steve Reich** — phase music (*Piano Phase*, *Music for 18 Musicians*): lines of unequal loop length drift against one another rather than locking to a grid.
- **Cornelius Cardew, *Treatise*** (1963–67) — the 193-page graphic score with no fixed notation legend; the form ribbon and word-glyph playheads are read as a graphic score of where each voice is in the piece.
- **2026 cross-modal & score-following literature** — text→sound prosody mapping and real-time alignment of a written surface to positions in an audio recording (score following / audio-to-score voyage), applied here as writing-as-navigation through the form of a recording.
