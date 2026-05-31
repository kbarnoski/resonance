# Morning digest — last updated 2026-05-31 UTC (cycle 261)

## New since yesterday

- **`/dream/227-paths-granular`** (cycle 261, adult) — Upload any audio file and sculpt it into a
  grain cloud. Scrub to a moment in the buffer; the engine scatters Hann-windowed fragments
  (20–500 ms) at configurable density (2–30/s), pitch-shifts each grain by ±12 semitones, and
  pans them randomly. Waveform strip + sparkle particles from the cursor make the position
  legible at a glance. Built-in demo: C major phrases + Am7 pad via OfflineAudioContext. Try it
  with any WAV or MP3 — Karel's piano recordings will give instant frozen-chord and pitch-cloud
  textures. **First granular synthesis prototype.** Zero deps · Zero API · 3.65 kB.

- **`/dream/226-kids-face-song`** (cycle 260, kids) — A glowing face made of five musical parts.
  Tap each to wake it up: **head** = deep C2 drone (violet), **left eye** = G3 pluck every 800ms
  (teal), **right eye** = E3 pluck every 1200ms (amber), **nose** = A3 bounce every 600ms (rose),
  **mouth** = C3–G3–A3–E3–C4 melody (cyan). Tap again to silence. All five active → sparkle burst
  + "La la la! ✨". **First face-shaped instrument.** Kids 3+ · Zero permissions · Zero API · 2.84 kB.

## In progress / partial

Nothing in-progress. Next: kids cycle 262.

## Research findings worth a look

- **Granular synthesis parameter space is huge.** The most musical sweet spots: grain 80–150 ms +
  density 8–15 gives a smooth frozen pad. Grain 20–40 ms + density 25–30 gives shimmery glitch.
  Pitch shift ±0 at high scatter creates a wide, ambient cloud from a single piano note.

- **Scatter is the sleeper parameter.** Low scatter = repeating texture at one moment (frozen
  chord). High scatter = evolving texture from a wide region (like slow playback, but timbre is
  fixed to the scrub point). Dragging scrub while scatter is high feels like wiping paint across
  the sound.

- **Face → music body-mapping works well for very young kids.** The head/eye/nose/mouth metaphor
  lets a 4-year-old say "the nose makes the bouncy sound" and know exactly which part to touch.
  Faces are not arbitrary. Could extend this: what does a "full body instrument" look like?
  Head = drone, shoulders = chord, hands = melody, feet = kick drum.

## Open questions for Karel

- **`227-paths-granular`**: Load one of your Welcome Home recordings. Try: scrub to a resonant
  piano sustain → grain size 120 ms → density 12 → pitch +5 st for an instant dreamy pad.
  Does the grain density feel smooth enough? At 12/s there should be no audible gaps, but on
  some browsers AudioContext scheduling latency can cause clicks — let me know.

- **`/api/audio/[id]`** — still pending your OK. Unlocks both `paths-granular` (auto-load Welcome
  Home tracks instead of manual upload) and `music-to-ghost` (mic → chord analysis → Ghost LoRA image).

- **`217-dance-avatar`** ❤️ follow-up — gesture-music via MediaPipe is queued; needs OK on ~8MB
  CDN load.

- **Cycle 262 kids candidates**: `full-body-instrument` (head = drone, shoulders = chord, hands =
  melody, feet = kick; extends the face metaphor into a full-body instrument — first prototype to
  use body-as-instrument metaphor for kids), `kids-mirror-band` (tap the mic, the mirror
  character mimics your rhythm back with a slight lag), or `kids-bubble-duet` (two bubbles that
  trade notes back and forth — kids version of 225-aria-companion's turn-taking mechanic). Which
  sounds most fun?

- **FAL_KEY budget** — `ghost-animate` (HappyHorse-1.0, ~$0.05–0.30/clip) ready on your go-ahead.
