# 16688 · albumvoyage

A living-manuscript loop-station where writing a long enough manuscript walks you through the form of Karel's **whole album** — track by track — and a slow read-drift walks the choir deeper through it over minutes, even when you stop typing.

**Status:** demoable — album-roll + read-drift + filmstrip working; `tsc` + ESLint clean; not yet reviewed on device.

## What it is

A deepening of `16672-scriptorium`. You type lines; each committed line becomes a looping voice whose words play as enveloped slices of one of Karel's real "Welcome Home" piano recordings (prosody, not meaning: word length → slice duration, letters → offset within the line's region, vowel ratio → brightness/register, punctuation → accents/rests). Lines of different lengths loop at different cycles and phase against one another (Reich). scriptorium read ONE recording; albumvoyage reads the whole album, rolling from track to track as the manuscript grows and drifting deeper by time.

## The three deepening moves

1. **Album-roll (real long-form state).** Instead of one buffer, the engine loads Karel's album `WELCOME_HOME_TRACKS` in running order, decoding tracks on demand. Each track has a line budget (`LINES_PER_TRACK = 4`). Line *i* of the manuscript belongs to track `floor(i / 4)`; within that track its *m* assigned lines split THAT recording into regions `[k/m, (k+1)/m]`, so a track's voices still sweep it opening→end. As the manuscript grows past a track's budget the newest lines roll onto the **next recording** — a short manuscript reads inside the opening track ("Interplay"), a long one (capped at `MAX_LINES = 16`, ~4 tracks) literally traverses several. Adding/removing a line re-slots the whole ensemble, and the track after the deepest used one is **preloaded** so a roll is seamless.

2. **Read-drift (long-form evolution — minute-5 ≠ minute-1 by TIME).** A slow, always-on migration rides on top of scriptorium's per-loop golden grain step: over minutes each voice's read position ramps forward through its region, wrapping at the region edge, at a user-adjustable rate (the **Read-drift** slider — still ↔ a full region sweep in ~2–6 minutes, keyed off the shared `ctx` clock so all voices migrate coherently). Leave the page running without typing and the piece is audibly different at minute 5: the choir has walked deeper into the album.

3. **A legible album filmstrip (DOM/CSS only).** A horizontal filmstrip replaces scriptorium's single-piece ribbon: one cell per track that has any line assigned, each cell showing the track number + title, its voices' region blocks, and their live playheads migrating with the read-drift (plus a per-track load state). A visitor — or Karel at a 06:30 phone glance — can SEE which recording and which region each voice is reading right now, and watch the playheads walk. The manuscript surface itself is split by thin track dividers so the roll from recording to recording reads by eye too.

## Also

- **Harmonic tint (subordinate, optional).** When a track's `loadTrackAnalysis` resolves, each voice is tinted by the chord (`chordRoot` → `pitchClassHue`) sounding at its migrating read position — glyph bloom, region block, and playhead all pick up the hue. Degrades silently to the house violet if analysis returns null.
- **Shareable / persistent score.** The manuscript persists to `localStorage` (try/catch) and encodes into the URL hash (`#s=<base64>`) via "Copy score link". The drift rate persists too. Restore order: URL hash → localStorage → a 3-line seed manuscript (so the piece is alive on the first gesture; a restored score wins).

## Constraints honoured

- Audio source is Karel's real catalog only (`WELCOME_HOME_TRACKS` / `loadRealTrackBuffer`); every sound is a slice of his decoded `AudioBuffer`s. No oscillator, no noise, no synth. Track IDs come only from `welcomeHome.ts`.
- Every audible node terminates in `createSafeMaster(ctx).input`; visuals are driven from `master.analyser`. Nothing connects to `ctx.destination`.
- Surface is DOM/CSS typography only — no `<canvas>`, WebGL, WebGPU. No film grain, no strobe; only slow transitions, RMS-scaled bloom, and minute-scale playhead drift.
- Full teardown on unmount: scheduler interval cleared, all sources/gains/panners stopped + disconnected, `master.disconnect()`, `ctx.close()`, `cancelAnimationFrame`.
- Graceful degradation: if NO album track decodes, a legible `text-destructive` notice is shown; a track that fails to decode reads "no audio" in the filmstrip while its neighbours still sound; if analysis fails, the tint is skipped.
- No API route, no new npm dependencies. No drug/substance references — this is art about altered states via sound alone.

## Named references

- **Steve Reich** — phase music (*Piano Phase*, *Music for 18 Musicians*): lines of unequal loop length drift against one another rather than locking to a grid.
- **Brian Eno, *77 Million Paintings*** / long-form generative music (*Music for Airports*, *Reflection*): the read-drift is the generative long-form move — a system that is meant to be left running and is different every time you return to it, minute-5 ≠ minute-1 by elapsed time, not by input.
- **2026 score-following / audio-to-score literature** — real-time alignment of a written surface to positions in a recording, extended here from one piece to a whole album: writing-as-navigation through the *form of an entire record*, with the filmstrip as the live alignment display.
