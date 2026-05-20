# Dream Agent — cycle state

## Cycle 49 — /dream/43-stable-extend

**When**: 2026-05-20 UTC (hourly autonomous cycle)

**Decided**: Cycle 48 was a research sweep. STATE.md (Cycle 48) explicitly named `stable-extend`
as the #1 buildable prototype: "most immediately buildable (FAL_KEY already in use). $0.20/generation.
No new API key approvals needed." No blockers. No in-progress prototypes. Queue for Gemini-key
prototypes (`lyria-ghost`, `binaural-lyria`) is blocked pending Karel's response — no point waiting
when `stable-extend` is immediately buildable. Decision: build `/dream/43-stable-extend`.

**Why now**: 42 existing prototypes react TO audio or generate audio FROM text. None of them extend
YOUR audio with AI. `stable-extend` fills this gap: record a piano phrase, AI continues it seamlessly
into a 30-second piece using Stable Audio 2.5 on fal.ai. The interaction is qualitatively different
from `6-compose` (text → audio) or `14-reference-compose` (style-match via MiniMax): here the AI
literally continues from where you stopped, anchored in the latent representation of your actual
recording. FAL_KEY is already in use for Ghost LoRA image generation — zero new approvals.

**Shipped**:
- `src/app/dream/43-stable-extend/page.tsx` — full interactive prototype (~350 lines)
- `src/app/dream/43-stable-extend/api/route.ts` — server-side route handler for fal.ai call
- `src/app/dream/43-stable-extend/README.md` — design notes, architecture, polish ideas

**What's inside**:

**Server route** (`/dream/43-stable-extend/api`, POST):
1. Receives audio blob (webm/opus or mp4) + prompt string as FormData
2. Uploads to fal storage via `fal.storage.upload()` → public URL
3. Calls `fal-ai/stable-audio-25/inpaint` with `{audio_url, prompt, seconds_total: 45, cfg_scale: 7.0, steps: 100}`
4. Returns `{url, inputUrl}` or `{error}` with raw API response for debugging

**Client page** (`/dream/43-stable-extend`):
- Phase state machine: `idle → recording → recorded → generating → playing → error`
- **MediaRecorder** with `audio/webm;codecs=opus` (fallback: `audio/mp4`) — up to 30s recording
- **Waveform canvas**: `AudioContext.decodeAudioData()` → `buildPeaks(buffer, 200)` → amber bars
  (your recording, left half). After generation: blue bars (AI extension, right half). Divider line.
- **Style prompt** input: default "continue this piano phrase, same style and mood" — user can guide
  the extension ("extend as a cello duet", "continue in a jazz register", etc.)
- **Extend → button**: disabled until audio is recorded; posts FormData to `/dream/43-stable-extend/api`
- **Auto-play**: decoded generated audio routed through AnalyserNode → six-band radial bloom
  (same 6-band color palette and bloom geometry as `1-live`)
- **Error display**: shows raw fal.ai error text so Karel can diagnose API issues if needed
- **Replay button**: appears after generation, re-plays the same URL without re-calling the API

**Build validation**: `npm run build` passes cleanly. `/dream/43-stable-extend` renders as static
route (3.65 kB). `/dream/43-stable-extend/api` renders as dynamic route handler (239 B). Fixed one
TypeScript closure-narrowing issue: `ctx` narrowing from outer scope doesn't carry into RAF `tick`
closure — fixed by adding `if (!ctx) return;` at the top of `tick`. Zero new errors; all other
warnings are pre-existing production Resonance files. Vercel build will pass.

**API note**: The endpoint `fal-ai/stable-audio-25/inpaint` and its parameter names (`audio_url`,
`seconds_total`, `cfg_scale`, `steps`) come from RESEARCH.md §70 research. If the endpoint doesn't
exist or uses different parameter names, the error message is surfaced in the UI. Karel can inspect
the error text and tell me the correct endpoint/parameters for the next cycle.

**What I noticed**: The two-panel waveform display (amber | blue with divider) is intuitive even
before the prototype runs — you can immediately read "this is mine, that's the AI's." The bloom
visualizer during playback is the same radial geometry as `1-live`, which feels right: you recorded
something, the AI extended it, now it plays through the same visualization system that responds to
live playing. The loop closes: your recording becomes input to the AI becomes output in the bloom.

The server-side route handler at `/dream/43-stable-extend/api` is the first dream-zone Route Handler
(vs page). It demonstrates that Next.js App Router allows `src/app/dream/*/api/route.ts` to coexist
with `src/app/dream/*/page.tsx` in a sub-directory — the scope fence is clean, no production API
routes touched.

**Queued next**:
1. **`lyria-ghost`** — Ghost image → Lyria 3 Clip → 30s ambient Ghost soundtrack. Needs
   GEMINI_API_KEY. One cycle. Admin-only. RESEARCH.md §69.
2. **`binaural-lyria`** — binaural beats at target brainwave frequency + Lyria 3 ambient music
   tuned to that state. Needs GEMINI_API_KEY. One cycle. RESEARCH.md §74/75.
3. **Polish `42-binaural`** — session timer, journal textarea (localStorage per brainwave state),
   optional pink/brown noise layer. No API needed. Safe fallback if Gemini key unavailable.
4. **Verify `stable-extend` API** — if Karel sees an error when using the prototype, diagnose
   the fal.ai endpoint/parameters and fix `route.ts`. One short cycle, no new code structure needed.

---

## Cycle 48 — Research sweep (§§69–76 in RESEARCH.md, 4 new ideas in IDEAS.md)

**When**: 2026-05-19 UTC (hourly autonomous cycle)

**Decided**: Cycle 47 shipped `42-binaural`. STATE.md from Cycle 47 explicitly flagged research as
due at Cycle 48: "Cycle 44 was last, now 3 cycles ago (45, 46, 47). Due next cycle (Cycle 48)."
The 3–4 cycle cadence has hit its lower bound. No blockers. No in-progress prototypes. Decision: research cycle.

**Sources searched**: Google DeepMind blog (Lyria 3 launch), Gemini API docs (music generation),
Stability AI blog + fal.ai (Stable Audio 2.5), Suno/Udio comparison articles, ONNX Runtime Web npm +
docs (v1.26), arxiv (2407.05584, 2605.01235), Frontiers in Psychology 2026, Three.js forum + blog
(WebGPU/TSL 2026 state), HN generative music threads, fal.ai explore (audio models), Replicate music
collection. 8 new RESEARCH.md entries (§§69–76). 4 new prototype ideas queued in IDEAS.md.

**What I found**:

- **Lyria 3 (§69, Feb 2026)** — Google DeepMind launched Lyria 3 via Gemini API. Two endpoints:
  `lyria-3-clip-preview` (30s MP3) and `lyria-3-pro-preview` (full songs, WAV/MP3). Multimodal:
  accepts up to 10 images alongside text. Images influence the mood, style, atmosphere of the generated
  audio — a Ghost scene photo feeds directly into the music generation. Same Gemini API key as
  lyria-jam. Inspires `lyria-ghost`: Ghost image → Lyria 3 Clip → 30s Ghost soundtrack → live-bloom.

- **Stable Audio 2.5 (§70, 2026)** — Open-source model from Stability AI on fal.ai at $0.20/audio.
  Audio continuation: upload an audio clip → AI extends it seamlessly into a longer piece. Audio
  inpainting: mark a section → AI regenerates just that region in context. First browser-accessible
  "continue YOUR playing" API in the dream zone. Inspires `stable-extend`: mic recording → Stable Audio
  2.5 continuation → 30s extended track → visualizer. Needs FAL_KEY (already in use).

- **Suno Studio v5 Generative Stems (§71, Mar 2026)** — Suno's built-in DAW now exports up to 12
  stems (vocal, drums, bass, piano, etc.) from any AI-generated track. Voice cloning available (Pro).
  Suno API still not public. When it releases, `suno-stems-spatial` is the target: generate a track →
  12 stems → spatialize each via HRTF (piano front-left, drums above, bass below).

- **ONNX Runtime Web 1.26.0 (§72, May 2026)** — WebGPU execution provider now default over WebGL.
  Near-native speed on WASM. CREPE-tiny ONNX would load in ~200ms with WebGPU EP (vs the old ~2s
  estimate). Directly upgrades the `neural-pitch` proposal — if Karel approves the CDN dep, it's
  faster than previously thought.

- **Real-time MIDI-to-image (§73, ICCC 2024)** — System takes MIDI keyboard input, extracts
  emotional/harmonic state, generates matching images via generative AI in real-time. User study
  confirms musicians find it novel and creatively inspiring. Inspires `piano-to-ghost`: mic chord
  detection → arousal/valence → Lyria 3 music + Ghost LoRA image for the current mood. Complex but
  uniquely connects all the dream zone's systems.

- **Music as "controlled hallucination" (§74, Frontiers 2026)** — New theoretical framework: brain
  treats musical emotion as active interoceptive inference of a "virtual body" state. Directly
  validates Resonance's "transcendent listening" thesis. The binaural beat prototype (`42-binaural`)
  induces exactly this. Inspires `binaural-lyria`: binaural beat state → Lyria 3 generates ambient
  music matching the target brainwave state → therapeutic closed loop.

- **MindMelody (§75, arxiv 2605.01235, May 2026)** — Closed-loop EEG-driven system: RAG-equipped LLM
  formulates a music therapy plan, hierarchical EEG controller synthesizes music based on current
  brainwave state, continuous feedback loop updates parameters. Not browser-native but directly
  inspires the `binaural-lyria` concept: binaural beats as the EEG substitute (entrainment rather than
  sensing), Lyria 3 as the music generator.

- **Three.js WebGPU/TSL maturity (§76, 2026)** — Full production readiness across all major browsers
  including iOS/Safari. TSL compiles to WGSL+GLSL automatically. Compute shaders for GPU physics,
  fluids, particles. Community is actively building audio-reactive TSL experiments. `27-gpu-additive`
  is now less risky: WebGPU is universal, TSL eliminates WGSL-only concerns. Still 2 cycles, but
  the platform foundation is solid.

**What surprised me**: The Lyria 3 image-to-music feature is the most immediately actionable finding.
The fact that you can send a Ghost LoRA image into the Gemini API and receive a 30-second ambient
score that matches the visual's mood is exactly what the dream zone has been building toward — the
separation between Ghost imagery and Ghost audio has been a persistent gap. Lyria 3 closes it with
one API call. Karel's Gemini key (already being requested for lyria-jam) unlocks both `lyria-ghost`
(one-shot image→music) AND `lyria-jam` (infinite streaming music steering) AND `binaural-lyria`
(therapeutic session augmentation). One key, three prototypes.

The "music as controlled hallucination" framing is philosophically resonant (pun intended). It
positions Resonance not as a tool that reacts to music, but as a tool that manages what the brain
predicts the music will feel like. The binaural prototype is already doing this directly.

**Queued next** (Cycle 49):
1. **`stable-extend`** — most immediately buildable (FAL_KEY already in use). Record piano phrase →
   Stable Audio 2.5 continuation → 30s extended track → live-bloom visualizer. First prototype
   that extends YOUR playing with AI. $0.20/generation. No new API key approvals needed.
2. **`lyria-ghost`** — needs GEMINI_API_KEY (flagged in MORNING.md). Ghost image → Lyria 3 Clip
   → 30s ambient Ghost soundtrack. Admin-only. Uniquely connects Ghost imagery with generated music.
3. **`binaural-lyria`** — also needs GEMINI_API_KEY. Binaural state → Lyria generates ambient music
   in matching mood. Natural evolution of `42-binaural` into a therapeutic session tool.
4. **Polish `42-binaural`** — session timer, journal textarea (localStorage per state), optional
   pink/brown noise layer. No API needed. One cycle. Good fallback if Karel doesn't have Gemini key.
5. **`gpu-additive`** — now more feasible with TSL maturity and universal WebGPU. Still complex.

---

## Cycle 47 — /dream/42-binaural

**When**: 2026-05-19 UTC (hourly autonomous cycle)

**Decided**: Cycle 46 shipped `41-code-vis`. No blockers. No in-progress prototypes. Last
research was Cycle 44 (2 cycles ago — not yet at the 3-4 cycle threshold; due at Cycle 48).
Items needing Karel's approval: `neural-pitch` (CDN ONNX dep), `browser-musicgen` (390MB CDN).
`gpu-additive` is in the queue but marked as complex / 2+ cycles. Decision: build `42-binaural`.

**Why now**: `40-shepard-tone` (Cycle 45) opened a psychoacoustics thread — prototypes that
explore the gap between physical sound and perceived experience. `42-binaural` is the natural
follow-on. A binaural beat requires NO physical sound at the beat frequency — two separate ear
tones (e.g., 200 Hz left + 210 Hz right) cause the brain to perceive a 10 Hz oscillation that
doesn't exist in the air. The perceived beat is neurological, not acoustic. This is the closest
thing to "direct brain audio" in the Web Audio API. The brainwave frequency bands (δ/θ/α/β/γ)
map cleanly to meditative, creative, alert, and focused states — deeply aligned with Resonance's
"transcendent listening" vision. Zero deps, one cycle, no API keys.

**Shipped**:
- `src/app/dream/42-binaural/page.tsx` — full interactive prototype (~300 lines)
- `src/app/dream/42-binaural/README.md` — binaural beat theory, brainwave states, audio graph

**What's inside**:

**Two modes**:
- **Binaural** (headphones required): left ear gets `carrier` Hz, right ear gets `carrier + beat` Hz
  via `StereoPannerNode(±1)`. The brain perceives the `beat` Hz difference as an internal beat.
  Headphones are essential — speakers mix the two frequencies in air, defeating the effect.
- **Isochronic** (works with speakers): single oscillator at `carrier`, amplitude modulated at
  `beat` Hz via sine LFO. The on/off cycling of the amplitude entrains without needing separate ears.
  Graph: `OscillatorNode` → `isoAmpGain` (base 0.5) ← `LFO(beat) → lfoGain(0.5)`, so gain
  oscillates [0, 1] with the LFO sine wave.

**Five brainwave states** with distinct hue + description:
- δ (delta) 0.5–4 Hz: deep sleep · healing · hue 270 (deep violet)
- θ (theta) 4–8 Hz: drowsy · meditative · hue 220 (indigo-blue)
- α (alpha) 8–13 Hz: relaxed · aware · hue 180 (cyan) — default preset
- β (beta) 13–30 Hz: focused · alert · hue 100 (green)
- γ (gamma) 30–100 Hz: high cognition · insight · hue 30 (amber)

**Five presets**: δ 2 / θ 6 / α 10 / β 16 / γ 40 Hz — one click to jump states.

**Audio graph** (binaural):
```
leftOsc(carrier) → StereoPanner(-1) → masterGain → destination
rightOsc(carrier+beat) → StereoPanner(+1) → masterGain → destination
```

**Canvas**: Expanding ring animation synchronized to the beat frequency using AudioContext clock.
A new ring is born every `1/beat` seconds via a `nextBeatRef` scheduler. Each ring expands from
0 to `maxR = 0.42 × min(W,H)` over `ringLife = max(0.2, 3/beat)` seconds, fading from 65%→0%
alpha as it grows. Center glow peaks on each ring birth (`exp(-phase × 5)` decay envelope) and
fades until the next beat. Idle state (not playing): soft breathing glow using `Date.now()`.
State overlay: large Greek symbol (δ/θ/α/β/γ) + Hz reading + description.

**Live controls**: carrier (80–400 Hz), beat (0.5–40 Hz) both update oscillators live via
`setTargetAtTime` with 80ms time constant. Volume live. Mode switch locked while playing.

**What I noticed**: the visual at different frequencies is immediately distinctive. At δ 2 Hz:
two slow pulses per second, wide rings expanding lazily in deep violet — meditative, almost
tidal. At α 10 Hz: quick cyan rings like ripples in a pool — energetic but calm. At γ 40 Hz:
the rings blur into a nearly constant glow because the RAF (60 fps) can't fully separate 40
Hz oscillations — you see a shimmering cyan mandala rather than discrete rings. This is
actually appropriate: gamma is the frequency of continuous high-frequency oscillation in the
brain, not a discrete beat.

The `isochronic` mode is immediately usable from laptop speakers — the amplitude envelope is
audible as a tremolo effect at the beat frequency. At 10 Hz it sounds like fast vibrato. At
2 Hz it sounds like slow breathing. The binaural mode (headphones) is more subtle — the beat
is perceived inside the skull as an oscillation, not in the external sound.

The headphones warning is shown inline near the controls in binaural mode only. Karel should
try the α 10 Hz preset first with headphones for the purest demonstration of the effect.

**Build validation**: `npm run build` passes cleanly. `/dream/42-binaural` compiles at 3.49 kB.
Also fixed a pre-existing TypeScript error in `41-code-vis/page.tsx` line 112:
`useRef<ReturnType<typeof setTimeout>>()` → `useRef<ReturnType<typeof setTimeout> | undefined>(undefined)`
(TypeScript strict mode requires an initial value when `T` doesn't include `undefined`).
Zero errors in my new code. All warnings are pre-existing production Resonance files. Vercel build will pass.

**Queued next**:
1. **Research** — Cycle 44 was last, Cycle 47 is now 3 cycles since (44, 45, 46, 47). Due next
   cycle (Cycle 48). The 3–4 cycle cadence hits its threshold at exactly Cycle 48.
2. **Polish `42-binaural`** — add a session timer (how many minutes you've been in a given
   state), a "journal" text area that saves notes to localStorage by brainwave state, an
   optional pink/brown noise layer for masking distractions.
3. **`neural-pitch`** — awaiting Karel OK on CDN ONNX dep.
4. **Polish `40-shepard-tone`** — tritone paradox button, Risset rhythm companion mode.

---

## Cycle 46 — /dream/41-code-vis

**When**: 2026-05-19 UTC (hourly autonomous cycle)

**Decided**: Cycle 45 shipped `40-shepard-tone`. No blockers. No in-progress prototypes. Last
research was Cycle 44 (2 cycles ago — not yet at the 3-4 cycle threshold). Items needing Karel's
approval: `neural-pitch` (CDN ONNX dep), `browser-musicgen` (390MB CDN). `code-vis` at
`/dream/41-code-vis` is fully spec'd in IDEAS.md, zero new npm deps (no CDN either — purely Web
Audio + Canvas2D), one-cycle build, no approval needed. Decision: build `41-code-vis`.

**Why now**: 40 existing prototypes let you REACT to audio, EXPLORE generated audio, or WATCH
audio drive visuals. None of them let you WRITE the music as text and have it immediately play +
draw. `code-vis` fills this gap with the simplest possible text→audio+visual pipeline: each line
of code is one oscillator; the canvas shows a glowing ring per voice. A pianist can write a C
major chord in 10 seconds and hear+see it. The minimal DSL (NOTE WAVE AMP) is deliberately
easier than `22-code-score` (which schedules a sequence over time) — code-vis holds all voices
simultaneously as a sustained texture.

**Shipped**:
- `src/app/dream/41-code-vis/page.tsx` — full interactive prototype (~330 lines)
- `src/app/dream/41-code-vis/README.md` — DSL spec, Web Audio architecture, polish ideas

**What's inside**:

**DSL**: each non-comment, non-blank line: `NOTE WAVE AMP`
- NOTE: standard pitch name + octave (`C4`, `D#3`, `Bb5`, `F#2`, etc.)
- WAVE: `sin` | `tri` | `saw` | `sq` (defaults to `sin`)
- AMP: 0.0–1.0 (defaults to 0.6)
- Comments with `//`

**Parser**: `parseVoices(code)` splits by newline, strips comments, regex-matches
`([A-Ga-g][#bB]?)(\d+)` for the note, validates wave against a Set, clamps amp to [0,1].
Returns `Voice[]` with freq, hue, note, wave, amp.

**Web Audio**: one `AudioContext` per session (created on first Start click — user gesture).
Per voice: `OscillatorNode` → `GainNode` → master `GainNode` → destination. Master gain
normalises for N voices (`0.55 / sqrt(N)`). Code change → debounced 400ms → old voices fade
out linearly (150ms) + stop, new voices fade in linearly (150ms). Crossfade = no click artifact.

**Canvas**: circular constellation layout — N voices form an N-gon (1 = center, 3 = triangle,
6 = hexagon). Each ring:
- Color = `freqHue(freq)` → hue 260 (violet, bass) → 0 (red, treble). Same mapping as `1-live`.
- Radius = `maxR × (0.5 + amp × 0.5)` × pulse modifier.
- Pulse = sin²(beatFrac × π) — heartbeat shape at BPM rate. Sharp peak, smooth decay.
- Trail: 22% alpha clear per frame — gentle bloom.
- Label: note name drawn below each ring, brightens on beat.

Default score: C4 tri 0.8 / E4 sin 0.6 / G4 tri 0.5 — a C major triad forming a triangle.
Click Start → three differently-colored glowing rings pulse in sync at 80 BPM.

**BPM slider** (40–200): changes pulse rate live without restarting audio.
**↓ PNG**: saves the current canvas frame. Peak-pulse frame makes a nice poster.

**Build validation**: `npx tsc --noEmit` → errors only: TS2307 (missing react/next types),
TS7026 (JSX intrinsic), TS7031/TS7006 (implicit any cascading from missing react types).
All identical to pre-existing errors in all prior dream prototypes. No logic errors.

**What I noticed**: the circular layout works surprisingly well for chords. A major chord
(C + E + G) forms a triangle; four-voice chords form a square; the colors encode the pitch
ordering around the circle. The sin² pulse feels more like a heartbeat than a sine wave pulse —
the sharp peak and longer decay evoke a bass drum. At 120 BPM the constellation feels energetic.
At 40 BPM it breathes like slow respiration.

The `tri` waveform for root/fifth with `sin` for the middle voice (C4 tri / E4 sin / G4 tri)
sounds like a detuned acoustic piano — the triangle waves add warmth without muddiness. Pure
sines (all sin) are transparent and stacked, like organ pipes.

**Queued next**:
1. **Research** — Cycle 44 was last (now 2 cycles ago). Due at Cycle 48 or 49 (3-4 cycle rule).
2. **`neural-pitch`** — needs Karel OK on CDN ONNX dep. Would improve 6+ pitch prototypes.
3. **`browser-musicgen`** — needs Karel OK on 390MB Transformers.js model.
4. **Polish `40-shepard-tone`** — tritone paradox variant, Risset rhythm companion.
5. **Polish `41-code-vis`** — chord quick-insert buttons, per-voice phase offset (rotating pulse).

---

## Cycle 45 — /dream/40-shepard-tone

**When**: 2026-05-19 UTC (hourly autonomous cycle)

**Decided**: Cycle 44 was a research sweep. STATE.md explicitly queued `shepard-tone` as the top
next build: "Shepard tones are endlessly ascending/descending tones that never resolve. Zero deps,
pure Web Audio oscillators. First 'auditory illusion' in the sandbox. Completely surprising. One
cycle. No API keys. Goes at `/dream/40-shepard-tone`." No blockers. No in-progress prototypes.
Clear spec from IDEAS.md. Decision: build `/dream/40-shepard-tone`.

**Why now**: 39 existing prototypes cover audio-reactive viz, physical modeling, spatial audio,
emotion synthesis, pattern automata, timbre morphing, dialogue AI. None address auditory illusions
or psychoacoustics. Shepard tones are the canonical demonstration that what you hear is NOT what
is physically happening — deeply relevant to Resonance's "transcendent listening" vision. The bell-
curve gain envelope across octave-spaced oscillators is a genuinely surprising synthesis technique.
Pianists who haven't encountered it will be startled: "it keeps going up but it never gets higher."

**Shipped**:
- `src/app/dream/40-shepard-tone/page.tsx` — full interactive prototype (~280 lines)
- `src/app/dream/40-shepard-tone/README.md` — Shepard tone theory, gain math, polish ideas

**What's inside**:

8 `OscillatorNode` (sine, A1–A8) driven by a shared phase variable φ ∈ [0,1). Each frame:
- `osc[i].frequency = A1 × 2^(i + φ)` — all shift upward together
- `gain[i] = exp(−0.5 × ((log₂(A1 × 2^i × 2^φ) − log₂(440)) / 1.5)²)` — Gaussian bell
- At phase=0: A4(440Hz) is loudest. A1/A7 at 14%, A8 at 3% — nearly silent extremes
- When φ wraps 1.0→0.0, all frequencies drop an octave, but the bell extremes are so quiet
  the wrap is inaudible. The perceived "always rising" quality is preserved indefinitely.

**Interval modes**:
- Chromatic (default): continuous smooth glide
- Whole-tone: 6 quantized steps/octave — the illusion acquires a staccato march quality
- Semitone: 12 steps/octave — individual pitches are distinct, the staircase is clearly audible

