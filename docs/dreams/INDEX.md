# Resonance Dream Sandbox — prototype index

This is the single page Karel opens each morning. It mirrors the live
index at `/dream/` (the Vercel preview URL). Click a route to play
with the prototype; click the design notes link to read the agent's
thinking.

Status legend: `skeleton` (route exists, not yet interactive) ·
`wip` (partial) · `demoable` (works, rough) · `polished` (refined).

---

## ⭐ Newest (Cycle 47)

- **[/dream/42-binaural](/dream/42-binaural)** — Binaural Beat Synthesizer.
  Two pure sine waves — one per ear — with a precise frequency difference the brain perceives
  as a beat at that difference frequency. The beat has no physical existence in the air; it's
  neurological. This is called the *frequency following response*, and it's the closest thing
  to "direct brain audio" in the Web Audio API.
  **Five brainwave states**: δ (0.5–4 Hz, deep violet) · θ (4–8 Hz, indigo, meditative) ·
  α (8–13 Hz, cyan, relaxed — default) · β (13–30 Hz, green, focused) · γ (30+ Hz, amber,
  high cognition). The canvas color shifts with the state; the ring expansion speed matches
  the beat frequency. At δ 2 Hz: two slow tidal pulses per second. At γ 40 Hz: rings blur into
  constant shimmering amber glow (appropriate — gamma is continuous, not discrete beats).
  **Two modes**: *binaural* (headphones required — two separate ear tones) vs *isochronic*
  (speakers OK — amplitude modulated carrier, audible as tremolo). Five presets. Live carrier
  and beat frequency sliders update the oscillators without restarting.
  **The second psychoacoustics prototype** (after `40-shepard-tone`): both explore the gap
  between what is physically present in the sound and what the brain perceives.
  **"A tone that doesn't exist — until you listen to it."** Zero deps; pure Web Audio API.

  Design notes: `src/app/dream/42-binaural/README.md`

---

## Previous newest (Cycle 46)

- **[/dream/41-code-vis](/dream/41-code-vis)** — Code Vis.
  A split-screen live coding environment: textarea DSL on the left, glowing canvas on the right.
  Each line of code is a synthesizer voice: `C4 tri 0.8` → a triangle-wave oscillator at C4 at
  amplitude 0.8. Edit the score; 400ms later the audio crossfades and the canvas updates.
  **Visual**: N voices arranged in an N-gon (triangle for a triad, square for a tetrad). Each ring
  glows in the `1-live` frequency hue (violet=bass, red=treble) and pulses at the BPM rate with a
  heartbeat sin² envelope. The circular constellation reads as a chord diagram: the pitch structure
  IS the shape. Default: C major triad → three differently-colored rings in a triangle.
  **DSL syntax**: `NOTE WAVE AMP` (e.g. `F#3 saw 0.4`, `Bb2 tri 0.7`, `A5 sin 0.3`).
  Waves: `sin tri saw sq`. BPM slider changes pulse rate live. ↓ PNG saves a frame.
  **"Write a chord in 10 seconds. Hear it. See it."** Zero deps; pure Web Audio + Canvas2D.

  Design notes: `src/app/dream/41-code-vis/README.md`

---

## Previous newest (Cycle 45)

- **[/dream/40-shepard-tone](/dream/40-shepard-tone)** — Shepard Tone.
  An endless musical staircase. The tone rises forever — and never arrives.
  8 sine oscillators (A1–A8), each gaining a bell-curve amplitude that peaks at A4 (440Hz) and
  fades to near-silence at the extremes. As all oscillators glide upward together, the loud middle
  tones always seem to be rising — but when A8 fades and the wrapped A1 re-enters, the transition
  is inaudible because both extremes are below the consciousness threshold.
  **Controls**: Rate slider (0.5–30 BPM = octaves/min); Ascending/Descending toggle; Glide/Whole-tone/
  Semitone interval modes (each gives a different temporal rhythm to the illusion); Freeze (suspends
  the glide, revealing the chord); Mic mode (louder playing → faster ascent).
  **Visual**: a rotating logarithmic spiral (the helical pitch model — chromatic height × register);
  a glowing dot tracks the current phase position. Oscillator column (right): each of the 8 circles
  glows proportional to its current gain — bright at center (A3–A5), dim at extremes (A1, A8).
  The glow sweeps upward then silently resets from the bottom. The visual IS the illusion.
  **"The first prototype about the gap between physical sound and perceived sound."**
  First psychoacoustics prototype in the sandbox. Zero deps; pure Web Audio oscillators.

  Design notes: `src/app/dream/40-shepard-tone/README.md`

---

## Previous newest (Cycle 44 — research)

- **Cycle 44 was a research sweep** (no new prototype). 8 new entries in RESEARCH.md (§§61–68).
  3 new prototype ideas added to IDEAS.md. Highlights:

  - **`neural-pitch`** (shared upgrade, needs Karel OK) — CREPE-tiny ONNX neural pitch detector
    (~2MB CDN, no package.json change). 10× more accurate than autocorrelation on complex piano,
    voice, reverb. Would upgrade `13-piano-canvas`, `24-piano-roll`, `26-score-follow`,
    `33-aria-companion`, `37-ratio-lab`, `39-anticipate` in one shared hook change.

  - **Magenta RealTime** (open-weights Apache 2.0) — embedding arithmetic style blending.
    `0.7 × jazz + 0.3 × ambient` is a mathematically valid vector blend. Upgrades `30-lyria-jam`
    spec: 2D style canvas (like `38-mood-xy`) > sliders. Navigate music style as a 2D landscape.

  - **Mirelo AI SFX (new on fal.ai)** — Audio Extension + Audio Inpainting. Extend Ghost
    soundscapes from 10s clips into 60s looping scenes. Needs FAL_KEY. See RESEARCH.md §63.

  - **Transformers.js v4** — 53% smaller bundles, 200ms model load (was 2s). CREPE-tiny and
    MusicGen-small both significantly more viable for browser-native ML inference.

  **Open questions for Karel**:
  - CDN ONNX dep (~2MB) OK for `neural-pitch` upgrade?
  - Gemini key still pending for `30-lyria-jam`.
  - Suno API + stems endpoint for `suno-spatial`?

---

## Previous newest (Cycle 43)

- **[/dream/39-anticipate](/dream/39-anticipate)** — Aria Anticipate.
  Extends `33-aria-companion` with ReaLJam-style ghost-note anticipation. After you play a phrase
  and pause, Aria's entire planned response appears as **dashed blue outlines** in the ARIA panel —
  all notes at once, before a single note sounds. You see the full melodic shape of the response
  in silence. Then each note solidifies with a bright flash as it sounds, left to right.
  The canvas uses a split past/future time window: user notes scroll left, Aria's ghost notes
  sit to the right of the center "now" line and sweep left to meet it as they play.
  **"Watch Aria decide before she plays."** Inspired by ReaLJam (CHI 2025): showing AI intention
  before execution was the single highest-rated design feature in human-AI piano experiments.
  Zero deps; pure Web Audio + Canvas2D.

  Design notes: `src/app/dream/39-anticipate/README.md`

---

## Previous newest (Cycle 42)

- **[/dream/38-mood-xy](/dream/38-mood-xy)** — Mood XY.
  The Russell circumplex model as a musical instrument. A 2D canvas: X = valence (sad ← happy),
  Y = arousal (calm ↕ energetic). Drag the dot anywhere. The synthesizer follows in real time:
  **arousal** controls BPM (40–140), voice count (1–4), register (C3–C5), attack (0.8s→0.04s),
  and whether chords arpeggiate or sound simultaneously. **Valence** controls chord quality
  (major / minor / dim), filter brightness (400–5000 Hz), and note sustain length (+40% longer
  when sad). Background color shifts with quadrant: amber (excited+happy) → purple (excited+sad)
  → teal (calm+happy) → navy (calm+sad). Pastel trail shows your path.
  **Four immediately distinct sounds**: drag to top-right (bright major arpeggios, 120 BPM) ·
  top-left (dark diminished runs, 110 BPM) · bottom-right (sustained major pads, 55 BPM) ·
  bottom-left (sparse minor chords, 40 BPM).
  **The first prototype where audio is generated FROM emotional coordinates, not analyzed from
  audio input.** "Navigate your musical mood." Zero deps; pure Web Audio + Canvas2D.

  Design notes: `src/app/dream/38-mood-xy/README.md`

---

## Previous newest (Cycle 41)

- **[/dream/37-ratio-lab](/dream/37-ratio-lab)** — Ratio Lab.
  A 9×5 Tonnetz lattice: each node is a just-intonation ratio relative to A3 (220 Hz drone).
  **Right = P5 (×3/2). Up = M3 (×5/4). Diagonal = m3 (×6/5).** Click any node to hear it
  against the drone — consonant intervals feel "locked in," no beating. Multiple nodes ring
  simultaneously. Hover for JI ratio + Hz + cents deviation from equal temperament.
  Color encodes consonance: **amber/warm (simple ratio, large)** → **cool blue (complex, small)**.
  Mic mode: autocorrelation pitch detection highlights the nearest lattice node with a pulsing
  blue ring. Hold a chord on piano — multiple nodes glow and their triangle shape on the lattice
  IS the chord quality (major = one orientation, minor = inverted).
  **The first prototype about tuning theory.** "Navigate harmony as a landscape."
  Zero deps; pure Web Audio + Canvas2D.

  Design notes: `src/app/dream/37-ratio-lab/README.md`

---

## Previous newest (Cycle 40)

