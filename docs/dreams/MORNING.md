# Morning digest — last updated 2026-06-24 ~08:20 UTC (cycle 535, adult · WIDE)

Open the lab: https://getresonance.vercel.app/dream

## New since yesterday
- **`898-tremor-score`** 🌍🎼 (cycle 535, adult · WIDE, 1 of 3 shipped) — **a live earthquake feed composes a piece.** Press play and it pulls the last 24 h of global seismicity from the USGS feed; the whole day collapses into ~90 seconds. Every quake becomes a *voice entering* — a big deep quake is a low, long, loud tone; a tiny shallow one is a brief high glint; an aftershock swarm becomes a dense overlapping flurry; a quiet stretch becomes a sparse solo. *Why open it:* it's a real, unrepeatable portrait of one day on Earth — and it's the **clean answer to the rut the jury called out twice** (`842`→`864` both mapped data to *detuning the harmony*). Here the data decides only the **shape** — who plays, when, in what register — while a fixed consonant mode keeps every note in tune. **Data → structure, never → roughness.** Works on any device, including your phone; no mic, no camera, no login.
  - **Finally lands the citation rule:** the README cites genuinely recent research (OpenSeisML, arXiv May 2026 — seismic *catalogues* as generative input) plus Ryoji Ikeda + Florian Dombois. That in-README dated-research citation is the floor criterion the jury flagged **0-for-15 for five straight windows** — landed now two cycles running. Deliberately **SVG**, not GPU (the jury banned the WebGL2 monoculture).

## Also explored this cycle (banked, not shipped — see IDEAS §535)
Both are **brand-new lab capabilities** — sequenced for the next two cycles, not dropped:
- **`899-harmonic-mirror`** ⭐ — *your keyboard's shadow.* The lab's **first-ever MIDI** prototype: play your controller and a partner voice infers the chord you're implying and adds the just-intonation note(s) that complete it, beat-lessly locked. Deeply on-mission for Resonance (a tool for pianists/composers). **Resurrect-first** — ideally on a cycle when you can sit at a desk with a keyboard. (Has a no-hardware fallback too: on-screen piano + computer keys.)
- **`900-flow-grains`** — *your gesture is granular texture.* The lab's **first optical-flow / camera** instrument: motion in front of your webcam scatters both a particle field and grains of sound (TouchDesigner lineage). The biggest novelty leap of the night; benched only for a performance pass.

## In progress / partial
- Nothing blocked. The `888-living-reverie` long-form thread (cycle 1 of N) is still paused on purpose — it needs a real new *capability* next, not a renderer swap (the trap the jury flagged on `847/872`).

## Open questions for Karel
- **You likely have a MIDI keyboard — want me to ship `899-harmonic-mirror` next adult cycle?** It's the most directly *useful-to-you* thing in the queue (a real-time just-intonation harmonizing partner), and it'd be the lab's first MIDI integration.
- We keep generating great never-used-technique builds (MIDI, optical-flow) but shipping the *safest-to-demo-on-a-phone* one. Is that the right call for the 06:30 review, or would you rather I ship the bigger-swing build and trust you to open it at your desk?

## Caveat
- Built + **compile/lint/type-clean** (authoritative winner-only `npm run build`); **NOT browser/ear-verified** (no audio in the container) — the actual sound of a real USGS day, whether dense swarms stay un-clipped, and small-screen SVG crowding are unverified. Static-gen still blocked by the standing container fd limit (infra, not code — every cycle since ~472); Vercel deploys normally.
