# 16720-cadencemap — a walkable map of Karel's harmonic form

Karel's real chord progression for the **whole album**, laid out as a walkable DOM map — one row per track, each chord a labelled cell placed by time — with every line you write becoming a voice-marker that sits ON the chord it is currently reading, walks the progression as it drifts, and is gently tuned into consonance with it.

**Status:** demoable — harmonic map + walking markers + cell highlighting + harmonic tuning all wired; `tsc --noEmit` clean and `eslint` clean on the folder. NOT verifiable headless: whether the chords audibly *snap into consonance*, whether the markers read as walking Karel's real form on a real screen, and whether the whole-album map is legible at typical viewport sizes all need a device with the live `/api/audio` + `/api/recordings/*/analysis` endpoints and Karel's decoded audio. No automated audio/visual check was run.

## What it is

A deepening of `16688-albumvoyage`. albumvoyage rolls a written manuscript across Karel's whole "Welcome Home" album (4 lines per track, capped at 16), reads a region of each line's assigned track, migrates every voice's read position over minutes with an always-on **read-drift**, and tints each glyph's hue to the chord at its read position. cadencemap keeps **all** of that and re-frames it: the harmony, buried in albumvoyage as a per-glyph hue, becomes the **headline object** — a walkable harmonic map.

Every sound is still a slice of Karel's decoded recordings (prosody, not meaning: word length → slice duration, letters → offset within the region, vowel ratio → brightness/base transpose, punctuation → accents/rests). Lines of different lengths loop at different cycles and phase against one another (Reich).

## The two deepening moves

1. **The harmonic map (the headline).** At boot the engine fetches `loadTrackAnalysis` for **every** album track (a light JSON fetch — no audio decode needed), so the whole record's `TrackChord[]` is available up front. The page renders it as a stacked map: one row per track, each chord a cell positioned `left = time/trackLen`, `width = duration/trackLen`, labelled with its symbol (`font-mono text-xs`) and tinted by `pitchClassHue(chordRoot(symbol))` around the circle of fifths (minor chords darker via `chordIsMinor`). Tracks with voices are emphasized (`border-primary/50`); the rest are dim context. Each committed line is a **marker** sitting at its migrating read position (`readFrac`) on its track's row; as the read-drift migrates, the marker **walks** the progression, and the chord cell under it is **highlighted** (ringed + brightened) each frame. Because a decoded track's `trackLen` equals its buffer duration, the marker and the engine-reported `chordIndex` always land on the same cell.

2. **Harmonic tuning (so the map is heard).** In `scheduleSlice` each slice's `playbackRate` is pulled toward consonance with the chord at its exact read position: take the prosodic rate's implied semitone offset `12·log2(rate)`, find the nearest octave-equivalent member of the chord's triad pitch-class set (major `{root, +4, +7}`, minor `{root, +3, +7}`, mod 12), blend the offset toward it by the tuning amount, convert back with `2^(semi/12)`, and clamp to `0.6..1.7`. A **Harmonic-tuning** slider sets the pull from `0` (pure untuned prosody) to `1` (snapped to the chord). A track with no chord analysis falls back to the untuned prosody rate and reads "no analysis" on the map — never silent, never a crash.

## Controls

- **Read-drift** slider (kept from albumvoyage): still ↔ a full region sweep every ~2–6 minutes; the migration is keyed off the shared `ctx` clock so all voices walk coherently, and minute-5 differs from minute-1 by *time*.
- **Harmonic tuning** slider (new): how hard slices are pulled into the sounding chord.
- Per-line **mute / solo / remove**; **Copy score link** (`#s=<base64>`); **Clear manuscript**.

## Constraints honoured

- **Audio = Karel's real catalog only** (`WELCOME_HOME_TRACKS` / `loadRealTrackBuffer`); every sound is a slice of his decoded `AudioBuffer`s. No oscillator, no noise, no synth.
- **safeMaster required:** every audible node terminates in `createSafeMaster(ctx).input`; the glyph/marker bloom is driven from `master.analyser` RMS. Nothing touches `ctx.destination`.
- **Surface is DOM/CSS + animated typography only** — no `<canvas>`, WebGL, or SVG art. The harmonic map is divs (grid/flex/absolute cells + markers). Chrome uses semantic tokens; raw `hsl` appears only inside the art (chord-cell tints, glyph bloom, marker colors).
- **No new phasing mechanics** — albumvoyage's lookahead loop-station scheduler is untouched; the deepen is the map + tuning.
- No film grain, no strobe — only slow transitions, RMS-scaled bloom, and minute-scale marker drift.
- **Full teardown** on unmount: scheduler interval cleared, all sources/gains/panners stopped + disconnected, `master.disconnect()`, `ctx.close()`, `cancelAnimationFrame`.
- **Degrades gracefully:** no album track decodes → `text-destructive` notice; a track that fails to decode reads "no audio"; a track with no analysis reads "no analysis" and its voices stay untuned.
- **Persistence:** manuscript + drift + tune persist to `localStorage` (all try/catch); the manuscript encodes into the URL hash for sharing; a 3-line seed keeps a cold open alive. No API route, no new dependencies. No drug/substance framing — art about altered states via light + sound alone.

## Named references

- **Steve Reich** — phase music: lines of unequal loop length drift against one another.
- **Brian Eno** — long-form generative music left running and different each return; the read-drift is that move, here made *legible* as markers walking a score.
- **Score-following / audio-to-score alignment** — a written surface aligned to positions in a recording, extended from one piece to a whole album, with the harmonic map as the live alignment display; the harmonic tuning treats Karel's chord track as a moving tonal target the voices are pulled toward.
