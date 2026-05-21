# Resonance Dream Sandbox — prototype index

This is the single page Karel opens each morning. It mirrors the live
index at `/dream/` (the Vercel preview URL). Click a route to play
with the prototype; click the design notes link to read the agent's
thinking.

Status legend: `skeleton` (route exists, not yet interactive) ·
`wip` (partial) · `demoable` (works, rough) · `polished` (refined).

---

## ⭐ Newest (Cycle 92 — kids build)

- **[/dream/82-kids-color-piano](/dream/82-kids-color-piano)** — Color Piano (kids). `demoable`
  First kids prototype. Eight pentatonic circles — C D E G A C D E across two octaves. Tap any
  circle to play, hold to sustain, drag across circles for a glissando, multiple fingers for chords.
  No wrong notes (C-major pentatonic, all consonant). Each circle has a bold saturated color. Soft
  C-major ambient pad from first touch — silence never feels broken. No text, no score, no fail states.
  Circles sized `20vmin`: ≥78px on a 390px phone, ≥153px on a 768px iPad — well above KIDS.md's
  64px minimum. Pointer events handle both mouse and multi-touch with glissando baked in.
  **For**: kids 4+ · handed to a toddler immediately.
  Zero deps · Zero API · 1.58 kB.
  Design notes: `src/app/dream/82-kids-color-piano/README.md`

---

## Previous newest (Cycle 91 — build)

- **[/dream/74-touchdesigner-feedback](/dream/74-touchdesigner-feedback)** — TD Feedback. `demoable`
  TouchDesigner's TOP feedback loop, ported to WebGPU. Two ping-pong render textures loop on
  themselves each frame — the output of frame N becomes the input of frame N+1, transformed
  by a slight rotation + zoom + hue shift + brightness decay. Audio (bass/mid/treble/onset) injects
  a colored bloom layer each frame; the feedback amplifies and spirals it into complex self-similar
  patterns within 3–4 seconds. Four sliders: ROTATION (±15‰ rad/frame), ZOOM (0.992–1.012×),
  HUE DRIFT, DECAY. ↺ RESET clears to black. Demo mode works without mic permissions.
  WebGPU required · Zero deps · Zero API · 5.2 kB.
  Design notes: `src/app/dream/74-touchdesigner-feedback/README.md`

---

## Previous newest (Cycle 90 — research)

- **Cycle 90 was a research sweep** (no new prototype). 9 new entries in RESEARCH.md (§§157–165).
  5 new prototype ideas added to IDEAS.md. Top picks for next builds:
  - **`node-synth`** (Cycle 91, zero deps) — visual Web Audio routing graph. Drag-and-connect oscillators, filters, delays, reverbs. Modular synthesis as the Web Audio graph it actually is.
  - **`fm-explorer`** (Cycle 92, zero deps) — 2-operator FM synthesis. Classic DX7 timbres (electric piano, bell, metallic). Real-time sideband spectrum. 71 prototypes, none have done FM synthesis.
  - **`room-acoustic`** (Cycle 93, zero deps) — draw a 2D room, hear its reverb via image-source IRs + ConvolverNode.

  **Key findings**:
  - CassetteAI `cassetteai/music-generator` — 30s sample in ~2s ($0.02/min), 10× faster than ACE-Step. FAL_KEY in use.
  - xAI TTS `xai/tts/v1` — 5th Ghost TTS paradigm: inline `[pause]`/`[sigh]` + semantic `<whisper>`, `<slow>` wrapping tags. FAL_KEY in use.
  - AI vs Human music perception paradox (arxiv 2506.02856) — listeners prefer AI music but rate human music as more effective. Actual emotional response: no difference. Framing matters.

  **Open questions**: `ANTHROPIC_API_KEY`? `GEMINI_API_KEY`? `browser-stems` model size OK?

---

## Previous newest (Cycle 89 — build)

- **[/dream/71-shader-evolve](/dream/71-shader-evolve)** — Shader Evolve. `demoable`
  Natural selection of audio-reactive WGSL shaders. Four mutated variants run simultaneously in a 2×2
  WebGPU grid. Click any cell to promote it to a full-res 60fps focus view. Click **↻ EVOLVE** to breed
  four new mutations from the selected variant. **★ SAVE** stores the current selection to a persistent
  gallery (up to 6 slots, localStorage) — click a tile to restart evolution from a saved ancestor.
  **✎ EDIT** opens the raw WGSL for manual refinement. Each mutation randomly multiplies 3–5 of 16
  named shader parameters by a factor in [0.4, 2.5] — always valid WGSL, often dramatically different.
  `ringFreq` mutated to 45+ creates moiré-like interference; `sat` near 0 produces monochrome shaders
  with their own aesthetic. The selection UI is purely visual: look at four things, pick the one that
  "feels right," breed. Audio uniforms: `uBass`, `uMid`, `uTreble`, `uOnset`, `uTime`, `uBPM` — demo
  mode works without mic permissions. WebGPU required. Zero deps · Zero API · 5.82 kB.
  Design notes: `src/app/dream/71-shader-evolve/README.md`

---

## Previous newest (Cycle 88 — build)

- **[/dream/70-pitch-algo-compare](/dream/70-pitch-algo-compare)** — Pitch Compare. `demoable`
  Three pitch detection algorithms running simultaneously on every audio frame — see where they
  agree and where they diverge. **Orange** = Autocorrelation (ACF peak). **Blue** = YIN (cumulative
  mean normalized difference, ~15% fewer octave errors). **Green** = HPS (harmonic product spectrum,
  4 harmonics — great for piano and strings). A **gold dashed cursor** appears when ≥2 algorithms
  agree within 1.5 semitones; a faint piano tone plays on each new consensus note.
  Demo uses sawtooth oscillators cycling through 8 pitches — sawtooth has all harmonics so HPS works
  well and the comparison is immediately meaningful. Mic mode: play single notes to see consensus,
  play low bass or chords to watch algorithms diverge. Piano roll C2–C7, confidence bars per algorithm.
  **"Which algorithm is right? Sometimes all of them. Sometimes none."**
  First prototype making pitch detection internals visible and learnable. Zero deps · Zero API · 4.67 kB.
  Design notes: `src/app/dream/70-pitch-algo-compare/README.md`

---

## Previous newest (Cycle 87 — build)

- **[/dream/69-oracle-music](/dream/69-oracle-music)** — Oracle Music. `demoable`
  Three coins cast six times → one of 64 hexagrams → music shaped by archetypal qualities.
  Animated coin sequence builds the hexagram line-by-line from the bottom. The synthesis maps
  I-Ching tradition to audio: Hexagram 1 (The Creative) plays bright major arpeggios at 80 BPM
  through a wide-open filter at C5; Hexagram 2 (The Receptive) plays a single pentatonic tone at
  35 BPM through a 400 Hz filter at C2 — pure stillness. Moving lines (sums of 6 or 9) glow amber,
  signaling the hexagram is in transition. Click **Cast again** for a new draw.
  64 hexagrams × musical parameters (BPM, scale, register, density, brightness).
  First prototype connecting music to a divination tradition. High surprise factor.
  **"The oracle answers in sound."** Zero deps · Zero API · 5.64 kB.
  Design notes: `src/app/dream/69-oracle-music/README.md`

---

## Previous newest (Cycle 86 — research)

- **Cycle 86 was a research sweep** (no new prototype). 10 new entries in RESEARCH.md (§§147–156).
  5 new prototype ideas added to IDEAS.md. Top picks for next builds:
  - **`oracle-music`** (Cycle 87, zero deps) — 64 I-Ching hexagrams → musical parameters. Coin-cast animation, synthesized music shaped by hexagram's archetypal qualities. High surprise.
  - **`pitch-algo-compare`** (Cycle 88, zero deps) — autocorrelation vs. YIN vs. HPS running simultaneously on mic input. Shows where algorithms agree/diverge.
  - **`shader-evolve`** (Cycle 89, zero deps) — genetic mutation of `68-wgsl-synth` shaders; select favorites, breed.
  - **`ghost-lip`** (Cycle 89/90, FAL_KEY) — Inworld TTS viseme timestamps → animated Ghost face with synced mouth movement.
  - **`browser-stems`** (needs Karel OK on ~200MB ONNX model) — in-browser Demucs stem separation → HRTF 3D playback.

  **Open questions**:
  - `browser-stems` model size OK? (~200MB CDN, cached after first load)
  - ANTHROPIC_API_KEY → `claude-shader`; GEMINI_API_KEY → `lyria-jam`, `lyria-ghost`, `binaural-lyria`, `piano-to-ghost`

