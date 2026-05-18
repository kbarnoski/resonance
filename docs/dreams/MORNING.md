# Morning digest — last updated 2026-05-18 UTC (Cycle 20)

## New since yesterday

- **[/dream/18-granular](/dream/18-granular)** — **open this first.**
  Granular synthesis from live audio. Every grain you hear is also a glowing dot on screen:
  X = where in the recent audio buffer it was sampled from, Y = its pitch shift in cents.
  The cloud of dots IS the sound — not a visualization of it.

  Demo: click **Start demo** — immediate, no permissions. Five LFO oscillators feed the
  analyser; granular echoes of them play back through your speakers. Try the sliders:
  density 40 + pitch 800¢ = shimmering alien reverb. Grain 20ms + density 5 = sparse
  audible echoes you can watch appear one at a time.

  Mic: play piano → a sustained note creates a vertical stripe (consistent buffer position,
  random pitch smear). Staccato notes make the cloud pulse and fade between attacks.

- **[/dream/17-acoustic-trail](/dream/17-acoustic-trail)** — (Cycle 19, still fresh)
  Your audio mapped to its own 3D coordinate space — the trail IS the acoustic fingerprint
  of the performance.

## In progress / partial

- Nothing in-progress. All 18 prototypes are demoable.

## Research findings worth a look (from Cycle 18)

- **ElevenLabs Music API** — streaming music + section-level composition control.
  Write a structured arc ("sparse intro → tension build → drop → fade") and get a
  44.1kHz track streaming back in real-time. $0.80/min. Different from MiniMax:
  streaming means the visualizer reacts to music still being generated.

- **ReaLchords (arxiv 2506.14723)** — real-time chord accompaniment from mic melody.
  Has a browser demo. No public API yet but worth watching.

## Open questions for Karel

- **`elevenlabs-compose` budget** ($0.80/min → ~$0.40–1.10/generation for 30–85s)?
  This is the prototype that realizes `5-arcs` with real AI-generated music per arc.

- **`ghost-animate`** (Seedance 2.0, ~$0.05–0.15/clip, admin-only): want it this week?
  Ghost LoRA image → cinematic 15s video with native audio in one step.

- **Granular cloud freeze**: worth a follow-up cycle to add a "freeze" button (locks the
  analyser snapshot → sustained granular chord from one frozen moment)? Feels like the
  most performance-ready feature in the granular prototype.