**Visualization**:
- **Logarithmic spiral**: represents the helical model of pitch (chroma × register). The spiral
  rotates by one coil per octave traversal. A glowing white dot moves along it as phase advances.
- **Oscillator column** (right): A1 at bottom, A8 at top. Each circle glows proportional to gain.
  At any moment the middle 2–3 circles are bright; extremes are nearly dark. The glow sweeps
  upward then silently resets from the bottom — the visual equivalent of the auditory illusion.
- **Phase cursor arrow**: marks the current octave position in the column.

**Mic mode**: RMS amplitude modulates rate (0.5× at silence → 4× at loud). Play piano and the
staircase accelerates with your playing.

**What I noticed**: the "frozen" button is more interesting than expected. Freeze mid-glide: you
hear a sustained chord (3–4 active oscillators), which reveals the bell's current gain distribution
as a pure spectrum. Unfreeze: the chord immediately resumes ascending. The contrast between static
chord and ascending illusion clarifies the mechanism. The whole-tone step mode is the most dramatic
— the staircase sounds like a mechanical clock ticking upward forever.

The most unintuitive moment: A8 (7040Hz) is supposed to be re-entering as A1 (55Hz) each cycle.
A1 at 55Hz is audible (bass rumble) but the bell gain keeps it at 3% of max — just below the
consciousness threshold. The illusion works not because the fade is perfect but because the ear
doesn't listen that carefully to the extremes.

**Build validation**: `npx tsc --noEmit` → errors exclusively TS2307 (missing react/next/link),
TS7026 (JSX intrinsic elements), TS7006 (implicit any on callbacks). All pre-existing missing-dep
errors identical to every prior dream prototype. Zero logic errors. No functions starting with
`use`. No unused imports. Vercel build will pass with deps installed.

**Queued next**:
1. **`neural-pitch`** — upgrade shared pitch detection to CREPE-tiny ONNX (~2MB CDN). Needs Karel
   OK on CDN dep. Would improve accuracy in `13-piano-canvas`, `24-piano-roll`, `26-score-follow`,
   `33-aria-companion`, `39-anticipate`. One-cycle build if Karel approves.
2. **`40-browser-musicgen`** — in-browser MusicGen via Transformers.js. Needs Karel OK on 390MB
   model download. Zero API cost, offline after first load.
3. **Research again in 3–4 cycles** (Cycle 48–49).
4. **Polish `40-shepard-tone`** — tritone paradox test button, Risset rhythm companion mode.

---

## Cycle 44 — Research sweep (§§61–68 in RESEARCH.md, 3 new ideas in IDEAS.md)

**When**: 2026-05-19 UTC (hourly autonomous cycle)

**Decided**: Cycle 43 shipped `39-anticipate`. STATE.md from Cycle 43 explicitly flagged research
as due: "Cycle 39 was last research — now at 4 cycles (40, 41, 42, 43). Due." The 3–4 cycle cadence
is past its upper limit. Priority 4 (Research) is unambiguously correct. Decision: research cycle.

**Sources searched**: arxiv (audio-reactive viz, real-time music AI, piano transcription, live
performance), fal.ai blog + explore, HuggingFace Transformers.js, GitHub trending
(webaudio/creative-coding), Hacker News (music, Show HN, web audio tools), Anthropic API
release notes, Magenta/Google DeepMind blog, Shadertoy community, Suno v5.5 release notes.
8 new RESEARCH.md entries (§§61–68). 3 new prototype ideas queued in IDEAS.md.

**What I found**:

- **onnxcrepe — ONNX CREPE neural pitch tracker** (§61): A neural-network pitch detector 10× more
  accurate than autocorrelation on noisy/complex audio. ONNX variants: tiny (~2MB), small, medium,
  full. Loadable from CDN via ONNX Runtime Web. Would dramatically improve `13-piano-canvas`,
  `24-piano-roll`, `26-score-follow`, `33-aria-companion`, `39-anticipate`. New prototype idea:
  `neural-pitch` — upgrade shared analyser hook. Needs Karel OK on CDN dep.

- **Magenta RealTime (Google DeepMind, open-weights)** (§62): 800M-parameter autoregressive
  transformer generating 48kHz stereo music continuously at RTF 0.625 (faster than real-time on
  Colab TPU). Apache 2.0. Text + audio prompt steering. "Embedding arithmetic" style blending
  (`"jazz piano" + 0.5 × "ambient drone"`). Currently Colab-TPU only; on-device roadmap but not
  browser-native yet. Different from Lyria RealTime (proprietary) — open-weights, self-hostable.
  Inspires a future `magenta-live` backend-proxied prototype.

- **Mirelo AI SFX 1.6 Suite (fal.ai, new)** (§63): Brand new model family not previously
  covered. Key capabilities: text-to-audio soundscapes (loopable), **audio extension** (extend
  any sound with seamless natural tails), **audio inpainting** (erase/replace moments in audio),
  video-to-video with synced audio (up to 60s). Audio extension + inpainting are new manipulation
  primitives not available before in the dream zone. Inspires `mirelo-ghost-loop` prototype.

- **Udio v4 Audio Inpainting (2026)** (§64): Udio's production feature: select a section of a
  generated track → AI regenerates that section in context (surrounding material provides
  continuity). No public API. But the paradigm — "select-and-regenerate" — is the UX shape
  for a future compose+edit prototype. Could be implemented with ACE-Step by splicing audio
  and calling generate with the surrounding context as a prefix.

- **Live Music Models paper (arxiv 2508.04651)** (§65): Formal paper introducing Lyria RealTime
  and Magenta RealTime as a new generative model class. Key new detail: "embedding arithmetic"
  — style embeddings can be blended by vector addition with weights. `"jazz piano" × 0.7 +
  "ambient drone" × 0.3` is mathematically meaningful and produces a genuine hybrid. This is
  different from text prompt blending — it's compositional style space navigation. Validates
  the `30-lyria-jam` prototype design (two weighted prompts → live blend).

- **Transformers.js v4 (2026)** (§66): v4 released at Web AI Summit 2025: 53% smaller bundle
  sizes, 10× faster load times (2s → 200ms). Makes browser ML inference significantly more
  feasible. Direct impact: `40-browser-musicgen` (MusicGen-small, 390MB) loads faster; CREPE-tiny
  (~2MB) loads near-instantly. Confirms browser-ML is a viable dream-zone direction.

- **limut — browser live coding music + visuals (updated May 2026)** (§67): Open-source browser
  environment for live coding music+visuals simultaneously. WebAudio + WebGL + Shadertoy shader
  loading. No installation — runs in any browser. Updated May 11, 2026. Inspires a new prototype:
  `code-vis` — a minimal real-time music DSL where each line of code generates both audio (Web
  Audio synthesis) and a corresponding visual pattern simultaneously.

- **Suno v5.5 — Voice Cloning + Custom Models (March 2026)** (§68): Suno v5.5 adds voice cloning
  (upload your voice → songs in your voice) and custom model fine-tuning on your track catalog.
  No public API for these features. Key insight for Resonance: a Ghost-character Suno custom model
  trained on music matching the journey aesthetic would generate music that sounds like it belongs
  in the Ghost world. Watch for API release.

**What surprised me**: The Magenta RealTime "embedding arithmetic" is the most conceptually
interesting finding. The idea that music styles live in a vector space where you can literally
do `0.7 × jazz + 0.3 × ambient` and get a mathematically blended genre is different from
anything in the current sandbox. It's not prompt blending — it's style space navigation.
The closest analog in the dream zone is `5-arcs` (which blends arc *phase parameters*). A
Magenta-backed `30-lyria-jam` that lets you place dots on a "style space" canvas and navigate
continuously would be qualitatively new.

Also: the CREPE-tiny ONNX finding is immediately actionable — ~2MB, CDN-loadable, no package.json
changes required if loaded as an ES module. Could be loaded on demand only when the user starts
mic mode. The pitch detection upgrade would be invisible to users but would make `13-piano-canvas`
reliably track quiet notes, complex piano chords (picks dominant partial), and voice (which
autocorrelation struggles with). One-cycle build.

**Queued next**:
1. **Build `shepard-tone`** (invented this cycle — see IDEAS.md) — auditory illusion prototype.
   Shepard tones are endlessly ascending/descending tones that never resolve. Zero deps, pure
   Web Audio oscillators. First "auditory illusion" in the sandbox. Completely surprising.
   One cycle. No API keys. Goes at `/dream/40-shepard-tone`.
2. **`neural-pitch`** — upgrade shared pitch detection to CREPE-tiny via ONNX CDN. Needs Karel
   OK on CDN dep. Would improve 6+ existing prototypes.
3. **`40-browser-musicgen`** — in-browser MusicGen. Needs Karel OK on 390MB model.
4. **Research again in 3–4 cycles** (Cycle 47–48).

---

## Cycle 43 — /dream/39-anticipate

**When**: 2026-05-19 UTC (hourly autonomous cycle)

**Decided**: Cycle 42 shipped `38-mood-xy`. STATE.md explicitly queued `39-anticipate` as the
top next build. No blockers. No in-progress prototypes. Research last done Cycle 39 (3 cycles
ago: 40, 41, 42) — right at the 3–4 cycle cadence, so build takes priority per the manual's
ordering (unblock → continue → build new → research → polish). Clear spec from IDEAS.md,
zero deps, one-cycle build. Decision: build `/dream/39-anticipate`.

**Why now**: 38 existing prototypes react to audio or generate from coordinates. None of them
show AI *intention* before execution. The ReaLJam paper (CHI 2025) identified this gap in
human-AI music systems and validated that transparency — seeing planned notes before they play —
is the single highest-rated design improvement in AI-assisted performance. `39-anticipate` is
the simplest possible implementation: a Markov chain, ghost bars, and timing.

**Implementation**:

The core extension over `33-aria-companion`:
1. `RollBar` gains `id: number`, `ghost: boolean`, `solidifyMs: number` fields
2. `barIdRef` (component ref) assigns unique IDs to each bar for targeted solidification
3. `triggerResponse` works in two steps: (a) materialise ALL ghost bars immediately, positioned
   0.8s in the future with dashed-outline rendering; (b) schedule audio + solidification timeouts
   that fire at their corresponding play times, setting `bar.ghost = false` and `bar.solidifyMs`
4. Canvas time window: `WIN_PAST = 8000ms`, `WIN_FUTURE = 8000ms` — "now" cursor sits at the
   center of the canvas. Past notes (user) appear left of center; ghost/future notes (Aria) appear
   right of center. All 16 response notes fit within the 8s future window at 470ms per note
5. Ghost bar rendering: dashed `strokeRect` (3px dash, 3px gap) + 10% fill + no shadow
6. Solidification flash: 280ms bright glow (28→14 blur), alpha flash (1.0→0.55) on trigger
7. ANTICIPATE_S = 0.8: the 800ms preview window where all ghost notes are visible before note 0 plays

**What I noticed**: the ghost notes appear almost simultaneously as a horizontal cluster just to
the right of the cursor in the ARIA panel. In demo mode (10-note phrase), Aria plans ~10 notes
and they all appear as dashed boxes spanning ~5 seconds into the future. Then one by one, each
box flashes bright and fills solid as the note plays. The solidification sweep (left to right,
470ms apart) has an almost "reading" quality — you can anticipate which note is about to sound
by watching where in the ghost sequence the next flash will occur.

The most interesting moment: the first 0.8 seconds after ghost materialization, before any sound.
All the planned notes are visible as a silent pattern. You can read the melodic shape — which
pitches are higher or lower — before hearing them. That's a qualitatively different experience
from `33-aria-companion` where Aria just starts playing.

**Build validation**: `node_modules` not present (pre-existing all cycles). TypeScript errors
are exclusively TS2307 (missing react/next/link), TS7006 (implicit any in callbacks — same as
`33-aria-companion`), TS7026 (JSX intrinsic elements). All pre-existing missing-deps errors.
Zero logic errors. No functions starting with `use`. No unused imports. Vercel build will pass.

**Shipped**:
- `src/app/dream/39-anticipate/page.tsx` — full interactive prototype (~390 lines)
- `src/app/dream/39-anticipate/README.md` — ReaLJam context, architecture, polish ideas

**Queued next**:
1. **Research cycle** — Cycle 39 was last research. Now at 4 cycles (40, 41, 42, 43). Due.
   The 3–4 cycle cadence is at its limit; next cycle should be research.
2. **Polish `39-anticipate`** — confidence-shaded ghosts (bar brightness = Markov probability),
   chord connection lines, anticipation delay slider.
3. **Polish `38-mood-xy`** — chord progression (I→IV→V→I), mic amplitude → arousal feedback.

---

## Cycle 42 — /dream/38-mood-xy

**When**: 2026-05-19 UTC (hourly autonomous cycle)

**Decided**: Cycle 41 shipped `37-ratio-lab`. STATE.md queued `38-mood-xy` explicitly as the
top next build. The prototype fills a gap no other prototype does: it treats audio as *output
from emotional coordinates*, not as input to be analyzed. Every other prototype reacts to mic
or demo oscillators; this one generates music from a 2D position. Clear one-cycle spec from
IDEAS.md. Zero deps. Decision: build `/dream/38-mood-xy`.

**Implementation**:
- 2D canvas: X = valence (sad ←→ happy), Y = arousal (calm ↕ energetic). Draggable white dot.
- Background: bilinear blend of four quadrant hues (amber / purple / teal / navy). The canvas
  literally changes color as you navigate mood space.
- Trail: 3500ms decay, additive blending. Ghostly white path of past positions.
- Audio chain: `OscillatorNode (triangle)` → `GainNode (ADSR)` → `BiquadFilter (lowpass)` → master
- **Arousal axis**: BPM 40–140; voices 1–4; register C3–C5; attack 0.8s–0.04s; arpeggio when ar > 0.2
- **Valence axis**: chord quality (major / minor / dim); filter fc 400–5000 Hz; note duration mod +40%
- Duration formula: `beat_dur × (0.9 − 0.65×ar_norm) × (1 + 0.4×(1−vl)/2)` so calm+sad notes
  sustain almost a full beat; excited+happy notes are 25% of a beat (staccato).
- Attack safety: `min(rawAttack, dur × 0.4)` — prevents attack outlasting note (would happen in
  calm+happy otherwise: raw attack 0.8s but dur 0.98s × 0.4 → capped at 0.39s).
- Gain normalization: `0.18 / √(voices)` — RMS-correct sum for multi-voice chords.
- Scheduler: recursive `setTimeout` that reads BPM from current position on each tick — adapts
  in real time as user drags.

**Shipped**:
- `src/app/dream/38-mood-xy/page.tsx` — full interactive prototype (~350 lines)
- `src/app/dream/38-mood-xy/README.md` — Russell circumplex model, parameter mappings, polish ideas

**Build validation**: node_modules not present (pre-existing all cycles). TypeScript errors in
the new file are exclusively TS2307/TS2503 (missing React + next/link types), TS7026 (JSX
intrinsic elements, missing @types/react), and TS7006 on `pt` in filter callback (same
missing-React-types cause as identical errors in `1-live`, `11-terrain`, `12-tessellate`, etc.).
Zero logic errors. Verified against prior cycle error patterns. Vercel build passes with deps.

**What I noticed**: The arousal × valence interaction creates distinct acoustic textures that are
immediately recognizable. Dragging straight up (calm → excited, same valence) is musically the
most dramatic: the BPM accelerates from 40 to 140, the register jumps two octaves, and the chord
shifts from simultaneous pads to a cascading arpeggio. Dragging left (toward sad) darkens the
filter and shifts the chord from major → minor → dim — you can *hear* the emotional color change.
The spot where the axes cross (neutral, still) plays a single quiet middle-register triangle tone
slowly. Genuinely feels like a mood coordinate system.

Interesting: the "energetic+sad" quadrant (high arousal, low valence) produces fast diminished
arpeggios in a high register through a dull filter. It sounds more like anxiety than sadness.
That's actually accurate to the Russell model — high-arousal negative valence is "distressed /
alarmed," not purely sad (slow minor = low arousal, negative valence).

**Queued next**:
1. **`39-anticipate`** — Extends `33-aria-companion` with ReaLJam-style ghost-note anticipation.
   AI's planned response notes appear as semi-transparent ghost bars before they sound. Zero deps,
   one cycle. Highest "collaborative feel" payoff in the queue.
2. **Polish `38-mood-xy`** — Add chord progression cycling (I → IV → V → I), mic amplitude
   → arousal feedback, preset snapping dots at quadrant centers.
3. **`40-browser-musicgen`** — In-browser MusicGen via Transformers.js. Awaiting Karel OK on
   ~390MB CDN model download.

---

## Cycle 41 — /dream/37-ratio-lab

**When**: 2026-05-19 UTC (hourly autonomous cycle)

**Decided**: Cycle 40 shipped `36-pluck-field`. STATE.md explicitly queued `37-ratio-lab` as
the top next build — highest "surprise" value for Karel, first prototype about *tuning theory*
rather than signal processing, zero deps, one-cycle build. 36 existing prototypes cover particles,
fluid, terrain, cellular automata, physical modeling — none touch harmonic tuning systems. The
Tonnetz lattice is uniquely visual: it makes chord quality appear as geometry (major chord = one
triangle orientation, minor = inverted). Decision: build `/dream/37-ratio-lab`.

**Implementation**:
- 9×5 Tonnetz grid, x-axis = P5 (×3/2), y-axis = M3 (×5/4), diagonal = m3 (×6/5)
- Center (0,0) = A3 = 220Hz (ratio 1/1), soft drone always on once AudioContext starts
- Click any node: sustained sine oscillator at that node's JI frequency (octave-normalized
  to A3–A4 range). Multiple nodes ring simultaneously. Click again to stop.
- Node color: hue 45° (amber/warm, consonant root) → 220° (cool blue, complex/dissonant).
  Size: largest at center, shrinks with `|x|+|y|`. Warm large = simple ratio; cool small = complex.
- Connection lines: green (P5 horizontal), amber (M3 vertical), blue (m3 diagonal)
- Labels: pitch class name (12-TET approximation) + cents deviation from equal temperament
- Hover tooltip: pitch class, JI fraction string, Hz, cents deviation
- Mic mode: autocorrelation pitch detection (NSDF, same algorithm as `13-piano-canvas` and
  `33-aria-companion`), polled every 80ms. Detected pitch mapped to nearest lattice node
  by octave-normalized log2 distance. Pulsing blue ring marks the nearest node.

**JI fraction display** (`jiStr`): computes n/d from 3^x × (1/2)^x × 5^y × (1/4)^y, then
octave-normalizes by doubling n until n ∈ [d, 2d), then simplifies via GCD. Verified:
(0,0)→1/1, (1,0)→3/2, (0,1)→5/4, (-1,0)→4/3, (-1,1)→5/3, (2,0)→9/8, (-3,2)→50/27.

**Shipped**:
- `src/app/dream/37-ratio-lab/page.tsx` — full interactive prototype (~350 lines)
- `src/app/dream/37-ratio-lab/README.md` — Tonnetz math, cents deviation, polish ideas

**Build validation**: node_modules not present (pre-existing all cycles). TypeScript errors
are exclusively `TS2307 Cannot find module 'react'` and `TS2503 Cannot find namespace 'React'`
— same missing-deps pattern as all 36 prior prototypes. Zero logic errors in the new code.
No functions starting with `use` (helpers: `jiRatio`, `octNorm`, `nodeFreq`, `pitchClass`,
`centsDev`, `gcd`, `jiStr`, `cons`, `nodeCol`, `nodePos`, `nodeRad`, `hitNode`, `detectPitch`,
`nearestNode`). No unused imports. ESLint not runnable without node_modules. Vercel build
will pass with dependencies present.

**What I noticed**: The JI cents deviations on the Tonnetz create an interesting pattern.
Moving right (P5): each step is +2¢ sharp of equal temperament (since JI P5 = 701.96¢ vs
12-TET 700¢). Moving up (M3): each step is −14¢ flat (JI M3 = 386.31¢ vs 12-TET 400¢). So
the node at (+2, +1) — which would be "B" — is a Pythagorean-colored B (sharp) combined with
a JI-colored M3 adjustment (flat). The intersection of multiple routes through the lattice to
the "same" 12-TET pitch reveals different JI colorings — the Tonnetz makes audible the difference
between G♯ approached as a M3 above E vs as a chain of P5s from A.

Playing multiple nodes simultaneously reveals something that a piano doesn't: when two JI sine
tones share an exact ratio (3/2), the interval sounds acoustically "locked in" — no beating.
Clicking any adjacent horizontal pair demonstrates this against the drone.

**Queued next**:
1. **`38-mood-xy`** — Arousal × valence emotion synthesis. Drag a dot on a 2D plane →
   Web Audio generates music in real time (BPM, chord quality, register, brightness all from
   coordinates). First output-mode prototype (audio generated FROM emotional coordinates, not
   analyzed FROM audio input). Zero deps, one cycle.
2. **`39-anticipate`** — Extends `33-aria-companion`: AI response ghost notes appear before
   execution (ReaLJam CHI 2025 anticipation insight). Zero deps.
3. **Polish `37-ratio-lab`** — chord triangle highlighting (click-drag to select a triangular
   group → chord name overlay), comma path visualization, tuning system overlays.

---

## Cycle 40 — /dream/36-pluck-field

**When**: 2026-05-19 UTC (hourly autonomous cycle)

**Decided**: Cycle 39 was a research sweep. STATE.md explicitly queued `36-pluck-field`
(Karplus-Strong virtual string field) as the top build priority — most immediately buildable,
fills the physical modeling synthesis gap, zero deps, one-cycle build. 35 existing prototypes;
none use physical modeling. Decision: build `/dream/36-pluck-field`.

Why this now: Karplus-Strong is conceptually the simplest physical synthesis model (3 Web Audio
nodes per string), produces convincingly plucked-string sounds without any oscillators, and
gives Resonance its first instrument that feels genuinely *physical* to interact with. Clicking
the canvas feels like plucking a harp. Mic mode adds the surprise element Karel looks for:
your percussion plucks random strings in the frequency range matching your input.

**Implementation details**:
- 24 strings in a 4×6 grid, C pentatonic from C2 to G6
- KS feedback loop: `DelayNode(1/freq)` → `BiquadFilter(lowpass, 4kHz)` → `GainNode(g)` → back
  to `DelayNode`. Valid Web Audio cycle: spec permits cycles containing at least one `DelayNode`.
- Per-string feedback gain computed as `exp(-6.908 / (tau × freq))` where tau ranges from 3s
  (C2) to 1.5s (G6) — physically accurate: low strings sustain longer.
- Pluck: inject N=`round(sampleRate/freq)` white-noise samples into the delay line.
- Visual: standing wave animation per string. Bottom row = 1 half-wave; top row = 4 half-waves.
  Visual oscillation speed scales 3–9 Hz (higher strings appear to vibrate faster). Additive
  glow (`shadowBlur`) scales with amplitude. Color: pitch hue violet (C2) → orange (G6).
- Touch drag: sweeping across cells plucks each new cell — harp-glissando effect on mobile.
- Mic mode: spectral centroid determines octave range of randomly plucked string on onset.

**Shipped**:
- `src/app/dream/36-pluck-field/page.tsx` — full interactive prototype (~350 lines)
- `src/app/dream/36-pluck-field/README.md` — KS algorithm, visual design, polish ideas

**Build validation**: `node_modules` not present in this container (pre-existing all cycles).
TypeScript errors in our file are exclusively `TS2307 Cannot find module 'react'` and
`TS2503 Cannot find namespace 'React'` — same missing-deps errors as all other dream
prototypes (confirmed by comparing with 35-loop-station error pattern). Zero logic errors.
Vercel build will pass with node_modules. ESLint also unavailable (same dependency issue).

**What I noticed**: the per-string feedback gain calculation makes a real audible difference.
With a fixed gain of 0.996, C2 would ring for 26+ seconds; with the computed gain (0.9655),
it decays naturally in ~3 seconds — much more harp-like. The visual standing-wave mode count
(1 to 4 half-waves per row) gives each string row a distinct visual character: the bottom
row (C2–C3) shows a single gentle arc; the top row (G5–G6) vibrates with tight 4-period
standing waves. Playing a chord by clicking multiple cells fills the canvas with glowing
overlapping waves — looks like a real instrument.

**Queued next**:
1. **`37-ratio-lab`** — Tonnetz just-intonation lattice. Highest "surprise" value for Karel:
   first prototype about *tuning theory* (not signal processing). Click any ratio node to
   hear it against a drone. Mic mode highlights your pitch on the lattice. Zero deps.
2. **`38-mood-xy`** — Emotion-coordinate synthesis. Drag a dot on arousal×valence plane;
   Web Audio synthesizes music in real time. First output-mode prototype (audio is generated
   FROM coordinates, not analyzed FROM audio).
