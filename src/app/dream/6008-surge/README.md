# 6008 · Surge

**The one question:** _What if a Resonance session were an EDM build-and-DROP —
a through-composed high-energy journey arc where tension racks up across a
build, a snare-roll riser subdivides, and the whole floor drops?_ An alternate
to the calm/meditative journey engine.

## Tags

- **INPUT** — self-playing + "jump to the drop" / scrub-to-seek on the timeline.
- **OUTPUT** — raw WebGL2 (hand-written GLSL, `getContext("webgl2")`, no
  three.js).
- **TECHNIQUE** — a single scalar `ENERGY(t) ∈ [0,1]` automation curve driving a
  sectioned arrangement, played by a 16th-note look-ahead Web Audio scheduler.
- **VIBE** — EDM / high-energy / build-and-drop.

## How it works

`arrangement.ts` defines a 124 BPM, 16-bar phrase grid with seven named
sections — **Intro → Build → Breakdown → DROP → Build II → Drop II → Outro** —
and one master automation function, `ENERGY(t)`. That scalar does double duty:
it **drives** the music (which layers gate on, the master lowpass cutoff, note
density, the depth of the sidechain pump) and it **is** the visual — the
horizontal energy ridge whose height and brightness are the curve itself, with
the DROP sections hot-tinted violet→magenta.

`synth.ts` is a Web Audio build-and-drop synth with a 16th-note **look-ahead
scheduler**: it schedules every hit against `AudioContext.currentTime` and
advances its tick loop with `setTimeout` (never `setInterval`, never rAF, for
the musical clock). Layers: kick (four-on-floor, bypasses the filter to always
punch), sub-bass, saw/square stabs, a pentatonic arp, hats that fill in as
energy climbs, a clap backbeat, a **snare-roll riser** that subdivides from
16ths toward 32nds as the build peaks, and an **impact** on each drop downbeat.
A code-generated `ConvolverNode` reverb and a final `DynamicsCompressor` limiter
sit on the master bus; master gain is capped at 0.18. Every generative choice
(reverb impulse, note detune, hat placement) is drawn from a seeded
`mulberry32(0x6008)` PRNG — no `Math.random`, `Date.now`, or `performance.now`.

`render.ts` + `shaders.ts` draw the ridge with a single fullscreen-triangle
WebGL2 fragment shader. The energy curve and section marks upload once as
uniform arrays; per frame only the playhead, pump and time change. The visual
is drawn statically on load — before any gesture — so the build-and-drop
structure reads on a silent screenshot. Section names are DOM labels along the
timeline (drops in `text-primary`); a bead rides the ridge crest at the
playhead.

## Reference

Mark J. Butler, _Unlocking the Groove: Rhythm, Meter, and Musical Design in
Electronic Dance Music_ (Indiana University Press, 2006) — for the 16-bar
phrase structure and the build-and-drop as the fundamental dramaturgical unit
of EDM.

## Safety & constraints

- Autoplay-safe: no `AudioContext` until the first user gesture; clean teardown
  of rAF + AudioContext + WebGL context on unmount.
- Photosensitive-safe: all luminance change is slow drift (< 3 Hz). The pump
  swell is a smoothed 50 ms attack + exponential decay, never a flash; shimmer
  and pump are further damped under `prefers-reduced-motion`.
- Degrades gracefully: if WebGL2 is unavailable, an on-brand notice shows and
  the audio arc still plays.
- Pure client-side: no network, no API route, no new dependencies.