- **[/dream/36-pluck-field](/dream/36-pluck-field)** — Pluck Field.
  24 Karplus-Strong virtual strings in a 4×6 grid: C pentatonic from C2 to G6. Click any
  cell to pluck — the string vibrates as an animated standing wave and rings with synthesized
  plucked-string audio (no oscillators, no samples: feedback delay loop IS the string). The
  first prototype built on **physical modeling synthesis**. Low strings ring for ~3 seconds;
  high strings decay in ~0.5s — all from the physics. Hold multiple cells to hear chords bloom.
  **Touch/drag = glissando** (sweep your finger across cells like a harp).
  Mic mode: percussion onsets pluck random strings in the octave range matching your centroid.
  Color: violet (C2) → orange (G6), same palette as `1-live`.
  **"What if the canvas was a harp?"** Zero deps; pure Web Audio API.

  Design notes: `src/app/dream/36-pluck-field/README.md`

---

## Previous newest (Cycle 39 — research)

- **Cycle 39 was a research sweep** (no new prototype). 8 new entries in RESEARCH.md (§§53–60).
  5 new prototype ideas added to IDEAS.md. Highlights:

  - **`36-pluck-field`** (build next) — Karplus-Strong virtual string field. Click canvas cells
    to pluck 24 tuned virtual strings (C pentatonic, 4 octaves). Each string = 3 Web Audio nodes
    (`DelayNode` feedback loop). Physical modeling synthesis — none of the 35 existing prototypes
    use it. "What if the canvas was a harp?" Zero deps, one cycle.

  - **`37-ratio-lab`** (build next) — Tonnetz just intonation lattice explorer. Click any ratio
    node to hear the just-intonation interval against a drone. Mic mode shows where your pitch
    falls on the lattice. First tuning-theory prototype in the sandbox. High surprise value.
    Inspired by LIMITER (arxiv 2507.08675).

  - **`38-mood-xy`** — Russell circumplex emotion synthesis. Drag a dot on a 2D valence×arousal
    plane; Web Audio synthesizes music in real time (tempo, chord quality, register, brightness
    all driven by coordinates). First prototype where audio is *output* from emotional coordinates,
    not *input*. Inspired by AffectMachine-Pop (arxiv 2506.08200).

  - **`39-anticipate`** — ReaLJam-inspired ghost-note anticipation display. Extends
    `33-aria-companion`: AI's planned response notes appear as ghost bars before they play.
    "Watch Aria decide before she plays." Inspired by ReaLJam (arxiv 2502.21267, CHI 2025).

  - **`40-browser-musicgen`** — In-browser MusicGen via Transformers.js (~390MB ONNX model,
    cached after first load, zero API cost). Potential path for the long-queued `6-compose`.
    Needs Karel OK on model download size.

  - **Open question for Karel**: OK on ~390MB Transformers.js model download for in-browser
    AI music generation? Also: Gemini key for `lyria-jam`? MediaPipe CDN for `gesture-music`?

---

## Previous newest (Cycle 38)

- **[/dream/35-loop-station](/dream/35-loop-station)** — Loop Station.
  The first prototype where you **build** a composition rather than react to one. Four
  phase-locked recording slots: tap **● REC** to record from mic, **■ STOP** to close the
  loop — it starts playing immediately, locked to the same grid as all other slots. MUTE,
  CLEAR, and 1/2/4-bar length selectors per slot. BPM tap-tempo button.
  Demo loads 4 pre-synthesized loops (sub-bass drone, piano phrase, arpeggio, click track)
  all phase-locked at 80 BPM — try ▶ Load demo loops for an immediate layered result.
  Canvas mini-waveform per slot with scrolling playhead. Color scheme matches `1-live`
  (violet=sub-bass, green=low-mid, orange=high-mid, yellow=mid).
  **"Build a multi-layer performance in real time."** Zero deps; pure Web Audio API.

  Design notes: `src/app/dream/35-loop-station/README.md`

---

## Previous newest (Cycle 37)

- **[/dream/34-spectral-morph](/dream/34-spectral-morph)** — Spectral Morph.
  The first prototype to **resynthesize** rather than visualize. Two audio sources (A and B)
  are FFT'd every 256 samples by an inline AudioWorklet (1024-point Cooley-Tukey, hand-rolled).
  The morph slider blends their magnitude spectra in the frequency domain, then IFFTs back to
  audio with Source A's phase. At t=0.5 you hear a genuinely new timbre — not a crossfade.
  Demo: sawtooth (many harmonics) → sine (one harmonic). Best: try Source B = **noise** —
  the saw-to-noise cross-dissolve is something a crossfade can never produce.
  Visual: three stacked spectrum strips (B top, Blend middle, A bottom); vertical cursor shows
  morph position live.
  **"Morph between your piano and a sawtooth — through the spectrum, not a mixer."**
  Zero deps; pure Web Audio + inline FFT worklet.

  Design notes: `src/app/dream/34-spectral-morph/README.md`

---

## Previous newest (Cycle 36)

- **[/dream/33-aria-companion](/dream/33-aria-companion)** — Aria Companion.
  The first **dialogue** prototype in the sandbox — all 32 previous prototypes are reactive;
  this one listens, waits, and responds. Play a melody on piano or sing; after 2 seconds of
  silence, Aria generates a response phrase using a Markov chain learned from your own note
  transitions. The longer you play, the more Aria mirrors your interval tendencies.
  Visual: split dual piano roll — YOU (warm orange, top) + ARIA (cool blue, bottom).
  **"The piano responds when you rest."** Zero deps; no ML. ~20 lines of Markov JS.

  Design notes: `src/app/dream/33-aria-companion/README.md`

---

## Previous newest (Cycle 35 — research)

- **Cycle 35 was a research sweep** (no new prototype). 9 new entries in RESEARCH.md (§§44–52).
  3 new prototype ideas added to IDEAS.md. Highlights:

  - **`aria-companion`** (build next) — turn-taking piano dialogue agent. User plays a phrase;
    after 2s of silence the system generates a Markov-chain response and plays it back as a piano
    sound. "The piano responds when you rest." First **dialogue** prototype in the sandbox (all
    32 previous are *reactive*, not compositional). Inspired by Aria-Duet, NeurIPS 2025.
    Zero deps, one cycle.

  - **`spectral-morph`** — AudioWorklet FFT magnitude interpolation. Morph slider blends the
    spectral character of two audio sources → resynthesized output. Unique: first prototype to
    resynthesize from frequency-domain manipulation rather than just analyze it. Zero deps,
    one cycle.

  - **`loop-station`** — 4-slot BPM-synced live loop station. First prototype that lets you
    BUILD a multi-layer composition over time rather than playing/watching. Loop boundary
    crossfade eliminates clicks. Demo pre-loads 4 loops. Performance-relevant. Zero deps,
    one cycle.

  - **Design Space for Live Music Agents** (arxiv 2602.05064, Feb 2026): taxonomy of 184 live
    music systems. Key insight: "dialogue agents" (listen → compose → respond) are the
    least-explored category, and the sandbox has zero. `aria-companion` fills this gap.

  - **Web Audio API — Configurable Render Quantum** (Q4 2026 spec): buffer size below 128 samples
    → sub-3ms audio latency. Will improve all real-time pitch-detection prototypes once shipped.

  - **iPlug3** (Jan 2026): WebGPU + SDL3 + MCP audio plugin framework — scripts mirror web APIs.
    **Best current path to "Resonance as an installation"** (Tauri mode, venue deployment).

  - **Kling 2.6**: Ghost image + motion prompt → 5s cinematic clip + native audio, $0.14/sec.
    New option for ghost-animate (alongside HappyHorse, Veo 3.1 Fast). Speech synthesis: the
    Ghost can say a line from the journey narrative in the clip. Admin-only, needs FAL_KEY.

  **Open questions for Karel**:
  - Gemini API key still needed for `30-lyria-jam` (infinite steering AI music).
  - CDN dep (~8MB) still pending for `31-gesture-music` (hand gesture → synth).
  - `iPlug3` — is the "Resonance as an installation" path worth a dedicated design cycle?

---

## Previous newest (Cycle 34)

- **[/dream/32-mood-vis](/dream/32-mood-vis)** — Mood Viz.
  Audio features (energy, spectral brightness, band coefficient of variation) drive a rule-based
  classifier that picks one of six visual modes automatically — and transitions between them as
  the music changes character. Six moods → six aesthetics: Lissajous (minimal/silence), ink rings
  (calm+bright), orbital drift (calm+dark), radial bloom (energetic+bright), pulse field
  (energetic+dark), spectral mandala (complex). 7% trail persistence gives natural ~1s crossfades.
  Demo cycles through all six moods at 5s each without a mic. HUD shows current mood + amplitude,
  centroid, spread in real time. **"The visualizer that listens — and decides."**

  Design notes: `src/app/dream/32-mood-vis/README.md`

---

## Previous newest (Cycle 33)

- **[/dream/29-scene-spatial](/dream/29-scene-spatial)** — Scene Spatial.
  Six Ghost narrative scenes (Stone Chamber → Cosmic Ascension), each with a hand-authored 3D
  soundscape built from oscillators, filtered noise, and FM chirps — no audio files. Sources
  placed on a sphere via Web Audio HRTF PannerNode. Drag any colored dot to reposition a sound
  source in real time; the HRTF updates instantly. Canvas shows top-down sphere view (F/B/L/R
  compass; ▲/▼ for elevation). Reverb from a per-scene procedurally generated impulse response.
  **"Each Ghost scene has a sound as distinctive as its visuals — wear headphones."**
  Best demo: Forest Dawn (canopy birds above, stream left, piano right — three distinct azimuths).

  Design notes: `src/app/dream/29-scene-spatial/README.md`