---

## Previous newest (Cycle 85 — build)

- **[/dream/68-wgsl-synth](/dream/68-wgsl-synth)** — WGSL Synth. `demoable`
  Write a WebGPU shader that responds to your playing — live, in the browser.
  Split-screen: left = WGSL fragment shader (editable textarea); right = fullscreen WebGPU canvas.
  Six pre-wired audio uniforms: **uBass, uMid, uTreble, uOnset, uTime, uBPM** (+ uResX/uResY) — fed
  every frame from the AnalyserNode or demo LFOs. Edit any line; shader recompiles 400ms later.
  Errors shown with line numbers; the last valid pipeline keeps running — no black frames.
  Default shader: pulsing radial rings + grid shimmer + onset flash, HSV color cycle.
  Demo: LFO oscillators animate the shader without mic permissions. Mic: play piano — bass expands
  the rings, chords shimmer the grid, a sharp attack flashes white.
  **The lowest-level tool in the sandbox**: write raw WGSL; audio is the parameter.
  Natural partner to `claude-shader` (ANTHROPIC_API_KEY pending) which writes the WGSL for you.
  WebGPU required · Zero deps · Zero API · ~3.8 kB.
  Design notes: `src/app/dream/68-wgsl-synth/README.md`

---

## Previous newest (Cycle 84 — build)

- **[/dream/67-structure-viz](/dream/67-structure-viz)** — Structure Viz. `demoable`
  Your music as a map of itself. Every 1.5 seconds: capture FFT → 32 log-spaced feature bins →
  normalized vector. Compute the N×N **self-similarity matrix** (cosine similarity). Display as a
  heatmap: dark purple = dissimilar, bright white = same material. The diagonal is always white.
  Checkerboard kernel novelty function detects section boundaries; greedy similarity clustering
  assigns labels A / B / A′ / C — matching letter means recurring material.
  **Demo (▶ ABA)**: three oscillator phases (C3 chord → A4 chord → C3 returns). By bar 22 (≈33s)
  you see the classic "three bright blocks along the diagonal" with two bright off-diagonal corners
  confirming that A = A′. The timeline strip below shows `A | B | A′`.
  **Mic mode**: play any music — verse-chorus-verse, theme-variation-return, anything with
  recurring sections will produce off-diagonal bright squares.
  **First prototype that shows structure rather than content** — not what frequencies are present,
  but how sections relate. 66 prior prototypes visualize audio signal; this one visualizes form.
  Zero deps · zero API · 3.81 kB.
  Design notes: `src/app/dream/67-structure-viz/README.md`

---

## Previous newest (Cycle 83 — build)

- **[/dream/66-chatterbox-ghost](/dream/66-chatterbox-ghost)** — Chatterbox Ghost. `demoable`
  Record 5–10 seconds of any voice → Chatterbox Turbo renders all six Ghost narrative scenes in
  that cloned voice, with physical action tags embedded in the text: `[sigh]`, `[gasp]`, `[slowly]`,
  `[flatly]`, `[long pause]`. Six scene cards with editable lines, waveform per scene, exaggeration
  slider (0.0–1.0). Six concurrent API calls fire on "Generate Ghost voices." Without a reference
  clip, Chatterbox uses its default voice.
  First prototype where the Ghost can speak in **Karel's own voice** — or any voice from a 5-second clip.
  Four TTS paradigms now compared: Gemini (global style) / Orpheus (per-word XML) / ElevenLabs V3
  (per-phrase acting) / Chatterbox (voice-clone + physical action tags).
  ⚠ API parameter names are best guesses — paste error text if the endpoint rejects them.
  Chatterbox Turbo · FAL_KEY · $0.025/1000 chars · ~$0.009/full 6-scene generation.
  Design notes: `src/app/dream/66-chatterbox-ghost/README.md`

---

## Previous newest (Cycle 82 — research)

- **Cycle 82 was a research sweep** (no new prototype). 10 new entries in RESEARCH.md (§§137–146).
  4 new prototype ideas added to IDEAS.md. Highlights:

  - **Chatterbox Turbo (§137)** — 5-second voice cloning + paralinguistic tags `[sigh]`, `[gasp]`.
    FAL_KEY in use. $0.025/1000 chars — cheapest TTS in the sandbox. First model that can clone
    a specific voice. Build next cycle: `chatterbox-ghost` — hear the Ghost narrations in Karel's
    own voice (or any 5s reference clip).

  - **ImprovNet (§138, arxiv 2502.04522)** — play a seed phrase → AI generates a full 32-bar
    structured improvisation with controllable style transfer (jazz/classical/blues degree slider).
    First "complete the composition" AI in the queue. No API yet; monitor.

  - **Pianist Transformer (§139, arxiv 2512.02652)** — 135M-param model, human-level expressive
    piano rendering from flat MIDI. Apache 2.0. HuggingFace demo. Proxy-callable. → `expressive-render`.

  - **Self-similarity matrix (§143)** — zero-dep browser section detection. FFT → N×N cosine
    similarity colormap → section boundary lines. First prototype that shows musical STRUCTURE
    (does the chorus come back?) not signal content. → `structure-viz`. Buildable zero deps.

  - **D3PIA (§140), PianoFlow (§141), NCLMCTT (§142)** — three new research-direction prototypes
    queued pending API availability.

  **Open questions for Karel**:
  - NEW: Bundle a 5s Ghost voice reference for `chatterbox-ghost`? Could be Karel's own voice.
  - GEMINI_API_KEY → `lyria-jam`, `lyria-ghost`, `binaural-lyria`
  - ANTHROPIC_API_KEY → `claude-shader`

---

## Previous newest (Cycle 81 — build)

- **[/dream/65-dialogue-score](/dream/65-dialogue-score)** — Dialogue Score. `demoable`
  Contour-mirroring AI piano dialogue. Play a phrase (8+ notes + 2s silence); the system detects
  its melodic shape — ascending ↗, descending ↘, arch ∧, valley ∨, or neutral — then generates
  Aria's response with the **same contour**. Markov chain biases note choices from your playing
  history; contour constraint enforces pitch direction at each step. Both work together.
  Ghost notes (dashed blue) appear before Aria plays — full anticipation preview from `39-anticipate`.
  Header shows: `your phrase ↗ ascending → aria mirrors → aria responds ↗ ascending`.
  Demo: C major scale ascending → Aria responds ascending. First prototype where Aria's response
  has musical logic, not just statistical probability. "The AI mirrors your musical thought."
  Inspired by "Dialogue in Resonance" (arxiv 2505.16259, 2026). Zero deps · Zero API · 5.29 kB.
  Design notes: `src/app/dream/65-dialogue-score/README.md`

---

## Previous newest (Cycle 80 — build)

- **[/dream/64-eleven-dialogue](/dream/64-eleven-dialogue)** — Eleven Dialogue. `demoable`
  The Ghost is no longer alone. Six Ghost scenes as two-character dramatic exchanges — Ghost + Visitor —
  voiced by ElevenLabs V3 with inline emotional tags embedded per phrase: `[slowly, reverently]`, `[pauses]`,
  `[whispers]`, `[awed]`, `[infinite calm]`, `[long pause]`. Ghost uses Adam voice (deep, measured);
  Visitor uses Alice voice (lighter, questioning). Three API calls per scene, played sequentially with
  550ms silence between turns.
  Canvas: two glowing orbs separated by a vertical divider — Ghost amber-warm left, Visitor cool-blue right.
  Active speaker's orb pulses with live amplitude data; an expanding ring marks speaking. All six scenes
  pre-scripted with editable textareas; V3 tag hints in the UI.
  Stone Chamber: *"[slowly] The resonance here [pauses] is ancient."* · *"[nervous, awed] I didn't know it would feel this alive."* · *"[whispers] Everything that ever sounded here — still does."*
  "The Ghost is no longer alone." ElevenLabs V3 via FAL_KEY · ~$0.02/scene · 4.09 kB.
  ⚠ Endpoint `fal-ai/elevenlabs/tts/eleven-v3` is a naming-convention best-guess; paste error text if wrong.
  Design notes: `src/app/dream/64-eleven-dialogue/README.md`

