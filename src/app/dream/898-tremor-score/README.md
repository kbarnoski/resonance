# 898 · tremor-score

**The one question:** What if a *live* planetary earthquake feed *composed* a piece — not by fouling the harmony with noise, but by deciding **who** plays, **when**, and in **what register**? Data drives musical **structure** (form, density, voice entries), never detune.

## What it does

Press **"Listen to the last 24 hours of Earth"** and the prototype fetches the USGS live `all_day.geojson` feed client-side (public, CORS-enabled, no key). Every earthquake from the last 24 hours becomes a **musical event**: a new voice enters at its (compressed) moment in time. 24 hours of seismic activity is mapped onto a ~90-second piece.

If the feed is unreachable (offline, blocked, rate-limited), it shows a `text-rose-300` notice and plays a built-in **synthetic fallback** (~30 simulated quakes — sparse openings, an aftershock swarm, two large events, a closing scatter) so the piece always sounds.

## The mapping — STRUCTURE, not detune

This is the whole design stance. The **data decides form**; a fixed consonant **mode keeps it in tune**. Data is *never* mapped to dissonance, roughness, or detune.

| Seismic dimension | Musical decision |
|---|---|
| **time** (sorted, compressed 24h → 90s) | when the voice enters; real spacing is preserved, so a swarm of aftershocks becomes a **dense overlapping flurry** and a quiet stretch becomes a **sparse solo** (temporal clustering → density/tempo) |
| **magnitude** | register + loudness + note duration — big quake = **low, long, loud** fundamental; small quake = **brief high glint** |
| **depth (km)** | timbre brightness — shallow = **bright**, more partials; deep = **dark/muffled** via a lowpass |
| **longitude** | stereo pan (`StereoPannerNode`) |
| **latitude** | which **scale degree** within the mode |

All pitches are quantised to a fixed consonant mode — a warm B-flat pentatonic/Dorian blend across three octave bands. Latitude selects the degree, magnitude selects the octave band, so whatever the data does, the result stays consonant. The chaos of a planet's day resolves into something listenable.

## Audio signal path (Web Audio API)

Per event:

```
OscillatorNode(s) [triangle fundamental + sine partials]
  → GainNode (ADSR-ish envelope: soft attack, long decay, gentle release)
  → BiquadFilter (lowpass, cutoff from depth)
  → StereoPanner (pan from longitude)
  → master GainNode
      → ConvolverNode (algorithmically synthesised impulse response, warm room)  ─┐
      → dry path ────────────────────────────────────────────────────────────────┤
  → DynamicsCompressor (limiter, threshold −6 dB, ratio 12:1)
  → destination
```

A single shared `AudioContext` is created on the button press (so it starts un-suspended). The reverb impulse response is generated in code (noise tail × exponential decay), no audio assets. A wet/dry blend keeps the reverb supportive rather than washy. The compressor acts as a limiter so dense aftershock flurries never clip.

## Visual (inline SVG only)

Deliberately **SVG, not GPU** — the gallery is over-saturated on WebGL surfaces, so this is an Ikeda-restrained data-score rendered with React state + `requestAnimationFrame`:

- horizontal **time axis** (0h → 24h)
- each quake a **vertical register mark + circle**: y = register, radius = magnitude, opacity = recency
- a violet **playhead** sweeps left → right in sync with the audio schedule
- voices **glow** in the accent colour while they sound
- a secondary small **longitude/latitude epicentre dot field** as a faux world map

Palette: white on near-black, single violet (`violet-300`) accent. Monospace labels.

## References & research lineage

- **Ryoji Ikeda — _data.path_ / _datamatics_.** The data-as-score aesthetic: raw datasets rendered as austere audio-visual structure, monochrome with a single accent, clinical restraint. The visual grammar here (time axis, register marks, sweeping playhead, one accent) is directly in this lineage.
- **Florian Dombois — "Auditory Seismology."** The earthquake-sonification lineage: treating seismograms as sound and listening to the Earth's motion. Where Dombois renders the *waveform*, tremor-score steps up an abstraction level and renders the *catalogue* (the list of events) as compositional form.
- **Research anchor — OpenSeisML, arXiv 2605.20539 (May 2026).** Large real seismic datasets curated for generative/ML workflows. This is the current-research motivation for the piece: treating seismic catalogues as *compositional input* for generative systems rather than mere visualisation. tremor-score is a small, audible argument for that framing — using a live USGS catalogue as the score for a generative musical form.

## Design stance, stated plainly

**Data → structure (who / when / register), NOT data → roughness / detune.** The earthquake feed never makes the music *worse-sounding*; it only decides the *shape* of the piece. The mode guarantees consonance; the data guarantees that each performance is a faithful, unrepeatable portrait of one real day on Earth.

## Files

- `page.tsx` — client component: fetch, SVG score, scheduling loop, UI.
- `score.ts` — feed parsing, quake → event mapping, the consonant mode, synthetic fallback.
- `audio.ts` — Web Audio rig (shared context, reverb IR, limiter) and per-voice scheduling.
- `README.md` — this file.