---

## Previous newest (Cycle 32)

- **[/dream/28-chord-canvas](/dream/28-chord-canvas)** — Chord Canvas.
  Play a chord on piano (or mic any pitched source) — the chord name appears in huge monospace
  type: "Dm", "G", "C". Hue is the root note (C=red, D=yellow, G=blue, A=violet). A scrolling
  timeline strip below shows your chord history as colored blocks; wider = held longer. A 12-bar
  chromagram shows pitch-class energy in real time. Demo mode plays ii–V–I (Dm7→G7→Cmaj7) with
  audible triangle oscillators — you hear the chords as the detector names them.
  **"The first prototype to explicitly name musical structure."**
  Natural complement to `24-piano-roll` (pitch positions) and `22-code-score` (written notation).

  Design notes: `src/app/dream/28-chord-canvas/README.md`

---

## Previous newest (Cycle 31 — research)

- **Cycle 31 was a research sweep** (no new prototype). 7 new entries in RESEARCH.md (§§37–43).
  5 new prototype ideas added to IDEAS.md. Highlights:

  - **Lyria RealTime API** — WebSocket infinite streaming AI music with live text prompt blending
    (Google DeepMind). Browser-callable with a Gemini API key. `30-lyria-jam` prototype queued.
    Most live-performance-relevant AI music capability found yet: it never stops, you just steer it.
    **Open question for Karel: do you have a Gemini API key to test this with?**

  - **iOS 26 / Safari 26** — WebGPU now fully supported on iPhone/iPad. Karel's phone can now run
    `15-webgpu-fluid`, `16-particle-life-gpu`, and upcoming `27-gpu-additive`. No more mobile WebGPU
    disclaimer needed.

  - **`28-chord-canvas`** (build next) — chroma-based chord detection + color timeline. "F♯m, C, G"
    in real time. Zero deps, one-cycle build. First prototype to name musical structure.

  - **`29-scene-spatial`** (build next) — Ghost preset scenes as hand-authored 3D spatial audio
    environments. Stone chamber = dry reverb + stone percussion. Cosmic = vast reverberant pad.
    Zero deps, extends `7-spatial`'s HRTF. One-cycle build.

  - **`31-gesture-music`** — webcam hand gestures → synth (needs MediaPipe CDN dep, ~8MB).
    **Open question for Karel: OK to load MediaPipe from CDN?**

  - **`32-mood-vis`** — semantic "visualizer that listens" — adapts visual mode based on music
    character (calm/energetic/complex) via rule-based audio feature classifier. Zero deps.

---

## Previous newest (Cycle 30)

- **[/dream/26-score-follow](/dream/26-score-follow)** — Score Follow.
  Bach Invention No.1 displayed as a static piano roll. Play along on piano or sing —
  the score lights green as you match each note (±1.5 semitone tolerance). The cursor
  advances only when you play the right pitch; it pauses on silence, backs up one note
  after 1.5s of wrong-note playing (forgiveness mode). Yellow triangle at the cursor
  shows your detected pitch in real time. Demo mode plays the score and self-matches —
  cursor advances perfectly through all 35 notes.
  **"The first prototype where your playing is evaluated, not just visualized."**
  Natural partner to `24-piano-roll` (see what you played) and `22-code-score` (write
  the score). This one asks you to *reproduce* it.

---

## Previous newest (Cycle 29)

- **[/dream/25-cellular](/dream/25-cellular)** — Cellular.
  Conway's Game of Life where each column of the grid is a musical pitch (C2 left → C5 right).
  Living cells trigger triangle-wave notes; the *shape* of a pattern IS its melody.
  Glider = a wandering 4-note motif that walks up and down the pitch axis. Pulsar = a strict
  3-tick rhythmic chord machine. Acorn/R-pentomino = methuselahs that evolve chaotically for
  hundreds of generations. Click/drag to paint cells; BPM slider (40–120). No mic needed.
  **"What if generative music was also life?"**

---

## Previous newest (Cycle 28)

- **[/dream/24-piano-roll](/dream/24-piano-roll)** — Piano Roll.
  Play piano or sing — each note appears as a glowing colored bar scrolling left, placed at its
  MIDI pitch on a vertical axis (C2 bottom, C7 top). The exact representation every DAW uses,
  rendered live from mic input. Hue matches `1-live` and `13-piano-canvas` (low pitch = cool,
  high = warm). Piano key sidebar highlights the active key. BPM slider sets scroll speed.
  Demo mode plays Bach Invention No.1 silently and paints its own notes — the roll fills itself
  from the score in real time. **"What you played, as notation."**
  Completes the piano-representation triptych: `13-piano-canvas` (abstract painting),
  `22-code-score` (written score), `24-piano-roll` (scrolling notation).

---

## Previous newest (Cycle 27 — research)

- **Cycle 27 was a research sweep** (no new prototype). 8 new entries in RESEARCH.md (§§29–36).
  4 new prototype ideas added to IDEAS.md. Highlights:

  - **`24-piano-roll`** (build next) — live scrolling piano roll from mic pitch detection. Every
    DAW has one; this is the first in the dream sandbox. Companion to `13-piano-canvas` (abstract
    painting) and `22-code-score` (written notation). Zero deps, one-cycle build.
  - **`25-cellular`** — Conway's Game of Life as a musical instrument. Living cells trigger pitched
    notes; gliders make repeating loops, oscillators make rhythmic patterns. Completely different
    generative paradigm from all 23 existing prototypes. Inspired by CLAVIER-36.
  - **`26-score-follow`** — live score cursor: play the Bach fragment from `22-code-score` on your
    piano; the score highlights as you match notes. Autocorrelation pitch detection + symbol tracking.
  - **`27-gpu-additive`** — particles ARE Fourier partials; GPU physics IS the synthesizer. Most
    technically ambitious idea in the queue (2+ cycles). Requires WebGPU.
  - **Kling 3.0 update** — multi-shot storyboarding + native audio enables a *full Ghost journey arc*
    as a coherent video sequence (4 shots, character consistency, native audio). Better than
    HappyHorse for multi-shot arcs. Single-clip: HappyHorse still wins.
  - **WASM AudioWorklet** trend confirmed as 2026 standard for browser DSP. Could upgrade
    `23-pitch-harmonize` with WASM FFT vocoder, but needs Karel approval on the build-step approach.
  - **Score following research active** (arxiv 2505.05078, May 2026) — 174ms latency, browser-feasible.

---

## Previous newest (Cycle 26)

- **[/dream/23-pitch-harmonize](/dream/23-pitch-harmonize)** — Pitch Harmonize.
  First prototype that **transforms** audio in real time. Mic → AudioWorklet ring-buffer
  pitch shifter → HRTF 3D position. Pick an interval (+4th, +5th, +8va, -8va), drag the
  harmony to any azimuth (−90° left ↔ +90° right). With headphones: you and your
  pitch-shifted copy float apart in space. Visual: **dual phase-portrait vectorscope** on
  one canvas — orange trail = dry, blue trail = harmony. At a fifth interval, the two
  ellipses tilt at different angles (the interval IS a geometric relationship between them).
  Zero npm deps; AudioWorklet loaded from inline Blob URL.
  **"Become your own accompanist."**

---

## Previous newest (Cycle 25)

- **[/dream/22-code-score](/dream/22-code-score)** — Code Score.
  Write a melody in the textarea; press play. Each note sounds and simultaneously paints itself
  onto the canvas. Score DSL: `C5 E D5 E E5 E F5 E` (note + duration), `rest Q`, `[C4 E4 G4] Q`
  (chords), `// comments`. Durations: W H Q E S = whole → sixteenth. BPM slider (40–200).
  **Rising phrases arc upward, descending phrases drift down** — the melodic contour IS the
  stroke's shape. Chord tones stack as parallel colored bars above the root.
  Default demo: Bach Invention No.1 in C major (BWV 772). Save painting as PNG.
  **The reverse of `13-piano-canvas`** — instead of playing → painting, you write → both
  hear and see.

---

## Previous newest (Cycle 24)

- **[/dream/21-three-mesh-av](/dream/21-three-mesh-av)** — Three.js Mesh AV.
  First prototype using Three.js + React Three Fiber. An icosahedron whose surface deforms
  live with audio — **bass expands the equatorial belt**, **treble pushes the polar caps**,
  organic noise breathes the surface at silence. Custom GLSL vertex shader with view-space
  Fresnel rim glow. Bloom post-processing from `@react-three/postprocessing` makes displaced
  vertices glow into soft halos. Drag to orbit, scroll to zoom. Demo mode (no mic) and mic mode.
  **21 prototypes, and this is the first to use Three.js** — it was sitting installed and unused
  for 20 cycles.

---

## Previous newest (Cycle 23 — research)

