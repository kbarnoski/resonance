# Morning digest — last updated 2026-07-19 (cycle 831, WIDE)

> **Jury verdict yesterday**: pentatonic quietly became a reflexive just-intonation partial-stack, and the WebGL2 you banned came back as WebGPU. The ask for today was explicit: *a non-GPU substrate and a harmonic model that isn't the JI drone.* This cycle answers both head-on. See `docs/dreams/JURY.md`.

> **Tonight: a choir tuned like a real piano — then bent past it.** Every voice is built from a *stretched* octave (partials pulled progressively sharp — the Railsback curve every piano tuner uses), and the scale is stretched to match, so per **Sethares** the chords lock into an eerie, glassy consonance that is detuned from equal temperament yet perfectly in tune with its own timbre. **Then drag the stretch slider while holding a chord and hear consonance melt and re-form.** The invention is in the harmony itself — not a sim driving a boilerplate scale.

**Open this first (no MIDI needed — plays on your computer keyboard):** https://getresonance.vercel.app/dream/1984-stretched-choir — press **Start choir**, hold a chord with `a s d f g`, then drag the **stretch** slider (and toggle "lock scale to timbre" off to hear it come apart). Every glowing blob is one real partial, blended by the browser compositor.

## New since yesterday
- **`/dream/1984-stretched-choir`** — *a playable stretched/inharmonic spectral instrument.* Partials at `f0·n^β` (β=log2 stretch); scale matched to timbre (**Sethares** — matched timbre↔scale minimises dissonance); a live slider (1.98→2.12) **melts & re-forms** consonance, numerically validated (matched triad roughness 0.339 vs 0.410 mismatched). **Web MIDI** (your keyboard) + on-screen/QWERTY fallback. Substrate is the **CSS compositor** — each partial is a radial-gradient DOM voice with `mix-blend-mode:screen`, pulsing at its true beat rate — deliberately OFF the GPU (WebGPU was 5 of the last 10) and off Canvas2D (4×). A *harmonic model that isn't the JI drone*, grounded in real piano tuning.
- **2 more explored, banked (IDEAS §831):** ⭐⭐ **`droplet-cairn`** — music from timed **impacts** you play *eyes-closed*, each hit felt in your hand via the **Vibration API**; no scale at all (pure impact-timbre + rhythm), phasing à la Reich, knock a stone off to un-build it. It cashes a finding from **SIGGRAPH 2026** (Emerging Technologies opened *today* — a water-droplet impact-sound interface). ⭐ **`tritave-loom`** — a **Bohlen–Pierce** melody you *weave and un-weave*: pull a thread to un-make a note (SVG-DOM).

## Needs your eyes/ears (I ran headless — no audio/MIDI here)
- Does the **stretch-slider melt** read as musically as it does numerically? And is the loudness of dense 8-note chords comfortable through the compressor? Both coded defensively, unverified by ear.
- Real MIDI-keyboard velocity is untested (no hardware in the cloud) — the QWERTY/on-screen path is fully verified.

## Research finding worth a look
- **SIGGRAPH 2026 Emerging Technologies opened today** (July 19–23, LA). Two on-theme, hands-on pieces: a **MIDI water-droplet impact-sound interface** (music from physical collisions — no pitch lattice; directly seeds the banked `droplet-cairn`) and **"Shall We Dance? Resonance of Intentions"** (an agent that syncs movement with a human dancer — banked as a camera-pose *duet* seed where synchrony is a consonance dial). Full note in RESEARCH.md (§831).

## Open questions for Karel
- **Ship `droplet-cairn` next?** It's the freshest research chain in the bank and the lab's only audio-only/haptic direction — a good candidate for an installation / non-screen cycle.
- **The AI-pipeline chain (audio→image→video) is still 0×** across ~18 juries — but `1960-depth-well` proved a **$0 in-browser** ML path exists (Depth-Anything via Transformers.js), so the paid-budget excuse is gone. Want me to scope one cycle on it?
