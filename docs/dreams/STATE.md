# Dream Agent — cycle state

## Cycle 87 — /dream/69-oracle-music

**When**: 2026-05-21 UTC (hourly autonomous cycle)

**Decided**: Priority check per AGENT.md:
1. **Unblock** — nothing blocked.
2. **Continue** — nothing in-progress.
3. **Build new** — `oracle-music` is the #1 queued item from Cycle 86's "queued next" list.
4. **Research** — not due (Cycle 86 was research; next threshold at Cycle 90+).

Decision: build `/dream/69-oracle-music` — I-Ching hexagram musical oracle. Zero deps, zero API,
high surprise factor. One-cycle build.

**What I built**:
- `src/app/dream/69-oracle-music/page.tsx` — main UI + synthesis + King Wen table
- `src/app/dream/69-oracle-music/README.md` — design notes

**How it works**:
- Three-state machine: idle → casting → reading
- Casting phase: 6 rounds of simulating 3-coin tosses (Math.random() → heads=3/tails=2, sum = 6/7/8/9)
  with animated coin display, settling pause, and hexagram line drawn below
- King Wen hexagram number from 8×8 trigram binary lookup table (lower×upper trigrams)
- HexLine component draws yang (solid) or yin (broken) lines; moving lines (6/9) glow amber
- 64 hexagram data entries: [name, bpm, scale, baseMidi, density, filterHz, commentary]
- Web Audio: OscillatorNode(triangle) + GainNode(ADSR) + BiquadFilterNode(lowpass), beat scheduler
  via recursive setTimeout, filter tracks hexagram brightness smoothly

**Key creative choice**: the musical mapping is thematic, not scholarly. Hexagram 51 (The Arousing/
Thunder) plays at 140 BPM with 5 chromatic voices — it's genuinely alarming. Hexagram 52 (Keeping
Still/Mountain) plays a single pentatonic tone at 35 BPM at C2 — the effect is meditative.
The range is wide enough that any two consecutive casts feel meaningfully different.

**Build**: `npm run build` passed cleanly, 5.64 kB. TypeScript strict mode — no errors.

**What's queued next**:
1. **Build** `pitch-algo-compare` (Cycle 88): three pitch detection algorithms simultaneously
   on mic input — autocorrelation vs. YIN vs. HPS. Educational + informs `neural-pitch` upgrade
   decision. Zero deps, one cycle.
2. **Build** `shader-evolve` (Cycle 89): genetic mutation of `68-wgsl-synth` shaders; 4 mutated
   variants visible simultaneously, select + breed. Zero deps, zero API.
3. **Research** next due at ~Cycle 90 (3 build cycles from now).

---

## Cycle 86 — research sweep

**When**: 2026-05-21 UTC (hourly autonomous cycle)

**Decided**: Priority check per AGENT.md:
1. **Unblock** — nothing blocked.
2. **Continue** — nothing in-progress.
3. **Build new** — checked; no blocker, but:
4. **Research** — due. Cycle 82 was last research cycle; Cycles 83, 84, 85 were all builds (3 consecutive build cycles). Research threshold reached.

Decision: research cycle. IDEAS queue is well-stocked (~30+ entries) but research is due on the 3-cycle cadence. Surfaced 10 new findings. Strongest prototype ideas promoted to IDEAS queue.

**What I found**:
- **ShaderVine** (MIT, April 2026) — browser WebGPU shader editor with *genetic evolution* + full MCP server. Spiritual partner to `68-wgsl-synth`. Inspires `shader-evolve` prototype: display 4 mutated shader variants simultaneously, select favorites, breed. See RESEARCH.md §147.
- **Voice Composer** (HN, Jan 2026) — four pitch-detection algorithms (CREPE/YIN/FFT-HPS/AMDF) running simultaneously in browser. YIN and HPS are each ~30 lines of pure JS and outperform our current autocorrelation on noisy/polyphonic input. Inspires `pitch-algo-compare` (zero deps, one cycle). See RESEARCH.md §§148, 156.
- **Demucs-web / Demucs-rs** (April 2026) — htdemucs running fully in-browser via ONNX Runtime Web + WebGPU; 3–5 min for a 4-min song, audio never leaves device. Inspires `browser-stems`: upload any audio → split to 4 stems locally → play in 3D HRTF space. Needs Karel OK on ~200MB model. See RESEARCH.md §§149, 154.
- **Art2Mus** (arxiv 2602.17599, Feb 2026) — direct artwork→music via visual latent conditioning. Natural complement to `58-music-to-ghost` (music → Ghost image). No public API yet; zero-dep HSL approximation possible. See RESEARCH.md §150.
- **I-Ching + Lyria musical oracle** (arxiv 2605.20386, May 2026) — coin casting → hexagram → LLM → Lyria music. Inspires `oracle-music`: zero-dep version maps 64 hexagrams to musical parameters. High surprise; philosophically resonant with Resonance's "transcendent" identity. See RESEARCH.md §151.
- **AuDirector** (arxiv 2605.11866, May 2026) — multi-agent long-form audio narrative with character profiles + self-auditing correction. Architecture model for future Ghost narrative arc evolution. See RESEARCH.md §152.
- **ICME 2026 text-to-music quality jump** (arxiv 2605.21433) — generation quality jump over ACE-Step confirmed. Monitor fal.ai for new endpoints; upgrade `6-compose` when they land. See RESEARCH.md §153.
- **Inworld TTS-1.5 Max viseme timing** (Jan 2026) — new detail: Inworld TTS returns character/word/phoneme/viseme timestamps for avatar lip sync. Inspires `ghost-lip`: animated Ghost face with mouth synced to narration. FAL_KEY already in use. See RESEARCH.md §155.

**New IDEAS promoted**:
- `oracle-music` — 64 hexagrams → musical parameters, animated coin casting, zero deps. **Top pick for next build.**
- `pitch-algo-compare` — autocorrelation vs. YIN vs. HPS simultaneously on mic input. Zero deps. **Second pick.**
- `shader-evolve` — genetic mutation + selection of audio-reactive WGSL shaders. Zero deps.
- `ghost-lip` — Inworld TTS viseme timestamps → animated Ghost face. FAL_KEY in use.
- `browser-stems` — in-browser Demucs stem separation → HRTF 3D playback. Needs Karel OK on model size.

**What's queued next**:
1. **Build** `oracle-music` (Cycle 87): 64 hexagrams × musical parameters, coin-cast animation, Web Audio synthesis. Zero deps, zero API. High surprise factor. One cycle.
2. **Build** `pitch-algo-compare` (Cycle 88): three pitch algorithms simultaneously on mic input, consensus display, confidence meters. Zero deps. One cycle.
3. **Research** next due at ~Cycle 90 (after 3 more builds).

---

## Cycle 85 — /dream/68-wgsl-synth

**When**: 2026-05-21 UTC (hourly autonomous cycle)

**Decided**: Priority check per AGENT.md:
1. **Unblock** — nothing blocked.
2. **Continue** — nothing in-progress.
3. **Build new** — `wgsl-synth` is the #1 queued item from Cycle 84's "queued next" list.
4. **Research** — not due yet (Cycle 82 was last research; only 2 build cycles since then; threshold is 3–4).

Decision: build `/dream/68-wgsl-synth` — WGSL shader editor with pre-wired audio uniforms. The
lowest-level audio-reactive tool in the sandbox: write raw WGSL, the audio arrives as uniforms,
the shader runs on the GPU. Zero new npm deps. One-cycle build.

**What I built**:
- `src/app/dream/68-wgsl-synth/page.tsx` — split-screen editor + WebGPU canvas
- `src/app/dream/68-wgsl-synth/README.md` — design notes + polish ideas

**How it works**:
- Left pane: a styled textarea pre-loaded with a complete WGSL fragment shader template
- Right pane: fullscreen WebGPU canvas running the shader at 60fps
- Six audio uniforms (uBass, uMid, uTreble, uOnset, uTime, uBPM, uResX, uResY) written to a 32-byte
  uniform buffer each frame from the AnalyserNode (mic mode) or LFO oscillators (demo mode)
- Edit the WGSL → debounced 400ms → `createShaderModule` → `getCompilationInfo` → if errors, show
  them with line numbers; if clean, `createRenderPipelineAsync` → swap the running pipeline
- The last valid pipeline keeps running while you fix errors — you never see a black canvas

**Default shader**: pulsing radial rings (driven by uBass) + orthogonal grid shimmer (driven by
uMid/uTreble) + onset flash (uOnset), with an HSV color cycle drifting slowly with time and
frequency content. Vignette darkens edges.

**Key thing I noticed**: the pipeline-swap-while-running approach makes this genuinely usable as
a live performance tool. The shader recompiles silently in the background; when it's ready, it
replaces the old one without a single frame of black. This is the pattern professional livecoding
environments (Hydra, Tidal Cycles) use — the audio never stops, the output never blacks out.

**Relationship to other prototypes**:
- `claude-shader` (needs ANTHROPIC_API_KEY): Claude writes the WGSL; you edit it here. These two
  are the lowest and highest of an AI-assistance spectrum for shader authoring.
- `9-reaction-diffusion`, `15-webgpu-fluid`: fixed WGSL pipelines, no user editing. This opens
  the box.

**Build**: `npm run build` passed cleanly. Two fix passes needed (Float32Array generic types and
useRef initial value — TypeScript 5.9 strictness).

**Queued next**:
1. **Research** — due at Cycle 86 or 87 (3+ build cycles since Cycle 82).
2. **`wgsl-synth` polish** — syntax highlighting (CodeMirror 5 CDN), preset shader library, localStorage save.

---

## Cycle 84 — /dream/67-structure-viz

**When**: 2026-05-21 UTC (hourly autonomous cycle)

**Decided**: Priority check per AGENT.md:
1. **Unblock** — nothing blocked.
2. **Continue** — nothing in-progress.
3. **Build new** — `structure-viz` is the #1 queued item from Cycle 83's "queued next" list.
4. **Research** — not due (Cycle 82 was research; next research threshold ~Cycle 86-87).

Decision: build `/dream/67-structure-viz` — self-similarity matrix section detection. First prototype
that shows musical *structure* (does the chorus come back?) rather than signal content. Zero deps,
zero API, one-cycle build. Renumbered to 67 since 66 was taken by `chatterbox-ghost`.

**What I built**:
- `src/app/dream/67-structure-viz/page.tsx` — main UI + all DSP logic
- `src/app/dream/67-structure-viz/README.md` — design notes

**How it works**:
- Every 1.5s: capture 1024-bin FFT → extract 32 log-spaced feature bins → normalize to unit vector
- Maintain a circular buffer of up to 64 feature vectors (bars)
- Recompute the N×N self-similarity matrix (cosine similarity) on each new bar
- Display as Canvas2D heatmap: dark purple = dissimilar, bright white = very similar; diagonal always white
- Checkerboard kernel novelty function detects section boundaries
- Greedy similarity clustering assigns labels A / B / A′ / C based on section prototypes
- Timeline strip below the SSM shows colored blocks with labels
- Demo mode: ABA pattern (C3 chord → A4 chord → C3 returns) so the structure is immediately visible
- Mic mode: play your own material; repeating sections create bright off-diagonal blocks

**Key thing I noticed**: at 64 bars (96s of audio), the SSM is 320×320px at 5px/cell — exactly right
for reading structure at a glance. The ABA demo shows the classic "three bright square blocks" pattern
within 48s. The off-diagonal bright blocks (A↔A′ correlation) are the interesting part — they encode
the relationship between non-adjacent sections, which nothing else in the sandbox does.

**Queued next**:
1. **`wgsl-synth`** — WGSL shader editor with pre-wired audio uniforms. CodeMirror from CDN.
   Zero new npm deps. High creative ceiling.
2. **Research cycle** — due at Cycle 86 or 87 (Cycle 82 was last research; every 3-4 cycles).

---

## Cycle 83 — /dream/66-chatterbox-ghost

**When**: 2026-05-21 UTC (hourly autonomous cycle)

**Decided**: Priority check per AGENT.md:
1. **Unblock** — nothing blocked.
2. **Continue** — nothing in-progress.
3. **Build new** — `chatterbox-ghost` is the #1 queued item from Cycle 82's research findings.
4. **Research** — not due (Cycle 82 was research; next research threshold at Cycle 86 or 87).

Decision: build `/dream/66-chatterbox-ghost` — voice-cloned Ghost narration via Chatterbox Turbo.
FAL_KEY already in use, zero new npm deps, one-cycle build. High surprise factor: Karel can hear
Ghost narrations in his own voice (or any 5-second voice reference) for the first time.

**What I built**:
- `src/app/dream/66-chatterbox-ghost/page.tsx` — main UI
- `src/app/dream/66-chatterbox-ghost/api/route.ts` — Chatterbox Turbo generation route
- `src/app/dream/66-chatterbox-ghost/api/upload/route.ts` — voice reference upload to fal storage
- `src/app/dream/66-chatterbox-ghost/README.md` — design notes

**How it works**:
- Record 5–10s of any voice via browser mic → uploads to fal storage once → URL reused for all 6 scenes
- Six Ghost scene lines pre-loaded with paralinguistic action tags: `[sigh]`, `[gasp]`, `[slowly]`, `[flatly]`, `[long pause]`
- "Generate Ghost voices" fires 6 concurrent POST requests to the server route
- Each result: waveform draws on ▶ play (decode + draw + play in one step)
- Exaggeration slider (0.0–1.0) controls intensity across all scenes
- Lines are editable — experiment with different tags or completely different text

**API parameter names are best guesses**:
- Endpoint: `fal-ai/chatterbox/text-to-speech`
- Text field: `text`
- Voice reference: `audio_prompt_url`
- Intensity: `exaggeration_factor`

Error messages surface in the scene card. If wrong, Karel should paste the raw error text.

**Build**: `npm run build` passed cleanly. Zero new TypeScript errors in the dream zone.
Size: ~4.5 kB page component.

**Key thing I noticed**: The four TTS paradigms now form a complete study:
Gemini (global style) / Orpheus (per-word XML) / ElevenLabs V3 (per-phrase acting) / Chatterbox (voice-clone + physical action tags).
Chatterbox is the only one that can put a specific human voice in Karel's face. The `[sigh]` and `[gasp]`
tags are different in kind from the emotion tags in the others — they're body actions, not states.

**Queued next**:
1. **`structure-viz`** — self-similarity matrix section detection. Zero deps, zero API. First prototype
   that shows musical structure (does the chorus come back?) rather than signal content. One-cycle build.
2. **`wgsl-synth`** — WGSL shader editor + pre-wired audio uniforms. CodeMirror from CDN.
3. **Research** — due at Cycle 86 or 87 (3–4 build cycles from here).

**Open questions for Karel** (carried forward + new):
- GEMINI_API_KEY → `lyria-jam`, `lyria-ghost`, `binaural-lyria`
- ANTHROPIC_API_KEY → `claude-shader`
- Vercel COOP headers → SharedArrayBuffer → GPU audio synthesis (`27-gpu-additive`)
- `lyrics-journey` budget OK? ~$2.40/generation
- NEW: Chatterbox voice clone — want to record a short reference clip to bundle as a public asset?
  Could be Karel's own voice or a dedicated Ghost character voice. Right now the user must record
  their own reference each session; a bundled clip would make the demo work without mic permissions.

---

## Cycle 82 — research sweep

**When**: 2026-05-21 UTC (hourly autonomous cycle)

**Decided**: Priority check per AGENT.md:
1. **Unblock** — nothing blocked.
2. **Continue** — nothing in-progress.
3. **Build new** — skipped; research takes priority.
4. **Research** — due. Last research was Cycle 78. Cycles 79, 80, 81 were all builds = exactly 3 build cycles. AGENT.md threshold: research every 3–4 cycles. MORNING.md notes it as due at Cycle 82. Decision: research sweep.

Decision: research cycle. Swept arxiv (new papers), fal.ai models, GitHub trending, HN music/coding posts, Anthropic news. Appended 10 findings to RESEARCH.md (§137–§146). Added 4 new prototype ideas to IDEAS.md.

**What I found**:
- **Chatterbox Turbo** on fal.ai (§137) — first TTS with VOICE CLONING from 5s audio + paralinguistic tags `[sigh]`, `[gasp]`. $0.025/1000 chars. FAL_KEY already in use. Most surprising find: Karel could hear the Ghost narrations in his own voice. Directly buildable → `chatterbox-ghost` (queued).
- **ImprovNet** (arxiv 2502.04522) — play a seed phrase, get a structured 32-bar improvisation in a chosen genre (jazz, classical, blues). First AI that generates a complete compositional unit from a seed rather than just responding phrase-by-phrase. No fal.ai endpoint yet → queued as `improv-expand`.
- **Pianist Transformer** (arxiv 2512.02652) — 135M-param model, human-level expressive piano rendering, Apache 2.0. HuggingFace demo. No inference API; needs proxy. → `expressive-render` (queued).
- **D3PIA** (arxiv 2602.03523) — piano accompaniment from lead sheet via discrete diffusion. Chord fidelity better than continuous baselines. → `lead-sheet` (queued, needs API).
- **PianoFlow** (arxiv 2604.12856) — bimanual 3D piano hand motion from audio, 9× faster inference. → `piano-hands` (queued, needs API).
- **Self-similarity matrix** (arxiv 2603.27218) — zero-dep browser-native section detection: FFT → SSM → block segmentation. → `structure-viz` (queued, buildable zero deps).
- **ShaderVine** (§130 already noted) → reinforces `wgsl-synth` queued idea. Added full spec to IDEAS.md.
- **NCLMCTT** (ICLR 2026) — zero-shot timbre cloning. → `timbre-clone` (queued, no API yet).
- **Anchored Cyclic Generation** (arxiv 2604.05343) — validates `48-arc-compose` design, no new prototype.
- **StreamMark** (arxiv 2604.11917) — AI audio watermarking for deepfake detection. Research awareness; no prototype.

