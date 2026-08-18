# 14928 · Livescore

**The one question:** What if Resonance rendered your music as a self-writing SCORE made of pure TYPE — no shader, no particles, no geometry — the words themselves becoming the visualization?

This is a deliberately un-pretty, text-only piece: the opposite register from the lab's shader-field norm. The entire image is Geist type on near-black. The palette is monochrome — near-black background, foreground and muted-foreground text — with violet (`text-primary`) as the single accent. No other hue.

## The type-as-score mapping

The audio is always one of Karel's real Welcome Home recordings, looped through one `createSafeMaster`. There is no synthesis anywhere. Each animation frame computes the playback position (context clock minus start time, modulo the buffer duration since it loops) and walks the track's analysis against it.

- **The hero chord.** The current chord is the last one in the analysis whose onset time has passed. It is written huge and violet at the center of the screen — a sans word, `clamp(3rem, 12vw, 9rem)`, `font-semibold tracking-tight`. When the chord changes it re-writes itself: a quick blur-and-scale-and-opacity transition via the Web Animations API, so it composes rather than snapping. Every frame it also **breathes** — its font weight (220–860) and a subtle scale are driven off a smoothed RMS read from the master analyser, so loud playing makes the word heavy and large, quiet playing makes it light and small. The word literally pulses with his touch.
- **Section caption.** The formal sections from the analysis summary are mapped evenly across the buffer duration (they carry only label and description, no timestamps). The current section label rides the top of the screen, small, uppercase, mono. If a section's description is short it is ghosted in dim beneath.
- **Melody scatter.** Notes whose onset falls within the last ~1.2 seconds are rendered as their note-names (MIDI mapped to name plus octave), scattered at positions seeded deterministically from pitch and time so they hold still rather than jumping each frame, fading with age at the frame edges. This is the melodic filigree around the hero chord.
- **Fixed readout.** A bottom mono strip reads key, tempo (BPM), meter, live dB (from RMS) and elapsed time.

## The fallback

If the track has no analysis, or its chord list is empty, the piece still stands. The hero word becomes a live spectral descriptor — the spectral centroid off the master analyser classified as BRIGHT, WARM or DARK — and the scatter tracks the strongest frequency bin mapped to its nearest note-name. The readout announces "spectral fallback". The screen is never blank or broken.

## Reference

The named reference is Norman McLaren's *Synchromy* (1971), in which music was rendered as visible marks striped directly onto the film — sound made literally readable. Livescore is its typographic descendant, and it sits in the current-year lineage of animated-text lyric scores, where the words themselves carry the motion of the music rather than illustrating it from the side.