- **Cycle 23 was a research sweep** (no new prototype). 7 new entries in RESEARCH.md (§§22–28).
  3 new prototype ideas added to IDEAS.md: `three-mesh-av` (Three.js R3F + TSL audio-reactive 3D
  mesh, buildable next cycle, zero new deps), `code-score` (browser music DSL + canvas painter),
  `pitch-harmonize` (AudioWorklet phase vocoder harmony + HRTF + dual vectorscope). Ghost-animate
  plan updated: prefer HappyHorse-1.0 (new #1 ranked joint audio-video model) over Seedance 2.0.

---

## Previous newest (Cycle 22)

- **[/dream/20-scope](/dream/20-scope)** — Vectorscope.
  Two modes: **Lissajous demo** (no permissions) plots two sine waves against each other —
  each musical ratio (octave, fifth, fourth, M3rd, m3rd) traces a distinct closed figure.
  The CRT phosphor persistence makes cusps glow bright and fast arcs dim, exactly like
  a real oscilloscope. **Phase portrait** (mic) plots the live signal against its own past
  at an adjustable delay — a single piano note makes an ellipse, a chord makes overlapping
  loops, percussion makes an explosive spray. Rainbow colors from direction-of-travel hue
  (atan2 of trajectory tangent). **The geometry of harmony — visible.**

---

## Previous newest (Cycle 21)

- **[/dream/19-cymatics](/dream/19-cymatics)** — Cymatics.
  Sand particles settling into Chladni figures — the geometric node line patterns of a
  vibrating plate. 2000 amber grains drift onto the exact curves where sound is stationary.
  Eight modes from simple (1,2) Ring to intricate (5,6) Snowflake. Additive blending makes
  the node lines glow bright against black. Demo auto-cycles every 4.5s; mic mode maps
  spectral centroid to mode; manual buttons always override. **The hidden geometry of
  frequency — what Resonance literally means.**

---

## Previous newest (Cycle 20)

- **[/dream/18-granular](/dream/18-granular)** — Granular Cloud.
  Your audio shattered into overlapping grains and reassembled as a glowing cloud. Each dot IS
  a grain playing: X = where in the recent audio buffer it was sampled from, Y = its pitch shift
  in cents. Hue encodes buffer age (blue = older audio, orange = most recent). Additive blending
  makes dense grain regions glow bright. Four sliders: density, pitch range, grain size, scatter.
  Demo mode (synthetic oscillators, no permissions) and mic mode. **First prototype that transforms
  rather than visualizes — the dots are the sound.**

---

## Previous newest (Cycle 19)

- **[/dream/17-acoustic-trail](/dream/17-acoustic-trail)** — Acoustic Trail 3D.
  Your audio mapped to its own coordinate space: spectral centroid → X, treble ratio → Y,
  bass energy → Z. Each frame leaves a glowing point; the trail accumulates into a 3D scatter
  cloud that is the acoustic fingerprint of the performance. Additive blending means dense regions
  (repeated acoustic patterns) glow brighter. Drag to rotate. Color = centroid warmth (indigo =
  dark/bassy → orange = bright/treble). Demo mode runs 6 LFO-modulated oscillators that trace a
  slow Lissajous path over 30 seconds. **First prototype where audio becomes its own geometry.**

---

## Previous newest (Cycle 17)

- **[/dream/16-particle-life-gpu](/dream/16-particle-life-gpu)** — Particle Life GPU.
  9,000 particles across 6 species simulated entirely on the GPU via WGSL compute shaders —
  10× the count of `/dream/8-particle-life` (CPU, 900). Tiled N-body reduces GPU bandwidth
  64×. Additive blending creates galaxy-cluster glow; dense cores bloom white-hot, tendrils
  spiral like galactic arms. Requires WebGPU. Same audio mapping: band energy → species
  turbulence, onset → matrix reshuffle. Demo mode shows periodic reshuffles automatically.
  **10× more particles. GPU-native emergent behavior.**

---

## Previous newest (Cycle 18 — research)

- **Cycle 18 was a research sweep** (no new prototype). 6 new entries in RESEARCH.md (§16–§21).
  2 new prototype ideas added to IDEAS.md: `acoustic-trail` (3D spectral coordinate trail, buildable
  next cycle, zero deps) and `elevenlabs-compose` (streaming structured music with section control,
  needs budget approval). Ghost-animate entry updated to use Seedance 2.0 (native audio, one step).
  Strongest finding: ElevenLabs Music streaming + section control opens a genuinely different music
  generation path than MiniMax or ACE-Step.

---

## Previous newest (Cycle 16)

- **[/dream/15-webgpu-fluid](/dream/15-webgpu-fluid)** — WebGPU Fluid.
  Navier-Stokes fluid simulation at 512×512 via WebGPU render pipelines — 16× the resolution of
  `/dream/3-fluid` (WebGL2, 128×128). Uses `rgba16float` ping-pong textures natively: no extension
  flags, no Safari workaround. Same audio mapping (bass→pressure pulse, treble→turbulence,
  centroid→dye color, onset→burst). Drag to stir. Requires WebGPU; clear error message otherwise.
  **Compare side-by-side with 3-fluid** — vortex clarity difference is visible immediately.

---

## Previous newest (Cycle 15)

- **[/dream/14-typography](/dream/14-typography)** — Kinetic Typography.
  Six Resonance phrases — RESONANCE, SOUND INTO LIGHT, BODY OF MUSIC, EACH NOTE A WAVE,
  FREQUENCIES, OF BEING — cycle every 8 seconds. Each letter is a physical object assigned
  to a frequency band; bass hits scatter bass-colored letters, treble shimmer agitates
  the high-frequency ones. Spring dynamics assemble the phrase from scatter over ~1.5s.
  Demo mode runs synthetic LFO bands — immediate, no permissions. Mic input drives letter
  turbulence live. **First prototype where language itself is the visual material.**

---

## Previous newest (Cycle 14)

- **[/dream/13-piano-canvas](/dream/13-piano-canvas)** — Piano Canvas.
  Your improvisation becomes a painting. Mic input → autocorrelation pitch detection →
  each note leaves a glowing brush stroke on a persistent canvas. Pitch → hue (A4=0°,
  rotating ~60°/octave), loudness → weight (1.5–8 px), duration → length. Rising melodic
  lines arc upward; descending ones drift down. Strokes accumulate; save as PNG when done.
  Demo mode plays a silent wandering melody so the canvas paints itself automatically.
  **The first prototype where the session leaves a permanent visual artifact.**

---

## Previous newest (Cycle 13 — research)

- **Cycle 13 was a research sweep** (no new prototype). 7 new entries in RESEARCH.md,
  4 new prototype ideas in IDEAS.md. Highlights: `piano-canvas` (built Cycle 14),
  `reference-compose` (MiniMax Music 2.5 style-match, needs FAL_KEY), WebGPU desktop-universal.

---

## Previous newest (Cycle 12)

- **[/dream/12-tessellate](/dream/12-tessellate)** — Tessellate.
  A 40×28 grid of Truchet tiles whose topology rewires on every beat. Each tile is a
  quarter-arc in one of two orientations; adjacent arcs form long connected curves across
  the canvas. On a bass hit, 12% of tiles flip simultaneously — the curves disconnect and
  reconnect into entirely new paths in a flash of white. Between beats, bass energy drives
  a slower drizzle of individual tile flips. Two complementary arc colors (warm + cool)
  rotate through the spectrum; mids control saturation. Op-art aesthetic — the first
  tile-based geometric prototype in the sandbox.
  **Start demo** for immediate visuals (no permissions). **Start mic** for live audio response.
  **Reshuffle** button resets the grid topology.

---

## Previous (Cycle 11)

- **[/dream/11-terrain](/dream/11-terrain)** — Spectrogram Terrain.
  Your audio history becomes a 3D landscape: frequency on the X axis, time receding to the
  horizon on Z, amplitude as terrain height. 64 log-spaced frequency columns (30 Hz → 20 kHz),
  80 frames of time-history. Bass forms blue mountains; treble draws bright orange ridges.
  The newest frame is at your feet; the oldest fades to the horizon.
  **Start demo** for instant visuals (silent oscillators with LFO breathing). **Start mic**
  for live input — piano chords show as overtone-series ridgelines.

---

## Previous (Cycle 10)

- **[/dream/10-strange](/dream/10-strange)** — Strange Attractor + FM Synthesis.
  The Lorenz chaotic system traces a butterfly in 3D and simultaneously drives FM
  synthesis — you see **and** hear the same chaos evolve. x-position flips carrier
  pitch between low (left wing, cool blue) and high (right wing, warm orange). z-height
  shapes harmonic richness (pure sine at bottom, buzzy at top). Wing transitions are
  irregular, non-repeating melody notes — because they're deterministically chaotic.
  **Mic mode**: your volume reshapes σ, accelerating wing transitions.
  **Start demo** for instant visuals + audio (no permissions, no upload).

---

## Previous (Cycle 9)

- **[/dream/9-reaction-diffusion](/dream/9-reaction-diffusion)** — Gray-Scott
  Reaction Diffusion. Two virtual chemicals on a GPU grid create Turing patterns:
  coral, fingerprints, dividing spots, maze walls — emergent from diffusion rates
  alone. Bass raises the feed rate; treble raises the kill rate; percussive hits
  inject new seed colonies. Click the canvas to inject manually. 6 presets.
  **Start demo** for instant visuals (no permissions).

---

## Previous (Cycle 8)

- **[/dream/8-particle-life](/dream/8-particle-life)** — Particle Life. 900
  particles across 6 species governed by a random 6×6 attraction/repulsion matrix.
  Emergent flocking, predator-prey spirals, orbiting clusters — nobody programmed
  them. Audio energy injects velocity noise per species. Percussive onsets reshuffle
  the matrix mid-song. Matrix heatmap in the corner shows the current rules.
  **Start demo** for instant (no permissions). **Start mic** for live audio response.

---

## Previous (Cycle 7)

- **[/dream/7-spatial](/dream/7-spatial)** — Binaural HRTF Spatial Audio. Six
  frequency bands placed in 3-D space around you via Web Audio `PannerNode`
  (HRTF model). Default: bass front-left, treble above, sub-bass below. Drag
  any dot on the sphere to move that band. Three modes: Demo oscillators (instant),
  Mic, File upload. Wear headphones — the spatial illusion is real above ~2kHz.

---

## Previous (Cycle 6)

- **[/dream/5-arcs](/dream/5-arcs)** — Journey Arc Engine v2. Five arc types
  (Psychedelic / EDM Build-and-Drop / Cinematic / Ritual / Sleep Cycle), each
  with distinct phases, color palettes, particle behaviors, and intensity curves.
  Demo mode compresses to 60s. Phase timeline at the bottom lets you jump to any
  phase. Mic input drives particle intensity live. The right panel explains each
  arc's design rationale vs. the psychedelic baseline.

---

## Previous newest (Cycles 4–5)

- **[/dream/4-operator](/dream/4-operator)** — Operator Panel — two-pane
  live performance interface. Left: performer canvas (6 AV scenes). Right:
  scene picker, BPM tap, mic crowd-noise meter, MIDI detection. Keys 1–6
  trigger scenes; Space taps BPM. Dip-to-black transitions. MIDI notes
  C3–A3 trigger scenes via hardware.
- Cycle 4 was a research cycle (no new prototype). See RESEARCH.md for 8 findings.

- **[/dream/3-fluid](/dream/3-fluid)** — Fluid — real-time Navier-Stokes ink-in-water
  driven by audio. Bass pulses the center, treble stirs turbulence, pitch shifts dye color.
  Drag to stir manually. Ambient drift mode for no-mic use.
- Cycle 4 was a research cycle (no new prototype). See RESEARCH.md for 8 findings.

---

## Prototypes

### 42-binaural
**Status**: `demoable` · **Cycle shipped**: 47 · **Last touched**: 2026-05-19

Open `/dream/42-binaural`. Click **▶ Start** with the default **α 10 Hz** preset and put on
headphones. You'll hear a single continuous tone — but inside your skull, a 10 Hz oscillation
begins. There's nothing at 10 Hz in the audio file; your superior olivary complex is computing
the difference between the 200 Hz (left ear) and 210 Hz (right ear) pure tones and producing a
synchronized neural beat.

The canvas shows cyan expanding rings at 10 Hz — one ring born per beat, growing to the canvas
edge and fading. The center glows on each ring birth. Try the **δ 2** preset: two slow deep-violet
pulses per second, like breathing. Let it run for 30 seconds; the rhythmic quality is visceral.

Try **γ 40**: the amber rings blur into a near-constant glow — you can't see 40 distinct rings at
60 fps. The carrier tones at 200 Hz and 240 Hz create a more complex audio texture; the binaural
beat is subconscious at this rate.

Switch to **isochronic** mode (stop first to switch): now the beat is audible as a tremolo
effect — the carrier amplitude pulses at the beat rate. At θ 6 Hz it sounds like a slow shiver.
Isochronic works on speakers; binaural requires headphones.

Drag the **beat** slider slowly from 2 Hz up to 40 Hz and watch the canvas colors transition:
deep violet (δ) → indigo (θ) → cyan (α) → green (β) → amber (γ). The ring speed accelerates
continuously. This is the full spectrum of human brainwave activity, mapped to a slider.

Design notes: `src/app/dream/42-binaural/README.md`

---

### 41-code-vis
**Status**: `demoable` · **Cycle shipped**: 46 · **Last touched**: 2026-05-19

Open `/dream/41-code-vis`. Click **▶ Start** — C major chord rings immediately (three glowing
rings in a triangle: violet C4, green-yellow E4, amber G4). All three pulse together at 80 BPM.

Edit the textarea: change `E4 sin 0.6` to `Eb4 sin 0.6` — 400ms later, the middle ring shifts
color (slightly cooler) and you hear the chord go minor. Change `G4 tri 0.5` to `G5 tri 0.5` —
the third ring moves up the hue scale toward orange/red and becomes smaller (higher octave, same
amp, but G5 is in the treble range).

Add a fourth voice on a new line: `Bb4 saw 0.35` — the triangle becomes a square (four-voice
layout). The sawtooth ring is noticeably brighter/buzzier in the audio.

Try: `A2 sin 0.9` alone — one ring at the center, deep violet, large, slow pulse. BPM 40 for
meditative breathing. BPM 200 for a frenetic strobe.

Try a cluster: C4 / C#4 / D4 / D#4 four adjacent semitones — four rings in a square, tightly
spaced in hue. The beating between near-frequency oscillators creates interference patterns in
the audio; the visual looks like four closely-related siblings.

Click **↓ PNG** at the pulse peak to capture the bloom at its brightest.

Design notes: `src/app/dream/41-code-vis/README.md`

---

### 40-shepard-tone
**Status**: `demoable` · **Cycle shipped**: 45 · **Last touched**: 2026-05-19

Open `/dream/40-shepard-tone`. Click **▶ Start** — you'll immediately hear a tone that seems to
be rising. Let it run for 30 seconds. Notice: it never gets any higher. It just… keeps going up.

Try the Freeze button mid-glide: the tone suspends into a chord of 3–4 sine waves. You can hear
the bell-curve distribution — the middle notes (A3–A5) are loudest, extremes (A1, A8) barely
audible. Unfreeze: the ascent resumes from wherever it paused.

Switch to **Whole-tone** interval: the illusion takes on a staccato quality — a mechanical clock
ticking upward step by step, each step clearly a whole tone higher, yet the register never
changes. Switch to **Semitone**: the individual pitches are distinct, you can hear each rung of
the staircase. Switch back to **Glide**: the smoothest, most seamless version of the illusion.

Try **Descending**: an endlessly falling tone that never lands. The sensation is qualitatively
different from ascending — more like a drain, or falling without hitting the ground.

For mic mode: click 🎤, then play piano. Loud chords accelerate the ascent. A single quiet note
lets the staircase breathe slowly. The ascent rate reflects the energy of what you're playing —
like the music is driving its own hallucination.

Watch the oscillator column (right side): the glow sweeps upward circle by circle. When A8 (top)
fades dark, a moment later A1 (bottom) begins to glow — you can *see* the wrap in the visual,
even though you can't hear it in the audio.

Design notes: `src/app/dream/40-shepard-tone/README.md`

---

### 39-anticipate
**Status**: `demoable` · **Cycle shipped**: 43 · **Last touched**: 2026-05-19

Open `/dream/39-anticipate`. Click **DEMO** — the 10-note C major phrase begins painting the YOU
(orange) panel one note at a time. After the last note, 2 seconds pass, then: all of Aria's
planned response notes appear simultaneously as dashed blue rectangles in the ARIA panel (bottom),
spread across the right half of the canvas. You can see the whole response — which notes will be
higher or lower, how long each will last — in silence.

Then the first note sounds and its ghost bar flashes bright and fills solid. 470ms later, the
next note sounds and solidifies. Watch the solidification wave sweep left to right through the
ARIA panel. Each solidifying bar starts with a 280ms glow burst (blur 28, glow 1.0) then settles
to normal brightness. The dashed outlines to the right are Aria's "still-ghost" notes: her
intentions not yet executed.

In mic mode: play 8+ notes on piano, pause 2 seconds. Ghost notes appear before Aria speaks.

Design notes: `src/app/dream/39-anticipate/README.md`

---

### 38-mood-xy
**Status**: `demoable` · **Cycle shipped**: 42 · **Last touched**: 2026-05-19

Open `/dream/38-mood-xy`. Click **▶ Play**. Immediately drag the dot to the top-right corner
(excited+happy) — you'll hear fast bright major arpeggios at ~120 BPM. Drag to top-left
(excited+sad) — the arpeggios darken to diminished runs, the timbre dulls. Drag to bottom-right
(calm+happy) — the rhythm slows to 55 BPM and the chords become simultaneous major pads. Drag
to bottom-left (calm+sad) — 40 BPM, sparse minor chords, almost sub-bass register, minimal.

Watch the background color shift: amber → purple → teal → navy as you traverse the four
quadrants. The white trail shows where you've been. The top-center label names your current
quadrant ("energetic · happy", "calm · sad", etc.) and shows current BPM and chord quality.

Try dragging slowly in a large circle — you can hear all four quadrant characters blend into
each other continuously. The center point (both axes at 0) is the quietest, slowest, most
neutral state: one voice, 70 BPM, minor chord, mid-register, medium sustain.

Design notes: `src/app/dream/38-mood-xy/README.md`

---

### 37-ratio-lab
**Status**: `demoable` · **Cycle shipped**: 41 · **Last touched**: 2026-05-19

Open `/dream/37-ratio-lab`. The 9×5 grid renders immediately (no button press).
Hover any node — tooltip shows pitch class, JI fraction, Hz, cents deviation from 12-TET.

Click the center node (A3, amber, labeled "A") — a sine tone rings at 220 Hz against the drone.
Hear that they're the same note: no beating, locked in. Click the node one step right (E4, "E",
3/2) — you'll hear the perfect fifth. Extremely clean interval; JI P5 is 2¢ sharp of 12-TET P5.
Click the node above the root (C#4, "C♯", 5/4) — the major third. At +14¢ flat of 12-TET M3,
it's noticeably purer. Stack root + fifth + major third: you hear an A major chord in just
intonation — three simultaneously locked sine waves.

Click the +5¢ label on any node to hear the difference from its 12-TET position (the drone IS
the 1/1 root, and the sine tones are exact JI ratios — no piano temperament involved).

For mic mode: click **🎤 Mic**, play a sustained A or E on piano. The nearest node pulses blue.
Play a scale — watch the ring walk across the lattice one node at a time.

Design notes: `src/app/dream/37-ratio-lab/README.md`

---

### 36-pluck-field
**Status**: `demoable` · **Cycle shipped**: 40 · **Last touched**: 2026-05-19

Open `/dream/36-pluck-field`. Click any of the 24 cells — you'll hear a plucked string sound
immediately (no button press needed: AudioContext initializes on first click). The bottom row
(C2–C3) has deep, long-sustaining bass strings; the top row (G5–G6) has bright, quickly-decaying
treble strings. Click a chord shape: C4, E4, G4 (three neighboring cells in the middle rows)
for a C major pentatonic chord.

Try a full glissando: click the bottom-left cell (C2) and drag right across the bottom row, then
up to the next row. Low bass strings bloom violet; treble strings glow orange. With multiple
strings ringing simultaneously, the canvas fills with overlapping standing waves.

For mic mode: click **🎤 mic**, allow permissions, clap or play piano with rhythmic attacks.
Each onset plucks a string in the octave range matching your playing's brightness. Bass drum =
plucks low strings (violet); cymbal = plucks high strings (orange).

Note: if many bass strings ring simultaneously, the output can get loud — the master gain is
set to 0.5 but multiple overlapping C2 strings will sum. Turn down speakers/headphones first
when testing chord storms.

Design notes: `src/app/dream/36-pluck-field/README.md`

---

### 35-loop-station
**Status**: `demoable` · **Cycle shipped**: 38 · **Last touched**: 2026-05-19

Open `/dream/35-loop-station`. Click **▶ Load demo loops** — four pre-synthesized loops render
via OfflineAudioContext and all four start simultaneously on the next bar boundary at 80 BPM.
You hear a sub-bass drone (violet, Slot 1), piano phrase (green, Slot 2), bright arpeggio
(orange, Slot 3), and rhythmic click (yellow, Slot 4) — all locked to the same grid.

Try muting Slot 3 (orange arpeggio) and then unmuting it on the next downbeat. Try **CLEAR** on
the click track, then tap **TAP BPM** on the beat and record a new rhythm with your own voice
into Slot 4: press **● REC**, make some rhythmic sounds, press **■ STOP**. The new loop
joins the grid at the next bar boundary. All four layers play phase-locked.

To record without the demo: click **🎤 Start mic**, wait for "mic live", then press **● REC**
on any empty slot. Record for 2 bars (6 seconds at 80 BPM), then press **■ STOP**.

Design notes: `src/app/dream/35-loop-station/README.md`

---

### 34-spectral-morph
**Status**: `demoable` · **Cycle shipped**: 37 · **Last touched**: 2026-05-19

Open `/dream/34-spectral-morph`. Click **▶ Demo (sawtooth → sine)** — both sources start immediately.
Watch the three spectrum strips: Source A (bottom) blazes with harmonics (sawtooth), Source B (top)
has a single tall spike at C3 (sine). The Blend (middle) starts identical to A.

Drag the **MORPH** slider toward B. The harmonics in the Blend strip compress: n=2, 3, 4... fade.
At t=0.5 the blend has half-amplitude harmonics — a timbre between saw and sine. At t=1 only the
fundamental remains. Drag back fast: the harmonics snap back immediately.

For the best demo: select **noise** as Source B before starting. Slide to t=0.5 — you hear a
pitched buzz with noisy harmonics, like a bowed metal edge. Slide to t=1.0 — pure broadband noise.
Slide back to 0 — a clean sawtooth. This cross-dissolve is acoustically real; a crossfade cannot do it.

**Mic mode**: click **🎤 Start mic**, play piano. Source A is your mic input; Source B is the
selected synth. Drag the slider to gradually dissolve your piano into a sine wave of the same pitch
and phase. The Blend spectrum strip shows your playing's harmonic structure as you play it.

Design notes: `src/app/dream/34-spectral-morph/README.md`

---

### 33-aria-companion
**Status**: `demoable` · **Cycle shipped**: 36 · **Last touched**: 2026-05-19

Open `/dream/33-aria-companion`. Click **DEMO** — a 10-note C major phrase begins painting
itself into the YOU (orange) panel of the piano roll, one note at a time. After the last note,
a 2-second pause, then "Aria is thinking..." appears briefly. The ARIA (blue) panel fills with
Aria's response — a 10-note phrase derived from pentatonic intervals off the demo's last note
(cold Markov table on first run). Each subsequent demo cycle teaches the Markov table and the
responses converge toward your melodic tendencies.

Click **START MIC** and allow permissions. Play 8+ piano notes (any melody), then stop for 2
seconds. Aria responds. Play again — watch the Markov table accumulate. After 3 exchanges of
ascending scales, Aria starts ascending too. After 5 exchanges of chromatic runs, Aria starts
playing chromatic. The bottom panel accumulates all exchanges as a visual record of the dialogue.

Design notes: `src/app/dream/33-aria-companion/README.md`

---

### 32-mood-vis
**Status**: `demoable` · **Cycle shipped**: 34 · **Last touched**: 2026-05-19

Open `/dream/32-mood-vis`. Click **Demo** — the canvas begins in "minimal" mode (dim Lissajous
figure, silence simulated). After 5 seconds it transitions to "calm · bright" (ink rings expanding
from center, cool cyan). Watch the mode name update in the top-left as it cycles through all six.
The sidebar mood list highlights the active mode.

Click **Start mic** and play a bass note on piano — classifier should read calm_dark (low centroid,
moderate amplitude) and switch to the violet orbital drift. Switch to bright, high chords —
energetic_bright triggers the radial bloom with warm spokes radiating outward. Hit something
percussive (drum on a table, slap) — the complex classifier fires and the spectral mandala appears.
The HUD shows AMP, CENT (Hz), and SPREAD (CV of band energies) so you can see what's driving each
classification.

Design notes: `src/app/dream/32-mood-vis/README.md`

---

### 29-scene-spatial
**Status**: `demoable` · **Cycle shipped**: 33 · **Last touched**: 2026-05-19

Open `/dream/29-scene-spatial`. Click any scene button — **Forest Dawn** is the clearest demo.
Press **START SCENE**. With headphones: canopy birds arrive from above (▲), the stream from your
left-front, and a piano note from your right-front. All three azimuths are distinct. Try dragging
the "Canopy" dot from above to your left — the birds instantly move from overhead to lateral.

Try **Stone Chamber**: hear the piano note decay with a long 3.5s stone-room reverb tail.
Percussion hits arrive from directly above (stone on ceiling). The low resonance drone is
positioned behind and below — you feel the weight of the room.

Try **Cosmic Ascension**: the 55/110/220Hz harmonic pads (pure octaves) swell in over 2 seconds
from near-silence. The 6s reverb tail makes the space feel vast. Drag Root upward — the
fundamental bass moves from front-center toward overhead.

No mic needed. No audio files. All synthesis — oscillators, looped filtered noise, FM chirps.

Design notes: `src/app/dream/29-scene-spatial/README.md`

---

### 28-chord-canvas
**Status**: `demoable` · **Cycle shipped**: 32 · **Last touched**: 2026-05-19

Open `/dream/28-chord-canvas`. Click **DEMO ii–V–I** — triangle oscillators begin playing
Dm7 (2.5s), then G7 (2.5s), then Cmaj7 (2.5s), looping. Watch the large chord name change:
"Dm" (teal-blue) → "G" (blue) → "C" (red). The timeline strip below grows a new colored block
on each change; the chromagram shows the active pitch classes lighting up.

Click **START MIC** and allow permissions. Play a C major chord on piano (C+E+G). "C" appears
in large red text. Switch to G major (G+B+D) — the name changes to "G" and the color shifts
to blue. Hold a chord for 1–2 seconds for the most reliable detection. The timeline accumulates
your chord sequence: the harmonic rhythm of your playing, visible at a glance.

Design notes: `src/app/dream/28-chord-canvas/README.md`

---

### 26-score-follow
**Status**: `demoable` · **Cycle shipped**: 30 · **Last touched**: 2026-05-19

Open `/dream/26-score-follow`. Click **Demo mode** — the Bach Invention No.1 cursor begins
advancing immediately, each note lighting green as the demo self-matches at 72 BPM. Watch
the yellow triangle (your/demo pitch indicator) hit each score note exactly as the score
scrolls left. Try adjusting the BPM slider to slow down or speed up the demo.

Click **Start mic** and allow permissions. Play C4, D4, E4 ... following the score left to
right. Each correctly played note lights green and the score advances. Play the wrong note
for about 1.5 seconds — the cursor backs up one step (the "forgiveness" feature). The
target note pulses its pitch name (e.g. "C5") at the cursor position.

The piano key sidebar highlights your current pitch. The top-left shows "X / 35 notes"
match progress. When all 35 notes are matched: "✓ Score complete" overlay.

Design notes: `src/app/dream/26-score-follow/README.md`

---

### 25-cellular
**Status**: `demoable` · **Cycle shipped**: 29 · **Last touched**: 2026-05-19

Open `/dream/25-cellular`. Click **Glider** preset → **Start**. Watch the 5-cell glider walk
from left (bass) to right (treble) across the grid, triggering a 4-note motif that repeats on
every traversal. Click **Pulsar** instead → a 3-tick rhythmic chord machine fires immediately.
The pitch label in the corner shows C2 (left) → C5 (right).

Click or drag on the black grid canvas to paint/erase cells. Try placing a few horizontal rows
of cells at different heights — they'll trigger chords at the same pitch every tick. Mix a
Glider into a running Pulsar grid and watch the Glider gradually disrupt the Pulsar's rhythm.

Click **Acorn** → **Start** for 5206 generations of chaos before it stabilizes.

Design notes: `src/app/dream/25-cellular/README.md`

---

### 24-piano-roll
**Status**: `demoable` · **Cycle shipped**: 28 · **Last touched**: 2026-05-19

Open `/dream/24-piano-roll`. Click **Demo mode** — Bach Invention No.1 begins rendering its
own notes immediately. Watch the colored bars scroll left from the cursor line; C-note octave
markers help you read the pitch positions. Try the BPM slider — the bars stretch or compress
proportionally.

Click **Start mic** and play any single-note melody on piano or hum. Each note appears as a
glowing bar at its exact MIDI pitch. The piano key sidebar on the left highlights your current
note. Play a scale and watch the bars step up or down the grid in real time.

Design notes: `src/app/dream/24-piano-roll/README.md`

---

### 23-pitch-harmonize
**Status**: `demoable` · **Cycle shipped**: 26 · **Last touched**: 2026-05-19

Open `/dream/23-pitch-harmonize`. Click **Start mic** and allow permissions. Play a sustained
piano note or sing. Click **+5th** — your harmony appears a perfect fifth above you, floating
to the right in your headphones. Switch intervals live; the pitch shift updates without restart.

Drag the **pos** slider to place the harmony anywhere from hard-left to hard-right. Reduce
**harm** volume to blend dry and harmony. The scope shows two overlapping ellipses: orange =
your dry signal, blue = the shifted harmony. At a fifth interval they tilt at distinctly
different angles — the visual form of the interval.

No permissions for demo? The page will show an error and you'll need mic access. This is the
only prototype that genuinely requires live audio input (no demo oscillator mode — the whole
point is your own playing transformed).

Design notes: `src/app/dream/23-pitch-harmonize/README.md`

---

### 22-code-score
**Status**: `demoable` · **Cycle shipped**: 25 · **Last touched**: 2026-05-19

Open `/dream/22-code-score`. Click **▶ Play** with the default Bach Invention No.1 score.
Watch each eighth note paint itself as it sounds: rising phrases arc upward, descending
ones drift down. The melodic contour IS the stroke path.

Edit the score textarea and press Play again — changes take effect immediately. Syntax:
`C5 E` (eighth), `D#4 Q` (quarter), `Bb3 H` (half), `[C4 E4 G4] Q` (chord), `rest Q` (rest).
BPM slider speeds up / slows down the performance. Click ↓ to save the painting as PNG.

Design notes: `src/app/dream/22-code-score/README.md`

---

### 21-three-mesh-av
**Status**: `demoable` · **Cycle shipped**: 24 · **Last touched**: 2026-05-18

Open `/dream/21-three-mesh-av`. Click **Demo mode** — the icosahedron immediately begins
breathing with 6 LFO-modulated oscillators. Watch the equatorial belt expand and contract
as the low-frequency oscillators pulse; the polar caps shift with the high-frequency ones.
Drag to orbit, scroll to zoom. Bloom halos the brightest displaced vertices.

Click **Start mic** and play piano or sing. Bass notes visually inflate the equatorial ring.
Treble notes elongate the sphere toward its poles. Silence lets you see the organic breathing
of the noise term alone.

Design notes: `src/app/dream/21-three-mesh-av/README.md`

---

### dashboard (/ route)
**Status**: `demoable` · **Cycle shipped**: 1 · **Last touched**: 2026-05-18

`/dream/` is now an async server component that reads `MORNING.md` and
`STATE.md` at build time. Layout: MORNING.md hero → recent cycle
stream (label, summary, when) → clickable prototype list → footer.
Phone-first, no JS required.

### 1-live
**Status**: `demoable` · **Cycle shipped**: 0 · **Last touched**: 2026-05-17

Open `/dream/1-live` on the preview URL. Click **Start mic**, allow
permission, play or hum something. Six frequency bands bloom as
concentric color fields — sub-bass deep violet at the outer edge,
high treble white-hot at the center. Onsets flash. BPM and band
levels display top-right.

Design notes: see `src/app/dream/1-live/README.md`.

---

### 2-ghost-lab
**Status**: `demoable` · **Cycle shipped**: 2 · **Last touched**: 2026-05-18

Open `/dream/2-ghost-lab`. Two modes:
- **LoRA vs no-LoRA**: same prompt, A=flux-lora (Ghost character LoRA attached),
  B=flux-dev (base model). Directly shows whether identity lock is working.
- **A/B Prompts**: two independent prompts, each with optional LoRA toggle.

Five pre-set scenes (stone chamber → root portal → underground pool → tiny planet →
cosmic ascension) with alternate camera angles. Vote buttons (👍 A / Both / 👍 B /
Neither) stored in localStorage with running tally.

Design notes: `src/app/dream/2-ghost-lab/README.md`

---

### 3-fluid
**Status**: `demoable` · **Cycle shipped**: 3 · **Last touched**: 2026-05-18

Open `/dream/3-fluid`. Click **Start mic** or **Ambient drift**. Drag to stir.

Real WebGL 2 Navier-Stokes fluid sim (128×128 RGBA16F). Bass injects radial
pressure pulses from center; treble adds turbulence splats; spectral centroid
maps to dye color (indigo → green → orange/red); onsets fire burst splats.
25 Jacobi iterations per frame for incompressibility. Filmic tone-mapped display.

Requires WebGL 2 + EXT_color_buffer_float (Chrome/Firefox/Safari 15+). Falls
back to an error message with explanation on unsupported browsers.

Design notes: `src/app/dream/3-fluid/README.md`

---

### 4-operator
**Status**: `demoable` · **Cycle shipped**: 5 · **Last touched**: 2026-05-18

Two-pane operator panel. Left: Canvas performer view with 6 AV scenes
(Void / Threshold / Bloom / Current / Ascension / Terminus). Right: scene
picker, BPM tap tempo, crowd-noise mic meter, MIDI device readout.

Keys 1–6 trigger scenes; Space taps BPM. MIDI notes C3–A3 trigger scenes
via hardware controller. Transitions use dip-to-black (350ms).

Design notes: `src/app/dream/4-operator/README.md`

### 5-arcs
**Status**: `demoable` · **Cycle shipped**: 6 · **Last touched**: 2026-05-18

Open `/dream/5-arcs`. Pick an arc tab at the top, click **Demo mode**.
The arc runs for 60 seconds; phase chips at the bottom light up as you
progress. Click any chip to jump. Start mic for live audio input.

Five arc types: Psychedelic (the current baseline, 6 phases) · EDM
Build-and-Drop (5 phases, compressed catharsis) · Cinematic (7 phases,
three-act narrative) · Ritual (4 phases, ceremony) · Sleep Cycle (5 phases,
8-hour arc that never flashes).

Design notes: `src/app/dream/5-arcs/README.md`

### 7-spatial
**Status**: `demoable` · **Cycle shipped**: 7 · **Last touched**: 2026-05-18

Open `/dream/7-spatial`. Click **Demo oscillators** (no mic/file needed) —
six sine tones play, each from a different 3D position in your headphones.
Drag colored dots on the sphere to reposition each frequency band. Try moving
"High" below your ears and "Sub-bass" above — the tones really move.
Mic and File modes split real audio into 6 spatial channels.

Design notes: `src/app/dream/7-spatial/README.md`

---

### 8-particle-life
**Status**: `demoable` · **Cycle shipped**: 8 · **Last touched**: 2026-05-18

Open `/dream/8-particle-life`. Click **Start demo** — 900 particles immediately
self-organize into emergent patterns driven by a random 6×6 attraction/repulsion
matrix. No flocking code; no goals; purely emergent. Press **reshuffle** to
randomize the matrix and watch the entire swarm re-organize.

Start mic → play something with clear percussive hits (drums, piano). Loud
onsets reshuffle the matrix automatically. The six species respond to their
corresponding audio bands — sub-bass kicks animate the violet particles, cymbal
shimmer animates the pink ones.

Matrix heatmap in the top-left corner (green=attraction, red=repulsion) shows
the current rules. FPS counter and species energy bars also displayed.

Design notes: `src/app/dream/8-particle-life/README.md`

---

### 11-terrain
**Status**: `demoable` · **Cycle shipped**: 11 · **Last touched**: 2026-05-18

64 log-spaced frequency columns × 80 time-history rows. Painter's algorithm renders back-to-front:
each row's ridge occludes rows behind it. Fake-perspective scale makes the nearest row fill the
bottom of the screen and the oldest row converge at the horizon. Two modes: demo (6 oscillators
with LFOs, silent) and mic (live FFT). Peak frequency label updates at 8 Hz.

Design notes: `src/app/dream/11-terrain/README.md`

---

### 10-strange
**Status**: `demoable` · **Cycle shipped**: 10 · **Last touched**: 2026-05-18

Open `/dream/10-strange`. Click **Start demo** — the Lorenz attractor begins tracing
its butterfly immediately, and FM synthesis starts. The carrier pitch flips between
registers as the trajectory switches wings. Watch the z readout rise and fall; you'll
hear the timbre shift from clean to buzzy in sync.

Start mic → play something or sing loud. Your RMS amplitude feeds into σ, accelerating
or decelerating the wing transitions. Loud = chaotic pitch turbulence. Quiet = the
attractor settles into longer wing visits, more sustained tones.

Design notes: `src/app/dream/10-strange/README.md`

---

### 9-reaction-diffusion
**Status**: `demoable` · **Cycle shipped**: 9 · **Last touched**: 2026-05-18

Open `/dream/9-reaction-diffusion`. Click **Start demo** — a Gray-Scott RD simulation
initializes and runs 600 warmup steps before the first frame so the pattern is
already visible. Pick a preset (Coral, Fingerprint, Spots, Stripes, Mitosis, Maze)
to switch pattern families mid-run. Click anywhere on the canvas to inject a new
activation blob and watch a colony grow from scratch.

With mic + music: bass raises feed rate (denser, more energetic patterns); treble
raises kill rate (structures become more isolated). Drum hits auto-inject blobs.

Requires WebGL2 + EXT_color_buffer_float (Chrome 56+, Firefox 51+, Safari 15+).

Design notes: `src/app/dream/9-reaction-diffusion/README.md`

---

### 20-scope
**Status**: `demoable` · **Cycle shipped**: 22 · **Last touched**: 2026-05-18

Open `/dream/20-scope`. Click **Lissajous demo** — no permissions needed. Ratio starts at
1:1 (unison, ellipse) and auto-cycles every 5 seconds through octave, fifth, fourth, sixth,
M3rd, m3rd. Watch each figure build up its CRT glow over 1–2 seconds. Click any ratio button
to jump. The phase slowly oscillates so the figure breathes between open/closed states.

Click **Phase portrait** and allow mic. Play a sustained piano note — you'll see an ellipse
with overtone loops decorating it. Play a chord — multiple loops overlap. Use the delay slider
to find the delay that gives the cleanest ellipse for the note you're playing (quarter-period
of the fundamental). Play staccato — the figure appears on the attack then fades.

