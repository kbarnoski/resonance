# Earwell

**Status**: demoable

Earwell lets you walk through the harmony of one of Karel's piano recordings by ear alone. A ring of resonant "stations" surrounds a cursor; each station is a distinct chord region of the piece, and as you sweep the cursor toward one, that region's harmony blooms in your ears. The one question it answers: _what if you could navigate INTO a recording by ear — hearing which part of its harmony you're standing nearest, instead of only looking at a waveform?_

## How it works

**One source, many ears.** A single looping `AudioBufferSourceNode` of Karel's real take is the only sound in the piece — there are zero oscillators. That one source is fanned out in parallel into a set of per-station bandpass banks.

**The station ring.** The track's analyzed chord timeline is collapsed into distinct regions: the weightiest distinct chord symbols by total sounding duration, re-ordered by first appearance, targeting roughly 8–14 stations. Each station gets a small bank of `BiquadFilter` nodes (`type="bandpass"`) tuned to that chord's triad — root, third (flat third for minor), fifth — spread across octaves 3–5. Each bank is summed into a per-station `GainNode`, then a `StereoPanner` whose pan follows the cosine of the station's angle on the ring, so the harmony is spatialized to where it sits in the circle. Everything terminates at `createSafeMaster(ctx).input` — never `ctx.destination`.

**Proximity gating.** The cursor has an angle around the ring. Each station's gain is gated by a wrap-aware Gaussian falloff of the angular distance between the cursor and that station, smoothed with `gain.setTargetAtTime(target, ctx.currentTime, 0.1)`. The weights are normalized so total loudness stays roughly constant — so sweeping the cursor crossfades _which_ harmonic region you hear emphasized rather than just turning things up and down. Pointer is the primary control (sweep to set the angle); arrow keys nudge it; when you stop interacting, the cursor auto-drifts so the piece is never silent or static.

**Haptic + visual echo.** When the nearest station changes, a guarded `navigator.vibrate(14)` fires — a silent no-op on desktop — and an expanding, fading SVG pulse circle blooms at that station, so desktop viewers _see_ the crossing that mobile users _feel_. The visual is deliberately minimal (a ring, station arcs and labels brightened by live gain, a cursor dot and needle, a faint core breathing with the master analyser) in violet and bone-white on near-black: the sound is the art.

**Graceful degradation.** If the track has no analysis, the same ring is built from 8 log-spaced spectral bands (120 Hz → 6 kHz) with identical interaction. If the audio fails to load, a designed error state appears instead of a crash.

## References

Earwell belongs to a lineage of **sonification-first** work that treats listening as the primary channel rather than an accompaniment to a picture:

- **maidr** — a Web Audio sonification toolkit that renders charts and data as navigable sound, so structure is explored by ear; Earwell borrows its conviction that an audio cursor can _be_ the interface.
- **Tintinnabulum** — event-streams rendered simultaneously to sound and light, where crossing an event is both heard and seen; kindred to Earwell's paired haptic-plus-visual echo on each region crossing.
- **Pixasonics** — an image-sonification instrument where you probe a region and _listen_ to it; conceptual kin to Earwell's "move a probe, hear the region" interaction, applied here to the harmonic regions of a recording rather than the pixels of an image.
