# Morning digest — last updated 2026-05-31 UTC (cycle 263)

## New since yesterday

- **`/dream/229-chord-canvas`** (cycle 263, adult) — Play any chord on piano and the detector
  names it: "Dm", "G", "C♯m". The chord fills the screen in large colored text (C = red,
  D = yellow, A = violet — same hue wheel as `1-live`). A timeline strip scrolls left at the
  bottom: each chord you played becomes a colored block (width = duration). A 12-bin chromagram
  shows live pitch-class energy beneath. **Try demo mode first** — it plays a ii–V–I (Dm → G
  → C) automatically, then switch to mic. **First music-theory prototype in 228 builds** — prior
  prototypes visualized audio *signal*; this one names musical *structure*. No ML, no server. 3.85 kB.

- **`/dream/228-kids-creature-grow`** (cycle 262, kids) — An egg hatches and a creature grows
  as you feed it notes. Six taps (eyes → ears → smile → arms → legs → wings) build full anatomy.
  Completion: 60-sparkle burst + creature sings back your six notes with each body part glowing
  on its note. **First kids prototype where tapping literally grows anatomy from nothing.** Zero
  permissions · Zero deps · 3.18 kB.

- **`/dream/227-paths-granular`** (cycle 261, adult) — Upload any audio file and sculpt it into
  a grain cloud. Scrub to a moment; scatter Hann-windowed fragments (20–500 ms) at configurable
  density with ±12 st pitch shift. **First granular synthesis prototype.** Zero deps · 3.65 kB.

## In progress / partial

Nothing in-progress. Next: kids cycle 264.

## Research findings worth a look

- **Chord detection is more forgiving than expected.** Open voicings, octave doublings, and
  even inversions all return the correct chord label reliably — because the chroma vector sums
  pitch-class energy across all octaves. A C major chord with a C in the bass + E+G in the
  treble (standard piano voicing) gives the same [C, E, G] fingerprint regardless of which
  octave each note is in. The chromagram is, in a sense, already an "inversion-invariant"
  representation.

- **The ii–V–I demo teaches unconsciously.** A visitor who plays the demo and watches Dm → G
  → C cycle learns the most fundamental jazz chord progression without any text instruction.
  The hue shift (Dm: muted blue-green → G: warm amber-green → C: red) makes the progression
  feel like a visual "return home."

- **`217-dance-avatar` ❤️ (loved this cycle!)** — Karel loved the spring-physics skeleton.
  This opens a direction: more audio-reactive 3D geometry. Three.js R3F + TSL node materials
  (already installed) could give a `three-mesh-av` prototype where an icosahedron breathes
  with FFT data. Zero new deps.

## Open questions for Karel

- **`229-chord-canvas`**: Does the `CHORD_THRESHOLD = 0.28` feel right? Too low → false
  positives on ambiguous sounds; too high → misses quiet chords. Try playing a single note
  (should show nothing), then a full chord (should detect). If you're getting false positives
  on noise, I can bump to 0.32.

- **Extensions for chord-canvas**: (1) dominant 7th templates (Dm7, G7, Cmaj7) — more useful
  for jazz; needs 4-note templates; (2) chord shown on a virtual piano keyboard; (3) export
  the timeline as a chord chart. Which matters most?

- **`/api/audio/[id]`** — still pending your OK. Unlocks `paths-granular` auto-load + future
  Karel's-music prototypes.

- **Cycle 264 kids candidates**: `kids-chord-garden` (tap → colored flower = pitch; nearby
  same-color flowers harmonize — kids version of chord-canvas), polish `228-kids-creature-grow`
  (extend to 8-tap arc + faster sing-back), or `kids-shadow-puppet` (camera-based).

- **FAL_KEY budget** — `ghost-animate` (HappyHorse-1.0, ~$0.05–0.30/clip) ready on your go-ahead.