---

## Previous newest (Cycle 79 — build)

- **[/dream/63-synesthetic-sketch](/dream/63-synesthetic-sketch)** — Synesthetic Sketch. `demoable`
  Six audio features → six visual dimensions on one accumulated canvas.
  **Spectral centroid** → hue (violet=bass, red=treble). **Bandwidth** → shape type: circle (pure
  tone), hexagon (mid spread), 7-pointed star (wideband). **Harmonic peaks** → inner concentric ring
  count (0–4). **Amplitude** → object scale. **Rhythm regularity** → scatter radius (regular playing =
  tight glowing cluster at center; improvised/irregular = wide scattered field). **Onset events** →
  radial spark burst at random canvas position.
  Objects accumulate additively with slow 0.4%/frame decay. Canvas persists across modes. Download as PNG.
  Demo: 6 incommensurable LFOs cycle through all shape types automatically. Mic: play a pure note
  → circles; chord → multi-ringed star; tap steady → center cluster; improvise → scattered field.
  "Not just what color your music is — what shape it is." Inspired by musicolors (RESEARCH.md §131).
  Zero deps · zero API · 4.26 kB.
  Design notes: `src/app/dream/63-synesthetic-sketch/README.md`

---

## Previous newest (Cycle 77 — build)

- **[/dream/62-collage-compose](/dream/62-collage-compose)** — Collage Compose. `demoable`
  Three inputs → one composition. Pick a **Ghost scene** (Stone Chamber, Root Portal, Underground Pool,
  Tiny Planet, Forest Dawn, Cosmic Ascension), pick a **mood word** (meditative / dreaming / ascending /
  melancholic / ethereal / grounded / tense / vast), and optionally **hum a melody** into the mic
  (up to 15s). The live "ACE-STEP PROMPT" panel shows exactly how the three inputs combine into tags.
  Click **Compose →** → ACE-Step generates a 30s track.
  - **With hum**: `audio-to-audio` — the model literally hears your melody and builds around it.
  - **Without hum**: `text-to-audio` — scene + mood alone still constrain more than a single description.
  Waveform strip: amber (your hum) | blue (generated). Bloom visualizer during playback.
  Footer shows which endpoint was used — it switches live when you record.
  Inspired by Mozualization (CHI 2025): multimodal music gen from image + audio + keyword.
  FAL_KEY · $0.006/track · 4.65 kB.
  Design notes: `src/app/dream/62-collage-compose/README.md`

---

## Previous newest (Cycle 76 — build)

- **[/dream/61-orpheus-voice](/dream/61-orpheus-voice)** — Orpheus Voice Lab. `demoable`
  Three-way Ghost TTS comparison: **A** = Gemini TTS global style direction (baseline from
  `56-ghost-voice`); **B** = Gemini TTS experimental style; **C** = Orpheus TTS with phrase-level
  XML emotion tags (`<reverent>`, `<whispers>`, `<sad>`, `<fearful>`, etc.).
  Six Ghost scenes. Each column: editable textarea → Generate → waveform → ▶ play. Vote:
  A / B / C wins, All good, Try again. Tallies stored per scene in localStorage.
  Pre-loaded C tags chosen to match the Ghost emotional arc: `<reverent>resonance</reverent>`,
  `<fearful>stirs</fearful>`, `<sad>remembers</sad>`, `<happy>together</happy>`. Edit and
  experiment — the textarea is fully live.
  Key question: does phrase-level tag control (Orpheus) produce more interesting Ghost narration
  than global style direction (Gemini)? The vote reveals it.
  Gemini TTS · Orpheus TTS · FAL_KEY · ~$0.01–0.02/row · 4.7 kB.
  Design notes: `src/app/dream/61-orpheus-voice/README.md`

---

## Previous newest (Cycle 75 — build)

- **[/dream/60-music-palette](/dream/60-music-palette)** — Music Palette. `demoable`
  Your audio becomes a 5-color palette. Bass energy → lightness (28–72%); treble-to-total
  ratio → hue anchor (250°=sad/blue → 50°=happy/warm yellow); spectral spread → saturation.
  Five swatches at ±30° and ±60° hue offsets breathe via a slow EMA (~1.5s time constant).
  Below the swatches: the `1-live` bloom ring showing the raw audio energy. Download the
  current palette as a labeled SVG — each download is a color snapshot of that musical moment.
  Demo: 6 incommensurable LFOs (never exactly repeating) drift the palette from warm to cool.
  "Your music as a color story." Zero deps · zero API · 4.15 kB.
  Design notes: `src/app/dream/60-music-palette/README.md`

---

## Previous newest (Cycle 74 — research)

- **Cycle 74 was a research sweep** (no new prototype). 10 new entries in RESEARCH.md (§§117–126).
  4 new prototype ideas added to IDEAS.md. Highlights:

  - **Orpheus TTS (§117)** — phrase-level `<emotion>` XML tags in text: `<reverent>`, `<whispers>`, `<fearful>`, etc. Different from Gemini TTS's global style_instructions — you control *individual words*. $0.001/Ghost scene line. FAL_KEY in use. Inspires `orpheus-voice`: 3-way A/B/C Ghost voice comparison (build next-next cycle).

  - **ElevenLabs Music composition_plan confirmed (§118)** — `fal-ai/elevenlabs/music` accepts `sections[].lines` for per-section lyrics. Ghost journey as a **sung** AI piece: each of the 6 scenes as a music section with the Ghost character's own lines. $2.40/3-min generation. Inspires `lyrics-journey` (build when budget confirmed).

  - **`music-palette` (§120, zero deps/API)** — Music2Palette (ACM MM 2025) proved that audio → emotion → 5-color palette is a real cross-modal alignment. Browser-native zero-dep approximation via existing arousal/valence audio pipeline. **Build next cycle.** Most novel per build cost.

  - **`collage-compose` (§121)** — Mozualization (CHI 2025): multimodal music gen from image + audio clip + keyword. In browser: extract image color temperature + hum pitch contour → rich ACE-Step prompt. More precise than text-only. FAL_KEY in use, $0.006/track.

  - **Three.js r184 (§123)** — WebGPU now Baseline in all browsers (Chrome, Edge, Firefox, Safari 26). r184 memory fix eliminates GC jank in long sessions. All Three.js prototypes are stable; `49-anemone-av` could switch to WebGPURenderer for free.

  **Open questions for Karel**:
  - `lyrics-journey` budget OK? ~$2.40/generation for a full Ghost journey as a sung piece.
  - `ANTHROPIC_API_KEY` in Vercel env? → `claude-shader` still waiting.
  - `GEMINI_API_KEY`? → `lyria-ghost`, `binaural-lyria`, `30-lyria-jam` still waiting.

---

## Previous newest (Cycle 73 — build)

- **[/dream/59-gemini-voice-lab](/dream/59-gemini-voice-lab)** — Ghost Voice Lab. `demoable`
  A/B style test for Gemini TTS `style_instructions`. Six Ghost scenes, each with two editable
  style textareas (A = baseline from `56-ghost-voice`, B = a contrasting experimental direction).
  Click **Generate A** and **Generate B** → each variant synthesizes independently → waveform
  strips appear → **▶ play** to listen. Vote: **A wins / Both fine / B wins / Try again**.
  Votes stored per scene in localStorage and accumulate across sessions — builds a preference signal.
  Pre-loaded contrasts: Stone Chamber (A = calm/solemn ↔ B = whispered/intimate);
  Cosmic Ascension (A = transcendent/vast ↔ B = zero-affect/infinite distance);
  Tiny Planet (A = airy/vast ↔ B = small/wondering). Textareas fully editable — try anything.
  "Find the Ghost's voice." Gemini TTS · FAL_KEY · ~$0.01/pair · 4.27 kB.
  Design notes: `src/app/dream/59-gemini-voice-lab/README.md`

---

## Previous newest (Cycle 72 — build)

