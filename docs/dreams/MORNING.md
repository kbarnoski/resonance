# Morning digest — last updated 2026-06-14 (UTC) · cycle 427

**Open this first:** [/dream/613-seismic-choir](https://getresonance.vercel.app/dream/613-seismic-choir) 🌍🌋

## New since yesterday
- **613-seismic-choir** — *what does the planet sound like right now?* The **live global earthquake feed** of the last 24h becomes an ominous trembling sonification: every real quake on Earth groans through low inharmonic rock-resonators over a slowly rotating **WebGPU globe** of tectonic light (quakes bloom at their true lat/lon, big ones flare + shake the screen). The lab's **first seismic / real-data-sonification piece**, and the only build this fortnight to hit **three jury provocations at once**: edges/off-cozy (#1), full WebGPU spectacle off-Canvas2D (#2), and "stop re-shipping the ocean — mine unmined real data" (#3). Mag→loudness/depth, depth→brightness, lon→pan; the 24h window replays in ~60s so you hear the day's seismic *rhythm* — swarms, clusters, the silence between. Plays on a glance with zero hardware (auto-start + ~46-quake sample fallback + Canvas2D fallback; `LIVE/SAMPLE` + `WebGPU/Canvas2D` badges). Ref: Florian Dombois, *Earthquake Sounds*.

## Also explored this fire (WIDE — 2 banked, see IDEAS §427)
- **612-piano-larynx** — LPC cross-synthesis "**talking piano**" on your material (a piano that vowels/mutters; refs Lansky/Dodge). *Banked:* strong, but 606 just mined the his-material vein and its glance-state was a synthesized piano — resurrect wired to your real `/api/audio` track.
- **614-combustion** — a **procedural engine** you rev off-glass (pulse-train fired at RPM → recursive Karplus-Strong exhaust resonators; AudioWorklet + WebGPU). Implements this cycle's research (arXiv 2603.09391). *Banked:* the strongest single resurrect for the next "edges" fire.

## Research finding worth a look
- The freshest cs.SD work this week is **real-time LM jamming** (arXiv 2606.11886, June 11 — an LM that improvises *with* a live player). Logged as a multi-cycle AI-pipeline seed (needs a local LM). The implementable edge I built from instead was the **PTR engine** paper (2603.09391).

## Open questions for Karel
- The jury's "extend the his-material vein" (#4) was written before it saw cycle 425's 606 (HPSS on your piano) — I read that as freshly answered and went WIDE into the still-open lanes instead. Agree, or keep mining your-piano analysis (612 talking-piano is ready to resurrect)?
- 613 fetches the **live** USGS feed in your browser at runtime (the sandbox only ever sees the sample set) — worth a look on the real feed to hear an actual loud-quake day.

_Process note: three builder subagents racing one shared `.next` corrupted the first build (ENOENT); `rm -rf .next` fixed it. Authoritative `npm run build` exit 0, 464/464 static pages._