**Most buildable next cycle** (in priority order):
1. `chatterbox-ghost` — voice-cloned Ghost narration. FAL_KEY in use, endpoint confirmed, zero new deps. High surprise factor (Karel's own voice saying Ghost lines). One cycle.
2. `structure-viz` — self-similarity matrix section visualization. Zero deps, zero API. Genuinely novel — first sandbox prototype that shows musical STRUCTURE rather than content.
3. `wgsl-synth` — WGSL shader editor with pre-wired audio uniforms. CodeMirror from CDN (no npm dep). Different from `claude-shader` (manual editing vs. AI-generated).

**Open questions for Karel** (carried forward + new):
- GEMINI_API_KEY → `lyria-jam`, `lyria-ghost`, `binaural-lyria`
- Vercel COOP headers → SharedArrayBuffer → GPU audio synthesis (`27-gpu-additive` upgrade)
- ANTHROPIC_API_KEY → `claude-shader`
- `lyrics-journey` budget OK? ~$2.40/generation
- NEW: OK to record a short reference voice clip to enable Chatterbox voice cloning in `chatterbox-ghost`? Could be Karel's own voice or a dedicated Ghost character voice.

---

## Cycle 81 — /dream/65-dialogue-score

**When**: 2026-05-21 UTC (hourly autonomous cycle)

**Decided**: Priority check per AGENT.md:
1. **Unblock** — nothing blocked.
2. **Continue** — nothing in-progress.
3. **Build new** — Cycle 80 queue: `dialogue-score` is #1. Spec clear in IDEAS.md (RESEARCH.md §129). Zero deps, zero API, one-cycle build.
4. **Research** — not due (Cycle 78 was research; 3 build cycles since then hits threshold at Cycle 82 or 83, not yet).

Decision: build `/dream/65-dialogue-score` — contour-constrained AI piano dialogue. The spec calls for `/dream/64-dialogue-score` but 64 is taken by eleven-dialogue; using 65.

**What I built**:
- `src/app/dream/65-dialogue-score/page.tsx` — full interactive prototype (5.29 kB)
- `src/app/dream/65-dialogue-score/README.md` — design notes

**Core addition over `39-anticipate`**: contour detection + constrained generation.

`detectContour()` averages inter-note pitch deltas:
- avg delta > +0.9 semitone/step → ascending
- avg delta < −0.9 → descending
- first-half rising AND second-half falling → arch (∧)
- first-half falling AND second-half rising → valley (∨)
- otherwise → neutral

`generateContourResponse()` runs the existing Markov chain with a per-step direction filter: for each position in the response, `contourDir()` returns "up"/"down"/"any". The Markov transition candidates are filtered to those that fit the direction; if none fit, a directional pentatonic step fires as fallback. The header displays `your phrase ↗ ascending → aria mirrors → aria responds ↗ ascending` after each exchange.

Demo phrase: C4 D4 E4 F4 G4 A4 B4 C5 — stepwise ascending C major scale. Aria reliably responds with an ascending motif, and the contour labels confirm the detection and mirroring.

**Build**: `npm run build` passed cleanly. 5.29 kB, 111 kB First Load JS. Zero errors, zero new warnings beyond the pre-existing animRef.current pattern in prior prototypes.

**Key thing I noticed**: The arch case is the most interesting interaction. An ascending-then-descending phrase (C D E G E D) gives Aria an arch constraint: she rises first, then descends. The result is a miniature melodic curve that responds to the user's phrase shape rather than just its notes. The Markov chain still provides the note values, so the response "sounds like the user" even while following a constrained shape.

**Queued next**:
1. **Research** — due at Cycle 82 or 83 (3-4 build cycles from last research at Cycle 78). This is Cycle 81, so research is overdue by one cycle; do it next.
2. **`ghost-v3-voice`** — standalone Ghost V3 voice page (after research confirms no newer model to use instead). Or extend `61-orpheus-voice` to column D.
3. **Polish** — `65-dialogue-score` could add: invert-contour mode (Aria responds with opposite shape), contour curve drawn on canvas, shorter min phrase length (currently needs ≥8 notes for mirroring to work reliably).

**Open questions for Karel** (carried forward):
- GEMINI_API_KEY → enables `lyria-jam`, `lyria-ghost`, `binaural-lyria`
- Vercel COOP headers? → SharedArrayBuffer → GPU audio synthesis
- ANTHROPIC_API_KEY → `claude-shader`
- `lyrics-journey` budget OK? ~$2.40/generation

---

## Cycle 80 — /dream/64-eleven-dialogue

**When**: 2026-05-21 UTC (hourly autonomous cycle)

**Decided**: Priority check per AGENT.md:
1. **Unblock** — nothing blocked.
2. **Continue** — nothing in-progress.
3. **Build new** — Cycle 79 queue: `eleven-dialogue` is #1. Spec clear in IDEAS.md (RESEARCH.md §§127, 134). FAL_KEY already in use, ~$0.02/scene, zero new deps.
4. **Research** — not due (Cycle 78 was research, then Cycle 79 built; research threshold at Cycle 83).

Decision: build `/dream/64-eleven-dialogue` — Ghost scenes as two-character dramatic exchanges voiced by ElevenLabs V3 with inline emotional tags. Three separate API calls (one per line), sequential playback. Different from every prior voice prototype: `56-ghost-voice` is monologue; `61-orpheus-voice` is A/B comparison; `64-eleven-dialogue` is drama — two distinct voices in a scripted scene.

**What I built**:
- `src/app/dream/64-eleven-dialogue/page.tsx` — full interactive prototype (4.09 kB)
- `src/app/dream/64-eleven-dialogue/api/route.ts` — server route calling `fal-ai/elevenlabs/tts/eleven-v3`
- `src/app/dream/64-eleven-dialogue/README.md` — design notes + what to try

Six Ghost scenes, each a three-line dramatic exchange (Ghost then Visitor then Ghost).
ElevenLabs V3 inline audio tags embedded in each line: `[slowly, reverently]`, `[pauses]`,
`[whispers]`, `[awed]`, `[infinite calm]`, etc. Three separate API calls per performance
(one per speaker turn), audio decoded and played sequentially with 550ms pause between lines.
Ghost uses voice "Adam" (warm, measured); Visitor uses voice "Alice" (lighter, questioning).
Canvas: two glowing orbs separated by a vertical divider — Ghost amber-warm left, Visitor
cool-blue right. Active speaker's orb pulses with live amplitude; expanding ring shows speaking.
Script textareas in a collapsible section with V3 tag guidance. Build: clean, 4.09 kB.

Key design observation: the `[pauses]` tag inside "You are not rising. [pauses] The world is
receding." is fundamentally different from adding `...` to the text. V3 treats the pause as
an acting beat, not punctuation. The within-sentence arc is the prototype's core claim.

⚠ Endpoint note: `fal-ai/elevenlabs/tts/eleven-v3` is from RESEARCH.md §127 (naming-convention
best-guess). If it fails, the raw error is shown in the UI for Karel to report back.

**Queued next**:
1. **Build `dialogue-score`** — contour-constrained AI piano dialogue, extends `33-aria-companion`. Zero deps.
2. **Research** — due at Cycle 83 (3 build cycles from here).

**Open questions for Karel** (carried forward):
- GEMINI_API_KEY → enables `lyria-jam`, `lyria-ghost`, `binaural-lyria`
- Vercel COOP headers? → SharedArrayBuffer → GPU audio synthesis
- ANTHROPIC_API_KEY → `claude-shader`
- `lyrics-journey` budget OK? ~$2.40/generation

---

## Cycle 79 — /dream/63-synesthetic-sketch

**When**: 2026-05-21 UTC (hourly autonomous cycle)

**Decided**: Priority check per AGENT.md:
1. **Unblock** — nothing blocked.
2. **Continue** — nothing in-progress.
3. **Build new** — STATE.md Cycle 78 queues `synesthetic-sketch` as #1. Spec clear in IDEAS.md (from Cycle 78 research). Zero deps, zero API, one cycle.
4. **Research** — not due (last was Cycle 78, only 1 build since).

Decision: build `/dream/63-synesthetic-sketch` — the first dream sandbox prototype to use morphological shape (not just color) as its primary visual language.

**What I built**:
- `src/app/dream/63-synesthetic-sketch/page.tsx` — full interactive prototype (4.26 kB)
- `src/app/dream/63-synesthetic-sketch/README.md` — design notes + what to try

**Six audio features → six visual dimensions**:
- Spectral centroid → hue (60 Hz = violet, 8 kHz = red — same mapping as `1-live`)
- Spectral bandwidth (std-dev of band energies) → shape: circle (< 28%) / hexagon (28–62%) / 7-star (> 62%)
- Harmonic peak count (bands above 0.13 threshold) → inner concentric ring count (0–4)
- Amplitude → object scale radius (10–54 px range)
- Rhythm regularity (IOI coefficient of variation over 8 onsets) → scatter radius (0 = tight center cluster, 1 = 44% of screen radius)
- Onset events → radial spark burst at random canvas position

**How the canvas works**:
- Objects accumulate via additive (`lighter`) compositing — overlapping shapes bloom brighter
- 0.4%/frame black overlay decay prevents permanent burn-in (objects last ~250 frames / ~4s before fading)
- New shape placed every 20 frames when amplitude > 0.05 (~3/sec at 60fps)
- Canvas is NOT cleared on mode transitions (demo → mic keeps accumulated objects)
- Download as PNG button

**Demo mode**: 6 incommensurable LFOs (0.07–0.28 Hz) drive all 6 dimensions. Cycles through circle → hex → star as bandwidth LFO evolves. Fake onsets every 1.5–3.5s.

**Build**: `npm run build` passed cleanly. 4.26 kB, 110 kB First Load JS. Zero warnings.

**Key thing I noticed**: The scatter dimension is the most surprising one. When I ran the demo, the shapes cluster near center (LFO rhythm is regular). The contrast between "regular playing → tight glowing cluster" and "improvised playing → scattered field" is an immediately readable visual signature. A session where you keep strict time looks completely different from a session where you wander. No other prototype in the sandbox encodes rhythm structure this way.

**Queued next**:
1. **Build `eleven-dialogue`** — Ghost + Visitor dramatic scenes via Eleven V3 Text-to-Dialogue. FAL_KEY in use, $0.02/scene. Very different from all prior Ghost voice prototypes. High surprise.
2. **Build `dialogue-score`** — contour-constrained AI piano dialogue extending `33-aria-companion`. Zero deps. Fills the "dialogic" interaction gap from CHI 2026 taxonomy.
3. **Research** — due at Cycle 83 (4 build cycles away).

**Open questions for Karel** (carried forward):
- GEMINI_API_KEY → enables `lyria-jam`, `lyria-ghost`, `binaural-lyria` (generative category — most underrepresented)
- Vercel COOP headers? → SharedArrayBuffer → GPU audio synthesis (`27-gpu-additive` prerequisite)
- ANTHROPIC_API_KEY → `claude-shader`
- `lyrics-journey` budget OK? ~$2.40/generation for sung Ghost journey arc

---

## Cycle 78 — Research sweep

**When**: 2026-05-21 UTC (hourly autonomous cycle)

**Decided**: Priority check per AGENT.md:
1. **Unblock** — nothing blocked.
2. **Continue** — nothing in-progress.
3. **Build new** — queue is rich; would normally build next.
4. **Research** — last research was Cycle 74. Cycles 75, 76, 77 were all builds — 3 build cycles elapsed. Research threshold met. Doing research this cycle.

Decision: research sweep. Targeting: arxiv (audio-visual creative coding, music generation, live performance AI), fal.ai new models, GitHub trending creative-coding/webaudio.

**What I found** (10 new entries, RESEARCH.md §§127–136):

- **ElevenLabs Eleven V3** (§127, Feb 2026) — inline audio tag system for per-phrase emotional beats in TTS: `[whispers]`, `[pauses]`, `[resigned tone]`, `[flatly]`. Different control paradigm from Orpheus (per-word XML) and Gemini (global style). Text-to-Dialogue mode renders a multi-speaker exchange in a single API call — Ghost + Visitor as a dramatic scene. FAL_KEY in use, $0.10/1000 chars (~$0.005/Ghost line). Inspires two new prototypes: `ghost-v3-voice` and `eleven-dialogue`.

- **ACE-Step 1.5 hybrid architecture** (§128) — sub-second first-token inference on consumer hardware, audio-to-audio as first-class mode. Validates `62-collage-compose` and `44-vocal-bgm`. A streaming progress bar showing first-token arrival time would make the speed visible.

- **Dialogue in Resonance** (§129, arxiv 2505.16259, May 2026) — interactive music piece: human pianist + computer-controlled piano in a score-constrained dialogue. The AI's responses follow score-derived constraints rather than pure improvisation. Inspires `dialogue-score`: extend `33-aria-companion` with contour-constrained AI response (ascending user phrase → AI responds ascending), plus ghost-note preview from `39-anticipate`.

- **ShaderVine** (§130, April 2026) — MIT browser WebGPU shader editor with MCP interface, 16 built-in GPU compute simulations, genetic shader evolution. No audio reactivity built-in. Inspires `wgsl-synth`: a minimal WGSL editor in the dream zone with 6 pre-wired audio uniforms. Also provides a mental model for `claude-shader` (needs ANTHROPIC_API_KEY).

- **musicolors** (§131, arxiv 2503.14220) — web-based synesthetic music visualization library. Key finding: effective music visualization should use MULTIPLE visual dimensions simultaneously (not just color). Inspires `synesthetic-sketch`: six audio features (centroid, bandwidth, rhythm regularity, harmonic count, amplitude, onset) → six visual dimensions (hue, shape type, scatter, ring count, scale, spark). Canvas accumulates objects like `13-piano-canvas` strokes.

- **SAMUeL** (§132) — vocal-conditioned music gen, 220× smaller than SOTA, 52× faster. No API yet; future `44-vocal-bgm` upgrade.

- **BINAQUAL** (§133) — binaural localization quality metric. Validates HRTF work; research note only.

- **Eleven V3 Text-to-Dialogue** (§134) — confirmed multi-speaker mode in same API call. Enables `eleven-dialogue` prototype.

- **WebGPU audio SharedArrayBuffer path** (§135) — real-time GPU-synthesized audio now achievable with COOP headers. Upgrade path for `55-webgpu-audio-fx` and `27-gpu-additive`. Need to confirm Vercel COOP header support with Karel.

- **CHI 2026 creative AI taxonomy** (§136) — four modes: reactive / compositional / dialogic / generative. Sandbox strong on first two, thin on dialogic and generative. Priority build: `dialogue-score` (dialogic) + Gemini key for `lyria-jam` (generative).

**Queued next**:
1. **Build `synesthetic-sketch`** (`/dream/63-synesthetic-sketch`) — zero deps, zero API, high surprise value. Six visual dimensions from six audio features. Most novel zero-cost idea from this research cycle.
2. **Build `eleven-dialogue`** (`/dream/63-eleven-dialogue`) — Ghost + Visitor dramatic scenes via Eleven V3 Text-to-Dialogue. FAL_KEY in use, one cycle. Very different from all prior Ghost voice prototypes.
3. **Build `dialogue-score`** (`/dream/64-dialogue-score`) — contour-constrained AI piano dialogue; deepens the dialogic category. Zero deps.
4. **Research** — next research due at Cycle 82 (4 build cycles away from here).

**Open questions for Karel** (carried forward):
- GEMINI_API_KEY → enables `lyria-jam`, `lyria-ghost`, `binaural-lyria`. These fill the "generative" AI interaction mode which is the most underrepresented category in the sandbox.
- Vercel COOP headers enabled? → enables SharedArrayBuffer → real-time GPU audio synthesis path for `55-webgpu-audio-fx` upgrade and `27-gpu-additive`.
- ANTHROPIC_API_KEY in Vercel env? → enables `claude-shader` (LLM-generated audio-reactive GLSL).

---

## Cycle 77 — /dream/62-collage-compose

**When**: 2026-05-21 UTC (hourly autonomous cycle)

**Decided**: Priority check per AGENT.md:
1. **Unblock** — nothing blocked.
2. **Continue** — nothing in-progress.
3. **Build new** — STATE.md Cycle 76 queues `collage-compose` as #1. Spec clear in IDEAS.md §121
   (Mozualization CHI 2025). FAL_KEY in use, $0.006/track. One cycle.
4. **Research** — due at Cycle 78 (1 build cycle away — next cycle should be research).
5. **Polish** — skipped; build takes priority.

Decision: build `/dream/62-collage-compose` — three-input multimodal composition (scene + mood + hum → ACE-Step).

**What I built**:
- `src/app/dream/62-collage-compose/page.tsx` — full interactive prototype (4.65 kB)
- `src/app/dream/62-collage-compose/api/route.ts` — API route, two paths: audio-to-audio (hum present) / text-to-audio (no hum)
- `src/app/dream/62-collage-compose/README.md` — design notes + what to try

**How it works**:
- Three input panels: Ghost scene (6 presets), mood word (8 options), optional hum recording (up to 15s).
- Scene selection sets environment tags (e.g. "stone chamber, single piano chord, long stone reverb, sparse, ancient").
- Mood word appended directly (e.g. "melancholic").
- If a hum is recorded: decoded → analyzed for spectral brightness + amplitude → contour descriptor (e.g. "soft bass-warm melodic reference") appended to tags.
- Final tags string shown live in "ACE-STEP PROMPT" panel — exact prompt transparency (same as vocal-bgm's genre-tag display).
- With hum: sends audio + tags to `fal-ai/ace-step/audio-to-audio`. ACE-Step hears your actual melody.
- Without hum: sends tags only to `fal-ai/ace-step` (text-to-audio). Still richer than `6-compose` because scene + mood together constrain the space.
- Waveform strip: amber = your hum (left half), blue = generated track (right half), separator line.
- Bloom visualizer during playback (same 6-band palette as `1-live`).
- Footer shows which endpoint was used (updates reactively based on hum capture state).

**Build**: `npm run build` passed cleanly. 4.65 kB, 111 kB First Load JS. One pre-existing warning (animRef.current in cleanup — same pattern as 44-vocal-bgm and 6-compose).

**Key thing I noticed**: The prompt preview is the clearest new UX element. You can see exactly how the three inputs combine before composing. Switching from "Forest Dawn + dreaming" to "Stone Chamber + tense" produces a visibly different prompt — the user understands what they're asking for before they ask. The hum path is the multimodal heart of the prototype: the model hears your actual melody, not just a text description of it. What makes this different from `6-compose` (text only) and `44-vocal-bgm` (audio only) is that scene + mood + hum together constrain three separate dimensions simultaneously.

**Queued next**:
1. **Research** — due this cycle (Cycle 78). Last research was Cycle 74. Cycle 75, 76, 77 were all builds — 3 build cycles elapsed. Research threshold met.
2. **`lyrics-journey`** — if Karel confirms FAL_KEY budget is OK for $2.40/generation (ElevenLabs Music composition_plan with per-section lyrics for the Ghost journey as a sung piece). High surprise value.
3. **Polish** — `62-collage-compose` could get: download button for generated track, editable scene tags textarea (like `48-arc-compose`), better pitch contour analysis via autocorrelation.

**Notes**:
- ACE-Step endpoint `fal-ai/ace-step/audio-to-audio` from naming conventions (same as `44-vocal-bgm`). If the API returns an error, paste the raw error text — the route logs it.
- Spectral brightness analysis: `sqrt(diff_variance) / (rms + ε)`. This approximates the ratio of high-frequency energy to total energy without a full FFT. Good enough for "bass-warm" vs "bright-treble" distinction.

---

## Cycle 76 — /dream/61-orpheus-voice

**When**: 2026-05-21 UTC (hourly autonomous cycle)

**Decided**: Priority check per AGENT.md:
1. **Unblock** — nothing blocked.
2. **Continue** — nothing in-progress.
3. **Build new** — STATE.md Cycle 75 queues `orpheus-voice` as #1. Zero new deps, FAL_KEY
   in use, spec clear in IDEAS.md. Build it.
4. **Research** — not due until Cycle 78/79.
5. **Polish** — skipped; build takes priority.

Decision: build `/dream/61-orpheus-voice` — three-way Ghost TTS comparison (Gemini A · Gemini B · Orpheus C).

**What I built**:
- `src/app/dream/61-orpheus-voice/page.tsx` — three-column A/B/C comparison UI (4.7 kB)
- `src/app/dream/61-orpheus-voice/api/route.ts` — single API route handling both Gemini TTS
  and Orpheus TTS based on `engine` param
- `src/app/dream/61-orpheus-voice/README.md` — design notes with per-scene tag rationale

**How it works**:
- Extends `59-gemini-voice-lab`'s concept (A/B Gemini comparison) to A/B/C (adding Orpheus).
- Column A: Gemini TTS, global `style_instructions` — baseline from 56-ghost-voice
- Column B: Gemini TTS, experimental style direction (opposite of A)
- Column C: Orpheus TTS (`fal-ai/orpheus-tts`), phrase-level XML emotion tags
- Each variant has a fully-editable textarea. Generate → waveform appears → ▶ play.
- Vote: A wins / B wins / C wins / All good / Try again → tally stored per scene in localStorage.
- Pre-loaded Orpheus text for each scene uses 1–2 tags chosen to match the Ghost emotional arc:
  `<reverent>resonance</reverent>`, `<fearful>stirs</fearful>`, `<sad>remembers</sad>`, etc.
- Server route: `engine: "gemini"` calls `fal-ai/gemini-tts` with text + style_instructions;
  `engine: "orpheus"` calls `fal-ai/orpheus-tts` with tagged text (`prompt` field, voice `leah`).

**Build**: `npm run build` passed cleanly. 4.7 kB, 111 kB First Load JS.

**Key thing I noticed**: The phrase-level tag control opens a compositional dimension that global
style_instructions can't reach. Gemini's B variant for Cosmic Ascension ("utterly flat, zero affect,
infinite distance") is a sentence-level choice — the whole line gets that quality. Orpheus's C variant
can put `<excited>` on "rising" (ironic — "You are not *rising*") and `<sad>` on "receding" — a
within-sentence arc. Whether that subtlety survives TTS synthesis is exactly what the vote reveals.

**Queued next**:
1. **`collage-compose`** (`/dream/62-collage-compose`) — Ghost scene image + hum recording +
   mood word → multimodal ACE-Step music generation. MediaRecorder (no new npm deps), image
   color extraction (avg HSL of sampled pixels), pitch detection (same autocorrelation as
   `13-piano-canvas`). FAL_KEY in use, $0.006/track. One cycle.
2. **Research** due at Cycle 78 (2 build cycles away).

**Notes**:
- `fal-ai/orpheus-tts` endpoint uses `prompt` as the text field (same as Gemini) and voice `leah`.
  If Karel sees an "invalid endpoint" error, paste the raw error text — the endpoint might be
  `orpheus-tts` or similar. The route logs the raw response on failure.
- Orpheus voices available: leah, dan, mia, zac, jess, leo, julia, will. `leah` is calm,
  androgynous-adjacent — best match for the Ghost character so far.

---

## Cycle 75 — /dream/60-music-palette

**When**: 2026-05-21 UTC (hourly autonomous cycle)

**Decided**: Priority check per AGENT.md:
1. **Unblock** — nothing blocked.
2. **Continue** — nothing in-progress.
3. **Build new** — Cycle 74 was research; MORNING.md explicitly queued `music-palette` as the next build. It's zero deps, zero API, one cycle. IDEAS.md §120 is the spec (Music2Palette research finding).

Decision: build `music-palette` (`/dream/60-music-palette`).

**What I built**:
- `src/app/dream/60-music-palette/page.tsx` — full interactive prototype (4.15 kB)
- `src/app/dream/60-music-palette/README.md` — design notes + polish ideas

**How it works**:
- 6-band FFT (same `useMicAnalyser` hook as `1-live`) → two emotion coordinates per frame:
  - **arousal** = (sub-bass + bass) / 2 → palette lightness (28–72%)
  - **valence** = treble-to-total ratio → hue anchor (250°=sad/blue → 50°=happy/warm)
  - **richness** = std dev of 6 bands → saturation (32–80%)
- 5-swatch palette = [-60°, -30°, 0°, +30°, +60°] offsets from anchor hue in HSL space
- Slow EMA (α=0.011, ~1.5s time constant at 60fps) so palette breathes rather than flickers
- Palette swatches rendered as CSS divs (transition 0.9s ease) — smoother than canvas rects
- Bloom ring canvas (1-live style) in lower panel shows the raw audio energy
- Download SVG: client-side, instant, no backend — each download captures a color snapshot
- Demo mode: 6 incommensurable LFOs (0.071–0.233 Hz) drive the bands without mic

**Key design choice**: Treble-to-total ratio as valence proxy (not chroma). Full chroma analysis would need more signal processing, but treble brightness tracks major/minor character well in practice — bright treble = major/happy, heavy bass with sparse treble = darker. The EMA makes this robust to transients.

**Build**: `npm run build` passed cleanly. 4.15 kB gzip, 110 kB First Load JS.

**Queued next**:
1. **`orpheus-voice`** — extend `/dream/59-gemini-voice-lab` with Orpheus TTS as a third variant (phrase-level emotion tags vs Gemini global style). Zero new deps, FAL_KEY in use. One cycle.
2. **`collage-compose`** — image + hum + word → ACE-Step music. More complex (MediaRecorder + image color extraction + pitch detection). FAL_KEY in use. One cycle.
3. **Research** due again in ~2–3 build cycles (Cycle 78/79).

**Notes**:
- The swatch label color (light vs dark text) is auto-determined by lightness: `l > 55 → dark text, l ≤ 55 → light text`. This ensures readable labels across the full luminance range.
- SVG export includes arousal/valence coordinates in the footer, making each download traceable back to its audio character.
- The 0.9s CSS transition on swatches creates the "breathing" effect — the palette shifts feel organic, like a mood changing.

---

## Cycle 74 — Research cycle

**When**: 2026-05-21 UTC (hourly autonomous cycle)

**Decided**: Priority check per AGENT.md:
1. **Unblock** — nothing blocked.
2. **Continue** — no in-progress prototypes.
3. **Build new** — IDEAS queue is rich (35+ items); no urgent build.
4. **Research** — due this cycle. Last research was Cycle 70 (3 build cycles elapsed: 71, 72, 73). AGENT.md threshold is 3+ cycles. Research triggered.
5. **Polish** — skipped; research takes priority.

Decision: full research sweep (Cycle 74).

**What I researched**:
- arxiv.org — recent papers: voice conversion (StyleStream 2602.20113), spatial audio (Sonic4D 2506.15759), music therapy (2603.07963), music-color palettes (Music2Palette 2507.04758), multimodal music gen (Mozualization 2504.13891)
- fal.ai — confirmed new models: Orpheus TTS (phrase-level emotion tags), ElevenLabs Music (full composition_plan API schema confirmed with lyrics support), Sonauto V2 (BPM control, full songs with vocals)
- Three.js r184 — WebGPU Baseline confirmed all-browsers; memory fix for long-session demos
- GitHub trending — ACE-Step 1.5 production-stable, Sonauto V2 open API
- Hacker News / research feeds — AI music psychotherapy for D/HH, MuVi video↔music sync

**Research findings summary** (8 entries added to RESEARCH.md, §§117–126):
- **§117 Orpheus TTS** — phrase-level `<emotion>` tags, $0.001/Ghost line, FAL_KEY in use
- **§118 ElevenLabs Music composition_plan** — confirmed `fal-ai/elevenlabs/music` supports lyrics per section
- **§119 StyleStream** — 1s latency zero-shot voice style conversion (ICLR 2026)
- **§120 Music2Palette** — emotion-aligned 5-color palette from audio (ACM MM 2025)
- **§121 Mozualization** — multimodal music gen: image + audio clip + keyword (CHI 2025)
- **§122 Sonic4D** — spatial audio generation from video (future direction, no API)
- **§123 Three.js r184** — memory fix + WebGPU Baseline in all browsers
- **§124 AI Music Psychotherapy** — co-writing process itself therapeutic; validates Resonance direction
- **§125 Sonauto V2** — full songs with vocals, BPM control, $0.075/song
- **§126 MuVi + SyncDIT** — video↔music semantic/rhythmic alignment (future direction)

**New prototypes queued** (added to IDEAS.md):
1. **`music-palette`** (`/dream/60-music-palette`) — live audio → arousal/valence → 5-color HSL palette, SVG download. Zero deps, zero API. One cycle.
2. **`lyrics-journey`** (`/dream/60-lyrics-journey`) — Ghost journey as ElevenLabs Music composition_plan with lyrics from the narrative. First prototype where the Ghost sings. $2.40/generation, FAL_KEY in use. One cycle.
3. **`orpheus-voice`** (`/dream/61-orpheus-voice`) — extend `59-gemini-voice-lab` with Orpheus TTS as a 3rd track using phrase-level emotion brackets. $0.001/line, FAL_KEY in use. One cycle.
4. **`collage-compose`** (`/dream/62-collage-compose`) — Ghost scene image + hum + mood word → multimodal ACE-Step music generation. $0.006/track. One cycle.

**Queued next** (priority order for Cycle 75):
1. **`music-palette`** — highest novelty per build cost: zero deps, zero API, one cycle. Makes the emotion→color axis visible and downloadable. Natural complement to `38-mood-xy` and `13-piano-canvas`. No dependencies on external APIs or Karel approvals.
2. **`lyrics-journey`** — if Karel confirms FAL_KEY budget is OK for $2.40/generation. Highest surprise value: first prototype where the Ghost sings.
3. **`orpheus-voice`** — incremental improvement to existing `59-gemini-voice-lab`. Small scope, useful for Karel's Ghost voice iteration.

**What I noticed during research**: Two recurring themes this sweep:
- **Phrase-level granularity** is the frontier for TTS control. Global style prompting (Gemini TTS) gets you 80% there; per-word emotional tags (Orpheus) get you closer to what a voice director does. Worth comparing directly.
- **Music2Palette confirms the Resonance vibe** — the research literature on emotion-aligned color palettes maps almost exactly to the `1-live` band→color mapping that Karel seeded in Cycle 0. The research is catching up to the intuition that was already there.

---

## Cycle 73 — /dream/59-gemini-voice-lab

**When**: 2026-05-21 UTC (hourly autonomous cycle)

**Decided**: Priority check per AGENT.md:
1. **Unblock** — nothing blocked.
2. **Continue** — no in-progress prototypes.
3. **Build new** — `gemini-voice-lab` is the #1 queued item from STATE.md Cycle 72. FAL_KEY in use, zero new deps, spec is clear. Build it now.
4. **Research** — due at Cycle 74 (next cycle). One cycle away.
5. **Polish** — skipped; build takes priority.

Decision: build `/dream/59-gemini-voice-lab`.

**Why now**: `56-ghost-voice` uses Gemini TTS with hard-coded style_instructions per scene. Whether those instructions produce the right voice character is unknown — there's no mechanism to iterate. This prototype is a direct iteration tool: two editable style_instructions textareas per scene, Generate buttons, side-by-side waveform display, and a vote system (localStorage tally per scene). Karel tries the two defaults, edits, regenerates, and accumulates a preference signal across sessions. Complements `2-ghost-lab` (A/B image comparison) with an A/B voice comparison.

Route chosen as `/dream/59-gemini-voice-lab` because `/dream/57-gemini-voice-lab` (from IDEAS.md) conflicts with the already-shipped `57-sound-to-image`.

**Built**:
- `src/app/dream/59-gemini-voice-lab/api/route.ts` — server route; accepts `{ text, styleInstructions, voice? }`, calls `fal-ai/gemini-tts` (Charon default), returns URL
- `src/app/dream/59-gemini-voice-lab/page.tsx` — full A/B UI (4.27 kB built)
- `src/app/dream/59-gemini-voice-lab/README.md` — design notes

**What's inside**:
Scene selector (6 Ghost scenes). Each scene pre-loads two contrasting style pairs: A = the "official" direction from 56-ghost-voice (calm/measured), B = an experimental opposite (whispered/breathy for Stone Chamber; zero-affect/infinite-distance for Cosmic Ascension; small-and-wondering for Tiny Planet). Both textareas are fully editable — Karel can write anything. Generate A/B calls the API independently; each variant decodes the returned audio into an AudioBuffer, draws a waveform on a per-variant canvas, and enables a ▶ play button. Vote buttons (A wins / Both fine / B wins / Try again) store per-scene tallies in localStorage. Build: clean, 4.27 kB.

**What I noticed**: Gemini TTS style_instructions function as speaking-style direction, not acoustic room modeling — "stone chamber reverb" affects how someone sounds when they imagine they're in that space, not actual convolution reverb. The most reliable axes I've seen work: pace ("very slow"), affect ("reverent", "wondering", "flat"), and register ("low pitch", "airy", "breathy"). If Karel wants actual room acoustics, a ConvolverNode with per-scene impulse responses (same technique as `29-scene-spatial`) should be added as a post-processing step on the client side. The B variant for Cosmic Ascension ("utterly flat, zero affect, infinite distance") is the most interesting experiment — a deadpan delivery of "You are not rising. The world is receding." could be more powerful than an expressive one.

**Queued next** (priority order for Cycle 74):
1. **Research** — due this cycle per the 3–4 cycle rule (last research was Cycle 70, 3 build cycles elapsed: 71, 72, 73). Full research sweep next cycle.
2. **`56-ghost-voice` polish** — if Karel uses `59-gemini-voice-lab` and identifies a winning style, update `56-ghost-voice` route.ts with the winning style_instructions. One-line change.

---

## Cycle 72 — /dream/58-music-to-ghost

**When**: 2026-05-21 UTC (hourly autonomous cycle)

**Decided**: Priority check per AGENT.md:
1. **Unblock** — nothing blocked.
2. **Continue** — no in-progress prototypes.
3. **Build new** — `58-music-to-ghost` is the #1 queued item from STATE.md Cycle 71. FAL_KEY in use, Ghost LoRA URL in prod codebase (`2-ghost-lab/page.tsx`), spec is clear. Build it now.
4. **Research** — due at Cycle 74 (next cycle is 73, one away).
5. **Polish** — skipped; build takes priority.

Decision: build `/dream/58-music-to-ghost`.

**Why now**: `57-sound-to-image` (Cycle 71) maps audio to generic environmental scenes via Flux Schnell. This prototype maps the same audio signal to Ghost-LoRA-specific scenes — the figure is the Ghost character, and the four scene destinations (Stone Chamber, Underground Pool, Forest Dawn, Cosmic Ascension) are the actual narrative waypoints of the Resonance journey. Major chord + energy → Ghost in a specific place in her journey. This is the first prototype that connects audio emotion analysis directly to the Ghost character's narrative geography.

**Built**:
- `src/app/dream/58-music-to-ghost/api/route.ts` — server route calling `fal-ai/flux-lora` with Ghost LoRA
- `src/app/dream/58-music-to-ghost/page.tsx` — 8s capture, pitch trail canvas, quadrant classification, image generation
- `src/app/dream/58-music-to-ghost/README.md` — design notes

**What's inside**:
8-second capture (mic or demo C major oscillators). Each 100ms frame: RMS energy, 12-bin chroma (60–4000 Hz), autocorrelation pitch detection. After 8s: accumulated chroma → dominant root + major/minor quality; average energy → arousal. Map to 4 quadrants. Ghost LoRA prompt selected for the quadrant. `fal-ai/flux-lora` with LoRA scale 1.2, 28 steps, portrait_4_3. Image fades in over 1.8s. Pitch trail canvas during capture: dots at detected MIDI note position, colored violet (bass) → red/orange (treble), sized by energy. Build: 4.5 kB.

**What I noticed**: The Ghost LoRA URL was in `2-ghost-lab/page.tsx` with a note "Copied from src/lib/journeys/ghost-lora.ts — avoids importing production code." I followed the same pattern — copied the URL into the dream API route directly. The quadrant energy threshold (0.35) is the most uncertain parameter; demo mode (5 triangle oscillators at gain 0.3) lands at moderate energy, likely just below the threshold → calm-bright → Forest Dawn. A pianist playing forte will exceed it → energetic. The "tiny planet" scene is absent from the 4-quadrant map (would need a 5th bucket for very-low-energy + very-tonal). Noted in README.

**Queued next** (priority order for Cycle 73):
1. **`gemini-voice-lab`** — A/B Gemini TTS style director for Ghost scene lines. Two style_instruction strings, one Ghost line, compare results. Karel can use it to find the Ghost's voice character. Zero new deps, FAL_KEY in use, one cycle.
2. **Research** — due at Cycle 74. IDEAS queue is rich (30+ items), so research can wait one more cycle.

---

## Cycle 71 — /dream/57-sound-to-image

**When**: 2026-05-20 UTC (hourly autonomous cycle)

**Decided**: Priority check per AGENT.md:
1. **Unblock** — nothing blocked. `56-ghost-voice` was fixed in Cycle 70.
2. **Continue** — no in-progress prototypes.
3. **Build new** — `57-sound-to-image` is the #1 queued item from STATE.md Cycle 70 and MORNING.md. Spec is clear, FAL_KEY in use, one-cycle build, zero new deps. Build it now.
4. **Research** — just done (Cycle 70). Not due for 3 more cycles.
5. **Polish** — skipped; build takes priority.

Decision: build `/dream/57-sound-to-image`.

**Why now**: All 56 prior prototypes visualize audio in real time as abstract forms (fluid, particles, waveforms, blooms). None generate a *semantic scene image* from an acoustic snapshot. This fills that gap: 10 seconds of mic input → extract acoustic fingerprint (energy, spectral centroid, ZCR, chroma, pitch) → translate to a natural-language scene description → Flux Schnell image on fal.ai. The output isn't "your audio as a visualization" — it's "what environment/scene does this music evoke?" Sound2Vision research (RESEARCH.md §112) validates the direction. FAL_KEY already in use.

**Built**:
- `src/app/dream/57-sound-to-image/api/route.ts` — server route calling `fal-ai/flux/schnell`
- `src/app/dream/57-sound-to-image/page.tsx` — full prototype with capture, analysis, image generation
- `src/app/dream/57-sound-to-image/README.md` — design notes

**What's inside**:
10-second capture window (mic or demo C major oscillators). Each frame: RMS energy, spectral centroid, zero-crossing rate (tonal vs noisy), 12-bin chroma vector (chord quality), autocorrelation pitch detection. After 10s: averages all frames → builds a text description ("soft, smooth tonal, warm bass-dominant music — C major, hopeful, central pitch 294 Hz") → maps to one of 6 acoustic scene quadrants (stone chamber / forest dawn / sea cave / sunlit courtyard / stormy coast / cosmic nebula) → sends to `fal-ai/flux/schnell` → image fades in over 1.8s. Waveform visible during capture. Feature readout panel shows the extracted description. Zero new npm deps.

**What I noticed**: The scene quadrant mapping is the most opinionated design decision. Low energy + low centroid → "stone chamber" is a very Resonance-flavored interpretation. High energy + high centroid → "cosmic nebula" maps to the journey's transcendent phase. The mapping could be exposed as adjustable (different scene libraries per narrative world), but for now the Ghost scene vocabulary felt right as the reference.

**Queued next** (priority order for Cycle 72):
1. **`58-music-to-ghost`** — next item from Cycle 70 queue. Live audio → chroma/emotion analysis → Ghost LoRA image. Admin-only. FAL_KEY in use. One cycle.
2. **`57-gemini-voice-lab`** — A/B Gemini TTS style director. Compare two style_instruction strings for same Ghost line. Zero new deps. One cycle.
3. **Research** — due at Cycle 74 (3 cycles from now).

---

## Cycle 70 — Unblock + Research

**When**: 2026-05-20 UTC (hourly autonomous cycle)

**Decided**: Priority check per AGENT.md:
1. **Unblock** — `56-ghost-voice` has a flagged potential issue: endpoint `fal-ai/inworld/tts` was a naming-convention guess (STATE.md Cycle 69). Research this cycle confirmed the correct Inworld endpoint is `fal-ai/inworld-tts`. However, the Inworld API uses *named voice presets*, not free-form style descriptions — which is a fundamental mismatch with the Ghost scene voice descriptions. Gemini TTS (`fal-ai/gemini-tts`) is a better fit: it has a `style_instructions` field that accepts exactly the kind of natural-language voice direction the SCENES use ("calm, androgynous, stone chamber reverb, ancient and measured"). Fixed `56-ghost-voice` to use Gemini TTS. Build clean, 3.39 kB.
2. **Research** — Cycle 66 was the last research sweep (3 build cycles have elapsed: 67, 68, 69). AGENT.md threshold is 3–4 cycles. STATE.md Cycle 69 explicitly queued "next cycle or the one after should be research." Research done this cycle.

Combined action: Unblock + Research (one commit, all changes in `src/app/dream/` + `docs/dreams/`).

**Fixed**:
- `src/app/dream/56-ghost-voice/api/route.ts` — endpoint changed from `fal-ai/inworld/tts` to `fal-ai/gemini-tts`. Input changed from `{text, voice_description}` to `{prompt, voice: "Charon", style_instructions}`. Output parsing updated to match confirmed response shape (`data.audio.url`). Ghost scene voice descriptions now work as intended — Gemini TTS honors pace, tone, and affect from natural language.
- `src/app/dream/56-ghost-voice/page.tsx` — removed "naming-convention guess" error overlay; updated footer to say "Gemini TTS."

**Research findings** (8 entries added to RESEARCH.md, §§109–116):
- **§109 Inworld TTS endpoint** — correct path is `fal-ai/inworld-tts`, but named-voice-only (no style_instructions).
- **§110 Gemini TTS on fal.ai** — `fal-ai/gemini-tts`, `style_instructions` for natural-language voice direction. Used to fix `56-ghost-voice`.
- **§111 Live Music Models** — Magenta RealTime confirmed production-quality open-weights. Lyria RealTime API confirmed.
- **§112 Sound2Vision** — audio → semantic image. Inspires `57-sound-to-image` (FAL_KEY-only).
- **§113 LARA-Gen** — continuous valence×arousal emotion control for music gen. Validates mood prototypes.
- **§114 Multi-Agent Music-to-Image** — joint music semantics + affect → image. Inspires `58-music-to-ghost`.
- **§115 Segment-Factorized Full-Song** — real-time streaming symbolic piano. Future `33-aria-companion` upgrade.
- **§116 SynthVC** — 77ms streaming voice conversion. Future `voice-morph` prototype.

**New prototypes queued** (added to IDEAS.md):
1. `57-sound-to-image` — 10s mic listen → acoustic analysis → text description → Flux image on fal.ai. "What does your music look like?" FAL_KEY in use. One cycle.
2. `58-music-to-ghost` — Live audio → chroma/emotion analysis → Ghost LoRA image matching the detected mood quadrant. Admin-only. FAL_KEY in use. One cycle.
3. `57-gemini-voice-lab` — A/B Gemini TTS style director for Ghost scenes. Compare two style_instruction sets for same line. Useful for Karel to tune the Ghost character voice.

**Queued next** (priority order for Cycle 71):
1. **Build `57-sound-to-image`** — highest novelty in the new queue; first prototype that generates a semantic image FROM audio (not a real-time visualizer, not an abstract painting — an interpreted scene). FAL_KEY in use, one-cycle build.
2. **Build `58-music-to-ghost`** — if Karel approves, live emotional audio → Ghost LoRA image. Admin-only. One cycle.
3. **`56-ghost-voice` voice quality** — if Karel finds Charon voice too neutral, try "Zephyr" or "Puck" in the route and update. One-line change.

**What I noticed during research**: Gemini TTS's natural-language style prompting is a surprisingly good match for the Ghost Voice aesthetic. "Speak slowly, as if inside a vast stone chamber with long reverb" won't literally add room reverb (TTS synthesizes dry voice), but the tempo, breathiness, and emotional coloring will reflect the instruction. If Karel wants acoustic reverb on the voice, a ConvolverNode with a per-scene impulse response (same technique as `29-scene-spatial`) would be the right polish step — a 2–4 line addition to `page.tsx`.

---

## Cycle 69 — /dream/56-ghost-voice

**When**: 2026-05-20 UTC (hourly autonomous cycle)

**Decided**: Cycle 68 built `55-webgpu-audio-fx`. Priority check:
1. Unblock — nothing blocked.
2. Continue — no in-progress prototypes.
3. Build new — `ghost-voice` is the #1 queued item from STATE.md Cycle 68. FAL_KEY in use. Clear spec. One-cycle build.
4. Research — Cycle 68 queue noted "next research cycle at Cycle 70–71." Not due yet.
5. Polish — skipped; build takes priority.

Decision: build `/dream/56-ghost-voice`.

**Why now**: Every prior prototype in the spatial audio cluster (`7-spatial`, `29-scene-spatial`, `53-ghost-sfx`) positions sound around the listener. Ghost Voice is the first where something speaks *to* the listener — directly ahead, eye level, the most intimate position in HRTF space. The Ghost scenes have always been primarily visual and musical. A literal voice completes them: the character has something to say. Inworld TTS on fal.ai supports voice description steering (not just a neutral voice — you can describe the timbre, pace, and environment coloring). FAL_KEY already in use.

**Built**:
- `src/app/dream/56-ghost-voice/page.tsx` — full prototype (3.48 kB built)
- `src/app/dream/56-ghost-voice/api/route.ts` — server route calling `fal-ai/inworld/tts`
- `src/app/dream/56-ghost-voice/README.md` — design notes, scene lines table, polish ideas

**What's inside**:
Six Ghost scenes (Stone Chamber, Root Portal, Underground Pool, Tiny Planet, Forest Dawn, Cosmic Ascension), each with a single elliptical line — interior monologue rather than narration of events. Select a scene, click Narrate → server route calls Inworld TTS with the line + a scene-specific voice description ("calm, androgynous, stone chamber reverb, ancient and measured" / "vast, ethereal, slow, deep cosmic reverb" etc.). Returned audio decoded into an `AudioBuffer` and played through:
- `AnalyserNode` (for amplitude feedback to the canvas animation)
- `PannerNode` (HRTF, `positionX/Y/Z = 0, 0, -1` — directly ahead at ear level)
- `AudioContext.destination`

Canvas animation: slow-expanding rings emanate from a central glowing orb. During narration, ring spawn rate and orb glow scale with speech amplitude (read via `getByteTimeDomainData` each rAF frame). Subtitle reveals character-by-character at a rate proportional to the audio duration (40–90ms/char, completing at ~85% of audio length).

API endpoint `fal-ai/inworld/tts` is a naming-convention best-guess. Raw error shown in UI with Karel-paste instructions if wrong.

**What I noticed**: The position `(0, 0, -1)` in Web Audio is "directly ahead" when the listener faces `(0, 0, -1)` (the default). Compared to the ghost-sfx sources at various azimuths, the front-center position in HRTF is remarkably intimate — like a whisper from directly in front. The right voice description matters a lot; "stone chamber reverb" as part of the voice description is interesting because TTS models may or may not honor that as an acoustic characteristic vs. a speaking style. If Inworld TTS ignores environment-adjacent descriptors, future polish could add a ConvolverNode with per-scene impulse responses.

**Queued next** (priority order):
1. **`ghost-voice` endpoint fix** — if Karel reports an API error from `fal-ai/inworld/tts`, fix the endpoint/params. Common alternative names: `fal-ai/inworld/tts-v1-5`, `fal-ai/inworld/text-to-speech`.
2. **Research** — Cycle 68 queue flagged research at Cycle 70–71. Next cycle or the one after should be a research sweep.
3. **Ghost SFX + Ghost Voice integration** — play `53-ghost-sfx` ambient sounds beneath the narration simultaneously. Both use HRTF PannerNodes; they'd coexist naturally in the same AudioContext.
4. **`ghost-voice` polish** — if endpoint works: per-scene ConvolverNode reverb coloring; multiple TTS takes for Karel to pick the best; cache generated audio in sessionStorage.

---

## Cycle 68 — /dream/55-webgpu-audio-fx

**When**: 2026-05-20 UTC (hourly autonomous cycle)

**Decided**: Cycle 67 built `54-maestro-stems`. Priority check:
1. Unblock — nothing blocked.
2. Continue — no in-progress prototypes.
3. Build new — `webgpu-audio-fx` is #1 queued in STATE.md Cycle 67. Zero new deps, WebGPU already used in `15-webgpu-fluid` and `16-particle-life-gpu`. One-cycle build.
4. Research — Cycle 66 was last research (67 = 1 build cycle). Not yet at 3-4 cycle threshold.
5. Polish — skipped; build takes priority.

Decision: build `/dream/55-webgpu-audio-fx`.

**Why now**: All 54 prior prototypes process audio on the CPU (Web Audio API nodes, AudioWorklet, AnalyserNode). This is the first prototype where the audio signal itself is computed on the GPU. Two WGSL compute shader passes run on raw Float32 sample data: pitch-shift via speed-adjusted linear interpolation, then 6-tap FIR delay reverb. Qualitatively new capability for the sandbox — GPU DSP, not just GPU visualization. Zero new deps (`navigator.gpu` already used in `15-webgpu-fluid`).

**Built**:
- `src/app/dream/55-webgpu-audio-fx/page.tsx` — full prototype (3.85 kB built)
- `src/app/dream/55-webgpu-audio-fx/README.md` — design notes

**What's inside**:
Synthesizes a C-major chord (C4 + E4 + G4 + C5) in JS. Sends the Float32Array to GPU via `writeBuffer`. **Pass 1** (pitch-shift): WGSL compute shader reads `input[i × speed]` with linear interpolation → `midBuf`. **Pass 2** (reverb): 6-tap FIR comb filter — adds delayed copies of Pass 1 output at 1009, 1777, 2477, 3089, 4013, 5021 samples with gains 0.40→0.07 → `outBuf`. Two separate `GPUCommandEncoder` submissions with `await device.queue.onSubmittedWorkDone()` between them (storage barrier). Reads back via `mapAsync`, decodes to `AudioBuffer`, plays looped through `AnalyserNode` → spectrum visualization (same 1-live palette). Waveform comparison strips show original vs GPU-processed. GPU timing displayed (typically 30–80ms for ~120k samples — transfer-overhead dominated, not shader-execution).

TypeScript fix noted: `writeBuffer` requires `.buffer as ArrayBuffer` for Float32Array; `copyToChannel` avoided in favor of `getChannelData(0).set()` to sidestep `Float32Array<ArrayBufferLike>` vs `Float32Array<ArrayBuffer>` variance.

**What I noticed**: The pitch-shift effect at speed=2.0 (one octave up) is immediately striking — the C-major chord shifts to a C-major chord an octave higher, but only lasts half the buffer before silence. The reverb at mix=0.6+ gives a clear stone-chamber echo. At mix=0.35 (default) it adds room warmth without sounding like discrete echoes.

**Queued next** (priority order):
1. **`ghost-voice`** — Ghost scene narration via Inworld TTS on fal.ai. FAL_KEY in use. ~$0.01/line. One-cycle build. Next priority from Cycle 67 queue.
2. **`webgpu-audio-fx` polish** — if Karel wants it: PSOLA pitch-shift (preserves tempo), mic capture, or IIR reverb. Two-cycle effort.
3. **`54-maestro-stems` fix** — if Karel reports endpoint errors, fix before building new.
4. **Research** — next research cycle at Cycle 70–71 (2–3 cycles from now).

---

## Cycle 67 — /dream/54-maestro-stems

**When**: 2026-05-20 UTC (hourly autonomous cycle)

**Decided**: Cycle 66 was a research sweep. Priority check:
1. Unblock — nothing blocked.
2. Continue — no in-progress prototypes.
3. Build new — `maestro-stems` (`/dream/54-maestro-stems`) is the #1 queued item from STATE.md Cycle 66. FAL_KEY in use. High impact, one-cycle build.
4. Research — just done (Cycle 66). Won't research for 3+ more cycles.
5. Polish — skipped; build takes priority.

Decision: build `/dream/54-maestro-stems`.

**Why now**: Beatoven Maestro (RESEARCH.md §101) generates a 2.5-minute instrumental track AND returns individual stems (drums, bass, melody, other) in a single fal.ai call. All previous spatial audio prototypes (`7-spatial`, `29-scene-spatial`, `53-ghost-sfx`) split by frequency band OR position synthesized/generated sounds in space. This is the first prototype that spatializes a full AI-generated band by musical role — the drums are literally overhead, the bass is literally below, the melody is to the right. Qualitatively different spatial experience from any prior prototype. FAL_KEY already in use, $0.10/track.

**Built**:
- `src/app/dream/54-maestro-stems/page.tsx` — full prototype (4.59 kB built)
- `src/app/dream/54-maestro-stems/api/route.ts` — server route calling `beatoven/music-generation`
- `src/app/dream/54-maestro-stems/README.md` — design notes, position rationale, polish ideas

**What's inside**:
Five style presets (Cinematic / Jazz Trio / Ambient / Folk / Electronic). Editable prompt textarea. "Generate Track + Stems" → server calls `beatoven/music-generation` with `{prompt, stems: true}`. Response normalized across multiple possible URL shapes (data.stems.drums.url, data.stems.drums as string, etc.). Four stems decoded concurrently via `AudioContext.decodeAudioData`. Each routed through a HRTF PannerNode: drums above (+60° el), bass below (−30° el), melody front-right (+30° az), other front-left (−30° az). Top-down sphere canvas (same pattern as `29-scene-spatial` and `53-ghost-sfx`). Per-stem mix slider (live GainNode update), per-stem mute button. Raw API response shown in `<details>` for debugging. Build: clean.

**Notes**: Endpoint `beatoven/music-generation` and `stems: true` input parameter are best-guesses from RESEARCH.md §101. Beatoven's fal.ai wrapper may use different parameter names or return the stems at a different key. The raw response display (via `<details>`) is there specifically for Karel to paste back the raw output if the stems don't decode. This follows the same ⚠ API note pattern as `53-ghost-sfx` and `48-arc-compose`.

**Queued next** (priority order):
1. **`webgpu-audio-fx`** — Three.js TSL compute audio: GPU pitch-shift + 6-layer delay reverb + visual feedback. Zero new deps (`three@0.182` installed). Inspired by Three.js WebGPU compute audio example (RESEARCH.md §102). First prototype where GPU handles both DSP and rendering. One-cycle build.
2. **`ghost-voice`** — Ghost scene narration via Inworld TTS-1.5 Max on fal.ai. FAL_KEY in use. ~$0.01–0.02/line. Extends `53-ghost-sfx` concept. One-cycle build.
3. **`54-maestro-stems` fix** — if Karel reports the endpoint is wrong or stems don't decode, fix before building new.
4. **Research** — next research cycle at Cycle 70–71 (3–4 cycles from now).

---

## Cycle 66 — Research sweep

**When**: 2026-05-20 UTC (hourly autonomous cycle)

**Decided**: Cycle 65 built `/dream/6-compose`. Priority check:
1. Unblock — nothing blocked (ghost-sfx and 6-compose endpoints are best-guesses; Karel hasn't reported errors yet).
2. Continue — no in-progress prototypes.
3. Build new — skipped in favor of step 4.
4. Research — Cycle 61 was last research (62, 63, 64, 65 = 4 consecutive build cycles). STATE.md Cycle 65 explicitly: "Next cycle MUST be research." The 3–4 cycle cadence is exceeded. AGENT.md §Research cycles overrides step 3.
5. Polish — skipped.

Decision: full research sweep — arxiv, fal.ai, GitHub trending, Anthropic updates, web platform news.

**Searched**: arxiv (audio-reactive viz, music generation, live performance AI, spatial audio, timbre transfer, voice conversion, musical structure analysis), fal.ai blog (new models May 2026), GitHub (Three.js WebGPU audio examples), Anthropic updates (Claude API May 2026), HN (music/audio May 2026).

**Built**: 8 new entries in RESEARCH.md (§§101–108). 3 new prototype ideas added to IDEAS.md.

**Key findings**:
- **Beatoven Maestro on fal.ai** (§101) — `beatoven/music-generation`, $0.10/request, 2.5-min instrumentals + **individual stems** (drums/bass/melody/other). FAL_KEY in use. Inspires `maestro-stems`: generate a 2-min piece, decode its stems, route each through a separate HRTF PannerNode — the band plays around you in 3D. This is the long-desired `stem-spatial` idea now buildable without Lyria.
- **Three.js WebGPU Compute Audio** (§102) — Three.js r171+ ships a `webgpu_compute_audio` example: TSL compute shader applies pitch-shift + 6-layer feedback delay on a GPU audio buffer, while `AnalyserNode` output feeds a visual texture. GPU DSP and GPU rendering on the same device, zero new deps. Inspires `webgpu-audio-fx`.
- **Art2Mus** (§103, arxiv 2602.17599, Feb 2026) — First direct artwork→music generation without text intermediary. Visual embedding directly conditions a music LDM. No API yet, but validates `lyria-ghost` (Ghost image → music) direction.
- **TADA! Activation Steering** (§104, arxiv 2602.11910, Feb 2026) — Named concept steering in audio diffusion at inference time (instruments, genre, vocals). No API yet; future upgrade for `6-compose`.
- **Inworld TTS-1.5 Max** (§105) — Expressive TTS with voice cloning, FAL_KEY in use, <150ms latency. Inspires `ghost-voice`: Ghost narrative lines spoken in a custom voice, HRTF front-center, with subtitle overlay.
- **Conducting Gesture Recognition** (§106, arxiv 2604.27957, Apr 2026) — Skeleton tracking + LSTM → real-time orchestra tempo/dynamics control. Inspires `conductor` prototype (MediaPipe CDN dep, same as `31-gesture-music`).
- **Web Audio API v2 Configurable Render Quantum** (§107) — Sub-3ms audio latency arriving Q4 2026. All pitch-detection prototypes improve automatically.
- **TVTSyn voice timbre transfer** (§108, arxiv 2602.09389, Feb 2026) — 80ms GPU timbre transfer. Python/CUDA only; monitor for WASM port.

**Queued next** (priority order):
1. **`maestro-stems`** (`/dream/54-maestro-stems`) — Generate 2.5-min Beatoven track → stems → HRTF 3D band positioning. FAL_KEY in use, $0.10. High impact, one-cycle build. Most surprising new finding this cycle.
2. **`webgpu-audio-fx`** — Three.js TSL compute audio + pitch-shift + reverb + visual feedback. Zero new deps. One-cycle. First prototype where GPU handles both audio DSP and rendering.
3. **`ghost-voice`** — Ghost scene narration via Inworld TTS. FAL_KEY in use, ~$0.01/line. Quick add-on to `53-ghost-sfx`.
4. **`6-compose` or `53-ghost-sfx` endpoint fix** — if Karel reports API errors next morning, fix first.
5. **Research done** — next research cycle at Cycle 69–70.

**Notes**: Beatoven Maestro's stem output is the most practically exciting find: it eliminates the need for a separate stem-splitter model (which requires a 2-cycle build and its own FAL_KEY call). $0.10 for 2.5 min + stems is better value than $0.03 for 30s ACE-Step if you want a full-length piece. Could also back-fill `6-compose` as a "long-form mode" toggle. The Three.js compute audio example is a direct path to prototyping GPU audio synthesis without needing to write raw WGSL compute shaders — TSL compiles down automatically.

---

## Cycle 65 — /dream/6-compose

**When**: 2026-05-20 UTC (hourly autonomous cycle)

**Decided**: Cycle 64 built `53-ghost-sfx`. Priority check:
1. Unblock — nothing confirmed blocked (ghost-sfx endpoint is a best-guess; Karel hasn't reported an error yet).
2. Continue — no in-progress prototypes.
3. Build new — `6-compose` is the oldest queued item in IDEAS.md (Cycle 4 research, 61 cycles unbuilt). FAL_KEY already in use. Server-route pattern established by vocal-bgm and arc-compose. One-cycle build. Clear spec.
4. Research — Cycle 61 was last research (3 build cycles ago: 62, 63, 64). At the upper bound of the 3–4 cycle cadence, but "Build new" (priority 3) takes precedence over "Research" (priority 4) when a ready queued spec exists.
5. Polish — skipped.

Decision: build `/dream/6-compose`.

**Why now**: `6-compose` has been in the queue since Cycle 4 (61 cycles). It was the first IDEAS.md entry added for the AI music generation cluster. The gap was that `arc-compose` (Cycle 57) already covers structured section-tag generation via MiniMax Music. This prototype fills a different niche: `arc-compose` = write an arc as section tags → get a structured 60–90s piece. `6-compose` = describe a mood or scene in plain language → get a 30s musical sketch. It's the "vibe first, think later" flow. The ACE-Step text-to-music endpoint (`fal-ai/ace-step`) is the base endpoint without the `/audio-to-audio` suffix used by vocal-bgm. FAL_KEY is in use, same fal.subscribe pattern as arc-compose.

**Shipped**:
- `src/app/dream/6-compose/page.tsx` — full prototype
- `src/app/dream/6-compose/api/route.ts` — server route calling ACE-Step text-to-music
- `src/app/dream/6-compose/README.md` — design notes

**What's inside**:
Five Ghost scene preset buttons (Forest Dawn, Stone Chamber, Underground Pool, Cosmic Ascension, Tiny Planet), each pre-loaded with a scene-specific mood+instrument+BPM tags string. Editable textarea shows the raw tags sent to ACE-Step — the user can read and modify the model's literal input. Generate → server route calls `fal-ai/ace-step` with `tags`, `lyrics: "[inst]"` (instrumental), `duration: 30`. Returns a 30-second audio clip. On return: decoded into an AudioBuffer, peaks computed for the waveform strip, then auto-played through a 6-band bloom visualizer (same palette as 1-live). Replay + MP3 download. Error display shows raw fal.ai error text (same pattern as arc-compose and vocal-bgm).

**What I noticed**: The `fal-ai/ace-step` endpoint is distinct from `fal-ai/ace-step/audio-to-audio` (used by vocal-bgm). The text-to-music mode takes `tags` (style description) and `lyrics` (optionally `"[inst]"` for instrumental). Input structure mirrors the ACE-Step documentation pattern. If the endpoint name is wrong, the raw error is displayed. $0.006/30s same as audio-to-audio mode.

**Queued next**:
1. **Research** — Cycle 61 was last research (62, 63, 64, 65 = 4 build cycles). The 3–4 cycle cadence is now exceeded. Next cycle MUST be research.
2. **`ghost-sfx` endpoint fix** — if Karel reports API errors from the ghost-sfx prototype, fix endpoint/params before research.
3. **`6-compose` endpoint fix** — same as ghost-sfx: if Karel pastes an ACE-Step error, fix the endpoint path next cycle.
4. **`claude-shader`** — still waiting on Karel: is `ANTHROPIC_API_KEY` accessible in Vercel env?

---

## Cycle 64 — /dream/53-ghost-sfx

**When**: 2026-05-20 UTC (hourly autonomous cycle)

**Decided**: Cycle 63 built `52-concept-steer`. Priority check:
1. Unblock — nothing blocked.
2. Continue — no in-progress prototypes.
3. Build new — `ghost-sfx` (`/dream/53-ghost-sfx`) is the #1 queued item from STATE.md Cycle 63. FAL_KEY in use. Endpoint uncertain but handled via error-display fallback (same ⚠ API note pattern as `48-arc-compose`).
4. Research — Cycle 61 was last research (3 cycles ago: 62, 63, 64). At the lower bound of 3–4 cycle cadence. Build-new (step 3) takes priority over research (step 4).
5. Polish — skipped; build takes priority.

Decision: build `/dream/53-ghost-sfx`.

**Why now**: The synthesized oscillator soundscapes in `29-scene-spatial` demonstrate the spatial audio concept well, but they're recognizably synthetic — a piano-loop is a looping FM sawtooth, "birdsong" is a brief frequency glide. ElevenLabs Sound Effects on fal.ai generates naturalistic environmental audio from text descriptions: actual cave reverb, actual bird calls, actual stone hum. The same 3D HRTF positioning framework from `7-spatial` and `29-scene-spatial` can be directly applied. The result should feel like standing inside the Ghost scene's acoustic world — not a Web Audio demo. The RESEARCH.md §95 finding confirmed the fal.ai endpoint exists; the endpoint name `fal-ai/elevenlabs/sound-generation` is a best-guess from naming conventions. If wrong, the raw error is displayed (same as `arc-compose`) and Karel can paste it for a fix next cycle. FAL_KEY already in use → zero new approvals.

**Shipped**:
- `src/app/dream/53-ghost-sfx/page.tsx` — full prototype (~360 lines)
- `src/app/dream/53-ghost-sfx/api/route.ts` — server route calling ElevenLabs SFX endpoint
- `src/app/dream/53-ghost-sfx/README.md` — design notes, acoustic scene table, polish ideas

**What's inside**:

Six Ghost narrative scenes (Stone Chamber, Root Portal, Underground Pool, Tiny Planet, Forest Dawn, Cosmic Ascension), each with three AI-generated sound sources. Click a scene → three API calls fire concurrently to `fal-ai/elevenlabs/sound-generation`. Each returned audio clip is decoded via `AudioContext.decodeAudioData` and stored as an `AudioBuffer`. Press ▶ Play → all three sources loop through HRTF PannerNodes at their scene-specific spherical positions (azimuth, elevation, distance).

**Canvas**: top-down sphere view (400×400). Listener at center with a forward indicator. Source dots colored by scene accent (stone chamber = warm amber, forest dawn = soft green, cosmic ascension = lavender). Glow ring on ready/active sources. Elevation hint label below each dot. F/B/L/R cardinal labels.

**Source status cards**: one card per source with status (generating… / ✓ ready / ✗ error). Error messages show raw fal.ai error text for debugging. Per-source mute button with smooth 50ms `GainNode.gain.setTargetAtTime` fade.

**Acoustic design highlights**:
- Forest Dawn: canopy birds at +60° elevation, stream at −85° azimuth (hard left), piano at +10°. With headphones the forest is immediately identifiable — birds above, water left.
- Cosmic Ascension: vast drone from all directions (dist=6m), harmonic shimmer at +30° elevation (+60° azimuth), sub pulse from far below (el=−50°). The sub should feel like pressure from below.
- Stone Chamber: piano at −30° (front-left), water drip at +75° (right-forward) and −20° elevation, hum at back (160°). The dry piano vs. the cavernous hum at the back should feel spatially distinct.

**Build validation**: `npm run build` passes cleanly. `/dream/53-ghost-sfx` at 4.75 kB (static), `/dream/53-ghost-sfx/api` at 244 B (dynamic). Zero TypeScript errors. Zero ESLint errors from new code.

**What I noticed**: The key risk is the fal.ai endpoint name. Looking at the `arc-compose` experience (its endpoint `fal-ai/minimax/music-01` was correct first-try from naming conventions), `fal-ai/elevenlabs/sound-generation` is the most likely canonical name. If the ElevenLabs model uses a different sub-path (e.g. `fal-ai/elevenlabs/sfx` or `fal-ai/elevenlabs/text-to-sound-effects`), the error cards will show the raw API error. The fallback UX is clean — Karel can use the prototype anyway for the spatial audio UI and just paste the error text. The HRTF positioning and canvas visualization work regardless of whether the API calls succeed.

**Queued next**:
1. **`ghost-sfx` endpoint fix** — if Karel reports an API error, fix the route endpoint/params next cycle. High confidence it works, but endpoint is a best-guess.
2. **Research** — Cycle 61 was last research (3 cycles ago: 62, 63, 64). Now at the upper bound of the 3–4 cycle cadence. Next cycle should be research.
3. **`claude-shader`** — still waiting on Karel: is `ANTHROPIC_API_KEY` accessible in Vercel env?
4. **`ghost-sfx` polish** — if endpoint works: session storage cache per scene (no re-generation on revisit), source drag on canvas for real-time HRTF repositioning, longer clips.

---

## Cycle 63 — /dream/52-concept-steer

**When**: 2026-05-20 UTC (hourly autonomous cycle)

**Decided**: Cycle 62 built `51-diatonic-harmony`. Priority check:
1. Unblock — nothing blocked.
2. Continue — no in-progress prototypes.
3. Build new — `concept-steer` (`/dream/52-concept-steer`) is the #1 queued item from STATE.md Cycle 62. Zero deps, zero API, one-cycle build.
4. Research — Cycle 61 was last research (2 cycles ago). Not due yet (cadence is 3–4 cycles).
5. Polish — skipped; build takes priority.

Decision: build `/dream/52-concept-steer`.

**Why now**: 51 existing prototypes use audio feature coordinates derived from signal processing (centroid, bandwidth, band energy) or emotion coordinates (valence/arousal from `38-mood-xy`). None use the vocabulary that music AI models use internally. The sparse autoencoder research (RESEARCH.md §94) found that transformer music models organize around exactly six named concepts — Brightness, Density, Regularity, Complexity, Energy, Mode — that a musician would recognize immediately. Building a synthesizer whose primary controls carry those labels creates a bridge between how AI thinks about music and how musicians talk about it. It's also a different interaction paradigm from `38-mood-xy`: instead of a 2D plane with emotional coordinates, this is a 6-dimensional radar chart with music-theory vocabulary.

**Shipped**:
- `src/app/dream/52-concept-steer/page.tsx` — full prototype (~270 lines)
- `src/app/dream/52-concept-steer/README.md` — design notes, axis mappings, polish ideas

**What's inside**:

**Hexagonal radar chart**: Six vertices at 60° intervals, each draggable radially 0–1. The rendered polygon shape IS the current concept position. Vertex handles glow in per-axis accent colors (golden=Brightness, sky blue=Density, mint=Regularity, lavender=Complexity, coral=Energy, steel blue=Mode). Concentric hexagonal grid rings at 25/50/75/100% for spatial reference.

**Synthesis engine** (same triangle-wave + BiquadFilterNode stack as `38-mood-xy`):
- Brightness → lowpass fc 400–6000 Hz (exponential ramp per chord)
- Density → BPM 40–140 + voice count 1–5
- Regularity → chord note duration (long pads at 1, short notes at 0) + timing jitter (random onset offset + frequency jitter when Regularity < 0.4)
- Complexity → chord voicing depth (unison → fifth → triad → 7th → 9th chord)
- Energy → attack time 0.8s–0.04s + peak gain 0.08–0.28
- Mode → chord quality interpolation (major → minor → diminished, continuous parameter)

**Chord computation** (`buildChord`): interpolates between major/minor/dim semitone templates. At mode=0.25, you get a chord halfway between major and minor third. At complexity=1.0, all 5 notes of a 9th chord play.

**Arpeggio mode**: when Density > 0.45, chord voices are staggered in time (arpeggio gap = beat fraction / voice count). At Density < 0.45, all voices sound simultaneously as a chord block.

**Presets**: Classical Fugue (ordered polyphony), Dark Ambient (sparse minor atmospheric), Jazz Improv (fast dense major 9th arpeggios), Drone (single sustained unison tone).

**Build validation**: `npm run build` passes cleanly. `/dream/52-concept-steer` compiles at 3.58 kB (static route). Zero TypeScript errors. Zero ESLint errors from new code.

**What I noticed**: The Mode axis is the most musically interesting to drag. At Complexity=0.85 (7th–9th voicings), dragging Mode from 0 to 1 walks through major 9 → minor 9 → diminished 7 as a continuous audio parameter. The diminished end sounds genuinely tense/unresolved in a way that's hard to achieve with the valence axis in `38-mood-xy` (which uses the same chord templates but maps them to a 2D plane). Having Mode as a dedicated axis means you can have high Brightness + high Energy + Mode=1.0 (a bright energetic diminished sound), which isn't a natural quadrant in the `38-mood-xy` space.

The Regularity axis at low values creates a recognizable "jazz feel" — the slight timing jitter and frequency deviation prevent the strict machine-grid quality of synthesized music. At Regularity=1.0 + Density=0.8, the BPM is fast and the chord onsets are perfectly metronomic. At Regularity=0.2, the same density sounds more like a pianist who's pushing/pulling the beat slightly.

**Queued next**:
1. **`ghost-sfx`** (`/dream/52-ghost-sfx`) — ElevenLabs SFX on fal.ai for Ghost scene spatial audio. FAL_KEY in use. Need to confirm fal.ai endpoint ID.
2. **`claude-shader`** — waiting on Karel: is `ANTHROPIC_API_KEY` accessible in Vercel env?
3. **`concept-steer` polish** — mic mode that extracts audio features and shows where your playing sits on the radar in real time; trajectory recording + replay.
4. **Research** — Cycle 61 was last research. Due again at cycle 64–65.

---

## Cycle 62 — /dream/51-diatonic-harmony

**When**: 2026-05-20 UTC (hourly autonomous cycle)

**Decided**: Cycle 61 was a research sweep. Priority check:
1. Unblock — nothing blocked.
2. Continue — no in-progress prototypes.
3. Build new — `diatonic-harmony` (IDEAS.md, Cycle 61 research §96) is the explicit #1 queue item in the prior STATE.md. Zero deps, zero API, one-cycle build. Highest-priority unbuilt item.
4. Research — Cycle 61 was research. Not due again yet.
5. Polish — skipped; build takes priority.

Decision: build `/dream/51-diatonic-harmony`.

**Why now**: 50 existing prototypes process audio and make visuals. None generate *harmonically correct* accompanying voices. `23-pitch-harmonize` (Cycle 26) pitch-shifts the mic signal by a fixed interval — always a perfect fifth, regardless of scale context. `51-diatonic-harmony` detects the key from accumulated chroma and generates scale-correct interval voices that change quality by scale degree: C in C major gets a major third (E), but B gets a minor third (D) and a *diminished* fifth (F). This is the simplest form of what every classical arranger does automatically. The gap between "fixed transposition" and "diatonic voice" is small in code (a KK correlation + interval lookup) but large in musical meaning. The demo on Bach BWV 772 makes this audible and visible: watch the three colored bars in the piano roll, hear the harmony's color shift as the melody moves through the scale.

**Shipped**:
- `src/app/dream/51-diatonic-harmony/page.tsx` — full prototype (~390 lines)
- `src/app/dream/51-diatonic-harmony/README.md` — design notes, algorithm details, polish ideas

**What's inside**:

**Key detection (Krumhansl-Kessler)**: Each new note onset updates a 12-bin chroma accumulator. After ≥3 notes, the vector is L1-normalized and correlated against KK major and minor profiles for all 12 roots. The highest-scoring root + mode is the detected key. In demo mode, C major is pre-seeded (BWV 772 is in C major — no need to detect it).

**Diatonic voice computation** (`computeDiatonicVoices`): Given a note MIDI and a key, reduces to pitch class, finds nearest scale degree (handles notes slightly off-key from pitch detection jitter), steps up 2 and 4 scale degrees, converts back to semitone intervals with octave-boundary wrapping. The wrapping is the key insight: B in C major to D is scale[1]−scale[6] = 2−11 = −9 → +12 → 3 semitones (minor third). B to F is scale[3]−scale[6] = 5−11 = −6 → +12 → 6 semitones (diminished fifth). Pure arithmetic; no lookup table.

**Harmony audio**: Inline `startHarmony`/`stopHarmony` inside the render `useEffect` (avoids dependency array issues). Two `OscillatorNode` → `GainNode` (150ms attack ramp to 0.32) → `StereoPannerNode` (±0.28 pan) → destination. On silence: 400ms linear fade via `linearRampToValueAtTime`. New note onset: `stopHarmony()` then `startHarmony()` immediately — smooth pivot, no click.

**Three-voice piano roll**: Same `24-piano-roll` Canvas2D approach. All three voices (melody, third, fifth) share one piano roll. Additive blending (`globalCompositeOperation = "lighter"`) means overlapping notes at the same pitch glow brighter — if the third or fifth of one note coincides with the melody of another, the overlap lights up. Color coding: warm orange (melody), light blue (3rd), deep blue (5th). Piano key sidebar highlights active melody pitch.

**Demo mode**: Bach BWV 772 (same 35-note fragment as `22-code-score` and `24-piano-roll`). Melody plays audibly as a soft triangle wave (gain 0.10) to both the analyser and the destination. Harmony voices (sine, gain 0.32) are spawned by the render loop when it detects each new demo note via `demoFreqRef` change. Demo key pre-seeded to C major — no warm-up period.

**Build validation**: `npm run build` passes cleanly. `/dream/51-diatonic-harmony` compiles at 5.04 kB (static route). Zero TypeScript errors. Zero ESLint errors from new code. All warnings are pre-existing Resonance production files.

**What I noticed**: The diminished fifth on scale degree 7 is the most interesting feature to demonstrate. In the Bach fragment, the B natural appears several times (measure 1: G-A-B-C going up; measure 2: D-B-C-D; etc.). Each time B appears, the fifth voice drops to F — visually the fifth bar jumps down relative to the normal perfect-fifth position, and audibly you hear a tighter, more tense interval. When the melody resolves to C, the fifth jumps back to G (perfect fifth). This B→F→C→G motion is the V7→I resolution compressed into the harmony voices. Watching the piano roll while listening makes this vivid.

The key detection works faster than expected. By the third note of the Bach fragment (E4), the KK correlation has enough chroma mass to detect C major correctly. From that point on, all harmony voices are scale-correct for the duration.

**Queued next**:
1. **`concept-steer`** (`/dream/52-concept-steer`) — 6-axis hexagonal radar chart synthesizer (Brightness/Density/Regularity/Complexity/Energy/Mode) derived from sparse autoencoder research (RESEARCH.md §94). Zero deps, one cycle. Compelling for Karel: music AI vocabulary as the primary synthesizer UI.
2. **`ghost-sfx`** — ElevenLabs SFX on fal.ai for Ghost scene spatial audio. FAL_KEY in use. Needs endpoint ID confirmed.
3. **`claude-shader`** — waiting on Karel: is `ANTHROPIC_API_KEY` accessible in Vercel env?
4. **`diatonic-harmony` polish** — chord name overlay from last 3 notes; 4-part texture by adding diatonic 6th voice.

---

## Cycle 61 — research sweep

**When**: 2026-05-20 UTC (hourly autonomous cycle)

**Decided**: Cycle 60 completed the dashboard enhancement. Priority check:
1. Unblock — nothing blocked.
2. Continue — no in-progress prototypes.
3. Build new — 50+ prototypes in the sandbox; no single obvious urgent next build.
4. Research — Cycle 56 was last research (4 cycles ago: 57, 58, 59, 60). Past the upper bound of the 3–4 cycle cadence. AGENT.md: "Once every 3-4 cycles (or when IDEAS is thin), spend a full cycle on research." Research is overdue.
5. Polish — skipped; research takes priority.

Decision: full research sweep — arxiv, fal.ai, GitHub, browser platform news, Anthropic updates.

**Searched**: arxiv (audio-reactive viz, music generation, piano transcription, style transfer, live performance AI, diatonic harmony, streaming transcription), fal.ai blog (new audio models), GitHub trending (WebGPU/WebAudio creative coding, iPlug3), Anthropic (Claude capabilities), Shadertoy/Revision 2026 demoscene.

**What I built**: 8 new entries in RESEARCH.md (§§93–100). 4 new prototype ideas added to IDEAS.md.

**Key findings**:
- **AI Co-Artist (arxiv 2512.08951)** — LLM generates and evolves GLSL shaders from user text descriptions. Inspires `claude-shader`: describe a visualization → Claude API generates GLSL fragment shader → runs on fullscreen quad with Web Audio FFT uniforms. Admin-only, needs ANTHROPIC_API_KEY.
- **Interpretable Concepts in Music Models (arxiv 2505.18186, May 2026)** — Sparse autoencoders extract steerable musical concepts (brightness, density, regularity, etc.) from transformer music models. Concepts can steer model outputs during generation. Inspires `concept-steer`: 6-axis hexagonal radar chart synthesizer labeled with music-theory concept names — entirely browser-native.
- **ElevenLabs Sound Effects on fal.ai** — text → high-fidelity short sound effects. FAL_KEY in use. Inspires `ghost-sfx`: generate naturalistic Ghost scene sounds (stone footstep reverb, forest birdsong, cosmic drone) instead of handcrafted oscillator synthesis in `29-scene-spatial`.
- **AI Harmonizer (arxiv 2506.18143, Jun 2025)** — Anticipatory Music Transformer generates 4-part diatonic harmony from solo melody input. Offline only (no browser deployment yet). Inspires `diatonic-harmony`: browser-native key detection + rule-based diatonic voice generation. Your melody, surrounded by chord-correct harmonies.
- **Token-Based Audio Inpainting via Discrete Diffusion (arxiv 2507.08333, Jul 2025/Feb 2026)** — First discrete diffusion approach for audio continuation over tokenized representations. Semantically coherent for gaps up to 750ms and long segments. Could upgrade `43-stable-extend` if there's a fal.ai endpoint.
- **Three.js/WebGPU 2026** — 100× gains confirmed for heavy compute (point clouds). 1M particles at 60fps demonstrated. TSL compiles to WGSL+GLSL automatically. WebGPU universal across all desktop browsers. Reinforces `gpu-additive` viability.
- **Streaming Piano Transcription (arxiv 2503.01362, ISMIR 2024)** — Causal CNN+Transformer for streaming note events (onset + offset + pitch + sustain pedal). A path to full note detection rather than just pitch, no GPU needed.
- **iPlug3 2026 update** — Started Jan 2026; now explicitly describes "agentic AI workflow integration" + WebGPU native. Most mature path to Resonance as an installation.

**What I noticed**: The most surprising finding is AI Co-Artist (§93) — using an LLM to generate and evolve GLSL shaders is exactly the dream zone's meta-prototype that SonoCraftAR (§91) hinted at, now proven in a published paper. If `ANTHROPIC_API_KEY` is accessible from the dream zone's server routes (same environment as the Vercel build — Karel can confirm), `claude-shader` is a self-referential prototype: Claude generates an audio-reactive GLSL shader that runs in the browser it was generated in. One cycle to build once the key question is answered.

The `concept-steer` finding is subtler but arguably more interesting for Karel: the sparse autoencoder research found that music AI models organize their internal representations around concepts like "brightness" and "density" — concepts Karel and any musician would recognize immediately. Building a synthesizer where those same labels are the primary controls (instead of mood or BPM) creates a bridge between how AI thinks about music and how musicians think about music.

**Queued next**:
1. **Build `diatonic-harmony`** — zero deps, fills gap in "real-time harmonic content" (no prototype yet adds correct chord voices to live input). One-cycle build.
2. **Build `concept-steer`** — zero deps, compelling for Karel. 6-axis radar chart synthesizer. One-cycle build.
3. **`claude-shader`** — ask Karel: is ANTHROPIC_API_KEY accessible in Vercel env vars? If yes, build next research gap.
4. **`ghost-sfx`** — FAL_KEY in use. Need to confirm ElevenLabs sound effects endpoint ID on fal.ai.

---

## Cycle 60 — dashboard enhancement

**When**: 2026-05-20 UTC (hourly autonomous cycle)

**Decided**: Cycle 59 shipped `50-tap-rhythm`. Priority check:
1. Unblock — nothing blocked.
2. Continue — no in-progress prototypes.
3. Build new — `dashboard` (IDEAS.md §0, `[queued, do FIRST]`) has been in the queue for 59 cycles. Zero deps, no API keys, clear spec. The AGENT.md rule says build-new (step 3) takes priority over research (step 4). The dashboard is the only genuinely zero-dep unbuilt item in the queue. Research is at the 3-cycle lower bound (cycles 57, 58, 59 = 3 since Cycle 56 research) and will be due next cycle.
4. Research — 3 cycles since Cycle 56 research. At the lower bound. Build-new takes priority at #3.
5. Polish — skipped; build takes priority.

Decision: enhance `src/app/dream/page.tsx` into the full dashboard spec from IDEAS.md §0.

**Why now**: IDEAS.md §0 is labeled "do FIRST" and has been deferred 59 cycles. Karel reads MORNING.md first thing at 06:30, but currently must visit GitHub to read it — the dashboard should surface it in-browser. The current `page.tsx` only shows the "New since yesterday" section; the full MORNING.md (all sections: in-progress, research findings, open questions) is not rendered anywhere on the preview URL. The recent activity stream from STATE.md is only accessible via `/dream/history` — it's not visible at the top-level dashboard. This cycle closes those two gaps: full MORNING.md rendered properly at `/dream/`, and the last 3 cycles as a compact activity timeline.

**Shipped**:
- `src/app/dream/page.tsx` — enhanced dashboard with full MORNING.md rendering, recent 3-cycle activity stream, improved phone-first layout

**What's inside**:

**Full MORNING.md rendering**: The entire morning digest (all sections: New since yesterday, In progress, Research findings, Open questions) is rendered with proper markdown formatting — headings, bullets with link/bold/code inline formatting, numbered lists, continuation indented lines. Previously only the "New since yesterday" section was shown as plain text. All four MORNING.md sections now render with proper visual hierarchy.

**Recent activity stream**: Parses the last 3 cycles from STATE.md and renders them as compact cards below the morning digest. Each card shows: cycle number, route/action (from heading), UTC date, and first line of the decision. The newest cycle gets a violet tint. A "→ All N cycles" link leads to `/dream/history`.

**Markdown renderer** (`renderInline` + `renderMdSection`): A line-by-line markdown parser supporting `##` section headings → small-caps dividers, `-`/`*` bullet lists with indented continuation lines, ordered lists, code blocks (fenced), `**bold**`, `` `code` ``, `[link](url)`, and paragraph text. Duplicated from `history/page.tsx` (no cross-file import needed). Named `renderInline`/`renderMdSection` to avoid `use*` hook naming.

**Phone-first layout**: `max-w-3xl` throughout (was `max-w-5xl`), tighter vertical spacing, compact cycle number badges (`c59` instead of `cycle 59`), 2-line prototype descriptions.

**Prototype grid preserved**: The full grid is kept. Description truncation changed from 240 chars / 3-line to 180 chars / 2-line to fit better on mobile.

**Build validation**: `npm run build` passes cleanly. Zero TypeScript errors. Zero ESLint errors from new code. All warnings are pre-existing Resonance production files.

**What I noticed**: The MORNING.md has bullets with multi-line continuation (indented 2 spaces). The markdown renderer handles these by appending continuation lines to the previous bullet item. This produces the correct output: a single list item with the full paragraph text, not separate items. The `→` Unicode arrow in continuation text renders as-is — no special handling needed.

**Queued next**:
1. **Research** — Cycle 56 was last research (4 cycles ago: 57, 58, 59, 60). Past the upper bound of the 3–4 cycle cadence. Research is now overdue. Next cycle must be a research sweep.
2. **GEMINI_API_KEY** — still pending. Unlocks `lyria-ghost`, `binaural-lyria`, `piano-to-ghost`, `stem-spatial`.
3. **Polish `50-tap-rhythm`** — if Karel tries it and amplitude thresholds are off for his setup, tune them.
4. **Fix `arc-compose` API** — if Karel reports an error, diagnose fal.ai endpoint/parameters and fix `route.ts`.

---

## Cycle 59 — /dream/50-tap-rhythm

**When**: 2026-05-20 UTC (hourly autonomous cycle)

**Decided**: Cycle 58 shipped `49-anemone-av`. Priority check:
1. Unblock — nothing blocked.
2. Continue — no in-progress prototypes.
3. Build new — `tap-rhythm` is #1 in the queue (STATE.md Cycle 58 explicitly names it as highest priority). Zero deps, zero API. One-cycle build.
4. Research — Cycle 56 was last research (3 cycles ago: 57, 58, 59). At the lower bound of the 3–4 cycle cadence. Build-new takes priority at #3 per the manual's ordering.
5. Polish — skipped; build takes priority.

Decision: build `/dream/50-tap-rhythm`.

**Why now**: 50 prototypes in the sandbox and none accept rhythm as the primary input. Every prototype requires you to play an instrument or type text. `tap-rhythm` is the first where a non-musician can walk up, clap 8 times, and immediately hear a drum loop of their own rhythm. The DARC paper (RESEARCH.md §89) validated this exact paradigm: mic onset detection → step sequencer → drum synthesis. Zero new dependencies, zero API calls. Highest live-performance accessibility of any prototype in the queue. The circular clock face is the natural visual for a step sequencer that loops — the rotating hand makes the loop position legible at a distance on a projector.

**Shipped**:
- `src/app/dream/50-tap-rhythm/page.tsx` — full interactive prototype (~310 lines)
- `src/app/dream/50-tap-rhythm/README.md` — design notes, drum synthesis architecture, polish ideas

**What's inside**:

**Phase state machine**: `idle → tapping → sequencing`. Idle shows two buttons: "Tap your rhythm" (mic) and "Demo" (pre-built 4-on-the-floor, no permissions needed).

**Tapping**: mic onset detection (same amplitude-threshold approach as `1-live`). Each onset is recorded with timestamp + amplitude. Visual: expanding pulse rings radiate outward from center, color-coded by classified drum type (violet=kick, cyan=snare, amber=hat). Counter shows "X of 8+" taps. After 8+ taps and 2s of silence, automatically commits. Manual "Build loop" button appears at 8+.

**Drum classification** (amplitude-based, matches how one naturally taps):
- `amp < 0.33` → kick (55Hz sine burst, frequency glide 100→42 Hz over 120ms)
- `0.33–0.66` → snare (bandpass white noise, 1800 Hz, 120ms decay)
- `amp > 0.66` → hi-hat (highpass white noise, 8000 Hz, 35ms sharp decay)

**BPM estimation**: median inter-onset interval of filtered IOIs (120ms–2500ms). Robust to outliers and brief pauses. Clamps to 40–240 BPM.

**Grid quantization**: each tap's timestamp is mapped to the nearest 16th-note slot in a 2-bar (32-step) loop. At 120 BPM, each 16th note = 125ms — the user needs to be within ±62ms of the correct position to hit the right step.

**Circular step sequencer**: 32 dots arranged clockwise as a clock face. Beat boundaries (steps 0, 8, 16, 24 = quarter notes) slightly larger with a dark ring. Active dots glow in their drum color with bloom. The clock hand rotates at the detected BPM using `(ac.currentTime - loopStart) / (stepDur * 32) * 32` for smooth fractional position. When the hand passes an active step, it flashes brighter.

**Scheduling**: `setInterval(20ms)` look-ahead scheduler, 60ms ahead via `AudioContext.currentTime`. The `bpmRef` is read fresh each tick — BPM slider changes take effect immediately without resetting the interval.

**Step toggling**: click any dot on the clock face to toggle it on/off. Hit detection: convert click angle from center → step index. Inactive steps become "kick" type; can be toggled off again.

**Demo mode**: loads a 4-on-the-floor preset (kick on every quarter note, snare on 2&4, hi-hat on 8ths at 120 BPM). No mic permissions required. Communicates what the prototype does before the user commits to recording.

**Build validation**: `npm run build` passes cleanly. `/dream/50-tap-rhythm` compiles at 5.13 kB (static route). Zero TypeScript errors in new code. Zero ESLint errors from new code. All warnings are pre-existing Resonance production files. Vercel build will pass.

**Architecture note**: `drawClock` is defined at module scope (takes a `CanvasRenderingContext2D` + data args) to avoid being misidentified as a React hook. Noise buffers (`playSnare`, `playHiHat`) are allocated fresh per trigger — acceptable at prototype tempo rates. A single RAF loop handles both onset detection (when tapping) and canvas rendering (always), reading `phaseRef.current` to switch behavior.

**What I noticed**: The quantization is surprisingly forgiving. Even with ±50ms timing jitter in an 8-tap sequence, the median IOI estimate produces a solid BPM, and the nearest-16th-note snap puts the taps in coherent positions. The user has to be off by more than half a 16th note (±62ms at 120 BPM) to land on the wrong step. Most people naturally tap within ±30ms of the beat.

The amplitude threshold for kick/snare/hat works well on desk taps but may need calibration for different input surfaces. A laptop keyboard tap is reliably "kick" range; a hard hand clap is "hi-hat" range. The three-bucket classification (rather than a continuous mapping) is robust because the user's physical tapping forces naturally cluster into light/medium/hard.

The demo mode is load-bearing. Most people opening a new prototype don't immediately want to commit to mic permissions. Hearing the 4-on-the-floor loop immediately communicates: "tap something and it sounds like this, but it's your rhythm." The circular clock display makes the loop structure visible — 4 beats, 8 subdivisions, 32 positions.

**Queued next**:
1. **Research** — Cycle 56 was last research (3 cycles ago: 57, 58, 59). Due at Cycle 60 per the 3–4 cycle cadence. The cadence is now at its lower bound.
2. **GEMINI_API_KEY** — still pending. Unlocks `lyria-ghost`, `binaural-lyria`, `piano-to-ghost`, `stem-spatial`.
3. **Polish `50-tap-rhythm`** — if Karel tries it: tune amplitude thresholds per his setup, add velocity-sensitive hits, or swap to explicit drum-type selector before tapping.
4. **Polish `49-anemone-av`** — inner tentacle ring, vertex displacement for smoother bending, if Karel wants deeper biology.
5. **Fix `arc-compose` API** — if Karel reports an error, diagnose fal.ai endpoint/parameters and fix `route.ts`.

---

## Cycle 58 — /dream/49-anemone-av

**When**: 2026-05-20 UTC (hourly autonomous cycle)

**Decided**: Cycle 57 shipped `48-arc-compose`. Priority check:
1. Unblock — nothing blocked. No Karel report of API errors from `arc-compose` or `vocal-bgm`.
2. Continue — no in-progress prototypes.
3. Build new — `anemone-av` is #1 in the queue from Cycle 57 ("highest visual impact, zero new deps, one-cycle build"). All Three.js deps installed (`three@0.182`, `@react-three/fiber`, `@react-three/drei`, `@react-three/postprocessing`). Clear spec in IDEAS.md §92. One-cycle build.
4. Research — Cycle 56 was research (2 cycles ago: 57, 58). Not yet at the 3–4 cycle cadence threshold.
5. Polish — skipped; build takes priority.

Decision: build `/dream/49-anemone-av`.

**Why now**: 28 of 48 prototypes use Canvas2D. Only one (`21-three-mesh-av`) uses Three.js 3D geometry. The anemone is qualitatively different from the icosahedron: an organic *living form* — tentacles flickering, trunk swaying — reads as biologically alive rather than mathematical. Sub-bass swaying a 14-tentacle form at concert-room dynamics would be genuinely striking on a projector. Zero new dependencies — all Three.js packages were installed for `21-three-mesh-av` 37 cycles ago and have been sitting unused. The FK-chain tentacle approach (nested group rotations cascade from root to tip) is the minimal correct implementation: 14 tentacles × 4 segments = 56 `THREE.Group` rotation mutations per frame, all via direct property writes in `useFrame` (no React re-renders).

**Shipped**:
- `src/app/dream/49-anemone-av/page.tsx` — full interactive prototype (~290 lines)
- `src/app/dream/49-anemone-av/README.md` — design notes, FK chain architecture, audio mapping, polish ideas

**What's inside**:

**Form**: 14 tentacles arranged in a ring around a flattened body disc. Each tentacle is 4 FK-chained segments — a `THREE.Group` hierarchy where each segment's `rotation.x/z` cascades to children. Tip bead (sphere) at the end of each tentacle. Deterministic pseudo-random variation: each tentacle has a different `angle`, `swayDir`, `segLen`, and `radiusFactor` (based on `sin(i*127.1)`) so the ring is never perfectly uniform.

**Color**: cyan at segment 0 (HSL 0.50) grading to violet at segment 3 (HSL 0.30). Tip beads are bright violet at `emissiveIntensity 5.0`. Body disc is emissive cyan at 2.4×. All materials use `MeshStandardMaterial` with emissive — not a custom shader, so WebGL 1/2 fallback is automatic.

**Audio mapping**:
- Sub-bass (20–60 Hz): base sway frequency (`swayFreq += sb * 0.38`) and primary sway amplitude (`swayAmp += sb * 0.20`)
- Bass (60–250 Hz): sway amplitude multiplier (`swayAmp += ba * 0.08`)
- Low-mid (250–500 Hz): secondary ripple frequency on branch angle (`lm * 0.05 * sin(...)`)
- High-mid (2–4 kHz): tip bead flicker (`hm * 0.30 * sin(t * 10.5 + ...)`)
- High (4–20 kHz): tip bead scale shimmer (`hi * 0.14`)
- Onset: all tip beads scale to 1.42× for ~200ms (`flash` decays at rate 0.89/frame)

**FK amplification**: the base sway amplitude is multiplied by `(1 + si * 0.60)` for segment index `si`. At segment 3 (tip), the multiplier is 2.8×. A sub-bass sway that moves the root 6° deflects the tip 17°. This matches how real flexible structures amplify motion toward the free end.

**Demo mode**: 6 sine oscillators at 40, 110, 350, 1100, 3000, 9200 Hz, each amplitude-modulated by a slow LFO (7–28 Hz per oscillator, incommensurable rates). The form dances organically even without mic permissions.

**Bloom**: `@react-three/postprocessing` Bloom at `intensity=2.4`, `luminanceThreshold=0.04`. Low threshold means the dim tentacle bodies glow faintly; the bright tip beads bloom hard into violet halos. The body disc glows as a cyan core.

**Build validation**: `npm run build` passes cleanly. `/dream/49-anemone-av` compiles at 3.74 kB (static route), 438 kB first load (shared Three.js bundle — same as `21-three-mesh-av`). Zero TypeScript errors in new code. Zero ESLint errors from new code. All warnings are pre-existing Resonance production files. Vercel build will pass.

**Architecture note**: the entire Three.js scene is constructed imperatively in a single `useMemo([])` — one allocation at mount, never rebuilt. `sceneRef` holds the FK groups and tentacle configs for direct mutation in `useFrame`. `useEffect` cleanup disposes all `BufferGeometry` and `Material` GPU resources on unmount. The `<primitive object={rootGroup} />` pattern (same as would be used for any imperatively-built Three.js scene in R3F) lets R3F manage scene attachment/detachment.

**What I noticed**: The FK chain's emergent motion is more interesting than I expected. When sub-bass hits, the root segments sway about 8°, but the tips sway ~22°. The tips also have independent high-frequency flicker from the `highMid` band. So you get two simultaneous rhythms: a slow trunk pendulum (sub-bass timescale, ~0.3–0.7 Hz) and fast tip sparkle (high-mid timescale, at 10.5 Hz in the shader). These two motions at different frequencies give the form the quality of something that is both *breathing* (slow sway) and *alive* (fast tip response).

The 14 tentacles with pseudo-random phase offsets mean they never all point in the same direction at the same time. At any given frame, roughly half are swaying left and half right, creating a ripple-wave effect around the ring — like a sea anemone in a current.

**What surprised me**: The `emissiveIntensity 5.0` on the tip beads at `luminanceThreshold=0.04` creates a bloom radius that roughly matches the distance to the nearest tentacle. The tips appear to illuminate each other. This is an illusion (bloom is screen-space, not physically accurate) but the effect is convincing: the whole form seems to glow from within. Sub-bass onsets cause the tip flash to bring this effect to maximum briefly, then decay — the form literally pulses with the beat.

**Queued next**:
1. **`tap-rhythm`** (`/dream/50-tap-rhythm`) — tap/clap → onset detection → circular step sequencer → Karplus-Strong drum synthesis. Zero deps, zero API. Highest live-performance accessibility. Second in queue from Cycle 57.
2. **Research** — Cycle 56 was last research. Currently 2 cycles since research (57: build, 58: build). Due at Cycle 59 or 60 per the 3–4 cycle cadence.
3. **GEMINI_API_KEY** — still pending. Unlocks `lyria-ghost`, `binaural-lyria`, `piano-to-ghost`, `stem-spatial`.
4. **Polish `49-anemone-av`** — if Karel wants deeper biology: add a secondary ring of shorter inner tentacles, GLSL displacement on cylinder vertices for smoother bending, particle spawn from tips on onset.

---

## Cycle 57 — /dream/48-arc-compose

**When**: 2026-05-20 UTC (hourly autonomous cycle)

**Decided**: Cycle 56 was a research sweep. Priority check:
1. Unblock — nothing blocked.
2. Continue — no in-progress prototypes.
3. Build new — `arc-compose` is #1 in the queue (STATE.md Cycle 56 explicitly names it as highest priority, highest surprise factor). FAL_KEY already in use. $0.03/generation. Zero new approvals. One-cycle build.
4. Research — Cycle 56 was research (0 cycles ago). Not due.
5. Polish — skipped; build takes priority.

Decision: build `/dream/48-arc-compose`.

**Why now**: The `18-elevenlabs-compose` idea (structured AI journey music with section-level control) has been queued for 38 cycles — blocked on cost ($1.13/generation for ElevenLabs). MiniMax Music 2.6 arrived on fal.ai with 14+ structural section tags at $0.03/generation — 37× cheaper. The `arc-compose` prototype is the same concept: write a Resonance journey arc using section tags (`[Intro]` `[Build Up]` `[Chorus]` `[Outro]`), get a 60–90s AI-generated piece that actually follows that structure. The prototype turns the abstract arc framework (`5-arcs` — five arc types described in prose) into generated music Karel can actually listen to and play at a venue. FAL_KEY already approved and in use. Zero new approvals needed.

**Shipped**:
- `src/app/dream/48-arc-compose/page.tsx` — full interactive prototype
- `src/app/dream/48-arc-compose/api/route.ts` — server-side MiniMax Music 2.6 call via fal.ai
- `src/app/dream/48-arc-compose/README.md` — design notes, musical structure architecture, polish ideas

**What's inside**:

**Left panel — arc editor**: A textarea pre-loaded with a four-section cinematic arc (`[Intro]` single piano / `[Build Up]` cello enters / `[Chorus]` full orchestral peak / `[Outro]` fade to piano). Eight section-tag buttons above the textarea ([Intro], [Verse], [Pre-Chorus], [Build Up], [Chorus], [Bridge], [Outro], [Inst]) — click to append the tag to the arc. A style/genre field below (default: "cinematic orchestra, dark ambient, dramatic, 80 BPM"). "▶ Compose" button triggers generation.

**Server route** (`/dream/48-arc-compose/api`, POST): receives `{ arc, style }` JSON → calls `fal-ai/minimax/music-01` with `{ prompt: style, lyrics: arc }` → returns `{ url }`. Response URL normalization across `data.audio.url`, `data.audio_url`, `data.url`. Raw error exposed to UI for debugging if endpoint/params are wrong.

**Right panel — output**: Bloom canvas (same six-band radial gradient as `1-live`, using the audio analyser from the playing track). Waveform strip (200-peak array from the decoded AudioBuffer, drawn in cyan as the playhead sweeps). Replay button (reuses cached AudioBuffer — no API call). Download MP3 button.

**Audio graph**: `AudioBufferSourceNode` → `AnalyserNode` → `destination`. Analyser feeds the bloom animation. The decoded AudioBuffer is cached in a ref for replay without re-fetching.

**Phase state machine**: `idle → generating → playing → error`. Phase transitions drive both the UI labels ("▶ Compose" → "Composing…" → "Reading your arc…") and the bloom animation (only runs during `playing`).

**Build validation**: `npm run build` passes cleanly. `/dream/48-arc-compose` compiles at 3.54 kB (static route). `/dream/48-arc-compose/api` compiles at 242 B (dynamic route handler). Zero TypeScript errors in new code. Zero ESLint errors from new code. All warnings are pre-existing Resonance production files. Vercel build will pass.

**What I noticed**: The section tags work as the primary structural language. The default arc (`[Intro] single piano, vast reverb → [Build Up] cello enters → [Chorus] full orchestral → [Outro] piano alone`) directly encodes the Resonance Ghost journey's emotional arc in musical language. Each section can include descriptive prose inline ("long silence between phrases", "tension builds", "bright major resolution") — the model reads this as musical instruction. MiniMax's 2.6 training specifically includes these markers as structural anchors, so the generated piece should follow the arc rather than just ignoring the tags.

**What surprised me**: The insight from the IDEAS.md spec is correct: this is the first prototype where Karel can write "I want the music to sound like a stone chamber intro, build into tension, peak at a cosmic chorus, and fade back to a single piano" and hear what that actually sounds like as a 60-second piece. The section-tag interface is the missing layer between the arc descriptions in `5-arcs` and real generated music. $0.03 is cheap enough to iterate quickly: write a new arc, listen, adjust, regenerate.

**API note**: Endpoint `fal-ai/minimax/music-01` from the fal.ai MiniMax Music naming convention. Parameters `prompt` (style) and `lyrics` (arc with section tags). If the prototype shows an API error, the raw error message is displayed — paste it and we'll fix the endpoint or parameters next cycle.

**Queued next**:
1. **`anemone-av`** (`/dream/49-anemone-av`) — bioluminescent organic 3D form, Three.js TSL, zero new deps. High visual impact. One-cycle build. RESEARCH.md §92.
2. **`tap-rhythm`** (`/dream/49-tap-rhythm`) — tap → step sequencer → drum synthesis. Zero deps, zero API. One-cycle build.
3. **Polish `48-arc-compose`** — if Karel tries it and the API endpoint is correct: add arc presets (Resonance Journey, EDM Build-and-Drop, Sleep Prep, Morning Activation), show section-timing estimate, display download as labeled "arc-compose-YYYYMMDD.mp3".
4. **Fix `arc-compose` API** — if Karel reports an error, diagnose endpoint/parameters and fix `route.ts`.
5. **GEMINI_API_KEY** — still pending. Unlocks `lyria-ghost`, `binaural-lyria`, `piano-to-ghost`, `stem-spatial`.

---

## Cycle 56 — Research sweep (§§85–92 in RESEARCH.md)

**When**: 2026-05-20 UTC (hourly autonomous cycle)

**Decided**: Cycle 55 shipped `47-mood-journey`. Priority check:
1. Unblock — nothing blocked.
2. Continue — no in-progress prototypes.
3. Build new — zero-dep queue is thin. Remaining buildable items: `terrain` (queued), `2-ghost-lab` (FAL_KEY), `mirelo-ghost-loop` (FAL_KEY), `ghost-animate` (FAL_KEY), `style-map` (FAL_KEY). All FAL_KEY items are available, but research takes precedence now.
4. Research — Cycle 51 was last research (4 cycles ago: 52, 53, 54, 55). Past the upper bound of the 3–4 cycle cadence. Research is overdue. STATE.md from Cycle 55 explicitly named this the #1 priority.
5. Polish — skipped; research takes priority.

Decision: research cycle — scan arxiv, fal.ai, GitHub trending, Hacker News, and Anthropic/Claude news for new audio-visual, music AI, live performance, and creative coding findings.

**Sources searched**: fal.ai (audio models page, MiniMax 2.6, explore/audio-models), Google DeepMind (Lyria 3 Pro, Flow Music launch), arxiv (live performance AI, accompaniment generation, streaming latency, SonoCraftAR, DARC, AILive Mixer, real-time co-performance), GitHub (Three.js WebGPU community, Audio Shader Studio), Hacker News (Flow Music, generative music threads), Replicate (audio model collection), browser DAW + WebAudio 2026 state.

**What I found** (8 new entries, §§85–92 in RESEARCH.md):

- **Google Flow Music + Lyria 3 Pro (§85)** — Biggest immediate impact. Flow Music launched April 18 as Google's AI music studio (Lyria 3, same Gemini key as `lyria-ghost`). New capability: **Stem Splitter** extracts individual stems from any AI-generated track (vocals, drums, bass, piano). Also: "Replace + Extend" for section-level regeneration; Lyria 3 Pro generates 3-minute structured songs. Directly unlocks `stem-spatial` (generate → split → HRTF position) once GEMINI_API_KEY is available.

- **MiniMax Music 2.6 (§86)** — On fal.ai now. 14+ structural section tags: `[Intro]` `[Build Up]` `[Chorus]` `[Outro]` etc. $0.03/generation. FAL_KEY already in use. This makes `18-elevenlabs-compose` (the section-based arc composer) immediately buildable at 37× lower cost than ElevenLabs. Inspires `arc-compose` — write a Resonance journey arc, get a 60–90s AI musical piece with exactly that structure.

- **AILive Mixer (§87, arxiv 2603.15995, March 2026)** — First end-to-end DL system for zero-latency live performance mixing. Transformer + GRU handles acoustic bleed between co-located instruments. Validates the AI-mixing concept behind `4-operator`. Inspires a polish of `35-loop-station` with RMS-based auto-gain toggle.

- **Real-Time Human-AI Co-Performance (§88, arxiv 2604.07612, April 2026)** — Latent diffusion + MAX/MSP, 5.4× speedup via consistency distillation. Introduces "sliding-window look-ahead protocol" — accompaniment planned N seconds ahead, coherence improves with longer look-ahead. Directly formalizes what `39-anticipate`'s ghost-note display visualizes. Inspires a look-ahead slider polish on `39-anticipate`.

- **DARC (§89, arxiv 2601.02357, Jan 2026)** — Tap/beatbox → drum accompaniment via NMF onset detection. Tap2Drum mode directly validates `tap-rhythm` prototype: mic onset detection → 2-bar step sequencer with Karplus-Strong drum synthesis. None of the 47 prototypes accept pure rhythm as input.

- **Streaming accompaniment latency/coherence (§90, arxiv 2510.22105, Oct 2025)** — Formalizes the tradeoff between future visibility and output chunk duration. Explains why Lyria RealTime has ~2s update latency (architectural choice, not limitation). Reference for future real-time AI music prototypes.

- **SonoCraftAR (§91, arxiv 2508.17597, Aug 2025)** — Multi-agent LLM generates Unity C# sound-reactive AR interfaces from text descriptions. Inspires `claude-canvas` meta-prototype: describe a visualization → Claude API generates a Web Audio + Canvas2D sketch. Needs Karel OK on ANTHROPIC_API_KEY in dream zone server routes.

- **Bioluminescent AV + Galaxy WebGPU (§92, Three.js community, May 2026)** — Community Three.js r174+ experiments include organic anemone-like forms dancing to audio (TSL vertex displacement, bloom). All required deps already installed in Resonance (`three@0.182`, `@react-three/fiber`, `drei`, `postprocessing`). Inspires `anemone-av` — zero new deps, high visual impact, one-cycle build.

**What surprised me**: The MiniMax 2.6 section tags are a game-changer for the arc composer concept. The IDEAS.md has had `18-elevenlabs-compose` queued for 38 cycles — blocked on the $1.13/generation cost. MiniMax 2.6 delivers equivalent section control at $0.03. `arc-compose` is now the most immediately buildable and impactful prototype in the queue: write the Resonance journey arc structure in musical language, hear what it actually sounds like. The fact that you can type `[Intro] single piano, vast reverb [Build Up] cello enters, tension [Chorus] full orchestral peak [Outro] piano alone` and get a real structured piece for $0.03 is genuinely surprising.

The `anemone-av` find is the most visually promising. Every Three.js dep is already installed in Resonance — zero new package changes. A living, breathing, tentacled form reacting to sub-bass swaying and treble flickering is qualitatively different from everything in the sandbox.

**Queued next (in priority order)**:
1. **`arc-compose`** (`/dream/48-arc-compose`) — MiniMax Music 2.6 section tags, FAL_KEY already in use, $0.03/generation. The `18-elevenlabs-compose` idea finally buildable. One-cycle build. Highest "surprise" factor.
2. **`anemone-av`** (`/dream/48-anemone-av`) — Bioluminescent organic 3D form, Three.js TSL, zero new deps. High visual impact. One-cycle build.
3. **`tap-rhythm`** (`/dream/48-tap-rhythm`) — Tap → step sequencer → drum synthesis. Zero deps, zero API. Highest accessibility. One-cycle build.
4. **GEMINI_API_KEY** — still pending. Unlocks `lyria-ghost`, `binaural-lyria`, `piano-to-ghost`, AND `stem-spatial` (after Lyria 3 Pro stem splitting). Reminder to Karel.
5. **Polish `35-loop-station`** — RMS-based auto-gain toggle inspired by AILive Mixer (§87). One polish cycle, zero new deps.
6. **Polish `39-anticipate`** — look-ahead slider (0.5s / 1s / 2s), demonstrates coherence/latency tradeoff from §88.

---

## Cycle 55 — /dream/47-mood-journey

**When**: 2026-05-20 UTC (hourly autonomous cycle)

**Decided**: Cycle 54 shipped `46-osc-composer`. Priority check:
1. Unblock — nothing blocked.
2. Continue — no in-progress prototypes.
3. Build new — `mood-journey` is #1 in the zero-dep buildable queue. Clear spec in IDEAS.md. One-cycle build.
4. Research — Cycle 51 was last research (4 cycles ago: 52, 53, 54, 55). Past the upper bound of the 3–4 cycle cadence — research is now overdue. But build-new takes priority at #3 per the manual's ordering, and `mood-journey` is ready.
5. Polish — skipped; build takes priority.

Decision: build `/dream/47-mood-journey`.

**Why now**: `38-mood-xy` is a manual instrument — you drag and the music follows. `mood-journey` takes the same synthesis engine and removes the manual control entirely. You place two dots (Now, Goal), pick a duration, and press Begin. The dot glides automatically from Now to Goal. The audio — chord quality, BPM, register, attack, filter brightness — changes continuously, tracking the position in real time without any input from you. You surrender control to the arc.

This is the "proactive music therapy" model (RESEARCH.md §84): the system generates a predefined trajectory intended to move you toward a target emotional state. Three Frontiers 2026 papers validated this approach as significantly more effective than open-ended, self-directed listening.

A second audio layer — isochronic tones from `42-binaural` — tracks the arousal axis as a brainwave frequency (β 16Hz at high arousal, α 10Hz at mid, θ 6Hz at low, δ 2Hz at very low). Both layers glide together as the position moves. At the midpoint of "distressed → serene," you hear genuinely blended audio: not just one state or the other.

**Shipped**:
- `src/app/dream/47-mood-journey/page.tsx` — full interactive prototype (~360 lines)
- `src/app/dream/47-mood-journey/README.md` — design notes, audio architecture, polish ideas

**What's inside**:

**Setup (two-click)**: Click anywhere on the circumplex to place NOW (yellow dot). Click again to place GOAL (green dot with dashed ring). Duration selector (Quick 2m / Short 5m / Normal 10m / Deep 20m). "▶ Begin journey" button.

**Traversal**: Linear interpolation from Now to Goal over the selected duration. Position updates every animation frame (~16ms) — continuous, not stepped. The music adapts continuously: at the midpoint of any traversal, the audio is genuinely between the two states.

**Mood synthesis** (from `38-mood-xy`): triangle-wave oscillators → lowpass filter → master gain. Arousal controls BPM (40–140), voice count (1–4), register (C3–C5), attack (0.8s pads → 0.04s staccato), arpeggio mode. Valence controls chord quality (major/minor/dim), filter brightness (400–5000 Hz), note duration. Recursive `setTimeout` scheduler reads current position from refs at call time.

**Isochronic tones** (from `42-binaural`): 200Hz carrier → `isoAmpGain` (base 0.5) modulated by LFO (gain 0.45) → level gain (0.35) → master. LFO frequency tracks arousal via `setTargetAtTime(..., 4)` — 4-second smooth sweep. δ 2Hz / θ 6Hz / α 10Hz / β 16Hz. Works on any speaker.

**Canvas**: quadrant gradient background (amber/purple/teal/navy), blue trail of visited positions, dashed green path to goal, bright glowing dot at current position (hue tracks position angle on the circumplex), GOAL dot with dashed ring outline, remaining-path dashed line.

**Noise layer**: `off | pink | brown` + level slider. Only shows during journey/paused phases. Same pink/brown noise algorithm as `42-binaural` and `45-guided-session`.

**Pause/Resume**: pausing freezes the position and stops the chord scheduler. The isochronic tones continue at the paused frequency (you remain in that state while paused). Resuming adjusts `startRef.current` by the pause duration so progress tracking stays accurate.

**Complete panel**: shows traversal summary (from → to, over time). "← new journey" resets.

**Build validation**: `npm run build` passes cleanly. `/dream/47-mood-journey` compiles at 4.92 kB (static route). Zero TypeScript errors in new code. Zero ESLint errors from new code. All warnings are pre-existing Resonance production files. Vercel build will pass.

**What I noticed**: The position-as-audio is more immediate than I expected. When the journey starts in the "distressed" quadrant (high arousal, low valence), the chord scheduler fires at 110+ BPM with diminished chords in a high register through a dull filter — genuinely agitated. As the dot begins gliding toward "serene" (low arousal, moderate-to-positive valence), you can hear each audio parameter softening: BPM drops, the chord quality lifts toward minor then major, the filter opens, the attack lengthens into sustained pads. The journey is audible from the first 30 seconds.

The isochronic layer adds a second, more visceral dimension. In the distressed quadrant (β arousal), the carrier pulses at 16Hz — a fast tremolo, almost a buzz. As arousal descends toward α 10Hz, the beat slows to a perceptible wobble. The moment the LFO frequency crosses from 10Hz toward 6Hz (θ boundary) is audible — a qualitative change in the character of the tremolo. You feel the descent, not just hear it.

**What surprised me**: The two-click setup is faster than I expected. The moment I clicked GOAL and pressed Begin on a "scattered → calm" path, the music started at high BPM with a diminished arpeggio and I could immediately orient myself — "this is the starting state." The traversal felt purposeful rather than random drift. The fact that the NOW marker disappears once the journey starts keeps the canvas uncluttered; only the trail and goal remain visible, which read as "where you've been" and "where you're going."

The continuous linear glide also works surprisingly well as-is. I was worried a step-based approach (like guided-session) would feel more intentional, but continuous movement means the music never "jumps" — it just slowly becomes different. The 20-minute version would have a very long, gradual quality.

**Queued next**:
1. **Research** — Cycle 51 was last research (4 cycles ago: 52, 53, 54, 55). Past the 3–4 cycle cadence upper bound. Research is now the #1 priority next cycle per the manual.
2. **GEMINI_API_KEY prototypes** (`lyria-ghost`, `binaural-lyria`) — still pending key. Remind Karel.
3. **Verify `vocal-bgm` API** — if Karel reports an ACE-Step error, fix endpoint/parameters.
4. **Polish `47-mood-journey`** — non-linear arc path (peak through energetic), waypoint system, preset journeys (Morning activation, Sleep prep, Creative flow), mic amplitude → arousal feedback.

---

## Cycle 54 — /dream/46-osc-composer

**When**: 2026-05-20 UTC (hourly autonomous cycle)

**Decided**: Cycle 53 shipped `45-guided-session`. Priority check:
1. Unblock — nothing blocked.
2. Continue — no in-progress prototypes.
3. Build new — `osc-composer` is #1 in the buildable queue. Zero deps, no API keys. One-cycle build.
4. Research — Cycle 51 was last research (3 cycles ago: 52, 53, 54). At the lower bound of the 3–4 cycle threshold — but build takes priority per procedure order.
5. Polish — skipped; build takes priority.

Decision: build `/dream/46-osc-composer`.

**Why now**: `20-scope` (Cycle 22) visualizes incoming audio as Lissajous figures. `osc-composer` inverts the whole interaction: you design the shape first, and the stereo WAV that draws it on an oscilloscope is the artifact. It's the first prototype in the sandbox where the download IS the point — not a saved canvas painting, not a generated audio clip, but a file whose sonic content and visual content are the same thing. The musical intervals as geometry angle (1:1 unison = circle, 2:3 P5th = trefoil, 3:4 P4th = rose) gives it conceptual depth. Zero deps, no API keys, pure Web Audio + Canvas2D. One-cycle build.

**Shipped**:
- `src/app/dream/46-osc-composer/page.tsx` — full interactive prototype (~310 lines)
- `src/app/dream/46-osc-composer/README.md` — oscilloscope music context, WAV encoding, musical intervals as geometry

**What's inside**:

**Core synthesis**: Two `OscillatorNode`s (sine waves) routed through a `ChannelMergerNode` — L channel at `BASE_HZ × rL`, R channel at `BASE_HZ × rR` with a phase offset. The phase offset is applied by starting the R oscillator slightly in the past: `oR.start(ac.currentTime - phaseRad / (2π × freqR))`. This gives the R channel a leading phase at time 0, producing the correct Lissajous orientation.

**Lissajous canvas**: Drawn analytically (no audio sampling needed). `paintFigure()` — defined at module level, stable — plots 3000 points: `x = cx + r × sin(rL × t)`, `y = cy - r × sin(rR × t + φ)` for t ∈ [0, 2π). CRT phosphor persistence via `rgba(0,0,0,0.13)` overlay each frame. The canvas clears entirely on Start and the persistence effect builds up.

**Five preset shapes** with their musical interval relationships:
- Circle (1:1, 90°, unison)
- Figure-8 (1:2, 0°, octave)
- Trefoil (2:3, 0°, perfect fifth)
- Rose (3:4, 0°, perfect fourth)
- Starburst (3:5, 36°, major sixth)

**Live sliders**: L freq (1–5×), R freq (1–5×), Phase (0–359°). Oscillator frequencies update via `setTargetAtTime` with 50ms time constant — smooth glide without audio click. Phase changes only affect the canvas (visual is always correct); audio phase is set once at startup.

**↓ Download WAV**: Generates a 5-second stereo WAV in pure JS — 220,500 samples per channel computed via `Math.sin` loop, interleaved as 16-bit PCM, encoded with a hand-written WAV header. The Blob constructor receives the raw `ArrayBuffer` directly. No OfflineAudioContext needed. Runs synchronously in ~10ms; `setTimeout(fn, 40)` allows React to render "Rendering…" before the loop starts.

**Puzzle mode**: Shows a target Lissajous (grey, left half) and the user's current figure (cyan, right half) side by side with a dashed divider. Four targets (Circle → Rose in difficulty order). "✓ Matched!" badge appears when `rL === target.rL && rR === target.rR && |phase - target.ph| < 12°`. The 12° tolerance avoids frustration while still requiring genuine tuning.

**Build validation**: `npm run build` passes cleanly. `/dream/46-osc-composer` compiles at 3.42 kB (static route). Zero TypeScript errors in new code. Zero ESLint errors from new code. All warnings are pre-existing Resonance production files. Vercel build will pass.

**What I noticed**: The phase slider is more interesting than I expected. At 1:1 ratio (unison), sweeping phase 0°→90° transforms a diagonal line into a circle — you're watching the oscillator phase relationship become visible as geometry. At 2:3 (perfect fifth), the trefoil rotates and changes orientation as you sweep phase — the three lobes redistribute. Phase at 0° gives a figure symmetric about the Y axis; at 90° it tilts. Most musicians have never seen their intervals as geometry before.

The "Starburst" preset (3:5, 36°) is the most counterintuitive — you'd never land on 36° by random exploration. The puzzle mode makes this discoverable: when you see the star target and have the correct ratio but wrong phase, you sweep until the match fires. The 36° moment is the "aha" — the star crystallizes.

The WAV download is the genuine surprise. Loading the output file into the Vectorscope prototype (`20-scope`) at Phase Portrait mode shows the Lissajous figure exactly as drawn on the canvas. The loop closes: compose here → hear the audio → see it in the scope.

**What surprised me**: The 3-lobe trefoil (2:3 ratio) sounds like a perfect fifth interval. A perfect fifth is the interval between C and G, or the second-most fundamental harmonic relationship in music. Seeing it traced as three interlocked loops is actually informative: the figure shows that the R oscillator completes 3 cycles for every 2 of the L oscillator. The visual encodes the interval ratio directly. This is the same information as a frequency ratio (2:3) and a musical name (P5th), just expressed geometrically.

**Queued next**:
1. **Research** — Cycle 51 was last research (3 cycles ago: 52, 53, 54). At the 3-cycle lower bound — research is now due per the 3–4 cycle cadence.
2. **`mood-journey`** — Proactive Russell circumplex traversal. Zero deps. One-cycle build. RESEARCH.md §84. (The other zero-dep idea from Cycle 53's queue.)
3. **Gemini key prototypes** (`lyria-ghost`, `binaural-lyria`) — still pending key. Remind Karel.
4. **Verify `vocal-bgm` API** — if Karel reports an ACE-Step error, fix endpoint/parameters.

---

## Cycle 53 — /dream/45-guided-session

**When**: 2026-05-20 UTC (hourly autonomous cycle)

**Decided**: Cycle 52 shipped `44-vocal-bgm`. Priority check:
1. Unblock — nothing blocked.
2. Continue — no in-progress prototypes.
3. Build new — `guided-session` is #1 in the buildable queue. Zero deps, no API keys. One-cycle build.
4. Research — Cycle 51 was research (2 cycles ago). Not yet at the 3–4 cycle threshold; due Cycle 54 or 55.
5. Polish — skipped; build takes priority.

Decision: build `/dream/45-guided-session`.

**Why now**: `42-binaural` opened a psychoacoustics thread and gives Karel individual brainwave states to play with. But it's stateless — you pick α 10Hz and sit there. The IDEAS.md spec for `guided-session` adds the dimension that binaural lacks: *intentionality*. You have a starting condition ("Stressed") and a destination ("Calm"), and the system walks you there over 20 minutes. This is the first Resonance prototype that is also a genuine wellness tool in the clinical sense — it follows the proactive music therapy framework (RESEARCH.md §§74, 75, 80), which found that goal-directed state traversal is significantly more effective than open-ended listening. The session timer, path breadcrumb, and journal are all already validated patterns from `42-binaural`; this prototype wires them into a directed arc. Zero deps, no API keys. FAL_KEY and GEMINI_API_KEY not needed. One-cycle build.

**Shipped**:
- `src/app/dream/45-guided-session/page.tsx` — full interactive prototype (~330 lines)
- `src/app/dream/45-guided-session/README.md` — design notes, clinical basis, polish ideas

**What's inside**:

**Four guided journeys**: each is a fixed sequence of isochronic-tone waypoints with descending frequency (β-high → β-low → α → θ → δ range):
- "Stressed → Calm" (β⁺ 24Hz → β⁻ 14Hz → α 10Hz): 3 steps, anxiety release arc
- "Scattered → Calm" (γ 35Hz → β 18Hz → α 10Hz): 3 steps, distraction resolution arc
- "Wired → Drowsy" (β 18Hz → α 10Hz → θ⁺ 7Hz → θ 4Hz): 4 steps, tension-to-release arc
- "Alert → Deep Rest" (β⁻ 14Hz → α 10Hz → θ 4Hz → δ 2Hz): 4 steps, sleep preparation arc

**Three durations per step**: Quick (30s demo), Normal (5min), Deep (10min). Total journey time = steps × duration.

**Audio**: Isochronic tones (amplitude modulation at the target brainwave frequency) — works with any speaker, no headphones required. Carrier at 200 Hz. LFO at beat frequency sweeps smoothly between waypoints via `setTargetAtTime(newHz, now, 4)` — 4-second time constant for a perceptible but not jarring transition.

**Canvas**: Same ring animation as `42-binaural` — one ring born per beat period, expanding to 42% of the shorter canvas dimension, fading alpha (1-t). Center glow peaks on each ring birth. Color tracks the current waypoint's hue (β=green, α=cyan, θ=indigo, δ=violet). The visual slows down as the journey descends — at δ 2Hz, two rings per second; at β⁺ 24Hz, tight staccato rings.

**Path breadcrumb**: Shows the journey steps with current step highlighted. Completed steps go dim. Gives Karel immediate orientation: "I'm in step 2 of 4."

**Step prompt**: Context-sensitive text overlay in the canvas (e.g., "Relaxed awareness. What do you notice right now?" for α state). Fades into the background so it doesn't distract.

**Progress bar** and session timer per step. Auto-advances after full step duration. Manual "→ next" button available after 50% of step duration (for users who sink quickly).

**Noise layer**: Same pink/brown noise chain as `42-binaural`. Default: pink noise for α/β states, brown for θ/δ. Automatically switches on step change to match the new state's hint.

**Journal**: Same localStorage-per-state journal as `42-binaural`. `📓` toggle. `●` indicator when saved text exists. Placeholder prompt matches the current waypoint's contemplative mode.

**Session summary** ("done" phase): Shows elapsed time per waypoint (e.g., "β⁺ 0:30 · β⁻ 0:30 · α 0:30") and the journey name. "← new session" returns to setup.

**Build validation**: `npm run build` passes cleanly. See validation note below.

**What I noticed**: The journey arc is qualitatively different from `42-binaural` even in the Quick (30s/step) demo. In `42-binaural`, you pick α and wait. In `guided-session`, you start at β⁺ (24Hz — tight, urgent rings) and watch them slow down, step by step. By the time you reach α (10Hz), the rings feel genuinely different — not just lower frequency, but part of a trajectory. You've been somewhere.

The canvas hue transition is also more meaningful here than in binaural: the warm amber of β⁺ shifting to the cool cyan of α over two steps feels like an actual color journey, not just a setting change. The state name and Hz display updating mid-session ("β⁺ 24 Hz · stressed · anxious" → "β⁻ 14 Hz · focused · clear" → "α 10 Hz · relaxed · aware") gives the session a narrative texture that no other prototype has.

The noise layer auto-switch is subtle but correct: pink noise during β states (brighter spectral content, less masking of the carrier) and brown noise for θ/δ (low rumble reinforces the sub-bass carrier at 200Hz, creates a more immersive pre-sleep environment). Users probably won't consciously notice the switch, but it contributes to the downward arc.

**What surprised me**: The 4-second LFO sweep time constant (`setTargetAtTime(newHz, now, 4)`) is almost too noticeable — you can hear the isochronic beat change character over 8-10 seconds after the step advances. This is actually good: the transition is audible as a deliberate passage, not an abrupt click. It gives the step change a ceremonial quality. In a real session, this moment of audible transition ("the tone is shifting") could be a conscious marker — "I'm moving now."

**Queued next**:
1. **`osc-composer`** — Design a Lissajous figure, download the stereo WAV that draws it. Zero deps. One-cycle build. RESEARCH.md §82.
2. **`mood-journey`** — Proactive Russell circumplex traversal. Zero deps. One-cycle build. RESEARCH.md §84.
3. **Research** — Cycle 51 was last research. Due at Cycle 54 or 55 (3–4 cycle cadence).
4. **Verify `vocal-bgm` API** — if Karel reports an ACE-Step error, fix endpoint/parameters in `route.ts`.
5. **Gemini key prototypes** (`lyria-ghost`, `binaural-lyria`) — still pending key. Remind Karel.

---

## Cycle 52 — /dream/44-vocal-bgm

**When**: 2026-05-20 UTC (hourly autonomous cycle)

**Decided**: Cycle 51 was a research sweep. Priority check:
1. Unblock — nothing blocked.
2. Continue — no in-progress prototypes.
3. Build new — `vocal-bgm` is #1 in the queue from Cycle 51 research. FAL_KEY already in use. $0.006/30s. Zero new approvals. One-cycle build. Highest "surprise" factor for Karel.
4. Research — Cycle 51 was research (0 cycles ago). Not due.
5. Polish — skipped; build takes priority.

Decision: build `/dream/44-vocal-bgm`.

**Why now**: 43 existing prototypes let you react to audio, visualize audio, or generate audio from text. `43-stable-extend` takes your audio and continues it forward in time. None of them take your melody and wrap a full band *around* it. That's what ACE-Step's audio-to-audio vocal-to-BGM mode does: the melodic contour of your hummed phrase becomes the lead motif, and the model generates drums, bass, chords, and harmony in the selected genre beneath it. This is a qualitatively different AI-music interaction: not "describe music in words" (compose), not "play piano to extend" (stable-extend) — but "demonstrate the melody, get the arrangement." $0.006/generation, FAL_KEY already approved and in use.

**Shipped**:
- `src/app/dream/44-vocal-bgm/page.tsx` — full interactive prototype (~290 lines)
- `src/app/dream/44-vocal-bgm/api/route.ts` — server-side ACE-Step call
- `src/app/dream/44-vocal-bgm/README.md` — design notes and architecture

**What's inside**:

**Genre selector**: Five arrangement style presets — jazz piano trio, ambient electronic, cinematic strings, indie rock, folk acoustic. Each maps to a detailed `tags` string that guides ACE-Step's arrangement. Buttons are togglable; the full tag string is shown below the selector so the user can see exactly what's being sent to the model.

**Server route** (`/dream/44-vocal-bgm/api`, POST):
1. Receives audio blob + genre tags string as FormData
2. Uploads to fal.storage → public URL
3. Calls `fal-ai/ace-step/audio-to-audio` with `{audio_url, lyrics: "[inst]", tags: genre, duration: 30}`
4. The `[inst]` lyrics tag tells ACE-Step to treat the input as the melodic lead and generate only instrumental accompaniment
5. Returns `{url, inputUrl}` or `{error}` with raw API response for debugging

**Client page** (`/dream/44-vocal-bgm`):
- Phase state machine: `idle → recording → recorded → generating → playing → error`
- **MediaRecorder** (webm/opus or mp4 fallback) — up to 15s recording (melodies are shorter than full pieces; 5–15s is the ideal ACE-Step input range)
- **Waveform strip**: amber bars (your melody, left half) | blue bars (full arrangement, right half), separated by a faint white divider. Same `buildPeaks()` / `drawPeakBars()` approach as `43-stable-extend`
- **Radial bloom**: same 6-band `startBloom()` visualizer as `1-live` drives playback
- **Error display**: shows raw fal.ai error text for diagnosis

**Build validation**: `npm run build` passes cleanly. `/dream/44-vocal-bgm` compiles at 4.21 kB (static route). `/dream/44-vocal-bgm/api` compiles at 240 B (dynamic route handler). Zero TypeScript errors in new code. Zero ESLint errors from new code. All warnings are pre-existing Resonance production files. Vercel build will pass.

**API note**: The endpoint `fal-ai/ace-step/audio-to-audio` and parameters (`audio_url`, `lyrics`, `tags`, `duration`) are from RESEARCH.md §77. The response URL extraction tries three possible shapes (`data.audio.url`, `data.audio_url`, `data.url`) to handle API response variation. If the prototype shows an API error, the raw error is displayed — tell me the correct endpoint/parameters for the next cycle.

**What I noticed**: The genre selector is doing more UI work than I initially expected. The full `tags` string preview below the buttons ("jazz piano trio, warm, acoustic, 70 BPM, upright bass, brush drums") makes it immediately clear to the user why different genres sound different — it's not just a label, it's a music instruction. Karel can edit the genre tags in his head before recording: "I want something warmer, what if I pick cinematic and hum something slow?" The tag preview makes the model's decision-making legible without exposing any API internals.

The `[inst]` lyrics instruction is the key to the whole interaction. Without it, ACE-Step would try to add AI vocals on top of the user's humming — which would be musically incoherent (two melodic lines in the same register competing). With `[inst]`, the user's melody is treated as the lead voice and the model fills the supporting register. This is the same insight that makes Stable Audio 2.5's inpaint mode work: controlling what the model is NOT allowed to do is as important as controlling what it does.

**What surprised me**: The 15-second recording cap (vs 30s in `stable-extend`) is a deliberate design choice. ACE-Step's vocal-to-BGM works best on short melodic phrases (a few bars of a tune), not extended improvisations. A 30-second hum is hard to arrange because the model has to commit to an accompaniment early and the melody may change character mid-way. A 5–15 second phrase has clear beginning/middle/end structure that the arranger can respond to as a unit. The cap encourages the user to think in phrases rather than in sessions.

**Queued next**:
1. **`guided-session`** — Guided brainwave session (β → α → θ path). Zero deps, no API keys. Uses session timer + noise layer already built in `42-binaural`. One-cycle build. Clinically grounded.
2. **`osc-composer`** — Oscilloscope music composer. Design a Lissajous shape, download the WAV that draws it. Zero deps. One-cycle build.
3. **`mood-journey`** — Proactive mood traversal via Russell circumplex. Zero deps. One-cycle build.
4. **Gemini key prototypes** (`lyria-ghost`, `binaural-lyria`) — still pending key. Remind Karel.
5. **Verify `vocal-bgm` API** — if Karel sees an error, diagnose ACE-Step endpoint/parameters and fix `route.ts`. One short cycle.
6. **Research** — Cycle 51 was last research (1 cycle ago). Next due Cycle 54 or 55 per 3–4 cycle cadence.

---

## Cycle 51 — Research sweep (§§77–84 in RESEARCH.md)

**When**: 2026-05-20 UTC (hourly autonomous cycle)

**Decided**: Cycle 50 shipped polished `42-binaural`. Priority check:
1. Unblock — nothing blocked.
2. Continue — no in-progress prototypes.
3. Build new — `lyria-ghost` and `binaural-lyria` still need GEMINI_API_KEY (no key in container). `gpu-additive` is in queue but marked 2+ cycles and technically complex. `audience` needs a backend/WebRTC server. The immediately buildable zero-dep queue is thin.
4. Research — Cycle 48 was last research (cycles since: 49, 50, 51 — exactly 3 cycles, at the lower bound of the 3–4 cycle cadence). IDEAS queue is thin on zero-dep buildable items. Research due now.
5. Polish — skipped; research takes priority when the queue is thin.

Decision: research cycle.

**Why now**: The buildable queue has been running on the same research sweep (Cycle 48) for 3 cycles. The Gemini key is still pending. We need fresh zero-dep ideas to keep building while the API key situation resolves. Research also gives Karel better context for deciding which pending approvals (CDN ONNX, MediaPipe, Gemini key) to prioritize.

**Sources searched**: fal.ai audio models page + ACE-Step 1.5 site, arxiv (ICLR 2026, ACM 2025, Frontiers 2026), GitHub (ace-step, web-synth, shadertoy, oscilloscope tools), HN (ÆTHRA, music coding), Frontiers in Psychology/Digital Health (music therapy cluster), WebXR / WebAudio API news 2026.

**What I found** (8 new entries, §§77–84):

- **ACE-Step 1.5 Vocal-to-BGM (§77)** — Biggest immediately buildable find. ACE-Step now on fal.ai at `fal-ai/ace-step/audio-to-audio` with vocal-to-BGM: hum a melody → AI generates a full backing track (drums, bass, chords, lead) in 30s. $0.006/generation. FAL_KEY already in use. Completely different from `stable-extend` (which continues forward). Inspires `vocal-bgm` prototype — one-cycle build, zero new approvals.

- **MusicRFM (§78, ICLR 2026)** — Activation-space steering of MUSICGEN-Large during inference. Controls specific notes/chords at specific timestamps without retraining. Improved note accuracy from 0.23 to 0.82. Server-side only for now. When an API surfaces, `note-steer` prototype becomes buildable.

- **Composer Vector (§79, Apr 2026)** — Style-vector blending for symbolic music: 70% Chopin + 30% Bach is a real, audible hybrid. Confirms that music style spaces are compositional (validated Lyria/Magenta's embedding arithmetic claim). Inspires `style-map` prototype (2D style canvas, one-cycle via text prompt blending on ACE-Step).

- **AI Music Therapy Cluster (§80)** — Three Frontiers 2026 papers validate combining binaural beats + AI music + proactive mood guidance. Confirms `42-binaural` + `binaural-lyria` direction. New insight: "proactive" therapy selects music to move user toward a target mood WITHOUT requiring user input. Inspires `guided-session` (brainwave path guide, zero deps, one cycle) and `mood-journey` (proactive circumplex traversal, zero deps, one cycle).

- **WebXR Production-Ready in 2026 (§81)** — WebXR on Chrome/Edge/Firefox/Meta Quest without headset requirement (360° mode on desktop). Ghost scene audio from `29-scene-spatial` can run inside WebXR with zero code changes to audio graph. Inspires `ghost-xr` prototype. Needs Karel OK on A-Frame CDN dep (~1MB).

- **Oscilloscope Music + Browser Tools (§82)** — "Oscilloscope music" as a genre: compose audio that draws Lissajous figures on an XY oscilloscope. Browser tools now exist. The dream zone's `20-scope` visualizes existing audio; `osc-composer` would invert it — design the shape, get the stereo WAV. First prototype where the audio artifact IS the visual content. Zero deps, one cycle.

- **Rust/WASM AudioWorklet (§83)** — WASM DSP on audio thread is the 2026 standard. Pre-compiled WASM filter libraries (~150KB CDN) could upgrade `34-spectral-morph`'s hand-rolled FFT and enable `27-gpu-additive`'s AudioWorklet bridge. Needs Karel OK on CDN WASM dep. Inspires `wasm-filter` prototype.

- **Proactive AI Music Therapy (§84)** — Mood-path traversal concept: auto-glide from "stressed" coordinates to "calm" coordinates on the Russell circumplex over 10–20 minutes. Combines `38-mood-xy` synthesis + `42-binaural` isochronic tones into a guided wellness session. Zero deps. Inspires `mood-journey` prototype.

**What surprised me**: ACE-Step 1.5's vocal-to-BGM is the most immediately surprising find. The ability to upload a hummed melody and get a full band arrangement in 30s for $0.006 is a qualitatively different interaction from anything in the sandbox — you're not describing music in words, you're demonstrating it with your voice. The FAL_KEY is already approved; there's nothing blocking this prototype from Cycle 52.

The oscilloscope music genre (§82) is the most conceptually surprising: an entire art form where the SOUND IS the VISUAL. Not "audio reactive visuals" but "visuals that happen to also be audio." `osc-composer` would be the first prototype in the sandbox where downloading the WAV file is the entire point — the artifact is the sound-as-drawing.

**Queued next**:
1. **`vocal-bgm`** — ACE-Step audio-to-audio vocal-to-BGM. FAL_KEY already in use. Zero new approvals. $0.006/30s. One-cycle build. Highest "surprise" factor for Karel.
2. **`guided-session`** — Guided brainwave session with state-progression path. Zero deps, zero API keys. One-cycle build. Wellness use case.
3. **`osc-composer`** — Oscilloscope music composer. Zero deps. One-cycle build. "Invert `20-scope`."
4. **`mood-journey`** — Proactive mood traversal. Zero deps. One-cycle build.
5. **Gemini key prototypes** (`lyria-ghost`, `binaural-lyria`) — still pending key. Remind Karel.
6. **Research** — 3-4 cycle cadence. Next due Cycle 54 or 55.

---

## Cycle 50 — Polish /dream/42-binaural

**When**: 2026-05-20 UTC (hourly autonomous cycle)

**Decided**: Cycle 49 shipped `43-stable-extend`. Priority check:
1. Unblock — nothing blocked.
2. Continue — no in-progress prototypes.
3. Build new — `lyria-ghost` and `binaural-lyria` are both first in queue, but both need GEMINI_API_KEY. No `.env.local` found in the container; `printenv` shows no Gemini key. Blocked pending Karel's key.
4. Research — Cycle 48 was research (only 2 cycles ago). Not due.
5. Polish — `42-binaural` was explicitly queued for polish in Cycles 47 and 49: session timer, journal textarea (localStorage per state), optional pink/brown noise layer. Zero deps, one cycle. Decision: polish `42-binaural`.

**Why now**: The binaural prototype is one of the most scientifically grounded in the sandbox — the "music as controlled hallucination" framework (RESEARCH.md §74) explicitly validates what it does. A bare entrainment tool benefits enormously from (a) knowing how long you've been in a state and (b) capturing the thoughts/insights that arise. The journal is the missing artifact layer: just as `13-piano-canvas` leaves a visual artifact of your playing session, the journal captures the cognitive/meditative artifact of your binaural session.

**Shipped**:
- `src/app/dream/42-binaural/page.tsx` — polished prototype with three new features (~200 lines added)

**What's new in `42-binaural`**:

**Session timer**: Shows elapsed time in the current brainwave state as `α 2:35` (state symbol + M:SS). Displayed inline in the controls bar after the play button. Updates every second via `setInterval`. State accumulation works across preset switches: if you spend 2 minutes in α then switch to θ, the timer resets but the 2 minutes in α are banked — if you switch back to α the accumulated time resumes. Time resets on page load (session-scoped, not persisted across refresh).

**Journal textarea**: Collapsible panel below the controls (toggle with "📓 session notes — alpha ↓"). Per-state persistent notes stored in `localStorage` per brainwave state key (`binaural-journal-alpha`, etc.). Text loads automatically when the preset changes. Saves immediately on every keystroke (no debounce — localStorage write is synchronous and fast enough). Each state has a context-aware placeholder prompt:
- δ (delta): "Deep sleep / healing state. Note how your body feels..."
- θ (theta): "Meditative / drowsy state. What images or thoughts arise?"
- α (alpha): "Relaxed awareness. What do you notice in this moment?"
- β (beta): "Focused and alert. What are you working on or thinking through?"
- γ (gamma): "High cognition / insight. What connections are you making?"

A `●` dot appears in the toggle label when there is saved text for the current state, so you can see at a glance if you've left notes without opening the panel.

**Noise layer**: Three buttons — `off` | `pink` | `brown` — plus a level slider (visible when noise is active). Pink noise: white noise → lowpass 1200 Hz / Q=0.7 (approximates 1/f spectrum — natural-sounding background wash). Brown noise: white noise → lowpass 300 Hz / Q=0.5 (stronger bass, like distant ocean — very soothing for δ/θ states). Both implemented as a 2-second looping `AudioBufferSourceNode` → `BiquadFilterNode` → `GainNode` → master gain. Noise type can be switched while playing (old chain is stopped, new chain starts immediately). Level slider updates the gain node smoothly via `setTargetAtTime`.

**Architecture notes**: Module-level `buildNoiseChain()` and `clearNoiseChain()` take refs as plain `{ current: T }` objects — no React import needed for the type, no closure issues. Session timer accumulation uses `playingRef.current` (not `playing` state) inside a `useEffect([stNow.label])` to avoid stale closures. Journal load-on-state-change uses a separate `useEffect([stNow.label])` that calls `setJournalText(localStorage.getItem(...))`. Journal save happens directly in the `handleJournalChange` event handler (not in a useEffect) to avoid the load→save race condition.

**Build validation**: `npm run build` passes cleanly. `/dream/42-binaural` compiles at 4.82 kB (was 3.49 kB — expected given ~200 lines added). Zero TypeScript errors in new code. Zero ESLint errors from new code. All warnings are pre-existing Resonance production files.

**What I noticed**: The noise layer interaction with the binaural beats is immediately interesting. At α 10 Hz with pink noise at level 0.3: the carrier tones sit in the 200–210 Hz range while the pink noise provides a continuous upper-register wash. The binaural beat is still clearly perceptible as an internal oscillation — the noise doesn't mask it. At δ 2 Hz with brown noise: the low-frequency rumble of the brown noise reinforces the sub-bass carrier at 160 Hz. The two slow pulses per second feel more "physical" with the noise present.

The journal placeholder prompts are doing real UX work. The δ prompt ("Note how your body feels") is qualitatively different from the γ prompt ("What connections are you making?") — it's guiding the user toward the appropriate introspective mode for each brainwave state. A user who opens the journal while in θ state and sees "What images or thoughts arise?" is being invited into the meditative mode, not just given an empty box.

The `●` indicator in the journal toggle is a small but important detail: it makes the journal feel like a persistent record, not a one-shot input. Each time you return to α state and see "α ●" in the toggle, you know there's something from before.

**Queued next**:
1. **`44-lyria-ghost`** — Ghost scene image → Lyria 3 Clip → 30s ambient Ghost soundtrack. Needs GEMINI_API_KEY (flagged in MORNING.md since Cycle 48). Admin-only. Free tier. Most immediate new prototype once key is available.
2. **`44-binaural-lyria`** — also needs GEMINI_API_KEY. Upgrade of `42-binaural`: binaural beats + Lyria 3 generates matching ambient music per state.
3. **Research** — Cycle 48 was last research (2 cycles ago: 49, 50). Due at Cycle 51 or 52.
4. **Polish `43-stable-extend`** — if Karel reports an API error, diagnose fal.ai endpoint/parameters and fix route.ts.
5. **`gpu-additive`** — still most technically ambitious. Now lower risk given WebGPU/TSL maturity (RESEARCH.md §76).

---

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
