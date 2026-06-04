# 308 · Orbit Choir

**What if a spatial-audio piece had a _narrative over time_ — a circle of voices scattered in dissonance around your head that, over ~6 minutes, slowly orbit inward and converge — and you navigate / accelerate the resolution by turning your phone (head-tracking)?**

This is the lab's first audio-first / non-screen family member: a head-tracked HRTF spatial piece given a long-form, stateful arc. The room at minute 6 is different from the room at minute 0 — the scattering literally gathers while you stand in the middle of it.

## Cycle 2 — the voices are now Karel's own album (2026-06-04)

The original (cycle 1) was a synthesised resolving chord. **Cycle 2 replaces the seven synth voices with Karel's actual _Welcome Home_ piano recordings**, fetched live from the public `/api/featured` (which lists his featured album's track recording-ids) → `/api/audio/[id]` (which returns a signed URL for each). Each recording becomes one HRTF-panned voice: it starts scattered around your head, **detuned (a slowed/sharpened `playbackRate`) and dark (a low `lowpass` cutoff)** — a blurred, distant cluster of his own music — and over the arc each one **orbits inward, sharpens (cutoff opens), and settles to true pitch (`playbackRate → 1.0`).** You are literally gathering his album into a clear room around you.

Two more deepenings shipped this cycle:

- **Haptics (a lab first).** `navigator.vibrate` pulses a soft 26 ms buzz the instant a voice _you are facing_ locks home, and a short triple-pulse when the whole room resolves — a felt confirmation that one came home.
- **The room remembers (localStorage).** How far you'd gathered the room is persisted (`resonance.dream.orbit-choir.gather.v1`); return later and the idle button reads **"Return to the room"** with a "your room was N% gathered" note, and the arc resumes where you left it. "Begin again" deliberately clears it and re-scatters.

If `/api/featured` is unreachable or no track decodes (offline, private preview, CDN block), it **falls back to the original synthesised resolving-chord choir** so the piece is always demoable — the top label tells you which source is playing (`Karel's Welcome Home · N voices` vs `synthesised choir (album offline)`).

## How to use it

1. **Put on headphones.** The spatial field is rendered binaurally (HRTF) and collapses on speakers — two ears is the whole point.
2. **Tap "Begin the orbit."** On iOS this is where device-orientation permission is requested and the AudioContext is resumed (both must happen inside the tap).
3. **Turn your phone / turn your head.** The voice you face swells, and facing it gently nudges _its_ personal resolution forward — so you shepherd voices home and shape the pace of the convergence.
4. **No phone sensor (desktop)?** Drag left/right or use the arrow keys to rotate the listener. A slow auto-tour runs hands-free so the piece demos itself.
5. **Listen for ~6 minutes.** The voices start scattered and detuned into a soft cluster, then orbit inward to an even ring while their pitches glide into a warm chord. When everything resolves, the chord holds and a **Begin again** button appears.

A thin violet ring at the top fills with the arc; a `M:SS — state` label reads `scattered → drifting in → gathering → almost home → resolved`. The faint violet canvas is an orbital _map_ (listener at center, a facing marker, dim dots for the voices drifting together) — a guide, not the point. Keep your eyes closed if you like.

## The technique