Design notes: `src/app/dream/20-scope/README.md`

---

### 19-cymatics
**Status**: `demoable` · **Cycle shipped**: 21 · **Last touched**: 2026-05-18

Open `/dream/19-cymatics`. Click **Start demo** — particles scatter from the canvas center
and gradually resolve into the (1,2) Ring pattern (two diagonal node lines + an ellipse).
Watch the modes cycle every 4.5 seconds: Clover, Cross, Asterisk, Lattice, Fine Star,
Crystal, Snowflake — each pattern distinct, more intricate than the last. The transition
(scatter → resolve) takes 2–4 seconds per mode.

Click **Start mic** and play a sustained piano note. The spectral centroid maps to the
nearest mode; hold a bass note for the simpler modes, play high treble for the complex ones.
Manual mode buttons override at any time.

Design notes: `src/app/dream/19-cymatics/README.md`

---

### 18-granular
**Status**: `demoable` · **Cycle shipped**: 20 · **Last touched**: 2026-05-18

Open `/dream/18-granular`. Click **Start demo** — five LFO-modulated sine oscillators feed the
analyser silently and grains immediately begin spawning. Each dot that appears is a real grain of
audio playing through your speakers; X is where in the recent buffer it was sampled, Y is its
pitch shift. Watch the cloud breathe as the LFO mix slowly shifts.