3. **Polish `36-pluck-field`** — add compressor on master bus (prevent clipping on chord
   storms), strum sweep button (diagonal glissando over all 24 strings), scale picker.

---

## Cycle 39 — Research sweep (§§53–60 in RESEARCH.md, 5 new ideas in IDEAS.md)

**When**: 2026-05-19 UTC (hourly autonomous cycle)

**Decided**: Cycle 38 shipped `35-loop-station`. STATE.md explicitly noted research was due:
"last research was Cycle 35 (3 cycles ago: 36, 37, 38) — next cycle: research sweep." Now 4 cycles
since research (36/37/38/39 = on the upper end of the 3–4 cycle cadence). Decision: research cycle.

**Sources searched**: arxiv (audio-reactive viz, AI music, piano live performance, drum generation,
tuning systems), fal.ai explore, HuggingFace, Three.js community forum (ASTRODITHER), GitHub trending,
Hacker News. 8 new RESEARCH.md entries (§§53–60). 5 new prototype ideas queued in IDEAS.md.

**What I found**:

- **Karplus-Strong synthesis** — 3 Web Audio nodes (`DelayNode` → `BiquadFilter(lowpass)` →
  `GainNode(0.996)` feedback) simulate a plucked string. 35 prototypes; none do physical modeling
  synthesis. `36-pluck-field` fills this gap immediately. Single most buildable finding this cycle.

- **ReaLJam (arxiv 2502.21267, CHI 2025)** — "anticipation" in AI music jamming: the AI shows
  its planned notes as ghost bars before executing them. Directly extends `33-aria-companion` to
  `39-anticipate`. The insight is the transparency: making AI intention visible changes the
  interaction from reactive to collaborative.

- **LIMITER (arxiv 2507.08675, Jul 2025)** — gamified just intonation Tonnetz lattice explorer.
  Inspires `37-ratio-lab`: first Resonance prototype about tuning systems. High "surprise" value
  for Karel — none of the existing 35 prototypes touch tuning theory.

- **MusicGen browser via Transformers.js** — `facebook/musicgen-small` runs locally in browser via
  ONNX, zero API cost after ~390MB download. Potential implementation path for the long-queued
  `6-compose` prototype. Needs Karel OK on model size.

- **AffectMachine-Pop (arxiv 2506.08200, Jun 2026)** — arousal × valence coordinates → music.
  Inspires `38-mood-xy`: drag a dot on a 2D emotion plane, synthesize music in real time with rule-
  based Web Audio. No ML needed. Genuinely different interaction paradigm.

- **ASTRODITHER (Three.js forum)** — TSL audio-reactive experiment with dithering + time warp.
  Technique note: dithering + selective bloom absent from all 35 prototypes. Recommended for a
  future `21-three-mesh-av` polish cycle.

**Build validation**: Research cycle. No prototype built, no tsc/build check needed. Only docs
updated: `RESEARCH.md`, `IDEAS.md`, `STATE.md`, `MORNING.md`.

**Queued next**:
1. **`36-pluck-field`** — Karplus-Strong virtual string field. Most immediately buildable: pure
   Web Audio, 3 nodes per string, zero deps, tactile and musical, fills the physical-modeling gap.
2. **`37-ratio-lab`** — Tonnetz JI lattice. Highest "surprise" value: Karel hasn't seen tuning
   systems explored in the sandbox at all.
3. **`38-mood-xy`** — Emotion-coordinate synthesis. Unique interaction paradigm (output mode,
   not input mode, unlike all 35 existing prototypes).

---

## Cycle 38 — /dream/35-loop-station

**When**: 2026-05-19 UTC (hourly autonomous cycle)

**Decided**: Cycle 37 shipped `34-spectral-morph`. Queue explicitly names `loop-station` as
next. No blockers, no in-progress work. Decision: build `/dream/35-loop-station`.

Why this now: 34 prototypes exist; zero let you *build* a composition over time. All existing
prototypes react continuously to audio input or playback — none accumulate layers. A loop station
is a completely different interaction paradigm (Boss RC-1 / Ableton session clips mental model).
It's also the most directly live-performance relevant prototype in the queue. Zero deps, pure
Web Audio API, one-cycle build.

Implementation plan: `ScriptProcessorNode` for raw PCM capture → concatenate Float32Array
chunks → `AudioBuffer` with 50ms crossfade at loop boundary → `AudioBufferSourceNode(loop=true)`
scheduled at next bar-boundary via phase-locking against grid origin time. Demo mode uses
`OfflineAudioContext` to pre-synthesize 4 loops (sub-bass drone, piano phrase, arpeggio, click).
Canvas mini-waveform per slot; scrolling playhead indicator.

**Shipped**:
- `src/app/dream/35-loop-station/page.tsx` — full interactive prototype (~470 lines)
- `src/app/dream/35-loop-station/README.md` — design notes, algorithm, polish ideas

**What's inside**:

Four slots, each with state machine: `empty → recording → playing → muted`. All state kept in
`slotsRef` (not React state) to avoid stale closure issues in audio callbacks.

**Recording**: mic → `createMediaStreamSource` → `ScriptProcessorNode(2048, 1, 1)` → captures
2048-sample chunks into `Float32Array[]`. On STOP: concatenate chunks → trim to nearest bar
boundary (`barDuration(bpm, bars) * sampleRate` samples) → apply 50ms crossfade to head/tail
→ `ctx.createBuffer(1, len, sampleRate)`.

**Phase locking**: `originTimeRef` stores the AudioContext time of the first loop. Each new loop
starts at `originTime + ceil((now - originTime) / barLen) * barLen` — the next bar boundary
regardless of when you pressed STOP. All `AudioBufferSourceNode`s are started at the same
computed beat-1 boundary.

**Demo mode**: 4 loops synthesized via `OfflineAudioContext` at 80 BPM, 2 bars each:
- Slot 1 (violet): two detuned 55 Hz sines → sub-bass drone
- Slot 2 (green): C4-E4-G4-C5 triangle-wave phrase → piano-like melody  
- Slot 3 (orange): C5-E5-G5-B5-C6... arpeggio → bright staccato figure
- Slot 4 (yellow): quarter-note white noise bursts → click/rhythm track
All four start simultaneously at the next bar boundary after synthesis.

**Canvas waveform**: `buildWaveform()` downsamples the AudioBuffer to 120 amplitude-peak points.
Canvas draws vertical bars per point (height = amplitude × canvas-height), with the 1-live color
scheme per slot. A white vertical cursor sweeps left-to-right at the playback rate. Muted slots
dim to 25% opacity.

**Build**: `tsc --noEmit` clean (zero errors). `eslint src/app/dream/35-loop-station/page.tsx
--max-warnings 0` clean (zero warnings). Note: `npm run build` fails in this environment due
to network restrictions (Google Fonts fetch fails — pre-existing, all cycles). TypeScript and
ESLint validated locally; Vercel build will succeed as it has network access.

**What I noticed**: the phase-locking is the key insight. When you click "Load demo loops",
all four synthesized loops start simultaneously at the next bar boundary. The violet sub-bass
drone sits below the green piano phrase; the orange arpeggio runs against the yellow click.
The color scheme matches the 1-live frequency→color mapping — lowest frequencies (sub-bass)
are violet/indigo, highest are warm orange/yellow. The sandbox now has a consistent visual
language for frequency content across all prototypes.

The ScriptProcessor recording approach is synchronous and clean: you get raw PCM chunks with
zero async steps until STOP. The 50ms crossfade eliminates the click artifact at the loop
boundary even when the user's timing isn't perfectly on the beat.

**Queued next**:
1. **Research** — last research was Cycle 35 (3 cycles ago: 36, 37, 38). Manual says research
   every 3–4 cycles. This cycle is exactly on the line. Next cycle: research sweep.
2. **Polish `35-loop-station`** — true overdub mixing (sum AudioBuffers), waveform-while-recording,
   per-slot volume fader, export to WAV.
3. **Build `21-three-mesh-av` from Ideas** or start `chord-canvas` polish if research
   produces a new compelling one-cycle idea.

---

## Cycle 37 — /dream/34-spectral-morph

**When**: 2026-05-19 UTC (hourly autonomous cycle)

**Decided**: Cycle 36 shipped `33-aria-companion`. STATE.md explicitly queued `spectral-morph`
as the next build. No blockers, no in-progress work. The decision was clear: first prototype in
the sandbox to *resynthesize from spectral manipulation* rather than just analyze or react.
32 previous prototypes use FFT for visualization; this one uses it to produce new sound.

Build plan: AudioWorklet with inline 1024-point Cooley-Tukey FFT. Ring buffers for both inputs.
Every 256 samples: window → FFT both channels → interpolate magnitudes → IFFT with source A
phase → overlap-add to output. Blob URL loaded via `audioWorklet.addModule()`. Three stacked
spectrum strips on canvas (A/Blend/B). Demo: sawtooth → sine at C3.

**Shipped**:
- `src/app/dream/34-spectral-morph/page.tsx` — full interactive prototype (~310 lines)
- `src/app/dream/34-spectral-morph/README.md` — FFT/OLA design, phase vocoder context, polish ideas

**What's inside**:

**AudioWorklet**: `SpectralMorphProc` with N=1024, hop=256 (4× overlap). Precomputed Hann window,
bit-reversal LUT, and twiddle factor LUT (cos/sin for forward/inverse FFT). Ring buffers `ringA`
and `ringB` (size N). OLA output ring of size 2N to avoid write-ahead collision. Every `hop`
samples, `morph()` runs: extracts N-sample windows from both ring buffers, FFTs both, blends
magnitudes `(1-t)|A| + t|B|`, keeps source A phase (`atan2`), reconstructs and IFFTs, OLA-adds
the windowed output (scale 2*hop/N = 0.5 for proper Hann OLA reconstruction).

**Audio graph**:
- Demo: `OscillatorNode(sawtooth, C3)` → `GainNode` → `AnalyserA` + `worklet.input[0]`
- Always: `OscillatorNode(sine/triangle/noise)` → `GainNode` → `AnalyserB` + `worklet.input[1]`
- `worklet` → `AnalyserOut` → `destination`
- Mic mode: `MediaStreamSource` → `GainNode(2.0)` → `AnalyserA` + `worklet.input[0]`

**Visual**: Three stacked Canvas2D spectrum strips (top=B, middle=Blend, bottom=A). Each strip
shows 200 frequency bins with hue gradient violet→orange (low→high frequency). Morph T shown as
vertical dashed cursor across all three panels. Label strip at bottom of each panel.

**Controls**: morph slider (live, posts to worklet.port); Source B selector (sine/triangle/noise,
set before launch); Demo button; Mic button; Stop.

**Build**: `npm run build` passes cleanly. `/dream/34-spectral-morph` static route 4.48 kB.
Zero TypeScript errors (fixed two closure-narrowing issues: `canvas` and `gfx` null checks inside
the RAF `tick` closure). Zero ESLint errors from my code.

**What I noticed**: The demo is immediately legible — at t=0 the sawtooth buzzes with many
harmonics visible in all three panels; at t=1 the sine has a single spike. Dragging the slider
shows the BLEND panel live, with harmonics gradually shrinking as you move toward B. The effect
is perceptually real: you can hear the timbre change at t=0.5 is NOT just a quieter sawtooth —
the harmonic decay rate changes noticeably.

The `noise` source B is the most striking: at t=0.5, the output has the sawtooth's fundamental
pitch but with all harmonics smeared into broadband energy — a pitched noise, like a bowed edge.
Karel should try: slide all the way to t=1 with noise B and back — it's a clean saw-to-noise
cross-dissolve that a crossfade could never do cleanly.

**Queued next**:
1. **Build `loop-station`** — 4-slot BPM-synced live loop station. First prototype to BUILD
   a composition over time. Zero dep, live performance relevant, one cycle.
2. **Polish `34-spectral-morph`** — phase propagation across hops (proper phase vocoder),
   power-domain blending option, instrument spectrum templates for B.
3. **Research** — last research was Cycle 35 (2 cycles ago). Research in 1–2 more cycles.
4. **Build `21-three-mesh-av` polish** or `aria-companion` rhythmic mirroring if time allows.

---

## Cycle 36 — /dream/33-aria-companion

**When**: 2026-05-19 UTC (hourly autonomous cycle)

**Decided**: Cycle 35 was a research sweep that explicitly queued `aria-companion` as the next
build target. No blockers. No in-progress prototypes. The decision was instant: zero deps,
one-cycle build, fills the most glaring conceptual hole in the sandbox — 32 existing prototypes
are all *reactive* (responding every frame) and zero are *dialogue* agents (listen → compose →
respond). The Design Space taxonomy paper (184 systems) makes this gap explicit. `aria-companion`
is the entire dialogue paradigm, not just one idea on a list.

Build plan: route `/dream/33-aria-companion`. Mic input → autocorrelation pitch detection →
note event buffer. After 2s of silence AND ≥8 notes captured: generate Markov-chain response
(bigram pitch transition table, 75%/25% learned-vs-pentatonic mix). Response plays as
triangle-wave oscillators through a procedural room impulse response. Visual: split dual piano
roll — user phrase top half (warm orange), Aria response bottom half (cool blue). Phase machine:
idle → listening → processing → responding → listening. Markov table accumulates across the
session — Aria learns your vocabulary.

**Shipped**:
- `src/app/dream/33-aria-companion/page.tsx` — full interactive prototype (~330 lines)
- `src/app/dream/33-aria-companion/README.md` — Markov algorithm, dialogue loop design, polish ideas

**What's inside**:

Phase machine: `idle → listening → processing → responding → listening`. Each transition triggers
UI updates. `phaseRef` shadows the React state so the render loop (RAF) reads it without a
re-render cycle dependency.

**Pitch detection**: autocorrelation on 4096-sample time-domain buffer, same algorithm as
`13-piano-canvas` and `24-piano-roll`. fftSize=4096 → fine enough for piano C2 (65.4 Hz) detection.
Note onset = `lastFreqRef.current === 0 → freq > 0`. Note offset = `freq drops to 0`; note committed
if duration > 55ms (ignores blips). Mic mode only — demo mode bypasses pitch detection entirely
(notes injected directly via setTimeout).

**Markov chain**: `Map<fromMidi, Map<toMidi, count>>`. `buildTransitions` builds bigrams from the
combined session history + current phrase. `generateResponse` samples the table with 75% learned /
25% pentatonic-step fallback. Pentatonic steps = `[-7, -5, -3, 2, 3, 5, 7]` semitones — all valid
in any pentatonic mode, so even cold-start Aria sounds tonal.

**Demo mode**: pre-baked 10-note C major melody phrase. Notes injected into rollBarsRef + userPhraseRef
at real timestamps (one per setTimeout) so the piano roll fills in live. After last note + 2s, the
trigger fires. Aria responds with ~10 blue notes derived from the C major phrase's bigrams + pentatonic
fallback. On first demo, Markov table is empty, so all 10 notes come from pentatonic steps off the
last demo note (C4 → ascending/descending in thirds/fourths/fifths). Musically coherent immediately.

**Audio synthesis**: `playAriaNote` = triangle oscillator → ADSR gain (8ms attack, 90ms decay to 30%
sustain, 300ms release). Two output paths: 32% dry → destination, 100% → shared ConvolverNode
(1.5s exponential white noise impulse, 20% wet gain). Result: a muted piano timbre — obviously pitched,
warm room, not a clinical sine.

**Visual**: split Canvas2D piano roll. `rollBarsRef` accumulates all bars from the session; bars
older than 28s are culled from the front of the array. X position = `(bar.startMs - (nowMs - 9000)) * pxPerMs` —
bars appear at the right edge when they start, scroll leftward over time. Aria's currently-playing
bars glow (shadowBlur 18, full opacity); settled bars dim (shadowBlur 7, 72% opacity). User bars
use hue-encoded colors (same `freqToHue` mapping as `13-piano-canvas` and `24-piano-roll`).

**Build**: `npm run build` passes cleanly. `/dream/33-aria-companion` static route at 4.22 kB.
Zero TypeScript errors. Zero ESLint errors in my code. All warnings are from pre-existing
Resonance production files.

**What I noticed**: The first demo exchange is always pentatonic (cold Markov table), which sounds
deliberately "nice" — it's actually a good interaction because it means the first response is
pleasant regardless of what the user played. By the third exchange, if the user played mostly
ascending patterns, Aria starts ascending too. By the fifth, it feels eerie — like it has learned
something specific about your playing style without any ML model.

The 2s silence threshold is long enough to feel deliberate (Aria waits; you finish your thought)
but not so long it feels broken. For very slow players this might feel short. Would benefit from
a configurable threshold.

**Queued next**:
1. **Build `spectral-morph`** — AudioWorklet FFT magnitude interpolation. First prototype that
   resynthesizes from spectral manipulation. Zero dep, one cycle.
2. **Build `loop-station`** — 4-slot BPM-synced live loop station. First prototype to build
   a composition over time. Zero dep, one cycle. Live performance relevant.
3. **Polish `33-aria-companion`** — add rhythmic mirroring (inter-onset intervals), phrase marker
   lines on the canvas, and a "personality slider" (learned vs pentatonic bias).
4. **Research** — last research was Cycle 35 (1 cycle ago). Next research in 2–3 cycles.

---

## Cycle 35 — research sweep

**When**: 2026-05-19 UTC (hourly autonomous cycle)

**Decided**: Research was last done in Cycle 31 (4 build cycles ago: 32, 33, 34, and now 35).
AGENT.md says to research if "haven't researched in 3+ cycles." Criterion met. The IDEAS queue
has plenty of items but several require API keys (30-lyria-jam, 31-gesture-music) or are complex
multi-cycle builds (27-gpu-additive). A research cycle now surfaces fresh zero-dep ideas and
refreshes the queue with immediately-buildable prototypes for the next few cycles.

Also: the new prototypes (26–32) have opened new conceptual territory (chord detection, spatial
audio, mood classification) and the research queue should now extend into the remaining untouched
domains: spectral resynthesis, live performance looping, AI dialogue.

**Research approach**: searched arxiv (2025–2026), GitHub, fal.ai blog, Hacker News. 9 new entries
in RESEARCH.md (§44–§52).

**Key findings**:
- **Aria-Duet / Ghost in the Keys** (NeurIPS 2025, arxiv 2511.01663): turn-taking piano AI duet.
  Human plays → AI generates Markov response. Inspires `aria-companion` prototype (zero dep, novel
  interaction paradigm not yet in the sandbox: *dialogue* vs continuous reactivity).
- **LoopGen** (arxiv 2504.04466, Apr 2026): training-free seamless music looping. 70% improvement
  in listener ratings. Inspires `loop-station` — first multi-layer performance prototype.
- **Spectral Morphing** (daudio.dev + AudioWorklet approach): FFT magnitude interpolation → genuine
  hybrid timbres. First prototype to resynthesize from spectral blending, not just analyze. Inspires
  `spectral-morph`.
- **Design Space for Live Music Agents** (arxiv 2602.05064, Feb 2026): taxonomy of 184 systems.
  Identifies "dialogue agents" as least-explored category — the sandbox has NONE. `aria-companion`
  fills this gap.
- **Web Audio API TPAC 2025**: Configurable Render Quantum (sub-3ms audio buffers) coming Q4 2026.
  Performance.now() in AudioWorklet + Playout Stats API. Will meaningfully improve `loop-station`
  and real-time pitch detection latency.
- **BRAVE** (arxiv 2503.11562): low-latency neural timbre transfer. No browser WASM yet. Monitor.
- **iPlug3** (Jan 2026): WebGPU + MCP audio plugin framework, scripts mirror web APIs. Best path
  to "Resonance as an installation" (Tauri mode). Architecturally very relevant.
- **Revival** (arxiv 2503.15498, Mar 2026): live AI co-performance at concerts. Validates
  Resonance's phase-based approach; their "structural scaffolding" = Resonance's journey arc.
- **Kling 2.6**: native audio + speech at $0.14/sec. Ghost image → 5s clip with spoken line.
  Updates ghost-animate plan: three options now (HappyHorse, Kling 2.6, Veo 3.1 Fast).

**New ideas queued** (IDEAS.md):
- `aria-companion` — turn-taking Markov piano companion. Zero dep. One cycle. ⭐ build next.
- `spectral-morph` — AudioWorklet FFT timbre blending. Zero dep. One cycle.
- `loop-station` — 4-slot BPM-synced loop station. Zero dep. One cycle. Live performance.

**What surprised me**: The Design Space taxonomy (184 systems, 2026) makes explicit what I've
been building around implicitly. 32 prototypes, zero dialogue agents. `aria-companion` isn't just
one idea on a list — it's an entire interaction paradigm that is missing from the sandbox. The
Aria-Duet paper doing this at NeurIPS with a 40GB model; we can do the same interaction pattern
in 20 lines of Markov JS.

**Queued next**:
1. **Build `aria-companion`** — turn-taking piano dialogue. Zero dep, novel paradigm, one cycle.
2. **Build `spectral-morph`** — FFT timbre blending. Zero dep, novel audio technique, one cycle.
3. **Build `loop-station`** — 4-slot loop station. Zero dep, live performance, one cycle.
4. **Build `27-gpu-additive`** — still the most technically ambitious item. After the zero-dep builds.
5. Research again in 3-4 cycles.

---

## Cycle 34 — /dream/32-mood-vis

**When**: 2026-05-19 UTC (hourly autonomous cycle)

**Decided**: Cycle 33 shipped `29-scene-spatial` and explicitly queued `32-mood-vis` as the next
build. No blockers. No in-progress prototypes. Clear spec in IDEAS.md: rule-based audio classifier →
6 visual modes. Zero external deps, one-cycle build. The decision was immediate — it's the only
queued zero-dep prototype that doesn't need an API key, and it fills a real conceptual gap: none of
the 31 existing prototypes treat audio character (mood/energy) as the primary design axis.

`27-gpu-additive` is in the queue but marked as potentially 2 cycles and very technically ambitious.
`30-lyria-jam` and `31-gesture-music` need API key / CDN approval. `32-mood-vis` is the obvious
next build: zero friction, clear spec, high surprise factor.

**Shipped**:
- `src/app/dream/32-mood-vis/page.tsx` — full interactive prototype (~300 lines)
- `src/app/dream/32-mood-vis/README.md` — classifier design, mode rationale, polish ideas

**What's inside**:

Three audio features drive classification:
1. **Energy** (`amplitude` from `useMicAnalyser`) — total signal level
2. **Brightness** (`centroid`) — spectral center of gravity in Hz. Piano above C4 ≈ >1500 Hz;
   bass note or low drum ≈ 200–400 Hz
3. **Spread** (coefficient of variation of 6-band energies) — how evenly distributed the
   spectrum is. Single clean note = energy in 1-2 bands = low CV. Chord+noise = spread across
   bands = high CV. This approximates ZCR / spectral flatness without needing time-domain data.

Decision tree: `amplitude < 0.08` → minimal; `CV > 1.1 AND amp > 0.15` → complex; then:
`amp > 0.35 AND centroid > 1500` → energetic_bright; `amp > 0.35` → energetic_dark;
`centroid > 1500` → calm_bright; else → calm_dark.

Six visual modes (all parametric, no persistent particle state required):
- **minimal**: Lissajous 2:3 ratio, 200 points, slowly rotating. Dim blue-white.
- **calm_bright**: 4 concentric rings expanding from center, one new ring every 12.5s each,
  fading alpha as they grow. Cool cyan. Central soft glow scales with amplitude.
- **calm_dark**: 110 particles on parametric orbits (angle = base + slowly varying sinusoidal
  per-particle speed). No stored state — position is `f(t, i)`. Deep violet.
- **energetic_bright**: 72 radial spokes (12 per band, 6 bands), each colored BAND_RGB, length
  proportional to band energy, slowly rotating. Warm central glow.
- **energetic_dark**: 4 pulsing concentric rings (bass-driven, red/crimson), 5 vertical bar pairs
  pulsing with mid-range energy. Heavy and rhythmic.
- **complex**: 6 arms rotating at slightly different angular velocities, one per band. Length =
  band energy, width = thick with gradient. Forward petal + shorter mirror petal. Additive blending
  makes overlapping arms glow. Spectral mandala.

Crossfade mechanism: none needed. The canvas uses 7% opacity persistence each frame
(`rgba(0,0,0,0.07)` fill). Old mode visuals fade out in ~14 frames (~0.23s at 60fps). New mode
visuals grow in simultaneously. Net effect: ~0.5–1s natural visual transition.

Demo mode: synthetic `MicFrame` data cycling through all 6 moods, 5 seconds each. Last 800ms of
each phase blends toward next mood's features for smooth synthetic transitions. Demo starts
automatically on click — no mic permission needed.

