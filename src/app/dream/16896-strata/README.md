# 16896-strata — the recording keeps a diary of being heard

**What if a recording could remember being heard — could Karel's track accrete a visible geology of every past listening, so returning re-forms the sediment of all previous visits?**

**Status:** demoable. WebGPU render pipeline (WGSL) drawing a persistent, cross-session sediment column; real catalog playback through `safeMaster`; IndexedDB persistence with a localStorage fallback; a draggable core-sample scrub that surfaces and re-voices each remembered session.

---

## Concept

Strata treats one of Karel's recordings as a **medium that remembers being heard**. Each listening deposits a thin horizontal band — a *stratum* — at the top of a vertical core sample. The band is not decoration: it is read out of that session's own music.

- **Mineral hue** comes from the session's dominant chords. Each chord root is mapped around the circle of fifths (via `pitchClassHue`) and remapped into a cool mineral gradient — slate → mineral-blue → patina → pale mineral — so harmonically-near sessions sit near each other in color.
- **Tension** — minor and diminished harmony (`chordIsMinor`) — pulls the band toward cold slate and darkens it.
- **Dynamics** — the analyser's RMS off the `safeMaster` tap — tighten the fine internal laminae and scatter brighter mineral flecks where the playing is loud.
- **Compaction** — older strata sit lower, thinner, and darker, as if settled under the weight of everything heard since.

The live, currently-forming stratum grows in thickness at the top as you keep listening, gently compacting the history beneath it.

## How the persistence / stratigraphy works

The medium **persists across browser sessions**, which is the whole point. `strataStore.ts` writes one tiny summary record per listening into **IndexedDB** (object store keyed by track id), falling back to **localStorage** when IndexedDB is unavailable or blocked. Each record holds only:

- a start timestamp (also its stable id) and a last-updated timestamp,
- listened seconds,
- a short sampled sequence (≤24) of dominant chord pitch-classes,
- a minor-tension fraction,
- mean + peak RMS,
- a 16-float coarse spectral signature.

**No raw audio is ever stored**, every record is well under 1KB, and only the newest ~60 sessions per track are kept, so the store cannot bloat. The growing session is **checkpointed every few seconds** (upsert by its start-timestamp id), so even a hard reload mid-listen preserves the stratum laid down so far. Return to a track and `loadStrata` re-forms the full column: `computeLayout` stacks the stored sessions newest-on-top with an age-weighted compaction, and the live band (if playing) rides on top.

## Inspectable history — the core sample

Drag the **core-sample cursor** down the column. As it crosses a stratum it surfaces that session's date, how many sessions ago it was, and how long it was listened — and it plays a soft **granular echo** of that remembered session's harmony. The grains are sliced from the **currently loaded real track buffer** (never a synth), re-pitched toward the stratum's stored dominant chord and dropped an octave into a low "memory" register, scattered slightly in time and stereo. The memory is something you can literally scrub through and hear.

## Output / technique / palette

- **Output:** WebGPU. A single WGSL render pipeline (full-screen triangle-strip) reads a storage buffer of per-stratum data and paints the whole core sample in the fragment shader — bands, laminae, flecks, bedding planes, core-tube walls, and the cursor glow. Feature-detected with adapter-null and `device.lost` handling; on any failure a house-style `text-destructive` notice replaces the canvas rather than showing a broken one.
- **Technique:** cross-session persistent accretion + an inspectable session-timeline (stratigraphy).
- **Palette:** cool mineral / core-sample tones (slate, mineral-blue, patina, pale mineral highlights) on a deep neutral ground. Raw color lives only inside the WebGPU layer; all chrome uses semantic tokens.

## Named references

- *Persistent Computational State: A Session-Centric Runtime for Generative World Models* (arXiv:2607.21686, Jul 2026) — preserving the minimal, non-recomputable state across a session boundary. Here the "non-recomputable state" is how the piece was *heard*, which no amount of re-analysis of the audio could reconstruct.
- Katie Paterson, *Future Library* — a work that accretes across time, unheard until later. Strata accretes across visits, and each layer stays audible on demand.

The honest first this piece claims: not persistence itself (spiralkeep predates it), but being **the first piece whose medium persists across browser sessions so that returning to a track re-forms the accreted geology of every past listening — scrubbable, and audible, as a core sample.**

## Honest limitations

- Harmony is only as rich as the analysis endpoint. When a track has no chord analysis, the stratum falls back to a slow neutral mineral drift (labelled in the HUD) rather than lying about the harmony.
- The granular echo "voices toward" a stratum's chord by re-pitching grains toward its dominant pitch-classes; it is a gesture of remembered harmony, not a re-synthesis of the original chord voicings, and it uses the *current* track's timbre.
- Persistence is per-browser-profile (IndexedDB/localStorage). It survives reloads and closes on the same device/browser, but does not sync across devices — there is deliberately no server or API route.
- Layout compaction is weight-based rather than physically simulated; with the full ~60 strata the oldest bands become very thin (as intended, but detail there is coarse).
- Time is wall-clock listened seconds; scrubbing/seeking within a track is not implemented (playback is play/pause of the real buffer from where it left off).

## Verification

The orchestrator runs the authoritative `npm run build` (full Next.js build — ESLint + `tsc` — not tsc-only). Locally, `tsc --noEmit` and `eslint` on both files report zero errors and zero warnings.