- **Voices.** Up to 7 voices. With real stems each is a looping `AudioBufferSource` (one of Karel's decoded recordings, started at a staggered offset so they aren't phase-locked) → lowpass `BiquadFilter` (cutoff = the "blur/sharpen" axis) → per-voice `GainNode` (slow breathing LFO on its gain) → its own `PannerNode` (`panningModel = "HRTF"`). The synth fallback is instead 2–3 sine `OscillatorNode`s (fundamental + quiet octave/twelfth harmonics) per voice with a pitch glide.
- **Stem loading.** `loadStems()` fetches `/api/featured` (anon, no auth — the same public route the loved `227-paths-granular`/`163-paths-visualizer` use), picks the album whose name/artist mentions "welcome"/"karel" (else the first), spreads up to 7 tracks evenly across it, and `Promise.allSettled`s a per-track `/api/audio/[id]` → signed-URL → `fetch` → `decodeAudioData`. Any failure drops that track; <2 decoded → whole synth fallback. No API route is _created_ here, so no guard is needed (these are read-only GETs with no side effects).
- **Synthesized reverb.** A shared `ConvolverNode` whose impulse response is generated at runtime from decaying, lowpass-smoothed white noise — no audio files, no dependencies.
- **The 6-minute convergence state machine (long-form / stateful).** A per-frame scheduler interpolates several axes against an eased global clock:
  - **(a) Azimuth + radius** — each voice orbits from a scattered start azimuth (and a far radius) toward an _even_ slot on the circle (`i / count · 2π`) at a gathered-in radius. Position is written to the panner each frame.
  - **(b) Sharpening (stem mode)** — `playbackRate` glides from a detuned start (≈ ±0.5 semitone) to `1.0`, and the lowpass cutoff opens from ~540 Hz to ~6 kHz, so each recording goes from a warbling, muffled distance to clear and true. Facing a voice opens its cutoff further.
  - **(b′) Pitch (synth fallback)** — each voice glides from a cluster a semitone-ish off its target up to its **target chord tone** (a warm A natural-minor add9 — A2 · E3 · A3 · C4 · E4 · B4 add9 · G4 ♭7, deliberately _not_ C-major-pentatonic).

  So the spatial field and the timbre resolve _together_: the piece is audibly different at minute 6 than at minute 0. State lives in `useRef`s (AudioContext, voice nodes, yaw, rAF handle, last-save clock) and is fully torn down on unmount / "Begin again." A gather-progress value is written to `localStorage` ~every 4 s so the room resumes across sessions.
- **Head-tracking.** `DeviceOrientation.alpha` rotates the `AudioListener` forward vector. Both the modern AudioParam API (`listener.forwardX/Z`, `panner.positionX/Y/Z`) and the legacy method API (`setOrientation` / `setPosition`) are feature-detected and supported. The angular alignment between listener yaw and each voice's azimuth drives a "facing" value that (1) swells that voice's level and canvas dot, and (2) floors its personal resolution forward — turning your head shepherds voices home faster than the macro schedule alone.
- **Graceful degradation.** No DeviceOrientation / desktop → pointer-drag + arrow keys + slow auto-tour, with a `text-rose-300` notice that the sensor isn't active. No Web Audio → a readable `text-rose-300` notice.

## Named references

- **Janet Cardiff — _The Forty Part Motet_ (2001).** Forty singers recorded individually and played back through forty speakers placed in an oval you walk among, so the choir is _spatially exploded_ — you stand inside the music and lean toward one voice at a time. Orbit Choir's cycle-2 form is a head-tracked, in-the-skull _Forty Part Motet_ built from Karel's own seven recordings instead of forty singers. (Currently on tour — MIMOCA and the National Gallery of Canada, 2026.)
- **La Monte Young & Marian Zazeela — _Dream House_.** The sustained-tone field you can walk around inside; standing waves that change as you move your head. Orbit Choir is a moving, resolving _Dream House_ in your skull.
- **Éliane Radigue.** Glacially slow drift and beating between near-unison tones — the model for the cents-level detuning that resolves over minutes, not seconds.
- **Pauline Oliveros — _Deep Listening_.** The piece asks for attentional, ritual, whole-body listening rather than a glance at a screen.
- **Research backing:** head movement disambiguates generic, non-individualized HRTF localization (front/back and elevation confusions collapse once the listener turns) — see arXiv **2510.09161**. That is why head-turning is the core interaction, not a gimmick: it both _improves_ localization of each voice and _drives_ the resolution.

## Next-cycle deepening (cycle 3 candidates)

- **Per-voice "home" chimes / cross-fade.** When a recording locks home, briefly duck the others so the one that arrived is heard clearly for a beat — make the arrival legible, not just felt.
- **Visual: name the ring.** Render each voice's track title around the orbital map as it gathers, so the screen (still a footnote) becomes a quiet index of which piece is where.
- **Stem-aware harmony.** Read each track's `analyses.key_signature` from `/api/featured` and bias the scatter/resolve detune so the gathered room is _in key_ with itself — his album tuned to itself in space.
- **Real haptic patterns per arrival ordinal** — a richer buzz vocabulary as more voices come home (1st = single, last = the resolve triple), turning the phone into a progress instrument.
