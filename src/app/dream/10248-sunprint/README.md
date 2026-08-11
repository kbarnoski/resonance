# 10248 · Sunprint

## The one question

**What if your phone camera were a sheet of light-sensitive plant dye — and pointing it at the world slowly *developed* a warm anthotype photogram that sings as it forms?**

## Concept

An **anthotype** is a 19th-century photographic process: a sheet coated in crushed-flower or plant pigment — marigold, beet, turmeric — is exposed to light for hours. Bright light *bleaches* the dye while shadows stay saturated, printing a warm monochrome image in marigold, sepia and rust tones. **Mary Somerville made the first anthotypes in 1842**, and in the same window **Anna Atkins began her cyanotype photograms (1843)** — the "*Photographs of British Algae*" that founded photogram practice. This prototype stands in that lineage but simulates the process *time-lapsed and sped up*, developing live from the camera feed in roughly twenty-five seconds instead of hours.

## Technique

- **Luminance-driven cumulative bleach.** Each camera frame is downsampled to a 160×120 luminance plate. Per pixel, brightness (weighted `0.299 R + 0.587 G + 0.114 B`, raised to emphasise highlights) is *integrated over time* into a bleach value that only ever climbs — the plate has **memory**. Highlights race toward pale cream; shadows hold their saturated oxblood. A slow **re-coat** is the only reset, and it leaves a faint pigment memory rather than a clean wipe.
- **Warm photochemical ramp (the art layer, WebGL).** The bleach plate is uploaded each frame as a texture and rendered through a warm ramp: deep oxblood → umber → rust → marigold → amber → bleached cream, over a fibrous paper mottle, animated photochemical grain, a warm vignette, and a marigold **developing bloom** on freshly-resolving edges (carried in the texture's green channel as this-frame change).
- **Change-rate sonification (Web Audio).** The summed per-frame *rate of change* of the plate drives the sound. As edges resolve, soft **slightly-inharmonic mallet/kalimba tones** ring — free-free bar partial ratios (`1 : 2.76 : 5.40 : 8.93`) over equal-tempered, octave-stretched, per-hit-detuned fundamentals, deliberately **not** a just-intonation consonance lattice. Underneath sits a low warm **wood drone** (a root, a wide fifth, a stretched octave, with a slow breathing LFO and a filter that opens as development quickens). Faster development = denser, louder shimmer; the drone **never falls silent** while running.

## Input / output / degrade

- **Input:** live `getUserMedia` video (rear camera preferred), sampled to luminance. Interaction: *Start camera*, *Re-coat plate*, *Stop*.
- **Output:** a full-screen developing warm photogram + continuous warm audio (wood drone bed + change-driven mallet shimmer).
- **Degrade — no camera / permission denied:** falls back to a **seeded, deterministic** synthetic light source — slow-moving procedural bright blobs from `mulberry32(0x10248)` (no `Math.random`, no `Date.now`) — so a muted or denied phone still watches a photogram form and hears it sing. A badge reads *"camera unavailable — self-developing"*.
- **Degrade — no WebGL:** an on-brand `text-destructive` notice, and the warm audio bed still plays.
- **Cleanup:** on unmount the camera track is stopped, the AudioContext is faded and closed, and the animation frame is cancelled.

## Next-cycle deepening

1. **Multi-pigment coatings.** Let the viewer pick a base dye (marigold / beet / turmeric), each with its own bleach speed and hue ramp, so different flowers "print" the same scene at different rates and colours — a true anthotype palette.
2. **Fixing & the archival print.** Add a "fix" gesture that freezes the current plate into a settled, slightly-faded keepsake print (anthotypes are famously *unfixable* and keep fading in light) — and let the shimmer decay into a single held resonance as the image locks, turning the ephemerality of the real process into the ending of the piece.