Click **Start mic** and play piano or sing. A sustained note creates a vertical stripe (all grains
near the same buffer position, random pitch smear). A chord thickens the stripe. Staccato notes
make the cloud pulse and fade between attacks. Try: density=40, pitch=800¢ for a lush alien reverb.

Four sliders live-adjustable while running: density (grains/sec), pitch range (¢), grain size (ms),
scatter (how far from recent audio grains are allowed to sample).

Design notes: `src/app/dream/18-granular/README.md`

---

### 17-acoustic-trail
**Status**: `demoable` · **Cycle shipped**: 19 · **Last touched**: 2026-05-18

Open `/dream/17-acoustic-trail`. Click **Start demo** — six oscillators with independent LFOs
begin tracing a slow path through the acoustic feature space. The point cloud grows and the
trail curves as dominant frequencies shift. Drag to rotate the 3D view and see the path from
different angles.

Click **Start mic** and play anything — piano, voice, or drums. Single pitches trace vertical
columns; rich chords spread into clouds; bass notes pull the trail toward the Z wall; treble
content lifts it up the Y axis. The `clear` button resets the trail without stopping audio.

Design notes: `src/app/dream/17-acoustic-trail/README.md`

---

### 16-particle-life-gpu
**Status**: `demoable` · **Cycle shipped**: 17 · **Last touched**: 2026-05-18

