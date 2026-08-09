# 3456-surge — an EDM build-and-drop journey engine

## The one question it answers

What if Resonance had a journey engine that isn't the visionary 6-phase
arc — but an **EDM build-and-drop arc**, where the human **rides and
releases** tension instead of playing an instrument they can fail?

## What it is

A structured, evolving electronic-music arc rendered as an energy tunnel.
The human's whole role is **ride-and-release**: hold a key to **charge** the
build (energy climbs, the riser sweeps up, the snare roll accelerates, the
visuals compress inward); **release** to trigger the **drop** (the kick slams
in, the sidechain pump begins, the tunnel explodes outward). There is **no
fail-state** — the drop always lands. You only shape _when_ it lands and _how
charged_ it was. It's a decision, not a test.

## The arc phases (state machine — `arc.ts`)

```
intro → build → peak → DROP → groove → breakdown → (loop into build)
```

- **intro** (~3.2s) — a filtered pad sets the key; auto-advances into the build.
- **build** — the interactive phase. While the charge input is held, `energy`
  climbs toward 1 (~5.3s to full). The riser's bandpass sweeps up, the snare
  roll subdivides finer as energy rises, and the tunnel squeezes inward.
- **peak** (~0.42s) — the tense gap: the riser tops out, drums cut, the drop
  is poised.
- **drop** (~0.7s) — the slam. `dropPower` captures how charged the release
  was; a bloom flash blows out the tunnel centre and it explodes outward.
- **groove** (~11s) — sustained four-on-the-floor with the sidechain pump; the
  bigger the `dropPower`, the fatter the groove.
- **breakdown** (~4.6s) — filters close, drums drop out, energy relaxes to 0,
  then it loops back into a fresh build.

Releasing the hold at low charge still drops — it just hits softer. You can
also re-grab a build you let go of. Nothing here can be failed.

## The sidechain "pump" technique

The sub bass and the 7-oscillator supersaw are routed through a shared `duck`
`GainNode`. On **every kick**, `triggerKick()` slams that gain down
(`setValueAtTime(0.14, …)`) and lets it recover over ~1/8-note via
`gain.setTargetAtTime(1, …)`. The pads therefore _breathe_ around the kick —
the signature EDM "pumping". The kick, snare and riser bypass the duck so they
punch through. The visual tunnel throbs on the same clock: `visualPump()`
returns a kick-hit envelope the shader reads for a brightness pulse.

Timing is a **lookahead scheduler**: a 25ms `setInterval` schedules ~120ms of
sample-accurate note events ahead on the `AudioContext` clock. Master runs
through a glue `DynamicsCompressor` → a fast limiter → master gain `0.19`, so
it stays loud without clipping.

Progression: A-minor EDM loop **i–VI–III–VII** (Am–F–C–G), equal temperament —
evolving but not hard-quantised to a strict just-intonation/pentatonic grid.
The supersaw voices a fat power-chord over each root.

## Self-demo (no input)

On the first **Start** click (needed to create the `AudioContext` inside a
user gesture) an **auto-pilot** drives believable build→drop→groove→breakdown
cycles through the _same_ arc engine — so a hands-off reviewer immediately
hears the pump and the drop and sees the tunnel react. A **LIVE · AUTO-PILOT**
badge shows; the human's **first spacebar** hands them the wheel (badge flips
to **LIVE · YOU**).

## Tags

- **INPUT: keyboard** — hold **Spacebar** to charge, release to drop. An
  on-screen `HOLD to charge · RELEASE to drop` pad mirrors it (secondary; the
  spacebar is the real control). No pointer-drag as primary input.
- **OUTPUT: raw WebGL2 fragment shader** (`#version 300 es`) — an energy
  tunnel / bloom whose speed, compression, brightness and hue track the arc
  phase and energy. Not Canvas2D, not three.js.
- **TECHNIQUE:** arc state machine + sidechain-pumped synthesis (four-on-the-
  floor kick ducking a supersaw + sub) + white-noise riser with filter sweep
  on the build.
- **VIBE:** EDM / high-energy. Relationship: ride-and-release.

## Named references

- **EDM song structure** — intro / build / drop / groove / breakdown form.
- **Sidechain "pumping"** a la **deadmau5 / Eric Prydz**.
- **jadujoel/sidechain-compressor-audio-worklet** — the canonical AudioWorklet
  sidechain-compressor technique this approximates with a kick-clocked gain
  envelope (no worklet dependency required).

## Ambition criteria hit (3/5)

- **#2 — ≥3 subsystems:** arc state machine (`arc.ts`) + multi-voice sidechain
  synth graph (`audio.ts`) + WebGL2 shader (`shaders.ts`).
- **#3 — named refs:** EDM song structure; sidechain pumping (deadmau5 / Eric
  Prydz); jadujoel AudioWorklet sidechain compressor.
- **#5 — same-day research:** techniques researched and applied same day.

## Files

- `page.tsx` — client component: GL rig, render loop, keyboard ride-and-release,
  auto-pilot hand-off, HUD, teardown.
- `arc.ts` — the build-and-drop state machine + auto-pilot.
- `audio.ts` — sidechain-pumped synth graph + lookahead scheduler.
- `shaders.ts` — WebGL2 energy-tunnel vertex + fragment shaders.

## Graceful degradation & teardown

WebGL2 unavailable → an on-brand notice shows and the audio arc still plays.
`prefers-reduced-motion` damps travel speed, the drop flash and the pump.
Unmount tears everything down: `cancelAnimationFrame`, `clearInterval`, stop
all oscillators/sources, `ctx.close()`, and `WEBGL_lose_context`.