- **[/dream/58-music-to-ghost](/dream/58-music-to-ghost)** — Music to Ghost. `demoable`
  Play for 8 seconds — the Ghost appears in the narrative scene that matches your music's emotion.
  8s capture → 12-bin chroma (chord quality) + RMS energy → 4-quadrant emotion classification →
  Ghost LoRA image. Click **▶ Demo** for an immediate result (C major chord → usually calm-bright
  → Forest Dawn). Click **🎤 Start mic** and play: major chord loud → Cosmic Ascension; minor soft →
  Stone Chamber; major soft → Forest Dawn; minor loud → Underground Pool.
  Pitch trail canvas during capture shows detected notes as glowing colored dots (violet=bass, red=treble).
  Different from `57-sound-to-image`: maps to Ghost LoRA scenes (the actual narrative geography of the
  journey) rather than generic environments. Ghost LoRA · fal-ai/flux-lora · ~$0.02/image · 4.5 kB.
  ⚠ Endpoint `fal-ai/flux-lora` confirmed in prod — paste any error text for a fix next cycle.
  Design notes: `src/app/dream/58-music-to-ghost/README.md`

---

## Previous newest (Cycle 71 — build)

- **[/dream/57-sound-to-image](/dream/57-sound-to-image)** — Sound-to-Image. `demoable`
  10 seconds of audio → acoustic fingerprint → Flux Schnell scene image of what your music looks like.
  Click **▶ Demo** for an immediate result (C major chord → sea cave or stone chamber). Click **🎤 Start mic**
  and play anything for 10 seconds. The prototype extracts: RMS energy, spectral centroid, zero-crossing rate,
  12-bin chroma (chord quality + root note), and autocorrelation pitch. Averages across ~100 frames → natural-language
  description ("soft, smooth tonal, warm bass-dominant music — C major, hopeful, central pitch 294 Hz") → one of 6
  scene archetypes → `fal-ai/flux/schnell`. Image fades in over 1.8 seconds.
  First prototype to generate a *semantic scene* from audio — not abstract art, not notation, but a physical place.
  FAL_KEY in use · ~$0.02/image · 4.49 kB.
  ⚠ Endpoint `fal-ai/flux/schnell` from standard naming — paste any error text for a fix next cycle.
  Design notes: `src/app/dream/57-sound-to-image/README.md`

---

## Previous newest (Cycle 70 — unblock + research)