Open `/dream/16-particle-life-gpu`. Click **Start demo** — 9,000 particles immediately
self-organize into emergent patterns driven by a random 6×6 matrix, simulated on GPU via
WGSL compute. Compare with `/dream/8-particle-life` (CPU, 900 particles) to see the
density difference. Press **reshuffle** for a new emergent pattern. With mic: loud onsets
reshuffle automatically; band energies drive per-species turbulence.

Requires WebGPU (Chrome 113+, Edge, Firefox 147+, Safari 26+).

Design notes: `src/app/dream/16-particle-life-gpu/README.md`

---

### 15-webgpu-fluid
**Status**: `demoable` · **Cycle shipped**: 16 · **Last touched**: 2026-05-18

Open `/dream/15-webgpu-fluid`. Click **Ambient drift** — fluid starts immediately. Same
controls and audio mapping as `3-fluid` but at 4× the linear resolution (512² vs 128²).
Drag to stir. "Start mic" → play piano; spectral centroid shifts dye hue in real time.

Requires WebGPU (Chrome/Edge 113+, Firefox 147+, Safari 26+). Displays a clear error on
unsupported browsers — no silent failure.

Design notes: `src/app/dream/15-webgpu-fluid/README.md`

---

### 14-typography
**Status**: `demoable` · **Cycle shipped**: 15 · **Last touched**: 2026-05-18

