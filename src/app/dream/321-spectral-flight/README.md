# 321 · Spectral Flight

**The one question:** *What if you could fly through the INSIDE of Karel's own
recording — his* Welcome Home *piano rendered as a navigable 3D spectral
landscape you pilot in sync with playback?*

You press one button, his recording is fetched and decoded, the **whole track**
is run through a hand-written offline STFT into a time × log-frequency magnitude
grid, and that grid is built into a three.js point-cloud landscape. The camera
then flies forward along the time axis, its position locked to playback. You
drag or use the arrow keys to steer the look and bank into turns. It should feel
like piloting through a galaxy made of his playing.

---

## How it works (the four subsystems)

1. **Real-stem fetch + decode** (`audio.ts`)
   - `GET /api/featured` → array of albums. Picks the album whose
     `name + artist + description` matches `/welcome|karel/i`, else the first.
   - Collects recording objects from `featured_album_tracks[].recordings`
     (handles both a single object and an array), picks the first with an `id`.
   - `GET /api/audio/<recordingId>`. If the response is JSON it reads `{url}`
     and fetches that; otherwise it reads `arrayBuffer()` directly (the live
     route streams transcoded AAC bytes). Then `decodeAudioData`.
   - **Graceful fallback:** if `/api/featured` or `/api/audio` is unreachable,
     empty, or errors, it synthesizes ~52 s of a warm **A-natural-minor /
     Dorian-tinted** arpeggio bed (detuned triangle+sine voices, slow 6.5 s
     chord changes, exponential envelopes, gentle lowpass) into an AudioBuffer
     via `OfflineAudioContext`. The UI says exactly which source is live:
     `source: Karel's recording — <title>` vs `source: demo (his album
     unreachable)`.

2. **Offline-STFT landscape builder** (`fft.ts`)
   - A from-scratch **radix-2 iterative Cooley–Tukey FFT** (no npm dep).
   - `buildSpectralGrid` mono-mixes the buffer, runs an FFT-size-2048,
     hop-1024, Hann-windowed STFT over the entire track, and downsamples into
     **340 time columns × 128 log-spaced frequency rows** (40 Hz → ~11 kHz).
     Magnitudes are converted to dB (floor −90) and normalized to [0,1].

3. **three.js flythrough renderer** (`scene.ts`)
   - The grid becomes a `THREE.Points` cloud: `x = log-frequency`,
     `y = magnitude (terrain height)`, `z = time`. Soft radial glow sprite,
     **additive blending**, emissive color mapped by frequency band — deep
     violet bass → blue → cyan → white treble peaks, brightened by magnitude.
     Exponential fog + a faint floor grid for depth. WebGL absence returns null
     and the page shows a readable notice.

4. **Transport-sync** (`page.tsx`)
   - Web Audio looping `AudioBufferSourceNode` → make-up gain → lowpass →
     destination. Play/pause, a `m:ss` clock, and iOS `AudioContext.resume()`
     on gesture. Every rAF frame computes `progress = currentTime / duration`
     and the camera is driven straight from it, so the visual cannot drift from
     the audio. Drag (pointer) and arrow keys feed a smoothed yaw/pitch steer;
     space toggles play/pause.

---

## Named references (ambition #3)

- **Refik Anadol — *Latent City* (BRUSK, 2026):** data made into an inhabitable,
  navigable volumetric landscape rather than a flat chart.
- **Ryoji Ikeda — *data-verse*:** raw data as an immersive spatial environment.

The borrow: *you fly through the spectrogram of his own playing* — his
performance becomes a place.

## Ambition criteria hit

- **#2 (≥3 distinct subsystems):** four — real-stem fetch+decode / offline-STFT
  landscape builder / three.js flythrough renderer / transport-sync.
- **#3 (named reference):** Anadol *Latent City* + Ikeda *data-verse* (above).
- **#4 (multi-cycle candidate):** cycle 2 could add spatial audio per frequency
  band and branching flight paths through the terrain.

## TAGS (diversity audit)

- **INPUT** = audio-file (Karel's real recording) + drag/keyboard steering
- **OUTPUT** = three.js point-cloud landscape
- **TECHNIQUE** = offline STFT → navigable 3D spectral terrain + transport-synced
  flythrough
- **PALETTE / VIBE** = immersive / cosmic / Anadol–Ikeda data-landscape

## Files

- `page.tsx` — `"use client"` React component: source orchestration, transport,
  steering, render loop, UI, full teardown.
- `audio.ts` — real-recording fetch+decode pipeline + synth fallback.
- `fft.ts` — hand-written radix-2 FFT + offline STFT grid builder.
- `scene.ts` — three.js point-cloud flythrough scene.

## Degradation

- No WebGL → readable rose notice, no crash.
- Album unreachable → synth fallback + an explicit "demo" label.
- iOS → `AudioContext` resumed on the user gesture.
- Unmount → `cancelAnimationFrame`, audio stopped, three.js geometries /
  materials / textures / renderer `dispose()`d, `AudioContext` closed.

No new npm dependencies (uses installed `three`; FFT is hand-written). No API
routes created — it only reads existing public endpoints.