- **Research sweep + `56-ghost-voice` endpoint fix** (Cycle 70)
  Fixed `56-ghost-voice`: switched TTS backend from the broken `fal-ai/inworld/tts` to **Gemini TTS**
  (`fal-ai/gemini-tts`). Gemini TTS supports `style_instructions` — natural-language voice direction —
  which maps perfectly to the scene descriptions ("calm, androgynous, stone chamber reverb, ancient
  and measured"). Voice: Charon (calm, professional). Build: clean, 3.39 kB.
  8 new RESEARCH.md entries (§§109–116). 3 new IDEAS queued: `57-sound-to-image`, `58-music-to-ghost`,
  `57-gemini-voice-lab`. See STATE.md Cycle 70 for full findings.

---

## Previous newest (Cycle 69)

- **[/dream/56-ghost-voice](/dream/56-ghost-voice)** — Ghost Voice. `demoable`
  The Ghost speaks — each of the six Ghost scenes narrated in a single elliptical line,
  synthesized by **Gemini TTS** on fal.ai (Charon voice + scene-specific style_instructions)
  and played from **front-center** (azimuth 0°, elevation 0°) via HRTF PannerNode. The voice
  floats directly ahead at ear level — the most intimate position in 3D audio space. Six
  scene-specific style descriptions shape timbre and pace ("very slow, low, stone chamber
  reverb" / "vast, ethereal, deep cosmic reverb"). Canvas: a slow-pulsing orb with expanding
  rings that accelerate during narration amplitude. Subtitle reveals character-by-character.
  Gemini TTS via FAL_KEY · ~$0.01/narration · headphones recommended.
  Design notes: `src/app/dream/56-ghost-voice/README.md`

---

## Previous newest (Cycle 68)

- **[/dream/55-webgpu-audio-fx](/dream/55-webgpu-audio-fx)** — GPU Audio FX. `demoable`
  First prototype where audio samples themselves are computed on the GPU. A C-major chord
  (C4+E4+G4+C5) is synthesized in JS, uploaded to a WebGPU storage buffer, then processed
  through two sequential WGSL compute shader passes: **Pass 1** — pitch-shift via
  speed-adjusted linear interpolation (0.5× = octave down, 2.0× = octave up); **Pass 2** —
  6-tap FIR feedforward reverb (delay taps at 21–105 ms, gain 0.40→0.07 per tap). Result
  reads back to CPU and plays looped. GPU timing displayed (typically 30–80ms — PCIe transfer
  dominated). Waveform comparison strips (original blue vs GPU-processed orange). All 54 prior
  prototypes use Web Audio API; this is the first where the signal DSP runs on the GPU.
  WebGPU required · Zero new deps · 3.85 kB.
  Design notes: `src/app/dream/55-webgpu-audio-fx/README.md`

---

## Previous newest (Cycle 67)

- **[/dream/54-maestro-stems](/dream/54-maestro-stems)** — Maestro Stems. `demoable`
  Generate a 2.5-minute instrumental track — then hear each stem played back from its own
  position in 3D space. Drums from directly overhead (+60°), bass from below (−30°), melody
  from front-right (+30°), harmonic filler from front-left (−30°). Five style presets
  (Cinematic, Jazz Trio, Ambient, Folk, Electronic). Editable prompt. Per-stem mix sliders
  (live gain, no restart). Per-stem mute. Top-down sphere canvas (same HRTF approach as
  `29-scene-spatial` and `53-ghost-sfx`). Raw API response in `<details>` for debugging.
  Qualitatively different spatial experience from `7-spatial` (frequency bands) — this splits
  by musical role: the drum overhead is overhead *because it's the drum*, not because it's in
  the treble range. First prototype where a full AI-generated band plays around the listener.
  FAL_KEY in use · $0.10/track · 4.59 kB.
  ⚠ Endpoint `beatoven/music-generation` + `stems: true` input from RESEARCH.md §101.
  If stems don't decode or you see an error, paste the raw response text and the agent fixes.
  Design notes: `src/app/dream/54-maestro-stems/README.md`

---

## Previous newest (Cycle 65)

- **[/dream/6-compose](/dream/6-compose)** — Compose. `demoable`
  The oldest queued prototype (Cycle 4, 61 cycles in queue). Describe a mood or scene in
  plain language → ACE-Step generates 30 seconds of music. Five Ghost scene presets as
  quick-start buttons: Forest Dawn (ceremonial drums, reverbed piano), Stone Chamber
  (single chord, long stone reverb), Underground Pool (water drip rhythm, drone), Cosmic
  Ascension (orchestral strings, 80 BPM), Tiny Planet (music box, sparse piano). The style
  tags textarea is always visible — you can see and edit exactly what's sent to the model.
  Waveform strip with playhead sweep. Six-band bloom visualizer during playback.
  Replay + MP3 download. Different from `48-arc-compose`: that uses structural section tags
  ([Intro]/[Build Up]/[Chorus]) for 60–90s structured pieces; this is "describe the vibe,
  get a 30s sketch." FAL_KEY already in use · $0.006/track · 3.85 kB.
  ⚠ Endpoint `fal-ai/ace-step` (base text-to-music endpoint) is a best-guess from naming
  conventions. If it shows an error, paste the text and the agent fixes next cycle.
  Design notes: `src/app/dream/6-compose/README.md`

---

## Previous newest (Cycle 64)

- **[/dream/53-ghost-sfx](/dream/53-ghost-sfx)** — Ghost SFX. `demoable`
  Six Ghost narrative scenes — each with three AI-generated naturalistic sound clips
  placed in 3D space via Web Audio HRTF PannerNode. Click a scene → three ElevenLabs
  Sound Effects API calls fire concurrently; each returned clip plays looping through a
  spatial PannerNode. Canvas: top-down sphere view (F/B/L/R compass) with glowing accent-
  colored source dots. Per-source mute/unmute. Six scenes × 3 sources each: Stone Chamber
  (piano + water drip + hum), Root Portal (bass drone + bird call + leaves), Underground
  Pool (ripple + deep resonance + ceiling drip), Tiny Planet (wind + bird pass + shimmer),
  Forest Dawn (canopy birds + stream + piano), Cosmic Ascension (vast drone + harmonic
  rise + sub pulse). "Each Ghost scene has a sound as distinctive as its visuals — wear
  headphones." FAL_KEY already in use · ~$0.05–0.15/scene · 4.75 kB.
  ⚠ Endpoint `fal-ai/elevenlabs/sound-generation` is a naming-convention best-guess.
  If sources show errors, paste the error text and the agent will fix it next cycle.
  Design notes: `src/app/dream/53-ghost-sfx/README.md`

---

## Previous newest (Cycle 63)

- **[/dream/52-concept-steer](/dream/52-concept-steer)** — Concept Steer. `demoable`
  A hexagonal radar chart synthesizer whose six axes are the vocabulary music AI models use
  internally: **Brightness** (filter fc 400–6000 Hz), **Density** (BPM 40–140 + voice count
  1–5), **Regularity** (strict grid vs. free timing + jitter), **Complexity** (unison → 9th
  chord voicings), **Energy** (attack 0.8s→0.04s + gain), **Mode** (major→minor→diminished,
  continuous interpolation). Drag any handle; the synthesizer follows in real time. Four
  presets: Classical Fugue, Dark Ambient, Jazz Improv, Drone. Background glow shifts with
  Brightness + Mode. HUD shows current BPM + chord quality. Zero deps, zero API.
  Design notes: `src/app/dream/52-concept-steer/README.md`

---

## Previous newest (Cycle 62)

- **[/dream/51-diatonic-harmony](/dream/51-diatonic-harmony)** — Diatonic Harmony. `demoable`
  Play a melody; the key is detected from what you play (Krumhansl-Kessler chroma correlation),
  and each detected note gains its diatonic third and fifth as sine oscillators — panned ±28°
  for spatial separation. Three-color scrolling piano roll: **orange** (melody) · **light blue**
  (3rd) · **deep blue** (5th). Scale degree 7 gets a diminished fifth instead of perfect fifth —
  visibly different bar position, audibly more tense. Demo: Bach BWV 772 with full auto-harmonies.
  Different from `23-pitch-harmonize`: that shifts a fixed interval; this detects the key and
  generates *scale-correct* voices. Zero deps, zero API.
  Design notes: `src/app/dream/51-diatonic-harmony/README.md`

---

## Previous newest (Cycle 61 — research)

- **Cycle 61 was a research sweep** (no new prototype). 8 new entries in RESEARCH.md (§§93–100).
  4 new prototype ideas added to IDEAS.md. Highlights:

  - **AI Co-Artist (§93, arxiv 2512.08951)** — LLM generates audio-reactive GLSL shaders from
    text descriptions ("a vortex that expands on beats, purple on bass, orange on treble"). Confirms
    `claude-shader` is buildable. Needs `ANTHROPIC_API_KEY` in Vercel env — ask Karel.

  - **Interpretable Concepts in Music Models (§94, arxiv 2505.18186, May 2026)** — Sparse
    autoencoders find that transformer music models organize internally around: **Brightness**,
    **Density**, **Regularity**, **Complexity**, **Energy**, **Mode**. Inspires `concept-steer` —
    6-axis hexagonal radar chart synthesizer. Zero deps, one cycle. Build next or next-next.

  - **ElevenLabs Sound Effects on fal.ai (§95)** — Text → high-fidelity ambient sounds.
    FAL_KEY in use. Inspires `ghost-sfx`: generated naturalistic sounds for Ghost scenes +
    HRTF positioning. More immersive than `29-scene-spatial`.

  - **AI Harmonizer (§96, arxiv 2506.18143)** — 4-part diatonic harmony from solo melody.
    Not browser-deployable yet. Inspires `diatonic-harmony` (zero deps): mic → key detection →
    diatonic third + fifth voice generation. "Your melody; chord-correct harmonies alongside."
    **Build next cycle.**

  - **Token-Based Audio Inpainting (§97, arxiv 2507.08333)** — Discrete diffusion for
    coherent audio continuation. Potential upgrade for `43-stable-extend`. No API yet.

  - **iPlug3 2026 (§100)** — WebGPU + SDL3 + MCP agents; WASM browser output. Best path
    to "Resonance as a native installation."

  **Open questions for Karel**:
  - `ANTHROPIC_API_KEY` in Vercel env? → enables `claude-shader`
  - `GEMINI_API_KEY` still pending → `lyria-ghost`, `binaural-lyria`, `piano-to-ghost`

---

## Previous newest (Cycle 60)

- **[/dream/](/dream/)** — Dashboard. `demoable`
  The `/dream/` index page is now a full morning-review dashboard. The complete MORNING.md
  renders at the top — all four sections with proper markdown formatting. 3-cycle activity stream.
  Phone-first layout (`max-w-3xl`), dark theme. Zero deps, zero API. Build: 176 B.
  This was IDEAS.md §0 (`[queued, do FIRST]`), deferred 59 cycles.

---

## Previous newest (Cycle 59)

- **[/dream/50-tap-rhythm](/dream/50-tap-rhythm)** — Tap Rhythm. `demoable`
  The first prototype any non-musician can immediately use. Tap or clap a rhythm into the
  mic → onset detection measures your tempo → 32-step circular drum loop plays back in your
  detected BPM. Amplitude classifies drum type: gentle tap = kick (violet), medium = snare
  (cyan), hard/clap = hi-hat (amber). Clock-face display with rotating hand. Click any step
  to toggle. BPM slider. Demo mode (no permissions): 4-on-the-floor preset loads instantly.
  Drum synthesis: Web Audio only — kick = sine frequency glide, snare = bandpass noise,
  hat = highpass noise. **Live-performance fit**: tap a groove at a venue, loop starts in 2s.
  Zero deps, zero API. Build: 5.13 kB.

  Design notes: `src/app/dream/50-tap-rhythm/README.md`

---

## Previous newest (Cycle 58)

- **[/dream/49-anemone-av](/dream/49-anemone-av)** — Anemone AV.
  A bioluminescent sea anemone dancing to audio. 14 tentacles in a forward-kinematics
  chain of 4 segments each — sub-bass sways the trunk, low-mids ripple branches,
  treble pulses the glowing violet tip beads. Percussive hits cause a full-body flash
  (all tips scale 1.4× for ~200ms). Drag to orbit. Strong bloom makes the form glow
  against pure black. Zero new deps — all Three.js packages were already installed.
  Demo mode: 6 incommensurable LFOs animate the form without mic permissions.

  **Why this is different from `21-three-mesh-av`**: the icosahedron is mathematical
  geometry that deforms. The anemone is a *living form* — flexible tentacles with FK
  amplification (tips move 2.8× the root), staggered phases so they ripple around the
  ring, bioluminescent color grading from cyan at the base to violet at the tips.

  Design notes: `src/app/dream/49-anemone-av/README.md`

---

## Previous newest (Cycle 57)

- **[/dream/48-arc-compose](/dream/48-arc-compose)** — Arc Compose.
  Write a Resonance journey arc using structural section tags, hear MiniMax Music 2.6 generate a
  60–90s AI piece that follows that exact structure.

  **Left panel**: A textarea pre-loaded with a four-section cinematic arc (`[Intro]` single piano
  in vast reverb / `[Build Up]` cello enters, tension / `[Chorus]` full orchestral peak / `[Outro]`
  piano alone, then silence). Eight section-tag buttons ([Intro], [Verse], [Pre-Chorus], [Build Up],
  [Chorus], [Bridge], [Outro], [Inst]) append directly to the arc. Style/genre field below.

  **Right panel**: Six-band radial bloom visualizer (same palette as `1-live`) during playback.
  Waveform strip with cyan playhead sweep. Replay from cache (no re-generation). Download MP3.

  **Why this is different**: `6-compose` sends a text description → music, with no structural
  control. `arc-compose` uses section tags as first-class parameters: `[Intro] → [Build Up] →
  [Chorus] → [Outro]` shapes the arc of the generated piece. This is the `18-elevenlabs-compose`
  idea (38 cycles in the queue) finally buildable at $0.03 instead of $1.13.

  ⚠ **API note**: Endpoint `fal-ai/minimax/music-01` and parameters from fal.ai naming conventions.
  If the prototype shows an error, paste the raw message and the agent fixes it next cycle.

  **$0.03/generation · FAL_KEY already in use**
  Design notes: `src/app/dream/48-arc-compose/README.md`

---

## Previous newest (Cycle 56 — research)

- **Cycle 56 was a research sweep** (no new prototype). 8 new entries in RESEARCH.md (§§85–92).
  4 new prototype ideas added to IDEAS.md. Highlights:

  - **Google Flow Music + Lyria 3 Pro (§85)** — Stem Splitter extracts drums/bass/piano from any
    AI track. 3-minute structured songs. "Replace + Extend" for section regeneration. Same Gemini
    key as `lyria-ghost`. Inspires `stem-spatial`.

  - **MiniMax Music 2.6 (§86)** — 14+ structural section tags on fal.ai at $0.03/generation.
    FAL_KEY already in use. Inspires `arc-compose` — the `18-elevenlabs-compose` idea at 37×
    lower cost.

  - **`anemone-av` (§92)** — Organic bioluminescent 3D form, Three.js TSL. All deps already
    installed. Zero new packages. High visual impact. One-cycle build.

  - **`tap-rhythm` (§89)** — Tap onset detection → circular step sequencer → Karplus-Strong
    drum synthesis. Zero deps, zero API. Highest accessibility.

  **Open questions for Karel**:
  - GEMINI_API_KEY → unlocks `lyria-ghost`, `binaural-lyria`, `piano-to-ghost`, `stem-spatial`
  - FAL_KEY already in use → `arc-compose` built this cycle

---

## Previous newest (Cycle 55)

- **[/dream/47-mood-journey](/dream/47-mood-journey)** — Mood Journey.
  Click your **NOW** mood on the Russell circumplex (valence × arousal), then click your **GOAL**
  mood, pick a duration (Quick 2m / Short 5m / Normal 10m / Deep 20m), and press **▶ Begin journey**.
  The dot glides from Now to Goal automatically — no interaction needed. The music walks with it.

  **Two simultaneous audio layers both track the gliding position**:
  - Mood synthesis (from `38-mood-xy`): BPM, chord quality, register, attack, arpeggio, filter brightness
  - Isochronic tones (from `42-binaural`): β 16Hz / α 10Hz / θ 6Hz / δ 2Hz matching arousal level

  Canvas shows a quadrant color wash (amber=energetic+happy, purple=energetic+sad, teal=calm+happy,
  navy=calm+sad), a blue trail of the positions visited, a dashed green path to the goal, and a
  glowing dot at the current position. Noise layer (pink/brown) available mid-journey.

  **"Surrender control to the arc."** The first prototype that auto-generates a complete emotional
  trajectory rather than responding to manual input. Based on the proactive music therapy research
  cluster (RESEARCH.md §84). Zero deps, no API keys.

  Design notes: `src/app/dream/47-mood-journey/README.md`

---

## Previous newest (Cycle 54)

- **[/dream/46-osc-composer](/dream/46-osc-composer)** — Oscilloscope Composer.
  Design a Lissajous figure using three sliders (L freq, R freq, phase), then download the
  **stereo WAV that draws it** on an oscilloscope in XY mode. Five preset shapes map to musical
  intervals: Circle (1:1 unison), Figure-8 (1:2 octave), Trefoil (2:3 perfect fifth), Rose
  (3:4 perfect fourth), Starburst (3:5 major sixth). Puzzle mode shows a target figure alongside
  yours — tune to match and collect the "✓ Matched!" badge.

  **The only prototype where the download IS the point** — the WAV's L channel is the X axis
  and R channel is the Y axis. Load it in `20-scope` (Phase Portrait mode) and the figure
  reappears. Load it on a real oscilloscope and it draws on screen.

  **Musical intervals as geometry**: a perfect fifth is a 2:3 frequency ratio — which draws
  a three-lobe trefoil. A perfect fourth draws a four-lobe rose. The visual shape IS the
  harmonic relationship. Zero deps, no API keys.

  Design notes: `src/app/dream/46-osc-composer/README.md`

---

## Previous newest (Cycle 53)

- **[/dream/45-guided-session](/dream/45-guided-session)** — Guided Brainwave Session.
  Pick a journey ("Stressed → Calm", "Scattered → Calm", "Wired → Drowsy", "Alert → Deep Rest"),
  set a step duration (Quick 30s / Normal 5m / Deep 10m), and press **Begin journey**. Isochronic
  tones walk your brainwave frequency from the starting state to the goal state — no headphones
  required (works with any speaker).

  Each step plays isochronic tones (amplitude-modulated carrier at 200 Hz) at the target frequency,
  then smoothly sweeps to the next waypoint with a 4-second time constant. At β⁺ 24Hz: tight
  staccato rings. By α 10Hz: gentle ripples. By θ 4Hz: three-second expanding pulses. The canvas
  slows visibly as the journey descends — the rings are a clock of the session's progress.

  **Path breadcrumb** shows each waypoint with the current one highlighted. **Progress bar** per
  step with timer. **"→ next"** button available after 50% of step duration (sink faster if you
  want). **Auto-advance** after the full duration. **Noise layer** (pink for β/α, brown for θ/δ)
  auto-switches on each step. **Journal textarea** (same localStorage pattern as `42-binaural`).
  **Session summary** on completion showing time per waypoint.

  **First Resonance prototype that is a genuine wellness tool** — based on the proactive music
  therapy research cluster (RESEARCH.md §§74, 75, 80). Descending-frequency arcs validated by
  three Frontiers 2026 papers. Zero deps; no API keys needed.

  Design notes: `src/app/dream/45-guided-session/README.md`

---

## Previous newest (Cycle 52)

- **[/dream/44-vocal-bgm](/dream/44-vocal-bgm)** — Vocal BGM.
  Record 5–15 seconds of humming, singing, or piano. Pick an arrangement style (jazz trio /
  ambient / cinematic / rock / folk). Click **Arrange →**. ACE-Step 1.5 on fal.ai receives
  your recording and generates a 30-second full-band arrangement where your melodic contour
  is the lead motif — the AI adds drums, bass, chords, and harmony beneath your melody.

  **Different from `43-stable-extend`**: stable-extend continues your recording *forward*
  in time. vocal-bgm wraps a full band *around* your phrase — your melody stays as the
  primary voice. Think of it as "here's the tune, now play it for me as a jazz trio."

  Genre selector shows the full tag string sent to ACE-Step (e.g. "jazz piano trio, warm,
  acoustic, 70 BPM, upright bass, brush drums") so the model's inputs are legible.
  `[inst]` lyrics tag prevents the model from adding AI vocals on top of your humming.
  Waveform strip: **amber** (your melody) | **blue** (full arrangement).
  Bloom visualizer during playback (same six-band palette as `1-live`).

  ⚠ **API note**: endpoint `fal-ai/ace-step/audio-to-audio` from RESEARCH.md §77. If the
  prototype shows an error, the raw message is displayed — paste it and we'll fix in the
  next cycle.

  **$0.006/arrangement. FAL_KEY already in use.**
  Design notes: `src/app/dream/44-vocal-bgm/README.md`

---

## Previous newest (Cycle 49)

- **[/dream/43-stable-extend](/dream/43-stable-extend)** — Stable Extend.
  Record a piano phrase (up to 30s), click **Extend →**, wait ~10–30s. Stable Audio 2.5 on fal.ai
  receives your actual audio and generates a seamless 30-second continuation in the same style and
  mood. The extended track auto-plays through the six-band radial bloom visualizer (same palette as
  `1-live`). Waveform strip shows your recording in **amber** (left) and the AI extension in **blue**
  (right), split by a divider line so you can see both clips at a glance.
  Style prompt guides the extension: "continue as a cello duet", "jazz register", "ambient fade".
  The server route at `/dream/43-stable-extend/api` handles the fal.ai call server-side — FAL_KEY
  is never exposed to the browser. **$0.20/generation. FAL_KEY already in use.**
  **First prototype where AI extends YOUR recording** (not a text-prompt generation, not style-match
  — a direct continuation of the actual audio in latent space).

  ⚠ **API note**: endpoint `fal-ai/stable-audio-25/inpaint` sourced from RESEARCH.md §70. If the
  prototype shows an API error, the raw error message is displayed — tell me the correct endpoint
  and parameters if fal.ai uses different names.

  Design notes: `src/app/dream/43-stable-extend/README.md`

---

## Previous newest (Cycle 48 — research)

- **Cycle 48 was a research sweep** (no new prototype). 8 new entries in RESEARCH.md (§§69–76).
  4 new prototype ideas added to IDEAS.md. Highlights:

  - **Lyria 3** (Google DeepMind, Feb 2026) — Gemini API music generation with **image input**.
    Send a Ghost scene image → receive a 30s ambient MP3 shaped by that visual's mood. Same
    Gemini API key as `30-lyria-jam`. Prototype: `lyria-ghost`. Admin-only. Free tier.

  - **Stable Audio 2.5** (Stability AI, 2026) — fal.ai audio continuation at **$0.20/audio**.
    Record a piano phrase → AI extends it seamlessly into a 30s track. Open source. FAL_KEY
    already in use. Prototype: `stable-extend`. One-cycle build, no new approvals needed.

  - **`binaural-lyria`** — Upgrade of `42-binaural`: binaural beats at the target brainwave
    frequency + Lyria 3 generates ambient music tuned to that same state (delta=vast drones,
    alpha=calm piano, gamma=bright gamelan). Meditation + AI music closed loop. Needs Gemini key.

  - **`piano-to-ghost`** — Play piano → mic chord detection + emotion coordinates → Lyria 3
    generates Ghost-themed music + Ghost LoRA generates a matching image simultaneously. All of
    the dream zone's systems unified. Needs GEMINI_API_KEY + FAL_KEY. Complex.

  - **Music as "controlled hallucination"** (Frontiers, 2026) — The brain simulates a "virtual
    body" inside music via active interoceptive inference. Validates Resonance's "transcendent
    listening" thesis scientifically. The binaural beat prototype (`42-binaural`) is already one
    of the most direct implementations of this effect.

  - **ONNX Runtime Web 1.26.0** — WebGPU EP default. `neural-pitch` CREPE-tiny would now run
    at ~1ms/frame inference. Raises urgency of asking Karel about CDN ONNX dep.

  - **Open questions for Karel**:
    - GEMINI_API_KEY → enables `lyria-ghost`, `binaural-lyria`, `30-lyria-jam`, `piano-to-ghost`
    - CDN ONNX dep (~2MB) OK? → enables `neural-pitch` upgrade at near-zero latency (v1.26 WebGPU)
    - FAL_KEY already in use → `stable-extend` buildable immediately next cycle

---

## Previous newest (Cycle 47)

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

### 50-tap-rhythm
**Status**: `demoable` · **Cycle shipped**: 59 · **Last touched**: 2026-05-20

Open `/dream/50-tap-rhythm`. Click **▶ Demo** — the 4-on-the-floor pattern starts immediately
at 120 BPM: kick on every beat (violet), snare on 2 and 4 (cyan), hi-hats on 8th notes (amber).
The clock hand rotates, lighting up each active dot as it passes.

Click any dot on the clock face to toggle it on/off. Add a second kick on the "&" of beat 3
(step 18 counting from 0) by clicking that position. Remove a hi-hat. The pattern changes
immediately on the next pass of the hand.

Adjust the BPM slider — at 80 BPM the loop feels slow and heavy; at 144 it drives.

For **tap mode**: click **🎤 Tap your rhythm**, allow mic permissions. Tap a rhythm on your
desk or clap — aim for 8+ taps. Vary your pressure:
- **Gentle desk tap** = kick (violet pulse ring)
- **Firm desk tap** = snare (cyan pulse ring)
- **Hard slap or clap** = hi-hat (amber pulse ring)

After you stop for 2 seconds (with 8+ taps), the loop builds automatically. If you want to
commit earlier, click **▶ Build loop**. Your tapped rhythm becomes the circular clock.

Click **↩ Re-tap** to record a new rhythm without stopping playback. The new loop replaces
the old one as soon as you pause.

Design notes: `src/app/dream/50-tap-rhythm/README.md`

---

### 49-anemone-av
**Status**: `demoable` · **Cycle shipped**: 58 · **Last touched**: 2026-05-20

Open `/dream/49-anemone-av`. Click **Demo mode** — the anemone appears immediately, swaying in a
slow organic pattern driven by 6 incommensurable LFOs. The form never repeats exactly because the
LFO rates (0.07–0.28 Hz) are chosen to be irrational multiples of each other.

Watch the 14 tentacles. They all sway in the same general direction as the sub-bass LFO builds
(slow 0.07 Hz sine), but each one is offset in phase. The result is a ripple wave around the ring —
like a sea anemone in a gentle current.

Watch the tip beads. They pulse independently of the trunk sway — a 10.5 Hz shimmer from the
high-mid LFO. The tips look like bioluminescent buds that respond to a higher-frequency stimulus
than the trunk.

For **mic mode**: click **Start mic** and allow permissions. Play a deep bass note on piano — you
should see the trunk sway amplitude increase significantly (sub-bass band drives the primary sway).
Play a high bright chord — the tip beads shimmer harder (high-mid band). Hit a percussive note
loudly — onset detection fires a brief flash where all tips scale up 1.4× simultaneously, then decay
over ~15 frames. The flash is fast enough to feel like a startle response.

Drag to orbit: the form looks different from above (looking down on the tentacle ring from above)
and from below (looking up into the illuminated underside of the body disc). From below, the cyan
glow of the body disc creates a halo over the tentacle roots.

Design notes: `src/app/dream/49-anemone-av/README.md`

---

### 48-arc-compose
**Status**: `demoable` · **Cycle shipped**: 57 · **Last touched**: 2026-05-20

Open `/dream/48-arc-compose`. The default arc is pre-loaded:

```
[Intro] single piano note in vast reverb, long silence between phrases
[Build Up] low cello drone enters slowly, pad swells underneath, tension builds
[Chorus] full orchestral peak, bright major resolution, drums and strings
[Outro] instruments fade one by one, piano alone, then silence
```

Click **▶ Compose**. After 20–40 seconds, a 60–90s orchestral piece starts playing through
the radial bloom visualizer. The waveform strip fills in cyan as the playhead sweeps.

Try editing the arc before composing. Add `[Verse] melodic piano theme, strings enter softly`
between `[Intro]` and `[Build Up]`. Change `[Chorus]` to `[Chorus] dark minor peak, brass`.
Hear how the structure of the piece changes. Style field: try `"jazz piano trio, 90 BPM"` —
the same arc rendered in a completely different genre.

Click **▶ replay** after playback ends to re-hear without re-generating ($0.03 saved).
Click **↓ mp3** to download the generated piece.

⚠ If you see an API error in red, paste the raw error text and the agent will fix the
endpoint/parameters next cycle.

Design notes: `src/app/dream/48-arc-compose/README.md`

---

### 47-mood-journey
**Status**: `demoable` · **Cycle shipped**: 55 · **Last touched**: 2026-05-20

Open `/dream/47-mood-journey`. Read the instruction: "Click the canvas to place your NOW mood."
Click somewhere in the **top-left** (energetic + sad = distressed state). The yellow NOW dot
appears with the label "NOW." The instruction updates: "Click to place your GOAL mood."
Click the **bottom-right** (calm + happy = content/serene state). The green GOAL dot appears
with a dashed ring. Select **Short 5m** (or **Quick 2m** for an immediate demo). Click **▶ Begin journey**.

The music starts immediately in the distressed state: fast (110–130 BPM), diminished chords,
dull filter, high register, staccato arpeggios. The isochronic carrier begins pulsing at β 16Hz
(fast tremolo). Watch the glowing dot start moving toward the GOAL position — slowly, continuously.

After ~30 seconds (Quick mode) you'll hear the chord quality shift toward minor as valence moves
right. After ~60 seconds the BPM drops noticeably. The isochronic frequency transitions from β
to α (16Hz → 10Hz) at around the arousal midpoint — you hear the tremolo slow into a distinct
10-beat-per-second wobble. By the end of the journey the music is slow, sustained, warm major
chords with a low isochronic purr at 6Hz (θ boundary).

The blue trail accumulates as the dot moves — the path you've taken is visible as the journey
progresses. The green dashed path shows what remains.

Add noise mid-journey: click **brown** and drag the level slider to ~0.3 for low-arousal states.
The brown rumble reinforces the descending arc without masking the carrier.

For a real session: use **Normal 10m** or **Deep 20m** with headphones in a quiet room.

Design notes: `src/app/dream/47-mood-journey/README.md`

---

### 46-osc-composer
**Status**: `demoable` · **Cycle shipped**: 54 · **Last touched**: 2026-05-20

Open `/dream/46-osc-composer`. Click **▶ Start** — the canvas initializes black. Click the
**Circle** preset: a perfect circle appears in cyan on the black canvas. Click **Figure-8**:
the circle stretches into the ∞ symbol. Click **Trefoil**: three interlocked loops.

Now try the sliders. With the **Trefoil** shape active (2:3, 0°), drag the Phase slider slowly
from 0° toward 90°. The three lobes rotate and redistribute — the shape stays a trefoil but
its orientation changes continuously. At 180° you're back to the same shape but mirrored.

Try **L freq = 3, R freq = 5** without a preset — you get the raw 3:5 Starburst. Now drag
Phase — the star rotates. At 36° it aligns to the canonical Starburst shape.

Click **↓ Download WAV**: a "Rendering…" state appears for ~40ms while 220,500 samples are
computed in JavaScript (two Math.sin loops). A 5-second stereo WAV downloads. To verify:
open `20-scope` in another tab, load the WAV into it (Phase Portrait mode) — you'll see the
exact figure from the canvas.

Click **🎯 Puzzle mode**: select "Trefoil" as the target. The canvas splits — grey target on
left, yours on right. Set L=2, R=3 first to get the right shape, then sweep Phase until
"✓ Matched!" appears. The tolerance is 12° — just enough to require real tuning.

Design notes: `src/app/dream/46-osc-composer/README.md`

---

### 45-guided-session
**Status**: `demoable` · **Cycle shipped**: 53 · **Last touched**: 2026-05-20

Open `/dream/45-guided-session`. Click **Scattered → Calm** (broadest descent: γ → β → α). Set
**Quick 30s** first — this gives you a 90-second demo session. Click **▶ Begin journey**.

The canvas starts showing rapid rings at 35 Hz (γ). Press the speaker volume up slightly — isochronic
tones are subtle. After 30 seconds the step auto-advances: the LFO frequency sweeps from 35Hz down to
18Hz over 8–10 seconds (you can hear the beat character slow). The rings spread further apart. At the
third step (α 10Hz), the rings are wide and slow — two to three seconds between each ring birth.

After the session completes, the summary shows time per waypoint and the journey name.

For a real session: try **Stressed → Calm** at **Normal (5m)** per step — 15 minutes total. Sit with
headphones or in a quiet room. The noise layer defaults to **pink** in β states and **brown** in θ/δ
states automatically. Open 📓 to write what you notice at each state — the note persists in localStorage.

**Speakers work** (no headphones required). The isochronic beat is the audible amplitude tremolo — at
β⁺ 24Hz it sounds like fast vibrato; at α 10Hz, rhythmic tremolo; at θ 4Hz, slow breathing pulses.

Design notes: `src/app/dream/45-guided-session/README.md`

---

### 44-vocal-bgm
**Status**: `demoable` · **Cycle shipped**: 52 · **Last touched**: 2026-05-20

Open `/dream/44-vocal-bgm`. Pick a genre (try **jazz trio** first). Click **● REC** and allow
mic permissions. Hum a melody — 5–10 seconds is ideal. One complete phrase with a clear shape
(ascending, descending, arc, call-and-response). Press **■ STOP**.

The amber waveform fills the left half of the strip — that's your melody. Click **Arrange →**.
The button shows "Arranging…" while ACE-Step works (~20–40s). When it returns, the blue waveform
fills the right half and playback starts automatically through the radial bloom.

The jazz trio arrangement will add upright bass and brush drums beneath your melody. Your hummed
line is the lead voice — the AI plays supporting role. Try the same melody with different genres:
cinematic strings gives it an orchestral sweep; ambient removes the drums and adds synth pads;
rock adds electric guitar and a full drum kit.

**Key insight**: this is different from `43-stable-extend`, which continues your phrase from the
end. vocal-bgm treats your whole phrase as the *theme* and arranges around it. The difference is
audible: in stable-extend the AI finishes your sentence; in vocal-bgm the AI plays backup for your
entire sentence at once.

Press **▶ replay** to re-listen without re-generating. Each generation costs $0.006.

⚠ If you see an API error in red, paste the text and we'll fix the endpoint in the next cycle.

Design notes: `src/app/dream/44-vocal-bgm/README.md`

---

### 43-stable-extend
**Status**: `demoable` · **Cycle shipped**: 49 · **Last touched**: 2026-05-20

Open `/dream/43-stable-extend`. Press **● REC** and allow mic permissions. Play 5–15 seconds of
piano (or hum, sing, play any instrument). Press **■ STOP**. The amber waveform fills the left
half of the strip — that's your recording.

Type a style hint in the text field if desired ("continue as a string quartet", "jazz piano duet",
"ambient fade into silence"), then click **Extend →**. The button goes grey and shows "Extending…"
while the API call runs (~10–30s). When it returns, the blue waveform fills the right half and
playback starts automatically through the radial bloom visualizer. Press **▶ replay** to hear it
again without re-generating.

The bloom uses the same six-band color palette as `/dream/1-live` — the AI-generated music drives
the same visualization you'd see from live mic input. The loop closes: your phrase → AI continuation
→ your usual visualization.

⚠ If you see an API error in red, the raw fal.ai error text is shown. Tell the agent (next morning)
what it says and we'll fix the endpoint or parameters in `route.ts`.

Design notes: `src/app/dream/43-stable-extend/README.md`

---

### 42-binaural
**Status**: `polished` · **Cycle shipped**: 47 · **Last touched**: 2026-05-20

Open `/dream/42-binaural`. Click **▶ Start** with the default **α 10 Hz** preset and put on
headphones. You'll hear a single continuous tone — but inside your skull, a 10 Hz oscillation
begins. There's nothing at 10 Hz in the audio file; your superior olivary complex is computing
the difference between the 200 Hz (left ear) and 210 Hz (right ear) pure tones and producing a
synchronized neural beat.

The canvas shows cyan expanding rings at 10 Hz — one ring born per beat, growing to the canvas
edge and fading. The center glows on each ring birth. Try the **δ 2** preset: two slow deep-violet
pulses per second, like breathing. Let it run for 30 seconds; the rhythmic quality is visceral.

**Noise layer (new)**: Add brown noise while in δ or θ state — the low-frequency rumble
reinforces the carrier and masks distracting ambient sounds. Buttons: `off | pink | brown`.
Level slider controls the noise blend. Pink noise is airier (good for α/β). Brown noise is
deeper and more sleep-conducive (good for δ/θ). Both types remain transparent to the binaural beat.

**Session timer (new)**: After starting, a `α 0:00` counter appears and ticks up in real time.
Switch to θ — the counter resets to `θ 0:00` while the α time is banked. Switch back to α —
resumes from where you left off. Shows cumulative time in each state per session.

**Journal (new)**: Click `📓 session notes — alpha ↓` to expand a textarea. Each brainwave
state has its own persistent notes stored in `localStorage` (survives page reloads). The
placeholder prompts guide you toward the appropriate introspective mode:
- δ: "Note how your body feels..."
- α: "What do you notice in this moment?"
- γ: "What connections are you making?"
A `●` dot in the toggle label shows when saved text exists for the current state.

Try **γ 40**: the amber rings blur into a near-constant glow — you can't see 40 distinct rings at
60 fps. The carrier tones at 200 Hz and 240 Hz create a more complex audio texture; the binaural
beat is subconscious at this rate.

Switch to **isochronic** mode (stop first to switch): now the beat is audible as a tremolo
effect — the carrier amplitude pulses at the beat rate. At θ 6 Hz it sounds like a slow shiver.
Isochronic works on speakers; binaural requires headphones.

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
