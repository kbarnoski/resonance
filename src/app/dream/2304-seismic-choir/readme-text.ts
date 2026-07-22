// Design-notes prose, shown verbatim in the in-app modal. Kept in sync with
// README.md.

export const README_TEXT = `Seismic Choir — the living Earth as carrier wave.

THE QUESTION
What if Resonance's carrier wave were the living planet itself — its real, in-the-last-hour earthquakes sung as a spatial cosmic-ambient choir?

WHAT YOU HEAR
Every earthquake currently on the USGS real-time feed becomes ONE sustained voice in an additive choir. The mapping is literal, not decorative:
· magnitude → loudness + fundamental pitch (bigger quake = deeper, louder drone)
· depth (km) → timbre, via a lowpass filter (deeper quakes sound darker)
· longitude → stereo position (the planet spread across the field)
· latitude → slight detune + harmonic shimmer (poleward = brighter)
New events fade in over ~1.5 s. There is deliberately NO master calm→peak knob: the Earth's real multi-event stream is the score. Some hours are sparse and still; some are crowded. You hear whatever the planet is doing right now.

WHAT YOU SEE
A slowly auto-rotating wireframe Earth in abyssal teal on near-black, with a glowing magma-amber marker at each quake's true lon/lat. Marker size scales with magnitude and gently pulses; color runs from bright amber (shallow) to deep ember (deep). Drag to orbit the globe; click any marker to SOLO its voice — it is foregrounded in the mix and spotlit with its stats (magnitude, place, depth, time). Auto-rotation resumes after you let go.

DATA
The USGS feed is keyless and CORS-open, fetched entirely client-side — no API route, no secret. It tries the last-hour feed, widens to the last-day feed if the hour is empty, and falls back to a small bundled snapshot if the network is unavailable, so the choir always sings. When the bundled sample is in use, a small status line says so.

SOUND SAFETY
At most the 24 loudest quakes sound at once. The whole mix runs through a DynamicsCompressor limiter at low master gain (≤ 0.2) with a 1 s fade-in, so even a dense seismic moment stays gentle. Sound only starts after you press Start.

TAGS
input = external live data (USGS) · output = three.js / WebGL globe · technique = real external-API sonification + additive spatial synthesis · palette = tectonic · pole = cosmic-ambient.

LINEAGE
The seismic-sonification tradition — IRIS "Seismic Sound Lab" and Ben Holtzman's work at Lamont-Doherty Earth Observatory — treats seismograms as sound to reveal the character of the Earth, rather than as metaphor.`;