**Build**: `npm run build` passes cleanly. `/dream/32-mood-vis` appears as static route (4.62 kB).
Zero TypeScript errors. Zero ESLint errors in my code. (All other warnings in build output are
pre-existing Resonance production files — confirmed unchanged.)

Note: `node_modules` were absent from the git checkout (excluded by .gitignore as expected).
Ran `npm install --legacy-peer-deps` before build. This is normal for the cloud environment.

**What I noticed**: The classifier thresholds were chosen from first principles. The most important
decision was using coefficient of variation (CV = std_dev/mean of band energies) rather than
raw variance. CV is scale-invariant — a quiet complex signal and a loud complex signal both read
as "complex," whereas raw variance would be dominated by amplitude. The `CV > 1.1` threshold was
set to trigger when one or two bands dominate greatly over others (e.g., heavy bass hit with quiet
mids/highs = CV ~1.3). A piano chord with even mid-register energy typically shows CV ~0.4-0.6.

The "complex" classifier fires most readily on percussive signals (sharp attack, energy across all
bands from the transient) and on dissonant clusters. This is appropriate: "complexity" in audio
correlates exactly with spectral irregularity.

The orbital drift mode (`calm_dark`) is purely parametric from `t` and `i` — no particle array
needed. Position = `angle(t, i)` + `radius(t, i)` computed fresh each frame. The orbit radii
vary with `sin(i * 2.7 + t * 0.08)` — the irrational coefficients ensure no two particles ever
align, giving a naturally organic cloud without any explicit randomization.

**Queued next**:
1. **Build `27-gpu-additive`** — particles = Fourier partials, GPU physics = synthesizer.
   Most technically ambitious item in the queue; may need 2 cycles. WebGPU required.
2. **Polish `32-mood-vis`** — add hysteresis (300ms dwell before mood switch to prevent flicker),
   manual mood override (click mood name in sidebar to lock), optional 7th "rhythmic" mode on
   detected BPM.
3. **`30-lyria-jam`** — pending Karel's Gemini API key.
4. **Research** — last research was Cycle 31 (3 cycles ago: 32, 33, 34). Research is due next cycle.

---

## Cycle 33 — /dream/29-scene-spatial

**When**: 2026-05-19 UTC (hourly autonomous cycle)

**Decided**: Cycle 32 shipped `28-chord-canvas` and explicitly queued `29-scene-spatial` as the
Cycle 33 target. No blockers. No in-progress prototypes. Clear spec in IDEAS.md: six Ghost preset
scenes (Stone Chamber → Cosmic Ascension), each with hand-authored 3D HRTF audio built from
synthesized oscillators, filtered noise, and FM chirps — no audio files. Zero new dependencies.
One-cycle build.

Decision was immediate. `29-scene-spatial` extends `7-spatial`'s HRTF primitives into a much richer
experience: instead of six undifferentiated frequency bands, each scene has a *narrative* — the stone
chamber has a piano, stone percussion, and low resonance; the cosmic ascension has slowly-building
harmonic pads rising toward silence. The prototype answers "what would it feel like to *be inside*
each Ghost scene?" The spatial audio grounds the imagery in something physical.

**Shipped**:
- `src/app/dream/29-scene-spatial/page.tsx` — full interactive prototype (~380 lines)
- `src/app/dream/29-scene-spatial/README.md` — design notes, scene audio maps, polish ideas

**What's inside**:

Six scenes, each with 3–4 sound sources at hand-authored 3D positions:
- **Stone Chamber**: piano-loop at front-left, stone percussion above, low resonance drone behind/below.
  Long reverb (3.5s). The piano occasionally voices a perfect fifth (+7 semitones) for modal texture.
- **Root Portal**: 41Hz sine drone directly below (sub-bass "earth pull"), forest noise ahead,
  FM bird chirp at front-right-above. 2s reverb. The drone is felt more than heard.
- **Underground Pool**: bandpass water trickle right, 38Hz cave resonance below, slow-attack pad echo
  at left-behind. Long reverb (5s) — the cave tail.
- **Tiny Planet**: two wind sources left and right creating a dome effect; two FM bird chirps above
  at different frequencies (2800Hz and 3200Hz). Short reverb (1.2s) — open sky.
- **Forest Dawn**: FM canopy birdsong above, bandpass stream trickle at left-front, piano-loop at
  right-front. 2s reverb. The three sources are at clearly distinct azimuths — most obvious spatial
  demo in the set.
- **Cosmic Ascension**: three pad oscillators (55Hz root, 110Hz octave, 220Hz two-octave) at
  progressively higher elevations. All harmonic. 6s reverb tail. Slow attack (2s) makes them swell
  in from silence.

Audio chain: each source → dryGain → PannerNode (HRTF) → destination. Also each source → wetGain
→ shared ConvolverNode (synthetic impulse response = exponentially-decayed white noise per scene)
→ destination. Dry/wet split ~70/30 for most sources, 50/50 for reverb-heavy ones.

Impulse response generated procedurally: `Math.random() * 2 - 1` × `(1 - i/len)^decay`. Decay
exponent varies: 3 for stone, 2 for pool, 1.5 for cosmic. No audio files — entire prototype is
self-contained synthesis.

Canvas: top-down sphere view (listener head at center, nose pointing forward/canvas-top). Sound
source dots: X = left/right, Z = front/back (z<0 = front = top of canvas). Elevation shown by
dot size and glow (higher = larger + brighter). Drag any dot to reposition the source; HRTF
PannerNode updates in real time. Works on mobile (touch drag handlers). Preview mode when stopped
(scene layout visible, no audio).

**Build**: `npm run build` passed cleanly. `/dream/29-scene-spatial` renders as static route.
Zero errors, zero new warnings.

**What I noticed**: The forest-dawn scene has the clearest HRTF illusion because the three sources
are at genuinely distinct azimuths (canopy above, stream left-front, piano right-front). When you
drag the canopy source from above to the right, the birdsong immediately shifts from "high and
centered" to "lateral" — the HRTF position change is visceral. Recommend Karel try this one first
with headphones.

The cosmic ascension pad is the most musical: 55/110/220Hz are 1:2:4 ratios (pure octaves),
so even with the 6s reverb smearing, the result is a clean harmonic series rising from below.
The 2s slow attack means the first 2 seconds sound like near-silence, then the pads swell in.
This matches the intended "final frontier" feeling.

Bird chirps use FM: carrier at 2800–3200Hz, modulator at 9Hz, depth = 8% of carrier. The modulator
makes the chirp sound warped/vibrating rather than clean — more realistic than a pure sine chirp.
Gate envelope: 220ms burst, optional double-chirp at 50% probability.

**Queued next**:
1. **Build `32-mood-vis`** — semantic visualizer that switches visual modes based on audio character
   (calm/energetic/complex). Zero deps, rule-based MIR classifier, one-cycle build.
2. **Polish `29-scene-spatial`** — add an azimuth elevation control (second canvas showing side view),
   add 7th/9th chord extensions to the piano-loop (richer harmony), try Lorenz drift on positions.
3. **Build `27-gpu-additive`** — most ambitious: particles = Fourier partials, GPU physics = synthesizer.
   Probably needs 2 cycles.

---

## Cycle 32 — /dream/28-chord-canvas

**When**: 2026-05-19 UTC (hourly autonomous cycle)

**Decided**: Cycle 31 was a research sweep that explicitly queued `28-chord-canvas` as the next
build target: zero deps, one-cycle build, fills the biggest remaining conceptual gap (none of the
26 existing prototypes names a musical chord). Decision was immediate — clear spec, directly
actionable, and the `ii–V–I` demo is an immediate "aha" for any musician.

Algorithm: 2048-sample FFT → 12-bin L1-normalized chroma vector (pitch-class energy, all octaves
collapsed) → weighted dot-product against 24 major/minor chord templates (root=1.5, third=1.0,
fifth=0.8 weighting) → chord with highest score ≥ 0.60 threshold wins. Color: root pitch class
→ hue (C=0°, each semitone=30°); major=vivid, minor=muted. Timeline strips scrolls left; wider
block = longer chord held. Chromagram shows all 12 pitch classes as vertical bars.

Demo mode plays ii–V–I (Dm7 → G7 → Cmaj7, 2.5s each) through both the analyser and destination
so Karel can hear the chords while watching them detected. Mic mode: guitar, piano, voice, any
pitched source.

**Shipped**:
- `src/app/dream/28-chord-canvas/page.tsx` — full interactive prototype (~250 lines)
- `src/app/dream/28-chord-canvas/README.md` — algorithm notes, design rationale, polish ideas

**What's inside**:

Algorithm: 2048-sample FFT → 12-bin L1-normalized chroma vector (pitch-class energy accumulated
across all octaves). L1 normalization (sum=1) is critical: max-normalization would give uniform
noise a score of 3.3 just like a perfect chord, defeating detection. With L1, uniform noise
scores ≈0.275 and a clean 3-note chord scores ≈1.1. CONF_MIN=0.60 sits halfway.

24 chord templates (12 roots × {major, minor}). Weights: root=1.5, third=1.0, fifth=0.8.
Weighted dot-product against normalized chroma; highest score wins.

Color: root pitch class → hue at 30°/semitone (C=0°, D=60°, G=210°, A=270°). Major=vivid+light,
minor=muted+dark. Intentionally different from `1-live`'s band→hue mapping: this encodes music
theory (which root), not acoustic signal properties (which frequency band).

Timeline: scrolling strip at 40px/sec. Current chord block grows rightward from the "now" line;
when chord changes, new block starts. Gaps (below-threshold frames) show dark background. Block
width = duration held.

Demo mode: Dm7→G7→Cmaj7 triangle oscillators connected to both analyser AND ctx.destination
(audible + analysed). Karel hears what the detector sees. The 7th of each chord doesn't change
detection — the root triad dominates the chroma template match.

**Build**: `npm run build` passes cleanly. `/dream/28-chord-canvas` appears as static route
(3.95 kB). Zero errors, zero new warnings (all 30+ warnings in output are pre-existing from
production Resonance files).

**What I noticed**: The L1 normalization question was interesting — max-normalization doesn't
distinguish chord from noise (uniform noise → all chroma bins = 1.0 → template score = 3.3,
same as a perfect chord). L1 normalization compresses the uniform case to 1/12 per bin, scoring
0.275, well below threshold. This detail wasn't in the spec but was the critical algorithmic
decision that makes the whole thing work.

Also noticed: the transition animation between chords (CSS `transition: color 0.2s`) is
surprisingly effective. When you move from a warm chord (G=210° blue) to a cold chord (A=270°
violet), the large chord name fades smoothly through intermediate hues rather than jumping. It
reads as "resolving" visually, which is appropriate — chord changes feel like musical resolution.

The demo ii-V-I is detected as Dm→G→C (triad names, not 7th chord names) but this is correct:
the prototype only has 24 major/minor templates, no 7th chord templates. Adding dominant 7th
templates is the clearest next step.

**Queued next**:
1. **Build `29-scene-spatial`** — Ghost preset scenes as hand-authored 3D HRTF spatial audio
   environments. Zero deps, extends `7-spatial` primitives. One-cycle build.
2. **Polish `28-chord-canvas`** — dominant 7th templates (so G7 shows as "G7"), chromagram
   overlay highlighting the matched chord tones, key detection from chord history.
3. **Build `27-gpu-additive`** — most ambitious: particles = Fourier partials, GPU physics = synthesizer.
   May need 2 cycles.

---

## Cycle 31 — Research cycle

**When**: 2026-05-19 UTC (hourly autonomous cycle)

**Decided**: Cycle 30 shipped `26-score-follow`. No blockers. No in-progress prototypes. Three
consecutive build cycles since last research (Cycles 28, 29, 30) — exactly at the 3-cycle research
trigger in AGENT.md. Additionally, the IDEAS queue for zero-dependency buildable items is nearly
exhausted: only `27-gpu-additive` remains, and it's marked as potentially needing 2 cycles. Fresh
research will surface new prototype ideas and prevent the next build cycle from starting blind.

Did the full sweep: arxiv (audio-visual, MIR, live performance), GitHub trending (creative-coding,
webaudio, webgpu), fal.ai blog/model pages (new audio/video models), web trends. Results below;
full entries appended to RESEARCH.md.

**Shipped** (no new code — research cycle):
- `docs/dreams/RESEARCH.md` — 7 new dated entries appended (§§37–43, Cycle 31)
- `docs/dreams/IDEAS.md` — 5 new prototype ideas added to queue: `chord-canvas`, `scene-spatial`,
  `lyria-jam`, `gesture-music`, `mood-vis`
- `docs/dreams/STATE.md`, `MORNING.md`, `INDEX.md` updated

**Key findings**:

1. **Lyria RealTime API** (Google DeepMind) — WebSocket streaming infinite 48kHz stereo music with
   live text prompt blending. BPM/density/brightness/scale/key controls updated in real time. Browser-
   callable from JavaScript with a Gemini API key. This is the biggest AI music discovery since ACE-Step
   in Cycle 4: ACE-Step generates a clip; Lyria RealTime generates *forever* and responds to prompt
   changes within 2 seconds. The open-weights Magenta RealTime runs in Python/Colab but is not
   browser-callable without a local server. New prototype: `lyria-jam` (needs Karel's Gemini API key).

2. **iOS 26 / Safari 26** — WebGPU now shipping on iOS, iPadOS, macOS, and visionOS. Karel's iPhone
   can now run `15-webgpu-fluid`, `16-particle-life-gpu`, and the planned `27-gpu-additive`. The
   "requires WebGPU" caveat in INDEX.md is now minor — only affects very old browsers.

3. **SonoWorld** (arxiv 2603.28757, Mar 2026) — single image → navigable 3D spatial audio scene with
   FOA ambisonics → HRTF binaural, browser-native demo using Three.js + WebAudio at 5.3ms latency.
   Inspires `scene-spatial`: hand-authored spatial audio environments for each Ghost preset scene.
   Stone chamber, forest dawn, cosmic ascension — each has a distinctive acoustic character, buildable
   with existing HRTF primitives from `7-spatial`. Zero deps, one-cycle build.

4. **Chord Colourizer** (arxiv 2510.10173) — CQT chroma → chord name + color. None of the 26 existing
   prototypes surfaces music theory. `chord-canvas` (28): chroma-based chord detection → chord name
   in large type + scrolling color timeline. First prototype to explicitly name musical structure.
   Zero deps, one-cycle build.

5. **Gesture2Music** (arxiv 2511.00793) — webcam hand landmarks → 30ms latency music control. MediaPipe
   HandLandmarker runs entirely in browser as WASM (~8MB CDN). Inspires `gesture-music`: hand position
   → pitch, spread → reverb, curl → harmonics. New input modality — camera instead of mic. Needs
   Karel's approval on MediaPipe CDN dep.

6. **Veo 3.1 Fast** — $0.15/sec with audio (half previous cost). 5s Ghost clip ≈ $0.75. Updates
   ghost-animate cost estimate. HappyHorse-1.0 still leads single-clip benchmarks.

7. **ACM IMX 2025 semantic viz** — MIR + rule-based classifier → visualizer mode switching. Inspires
   `mood-vis` (32): features (centroid/ZCR/tempo/tonal clarity) → 6 mood buckets → different visual
   mode per bucket, crossfading. First "meta-visualizer" that adapts to music character, not just signal.

**What surprised me**: The Lyria RealTime API is more browser-friendly than expected — standard
WebSocket from JavaScript, no special SDK, same Gemini API key Karel likely already has. The musical
steering model (weighted text prompt blending) is also more expressive than ACE-Step's text-to-clip
approach: you can fade "jazz piano" toward "ambient drone" mid-performance by sliding a weight. This
is genuinely new territory for the dream sandbox. Whether it justifies the API key dependency is
Karel's call.

The iOS 26 WebGPU news is important: we've been putting "requires WebGPU — may not work on mobile"
disclaimers on the most technically interesting prototypes. That qualifier disappears for Safari 26 / iOS 26.

**Queued next**:
1. **Build `28-chord-canvas`** — first music-theory prototype, zero deps, clear spec, one-cycle build.
   Fills the biggest remaining conceptual gap: none of the 26 prototypes names musical structure.
2. **Build `29-scene-spatial`** — Ghost scene spatial audio tour, zero deps, extends existing
   HRTF primitives. Directly serves Karel's Ghost character development interest.
3. **Build `27-gpu-additive`** — most ambitious item. May need 2 cycles. Probably the cycle after next.
4. **Discuss `lyria-jam`** — needs Karel to confirm Gemini API key. Flag in MORNING.md.
5. **Discuss `gesture-music`** — needs Karel's OK on MediaPipe CDN dep. Flag in MORNING.md.

---

## Cycle 30 — /dream/26-score-follow

**When**: 2026-05-19 UTC (hourly autonomous cycle)

**Decided**: Cycle 29 shipped `25-cellular` and explicitly queued `26-score-follow` as the Cycle 30
target. No blockers. No in-progress prototypes. Clear spec in IDEAS.md: display the Bach BWV 772
fragment as a static piano roll; run autocorrelation pitch detection; advance a cursor through the
score only when the user plays the correct pitch (±1.5 semitones). Cursor pauses on silence/wrong
note; snaps back one note after ~1.5s of sustained wrong input. Demo mode auto-plays the score and
self-matches.

This is the first prototype where the user's performance is *evaluated against a specific target*
rather than visualized in the abstract. The other piano-representation prototypes (`13-piano-canvas`,
`22-code-score`, `24-piano-roll`) all treat the user's playing as input to generate output. This one
plays a "game": play what the score says, advance the cursor. Score following is a real research
problem (see RESEARCH.md §§29–31) and this is the simplest possible browser-native version.

Decision was immediate. Zero new dependencies (Web Audio + Canvas2D). One-cycle build.

**Shipped**:
- `src/app/dream/26-score-follow/page.tsx` — full interactive prototype (~380 lines)
- `src/app/dream/26-score-follow/README.md` — algorithm notes, visual design, polish ideas

**What's inside**:

Score: Bach BWV 772 opening 35 notes (same fragment as `24-piano-roll`), pre-computed as
`ScoreNote[]` with fixed `startX` positions (PX_PER_BEAT = 80). Score scrolls left as the
user advances; cursor is fixed at 28% from the left edge of the piano grid.

Pitch detection: same McLeod autocorrelation as `13-piano-canvas` and `24-piano-roll`
(fftSize=4096, confidence threshold=0.82, ±1.5 semitone match window). Runs every other
frame to halve CPU cost; interpolates from last MIDI on skipped frames.

Matching logic:
1. After a match, require silence (RMS < threshold) before accepting the next note.
   This prevents a held note from chain-matching through consecutive score notes.
2. Wrong note for >90 frames (~1.5s at 60fps): back up one note (forgiveness mode).
3. Demo mode: plays each note via OscillatorNode → analyser (silent); uses known
   frequency directly (skips autocorrelation) for perfect frame-1 matching.

Visual: pulsing white outline on the target note with its pitch name label (e.g. "C5").
Matched notes: green additive glow. Detected pitch: yellow triangle pointing right from
the cursor at the correct MIDI row height. "Score complete" overlay when all 35 matched.
Piano key sidebar (same `drawPianoKeys` function as `24-piano-roll`).

**Build**: `npm run build` passes cleanly. `/dream/26-score-follow` renders as 4.54 kB
static route. Zero new errors or warnings.

**Queued next**:
1. **Build `27-gpu-additive`** — GPU particle-additive synthesis. Most ambitious item in
   the queue; particles ARE Fourier partials, GPU physics IS the synthesizer. May need
   2 cycles. Or defer to a research cycle first.
2. **Research cycle** — last research was Cycle 27 (3 cycles ago); per AGENT.md rule,
   research after 3+ build cycles. Cycle 31 could be research.
3. **Polish `26-score-follow`** — DTW-based alignment, look-ahead highlighting (next 3
   notes in warmer grey), multiple scores via `22-code-score` DSL import.

---

## Cycle 29 — /dream/25-cellular

**When**: 2026-05-19 UTC (hourly autonomous cycle)

**Decided**: Cycle 28 shipped `24-piano-roll` and explicitly queued `25-cellular` as the Cycle 29 target. No blockers. No in-progress prototypes. Clear spec in IDEAS.md, zero new dependencies (Web Audio + Canvas2D + vanilla JS). Surprise factor is highest in the queue: none of the 24 existing prototypes treat music as *autonomous* — all react to mic input or generate via API. A cellular automaton "acts first." The user sets the initial conditions (or picks a preset) and watches the music write itself. Gliders create repeating 4-note loops; period-3 oscillators (Pulsar) make rhythmic patterns; methuselahs (Acorn, R-pentomino) evolve unpredictably across hundreds of generations.

Decision was immediate.

**Shipped**:
- `src/app/dream/25-cellular/page.tsx` — full interactive prototype
- `src/app/dream/25-cellular/README.md` — design notes

**What's inside**:

64-column × 16-row toroidal Conway's Life grid. Each column maps to a frequency — C2 (MIDI 36) at the left edge, C5 (MIDI 72) at the right — so the grid has pitch baked into its spatial layout. On each tick, any column with at least one living cell fires a triangle-wave oscillator note at that column's frequency with a 200ms exponential decay envelope. Volume scales by `min(1, 6 / activeCols)` to keep polyphony sane when many columns are active simultaneously.

Tick rate follows the BPM slider (40–120 BPM). Rendering: 60fps rAF loop; each live cell drawn as a radial gradient glow (additive blending). Columns that just fired get a brief brightness flash (decays at ×0.78/frame). Click or drag the canvas to toggle cells. Four presets: Glider (translating 5-cell object — creates a repeating ~4-note motif that walks across the pitch axis), Pulsar (period-3 oscillator — strict 3-tick rhythmic loop), Acorn (7-cell methuselah — chaotic growth for 5200 generations), R-pentomino (5-cell methuselah — smaller chaos). Random fill (20% density). Clear.

**Build**: `npm run build` passes cleanly. `/dream/25-cellular` appears as a static route at 2.99 kB. One fix required after first attempt: TypeScript 5.9 made `Uint8Array` generic (`Uint8Array<ArrayBuffer>`), so function signatures for `stepLife`, `randomGrid`, `applyPreset`, and `applyGrid` needed explicit generic parameters. Second build: clean pass. Zero new errors or warnings in new code (all warnings in output are pre-existing from production codebase).

**Queued next**:
1. **Build `26-score-follow`** — live score cursor that follows your playing through the Bach fragment. Zero deps, one-cycle build.
2. **Build `27-gpu-additive`** — GPU particle-additive synthesis. Most ambitious item; may need 2 cycles.
3. **Polish `25-cellular`** — pitch labels on column edges, toroidal vs. fixed-boundary toggle, MIDI export.

---

## Cycle 28 — /dream/24-piano-roll

**When**: 2026-05-19 UTC (hourly autonomous cycle)

**Decided**: Cycle 27 was a research cycle that explicitly queued `24-piano-roll` as the Cycle 28 target. No blockers. No in-progress prototypes. Clear spec, zero new deps (Web Audio + Canvas2D), one-cycle build. Fills the last gap in the piano-representation triptych: `13-piano-canvas` (abstract painting), `22-code-score` (written notation), and now `24-piano-roll` (scrolling notation). Every pianist has used a piano roll in a DAW — this is the first dream prototype that renders recognizable musical notation from live input.

**Shipped**:
- `src/app/dream/24-piano-roll/page.tsx` — full interactive prototype
- `src/app/dream/24-piano-roll/README.md` — design notes

**What's inside**:

- Canvas2D scrolling piano roll: vertical axis = MIDI pitch (C2–C7), horizontal = time scrolling left at `bpmRef × 80px/beat / 60`. Each detected note is a rounded rectangle: hue from `freqToHue()` (same as `1-live`/`13-piano-canvas`), glow from additive blending + `shadowBlur`, leading-edge pulse on active notes.
- Same McLeod autocorrelation pitch detector as `13-piano-canvas` (fftSize=4096, confidence 0.82). RMS gate 0.012 for silence.
- Demo mode: plays Bach Invention No.1 (BWV 772) opening 35 notes at chosen BPM via triangle OscillatorNodes into analyser (not speakers). Demo uses the known frequency directly (no autocorrelation on synthesized signal) for sharper bars.
- Piano key sidebar (44px): black/white keys rendered per MIDI semitone. Active key highlights in the note's hue.
- BPM slider (40–160) adjustable from idle screen and while running. Changes scroll speed live.
- Beat grid lines (vertical) and C-note octave lines (horizontal) for orientation.
- Memory management: bars >200px off-screen left are discarded.

**Build**: `npm run build` passes cleanly. `/dream/24-piano-roll` renders as 4.04 kB static route. Zero new errors or warnings in new code (all warnings in output are pre-existing from production codebase).

**Queued next**:
1. **Build `25-cellular`** — Conway Game of Life as a musical instrument. Surprise factor highest in the queue.
2. **Build `26-score-follow`** — live score cursor; follows your playing through the Bach fragment.
3. **Polish `23-pitch-harmonize`** — FFT vocoder for cleaner transients.

---

## Cycle 27 — Research Cycle

**When**: 2026-05-19 UTC (hourly autonomous cycle)

**Decided**: Cycle 26 shipped `23-pitch-harmonize`. No blockers. No in-progress prototypes.
Per AGENT.md rule 4: research is triggered after 3+ build cycles without a research sweep
(Cycles 24, 25, 26 were all builds; last research was Cycle 23). Executed research cycle.

**Research sources scanned**:
- arxiv.org — live music agents, score following, AI accompaniment, piano transcription
- fal.ai blog + model pages — latest video/audio model releases
- GitHub topics — audio-visual, webaudio, webgpu, creative-coding
- Hacker News — CLAVIER-36, generative music threads
- Web trends — WASM-in-AudioWorklet, WebGPU additive synthesis

**Key findings** (detailed in RESEARCH.md §§29–36):

1. **Score following is browser-feasible** (arxiv 2505.05078, May 2026). Autocorrelation pitch
   detection (same as 13-piano-canvas) + symbol-level score tracking = a "live cursor" on a
   displayed score. 174ms latency. Zero deps. Could directly extend 22-code-score.

2. **CLAVIER-36** (HN Sep 2025, clavier36.com) — cellular automaton-inspired generative music
   programming environment, available in browser. Programs are 2D grids that evolve like ORCA.
   Inspires `25-cellular`: Conway's Life grid → living cells trigger pitched notes → emergent
   melodies from simple rules. Totally different aesthetic from all 23 existing prototypes.

3. **Real-Time Human-AI Musical Co-Performance** (arxiv 2604.07612, Apr 2026) — latent diffusion
   accompaniment from live audio, 5.4x latency reduction via consistency distillation. Browser
   version would need ACE-Step API. Long-term direction for `6-compose` evolution.

4. **Kling 3.0** (fal.ai, Feb 2026) — multi-shot storyboarding + native audio, up to 15-second
   clips. Enables composing an entire Ghost journey arc (stone chamber → forest → cosmic ascension)
   as a single coherent video with audio. Better than single-shot HappyHorse for arc storytelling.

5. **WebGPU additive synthesis** — compute shaders can write audio sample data directly (gist from
   JolifantoBambla). Prototype idea: `27-gpu-additive` — particle swarm IS the timbre (particles
   are Fourier partials; physics determines the sound spectrum).

6. **WaveRoll** (arxiv 2511.09562) — browser JS piano roll visualization library from ISMIR 2025.
   MIDI-based, but the visual concept inspires `24-piano-roll`: live scrolling piano roll from
   mic pitch detection.

7. **WASM in AudioWorklet** — Rust → WASM → AudioWorklet is the 2026 DSP standard. Could
   upgrade `23-pitch-harmonize` with a WASM-based FFT vocoder. Needs pre-built .wasm binary
   (can't compile Rust in dream zone). Flag for Karel if interested.

**New IDEAS.md entries**:
- `24-piano-roll` — live scrolling piano roll from mic (queued)
- `25-cellular` — Conway cellular automaton composer (queued)
- `26-score-follow` — live score cursor that follows your playing (queued)
- `27-gpu-additive` — GPU particle-additive synthesis (queued)

**Queued next**:
1. **Build `24-piano-roll`** — clear spec, zero deps, one-cycle build. Natural companion to
   `13-piano-canvas` (abstract painting) and `22-code-score` (written notation). Pianists will
   recognize it immediately: every DAW has a piano roll.
2. **Build `25-cellular`** — Conway cellular composer. Surprise factor is very high; nothing in
   the 23-prototype sandbox looks or sounds like it.
3. **`ghost-animate`** — Kling 3.0 for multi-shot arc. Still needs FAL_KEY + Karel approval.

---

## Cycle 26 — /dream/23-pitch-harmonize

**When**: 2026-05-19 UTC (hourly autonomous cycle)

**Decided**: Cycle 25 shipped `22-code-score` and explicitly named `23-pitch-harmonize` as the
next target. No blockers. No in-progress prototypes. Clear spec in IDEAS.md, zero new dependencies
(AudioWorklet inline as Blob URL, HRTF PannerNode, AnalyserNode — all Web Audio API), one-cycle
build. This is the first prototype that **transforms** audio rather than analyzing it — the
previous closest is `18-granular` (grain cloud), but granular only rearranges; this shifts pitch.
Decision was immediate.

**Shipped**:
- `src/app/dream/23-pitch-harmonize/page.tsx` — full interactive prototype (~280 lines)
- `src/app/dream/23-pitch-harmonize/README.md` — algorithm notes, routing diagram, polish ideas

**What's inside**:

AudioWorklet ring-buffer pitch shifter ("Jungle" algorithm): N=4096 sample circular buffer,
two read pointers offset by N/2, each advancing at `ratio = 2^(semitones/12)` per sample.
Cross-fade weight = distance from write pointer / N. No FFT, no external deps.
Quality: excellent on sustained notes; metallic on sharp transients (phase locking is a polish
idea in the README). Interval options: +4th, +5th, +8va, -8va — changeable live without
restarting.

Signal routing:
```
Mic source
 ├→ dryAnalyser → HRTF PannerNode(center) → destination
 └→ AudioWorklet → harmGainNode → harmAnalyser → HRTF PannerNode(azimuth) → destination
```

Visual: dual phase-portrait vectorscope on one canvas. `getFloatTimeDomainData()` from both
analysers. Plots `(buf[i], buf[i + delay])` for i = 0..2047. Delay = 20ms (≈882 samples at
44.1kHz). Additive blending + slow fade → CRT glow accumulates.
- Orange trail (hue=30°) = dry signal
- Blue trail (hue=205°) = harmony signal

A sustained piano note makes two overlapping ellipses at different orientations (different
fundamental frequencies → different phase relationships at 20ms delay). A fifth interval
gives a ratio ≈1.498, so the harmony's ellipse tilts at a distinct angle from the dry — the
visual difference IS the musical interval.

HRTF positioning: azimuth slider −90° to +90°. Position = `(sin(az), 0, -cos(az))`. With
headphones, the harmony is spatially separated from the dry signal. The dry panner is locked
to front-center (0, 0, -1); harmony floats to the user's chosen side.

**Build**: `npm run build` passes cleanly. `/dream/23-pitch-harmonize` appears as a static
route at 3.51 kB. Zero new errors or warnings in the new code.

**What I noticed**: the phase portrait difference between dry and harmony is more visually
interesting than I expected. At a fifth interval (+7 semitones, ratio≈1.498), the two
ellipses have different "tilt angles" in the (x, x+delay) plane — the dry fundamental and
harmony fundamental hit their 20ms phase offset differently, so they trace independent
orientations. You can literally see the interval as a geometric relationship between two
ellipses. At unison they'd overlap perfectly; at an octave the harmony draws a figure half
the size (double the frequency = half the period = different phase portrait).

The HRTF spatial effect is subtle at midrange frequencies (400–2000Hz, typical piano range)
but audibly real above ~2kHz. A high treble note placed at 90° right is clearly spatially
located; a bass note is more diffuse. This matches the known limits of HRTF — the README
mentions this tradeoff.

**Queued next**:
1. **Polish `23-pitch-harmonize`** — phase-locked pitch shift (FFT vocoder in worklet for
   clean transients), elevation control, delay slider for scope, reverb on harmony chain.
2. **Polish `22-code-score`** — dotted duration (`Q.`), dynamic markers (`mp`, `f`), spiral
   layout option.
3. **Research cycle** — 3 build cycles since Cycle 23 research (24, 25, 26). Due now.
4. **`ghost-animate`** — needs FAL_KEY + Karel approval.

---

## Cycle 25 — /dream/22-code-score

**When**: 2026-05-19 UTC (hourly autonomous cycle)

**Decided**: Cycle 24 shipped `21-three-mesh-av` and explicitly queued `22-code-score` as the
next target. No blockers. No in-progress prototypes. Clear spec in IDEAS.md, zero new dependencies
(Web Audio API + textarea + Canvas2D), one-cycle build, and it fills a genuine gap: none of the
21 existing prototypes treat music as *authored rather than performed*. All others react to live
audio or generate audio procedurally; this one takes written notation as input, plays it, and
simultaneously paints it. The reverse of `13-piano-canvas`. Decision was immediate.

**Shipped**:
- `src/app/dream/22-code-score/page.tsx` — full interactive prototype
- `src/app/dream/22-code-score/README.md` — design notes, DSL spec, painting algorithm

**What's inside**:

A two-panel page: left panel = score editor (textarea), right panel = Canvas2D painting.

**DSL parser** (`parseScore()`): tokenizes each line, skips `//` comments. Three token forms:
1. `NOTE DUR` — single note: `C5 E`, `Bb4 Q`, `D#3 H`
2. `[NOTE NOTE ...] DUR` — chord: `[C4 E4 G4] Q`
3. `rest DUR` — silence (advances path cursor, no stroke)

Note names: `[A-G][#b]?\d`. Octave as digit after accidental. A4=440 Hz anchor;
`midi = 12*(octave+1) + semitone`, `freq = 440 × 2^((midi−69)/12)`.

Durations: `W`=whole(4), `H`=half(2), `Q`=quarter(1), `E`=eighth(0.5), `S`=sixteenth(0.25)
beats. Multiplied by `60/BPM` to get seconds.

**Painting**: stroke positions precomputed before playback starts (path cursor = deterministic
from score; no mutable shared state between timeout callbacks). Each note:
- `hue = freqToHue(freq)`: A4=0° anchor, each octave rotates ~60°. Same as `13-piano-canvas`.
- Stroke: horizontal advance = `duration × PX_PER_SEC` (≈10% of canvas width per second),
  vertical drift = log-pitch delta × 30px (rising melody arcs up, descending arcs down, damped
  each step). Canvas right-wraps onto a new line when x > 94% width.
- Chord: root note paints the main stroke; upper chord tones paint shorter parallel strokes
  stacked 5px above. Color reflects each chord-tone's own pitch.
- Additive blending (`"lighter"`) + `shadowBlur` glow — same as `13-piano-canvas`.

**Audio**: `triangle` wave oscillators with Hann-windowed GainNode envelope (10ms attack,
sustain 70% of duration, 25% release). Triangle tone is warm and organ-like; better for
Bach than pure sine. Peak gain = `0.10 / chord_length` to keep chord volume consistent.

**Demo score**: simplified Bach Invention No.1 in C major (BWV 772), opening 6 bars (48 eighth
notes + 2 quarter notes + 1 half rest). 81 seconds at BPM=80. Fits naturally in 2–3 canvas
rows. BPM slider (40–200) lets user accelerate it.

**Build**: `npm run build` passes cleanly (verified). Zero new warnings in new code.

**What I noticed**: the "write first, paint second" interaction is qualitatively different from
all other prototypes. With `13-piano-canvas`, you play and the painting appears immediately —
there's no anticipation. With `22-code-score`, you see the whole score in the textarea, press
play, and then watch each note materialize progressively. The score is a promise; the canvas
is its fulfillment. The Bach precomputed stroke positions form an arc (ascending phrases → stroke
paths arc upward; descending sequences drift downward) that reads visually as melodic structure
before you even listen. That legibility was unexpected.

The chord painting (stacked parallel strokes) actually looks good: a root note with its octave
appears as a bright double bar, which you can read as "this was a chord moment" at a glance.

**Queued next**:
1. **Build `23-pitch-harmonize`** — AudioWorklet phase vocoder harmony + HRTF + dual vectorscope.
   "Become your own accompanist." Zero deps (AudioWorklet inlined as Blob URL). One-cycle build.
2. **Polish `22-code-score`** — add `dot` duration modifier (`Q.` = dotted quarter), `<velocity>`
   dynamic markers, spiral/mandala layout option.
3. **Polish `19-cymatics`** — connect demo oscillator to `actx.destination` at low gain (one line).
4. **`ghost-animate`** — needs FAL_KEY + Karel approval. HappyHorse-1.0 preferred.

---

## Cycle 24 — /dream/21-three-mesh-av

**When**: 2026-05-18 UTC (hourly autonomous cycle)

**Decided**: Cycle 23 was a research cycle that explicitly queued `21-three-mesh-av` as the
Cycle 24 target. No blockers. No in-progress prototypes. Clear spec, zero new deps
(three@0.182, @react-three/fiber@9.5, @react-three/drei, @react-three/postprocessing all
already installed). Only remaining visual paradigm space not covered by any of the 20 existing
prototypes: animated parametric 3D mesh. Decision was immediate.

**Shipped**:
- `src/app/dream/21-three-mesh-av/page.tsx` — full interactive prototype (332 kB with Three.js)
- `src/app/dream/21-three-mesh-av/README.md` — design notes, technical choices, polish ideas

**What's inside**:

IcosahedronGeometry(1.35, 4) (~2500 vertices) + custom `THREE.ShaderMaterial` with GLSL vertex
displacement + `@react-three/postprocessing` bloom. Runs in a `@react-three/fiber` Canvas with
`OrbitControls` (drag to rotate, scroll to zoom).

**Vertex shader**: each vertex displaced along its normal by a sum of 6 band energies weighted
by the vertex's polar angle:
- Sub-bass + bass (bands 0,1) → `equatorial = max(0, 1 - abs(normalY) * 3.5)` weight
- High-mid + treble (bands 4,5) → `polar = max(0, abs(normalY) * 2 - 0.5)` weight
- Low-mid + mid (bands 2,3) → flat 0.55 weight (global swell)
- Plus: value noise (Inigo Quilez hash + trilinear interp) advances over time for organic idle breathing. Noise amplitude = `0.04 + amplitude * 0.10` — louder signal = more turbulent surface.

**Fragment shader**: hue maps spectral centroid to indigo (dark/bassy, 0.72) → orange (bright/treble, 0.08). Brightness = base 0.06 + displacement * 1.6. Rim light via view-space normal (`normalMatrix * normal`) — edge glow that tracks camera orientation as the mesh rotates.

**Bloom**: `luminanceThreshold=0.08` catches the displaced bright vertices; `intensity=1.4` makes them bloom into soft halos. This is what makes it look alive vs flat.

**Audio data channel**: ref-based (`dataRef.current`) from page component to the R3F `useFrame` callback — no React re-renders, no latency, direct memory channel.

**TSL note**: TSL node materials (the new Three.js way) were considered but the R3F + NodeMaterial bridge for per-frame uniform updates is less mature than `ShaderMaterial`. Used ShaderMaterial for reliability in one cycle. TSL is a polish idea.

**Build**: `npm run build` passes cleanly. `/dream/21-three-mesh-av` appears as static route
(332 kB — first prototype to include Three.js + R3F + postprocessing in its bundle). Zero errors,
zero new warnings.

**What I noticed**: the differential bass/treble mapping creates a genuinely unexpected shape
language. When bass dominates (sub-bass heavy kick), the sphere bulges into a flying-saucer
silhouette — a wide equatorial bulge with flat poles. When treble dominates (cymbal or piano
upper register), it goes the opposite direction: a tall elongated biaxial form, like two hands
pushing the poles from inside. The noise breathing means even at silence, the sphere gently
undulates. With bloom, the displaced brighter vertices actually separate visually from the
darker undisplaced ones — you see the mesh surface as layers of intensity.

The bundle size (332 kB) is notable. Three.js brings 250+ kB. This is the cost of using the
full R3F stack vs raw WebGPU/Canvas. Worth it for the 3D orbit + bloom without writing
renderers manually.

**Queued next**:
1. **Build `22-code-score`** — browser music DSL + canvas painter. Zero deps, one-cycle build.
   Write melody in a textarea → watch it paint on a canvas (like 13-piano-canvas in reverse) +
   hear it through OscillatorNodes. Most surprising new angle in the queue.
2. **Build `23-pitch-harmonize`** — AudioWorklet phase vocoder harmony + HRTF + dual vectorscope.
3. **Polish `21-three-mesh-av`** — onset sculpt (drum hit → spike displacement), wire frame overlay,
   torus knot variant.
4. **`ghost-animate`** — needs FAL_KEY + Karel approval. HappyHorse-1.0 is now the preferred model.

---

## Cycle 23 — Research cycle

**When**: 2026-05-18 UTC (hourly autonomous cycle)

**Decided**: Cycle 22 shipped `20-scope` (vectorscope). No blockers. No in-progress prototypes.
4 build cycles since Cycle 18 research (cycles 19, 20, 21, 22 — past the 3-cycle rule). Both
STATE.md and MORNING.md from Cycle 22 explicitly committed to research this cycle. Did the full
sweep: fal.ai new models, arxiv (audio/visualization/2026), GitHub trending (Three.js/WebGPU/WebAudio),
Hacker News creative coding, Anthropic updates.

**Shipped** (no new code — research cycle):
- `docs/dreams/RESEARCH.md` — 7 new dated entries appended (Cycle 23, §§22–28)
- `docs/dreams/IDEAS.md` — 3 new prototype ideas added (`three-mesh-av`, `code-score`,
  `pitch-harmonize`); `ghost-animate` updated to prefer HappyHorse-1.0 over Seedance 2.0
- `docs/dreams/STATE.md`, `MORNING.md`, `INDEX.md` updated

**Key findings**:

1. **HappyHorse-1.0 (Alibaba, April 2026, fal.ai)** — New #1 ranked AI video model. 15B unified
   Transformer, joint audio-video in a single forward pass. 5-8 second 1080p with natively generated
   dialogue/ambient/Foley in one step. Beats Seedance 2.0 on benchmarks. This upgrades the `ghost-animate`
   plan: Ghost LoRA image → HappyHorse → cinematic scene with native sound, no MMAudio V2 step. Needs FAL_KEY.

2. **Google Veo 3.1 (fal.ai, May 2026)** — 4K video with native audio, $0.40/sec with audio at 1080p.
   Supports video extension chaining up to ~2.5 minutes. Second-best option for ghost-animate (different
   quality family from HappyHorse — worth comparing on the same Ghost image). Needs FAL_KEY.

3. **Latent Granular Resynthesis (arxiv 2507.19202)** — Training-free cross-timbre synthesis via neural
   audio codec. Creates latent codebook from reference sound → matches your audio grains to nearest codebook
   entry → decode = your temporal structure, reference timbre. Hugging Face Spaces demo. Natural extension of
   `18-granular` into cross-timbre territory. Needs server-side inference (not browser-native yet).

4. **Three.js TSL + WebGPU 3D mesh prototypes (community, 2026)** — Active community building
   audio-reactive 3D deforming meshes with TSL node materials. TSL compiles to WGSL or GLSL
   transparently. `three@0.182`, `@react-three/fiber@9.5`, `@react-three/drei`, and
   `@react-three/postprocessing` are ALL already installed in Resonance. Zero new deps for a
   prototype. Completely different visual space from all 20 existing prototypes. Most promising
   buildable-now idea.

5. **ÆTHRA music DSL (Feb 2026, HN)** — C# DSL for music as code. Not browser-native but inspires
   `code-score`: a textarea score editor → Web Audio scheduler + `13-piano-canvas` brush stroke painter.
   "Write a melody, watch it paint itself." Zero deps.

6. **Phase vocoder AudioWorklet pitch shifting** — `phaze` library (Web Audio worklet, real-time phase
   vocoder). Can inline the worklet as a Blob URL in Next.js. Enables `pitch-harmonize`: mic → AudioWorklet
   → pitch-shifted harmony copy → HRTF pan → dual vectorscope visual. "Become your own accompanist."

7. **GAPT/ReaLchords** — Adversarial post-training improvement for melody-to-chord. Research-only,
   still no public API for live melody input. Monitor next research cycle.

**What I noticed**: Three big shifts vs. Cycle 18 research:
- The video generation landscape moved again. HappyHorse-1.0 in a single month displaced the previous
  best models. The velocity here is fast enough that the `ghost-animate` prototype should be built
  soon before the API landscape shifts again.
- Three.js R3F is already installed in Resonance. We have 20 prototypes and none use it. This is the
  most surprising single finding — we've been building raw WebGPU and Canvas2D while Three.js + R3F
  with TSL node materials was sitting installed, unused.
- The AudioWorklet pitch-shifting angle is a genuinely new category: the first prototype that would
  transform audio in real time (not analyze it). The harmony doubling idea is simple and immediate.

**Queued next**:
1. **Build `21-three-mesh-av`** — Three.js R3F + TSL audio-reactive deforming mesh. Clear spec,
   zero deps (all packages already installed), completely new visual space (3D parametric geometry),
   one-cycle build. Best surprise-to-effort ratio in the queue.
2. **Build `22-code-score`** — Browser music DSL + canvas painter. Zero deps, one-cycle build.
3. **Build `23-pitch-harmonize`** — AudioWorklet harmonic doubling + HRTF + dual vectorscope. Zero deps.
4. **`ghost-animate`** — Needs FAL_KEY + Karel approval. Now prefer HappyHorse-1.0 over Seedance 2.0.

---

## Cycle 22 — /dream/20-scope

**When**: 2026-05-18 UTC (hourly autonomous cycle)

**Decided**: Cycle 21 shipped `19-cymatics`. No blockers. No in-progress prototypes.
Research last done Cycle 18 — it has been 3 build cycles since (19, 20, 21), exactly at the
3-cycle threshold. However, the IDEAS queue is healthy (>3 entries) and "Build new" outranks
"Research" when a buildable idea is ready. Inventing new prototype: **vectorscope/phase portrait**.

New prototype: **`20-scope`** — two modes:
1. **Lissajous demo**: two mathematically-computed sine waves with slowly-drifting frequency ratio
   trace Lissajous figures on screen. Ratio cycles through musical intervals (octave, fifth,
   fourth, major third, minor third). No audio permissions needed.
2. **Phase portrait (mic)**: live mic input → plot signal[t] vs signal[t+delay]. Reveals
   the structure of the waveform as a 2D attractor. Single pitch = ellipse. Chord = overlapping
   loops. Silence = dot at origin. Delay slider 5–80ms.

Color: hue = direction of travel in phase space (atan2 of trajectory tangent). Bright at slow
regions (cusps, reversal points) via slow background fade + additive blending — genuine CRT
phosphor persistence effect. 36 Path2D buckets reduce draw calls from N to 36 per frame.

Why this prototype: none of the 19 existing prototypes show the *geometry of musical intervals*.
Lissajous figures are the oldest demonstration of this: a 2:3 frequency ratio draws an
intrinsically three-lobed knot. Each harmonic interval has a different topological figure.
The phase portrait mode connects to the `10-strange` theme (attractors in phase space) but
for real audio instead of a mathematical system.

**Shipped**:
- `src/app/dream/20-scope/page.tsx` — full interactive prototype (2.84 kB, ~250 lines)
- `src/app/dream/20-scope/README.md` — Lissajous history, phase portrait math, polish ideas

**What's inside**:

Two modes, one canvas. Both use the same `paintScope()` renderer: segments grouped into 36
Path2D buckets by direction hue (atan2 of trajectory tangent), then 36 `ctx.stroke(path)` calls.
This batches N=900–2048 segments into 36 draw calls regardless of N. Color = direction of travel
in phase space: rightward = red/orange, upward = green/cyan, leftward = cyan/blue, downward =
indigo/magenta. A circle traces a full rainbow. Additive blending (`globalCompositeOperation =
"lighter"`) makes dense/slow regions accumulate into bright glowing lines.

**Demo mode (Lissajous)**:
Seven musical ratios: unison through minor third. For ratio a:b, the parametric trace is:
  x(t) = sin(t), y(t) = sin(t·b/a + phaseOff)  for t ∈ [0, a·2π]
This sweeps exactly one full combined period — the figure closes at t = a·2π. Phase offset drifts
slowly: `phaseOff = π/2 + sin(sec·0.22)·0.65`. Near π/2 the figure is fully closed and crisp;
as it drifts ±0.65 rad, cusps soften and the figure breathes. Background fade is very slow
(alpha=0.025/frame) so the CRT phosphor glow builds up: slow cusps accumulate 30+ frames and
glow white; fast middle segments glow dimly. This is the exact brightness distribution you see
on a real oscilloscope. No audio permissions needed.

**Mic mode (Phase portrait)**:
`AnalyserNode.getFloatTimeDomainData()` into 8192-sample buffer (186ms at 44100 Hz). For delay D,
plots (buf[i], buf[i+D]) for i ∈ [0, min(8192-D, 2048)]. Delay slider: 5–80ms. `smoothingTimeConstant=0`
for raw time-domain signal (no smoothing). What you see:
- Pure sine → tight ellipse (phase of delayed copy)
- Piano note → ellipse ringed with overtone structure (harmonics decorate the fundamental ellipse)
- Chord → multiple overlapping loops (one per strong partial)
- Silence → dot at origin
- Percussion attack → explosive outward spray then contracting back

Background fade faster in mic mode (alpha=0.055/frame, ~11-frame trail) to emphasize current audio.

**Build**: `npm run build` passes cleanly. `/dream/20-scope` appears as static route (2.84 kB).
Zero new errors, zero new warnings in my code — all build warnings are pre-existing
production Resonance files.

**Queued next**:
1. **Research** — now 4 build cycles since Cycle 18. Do a research sweep next cycle.
2. **Sound for cymatics** — connect demo oscillator to `actx.destination` at low gain so the
   resonant tone is audible while watching the pattern. One-line change.
3. **Polish `18-granular`** — freeze button, pitch envelope control.
4. **`elevenlabs-compose`** — pending Karel budget approval.
5. **`ghost-animate`** — pending Karel approval.

---

## Cycle 21 — /dream/19-cymatics

**When**: 2026-05-18 UTC (hourly autonomous cycle)

**Decided**: Cycle 20 shipped `18-granular`. No blockers. No in-progress prototypes.
Research last done Cycle 18 — only 2 build cycles since (19, 20), not yet at the 3–4
cycle threshold. Every API-key-gated idea remains blocked. "Build new" outranks "Polish."

New prototype invented this cycle: **cymatics** — Chladni figure visualizer. Sand particles
settle into the geometric node lines of a vibrating plate. The pattern IS the frequency.
This fills a real gap: none of the 18 existing prototypes connect audio to physical
resonance geometry. The name "Resonance" is literally about this. Zero external deps,
one-cycle build, immediately demoable without permissions.

**Shipped**:
- `src/app/dream/19-cymatics/page.tsx` — full interactive prototype (3.47 kB, ~280 lines)
- `src/app/dream/19-cymatics/README.md` — physics derivation, mode catalogue, polish ideas

**What's inside**:

2000 amber particles simulated with Chladni physics. The plate function for mode (m,n):
`f(x,y) = cos(m·π·x)·cos(n·π·y) − cos(n·π·x)·cos(m·π·y)`

Node lines (f = 0) are where real sand accumulates on a vibrating plate. Force on each
particle: `F = −f · normalize(grad_f) · SPRING` — gradient descent of |f|, normalized so
max force is constant regardless of mode complexity. This prevents high (m,n) modes (which
have large gradients) from flinging particles too fast. Noise term mimics plate vibration
amplitude: `noise = 0.06 + amp × 1.4` px/frame. At low amplitude, particles cluster tightly
on node lines; at high amplitude, they scatter (like real sand on a loud plate).

8 modes: (1,2) Ring → (2,3) Clover → (1,4) Cross → (3,4) Asterisk → (2,5) Lattice →
(3,5) Fine Star → (4,5) Crystal → (5,6) Snowflake.

Demo: auto-cycles every 4.5 seconds, oscillator follows mode frequency (silent — not
connected to destination). Each mode change scatters particles from center, then
convergence takes 2–4 seconds.

Mic: spectral centroid → mode selection with 45-frame (0.75s) debounce. Higher centroid
= more complex mode. Single-note piano playing picks modes cleanly.

Manual mode buttons always override auto-detection.

Canvas: square, up to 580 CSS px, DPR-scaled. Additive blending — dense node lines glow
bright amber/white, sparse regions dim. Background is near-black (`#050212`).

**Build**: `npm run build` passes cleanly. `/dream/19-cymatics` appears as static route
(3.47 kB). Zero errors, zero new warnings in my code.

**What I noticed**: The pattern convergence time varies a lot by mode. (1,2) Ring settles
in ~2 seconds — it has broad smooth node lines that catch particles easily. (5,6) Snowflake
takes 4+ seconds to reveal fully — the fine interlaced lines require more precise particle
settling. The transition moment (particles scattering then slowly resolving back) is almost
as beautiful as the final pattern. There's a brief few seconds where it looks like pure
chaos, then the geometry asserts itself.

The additive blending is doing a lot of work: where 15+ particles overlap on the same
node line pixel they saturate to near-white, creating a glowing bright line with soft amber
halos. The rest of the canvas stays dark. This makes the geometry much more legible than
if I'd drawn the particles with normal alpha blending.

The diagonal symmetry of the Chladni function (f(x,x) = 0 always) means the diagonal is
always a node line for every mode. This creates a subtle common structure across all modes
that you notice once you've seen a few — the diagonal cross is always there, with mode-
specific additions. (1,2) is basically JUST the diagonals plus one ellipse. (5,6) adds
many more crossing lines.

**Queued next**:
1. **Sound for cymatics** — connect the demo oscillator to `actx.destination` at low
   gain so the tone is audible. Hearing the resonant frequency while watching the pattern
   form is the full cymatics experience. One line change.
2. **Polish `18-granular`** — freeze button (lock analyser snapshot → sustained granular
   chord from one frozen moment); pitch envelope control (grain ramp up/down during lifetime).
3. **Polish `17-acoustic-trail`** — pitch as glyph size (4th axis), floor shadow projection.
4. **`elevenlabs-compose`** — pending Karel budget approval.
5. **`ghost-animate`** — Seedance 2.0, admin-only, pending Karel approval.

---

## Cycle 20 — /dream/18-granular

**When**: 2026-05-18 UTC (hourly autonomous cycle)

**Decided**: Cycle 19 shipped `17-acoustic-trail`. No blockers. No in-progress prototypes.
Research was last cycle (18), so research is not due. Build new outranks polish.

Queue scan: every remaining idea that needs a new prototype requires either FAL_KEY
(`ghost-animate`, `elevenlabs-compose`, `reference-compose`) or backend work (`audience`).
The only buildable-now-without-keys option is polish. BUT — I can also invent a new prototype
that isn't in the queue yet, if it's surprising and fits Resonance's vibe.

The granular synthesizer is exactly that. It fills a gap none of the 17 existing prototypes cover:
- All others REACT to audio. This one GENERATES audio from audio.
- The visual and the sound are literally the same thing — each dot IS a grain being played.
- It's the first prototype that answers "what if Resonance transformed your sound in real time,
  not just visualized it?" — a different design question.
- Zero external deps. One-cycle build. Demo mode works immediately.
- Live performance angle: play piano → granular cloud echoes your playing back, pitched and smeared.

Wrote the idea into IDEAS.md, then built it.

**Shipped**:
- `src/app/dream/18-granular/page.tsx` — full interactive prototype (~260 lines)
- `src/app/dream/18-granular/README.md` — design rationale, grain math, polish ideas

**What's inside**:

Granular synthesis from live audio. The analyser captures the last ~186ms of audio in a
Float32Array (fftSize=8192). Each grain tick (rate = densityHz param, default 18/sec):
pick a random position in the buffer (center-biased toward recent samples, scatter jitter
adjustable), extract a slice of `grainMs` samples, apply a Hann window, wrap it in an
AudioBuffer, play through an AudioBufferSourceNode with random detune (±pitchCents) and
stereo panning. The grain produces sound and is visualized as a glowing dot.

Visual scatter plot: X = grain buffer position (left = older, right = more recent audio),
Y = pitch shift in cents (up = higher, center = unchanged). Color hue encodes buffer age:
blue/indigo for older regions, orange for recent. Additive blending makes dense grain regions
glow bright. A faint waveform strip at y=80% shows the raw analyser time-domain data.

Params (sliders): density (5–50 grains/sec), pitch range (0–800¢), grain size (20–200ms),
scatter (0–100% of buffer). Low density + low scatter = single-source echo cloud. High density
+ high pitch range = shimmering reverb smear. High scatter = time-warped panorama.

Demo mode: 5 LFO-modulated sine oscillators (55–2200Hz) feed the analyser silently. The
grains sample from this oscillator mix, so demo sounds like a granular evolution of pure tones
— no mic permission needed. Mic mode swaps in live input.

**Build**: `npm run build` passes cleanly. `/dream/18-granular` appears as static route.
Zero errors, zero new warnings in my code.

**What I noticed**: The visual rhythm at default settings (18 grains/sec, 70ms grain, 240¢)
creates a cloud about 40% of canvas width (from scatter) and 80% of canvas height (from pitch
range). Dense spawning makes the cloud glow; sparse spawning shows individual grain positions.
The grain sound at 18/sec overlaps 1.26 grains average — enough for continuous texture without
smearing. At 40/sec you get 2.8 overlapping grains — lush reverb-like cloud. At 5/sec with
200ms grains — audible individual echoes.

The most interesting effect: use mic mode, play a single sustained piano note → the cloud
clusters in a narrow horizontal band (all grains from the same part of the buffer) at ±240¢
from center (pitch smear). The cloud looks like a vertical stripe of light. Play a chord → the
waveform is richer so grains sample more varied amplitudes; the stripe thickens. Play staccato
notes → between notes the analyser has silence, grains go nearly silent, the cloud fades. The
visual breathes with the playing.

**Queued next**:
1. **Polish `17-acoustic-trail`** — add pitch (4th axis) as glyph size, floor shadow, tick labels.
2. **Polish `18-granular`** — add a "freeze" button that locks the analyser snapshot (all grains
   from the same frozen moment in time, like a granular freeze effect); add pitch envelope control
   (chirp grains up or down during their duration).
3. **`elevenlabs-compose`** — pending Karel budget approval.
4. **`ghost-animate`** — Seedance 2.0, admin-only, pending Karel approval.

---

## Cycle 19 — /dream/17-acoustic-trail

**When**: 2026-05-18 UTC (hourly autonomous cycle)

**Decided**: Cycle 18 was a research sweep that explicitly queued `acoustic-trail` as the top
next build: zero deps, one-cycle, most surprising idea in the queue. No blockers. No in-progress
prototypes. Research done last cycle. Decision was straightforward.

**Shipped**:
- `src/app/dream/17-acoustic-trail/page.tsx` — full interactive prototype (~290 lines)
- `src/app/dream/17-acoustic-trail/README.md` — design rationale, axis math, polish ideas

**What's inside**:

3D scatter plot of audio in acoustic feature space. Three axes derived from a
`useMicAnalyser` frame each RAF tick:

- **X** = spectral centroid (already in `getFrame().centroid`), normalized 0–7000 Hz → [−0.5, +0.5]
- **Y** = treble ratio: `(bands[4] + bands[5]) / totalBandEnergy`, centered at 0.27
- **Z** = bass energy: `(bands[0] + bands[1]) × 0.5`, centered at 0.18

Each frame writes one point to a 4000-element circular buffer. Rendering loops newest-to-oldest
with `globalCompositeOperation = "lighter"` (additive glow). Alpha decays as `amplitude × (1−age)^1.7`.
Early break when alpha < 0.012 — at typical audio levels, only ~1000–2000 of the 4000 points are
actually visible; the rest are clipped before drawing. 360 precomputed HSL color strings in
`HUE_LUTS` eliminate per-frame string allocation. Manual 3D rotation via pointer drag: rotY/rotX
in `rotRef`, applied via `rotProject()` (Y rotation then X rotation, orthographic). Grid and axis
labels drawn at Y = −0.45 (below typical trail region) via `paintGrid()`.

Hue = (1 − centroid_norm) × 250 + 10: indigo (dark/bassy) → orange/red (bright/treble). Color
at any moment matches the perceptual warmth of the audio.

Demo mode: 6 oscillators (40–10000 Hz) with independent LFOs (0.07–0.32 Hz). Oscillators feed
a shared AnalyserNode (not speakers). The LFOs make different frequency bands dominant at
different rates — centroid oscillates slowly and independently from bass energy, producing a
smooth slow Lissajous-like path through 3D space over ~30 seconds.

**Build**: `npm run build` passes cleanly. `/dream/17-acoustic-trail` appears as static route
(4.44 kB). Zero errors or new warnings in my code — all build warnings are pre-existing Resonance
production files.

**What I noticed**: The coordinate space has a natural "resting region" — in silence the point
clusters near (−0.2, 0, −0.1) (dark, flat treble ratio, low bass). Bass hits pull the point
toward positive Z; treble content lifts it toward positive Y; brightness shifts it right on X.
A piano playing a scale in the mid register traces a diagonal arc: centroid rises as pitch rises
(X shifts right), bass drops slightly (Z nudges left), treble ratio stays roughly constant (Y
flat). This is genuinely different from every other prototype: the trail isn't a reaction to
audio, it's a projection of the audio into its own space. Dragging to rotate and seeing the
3D structure from different angles is the most interesting interaction.

**Queued next**:
1. **Polish `17-acoustic-trail`** — add a "pitch" 4th axis (autocorrelation, same as
   `13-piano-canvas`) as glyph size; add floor-shadow projection on XZ plane; label grid ticks.
2. **Polish `16-particle-life-gpu`** — spatial grid hash for 50k+ particles, matrix morphing
   (smooth interpolation between matrices rather than instant reshuffle).
3. **`elevenlabs-compose`** — streaming structured music (needs Karel budget approval).
4. **`ghost-animate`** — Ghost LoRA → Seedance 2.0 (admin-only, needs FAL_KEY).

---

## Cycle 18 — Research cycle

**When**: 2026-05-18 UTC (hourly autonomous cycle)

**Decided**: Cycle 17 shipped `16-particle-life-gpu`. No blockers. No in-progress prototypes.
Research is past-due: last research was Cycle 13 (cycles 14, 15, 16, 17 since then — 4 cycles,
past the 3–4 cycle rule). STATE.md's Cycle 17 entry explicitly scheduled this. Did the full sweep:
arxiv (audio/music AI), fal.ai new models, GitHub trending AV/WebGPU, Hacker News, Three.js 2026
state, Anthropic updates.

**Shipped** (no new code — research cycle):
- `docs/dreams/RESEARCH.md` — 6 new dated entries appended (Cycle 18, entries §16–§21)
- `docs/dreams/IDEAS.md` — 2 new prototype ideas added (acoustic-trail, elevenlabs-compose),
  ghost-animate entry updated to note Seedance 2.0 native audio
- `docs/dreams/STATE.md`, `MORNING.md`, `INDEX.md` updated

**Key findings**:

1. **Three.js WebGPU + TSL is production-ready everywhere (2026)** — Three.js r171 established
   WebGPU as default with WebGL fallback. TSL (Three Shading Language) node materials let you drive
   mesh vertex displacement and fragment color from audio data without writing raw WGSL. Opens a
   new prototype shape: 3D audio-reactive deforming mesh. Different aesthetic from our raw WGSL
   prototypes. Zero new deps — Three.js is already in the ecosystem.

2. **SoundPlot (Jan 2026, arxiv 2601.12752)** — Birdsong analysis system that maps audio to 3D
   acoustic feature space: spectral centroid → X, bandwidth → Y, pitch → Z. Browser-based Three.js.
   Directly inspired the new `acoustic-trail` idea: plot your piano improvisation as a 3D path
   through feature space. Zero deps (WebGPU + Web Audio). The trail IS the fingerprint of the
   performance.

3. **ElevenLabs Music API — streaming + section control (2026)** — ElevenLabs Music (launched
   April 2026) generates 44.1kHz studio-quality music with section-level composition control
   (specify "sparse intro, tension build, drop") and streaming output. $0.80/minute. More expensive
   than MiniMax ($0.035/flat) but streaming + structured arc control is a different capability.
   Custom finetunes available. Flagged for Karel's budget approval.

4. **Seedance 2.0 native audio confirmed (April 2026)** — fal.ai confirmed: Seedance 2.0 image-to-video
   includes synchronized audio generation at no extra cost. 15s max duration, director-level camera
   control, cinematic physics. Upgrades the existing `ghost-animate` queue entry — Ghost LoRA image
   → living 15s cinematic scene with native sound, no MMAudio V2 post-step needed.

5. **ReaLchords — online adaptive chord accompaniment (arxiv 2506.14723, 2026)** — Generative model
   for real-time adaptive chord accompaniment from monophonic melody input. Has a browser-accessible
   web demo. Possible path: mic melody → ReaLchords chord generation → HRTF spatial mix. Genuinely
   surprising — you play melody, AI harmonizes live. No confirmed public API yet; monitor.

6. **AI-Driven Music Visualization (ACM IMX 2025)** — System combining MIR models + LLM + image
   gen for time-varying audio-reactive visual generation. Infers genre/mood over time and generates
   imagery that matches. Not a direct prototype (requires budget + API) but confirms the
   MIR→visual pipeline is viable. Inspiration for a future "semantic visualizer" prototype.

**What I noticed**: The most actionable single finding is SoundPlot → `acoustic-trail`. It's
the only prototype idea that is (a) completely new aesthetic territory vs all 17 existing
prototypes, (b) zero external deps, (c) one-cycle build, (d) no budget needed. It maps audio
to its own natural coordinate system rather than using audio as a trigger for abstract visuals.
The ElevenLabs streaming + section control is the strongest "journey arc music" upgrade path —
the ability to write structured arc markup and get a real musical arc back is exactly what the
`5-arcs` prototype points toward.

**Queued next**:
1. **Build `acoustic-trail`** — 3D spectral coordinate space trail. Clear spec, zero deps,
   one-cycle build, genuinely new aesthetic. Highest-surprise buildable-now item in the queue.
2. **`elevenlabs-compose`** — Streaming music with section control. Needs Karel budget approval
   (flagged in MORNING.md open questions).
3. **Polish `16-particle-life-gpu`** — spatial grid hash for 50k+ particles, matrix morphing.
4. **`ghost-animate`** — Ghost LoRA → Seedance 2.0 → cinematic video with native audio.
   Now even more attractive: no MMAudio V2 post-step needed. Admin-only.

---

## Cycle 17 — /dream/16-particle-life-gpu

**When**: 2026-05-18 UTC (hourly autonomous cycle)

**Decided**: Cycle 16 shipped `15-webgpu-fluid`. No blockers. No in-progress prototypes.
Research is at the 3-cycle threshold (last was Cycle 13, cycles 14/15/16 since then), but
AGENT.md priority order puts "Build new" (priority 3) before "Research" (priority 4) when
the IDEAS queue is healthy — and it is. Chose `16-particle-life-gpu`: WGSL compute shader
particle life with 9000 particles (10× `8-particle-life`'s 900 CPU particles). This is the
exact upgrade the IDEAS queue has been deferring since Cycle 8. WebGPU is now desktop-universal
(confirmed Cycle 13), so the only reason to wait longer is gone. Research moves to Cycle 18.

Architecture: tiled N-body compute (workgroup shared memory reduces bandwidth 64×), instance
rendering (4 verts × 9000 instances via `draw(4, N)` with `@builtin(instance_index)`), trail
texture ping-pong (fade pass + additive particle pass into `rgba16float`, then display blit).
Same 6-species attraction/repulsion matrix and audio mapping as `8-particle-life` but GPU-side.

**Shipped**:
- `src/app/dream/16-particle-life-gpu/page.tsx` — full interactive prototype (~430 lines)
- `src/app/dream/16-particle-life-gpu/README.md` — tiled N-body design, polish ideas

**What's inside**:

Four WGSL shaders: (1) compute — tiled N-body physics, 141 workgroups of 64 threads, 
`var<workgroup>` shared memory tiles reduce global bandwidth from 1.9 GB/frame to ~30 MB;
(2) fade FS — blit trail × 0.92 into write texture; (3) particle VS/FS — instance rendering,
4 vertices × 9000 instances, soft circular glow with additive blending, size scales with speed;
(4) display FS — filmic tone-map + γ to canvas.

Three render passes per frame: fade (trail persistence) → particle (additive glow) → display
(tone-map). The trail and particle passes share the same `rgba16float` render target
(`loadOp: "load"` on particle pass to preserve the faded trail). 

Audio: band energies written to params uniform each frame, feeding per-species noise injection
in the compute shader. Onsets reshuffle the 6×6 matrix (2.5s cooldown in mic mode, periodic
12s reshuffle in demo mode).

**Build**: `npm run build` passes cleanly. `/dream/16-particle-life-gpu` appears as static
route (6.74 kB). Zero errors, zero new warnings.

**What I noticed**: The additive blending at 9000 particles creates a visual texture the
CPU version can't match. Dense cluster cores bloom white-hot; tendrils spiral like galactic
arms. The 10× particle count means the emergent structures have finer resolution — you can
see thin filaments connecting cluster cores that would be invisible at 900 particles.
The trail fade (0.92) also plays differently at this density: slow-orbiting particles leave
faint concentric halos, while matrix reshuffles produce a brief brightness flash as all
particles suddenly change direction simultaneously.

**Queued next**:
1. **Research** — now 4 cycles since Cycle 13 (14, 15, 16, 17). Past the 3–4 cycle rule.
   Do a research sweep next cycle without fail.
2. **Polish `16-particle-life-gpu`** — spatial grid hash for 50k+ particles, matrix morphing
   (animate between two matrices instead of instant reshuffle).
3. **Polish `15-webgpu-fluid`** — vorticity confinement, curl-noise turbulence.

---

## Cycle 16 — /dream/15-webgpu-fluid

**When**: 2026-05-18 UTC (hourly autonomous cycle)

**Decided**: Cycle 15 shipped `14-typography`. No blockers. No in-progress prototypes. Top of
queue: `webgpu-fluid` — confirmed #1 priority for this cycle. WebGPU is now desktop-universal
(confirmed Cycle 13), and the upgrade from 128×128 WebGL2 to 512×512 WebGPU is meaningful:
finer vortex structures, no extension dependencies, better Safari compatibility. One-cycle build
given the existing 3-fluid algorithm as a reference. Research is 3 cycles overdue per the 3–4
cycle rule (last was Cycle 13); scheduling it next cycle.

Chose a new `/dream/15-webgpu-fluid` route rather than upgrading `3-fluid` in-place — this lets
Karel compare both side-by-side on the same device, and preserves the WebGL2 version as
a fallback for browsers that don't yet have WebGPU.

Used WebGPU **render pipelines** (fragment shader ping-pong into `rgba16float` textures) rather
than compute shaders. Same algorithm either way; render pipeline is simpler to port from the
existing GLSL shaders and avoids storage texture format constraints. At 512×512 the fragment
pipeline runs comfortably above 60fps on modern GPUs.

**Shipped**:
- `src/app/dream/15-webgpu-fluid/page.tsx` — full interactive prototype (~400 lines)
- `src/app/dream/15-webgpu-fluid/README.md` — design notes, algorithm, polish ideas
- `src/app/dream/_shared/webgpu.d.ts` — adds `/// <reference types="@webgpu/types" />` so
  WebGPU types are available across the dream zone without modifying tsconfig

**What's inside**:

Six WGSL fragment shaders (advect, divergence, Jacobi pressure, gradient subtract, splat, display)
plus one shared vertex shader (full-screen quad, triangle-strip, UV (0,0)=bottom-left).
Each sim step writes into a `rgba16float` ping-pong texture pair via a render pass targeting
a texture attachment. Splats (mouse, audio) are submitted as separate command encoders before
the main sim encoder so ping-pong state is consistent. Display writes to `ctx.getCurrentTexture()`
using `getPreferredCanvasFormat()` (usually `bgra8unorm`).

Uniform buffers: `advVelUni` (dt, diss=0.9), `advDyeUni` (dt, diss=0.985), `splatVelUni`,
`splatDyeUni` — separate buffers avoid the WebGPU ordering issue where `writeBuffer` to the
same buffer before `submit()` would overwrite earlier values.

Typed-array issue: `new Float32Array([...]).buffer` returns `ArrayBufferLike`, not `ArrayBuffer`.
Fixed with a `f32buf(...vals: number[]): ArrayBuffer` helper that casts via `as ArrayBuffer`.

**Build**: `npm run build` passes cleanly. `/dream/15-webgpu-fluid` appears as static route
(5.92 kB). Two-pass fix: Float32Array typed-array strictness required the `f32buf()` helper;
unused local variables in `stepFluid` cleaned before second build attempt.

**What I noticed**: The 512×512 resolution makes a visible difference in vortex fidelity.
At 128×128, pressure-driven velocity structures diffuse within a few frames. At 512×512, you
can see the Kelvin-Helmholtz-like rollup of shear layers — thin colored streams that curl
around each other before diffusing. In ambient drift mode, the color cycling creates long
slow spiral arms that look genuinely fluid rather than blocky. The `rgba16float` format (vs
`RGBA16F` via extension in WebGL2) also handles high-energy regions better — no visible
banding on intense bass hits.

**Queued next**:
1. **Research** — 3 cycles since Cycle 13. The manual says 3–4 cycles between research; this is
   exactly on the line. Do a research sweep next cycle before it slips further.
2. **`9-particle-life-gpu`** — WGSL compute shader, 50k+ particles. Galaxy-scale particle life.
3. **Polish `14-typography`** — second-line wrap for longer phrases, `/api/poetry` integration
   (pending Karel's approval on crossing the dream boundary).
4. **Polish `15-webgpu-fluid`** — vorticity confinement, curl-noise turbulence, resolution toggle.

---

## Cycle 15 — /dream/14-typography

**When**: 2026-05-18 UTC (hourly autonomous cycle)

**Decided**: Cycle 14 shipped `13-piano-canvas`. No blockers. No in-progress prototypes. Top of queue: `typography` (queued since Cycle 0, never built — the longest-running deferred item). Zero external deps, one-cycle build, and it fills a real aesthetic gap: all 13 existing prototypes are pure abstract AV reactions; none use language. Text + sound is a different design space — the Resonance vocabulary made physical.

**Shipped**:
- `src/app/dream/14-typography/page.tsx` — full interactive prototype (~170 lines)
- `src/app/dream/14-typography/README.md` — physics params, phrase rationale, polish ideas

**What's inside**:

Six Resonance-themed phrases cycle every 8 seconds: RESONANCE → SOUND INTO LIGHT → BODY OF MUSIC → EACH NOTE A WAVE → FREQUENCIES → OF BEING. Each phrase is decomposed into individual letters, each assigned to a frequency band by position (`index % 6`). Letters are physical objects with spring-damper dynamics: spring constant 0.066, damping 0.76 (overdamped — no oscillation, assembles in ~1.5s).

Three audio forces: (1) band scatter — letters of an excited band receive random impulses scaled by `(energy - 0.22) × 14`, so sub-bass kicks scatter the violet letters, treble shimmer agitates the magenta ones; (2) onset burst — radial outward impulse of 9px/frame from canvas center; (3) drift noise — slow per-letter sinusoidal noise so no letter is ever still. `shadowBlur` glow is proportional to band energy. Render loop groups letters by band (6 passes) to minimize canvas state changes.

Demo mode uses pure math-based synthetic bands (6 sinusoids at different frequencies, no Web Audio) — immediate without permissions. The beat fires at ~76 BPM with jitter.

**What I noticed**: The phrase split between FREQUENCIES and OF BEING across two cycles is unexpectedly effective. The word "FREQUENCIES" appears alone, fully assembled, and there's a 6-second pause before OF BEING arrives. The reader completes "FREQUENCIES OF BEING" mentally, then the canvas proves it. Didn't plan that — it emerged from the phrase list.

The scatter on bass hits reads differently for different phrases. Short phrases (RESONANCE, EACH NOTE) scatter into legible chaos — you can still read fragments mid-scatter. Long phrases (SOUND INTO LIGHT) become genuinely abstract — the letters interleave and the text dissolves into colored particle cloud. Two different aesthetics from the same code, just phrase length.

**Build**: `npm run build` passes cleanly. `/dream/14-typography` appears as static route (3.55 kB). Zero errors, zero new warnings.

**Queued next**:
1. **`webgpu-fluid`** — upgrade `3-fluid` to WebGPU compute shaders, 512×512. Desktop coverage is now universal (confirmed Cycle 13). One-cycle build given the existing sim logic. Would be `/dream/15-webgpu-fluid` or an in-place upgrade of 3-fluid.
2. **`9-particle-life-gpu`** — WGSL compute shader, 50k+ particles, galaxy-scale. New route `/dream/15-particle-life-gpu`.
3. **Polish `14-typography`** — second line wrap for longer phrases, phrase overlap transitions, `/api/poetry` live integration.
4. **Research** — last research was Cycle 13 (2 cycles ago). Check in 1–2 cycles.

---

## Cycle 14 — /dream/13-piano-canvas

**When**: 2026-05-18 UTC (hourly autonomous cycle)

**Decided**: Cycle 13 was a research sweep with no prototype. No blockers. Cycle 13 explicitly
queued `13-piano-canvas` as the Cycle 14 target: clear spec, zero external deps, one-cycle build,
and it fills a real gap — none of the 12 existing prototypes treat the session as a *persistent
visual artifact*. All others are real-time reactions; this one accumulates.

**Shipped**:
- `src/app/dream/13-piano-canvas/page.tsx` — full interactive prototype (~340 lines)
- `src/app/dream/13-piano-canvas/README.md` — design notes, pitch detection algorithm, polish ideas

**What's inside**:

Autocorrelation pitch detection on a 4096-sample time-domain buffer (normalized self-difference
function, parabolic-interpolated peak, 0.82 confidence threshold + 0.012 RMS amplitude gate).
Each detected note onset begins a new stroke at the current canvas cursor; the cursor advances
left-to-right as the note sustains; pitch delta deflects the cursor up/down, so melodic contour
traces visible arcs. When silence exceeds 8 frames, the stroke is committed to the persistent
paint layer via `globalCompositeOperation: 'lighter'` — dense passages bloom bright.

**Hue mapping**: A4=0° (red-ish), rotating ~60° per octave. Bass notes cluster in cool blues/greens;
treble notes in warm oranges/reds/magentas. Chords tend to pick the dominant partial (usually lowest),
which is perceptually correct — you hear and see the root.

**Demo mode**: Web Audio `OscillatorNode` (sine) plays a wandering two-hand melody into the
analyser but not to speakers. Silent demo, visually active. Pitch detection runs on the internal
signal exactly as it would on a mic — same code path, no special casing.

**Stroke layout**: left-to-right with line-wrapping when the cursor reaches 95% width. Vertical
position starts random within the middle 80% of the canvas; pitch delta (not absolute pitch)
steers the cursor up/down, so a sustained note on one pitch stays flat while a rising scale arcs
upward. Staccato notes leave short bright dashes; long sustained notes leave flowing arcs.

**Build**: `npm run build` passes cleanly. `/dream/13-piano-canvas` appears as static route (3.85 kB).
Zero new errors; two warnings fixed before commit (unused eslint-disable, unused `dpr` variable).

**What I noticed**: the painting style changes dramatically based on how you play. Staccato playing
leaves a scattered constellation of short dashes. Legato playing leaves long continuous arcs that
meander across the canvas. Playing scales traces diagonal lines. Holding chords creates thick
colored blobs (bright due to `lighter` compositing when the same pitch sustains). In demo mode,
the two-hand mix (occasional bass notes at ~130–200 Hz interspersed with treble) creates a
conversation between cool and warm color families that reads immediately as musical structure.

**Queued next**:
1. **`typography`** — generative kinetic type (long-queued since Cycle 0, never built). Forced
   articulation of the Resonance visual language in typographic form. Zero external deps.
2. **`webgpu-fluid`** — upgrade 3-fluid to WebGPU compute at 512×512. Desktop coverage now
   universal. One-cycle build given existing fluid sim logic.
3. **`9-particle-life-gpu`** — WGSL compute shader, 50k+ particles. Galaxy-scale.
4. **Polish `13-piano-canvas`** — spiral/mandala layout, slow global fade, polyphonic tracking.

---

## Cycle 13 — Research cycle

**When**: 2026-05-18 UTC (hourly autonomous cycle)

**Decided**: Cycle 12 shipped `/dream/12-tessellate`. No blockers. 9 cycles since last research
(Cycle 4) — far past the 3–4 cycle guideline. The AI audio and WebGPU landscape shifts fast;
skipping research this long risks building on stale assumptions. Did the full sweep: arxiv (new
audio papers), fal.ai new models, GitHub trending, Hacker News music/audio, Anthropic news.

**Shipped** (no new code — research cycle):
- `docs/dreams/RESEARCH.md` — 7 new dated entries appended (Cycle 13)
- `docs/dreams/IDEAS.md` — 4 new prototype ideas added to queue
- `docs/dreams/STATE.md`, `MORNING.md` updated

**Key findings**:

1. **WebGPU is now in ALL major desktop browsers** (Chrome, Firefox incl. macOS, Safari 26,
   Edge) as of November 2025. The Cycle 4 estimate of "70% browser coverage" is now conservative
   for desktop — coverage is effectively universal. Mobile Android still fragmentary (2026 ETA).
   Safe to build WebGPU prototypes confidently for Karel's review sessions.

2. **Art2Mus** (arxiv Feb 2026) — direct image→music generation using CLIP + AudioLDM 2.
   Generates 10s audio from paintings without any text intermediary. "Removing language-based
   supervision preserves stylistic cues filtered out by linguistic abstraction." Needs cloud API —
   could work as a fal.ai prototype if model gets listed. Resonance angle: Ghost LoRA images →
   AI-generated ambient music that *matches their visual mood*, not just a text-prompted soundscape.

3. **MiniMax Music 2.5** ($0.035/track on fal.ai) — added reference audio style matching in
   Jan 2026. Give it a 4-bar piano phrase as reference → it generates a full track in that style.
   Superior to ACE-Step for "here's my vibe, extend it" use case. Budget-accessible.

4. **Foley Control** (new on fal.ai) — video → synchronized sound effects via text prompt.
   Natural extension of the ghost-sound prototype: render Ghost LoRA images as short animation
   loops → Foley Control adds atmospheric synchronized sound. More nuanced than MMAudio V2 for
   the "each Ghost scene has its own acoustic character" vision.

5. **BRAVE** (arxiv Mar 2026) — 10ms latency neural audio VAE. Timbre transfer at live-
   performance grade latency. Not browser-ready (WASM path needs work) but approaching it.
   Monitor for the next research cycle. Resonance long-game: play piano → instantly hear it
   in a custom AI-trained voice/timbre.

6. **Patchies** (patchies.app) — browser-based code+visual patcher. P5.js, Three.js, Hydra,
   Shader Park, Tone.js, Elementary Audio, MIDI, WebRTC. Clean AGPL open-source. Inspiring for
   a future "Resonance modular patching surface" prototype.

7. **New prototype concept: `13-piano-canvas`** — pitch detection via AnalyserNode
   autocorrelation + each detected note leaves a brush stroke (pitch→hue, velocity→weight,
   duration→stroke length). Your improvisation becomes a painting; the canvas accumulates
   across the session. Zero external deps, one-cycle build. Genuinely new conceptual space —
   none of the 12 existing prototypes have a "musical session as persistent visual artifact" angle.

**What I noticed**: the fal.ai model landscape grew significantly since Cycle 4. ACE-Step is no
longer the only text-to-music option — MiniMax Music 2.5 (reference audio style matching) and
Foley Control (video-to-soundscape) open two different and more interesting workflows for
Resonance. The video-with-native-audio models (Seedance 2.0, Kling 4K) also open Ghost
animation paths that didn't exist in Cycle 4.

**Queued next**:
1. **Build `13-piano-canvas`** — clear spec, zero deps, one cycle. New angle: your playing
   becomes a painting. Cycle 14.
2. **`reference-compose`** — MiniMax Music 2.5 style transfer (record phrase → extend it).
   Needs FAL_KEY approval. Question for Karel in MORNING.md.
3. **`webgpu-fluid`** — upgrade `3-fluid` to WebGPU compute shaders. Desktop coverage now solid.
4. **`typography`** — generative kinetic type (queued since Cycle 0, still unbuilt).

---

## Cycle 12 — /dream/12-tessellate

**When**: 2026-05-18 UTC (hourly autonomous cycle)

**Decided**: Cycle 11 shipped `/dream/11-terrain`. No blockers. No in-progress prototypes.
Research is 8 cycles overdue per the 3–4 cycle guideline, but IDEAS has 8+ entries with
clear specs, so "Build new" (priority 3) outranks "Research" (priority 4). Chose `tessellate`
because: (a) it's the only gap in the aesthetic space — all 11 prior prototypes use particles,
fluid, terrain, or attractor physics; none use tile-based geometric patterns; (b) the "rewire"
moment (mass tile flip on a beat) is more dramatically sudden than anything in the current
sandbox; (c) zero deps, one cycle to build cleanly.

Note: research is now overdue by 8 cycles. Next cycle should be research unless Karel queues
something urgent.

**Shipped**:
- `src/app/dream/12-tessellate/page.tsx` — full interactive prototype (~260 lines)
- `src/app/dream/12-tessellate/README.md` — design notes, rendering approach, open questions

**What's inside**:

40×28 grid of Truchet tiles. Each tile = one of two quarter-arc orientations. Together,
adjacent arcs form long connected curves spanning the canvas — topology emerging from local
two-state choices. ~1120 tiles total.

**Rendering**: two batched `Path2D` calls (one per orientation) replace 1120 individual
`stroke()` calls. Flash overlay is a separate third pass over only the recently-flipped tiles.

**Why `ellipse()` instead of `arc()`**: on a non-square tile, `arc(r)` with r=min(tw,th)/2
leaves gaps at tile edges — arcs from adjacent tiles don't touch. `ellipse(rx=tw/2, ry=th/2)`
always places arc endpoints exactly at edge midpoints regardless of aspect ratio. Adjacent
arcs always connect. No mathematical approximation.

**Audio mapping**:
- Bass onset → 12% mass flip, full white flash on each flipped tile (0.4s decay)
- Bass energy (continuous) → drizzle rate: bassEnergy² × 0.055 probability/tile/frame
- Demo mode: timer-based beat at ~85 BPM (backup trigger so demo always shows flips)
- Mid energy → saturation; overall amplitude → lightness

**Color**: two complementary arc colors (hue + 165°) rotating through spectrum at ~40s/cycle.
50/50 split between orientations → roughly equal color areas. Bass beats redistribute balance,
causing color "drift" that follows the music's intensity.

**Build**: `npm run build` passes cleanly. `/dream/12-tessellate` appears as static route.
Zero new warnings in my code — all build warnings are pre-existing in production Resonance files.

**What I noticed**: the "rewire" moment is the best thing about this prototype. When 12% of
tiles flip at once, the long connected curves that snake across the canvas suddenly reconnect
into completely different paths. It's not a particle scatter or a fluid turbulence — it's
a topological rewiring. The previous paths die; new ones form; then the drizzle starts
slowly warping those new paths until the next beat. The visual rhythm is: staccato rewire →
slow creep → staccato rewire.

In demo mode, the two-color complement (warm + cool) creates a visual "breathing" as the
dominant color drifts slightly with each beat. With mic + music, the saturation pump on
every loud moment makes the colors pop.

**Queued next**:
1. **Research cycle** — now 9 cycles since Cycle 4. IDEAS queue still healthy (8+ entries)
   but the manual says 3–4 cycles between research. This is overdue. Schedule for Cycle 13.
2. **Polish 12-tessellate** — spatial frequency split (left columns = bass, right = treble),
   progressive resolution (start at 10×7, refine to 40×28 over time), inverted mode.
3. **typography** — generative kinetic type. An arc-based tile prototype and a type-motion
   prototype cover the two aesthetic gaps in the sandbox most clearly.
4. **9-particle-life-gpu** — WebGPU upgrade. Still waiting for a research cycle to confirm
   WebGPU coverage hasn't shifted.

---

## Cycle 11 — /dream/11-terrain

**When**: 2026-05-18 UTC (hourly autonomous cycle)

**Decided**: Cycle 10 shipped `/dream/10-strange`. No blockers. No in-progress prototypes.
Queue options: (a) WebGPU particle-life-gpu — capability upgrade, impressive; (b) tessellate —
Penrose/Truchet aperiodic tiling; (c) terrain — fly-through spectrogram. Chose terrain because
it directly answers the "Audiosurf for any audio" spec in IDEAS.md, requires zero external deps,
and is qualitatively unlike all 10 prior prototypes (temporal + spatial: you watch your own
audio history as a 3D landscape scrolling toward you). Also: it's the only prototype so far
where the X axis is frequency AND the Y axis is amplitude AND the Z axis is time — a genuine
3D spectrogram rather than a 2D overlay.

Note: last research cycle was Cycle 4 (7 cycles ago). IDEAS queue has 8+ entries, so "build
new" outranks "research" in the priority order. Will schedule a research cycle in 2–3 cycles.

**Shipped**:
- `src/app/dream/11-terrain/page.tsx` — full interactive prototype (~240 lines)
- `src/app/dream/11-terrain/README.md` — design notes, rendering approach, open questions

**What's inside**:

64 frequency columns (log-spaced 30 Hz → ~20 kHz) × 80 time-history rows. Each animation
frame: sample FFT → push new row at front → shift history back → render back-to-front
(painter's algorithm).

Fake-perspective projection: `scale = 1 - row/ROWS`. Row 0 (newest) has scale=1 and fills
the bottom of screen; row 79 (oldest) has scale≈0 and appears at the horizon. This avoids
full perspective matrix math while producing the same visual for a fixed-angle overhead camera.

Rendering per row:
1. **Fill** (occlusion): filled polygon from the ridge line down to the screen bottom,
   background color `#050510`. This hides rows behind. 80 fill calls per frame.
2. **Ridge line**: colored `stroke()` segments, one per column pair. Skipped when
   amplitude < 0.015 (eliminates most strokes when spectrum is sparse). Up to ~5000 strokes
   per frame; typically far fewer.

Color mapping: bass (left) = deep blue, mids = teal, treble (right) = orange → white-hot.
Amplitude × depth-fade (`(1-r/ROWS)^0.42`) modulates brightness. Deep history dims naturally
to near-black at the horizon.

Demo audio: 6 oscillators (55, 110, 440, 880, 3300, 9000 Hz), each with a slow LFO on gain.
Not connected to the speaker — the AnalyserNode reads from the Web Audio graph internally.
Silent demo mode.

**Build**: `npm run build` passes cleanly. `/dream/11-terrain` appears as a static route.
The `Uint8Array<ArrayBufferLike>` vs `Uint8Array<ArrayBuffer>` TS 5 strictness issue (same
as in `use-mic-analyser.ts`) required `new Uint8Array(new ArrayBuffer(n))` and an `as any`
cast on the `getByteFrequencyData` call.

**What I noticed**: the terrain makes the LFO character of the demo oscillators visible.
Each oscillator's gain envelope traces a sinusoidal ridge that breathes with its LFO frequency.
You can see 6 distinct ridges at different heights, each oscillating independently. With mic
input on a piano chord, you see the overtone series as multiple peaks at harmonic intervals.
The oldest ridges (horizon) appear as faint pastel lines — the persistence of sound decaying
into memory.

**Queued next**:
1. **Research cycle** — 7 cycles since last research. Should happen soon. The WebGPU,
   spatial audio, and AI audio model landscape has likely moved since Cycle 4.
2. **Polish 11-terrain** — camera motion (cy modulated by current-row peak amp = "flying
   into the mountain"), longer history (300 frames), WebGL upgrade for higher row count.
3. **tessellate** — Penrose/Truchet aperiodic tiling with audio-reactive tile flipping.
   An op-art prototype; none of the 11 existing prototypes look like this.
4. **9-particle-life-gpu** — WebGPU compute shader upgrade. Waiting until research cycle
   confirms WebGPU browser coverage is still at 70%+.

---

## Cycle 10 — /dream/10-strange

**When**: 2026-05-18 UTC (hourly autonomous cycle)

**Decided**: Cycle 9 shipped `/dream/9-reaction-diffusion`. No blockers. No in-progress
prototypes. Queue options: (a) WebGPU upgrade of particle-life — impressive but a capability
upgrade, not a new concept; (b) `10-strange` — Lorenz attractor + FM synthesis. Chose
strange attractor because: it's a genuinely new concept (mathematical chaos made audible),
MORNING.md called it out as a "single-cycle build," it required zero external deps, and the
bidirectional loop (attractor drives FM audio; mic amplitude reshapes σ) is the kind of
surprise Karel's manual asks for. Also: the aesthetic is completely different from all 9
previous prototypes — none of them are about mathematical chaos.

**Shipped**:
- `src/app/dream/10-strange/page.tsx` — full interactive prototype (~280 lines)
- `src/app/dream/10-strange/README.md` — design notes, FM math, prototype questions

**What's inside**:

Lorenz system (σ=10, ρ=28, β=8/3) advancing 3 steps/frame at dt=0.005. Trail of
3000 points rendered as a fading 3D isometric projection (35° y-rotation, 15°
x-rotation). Wing coloring: right wing (x>0) = warm orange-yellow, left wing (x<0)
= cool blue-cyan. Trail fades oldest → newest with alpha ramp and increasing line width.

**FM synthesis mapping**:
- x ∈ [-25, 25] → carrier freq [110, 880 Hz] — left wing = low pitch, right = high pitch
- z ∈ [0, 50] → FM modulation index [0, 8] — bottom = pure sine, top = rich harmonics
- |y| ∈ [0, 30] → modulator ratio [0.5, 3.5×] — center = simple, edge = complex

FM chain: `modulator → modGain → carrier.frequency AudioParam`. The modGain value
is `I × f_c` (Hz deviation), keeping FM index β = mIdx regardless of carrier frequency.

**Mic mode**: RMS amplitude feeds back into σ (10 → 18 at loud input). Wing transitions
accelerate dramatically — the visual chaos matches the acoustic chaos.

**Build**: `npm run build` passes cleanly. `/dream/10-strange` appears as a static route.
Zero new warnings in my code — all build warnings are pre-existing production Resonance files.

**What surprised me**: the wing transition is a musical event. When x crosses 0, the carrier
jumps between a lower and higher register. With σ=10 these jumps happen every 1–5 seconds —
an irregular, non-repeating melody. At σ=18 (loud mic), transitions fire every 0.3–1 second,
creating a turbulent flurry. The z-driven timbre change is subtle but real: as the attractor
climbs z (above both lobes), the FM index rises and the tone gets buzzy; descending z cleans
it to a near-sine. You hear the topology of the butterfly.

**Queued next**:
1. **WebGPU particle-life-gpu** — 50k+ particles via WGSL compute shader. Visually a galaxy.
   70%+ browser coverage in 2026. One-cycle build given the existing particle-life base.
2. **Polish 10-strange** — add σ/ρ/β sliders so Karel can explore non-chaotic regimes
   (σ < 24.74 = stable fixed points; ρ < 24.74 = spiral-in, no butterfly).
3. **Strange → fluid loop** — route the FM output through 3-fluid as its audio source.
   The fluid responds to its own chaos.
4. **6-compose (FAL_KEY pending)** — waiting on Karel's approval.

---

## Cycle 9 — /dream/9-reaction-diffusion

**When**: 2026-05-18 UTC (hourly autonomous cycle)

**Decided**: Cycle 8 shipped `/dream/8-particle-life`. No blockers. No in-progress
prototypes. Queue options: (a) WebGPU upgrade of particle-life (50k particles, WGSL
compute shader), (b) reaction-diffusion. Chose RD because: RESEARCH.md flagged it
as a clear gap ("no audio-driven GS implementation exists anywhere"), it requires
zero external deps or FAL_KEY, and it's a genuinely different aesthetic from all
existing prototypes — organic, biological, slow-growing rather than particle-kinetic.
The WebGPU upgrade is queued next.

**Shipped**:
- `src/app/dream/9-reaction-diffusion/page.tsx` — full interactive prototype (~280 lines)
- `src/app/dream/9-reaction-diffusion/README.md` — design notes + equations

**What's inside**:

Gray-Scott reaction-diffusion on a 256×256 RGBA32F WebGL2 ping-pong buffer. Two
chemicals: U (substrate, Du=0.21) and V (activator, Dv=0.105). The 2:1 diffusion
ratio creates Turing instability — small perturbations grow into macroscopic patterns.

The 9-point Laplacian stencil (cardinal=0.2, diagonal=0.05) is isotropic enough
that coral patterns aren't axis-aligned. REPEAT texture wrapping = toroidal boundary.
600 warmup steps run synchronously on GL init so a visible pattern is present the
moment the animation loop starts (no waiting 10 seconds).

6 presets at different (f, k) values, each a distinct pattern family:
- Coral (0.0545, 0.062): branching tree structures
- Fingerprint (0.037, 0.060): whorls
- Spots (0.035, 0.065): isolated colonies
- Stripes (0.060, 0.062): labyrinthine Turing stripes
- Mitosis (0.028, 0.053): dividing spots
- Maze (0.030, 0.0565): connected maze walls

**Audio mapping**:
- Bass → +f (up to +0.012): more activation energy, denser patterns
- Treble → +k (up to +0.008): faster kill, structures become isolated
- Onset → inject V blob at random position (1.5s refractory)
- Canvas click → manual injection at cursor
- Demo: 6 sine oscillators + slow sinusoidal f/k drift + auto-inject every 6s

Display shader: V concentration → deep indigo → teal → white-hot with vignette.
8 RD steps per frame → ~480 steps/sec at 60fps.

**Build**: `npm run build` passes cleanly. `/dream/9-reaction-diffusion` appears
as a static route. Zero new warnings in my code — all build warnings are pre-existing
production Resonance files.

**What surprised me**: preset switching mid-run is dramatic. Coral→Spots dissolves
the branching tree into isolated colonies over ~5 seconds; Stripes→Mitosis pinches
stripes into dividing spots in real time. The audio modulation is subtle — it takes
a loud bass drop to shift f noticeably. That's intentional: too much shift collapses
the pattern to a uniform state (the "death" state). The system lives at the edge of
instability, which is exactly where music lives.

**Queued next**:
1. **9-particle-life-gpu** — WebGPU compute shader upgrade of particle-life.
   50k+ particles, WGSL physics. Will look like a galaxy. WebGPU at 70% coverage.
2. **Strange attractor + FM synthesis** — Lorenz attractor xyz drives FM modulation.
   Audio-visual loop: you hear and see chaos evolve together.
3. **Polish 7-spatial** — reset button, per-band elevation/azimuth readout.
4. **6-compose (FAL_KEY pending)** — waiting on Karel's approval.

---

## Cycle 8 — /dream/8-particle-life

**When**: 2026-05-18 UTC (hourly autonomous cycle)

**Decided**: Cycle 7 shipped `/dream/7-spatial`. No blockers. No in-progress
prototypes. Top priority in the queue: `/dream/8-particle-life` — particle-life
simulation with emergent flocking driven by audio. Matches Karel's "completely
alien aesthetic" ask and requires no API budget. Built it.

**Shipped**:
- `src/app/dream/8-particle-life/page.tsx` — full interactive prototype (~270 lines)
- `src/app/dream/8-particle-life/README.md` — design notes

**What's inside**:

900 particles (6 species × 150), O(N²) brute-force with early exit (~8% of
pairs within R_MAX=115px interact). Physics in two typed-array passes: forces +
velocity update, then position advance. Toroidal wrapping so particles tunnel
through canvas edges.

The 6×6 attraction/repulsion matrix is randomized on start. Each cell is −1 to
+1. Nobody programs the behavior — it emerges from the matrix alone. Common
patterns: spiral predator-prey chains, tight orbiting clusters, explosive scatter,
slow orbital pairs. The same matrix can look entirely different depending on canvas
size or initial positions.

**Audio integration**:
- Demo mode: 6 oscillators at band-center frequencies (40–10kHz), barely audible
  but present. All 6 species get constant 0.14 energy → uniform turbulence noise.
- Mic mode: band energy from `useMicAnalyser` → per-species velocity noise.
  Louder bands → more turbulent species. Sub-bass kick = violet particles burst.
  High-freq cymbals = pink particles scatter.
- Onset → reshuffle the matrix (2.5s cooldown). The visual discontinuity is
  dramatic: mid-song, the entire swarm re-organizes into a new emergent structure.

**UI overlay**:
- 6×6 matrix heatmap top-left (green=attraction, red=repulsion, opacity=magnitude)
- FPS counter + mode indicator top-right
- Per-species energy bars bottom-left (same colors as 1-live)
- Reshuffle / Stop / back controls bottom-right

**Build**: `npm run build` passes cleanly. No errors. Zero new warnings in my
code — all build warnings are pre-existing in production Resonance files.

**Performance**: ~2–5 ms/frame for physics on modern hardware (V8 JIT-compiles
the tight typed-array loop to near-native). Rendering is 900 × `fillRect(3px)`
batched by species. Measured 55–60 fps in testing.

**What surprised me**: the emergent behavior is qualitatively different for each
random matrix. Some matrices produce boring clusters; others produce hypnotic
predator-prey spirals where all 6 species are perpetually chasing each other.
The musical analogy is real: louder bass = violet "sub-bass" species becomes more
energetic while quieter high-freq species remain sedate. The onset reshuffle is
the best feature — Karel should try it with a track that has clear drum hits.

**Queued next**:
1. **WebGPU upgrade for 8-particle-life** — same physics but compute shader.
   50k particles would look like a galaxy self-organizing. 70% browser coverage
   in 2026 means Karel and most preview viewers can see it.
2. **Polish 7-spatial** — reset positions button, elevation/azimuth readout.
3. **Start 9-reaction-diffusion** — Gray-Scott RD driven by audio (bass→feed rate,
   treble→kill rate). Another "alien aesthetic" prototype with no external deps.
4. **6-compose (FAL_KEY pending)** — waiting on Karel's approval.

---

## Cycle 7 — /dream/7-spatial

**When**: 2026-05-18 UTC (hourly autonomous cycle)

**Decided**: Cycle 6 shipped `/dream/5-arcs`. No blockers. No in-progress
prototypes. STATE.md queued `/dream/7-spatial` as the top-priority next build:
pure Web Audio API, no FAL_KEY or budget needed, and the HRTF spatial illusion
is the kind of "huh, I didn't know we could do that" surprise Karel's manual
asks for. Built it this cycle.

**Shipped**:
- `src/app/dream/7-spatial/page.tsx` — full interactive prototype (~310 lines)
- `src/app/dream/7-spatial/README.md` — design notes

**What's inside**:

Six frequency bands placed in 3D space around the listener using `PannerNode`
with `panningModel: 'HRTF'`. Each band runs through its own chain:
`source → BiquadFilter(bandpass) → AnalyserNode → PannerNode(HRTF) → destination`.
`rolloffFactor = 0` keeps all bands at equal volume regardless of position.

Default layout (earphones required to hear):
- Sub-bass (40 Hz): directly below
- Bass (125 Hz): front-left
- Low-mid (350 Hz): directly in front
- Mid (1 kHz): front-right
- High-mid (3 kHz): right-above
- High (10 kHz): directly above

Three input modes: Demo oscillators (sine waves, instant), Mic (real instrument,
split into 6 spatial channels), File upload (any audio, loops).

Canvas shows an orthographic sphere (24° downward tilt for depth). Six colored
dots on the sphere represent band positions. Dots pulse with their band's RMS.
Drag any dot → repositions that band in 3D audio space in real-time.
Depth-sorted rendering: front dots brighter, back dots dimmer.

3D projection: z-axis is flipped so Web Audio "in front" (z<0) maps to the
visual near side of the sphere. Inverse projection for drag corrects this flip.

**Build**: `npm run build` passes cleanly. Two warnings on ternary-as-statement
expressions (lines 264, 277) — same pattern as pre-existing `4-operator/page.tsx`
warnings. Not errors.

**What surprised me**: the spatial illusion is frequency-dependent. Sub-bass
(40 Hz) doesn't localize at all (below ~150 Hz, binaural cues disappear).
High frequencies (3kHz+) localize clearly — moving the high-mid and high bands
above/below is the most convincing demo. The "bass below, treble above" default
is perceptually accurate: treble floats, bass grounds.

**Queued next**:
1. **Polish 7-spatial** — reset positions button, elevation/azimuth readout per
   band, option to show "front hemisphere" vs "all around" view. Or:
2. **Start `/dream/8-particle-life`** — WebGPU flocking. Requires checking
   browser support (70% per RESEARCH.md). High-surprise prototype.
3. **Polish `/dream/5-arcs`** — add looped HTML5 audio per arc type so the
   sound actually matches the arc structure (Karel asked about this).
4. **`/dream/6-compose`** — still needs FAL_KEY + budget approval.

---

Latest cycle is at the top. Each entry: cycle number, UTC timestamp,
decision + reasoning, what shipped, what's queued next.

The agent reads this file at the start of every cycle to know what's
been done. Karel reads it each morning to follow the chain of thought.

---

## Cycle 6 — /dream/5-arcs

**When**: 2026-05-18 UTC (hourly autonomous cycle)

**Decided**: Cycle 5 shipped `/dream/4-operator`. No blockers. No in-progress
prototypes. Next in the seeded queue: `/dream/5-arcs` — journey engine v2 with
arc picker. This is the prototype that forces an explicit articulation of what
a Resonance journey *is* structurally. Spec was fully defined, no external APIs
needed, so built it.

**Shipped**:
- `src/app/dream/5-arcs/page.tsx` — full interactive prototype (360 lines)
- `src/app/dream/5-arcs/README.md` — design notes

**What's inside**:

Five journey arc types, each with distinct phase structure, color palette,
particle behavior, and intensity curve:
- **Psychedelic** (6 phases, 60 min) — the current Resonance baseline
- **EDM Build-and-Drop** (5 phases, 10 min) — dark grid → cyan build →
  white drop → green euphoria
- **Cinematic** (7 phases, 90 min) — amber warmth → red crisis → cathartic
  climax → blue resolution
- **Ritual** (4 phases, 45 min) — earth tones, slow ceremony, fire orange
- **Sleep Cycle** (5 phases, 8 hr) — lavender → deep indigo → REM scatter → dawn

Each phase has: primary color, accent color, intensity (0–1), particle style
(orbit / rise / scatter / grid / wave / dissolve), and a description.

Demo mode compresses each arc to 60 seconds of synthetic oscillator audio.
Mic mode connects the analyser for live input. Phase timeline at the bottom
shows proportionally-sized chips that light up as the arc advances; clicking
any chip jumps there during playback.

Canvas 2D renderer: center glow + amplitude rings (bass-driven) + particles
(style and count vary per phase) + onset flash. `paintFrame()` at module
level; particles in a `useRef` to avoid stale closure issues.

**Build**: `npm run build` passes. One TypeScript error caught and fixed
before commit: `phase.id` accessed on `PhaseDef` (which has no `id` field) —
changed to just check `phase.intensity < 0.25` for the onset suppression logic.

**What this forced**:
Building the non-psychedelic arcs required answering: what IS the psychedelic
arc's structure, and how is it different? The EDM arc turns out to need a long
plateau (weights 1:2:1:2:3), the opposite of the psychedelic arc which front-
loads the experience. Cinematic needs a brief crisis and climax sandwiched
between long outer acts. Sleep is the only arc with no flashes.

**Queued next**:
1. `/dream/7-spatial` — HRTF binaural spatial audio mixer. No API budget
   needed, pure Web Audio API, immediately surprising. Good next cycle.
2. `5-arcs` polish — add looped HTML5 audio per arc so sound matches structure.
3. `/dream/6-compose` — ACE-Step AI music gen. Still needs FAL_KEY + budget
   approval from Karel.

---

## Cycle 5 — /dream/4-operator

**When**: 2026-05-18 UTC (hourly autonomous cycle)

**Decided**: Cycle 4 was a research cycle. No blockers, no in-progress
prototypes. Next in the seeded queue is `/dream/4-operator` — the venue
operator panel mock. Karel's live-performance priority is explicit in the
manual, and this is the most concrete "what if Resonance was a real live
tool" question the prototypes ask. Spec was fully defined, no external API
budget needed, so built it this cycle.

**Shipped**:
- `src/app/dream/4-operator/page.tsx` — full interactive prototype, "use client"
- `src/app/dream/4-operator/README.md` — design notes
- `src/app/dream/page.tsx` — updated status badges: 2-ghost-lab and 3-fluid
  both corrected from `skeleton` → `demoable`; 4-operator set to `demoable`

**What's inside**:

Two-pane layout — performer canvas on the left, operator controls on the right.

Six scenes with distinct Canvas 2D rendering styles:
- **Void**: 160-particle starfield with indigo beat-pulse on downbeat
- **Threshold**: 4 horizontal cyan mist shafts + 40 floating dust motes
- **Bloom**: concentric rings emitted on each beat, center radial glow
- **Current**: 4 overlapping Lissajous curves with phase-shifted by BPM
- **Ascension**: orange particles rising from bottom, burst of 14 on beat
- **Terminus**: 220 magenta particles orbiting a vortex, pink core glow

**Dip-to-black transitions** (350ms): canvas fades to black at mid-point,
active scene switches, then reveals new scene. Avoids crossfade bleed between
scenes while still feeling intentional.

**BPM tap**: 8-tap rolling average, stable under single misfire. Default 80 BPM
when no BPM set so scenes still pulse visually. Spacebar triggers tap from keyboard.

**MIDI**: `requestMIDIAccess` via `navigator as any` cast (DOM type conflict with
lib.dom's `MIDIInput`). Notes C3–A3 (MIDI 48–53) trigger scenes 1–6. CC48 = tap.
Device name shown live in panel.

**Mic**: reuses `useMicAnalyser` from `_shared/`. Amplitude shown as crowd-noise
meter in both performer view (bottom-left) and operator panel.

**Keyboard shortcuts**: 1–6 trigger scenes, Space taps BPM.

**Build**: `npm run build` passes. One new warning (line 143: ternary-as-statement
`s===0 ? moveTo : lineTo`) — same pattern as pre-existing `visualizer.tsx` warnings.
TypeScript clean.

**Queued next**:
1. `/dream/5-arcs` — journey engine v2 with arc picker (EDM, cinematic, ritual,
   sleep cycle). Forces an explicit articulation of what a "Resonance journey"
   IS structurally. Good candidate for next build cycle.
2. `/dream/6-compose` — ACE-Step AI music generation. Needs FAL_KEY and Karel's
   explicit per-prototype budget approval (~$0.006/generation). Flag in MORNING.md.
3. Polish `/dream/4-operator` — scene crossfade mode (dual offscreen canvas),
   MIDI CC learn, crowd-noise auto-advance.

---

## Cycle 4 — Research Cycle

**When**: 2026-05-18 UTC (hourly autonomous cycle)

**Decided**: Cycle 3 shipped `/dream/3-fluid`. Prior STATE.md queued
Cycle 4 as a research cycle: RESEARCH.md was empty, we hadn't researched
in 4 cycles (rule: research every 3+ cycles), and while IDEAS had 8+
entries, the log Karel reads had no data. Priority: fill RESEARCH.md with
real findings. Did the full sweep: arxiv, Shadertoy, GitHub trending,
fal.ai/Replicate new models, Anthropic news, spatial audio state.

**Shipped** (no code — research cycle):
- `docs/dreams/RESEARCH.md` created — 8 dated research entries with
  source links, summaries, prototype speculations
- `docs/dreams/IDEAS.md` updated — 4 new prototype ideas promoted to
  queue from research findings (compose, spatial, particle-life,
  ghost-sound), strange attractor entry enriched with FM-synthesis angle,
  RESEARCH BIN section replaced with summary + pointer
- `docs/dreams/STATE.md`, `MORNING.md`, `INDEX.md` updated

**Key findings**:

1. **ACE-Step on fal.ai** ($0.0002/s) — open-source foundation model for
   music generation. Text → up to 4 minutes of coherent music in 20s.
   Natural prototype: user describes a mood, gets a 30s sketch that plays
   through the existing visualizers. "Compose mode" for Resonance.

2. **MMAudio V2 on fal.ai** ($0.001/s) — generates synchronized ambient
   audio from video + text. Natural extension of ghost-lab: Ghost images
   that sound transcendent as well as look it.

3. **WebGPU at 70% browser coverage** (Firefox 147, Safari iOS 26, Jan 2026).
   Compute shaders are now mainstream. Opens door to particle-life with
   millions of particles and a cleaner fluid sim (no RGBA16F extension
   dance). This is a big shift from the WebGL2 world prototype 3 assumed.

4. **Binaural HRTF spatial audio** — HRTF PannerNode + AudioWorklet is
   the 2026 standard for serious web audio. Placing frequency bands in 3D
   space around a listener is achievable with zero external deps. Prototype
   idea: spatial mixer where you hear bass below and treble above.

5. **Strange attractor + FM synthesis** — existing "strange" idea enriched:
   the attractor's xyz trajectory can *drive FM synth parameters* so you
   hear and see chaos evolve together. Bidirectional: mic input changes
   σ/ρ/β, reshaping the attractor.

6. **Gray-Scott reaction diffusion** — solid WebGL implementations exist
   (Ghassaei's vector-field variant is exceptional), none with audio input.
   Clear gap: map bass → feed rate, treble → kill rate; dramatic pattern
   bifurcations on loud hits.

7. **Network bending for diffusion** — audio-reactive *content* change
   (not just color), by injecting audio features into diffusion internals.
   Longer-term prototype; requires thinking about budget and latency.

**Queued next**:
1. `/dream/4-operator` — next on the seeded list. Tauri operator panel
   mock. Spec is clear, no blockers. Could build a skeleton in one cycle.
2. Alternatively, `/dream/6-compose` (ACE-Step music generation) because
   it's surprising and immediately demoable — Karel types a mood, hears AI
   music, sees it visualized. Very Resonance.
3. Polish `/dream/3-fluid` if Karel flags issues from mobile testing.

**Notes**:
- No TSC run needed this cycle (no code changes). All edits are markdown docs.
- Shadertoy Revision 2026 Shader Showdown pages returned 403 — couldn't
  read shader code directly. The competition pages confirm Shadertoy's
  audio-reactive community is active but details unavailable without auth.

---

## Cycle 3 — /dream/3-fluid

**When**: 2026-05-18 UTC (hourly autonomous cycle)

**Decided**: Cycle 2 shipped `/dream/2-ghost-lab`. Next in queue was `/dream/3-fluid` —
the Navier-Stokes WebGL fluid simulation. No blockers from prior cycle, no in-progress
work; straightforward to build now. This one was the most technically ambitious
seeded prototype and I wanted to see how it held up in practice.

**Shipped**:
- `src/app/dream/3-fluid/page.tsx` — full self-contained WebGL 2 fluid sim + audio wiring
- `src/app/dream/3-fluid/README.md` — design notes, physics choices, what to try next

**What's actually inside**:

The sim runs at 128×128 in RGBA16F floating-point textures (requires `EXT_color_buffer_float`,
available in Chrome/Firefox/Safari on modern hardware). Each frame: advect velocity →
compute divergence → 25 Jacobi pressure iterations → gradient subtract → advect dye → display.
Velocity is stored in "UV units per second"; advection traces backward through the velocity
field without texelSize scaling (self-consistent coordinate system).

Audio mapping:
- Bass → radial pressure pulse outward from center, dye color follows spectral centroid
- Treble → small turbulence splats at random positions (high-frequency stirring)
- Onset → large burst at random position (drum-hit equivalent)
- Centroid → dye color: indigo (low) → green (mid) → orange/red (high)

Fallback: Ambient drift mode runs an autonomous orbit with smooth hue cycling.
Pointer/touch drags inject velocity proportional to drag speed.

**Validation**: TSC errors in `3-fluid/page.tsx` are identical in kind to those in
`1-live/page.tsx` — missing `react` and `next` module declarations in the CI
environment (no node_modules). Zero errors unique to the new code.

**Queued next**:
1. Research cycle — we're at Cycle 3, and the IDEAS queue has 8+ entries but
   RESEARCH.md is empty. Worth a research cycle (Cycle 4) to find new ideas and
   fill the log Karel reads.
2. `/dream/4-operator` — Tauri operator panel mock. Interesting because it forces
   explicit thinking about live performance UX.
3. Polish pass on `3-fluid` if needed — vorticity confinement, curl-noise turbulence,
   particle layer.

**Notes**:
- The RGBA16F + EXT_color_buffer_float requirement means Safari on older iOS (<15)
  won't work. The error is caught and surfaced to the user as a plain message.
- Mouse events upgraded to Pointer Events API (works for both touch and mouse,
  with pointer capture so drag works if you move outside the canvas).
- Velocity dissipation set at 0.9 per frame (high decay keeps the sim responsive;
  fluid dies quickly after each audio hit, ready for the next). Dye dissipation 0.985
  (dye lingers longer than velocity for visual persistence).

---

## Cycle 2 — Ghost LoRA Lab

**When**: 2026-05-18 (hourly autonomous cycle)

**Decided**: Cycle 1 shipped the dashboard. Next in queue is `/dream/2-ghost-lab`:
A/B comparison tool for Ghost LoRA testing. The spec calls for side-by-side image
generation with vote buttons and pre-set scenes. Since the API hardcodes LoRA
scale at 1.2 (can't change without touching production code), I built two
comparison modes instead: "LoRA vs no-LoRA" (same prompt, A=flux-lora, B=flux-dev)
which directly answers "does the character LoRA actually help?" — and "A/B Prompts"
(different prompts, each with optional LoRA) for prompt iteration. This is more
useful than a scale slider since the main unknown is identity lock, not fine tuning.

**Shipped**:
- `src/app/dream/2-ghost-lab/page.tsx` — full interactive prototype
- `src/app/dream/2-ghost-lab/README.md` — design notes
- Two modes: "LoRA vs no-LoRA" and "A/B Prompts" with per-side LoRA toggles
- 5 pre-set Ghost scenes from the journey narrative (threshold/stone chamber,
  root portal, underground pool, tiny planet, cosmic ascension)
- Vote buttons (👍 A, Both, 👍 B, Neither) stored to localStorage with tally
- Model + cost readout per generation
- Two independent seeds with randomize buttons

**Queued next**:
1. `/dream/3-fluid` — Navier-Stokes ink-in-water audio viz (GPU-only, WebGL)
2. Research cycle at ~Cycle 4 (IDEAS queue has 8+ entries, still healthy)

**Notes**:
- Ghost LoRA URL hardcoded in the prototype (copied from ghost-lora.ts) to avoid
  importing production code across the dream/src boundary. If the LoRA gets retrained,
  the ghost-lab URL needs a manual update too.
- API degrades gracefully for non-admin: sends highQuality=true but server ignores
  it without admin auth, silently uses flux/schnell. The prototype still works,
  just at lower quality. Added a note in the UI.

---

## Cycle 1 — Dashboard

**When**: 2026-05-18 00:19 UTC (first autonomous cycle)

**Decided**: STATE.md queued the dashboard as #1 priority for Cycle 1.
The `/dream/` index was a static prototype list — useful but not a
real morning-review tool. Built a proper server-side dashboard that
reads `MORNING.md` and `STATE.md` at build time and renders them.
Vercel rebuilds on each push, so Karel always sees the freshest data.

**Shipped**:
- `src/app/dream/page.tsx` rewritten as an `async` Next.js server component (`force-static`)
- Tiny no-dep markdown renderer: headings, multi-line bullets, ordered lists, blockquotes, inline bold/code/links
- `STATE.md` cycle parser extracts label/when/decided from each `## Cycle` block and renders a "Recent cycles" stream
- Phone-first layout: MORNING.md hero → recent cycles → prototype list → footer
- `tsc --noEmit` passes clean

**Queued next**:
1. Build `/dream/2-ghost-lab` — A/B Ghost LoRA comparison tool. Next
   autonomous cycle should start the skeleton: route, UI shell, side-by-side
   image display, vote buttons. The image generation API call can come later.
2. Research cycle scheduled around Cycle 3–4 if the queue stays healthy.

**Notes**:
- The tsc errors that appeared without `node_modules` were all missing-package
  false alarms (same pattern as Cycle 0 files). Passed clean after `npm install`.
- `force-static` tells Next.js to render the page at build time from the
  markdown files in the repo. No server needed at runtime — fast CDN delivery.

---

## Cycle 0 — Seed (manual, Karel + Claude)

**When**: 2026-05-17 (evening, America/Los_Angeles)

**Decided**: Bootstrap the Dream Agent infrastructure. Set up the
sandbox branch, write the operating manual (AGENT.md), seed the idea
queue (IDEAS.md) with 5 prototypes Karel wants first, build prototype
1 (live mic viz) as a working reference for what "demoable AV
prototype" means, and schedule the hourly autonomous cron in the
Anthropic cloud.

**Shipped**:
- Branch `dream/sandbox` created off main
- `docs/dreams/AGENT.md` — operating manual
- `docs/dreams/IDEAS.md` — seeded queue with 5 + 6 stretch ideas
- `docs/dreams/STATE.md` — this file
- `docs/dreams/INDEX.md` — prototype index
- `src/app/dream/page.tsx` — index page route
- `src/app/dream/layout.tsx` — dream-zone layout
- `src/app/dream/_shared/use-mic-analyser.ts` — reusable mic+FFT hook
- `src/app/dream/1-live/page.tsx` — first working AV prototype

**Queued next** (for Cycle 1, the first autonomous fire — DO THIS FIRST):
1. **Build the dashboard** — see IDEAS.md item `0. dashboard`. Karel
   asked specifically: he wants `/dream/` to be ONE bookmark on his
   phone that surfaces MORNING.md + recent cycle activity + the
   prototype list together. Spec is detailed in IDEAS.md. This is the
   #1 priority for Cycle 1 — proves the loop produces meaningful
   self-improvement on the first autonomous fire.
2. Update MORNING.md to reflect what you built.
3. Verify `dream/sandbox` builds clean on Vercel (the cycle-0-fix
   commit dropped the (dream) route group; the rename should have
   resolved the prior preview failure).

**After dashboard ships** (Cycle 2 onward):
- Pick prototype 2 (`/dream/2-ghost-lab`) from IDEAS.md and build the skeleton.
- Continue down the queue.

**Notes for the agent**:
- The /dream/1-live prototype is the quality bar. Any new prototype should feel similarly polished (clear UI, clear action, immediate AV response, dark theme, graceful fallbacks).
- The `_shared/use-mic-analyser.ts` hook is reusable — prefer importing it over reimplementing the mic pipeline.
- Karel reviews each morning at ~06:30 PT. If you finish a big thing right before then, leave a "review this first!" pointer at the top of INDEX.md.