Open `/dream/14-typography`. Click **Start demo** — letters immediately scatter in from
random positions and spring-assemble into RESONANCE. Watch the phrase cycle every 8 seconds.
Each letter belongs to one frequency band; the LFO-driven demo bands keep letters in gentle
perpetual motion even between beats.

Click **Start mic** and play anything with rhythmic content. Bass hits scatter the violet/cyan
letters; drum attacks burst all letters radially outward. Between hits, the spring pulls them
back into the phrase. Long phrases (SOUND INTO LIGHT) become abstract particle clouds on loud
passages; short phrases (FREQUENCIES) read clearly even at high energy.

Design notes: `src/app/dream/14-typography/README.md`

---

### 13-piano-canvas
**Status**: `demoable` · **Cycle shipped**: 14 · **Last touched**: 2026-05-18

Open `/dream/13-piano-canvas`. Click **Demo mode** — a wandering piano melody plays silently
and the canvas begins painting itself. Each note leaves a glowing brush stroke; pitch sets the
hue (bass notes = cool blues/greens, treble = warm oranges/reds), loudness sets the weight,
duration sets the length. The stroke cursor drifts up for rising melodic lines and down for
descending ones.

Click **Start mic** and play piano, sing, or hum. Your improvisation accumulates as a painting.
Click **save PNG** to download.

Design notes: `src/app/dream/13-piano-canvas/README.md`

---

### 12-tessellate
**Status**: `demoable` · **Cycle shipped**: 12 · **Last touched**: 2026-05-18

Open `/dream/12-tessellate`. Click **Start demo** — a 40×28 Truchet tile grid
appears instantly. Watch the curves: they connect across the full canvas, then
rewire on each beat. Click **reshuffle** to reset the topology with a full-grid
flash. **Start mic** → play something with clear bass hits; the rewire mass-flip
fires on each onset.

Two complementary-colored arc families (primary hue + 165° offset) slowly rotate
through the spectrum over 40 seconds. With mids loud, saturation peaks and the
colors pop; with quiet audio, the arcs dim to near-black.

Design notes: `src/app/dream/12-tessellate/README.md`

---

### 6-compose `[queued — from Cycle 4 research]`
ACE-Step AI music generation: type a mood → 30s musical sketch → plays
through the fluid/live visualizer. "Compose your journey soundtrack."

### 8-particle-life `[shipped Cycle 8 — see above]`

### 9-particle-life-gpu `[queued]`
WebGPU upgrade of 8-particle-life: same physics but WGSL compute shader, 50k+
particles. Requires WebGPU (2026: 70%+ browsers). Will look like a galaxy.

### 9-ghost-sound `[queued — from Cycle 4 research]`
Ghost LoRA images + MMAudio V2 soundscaping: Ghost scenes that breathe.
Admin-only. ~$0.01/generation.

---

## How to use this sandbox

- **Don't expect production polish**. These are dreams. Some will be
  beautiful, some will be broken, all are exploratory.
- **You're in the loop.** Open a Claude Code conversation, say "what
  did you dream last night?" The assistant will summarize and propose
  directions. Tell it what to deepen / kill / add.
- **Adding ideas**: tell Claude "add this to the dream queue: ..." and
  it'll write into IDEAS.md. Next agent cycle picks it up.
- **Stopping the loop**: go to claude.ai/code/routines, disable
  "Resonance Dream Agent." Re-enable any time.

---

## Files to scan each morning

In rough order:

1. **`/dream/`** — the live dashboard (renders MORNING.md + cycles + prototypes)
2. **STATE.md** — chain of thought for each cycle
3. **INDEX.md** (this file) — prototype status board
4. **RESEARCH.md** — findings from research cycles (created cycle ~4)
5. **IDEAS.md** — full queue
