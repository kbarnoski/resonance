# 877 · Biosphere Score

**What if the living biosphere — every bird, mammal, insect, fungus just
observed on Earth — composed an orchestra, where the DATA decides who plays
when?**

Biosphere Score pulls live occurrence records from [GBIF](https://www.gbif.org/)
(the Global Biodiversity Information Facility) and turns the planet's recent
sightings into a self-playing orchestral piece. Each observation is **one
event** that brings its taxonomic section's voice into the ensemble. The data
shapes **who plays when** and the **long-form form** of the music — it does
*not* set the pitch of individual notes.

This is deliberately a **structural** sonification, not a parameter-detune one.
A sibling lab piece already maps one note per earthquake by frequency; this one
is different in kind. Pitch here is always chosen from a shared, slowly
modulating modal scale, quantized into each section's register band — so the
result is harmonic by construction, no matter what the data does.

## How it works

1. **Fetch** — on Start, the browser fetches GBIF directly (keyless,
   CORS-open). If the network fails or returns nothing, it falls back
   seamlessly to a curated offline set of ~40 occurrences spanning many taxa
   and continents. An auto-demo schedules events on a compressed clock within
   ~1 second of Start, so it both *sees* and *hears* the piece hands-free with
   zero hardware or network.
2. **Schedule** — observations are released on a compressed clock. Each one
   triggers its section's voice and blooms a glowing dot at its lat/lon.
3. **Evolve** — running musical state accumulates: which sections have been
   seen, how busy the last few seconds were, and how far the harmonic arc has
   travelled. The piece at minute 5 is meaningfully fuller than at minute 1.

## Sonification mapping

| Data field | Musical role | Mapping |
| --- | --- | --- |
| `class` / `kingdom` | **Orchestra section + register band** | Aves → bright flute (high); Mammalia → warm cello (low-mid); Insecta → pizzicato ticks (high-mid); Plantae → sustained pad (broad/low); Fungi → sub drone (low); Amphibia/Reptilia → mid pluck/croak; Actinopterygii → watery bell (mid); other → soft bell |
| arrival of an observation | **Who plays when** | each record = one event that brings its section's voice in |
| temporal **clustering** of events | **Rhythmic density / phrasing** | a flurry of sightings → a busier, tighter passage |
| cumulative **taxonomic richness** (distinct sections seen) | **Long-form arc** | more sections → fuller ensemble, denser pad, brighter palette and filter |
| elapsed time | **Harmonic modulation** | the shared modal scale transposes / changes mode every ~36s |
| **longitude** | **Stereo pan** | −180°..180° → left..right |
| latitude | position **within** a section's band | chosen as a scale degree, then quantized to the active harmony — never a raw frequency |

Pitch is *never* derived from a measurement: every note is a scale degree in
the current mode, quantized into its section's band. The data controls
texture, density, register membership, and form — the musical rhetoric — not
detuned frequencies.

## Audio safety

Web Audio only. Chain: voices → `master` gain (0.22) → `BiquadFilter`
lowpass → `DynamicsCompressor` (threshold −10 dB, ratio 20:1) → destination.
An always-on ambient pad keeps it from ever being silent; all attacks are
≥30 ms. An `AnalyserNode` is tapped off the master for the visuals and is
never routed to the destination. The `AudioContext` is resumed inside the
Start tap for iOS. On unmount everything tears down: rAF cancelled, fetch
aborted, oscillators stopped, context closed.

## Visual

Raw Canvas2D. An abstract dark equirectangular world: a glowing lat/lon
graticule over faint stylized landmass hints, with each observation blooming a
color-coded glowing dot, an expanding ring, and a brief fading name label. A
live legend shows the active sections, their voice counts, cumulative
richness, the current mode, and a density meter. Aurora-dark palette that
breathes with the spectrum. Hover or tap a section in the legend to solo it.

## Research grounding

Research grounding (RESEARCH.md §527, 2026-06-23): the structural (not
parameter-detune) mapping follows *Data Melodification FM: Where Musical
Rhetoric Meets Sonification* (arXiv 2510.00222) — sonification should use
musical rhetoric (form/harmony/rhythm), not just pitch/volume mapping.
Section→register-band assignment follows Bernie Krause's acoustic niche
hypothesis (*The Great Animal Orchestra*). Environmental-data-sonification
lineage: Andrea Polli.

## Files

- `page.tsx` — client component: lifecycle, scheduling clock, render loop, UI.
- `gbif.ts` — GBIF fetch + the curated offline fallback occurrences.
- `structure.ts` — section mapping, modal scale + harmonic arc, running state.
- `audio.ts` — Web Audio engine, the per-section voices, arc + teardown.
- `render.ts` — Canvas2D world, blooms, legend, hit-testing.
