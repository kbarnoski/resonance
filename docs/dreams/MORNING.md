# Morning digest — last updated 2026-06-03 (cycle 289, adult · WIDE)

**Open this first:** [/dream/279-tremor-score](https://getresonance.vercel.app/dream/279-tremor-score)
*(One button — "Begin listening to the Earth." Works on phone or laptop; no permissions, never silent.)*

## New since yesterday
- **279-tremor-score — Resonance composing in real time from the live planet.**
  It fetches the **USGS real-time earthquake feed** and turns every quake on Earth into a
  sound + an ink mark, so the piece is literally about the world *right now* and **never
  exactly repeats**. **Magnitude** → loudness + a deep sub-rumble; **depth** → pitch & timbre
  (shallow = bright, 650 km = dark/muffled, a just-intonation/overtone palette — *not*
  pentatonic); **longitude** → stereo pan; **latitude** → brightness. **Live** mode sounds new
  quakes as they arrive every 60s; **Replay 24h** fast-plays the whole day (24h → ~90s).
  The visual is a **deliberately non-luminous** ink seismograph + world map (graphite on
  near-black, zero glow) — the anti-glow output the jury asked for. The lab's **first piece
  driven by a live external API** and **first that's about the world, not about music**.
  **Try it:** press Begin, then toggle Replay 24h to hear the day compress into a composition.
- **2 more explored this fire (WIDE, build-verified, banked in IDEAS.md):**
  - `midi-harmonograph` — plug in a **MIDI keyboard** (or use your computer keys); the chord
    you hold **draws itself** as a harmonograph — consonant chords trace clean closed figures,
    dissonant ones tangle. The lab's **first Web MIDI** piece (a real pianist fit).
  - `ensemble-tabs` — **open the page in 2–3 tabs** and each becomes a tempo-locked player in
    one server-less ensemble (BroadcastChannel, no backend). The lab's **first networked piece**.

## Why this cycle looks different
- Three explorers, **three different empty shelves the jury keeps flagging** (real-world-data /
  MIDI / multi-user) — the most direct answer to "too similar." All non-glow, all non-pentatonic,
  all fresh input. 271 already built your AI-image-inside-AV and 275 extended the long-form vein,
  so this fire went after the input classes the lab had **never** touched (live-data = 0×).

## Research findings worth a look
- RESEARCH §289 — **real-world-data sonification**. The USGS feed is keyless + CORS-open;
  `seismic2midi` (PyPI, Nov 2025) and Columbia's **SeismoDome** (Holtzman, Lamont-Doherty/AMNH)
  show it's a live, active field. The mapping writes itself and pairs with a non-luminous viz.

## Open questions for Karel
- 279 is your first "music about the world" piece — want me to push the vein to a **second
  source** (aurora/space-weather, ISS pass, transit) next adult cycle, or resurrect the banked
  **midi-harmonograph** (you're a pianist — this one's for you)?
- Deepen 279 with **real seismic waveforms** (each quake sounds its actual ground motion, not a
  synth envelope) + an HRTF globe? It's the strongest multi-cycle path.
- Still-empty shelves: depth-camera/spatial-installation, true cross-machine WebRTC (ensemble-tabs
  is the same-machine prototype of it).
