# Resonance Dream Sandbox — prototype index

This is the single page Karel opens each morning. It mirrors the live
index at `/dream/` (the Vercel preview URL). Click a route to play
with the prototype; click the design notes link to read the agent's
thinking.

Status legend: `skeleton` (route exists, not yet interactive) ·
`wip` (partial) · `demoable` (works, rough) · `polished` (refined).

---

## ⭐ Newest (Cycle 334 — kids build · DEEP, 3 play-models of "Color Hunt: point the camera at real colors, each sings")

- **[/dream/368-kids-rainbow-quest](/dream/368-kids-rainbow-quest)** — Kids Rainbow Quest. `demoable` · Cycle 334.

  Open `/dream/368-kids-rainbow-quest`. **For kids (4+).** A friendly unicorn shows a glowing color and *wants* it — go **point the phone camera at something that color in the real world** (something red, then orange, then yellow…). Get close and the creature **glows warmer** (a rising musical shimmer); hold the match ~0.6s and it **celebrates** — a fanfare, a sparkle burst, and that color fills a **rainbow arc** across the top. Collect all seven → the arc lights up in order and plays a **rainbow song**, then loops with a fresh shuffle. No reading, no timer, no score, no fail — only "found it!" moments, and it gets the child *off the couch and into their room*.

  The lab's **first color-foraging *game*** — the camera sends the child into the physical world to hunt color, rather than tapping the screen (the most direct answer yet to the JURY's "stop staring at the screen"). Color→pitch is the most legible mapping the kids lane can make (KIDS.md: "color is the language"): each rainbow hue maps to a note in **D-Dorian** (D E F G A B C — **not** C-major-pentatonic), grounded by an always-on D+A perfect-fifth drone so any found note rings consonant. **Camera is analysis-only** — central-region `getImageData` → averaged RGB → HSV → angular hue-distance warmth score; never recorded, never uploaded, no network. Dodges every gate this fire: **camera INPUT** (fresh in the last-10 window; JURY banned touch/mic, diversity audit banned raw-WebGL2 4×; camera dodges all and sits in Karel's loved `101-camera-song`❤️/`86-sound-to-video`❤️ cluster), **DOM/CSS OUTPUT** (the lab's cool renderer — not WebGL2, not SVG), color-extraction TECHNIQUE, kids VIBE.

  Subsystems: (1) **color detection** — invisible offscreen canvas samples the central ~40×40 patch each frame, RGB→HSV, hue angular-distance → warmth (0–1), match requires hue-within-tolerance AND min saturation (rejects whites/greys) AND min brightness, with a 0.6s dwell-lock so it can't accidentally trigger; (2) **audio** (`audio.ts`) — D-Dorian fanfare (root→fifth→octave) + warmth shimmer (3 detuned high partials amplitude-mapped to proximity) + 7-note rainbow song + always-on D+A drone, all through a brick-wall `DynamicsCompressor` (sleeping-toddler-safe), AudioContext created inside the tap (iOS-safe); (3) **DOM/CSS visuals** — `<video>` background, a `radial-gradient` warmth glow, the rainbow arc as flex `<div>`s, CSS-custom-property sparkle bursts, an emoji creature scaled by warmth; (4) **graceful degrade / auto-demo** — if camera is denied or no frames arrive in ~2s, a `text-rose-300` notice shows and the **identical** match→fanfare→rainbow pipeline plays itself, completing the whole 7-color quest hands-free and looping (so it's fully alive at the 06:30 phone review with no camera).

  References: **Newton's *Opticks* (1704)** spectrum→scale-degree mapping, **Scriabin's *clavier à lumières* (1911)**, and the **Reggio Emilia** "hundred languages of children" (Malaguzzi, 1993 — color/sound as pre-literate languages). Born from RESEARCH §334 (camera-as-controller is commodity — Google "Jump to Play", 2026-03-24 — but the lab has no color-foraging game). Winner of a **DEEP** 3-play-model kids fire; siblings `366-kids-color-hunt` (free-forage + the melody you built replays as memory) + `367-kids-color-chord` (the whole room as a morphing 4-note chord) build-reviewed and banked in IDEAS §334. **Ambition 2/5**: ≥3 subsystems (#2) + named references (#3). **Build-verified, not browser-verified** — unverified surface: real hue-extraction feel under a phone camera's auto-white-balance/mixed lighting (the saturation/tolerance thresholds may need tuning), iOS AudioContext resume, and the auto-demo→live-camera handoff (no camera in this sandbox).

  Design notes: `src/app/dream/368-kids-rainbow-quest/README.md`

- **[/dream/365-cadence-ladder](/dream/365-cadence-ladder)** — Cadence Ladder. `demoable` · Cycle 333.

  Open `/dream/365-cadence-ladder`. A real-time **tonal/functional harmonic analyst**: press **▶ Begin** and a known progression plays while the analyzer names the **KEY** you're in (Krumhansl-Schmuckler key-finding), the **Roman-numeral function** of every chord, and renders harmony's pull-and-resolve as a three.js **tension ladder** — Tonic (rest, bottom) / Subdominant (departure, middle) / Dominant (tension, top). Each chord drops into its functional zone; **cadences flash named resolving arcs** — V→I *authentic* (emerald), IV→I *plagal/"amen"* (violet), V→vi *deceptive* (amber); when the music **modulates** a ripple sweeps and every Roman numeral re-contextualises (the same chord changes function as the key shifts). Connect a **MIDI keyboard** to play your own chords into the identical pipeline.

  The lab's **first key-estimation + functional/cadence analysis** — `229-chord-canvas` names chords but does NO key, NO Roman numerals, NO cadence/function. Proves itself 358-style: an internally-authored progression (C major with authentic/deceptive/plagal cadences → modulates to G major) is **known ground truth**, so it's watched proving itself on a phone with no hardware. The most faithful answer to the JURY's #1 adult provocation — *feed the legible/instructional lane* (its named wins were 358/353/345) and *starve the JI-drone monoculture*. **Ambition 4/5** (#1 lab-first technique · #2 ≥3 subsystems · #3 Krumhansl & Kessler 1982 / Temperley 2001 / Riemann functional harmony / Aldwell & Schachter cadence tradition · #5 RESEARCH §333). Input=internal-demo+MIDI · Output=three.js · Vibe=instructional. *Two siblings explored this DEEP fire — `364-tonal-orbit` (Chew Spiral Array, 3D tonal space) + `363-key-compass` (circle-of-fifths wheel) — banked in IDEAS §333.* **Build-verified, not browser-verified.** Design notes: `src/app/dream/365-cadence-ladder/README.md`

- **[/dream/360-kids-sand-choir](/dream/360-kids-sand-choir)** — Kids Sand Choir. `demoable`

  Open `/dream/360-kids-sand-choir`. **For kids (4+).** Press the big amber **▶**, then **tilt your phone or iPad** — a spout pours glowing warm sand that piles into dunes, and tipping the tablet swings gravity so the dunes flow left / right / down and reshape. Seven glowing harp strings cross the lower field; **every grain that comes to rest on a string sings a note**, so the *shape of the dune you build is the song*. No reading, no timer, no fail; it sways and plucks itself hands-free if nobody touches it.

  The lab's **first falling-sand granular cellular automaton** (grep-verified 0 across 350+ prototypes — the lab had Lenia `264`, Game-of-Life `25`, reaction-diffusion `9`, particle-life `8`/`16`/`236`, Navier-Stokes fluid `3`/`84`, n-body and physarum `327`, but never the most famous CA of all). It's also the kids lane's most **legible** cross-modal mapping yet — the direct answer to the JURY's standing #1 ("make it legible"): a 4-year-old sees cause→effect (build sand onto a low string → low note; cascade across all seven → a rippling arpeggio), where a glowing abstract cloud teaches nothing. Pulls on Karel's kids tilt/pluck love-cluster: `83-kids-tilt-rain`❤️ (tilt), `105-pluck-field`❤️ (Karplus pluck), `133-kids-ripple-pond`❤️ (build-it-→-it-sings).

  Four subsystems in one pipeline: (1) **falling-sand granular CA** (`sand.ts`) — a 180×120 grid where each cell is empty or one colored grain; each frame, scanning *against* gravity so a grain advances at most one cell, every grain tries to move in the gravity direction, then the two diagonal-down cells in randomized order (which is what makes sand slump into natural slopes); a top spout drips warm grains and emits a settle event when a grain stops on a string row; (2) **tilt→gravity input** (`page.tsx`) — `deviceorientation` β/γ become a smoothed 2D gravity vector quantized to a dominant fall axis + diagonal bias, so tipping the world flows the dunes; (3) **D-Dorian sonification** (`audio.ts`) — seven strings tuned D E F G A B C (low→high by row; **not** C-major-pentatonic), each a pre-rendered **Karplus–Strong** pluck pitched by row, stereo-panned by grain x, with an 80 ms per-string refractory so an avalanche never machine-guns; a soft always-on D+A triangle pad + a brick-wall `DynamicsCompressor` limiter (safe-sounds rule); (4) **WebGL2 render** (`gl.ts`) — the CA grid is uploaded to an RGBA8 texture each frame and drawn by hand-written GLSL ES 3.00, warm grains over a deep-indigo field with matte alpha-over glowing gold→violet strings that flash on pluck (no additive bloom, per the lab's anti-glow house style). Degrades at every step so it's alive at the 06:30 phone review: iOS 13+ `DeviceOrientationEvent.requestPermission()` is called inside the Start tap (denial → readable `text-rose-300` note); **pointer-drag** tilts gravity on desktop; and a gentle **auto-sway** runs when no tilt events arrive so the choir plays itself with no hands; no WebGL2 → `text-rose-300` notice, audio still runs. `AudioContext` is created inside the Start tap (iOS-safe). No API route, no `guard` needed (Web Audio + WebGL2 are client-side; no mic, no camera, no network, no secrets). Zero new deps.

  References: **Max Bittker's *Sandspiel*** + the **Noita / "powder game" falling-sand cellular-automaton tradition**; **Karplus & Strong, "Digital Synthesis of Plucked-String and Drum Timbres" (Computer Music Journal, 1983)** for the pluck. Born from RESEARCH §332. Winner of a **WIDE** 3-explorer kids fire; siblings `361-kids-coral-bloom` (shake → Diffusion-Limited Aggregation coral growth, Witten–Sander 1981) + `362-kids-tumble-bells` (tilt → Abelian sandpile / SOC avalanche cascade, Bak–Tang–Wiesenfeld 1987) build-reviewed and banked in IDEAS §332 — both grep-verified lab-first CAs. **Ambition 3/5**: never-used-technique (#1) + ≥3 subsystems (#2) + named-reference (#3). **Build-verified, not browser-verified** — unverified surface: the `deviceorientation`→gravity feel and pluck cadence on a real tilting hand, the iOS permission branch, the 180×120 CA's 60fps budget on a phone GPU, and exact shader output (no sensor / GPU in this sandbox).

  Design notes: `src/app/dream/360-kids-sand-choir/README.md`

---

## (Cycle 331 — adult build · WIDE, 3 unrelated explorers)

- **[/dream/358-beat-mirror](/dream/358-beat-mirror)** — Beat Mirror. `demoable`
  **An adult, real-time beat & tempo tracker that makes the machine's *listening* legible — the lab's FIRST beat-tracking / tempo-induction piece (grep-verified: "beat track" only appears as passing mentions, no prior tracker prototype).** It hears a pulse in live audio, tells you the **BPM** (large and unmistakable), shows how sure it is, and locks a clinical visual pulse to the predicted beat — with a scrolling scope where you can SEE the alignment between *what was heard* (onset ticks) and *what the tracker predicts* (beat ticks). Instructional, not a glowing nebula — the direct adult answer to **jury #1 (make it legible)** and to **Karel's stated priority #3 (live-performance fitness)**: a tool a performing pianist would find magic ("it found my tempo"). **It autoplays on one tap with an internal 112 BPM drum loop** (kick/snare/hat, lookahead-scheduled) so the pipeline self-demos against a *known answer* with no mic and no permission prompt — the most self-verifying demo path the lab has shipped; switch the source to **Mic** to clap/play at it and watch it relock (analysis-only, never recorded/uploaded/routed to speakers — no feedback). **DSP (`tracker.ts`)**: per frame, window the `AnalyserNode` time-domain block → **hand-written radix-2 FFT** → **spectral-flux onset strength** (half-wave-rectified positive magnitude change vs previous frame) → rolling 6 s onset envelope resampled to 100 Hz, mean-subtracted/smoothed → **autocorrelation tempo induction** over the 60–180 BPM lag range (octave-checked, soft perceptual prior near 120) → **OBTAIN-style cumulative-score beat-phase tracker** that nudges a predicted beat grid toward recent onset peaks; **confidence** = autocorrelation peak prominence. **Audio (`audio.ts`)**: internal kick/snare/hat groove synth (lookahead scheduler) + analysis-only mic path, both terminating in one shared `AnalyserNode`. **Render (`scene.ts`)**: an orthographic **three.js** scene — a pulse (disc + confidence-colored ring) that flashes exactly on each predicted beat + a scrolling scope (onset envelope in violet, detected onsets as white ticks, predicted beats as tall emerald ticks); when the emerald ticks sit on the onset peaks, it's locked. One rAF loop reads PCM → tracker → scene; React state updates the slow BPM/confidence readout ~8×/s; full three.js teardown on unmount. **Ambition 3/5** (need 2): **never-used-technique(#1 — real-time beat tracking / tempo induction is a lab-first; FFT exists elsewhere but no beat tracker does)** + **≥3-subsystems(#2 — spectral-flux+autocorrelation+beat-phase DSP · dual audio sources internal-synth+mic · three.js pulse/scope = 3)** + **named-reference(#3 — Masataka Goto & Yoichi Muraoka *"A Real-time Beat Tracking System for Audio Signals"* ICMC 1995 · *OBTAIN* arXiv:1704.02216)** [+#5 RESEARCH §331, this fire]. **Diversity** dodges every live ban: **mic + internal-synth-groove INPUT** (NOT touch — the over-represented 4× input; NOT his-recording) · **three.js OUTPUT** (the freshest renderer, 1× recent — NOT Canvas2D jury-banned, NOT raw-WebGL2 3×, NOT HRTF) · **beat-tracking/tempo-induction TECHNIQUE** (lab-first) · **clinical/instructional/data-readout VIBE** (NOT kids 5×, NOT cosmic, NOT Anadol-cloud). Typography compliant: `text-6xl` tabular-nums BPM hero, confidence amber→violet→emerald, ≥44px controls, `text-rose-300` mic/WebGL notices, graceful WebGL-absent fallback (audio + tracking keep running). Winner of a **WIDE** 3-explorer adult fire; siblings **`357-euclidean-orrery`** (a self-playing polyrhythmic clockwork of five coprime Euclidean/Bjorklund rings phasing over `lcm=5040` pulses, raw-WebGL2, Toussaint 2005 + Reich — **strong next-adult, build-clean, banked**) + **`359-tonnetz-walk`** (a self-touring Euler Tonnetz walked by neo-Riemannian P/L/R voice-leading in just intonation, every chord named, DOM/CSS — **the closest runner-up, the lab's most legible *harmony* piece, banked**) build-clean and banked in IDEAS. Adult · WIDE · zero new deps · zero API route created · no guard (client-only: mic analysis-only + Web Audio + three.js; no network, no recording, no upload, no secrets) · 6.44 kB (**294 kB First Load — includes the three.js bundle**). Born from RESEARCH §331. **Build-verified (authoritative `npm run build` ✓ exit 0, `○ Static`, only the winner present), not browser-verified** — unverified surface: tempo lock on real *external* audio via the mic path (the internal-groove lock is engineered-reliable, the mic path is best-effort); mic/output **latency** is not measured or compensated, so the absolute phase of the visual pulse vs the room sound on the mic source is approximate; three.js pulse/scope visual fit and iOS AudioContext/getUserMedia unlock on real hardware.
  Design notes: `src/app/dream/358-beat-mirror/README.md`

---

## Previously newest (Cycle 330 — kids build · DEEP, 3 play-models for one concept)

- **[/dream/355-kids-glass-armonica](/dream/355-kids-glass-armonica)** — Glass Armonica. `demoable`
  **For kids (4+) — a Benjamin Franklin glass armonica you TUNE with water, then PLAY by swiping across the rims. The lab's FIRST fill-to-tune instrument and first rubbed-glass continuous-armonica voice (grep-clean for glass-harp/armonica/water-glass-tuning across 110 kids + 350+ total).** A row of 8 glasses: **drag a glass UP/DOWN to fill it** — more water = lower pitch — so the water level you SEE *is* the pitch you hear (the most literal cross-modal mapping the lab can make, the direct kids answer to jury #1 "make it legible"). Then **swipe a finger continuously across the rims** and each glass the finger crosses *sings* — a sustained, breathy, overlapping wash (the famous "otherworldly" armonica sustain, NOT a struck bell). Sweep back and forth for chord-like washes; hold one rim to sustain a single note. A **ghost-finger auto-demo** sweeps the pre-tuned glasses back and forth for ~12s so the instrument plays itself at the 06:30 open (the rig is built on mount so it SOUNDS wherever autoplay is permitted; iOS stays silent until the first touch resumes the context — no regression). **Synthesis (`audio.ts`)**: each glass is a continuously-running oscillator bank (fundamental sine + 3rd-harmonic triangle at 7% + 7th-partial shimmer at 1.5%) gated by an **amplitude envelope** (~200ms attack / ~900ms release — the slow swell is the signature rubbed-glass tone), with a slow ~5Hz LFO for the wet-rim wavering; **water level → frequency** retunes the voice live (`freq = baseHz / (1 + water×0.65)`); 8 glasses pre-tuned to **D-Dorian** (D3–D4, NOT C-pentatonic); quiet always-on D-minor pad so it's never silent; master → `DynamicsCompressor` brick-wall limiter so a full sweep never blasts. **Interaction (`page.tsx`)**: Pointer Events + `setPointerCapture` + **bounding-rect hit-testing** (required because pointer-capture suppresses child enter/leave events), vertical-drag→tune vs horizontal-swipe→play discrimination, an rAF amplitude-envelope tracker that drives **CSS box-shadow/opacity glow** per glass. **Render: DOM/CSS only** — glasses are styled divs, water is a child div whose height animates, the singing glow is CSS box-shadow driven by live amplitude — **NOT Canvas2D (jury-banned), NOT SVG, NOT WebGL/WebGPU/three.js** (actively cools the warm raw-WebGL2 renderer). No reading; tap/swipe targets ≥44–64px; no timer/score/fail. Graceful: no Web Audio → `text-rose-300` notice, visuals still animate. **Ambition 3/5** (need 2): **never-used-technique(#1 — first fill-to-tune instrument + first rubbed-glass armonica voice; HONEST caveat: continuous-excitation synthesis itself is NOT a lab-first — `320-kids-light-loom` did a bowed stick-slip string — so #1 rests on the water-fill-tuning mechanic + the armonica voice + their combination)** + **≥3-subsystems(#2 — water-fill tuning model + continuous oscillator-bank armonica voices + swipe pointer-capture/hit-test + amplitude-driven CSS glow = 4)** + **named-reference(#3 — Benjamin Franklin's *glass armonica* 1761 · Mozart *Adagio* K.617 · folk *glass harp* / Jamey Turner)** [+#5 RESEARCH §330, this fire — saturation audit]. **Diversity** dodges every live ban: **touch INPUT** (1× clean — drag-to-fill + swipe-across-rims) · **DOM/CSS OUTPUT** (the coolest renderer — cools the warm raw-WebGL2 3×; NOT Canvas2D, NOT SVG) · **glass-armonica fill-to-tune + rubbed-glass-sustain TECHNIQUE** (grep-fresh) · **kids-playful VIBE** (sanctioned). **Deliberately NOT the queued `348-kids-domino-song`/`349-kids-marble-bells`** — both are chain-reaction pieces and `350-kids-bump-along` (chain-reaction) shipped *last* kids cycle, so a second would be the "too similar" the mandate bans (and with `350` shipped they can no longer claim ambition #1). Winner of a **DEEP** 3-play-model kids fire on ONE concept (a tuned water-glass instrument); siblings **`356-kids-pour-organ`** (pour water between vessels — conservation puzzle, "fill one, empty another" — the richest concept; **re-flagged as the strong next-kids build**, simplify the two-vessel pour gesture first) + **`354-kids-water-glasses`** (pure struck glass-harp, tap-to-play; cleanest/simplest; banked) build-clean and banked in IDEAS. Kids · DEEP · zero new deps · zero API route created · no guard (client-only: touch + Web Audio + DOM/CSS; no mic, no network, no secrets) · 5.56 kB (**112 kB First Load — Web Audio + DOM/CSS, light, no three.js bundle**). Born from RESEARCH §330. **Build-verified (authoritative `npm run build` ✓ 34.7s, `○ Static`, only the winner present), not browser-verified** — unverified surface: the water→pitch ratio (×1.65 max) is a musical approximation, not calibrated physics; whether the tune-vs-swipe gesture split reads cleanly for a 4yo on a real touch screen (the 10px threshold is adult-tuned); whether 8 overlapping armonica voices sound gorgeous vs muddy on a phone speaker; iOS AudioContext unlock on real hardware.
  Design notes: `src/app/dream/355-kids-glass-armonica/README.md`

---

## Previously newest (Cycle 329 — adult build · WIDE, 3 unrelated explorers)

- **[/dream/353-collapse-score](/dream/353-collapse-score)** — Collapse Score. `demoable`
  **An adult generative piece that COMPOSES ITSELF in front of you, by Wave Function Collapse — the lab's FIRST WFC piece (grep-verified: 0 prior). An 8×16 lattice (8 voice layers × 16 beat columns) starts with every cell in superposition; the solver collapses the lowest-entropy cell to a weighted-random allowed note, then propagates harmonic adjacency constraints to its neighbours — and you WATCH it happen: dim superposition cells (showing their candidate count) snap to bright note-labelled cells, constrained neighbours flash as the ripple spreads. A playhead sweeps left→right and SOUNDS each collapsed note, so the score is heard as it is written. Composition as a visible logical process — the exact inverse of the "abstract glowing cloud" the jury asked us to kill.** It auto-plays on load (one **Begin** tap only if the browser blocks autoplay; alive at the 06:30 review, never the same twice — when the grid fills it auto-reseeds and continues, long-form). **WFC solver (`wfc.ts`)**: classic loop — Shannon-entropy cell selection (weighted by tile frequency, tiny PRNG tie-break) → weighted-random collapse → BFS arc-consistency propagation, with a contradiction guard that holds the previous mask (graceful recovery, the solve never stalls); seeded **mulberry32** PRNG so any seed deterministically reproduces an exact run (**Replay** a seed; **New Seed** for a fresh piece). **Musical constraints**: 14 tiles = 7 D-Dorian degrees × 2 octaves; **horizontal** (time) adjacency forbids tritone leaps (F↔B, the E↔C substitution) so motion stays stepwise/consonant; **vertical** (voice-layer) adjacency requires the two tiles share a unison/third/fourth/fifth so stacked rows always voice consonant harmony; weighted toward the root/4th/5th with lower-octave gravity. **Synthesis (`audio.ts`)**: per note a warm **FM pad** (sine carrier + ×2.01 modulator, depth fading 90%→30% over 400 ms, 50 ms attack / 1.5 s release) + a **bell click** (×4 + inharmonic ×7.1 partial, fast decay) for the pluck transient; master → `DynamicsCompressor` brick-wall limiter (−6 dB, 20:1). **Render**: a **pure DOM/CSS grid** (CSS-transitioned cell opacity/colour, ref-mutated — **no per-cell React setState**, dodging the perf trap; **NOT Canvas2D (jury-banned), NOT SVG (warm 4×), NOT WebGL/WebGPU/three.js**), which is both the cleanest renderer and reads as a legible board. Controls (≥44px): Begin, Pause/Resume, New Seed, Replay-by-seed, Slow/Normal/Fast solve speed. `prefers-reduced-motion` honoured. **Ambition 3/5** (need 2): **never-used-technique(#1 — the lab's FIRST Wave Function Collapse / constraint-propagation composition; grep-clean across all 350+ prototypes)** + **≥3-subsystems(#2 — WFC solver + harmonic adjacency constraint model + FM/bell synth + DOM/CSS legible lattice = 4)** + **named-reference(#3 — Maxim Gumin *Wave Function Collapse* 2016 · Paul Merrell *Model Synthesis* 2007 · Brian Eno generative lineage)** [+#5 RESEARCH §329, this fire — field-direction]. **Diversity** dodges every live ban: **seed/none INPUT** (**NOT his-recording** — the jury-banned adult input) · **DOM/CSS lattice OUTPUT** (the COOLEST renderer, 1× recent — actively cools the warm SVG 4× / raw-WebGL2 3×; **NOT Canvas2D, NOT SVG, NOT WebGPU**) · **WFC/constraint-propagation TECHNIQUE** (fresh) · **systems/legible VIBE** (**NOT cosmic, NOT Anadol-cloud, NOT kids**). The most faithful adult answer to **jury provocation #1** (make it LEGIBLE — you can watch a cell *decide* and understand why neighbours light up) and to **Karel's #2 value, SURPRISE** ("music composes itself by visible logic" is a genuine "I didn't know we could do that"). Winner of a **WIDE** 3-explorer adult fire; siblings **`351-erosion`** (a Basinski-style tape that physically WEARS OUT more each morning until it's gone — lab-FIRST generative-degradation, pure DOM/CSS, **now triple-banked + build-clean → escalated to Karel**) + **`352-breath-tide`** (a near-non-screen drone you play with your BREATH, entraining toward 0.1 Hz resonance breathing — the strong jury-#2 SECOND-non-screen answer; banked for next adult) build-clean and banked in IDEAS. Adult · WIDE · zero new deps · zero API route created · no guard (client-only: seed + Web Audio + DOM/CSS; no mic, no network, no secrets) · 5.56 kB (**108 kB First Load — Web Audio + DOM/CSS, light, no three.js bundle**). Born from RESEARCH §329. **Build-verified (authoritative `npm run build` ✓ 19.5 s, `○ Static`, only the winner present), not browser-verified** — unverified surface: audio tuning (FM depth, bell balance, limiter feel) and iOS Safari AudioContext unlock on real hardware; whether an 8×16 grid of note-names reads as legible-but-not-busy in the hand; whether the WFC output sounds purposeful vs. meandering over a long listen (the contradiction guard is a mask-hold, not true backtracking — a next-cycle deepening).
  Design notes: `src/app/dream/353-collapse-score/README.md`

---

## Earlier (Cycle 328 — kids build · DEEP, 3 physics/interaction approaches to one concept)

- **[/dream/350-kids-bump-along](/dream/350-kids-bump-along)** — Bump Along. `demoable`
  **For kids (4+) — the lab's FIRST chain-reaction music machine for kids (110+ kids prototypes, zero chain-reaction pieces before this — grep-verified): a row of seven sleepy, breathing creatures, each a bold color + a pentatonic note. Tap one and a visible "bump" travels down the line — each creature wakes, squashes-and-stretches, and SINGS as the wave reaches it — then the wave reflects off the far end and rolls back for a return melody. One little push → a whole melodic wave you can watch travel, bounce, and return.** It is alive on load: an auto-demo fires a bump from the left every ~5.5s while idle, and the creatures breathe perpetually, so it's playing with zero interaction at the 06:30 review (AudioContext is created on the first tap — visuals run silently until then, iOS-safe). **Impulse-propagation engine (`page.tsx`)**: a `Wave` object holds a floating-point position in *creature-index units* + a direction; each rAF frame it advances at `WAVE_SPEED` (2.6 creatures/s) and, when it crosses a creature it hasn't triggered, fires that creature's bounce + note; at each end it **reflects** with `BOUNCE_DECAY` (0.88) energy loss until it falls below threshold and vanishes (Newton's-cradle there-and-back). Tapping a creature in the *middle* spawns **two** waves (both directions); tapping both ends makes two waves **meet in the middle**. **Drag to reorder** creatures swaps their array positions live, so the wave plays whatever order the child arranges — composition by rearrangement. **Pitch mapping**: 7 creatures → C3 E3 G3 A3 C4 E4 G4 (C-major pentatonic, two octaves), left = lowest/biggest → right = highest/smallest (BANDIMAL). **Synthesis (`audio.ts`)**: each note = additive sine (fundamental + octave + 3rd harmonic) + a 4× triangle "knock" for marimba warmth, fast attack / 0.9–1.4s decay; always-on C3+E3+G3 drone (~0.018 gain, slow fade-in); master gain → `BiquadFilter` lowpass 9kHz → `DynamicsCompressor` (−6dB, 20:1) so it can never blast (safe sounds, KIDS.md #7). **Render**: SVG inline JSX only (creatures as circles with faces, eyes that wake, cheek blush, squash-stretch, music-note sparkle) — **NOT Canvas2D (jury-banned), NOT WebGL/WebGPU/three.js**. No reading; color is the language; tap targets are full creatures (≫64px). Graceful: `buildRig()` in try/catch + `resume()` catch → if Web Audio is unavailable, the rAF loop + auto-demo + all animations still run. Clean teardown (rAF cancel, audio teardown, listeners removed). **Ambition 3/5** (need 2): **never-used-technique(#1 — the lab's FIRST chain-reaction / Rube-Goldberg / cause-and-effect-cascade piece, and first impulse-propagation/Newton's-cradle physics; grep-verified 0 across all kids READMEs)** + **≥3-subsystems(#2 — impulse-propagation wave engine + reflection state + additive marimba synthesis + drone/limiter + SVG character render + drag-reorder = 6)** + **named-reference(#3 — Newton's cradle · "pass it down the line" physical toy · Rube Goldberg · BANDIMAL pitch-size convention)** [+#5 RESEARCH §328, this fire]. **Diversity** dodges every live ban: **touch INPUT** (cooled to ~1× in the last 10 — recent kids were device-orientation/multi-user; fresh again) · **SVG OUTPUT** (**NOT Canvas2D (jury-banned), NOT raw-WebGL2 (warm 3×), NOT WebGPU (verification-debt)** — honest soft-flag: SVG is now warm, this fire takes it to 4× in the last 10, so the next kids/adult renderer should cool to DOM/CSS or audio-only) · **collision/impulse-cascade TECHNIQUE** (fresh) · **kids-playful-construction VIBE** (sanctioned on the kids rotation). The most **legible** of the slate (jury's #1 live priority brought to kids: one tap → an ordered, visible, repeatable melodic wave; rearrange → recompose) and the lowest-skill-floor (tap a big creature — no setup, no precision). **Deliberately NOT the queued `348-kids-song-catcher`** (cycle-326 bank) — that repeats `346-kids-sound-hunt`'s device-orientation+HRTF+DOM/CSS recipe shipped *last* kids cycle, which would be the "too similar in design and theme" the mandate exists to stop. Winner of a **DEEP** 3-approach kids fire on ONE concept (the lab's first chain-reaction music machine, explored via competing physics models); siblings **`348-kids-domino-song`** (drag a domino trail, tap to topple a melody — highest charm + cleanest render; **banked as the strong next-kids build**, fix the precise tap-to-tip trigger first) + **`349-kids-marble-bells`** (drop a marble through bells you place, each collision a chime — strongest love-pull via `169-kids-marble-run`❤️ + Plinko wow; banked, refactor the per-frame setState first) build-clean and banked in IDEAS. Kids · DEEP · zero new deps · zero API route created · no guard (client-only: touch + Web Audio + SVG; no mic, no network, no secrets) · 5.26 kB (**111 kB First Load — Web Audio + SVG, light, no three.js bundle**). Born from RESEARCH §328. **Build-verified (full `npm run build` ✓ 29.7 s, `○ Static`), not browser-verified** — unverified surface: live audio playback + the SVG animation feel on a real iPad; whether **drag-to-reorder** feels snappy on iOS Safari (pointer capture on SVG `<g>` can be finicky — the tap-to-bump core works regardless); whether a real 4-year-old reads the traveling wave as "I did that" (the auto-demo + one-tap payoff are the in-sandbox proxy). Minor polish nit for next cycle: two meta-labels use `text-white/45` (just under the /55 hint floor).
  Design notes: `src/app/dream/350-kids-bump-along/README.md`

---

## Earlier (Cycle 327 — adult build · WIDE, 3 unrelated explorers)

- **[/dream/347-the-place](/dream/347-the-place)** — The Place Where You Go to Listen. `demoable`
  **A long-form adult drone scored by your REAL local sky — the actual clock hour, the sun's position, the moon's phase, the season — so the piece is genuinely different at 3am than at noon and slowly evolves as real time passes. Nothing repeats on a timer: the score IS the sky.** It auto-plays on load (one **Begin** tap only if the browser blocks autoplay; alive at the 06:30 review with zero further interaction). It reads your device clock and — optionally, with a 3 s timeout — your geolocation, then computes **locally, with no network** where the sun and moon actually are (`astronomy.ts`: a NOAA-style solar-altitude/azimuth approximation + a synodic-month moon phase/illumination + season from day-of-year). The mapping (`audioEngine.ts`, just-intonation over a low root, master → brick-wall `DynamicsCompressor`): **solar altitude** → register + brightness (deep night = a low warm cellar drone; civil twilight near the horizon = a slow blooming mid cluster; midday = bright high JI partials on top); **solar azimuth** → slow stereo-pan drift of the lead voice across the day (sun east→left, west→right; the moon shimmer pans gently opposite); **moon illumination** → a high shimmering harmonic voice that waxes with the lit fraction (full moon present, new moon silent); **season** → the JI scale color morphs (winter leans darker/minor + a lower root, summer brighter/major). Visual (`skyRenderer.ts`, **raw WebGL2** — hand-written GLSL ES 3.00, full-screen triangle, NOT three.js / NOT Canvas2D / NOT SVG): a horizon band + sun-disc glow tracking altitude & azimuth, a phase-shaded moon disc, and a star density that rises as the sun sets. Legible monospace readouts: local time, sun altitude (°), sun azimuth (°), moon (% lit), season, place. **The verifiability move that won curation: a two-axis TIME SCRUBBER** (hour-of-day + day-of-year sliders) that lets a reviewer hear the whole dawn→noon→dusk→night arc and the winter↔summer color shift **in a few seconds** without waiting; untouched, the piece tracks real wall-clock time, and **return to now** releases it back to live. Graceful: no WebGL2 → `text-rose-300` notice + the music keeps playing and tracking the sky; geolocation denied/slow → a fixed high-latitude fallback (61.2, −149.9, a nod to Fairbanks) used silently; autoplay blocked → one **Begin** tap. Full teardown (rAF cancel, GL dispose, audio nodes closed). **Ambition 3/5** (need 2): **≥3-subsystems(#2 — local-astronomy engine + JI drone/choir synth + long-form evolving state + raw-WebGL2 sky = 4)** + **named-reference(#3 — John Luther Adams *The Place Where You Go to Listen*, his Fairbanks installation that sonifies the local sun/moon/aurora/seismic in real time; + Brian Eno's generative-ambient lineage)** + **multi-cycle/long-form(#4 — genuinely different across the day and across the year, an evolving state machine, not a loop)**. **Diversity** dodges every live ban: **clock+place (no-network) INPUT** (fresh; **NOT his-recording** — the jury-banned adult input) · **raw-WebGL2 sky OUTPUT** (**NOT Canvas2D (jury-banned), NOT SVG (audit-banned ≥5×), NOT WebGPU (verification-debt)** — raw-WebGL2 is warm at 2× and cleared the floor; soft-flag that the next adult renderer should cool it) · **local-astronomy sonification + long-form state TECHNIQUE** · **place-based contemplative VIBE** (the jury's #1 ask — about *something real*, LEGIBLE via the readouts, NOT another "his-piano → abstract luminous Anadol cloud he watches"). The most faithful adult answer to **jury provocation #1** (kill the forming his-piano→nebula rut; if you sonify, make it legible and about something) and a clean re-entry on the long-form/state axis the jury celebrated (`308`/`314`/`322`/`325`). Winner of a **WIDE** 3-explorer adult fire; siblings **`348-erosion`** (a Basinski-style tape that physically WEARS OUT as you listen + decays even while you're away — a grep-verified lab-FIRST generative-degradation piece, pure DOM/CSS, the strongest BANK; flagged for the next adult/conceptual cycle) + **`349-strange-attractor`** (Lorenz/Rössler/Chua as composer, scale-snapped + edge-of-chaos + a Lyapunov regime label — but honestly a deepening of the 9-yr-old `10-strange`, NOT a lab-first) build-clean and banked in IDEAS. Adult · WIDE · zero new deps · zero API route created · no guard (client-only: device clock + optional geolocation + Web Audio + raw WebGL2; no mic, no network fetch, no secrets) · 7.43 kB (114 kB First Load — Web Audio + raw WebGL2, light, no three.js bundle). Born from RESEARCH §327. **Build-verified (full `npm run build` ✓ 22.1 s, `○ Static`), not browser-verified** — unverified surface: live audio playback + the WebGL render + the geolocation-timeout branch (headless sandbox, no GPU/audio); the solar/lunar math is an intentional contemplative approximation, not an ephemeris; whether the day→night musical arc reads as expressive vs. monotonous over a real multi-hour listen (the scrubber is the in-sandbox proxy).
  Design notes: `src/app/dream/347-the-place/README.md`

---

## Previously newest (Cycle 326 — kids build · DEEP, 3 interaction-model approaches to one concept)

- **[/dream/346-kids-sound-hunt](/dream/346-kids-sound-hunt)** — Sound Hunt. `demoable`
  **For kids (4+) — the lab's FIRST non-screen / audio-FIRST piece in 300+ prototypes: put on headphones, and TURN your phone or your body to *find* six singing animals hidden in the space around you, then collect them into a song. You play music with your EARS, not your eyes — the screen is just a dim compass.** Tap **▸ Listen for the animals** (creates/resumes the `AudioContext` and, on iOS 13+, requests `DeviceOrientationEvent` permission — both inside the same gesture, iOS-safe). Six animals — 🦉 owl, 🐸 frog, 🐦 bird, 🐋 whale, 🦗 cricket, ✨ firefly — are placed at fixed azimuths/elevations all around you, each humming its own note in **D-Dorian** with its own synthesized timbre (owl = sine + slow tremolo; frog = triangle rhythmic AM; bird = warble; whale = slow-FM moan; cricket = fast square tremolo; firefly = pulse), over a quiet always-on **D2+A2** drone. **Turn** to sweep the spatial field past your ears — the animal you FACE gets louder and the compass glows brighter; **hold facing it ~1.2 s** (or **tap the glowing center dot**) and it **swoops in** with a chime, a sparkle, and a soft haptic. Collect all six → a short D-Dorian melody plays from their voices, then they bloom together as a chord. No score, no timer, no fail, no reading. **HRTF spatial engine (`audio.ts`)**: each animal is its own `PannerNode { panningModel:"HRTF" }`; the listener's heading rotates the `AudioListener` forward vector each frame (`forwardX/Z` AudioParam with legacy `setOrientation` fallback); master → brick-wall `DynamicsCompressor` (−6 dB, 20:1) so it can never blast. **Heading/collect state machine (`hunt.ts`)**: per-animal facing cone (±24° half-width → 0–1 strength), dwell accumulator (1.2 s → collect), fly-in animation (3.5 m → 0.3 m over 600 ms). **Dim compass (`page.tsx`, DOM/CSS only — NO Canvas2D, NO SVG, NO three.js)**: a `border-radius:50%` ring, animal dots positioned by azimuth, a rotating heading needle, and a conic-gradient dwell arc — the visual is intentionally secondary. **Graceful for the 06:30 phone review with NO sensor and NO headphones**: no `deviceorientation`/desktop → **pointer-drag** turns the heading **and** a gentle **auto-demo** sweeps one full rotation per 24 s, auto-catching each animal through the IDENTICAL `applyHeading → computeFacing → collectAnimal` audio path (the whole find→collect→celebrate loop plays itself); iOS denied → `text-rose-300` notice + drag/auto-demo continue; no headphones → HRTF degrades to a softer stereo image (still spatially distinguishable); no Web Audio → `text-rose-300` notice. Full teardown (rAF cancel, audio nodes disconnect, `ctx.close()`, listeners removed). **Ambition 3/5** (need 2): **never-used-technique(#1 — the lab's FIRST non-screen / audio-first KIDS piece; the only prior non-screen piece in 300+ is the ADULT `308-orbit-choir`, and every one of the lab's 108 kids prototypes is full-screen-viz-primary — grep-verified)** + **≥3-subsystems(#2 — device-orientation listener + 6-voice HRTF spatial bank w/ per-animal synthesis + drone + brick-wall limiter + DOM/CSS compass + dwell/collect state machine + auto-demo = 6+)** + **named-reference(#3 — Janet Cardiff *audio walks* · *Papa Sangre* / *Audio Defence* eyes-free audio games · Pauline Oliveros *Deep Listening* · this lab's `308-orbit-choir` HRTF lineage)** [+#5 RESEARCH §326, this fire]. **Diversity** dodges every live ban: **device-orientation INPUT** (0× in the last 10 — the freshest modality; not touch, not voice, not his-recording) · **HRTF-spatial-audio + dim-DOM/CSS-compass OUTPUT** (**NOT SVG — the renderer the audit bans at ≥5× — NOT Canvas2D (jury-banned), NOT three.js (warm), NOT WebGPU (verification-debt)**) · **HRTF-spatial-listening TECHNIQUE** · listening-adventure VIBE (fresh; NOT another consonance-duet — `341` already shipped that, a 4th would be the monoculture the mandate exists to stop) · **D-Dorian**, NOT C-major-pentatonic. The most faithful answer to **jury provocation #2** ("build the SECOND non-screen piece — `308` found the freshest axis the lab owns and *nothing followed it*"), brought to the kids lane for the first time, and it varies the kids trick OFF persistence and OFF the consonance-duet rut. Winner of a **DEEP** 3-approach kids fire on ONE concept (the lab's first non-screen / audio-first kids listening adventure, explored via competing interaction models); siblings **`348-kids-song-catcher`** (turn toward each hidden note to catch a *known* D-Dorian melody in order, assembling a visible ribbon — the most jury-#1-legible model; **banked as the strong next-kids build**) + **`347-kids-echo-cave`** (call into the dark and creatures echo back from fixed 3-D addresses, building a spatial round; banked but flagged — the echo lane is jury-saturated and its own README concedes the differentiation is "real but subtle") build-clean and banked in IDEAS. Kids · DEEP · zero new deps · zero API route created · no guard (client-only: device-orientation + Web Audio + DOM/CSS; no mic, no network, no secrets) · 6.01 kB (**109 kB First Load — Web Audio + DOM/CSS, light, no three.js bundle**). Born from RESEARCH §326. **Build-verified (full `npm run build` ✓ 26.1 s), not browser-verified** — unverified surface: real HRTF localization quality (generic KEMAR head model; front/back confusion is common without head movement, and a 4-year-old's small ears differ) — though the dim compass glow + the tap-the-center shortcut mean the loop completes *visually* even when HRTF perception is weak; real `deviceorientation` feel + the iOS permission branch on a physical phone; whether a real 4-year-old will "turn to find" something invisible; haptics no-op on iOS.
  Design notes: `src/app/dream/346-kids-sound-hunt/README.md`

---

## Previously newest (Cycle 325 — adult build · WIDE, 3 unrelated explorers)

- **[/dream/345-speech-melody](/dream/345-speech-melody)** — Speech Melody. `demoable`
  **The lab's FIRST natural-language → music piece: type a line — a poem, a memory — and Resonance compiles its SPEECH into a Janáček-style "speech melody," then lights up your words one at a time as they sing, so you RECOGNIZE your own words being sung.** It auto-plays a gentle Welcome-Home line on load (alive at the 06:30 review with zero typing); type or paste your own into the box, or tap an example, and press **Play**. The mapping (`text-music.ts`, deterministic — same text → same melody): each word is split into syllable-ish units by **vowel cluster**; each vowel class carries a **height** on a front/high → back/low axis (EE/IH high & bright, OO/UH low & dark) that indexes a two-octave **D-Dorian** ladder, so vowel colour becomes pitch height (with a gentle downward drift across the phrase — Janáček observed spoken lines tend to fall); **consonant clusters** become percussion (plosive `p t k`→bright click, voiced-stop `b d g`→thud, sibilant/fricative→hiss, liquid/nasal→soft ring); **prosody** (word-initial syllables, capitalized words, the opening word) drives accent/duration; **punctuation** inserts rests + phrase breaks. Audio (`audio.ts`): a warm voice (sine + slightly-detuned triangle through a brightness-tracking lowpass + click-free ADSR) for vowels + filtered-noise bursts for consonants, over an always-on soft **D2 + A2** drone (breathing filter LFO), shared feedback delay + procedural-impulse reverb, master → brick-wall `DynamicsCompressor`. Visuals (`page.tsx`, **raw WebGL2** — hand-written GLSL ES 3.00): ~480 additive glow points draw the **pitch-contour ribbon** in a violet→amber palette keyed to brightness, with a moving **playhead** that brightens the contour as it passes; over the GL canvas a DOM word layer shows the words large (`text-xl`/`text-2xl`) and each word **lights amber + lifts** the instant it sounds — the legibility that won curation (you watch your words being sung even with the sound off). Legible readout: mode/key, the word now sounding, playback %. Graceful: no WebGL2 → `text-rose-300` notice + audio and word-highlights still play; iOS-safe (`AudioContext` created inside the first gesture; auto-play falls back to "tap Play to begin"). Full teardown (rAF cancel, GL program/VAO/buffer delete, ctx close). **Ambition 3/5** (need 2): **never-used-technique(#1 — the lab's FIRST natural-language→music piece; grep-verified distinct from `22-code-score`, which is a note-DSL where you literally write pitch names, NOT language sonification)** + **≥3-subsystems(#2 — grapheme→phoneme-ish parser/prosody mapper + vowel-voice + consonant-percussion + drone/delay/reverb engine + raw-WebGL2 contour renderer + synced DOM word-highlight layer)** + **named-reference(#3 — Leoš Janáček *nápěvky mluvy* ("speech melodies") · Alvin Lucier *I Am Sitting in a Room* · Fluxus text/event scores · Jaap Blonk sound poetry)**. **Diversity** dodges every live ban: **keyboard-text INPUT** (0× in the lab's entire history — the freshest possible modality, and verifiable on a phone by typing) · **raw-WebGL2 OUTPUT** (clean 1×; **NOT SVG — the renderer the audit bans at ≥5× — NOT Canvas2D (jury-banned), NOT WebGPU (verification-debt), NOT three.js (warm 321+337)**) · **natural-language→speech-melody cross-modal TECHNIQUE** · literary/Fluxus VIBE (fresh; NOT Anadol-cloud, NOT his-recording, NOT voice→HRTF→sacred) · **D-Dorian**, NOT C-major-pentatonic. The most faithful answer to **jury provocation #1** ("make his music *legible* — let him recognize what he played, not another nebula"): 345 literally shows him his words being sung — the inverse of a glowing cloud he watches. Winner of a **WIDE** 3-explorer adult fire; siblings **`343-live-accompanist`** (listen to a live acoustic instrument and a generative band locks to your tempo + key and comps under your phrases — the BOLDEST swing + Karel's "jazz-responsive" wishlist + the ≈0× score-following axis; **lost a THIRD time on verifiability** — its headline needs a live instrument no sandbox can provide, so it's now flagged for a *dedicated real-instrument verification cycle*, not another fan-out slot) + **`344-slow-machine`** (a deterministic seeded 6-section long-form machine, "different at minute 5," Ikeda-minimal; reliable + fully verifiable, three.js, banked) build-clean and banked in IDEAS. Adult · WIDE · zero new deps · zero API route created · no guard (client-only: keyboard text → deterministic compile → Web Audio + raw WebGL2; no mic, no network) · 6.4 kB (113 kB First Load — Web Audio + raw WebGL2, light, no three.js bundle). Born from RESEARCH §325. **Build-verified (full `npm run build` ✓), not browser-verified** — unverified surface: whether a listener *recognizes* a specific sentence by ear (English spelling isn't phonetic — the syllable heuristic is approximate; the visual word-highlight carries legibility regardless); the wall-clock-rAF playhead may lead/lag sample-accurate audio under load; the glow-contour look on a real GPU; very long pastes may feel washy (fixed reverb/delay).
  Design notes: `src/app/dream/345-speech-melody/README.md`

---

## Previously newest (Cycle 324 — kids build · DEEP, 3 interaction-model approaches to one concept)

- **[/dream/341-kids-star-pair](/dream/341-kids-star-pair)** — Star Pair. `demoable`
  **For kids (4+) — the lab's FIRST real-time SIMULTANEOUS two-child co-play piece: two children, each on their own screen, each hold ONE glowing star and slide (or hum) it up and down until the two stars sing in tune and LINK with a beam of light.** Tap **Play together ▸** (creates/resumes the `AudioContext` + asks for the mic inside the gesture, iOS-safe; mic is analysis-only — never recorded, stored, or transmitted). Your **violet star** sits on the left arc, your friend's **cyan star** on the right. **Drag** your star up/down (the reliable, 4yo-primary control) — or **hum**, and the mic moves your star to your pitch (it yields to drag, so drag always wins). The two stars define a musical **interval**; out of tune you **hear real acoustic beating** (the two voices physically interfere — we don't fake it) and **see** the stars jitter at the beat rate with only a faint dotted reach-line between them. Land within **±35¢** of a pure just-intonation ratio (`1:1, 6:5, 5:4, 4:3, 3:2, 5:3, 2:1`, folded into one octave over a **D2 ≈ 73.42 Hz** drone, voices riding ≈ D4→624 Hz) and the stars **LOCK**: a bright flowing **beam of light** links them, the jitter stops, the stars pulse together, a soft chime + shimmer plays, and ~60 **sparkles ✨ burst** along the beam — one discrete, wordless, *silently-legible* "the two stars connected!" event (the heart of the toy, and the reason it won curation: the lock reads even with the sound off). **Fully demoable SOLO on one phone** (the 06:30 review case): if no second tab answers within ~3s, a gentle **robot 🤖** drives the friend-star, drifting slowly and **pausing near consonances** so a lone child (or Karel) can chase and catch the beam — and because **drag is the primary control, the whole find-the-lock loop reaches the reward with no mic at all**. Badge flips violet **friend 👫** the instant a real second tab is heard vs amber **robot 🤖** when solo; mic denied → readable `text-rose-300` notice + drag still fully plays; no WebGL2 → `text-rose-300` notice + audio and the tuning loop keep running. Always-on warm **D** drone so it's never silent; master through a brick-wall `DynamicsCompressor` (safe for small ears). Subsystems (≥3 → 5): (1) **`sync.ts`** — `BroadcastChannel("resonance-star-pair-341")` ~3 Hz pitch + presence (319-hub-score lineage); (2) **`audio.ts`** — D drone + two warm voices (sine + detuned triangle, lowpass) + lock chime/shimmer through the brick-wall limiter; (3) **`tuning.ts`** — pitch↔arc-position mapping + JI consonance scoring (nearest ratio, cents, beat Hz, lock); (4) **`pitch.ts`** — analysis-only autocorrelation mic (`AnalyserNode` only, tracks stopped on teardown); (5) **`scene.ts`** — **raw WebGL2** renderer (two hand-written GLSL ES 3.00 programs: bg gradient/starfield/arc-tracks quad + additive glow-quads streamed into one dynamic VBO for the stars, beam, and sparkles). `page.tsx` runs ONE refs-driven rAF loop (the React tree never re-renders per frame); full teardown (rAF cancel, `bye` broadcast + channel close, mic stop, scene + audio dispose). **Ambition 3/5** (need 2): **never-used-technique(#1 — the lab's FIRST real-time SIMULTANEOUS two-child co-play; grep-verified distinct from the SOLO `272-kids-tune-purr` (one child, fixed drone) and the TURN-TAKING `334-kids-pass-the-song`)** + **≥3-subsystems(#2 — five)** + **named-reference(#3 — Hermann von Helmholtz *On the Sensations of Tone* (consonance = absence of beating) · this lab's `319-hub-score` BroadcastChannel lineage · Reggio Emilia group-synchrony / joint-attention · honest contrast w/ solo `272`)**. **Diversity** dodges every live ban: **multi-user + drag/voice INPUT** (multi-user 1× in the last 10, jury-wanted) · **raw-WebGL2 OUTPUT** (**NOT SVG — the renderer the audit bans at ≥5× — NOT Canvas2D (jury-banned), NOT three.js (warming 321+337), NOT WebGPU**) · **real-time consonance/beating TECHNIQUE** · collaborative-kids VIBE · **D just intonation**, NOT C-major-pentatonic. Deepens **jury provocation #3** (multi-user for kids — varies the trick off `334`'s turn-taking and off the localStorage-persistence default the jury flagged). Winner of a **DEEP** 3-approach kids fire on ONE concept (real-time two-child consonance duet, explored via competing interaction models); siblings **`342-kids-whale-song`** (each child HUMS to bend their own whale's call until the two whales lock + swim together — the boldest/warmest swing, voice-forward, oceanic; **re-flagged as the strong next-kids build with a real-device hum pass** — it lost only on the unauditioned hum-primary headline) + **`340-kids-duet-bridge`** (the literal seeded shared-rope, balanced hum+drag, gold catenary lock; banked — its continuous lock reads less discretely than the beam) build-clean and banked in IDEAS. Kids · DEEP · zero new deps · zero API route created · no guard (client BroadcastChannel + Web Audio + analysis-only mic + WebGL2) · 7.21 kB (113 kB First Load — Web Audio + raw WebGL2, light, no three.js bundle). Born from RESEARCH §324. **Build-verified (full `npm run build` ✓), not browser-verified** — unverified surface: real two-tab co-play + the peer/robot badge flip on a second running tab; whether the autocorrelation tracker handles a real 4-year-old's hum; the exact look of the stars/beam/sparkles on a GPU; and the perceptual read of the lock for a non-reader. Honest limit: `BroadcastChannel` is same-origin/same-browser — true two-*device*-over-network play would need WebRTC/WebSocket (out of scope); the "two screens" promise is demoed as two tabs/windows.
  Design notes: `src/app/dream/341-kids-star-pair/README.md`

---

## Previously newest (Cycle 323 — adult build · WIDE, 3 unrelated explorers)

- **[/dream/337-seismic-globe](/dream/337-seismic-globe)** — Seismic Globe. `demoable`
  **Hear the LIVING PLANET: every earthquake recorded on Earth in the last day becomes a sustained voice placed in 3-D space around you, while the quakes pulse on a slowly rotating three.js globe — so the ever-shifting chord you hear IS Earth's current seismic state.** The on-screen globe loads + auto-rotates immediately with sample or live quakes (visual alive hands-free); tap **▶ Listen to the planet** (creates/resumes the `AudioContext` inside the gesture, iOS-safe) and the spatial choir fades in. Each sounding quake owns ONE sustained voice through its **own `PannerNode { panningModel:"HRTF" }`**: **azimuth ← longitude, elevation ← latitude, distance/loudness ← magnitude**, pitch snapped to a **just-intonation** degree over **C2** (ratios `1, 9/8, 6/5, 4/3, 3/2, 5/3, 15/8, 2`; bigger quakes drop a register), and **depth → lowpass cutoff** — so what you SEE and what you HEAR share one geometry (depth drives both the point's hue *and* the voice's darkness; magnitude drives both the point's size *and* the pitch register/loudness). Live data comes from the public, CORS-open **USGS GeoJSON** feed (`{2.5_day|all_day|all_hour}`, no API key), re-polled every 60 s — new quakes fade in, aged-out ones fade away — with a one-tap feed switcher (larger feed = denser chord). An always-on quiet C1+C2 root drone keeps it from ever being silent; master ≤ 0.42 → procedural convolver reverb → brick-wall `DynamicsCompressor` so a dense seismic moment never clips. **Graceful for the 06:30 phone review:** any fetch failure or empty window loads **8 globe-spanning sample quakes** so the piece always surrounds you, with an honest provenance badge (emerald **● live USGS feed · N quakes** vs amber **● sample quakes**); no WebGL → `text-rose-300` notice + the audio still plays; no HRTF → `StereoPanner` fallback; a "loudest voices right now" list names the places currently sounding. Subsystems (≥3 → 4): (1) **`quakes.ts`** — USGS fetch/normalize + sample fallback + `topByMagnitude` cap (24); (2) **`globe.ts`** — raw three.js (v0.182) dark wireframe Earth + occluding shell + graticule + halo, per-quake glowing points (size←mag, hue←depth), per-frame pulse, full dispose; (3) **`audio.ts`** — the HRTF spatial JI engine + drone + reverb + compressor + StereoPanner fallback; (4) **`page.tsx`** — ONE rAF loop mutating refs (the React tree never re-renders per frame), full teardown (rAF cancel, three.js dispose, audio stop + ctx close, poll clear, fetch abort). **Ambition 3/5** (need 2): **≥3-subsystems(#2 — four)** + **named-reference(#3 — Florian Dombois *Auditory Seismology*; Dombois & Eckel "Audification" in *The Sonification Handbook*; the 2026 Data Sonification Award / DATASONICA live-data-as-evolving-texture wave)** + **recent-research(#5 — RESEARCH §323, this fire)**. **Diversity** dodges every live ban: **external-API INPUT** (0× in the last 10 — the freshest modality; not touch, not his-recording, not voice) · **three.js OUTPUT** (clean ~1–2×; **NOT SVG — the renderer the audit bans at ≥5× — NOT Canvas2D, NOT a 3rd unrun WGSL**) · **real-world-data-sonification TECHNIQUE** · planetary/systems VIBE · **C2 just intonation**, NOT C-major-pentatonic. The most faithful answer to **jury provocation #3** (real-world-data — the thinnest adult shelf, which the jury praised `314-solar-wind` for filling and asked for MORE) — shipped as a real **3-D globe**, "massively bigger" than the banked SVG `328-seismic-choir` it supersedes, *and dodging the SVG ban that would have compromised 328*; it also pays the most respect to **verification debt (#5)** — no new unrun compute, and the sample fallback guarantees a live review regardless of network. Winner of a **WIDE** 3-explorer adult fire; siblings **`338-live-accompanist`** (listen to a live acoustic instrument and a generative band locks to your tempo + key and comps under your phrases — the BOLDEST swing + Karel's "jazz-responsive" wishlist; **re-flagged as the strong next-adult build, paired with a real-instrument verification pass** — it lost only on the unauditioned live-tracking headline) + **`339-slow-machine`** (a deterministic seeded 6-section long-form generative machine, Ikeda-minimal; reliable + fully verifiable, banked) build-clean and banked in IDEAS. Adult · WIDE · zero new deps · zero API route created · no guard (read-only USGS GET) · 5.32 kB (**293 kB First Load — three.js bundled, the deliberate cost of dodging the SVG ban with a real 3-D globe**). Born from RESEARCH §323. **Build-verified, not browser-verified** — unverified: live USGS reachability from the review device (sample fallback + honest badge cover a no); HRTF azimuth/elevation vividness (headphone- and listener-dependent); exact loudness during a dense `all_hour` swarm (24-voice cap + brick-wall compressor mitigate).
  Design notes: `src/app/dream/337-seismic-globe/README.md`

---

## Previously newest (Cycle 322 — kids build · DEEP, 3 interaction-model approaches to one concept)

- **[/dream/334-kids-pass-the-song](/dream/334-kids-pass-the-song)** — Pass the Song. `demoable`
  **For kids (4+) — the lab's FIRST multi-user / turn-taking piece (jury provocation #3): two children on two tablets (or two browser tabs) in one room PASS a glowing creature back and forth and TAKE TURNS adding notes to build ONE shared song together.** Tap **▶ Start** (creates/resumes the AudioContext + mic inside the gesture, iOS-safe; mic is analysis-only — never recorded, stored, or transmitted). When the creature is on **your** screen ("your turn!"), you give it a note — **hum/sing** (a live autocorrelation pitch detector snaps your voice to the **D-major** scale once it holds ~7 frames) or **tap** one of the big ≥64px glowing color-spots — then tap the big **✨ send to friend** button and the creature **flies off the screen edge** toward your friend over a `BroadcastChannel`. On the friend's tab it **arrives flying in from the opposite edge**, it's now their turn, and the growing **song-ribbon** (one colored bead per turn) shows **identically on both screens**; every few turns the whole ribbon **replays** as a little song the two kids built. **Fully demoable SOLO on one phone** (the 06:30 review case): if no second tab answers within ~4s, a cute **robot friend** takes the other side — receives the creature, adds a tasteful in-scale note after a "thinking" beat, and sends it back — so one person sees the entire pass-back-and-forth loop. A badge reads violet **"Playing with a friend 👫"** when a real second tab is present (presence handshake + rev-counter reconcile) vs amber **"Playing with the robot friend 🤖"** in solo/demo mode; mic denied → a readable `text-rose-300` notice + the tap fallback still plays. Always-on soft **D drone** so it's never silent; gentle bell voices through a brick-wall `DynamicsCompressor` (safe for small ears); the SVG creature is animated by mutating refs in **one rAF loop** (the React tree is never re-rendered per frame); full teardown on unmount (rAF cancel, `bye` broadcast, channel close, mic stop, AudioContext dispose). Subsystems (≥3 → 4): (1) the **BroadcastChannel presence/turn-pass sync** (`sync.ts` — `resonance-pass-the-song-334`); (2) the **synthesized Web-Audio engine** (`audio.ts` — D drone, bell voices, `setTargetAtTime` glides, brick-wall limiter, whoosh, analysis-only autocorrelation pitch detector); (3) the **turn-relay state machine + rev-reconcile + robot-friend fallback + ribbon playback** (`page.tsx`, refs-based rAF); (4) the **inline-SVG creature/ribbon renderer**. **Ambition 3/5** (need 2): **never-used-technique(#1 — the lab's FIRST multi-user / turn-taking / networked-collaborative KIDS piece; verified by grep — BroadcastChannel exists only in the adult `319-hub-score`)** + **≥3-subsystems(#2 — four)** + **named-reference(#3 — this lab's `319-hub-score` serverless-BroadcastChannel lineage · Reggio Emilia group-synchrony / joint-attention, KIDS.md's stated high-value goal · call-and-response pedagogy)**. **Diversity** dodges the live bans: **multi-user / networked-BroadcastChannel INPUT** (0× ever for kids — the freshest possible modality; not touch-primary, not his-recording, not phone-motion) · **inline-SVG OUTPUT** (NOT Canvas2D — the banned renderer — NOT three.js, NOT a raw fragment shader) · **turn-taking / pass-the-creature TECHNIQUE** (lab-first for kids) · collaborative/playground VIBE · **D major** over a drone, NOT C-major-pentatonic. The most faithful answer to **jury provocation #3** ("turn-taking / multi-user — 319's BroadcastChannel idea, but for two children — NOT another it-grows-while-you're-away; off touch") and it opens the lab's single most-unserved axis (multi-user, 1→2 of 300+) for kids. Winner of a **DEEP** 3-approach kids fire on one concept (the lab's first two-child shared-music piece, explored via competing interaction models); siblings **`335-kids-duet-bridge`** (two kids co-play in REAL TIME on a shared glowing rope, tuning their ends into just-intonation consonance by ear — the gold "in-tune!" lock; the boldest/most-surprising swing, **re-flagged as the strong next-kids build with a real-device perceptual pass**) + **`336-kids-echo-relay`** (sing a phrase → it flies to the friend's tablet → their creature echoes it back + adds → a networked kid-to-kid canon; banked, but its experience rhymes with the lab's saturated echo lane) build-clean and banked in IDEAS. Kids · DEEP · zero new deps · zero API route · no guard · 5.36 kB (108 kB First Load — Web Audio + SVG, light, no three.js bundle). Born from RESEARCH §322. **Build-verified, not browser-verified** — fully verifiable in logic (no GPU/WGSL blind spot; the solo robot loop was traced end-to-end); the real unknowns are **two-live-tab on-device behavior** (presence handshake, arrival edges, `pass` rev-reconcile across two real tablets) and the **mic pitch thresholds / 7-frame sustain** on a real child's hum — neither auditionable in the sandbox.
  Design notes: `src/app/dream/334-kids-pass-the-song/README.md`

---

## Previously newest (Cycle 321 — adult build · DEEP, 3 approaches to one concept)

- **[/dream/331-voice-cathedral](/dream/331-voice-cathedral)** — Voice Cathedral. `demoable`
  **The lab's SECOND non-screen piece (jury provocation #2) — sing one note and it BLOOMS into a choir that surrounds you in 3-D HRTF space; sing again and again to stack a one-person overtone cathedral, with the chord you built printed by NAME so you recognize what you sang.** Spatial audio over headphones is the primary medium; the on-screen SVG radar is a minimal, legible companion. Tap **Start with my voice** (creates/resumes the AudioContext inside the gesture, iOS-safe; mic is analysis-only — never recorded, stored, or transmitted, and never routed to the speakers). Hold a single **steady** note: a YIN-style autocorrelation detector (`pitch.ts`) tracks your pitch, a 5-wide median tracker kills octave jumps, and a note only **commits** once it holds within ~0.6 semitones for ~120 ms — then a ~700 ms cooldown + a required breath-gap mean **one breath blooms exactly one voice**, not a stream. Each committed pitch **snaps to the nearest just-intonation degree of a D2 root** (ratios `1, 9/8, 6/5, 5/4, 4/3, 3/2, 5/3, 15/8, 2`, octave-folded so any sung octave maps in), becomes a sustained additive voice, and is placed at a **golden-angle azimuth** on a gently **orbiting** ring through its own `PannerNode { panningModel:"HRTF" }`. An always-on JI **D2 drone** anchors the field; a brick-wall `DynamicsCompressor` + a procedural convolution reverb keep nine voices clip-free and cathedral-sized (a 10th commit fades out the oldest). **Legibility (jury #1):** the panel names the note you're **singing now**, the live **voice count**, and the **cathedral built so far** as named pitch-classes (e.g. `D · A · F♯ · C♯`) — and each radar dot carries its own label, so Karel *recognizes what he sang* rather than watching a nebula. **Fully demoable with no mic:** an **Auto-demo** programmatically "sings" a slow rising JI arpeggio into the spatial field; mic denied → a `text-rose-300` notice + the demo. Subsystems (≥3 → 4): (1) the **YIN pitch detector + median tracker** (`pitch.ts`); (2) the **commitment-gating + orbit + UI loop** (`page.tsx`, refs-based rAF, no stale closures, full teardown — mic tracks stopped, AudioContext closed); (3) the **HRTF spatial-voice engine** (`audio.ts` — JI snap, golden-angle orbiting panners, 9-voice cap, always-on drone, compressor, reverb send); (4) the **inline-SVG radar** (`scene.tsx` — breathing listener dot, color-by-degree voice dots, tethers, note labels). **Ambition 3/5** (need 2): **≥3-subsystems(#2 — four)** + **named-reference(#3 — Pauline Oliveros *Deep Listening* · David Hykes & the Harmonic Choir · La Monte Young's JI drones · this lab's own `308-orbit-choir` HRTF lineage)** + **recent-research(#5 — RESEARCH §321, this fire — the 2026 edge-AI-pitch → browser-HRTF "spatial voice instrument" wave)**. (#1 not claimed — HRTF already exists at `308-orbit-choir`; the novelty is the *build-a-named-chord-in-space* interaction, not the technique.) **Diversity** dodges **every** tag the jury banned (touch · his-recording · Canvas2D · kids · Anadol-cloud): **live-voice INPUT** (not touch, not his-recording, not phone-motion) · **HRTF-spatial-audio + inline-SVG OUTPUT** (NOT Canvas2D — the banned renderer — NOT three.js, NOT a raw fragment shader) · **real-time pitch→JI-snap→spatial-voice-accumulation TECHNIQUE** · reverent/drone/sacred VIBE (NOT Anadol-cloud, NOT kids) · **D2 just intonation**, NOT C-major-pentatonic. The most faithful answer to jury #2 (the second non-screen piece, in `308`'s crowned HRTF lineage) AND jury #1 (make his music *legible* — name the notes), and it discharges the **multi-cycle-deferred `voice-cathedral` standing pick** (queued §320). Winner of a **DEEP** 3-approach adult fire on one concept (live-voice → HRTF spatial choir, legible); siblings **`332-overtone-mirror`** (decompose your live voice into its harmonic series and spatialize EACH overtone as its own HRTF voice — your timbre exploded into a sphere; the boldest/most-surprising swing, **re-flagged as a strong next-adult build**) + **`333-antiphon`** (sing a phrase → a stone cathedral re-emits it as a spatial CANON from rotating HRTF positions, layering into a round) build-clean and banked in IDEAS. Adult · DEEP · zero new deps · zero API route · no guard · 5.72 kB (109 kB First Load — Web Audio + SVG, light, no three.js bundle). Born from RESEARCH §321. **Build-verified, not browser-verified** — fully verifiable in logic (no GPU/WGSL blind spot; pays down the jury's verification-debt note vs `323`/`327`); the real unknowns are **perceptual**: HRTF localization quality on headphones, and the pitch detector's behavior on real breathy/low voices + the "one breath = one voice" gating timings, which couldn't be auditioned in the sandbox (the Auto-demo exercises the full snap/orbit/drone/limiter chain mic-free).
  Design notes: `src/app/dream/331-voice-cathedral/README.md`

---

## Previously newest (Cycle 320 — adult build · WIDE, 3 non-screen explorers)

- **[/dream/330-stillness](/dream/330-stillness)** — Stillness. `demoable`
  **An ANTI-instrument that inverts the lab's entire reactive paradigm: it sings only when you are QUIET. Sustained silence blooms a just-intonation drone and a field of light; the first real sound scatters it. John Cage's *4′33″* turned inside out.** Tap **Begin — then be still** (creates/resumes the AudioContext inside the gesture, iOS-safe; tries the mic but never blocks on it). Then *stop making noise.* While the room's smoothed RMS stays **below `QUIET=0.045`**, a low **E2 (~82.41 Hz) just-intonation drone** integrates partial-by-partial (ratios `1, 2, 6/5, 4/3, 3/2, 8/5` — minor third / fourth / fifth / minor sixth, **not** C-major pentatonic), a lowpass opens, an additive SVG light-**bloom** grows at the center of a dark one-point-perspective wireframe room, ~46 motes brighten, and a **stillness streak** counts up. A **rising edge over `NOISE=0.12`** — a clap, a word, a bump — **STARTLES** the piece: bloom → 0, streak → 0, the motes scatter outward then settle, the lowpass collapses. The ambiguous band between the thresholds lets the bloom gently recede (you're not quiet *enough* to grow). The two named tuning constants sit at the top of `page.tsx`; a **live input meter** marks `QUIET`/`NOISE` so you can see why it blooms or breaks. **It's fully demoable with no mic**: a **Be quiet (press & hold)** control fully substitutes for silence (release = the startle), and a hands-free **breathing auto-demo** (on by default) blooms-and-rests on a ~20s cycle with occasional startle spikes so the room is alive on load. The **longest stillness streak** persists to `localStorage` ("longest stillness: Xs") so returning sessions have a goal. Subsystems (≥3 → 4): (1) the **inverted-silence detector** with RMS hysteresis + mic/touch/auto input modes (`page.tsx`, refs-based rAF loop, no stale closures); (2) the **JI E2 drone engine** (`audio.ts` — staggered partial fade-in driven by a single `bloom` level, opening/collapsing lowpass, procedural noise-burst convolver reverb, master ≤ 0.46 → brick-wall `DynamicsCompressor`, all `setTargetAtTime` glides — click-free); (3) the **inline-SVG bloom/mote renderer** (`scene.tsx` — radial-gradient core + halo under an `feGaussianBlur`/`feMerge` glow filter, scattering motes, live threshold meter); (4) the **longest-streak localStorage persistence**. Provenance badge: emerald **Listening 🎤** / amber **Touch mode ✋** / violet **Auto-demo (breathing)**; full teardown on unmount (mic tracks stopped, AudioContext closed). **Ambition 2/5** (need 2): **≥3-subsystems(#2 — four)** + **named-reference(#3 — John Cage *4′33″* (inverted) · Pauline Oliveros *Deep Listening* · Éliane Radigue)**. (#1 not claimed — the novelty is the *inverted interaction model*, not a new technique label.) **Diversity** dodges **every** tag the jury banned this cycle (touch · his-recording · Canvas2D · kids · Anadol-cloud): **mic-SILENCE (inverted) INPUT** (not touch, not his-recording, not phone-motion) · **inline-SVG OUTPUT** (NOT Canvas2D — the banned renderer — NOT three.js, NOT a raw fragment shader) · **inverted silence-detection anti-instrument TECHNIQUE** (the lab's first reward-quiet inversion) · contemplative/critical/Cage VIBE · **E2 just intonation**, NOT C-major-pentatonic. The boldest answer to the jury's CORE "too similar / no-fail-noodle" critique — it doesn't swap a sensor, it *inverts the instrument* — and the **5-cycle-deferred standing flagged adult build** (315→319) finally shipped, resolving the §319 open question. Winner of a **WIDE** 3-explorer adult fire of **non-screen** directions; siblings **`329-voice-cathedral`** (sing one note → an HRTF-spatialized overtone choir that orbits your head, with the notes named — the lab's *second non-screen piece*, jury provocation #2; **re-flagged as the TOP next-adult build**, needs its compass Canvas2D→SVG) + **`331-palm-pulse`** (a song you *feel* — `navigator.vibrate` as the lead voice over a 6-section generative timeline; banked, blocked by iOS's missing Vibration API) build-clean and banked in IDEAS. Adult · ROTATION OVERRIDDEN (jury bans kids vibe next cycle) · zero new deps · zero API route · no guard · SVG (light). Born from RESEARCH §320. **Build-verified, not browser-verified** — fully verifiable in logic (no GPU/WGSL/vibration blind spot, paying down the jury's verification-debt note); the only real unknown is **RMS calibration vs a noisy review room** (`QUIET`/`NOISE` are tuned for a quiet space — a loud room may never dip below `QUIET`), *mitigated* by the press-&-hold control that fully substitutes for silence + the visible threshold meter; also unverified: SVG `feGaussianBlur`/`mix-blend` glow performance + per-frame `<Scene>` re-render with ~46 motes on a low-end device; iOS AudioContext + mic resume in the Begin gesture.
  Design notes: `src/app/dream/330-stillness/README.md`

---

## Previously newest (Cycle 319 — adult build · WIDE, 3 explorers)

- **[/dream/327-physarum-choir](/dream/327-physarum-choir)** — Physarum Choir. `demoable`
  **You don't play notes — you plant *tones as food*, and a living slime-mold network decides, over seconds, which ones to connect. The chord you hear IS which food nodes the network has currently joined: the slime composes the harmony out of its own topology — and Karel's real piano plants the tones.** Tap **Plant the first tones** (creates/resumes the AudioContext + initializes WebGPU in the gesture, iOS/autoplay-safe): the app fetches one of Karel's real recordings from the public `/api/featured` → `/api/audio/[id]` (the anon, no-auth path the loved `227-paths-granular`❤️/`163-paths-visualizer`❤️ use), decodes it, runs a coarse onset+autocorrelation-pitch tap, and scatters the detected tones as **"food" nodes** (pitch → position, snapped onto a D-rooted just-intonation modal set) across a dark field. Then **~1,048,576 Physarum agents** (Jones/Jenson model) run entirely in **WGSL `@compute` shaders**: each agent senses the trail field ahead-left/center/right, steers toward the strongest chemoattractant, and deposits as it moves (atomic fixed-point `atomicAdd`); the field **diffuses (3×3) + decays** every frame in a ping-pong pass, and each food node **injects a hot attractant** so veins grow toward the tones and **join them into a self-organizing network**. A fullscreen render pass paints the trail as a bioluminescent indigo→teal→gold glow. **The piece's idea lives in the connectivity read-out:** a reduce pass downsamples the field, async `mapAsync` reads it back, and `sampleConnections()` rings each food node (skipping its own hot core) to measure how strongly the slime has reached it → that `[0,1]` per-node connection drives the harmony engine (`audio.ts`): each node owns ONE sustained JI voice whose **gain + brightness rise as the network connects it and fall as the vein dies back**, so the live chord *is* the live topology. Click anywhere to plant another tone. **Honest novelty:** physarum is NOT lab-first — `260-kids-slime-garden` is already a Jones/Jenson agent sim (in WebGL); what's new here is the **WebGPU *compute* implementation** + the **connectivity-graph → just-intonation harmony mapping** (the slime as *composer*, not decoration). Subsystems (≥3 → 4): (1) **`source.ts`** — real-stem fetch+decode (JSON-`{url}` or raw `arrayBuffer`) + onset/pitch tap → JI seed tones, with an offline D-modal arpeggio + auto-seeded ring fallback so it's ALWAYS demoable; (2) **`gpu.ts`** — the WebGPU compute physarum sim (move/sense/deposit + diffuse/decay/food-inject + reduce-for-readback + render) **AND a full Canvas2D/CPU twin** at ~4k agents with the identical model + connectivity read-out, so a no-WebGPU review device still gets the real piece; (3) **`audio.ts`** — the connectivity-driven JI choir (per-node voice + sub partial + lowpass, always-on root drone, optional decoded bed, procedural convolver reverb, master 0.5 → brick-wall `DynamicsCompressor`); (4) the **rAF sim/harmony loop** in `page.tsx`. Graceful for the 06:30 phone review: source badge reads emerald **"♪ Karel's recording"** vs amber **"synth fallback"**; backend badge reads violet **"WebGPU compute · ~1M agents"** vs amber **"Canvas2D/CPU fallback"**; full teardown (rAF cancel, GPU buffers/device destroyed, audio disposed). **Ambition 3/5** (need 2): **≥3-subsystems(#2 — four)** + **named-reference(#3 — Andrew Adamatzky's *Physarum* sound-synthesis/biocomputing (arXiv 1212.1203); Sage Jenson (mxsage); Jeff Jones' agent model; *Simulacra Naturae* (arXiv 2509.02924, 2025))** + **recent-research(#5 — RESEARCH §319, this fire — the 2026 WebGPU-compute physarum creative-coding wave)**. (**#1 explicitly NOT claimed** — physarum already exists at `260-kids-slime-garden`; verified by grep. The honest distinctions are the *compute* renderer and the *connectivity→harmony* mapping.) **Diversity** dodges every banned tag — crucially the **touch-INPUT-at-≥5× ban, the Canvas2D-at-4× ban, and the three.js cluster**: **audio-file (his real recording) INPUT** (not touch, not phone-motion) · **WebGPU-compute trail-field OUTPUT** (1×→2× in the last 10 — not a cluster ban; NOT Canvas2D, NOT three.js, NOT a raw-WebGL2 fragment shader) · **Physarum-connectivity-as-composer TECHNIQUE** (never used as a harmony engine) · systems/emergent/organic VIBE · **D-rooted JI**, NOT C-major-pentatonic. Discharges the standing **"use his actual music"** directive in a never-reached form (his piano seeding an emergent agent network), and pulls hard from his most-loved systems/particle cluster: `236-particle-life-song`❤️, `130-tsl-particle-compute`❤️, `243-spectral-cloud`❤️, `262-aurora-particle`❤️. Winner of a **WIDE** 3-explorer adult fire; siblings `326-stillness` (the Cage anti-instrument that blooms only in mic-silence — SVG; **re-flagged as the top next-adult build**) + `328-seismic-choir` (the live USGS earthquake feed sung as an HRTF spatial JI chord around your head — jury #3 real-world-data) build-verified and banked in IDEAS. Adult · zero new deps · zero API route created · no guard (read-only GETs) · 9.71 kB (113 kB First Load — raw WebGPU, light, no three.js bundle). Born from RESEARCH §319. **Build-verified, not browser-verified** — the standout unverified risk (shared with `323`): **I could not execute the WGSL on real GPU hardware in the sandbox**, so a runtime WGSL validation/perf problem on the actual review device is possible — *mitigated* by the genuinely full Canvas2D/CPU fallback (same model + same connectivity read-out → the real experience, just fewer agents). Also unverified: whether the connectivity→voice swell reads as "the slime is choosing the chord" by eye/ear (connection thresholds are hand-tuned, time-smoothed); 1M-agent + readback frame rate on a phone GPU; the CPU fallback's per-frame 256² diffuse + 4k-agent loop on a low-end device; iOS Safari WebGPU at review; whether `/api/featured` returns his album from prod (synth + auto-seeded ring covers the no).
  Design notes: `src/app/dream/327-physarum-choir/README.md`

---

## Previously newest (Cycle 318 — kids build · DEEP, 3 approaches)

- **[/dream/325-kids-paper-boat](/dream/325-kids-paper-boat)** — Paper Boat. `demoable`
  **For kids (4+) — the lab's FIRST long-form, stateful, REMEMBERED kids JOURNEY: drag a glowing paper boat down an auto-scrolling night river from dusk to dawn; the music evolves through a real harmonic arc, and at the river's mouth the voyage sings your remembered path back.** Tap the big **▶ Begin the voyage** (creates/resumes the AudioContext inside the gesture, iOS-safe). The river **scrolls forward on its own** (3-layer SVG parallax — stars slowest, far hills medium, near reeds fastest — so you're always *traveling* toward dawn), and the child **drags the glowing paper boat** anywhere across the river. Steer **into the glowing lily-pad gates** and each one *sings* a note; **up/down** chooses which of four lanes you're in (low warm tones near the bottom → bright bell tones near the top), **left/right** opens/closes the chord voicing under everything; drift toward a bank and the texture thins, stay mid-river and it's full. **No way to crash, nothing is ever "wrong"** — every note is quantized to the current mode. This is the lab's first kids piece that *travels and remembers*: every kids prototype in 150+ before it was a short loop toy. The music is **NOT** C-major pentatonic — it's a **D-rooted modal arc** that advances by act with elapsed time: **Departure** (dusk, Dm7, D **Dorian**, indigo) → **River** (deep night, Fmaj7, F **Lydian**, night-blue) → **Rapids** (before dawn, C7, C **Mixolydian**, magenta) → **Home** (dawn, Dmaj7, D major, amber), so minute 6 sounds and looks genuinely different from minute 1 and the home chord *resolves* the journey. **It remembers:** every gate passed is recorded as a `MemoryNote{t,midi,lane,act}`; at the river's mouth **`playReplay()`** sings the last ~24 remembered notes back as a gentle lullaby over the resolving home chord — the voyage recounts the path *you* steered — and the whole `VoyageState` persists to `localStorage` on a 3s wall-clock interval + on unmount, so reopening offers **↻ Continue your river**. Subsystems (≥3 → 4): (1) the **drag-steer pointer/lane tracker + auto-scrolling 3-layer-parallax SVG world** (`page.tsx`, single rAF loop mutating SVG attributes / one gate-layer `innerHTML` per frame — the React tree is never re-rendered per frame); (2) the **harmonic-arc audio engine** (`audio.ts` — per-act retuned chord pad + lane-voicing `steer`/`setAct`, scale-quantized gate chimes, always-on filtered-noise water/wind pad, synthesized convolver reverb, master 0.5 → brick-wall `DynamicsCompressor` for small ears); (3) the **voyage state machine + path memory/replay** (`voyage.ts`); (4) the **wall-clock localStorage persistence + act/hue/darkness interpolation** (`hueAtProgress`/`darknessAtProgress`: dusk → deepest night near the middle → warm dawn). **Ambition 3/5** (need 2): **≥3-subsystems(#2 — four)** + **named-reference(#3 — Joseph Campbell's monomyth departure→initiation→return + Resonance's own multi-phase journey engine, reimagined for a 4yo + the 2026 adaptive/generative game-music frontier)** + **multi-cycle/long-form(#4 — explicitly long-form/stateful/persistent; README specs a cycle-2 deepening: branching tributaries, a two-boat duet, tides/day-night by real clock)**. (#1 NOT claimed — auto-scroll/parallax isn't a lab-first *technique*; the honest novelty is the *first long-form remembered kids journey*, under #4.) **Diversity** dodges every banned tag — crucially the **Canvas2D-at-4× ban AND the emerging three.js-at-3× cluster** that together ruled the renderer: **inline-SVG-parallax OUTPUT** (NOT Canvas2D, NOT three.js, NOT a raw fragment shader) · **touch drag-to-steer INPUT** (not phone-motion, not mic) · **long-form auto-scrolling voyage + harmonic-arc state machine + lane-voicing + path memory/replay + persistence TECHNIQUE** (NOT a no-fail trigger bed — it has memory/evolution/travel) · dusk→night→dawn river VIBE · **D-rooted modal arc**, NOT C-major-pentatonic. **Breaks the jury's kids no-fail-noodle FORM** with genuine long-form memory + harmonic evolution + a sense of travel, and is a clean break from the just-shipped voice-garden (which it was deliberately curated *against*). Pulls from Karel's loved drift/travel + paint/grow kids cluster (`166-kids-lantern`❤️, `169-kids-marble-run`❤️, `133-kids-ripple-pond`❤️, `100-kids-paint-song`❤️, `152-kids-star-paint`❤️) + his *journeys/paths* lineage (`163-paths-visualizer`❤️, `227-paths-granular`❤️). Winner of a **DEEP** 3-approach kids fire; siblings `324-kids-firefly-journey` (the same journey via the simplest tap-to-drift control — strong, ready) + `326-kids-sing-home` (hum/sing a lost star home via autocorrelation pitch → lane, with a full touch fallback + auto-demo — resurrect once voice cools) build-verified and banked in IDEAS. Kids · zero new deps · zero API route · no guard · SVG (light, no three.js bundle). Born from RESEARCH §318. **Build-verified, not browser-verified** — unverified: whether the 6–12 min *felt* pacing stays engaging for a 4yo (act boundaries are proportional so a short demo still crosses real harmonic territory, but the middle minutes are untested); SVG parallax + per-frame gate `innerHTML` at 60fps on a low-end tablet as gates accumulate; iOS AudioContext resume; whether drag-the-boat reads as control vs. the auto-scroll; on resume the music/act/memory restore faithfully but the gate layout regenerates (not gate-for-gate); reverb/limiter loudness by ear.
  Design notes: `src/app/dream/325-kids-paper-boat/README.md`

---

## Previously newest (Cycle 317 — adult build · WIDE, 3 explorers)

- **[/dream/323-latent-condensation](/dream/323-latent-condensation)** — Latent Condensation. `demoable`
  **Karel's own *Welcome Home* piano pulls 120,000 GPU particles out of turbulent chaos — condensing into a flowing form on each phrase, dissolving back into noise in the rests — the whole simulation running in a WebGPU compute shader.** Tap **Play Karel's piano** (creates/resumes the AudioContext + initializes WebGPU in the gesture, iOS/autoplay-safe): the app fetches one of his real recordings from the public `/api/featured` → `/api/audio/[id]` (the same anon, no-auth path the loved `227-paths-granular`❤️/`163-paths-visualizer`❤️ use), decodes it, taps an `AnalyserNode`, and runs **120k particles whose positions+velocities live entirely in a GPU storage buffer** through a **raw WGSL `@compute @workgroup_size(256)` pass** every frame: a curl-of-value-noise flow field (divergence-free turbulence) blended against an attraction term that pulls each particle toward a slowly morphing target shape (sphere → torus → lissajous). A second WGSL **render pipeline** draws them as additive glowing billboards on near-black — a luminous, Anadol-like latent cloud. The chaos↔order blend is a single `condensation` value produced by the audio: a **6-band FFT + RMS envelope** drives a phrase state machine (`chaos → condense → form → release`); low bands widen the flow, treble adds sparkle, a phrase swell condenses, a rest dissolves. **Honest novelty:** WebGPU compute is NOT lab-first (`16-particle-life-gpu`, `130-tsl-particle-compute`❤️, `75-houdini-particle-flock`, `55-webgpu-audio-fx` predate it) — the novelty is the **application**: a chaos↔form *condensation dramaturgy* conditioned phrase-by-phrase by his **real recording**. Subsystems (≥3 → 4): (1) **`audio.ts`** — real-stem fetch+decode (handles JSON-`{url}` and raw `arrayBuffer`) with an offline-rendered A-natural-minor Karplus-Strong fallback + explicit source label so it is ALWAYS demoable; (2) **`analysis.ts`** — the 6-band FFT + RMS phrase state machine producing the `condensation` coupling; (3) **`gpu.ts`** — raw WebGPU (no three.js, no TSL): seeded storage buffer, compute pass, additive render pass, full `destroy()`; (4) the **rAF transport loop** in `page.tsx`. Graceful for the 06:30 phone review: source badge reads emerald **"♪ Welcome Home — Karel's recording"** vs amber **"synth fallback"**; **no WebGPU → readable `text-rose-300` notice + a live DOM level-meter that still pulses to the audio** (the screen is never blank, nothing throws); full teardown on unmount (rAF cancel, GPU buffers/device destroyed, source stopped, ctx closed). **Ambition 3/5** (need 2): **≥3-subsystems(#2 — four)** + **named-reference(#3 — nibi by monoton-music, a 2026 WebGPU/TSL compute particle music-video engine, github.com/monoton-music/nibi; + Refik Anadol latent-flow point clouds)** + **recent-research(#5 — RESEARCH §317, this fire)**. (#1 explicitly NOT claimed — WebGPU compute already exists in the lab; verified by grep.) **Diversity** dodges every banned tag — crucially the **Canvas2D-at-4× ban** AND the **emerging three.js-at-3× cluster**: **WebGPU-compute OUTPUT** (0× in the last 10; neither Canvas2D, nor three.js-WebGL, nor a raw-WebGL2 fragment shader) · **audio-file (his real recording) INPUT** (not touch [4× banned], not phone-motion) · **GPU curl-noise particle-condensation conditioned by a phrase state machine TECHNIQUE** · immersive/latent/Anadol VIBE · his real recording / A-natural-minor fallback, **NOT C-major-pentatonic**. Discharges the standing **"use his actual music"** directive in a new (GPU-particle-dramaturgy) form, and pulls from his most-loved cluster: real music (`227`❤️/`163`❤️) + immersive/particle/systems (`243-spectral-cloud`❤️, `262-aurora-particle`❤️, `236-particle-life-song`❤️, `130-tsl-particle-compute`❤️). Winner of a **WIDE** 3-explorer adult fire; siblings `324-stillness` (the Cage anti-instrument that blooms only in mic-silence — SVG; re-flagged as the next adult build) + `325-seismic-choir` (the live USGS earthquake feed sung as an HRTF spatial just-intonation chord around your head) build-verified and banked in IDEAS. Adult · zero new deps · zero API route created · no guard (read-only GETs) · 8.62 kB (111 kB First Load — raw WebGPU, light, no three.js bundle). Born from RESEARCH §317. **Build-verified, not browser-verified** — unverified: whether the WGSL validates + runs on the actual review GPU (could not execute WGSL on hardware in the sandbox — the DOM-meter fallback covers a no, but the headline experience depends on it); whether the chaos↔form condensation reads legibly as the *shape of his phrasing* by eye; 120k-particle frame rate on a phone GPU; iOS Safari WebGPU support at review; whether `/api/featured` returns his album from the prod origin (synth fallback covers the no).
  Design notes: `src/app/dream/323-latent-condensation/README.md`

---

## Previously newest (Cycle 316 — kids build · DEEP, 2 approaches)

- **[/dream/322-kids-voice-garden](/dream/322-kids-voice-garden)** — Kids Voice Garden. `demoable`
  **For kids (4+) — GROW a living musical garden with your VOICE: sing or hum and glowing branches race toward the sound and bloom notes; the garden keeps its real age, so it's taller and a different color of music every visit.** Tap the big **▶ Start singing** (creates/resumes the AudioContext + mic inside the gesture, iOS-safe); a dusk SVG sky with a moon, stars and soil appears, and a first seedling sprouts. **Sing/hum and a glint of "light" (an attractor point) appears in the sky — higher pitch places it higher, louder voice grows faster — and the nearest plant's branches *climb toward it* and bloom a note** the instant a tip reaches the light. This is the lab's **FIRST space-colonization growth** in 320+ prototypes (our only prior botanical growth was a recursive L-system): branch tips compete for and *consume* nearby attractor points (influence-radius association → grow one step toward the averaged attractor direction → kill-radius consumption → bloom), producing growth that looks genuinely *alive* and reaches for the child rather than unfolding deterministically. **It's long-form and it remembers:** plants are saved to `localStorage` every 5s with millisecond timestamps and **age by real wall-clock time** — a garden seeded last night runs capped offline-regrowth and greets the child *fuller this morning*; and the harmony **journeys** through a D-Lydian progression (a new chord ~every 40s, each with its own dusk hue) so blooms at minute 5 are a different *color of music* than minute 1. Audio = always-on detuned root drone (never silent) + per-bloom Karplus-Strong plucks on the current chord → generated-impulse convolver reverb → 0.5 master → brick-wall `DynamicsCompressor` (safe for small ears even when dense); after ~13 min it drifts to a soft lullaby. Subsystems (≥3 → 4): (1) **`voice.ts`** — analysis-only mic (smoothed RMS loudness + autocorrelation pitch; never recorded/stored/transmitted; tracks stopped on unmount); (2) **`garden.ts`** — the space-colonization sim + localStorage persistence/offline-growth; (3) **`audio.ts`** — the safe Web-Audio harmonic engine (drone + KS plucks + D-Lydian journey + reverb/limiter); (4) the **wall-clock persistence + harmonic-clock state machine** in `page.tsx`. Scale: **D Lydian** (D E F♯ G♯ A B C♯) over a low D drone — deliberately **NOT** C-major-pentatonic (banned this cycle). No-reading: pitch=height is the only "control," the sky IS the canvas; a hands-free **auto-demo** drifts light and grows a plant on load so it's alive at a glance. Degrades for the 06:30 phone review: mic denied/unavailable → readable `text-rose-300` notice + a full **touch fallback** (tap the sky to plant a small cluster of light, full-screen ≥64px target) + provenance label emerald **"Listening 🎤"** vs amber **"Touch mode ✋"**; SVG mutated via one `innerHTML` write/frame through refs (the React tree is not re-rendered each frame); full teardown on unmount (rAF cancel, save-timer clear, mic stop, audio dispose, ctx close). **Ambition 3/5** (need 2): **never-used-technique(#1 — first space-colonization growth in 320+ prototypes; verified via grep — all prior plant growth was recursive L-system)** + **≥3-subsystems(#2 — four)** + **multi-cycle/long-form(#4 — persists + ages across sessions, harmonic journey; README specs a cycle-2 duet/seasons/pollinator deepening)**. Named ref: **Runions, Lane & Prusinkiewicz (2007), "Modeling Trees with a Space Colonization Algorithm" (algorithmicbotany.org)**. **Diversity** dodges every banned tag — crucially the **touch-INPUT-at-5× ban AND the Canvas2D-at-4× ban** that both ruled this cycle: **voice/mic INPUT** (the freshest modality — 0× in the last 10, KIDS.md-endorsed; not touch, not phone-motion) · **inline-SVG OUTPUT** (NOT Canvas2D, NOT three.js [the emerging 3× cluster], NOT a raw fragment shader) · **space-colonization voice-grown-garden TECHNIQUE** (not L-system, not a no-fail trigger bed — it has long-form memory) · **D-Lydian** not C-major-pentatonic. **Breaks the kids-recipe critique** (the no-fail-modal-noodle) with genuine long-form persistence/evolution, and the touch+Canvas2D/three.js renderer monoculture with voice+SVG. Pulls from Karel's loved kids-paint/grow cluster (`140-kids-string-bridge`❤️, `100-kids-paint-song`❤️, `152-kids-star-paint`❤️, `158-kids-hum-paint`❤️) + systems/emergent (`236-particle-life-song`❤️). Winner of a **DEEP** 2-approach kids fire; the differential-growth sibling `323-kids-coral-bloom` (a bioluminescent voice-grown reef — self-avoiding ring + spatial-bucket-grid repulsion + node insertion buckling into coral folds, in three.js; gorgeous, near-ship) build-verified and banked in IDEAS. Kids · zero new deps · zero API route · no guard · 6.3 kB (109 kB First Load — SVG, light). Born from RESEARCH §316. **Build-verified, not browser-verified** — unverified: whether autocorrelation tracks a wobbly toddler hum steadily enough that "sing higher = grow higher" reads as *control*; SVG `innerHTML`-per-frame at 60fps as the canopy fills on a phone; iOS AudioContext + mic resume in the Start gesture; whether the colonization growth reads as "racing toward my voice" by eye; whether offline-regrowth feels magical vs. arbitrary; mic accuracy in a noisy room (touch fallback covers the no).
  Design notes: `src/app/dream/322-kids-voice-garden/README.md`

---

## Previously newest (Cycle 315 — adult build · WIDE, 3 explorers)

- **[/dream/321-spectral-flight](/dream/321-spectral-flight)** — Spectral Flight. `demoable`
  **Fly through the INSIDE of Karel's own recording — his *Welcome Home* piano turned into a navigable 3D spectral landscape you pilot in sync with playback.** Tap **Fly through his recording** (creates/resumes the AudioContext in the gesture, iOS-safe): the app fetches one of Karel's real recordings from the public `/api/featured` (finds the `/welcome|karel/i` album) → `/api/audio/[id]` (the same anon, no-auth path the loved `227-paths-granular`❤️ / `163-paths-visualizer`❤️ use), decodes it, and runs the **whole track through a hand-written offline STFT** (radix-2 FFT, 2048/1024, Hann, mono mix) into a **340 × 128** time × log-frequency dB-normalized magnitude grid. That grid becomes a **three.js `THREE.Points` landscape** — x = time, y = log-frequency, height/brightness = magnitude, additive glow sprites colored violet (bass) → cyan → white (treble), with fog — and the **camera flies forward along the time axis locked to `currentTime/duration`** so the world can never drift from the music. **Drag (pointer) or arrow keys** bank the look (eased back to center when idle); **space** play/pauses; a transport shows `m:ss / total`. It's the standing **"use his actual music"** directive finally in the *immersive flythrough* form — where `308-orbit-choir` put his recording in the *spatial-audio* layer, this puts you *inside* its spectrogram as a place. Subsystems (≥3 → 4): (1) **`audio.ts`** — the real-stem fetch+decode pipeline (handles both JSON-`{url}` and raw `arrayBuffer`, `decodeAudioData`) with an **offline-rendered A-natural-minor arpeggio fallback** + explicit source labels so it is ALWAYS demoable; (2) **`fft.ts`** — the from-scratch Cooley–Tukey FFT + offline STFT that downsamples the whole track into the landscape grid; (3) **`scene.ts`** — the three.js additive point-cloud flythrough (camera locked to playback, smoothed yaw/pitch banking, full `dispose()`); (4) the **transport-sync loop** in `page.tsx` (AudioContext-time bookkeeping, looping source, iOS resume). Graceful for the 06:30 phone review: source label reads violet **"Karel's recording — <title>"** vs `text-rose-300` **"demo (his album unreachable)"**; no WebGL → readable `text-rose-300` notice; full teardown on unmount (rAF cancel, source stop/disconnect, scene dispose, ctx close). **Ambition 3/5** (need 2): **≥3-subsystems(#2 — four)** + **named-reference(#3 — Refik Anadol *Latent City* (BRUSK, 2026) + Ryoji Ikeda *data-verse* — inhabiting data as a navigable landscape)** + **multi-cycle(#4 — README specs a cycle-2 spatialized/branching-flight deepening)**. **Diversity** dodges every banned tag — crucially the **Canvas2D-at-4× ban that ruled the renderer this cycle** (319,317,314,313 were all Canvas2D): three.js point-cloud OUTPUT (not Canvas2D, not a raw fragment shader) · audio-file (his real recording) + drag/keyboard INPUT (not phone-motion, not mic, not camera) · offline-STFT navigable-landscape TECHNIQUE (not a live-reactive cloud, not FFT-bar-viz) · immersive/Anadol-Ikeda VIBE · fallback in A-natural-minor, **NOT C-major-pentatonic**. Pulls squarely from Karel's **most-loved cluster**: his real music (`227-paths-granular`❤️, `163-paths-visualizer`❤️) + immersive/spectral (`243-spectral-cloud`❤️, `267-spectral-drift`❤️, `262-aurora-particle`❤️). Winner of a **WIDE** 3-explorer adult fire; siblings `322-strange-attractor` (a Lorenz attractor synthesized at audio rate in a custom AudioWorklet — the sound IS the phase-space sculpture; on Karel's named wishlist) + `323-stillness` (a Cage anti-instrument that blooms only in mic-silence and collapses at the first sound — flagged as the next adult build) build-verified and banked in IDEAS. Adult · zero new deps · zero API route created · no guard (read-only GETs) · 6.06 kB (294 kB First Load — three.js). Born from RESEARCH §315. **Build-verified, not browser-verified** — unverified: whether `/api/featured` returns a usable Welcome Home album from the prod origin at review (the labeled synth fallback covers the no); whether flying through the point-cloud reads as a coherent *place* vs. a fog of dots; STFT build time + frame rate for a multi-minute track on a phone; iOS AudioContext resume; whether the camera-locked-to-playback sync feels tight by eye.
  Design notes: `src/app/dream/321-spectral-flight/README.md`

---

## Previously newest (Cycle 314 — kids build · WIDE, 3 explorers)

- **[/dream/320-kids-light-loom](/dream/320-kids-light-loom)** — Kids Light Loom. `demoable`
  **For kids (4+) — the lab's FIRST *bowed* string: drag across glowing strings of light to make them SING and sustain, instead of plucking them.** Tap the big **▶ Start Playing** (creates/resumes the AudioContext in the gesture, iOS-safe); six luminous vertical strings stand on a dark three.js stage, each a bold color + pitch (lower = bigger). **Drag a finger along a string and it *bows*:** it lights up, ripples with a visible standing wave, and sings a **sustained** tone that swells in while the finger moves and gently fades when you stop or lift — completely different from every prior string in the lab, which were one-shot *plucks*. **Bow speed is the expression:** drag slowly for a soft, dark, breathy sound; drag fast for a bright, loud, singing tone (the characteristic stick-slip / Helmholtz feel — faster bow = more energy = purer, brighter Helmholtz motion). **Multi-touch:** two fingers (two kids, or two hands) bow two strings at once → they harmonize. No wrong notes, no score, no timer. This is the lab's **first continuous-excitation bowed-string physical model** in 300+ prototypes — every prior string (105/108/140/152/184/311/321) is *plucked* Karplus-Strong (one noise burst → decay); a bow keeps feeding energy in, so the string never decays while bowed. Audio = approach (b): per-string sawtooth + white-noise → bow-gain (bow-speed→amplitude) → HP+LP filters (bow-speed→brightness) → swell envelope, through a synthesized `ConvolverNode` reverb (built in code, no files) → a `DynamicsCompressor` brick-wall limiter → 0.5 master, plus an always-on D2+A2 root+fifth drone so it's never silent — all `setTargetAtTime`-glided (no clicks), safe for small ears even when all six are mashed. Subsystems (≥3): (1) the **bowed-string synth engine** (`audio.ts`); (2) a **multi-touch bow-gesture tracker** (`bow.ts`) — per-pointer velocity EMA → normalized bow-speed, simultaneous fingers, ≥72px hit bands; (3) a **raw three.js scene** (`scene.ts`) — emissive `THREE.Line` strings whose position buffer is rewritten every frame for a 1–3-mode standing wave (modes scale with bow energy), additive-blended glow planes, and sparkle `THREE.Points` at the bow contact, on a dark fog stage with full geometry/material disposal on unmount. Scale: **D-Dorian hexachord / just-intonation 5ths over a D root** (D2 A2 D3 G3 A3 D4) — deliberately **NOT C-major-pentatonic** (banned). No-reading: colors are the strings, the drag IS the instrument; an auto-demo gently bows string 0 on Start so it's alive at a phone-first glance. Degrades for the 06:30 review: no WebGL → `text-rose-300` notice; no Web Audio → non-fatal notice, the three.js strings still animate and respond to touch. **Ambition 3/5** (need 2): **never-used-technique(#1 — first continuous-excitation/bowed string in 300+ prototypes; all prior strings are one-shot plucked Karplus-Strong)** + **≥3-subsystems(#2 — bowed synth + multi-touch bow tracker + three.js standing-wave scene)** + **named-reference(#3 — Stefania Serafin & Christophe Vergez real-time violin friction model + Julius O. Smith digital-waveguide bowed strings, CCRMA + Helmholtz motion/stick-slip; nods to loved `140-kids-string-bridge`)**. **Diversity** dodges every banned tag — crucially the **Canvas2D-at-4× ban that ruled the renderer this cycle** (319,317,314,313 were all Canvas2D): three.js glowing-string OUTPUT (not Canvas2D, not a raw fragment shader, not a creature-with-pads) · multi-touch-bow INPUT (not phone-motion, not camera, not solo-tap) · continuous-bowed-string TECHNIQUE (not plucked KS, not a no-fail trigger bed) · D-Dorian not C-major-pentatonic. Winner of a **WIDE** 3-explorer kids fire; siblings `321-kids-seed-garden` (a long-form generative garden that grows + sings + **persists to localStorage with real wall-clock age** while you're away — near-ship, a future DEEP/long-form candidate) + `322-kids-sing-up` (sing higher → a paper bird climbs the sky; autocorrelation pitch-match, SVG cut-paper) build-verified and banked in IDEAS. Kids · zero new deps · zero API route · no guard · 5.14 kB (296 kB First Load — three.js). Born from RESEARCH §314. **Build-verified, not browser-verified** — unverified: whether the bowed timbre actually *sustains and sings* by ear (vs. buzzes) and whether bow-speed→brightness reads as expressive on a real touch device; standing-wave frame rate on a phone; two-finger bowing on a real iPad; `linewidth>1` is GPU-dependent (strings may render 1px thin on some devices — the glow plane mitigates); iOS AudioContext resume; whether a 4-year-old discovers "drag, don't tap" without a prompt.
  Design notes: `src/app/dream/320-kids-light-loom/README.md`

---

## Previously newest (Cycle 313 — adult build · DEEP, 2 approaches)

- **[/dream/319-hub-score](/dream/319-hub-score)** — Hub Score. `demoable`
  **The lab's FIRST networked / multi-instance piece — every open browser tab is one sustained voice in a serverless, wall-clock-synced just-intonation ensemble, and any tab can take the baton to conduct the whole room's harmony.** Press **▶ Start / Join the room** (creates/resumes the AudioContext in the gesture, iOS-safe): you become one voice holding a chord-tone of a slow D-rooted just-intonation drone, with two gentle "ghost" voices already holding the chord so a single tab sounds full. **Open the same URL in a 2nd/3rd tab** and each becomes another sustained voice — they all **breathe together** because the breath is the **wall clock**: `globalPhase(Date.now())` is a pure function returning a 0..1 phase over a ~30s cycle, so every same-origin tab evaluates the same swell at the same instant with **zero clock-sync handshake** (the shared clock IS the conductor's baton; the BroadcastChannel only carries *what* to play, never *when*). Tap a **degree** (1/1, 9/8, 6/5 …) to choose which chord-tone you sing; press **Take the baton** to become conductor and `◀ chord / chord ▶` steps the shared field through a slow modal progression while brighter/darker · denser/sparser · oct ± reshape the whole room — **every tab glides to match** (last tab to take the baton wins). Rendered as a **Canvas2D living graphic score**: a horizontal time-river, one lane per player on its JI-degree line, each lane's band breathing with its live gain; a vertical sweep marks the wall-clock phase, your lane glows, the conductor's carries a caret — Ikeda-restrained, thin lines on near-black, **deliberately no glow** (NOT a fragment shader, NOT three.js-bloom, NOT a creature-with-pads). Subsystems (≥3 → 4): (1) **`sync.ts`** — the JI set + chord progression + wall-clock phase/breath envelope + identity/hue + the BroadcastChannel protocol (`hello`/`welcome`/`voice`/`field`/`conductor`/`heartbeat`/`leave`, ~5s prune, rev-counter reconciliation); (2) **`audio.ts`** — a continuous additive-voice drone ensemble (fundamental + 3 quiet partials → per-voice lowpass(brightness) → breathing-LFO gain → shared synthesized convolver reverb → master brick-wall limiter, all `setTargetAtTime`-glided); (3) **`score.ts`** — the Canvas2D living graphic score; (4) the **conductor harmony-field state machine** (take-the-baton, last-writer-wins, the shared `{chordIndex, octave, brightness, density}` field everyone glides to). Scale: **just intonation over a D root** — 1, 9/8, 6/5, 4/3, 3/2, 8/5, 9/5, 2 (D-Dorian colour as pure ratios), explicitly **NOT C-major-pentatonic** (banned this cycle). Graceful for the 06:30 phone review: fully playable SOLO (ghost chord + you can conduct the ghosts); no `BroadcastChannel` → amber notice + solo voice; audio survives a missing 2D context. **Ambition 3/5** (need 2): **never-used-technique(#1 — first networked/multi-instance/BroadcastChannel shared-state piece in 319 prototypes; the multi-user shelf was empty 15+ cycles)** + **≥3-subsystems(#2 — four)** + **named-reference(#3 — The Hub (Bischoff/Perkis, 1980s) + The League of Automatic Music Composers (1978) + La Monte Young *Dream House* + Ryoji Ikeda)**. **Diversity** dodges every banned tag (multi-tab-presence+baton INPUT not phone-motion/mic/camera · Canvas2D-graphic-score OUTPUT not raw-WebGL2-fragment-shader and not three.js-bloom · serverless shared-state + wall-clock-breath + conductor TECHNIQUE not a no-fail trigger bed · just-intonation-over-D not C-major-pentatonic) — and opens the **multi-user / networked axis** the lab had never shipped. Winner of a **DEEP** 2-approach fire; the rhythmic sibling `318-ensemble-room` (an editable 16×8 D-Dorian **step-sequencer** with a Chris-Wilson lookahead scheduler + a **three.js 3D orbital constellation** — the obvious WebRTC-cross-device next step) build-verified and banked in IDEAS. Adult · zero new deps · zero API route · no guard · 5.61 kB. Born from RESEARCH §313. **Known scope limit:** `BroadcastChannel` is same-origin same-browser-profile only — "the room" is one machine's tabs, NOT cross-device (true cross-device needs WebRTC + signaling). **Build-verified, not browser-verified** — unverified: whether 3 tabs feel genuinely synchronized on a real machine, whether the lone-tab ghost-chord + conductor experience reads at a phone-first review (the multi-tab payoff needs ≥2 tabs), JI drone timbre + reverb loudness by ear, the baton-handoff race under simultaneous claims, iOS AudioContext resume.
  Design notes: `src/app/dream/319-hub-score/README.md`

---

## Previously newest (Cycle 312 — kids build · WIDE, 3 explorers)

- **[/dream/317-kids-color-bells](/dream/317-kids-color-bells)** — Kids Color Bells. `demoable`
  **For kids (4+) — the room becomes your instrument: show the camera a colored object and a bell rings.** Tap the big **▶ Start** (resumes the AudioContext in the gesture, iOS-safe) and the rear camera opens; a "magic circle" reticle sits at the center of the live feed. Point the camera at something colorful — a red toy, a blue cup, a green leaf — and **hold it steady for ~0.5s** (a clockwise progress arc fills the reticle): that color's **bell rings**, a full-screen color wash flashes, and a **bead is added to a growing "song basket"** along the bottom. Tap **▶ Play song** to replay the collected colors as a little melody (each bead lights as it sounds); **🧺** empties the basket. No fail, no score, no timer — showing a new color just adds another bead. This is the lab's **first camera region-color sampling** technique: each frame the video is drawn to an offscreen canvas, the **average RGB inside the reticle box** is computed → HSV, and (if saturated/bright enough) the **hue is mapped to one of 6 bins** → a note — *no ML, no body/face tracking, no optical flow*, deliberately simple and robust for a 4-year-old. Hue→note over the **D major hexachord** (red D3 · orange E3 · yellow F♯3 · green G3 · blue A3 · violet B3 — warm colors low, cool colors ascending; **NOT** C-major-pentatonic, banned this cycle). Subsystems (≥3 → 4): (1) the **camera-color sampler** (`color.ts`) — offscreen `drawImage` → `getImageData` center box → average RGB → RGB→HSV → saturation/value gate → 6-bin hue map + a cross-origin-taint guard; (2) an **FM bell audio engine** (`audio.ts`) — sine carrier + inharmonic modulator (ratio 2.756) + bright 2nd partial for a warm marimba/gamelan bell, through a synthesized `ConvolverNode` reverb → `DynamicsCompressor` brick-wall limiter → 0.5 master, plus a barely-there D3+A3+D4 pad so it's never silent; (3) a **Canvas2D scene** (`scene.ts`) — live video feed, animated reticle with hold-progress arc, color splash, and the bead strand (explicitly **not** a raw full-screen fragment shader and **not** a creature-with-tappable-pads); (4) the **song-memory state machine** (collect → cap at 24 beads → replay/clear). Graceful for the 06:30 phone review: camera denied/unsupported → `text-rose-300` notice + a **touch fallback** of six big (≥68px) color buttons you can tap to ring bells and build a song, plus a hands-free auto-demo that rings a few colors on load; provenance shown as emerald **"Camera on"** vs amber **"Touch mode."** Full cleanup (rAF cancel, camera `track.stop()`, AudioContext close on unmount). **Ambition 2/5** (need 2): **never-used-technique(#1 — camera region-color sampling → sound, a lab-first)** + **≥3-subsystems(#2 — four)**. Named refs in README: **Toshio Iwai *SimTunes* (1996)** + the color-organ / Castel *clavecin oculaire* / Len Lye / Oskar Fischinger visual-music lineage. **Diversity** dodges every banned tag (camera-color INPUT not phone-motion/touch · Canvas2D-over-camera OUTPUT not raw-WebGL2-fragment-shader and not creature-with-pads · hue→bell + collected-song-memory TECHNIQUE not the no-fail-noodle · D-major-hexachord not C-major-pentatonic) — and brings a **fresh INPUT modality (camera)** the lab hadn't shipped in the recent window, where the last two kids ships were both touch+Canvas2D (311, 313). **Directly discharges JURY 2026-06-04 provocation #2** (break the kids recipe with memory/consequence; break the creature-with-pads/full-screen-shader monoculture). Winner of a **WIDE** 3-explorer kids fire; siblings `316-kids-seed-garden` (a generative *Bloom*-garden that grows + sings + **persists with wall-clock age** while you're away — gorgeous, near-ship) + `315-kids-sing-up` (sing a pitch to climb a balloon, autocorrelation pitch-match) build-verified and banked in IDEAS. Kids · zero new deps · zero API route · no guard · 5.6 kB. Born from RESEARCH §312. **Build-verified, not browser-verified** — unverified: color-bin accuracy under real-room lighting (no white-balance; generous thresholds mitigate), iOS rear-camera `facingMode:environment` only on Safari (falls through to touch otherwise), FM bell timbre by ear, hold-to-confirm feel + frame rate on a real phone.
  Design notes: `src/app/dream/317-kids-color-bells/README.md`

---

## Previously newest (Cycle 311 — adult build · DEEP, 2 approaches)

- **[/dream/314-solar-wind](/dream/314-solar-wind)** — Solar Wind. `demoable`
  **The lab's FIRST live SPACE-weather sonification — a long-form drone scored, in real time, by the Sun.** Tap **Begin** (creates/resumes the AudioContext in the gesture, iOS-safe); a sustained just-intonation overtone drone over D2 (ratios 1, 3/2, 2, 3, 4, 5, 6 — deliberately **not** C-major-pentatonic) starts, and a sky of layered **aurora curtains** glows over a star field. There are no plucks or triggers — the **live solar wind continuously glides the harmony and texture**: three keyless, CORS-open **NOAA SWPC** feeds (`solar-wind/plasma-1-day.json` speed+density · `solar-wind/mag-1-day.json` `bz_gsm`+`bt` · `json/planetary_k_index_1m.json` Kp) are fetched directly from the browser, merged on one timeline, and re-polled every ~60s. **Faster wind → brighter/higher; denser plasma → thicker texture + shimmer; southward Bz → detunes the 5th partial into slow beating (storm tension), northward settles to a pure ratio; a high Kp → storm climax + curtains turn magenta and turbulent.** A HUD shows the Sun's *actual numbers right now* (speed km/s · density · Bz nT · Kp, with a STORM flag at Kp≥5). Two modes: **Live** (sonifies the present moment, slowly drifting — genuinely different after a few minutes) and **Replay 24h** (time-compresses the fetched day into ~3 min so you hear a whole day of the Sun, storm and all, as one arc, with a progress bar). It's the **sky *above* you**, where the loved-cluster-adjacent `279-tremor-score` sonified the Earth *beneath* you — a different external feed, taken because §289 already filled the seismic shelf. Subsystems (≥3): (1) three NOAA feed pipelines with **defensive header-by-name column lookup** + bad-value (`null`/`""`/`-9999.9`) filtering + UTC merge + a bundled ~54-row synthetic-storm fallback so it plays/animates offline; (2) the fixed-bank just-intonation **overtone drone engine** (`setTargetAtTime` glides over ~4s, brick-wall `DynamicsCompressor` + 0.42 master so a Kp-9 climax can never blast); (3) the Canvas2D **aurora-curtain renderer** (folded-sheet geometry, green→magenta gradient, additive crossings, star field, storm-reactive horizon glow — explicitly **not** a single full-screen noise shader); (4) the live/replay-24h state machine. Graceful for the 06:30 phone review: provenance line states emerald **"Live · NOAA SWPC"** vs amber **"Sample data (NOAA feed offline)"**, errors in `text-rose-300`. **Ambition 3/5**: ≥3-subsystems(#2) + named-reference(#3, **Terry Riley & Kronos Quartet *Sun Rings* 2002**, built from Don Gurnett's real NASA plasma-wave recordings + NOAA SWPC + SeismoDome lineage) + recent-research(#5, RESEARCH §311). **Diversity** dodges every banned tag (live-API INPUT not phone-motion/touch · Canvas2D aurora-curtains OUTPUT not raw-WebGL2-fragment-shader and not creature-with-pads · continuous-drone data-sonification TECHNIQUE not discrete triggers · just-intonation overtones not C-major-pentatonic). **Directly discharges JURY 2026-06-04 provocation #3** ("compose from the live planet — the empty real-world-data shelf"). Winner of a **DEEP** 2-approach fire; the clinical Ikeda sibling `315-helios-stream` (granular cloud + inharmonic spectral comb + data.matrix field) build-explored and banked in IDEAS. Adult · zero new deps · zero API route created · no guard (read-only third-party GETs) · 5.5 kB. Born from RESEARCH §311. **Build-verified, not browser-verified** — unverified: NOAA CORS reachability from the prod origin at review (sample fallback covers the no), whether live ranges feel as dramatic as the synthetic storm, whether the Bz beating reads as "tension" vs. mud, aurora frame rate + iOS AudioContext resume on a phone.
  Design notes: `src/app/dream/314-solar-wind/README.md`

---

## Previously newest (Cycle 310 — kids build · WIDE, 3 explorers)

- **[/dream/313-kids-tone-tower](/dream/313-kids-tone-tower)** — Kids Tone Tower. `demoable`
  **For kids (4+) — consequence made PHYSICAL: a tower the child's *memory* builds.** Tap **Build it taller ▲** (resumes the AudioContext + a soft pad so it's never silent); a 2-block tower stands and **sings its song** (blocks light bottom→top, each playing its note — self-demos on Start). A clear *your turn* cue (pulsing green base + 👆, no reading). **Echo the melody** on the 4 big colored note-tiles (color = pitch): each **correct** note lights the matching block with a soft landing chime; **finishing the whole song** sends a shimmer up the tower, plays a rising arpeggio, and **grows it by one note** — a new glowing block drops and settles on top, so the tower is **taller and persists**. A **wrong** note makes the top block **wobble and topple off** with a gentle descending "aw" (NOT a buzzer, NOT game-over); the song shrinks by one and is re-sung from the bottom — **slower after 2 misses** — so a 4yo never gets stuck (never below the 2-block base). The tower at minute 3 is a visible record of how far the child's memory reached. This is the **right/wrong-consequence half** of the JURY's #2 provocation ("break the kids recipe — a piece with memory or consequence where the child can make something *wrong* and fix it"); cycle 308's `311-kids-music-box` took the *persistence* half, and `313` is the only one of this fire's three explorers that **breaks the over-represented Canvas2D-creature-with-pads form** (the consequence is architectural/spatial, not a creature reacting). Subsystems (≥3): (1) an **always-safe Web Audio engine** (`audio.ts`) — warm mallet/marimba voices (sine + bright triangle-octave partial), a soft landing thud, a topple "aw" (triangle gliding 330→160 Hz), a soft always-on G/D-fifth pad, a synthesized `ConvolverNode` reverb (no files), all through a `DynamicsCompressor` brick-wall limiter + modest 0.5 master so dense stacking stays safe for small ears; (2) a **Canvas2D `TowerScene`** (`tower.ts`) with a small block-physics model (settle / gravity / topple / sway / shimmer); (3) the **growing-sequence game state machine** (demo → yourTurn → celebrate) with per-tap match-detection and the generous miss/shorten/slow-re-sing logic. Scale: **G-major tetrachord G·A·B·D** (from the G-major hexachord; growth notes drawn only from the 4 playable tiles so every appended note is echoable) — deliberately **NOT C-major-pentatonic** (banned this cycle). No-reading: color-tiles, a pointing-finger turn cue, a 🧱-count for the grown-up. Degrades for the 06:30 phone review: sings its starting tower on Start hands-free; no Web Audio → `text-rose-300` notice, the tower still builds and animates silently. **Ambition 3/5**: ≥3-subsystems(#2) + named-reference(#3, **Simon** Milton Bradley 1978 + classic block/stacking toys + **JMIR Serious Games 2026** process-over-pass/fail) + recent-research(#5, RESEARCH §310). **Diversity** dodges every banned tag (touch INPUT not phone-motion · Canvas2D-block-TOWER OUTPUT not raw-WebGL2-fragment-shader and not creature-with-pads · memory→persistent-stacking-with-topple-consequence FORM not the no-fail-noodle · G-major-tetrachord not C-major-pentatonic). Winner of a **WIDE** 3-explorer kids fire; siblings `312-kids-sing-back` (literal Simon-grows echo-singing, creature "Pip") + `314-kids-echo-duet` (Continuator/MIROR reflexive duet, the "it remembered!" motif-weave) build-explored and banked in IDEAS. Kids · zero new deps · zero API route · no guard · 5.29 kB. Born from RESEARCH §310. **Build-verified, not browser-verified** — unverified: tap-to-sound latency on a real device, whether the settle/topple physics *feel* right at 60 fps on a phone, iOS/Android AudioContext resume, reverb loudness on real speakers.
  Design notes: `src/app/dream/313-kids-tone-tower/README.md`

---

## Previously newest (Cycle 309 — adult · DEEP-continue, solo — multi-cycle thread #3 → cycle 2)

- **[/dream/308-orbit-choir](/dream/308-orbit-choir)** — Orbit Choir **(cycle 2: now sung by Karel's own album)**. `demoable`
  **The spatial thread, deepened with Karel's real *Welcome Home* piano — the first time the "use your actual music" directive has reached the lab's non-screen spatial layer.** Cycle 1 was a synthesised resolving chord; **cycle 2 replaces the seven synth voices with Karel's actual recordings**, fetched live from the public `/api/featured` (lists his featured album's track recording-ids) → `/api/audio/[id]` (returns a signed URL per track) — the same anon, no-auth path the loved `227-paths-granular`❤️ / `163-paths-visualizer`❤️ use. Each recording becomes one HRTF-panned voice scattered around your head, **detuned (`playbackRate` ≈ ±½-semitone) and dark (low `lowpass` cutoff)** — a blurred, distant cluster of his own music; over the ~6-minute arc each one **orbits inward, sharpens (cutoff opens), and settles to true pitch (`playbackRate → 1.0`)**: you literally gather his album into a clear room around your head, a head-tracked **spatial *Forty Part Motet*** of his own piano. **Two lab-firsts shipped alongside:** (1) **haptics** — `navigator.vibrate` pulses a 26 ms buzz the instant a voice *you are facing* locks home, and a triple-pulse when the whole room resolves (the lab's first haptic output in 300+ prototypes); (2) **persistence** — how far you'd gathered the room is saved to `localStorage`, so returning reads *"Return to the room · your room was N% gathered"* and the arc **resumes where you left it** ("Begin again" deliberately re-scatters). Still wear **headphones** (binaural HRTF). Graceful fallback is load-bearing: if `/api/featured` is unreachable or no track decodes (offline / private preview / CDN block), it reverts to the **original synthesised resolving-chord choir** and the top label says which source is playing. Subsystems (≥3): DeviceOrientation head-tracker + an N-voice HRTF panner scene of looping `AudioBufferSource`s + a synthesized `ConvolverNode` reverb + the 360 s azimuth/sharpen/playbackRate **convergence state machine** + the featured-album fetch/decode pipeline + localStorage room-memory. **Ambition 4/5**: never-used-technique(#1 — first haptic output + first real-stem source on the spatial layer) + ≥3-subsystems(#2) + named-reference(#3 — **Janet Cardiff *The Forty Part Motet* 2001**, on tour MIMOCA/NGC 2026; La Monte Young *Dream House*; Pauline Oliveros) + multi-cycle(#4 — thread #3, cycle 2). **Diversity**: stays on the non-screen adult-spatial axis (output is audio, screen a footnote) — dodges the JURY's banned raw-WebGL2-shader / phone-motion-noodle-kids / pentatonic tags. **Directly discharges JURY 2026-06-04 provocation #1** ("Deepen 308 with Karel's real *Welcome Home* piano stems — do NOT ship a sixth sensor-noodle … the standing 'use his actual music' directive has *never* reached the spatial layer"). Born from RESEARCH §307/§309. Adult · zero new deps · zero API route created · no guard (read-only GETs) · 5.35 kB. **Build-verified, not browser-verified** — unverified: whether 7 simultaneous piano recordings, spatially separated + only-the-faced-one-bright, read as a coherent "listening room" vs. mush; whether `/api/featured` returns a usable Welcome Home album in prod (fallback covers the no); the haptic + resume feel on a real phone.
  Design notes: `src/app/dream/308-orbit-choir/README.md`

---

## Previously newest (Cycle 308 — kids build · WIDE, 3 explorers)

- **[/dream/311-kids-music-box](/dream/311-kids-music-box)** — Kids Music Box. `demoable`
  **For kids (4+) — the lab's first kids piece that REMEMBERS across sessions.** A slowly-spinning 3D music-box **cylinder** the child studs with pins to *compose* a looping tune; a fixed glowing **comb** at the front plucks each pin as it rolls past. Tap a slot on the front face → a colored pin pops up and sings on its next pass; tap again to remove it. The pattern **persists to `localStorage`**, so the loop keeps playing while the child rearranges it and **the box remembers the tune even after you close and reopen it** — a little machine the child builds, not a momentary forgettable wash. This is the **direct answer to the JURY's #2 provocation** ("break the kids recipe — ship a piece with memory or consequence, where *what they did persists and grows*; five straight kids fires were a sensor wired to a no-fail modal noodle"). It also breaks the **Canvas2D-creature-with-pads pattern** its two WIDE siblings shared, and is the only candidate whose output is a **3D physical-object metaphor** (three.js) rather than a full-screen shader or a flat creature. Subsystems (≥3): (1) a **Karplus-Strong** plucked-string engine (`ks-audio.ts`) — one KS-rendered `AudioBuffer` per pitch (filtered noise burst → tuned delay line with lowpass-averaging feedback → attack/release envelope), fired as cheap `BufferSource`s through a synthesized `ConvolverNode` reverb + a `DynamicsCompressor` brick-wall limiter + modest master gain (0.55) so dense patterns stay safe for small ears; (2) a **three.js / @react-three/fiber** 3D scene (`cylinder.tsx`) — rotating wooden barrel with brass caps, a color-coded comb, raised pin studs that "pop" + glow when plucked, and a front-face-only invisible hit-grid kept in lockstep with the body via a shared rotation ref (back-face taps rejected by surface-normal·camera test); (3) a per-frame **step-sequencer clock** — the comb-step is sampled each frame and any pins at that step pluck; (4) **localStorage persistence** (`store.ts`) with try/catch degrade + a seed tune so the box is already singing at a glance. Scale: **D Lydian hexachord** (D E F# G# A B — the raised-4th sparkle), bright + consonant, explicitly **NOT C-major-pentatonic** (banned this cycle). No-reading: colors are the notes, the studs the child taps ARE the melody, a tiny caption is for the grown-up. Degrades for the 06:30 phone review: auto-spins a seeded tune on Start; no WebGL → `text-rose-300` notice; no Web Audio → notice, box still spins. The curating fire **fixed a real pluck-alignment bug** (comb angle was a quarter-turn off the visible comb) + two TS `Float32Array<ArrayBuffer>` generic mismatches before validating. **Ambition 3/5**: ≥3-subsystems(#2) + named-reference(#3, **Swiss cylinder musical box** c.1796 Geneva + **Karplus-Strong** 1983) + recent-research(#5, RESEARCH §308 — reflexive interaction / Pachet *Continuator* + Addessi *MIROR*: carry the kids experience on memory, not a no-fail bed). **Diversity** dodges every banned tag (touch INPUT not phone-motion · three.js 3D-object OUTPUT not raw-WebGL2-fragment-shader · persistence/sequencer FORM not the no-fail-noodle · D-Lydian not C-major-pentatonic). Winner of a **WIDE** 3-explorer kids fire; siblings `309-kids-echo-duet` (Continuator/MIROR call-and-response duet) + `310-kids-sing-back` (Simon-grows memory game with real-but-kind right/wrong) build-verified and banked in IDEAS. Kids · zero new deps · zero API route · no guard · 4.74 kB. Born from RESEARCH §308. **Build-verified, not browser-verified** — unverified: KS timbre by ear (brightness/damping per row), tap accuracy + felt pluck timing on a real touch device, and three.js disposal across an unmount in a live session.
  Design notes: `src/app/dream/311-kids-music-box/README.md`

---

## Earlier (Cycle 307 — adult build · DEEP, 2 approaches — Orbit Choir cycle 1, superseded above)

- **[/dream/308-orbit-choir](/dream/308-orbit-choir)** — Orbit Choir (cycle 1, synth voices). `demoable`
  **The lab's FIRST audio-first / non-screen spatial piece** — and its first HRTF spatial-audio output + first `DeviceOrientation`-as-listener-rotation in 300+ prototypes. **Wear headphones.** Near-black screen; tap *Begin the orbit* (one tap resumes the AudioContext + requests iOS motion permission). Seven sustained HRTF-panned voices start **scattered around your head and detuned into a soft cluster**; over a **6-minute** eased scheduler they **orbit inward to an even ring AND glide into a warm A natural-minor add9 / stacked-fifth chord** — so the spatial field and the harmony resolve *together* and the room is audibly different at minute 6 than minute 0 (long-form / stateful, not a loop). **Turn your phone (or your head):** `DeviceOrientation.alpha` rotates the `AudioListener`; the voice you face swells **and** its personal resolution is nudged forward — so you *shepherd voices home* and shape the pace of the convergence. The core gesture is load-bearing science, not decoration: generic Web-Audio HRTF is notoriously front/back-ambiguous, and **active head movement is the known fix** (RESEARCH §307 / arXiv:2510.09161) — turning is what makes the cheap generic HRTF legible. Three+ subsystems: (1) DeviceOrientation head-tracker (modern `forwardX/Z`+`positionX/Y/Z` AudioParams AND legacy `setOrientation`/`setPosition` both feature-detected for Safari/old-Chrome); (2) a 7-voice HRTF panner scene — each voice 2-3 sine `OscillatorNode`s + breathing-LFO gain → lowpass → its own `PannerNode panningModel="HRTF"`; (3) a synthesized `ConvolverNode` reverb (decaying filtered-noise impulse, no audio files); (4) a 360s azimuth+pitch **convergence state machine**. Degrades for the 06:30 phone review: no sensor / desktop → pointer-drag + arrow-keys + a hands-free **auto-tour** that demos itself; no Web Audio → `text-rose-300` notice. Faint violet **orbital-map** canvas (listener at center, facing marker, dim voice-dots drifting together) + a thin progress ring with `M:SS — scattered→drifting in→gathering→almost home→resolved` + a "Begin again" hold state — the screen is a footnote by design. **Ambition 4/5**: never-used-technique(#1, first HRTF output + first DeviceOrientation listener-rotation) + ≥3-subsystems(#2) + named-reference(#3, La Monte Young *Dream House* · Éliane Radigue · Pauline Oliveros *Deep Listening*) + recent-research(#5, §307/§295). **Diversity** executes JURY #5 head-on — the FIRST build whose **output is not a screen visualizer** (pure spatial audio); dodges the banned kids-vibe / tilt-screen-object input / matte-canvas+three.js output / pentatonic tags. **Winner of a DEEP 2-approach fire**; the faithful fixed-room sibling `307-still-room` (Pauline Oliveros *Deep Listening*, 7 fixed-bearing voices, turn-to-tune-in) was build-verified and banked in IDEAS as the calmer companion. Directly discharges the JURY's standing provocations #3 ("ship the spatial breadth banked-but-never-shipped — ZERO of 3 spatial pieces had shipped") + #4 (build §295's un-spent head-tracked shelf) + #5 (ban the audio→visual driver). Adult · zero new deps · zero API route · no guard · 3.92 kB. Born from RESEARCH §307. **Build-verified, not browser-verified** — unverified: whether generic Web-Audio HRTF externalizes convincingly on a real phone + headphones (the whole bet), whether the 6-min arc reads as "arrival" vs. a slow wash, and the shepherding feel.
  Design notes: `src/app/dream/308-orbit-choir/README.md`

---

## Earlier (Cycle 306 — kids build · WIDE, 3 explorers)

- **[/dream/306-kids-rain-shaker](/dream/306-kids-rain-shaker)** — Rain-Shaker. `demoable`
  **For kids (4+).** Hold the phone and **shake it like a rainstick or maraca** — gentle shakes make a soft trickle of beads, bigger shakes tumble a warm rain down the screen and each strong shake-peak strikes a **D-Dorian** bell. An always-on pad keeps it alive; no fail, no timer, no score. This is the lab's **first `devicemotion`/accelerometer input** — distinct from the `deviceorientation` *tilt* (303) and *heading* (290): it reads shake-ENERGY, not orientation. Three subsystems: (1) `shake.ts` — `accelerationIncludingGravity` → per-axis running-average **high-pass** (removes gravity) → magnitude → smoothed shake-energy envelope → threshold "hit" events (~130 ms refractory); every input path (motion / pointer-shake / auto-demo) feeds the IDENTICAL detector; (2) `rain-audio.ts` — a soft D-Dorian pad + a rainstick trickle of filtered-noise bead grains (density ∝ energy) + FM bell chimes struck on hits (panned, lowpassed), all through a `DynamicsCompressor` brick-wall limiter so vigorous shaking can NEVER blast (matters more here than anywhere); (3) `rain-gl.ts` — raw WebGL2 (hand-written GLSL ES 3.00), a dark→dawn gradient that warms with energy + up-to-600 soft point-sprite rain beads in **matte premultiplied alpha-over** (the non-additive house style — switched from the builder's additive blend during curation to respect the JURY's anti-glow ban) + warm glow blooms on each bell. Degrades for the 06:30 phone review: iOS `DeviceMotionEvent.requestPermission()` inside the Start tap; denied/no-sensor → pointer-shake + a hands-free auto-demo that rains by itself; no WebGL2 → rose notice, audio plays on. **Ambition 3/5**: never-used-technique(#1, devicemotion shake-energy) + named-reference(#3, rainstick/maraca) + recent-research(#5, RESEARCH §306 — CHI 2026 movement-sonification). **Diversity** dodges every standing JURY ban: devicemotion INPUT (not touch), raw-WebGL2 matte OUTPUT (not three.js, not matte-Canvas2D, not additive), shake-energy TECHNIQUE (not pentatonic-poke), D-Dorian (not pentatonic). Winner of a **WIDE** 3-explorer kids fire; siblings `304-kids-clap-band` (clap→onset-detection layered groove, Steve Reich *Clapping Music*, D-Mixolydian) + `305-kids-blow-sail` (blow→Wiener-entropy breath sailing, C-Lydian) build-verified and re-banked in IDEAS. Kids · zero new deps · zero API route · no guard · 7 kB. Born from RESEARCH §306. **Build-verified, not browser-verified** — unverified: shake threshold/scale *feel* on a real phone, the auto-demo cadence, point-size across GPUs.
  Design notes: `src/app/dream/306-kids-rain-shaker/README.md`

---

## Older (Cycle 305 — adult build · DEEPEN, Mirror-Canon cycle 2)

- **[/dream/302-mirror-canon-round](/dream/302-mirror-canon-round)** — Mirror Canon (Round ⇄ Phase). `demoable`
  **Cycle 2 of the lab's Mirror-Canon thread (a deepening of the standout `287-mirror-choir`).** The piece is otherwise unchanged — conduct a four-voice round sung by past versions of yourself, in a matte wooden mirror — but it now has a **Round ⇄ Phase mode toggle** that folds in the banked sibling `301-mirror-canon-phase`'s engine rather than shipping a separate piece. In **Round** mode every committed past-you enters offset on one locked bar grid (a true canon, no drift). Flip to **Phase** and each voice's loop is stretched by `(1 + n·0.012)`× the bar and clocked from its own commit time — **Steve Reich's *Piano Phase*** — so the past-yous gradually slip in and out of phase with one another and **the round literally never repeats** (genuinely different at minute 2 than at second 5). A live **drift HUD** shows each voice's loop position as a tinted marker: in Round they hold their fixed offsets, in Phase they slide apart. Both modes share the same record/commit, conduct (mute/solo), ghost-fallback (auto-commits two voices so it demos itself with no camera), and Rozin wooden-mirror render. This advances the lab's **2nd genuine multi-cycle thread** to its planned cycle 2 — the direct answer to the JURY's #1 standing provocation ("stop shipping orphans; pick ONE thing and deepen it over 2–3 cycles"). **Ambition 2/5**: multi-cycle-commitment(#4) + named-reference(#3: Steve Reich *Piano Phase*, atop 287's Rozin/round/Frippertronics lineage). **Diversity**: a deliberate **continue-a-multi-cycle-build** (the mandate's explicit carve-out); the NEW axis carrying the gate is the phasing TECHNIQUE, and INPUT (camera/body) · VIBE (adult/embodied) still dodge the standing banned touch/three.js/pentatonic-poke. Adult · zero new deps · zero API route · no guard · 7.51 kB (was 6.89). Born from cyc303's banked sibling + RESEARCH §303. **Build-verified, not browser-verified** — unverified: the *feel* of the drift rate (`PHASE_DRIFT` 0.012) on real hardware, whether the phase cloud reads as "my selves slipping apart" vs. a wash, and (carried) MediaPipe CDN reliability + formant intelligibility at 4 stacked voices.
  Design notes: `src/app/dream/302-mirror-canon-round/README.md`

---

## Previous (Cycle 304 — kids build · WIDE, 3 explorers)

- **[/dream/303-kids-wind-harp](/dream/303-kids-wind-harp)** — Kids' Wind-Harp. `demoable`
  **Tip the world.** Hit one big button, then **tilt your phone or iPad** — gravity swings a row of seven glowing strings like a wind-harp, and any string that swings far enough **plucks itself and sings**. The child plays music by *tipping the world*, hands-free, no tapping, no reading, no way to lose. The lab's **first tilt-input piece since the loved `83-kids-tilt-rain`**, and a deliberate pull on three of Karel's loved prototypes (`83-kids-tilt-rain`❤️ tilt, `105-pluck-field`❤️ Karplus pluck, `140-kids-string-bridge`❤️ playable strings). Two genuinely **fresh-for-this-lab techniques** coupled into one toy: (1) **Verlet-integration string physics** — each of the 7 strings is a 14-node mass-chain solved with Verlet + distance-constraint relaxation (3 passes/frame) on a **fixed 120 Hz step**; the device-tilt `deviceorientation` β/γ becomes a **gravity vector**, so tipping the tablet literally changes which way "down" is and the hanging strings swing and settle with believable physical motion; (2) **Karplus-Strong plucked-string synthesis** (Karplus & Strong, 1983) — when a string's midpoint swing crosses a threshold it plucks: a noise burst rendered offline through a tuned, lowpass-fed delay line into an `AudioBuffer`, bigger swing → louder + brighter + longer, per-string refractory so it never machine-guns, stereo-panned low→high across the row. Three subsystems → one pipeline (physics + synth + a hand-written **raw WebGL2** ribbon renderer — matte alpha-over string curves expanded along their normals on a soft breathing dark gradient, a glow flash on each pluck, **no additive bloom, no three.js**). The 7 strings are tuned to a warm **D-Dorian** scale (D E F G A B C — explicitly **NOT** C-major-pentatonic), with an ambient D+A drone underneath and a `DynamicsCompressor` limiter so a fistful of simultaneous plucks can never blast. Degrades at every step so it's **fully playable on a desktop with no sensors**: iOS 13+ `DeviceOrientationEvent.requestPermission()` is called inside the Start gesture (denial → readable `text-rose-300` note + auto-fallback); **pointer-drag** tilts the gravity vector on desktop; and a **2 s auto-sway** kicks in when no tilt events arrive so the harp **plays itself** and a 4-year-old (or Karel at 06:30) always sees cause→effect. Winner of a **WIDE** 3-explorer kids fire; the two siblings — `299-kids-clap-band` (clap → HFC-onset-detection layered groove, Steve Reich *Clapping Music*) and `300-kids-blow-sail` (blow → Wiener-entropy breath-envelope sailing) — are build-reviewed and re-banked in IDEAS.md. Chains from RESEARCH §304 (*Rhythm in the Air*, arXiv:2511.00793, Nov 2025 — embodied motion → scale-constrained musical output). **Ambition 2/5**: never-used-technique(#1: Verlet rope physics — 0 prior INDEX/README hits) + named-reference(#3: Aeolian harp; Karplus-Strong 1983). **Diversity** (dodges the standing banned touch/three.js/matte-Canvas2D/pentatonic-poke): INPUT=device tilt · OUTPUT=raw-WebGL2 ribbons · TECHNIQUE=Verlet physics + Karplus-Strong · VIBE=kids/calm/modal. For kids 4+ · zero new deps · zero API route · no guard. **Build-verified, not browser-verified** — unverified surface: the deviceorientation→gravity *feel* and pluck threshold on a real tilting hand, the iOS permission branches, and the rendered look of the ribbon strips (no sensors/GPU in the sandbox).
  Design notes: `src/app/dream/303-kids-wind-harp/README.md`

---

## Previous (Cycle 303 — adult build · DEEP, 2 approaches)

- **[/dream/302-mirror-canon-round](/dream/302-mirror-canon-round)** — Mirror Canon. `demoable`
  Shipped cycle 303 as **cycle 1** of the Mirror-Canon thread (camera/body → D-Dorian formant choir → stacked-round canon-memory engine → matte Rozin wooden-mirror; a multi-cycle deepening of the JURY-standout `287-mirror-choir`). **Deepened cycle 305 — see the ⭐ Newest entry above** (added the Round ⇄ Phase / Steve Reich *Piano Phase* mode toggle + drift HUD).
  Design notes: `src/app/dream/302-mirror-canon-round/README.md`

---

## Previous (Cycle 300 — kids build · WIDE, 3 explorers)

- **[/dream/295-kids-shadow-dance](/dream/295-kids-shadow-dance)** — Kids' Shadow Dance. `demoable`
  **Stand back, hit one big button, and *dance with your whole body* — wherever you move, a dusk meadow blooms, leaves glowing light-trails, and sings. Nothing to tap, no way to be wrong; the only instruction is *move*.** The lab's **first kids whole-body / camera piece** — it answers the 2026-06-03 jury's #2 provocation head-on ("ban touch for kids; make the child *move* or *sing*, not poke") and escapes the C-pentatonic rut Karel flagged (it's tuned to **G-Lydian**, not pentatonic). On **Start dancing** it requests the camera and runs **frame-difference optical-flow** with **zero dependencies, no MediaPipe, no skeleton**: each frame is drawn to a tiny **32×24** offscreen canvas, per-cell Rec.601 luminance is differenced against the previous frame (noise-gated + lightly smoothed) → a **motion field** robust to a constantly-wiggling 4-year-old. That field is summarised to three numbers — `energy` (total motion), `heightY` (centre-of-motion height), `spawn` (hot-cell count) — and packed into an **RG8 texture** (R=motion, G=silhouette luma). Three subsystems feed one pipeline: (1) the motion-field analyser; (2) a **raw WebGL2 `#version 300 es`** two-pass renderer — a **ping-pong RGBA8 framebuffer trail-accumulation** pass (`newTrail = max(oldTrail·decay, freshMotion)`) so motion leaves glowing light-trails, then a dusk sky→meadow scene shader with blooms from hot cells, swaying grass, quiet stars, and a faint low-res **self-silhouette composite** (a cool glowing presence, never a hard cutout, mirror-flipped so it reads like a mirror); (3) a fully-synthesised **Web Audio** ensemble — a breathing pad always underneath plus triangle+octave bloom voices on a **three-octave G-Lydian** scale (Lydian's raised 4th = floaty dusk, every note consonant), with `energy` → pad swell + lowpass opening + denser blooms + occasional stacked harmonies, `heightY` → register, `spawn` → bloom count, all through a soft lowpass + `DynamicsCompressor` limiter so it can **never** get harsh however wildly the child dances. Camera is **analysis-only** — frames are reduced to motion numbers and discarded, never recorded or sent (no network, no API route, no guard). Degrades at every step: **no camera / denied** → a hand-authored **ghost dancer** (a soft blob that figure-eights, jumps, and flails) drives the *identical* motion-field→AV pipeline so it's fully demoable and never silent (amber notice); **no WebGL2** → readable rose notice and the music keeps playing. WIDE winner over two banked siblings — `294-kids-voice-garden` (sing a garden into bloom, autocorrelation pitch-detection + sing-back memory) and `296-kids-firefly-tilt` (tilt a firefly to wake stars; the sky remembers your path and replays it as a lullaby) — both build-verified, full specs in IDEAS.md. Chains from RESEARCH §300 (CHI 2026 movement-sonification workshop) + recent-research IDEAS seed. **Ambition 3/5**: ≥3-subsystems + named-reference + recent-research. **Diversity** (dodges the jury's banned touch/three.js/matte-Canvas2D + the pentatonic rut): INPUT=camera/whole-body · OUTPUT=raw-WebGL2 trail-meadow · TECHNIQUE=frame-difference optical-flow motion-field · VIBE=kids/dusk/embodied. References: **Émile Jaques-Dalcroze, *Eurhythmics*** (music through whole-body movement); **Myron Krueger, *Videoplace*** (1985, foundational full-body video interaction); **Frid & Bresin**, interactive sonification of children's movement (*Frontiers in Neuroscience*, 2016). For kids 4+ · zero new deps · zero API route · no guard · 7.08 kB. Build-verified, not browser-verified.
  Design notes: `src/app/dream/295-kids-shadow-dance/README.md`

---

## Previous (Cycle 298 — kids build · WIDE, 3 explorers)

- **[/dream/293-kids-sky-band](/dream/293-kids-sky-band)** — Kids' Sky Band. `demoable`
  **A tiny band that plays the *real sky outside your window right now* — so it sounds a little different every day, because the weather is real.** The lab's **FIRST kids real-world-data piece** and **first weather source** (prior real-world pieces — 279 earthquakes, 288 aurora — were adult/cosmic). On Start it fetches live conditions from keyless, CORS-open **Open-Meteo** via `navigator.geolocation` (3s timeout → San Francisco fallback → bundled `SAMPLE_WEATHER` if offline), then drives a four-voice **C-major-pentatonic** ensemble (no wrong notes) through a `DynamicsCompressor` limiter: **Sun** = warm bell (higher/brighter by day, from `temperature_2m`+`is_day`), **Cloud** = soft sine pad whose level+lowpass tracks `cloud_cover`, **Wind** = filtered-noise whoosh on an LFO from `wind_speed_10m`, **Rain** = gentle pentatonic plinks whose density follows `precipitation`; tempo nudged by temperature; a 12-min lullaby fade. The sky itself is a **single raw WebGL2 `#version 300 es` fragment shader** (one full-screen quad) fed the *same* live numbers: gradient dawn/day/dusk/night palette from `is_day`+temp, fbm clouds at `cloud_cover`, a sun/moon disc with a distance-field smiley face, rain streaks, wind-driven drift, twinkling night stars. **Plays fully hands-free** — the jury banned touch input for this kids cycle, so there's nothing to poke (tapping a sky-friend to solo it is an optional bonus). Starts instantly on the bundled sample, swaps to live data when it resolves, and degrades at every step (no geo → SF · no network → sample + amber notice · no WebGL2 → audio-only + readable rose notice). WIDE winner over `294-kids-voice-garden` (sing→bloom) + `295-kids-shadow-dance` (dance→bloom), both banked in IDEAS. Born from RESEARCH §298 (DATASONICA 2026 award; RIT Weather Chimes Apr 2026). Ref: **John Luther Adams, *The Place Where You Go to Listen*** (Museum of the North, Fairbanks); Open-Meteo. For kids 4+ · real-world-data input (hands-free) · raw-WebGL2 fragment-shader output · zero new deps · zero API route · no guard · 7.73 kB.
  Design notes: `src/app/dream/293-kids-sky-band/README.md`

- **[/dream/286-kids-jelly-choir](/dream/286-kids-jelly-choir)** — Jelly Choir. `demoable`
  **Five wobbly candy-colored jellies with googly eyes sit in a row — poke one (or drag it) and it stretches, springs back, and *sings its own wobble*; poke two at once and they harmonize.** The lab's **first mass-spring / Verlet soft-body → audio** instrument. Each jelly is a ring of 14 point-masses held in a circle by **radial** springs (each point → center) and **structural** springs (each point → its neighbors); poke a point and **Verlet integration** carries your velocity, so on release the blob overshoots and wobbles back — real soft-body physics, not a canned animation. **The sound *is* the wobble**: every frame we measure the jelly's *deformation energy* (mean stray of each surface point from its rest circle) and that one number drives the voice — **energy² → loudness** (silent at rest), **energy → low-pass brightness**, **energy → vibrato depth + rate** — so the shimmer tracks the jiggle in real time. **Tuning = just intonation** (1/1, 9/8, 5/4, 3/2, 2/1 over a 196 Hz G3 root): consonant *pure* intervals, deliberately **not** C-major pentatonic, so poking two jellies rings out a clean justly-tuned interval with a soft glowing thread drawn between them. **Output = inline animated SVG** (Catmull-Rom blob bodies → cubic Béziers, Gaussian-blur candy glow, eyes as an HTML overlay, a mouth path that opens with energy) — **no `<canvas>` anywhere**, so it dodges the canvas2d 5× ban and is the lowest-risk render path for a 06:30 demo on any device. Multi-touch (two kids, two hands); always-on root+fifth drone so it's never silent; `AudioContext` created on first poke (mobile autoplay), and the jellies still wobble silently if audio can't start. **Resurrected from the cycle-292 WIDE physical-modeling fire** (it was the `kids-jelly-choir` sibling, build-verified then banked); born from RESEARCH §292. References: **nlm: Real-Time Non-linear Modal Synthesis in Max, arXiv 2603.10240 (2026)**; **Provot, *Deformation Constraints in a Mass-Spring Model* (1995)**; **Müller et al., *Position-Based Dynamics* (2007)**. For kids 4+ · touch (poke/drag) input · inline-SVG output · zero new deps · zero API · no guard · 3.57 kB.
  Design notes: `src/app/dream/286-kids-jelly-choir/README.md`

---

## Previous (Cycle 293 — adult build · solo)

- **[/dream/285-mosaic-listener](/dream/285-mosaic-listener)** — Mosaic Listener. `demoable`
  **Press Begin, then drag your finger across a glowing map of sounds — the piece is re-assembled in real time out of whichever grains sit nearest your finger, music made of shards and never the original recording.** The lab's **first concatenative-synthesis / audio-mosaicing piece** in 280+ prototypes: where everything else reacts to or synthesizes sound, this one takes an existing recording, **shatters it into hundreds of ~165 ms grains**, tags each with three descriptors — **loudness** (RMS), **brightness** (spectral centroid via a 256-pt Hann DFT), and a rough **pitch** (zero-crossing, for hue) — and lays them out as a 2-D **descriptor atlas** (x = brightness, y = loudness, color = pitch class). A target wanders the atlas; you **drag** to place it (CataRT's "play the cloud by hand"), let it **auto-drift** along a slow Lissajous (the self-playing demo), or **hum into the mic** so your voice's live brightness+loudness becomes the target. A Chris-Wilson look-ahead scheduler fires ~6–9 grains/sec, finding the **k≈6 nearest grains** and picking one at random (organic, not robotic), windowed (12 ms attack / 60 ms release) through lowpass → feedback-delay wash → limiter; the chosen grain lights up and a trail draws your path. **Corpus = Karel's real piano**: type a **Welcome Home** track ID and *Use Karel's piano as the corpus* → read-only `fetch("/api/audio/:id")` (the loved `163`/`227` pattern), decode, re-slice — so the shards are literally his playing (non-pentatonic by source). **Output is matte WebGL2** (Canvas2D was banned this cycle at 5×; the 2026-06-02 jury hard-banned additive/glowing point clouds) — raw `GL_POINTS` with **normal premultiplied-alpha blending**, soft matte dots on near-black, recently-played grains brighten modestly with **no additive glow**. Degrades gracefully: a **procedural piano corpus** is synthesized on Begin so it always runs with no network/no key/no permission; track-load failure falls back with an amber notice; mic-block → drag/drift with a rose notice; no-WebGL keeps the audio mosaic playing. **Born from this cycle's research dive** (RESEARCH §293). References: **Diemo Schwarz — CataRT** (interactive corpus-based concatenative synthesis, IRCAM); **"The Concatenator," arXiv 2411.04366 (2024)**; **Lee & Pasquier, "Musical Agent Systems: MACAT and MACataRT," arXiv 2502.00023 (2025)**; **FluCoMa** (live web audio mosaicing). Adult · drag / mic / auto-drift input · matte WebGL2 output · reads `/api/audio` only · no guard · zero new deps · 6.28 kB.
  Design notes: `src/app/dream/285-mosaic-listener/README.md`

---

## Previous (Cycle 292 — kids build · WIDE orchestration, 3 explored)

- **[/dream/284-kids-thunder-drum](/dream/284-kids-thunder-drum)** — Thunder Drum. `demoable`
  **Strike a big drum *skin* anywhere with a finger — hit the center for a deep round boom, the rim for a bright slap, and hit it *hard* to hear the head's tension bend the pitch up before it settles (the "bwooOOWww" of a thunder-drum / tympani).** This is the lab's **first playable physical-modeling / non-linear modal-synthesis instrument** in 280+ prototypes. Every other kids toy plays a Karplus pluck, a triangle bell, or an additive sine locked to **C-major pentatonic**; here the pitches are **circular-membrane eigenmodes** — the Bessel-zero ratios `[1.0, 1.594, 2.136, 2.296, 2.653, 2.918, 3.156, 3.5] × f0`, inharmonic and **non-pentatonic by physics**, with higher modes decaying faster so it rings like a struck skin, not a glockenspiel. **The signature is the tension pitch-glide**: a hard/fast strike starts all partials up to **+6% sharp** then exponentially relaxes them to rest pitch over 120–260 ms via `setTargetAtTime` — the non-linear behavior straight from this cycle's research anchor. **Strike position is timbre**: a tap radius (0=center → 1=rim) reweights the partial bank — center hits dark and round, edge hits bright and slappy. Four drum zones sit on a just-intonation spread (1/1·4/3·3/2·2/1 over a 110 Hz root) so zones are consonant yet unmistakably not a pentatonic toy. **Visual = three.js** (hard non-canvas2d constraint this cycle): a tilted `CircleGeometry` skin whose vertices are displaced by a **travelling, rim-pinned radial standing-wave ripple** from each contact point (multi-strike = overlapping ripples), bold saturated color per zone, expanding glow rings, a soft always-on drone so it's never silent, multi-touch via Pointer Events; no WebGL → a readable `text-rose-300` notice. **Born from this cycle's research dive** (RESEARCH §292) — real-time physical-modeling synthesis — and the deepest answer yet to the standing JURY "audit the SOUND" mandate (it diversifies the *synthesis method*, not just the scale, going beyond the recent tuning-only breaks at `272`/`276`/`280`). References: **nlm: Real-Time Non-linear Modal Synthesis in Max, arXiv 2603.10240 (2026)**; **Lord Rayleigh, *Theory of Sound* (1877)** (circular-membrane Bessel modes); **Morrison & Rossing** (tympani tension nonlinearity). Winner of a **WIDE** 3-builder kids fire (three physical objects × three never-used synthesis methods × three non-canvas2d outputs, all non-pentatonic); siblings `285-kids-singing-bowl` (rub the rim → **friction/stick-slip** sustain of inharmonic bell partials, three.js metallic bowl + cymatic water) + `286-kids-jelly-choir` (squish a **mass-spring/Verlet soft-body** blob → it sings its own wobble in just intonation, inline SVG) are **build-verified** (all-three build, exit 0) and banked in IDEAS.md. For kids 4+ · touch input · three.js output · zero new deps · zero API · no guard · 3.69 kB.
  Design notes: `src/app/dream/284-kids-thunder-drum/README.md`

---

## Previous (Cycle 291 — adult build · WIDE orchestration, 3 explored)

- **[/dream/283-piano-isosurface](/dream/283-piano-isosurface)** — Piano Isosurface. `demoable`
  **Tap Start and a glowing 3D form begins breathing to the music — drop an audio file, or paste a Welcome Home track id, and your real piano sculpts a living volume you can drag to orbit.** This is the lab's **first marching-cubes / volumetric isosurface** in 280+ prototypes: where every prior visual drew meshes, particles, shaders, or 2D canvas, this one **reconstructs a surface from a scalar field**. Audio → one `AnalyserNode` (fftSize 2048) → 5 frequency bands + RMS + a normalized spectral centroid → a field of ~8 **metaballs** inside a three.js `MarchingCubes(48)` volume that re-polygonizes a single connected isosurface every frame: **bass** swells a central core, **mids** orbit it at mid radius, **highs** flick small fast flecks at the edges, overall **RMS** makes the whole form breathe (global scale/isolation), and the **spectral centroid** drives material hue (cool/deep when the sound is dark → warm/bright when brilliant). Rendered with a `MeshStandardMaterial` emissive glow, two directional lights + ambient, fog, slow auto-rotation, and a hand-rolled pointer-drag orbit. **Four audio sources, never silent:** file-drop/picker (`decodeAudioData` → looping buffer) · **mic** (analysis-only, never routed to output, never recorded) · **track id** → read-only `fetch("/api/audio/<id>")` handling both JSON `{url}` and raw bytes (the loved `163-paths-visualizer` ❤️ pattern — Karel's path to feed his real Welcome Home piano) · an always-on generative **D-dorian** synth pad (non-pentatonic) so the surface is alive from the first gesture even with no input. Degrades gracefully: no WebGL → `text-rose-300` notice; mic denied / decode failure → rose notice + the pad keeps sculpting. **Born from this cycle's research dive** (RESEARCH §291): GPU isosurface extraction is now *real-time in the browser*, which is exactly what makes a sound-driven, per-frame marching-cubes surface feasible live. References: **William Lorensen & Harvey Cline, "Marching Cubes: A High Resolution 3D Surface Construction Algorithm," SIGGRAPH 1987**; the 2024 WebGPU-marching-cubes lineage (Will Usher / Twinklebear); **Refik Anadol** (sound → volumetric living form). Winner of a **WIDE** 3-builder adult fire (three orthogonal directions, none using the cycle's banned canvas2d output); siblings `281-midi-harmonograph` (a held chord draws itself as a Victorian harmonograph in raw WebGL2; JI-lock makes consonance a clean closed figure) + `282-ensemble-tabs` (open 2–3 tabs → one serverless, tempo-locked ensemble on a `Date.now()` shared clock — the lab's first networked piece) are **build-verified** and banked in IDEAS.md. Adult · audio-file/mic/track-id input · three.js Marching Cubes output · zero new deps · reads `/api/audio` only · no guard · 9.97 kB.
  Design notes: `src/app/dream/283-piano-isosurface/README.md`

---

## Previous (Cycle 288 — kids build · WIDE orchestration, 3 explored)

- **[/dream/276-kids-balloon-tritave](/dream/276-kids-balloon-tritave)** — Balloon Sky (Tritave). `demoable`
  **Tilt your tablet to drift a little paper cloud-bird through a dusk sky of cut-paper hot-air balloons — and every balloon it brushes sings in a tuning that has no octave.** This is the lab's **first non-octave / non-pentatonic tuning** in 280+ prototypes: instead of the major-pentatonic-in-12-TET that every "kid-safe" music toy leans on, the balloons are tuned to the **Bohlen–Pierce scale**, whose repeat interval is the **tritave (3:1)** — a perfect twelfth — not the 2:1 octave. It's **equal-tempered Bohlen–Pierce (13 equal divisions of the tritave)**: step ratio `3^(1/13) ≈ 1.0882` (~146¢ each), `freq(k)=220·3^(k/13)`. BP was engineered around **odd-harmonic** chords, so three balloons are deliberately seated on the signature **3:5:7 triad** (13-EDT degrees 0/6/10) — brush them together and the chord sounds *rooted*, not random; extra balloons (degrees 3/4/7 + the tritave) give melodic range. The voice is a **clarinet-like additive tone** (mostly ODD partials 1·3·5·7·9 — the clarinet's chalumeau spectrum is the natural BP timbre, and it overblows at the twelfth, not the octave) over a soft root+tritave **drone bed**, so it's consonant but genuinely *otherworldly* — "nothing sounds wrong" coming from a completely different harmonic universe. **Input = device TILT** (`DeviceOrientationEvent`; iOS permission requested on the first tap) with a mouse/drag fallback so it's fully playable on a laptop at review — a gravity-drift you steer with your hands, not taps. **Output = inline SVG** cut-paper (matte, `feDropShadow` lift + `feTurbulence` grain, animated via rAF through refs — **no canvas, no WebGL, no three.js, no glow**), continuing the loved `268-kids-shadow-theater` cut-paper register. Brushing balloons in a row plays a melody; brushing two at once plays a chord; each brush leaves a paper-confetti puff. Always-on drone (never silent), no score, no "wrong", no fail, ~14-min lullaby fade. **Born from this cycle's research dive** into non-octave tuning (RESEARCH §288). Reference: the **Bohlen–Pierce scale** — independently discovered by **Heinz Bohlen (1972)** and **Max Mathews & John R. Pierce** (Bell Labs, ~1984); composer **Elaine Walker** (ZIA). Winner of a **WIDE** 3-builder kids fire (three unrelated non-pentatonic *sound worlds*, each dodging the cycle's banned tags — touch-input, canvas2d-output, three.js, C-pentatonic); siblings `277-kids-overtone-cave` (hum → a raw-WebGL crystal grotto sings your **harmonic-series overtones** back, khoomei/Lucier) + `278-kids-dream-flock` (wave at the camera → frame-diff motion steers a boids flock singing a **whole-tone / Debussy** dream cloud) are **build-verified** and banked in IDEAS.md. For kids 4+ · tilt input · SVG output · zero new deps · zero API · no guard · 4.07 kB.
  Design notes: `src/app/dream/276-kids-balloon-tritave/README.md`

---

## Previous (Cycle 287 — adult build · DEEP orchestration, 3 explored)

- **[/dream/275-memory-loom](/dream/275-memory-loom)** — Memory Loom. `demoable`
  **Play into your mic and the piece quietly records the phrases you play, then weaves them back as an endless, ever-changing Brian-Eno / Robert-Fripp tape-loop room built entirely from YOUR own sound — audibly different at minute 10 than at minute 1.** This is the **listen → remember → rewrite** piece the JURY asked for: it extends the loved `259-paths-generative` ❤️ (its exact incommensurate-loop engine) but instead of playing back a file, it **listens**. A muted mic tap fills an 8-second rolling ring buffer; a two-threshold RMS onset/release detector marks phrase boundaries and, on phrase-end, slices the most-recent audio out of the ring, peak-normalizes it, fades the ends for loopability, and banks it as a **verbatim tape loop** — keeping the *raw audio*, not extracted features, so the room is literally made of the sound you made. Up to **7 captured phrases** loop at mutually **incommensurate lengths/playheads** (never phase-align) each with a slow incommensurate gain-LFO, a consonant `playbackRate` transposition (octave/5th/4th/M3/unison), and a stereo pan, summed through a **procedural convolution reverb** + shared lowpass + a `DynamicsCompressor` master limiter (never clips, never silent). A **generative state machine** enters a new *movement* every 60–130 s that random-walks the active set (3–5 of the bank, multi-second crossfades), the transpositions, density, filter cutoff, and reverb wetness — and as new phrases arrive the **oldest memory decays out**, so the texture at minute 10 is genuinely unlike minute 1. It's **never silent**: a synthesized **D-dorian** pad (deliberately *not* C-major pentatonic, banned by the JURY) plays from the first instant and is gradually displaced by your own captured sound. Tri-modal source — **mic** (primary) · **file-drop** · **Welcome Home track-by-ID** → read-only `/api/audio/:id` (JSON-`{url}`-or-raw-bytes, the loved `163` pattern, so Karel can feed it his real piano) · the synth demo fallback. Canvas2D **loom** makes the memory legible: each phrase is a horizontal lane with its waveform drawn in, a playhead sweeping at its own incommensurate rate, brightness = current gain, warm hue (your captures) vs amber (demo seeds), a `captured 2m ago` label, a capture-flash as a new phrase enters, and a HUD of elapsed / movement / active-voice count. **First live audio-capture looping piece in the lab** (loops existed at `172` ❤️ and granular at `227` ❤️, but never *recording you in real time into the loop bank*) and the **first self-listening / Frippertronics architecture** in 270+ prototypes. **Born from this cycle's research dive** into self-listening musical agents (RESEARCH §287). References: **Brian Eno & Robert Fripp** — *Frippertronics* / *(No Pussyfooting)* (1973) + Eno's *Music for Airports* (1978); **Pauline Oliveros** — *Deep Listening*. Winner of a **DEEP** 3-builder fire (one concept — "a piece that listens, remembers, and rewrites itself over 10 min" — three *memory representations*); siblings `mosaic-listener` (CataRT / MACataRT concatenative grain-corpus mosaicing — the lab's first concatenative synthesis) + `motif-memory` (autocorrelation pitch-transcription → symbolic Markov re-performance, the Lewis *Voyager* / Rowe *Cypher* lineage) are **build-verified** and banked in IDEAS.md. Mic/audio-file input · canvas2d output · zero new deps · zero server route (read-only `/api/audio` only) · no guard · 5.51 kB.
  Design notes: `src/app/dream/275-memory-loom/README.md`

---

## Previous (Cycle 286 — kids build · WIDE orchestration, 3 explored)

- **[/dream/272-kids-tune-purr](/dream/272-kids-tune-purr)** — Tune Purr. `demoable`
  **Slide a sleepy, wobbling creature up and down until its shivering stops — and feel the exact moment two notes lock into tune.** A contemplative tuning toy a 4-year-old can run alone (touch-only, no reading): a warm **110 Hz drone** hums, and three round, matte "hummer" creatures each sing a tone that starts a few Hz *out of tune* with a pure interval against the drone — so you literally **hear and see the beating**: a rhythmic wobble, and the creature trembles in sync with it. Drag a creature and its pitch glides; as you approach the pure **just-intonation** ratio (unison 1:1, major third 5:4, perfect fifth 3:2) the wobble slows from a fast shimmer → a slow sway → nothing, and within ±6 cents it **snaps into tune**: the shivering stops, its eyes open, it smiles, and it begins a soft contented **purr**. Lock all three at once and they form a pure **4:5:6 just-intonation major triad** with a gentle matte ring-wave celebration. Drag one back out and the wobble returns — fully reversible, no score, no fail, infinite calm play. **The whole point is the SOUND**, and it is deliberately *not* the C-major pentatonic of every other kids-music toy: it's pure acoustic beating resolving into consonance — the first time audible **interference beating is the instrument itself** in 270+ prototypes (the child resolves roughness→consonance *by ear*, pre-verbally). The visual is fully **non-luminous / matte** — deep-dusk brown background, dusty terracotta/sage/blue creatures with true `shadowBlur` drop-shadows, **zero additive blending, no glow, no three.js, no WebGL** — built to answer the JURY's "ban the glow, ban the pentatonic, audit the sound" cycle on both axes at once. Drone + creatures are alive on first touch; AudioContext unlocks on gesture; everything via `setTargetAtTime` (click-free, toddler-safe, nothing above 350 Hz); 116 px drag targets, Pointer Events + `setPointerCapture` + `touch-none`; degrades gracefully (no Web Audio → readable `text-rose-300` notice). **Born from this cycle's research dive** into the psychoacoustics of consonance — the three-term roughness model (harmonicity + dislike of fast beats + liking of slow beats). References: **Helmholtz**, *On the Sensations of Tone* (beats/roughness as the physical basis of dissonance) + **McBride 2025** roughness review (arXiv 2510.14159) + Parncutt & Hair. Winner of a **WIDE** 3-builder kids fire (three unrelated non-glow / non-pentatonic *sound worlds*); siblings `273-kids-raga-peacock` (tanpura drone + Raga Yaman in just intonation + meend glide, SVG cut-paper) + `274-kids-clay-clock` (interlocking 2:3:4 + 12/8 gankogui **polyrhythm** on a two-clock scheduler, matte clay, percussion-only) are build-verified and banked in IDEAS.md. For kids 3+ · touch input · canvas2d-matte output · zero new deps · zero API · no permissions · 3.93 kB.
  Design notes: `src/app/dream/272-kids-tune-purr/README.md`

---

## Previous (Cycle 284 — kids build · WIDE orchestration, 3 explored)

- **[/dream/268-kids-shadow-theater](/dream/268-kids-shadow-theater)** — Shadow Theater. `demoable`
  **Tap a paper animal and it walks onto a glowing lamp-lit stage and starts to sing — in the shimmering, deliberately-not-Western tuning of a Javanese gamelan.** A wayang-kulit (Indonesian shadow-puppet) theater a 4-year-old can run alone: five cut-paper animal silhouettes (bird, elephant, deer, fish, monkey) wait on a rack; tap one and it strolls onto the amber→indigo screen, sways/walks, and adds its voice; tap again and it ambles home, fading out. Several puppets at once = a tiny gamelan ensemble, all locked to a slow, calming **colotomic gong cycle** (a deep gong every 8 beats, a mid kempul every 4, footstep "kethuk" ticks) so the room is never silent and feels ceremonial. **The surprise is the sound.** The five pitches are NOT C-major pentatonic (the default of every kids-music toy) — they come from a **slendro-like set of stretched, non-equal-tempered ratios** (≈ 1.00, 1.16, 1.35, 1.52, 1.78 over 220 Hz); each metallophone voice is two slightly-detuned sine fundamentals (a few Hz apart → the characteristic gamelan *beating*/shimmer) plus an inharmonic ~2.41× partial, fast attack + long bell decay (saron/bonang character). The gong is a ~70 Hz sine with a downward glide + filtered-noise thump. **The whole visual is inline SVG** — `<path>` cut-paper silhouettes, a radial-gradient lamp backdrop, a `feTurbulence` oil-lamp flicker — animated by `requestAnimationFrame` updating SVG transforms. **No `<canvas>`, no WebGL, no three.js.** **First SVG-rendered prototype in the lab** (260+ prototypes; `svg` grepped clean) and the **first non-Western / microtonal tuning** anywhere in the lab — built to directly answer the JURY's "ban the glow, ban the pentatonic" cycle: a non-luminous output in a non-pentatonic mode. Every combination sounds good (no wrong note, no fail state); always-on `DynamicsCompressor` limiter keeps it soft + toddler-safe; degrades gracefully (no Web Audio → readable `text-rose-300` notice, SVG still animates). References: Javanese **wayang kulit** + **gamelan slendro** (Colin McPhee) and **Lotte Reiniger**'s silhouette animation (*Prince Achmed*, 1926). Winner of a **WIDE** 3-builder kids fire (three unrelated non-glow / non-pentatonic directions); siblings `kids-paper-parade` (Eric-Carle torn-paper marching band — a rhythm-layer **groove** builder) + `kids-paper-score` (a Cardew-style **graphic score** a playhead reads — your drawing performs itself) are build-verified and banked in IDEAS.md. For kids 4+ · touch input · SVG output · zero new deps · zero API · no permissions · 4.6 kB.
  Design notes: `src/app/dream/268-kids-shadow-theater/README.md`

---

## Previous (Cycle 283 — adult build · DEEP orchestration, 3 explored)

- **[/dream/267-spectral-drift](/dream/267-spectral-drift)** — Spectral Drift. `demoable`
  **Drop your own piano recording (or load a Resonance track) and your music becomes a flowing river of light you drift through — each frequency a stream of glowing particles that advects and braids forward through space as the song plays.** Not a frozen wall of spectrum bins: the spectral content *flows*. A single pool of **24,000 additive `THREE.Points`** (one `BufferGeometry` + custom soft-gaussian `ShaderMaterial`, allocated once) is emitted as a fresh "sheet" each frame at the far horizon — **bin → lateral X + hue**, **bin energy → brightness + point size + emission probability** (quiet bins emit nearly nothing, so silence reads as genuinely empty space ahead). Then every particle **advects**: it drifts forward toward the camera *and* meanders laterally through a cheap curl-like sinusoidal flow field with light damping, so the frequency streams **swirl and braid** as they travel rather than running on rigid rails. Each particle keeps the hue/energy it was born with, so you fly through a gently-deforming record of the song. **Spectral centroid** → global hue temperature (bass-heavy = deep violet/indigo; bright = cyan→rose) + flow turbulence; **spectral-flux onsets** (adaptive mean+1.5·std, 100 ms refractory) → a burst of extra-bright particles + a forward speed surge + subtle camera shake, with a median-IOI **BPM** readout; `FogExp2` into near-black for depth. **This is the flowing-particle reading of the JURY's flagged richest vein, "fly through YOUR music,"** extending the loved `243-spectral-cloud` ❤️ (the only 5/5 floor build — a cloud you *orbit*; this is a river you fly *through*) in the loved glowing-points language of `130-tsl-particle-compute` ❤️. **Born from this cycle's research dive**: it borrows the reframe from **NSTR — "Neural Spectral Transport Representation for Space-Varying Frequency Fields"** (arXiv 2511.18384, Nov 2025), that a spectrum is not a static stack but a *frequency field that transports through space* — embodied here aesthetically as the advection flow (honestly noted in the README as an artistic borrowing, not the neural model). Tri-modal source, never silent: **file drop** · **"load a Resonance track by ID"** → `fetch('/api/audio/:id')` (handles direct-audio *or* JSON `{url}`, so Karel can paste a real Welcome Home piano track — read-only, no route created) · a synthesized pad+pentatonic **demo** that flows on Start with zero input. Degrades gracefully (no WebGL → notice, audio keeps playing; decode/track-load error → `text-rose-300`). **Input = audio-file · output = three.js additive points** — dodges the over-represented `canvas2d` (4×) + `raw-WebGL` (4×) of the last 10. Winner of a **DEEP** 3-builder fire (one concept — "fly through YOUR music as a living 3D world" — three render readings); siblings `spectral-tunnel` (radial wormhole, rings freeze-on-spawn + translate in Z — the kinetic reading) + `spectral-canyon` (spectrogram-waterfall terrain with the Z-remap fix — the legible reading) are **build-verified** and banked in IDEAS.md, queued to make this vein a 4-piece body of work with `243`. Audio-file input · three.js output · zero new deps · zero server route (read-only `/api/audio`) · 4.9 kB.
  Design notes: `src/app/dream/267-spectral-drift/README.md`

---

## Previous (Cycle 282 — kids build · DEEP orchestration, 3 explored)

- **[/dream/264-kids-lenia-pond](/dream/264-kids-lenia-pond)** — Lenia Pond. `demoable`
  **Touch a dark pond and a glowing nebula creature blooms under your finger, then swims away on its own and drifts across the water, singing.** The creatures are **orbium gliders from Lenia** — Bert Chan's 2019 continuous-state cellular automaton, where a soft jellyfish-blob of "matter" self-organizes into a stable, *self-propelling* form (the Lenia equivalent of a Game-of-Life glider). A scalar field `A(x,y)` lives on a 150×150 toroidal grid (Float32 ping-pong, CPU): each step convolves with Chan's exact smooth `exp(4−1/(r(1−r)))` ring kernel (R=13) → growth bell (mu=0.15, sigma=0.017) → `A ← clamp(A+dt·G,0,1)`, dt=0.1. **Tap** stamps **Bert Chan's canonical 20×20 orbium matrix verbatim** (random quarter-turn rotation per tap so creatures head off in varied directions); one orbium is seeded dead-center on Start so the pond is alive immediately. The field packs to a WebGL2 **R8** texture (deliberately R8 — it's `LINEAR`-filterable on every device, where an R32F-linear path renders black on tablets lacking `OES_texture_float_linear`) rendered through a violet→cyan→rose nebula fragment shader with a white-hot bloom in the dense cores — luminous jellyfish-nebulae, no 2D canvas. **Audio**: 5 vertical bands → 5 pentatonic voices (C3 E3 G3 A3 C4, no wrong notes), band mass→gain + brightness, vertical centroid→±cents detune so the chord breathes as creatures drift; always-on C3+G3 pad; per-tap octave-up ping <50 ms; warm lowpass → limiter (never loud/harsh). **First Lenia / continuous-CA piece in the lab** and the **2nd emergent-self-organization kids piece** — with Physarum `260-kids-slime-garden`, "emergent life that sings" is now a body of work, not a fluke (the JURY's standing ask). **The cycle-280 banked seed, finally resurrected and de-risked**: the one risk that lost it (does the orbium stay alive or dissolve/explode?) was settled by an **empirical 400-step Node simulation** — mass held steady ~75–76 while the centroid translated ~0.24 cells/step and wrapped toroidally — so it's a verified glider, not a guess. **Touch input + raw-WebGL output**, dodging the over-represented `mic` (4×) + `canvas2d` (4×) of the last 10. Extends the loved emergence vein of `236-particle-life-song` ❤️ and the cosmic-nebula palette of `130-tsl-particle-compute` ❤️. Winner of a **DEEP** 3-builder fire (one concept — "breed glowing lifeforms that sing" — three Lenia formulations); siblings `kids-glow-lifeforms` (energy-based **Particle-Lenia** glowing particle swarm) + `kids-flow-pond` (mass-conserving **Flow-Lenia** spill-proof goo) are build-verified and banked in IDEAS.md. For kids 4+ · touch input · raw-WebGL output · zero new deps · zero API · 4.85 kB.
  Design notes: `src/app/dream/264-kids-lenia-pond/README.md`

---

## Previous (Cycle 281 — adult build · DEEP orchestration, 3 explored)

- **[/dream/262-aurora-particle](/dream/262-aurora-particle)** — Aurora Particle. `demoable`
  **The solar wind hitting Earth right now writes the score — a generative drone and a flowing aurora built from thousands of glowing particles.** Press Start: three live NOAA SWPC feeds (solar-wind plasma, the interplanetary magnetic field, and the planetary Kp index) are fetched client-side and re-polled every 60s, then EMA-smoothed so sound and light *glide* on each update. The Sun drives both at once — **wind speed** → drone root pitch + bell-arp tempo + aurora hue (slow=green → fast=violet); **plasma density** → number of detuned drone partials (2–5); **Bz** (north-south IMF) → major↔minor third *and* curtain height/agitation (negative Bz = storm coupling → minor + taller, wilder curtains); **Bt** → loudness + brightness; **Kp 0–9** → the whole system steps from a couple of soft green sheets (CALM) to many towering red/violet curtains (STORM). The aurora is ~9,800 additive `THREE.Points` arranged into curtain sheets, each particle rising and swaying in a custom vertex shader, lit through `@react-three/postprocessing` Bloom over a deep night-sky + star field — the glowing-points-in-3D language of the loved `130-tsl-particle-compute` ❤️, aimed at the sky. An always-on drone (detuned saw/tri → Kp-driven lowpass → feedback delay → code-synthesized convolution reverb → limiter) means it's never silent and never clips. **The 2nd real-world-data sonification in the lab** (after `233-earth-pulse`) — open it on two different days and it's a different piece because the Sun was. Degrades gracefully: any feed failure → a bounded random-walk **simulated** solar wind with a readable rose notice; no WebGL → drone-only. **Input = live external space-weather API · output = three.js particle curtains + Bloom** — dodges the over-represented `mic` (4×) and `canvas2d` (4×) of the last 10. Winner of a **DEEP** 3-builder fire (one concept — "live solar wind = aurora + drone" — three render strategies); siblings `aurora-drone-field` (raw-WebGL2 GLSL sum-of-sines curtains) + `aurora-raymarch` (volumetric raymarch with real O-green/O-red/N-violet altitude→emission-line physics) are build-verified and banked in IDEAS.md. Zero new deps · zero API · 5.6 kB.
  Design notes: `src/app/dream/262-aurora-particle/README.md`

---

## Previous (Cycle 280 — kids build · WIDE orchestration, 3 explored)

- **[/dream/260-kids-slime-garden](/dream/260-kids-slime-garden)** — Slime Garden. `demoable`
  **Touch a dark screen and thousands of tiny glowing creatures crawl toward your finger, weaving living veins of light that sing as they connect.** A real *Physarum polycephalum* slime-mold simulation: ~3,500 typed-array agents on a 220×220 trail grid each sense the trail at three points (front-left / front / front-right), steer toward the brightest, deposit, and the field diffuses + decays — the canonical **Jones/Jenson transport-network algorithm** — plus a gentle pull toward the "food" nodes you tap, so the swarm physically *connects the points you touch*. The trail grid uploads each frame as a WebGL2 `R8` texture rendered through a bioluminescent gold→teal→magenta fragment shader over deep indigo (no 2D-canvas art). Up to **5 food nodes** each own a C-major-pentatonic voice (C3 E3 G3 A3 C4) whose gain + lowpass cutoff rise with the local glow — a well-connected node sings louder and brighter; an always-on C3+G3 pad + master limiter keep it calm and never silent. **First Physarum / agent-transport-network piece in the lab**, and a kids prototype rendered entirely through GPU shaders — **touch input + raw-WebGL output**, deliberately dodging the over-represented `three.js` + `canvas2d` of the last 10. Extends the loved emergence vein of `236-particle-life-song` ❤️ (music FROM self-organization). Winner of a WIDE 3-builder kids fire; siblings `kids-lenia-pond` (Bert Chan's **Lenia** continuous CA — glowing lifeforms that glide & sing) and `kids-light-cloth` (Jakobsen **Verlet** mass-spring cloth you strum) are banked in IDEAS.md. For kids 4+ · touch input · raw-WebGL output · zero new deps · zero API · 4.74 kB.
  Design notes: `src/app/dream/260-kids-slime-garden/README.md`

---

## Previous (Cycle 279 — adult build · WIDE orchestration, 3 explored)

- **[/dream/259-paths-generative](/dream/259-paths-generative)** — Paths Generative. `demoable`
  **Drop your own piano recording (or load a Resonance track) and it becomes an endless, never-repeating Brian-Eno ambient room — a living tape-loop piece that's audibly different at minute 10 than at minute 1.** Implements the *Music for Airports* / *Discreet Music* trick directly: **six loops of mutually incommensurate length** (11.3 / 14.7 / 18.1 / 23.9 / 29.3 / 37.7 s — product ≈ **29 hours** before any exact repeat) play at once, each transposed to a consonant interval (octave / 5th / 4th / M3 via `playbackRate`), each on its own slow LFO-gain (0.023–0.071 Hz, also incommensurate) + stereo pan, summed through a synthesized-noise **convolution reverb** + shared lowpass. A **generative state machine** enters a new "movement" every 90–150 s (scaled by a *drift* slider) that random-walks the active-voice subset (3–5 of 6, 6-s fades), filter cutoff (200–4000 Hz), reverb wetness, transposition set, palette and density — with memory, so the texture genuinely evolves (3 bright close voices at minute 1 → a deep 5-voice wash at minute 5 → a register shift at minute 10). Echoes **Steve Reich** phase music too: loops drifting out of alignment surface rhythms nobody programmed. Tri-modal source: **file-drop** · **"load a Resonance track by ID"** → `fetch('/api/audio/:id')` (handles a direct-audio *or* JSON `{url}` response — the loved `163-paths-visualizer` ❤️ pattern, so Karel can paste a real Welcome Home piano track) · a synthesized `OfflineAudioContext` **demo** (Cmaj7→Fmaj7→Am7→G arpeggio) that plays with **zero input** so it's never silent. Canvas-2D: **six concentric rings rotating at `1/loopLength` rad/s** so you literally *see* the phase drift you hear, per-voice glow + playhead, a movement-tinted radial field; readout of elapsed / movement # / active voices. **First long-form (>5 min) *stateful* generative piece in the lab** — the "leave it running" category the diversity menu flagged as empty (loops existed at `172` ❤️, granular at `227` ❤️, but never a movement-based evolving piece). Born from this cycle's research dive (Eno/Reich vs. the long-form-diffusion literature — the 1978 trick wins for zero-dep, zero-latency non-repetition; RESEARCH §279). Winner of a WIDE 3-builder fire — siblings `260-aurora-drone` (live NOAA solar-wind → drone + aurora; the JURY-asked **2nd real-world-data sonification** after `233`) and `261-live-duet-groover` (mic → spectral-flux/two-clocks generative drums; the **rhythm member completing the AI-band trio**) are build-verified and banked in IDEAS.md. Pulled by the loved "his own piano" cluster `163` ❤️ + `227` ❤️ + `172` ❤️ and Karel's standing "use the Paths recordings" directive. Audio-file input · canvas2d output · zero new deps · zero server route (read-only `/api/audio` only) · 5.13 kB.
  Design notes: `src/app/dream/259-paths-generative/README.md`

---

## Previous (Cycle 277 — adult build · DEEP orchestration, 2 explored)

- **[/dream/256-live-duet-harmonist](/dream/256-live-duet-harmonist)** — Live Duet Harmonist. `demoable`
  **Play *chords* and a jazz accompanist answers in real time — rootless voicings and a walking bass that lock to the rhythm of YOUR playing, not a fixed metronome.** The **harmony member** of the multi-cycle "AI band you play with," and the polyphonic half of the duet: where `251-live-duet-trader` ❤️ tracks a single melodic line, this one hears a four-note chord. Mic → `AnalyserNode` (fftSize 4096) → fold the byte-FFT (60–2000 Hz) into a **12-bin chroma** (one-pole 0.8) → **cosine-match 36 templates** (12 maj / 12 min / 12 dom7, shell-tone-weighted, b7 emphasized for dominants) → a **160 ms look-ahead "settle"** so the bed switches only when a chord persists → a **jazz voicing engine**: rootless / drop-2 comp voicings (3+7 shell plus a 9/13 color tone, Mark Levine vocabulary) with nearest-pitch `setTargetAtTime` voice-leading glides, under a **walking bass** (root on the downbeat, chord tones on 1–2, a chromatic approach a semitone below the next root on beat 4). The pulse is **inferred from your attacks**, not fixed: **spectral-flux onset detection** (adaptive `mean + 1.5·std`, 100 ms refractory) → median inter-onset-interval → tempo folded to 60–180 BPM → a **Chris-Wilson "two clocks" look-ahead scheduler** (25 ms tick / 100 ms window, events at exact `AudioContext` time) places the bass + comp stabs on your beat; sparse/legato playing falls back to a gentle 80 BPM so it never stalls. Canvas-2D: 12-wedge chroma ring, large root-hued center chord name + quality, a glowing rootless-voicing node arc, a walking-bass ladder, a 4-beat pulse indicator with emerald onset-flash + live BPM, and a duration-weighted chord-history trail. No-mic → auto-runs Dm7 → G7 → Cmaj7 → Am7 at 88 BPM with the full walking bass + comping (a `text-rose-300` notice + "Use microphone" retry). **First spectral-flux onset/tempo inference + two-clocks scheduler *fused with* live harmony in the lab** (the lab had chroma→chord naming in `229-chord-canvas` ❤️, but never a reactive comping engine). Born from the cycle-275 DEEP "AI band" fire's banked harmony member, re-fired DEEP this cycle (builder A = a simpler fixed-clock comping bed, build-verified + banked in IDEAS.md as the demo-reliable fallback; builder B's jazz/onset-sync version won). References: **ReaLchords** (arXiv 2506.14723, Jun 2025 — online chord accompaniment, RL-shaped on harmonic+temporal coherency), arXiv 2604.07612 (the 160 ms settle), Chris Wilson *A Tale of Two Clocks*, Mark Levine *The Jazz Piano Book*. Pulled by `251-live-duet-trader` ❤️ + `229-chord-canvas` ❤️ (the chord/responsive thread). Mic input · canvas2d output · zero new deps · zero API · 5.63 kB.
  Design notes: `src/app/dream/256-live-duet-harmonist/README.md`

---

## Previous (Cycle 276 — kids build · WIDE orchestration, 3 explored)

- **[/dream/253-kids-tilt-pour](/dream/253-kids-tilt-pour)** — Tilt Pour 🫧. `demoable`
  **For kids 4+ — *tilt* the iPad to pour a glowing lava-lamp of candy-colored jelly blobs that sing when they merge. No touching the screen, no reading, no wrong notes.** Lean the tablet and 8 luminous blobs slosh and pool in whatever direction you tilt; when two of them fuse into a gooey shape, that pair rings a soft **C-major-pentatonic** note (each color owns a pitch), and a low ambient triad pad swells the more vigorously you slosh them around. The blobs are a real **metaball field** rendered in a raw **WebGL fragment shader**: each blob's scalar field uses a **Hermite smoothstep falloff** (cheaper than `exp()` on phones), summed and threshold-banded into a bright interior + glowing rim + soft additive halo (Inigo-Quilez-style smooth-min fusion), then Reinhard-tonemapped so it never clips to white. A tiny **CPU physics step** turns `deviceorientation` gamma/beta into a smoothed **gravity vector** driving gravity + damping + edge-restitution + soft blob–blob repulsion (velocities capped so it's always gentle). Born **directly from this cycle's research dive** on **Damian Van Der Merwe's "Painting with Math: Building an Interactive Lava Lamp Shader from Scratch"** (Apr 3, 2026) — all four of his mobile-perf choices adopted (Hermite falloff, fixed 8 blobs, 2-octave noise cap, DPR≤2); also references IQ smooth-min/SDF. Sound chain: sine+octave-triangle voices → feedback-delay shimmer → DynamicsCompressor limiter (always kid-safe). iOS motion permission is requested behind the big start tap (which also unlocks audio); on denial / no sensor / no tilt within ~1.8s it auto-switches to a **pointer-drag** fallback (drag steers gravity) with a `text-rose-300` notice; no-WebGL shows a notice while the pad keeps playing. **First metaball / smooth-min lava-lamp in the lab.** Dodges the week's banned `three.js` + `touch+canvas2d+pentatonic-chime` kids template (tilt input · raw-WebGL output). Winner of a WIDE 3-builder kids fire — siblings `254-kids-blow-bloom` (BLOW into the mic → dandelion seeds drift off ringing notes; the lab's first **breath-detection** input) and `255-kids-sing-garden` (voice→fbm bedtime sky + melody loopback) are build-verified and banked in IDEAS.md. Pulled by `83-kids-tilt-rain` ❤️ + `169-kids-marble-run` ❤️ + `84-wave-fluid` ❤️. Tilt input · raw-WebGL fragment-shader output · zero new deps · zero API · 7.03 kB.
  Design notes: `src/app/dream/253-kids-tilt-pour/README.md`

---

## Previous (Cycle 275 — adult build · DEEP orchestration, 3 explored)

- **[/dream/251-live-duet-trader](/dream/251-live-duet-trader)** — Live Duet Trader. `demoable`
  **Trade fours with a partner that plays *with* you — the instant you pause it darts in with a melodic answer in your key, and the instant you play again it ducks out of the way.** Play any pitched line (piano, voice, guitar) into the mic; after ~3 notes the partner starts learning your intervals (a live 1st-order **Markov** table) and inferring your **key** from a pitch-class histogram. Whenever a **~320 ms silence gap** opens it answers a key-constrained, rhythmically lively phrase on a warm additive voice (triangle + inharmonic partials + feedback-delay shimmer); the **moment a new onset of yours is detected, its gain ramps to zero in ~50 ms and the scheduled phrase is cancelled** — you always have right of way. That duck-on-re-entry is the whole idea: continuous **interleaved trading**, not the fixed-2-second turn-taking of `225-aria-companion`. Pitch = ~16 ms **NSDF/McLeod autocorrelation** (RMS-gated, 70 ms onset debounce). Canvas-2D split scrolling piano-roll — **YOU** amber on top, **PARTNER** teal below — with glow trails, a LISTENING/ANSWERING badge, the inferred key, a filling gap-timer bar, and a live pitch dot. No-mic → an auto-running demo motif that plays, pauses, gets answered, and loops (fully showable without hardware); mic-denied shows a `text-rose-300` notice and falls into the demo. **First continuous interleaved-trading interaction in the lab** (the third reactive model after continuous-mirror and fixed-turn) and the realization of JURY.md's named request — "fuse the duet-shadow seed + 225-aria-companion into real reactive accompaniment." Born from this cycle's research dive on **arXiv 2604.07612 "Towards Real-Time Human–AI Musical Co-Performance"** (Apr 2026, sliding-window look-ahead co-performance); references François Pachet's *The Continuator* + jazz "trading fours." Winner of a DEEP 3-builder *live-reactive-accompanist* fire — siblings `250-live-duet-harmonist` (chroma→chord → continuous comping bass+pad bed) and `252-live-duet-groover` (spectral-flux onset → tempo inference → look-ahead two-clocks generative groove) are build-verified and banked in IDEAS.md as the next two members of a multi-cycle "AI band." Pulled by the orchestration-era love wave (`243` ❤️ / `236` ❤️ / `234` ❤️) + the responsive/dialogue line behind `225`. Mic input · canvas2d output · zero new deps · zero API · 5.48 kB.
  Design notes: `src/app/dream/251-live-duet-trader/README.md`

---

## Previous (Cycle 274 — kids build · WIDE orchestration, 3 explored)

- **[/dream/248-kids-stir-garden](/dream/248-kids-stir-garden)** — Stir Garden 🌱. `demoable`
  **For kids 4+ — GROW a living, glowing garden by MOVING your whole body in front of the camera. No touching the screen, no reading, no wrong moves.** Where the child moves, coral/leopard-spot **Turing patterns** bloom in glowing teal→coral→gold and the garden gently sings. Built on a real **Gray-Scott reaction-diffusion** simulation running on the GPU via **raw WebGL2 ping-pong framebuffers** (render-to-texture, 6 sub-steps/frame, clamp-stabilized) — *not* a triggered animation but a living chemistry that keeps growing on its own. **Zero-dependency frame-differencing** (a hidden 64×48 offscreen canvas, no MediaPipe/ML) turns whole-body motion into a seed injected into the `v` chemical, mirrored so it feels like a mirror; 5 horizontal zones map to C-pentatonic notes (sine+triangle, gentle envelopes, feedback-delay shimmer, DynamicsCompressor limiter), an always-on pad swells with motion, and after 3s of stillness the garden auto-blooms so it never looks dead. **First reaction-diffusion / GPU-simulation piece in the kids zone, and the first raw-GLSL kids piece** — the ~115 prior kids builds are touch+2D-canvas or three.js. It introduces a different *temporality* of play (plant→bloom, not the lab's tap→chime reflex) and extends the just-loved no-touch-camera direction of `234-kids-hand-creature` ❤️ with a lighter, no-ML input. Camera-denied → pointer "stir" fallback (`text-rose-300` notice); no-WebGL2 → readable notice + pad keeps playing; video hidden + frames discarded each tick (privacy). References Amanda Ghassaei's Gray-Scott RD shader (+ directed-field variant), cake23.de Turing-fluid, Karl Sims' RD parameter map, Daniel Rozin motion mirrors; born from this cycle's research dive on interactive stir-able RD. Winner of a WIDE 3-builder kids fire (siblings `247-kids-sing-garden` voice→GLSL-sky + `249-kids-tilt-pour` tilt→metaball-lava-lamp, both build-verified and banked in IDEAS.md). Pulled by `234` ❤️ + `104-kids-mirror-draw` ❤️ + `101-camera-song` ❤️ + `133-kids-ripple-pond` ❤️ + `84-wave-fluid` ❤️. Camera-motion input · raw-WebGL2-shader output · zero new deps · zero API · no mic · 5.93 kB.
  Design notes: `src/app/dream/248-kids-stir-garden/README.md`

---

## Previous (Cycle 273 — adult build · DEEP orchestration, 3 explored)

- **[/dream/246-spectral-splat](/dream/246-spectral-splat)** — Spectral Splat. `demoable`
  **Fly *through* your own music as a soft volumetric cloud of light.** Drop in a track (or use mic, or the built-in generative pad) and each FFT frame is deposited as a slab of soft, additive **Gaussian splats** — anisotropic glowing blobs with a true `exp(-r²)` falloff — into a ring buffer parked ahead of the camera; the camera then **dollies forward through** the accumulating nebula, so older frames recede into fog. Where `243-spectral-cloud` ❤️ has you *orbit* a hard point cloud, this one has you *travel into* a soft luminous volume with body — a continuous fog, not dots. Custom `ShaderMaterial` (additive, depth-write off, screen-X anisotropy), geometry allocated once / only typed-arrays rewritten per frame. Reactive: spectral **centroid** → hue drift + cloud dispersion; energy-flux **onset** → coloured shockwave shell + brightness bloom + forward speed surge; corner HUD shows source / BPM / onset. **First Gaussian-splat / soft-volumetric piece in the lab** — all prior volumetric work (`243` ❤️, `130-tsl-particle-compute` ❤️, `236`) renders hard additive points or particle sims. Born from this cycle's research dive on **AudioGS — "Spectrogram-Based Audio Gaussian Splatting"** (arxiv 2604.08967, Apr 2026); visual lineage Refik Anadol *Machine Hallucinations* + Ryoji Ikeda. Winner of a DEEP 3-builder "fly through your music" fire (siblings `spectral-tunnel` wormhole + `spectral-canyon` terrain build-verified and banked in IDEAS.md). Pulled by `243-spectral-cloud` ❤️ × `130` ❤️ × the paths thread (`227`/`163` ❤️). Audio-file input (+mic/generative) · three.js/custom-shader output · zero new deps · zero API · optional mic · 6.69 kB.
  Design notes: `src/app/dream/246-spectral-splat/README.md`

---

## Previous (Cycle 272 — kids build · WIDE orchestration, 3 explored)

- **[/dream/244-kids-sing-creature](/dream/244-kids-sing-creature)** — Sing Creature ✨. `demoable`
  **For kids 4+ — *sing* to grow and shape a glowing 3D creature that sings your melody back. No touching the screen, no reading, no wrong notes.** A luminous blob-creature floats in a soft bedtime sky; the child hums or sings into the mic and it breathes, **swells with loudness**, **changes hue with pitch** (low = deep violet → high = cyan/rose), **grows** the longer they sing, and — after a beat of quiet — **sings their little tune right back** as glowing pulses (call-and-response ear-training). Built on raw three.js: a high-res icosphere displaced along its normals by layered **GLSL simplex-noise in a custom `ShaderMaterial`**, fresnel rim + additive halo = glowing-jelly look. Mic = **autocorrelation pitch detection** (parabolic-interp + RMS gate), snapped to **C-major pentatonic** so anything sung sounds right; a soft sine tracks the snapped pitch so the child hears themselves in tune. Always-on ambient C/G drone + idle breathing (never silent/dead); mic is analyser-only, never recorded. **First voice→3D-morphing-creature in the lab** (the ~110 prior kids pieces are touch + 2D canvas; `158-kids-hum-paint` ❤️ is voice→2D paint; `234` is *hands*→3D). Mic-denied → 160px tap-and-hold fallback feeding pentatonic notes; WebGL-absent shows a notice. Winner of a WIDE 3-builder kids fire (siblings `kids-clap-dancers` onset→3D-band + `kids-body-band` camera-motion banked in IDEAS.md). References Toca Boca/Sago calm play + voice-driven-blob lineage + Reggio-Emilia embodied music cognition (voice as a child's first instrument). Pulled by `158-kids-hum-paint` ❤️ + `100-kids-paint-song` ❤️. Voice-pitch input · three.js/GLSL output · zero new deps · zero API · optional mic · 6.13 kB.
  Design notes: `src/app/dream/244-kids-sing-creature/README.md`

---

## Previous (Cycle 268 — kids build · DEEP orchestration, 2 explored)

- **[/dream/234-kids-hand-creature](/dream/234-kids-hand-creature)** — Hand Creature 🪼. `demoable`
  **For kids 4+ — grow and play a glowing 3D creature with your hands, no touching the screen.** Hold your hands up in front of the iPad's front camera and *conduct* a blobby creature: **raise your hands** and it inflates, brightens, and rings soft pentatonic notes (C4→C5 by height); **open your hands wide** and it spikes and sparkles; **bring up a second hand** and a little satellite blob orbits the main one. Built on raw three.js — a high-detail icosahedron displaced in a **vertex shader** by 3D simplex noise (Ashima `snoise`), rim-lit jelly glow — driven live by **MediaPipe HandLandmarker** (21 keypoints/hand, GPU, CDN-loaded, never silent thanks to an always-on sine pad). **First MediaPipe prototype in the lab and first 3D/WebGL piece in the kids zone** — the entire kids zone before this was touch + canvas2d. Camera-denied or offline degrades to a self-playing pentatonic auto-demo + tap-to-bounce. References Derivative's TouchDesigner "Hand Tracking Master Class" (landmarks conducting visuals) + spite/clicktorelease vertex-displacement blob. Camera input · three.js output · 5.51 kB. *(Sibling approach `kids-sing-creature` — voice-grown twin — explored in the same fire and banked in IDEAS.md.)*
  Design notes: `src/app/dream/234-kids-hand-creature/README.md`

---

## Previous (Cycle 267 — adult build)

- **[/dream/233-earth-pulse](/dream/233-earth-pulse)** — Earth Pulse. `demoable`
  The **last 24 hours of global earthquakes, played as music.** Pulls the live USGS "all_day" GeoJSON feed (public, keyless, CORS-open) and turns every quake into a sounding event sequenced in compressed real time over a pulsing wireframe globe. **Magnitude → loudness + pitch** (bigger = deeper boom: M2≈170 Hz, M7≈30 Hz); **depth → timbre** (shallow = bright crack, deep = muffled rumble); **longitude → stereo pan**. A full day compresses into ~1.25–4 min (Slow/Normal/Fast); aftershock swarms become audible flurries. The globe (react-three-fiber: wireframe graticule + occluding core + a `Points` shader colored warm→violet by depth + Bloom) flares each quake as it sounds; drag to orbit. Synthetic fallback set if the feed is blocked. **First prototype in the lab to sonify a real external API** — the world writes the score; open it on different days and it's a different piece. Reference: the *silent* "Earthquake Pulse Map" WebGL globe + the "Sounds of Seismic" / IRIS SeisSound tradition. Ties to the **Earth Grounding** journey. 4 subsystems · zero permissions · 4.77 kB.
  Design notes: `src/app/dream/233-earth-pulse/README.md`

---

## Earlier (Cycle 266 — kids build)

- **[/dream/232-kids-rain-xylophone](/dream/232-kids-rain-xylophone)** — Rain Xylophone. `demoable`
  **For kids 4+** — Five BANDIMAL xylophone bars sit at the bottom (C3/violet/tallest → C4/cyan/shortest). Coloured drops fall from above, one per column, with ~3–4s of fall time. **Tap a drop while it's falling** → loud bell note (triangle + ×2.756 partial) + 20-sparkle burst + bright bar flash. **Let it land** → quiet note + 10-sparkle splash. **Tap a bar directly** → note + sparkles, any time. Drops drift gently toward their column center as they fall — catch zone is predictable. Auto-spawn: 1 drop every 1.5s, 2 demo drops at load. Pentatonic C3–C4 only — no uncaught drop ever sounds wrong. **First kids prototype where the mechanic is catching a moving target** — 231 prior kids prototypes respond to WHERE you tap; this adds WHEN (timing + moving-target tracking). Three reward tiers (catch/land/bar-tap) are immediately perceptible without score counters. Zero permissions · Zero deps · 2.65 kB.
  Design notes: `src/app/dream/232-kids-rain-xylophone/README.md`

---

## Previous (Cycle 265 — adult build)

- **[/dream/231-mood-xy](/dream/231-mood-xy)** — Mood XY. `demoable`
  Drag a dot through the **Russell circumplex emotion plane** (X = valence: sad ← → happy; Y = arousal: calm ↓ → excited). The Web Audio synthesizer follows in real time: arousal drives BPM (40–140), voice count (1–6), attack shape (pad → staccato), and oscillator type (sine → triangle); valence drives chord quality (major / minor / diminished), filter cutoff (warm → bright), and note duration (long → short). At **excited · happy**: bright major arpeggios, 6 voices, 45ms stagger, 120+ BPM. At **calm · sad**: sparse diminished chords, 1 voice, long sustain, 40 BPM. Background color bilinearly interpolates between 4 dark quadrant tones (deep amber / deep purple / deep teal / deep navy). Beat-synced glow pulse on the dot breathes with BPM. Trail of 72 fading circles follows movement. **First prototype where you set emotional intent and music follows.** Zero deps · Zero permissions · 2.81 kB.

---

## Previous (Cycle 264 — kids build)

- **[/dream/230-kids-bubble-duet](/dream/230-kids-bubble-duet)** — Bubble Duet. `demoable`
  **For kids 3+** — Two soap bubbles float on a starry canvas: **YOU** (pink, smiley face) and **FRIEND** (cyan, ♪). Tap the pink bubble to play a random pentatonic note and bounce it; 1.2 seconds later FRIEND brightens, bounces, and plays a **consonant response** (C3→G3 P5, E3→A3 P4, G3→C4 P4, A3→C3 octave, C4→G3 P4). During the exchange, 16 cyan sparkles arc from FRIEND toward YOU and a dashed quadratic arc connects the two bubbles as a "conversation thread." After FRIEND sings: "your turn ♪" appears and the cycle repeats. **First kids prototype where the responder has a distinct character identity** — prior call-and-response prototypes (echo-drum, echo-canon) use a generic system; here FRIEND has a face, a color, and a musical voice. Every response is harmonically consonant — no music theory needed. Zero permissions · Zero deps · 2.99 kB.
  Design notes: `src/app/dream/230-kids-bubble-duet/README.md`

---

## Previous (Cycle 263 — adult build)

- **[/dream/229-chord-canvas](/dream/229-chord-canvas)** — Chord Canvas. `demoable`
  Mic → FFT chroma vector → template match against 24 major/minor chord templates → chord name (e.g. "F♯m", "Cmaj7") in large monospace + scrolling color timeline. Hue from root note (12-tone color wheel), saturation from quality (major=vivid, minor=desaturated). Secondary chromagram strip shows per-pitch-class energy. Demo: ii-V-I progression (Dm7→G7→Cmaj7). **First prototype to explicitly surface music theory** — 228 prior prototypes visualize signal; this one names the chord. Zero deps · Zero API.

---

## Previous (Cycle 262 — kids build)

- **[/dream/228-kids-creature-grow](/dream/228-kids-creature-grow)** — Creature Grow. `demoable`
  **For kids 4+** — A glowing creature hatches from an egg and grows as you feed it pentatonic notes. Each of the six taps permanently adds a new body part: **eyes** (cyan, C4) → **ears** (emerald, D4) → **smile** (amber, E4) → **arms** (blue, G4) → **legs** (rose, A4) → **wings** (gold, C5). Tap 6 = fully grown: 60-sparkle burst + "✨ Fully grown! ✨" + creature sings all six notes back with each body part glowing on its note. Tap again any time to sing again. **First kids prototype where tapping literally grows anatomy** — unlike face-song (pre-drawn face you toggle) or voice-monster (mic/blob), this starts from nothing: the body only exists because you tapped. Progress dots at canvas bottom fill with each part's color. Zero permissions · Zero deps · 3.18 kB.
  Design notes: `src/app/dream/228-kids-creature-grow/README.md`

---

## Previous (Cycle 261 — adult build)

- **[/dream/227-paths-granular](/dream/227-paths-granular)** — Granular. `demoable`
  Upload any audio file (WAV, MP3, or the built-in C major demo) and reshape it into a grain cloud. Four parameters: **scrub** position (which moment in the file), **grain size** (20–500 ms), **density** (2–30 grains/sec), **pitch shift** (±12 semitones), **scatter** (how far grains stray from the scrub point). Each grain is Hann-windowed, randomly panned, and given an attack+decay envelope; the result ranges from smooth frozen-chord textures to glitchy percussive clouds. Waveform strip shows the buffer; sparkle particles burst from the scrub cursor on every grain. **First granular synthesis prototype** — try Karel's Welcome Home recordings for instant time-stretching of real piano textures. Zero deps · Zero API · Zero permissions · 3.65 kB.
  Design notes: `src/app/dream/227-paths-granular/README.md`

---

## Previous (Cycle 260 — kids build)

- **[/dream/226-kids-face-song](/dream/226-kids-face-song)** — Face Song. `demoable`
  A glowing face made of five musical parts. Tap each to wake it up: **head** (violet circle) = deep C2 drone; **left eye** (teal) = G3 pluck every 800ms + gentle blink; **right eye** (amber) = E3 pluck every 1200ms (polyrhythm offset); **nose** (rose) = A3 bounce every 600ms; **mouth** (cyan arc) = C3–G3–A3–E3–C4 melody (500ms/note), arc opens/closes while singing. Tap again to silence any part. When all five are active → sparkle burst + "La la la! ✨" flashes. BANDIMAL sizing throughout (head biggest = lowest, nose smallest = highest). **First kids prototype where the instrument IS a recognizable human face** — assembling it teaches pitch–size relationships through body analogy. Zero permissions · Zero API · Zero deps · 2.84 kB.
  Design notes: `src/app/dream/226-kids-face-song/README.md`

---

## Previous (Cycle 259 — adult build)

- **[/dream/225-aria-companion](/dream/225-aria-companion)** — Aria Companion. `demoable`
  Play a phrase on your piano — pause 2 seconds — Aria responds with a phrase generated from a
  Markov chain trained on YOUR intervals, then listens again. Split piano roll: YOU (orange, top)
  / ARIA (blue, bottom). **First dialogue prototype**: all 224 prior prototypes react continuously;
  this one waits for a complete musical thought before answering. The Markov table accumulates
  across exchanges — by the 4th–5th dialogue, Aria starts echoing Karel's own melodic habits.
  Piano timbre: 4 additive triangle partials with slight inharmonicity (4.05× partial). Demo mode
  included. **Zero deps · Zero API · Zero AI calls** · 3.66 kB.
  Design notes: `src/app/dream/225-aria-companion/README.md`

---

## Previous (Cycle 258 — kids build)

- **[/dream/224-kids-glow-garden](/dream/224-kids-glow-garden)** — Glow Garden. `demoable`
  Tap to plant a glowing flower — it grows over 1.4s (stem rises, 6 petals unfurl) and sustains
  its pentatonic note. BANDIMAL sizing: violet C3 (biggest, r=52) → rose C4 (smallest, r=24).
  **Plant two flowers within 34% of screen width**: a pulsing white arc connects their heads,
  both glow brighter, and a resonance chord rings out (both pitches + perfect fifth above the lower).
  **First prototype where spatial placement IS the harmonic composition** — WHERE you plant
  determines which chords form. Prior proximity prototypes (color-mix, bubble-bath) are transient;
  flowers stay put. First tap retroactively wakes all demo flowers with audio + chime. Tap a flower
  to remove it and break its resonance pairs.
  For kids 3+ · Zero permissions · Zero API · Zero deps · 2.81 kB.
  Design notes: `src/app/dream/224-kids-glow-garden/README.md`

---

## Previous (Cycle 257 — adult build)

- **[/dream/223-fourier-paint](/dream/223-fourier-paint)** — Fourier Paint. `demoable`
  Draw any closed shape → Discrete Fourier Transform decomposes it into N rotating epicycles →
  the chain of spinning arms traces your shape while additive synthesis sounds each harmonic.
  The *shape of the drawing* IS the *timbre of the tone*: a circle → pure 55 Hz sine; a square →
  odd harmonics (sounds like a square wave); a 5-pointed star → fundamental + 5th harmonic; an
  asymmetric scribble → complex buzzy texture. Terms slider (1–64) lets you hear the Fourier series
  build from one pure oscillator to 64 harmonics — simultaneously a math lesson and a timbre sculptor.
  **First prototype where a 2D geometric drawing is the audio program** (reverses `13-piano-canvas`
  and `219-waveshape-draw`). Dark canvas, amber glowing tip, violet epicycle arms, violet trace path.
  Zero deps · Zero API · Zero permissions · 3.3 kB.
  Design notes: `src/app/dream/223-fourier-paint/README.md`

---

## Previous (Cycle 256 — kids build)

- **[/dream/222-kids-magnet-notes](/dream/222-kids-magnet-notes)** — Musical Magnets. `demoable`
  Tap anywhere to drop a glowing star magnet. Six pentatonic note-bubbles (BANDIMAL: bigger=lower,
  violet C3 → rose E4) float on a dark star-field and are pulled toward the nearest magnet by spring
  physics. Each bubble spirals in, rings its note at 52px distance, bounces outward, drifts back in
  — creating periodic, naturally-paced pentatonic melody from orbital dynamics. Multiple magnets (up to 4)
  produce layered polyrhythm without a clock. Two magnets auto-appear at load. AudioContext created on
  first tap. **First prototype where magnet placement geometry determines the melody** — not direct
  tapping but "composing forces." First orbital-physics sound generator in the dream zone.
  For kids 3+ · Zero permissions · Zero API · Zero deps · 2.35 kB.
  Design notes: `src/app/dream/222-kids-magnet-notes/README.md`

---

## Previous (Cycle 255 — adult build)

- **[/dream/221-optical-flow-music](/dream/221-optical-flow-music)** — Optical Flow Music. `demoable`
  Move in front of the camera — the motion IS the music. Frame-differencing on a 20×15 grid yields
  three aggregate signals: totalMag (motion speed) → filter cutoff + arpeggiation rate;
  hBias (rightward vs. leftward flow) → pitch snapped to C major pentatonic; vBias (downward flow)
  → reverb depth. Arrow overlay shows each cell's flow vector, colored by direction (amber=right,
  violet=left, teal=up, rose=down). Demo mode: three glowing blobs bounce around a dark canvas
  generating flow without any camera permission needed. **First prototype where motion — not
  audio — is the primary musical input.** Different from `110-webcam-compose` (color → music):
  here stillness = silence, only movement makes sound. Inspired by Karel's love of
  `217-dance-avatar` ❤️. Zero permissions (demo) · Zero API · Zero deps · demoable.
  Design notes: `src/app/dream/221-optical-flow-music/README.md`

---

## Previous (Cycle 254 — kids build)

- **[/dream/220-kids-fireworks](/dream/220-kids-fireworks)** — Fireworks. `demoable`
  Tap the dark star-filled sky → rocket launches toward your finger → 22 pentatonic sparks explode.
  Five color zones (violet=C4 → cyan=C5, left to right, C major pentatonic). Three rockets auto-demo.
  First kids prototype with a projectile-arc you aim.
  Design notes: `src/app/dream/220-kids-fireworks/README.md`

---

## Previous (Cycle 253 — adult build)

- **[/dream/219-waveshape-draw](/dream/219-waveshape-draw)** — Waveshape Draw. `demoable`
  Draw a waveform on a canvas — hear its timbre live via `createPeriodicWave`. Drag finger or mouse
  across the top 62% of the screen to reshape the oscillator's period; the timbre updates in real time
  as you draw. An amber overlay shows the actual oscillator output from `AnalyserNode`; a 32-bar harmonic
  chart below shows the Fourier spectrum of what you drew. Presets: Sine, Square, Triangle, Sawtooth.
  Pitch slider (A1–A5), volume slider. **First prototype where you draw a waveform shape and hear it as
  audio timbre** — the paradigm inversion of every other prototype (which convert audio → visual). All
  218 prior prototypes use FFT for analysis; this is the first that uses DFT for synthesis. The harmonic
  chart shows why a square wave sounds buzzy (odd harmonics only), why a sine is clean (harmonic 1 only),
  and why a jagged drawn curve sounds metallic (many harmonics populated). Inspired by Karel's love of
  `153-paint-compose` ❤️. Zero permissions · Zero API · Zero deps · 3.25 kB.
  Design notes: `src/app/dream/219-waveshape-draw/README.md`

---

## Previous (Cycle 252 — kids build)

- **[/dream/218-kids-xylophone-drops](/dream/218-kids-xylophone-drops)** — Xylophone Drops. `demoable`
  Five colored xylophone bars sit at the bottom in a staircase (tallest=lowest). Drops fall every 1.8s
  aimed at each bar; when a drop hits, the bar glows and rings a pentatonic note. Tap the sky to aim a
  drop; tap a bar directly to ring it. First kids prototype with temporal anticipation — you see the drop
  coming before it rings. For kids 3+ · Zero permissions · Zero API · Zero deps.
  Design notes: `src/app/dream/218-kids-xylophone-drops/README.md`

---

## Previous (Cycle 251 — adult build)

- **[/dream/217-dance-avatar](/dream/217-dance-avatar)** — Dance Avatar. `demoable`
  A 12-joint spring-physics skeleton that dances to audio — head, shoulders, elbows, wrists, hips,
  knees, feet. Each body part is driven by its own frequency band: sub-bass bounces hips/feet, bass
  lifts shoulders, low-mid sways the torso left-right, mid swings arms counter-phase, high-mid flutters
  the wrists, treble nods the head. Spring physics (K=140, D=10) gives body-like movement — joints
  overshoot, oscillate, and settle as real limbs do. Demo mode: 6 incommensurable LFOs produce continuous
  fluid motion from the moment the page opens. Mic mode: skeleton mirrors whatever is playing in real time.
  **First prototype with an animated human skeleton.** 216 prior prototypes visualize audio as particles,
  fluid, terrain, rings, or canvas marks; this is the first where the visualization IS a human figure.
  Inspired by DiscoForcing (ICML 2026). Live-performance fitness: high — works as a stage visualizer at
  projection scale. Zero permissions (mic optional) · Zero API · Zero deps · 3.43 kB.
  Design notes: `src/app/dream/217-dance-avatar/README.md`

---

## Previous (Cycle 250 — kids build)

- **[/dream/216-kids-band-builder](/dream/216-kids-band-builder)** — Band Builder. `demoable`
  Five glowing circles on a dark canvas — Bass (violet), Mid (teal), Melody (cyan), Rhythm (amber),
  Shimmer (rose). Tap any circle to add its instrument voice to a phase-locked band at 80 BPM. Tap again
  to remove it. All five loops share a common beat clock; a new voice always enters on-beat. BANDIMAL sizing:
  bigger circle = lower pitch (Bass r=76, Shimmer r=30). When all five are on: "✨ Full Band! ✨" flash +
  sparkle burst from all circles. Thin colored lines connect active circles (visual "playing together" metaphor).
  **First kids prototype about muting/unmuting independent looping tracks** — same paradigm as a DJ with stems.
  Zero permissions · Zero API · Zero deps · 2.82 kB.
  Design notes: `src/app/dream/216-kids-band-builder/README.md`

---

## Previous (Cycle 249 — adult build)

- **[/dream/215-fm-explorer](/dream/215-fm-explorer)** — FM Explorer. `demoable`
  Move your cursor (or drag on touch) across a 2D canvas to sweep through hundreds of FM timbres.
  X axis = carrier pitch (C2–C7, log). Y axis = modulator ratio (0.5–8.0). FM index slider controls
  depth. Background color field encodes timbral complexity: emerald = harmonic ratios (organ-like),
  amber = bell-like, violet = metallic/noisy. Waveform scope strip shows FM output in real time.
  5 presets: Bell, Rhodes, Clangy, Sub, Metallic. Mic mode: RMS → FM index (play louder = more
  metallic). **First FM synthesis prototype in 214 prior prototypes.** FM underlies the DX7 (1983),
  Rhodes piano, 808 sub-bass, and bell tones — three Web Audio nodes, zero deps.
  Zero permissions (mic optional) · Zero API · Zero deps · 4.05 kB.
  Design notes: `src/app/dream/215-fm-explorer/README.md`

---

## Previous (Cycle 248 — kids build)

- **[/dream/214-kids-dance-avatar](/dream/214-kids-dance-avatar)** — Dance Avatar. `demoable`
  A glowing cartoon character with five tap zones: head (C4/cyan), left hand (G3/emerald), right hand
  (A3/amber), left foot (C3/violet), right foot (E3/teal). Connected by a skeleton of dim white lines.
  Tap any body part → bell tone + spring bounce + sparkle burst. BANDIMAL sizing: feet are largest (C3/E3
  = deepest), head is smallest (C4 = highest) — a child discovers pitch-by-size intuitively in 2 taps.
  Cute face (two eyes + smile) drawn inside the head circle. Idle breathing animation (unique phase per
  part, slow sine pulse) makes the body feel alive before any touch. Visual-only demo cycles DEMO_SEQ
  before first user interaction — body parts bounce silently; sound unlocks on first tap.
  **First kids prototype where the instrument IS a human body shape** — no prior prototype uses the body
  as its interaction surface. Connects to DiscoForcing (ICML 2026) audio→animation research.
  For kids 3+ · Zero permissions · Zero API · Zero deps · 2.7 kB.
  Design notes: `src/app/dream/214-kids-dance-avatar/README.md`

---

## Previous (Cycle 246 — kids build)

- **[/dream/213-kids-echo-drum](/dream/213-kids-echo-drum)** — Echo Drum. `demoable`
  Four BANDIMAL drum pads fill the screen. Tap any rhythm; after 1.5 seconds of silence the drum
  echoes it back exactly — cool-cyan overlay marks the drum's voice vs. the child's warm hues.
  Then one final +1 beat fires at the average inter-tap interval on the most-used pad, with a
  24-sparkle gold burst. Phase indicator at canvas center: pulsing red dot = recording; colored
  tap-count dots orbit during recording (one per tap in the pad's hue); pulsing cyan dot = echoing.
  **First rhythmic call-and-response prototype** — echoes exact timing (not pitch, not Markov),
  pure affirmation: whatever you tap is perfectly mirrored back plus one more.
  For kids 3+ · Zero permissions · Zero API · Zero deps · 3.18 kB.
  Design notes: `src/app/dream/213-kids-echo-drum/README.md`

---

## Previous (Cycle 245 — adult build)

- **[/dream/212-diatonic-harmony](/dream/212-diatonic-harmony)** — Diatonic Harmony. `demoable`
  Play a melody into the mic; every note is instantly joined by its diatonic third and fifth —
  scale-correct companion voices that adapt as the key is detected. Three-lane scrolling piano roll:
  THIRD (light blue, top), YOU (warm orange, middle), FIFTH (deep blue, bottom). Key detection via
  Krumhansl-Kessler tonal hierarchy profiles (12-bin chroma × 24 major/minor templates, dot-product
  scoring). Diatonic intervals computed per scale degree — B in C major gets a minor third (D) and
  diminished fifth (F), not a fixed +4/+7 offset. Demo: ascending + descending C major scale.
  **First prototype that generates musically-correct companion voices for live performance.**
  Zero deps · Mic optional · Zero API · 3.72 kB.
  Design notes: `src/app/dream/212-diatonic-harmony/README.md`

---

## Previous (Cycle 244 — kids build)

- **[/dream/211-kids-firefly-web](/dream/211-kids-firefly-web)** — Firefly Web. `demoable`
  Tap to release glowing fireflies on a dark canvas. When two drift within 155 px they spin
  a vibrating silk thread — and a pentatonic chime fires, pitched by thread length (short = high,
  long = low). All threads harmonize. Up to 8 fireflies, 28 simultaneous threads. Fireflies drift
  with gentle Brownian motion + soft mutual attraction so threads form naturally. Halo pulse per
  firefly at ~0.5 Hz. 2 auto-seeded on load. **First kids prototype where the endpoints are alive**
  — extends `140-kids-string-bridge` ❤️ (static anchor points → drifting lights).
  For kids 3+ · Zero permissions · Zero API · Zero deps · 2.88 kB.
  Design notes: `src/app/dream/211-kids-firefly-web/README.md`

---

## Previous (Cycle 243 — adult build)

- **[/dream/210-aria-companion](/dream/210-aria-companion)** — Aria Companion. `demoable`
  Play piano into the mic. After you pause 1.5s, Aria responds with an 8-note phrase built from
  a 1st-order Markov chain of your own note transitions. Split scrolling piano roll: YOU (warm
  orange, top) / ARIA (cool blue, bottom). The Markov table accumulates across rounds — the longer
  you play, the more Aria mirrors your style. Demo: pentatonic phrase seeds the chain and Aria
  responds automatically. **First dialogue prototype** — turn-taking structure (you play, Aria
  responds) unlike all prior reactive prototypes. Zero deps · Mic optional · 3.68 kB.
  Design notes: `src/app/dream/210-aria-companion/README.md`

---

## Previous (Cycle 242 — kids build)

- **[/dream/209-kids-drum-tap](/dream/209-kids-drum-tap)** — Drum Tap. `demoable`
  Four large colored drum pads fill the screen. Tap any pad for an instant percussive sound
  + ripple ring: kick (violet, top-left, biggest), hi-hat (amber, top-right, smallest), snare
  (rose, bottom-left), tom (teal, bottom-right). BANDIMAL rule: bigger = lower pitch.
  After 2+ taps and 1.5s of silence, a **1st-order Markov chain** generates an 8-step drum
  response (8th notes at 80 BPM = 3s). The drum pads flash in sequence as the response plays.
  Transition matrix builds from the user's own tap sequence — the drum gradually mirrors
  which pads you tend to chain together. Tapping during response interrupts and rebuilds.
  Auto-demo plays a kick-hat-snare-hat pattern after 2.2s to show the interaction model.
  Drum sounds: kick (sine 110→40 Hz glide), hihat (noise → highpass 7500 Hz), snare
  (bandpass noise 1800 Hz + 185 Hz transient), tom (sine 155→75 Hz glide). Zero deps.
  **First kids prototype with explicit call-and-response rhythm dialogue.**
  For kids 4+ · Zero permissions · Zero API · Zero deps · 2.88 kB.
  Design notes: `src/app/dream/209-kids-drum-tap/README.md`

---

## Previous (Cycle 241 — adult build)

- **[/dream/208-param-layer](/dream/208-param-layer)** — Param Layer. `demoable`
  Four concentric draggable rings sculpt a harmonic bell tone in real time. Outer (violet) = pitch
  (C2 → A5 via exponential mapping); Ring 2 (teal) = partial count (1 pure sine → 16 rich stack);
  Ring 3 (amber) = inharmonicity stretch (0% perfect harmonics → 22% metallic spread, via
  `f_n = f₀ × n × (1 + ih × (n-1))`); Inner (rose) = decay (0.15s sharp click → 5.0s slow gong).
  A quiet 16-partial drone plays continuously so parameter changes are heard instantly. Tap the
  center ▶ circle to fire a loud bell strike at the current timbre — decays with the Decay ring.
  Center shows a live circular waveform from the AnalyserNode (summed partials, 256 sample path).
  HUD row shows live values: note name + Hz, partial count, inharmonicity %, decay seconds.
  **First prototype with a hierarchical ring control surface** — outer gestures set register/mass,
  inner rings set fine timbre detail. Inspired by DEMON (arXiv:2605.28657, May 2026).
  Zero deps · Zero API · Zero permissions · 3.3 kB.
  Design notes: `src/app/dream/208-param-layer/README.md`

---

## Previous (Cycle 240 — kids build)

- **[/dream/207-kids-harmonic-piano](/dream/207-kids-harmonic-piano)** — Voice Circles. `demoable`
  Four large glowing circles, each a harmonic partial of C3 (131 Hz fundamental → C4 → G4 → C5).
  First tap wakes all four simultaneously; subsequent taps toggle individual circles on/off.
  BANDIMAL: biggest violet circle (76px) = deep C3 fundamental; smallest amber (38px) = bright C5.
  Triangle oscillators with 1/n gain rolloff; `setTargetAtTime` for click-free transitions.
  Visual: each circle breathes at its own slow pulse rate (0.45–1.20 Hz), emits expanding ripple
  rings while active, fires 10 sparkles + bounce-scale on toggle. Last active voice protected.
  **First kids prototype where the child controls timbre** (harmonic composition of a tone) rather
  than which note plays. 15 active combinations; each sounds perceptibly different.
  For kids 4+ · Zero permissions · Zero API · Zero deps · 2.53 kB.
  Design notes: `src/app/dream/207-kids-harmonic-piano/README.md`

---

## Previous (Cycle 239 — adult build)

- **[/dream/206-sdf-cave](/dream/206-sdf-cave)** — Cave. `demoable`
  Audio-reactive stone cave rendered via SDF ray-marching in a WebGL fragment shader.
  The viewer is positioned **inside** the cave — stalactite columns, a torus arch, and rough stone
  walls surround them on all sides. Three audio axes: **bass** drives the `smin` blend factor `k`
  (cave walls organically melt together and pull apart), **treble** adds Perlin-noise surface
  displacement (smooth stone → rough/jagged), **spectral centroid** shifts the cave light color
  (warm violet-amber at low register, ice-blue at high). Onset transients shake the camera.
  Slow orbital drift: camera pendulums gently left-right while the cave's domain-repeated
  geometry tiles seamlessly along Z. **First prototype where the viewer is inside the visual
  space** — 205 prior prototypes render visuals on a surface; this renders a 3D room around you.
  **First SDF/ray-marching shader in the sandbox** — no mesh geometry, pure math.
  **First prototype where bass physically deforms architecture** via live `smin` parameter.
  Demo mode (LFO oscillators) · Mic mode (live FFT) · WebGL required · 4.9 kB.
  Design notes: `src/app/dream/206-sdf-cave/README.md`

---

## Previous (Cycle 238 — kids build)

- **[/dream/205-kids-bubble-bath](/dream/205-kids-bubble-bath)** — Bubble Bath. `demoable`
  Tap to blow a soap bubble — bubbles drift upward, when two touch they chime a harmony chord.
  Pitch by X zone (left=C3/violet → right=C4/cyan, pentatonic). BANDIMAL sizing (bigger=lower).
  Collision tracked via `colPairs` Set: chord fires once per collision onset (re-fires on
  re-contact). Soap bubble visual: translucent fill, colored rim with outer glow, inner
  iridescent ring (hue+40°), two radial-gradient highlights (top-left crescent + bottom glint).
  Gentle wobble (radius ±2.5 px, unique phase). Pop at top: bell pair + 12-sparkle burst.
  **First kids prototype where harmony arises from spatial proximity of floating objects** —
  tapping near existing bubbles guarantees harmonies; spatial placement becomes composition.
  Auto-respawn when sparse. Demo: 2 bubbles at 120ms. Ambient C3+G3. Zero permissions · 2.7 kB.
  Design notes: `src/app/dream/205-kids-bubble-bath/README.md`

---

## Previous (Cycle 237 — adult build)

- **[/dream/204-anemone-av](/dream/204-anemone-av)** — Anemone AV. `demoable`
  A bioluminescent sea anemone breathing with audio. Central stalk + 12 tentacles (TubeGeometry
  along CatmullRomCurve3 paths), each with its own wave phase (golden-ratio-ish offsets). Bass
  drives slow radial sway; mid drives lateral shimmer; treble makes the tips flicker fast. Onsets
  pulse the form outward. Color: deep cyan at tentacle bases → violet at tips. Bloom
  (intensity 1.9) makes the tips glow against the near-black ocean backdrop. Single `useFrame`
  updates all 12 ShaderMaterials. First organic living 3D form in the sandbox — different
  aesthetic from the icosahedron of `21-three-mesh-av`. Zero new deps (Three.js + R3F + postprocessing
  already installed). Full WebGL2 (no WebGPU required). 4.36 kB.
  Design notes: `src/app/dream/204-anemone-av/README.md`

---

## Previous (Cycle 236 — kids build)

- **[/dream/203-kids-lantern-launch](/dream/203-kids-lantern-launch)** — Lantern Launch. `demoable`
  Tap the dark starry sky to release a glowing paper lantern. Each lantern drifts upward with a
  gentle sinusoidal sway (10px peak, unique phase per lantern). When it floats off the top of the
  screen it plays a bright bell chime and scatters 14 sparkles. Pitch is determined by horizontal
  tap position: left = C3 (violet), stepping through E3/G3/A3, right = C4 (cyan) — pentatonic, no
  wrong notes. Up to 8 lanterns coexist; two demo lanterns auto-spawn so the canvas is alive before
  first touch. Launch tone: quiet triangle (0.14 gain, 0.85s). Exit chime: triangle fundamental +
  octave partial (0.30/0.08 gain, 1.8s) — noticeably brighter than launch, rewards patience.
  **First kids prototype where the note fires at the END of a journey** (not at tap or collision) —
  5–10 seconds of floating before the reward. Extends the `166-kids-lantern` ❤️ motif.
  For kids 3+ · Zero permissions · Zero API · Zero deps · 2.54 kB.
  Design notes: `src/app/dream/203-kids-lantern-launch/README.md`

---

## Previous (Cycle 235 — adult build)

- **[/dream/202-membrane-drum](/dream/202-membrane-drum)** — Membrane Drum. `demoable`
  A circular drumhead solved with the 2D wave equation on a 64×64 grid.
  Tap anywhere inside the drum to excite a Gaussian displacement — the wave propagates
  outward from the strike point, reflects off the fixed circular rim, and creates standing
  wave patterns visible as a live blue/amber color map. Modal synthesis fires 6 oscillators
  at Bessel zero ratios (1.000 × 1.593 × 2.136 × 2.295 × 2.917 × 3.598) — the inharmonic
  overtones of a real circular membrane emerge from the physics, not from presets. Off-centre
  strikes emphasise asymmetric modes; centre strikes boost the symmetric (breathing) modes.
  Tension slider controls wave speed + fundamental (55–143 Hz). Damping controls decay time.
  Waveform trace below shows the last 180 frames of centre-point displacement.
  Zero permissions · Zero API · Zero deps · 2.96 kB.

---

## Previous (Cycle 234 — kids build)

- **[/dream/201-kids-glow-worm](/dream/201-kids-glow-worm)** — Glow Worms. `demoable`
  Three autonomous glowing caterpillars crawl across the dark canvas with chain-link physics —
  each segment follows the head with a distance constraint, creating organic sine-wave undulation.
  Each of the 5 body segments = one pentatonic note: head = C4 (small/bright, BANDIMAL high),
  tail = C3 (large/deep, BANDIMAL low). Colors: head=cyan, segments descend through violet → teal
  → amber → rose. Three worms are spatially panned: left (−0.52), center, right (+0.52) — three
  simultaneous taps produce a stereo chord. After first tap: each worm's head auto-beats C4 at its
  own interval (2.1 / 2.4 / 2.9 s) for ambient polyrhythm. Tap tolerance 50 CSS px — generous for
  4yo motor control. Ambient C2+G2 pad. **First kids prototype where the instrument is a moving
  creature** — the worm body is the keyboard, not a fixed grid or static object.
  For kids 3+ · Zero permissions · Zero API · Zero deps · 2.4 kB.
  Design notes: `src/app/dream/201-kids-glow-worm/README.md`

---

## Previous (Cycle 233 — adult build)

- **[/dream/200-harmonic-series](/dream/200-harmonic-series)** — Harmonic Series Explorer. `demoable`
  Every pitched sound is the sum of sine waves at integer multiples of a fundamental. This prototype
  makes that structure visible and audible simultaneously. 16 partials displayed as togglable rows —
  mute or solo any partial and hear the timbre change live. Eight instrument presets: Natural (1/n
  rolloff), Flute (almost pure fundamental), Clarinet (odd partials only — a consequence of its closed
  cylindrical bore), Violin (dense harmonic cloud), Pipe Organ (all harmonics equal), Bell (inharmonic
  ratios — BELL_RATIOS like 1.5, 2.47, 2.98 approximating real bell physics), Brass (partials 2–5
  dominate), Oboe (complex alternating pattern). Each row shows a live animated sine trace and an
  amplitude bar. **🎤 Mic mode**: click Start mic to have the fundamental auto-lock to your pitch via
  4096-point parabolic-interpolated autocorrelation (same algorithm as `13-piano-canvas`). Row colors
  follow the `1-live` band palette (violet=low, amber/magenta=high). **First prototype dedicated to
  instrument-science education** — lets you hear WHY a clarinet sounds hollow and a violin sounds warm.
  Zero permissions beyond optional mic · Zero API · Zero deps · Web Audio API only.
  Design notes: `src/app/dream/200-harmonic-series/README.md`

---

## Previous (Cycle 232 — kids build)

- **[/dream/199-kids-spin-wheel](/dream/199-kids-spin-wheel)** — Spin Wheel. `demoable`
  A large spinning color wheel with 8 segments, each a different color and pentatonic pitch
  (C3 E3 G3 A3 / C4 E4 G4 A4 — every combination consonant). A glowing ✦ triangle sits at
  12 o'clock. Tap any segment to add a glowing peg; as the wheel rotates, the ✦ plays each
  lit segment it passes. **First circular step sequencer in the kids zone.** Previous sequencers
  (`145-kids-dot-seq`, `150-kids-beat-builder`, `177-kids-lego-sequencer`) are linear/grid —
  this makes the loop visible as a spinning circle. BPM ± buttons change the physical spin speed.
  Clear resets all pegs. Additive bell synthesis (triangle + ×2.756 + ×5.404 partials, 1.3s decay).
  Ambient C3+G3 pad. BANDIMAL: top segment = C3, rotate clockwise for ascending pitches.
  For kids 3+ · Zero permissions · Zero API · Zero deps · 2.41 kB.
  Design notes: `src/app/dream/199-kids-spin-wheel/README.md`

---

## Previous (Cycle 231 — adult build)

- **[/dream/198-osc-composer](/dream/198-osc-composer)** — Oscilloscope Composer. `demoable`
  Design a Lissajous figure, then download the stereo WAV file that draws it on a real oscilloscope.
  Two sine oscillators at `n×220 Hz` and `d×220 Hz` are routed to separate stereo channels via
  `ChannelMergerNode` — left channel = X axis, right channel = Y axis. Seven frequency ratios
  map to musical intervals (Unison through Minor 7th). Phase slider (0–360°) sweeps the figure
  through its family of shapes. X/Y balance slider stretches the aspect ratio. Traveling dot
  traces the parametric curve while audio plays. Puzzle mode: match a ghost target figure by ear
  and by eye. WAV download (↓ WAV): generates a 5-second 44.1 kHz 32-bit float stereo file in
  pure JS — no server, no deps, works offline. Five named presets: Circle, Figure-8, Trefoil,
  Rose, Starburst. **First prototype to generate oscilloscope music** — audio that draws itself.
  Zero permissions · Zero API · Zero deps · No mic needed.
  Design notes: `src/app/dream/198-osc-composer/README.md`

---

## Previous (Cycle 230 — kids build)

- **[/dream/197-kids-rain-chain](/dream/197-kids-rain-chain)** — Rain Chain. `demoable`
  Five pentatonic cups in a staircase (top-left biggest/violet/C3 → bottom-right smallest/sky/C4).
  Rain falls autonomously, filling the biggest cup first. When a cup overflows a glowing bezier
  stream arcs into the next cup (CASCADE_DELAY = 0.22s = ~sixteenth note). **Five-note ascending
  pentatonic arpeggio C3→E3→G3→A3→C4 emerges from gravity + overflow physics** — the staircase
  geometry IS the musical scale. Tap anywhere for rain burst; drag for sustained downpour.
  Cup 0 pre-filled 38% so first cascade arrives ~12s autonomously. Two-speed loop: slow fill
  (anticipation) → rapid five-note release (payoff). Additive bell tones (triangle + 2.756× +
  5.404× partials, 4.5s decay). Ambient C3+G3 drone. Night-sky gradient.
  **First prototype where the route water takes downhill determines the musical scale.**
  BANDIMAL: bigger = lower = violet. For kids 3+ · Zero permissions · Zero API · Zero deps · 3.11 kB.
  Design notes: `src/app/dream/197-kids-rain-chain/README.md`

---

## Previous (Cycle 229 — adult polish)

- **[/dream/195-chord-canvas](/dream/195-chord-canvas)** — Chord Canvas (polished). `demoable`
  Cycle 229 polish: added aug/sus4/sus2 (72→108 templates), ♭/♯ toggle, chord lock button.
  See Cycle 227 entry below for full description.

---

## Previous (Cycle 228 — kids build)

- **[/dream/196-kids-wind-chimes](/dream/196-kids-wind-chimes)** — Wind Chimes. `demoable`
  Eight pentatonic wind chimes hang from a dark bar, longest (C3, violet) on the left,
  shortest (A4, pink) on the right — BANDIMAL rule: longer = lower. Pendulum physics: each
  chime swings under gravity, damping, and wind force. Tap left half of canvas → leftward
  wind; tap right half → rightward wind; drag for sustained breeze. When adjacent chime tips
  collide, both ring as additive bell tones (triangle × 3 slightly-inharmonic partials, 4.8s
  decay) and flash a color halo. Autonomous gust on load; spontaneous gusts every 3–6s.
  **First pendulum-physics prototype in the kids sandbox. First prototype where the physics
  itself writes a chord progression — when a strong gust cascades through all 8 chimes,
  you hear a physical arpeggio.** Soft C3+G3 ambient drone. Night-sky additive glow.
  For kids 3+ · Zero permissions · Zero API · Zero deps · 2.65 kB.
  Design notes: `src/app/dream/196-kids-wind-chimes/README.md`

---

## Previous (Cycle 227 — adult build)

- **[/dream/195-chord-canvas](/dream/195-chord-canvas)** — Chord Canvas. `demoable`
  Real-time chord detection from mic or demo audio. 12-bin chroma extraction (C2–C8 FFT, EMA
  smoothed) → dot-product match against 72 templates (12 roots × 6 qualities: major, minor, dom7,
  m7, maj7, dim). Large chord name at top changes color by pitch class (chromatic wheel) and
  quality (major=vivid, minor=desaturated, dom7=warm shift, dim=near-grey). Scrolling timeline
  below: each chord is a colored block whose width = duration held; blocks fade with age. Bottom:
  12-bin chromagram with root pitch class highlighted. Demo: Dm7→G7→Cmaj7→Bdim × 3 reps.
  **First prototype to explicitly name musical structure** — 194 prior prototypes visualize signal;
  this names the chord. Zero permissions · Zero API · Zero deps · 3.38 kB.
  Design notes: `src/app/dream/195-chord-canvas/README.md`

---

## Previous (Cycle 226 — kids build)

- **[/dream/194-kids-turtle-trail](/dream/194-kids-turtle-trail)** — Turtle Trail. `demoable`
  Four glowing turtles (violet C3 / teal E3 / amber G3 / rose A3) wander a dark canvas, each
  leaving a colored pentatonic trail. When a turtle crosses another's trail, it plays its note.
  Tap anywhere to drop a food treat — all turtles steer toward it, paths converge, crossings
  burst into a brief melody. Fully autonomous before first touch; music exists without
  interaction. **First prototype where trail intersection IS the note trigger — geometry as
  musical grammar.** For kids 3+ · Zero permissions · Zero API · Zero deps · 2.58 kB.
  Design notes: `src/app/dream/194-kids-turtle-trail/README.md`

---

## Previous (Cycle 225 — adult build)

- **[/dream/193-anemone-tsl](/dream/193-anemone-tsl)** — Anemone TSL. `demoable`
  A `TorusKnotGeometry(1.0, 0.22, 300, 36, 2, 3)` organism skinned with a custom GLSL
  ShaderMaterial. `uv.x` (0→1 along the tube path) drives three travelling waves at spatial
  frequencies 18.85, 37.70, and 94.25 cycles/tube — bass rolls slowly, mid wrinkles, high-mid
  flutters. Sub-bass breathes the whole surface; onset transients send a burst that decays at
  ×0.88/frame. Spectral centroid shifts hue from violet (low, warm) to cyan (high, bright).
  Rim lighting adds bright cyan silhouettes; filmic tonemap for depth. Demo mode: 5 incommensurable
  LFOs. Mic mode: live audio via `useMicAnalyser`. OrbitControls auto-rotate; Bloom post-processing.
  **First torus-knot geometry in the sandbox; first travelling-wave GLSL displacement.**
  WebGL · Two-screen start/run pattern · `@react-three/fiber`.
  Design notes: `src/app/dream/193-anemone-tsl/README.md`

---

## Previous (Cycle 224 — kids build)

- **[/dream/192-kids-magnet-notes](/dream/192-kids-magnet-notes)** — Magnet Notes. `demoable`
  Six glowing pentatonic orbs (C3 E3 G3 A3 C4 E4) drift on a dark canvas. When two orbs come
  within 200px CSS of each other, magnetic attraction pulls them together and their triangle
  oscillators fade up as a soft chord (gain ∝ proximity²). When orbs **touch**, 24 sparkle
  particles burst at the collision point and both notes spike loud. **Tap** an orb to kick it
  toward its farthest partner. Tap open canvas to nudge all orbs outward. The app is autonomous —
  orbs find each other unprompted, so a child can just watch and occasionally flick. Connection
  lines (gradient-colored, brightness ∝ proximity²) appear as orbs attract. Short plate reverb
  for warmth. **First kids prototype where proximity IS the chord** — no tap needed to make music,
  just let the magnets do their work. For kids 3+ · Zero permissions · Zero API · Zero deps · 3.17 kB.
  Design notes: `src/app/dream/192-kids-magnet-notes/README.md`

---

## Previous (Cycle 223 — adult build)

- **[/dream/191-eco-bloom](/dream/191-eco-bloom)** — Eco-Bloom. `demoable`
  An L-system fractal plant (rule: F→FF+[+F-F-F]-[-F+F+F], angle 22.5°) grows from a seed
  through 4 iterations, each iteration animating 2,401 glowing branch segments over ~1 second
  and playing a 4-note Karplus-Strong pentatonic chord. Trunk: violet (#7c3aed), tips: emerald
  (#34d399). Presses **grow** to start; auto-cycles every 3–5 seconds through iterations 1→4→seed.
  **First fractal/L-system prototype in the sandbox.** Structure generates sound — branching depth
  determines harmonic depth. Contemplative, patient pace unlike every reactive prototype before it.
  Zero deps · Zero permissions · Zero API · 2.3 kB.
  Design notes: `src/app/dream/191-eco-bloom/README.md`

---

## Previous (Cycle 222 — kids build)

- **[/dream/190-kids-wave-organ](/dream/190-kids-wave-organ)** — Wave Organ. `demoable`
  Seven pentatonic organ pipes rise from a dark ocean floor, tallest (C3, violet) on the left to
  shortest (G4, rose) on the right — BANDIMAL rule: taller = lower pitch. An autonomous wave rolls
  across the surface; when the water crests over a pipe's mouth, that pipe's triangle oscillator
  fades in with a 140ms attack. As the wave recedes the pipe fades out. At rest, C4/E4/G4 are
  already playing (a quiet C major chord). **Tap anywhere** to send a Gaussian wave surge that
  temporarily wakes the deeper, taller pipes (A3, G3, E3, and at strong surges, C3). Multiple
  taps stack for dramatic harmonic climaxes. Splash droplets arc up on each tap. Short plate
  reverb for warmth. **First kids prototype where continuous wave height = which notes play.**
  Autonomous wave and visual alive from load; audio starts on first tap (autoplay policy).
  For kids 3+ · Zero permissions · Zero API · Zero deps · 2.56 kB.
  Design notes: `src/app/dream/190-kids-wave-organ/README.md`

---

## Previous (Cycle 221 — adult build)

- **[/dream/189-voice-scene](/dream/189-voice-scene)** — Voice Scene. `demoable`
  Six ambient AV environments: Cosmic, Earth, Forest, Ocean, Fire, Crystal. Switch by clicking
  a button or **speaking a trigger word** (Web Speech API, Chrome/Edge). Each scene has distinct
  particle behavior (rise/fall/drift/wave/burst/swirl), a root+fifth drone, and a pentatonic
  arpeggio at scene-specific BPM (24–108). Hue transitions smoothly, drone pitches glide, arpeggio
  restarts. Say "cosmic" for violet rising particles at C2 + 24 BPM; "fire" for radial amber burst
  at C4 + 108 BPM. Live performance framing: a performer speaks scene names on stage, the projected
  environment follows. First prototype using the Web Speech API as primary input. Zero deps · Zero API.
  Design notes: `src/app/dream/189-voice-scene/README.md`

---

## Previous (Cycle 220 — kids build)

- **[/dream/188-kids-glow-bug](/dream/188-kids-glow-bug)** — Glow Bugs. `demoable`
  Release glowing fireflies that drift to garden lamps and chime pentatonic notes. Five lamps on
  stems, left-to-right C3→C4 (BANDIMAL: bigger = lower). Tap anywhere to spawn a glow-bug; it
  flies upward with sinusoidal drift, magnetically attracted to the nearest lamp. When it arrives:
  sparkle burst + bell chime (triangle + 2nd harmonic + reverb). Demo bugs auto-emerge from the
  soil every 3.2s so the garden is alive before first tap. **First kids prototype with directed
  flight**: the note fires at the destination, not at the tap point. 1–2 second journey creates
  visual anticipation before sound. All 5 pitches are C-major pentatonic — impossible to produce
  dissonance. Bigger lamp = lower pitch; child discovers this without instruction after 2–3 releases.
  For kids 3+ · Zero permissions · Zero API · Zero deps · 2.92 kB.
  Design notes: `src/app/dream/188-kids-glow-bug/README.md`

---

## Previous (Cycle 219 — adult build)

- **[/dream/187-shepard-tone](/dream/187-shepard-tone)** — Shepard Tone. `demoable`
  The auditory illusion of the infinite staircase. Eight sine-wave oscillators (A1–A8, one
  octave apart) all rise in pitch simultaneously, weighted by a bell curve so only the middle
  range is audible. When any oscillator exits the top of the audible range, it's already inaudible
  (bell weight ≈ 0), so the wrap-back to A1 is imperceptible — the pitch ascends forever.
  **Left column**: 8 glowing circles, each sized by its current bell weight — a wave of brightness
  sweeps upward continuously. **Right dial**: a clockface needle sweeps clockwise; one full rotation
  = one octave traversal (15s at default speed), its circular geometry mirroring the circular
  nature of the illusion. Controls: Rising/Falling toggle, Slow→Fast slider, Freeze (stops
  phase mid-spiral), Mic mode (amplitude → rate modulation). "What you hear is not what is
  physically happening" — the most fundamental demonstration of constructive pitch perception.
  **First psychoacoustics prototype in the sandbox.** 186 prior prototypes visualize audio.
  This one reveals that your brain is actively constructing pitch from physical signals, and
  that construction can be deliberately tricked.
  Zero permissions (Start mode) · Mic optional · Zero API · Zero deps · 3.38 kB.
  Design notes: `src/app/dream/187-shepard-tone/README.md`

---

## Previous (Cycle 218 — kids build)

- **[/dream/186-kids-breath-bloom](/dream/186-kids-breath-bloom)** — Breath Bloom. `demoable`
  A breathing flower with five glowing petals — one per note of the C-major pentatonic scale
  (C3 / E3 / G3 / A3 / C4). Each petal expands and contracts on a 9-second cosine breath
  cycle, staggered so they ripple around the center in a continuous wave — **the flower is
  alive before the first tap**. Tap any petal: sparkle burst + note pulses louder. Tap empty
  canvas: all five petals bloom at once. Audio: triangle-wave oscillators with 3.5s
  impulse-response reverb; per-petal gain follows its breath phase smoothly.
  **"First kids prototype that breathes before any interaction."** 185 prior prototypes are
  static until touch. Breath Bloom is already animated on route load. Also the first with a
  cosine ease-in/ease-out breath curve — the petals accelerate through the midpoint and
  decelerate at the extremes, like real breathing.
  Inspired by `166-kids-lantern` ❤️, `133-kids-ripple-pond` ❤️, `182-kids-crystal-song`.
  For kids 3+ · Zero permissions · Zero API · Zero deps · 2.84 kB.
  Design notes: `src/app/dream/186-kids-breath-bloom/README.md`

---

## Previous (Cycle 217 — adult build)

- **[/dream/185-score-structure](/dream/185-score-structure)** — Score Structure. `demoable`
  The architecture of your improvisation, revealed in real time. Mic input (or demo ii–V–I–IV
  progression) → 12-bin **chroma extraction** → **chord detection** (24 major/minor templates,
  dot-product correlation) → scrolling **chord timeline** (right-to-left, block width = duration
  held, hue = root pitch class). Below the timeline: a live **chromagram** (12 vertical bars,
  root highlighted). Every 8 seconds: **section classifier** labels the current window as Intro /
  Build / Climax / Resolution / Coda based on onset density, chord-change rate, and spectral
  centroid. Three gauges (Density, Chord rate, Register) update in real time. Ghost section label
  floats in the canvas background. Demo: triangle-wave ii–V–I–IV in C, self-analyzed.
  First prototype to surface **musical structure** rather than signal — 184 prior prototypes
  visualize FFT/pitch/timbre; this one reads compositional shape. Natural complement to
  `28-chord-canvas` (single chord), `24-piano-roll` (pitch roll), `22-code-score` (score).
  Zero deps · Zero API · Mic or demo · 185-score-structure · cycle 217.
  Design notes: `src/app/dream/185-score-structure/README.md`

---

## Previous (Cycle 216 — kids build)

- **[/dream/184-kids-gravity-harp](/dream/184-kids-gravity-harp)** — Gravity Harp. `demoable`
  Six glowing horizontal strings on a dark canvas: C5/A4/G4/E4/D4/C4 (top→bottom, BANDIMAL rule).
  Tap to drop a colored ball — it falls through the strings, each one plucking a **Karplus-Strong**
  note as the ball passes. **Pass-through physics**: strings absorb 38% kinetic energy per crossing
  (vy × 0.62) without reversing direction, so a ball traverses all 6 strings top-to-bottom then
  bounces off the floor and returns bottom-to-top — a descending then ascending pentatonic scale
  from a single tap. Each string glows and visually vibrates (fundamental mode shape) on contact;
  sparks burst at the collision point. Up to 8 balls fall simultaneously.
  **"A mallet falling through a harp."** Key difference from `109-kids-bounce-notes` (wall bounce,
  1D): here strings are permeable energy-absorbers, and the entire pitch range is traversed per ball.
  2 demo balls auto-spawn (no permissions needed). Ambient C2 + G2 pad from first tap.
  Inspired by `169-kids-marble-run` ❤️ (physics+pitch), `105-pluck-field` ❤️ (KS synthesis).
  For kids 3+ · Zero permissions · Zero API · Zero deps · 2.57 kB.
  Design notes: `src/app/dream/184-kids-gravity-harp/README.md`

---

## Previous (Cycle 215 — adult build)

- **[/dream/183-piano-motion](/dream/183-piano-motion)** — Piano Motion. `demoable`
  Watch a piano being played — two cartoon hands (violet left / rose right) float above a
  61-key keyboard (C2–C7) and spring-animate to each key as music sounds. **Bass register
  (below C4)** drives the left hand; **treble (C4–C7)** drives the right. Active keys
  glow violet when pressed. Three modes: **Bach demo** (Invention No. 1 fragment, all notes
  pre-scheduled, both voices visible); **mic** (play live — hands follow in real time via
  FFT peak detection per register); **recording** (paste a Resonance recording UUID →
  `/api/audio/[id]` → animated playback).
  Spring physics: k=0.12, damping=0.60 — fast enough to track melodies, smooth enough to
  look like a real hand sliding rather than teleporting. First prototype visualizing the ACT
  of playing rather than the sound of it. Implements AGENT.md directive: "use his real piano
  tracks as the audio source."
  Inspired by PianoFlow (arxiv 2604.12856, §229). Zero deps · Zero API · 4.34 kB.
  Design notes: `src/app/dream/183-piano-motion/README.md`

---

## Cycle 214 — kids build

- **[/dream/182-kids-crystal-song](/dream/182-kids-crystal-song)** — Crystal Song. `demoable`
  Six glowing crystal formations rise from a dark cave floor. **Taller crystal = lower pitch**
  (BANDIMAL rule). **Tap** to ring; **hold** to sustain a glass-bell note (3 sine partials:
  fundamental + octave + 2-octave, 2.2s decay on release). **Hold 4+ crystals together** → a
  resonance flash lights the whole cave. Crystals shimmer autonomously before first touch — the
  cave is alive from the moment the page loads. Ambient C2 drone from first tap.
  **"First kids prototype with sustained tones and glass bell timbre."** 181 prior prototypes
  play on tap-down; this sustains while held. Completely distinct from KS pluck (marble-run,
  pluck-field), triangle wave, or pure sine — the additive partials give a crystalline, slightly
  metallic ring. New dimension: a child discovers that holding longer = longer note (duration as
  a musical parameter). Four-crystal resonance rewards full-hand engagement.
  Inspired by `105-pluck-field` ❤️ (resonant physical synthesis), `166-kids-lantern` ❤️
  (dark canvas + glowing objects to discover), `169-kids-marble-run` ❤️ (height-as-pitch).
  For kids 3+ · Zero permissions · Zero API · Zero deps · 3.07 kB.
  Design notes: `src/app/dream/182-kids-crystal-song/README.md`

---

## Previous (Cycle 212 — kids build)

- **[/dream/181-kids-texture-drum](/dream/181-kids-texture-drum)** — Texture Drum. `demoable`
  Five full-height canvas zones: 🪵 **Wood** (lowpass noise + 185Hz body thud) · 🔔 **Metal**
  (820Hz bandpass Q=18, 820ms bell ring) · 💧 **Water** (noise sweeping 900→180Hz over 320ms)
  · 🥁 **Earth** (72Hz sub-kick, 440ms decay) · 🫙 **Glass** (2440Hz sharp ping, 86ms).
  **Tap** any zone for a hit. **Hold** for a 12.5Hz rapid-fire roll. **Two fingers** → louder
  accent + zone-color full-screen flash. Visual textures visible before first tap: wavy wood
  grain, diagonal metal hatch, animated water waves, stippled earth dots, sparkle glass crosses.
  **"The first kids prototype about timbre, not pitch."** All 180 prior prototypes use C-major
  pentatonic — the musical dimension is always high vs. low. Texture Drum asks: what does
  material sound like? A 3yo comparing Wood and Glass discovers instrumental timbre without
  any theory — just ears and fingers.
  Inspired by Hitmachine (2025) + `98-kids-drum-circle` ❤️ + `105-pluck-field` ❤️.
  For kids 3+ · Zero permissions · Zero API · Zero deps · 3.13 kB.
  Design notes: `src/app/dream/181-kids-texture-drum/README.md`

---

## Previous (Cycle 211 — adult build)

- **[/dream/180-cellular](/dream/180-cellular)** — Cellular. `demoable`
  Conway's Game of Life on a 64 × 16 grid, where each column maps to a musical pitch (C2→C5,
  log-spaced). Every Life generation tick fires triangle-wave notes for all columns containing
  at least one live cell. **Gliders** trace rising 4-note melodies that walk right and vanish.
  **Pulsars** (period-3 oscillators) produce repeating 2-bar loops. **R-pentomino** evolves
  chaotically for 1,103 generations — sounds like free-jazz improv. **Acorn** grows for 5,206
  generations, melodically unpredictable throughout. **Random 20%** self-organizes from dense
  noise into rhythmic clusters over tens of seconds.
  Click/drag the canvas to draw or erase cells. BPM slider (40–120) controls tick rate.
  **"What if generative music was also life?"** — first sandbox prototype where the musical
  structure is not reactive (every frame) or API-generated (one-shot) but self-organizing:
  initial conditions → evolving autonomous composition. The spatial position of patterns IS their
  pitch: left = bass, right = treble, symmetry = acoustic balance.
  Zero permissions · Zero API · Zero deps · 3.02 kB.
  Design notes: `src/app/dream/180-cellular/README.md`

---

## Previous (Cycle 210 — kids build)

- **[/dream/179-kids-voice-monster](/dream/179-kids-voice-monster)** — Voice Monster. `demoable`
  A glowing blob-monster on a dark starry canvas. **Hum or sing** into the mic — the monster
  grows with your amplitude and its color shifts with pitch (low=violet, mid=teal, high=rose).
  A hunger bar fills as you sing. After **30 accumulated seconds** of voice, the monster bounces
  excitedly then **sings back a melody** from the distinct pitches it detected (up to 8 notes,
  in order-of-first-detection, 0.56s per note). Tap the monster for a surprised boop + eye-wobble.
  After 5s silence, eyes drift in a Lissajous wander. Demo mode (no mic) runs a LFO simulation.
  **"Feed me with your voice — I'll sing back what I heard."**
  First kids prototype with a character that accumulates a memory of the child's singing.
  Inspired by Apr 2025 fMRI research: improvisation activates neural reward circuits more than
  memorized tasks. Extends `158-kids-hum-paint` ❤️ into character narrative.
  For kids 3+ · Mic optional · Zero API · Zero deps · 4.71 kB.
  Design notes: `src/app/dream/179-kids-voice-monster/README.md`

---

## Previous (Cycle 209 — adult build)

- **[/dream/178-splat-bloom](/dream/178-splat-bloom)** — Splat Bloom. `demoable`
  500 luminous oriented ellipses arranged in a **Gaussian cloud** around the canvas centre
  (σ = 22% of canvas), rendered with `globalCompositeOperation = "screen"` — overlapping
  splats add light, never occlude. The dense centre always blooms to near-white; sparse edges
  show individual coloured splats clearly. Star-cluster quality without explicit brightness control.
  **Bass** → nearest 100 splats bloom outward (scale ×1.6 at full bass, fade slightly).
  **Treble** → all 500 splats slowly rotate (field swirls at high treble).
  **Spectral centroid** → global hue target shifts violet (265°) ↔ amber (35°) at 1°/splat/frame.
  **Onset** → 50 random splats scatter with a velocity impulse; spring back (k = 0.015) over ~2 s.
  Demo mode: three LFOs. Mic mode: live FFT via `useMicAnalyser`.
  **"A painting that breathes."** Qualitatively different from particles (discrete) and fluid
  (density field) — a *texture field*: statistically distributed, individually oriented, additively composited.
  Inspired by WebSplatter (§222, Feb 2026). Aligns with `130-tsl-particle-compute` ❤️ and `153-paint-compose` ❤️.
  Zero deps · Zero API · Mic optional · 3.68 kB.
  Design notes: `src/app/dream/178-splat-bloom/README.md`

---

## Previous (Cycle 208 — kids build)

- **[/dream/177-kids-lego-sequencer](/dream/177-kids-lego-sequencer)** — Lego Beats 🧱. `demoable`
  A 2D **block sequencer** for kids (ages 3+). 8-step × 6-pitch grid: each row is a note in the
  C-major pentatonic scale (C3→E4), each column is one beat. Tap any block to activate it — a
  white cursor sweeps left to right and plays every lit block, looping endlessly. **Drag** to paint
  a run of notes. **−/+** buttons adjust BPM (40–160). **✕ Clear** to start fresh.
  Visual: lego-brick blocks (rounded rect + plastic sheen + center stud) with bounce-and-glow
  animation on play. Ambient C3+G3 pad fills the silence between notes.
  **"Place bricks to build a melody."** First 2D pitch×time grid in the kids zone — all prior
  kids prototypes are 1D (single row of dots) or spatial (tap-anywhere). This introduces the
  piano-roll metaphor to kids: X = time, Y = pitch. Construction-as-composition.
  Inspired by BrickMusicTable (arxiv 2411.13224, Nov 2024): lego block grid sequencer validated
  with 150+ children aged 3–13. Zero permissions, zero API, zero deps. 2.84 kB.
  Aligned with Karel's loves: `160-kids-paint-loop` ❤️ (visual composition → playback),
  `98-kids-drum-circle` ❤️ (beat construction).
  Design notes: `src/app/dream/177-kids-lego-sequencer/README.md`

---

## Previous (Cycle 207 — adult build)

- **[/dream/176-sdf-cave](/dream/176-sdf-cave)** — Cave. `demoable`
  A WebGL1 fragment shader renders a stone cave interior via **SDF ray-marching** — the first
  sandbox prototype where the viewer is *inside* the visual space. Camera orbits slowly inside
  the chamber looking toward centre. **Bass** drives the `smin` blend factor (0.05→0.68): stalactites
  and walls melt together on heavy bass, crystallise on silence. **Treble** roughens the stone
  surface via value-noise displacement. **Spectral centroid** shifts the cave glow from deep
  violet (bass-heavy) to ice blue (treble-heavy). **Onset** shakes the camera and pulses the
  surfaces white. Demo mode: three slow LFOs simulate a breathing cave with no audio output.
  Mic mode: live 6-band FFT drives all parameters via `useMicAnalyser`.
  **"You are inside a space that breathes with your music."** Completely new visual paradigm —
  175 prior prototypes render visuals *on* the canvas plane; this one puts you inside the geometry.
  SDF ray-marching + inline GLSL, zero deps, zero API. Renders at 55% CSS resolution for
  comfortable 60fps on mid-range GPUs.
  Influenced by `107-ocean-presence` ❤️ (immersive environment), `84-wave-fluid` ❤️ (GPU-only path).
  Research basis: MUTEK 2026 Sphaîra (§224), Revision 2026 Shader Showdown (§225).
  Design notes: `src/app/dream/176-sdf-cave/README.md`

---

## Previous (Cycle 205 — adult build)

- **[/dream/175-vocal-choir](/dream/175-vocal-choir)** — Vocal Choir. `demoable`
  Sing or hum a note — three harmony voices materialise around you in 3D space via HRTF
  spatialization: a **major third** (violet, upper-left, azimuth −45°), a **perfect fifth**
  (teal, upper-right, azimuth +45°), and a **bass octave** (rose, below, elevation −20°).
  All three follow every pitch change with 50ms portamento — smooth glides as you move
  between notes. Canvas: four glowing orbs in a choir formation, orb radius breathing with
  amplitude. A live note-name label ("C3", "G♯4") tracks the detected pitch.
  **"You sing one voice. Three more appear."** All 174 prior prototypes are either reactive
  (audio → visuals) or generative (API → audio). Vocal Choir does both: your voice is the
  input, and the output wraps spatially back around you. First choir prototype in the sandbox.
  Different from `23-pitch-harmonize` (raw pitch-shift, same timbre) — this generates
  additive voices at distinct frequencies for genuinely separate harmonic parts.
  Wear headphones · Mic optional (demo mode) · Zero API · Zero deps · 3.2 kB.
  Inspired by Karel's loves of `148-spatial-palette` ❤️ (spatial synthesis) and
  `105-pluck-field` ❤️ (resonant harmonic layering). Research basis: AI Harmonizer
  (NIME Jun 2025, RESEARCH.md §219).
  Design notes: `src/app/dream/175-vocal-choir/README.md`

---

## Previous (Cycle 204 — kids build)

- **[/dream/174-kids-raindrop-rhythm](/dream/174-kids-raindrop-rhythm)** — Raindrop Rhythm (kids). `demoable`
  Three glowing clouds in a dark sky — violet (C3), amber (G3), rose (C4). **Tap any cloud** →
  3-5 glowing teardrops scatter and fall with gravity + gentle sine drift. **Hold a cloud** →
  continuous rain (one drop per 200ms). When a drop lands on the water surface below, it rings
  a bell note and leaves an expanding ripple. Auto-rain cycles through all three clouds every
  second so the canvas is never silent. C3+G3+C4 form a C major arpeggio — any combination of
  clouds sounds consonant.
  **"The note plays when the drop lands, not when you tap."** Same delay-as-pedagogy principle
  as `133-kids-ripple-pond` ❤️ (two waves meet → chord) and `171-kids-snow-globe` (snowflake
  lands → bell). Here the child has control over *which pitch* (which cloud) and *how much rain*
  (tap vs hold), making this the most musically intentional of the three landing-note prototypes.
  Directly inspired by `169-kids-marble-run` ❤️ (physics = music) and Karel's loves of
  `133-kids-ripple-pond` ❤️, `166-kids-lantern` ❤️ (hidden discovery). Three-cloud polyphony:
  different children can each "own" a color and contribute separate voices.
  For kids 3+ · Zero permissions · Zero API · Zero deps · 2.82 kB.
  Design notes: `src/app/dream/174-kids-raindrop-rhythm/README.md`

---

## Previous (Cycle 202 — kids build)

- **[/dream/173-kids-garden-bloom](/dream/173-kids-garden-bloom)** — Garden Bloom (kids). `demoable`
  Hold the soil to grow a glowing flower — stem rises, petals unfold one by one as notes.
  Hold 0.75s = 1 petal; 2s = 3-note chord; 4s = full 5-petal pentatonic chord.
  X position sets timbre: violet/piano · amber/bells · teal/pluck · rose/pad.
  Release → flower loops its chord softly. Six flowers fill the garden → grand staggered
  chord → 12-second ceremonial sway-and-fade → garden resets. Demo flowers pre-planted
  at startup. **First kids prototype where hold duration = accumulating musical growth.**
  For kids 3+ · Zero permissions · Zero API · Zero deps · 3.63 kB.
  Design notes: `src/app/dream/173-kids-garden-bloom/README.md`

---

## Previous (Cycle 201 — adult build)

- **[/dream/172-loop-station](/dream/172-loop-station)** — Loop Station. `demoable`
  4-slot phase-locked loop station — pure Web Audio API. **Load demo** synthesizes four loops
  offline (sub-bass drone, pentatonic melody, high arpeggio, rhythm pattern) and starts them
  all on the same beat grid with no permissions needed. **Tap REC** on any slot to record from
  mic; the loop closes on the next tap and snaps to the beat-1 boundary — a 1-bar loop and a
  2-bar loop automatically stay in rhythmic alignment. Per-slot bar-length picker (1/2/4 bars),
  MUTE (crossfade to zero), ✕ (clear). Waveform canvas per slot shows the recorded buffer as
  amplitude bars with a sweeping playhead while looping. TAP TEMPO sets BPM from median
  inter-tap interval. **"Build a multi-layer performance in real time."**
  This is the first sandbox prototype about *constructing* a composition — not reacting to audio,
  not generating via API, but layering loops deliberately. The phase-lock is the key surprise:
  close a second loop and it snaps into rhythmic alignment with the first, no quantization step.
  Influenced by Karel's loves of `153-paint-compose` ❤️, `138-lmdm-echo` ❤️, `148-spatial-palette` ❤️.
  Demo path: Zero permissions · Zero API · Zero deps · 4.55 kB.
  Design notes: `src/app/dream/172-loop-station/README.md`

---

## Previous (Cycle 200 — kids build)

- **[/dream/171-kids-snow-globe](/dream/171-kids-snow-globe)** — Snow Globe (kids). `demoable`
  Tap anywhere on a dark night sky — a burst of 5–8 glowing snowflakes scatter from the touch
  point and drift down with gentle sinusoidal wobble. **The note plays when the flake lands**, not
  when you tap: a triangle-wave bell chime rings on touchdown, colored sparks burst at the landing
  point. **Tap high on the screen → high note** (rose = C4); **tap low → low note** (violet = C3).
  Five pitches across C-major pentatonic. Hold a finger for continuous snowfall ("blizzard mode").
  Demo mode auto-rains from center-height for 3.5 s on first open — shows the mechanic before any
  touch. 60 golden-ratio stars twinkle in the deep navy background. Faint snow glow at the ground.
  Soft C3+E3+G3 ambient pad throughout.
  **"First kids prototype where LANDING is the musical event — not the tap."**
  170 prior kids prototypes play a note on gesture (tap-down, drag, hold). Snow Globe plays when
  physics resolves: the child taps, watches the flake fall, then hears the ground ring. Cause and
  effect are separated by ~0.5–1.4 s of gravity — the same delay-as-pedagogy principle that makes
  `133-kids-ripple-pond` ❤️ so effective (two ripples meet → chord). The "high up = high note"
  mapping is self-discovering: after one tap at the top and one at the bottom, a 3yo has the model.
  Directly inspired by Karel's loves of `133-kids-ripple-pond` ❤️ (physics delay = music),
  `100-kids-paint-song` ❤️ (tap gesture = music), `152-kids-star-paint` ❤️ (dark sky + sparkles).
  For kids 3+ · Zero permissions · Zero API · Zero deps · 2.76 kB.
  Design notes: `src/app/dream/171-kids-snow-globe/README.md`

---

## Previous (Cycle 199 — adult build)

- **[/dream/170-spectral-morph](/dream/170-spectral-morph)** — Spectral Morph. `demoable`
  Drag the morph slider to blend the harmonic spectrum between two waveforms. 40 sine
  partials (harmonics of C3) are amplitude-interpolated independently — at 50% you hear
  a genuine acoustic hybrid between, say, a sawtooth and a sine: a timbre that exists
  between them, not a volume crossfade. Three stacked bar charts show Source A (dim),
  the live blend (bright), and Source B (dim) in real time as you drag. Source picker:
  Sawtooth / Triangle / Square / Sine for both A and B — mix any two.
  **"The first sandbox prototype to synthesize audio from spectral manipulation, not just
  analyze it."** 169 prior prototypes use FFT for read-out (AnalyserNode) — this one uses
  it as a compositional parameter: the harmonic amplitude vector IS the instrument.
  Formulas are exact Fourier series (sawtooth=1/k, triangle=1/k² odd k, square=1/k odd k).
  Inspired by Karel's loves of `153-paint-compose` ❤️ and `138-lmdm-echo` ❤️ (audio as
  transformable material). Zero deps · Zero API · Zero permissions · 2.79 kB.
  Design notes: `src/app/dream/170-spectral-morph/README.md`

---

## Previous (Cycle 198 — kids build)

- **[/dream/169-kids-marble-run](/dream/169-kids-marble-run)** — Marble Music (kids). `demoable`
  Draw glowing colored ramps on a dark canvas — then drop marbles and watch them fall,
  bounce off the ramps, and play Karplus-Strong pluck notes on each collision.
  Ramp color encodes pitch: **high ramp = high note** (rose=E4 top, violet=C3 bottom),
  the same physical analogy as string length on a real instrument — a child discovers it
  without needing any explanation. Three demo ramps are pre-loaded so the canvas plays
  immediately. Marbles auto-launch every 4 seconds (up to 6 live); tap **Drop 🎵** for
  instant addition. Draw new ramps with a finger drag (>30px). **Clear** resets to the
  demo layout.
  **"First kids prototype where the child builds the machine before the music plays."**
  All 168 prior kids prototypes are reactive (tap/drag → immediate note). Marble Music
  separates construction from performance: draw first, then observe what physics makes.
  Three cognitive layers: passive (watch), active (drop more marbles), constructive
  (redesign the ramp layout to change the melody). Inspired by Karel's loves of
  `105-pluck-field` ❤️ (KS synthesis), `133-kids-ripple-pond` ❤️ (physics = music),
  `100-kids-paint-song` ❤️ (drawing = music). Culturally validated: BooSnoo (2026),
  Sago Mini Music Machine (2026), Wintergarten Marble Machine (viral).
  For kids 4+ · Zero permissions · Zero API · Zero deps · 3.24 kB.
  Design notes: `src/app/dream/169-kids-marble-run/README.md`

---

## Previous (Cycle 197 — adult build)

- **[/dream/168-piano-roll](/dream/168-piano-roll)** — Piano Roll. `demoable`
  Play piano into your mic — each note appears as a glowing colored bar scrolling left.
  Pitch sets the vertical row (C2 bottom to C6 top, 48 semitones); color shifts from
  violet (low) to red (high), matching the `1-live` band palette. Black-key rows are
  slightly darker, giving a familiar keyboard reference without being distracting.
  The "now" cursor sits near the right edge; the currently-detected note shows a live
  tail extending to it — you see the pitch in real time, not just after it ends.
  Note name (e.g. "F♯4") updates in the status bar while held.
  **Demo mode** plays a 26-note C major passage; notes scroll in from the right like a
  player-piano roll. **BPM slider** adjusts scroll speed (30–200).
  **"First notation-style prototype in the sandbox."** All 167 prior prototypes visualize
  audio as abstract art (fluid, particles, terrain) or physics (pendulums, ripples).
  Piano Roll renders recognizable musical information — a pianist sees their phrases as
  intervals, scales, and rhythm. Natural triptych with `13-piano-canvas` (abstract painting)
  and `22-code-score` (write→play). Influenced by `138-lmdm-echo` ❤️ and `153-paint-compose` ❤️.
  Mic optional (demo mode) · Zero API · Zero deps · 3.59 kB.
  Design notes: `src/app/dream/168-piano-roll/README.md`

---

## Previous (Cycle 195 — adult build)

- **[/dream/167-aria-companion](/dream/167-aria-companion)** — Aria. `demoable`
  Play piano into your mic. After two seconds of silence, Aria responds — a phrase
  built by walking a Markov bigram of your own note transitions. The table grows
  across the session: by the 5th call-and-response, Aria sounds like she's been
  listening carefully. Two-panel scrolling piano roll: YOU (warm orange bars) on
  top, ARIA (cool blue bars) below, both scrolling at 80px/s with a live-tail
  for the currently-detected note. Demo button (no mic): plays a C-pentatonic
  phrase and fires the first response in ~5s.
  **"The piano responds when you rest."** 166 prior prototypes are reactive (every
  frame) or generative (one-shot API call). Aria is the first **dialogue** prototype:
  listens, waits, then composes a response from what it heard. Zero ML inference,
  zero API, zero deps — the Markov chain is ~25 lines of JS.
  Mic optional (demo mode) · Zero API · Zero deps · 3.88 kB.
  Design notes: `src/app/dream/167-aria-companion/README.md`

---

## Previous (Cycle 194 — kids build)

- **[/dream/166-kids-lantern](/dream/166-kids-lantern)** — Night Garden (kids). `demoable`
  A near-black canvas hides 16 pentatonic stars — each one holds a note. Hold your finger
  anywhere and a warm amber lantern follows: stars within the radius glow and play their pitch
  (triangle waves, C-major pentatonic C3–A4). Stars outside stay as a faint twinkle.
  Move slowly → arpeggio as individual stars enter the light. Hold still → sustained harmony.
  Sweep broadly → a moving chord across the canvas.
  **"First kids prototype about exploration and revelation."** 165 prior prototypes respond to
  explicit gestures (tap, draw, drag, rhythm). Night Garden has no buttons, no tap targets.
  The whole canvas is one gesture field; the lantern is the key. A 3yo discovers that moving
  their finger slightly reveals a new sound; an older child deliberately hunts for all 16 stars.
  Inspired by Karel's loves of `133-kids-ripple-pond` ❤️ (canvas = instrument),
  `152-kids-star-paint` ❤️ (dark sky + stars aesthetic), `100-kids-paint-song` ❤️ (gesture = music).
  For kids 3+ · Zero permissions · Zero API · Zero deps · 2.19 kB.
  Design notes: `src/app/dream/166-kids-lantern/README.md`

---

## Previous (Cycle 193 — adult build)

- **[/dream/165-cymatics](/dream/165-cymatics)** — Cymatics. `demoable`
  Chladni plate standing-wave patterns from audio. Each audio frequency resonates a
  distinct nodal-line pattern on a virtual square plate. 25 modes from simple (1,1) to
  complex (5,5) — a four-lobed cross, six-petaled flower, 50-cell symmetric grid.
  **Demo mode** sweeps a sine oscillator through all 25 modes at 3.5 s each; the pattern
  transforms continuously. **Recording mode** accepts a Resonance recording UUID →
  `/api/audio/[id]` → Karel's actual piano recordings drive mode selection in real time.
  Color follows the dominant FFT band (violet=bass, cyan=low-mid, emerald=mid, amber=high).
  **"Chladni figures are the literal physics behind the name 'Resonance.' This is what
  the app is named for — acoustic standing waves made visible."**
  Inspired by `138-lmdm-echo` ❤️ (Karel's recordings as audio input), `84-wave-fluid` ❤️
  (fluid physics visuals), `105-pluck-field` ❤️ (physical modeling). Fulfills AGENT.md
  directive: "let his existing music be the input."
  Zero permissions (demo) · Recording-ID input · Zero new deps · 3.75 kB.
  Design notes: `src/app/dream/165-cymatics/README.md`

---

## Previous (Cycle 192 — kids build)

- **[/dream/164-kids-pendulum-harp](/dream/164-kids-pendulum-harp)** — Pendulum Harp (kids). `demoable`
  Five glowing pendulums hang from a bar at the top of a dark canvas. Each pendulum
  is a different length → different natural period → different speed of oscillation.
  Each time a bob swings through the bottom of its arc it plucks a pentatonic note
  (sine wave, bell-like decay). Longer pendulum = lower note = bigger bob (BANDIMAL
  rule). Tap any pendulum to push it — tap more pendulums and their different periods
  create an emergent polyrhythm that never simply repeats. All five start displaced
  on alternating sides so the canvas immediately plays without any touch needed.
  Sparkle burst on each pluck. C3+G3 ambient pad throughout.
  **"First kids prototype where physics sets the rhythm — not the child's timing."**
  163 prior prototypes fire notes on tap/drag/draw events. Pendulum Harp fires notes
  when a physically-simulated bob reaches its natural turning point. The child adds
  energy; gravity decides when each note plays. Same surprise-discovery mechanic as
  `133-kids-ripple-pond` ❤️ (collision fires the chord) and `109-kids-bounce-notes`
  (wall bounce fires the note), but now the timing emerges from pendulum physics rather
  than collision events.
  Directly inspired by Karel's loves of `105-pluck-field` ❤️ (tactile pluck = immediate note),
  `98-kids-drum-circle` ❤️ (polyrhythm), `133-kids-ripple-pond` ❤️ (physics = music).
  For kids 3+ · Zero permissions · Zero API · Zero deps · 2.8 kB.
  Design notes: `src/app/dream/164-kids-pendulum-harp/README.md`

---

## Previous (Cycle 191 — adult build)

- **[/dream/163-paths-visualizer](/dream/163-paths-visualizer)** — Paths Visualizer. `demoable`
  Lorenz strange-attractor visualization that responds to audio in real time. The attractor
  trail is colored by frequency band (sub-bass = violet, treble = pink); bass energy drives the
  orbit scale; treble sharpens the line width. Six radial bloom gradients (one per band) pulse
  around the canvas center. A bass-onset ring expands on strong beats. **Demo mode** plays a
  synthesized piano phrase so the visualization works with zero setup. **Live mode** accepts a
  Resonance recording ID — calls `/api/audio/[id]` for a signed URL, routes the `<audio>` element
  through `MediaElementAudioSourceNode → AnalyserNode → destination`, and visualizes Karel's
  actual piano recordings from the Paths.
  **"First prototype that uses Karel's own recordings as the audio source for AV visualization."**
  Directly fulfills AGENT.md directive: "let his existing music be the input." Connected to love
  signal `138-lmdm-echo` ❤️ (Karel's piano phrase analyzed + echoed) — extends that concept to
  full-track real-time visualization.
  Demo mode · Recording ID input · Zero new deps · 2.9 kB.
  Design notes: `src/app/dream/163-paths-visualizer/README.md`

---

## Previous (Cycle 190 — kids build)

- **[/dream/162-kids-bubble-pop](/dream/162-kids-bubble-pop)** — Bubble Pop (kids). `demoable`
  Colorful glowing bubbles drift upward through a dark canvas, swaying gently. Five bubble colors
  map to five pentatonic pitches (violet=C3, emerald=E3, amber=G3, rose=A3, cyan=C4).
  **Tap any bubble to pop it** — sparkle burst (18 particles) + triangle-wave note. **Drag your
  finger** across bubbles to pop a chain and play a fast melody or glissando. Bigger bubbles
  sing lower (BANDIMAL rule: radius 52→20). Two-oscillator triangle pair (+7¢ detuning) gives
  each note warmth; lower pitches ring longer (C3 = 0.72s decay, C4 = 0.40s). Bubbles respawn
  continuously — 10 seeded at start, new one every 1.2–1.9s, cap of 14 live. C3+G3 ambient pad
  keeps the canvas alive between pops. Fade-in on spawn (500ms), pop-ring expansion animation.
  **"First prototype where destruction is the musical act."** 161 prior prototypes reward touching,
  holding, or drawing. Bubble Pop rewards the pop — the release — the burst.
  Inspired by Karel's love of `105-pluck-field` ❤️ (tactile pluck = immediate note), `95-kids-breath-bubbles`
  (bubble aesthetic, inverted mechanic), `152-kids-star-paint` ❤️ (sparkle burst visual language).
  For kids 3+ · Zero permissions · Zero API · Zero deps · 2.62 kB.
  Design notes: `src/app/dream/162-kids-bubble-pop/README.md`

---

## Previous (Cycle 189 — adult build)

- **[/dream/161-tap-rhythm](/dream/161-tap-rhythm)** — Tap Rhythm. `demoable`
  Tap any rhythm (spacebar / TAP button) — select kick/snare/hat beforehand, then tap freely.
  After 2 s of silence: BPM auto-detected (median IOI), taps quantized to nearest 16th-note
  in a **32-step circular clock face**. Three tap sessions layer kick + snare + hat. Click any
  ring dot to cycle its type. BPM slider adjusts live. Demo pattern auto-loads on open.
  **"First prototype where rhythm timing is the primary input."** 160 prior prototypes take
  pitch, spectrum, or gesture as input. This one asks: *when* are you tapping? A non-pianist
  can build a 2-bar drum groove in under a minute. Live performance tool.
  Zero permissions · Zero API · Zero deps · 3.7 kB.
  Design notes: `src/app/dream/161-tap-rhythm/README.md`

---

## Previous (Cycle 188 — kids build)

- **[/dream/160-kids-paint-loop](/dream/160-kids-paint-loop)** — Loop Garden (kids). `demoable`
  Draw a freehand glowing stroke anywhere → it immediately loops as a pentatonic melody.
  **Four color zones** give four timbres: left=violet/piano (sine, crisp attack), mid-left=amber/bells
  (sine +8¢ detune, warm decay), mid-right=teal/chime (sine −6¢ detune, shorter decay),
  right=rose/pads (sine, slow 70ms attack, long sustain). **Y position = pitch** (C-major
  pentatonic, C3 bottom → C5 top). A glowing traversal dot sweeps each stroke's path in loop.
  Up to 4 simultaneous loops. **Tap any stroke to delete it** — sparkle burst. Clear resets.
  Demo mode seeds 3 loops at canvas open so the garden is immediately alive.
  **"First kids prototype combining freehand drawing + multi-timbral loop station."**
  Inspired by Karel's love of `153-paint-compose` ❤️ (adult version), `100-kids-paint-song` ❤️,
  `111-kids-shape-loop` ❤️. Extends the drawing-as-music lineage into layered multi-timbral territory.
  For kids 3+ · Zero permissions · Zero API · Zero deps · 3.27 kB.
  Design notes: `src/app/dream/160-kids-paint-loop/README.md`

---

## Previous (Cycle 187 — adult build)

- **[/dream/159-synesthetic-sketch](/dream/159-synesthetic-sketch)** — Synesthetic Sketch. `demoable`
  Music as shape — not just color. Every audio feature maps to a different visual dimension on
  an accumulating Canvas2D: **spectral centroid → hue** (violet=low, rose=high), **spectral spread
  → shape** (circle=pure sine, triangle=slight overtones, square=mid spread, hexagon=wide spread,
  star=complex noise), **harmonic richness → inner ring count** (0–4 concentric rings),
  **amplitude → object scale**, **onset → spark burst**. Objects deposit every 4 frames with
  additive blending — overlapping shapes brighten, building a nebula-like visual record of the
  session. A 0.3%/frame fade prevents burn-in; the canvas takes ~3 min to naturally clear.
  **"First prototype to map audio to morphological shape — not just color."**
  158 prior prototypes map audio to color, fluid, particles, or geometry. None classify audio
  by *shape type*. A pure sine leaves circles; a chord leaves hexagons with inner rings; percussion
  leaves star bursts. The canvas is the acoustic biography of the session.
  Download as PNG · Demo mode (no mic) · Zero API · Zero deps · 4.28 kB.
  Influenced by Karel's loves: `153-paint-compose` ❤️ (accumulating visual artifacts),
  `130-tsl-particle-compute` ❤️ (rich visual output from audio), `84-wave-fluid` ❤️.
  Research basis: musicolors (arxiv 2503.14220, multi-dimensional synesthetic visualization).
  Design notes: `src/app/dream/159-synesthetic-sketch/README.md`

---

## Previous (Cycle 186 — kids build)

- **[/dream/158-kids-hum-paint](/dream/158-kids-hum-paint)** — Voice Painting (kids). `demoable`
  Sing or hum — your voice becomes a colored painting on a dark canvas. **High notes fly up,
  low notes drift down** (log-scale pitch → Y position). **Every pitch glows in its own hue**
  (low voice = warm amber/violet, high voice = cool cyan/rose). Amplitude controls stroke width:
  sing louder for a thicker brush. The painting accumulates in a left-to-right scroll, wrapping
  at the edge to fill the screen over a long session. Press **▶ Hear it!** — up to 56 sampled
  notes from the session play back as sine tones, replaying the session as a short melody.
  Demo mode auto-draws **Twinkle Twinkle** (no mic needed) — the visual shape of the opening
  C–C–G–G–A–A–G is recognizable as a pattern of flat stripes and jumps.
  **"First kids prototype where your voice is the paintbrush."** All 157 prior prototypes use
  touch (tap, drag, draw). This one replaces gesture with voice, unlocking vocal music-making
  without any reading or instruction. A 3yo humming randomly sees their voice trace a path;
  an older child can try to match the demo's color pattern by singing the right notes.
  Inspired by Karel's love of `100-kids-paint-song` ❤️, `152-kids-star-paint` ❤️, and the
  KIDS.md seeded idea `kids-hum-to-paint`.
  For kids 3+ · Mic optional · Zero API · Zero deps · 2.3 kB.
  Design notes: `src/app/dream/158-kids-hum-paint/README.md`

---

## Previous (Cycle 185 — adult build)

- **[/dream/157-concept-steer](/dream/157-concept-steer)** — Concept Steer. `demoable`
  A hexagonal radar chart where each of six vertices controls a named musical dimension:
  **Brightness** (filter), **Density** (BPM + voices), **Regularity** (timing jitter),
  **Complexity** (chord voicing), **Energy** (attack + gain), **Mode** (major→dim).
  Drag any vertex — the polygon reshapes and the synthesizer tracks immediately.
  Live chord name label updates as Complexity × Mode shift (C → Csus4 → Cm → Cdim9 etc.).
  Four presets: Classical Fugue, Dark Ambient, Jazz Improv, Drone.
  **"Navigate music as a space of named concepts — not moods, not knobs."**
  The six axes come from sparse autoencoder research (arxiv 2505.18186, May 2026): they are
  what music AI models actually learn internally. This UI makes those implicit axes explicit.
  Zero permissions · Zero API · Zero deps · 3.23 kB.
  Design notes: `src/app/dream/157-concept-steer/README.md`

---

## Previous (Cycle 184 — kids build)

- **[/dream/156-kids-star-connect](/dream/156-kids-star-connect)** — Constellation Song (kids). `demoable`
  Thirteen glowing stars pre-placed on a dark sky in three loose clusters. **Draw a line from one
  star to a neighboring star** — both pitches ring as a two-voice interval (triangle waves, 1.8s
  decay). **Close a triangle** (connect all three sides) → three-note chord plays with staggered
  onset, the triangle interior shimmers pale blue, and 15 colored sparkles radiate from the centroid.
  Star color encodes pitch class: violet=C, emerald=E, amber=G, rose=A, cyan=C5.
  Soft C3+G3 ambient pad throughout. ↺ Clear resets all connections.
  **"First prototype where the musical structure is hidden in the sky — the child reveals it by connecting."**
  All 155 prior prototypes produce sound from tapping, dragging, or freehand drawing. This one
  produces an interval only when you connect two existing stars (the *relationship* is the sound),
  and a chord only when three stars form a closed triangle (the *graph structure* is the music theory).
  Companion to `152-kids-star-paint` ❤️ — that one creates stars, this one reveals them.
  Inspired by Karel's love of `152-kids-star-paint` ❤️ and `148-spatial-palette` ❤️.
  For kids 3+ · Zero permissions · Zero API · Zero deps · 2.7 kB.
  Design notes: `src/app/dream/156-kids-star-connect/README.md`

---

## Previous (Cycle 183 — adult build)

- **[/dream/155-piano-hands](/dream/155-piano-hands)** — Piano Hands. `demoable`
  Canvas piano keyboard (C3–B4, 2 octaves). **Ghost fingers descend from above and press
  the keys as notes play.** Pitch class → finger hue: C=violet, E=warm-green, G=amber,
  A=rose, B=magenta. Light trail above each active finger; keys illuminate in the finger's
  hue while pressed. **Demo**: Für Elise opening, AudioContext-scheduled triangle-wave
  oscillators, fingers synced via 16ms look-ahead queue. **Mic**: autocorrelation pitch
  detection (4096-sample time-domain) each rAF frame — detected MIDI spawns a finger,
  silence for 320ms lifts all.
  **"The pitch becomes a hand — the chord is visible before you read the labels."**
  First prototype where the piano keyboard is the visual output, not a control surface.
  Inspired by PianoFlow (arXiv:2604.12856). Zero API · Zero deps · Mic optional.
  Design notes: `src/app/dream/155-piano-hands/README.md`

---

## Previous (Cycle 182 — kids build)

- **[/dream/154-kids-clap-back](/dream/154-kids-clap-back)** — Clap Back (kids). `demoable`
  A call-and-response rhythm game for 4-year-olds. The prototype plays a 4-beat pattern —
  **violet circle glows bright on active beats, dim on rests** — then turns **green** ("your turn!")
  and runs the same 4-beat clock again. Child taps the screen on the active beats. **Big sparks**
  (22 particles) for on-beat taps within ±165ms (±22% of beat); **small sparks** (9 particles) for
  off-beat taps — never wrong, always rewarded, just bigger for timing. C4/E4/G4/A4 triangle plucks.
  Four beat-indicator dots below the circle show the pattern's shape. Soft C3+G3 ambient pad.
  **5 patterns cycle from easy to syncopated**: all-4 (learn tempo) → skip-3 → skip-2 → skip-4 → backbeat (2+4 only).
  **"First kids prototype where WHEN you tap is the parameter — not what you tap or where."**
  All 153 prior prototypes reward any tap within 50ms. Clap Back rewards timing: the same tap at a
  different moment in the 750ms beat window produces a dramatically different visual response.
  The three-phase color cycle (violet/demo → green/wait → cyan/listen) gives a child a clear
  procedural cue with no text needed. Inspired by Karel's love of `98-kids-drum-circle` ❤️.
  For kids 4+ · Zero permissions · Zero API · Zero deps · 2.63 kB.
  Design notes: `src/app/dream/154-kids-clap-back/README.md`

---

## Previous (Cycle 181 — adult build)

- **[/dream/153-paint-compose](/dream/153-paint-compose)** — Paint Compose. `demoable`
  Dark canvas with 7-color palette, 3 brush sizes, BPM slider (40–160). **Paint a stroke — it
  immediately begins looping as a melody.** Stroke geometry is the musical score: Y position at each
  sampled point → pentatonic pitch (C2 bottom, C5 top); hue → waveform (warm=sawtooth, cool=sine,
  mid=triangle); X centroid → stereo pan; brush width → amplitude; arc length → note count (2–8).
  All voices loop simultaneously at the shared BPM. Flash animations travel along each stroke's note
  points, making the melody visible as a moving light sequence. Max 6 voices; oldest evicted on
  overflow — you edit by painting over. Clear resets; ↓ PNG saves the painting.
  **"What if painting and composing were the same act?"**
  Diagonal stroke = glissando. Wavy line = phrase rocking between registers. Horizontal = drone.
  Warm colors (rose/amber → sawtooth) sit forward in the mix; cool colors (cyan/blue → sine) recede.
  You mix by choosing hues.
  Inspired by ViTex (arXiv:2603.01984, Mar 2026) and Karel's love of `100-kids-paint-song` ❤️.
  Zero permissions · Zero API · Zero deps · 3.42 kB.
  Design notes: `src/app/dream/153-paint-compose/README.md`

---

## Previous (Cycle 180 — kids build)

- **[/dream/152-kids-star-paint](/dream/152-kids-star-paint)** — Star Song (kids). `demoable`
  A dark night sky with 90 twinkling background stars. **Drag anywhere** — every ~46 px of travel
  a glowing 5-pointed star appears and plays a **Karplus-Strong pluck** (bell-like string resonance,
  pre-computed 2.5 s buffer per pitch). Y position = pitch: top of screen = C5 bright, bottom =
  C3 deep; 9 pitches across C-major pentatonic. Stars connect with glowing constellation lines as
  you draw. Lift your finger to lock the constellation into the sky. After 16 s, the constellation
  **arpeggios itself** — unique pitches replay from high to low over 3 s — then fades over 3.5 s.
  Up to 6 constellations coexist simultaneously, each on its own 22.5 s lifecycle. Soft C3+E3+G3
  ambient pad throughout. Hint text fades after 9 s ("Draw across the sky ✦").
  **"First kids prototype where the path you draw persists in the sky and then sings back at you."**
  150 prior prototypes are reactive (draw → immediate sound) or ephemeral (fades immediately).
  Star Song is the first where a drawing remains visible for 22 s after you stop, then spontaneously
  sings its own arpeggio — a small surprise reward for patience and long sessions. A child who
  draws a big swooping arc from bottom-left to top-right hears a full ascending scale 16 seconds
  later. A child who makes quick dots near the top hears high plucks. The spatial memory of
  "where I drew" persists as the sound memory of "what notes I made."
  Inspired by Karel's love of `105-pluck-field` ❤️ (KS synthesis) and `100-kids-paint-song` ❤️
  (drawing = music). Combines both: KS timbre + drawing-as-music + persistent visual artifact.
  For kids 3+ · Zero permissions · Zero API · Zero deps · 2.86 kB.
  Design notes: `src/app/dream/152-kids-star-paint/README.md`

---

## Previous (Cycle 179 — adult build)

- **[/dream/151-ritual-compose](/dream/151-ritual-compose)** — Oracle. `demoable`
  Three ancient coins on a dark canvas. **Tap to toss all three simultaneously** — six times.
  Each toss produces one hexagram line: heads majority = yang (solid), tails = yin (broken).
  After six tosses the complete hexagram appears (1 of 64), with its Chinese character, King Wen
  name, and a 2-sentence poetic interpretation. Press **Generate Journey Music** → `fal-ai/lyria3/pro`
  receives a music prompt derived from the hexagram's meaning and returns 30s of ambient music that
  plays through the 6-band bloom radial visualizer. **"Re-cast"** resets everything.
  **"First prototype to treat a Resonance session as a ritual act."**
  149 prior prototypes respond in real time. Oracle requires ceremony: six deliberate taps before
  any music appears. The I Ching's 64-hexagram emotional vocabulary maps onto music surprisingly
  well — hexagram 29 (The Abysmal) → deep water resonance; hexagram 58 (The Joyous) → bright
  arpeggios; hexagram 52 (Keeping Still) → mountain silence, sustained single drone.
  ~$0.08/generation · FAL_KEY · Zero new npm deps · 9.76 kB.
  Design notes: `src/app/dream/151-ritual-compose/README.md`

---

## Previous (Cycle 178 — kids build)

- **[/dream/150-kids-beat-builder](/dream/150-kids-beat-builder)** — Beat Builder (kids). `demoable`
  A two-row, 6-step loop sequencer. **Top row = melody** (6 cool-colored dots, C major pentatonic
  C3→E4). **Bottom row = drums** (6 warm-colored dots: rose=kick, amber=snare, emerald=hi-hat,
  cyan=tom, pink=clap, violet=shaker). One sweeping cursor crosses both rows simultaneously. Tap
  any dot to light it; the cursor fires it each time it passes. BPM ±16 buttons (40–160). Clear resets
  all. Ambient C3/E3/G3 pad runs from start.
  **"First kids prototype with two simultaneous tracks — melody above, drums below."**
  All 149 prior kids prototypes use a single sound type per tap event. Beat Builder is the first
  where the child operates two independent musical layers in one grid. The emergent discovery:
  melody notes placed on the same column as a drum hit land on a percussive accent — the child hears
  this without any explanation and starts placing notes deliberately.
  Drum synthesis identical to `98-kids-drum-circle` ❤️. Sequencer grid from `145-kids-dot-seq`.
  For kids 4+ · Zero permissions · Zero API · Zero deps · 2.81 kB.
  Design notes: `src/app/dream/150-kids-beat-builder/README.md`

---

## Previous (Cycle 177 — adult research sweep)

No new prototype this cycle — adult research was 8 cycles overdue (last: Cycle 169). Scanned
arxiv (March–May 2026), fal.ai model catalog, Replicate explore, GitHub monthly trending, HN
front page. Found **6 findings (§§209–214)** in RESEARCH.md. Seeded **3 new prototype ideas**
in IDEAS.md. Freshest find: I-Ching Music System (arXiv:2605.20386, May 2026). Most buildable
next seed: `150-ritual-compose` (I-Ching → Lyria, FAL_KEY ready, one cycle). Key research
insight: abstract AV scientifically outperforms realistic video at concert emotional peaks
(§210) — validates Resonance's design thesis.

Next: **Cycle 178 → kids build** (178%2=0). Check KIDS.md for queue.

---

## Previous (Cycle 176 — kids build)

- **[/dream/149-kids-color-mix](/dream/149-kids-color-mix)** — Color Mix (kids). `demoable`
  Three large colored circles on a dark canvas — rose (C3), amber (E3), violet (G3) — placed
  in a triangle. **Drag any circle** to move it. When two circles overlap their colors blend
  (screen compositing: rose+amber=orange, rose+violet=magenta, amber+violet=warm green) and
  their notes get louder together. When all three converge: the overlap zone glows **bright
  white** and a full C major chord rings out. The visual peak and auditory peak are simultaneous.
  Each isolated circle breathes with a gentle ±5px pulse to signal it's alive and waiting.
  Gain transitions via `setTargetAtTime(τ=50ms)` — no pops. Faint C/E/G labels inside each
  circle for parents; invisible to kids in play mode.
  **"First kids prototype where the proximity between three distinct objects IS the music."**
  All 47 prior kids prototypes respond to single-object events (tap, drag, hold, draw).
  This is the first where the relationship between three moveable objects is the primary
  musical parameter. A child discovers color theory and music theory as the same interaction.
  For kids 3+ · Zero permissions · Zero API · Zero deps · 2.0 kB.
  Design notes: `src/app/dream/149-kids-color-mix/README.md`

---

## Previous (Cycle 175 — adult build)

- **[/dream/148-spatial-palette](/dream/148-spatial-palette)** — Spatial Palette. `demoable`
  Full-screen dark canvas with colored synthesis voice dots. **Drag any dot** — X axis is stereo
  pan (left=hard left, right=hard right), Y axis is pitch (top=C6, bottom=C2, one row per
  semitone). Drag the E4 dot down one row → chord label flips "C" → "Cm" instantly. **Scroll
  over a dot** → brighter/drier or darker/wetter (lowpass filter fc 200→8000 Hz + reverb send).
  **Double-click** → cycles waveform: sine → triangle → sawtooth → square. **Long-press** →
  removes voice with fade-out. **Click empty canvas** → adds a new voice at that pitch/pan
  (up to 8 total). Pre-placed C major triad on open. Shared 2.5s reverb IR. Composite
  waveform scope strip at the bottom. Chord name (24 major/minor templates) updates live.
  **"Position is music. Drag the E4 one row down to hear your major chord go minor."**
  First prototype where the musical relationship between voices is spatially visible: a minor third
  is literally one row closer than a major third on the semitone grid. The canvas makes interval
  theory tactile. Inspired by CHI 2026 6DoF gesture mixing research (spatial sculpting >
  sliders for musical expressivity).
  Zero permissions · Zero API · Zero deps · 3.87 kB.
  Design notes: `src/app/dream/148-spatial-palette/README.md`

---

## Previous (Cycle 174 — kids build)

- **[/dream/147-kids-beat-pulse](/dream/147-kids-beat-pulse)** — Beat Pulse (kids). `demoable`
  A large glowing circle pulses at a steady BPM. Each beat: the circle flashes a pentatonic color
  (C3→E3→G3→A3→C4 cycling), a quiet metronome pluck fires, and the note name briefly appears
  inside the circle. **Tap anywhere** — sparks fly and a louder note plays. **On-beat taps**
  (within ±154ms at 70 BPM) produce 20 sparks + a secondary burst from the circle center; off-beat
  taps produce 9. No score, no fail state. A thin progress arc sweeps clockwise once per beat,
  giving an advance cue. BPM +/− buttons (±10, 40–120 BPM).
  **"First kids prototype about temporal attention — tapping with a pulse, not just tapping."**
  46 prior kids prototypes reward any tap, regardless of timing. Beat Pulse rewards *when* you tap —
  via a non-judgmental bigger-sparkle gradient. A 3yo enjoys the sparks; a 5yo chases the beat.
  Inspired by Karel's love of `98-kids-drum-circle` ❤️ (rhythm) and the "tempo and body" seed
  from Cycle 172 KIDS.md learnings.
  For kids 3+ · Zero permissions · Zero API · Zero deps · 2.81 kB.
  Design notes: `src/app/dream/147-kids-beat-pulse/README.md`

- **[/dream/135-kids-wheel-song](/dream/135-kids-wheel-song)** — Wheel Song (kids). `demoable` ✨ polished Cycle 174
  *Added*: note-name flash above the golden striker. When a colored segment passes through
  12-o'clock, the note name (C3, E3, G3, A3, or C4) appears in white (75% opacity) above the
  striker tip, fading over 600ms. Fires on the startup chime too. Makes the prototype gently
  educational — a parent can name the notes; the child just taps and hears music. 12-line edit.
  Deferred 14 kids cycles (since Cycle 160) — finally landed.

---

## Previous (Cycle 173 — adult build)

- **[/dream/146-eco-bloom](/dream/146-eco-bloom)** — Eco Bloom. `demoable`
  A procedural rainforest grows before you. Three tree species (20°/30°/40° branch angle, depth 6/5/4)
  unfold simultaneously from seeds at the canvas bottom using recursive L-system branching. Each new
  branch segment plays a **Karplus-Strong pluck** (physical string model: delay-line feedback on seeded
  noise). Depth maps to pitch — shallow trunks = low register, fine terminal twigs = high. All pitches
  C-major pentatonic; three simultaneous trees = three-voice polyphony that's always consonant.
  Leaf clusters accumulate at terminal branches, rotating gently in virtual wind. Background fades from
  near-black toward deep forest green as canopy density increases. **Rain toggle** (white noise through
  lowpass 1.1 kHz). **Bird calls toggle** (rapid 5-note arpeggio every 8 s, appears after ~18 s).
  **"First prototype where patient growth over time is the primary musical metaphor."** 142 prior
  prototypes were reactive or event-driven. Eco Bloom rewards watching. Tap canvas to plant more trees
  (max 6). Clear resets to fresh seeds. Directly inspired by Refik Anadol's DATALAND: Machine Dreams:
  Rainforest (opening June 20, 2026 — 26 days away at build time). Zero permissions · Zero API · Zero deps · 3.27 kB.
  Design notes: `src/app/dream/146-eco-bloom/README.md`

---

## Previous (Cycle 172 — kids build)

- **[/dream/145-kids-dot-seq](/dream/145-kids-dot-seq)** — Dot Sequencer (kids). `demoable`
  Six glowing colored dots in a row (C major pentatonic: violet=C3 → rose=E4). A bright white
  cursor sweeps left to right continuously. **Tap any dot to light it up** — when the cursor
  passes a lit dot, that note plays. Tap again to turn it off. The result is a one-bar loop
  that plays forever at the current BPM. +/− buttons adjust speed (40–160 BPM in 16 BPM steps).
  Full-column tap zones (canvas height × column width) give generous hit targets. All pentatonic
  combinations are consonant — no wrong patterns.
  **"First kids prototype where the child constructs a musical pattern that then plays itself."**
  All 144 prior prototypes are reactive (tap → immediate note) or event-driven. This is the
  first where a child builds a looping composition by deliberate gesture, then observes it play.
  Different cognitive mode: composition over performance. Inspired by Karel's love of
  `98-kids-drum-circle` ❤️ (rhythm) and `111-kids-shape-loop` ❤️ (additive layering).
  For kids 4+ · Zero permissions · Zero API · Zero deps · 2.15 kB.
  Design notes: `src/app/dream/145-kids-dot-seq/README.md`

---

## Previous (Cycle 171 — adult build)

- **[/dream/144-sa3-journey](/dream/144-sa3-journey)** — SA3 Journey. `demoable`
  Two-mode Stable Audio 3 prototype. **Mode A — Write Journey**: pick one of 8 Resonance journey
  themes (Cosmic Homecoming, Earth Grounding, Inner Sanctuary, Ocean Breath, Snowflake, Ghost,
  Inner Fire, Mycelium Dream), edit the prompt, choose 2/4/6 min → SA3 generates up to 6 minutes
  of coherent ambient journey music. **Mode B — Extend Your Playing**: record 5–30 s of piano via
  mic → SA3 treats it as a causal prefix and generates a musical continuation. Amber waveform =
  your recording; blue waveform = AI continuation. Six-band bloom visualizer plays during output.
  Download button. **"The first prototype that breaks the 30-second generation ceiling."**
  All prior generation prototypes top out at 30–90 s. SA3 Large (released May 20, 2026) makes
  6-minute coherent ambient music feasible in a single generation pass.
  Note: fal.ai SA3 endpoint may still be in partner-access rollout; error is surfaced clearly.
  FAL_KEY required · ~$0.20–0.50/generation · Zero new npm deps · 4.87 kB.
  Design notes: `src/app/dream/144-sa3-journey/README.md`

---

## Previous (Cycle 170 — kids build)

- **[/dream/143-kids-seed-song](/dream/143-kids-seed-song)** — Seed Song (kids). `demoable`
  Tap anywhere on a dark forest canvas to plant a glowing seed. A procedural tree grows from
  the tap point over ~20 seconds: violet trunk sprouts, indigo forks appear, sky-blue branches
  split, emerald twigs extend, amber tips bloom with fluttering leaves. **Each branch plays a
  Karplus-Strong pluck as it reaches its tip** — C3 from the trunk rising to C4 at the tips,
  all C-major pentatonic. Plant up to 4 seeds; their trees grow and sing simultaneously in
  gentle harmony. Soft wind layer throughout. Leaves flutter with slow sinusoidal drift.
  **"First kids prototype where the reward is patient growth over time — plant once, watch and listen for 20 seconds."**
  Inspired by Refik Anadol's *Machine Dreams: Rainforest* (DATALAND, June 20, 2026).
  For kids 4+ · Zero permissions · Zero API · Zero deps · 2.5 kB.
  Design notes: `src/app/dream/143-kids-seed-song/README.md`

---

## Previous (Cycle 168 — kids build)

- **[/dream/142-kids-echo-canon](/dream/142-kids-echo-canon)** — Echo Canon (kids). `demoable`
  Tap out a melody (up to 8 notes, X = pitch across C3–C4 pentatonic). After 1.5s silence,
  the phrase echoes back as a **three-voice canon**: amber (you), blue (+perfect fifth),
  violet (+octave). Voices start 550ms apart — they overlap, creating genuine polyphony.
  Visual: dots rise upward per voice (higher pitch = higher on screen). Audio scheduled via
  Web Audio precise timing; sparks triggered by rAF `currentTime` check.
  **"First kids prototype where your own melody echoes back as polyphony."**
  For kids 3+ · Zero permissions · Zero API · Zero deps · 2.55 kB.
  Design notes: `src/app/dream/142-kids-echo-canon/README.md`

---

## Previous (Cycle 167 — adult build)

- **[/dream/141-chord-canvas](/dream/141-chord-canvas)** — Chord Canvas. `demoable`
  Play any chord into the mic — it appears instantly as a large glowing name (C, F♯m, Bdim)
  and paints a colored block on a scrolling 30-second timeline. Hue = root pitch class
  (C=violet, cycling chromatically); saturation = quality (major=vivid, minor=desaturated).
  A 12-bin chromagram at the bottom shows which pitch classes are active; active chord tones
  (root, third, fifth) highlight brighter with a colored underline.
  **First prototype to name musical structure.** 140 prior prototypes react to audio signal
  properties — energy, spectrum, pitch. This one says "that's an F♯ minor." Algorithm: chroma
  extraction (C2–A♯6), template matching against 24 triad templates, 5-frame stability filter.
  Demo mode: ii–V–I in C (Dm → G7 → C repeating) shows the timeline writing a chord chart.
  Zero deps · Zero API · mic optional · 3.4 kB.
  Design notes: `src/app/dream/141-chord-canvas/README.md`

---

## Previous (Cycle 166 — kids build)

- **[/dream/140-kids-string-bridge](/dream/140-kids-string-bridge)** — String Bridge (kids). `demoable`
  Hold two fingers on the dark canvas — a glowing string stretches between them and sings.
  **Closer fingers = shorter string = higher note** (same physical law as guitar/kalimba).
  Moving fingers >12 px "plucks" the string (triangle wave, 12ms attack, 450ms decay).
  Visual: standing-wave animation — fundamental mode shape `sin(π×t)×cos(2π×phase)`, vibration
  rate proportional to pitch (0.8 Hz at C2, 5.5 Hz at C5). Color shifts violet→amber with pitch.
  Single finger anchors at canvas center for solo thereminvox play — pulling away lowers pitch,
  approaching raises it. 3-octave C-major pentatonic (C2–C5, 13 steps). Faint note-name label
  fades with the vibration. Amplitude floor 0.18 while held; faster fade on release.
  **"The gap between your fingers is the instrument."** First kids prototype where the
  *relationship* between two simultaneous touch points IS the musical parameter — not position,
  duration, path, or physics of individual contacts.
  For kids 4+ · Zero permissions · Zero API · Zero deps · 2.86 kB.
  Design notes: `src/app/dream/140-kids-string-bridge/README.md`

---

## Previous (Cycle 165 — adult build)

- **[/dream/139-mood-xy](/dream/139-mood-xy)** — Mood XY. `demoable`
  Drag a dot across a **valence × arousal** canvas (Russell circumplex model). The music
  changes in real time: BPM 40→140, note duration 3 s pads → 0.24 s staccato, chord quality
  diminished→minor→major, root C2→E3, filter 150→4500 Hz. Background bilinearly blends
  deep indigo (calm·sad) ↔ dark emerald (calm·happy) ↔ dark rose (excited·sad) ↔ dark amber
  (excited·happy). 9-second glowing trail marks your emotional journey through the session.
  **"Set where you want to be. The music takes you there."**
  Zero deps · Zero API · Zero permissions · 2.63 kB.
  Design notes: `src/app/dream/139-mood-xy/README.md`

---

## Previous (Cycle 164 — kids polish)

- **[/dream/133-kids-ripple-pond](/dream/133-kids-ripple-pond)** — Ripple Pond (kids). `demoable` ✨ polished Cycle 164
  *Added*: **stone-drop animation** — two quick inner rings (0→28 px and 0→15 px) plus a shrinking white centre dot appear at the tap point for 350 ms, showing the stone entering water before the main ripple takes over. *Added*: **edge-bounce rings** — when a ripple reaches a screen wall, a reflected ghost ring spawns from the image-source position (virtual source mirrored across that wall) and expands at 38% opacity. Each ripple can bounce from all four walls; bounce rings don't trigger collisions. The pond now feels physically bounded. *Fixed*: hint text opacity bumped 0.30 → 0.58.

---

## Previous (Cycle 163 — adult build)

- **[/dream/138-lmdm-echo](/dream/138-lmdm-echo)** — Echo Chamber. `demoable`
  Record a piano phrase (up to 15 seconds). While you play, real-time harmonic analysis accumulates: 12-bin chroma vector → chord quality (major/minor/neutral), onset detection → BPM estimate, spectral centroid → register (low/mid/high). After you stop, the three features combine into an ACE-Step style prompt and generate a 30-second AI piano echo. Both tracks play back simultaneously — your original panned left (−35°), the AI echo panned right (+35°) — through a shared six-band bloom visualizer. Waveform strips show both tracks with a live progress cursor.
  **"The echo responds to the musical meaning of the phrase, not its timbre."** Inspired by the "generative delay" concept from arXiv:2605.22717: AI-generated music as an expressive delay unit — you play, the system processes harmonic meaning, a transformed version returns. Unlike `44-vocal-bgm` (audio-to-audio seeding), this uses text-to-audio where the prompt is derived from analysis. Unlike `33-aria-companion` (immediate Markov note response), this waits for a complete phrase then delivers a longer AI reply.
  Mic required · FAL_KEY required · ACE-Step $0.006/30s.
  Design notes: `src/app/dream/138-lmdm-echo/README.md`

---

## Previous (Cycle 162 — kids build)

- **[/dream/137-kids-hold-glow](/dream/137-kids-hold-glow)** — Hold & Glow (kids). `demoable`
  Hold anywhere on a dark screen. A glowing orb of light appears at your touch — the longer you hold, the brighter and wider it grows (core radius 28 → 92 px over 4 seconds; halo 22% → 50% opacity). Release: the glow "exhales" as a fading ring expands outward. Ring size and speed scale with hold duration — long holds launch big fast rings, quick taps leave small slow ones. Five left→right color zones map to C-major pentatonic (violet=C3, rose=E3, amber=G3, emerald=A3, cyan=C4). Multi-touch: up to 5 simultaneous orbs = 5-note chord. Hint text visible when pond is empty.
  **"First kids prototype where hold-duration is the musical parameter."** All 35 prior kids prototypes respond to tap-down events (tap, drag, draw, tilt). This one rewards stillness. The two-phase breath structure — tension while holding (glow grows), exhale on release (ring expands) — is completely new to the zone. Contemplative, headphone-beautiful, suitable before sleep. Loved prototypes `100-kids-paint-song` and `104-kids-mirror-draw` (both involve sustained deliberate gesture) inspired the direction.
  For kids 3+ · Zero permissions · Zero API · Zero deps · 2.17 kB.
  Design notes: `src/app/dream/137-kids-hold-glow/README.md`

---

## Previous (Cycle 161 — adult build)

- **[/dream/136-kali-sustain](/dream/136-kali-sustain)** — Kali Sustain. `demoable`
  A C2 root drone cycling through six just-intonation intervals: **Perfect Fifth (3∶2)** → **Perfect Fourth (4∶3)** → **Major Third (5∶4)** → **Minor Third (6∶5)** → **Harmonic Seventh (7∶4)** → **Whole Tone (9∶8)** → repeat. Each interval holds for 12 seconds then glides to the next over 12 seconds — 144s total cycle. Four audio voices: root sine, sub-Hz LFO for beating, harmony sine tracking the current ratio, quiet octave warmth. **Mic mode** detects your sung pitch via autocorrelation and retunes the entire drone to your voice. Ratio clock visual shows all six intervals as nodes on a circle; a glowing dot sweeps clockwise through them; inner arc tracks hold vs. glide phase. Background hue blends between interval color palettes.
  **"The first prototype where the interval itself is the subject."** Previous harmonic prototypes (`105-pluck-field`, `107-ocean-presence`) use harmony as texture. Kali Sustain makes the ratio the foreground: you watch and hear exactly which interval is sounding and when it changes. The 7∶4 harmonic seventh sits outside 12-TET and always surprises. Inspired by Kali Malone's pipe organ just-intonation work.
  Demo mode (C2 root) · Mic mode (autocorrelation) · Zero API · Zero deps · 2.95 kB.
  Design notes: `src/app/dream/136-kali-sustain/README.md`

---

## Previous (Cycle 159 — adult build)

- **[/dream/134-anemone-av](/dream/134-anemone-av)** — Anemone. `demoable`
  A bioluminescent sea anemone rendered in Three.js R3F. Eight cyan/violet tentacle arms radiate from a glowing central stalk, animated by sinusoidal LFOs modulated by audio: **sub-bass sways the entire organism**, low-mid spreads the tentacles outward, **high-mid flickers the glowing tips**, onsets pulse the whole body +9% for 80ms. Crown ring of 6 sky-blue spheres at the top of the stalk. Bloom post-processing from `@react-three/postprocessing`. Demo mode breathes with internal LFOs; mic mode makes it fully reactive to live sound. Dark background, no UI chrome during playback.
  **"The first intentionally organic 3D form in the sandbox."** Previous 3D prototypes (`130-tsl-particle-compute`, `106-beat-cut`, `75-houdini-particle-flock`) are mathematical/geometric. Anemone reads as alive — it breathes even when silent. Direct response to Karel's love of `130-tsl-particle-compute`.
  Zero new deps (three@0.182, R3F, @react-three/postprocessing all pre-installed) · WebGL required · 3.99 kB.
  Design notes: `src/app/dream/134-anemone-av/README.md`

---

## Previous (Cycle 158 — kids build)

- **[/dream/133-kids-ripple-pond](/dream/133-kids-ripple-pond)** — Ripple Pond (kids). `demoable`
  Tap anywhere on a dark ocean canvas to drop a stone — a glowing ripple ring expands outward at 65 px/s and plays a pentatonic note (X position → pitch: violet=C3 left, cyan=C4 right). **When two ripples first meet**, a white flash blooms at the collision point and a chord plays from both constituent notes. Multi-touch: each finger drops its own ripple. The whole-screen is the instrument — no buttons to find, no wrong taps. The physics of wave interference teaches itself through play: drop two stones far apart, watch the rings spread, wait for the moment they touch and sing together.
  **"Two rings meet — and the pond makes a chord."** First kids prototype about wave interference. Related family: `90-kids-puddle-jumper` (single-ring splash); `109-kids-bounce-notes` (physics-makes-music autonomous).
  For kids 3+ · Zero permissions · Zero API · Zero deps · 2.62 kB.
  Design notes: `src/app/dream/133-kids-ripple-pond/README.md`

---

## Previous (Cycle 157 — adult build)

- **[/dream/132-shepard-tone](/dream/132-shepard-tone)** — Shepard Tone. `demoable`
  Eight sine waves across eight octaves, each fading in at the bottom of the audible range and out at the top. All eight glide upward together. Result: **an auditory illusion of a tone that ascends forever without ever resolving**. Discovered by Roger Shepard (1964) — the most famous auditory illusion in music. RATE slider (0.5–30 BPM), Ascending/Descending toggle, three modes: Glide (smooth), Whole-tone (6 discrete steps per octave — you hear the major whole-tone scale ascending), Semitone (12 steps — slower, textbook-clear). Freeze button holds the current 8-oscillator chord. Phase ring (bottom-right) orbits once per octave traversal; center shows current note name (A, Bb, B, C...). Canvas: 8 glowing circles (A1=bottom, A8=top), brightness/size ∝ bell-curve gain, hue cycles violet→rose→amber as each octave completes.
  **"A tone that climbs forever. The staircase has no top floor."** First psychoacoustics/auditory illusion prototype in the sandbox. Resonance angle: the Shepard tone proves perceptual ascent can be unbounded — the listener travels far without going anywhere. That IS the journey thesis.
  Headphones recommended · Zero permissions · Zero API · Zero deps · 2.6 kB.
  Design notes: `src/app/dream/132-shepard-tone/README.md`

---

## Previous (Cycle 156 — kids build)

- **[/dream/131-kids-orbit](/dream/131-kids-orbit)** — Orbit Garden (kids). `demoable`
  Five glowing planets orbit a central sun, each on its own ring. **Tap any ring** → a planet appears at your tap angle, plays its note (triangle + 2nd harmonic, reverb tail), and begins orbiting. Inner planets spin faster and sing higher (C4/3.5s period); outer planets are slow and low (C3/13s). Each planet plays its note again on every completed orbit — place all five and listen to the polyrhythm build. Tap an occupied ring to teleport its planet to a new angle and retrigger its note. **"Clear"** button resets everything. No reading required; the five orbit rings are visible as faint dashed circles the moment you start.
  **"Five rings. Five notes. Each planet makes its own rhythm — together they make music that's impossible to predict."** First kids prototype about polyrhythm-from-physics (joins `109-kids-bounce-notes` and `83-kids-tilt-rain` in the "physics autonomously makes music" family).
  For kids 3+ · Zero permissions · Zero API · Zero deps · 2.83 kB.

---

## Previous (Cycle 155 — adult build)

- **[/dream/130-tsl-particle-compute](/dream/130-tsl-particle-compute)** — Lorenz Attractor (WebGPU Compute). `demoable`
  50,000 particles simulated on the GPU via a WGSL compute shader, each following the Lorenz strange attractor equations. The attractor naturally collapses into its iconic butterfly shape within seconds. **Audio reactive**: microphone bass → σ (chaos width), treble → ρ (energy), onsets → turbulence kick. Demo mode oscillates σ and ρ with slow LFOs so it's always alive without a mic. Orbit with mouse or touch. Color gradient: slow particles = violet, mid = emerald, fast = cyan. Additive blending makes dense regions brighten. Falls back gracefully if WebGPU is unavailable.
  **"50,000 particles. One equation. Everything chaotic, nothing random."** First compute-shader prototype in the sandbox — GPU physics at 60fps.
  WebGPU required · Zero permissions · Zero API · Zero deps · ~400 lines.

---

## Previous (Cycle 154 — kids polish)

**Polish pass**: three queued improvements shipped together.

- **[/dream/127-kids-starfish](/dream/127-kids-starfish)** — Starfish Garden (kids). `demoable` ✨ polished Cycle 154
  *Added*: tap-ripple ring — an expanding colored circle radiates from the tap point on each starfish hit, fading over 300ms. Makes the interaction location visible on large iPad screens. Previously the only feedback was the starfish wiggle + chord sound.

- **[/dream/128-kids-fish-tap](/dream/128-kids-fish-tap)** — Fish School (kids). `demoable` ✨ polished Cycle 154
  *Added*: splash ring — a brief expanding circle (62px max radius, 250ms) appears at the fish's position when tapped, in the fish's own color. Combined with the mouth-open animation, the fish now has two simultaneous visual feedback signals.

- **[/dream/82-kids-color-piano](/dream/82-kids-color-piano)** — Color Piano (kids). `demoable` ❤️ Karel loved · ✨ polished Cycle 154
  *Fixed*: hint text "tap · hold · slide" bumped from 55% → 75% opacity. Queued since Cycle 114 — finally done.

---

## Previous (Cycle 153 — adult build)

- **[/dream/129-lyria3-journey](/dream/129-lyria3-journey)** — Ghost Scenes / Lyria 3 Journey. `demoable`
  Six scenes from the Ghost journey (Stone Chamber, Root Portal, Underground Pool, Tiny Planet, Forest Dawn, Cosmic Ascension), each with a pre-written music prompt. Click "Generate" on any scene → `fal-ai/lyria3/pro` synthesizes 30 s of ambient music ($0.08/scene via FAL_KEY) → "▶ Play" through the six-band bloom visualizer. "↺" re-generates the same scene with a new random seed. Prompts are editable. Duration + BPM shown when playing.
  Key difference from `126-arc-steer` (linear journey): scenes here are a **vocabulary**, not a sequence — generate whichever scene you're curious about, in any order. The bottom progress strip shows all six scenes' states simultaneously (idle/generating/ready/playing) with each scene's color.
  **FAL_KEY required · ~$0.08/generation · zero new npm deps.**

---

## Previous (Cycle 152 — kids build)

- **[/dream/128-kids-fish-tap](/dream/128-kids-fish-tap)** — Fish School (kids). `demoable`
  Seven glowing fish swim in a loose boids school, drifting rightward across a dark ocean canvas with caustic shimmer and ambient pad. **Tap any fish** → it briefly stops, opens its mouth, plays a pentatonic note (triangle wave + reverb), then the boid forces naturally reabsorb it into the school. Each fish is a fixed pitch: violet=C3 (lowest), rose=G4 (highest) — color is the sonic label. Multi-touch: tap two fish at once for two simultaneous notes. School always moving — the canvas is never static. Body waggle (±7° oscillation) gives each fish its own tail-driven swimming rhythm.
  **"The fish sings when you catch it — then swims back to its friends."** First kids prototype with emergent group behavior (boids) as the play mechanic.
  For kids 4+ · Zero permissions · Zero API · Zero deps · 2.65 kB.

---

## Previous (Cycle 150 — kids build)

- **[/dream/127-kids-starfish](/dream/127-kids-starfish)** — Starfish Garden (kids). `demoable`
  Five glowing starfish rest on an ocean floor. **Touch any starfish** → it wiggles (arms ripple outward in a decaying wave) and plays a full 5-note pentatonic chord (all five notes sound simultaneously, ~900ms reverb tail). Each starfish plays a different chord: violet (biggest, left) = C3 cluster; pink = E3 cluster; amber (biggest overall) = G3 cluster; emerald (smallest) = A3 cluster; blue = C4 cluster. Bigger starfish = lower chord — size maps to pitch register without any label. Tapping multiple starfish at once plays multiple chords. All combinations are within C-major pentatonic: no dissonance possible. Ocean-floor background: seaweed sways with slow `sin()` drift, 10 micro-bubbles rise continuously, sandy floor gradient at the bottom.
  **First kids prototype where one tap = a full chord.** All 25 prior kids prototypes play single notes on tap; this adds harmonic depth.
  For kids 4+ · Zero permissions · Zero API · Zero deps · 2.50 kB.

---

## Previous (Cycle 149 — adult build)

- **[/dream/126-arc-steer](/dream/126-arc-steer)** — Arc Steer. `demoable`
  Six-phase Resonance journey arc realized as sequential AI-generated music. Each phase is 30 s of ACE-Step output: **Opening** (sparse piano, vast reverb, 28 BPM) → **Descent** (minor arpeggios, cello drone, 55 BPM) → **Awakening** (ethereal pads, harmonic widening, 80 BPM) → **Peak** (full orchestral climax, 112 BPM) → **Integration** (bittersweet resolution, 70 BPM) → **Return** (single piano, near-silence, 25 BPM). All six phase prompts are editable before starting. Press **▶ Begin Journey** → phases generate and play sequentially (one at a time — each generates then plays before moving to the next). Bloom visualizer responds to each phase's audio. Phase timeline at the bottom advances live. Stop anytime. Reset to re-run with edited prompts.
  **"What does the 6-phase arc sound like? Edit these 6 lines and find out."** First prototype that turns the abstract journey arc concept into heard, AI-generated music — directly answers Karel's `5-arcs` question with audio.
  FAL_KEY required · ~$0.04 / full journey · Zero new deps · 3.75 kB.

---

## Previous (Cycle 148 — kids build)

- **[/dream/125-kids-jellyfish](/dream/125-kids-jellyfish)** — Jellyfish Song (kids). `demoable`
  Five translucent jellyfish drift upward through a deep ocean canvas, each on a sinusoidal wobble path with its own phase and speed. **Touch any jellyfish** — it flashes, flies away from your finger, and sings a reverb-soaked bell tone. Each jellyfish is a fixed pitch in C-major pentatonic: biggest (violet, radius 46px) = lowest (C3), smallest (teal, radius 22px) = highest (C4). The physical size→pitch mapping (BANDIMAL's bar-height rule) teaches itself without text. Jellyfish wrap top-to-bottom so the ocean is never empty. Autonomous drift keeps it alive between touches. Multi-touch OK.
  For kids 4+ · Zero permissions · Zero API · Zero deps · 2.66 kB.

---

## Previous (Cycle 147 — adult build)

- **[/dream/124-image-chord](/dream/124-image-chord)** — Image Chord. `demoable`
  Drop any photo, screenshot, or artwork → JS samples a 64×64 thumbnail, builds a weighted hue histogram, and reads out dominant H/S/L. The mapping: **hue → chord quality** (warm reds = C major, yellows = C7, greens = Cm, cyan = Cm7, violet = Cmaj7, magenta/purple = Cdim); **saturation → harmonic richness** (near-grey image = 1 pure sine; vivid image = 4 triangle-wave voices with slight detuning); **brightness → register + tempo** (dark = bass C2 at 35 BPM, bright = treble C5 at 120 BPM). The chord arpeggios continuously; a 6-band bloom ring animates to the synth output. **8 journey-palette swatches** (Cosmic, Earth, Sanctuary, Ocean, Snowflake, Ghost, Fire, Mycelium) for instant exploration — no image needed. Chord name displayed in large monospace over the bloom.
  Zero permissions · Zero API · Zero deps · 3.58 kB.

---

## Previous (Cycle 146 — kids polish)

- **[/dream/116-kids-bloom-garden](/dream/116-kids-bloom-garden)** — Bloom Garden (kids). `polished`
  *(See Cycle 138 entry below for full description.)* Cycle 146 added a growing violet press-ring — a progress arc sweeps clockwise during the 480ms hold, so users always know "keep holding."

---

## Previous (Cycle 145 — adult build)

- **[/dream/123-landscape-resonance](/dream/123-landscape-resonance)** — Landscape Resonance. `demoable`
  Audio-reactive 3D terrain fly-through rendered in raw WebGL + GLSL (no Three.js). A ray-marched heightfield derived from 5-octave FBM value noise. **Bass lifts mountains**: louder playing = towering peaks, the camera rises to match so they loom at the screen edges. **Treble adds surface roughness**: a second noise octave makes the terrain more jagged at high frequencies. **Onsets** trigger a 100ms blue-white lightning flash. **Fog** thickens with overall amplitude (quiet = clear far horizon, loud = atmospheric blur). Color gradient: deep violet valleys → emerald slopes → near-white peaks; the entire gradient shifts dynamically with bass scale. Forward fly-through speed: 0.38 units/sec (a full terrain feature takes ~47 seconds — deliberately slow and meditative). Demo mode: three LFO oscillators (55/180/440 Hz) with amplitude-modulating sub-LFOs create a slow breathing terrain without mic. Live performance: bass-driven mountain peaks on a projector screen would be genuinely cinematic.
  Zero permissions · Zero API · Zero deps · 3.63 kB · WebGL required.

---

## Previous (Cycle 144 — kids build)

- **[/dream/122-kids-firefly-song](/dream/122-kids-firefly-song)** — Firefly Song (kids). `demoable`
  Ten glowing fireflies drift across a dark canvas, each carrying a pentatonic note. **Touch a firefly** — it flashes brighter and sings its note while following your finger. **Lift your finger** — it scatters in a new direction. Catch two or three simultaneously for an instant chord. Each firefly has a unique color (violet → rose, mapping low → high pitch on the C-major pentatonic scale). The "chase" interaction introduces intentional aiming without a fail state — miss a firefly and a sparkle note plays, and a new firefly appears nearby. Fireflies drift in slowly-curving Lissajous paths with gentle wall bounces and mild pointer repulsion (they sense your finger and ease away). Soft ambient C+E+G pad keeps it from going silent.
  Zero permissions · Zero API · Zero deps · 2.84 kB.

---

## Previous (Cycle 143 — adult build)

- **[/dream/121-loop-station](/dream/121-loop-station)** — Loop Station. `demoable`
  Four-slot live loop station. Pick bar count (1/2/4) → tap REC → play → tap STOP → it loops, phase-locked to the beat grid. Each slot has a live waveform with a sweeping playhead, MUTE and CLEAR controls, and independent bar counts. First prototype where you actively *construct* a composition over time rather than reacting. "Load Demo Loops" generates a C2 drone + piano arpeggio + high figure + kick/snare for an instant layered performance without mic. BPM tap tempo adjusts bar length for new recordings.
  Live performance tool · Zero API · Zero deps · 4.07 kB.

---

## Previous (Cycle 142 — kids build)

- **[/dream/120-kids-rain-drum](/dream/120-kids-rain-drum)** — Rain Drum (kids). `demoable`
  Four weather clouds drop pentatonic notes from the sky. Each cloud has its own pitch (C3, E3, G3, A3) and its own physics: rain (fast teardrops, quick plunk), snow (slow flakes, sine sustain), leaves (tumbling ellipses, warm tone). Tap any cloud to cycle its weather. All four pitches are pentatonic-consonant — any combination sounds musical. Zero permissions · Zero deps · 2.78 kB.

---

## Previous (Cycle 141 — adult build)

- **[/dream/119-poem-fluid](/dream/119-poem-fluid)** — Poem Fluid. `demoable`
  A WebGL Navier-Stokes fluid sim where the **turbulence state of the water drives a Markov chain text layer**. Start in **Still water** mode: the canvas is near-black, dark teal wisps drift slowly, and full Ghost-narrative sentences surface one at a time — "The water remembers every sound that has passed through this place." Now **drag your finger** to stir. The turbulence score rises; sentences fragment into phrases, then single words, then a cascade of fragments at different positions. Release — the fluid stills — and sentences begin to surface again. Add mic: audio onsets spike turbulence (beat = shatters a sentence into words), bass drives pressure pulses that add swirling velocity to the water.
  Inspired by Memo Akten & Katie Hofstadter's *The Thinking Ocean* (Whitney Museum Artport, 2026): generative text that lives in the physical state of the fluid, not on top of it.
  Zero API · Zero deps · 6.5 kB.

---

## Previous (Cycle 140 — kids build)

- **[/dream/118-kids-mirror-melody](/dream/118-kids-mirror-melody)** — Mirror Melody (kids). `demoable`
  A split canvas: rose on the left, cyan on the right. **Draw on either half** — glowing dots trail your finger and play a pentatonic note in real time (Y=pitch, top=high). The **mirror path appears instantly** on the opposite half in the complementary color, playing the same note panned to the other ear. Two-voice stereo duet from a single gesture. Paths accumulate and fade over 7 seconds; a soft ambient C–G–C pad fills any silence. Multi-touch: two fingers create two independent mirror pairs simultaneously.
  **"Left hand / right hand — draw both at once."** The prototype is its own music theory lesson: holding a finger high on both sides creates a two-voice unison; drawing one finger high and one low creates a two-voice interval. A 4yo discovers this in under 30 seconds without any instruction.
  Zero permissions · Zero API · Zero deps · 2.26 kB.

---

## Previous (Cycle 139 — adult build)

- **[/dream/117-data-cosm](/dream/117-data-cosm)** — DATA-COSM. `demoable`
  Ryoji Ikeda aesthetic brought to the browser. A full-canvas scrolling matrix of **synthetic particle physics events** in CERN CMS format (`[μ+] pt=  48.3 eta= -1.270 phi=  2.950 m=0.1060 q=+1`) rendered in monospace on pure black. Every new event: characters **scatter from random offsets then snap into place** (300ms), a sine pulse fires at the current scale's tone frequency, trail particles arc upward. A continuous **sub-bass 38Hz drone** underlies — felt not heard.
  Three **temporal scales** auto-advance every 40s with a white flash + scatter-all transition:
  - **QUANTUM** — 8 events/s, 4kHz tones, 10px font, 90px/s scroll: dense flickering number matrix
  - **BIOLOGICAL** — 1 event/s, 440Hz tones, slower cadence: graceful, measured
  - **COSMIC** — 1 event/10s, 110Hz sub-bass tone, 20px font, centered on black: a single event worth contemplating
  "All of nature's data is the same material." The three scales comment on each other — the identical data format means completely different things at different temporal densities.
  Tap to activate audio. Zero permissions · Zero API · Zero deps · 2.38 kB.

---

## Previous (Cycle 138 — kids build, polished Cycle 146)

- **[/dream/116-kids-bloom-garden](/dream/116-kids-bloom-garden)** — Bloom Garden (kids). `polished`
  A dark canvas that breathes. **Press and hold** anywhere to plant a glowing flower — it blooms over 650ms from a tiny bud into a 5-petal flower and plays a sustained pentatonic note (X position = pitch: violet/low left → rose/high right). After 10 seconds the flower **seeds itself**: petals scatter as sparkles and a new bud sprouts 30–62px away, inheriting the pitch ±1 note. **Tap any flower to burst it** — sparkle explosion + pop note. Up to 12 flowers coexist; the garden self-organizes over time toward harmonic clusters as notes drift ±1 each generation.
  **Cycle 146 polish**: added a growing violet press-ring — a progress arc sweeps from 12 o'clock clockwise during the 480ms hold, so users always know "keep holding." The ring disappears the instant the flower starts growing. No more "why didn't that work?" moments for kids.
  **"The most contemplative kids prototype yet — designed for quiet play before sleep."** No tap targets. No fail state. No goal. Hold → bloom → watch the garden grow itself. Ambient C3+E3+G3 pad so the screen is never silent even before the first flower.
  Zero permissions · Zero API · Zero deps · 3.32 kB.

---

## Previous (Cycle 136 — kids build)

- **[/dream/115-kids-weather-music](/dream/115-kids-weather-music)** — Weather Music (kids). `demoable`
  Touch anywhere on screen — you're inside that weather zone. ☀️ Sun (top-right): bright C-major arpeggios + golden rotating rays. ☁️ Cloud (top-left): soft Am chord pad + drifting grey puffs. 🌧️ Rain (bottom-left): falling pentatonic drops + blue streaks. 💨 Wind (bottom-right): sweeping glissando oscillator + horizontal emerald streaks. **Drag between corners to blend all four atmospheres continuously** — the transition from Sun to Rain produces a natural musical diminuendo that a 4yo discovers by accident. Multi-touch: two fingers in different corners blend both sounds simultaneously.
  **"No notes to tap, no characters to find — the whole screen is four blended weather instruments."** First kids prototype about sustained atmospheric states (hold) rather than discrete events (tap). Bilinear zone weights from pointer position (x × (1−y) = sun, etc.) — mathematically smooth in all directions.
  Zero permissions · Zero API · Zero deps · 3.48 kB.

---

## Previous (Cycle 135 — adult build)

- **[/dream/114-live-harmonize](/dream/114-live-harmonize)** — Live Harmonize. `demoable`
  Play a melody into the mic — the system detects your key in real time (chroma template matching) and immediately plays diatonic 3rd and 5th harmony voices alongside each note. The third voice pans slightly right; the fifth pans slightly left. A scrolling piano roll records all three parts: melody in warm orange, 3rd in blue, 5th in indigo. Demo mode plays a Bach BWV 772 fragment with pre-set C major key.
  **"Play a melody — two harmony voices appear, always in your key."** Diatonic intervals change per scale degree (E in C major gets G minor-third and B fifth; B gets D and dim-5th F) — not mechanical fixed-interval transposition. Key display updates live as you play.
  Mic optional · Zero API · Zero deps · 3.68 kB.

---

## Previous (Cycle 134 — kids build)

- **[/dream/113-kids-conductor-wand](/dream/113-kids-conductor-wand)** — Conductor Wand (kids). `demoable`
  Drag your finger anywhere — a glowing wand follows it, leaving a rainbow color trail. Y position = pitch (pentatonic, top=high, bottom=low). Drag speed = note rate: slow sweep → long sustained tones; fast sweep → rapid arpeggios. Quick tap → drum hit (noise burst). Choose from 4 orchestras before starting: **Playground** 🎪 (bright triangle waves, amber), **Space** 🚀 (slow-attack sine waves, violet), **Forest** 🌲 (warm triangle, emerald), **Ocean** 🌊 (flowing sine with 3-note drone, cyan). Ambient drone chord for that orchestra plays quietly always — canvas never goes silent. Demo mode auto-conducts a Lissajous figure until first touch (wand already moving = no cold start).
  **"Your finger is the conductor's baton."** First kids prototype where a single continuous gesture controls both pitch AND rhythm simultaneously. No buttons, no tap targets — the whole screen is the instrument.
  Zero permissions · Zero API · Zero deps · 2.84 kB.

---

## Previous (Cycle 133 — adult build)

- **[/dream/112-bio-echo](/dream/112-bio-echo)** — Bio Echo. `demoable`
  Play piano into the mic — watch a forest grow, layer by layer, in real time. Five frequency strata map to five ecological layers: **sub-bass grows root tendrils** (deep violet lines crawling upward with Brownian drift); **bass builds the trunk** (amber pillar that only grows, never shrinks — every bass-heavy passage is permanently recorded in its height); **mid blooms the canopy** (emerald leaf-ellipses accumulating at 34–61% canvas height); **onsets send birds** (each attack fires a white bezier wing-arc into the sky — play 60 attacks and the sky fills with birds); **treble fills the sky** (tiny white star-dots at top 14%).
  The canvas never clears — by the end of a piece, a complete forest ecosystem has grown that encodes the entire musical session. Download as PNG.
  **"Every frequency band is a layer of the forest — sub-bass digs the roots, treble lights the sky."** Inspired by Refik Anadol's DATALAND (opens June 20, 2026, LA). Trunk gradient from accumulation (no gradient code — the canvas's own physics creates it).
  Zero deps · Zero API · mic optional (demo mode) · 3.6 kB.

Next: **Cycle 134 → `kids-conductor-wand`** or `kids-weather-music`. **Cycle 135 → `live-harmonize`**.

---

## Previous (Cycle 132 — kids build)

- **[/dream/111-kids-shape-loop](/dream/111-kids-shape-loop)** — Shape Loop (kids). `demoable`
  Draw any closed shape with your finger — when it closes, a glowing traversal dot orbits the perimeter and triggers a pentatonic note at each of the evenly-spaced trigger points (small colored dots on the shape). **Y position = pitch**: draw a tall shape and hear high notes; draw a wide flat shape and hear mid-register loops; draw a circle for a near-constant-pitch drone. Draw multiple shapes — each loops independently, creating polyphonic layers. Tap any existing shape to erase it. Auto-close: a dashed ring near the start point shows where to return to — when your finger enters it, the shape closes and starts playing immediately.
  **"Your drawing loops as a melody forever."** First kids prototype about additive compositional layering — the child doesn't react to something, they construct a composition by drawing.
  Zero permissions · Zero API · Zero deps · 2.84 kB.

---

## Previous (Cycle 131 — adult build)

- **[/dream/110-webcam-compose](/dream/110-webcam-compose)** — Webcam Compose. `demoable`
  Point your camera at anything — the image becomes a chord. Dominant hue → chord quality (warm reds=major, cool blues=minor, violets=diminished, greens=suspended, pinks=augmented). Brightness → register (dark=C2 bass, bright=C4 treble). Saturation → harmonic richness (1–3 triangle-wave voices per chord tone). Frame delta → arpeggio vs pad. Split view: left = camera feed with colored quadrant zone borders, right = 6-band bloom ring from the synthesis AnalyserNode (shows chord harmonics). Demo mode cycles all 5 chord qualities without camera permission.
  **"Point at a plant, a painting, a window. Each one plays a different chord."** First prototype where musical output is fully determined by where you look. Inspired by LUMIA (arxiv 2512.17228, Dec 2025). Zero API · Zero ML · webcam optional · 4.66 kB.

---

## Previous (Cycle 130 — kids build)

- **[/dream/109-kids-bounce-notes](/dream/109-kids-bounce-notes)** — Bounce Notes (kids). `demoable`
  A glowing ball bounces around the canvas with gravity and elastic reflections. Each wall plays a different pentatonic note: **bottom=C3** (deep, satisfying), **top=A4** (bright, tingly), **left=G3** and **right=E4** (mid). Ball lights up on impact (flash glow), dims between bounces. **Tap anywhere to spawn a new ball** at that position — up to 5 balls playing simultaneously. More balls = richer self-playing music. The child sets physics in motion; physics makes the music.
  **"A ball bounces. The wall sings back."** First kids prototype where the music is autonomous — the child doesn't need to keep tapping to keep the sound going. Inspired by the Bouncy / Sound Drop paradigm.
  Zero permissions · Zero API · Zero deps · 2.39 kB.

---

## Previous (Cycle 129 — adult research sweep)

No new prototype this cycle — adult research was 12 cycles overdue (last adult research: Cycle 117). Scanned arxiv (May 2026), GitHub trending WebGPU, fal.ai/replicate, Memo Akten's Superradiance (Gray Area SF Feb 2026), Refik Anadol's DATALAND (opens June 20 2026 in LA), and HN creative coding. Found **7 findings (§§184–190)** in RESEARCH.md. Seeded **4 new prototype ideas** in IDEAS.md. Freshest find: Break-the-Beat! (arxiv 2605.14555, published this month — MIDI + reference audio timbre → drum synthesis). Most buildable new seed: `webcam-compose` — camera image analysis → direct synthesizer control, zero API, zero ML, one cycle.

---

## Previous (Cycle 128 — kids build)

- **[/dream/108-kids-kalimba](/dream/108-kids-kalimba)** — Kalimba (kids). `demoable`
  Eight colorful vertical bars (violet → pink). Tap any bar to pluck it with Karplus-Strong string synthesis — noise burst into tuned ring-buffer feedback loop, decay 1.5–4s. **Taller bars ring lower; shorter bars ring higher** — the physical law of string instruments, no words needed. Drag across for a glissando; multi-touch plucks multiple strings simultaneously. Demo auto-arpeggios silently until first touch. Ambient C-E-G pad. Start screen shows a mini bar-height preview so the instrument's shape is visible before play. Eight C-major pentatonic notes (C3–A4), all combinations consonant.
  **"The longest bar rings the deepest — just like a real kalimba tine."**
  Zero permissions · Zero API · Zero deps · 2.71 kB.

---

## Previous (Cycle 127 — build)

- **[/dream/107-ocean-presence](/dream/107-ocean-presence)** — Ocean Presence. `demoable`
  Move your cursor through the ocean — it sings back. WebGPU ping-pong fluid (two 512×512 rgba16float textures): curl-noise velocity field + cursor vortex force advects dye, which shifts from cyan/teal (slow) to violet/indigo (fast). **No mic, no API** — audio is output only: sine oscillator tracks speed (130→630 Hz) over a constant ambient drone. Pulsing violet cursor glow. The first prototype where AUDIO IS OUTPUT, not input — cursor motion IS the instrument.
  **"Move your hand through this ocean. It sings back."**
  Zero deps · Zero API · Zero permissions · WebGPU required · 3.55 kB.

---

## Previous (Cycle 126 — kids research sweep)

No new prototype this cycle — the kids seeded queue was exhausted. Researched 2026 kids music
interaction (BANDIMAL, Shape Your Music, Bouncy physics ball, CHI 2025 touchscreen review,
Sound2Hap haptics, conducting gesture). Seeded **6 new kids prototype ideas** in `docs/dreams/KIDS.md`.
Queue is now full. Next kids build: **Cycle 128 → `kids-kalimba`** (BANDIMAL-inspired bar-height-to-pitch).

---

## Previous (Cycle 125 — build)

- **[/dream/106-beat-cut](/dream/106-beat-cut)** — Beat Cut. `demoable`
  6,000 particles orbit in 6 journey-themed species (Cosmic Homecoming = violet, Earth Grounding = emerald, Ocean Breath = cyan, Snowflake = ice-blue, Inner Sanctuary = amber, Ghost = purple). Six camera presets — one per journey — hard-cut on every audio onset. No lerp, no tween: a hard snap, like a live edit suite firing on the beat. Spring-attractor physics (O(N)) keeps the cloud alive between cuts. Bloom post-processing. Demo mode: synthetic onset timer 700–1500ms. Mic mode: spectral flux fires camera cuts on attack transients.
  **"The music cuts the camera. TouchDesigner's camSequencer, ported to the browser."** First prototype where the audio event IS the edit decision, and Karel's 6 published journey themes all coexist in one scene.
  Zero deps · Zero API · WebGL (Three.js, already installed).

---

## Previous (Cycle 124 — kids polish)

- **[/dream/82-kids-color-piano](/dream/82-kids-color-piano)** — Color Piano (kids). `polished`
  Karel's most-loved prototype (❤) — polished this cycle. Added proper start screen ("Let's play! 🎵", violet button, title + description), bumped hint text from near-invisible 18% → 55% opacity, fixed audio context user-gesture timing. Piano play is unchanged — 20vmin circles, glissando, no wrong notes.
  **"The first kids prototype now has the same polished entry as all Cycle 96+ builds."** Eight pentatonic circles that tap, hold, and slide across two octaves of C-major pentatonic.
  Zero deps · Zero API · Zero permissions.

---

## Previous (Cycle 123 — build)

- **[/dream/105-pluck-field](/dream/105-pluck-field)** — Pluck Field. `demoable`
  24 virtual strings in a 4×6 grid (C major hexatonic, octaves 2–5). Click any string to pluck it; the string vibrates as an animated damped standing wave and rings with Karplus-Strong physical modeling synthesis. Multi-touch: multiple fingers pluck simultaneously. Mic mode: onsets pluck random strings. Demo auto-strums. Color gradient: violet (low C2) → amber (high A5). Zero deps, zero API.
  **"The first prototype where the synthesis IS a physical model — noise burst → feedback loop → string."** First physical modeling synthesis in the sandbox. KS pre-computed offline (no real-time delay line): works cleanly across all frequencies from 65 Hz (C2) to 880 Hz (A5).
  Zero deps · Zero API · zero permissions.

---

## Previous (Cycle 122 — kids build)

- **[/dream/104-kids-mirror-draw](/dream/104-kids-mirror-draw)** — Mirror Draw (kids). `demoable`
  Draw a line anywhere on screen — it mirrors instantly across the center axis on the other side. Lift your finger to hear the path play as a melody: Y position = pitch (top = A4 high, bottom = C3 low), dots colored by pitch (pink at top, violet at bottom). Both the drawn line and its mirror flash as each note fires. Paths fade over 7 seconds; multiple paths accumulate for a glowing butterfly canvas. Subtle vertical pitch-gradient strips on each edge (violet→pink, bottom→top) show the Y=pitch mapping without text. Ambient C/E/G pad keeps the screen alive between drawings. Zero permissions, zero API.
  **"Draw a squiggle — it butterflies — lift to hear it."** First kids prototype about bilateral symmetry as a musical and visual concept.
  Zero permissions · Zero API · Zero deps · 2.46 kB.

---

## Previous (Cycle 121 — build)

- **[/dream/103-listen-guide](/dream/103-listen-guide)** — Guided Listening. `demoable`
  A frequency-attention practice in six movements. Six 22-second windows, each one spotlighting a different frequency register in the radial bloom viz: sub-bass (20–60 Hz, deep violet), bass (60–250 Hz, cyan), low-midrange (250–500 Hz, green), midrange (500 Hz–2 kHz, yellow), high-midrange (2–4 kHz, orange), treble (4–20 kHz, magenta). When a window is active, its ring blazes at full brightness; all other rings dim to 8% opacity. A text prompt per window tells you what to listen for. **File mode**: drag any audio file onto the page — Karel's own recordings, a Welcome Home track, anything. The session guides you through its frequency layers. Demo mode needs no permissions (synthesized piano spanning all 6 bands).
  **"Your ear will learn to hear what it normally passes over."** First prototype that teaches listening rather than just responding to it.
  Zero permissions (demo) · Zero API · Zero deps · 4.96 kB. Headphones recommended.

---

## Previous (Cycle 120 — kids build)

- **[/dream/102-kids-echo-song](/dream/102-kids-echo-song)** — Echo Song (kids). `demoable`
  A musical conversation with a parrot 🦜. The bird sings a 2–4 note phrase — colored circles light up as it plays. Then it's your turn: tap any of the 5 colored circles to sing back. After 4 taps or 3 seconds, the bird echoes your notes back and adds one new note of its own. The conversation loops and grows; phrases get longer each round (max 4 notes). C major pentatonic — no wrong combinations. The bird's "add one note" mechanic is gently educational: if a child taps the same note four times, the bird mirrors it then introduces a new color. Zero permissions, no microphone, no reading required.
  **"The bird listens — then sings back."** First kids prototype about musical call-and-response / turn-taking.
  Zero permissions · Zero API · Zero deps · 2.25 kB.

---

## Previous (Cycle 119 — build)

- **[/dream/101-camera-song](/dream/101-camera-song)** — camera-song. `demoable`
  Six journey-theme orbs float in the dark — Cosmic Homecoming, Earth Grounding, Inner Sanctuary, Ocean Breath, Snowflake, Ghost. Each orb makes its own music (Cosmic = detuned pad; Earth = deep bass; Sanctuary = FM warmth; Ocean = C major chord; Snowflake = crystalline highs; Ghost = A-minor arpeggio). Orbit with mouse/touch: the orb your camera faces fills the mix. Turn away — it fades. Every other orb holds at a quiet floor (3%) so they're audible in the background as you pass. The transition is instant — `cos²` falloff snaps focus clearly. Glowing spheres swell and brighten as they come into focus. HUD shows the name + tagline of the journey you're currently facing.
  **"You're not listening to music. You're walking through it."** First prototype where camera orientation IS the musical instrument.
  Zero API · Zero deps · Zero permissions · ~3.06 kB. Headphones recommended.

---

## Previous (Cycle 118 — kids build)

- **[/dream/100-kids-paint-song](/dream/100-kids-paint-song)** — Paint a Song (kids). `demoable`
  Draw a line with your finger — lift up to hear your melody play. The screen is a dark starry canvas. As you drag, a glowing sparkle trail appears behind your finger: dots colored by pitch (violet at left / low notes → pink at right / high notes). When you lift, the path plays back as a melody — each sparkle flashes bright when its note fires. Left side = C3 (low, violet); right side = A4 (high, pink); 10 pentatonic notes mapped across the full screen width. Notes are triangle-wave piano tones (60ms attack, ~550ms decay). Multiple paths persist and fade gently over 6 seconds — draw a new one while the last is still visible. A subtle pitch-gradient strip at the bottom (violet→pink) shows the note mapping without text. No reading required, no fail state. A child who draws left→right hears an ascending scale; right→left hears a descent; a squiggle hears a wandering tune.
  **"Draw a squiggle — lift your finger — your squiggle plays itself as a melody."** First kids prototype where the drawn shape IS the musical score.
  Zero permissions · Zero API · Zero deps · ~3.5 kB.

---

## Previous (Cycle 116 — kids build)

- **[/dream/99-kids-panning-safari](/dream/99-kids-panning-safari)** — Panning Safari (kids). `demoable`
  Five animals — duck 🦆, frog 🐸, elephant 🐘, cat 🐱, parrot 🦜 — drift left and right across a night savanna at their own speeds. Each animal is panned to its current X position via `StereoPannerNode`: far left = left ear, far right = right ear, center = center. Tap any animal to trigger its synthesized call at the animal's current pan position. Animals also call automatically every 3–7 seconds as they wander. Distinct synthesized voices: duck = bandpass noise quack; frog = AM sine ribbit (140 Hz carrier modulated at 18 Hz); elephant = low sawtooth rumble through 280 Hz lowpass; cat = sine glide 580→340 Hz; parrot = chirp 1400→1900→850 Hz. Dashed drop-line from each animal to a pan ruler strip at the bottom; colored dot on ruler shows exact pan position. Background: night sky, ground strip, 38 static stars. Soft ambient pad from first tap. Hit radius 62 px for 4yo accuracy.
  **"First kids prototype about spatial audio — tap the elephant on the left, its rumble fills your left ear."** Zero permissions · Zero API · Zero deps · 2.61 kB. Best with headphones.

---

## Previous (Cycle 115 — build)

- **[/dream/81-cassette-speed](/dream/81-cassette-speed)** — CassetteAI vs ACE-Step Speed Race. `demoable`
  Side-by-side speed and quality comparison of two FAL music-generation backends. Pick one of five presets (Forest Dawn, Stone Chamber, Cosmic Drift, Jazz Sketch, Ocean Breath) or type freeform tags, then hit **Generate Both** — both backends start simultaneously. Left panel (violet) runs CassetteAI (`cassetteai/music-generator`, distilled model, ~2s); right panel (cyan) runs ACE-Step (`fal-ai/ace-step`, full diffusion, ~20–40s). Each panel shows a live millisecond timer, then a waveform strip on completion, then a ▶ Play button. Playback feeds a six-band bloom visualizer (violet→cyan→green→yellow→orange→magenta). When both complete a speed summary line appears: "Cassette: X.Xs · ACE-Step: Y.Ys · X× faster."
  **"Same prompt. Both start at once. Now you can hear whether the 10× speed gap costs anything you'd notice."** Direct empirical tool for Karel to decide whether to swap `6-compose`'s ACE-Step backend for faster iteration loops.
  FAL_KEY required · 2 API calls / generation · waveform + bloom visualizer.

---

## Previous (Cycle 114 — kids build)

- **[/dream/98-kids-drum-circle](/dream/98-kids-drum-circle)** — Drum Circle (kids). `demoable`
  Six large colored percussion pads in a 3×2 grid — red (kick), orange (snare), yellow (hihat), teal (tom), blue (clap), purple (shaker). Tap any pad to play its synthesized drum sound: kick is a sine sweep 150→40 Hz; snare is bandpass noise + short 200 Hz sine body; hihat is highpass noise above 7 kHz; tom is a slower sine sweep 110→55 Hz; clap is a double bandpass noise burst (0 ms + 22 ms apart — the gap between bursts is the perceptual cue for "clap"); shaker is highpass noise above 5.5 kHz. Background canvas draws expanding colored rings from each tap point. CSS scale (0.88) + bright glow on press. Quiet C/E/G ambient pad from first tap. Multi-touch: every finger gets its own ring. Zero permissions, zero API, zero deps. Min pad size 26vmin (≥80px).
  **"Six colors, six sounds — the first kids prototype about rhythm rather than pitch."** All 10 previous kids prototypes use C-major pentatonic melodic notes. This is the first pure percussion prototype — tap a rhythm, layer sounds, no music theory needed.
  Zero permissions · Zero API · Zero deps · 2.12 kB.

---

## Previous (Cycle 113 — build)

- **[/dream/80-room-acoustic](/dream/80-room-acoustic)** — Room Acoustic. `demoable`
  Simulate a physical room and hear how it changes your piano. Draw a rectangular room (1.5–60m wide, up to 80m deep), pick wall/floor materials (Stone α=0.03 → Carpet α=0.40), and press **▶ play chord** — a C-major chord sounds in that space via a Web Audio `ConvolverNode` loaded with the computed impulse response. The image-source method computes up to 3rd-order reflections; RT60 (Sabine estimate) updates live and color-codes from studio-dry to cathedral-vast. Drag the amber ♪ source and violet 👂 listener dots to reposition; IR rebuilds automatically. 9 presets: Closet · Bedroom · Studio · Hall · Concert Hall · Cathedral · Cave · Stone Chamber · Forest Clearing.
  **"Move a wall. Hear the room change."** The Stone Chamber preset sounds ringy and metallic (RT60 ≈ 2.5s, stone everywhere); the Cathedral is vast and blurred (RT60 ≈ 3.8s); the Closet is almost silent-dry (RT60 ≈ 0.08s, carpet). First prototype about acoustic space physics — not signal analysis, not synthesis, but the physics of a room.
  Zero API · Zero deps · 4.98 kB.

---

## Previous (Cycle 112 — kids build)

- **[/dream/97-kids-star-catch](/dream/97-kids-star-catch)** — Star Catch (kids). `demoable`
  Colorful 5-pointed stars fall slowly from a twinkling night sky — each star is a note in C-major pentatonic. Tap any star before it drifts off the bottom: it bursts into sparkles and plays its note. After 3 catches a **▶ replay** button appears; tap it to hear your collected melody played back in sequence (up to 16 notes). Stars fall at deliberate pace (12–20 seconds per screen) with generous 52–64 px effective hit radius for 4yo motor accuracy. Ambient C/E/G pad from first tap. No permissions, no mic, no API, no reading required.
  **"Each star you catch adds a note — catch enough and you've written a song."**
  Zero permissions · Zero API · Zero deps · 2.54 kB.
  Design notes: `src/app/dream/97-kids-star-catch/README.md`

---

## Previous (Cycle 111 — build)

- **[/dream/96-projection-mapping-sandbox](/dream/96-projection-mapping-sandbox)** — Projection Mapping Sandbox. `demoable`
  WebGPU two-pass renderer for live venue projection mapping. Tap **Calibrate** and drag the four colored corner handles (TL/TR/BR/BL) to match any real-world surface shape — a wall, a screen, an arch. The journey feedback shader is warped onto the quad using bilinear inverse mapping (8-step Newton iteration) computed entirely on the GPU. Edge blend slider adds a soft vignette at the quad margins (professional keystone-correction look). Three visual themes: Cosmic, Earth, Ocean. Audio-reactive: bass drives bloom, treble adds edge shimmer, onsets inject color pulses. Demo mode or live mic.
  **"Define any 4-corner shape, the shader fills it — drag corners live while the music plays."**
  WebGPU required · Zero API · Zero deps · 6.44 kB.

---

## Previous (Cycle 110 — kids build)

- **[/dream/95-kids-breath-bubbles](/dream/95-kids-breath-bubbles)** — Breath Bubbles (kids). `demoable`
  Blow into the mic — colorful soap bubbles appear at the bottom of the screen, rise with gentle horizontal wobble, and pop at the top with a soft pentatonic ding. Louder breath = bigger bubbles, faster rate. Six-color palette (rose, violet, cyan, emerald, amber, blue). Tap anywhere to drop a manual bubble. Demo mode auto-animates a breathing wave. Graceful no-mic fallback: demo plays automatically.
  **"Breath becomes music: every exhale floats bubbles upward."**
  Mic optional · Zero API · Zero deps · 2.79 kB.
  Design notes: `src/app/dream/95-kids-breath-bubbles/README.md`

---

## Previous newest (Cycle 109 — build)

- **[/dream/75-houdini-particle-flock](/dream/75-houdini-particle-flock)** — Houdini Particle Flock. `demoable`
  6,000 WebGPU particles split into 6 species, flocking via Boids (separation, alignment, cohesion) + curl-noise force fields. Six journey themes — Cosmic Homecoming, Earth Grounding, Ocean Breath, Snowflake, Inner Fire, Deep Cosmos — each with matching species colors and a Flux Schnell backdrop image composited underneath via CSS screen blend. Generate Backdrop produces a themed 16:9 image in ~3s. Demo mode (6 oscillators + LFOs) or live mic. Bass → cohesion tightens flocks; treble → curl intensity swirls them; onsets → scatter impulse.
  **"Boids meet Houdini VEX: 6 species swarm through AI-generated journey landscapes."**
  WebGPU required · Flux API ($0.003/image) · mic optional · 7.59 kB.
  Design notes: `src/app/dream/75-houdini-particle-flock/README.md`

---

## Previous newest (Cycle 108 — kids build)

- **[/dream/94-kids-ghost-echo](/dream/94-kids-ghost-echo)** — Ghost Echo Pond (kids). `demoable`
  Tap anywhere on a starry night sky to summon an echo Ghost. Each Ghost appears at your tap, plays a pentatonic note (Y = pitch), bursts into sparkles, drifts gently on its own slow orbit, then fades after 4 seconds. Up to 8 Ghosts coexist — tap rapidly from top to bottom and you build a full 10-note arpeggio. The chorus of drifting Ghosts forms an organic flock with softly different rhythms. First tap starts a quiet ambient chord pad.
  **"A spirit pond — each tap drops a Ghost, and they drift and fade like ripples."**
  Zero permissions · Zero API · Zero deps · 2.12 kB.
  Design notes: `src/app/dream/94-kids-ghost-echo/README.md`

---

## Previous newest (Cycle 107 — build)

- **[/dream/84-wave-fluid](/dream/84-wave-fluid)** — Wave Fluid. `demoable`
  Audio-reactive ocean surface rendered in a single WebGPU fragment shader. Bass raises the swell (4 superimposed wave modes at incommensurable frequencies). Treble chops the surface (value-noise turbulence). Onsets create splash ripples (expanding ring + surface displacement). Click anywhere on the water for a manual splash. The sky above has twinkling stars and per-column spray particles arcing on parabolic paths. Below the surface: caustic shimmer, subsurface violet scatter. Rose/violet surface bloom at the waterline.
  **"One click, one ocean. Bass makes it breathe. Treble makes it restless."**
  Graceful fallback: if WebGPU unavailable, shows error + link to 3-fluid. Zero API · Zero deps · WebGPU required.
  Design notes: `src/app/dream/84-wave-fluid/README.md`

---

## Previous newest (Cycle 106 — kids build)

- **[/dream/93-kids-share-screen](/dream/93-kids-share-screen)** — Share the Screen (kids). `demoable`
  Full-screen canvas instrument for two simultaneous players. Each touch contact gets a glowing colored orb — first finger = violet, second = rose. Y-position maps to a pentatonic pitch (C3–C5); slide up = higher note, slide down = lower. The pentatonic constraint guarantees any two simultaneous notes sound beautiful together — no wrong combinations possible. Smooth pitch glide (fretless feel). When both voices are active, an animated dashed gradient line connects them visually. Sparkle particle trail on movement. Idle hint: two pulsing colored dots show where to put fingers. Pointer capture keeps tracking even at screen edges.
  **"Two fingers, two voices — parent and child each hold a note and slide together. Always in harmony."**
  Zero deps · Zero API · Zero permissions · 2.66 kB.
  Design notes: `src/app/dream/93-kids-share-screen/README.md`

---

## Previous newest (Cycle 105 — build)

- **[/dream/73-journey-arc-spread](/dream/73-journey-arc-spread)** — Journey Arc Spread. `demoable`
  Five of Karel's published journeys — Cosmic Drift, Mycelium Dream, Sacred Resonance, Abyssal Dive, Snowflake — each with a distinct 6-phase arc and visual vocabulary. Tab between journeys; each renders differently: star field background for Cosmic, particle network lines for Mycelium, rotating hexagonal mandala rings for Sacred, sine-wave bands for Ocean, drifting 6-arm snowflakes for Winter. Demo or mic input. Phase timeline at bottom, click to jump. Switch journeys while running.
  **"The same arc engine feels like a completely different world in each of the five journeys."**
  Phase names match Karel's published journey phase labels (Starfield/Nebula/Supernova, Spore/Branching/Canopy, etc.). Zero API · Zero deps · 7.49 kB.
  Design notes: `src/app/dream/73-journey-arc-spread/README.md`

---

## Previous newest (Cycle 104 — kids build)

- **[/dream/92-kids-ghost-lullaby](/dream/92-kids-ghost-lullaby)** — Ghost Lullaby (kids). `demoable`
  Karel's Ghost character floats gently across a starry night sky. Tap her to hear a pentatonic note (pitch varies by Y position). Drag her to hear a glissando — she follows your finger trailing violet sparkles. After 2 minutes she fades softly and a lullaby melody plays (original 8-note C-major pentatonic motif, 3 repeats ≈ 20 s). "Sweet dreams 🌙" overlay appears. Zero permissions · Zero API · Zero deps · Generous 80 px hit radius for 4yo motor accuracy.
  **"The same Ghost that flies through Karel's live performances now sings bedtime songs for kids."**
  Design notes: `src/app/dream/92-kids-ghost-lullaby/README.md`

---

## Previous newest (Cycle 103 — build)

- **[/dream/86-sound-to-video](/dream/86-sound-to-video)** — Sound → Image → Video. `demoable`
  10 seconds of audio (mic or demo) → acoustic fingerprint (energy, spectral centroid, ZCR, 12-bin chroma, pitch) → FLUX.2 Dev cinematic 16:9 scene image → LTX-Video 5-second animated clip. Two-phase progressive reveal: the image appears first (~15–25s), then the video animates the scene while you're already looking at it (~20–45s later). Six scene archetypes keyed to energy × spectral centroid: stone chamber, forest dawn, sea cave, sunlit courtyard, wild headland, cosmic nebula. Motion prompt adapts to energy level: quiet playing = meditative drift; loud playing = elemental sweep. **"The audio was the brush; the video is the canvas."** FAL_KEY in use. ~$0.25/generation. This is the "AI image inside AV" prototype Karel asked for.
  Design notes: `src/app/dream/86-sound-to-video/README.md`

---

## Previous newest (Cycle 102 — kids build)

- **[/dream/91-kids-character-band](/dream/91-kids-character-band)** — Character Band (kids). `demoable`
  Five animal characters — Frog, Owl, Cat, Fish, Bear — each with their own short melodic phrase in C-major pentatonic. Tap any character to hear them play. Tap two at once and they harmonize naturally (all phrases share a common tonal center). Each character scales up, glows in its color, and emits 18 sparkle particles on tap. Soft ambient pad runs from first tap. Multi-touch native — no wrong combinations. Start screen → single big "Let's Jam!" button → instant play.
  **"Tap Frog + Bear simultaneously: Frog's quick arpeggio layers over Bear's slow deep phrase like a real piano duo."**
  Zero deps · Zero API · Zero permissions · Toca Band-inspired.
  Design notes: `src/app/dream/91-kids-character-band/README.md`

---

## Previous newest (Cycle 101 — build)

- **[/dream/85-spectrogram-paint](/dream/85-spectrogram-paint)** — Spectrogram Paint. `demoable`
  Your sound crystallizes into a living painting. FFT data scrolls as a waterfall (time left→right, pitch bottom→top, log scale 20 Hz–8 kHz) with a Ryoji Ikeda-style hot colormap: silence = black, dim = violet/cyan, peak = white. The spectrogram feeds a **Canvas2D ping-pong feedback loop** — each frame the display decays at 98.4%, zooms 1.002×, and drifts slightly, then the fresh spectrogram is injected additively. Notes leave trails that bloom outward and slowly evaporate. Demo mode animates 11 C-major scale frequencies with LFO envelopes. Mic mode maps your real playing directly to the display.
  **"Play a chord: three bright white lines crystallize, bloom outward, then fade like breath on glass."**
  Zero deps · Zero API · 2.76 kB.
  Design notes: `src/app/dream/85-spectrogram-paint/README.md`

---

## Previous newest (Cycle 100 — kids build)

- **[/dream/90-kids-puddle-jumper](/dream/90-kids-puddle-jumper)** — Puddle Jumper (kids). `demoable`
  Tap the pond to drop stones. Each tap plays a pentatonic "bloop" (left=low, right=high) and spawns three staggered ripple rings that expand outward with additive glow. When a ring hits a screen edge it reflects — a dimmer ghost-ring emanates from the mirror point, creating the sense of sound bouncing across the pond. Multiple taps layer into a visual and sonic texture. Ambient C-major pad hums softly in the background. **Zero permissions — no mic, no motion sensor, no consent dialogs.** Touch anywhere, multi-touch supported natively.
  **"The reflected rings mean the pond never goes silent — earlier splashes keep drifting across the screen."**
  Zero deps · Zero API · 2.35 kB.
  Design notes: `src/app/dream/90-kids-puddle-jumper/README.md`

---

## Previous newest (Cycle 99 — build)

- **[/dream/89-marpi-void](/dream/89-marpi-void)** — Void Organism. `demoable`
  A living entity breathes in the void. One founding organism; percussive onsets spawn offspring — after minutes of music a drifting colony fills the space. Arms extend on bass, jitter on treble (smooth noise, no deps). Each organism has a color type (bass=violet, mid=cyan, treble=rose) that determines its survival band; starve it of sound for 15s and it dissolves. Demo mode: LFO breathes the organism autonomously. `globalCompositeOperation = "lighter"` creates emergent white filaments where organisms overlap.
  **"Overlapping organisms light up as if exchanging energy — emergent behavior from blending math."**
  Zero deps · Zero API · 4.05 kB.
  Design notes: `src/app/dream/89-marpi-void/README.md`

---

## Previous newest (Cycle 98 — kids build)

- **[/dream/88-kids-hum-to-paint](/dream/88-kids-hum-to-paint)** — Hum to Paint (kids). `demoable`
  Hum or sing into the mic — your voice paints a glowing blob on the canvas in real time.
  Pitch maps to vertical position (high voice = top, low voice = bottom) and to color (low=red/orange, mid=green, high=blue/violet).
  Loudness maps to brush size. After 30 seconds (or tap "Replay" once 5+ notes are recorded), a white scan line sweeps
  the painting left-to-right while the melody plays back as warm triangle-wave piano tones.
  Background C/E/G pad keeps the world alive between hums. No reading required, no fail state.
  **"The most embodied kids prototype yet — your breath IS the instrument."**
  Zero deps · Zero API · 2.96 kB.
  Design notes: `src/app/dream/88-kids-hum-to-paint/README.md`

---

## Previous newest (Cycle 97 — build)

- **[/dream/87-piano-transcript](/dream/87-piano-transcript)** — Piano Transcript. `demoable`
  Play piano into the mic — the prototype writes while you play. YIN pitch detection (~35 lines,
  zero deps) converts each note to a filled rectangle on a scrolling Canvas2D piano roll. X axis = time
  (20 s visible window, scrolls leftward), Y axis = MIDI pitch (C2–C7). Color gradient: warm amber at the
  low end, Resonance violet in the middle registers, cool cyan at the top.
  Phrases (≥2 s of silence between groups) get a subtle violet bracket around them.
  "Save PNG" exports the full session to a timestamped 1920×N image at 64 px/second.
  YIN runs every 3rd RAF frame (~20 Hz); pitch median-smoothed over 5 readings to suppress octave errors.
  **"This prototype writes while you play — a permanent record of your session."**
  Zero deps · Zero API · 3.80 kB.
  Design notes: `src/app/dream/87-piano-transcript/README.md`

---

## Previous newest (Cycle 96 — kids build)

- **[/dream/83-kids-tilt-rain](/dream/83-kids-tilt-rain)** — Rain Catcher (kids). `demoable`
  Hold the iPad like a tray and tilt left/right to slide a glowing bowl across the screen. Colored
  raindrops fall — each color is a note in C-major pentatonic. Catch a drop → it plays its note and
  bursts into an expanding ring. After 5 catches, a Replay button plays your melody back.
  DeviceOrientation gamma drives the basket; iOS 13+ permission is requested on the Start tap.
  Desktop fallback: mouse/touch X position.
  Background C/E/G pad keeps the app feeling "alive" between catches. No reading required, no fail state.
  **"Tilt-based sensorimotor music — what Toca Band does, but contemplative."**
  Zero deps · Zero API · 2.96 kB.
  Design notes: `src/app/dream/83-kids-tilt-rain/README.md`

---

## Previous newest (Cycle 95 — research sweep)

- **Cycle 95 was a deep research sweep** (no new prototype). 5 new entries in RESEARCH.md (§§166–170). 5 new prototype seeds added to IDEAS.md. Top picks for next builds:
  - **`84-wave-fluid`** (Cycle 97+ — two-cycle) — MLS-MPM WebGPU ocean surface, 100k particles, audio-reactive. Inspired by Houdini GPU fluid solver + `matsuoka-601/webgpu-ocean`. Most visually ambitious prototype in the queue.
  - **`87-piano-transcript`** (Cycle 97+ — one-cycle) — YIN pitch detection → live piano-roll score. Uses Karel's actual playing as input. Zero API, zero deps. Directly aligned with Karel's "use his real music" direction.
  - **`88-marpi-void`** (Cycle 97+ — one-cycle) — audio-reactive organic entity, Marpi "New Nature" technique. Zero API, zero deps. Immediate fun.

  **Key model upgrade**: FLUX.2 Flash (`fal-ai/flux-2/flash`, $0.005/MP) should replace `fal-ai/flux/schnell` in all new AV+image prototypes — better quality, same cost. LTX-2.3 (`fal-ai/ltx-2.3/text-to-video`, $0.04/s) enables `86-sound-to-video` extension of `57-sound-to-image`.

---

## Previous newest (Cycle 94 — build)

- **[/dream/79-fm-explorer](/dream/79-fm-explorer)** — FM Explorer. `demoable`
  2-operator FM synthesis: a modulator oscillator drives the carrier's frequency AudioParam.
  Two sliders control the entire DX7 timbre space — C:M ratio (which harmonic series) and β
  modulation index (how rich/noisy). The right panel shows the **live sideband spectrum** as
  Bessel function coefficients J_n(β): you see exactly why DX Piano at β=2.5 has almost no
  carrier energy (J₀(2.5) ≈ 0.05) and all the sound lives in J₁ and J₂.
  Six presets: DX Piano · Bell · Reed · FM Bass · Metallic · Glass Harmonica.
  ADSR envelope. Space bar / pointer hold = play note.
  Demo mode: slow LFO breathes β so the spectrum animates without mic. Mic mode: bass → β,
  onset → retrigger envelope — loud playing gets grittier, attacks reshape the timbre.
  **"78 prototypes, none had FM synthesis until now."**
  Zero deps · Zero API · 5.29 kB.
  Design notes: `src/app/dream/79-fm-explorer/README.md`

---

## Previous newest (Cycle 93 — build)

- **[/dream/78-node-synth](/dream/78-node-synth)** — Node Synth. `demoable`
  The Web Audio API as a visual patch bay. Oscillators, gain stages, filters (lowpass/highpass/bandpass/
  notch/peaking), and delay effects appear as draggable node cards. Draw bezier wire connections between
  output and input ports — audio flows in real time. The starter patch (Oscillator → Gain → Speakers)
  plays immediately; add a Filter between them and sweep its frequency to hear the lowpass open up.
  Delay node has an internal feedback loop so echo trails build with each wire reconnect.
  Try: Oscillator → Filter → Gain → Speakers + Oscillator → Delay → Gain (wet blend with echo).
  **"The synthesizer you see is the synthesizer you hear."**
  Zero deps · Zero API · 4.67 kB.
  Design notes: `src/app/dream/78-node-synth/README.md`

---

## Previous newest (Cycle 92 — kids build) · polished Cycle 124

- **[/dream/82-kids-color-piano](/dream/82-kids-color-piano)** — Color Piano (kids). `polished`
  First kids prototype — and Karel's most-loved (❤). Eight pentatonic circles — C D E G A C D E across two octaves. Tap any
  circle to play, hold to sustain, drag across circles for a glissando, multiple fingers for chords.
  No wrong notes (C-major pentatonic, all consonant). Each circle has a bold saturated color. Soft
  C-major ambient pad. No fail states.
  **Polished Cycle 124**: Added start screen (title + description + "Let's play! 🎵" button) consistent with all Cycle 96+ kids prototypes. Bumped hint text from 18% → 55% opacity. Added `max(12px, 2vmin)` font-size floor. Audio context created on start button (correct user-gesture timing). Piano play screen unchanged — same circle sizes, glissando, colors.
  Circles sized `20vmin`: ≥78px on 390px phone, ≥153px on 768px iPad.
  **For**: kids 4+ · handed to a toddler immediately.
  Zero deps · Zero API · Zero permissions.
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

### 210-aria-companion
**Status**: `demoable` · **Cycle shipped**: 243 · **Last touched**: 2026-05-29

Open `/dream/210-aria-companion`. Click **Start mic** and play piano (or sing a melody). After you pause for 1.5 seconds, Aria responds with an 8-note phrase built from a Markov chain of your own note transitions. Your phrase appears as warm orange bars on the top piano roll; Aria's response as cool blue bars below. The Markov table accumulates across rounds — the longer you play, the more Aria mirrors your melodic style. No mic? Click anyway: a demo pentatonic phrase seeds the chain and Aria responds automatically.

Design notes: `src/app/dream/210-aria-companion/README.md`

---

### 215-fm-explorer
**Status**: `demoable` · **Cycle shipped**: 249 · **Last touched**: 2026-05-30

Open `/dream/215-fm-explorer`. Click **Start FM** and move your cursor across the canvas. X = carrier pitch (C2–C7), Y = modulator ratio (0.5–8×). Moving left-to-right transposes the tone across five octaves; moving top-to-bottom sweeps from complex metallic textures (high ratio) to pure harmonic tones (low ratio near 1:1). The FM index slider controls modulation depth — at 0 you hear a pure sine everywhere; at 15 the canvas becomes a noise-to-bell landscape. Preset buttons jump to Bell (E4, ratio √2), Rhodes (C3, ratio 2:1), Clangy (G3, ratio 3.5:1), Sub (A1, ratio 1:1), Metallic (D3, ratio 5:3). Mic mode routes your RMS amplitude to the index — play louder for more metallic edge.

Design notes: `src/app/dream/215-fm-explorer/README.md`

---

### 211-kids-firefly-web
**Status**: `demoable` · **Cycle shipped**: 244 · **Last touched**: 2026-05-29

Open `/dream/211-kids-firefly-web`. Tap anywhere on the dark canvas to release a glowing firefly. Fireflies drift with gentle physics and subtle mutual attraction. When two come within range, a vibrating silk thread forms between them — and a pentatonic chime plays, pitched by thread length (short = high, long = low). All threads harmonize. Seed up to 8 fireflies; the web evolves on its own.

Design notes: `src/app/dream/211-kids-firefly-web/README.md`

---

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

---

### 218-kids-xylophone-drops
**Status**: `demoable` · **Cycle shipped**: 252 · **Last touched**: 2026-05-30

Open `/dream/218-kids-xylophone-drops`. Five glowing bars sit at the bottom in a staircase — the tallest bar (violet) plays the deepest note; the shortest (rose) the highest. Drops fall every 1.8 seconds from the top, each aimed at a random bar. Watch them fall and hear them ring. Tap the sky above any column to spawn a drop there; tap directly on a bar to ring it instantly. All bars are C major pentatonic — every drop harmonizes.

Design notes: `src/app/dream/218-kids-xylophone-drops/README.md`

---

### 220-kids-fireworks
**Status**: `demoable` · **Cycle shipped**: 254 · **Last touched**: 2026-05-30

Open `/dream/220-kids-fireworks`. Tap anywhere in the dark star-filled sky to launch a glowing rocket toward that spot. The rocket arcs upward over 0.75 seconds — watch it climb — then explodes into 22 glowing sparks falling with gravity, and a pentatonic chord rings out. Left side = violet = C4 (deep); right side = cyan = C5 (bright); three more colors/pitches in between. All five notes are C major pentatonic — every explosion harmonizes. Three rockets auto-launch on load so the canvas is never silent.

Design notes: `src/app/dream/220-kids-fireworks/README.md`

---

### 229-chord-canvas
**Status**: `demoable` · **Cycle shipped**: 263 · **Last touched**: 2026-05-31

Open `/dream/229-chord-canvas`. Play any chord on piano or guitar and watch the detector name it: "Dm", "Gmaj", "F♯m". The chord name fills the top of the screen in large monospace type, colored by root note (C = red, D = yellow, A = violet — same chromatic hue wheel as `1-live`). A timeline strip scrolls left at the bottom: each chord you play becomes a colored block, width = duration. A 12-bin chromagram shows live pitch-class energy. **Try demo mode first** (ii–V–I: Dm → G → C plays automatically). Then switch to mic and play your own chords.

Detection: 4096-point FFT → 12-bin chroma → dot-product match against 24 major/minor templates. No ML, no server, no API. First music-theory prototype in the sandbox — 228 prior builds visualized audio signal properties; this one names the musical structure.

Design notes: `src/app/dream/229-chord-canvas/README.md`

---

### 236-particle-life-song
**Status**: `demoable` · **Cycle shipped**: 269 · **Last touched**: 2026-06-01

Open `/dream/236-particle-life-song`. Press **Start** and watch ~2,400 particles in five colored species self-organize into living cells, chasers, and membranes — driven by an asymmetric attraction matrix where (say) rose chases emerald while emerald flees rose. The twist: each species owns a pentatonic voice that **blooms louder and brighter as its swarm condenses** and fades as it disperses, so you are literally hearing the system find its own structure. Hit **New world** to reseed the matrix and hunt for regimes that sing; drag to stir. Music FROM emergence, not music visualized.

Tech: classic Particle Life (Ventrella's *Clusters* / CodeParade) — CPU sim with a toroidal spatial-hash grid (O(N) neighbors), rendered as additive WebGL `THREE.Points`. Each frame an exact per-species clustering metric (avg same-species neighbors) is EMA-smoothed and mapped to each voice's gain + filter cutoff. First emergent-simulation piece in the lab; first to sonify cluster self-organization. Shipped as the winner of a WIDE 3-builder orchestration cycle (siblings `spectral-terrain` + `tonnetz-lattice` banked in IDEAS.md).

Design notes: `src/app/dream/236-particle-life-song/README.md`

---

### 238-kids-tilt-world
**Status**: `demoable` · **Cycle shipped**: 270 · **Last touched**: 2026-06-01

Open `/dream/238-kids-tilt-world`. **For kids (4+).** Tap **Tilt to play**, then *lean the iPad* — a glowing marble rolls across a warm, undulating 3D hill-world (three.js `PerspectiveCamera` over a sine-bump heightfield) in whatever direction you tilt, with real downhill gravity along the surface so valleys and hills steer the ball. Roll it onto the five glowing colored pads scattered over the hills → each rings a soft bell (C-major pentatonic, BANDIMAL: bigger pad = lower pitch) and bursts into sparkles. The note pans left/right via a `StereoPannerNode` driven by the marble's on-screen x, so the sound follows the ball across the world. A soft detuned-sine drone fades in on first gesture so it's never silent; the marble leaves a glowing trail and the camera gently follows it.

No reading, no tapping the screen, no score, no "wrong" note — the instrument is the child's own body leaning the tablet. Degrades gracefully: iOS motion permission is requested behind the Start button; on denial / no sensor / no tilt events within ~1.8s it auto-switches to a pointer-drag fallback (drag the marble) with a readable rose note, and there's an explicit "No tilt? Drag to play" button. First tilt-controlled 3D kids piece in the lab (all ~110 others are touch + 2D canvas); first kids piece with spatial panned audio tied to ball position. Reference: *Inertia* (kikkupico WebGL accelerometer marble, 2026) + LocoRoco/tilt-labyrinth lineage; embodied music cognition. Shipped as the winner of a WIDE 3-builder orchestration (siblings `kids-sing-garden` + `kids-wave-band` banked in IDEAS.md). Zero new deps · zero API · optional motion sensor.

Design notes: `src/app/dream/238-kids-tilt-world/README.md`

---

### 243-spectral-cloud
**Status**: `demoable` · **Cycle shipped**: 271 · **Last touched**: 2026-06-01

Open `/dream/243-spectral-cloud`. Press **Start** (a generative C-major-pentatonic ambient pad plays immediately) or **Drop a track** — ideally one of your own piano recordings — and your music becomes a slowly-rotating **volumetric nebula of light you orbit**. Each frame of the spectrum is deposited into 3D space: angle/radius around a disk = frequency (bass in the core, highs at the rim), height = time (a stack of 96 ring-buffered disks = a rolling few-second memory), point size + brightness = energy, hue = frequency (violet→cyan→rose). Drag to orbit, scroll to dolly, auto-orbit resumes when you let go.

Three subsystems beyond the deposition: an **energy-flux onset detector** fires an expanding spherical **shockwave shell** + a camera dolly-punch + a bloom pulse, with a live onset light + BPM estimate; the **spectral centroid** biases global hue and the cloud's dispersion (bright music blooms wider/sparklier, dark music condenses) so the *shape* tracks timbre, not just loudness; and a **dual audio source** (always-alive generative pad + `decodeAudioData` file loop through one analyser). Rendered as a single `THREE.Points` cloud with a custom GLSL `ShaderMaterial` (per-point size + additive bloom) — the lab's first volumetric orbital point-cloud of spectral history. References: Refik Anadol *Machine Hallucinations* data-sculptures + Ryoji Ikeda *data.scan*. Shipped as the winner of a **DEEP** 3-builder orchestration (one concept — "fly through YOUR music as a 3D world" — three render strategies; siblings `spectral-canyon` terrain + `spectral-tunnel` wormhole banked in IDEAS.md). Zero new deps · zero API.

Design notes: `src/app/dream/243-spectral-cloud/README.md`

---

### 258-kids-mirror-pets
**Status**: `demoable` · **Cycle shipped**: 278 · **Last touched**: 2026-06-02

Open `/dream/258-kids-mirror-pets`. **For kids (4+).** Press the big **Start** button and make faces at the camera — but your literal face is never shown. Instead a 14×18 grid of soft glowing **"pets"** (round creatures with tiny blinking eyes) lights up to *form* your reflection, pointillist-style, in the spirit of **Daniel Rozin's mosaic mirrors** (*Wooden Mirror*, *PomPom Mirror*). The awake pets sing: a column-sweep arpeggio rings the lit ones — vertical position = pitch (top row = high, a vertical xylophone of faces), **mouth open** (`jawOpen`) makes the music box louder/faster with more notes per sweep, **smile** turns everyone warm gold + brighter timbre + a happy major-third lift and grows little smiling mouths on the pets, **head tilt** pans the stereo and leans the whole swarm. C-major pentatonic so nothing is ever "wrong"; an always-on ambient pad + master limiter mean it's never silent and never harsh.

Webcam → **MediaPipe FaceLandmarker** (478-point mesh + 52 blendshapes, CDN `webpackIgnore` ESM — the build-verified pattern from 234) → **Canvas2D** mosaic (deliberately *not* three.js — over-represented in the last 10). **First face-tracking prototype in the lab** (234 was hands); first Rozin-style soft-mirror. Degrades gracefully: camera denied / CDN blocked → readable `text-rose-300` notice + a self-playing demo, and tapping anywhere lights pets and rings notes (touch fallback). Shipped as the winner of a **DEEP** 2-builder face-music orchestration; the sibling `257-kids-face-band` (a single glowing creature that mirrors your expressions) is build-verified and banked in IDEAS.md. Zero new deps · zero API.

Design notes: `src/app/dream/258-kids-mirror-pets/README.md`

---

### 260-kids-slime-garden
**Status**: `demoable` · **Cycle shipped**: 280 · **Last touched**: 2026-06-02

Open `/dream/260-kids-slime-garden`. **For kids (4+).** Press the big **Start** button, then touch anywhere on the dark screen — thousands of tiny glowing creatures (a real *Physarum polycephalum* slime-mold simulation) crawl toward your finger and weave glowing veins of light between the spots you tap, and the veins sing as they connect. ~3,500 typed-array agents on a 220×220 trail grid each sample the trail at three sensor points (front-left / front / front-right), rotate toward the brightest, step forward and deposit a little trail; the field diffuses (3×3 box blur) and decays each frame — the canonical Jones/Jenson Physarum transport-network algorithm — with a gentle extra pull toward your nearest "food" node so the network physically links your touches. Up to 5 food nodes each own a C-major-pentatonic voice (C3 E3 G3 A3 C4); a node's gain + lowpass cutoff rise with the average glow sampled around it, so a well-connected, glowing node sings louder and brighter while a lonely one stays quiet and dark. Always-on soft C3+G3 sine pad + master `DynamicsCompressor` limiter → never silent, never clips, no scary transients.

The simulation runs on the CPU (double-buffered Float32 trail grid + typed-array agents, fixed-step with a catch-up cap) and is rendered through WebGL2: the trail grid is uploaded each frame as an `R8` texture (tight `UNPACK_ALIGNMENT`) and drawn through a bioluminescent gold→teal→magenta fragment shader over deep indigo with a white-hot dense core, living shimmer and settling vignette — **the art is WebGL-only, never a 2D canvas**. The CPU-sim + GL-render path avoids fragile float render-target ping-pong, so it runs on tablets without float-linear extensions. Degrades gracefully: agents crawl silently before Start (a living visual demo); WebGL2 unavailable → readable `text-rose-300` notice + the gentle pad still plays. No permissions (no camera/mic), no API route.

**First Physarum / agent-transport-network prototype in the lab** (260+ prototypes, technique never used) and the first GPU-shader-rendered kids piece of its kind — touch input + raw-WebGL output, chosen to dodge the over-represented `three.js` (4×) and `canvas2d` (4×) of the last 10. Extends the loved emergence vein of `236-particle-life-song` ❤️ — music FROM self-organization rather than audio-reactive visuals. Reference: Sage Jenson's *mold* + Jeff Jones, "Characteristics of Pattern Formation and Evolution in Approximations of Physarum Transport Networks" (2010). Shipped as the winner of a **WIDE** 3-builder kids fire; siblings `kids-lenia-pond` (Lenia continuous CA) + `kids-light-cloth` (Verlet mass-spring cloth) banked in IDEAS.md. Zero new deps · zero API.

Design notes: `src/app/dream/260-kids-slime-garden/README.md`

---

### 271-pigment-mosaic
**Status**: `demoable` · **Cycle shipped**: 285 · **Last touched**: 2026-06-02

Open `/dream/271-pigment-mosaic`. **The first AI-image-generation-INSIDE-an-AV-piece in the lab** (Karel's stated #1 direction, previously 0× in the last 15 builds) — and a deliberate **anti-glow**: an AI-generated "chapter" image is treated as reconfigurable *matter*, sliced into an N×M grid of tiles that the live music assembles, shatters, scales and re-sorts in real time, so a picture is something the sound **builds and destroys** rather than a static backdrop. Pick a source (mic / drop a file / **Karel's Welcome Home piano by track ID** via `/api/audio/:id` JSON-or-bytes / a D-dorian synth fallback — all through one `fftSize 2048` analyser); the lower FFT is folded into 16 column-bands plus RMS, spectral centroid and spectral flux. **Summon chapter** maps the live mood → a poetic prompt → `flux/schnell` (guarded api route) → the returned image is sliced and animated: loud bands grow / counter-rotate / fling their tiles outward (shatter) and punch *darker* (no additive glow ever); quiet passages let the matter settle back into the coherent picture; a flux transient triggers a debounced **brightness re-sort** so bright matter migrates and dark matter sinks. Chapters crossfade tile-by-tile; optional auto-regen capped at ~25s to bound FAL cost.

Single Canvas2D, ~60fps, zero per-frame allocation, pure `source-over` `drawImage` (the non-luminous "mosaic" output the 2026-06-02 jury explicitly asked for). **Degrades to zero API calls**: seeds with a procedural value-noise chapter on load; a 501 (no `FAL_KEY`) shows an amber notice and slices a procedural chapter instead, so the full shatter/settle/re-sort experience demos with no key. No canvas → rose notice; no mic / bad track → synth fallback. API route uses `guard` first (origin + rate-limit + daily quota over Karel's FAL budget). Refs: Refik Anadol *Machine Hallucinations* (data as pigment), David Hockney photo-collage "joiners", ACM IMX 2025 (DOI 10.1145/3706370.3727869, paywalled — cited from abstract). Shipped as the winner of a **DEEP** 3-builder fire; siblings `latent-breath` (WebGL displacement-warp of the chapter texture) + `dream-chapters` (WebGL optical-feedback *melting-memory* piece) banked build-verified in IDEAS.md. Reads `/api/audio/:id` only (no side effects); no new deps.

Design notes: `src/app/dream/271-pigment-mosaic/README.md`

---

### 279-tremor-score
**Status**: `demoable` · **Cycle shipped**: 289 · **Last touched**: 2026-06-03

Open `/dream/279-tremor-score`. Press **Begin listening to the Earth** — a calm low drone fades in and the day's earthquakes are plotted quietly on an ink world map. This is the lab's **first piece driven by a live external API**: it fetches the USGS real-time earthquake GeoJSON feed (`all_day` / `all_hour`, CORS-open, no key) and turns every quake on Earth into a sound event *and* an ink mark, so the composition is literally about the world right now and **never exactly repeats**. **Magnitude** → loudness + duration + a deep sub-rumble swell (M≥2.2) and filtered low-noise rumble (M≥4); **depth (km)** → pitch register / timbre from a **just-intonation / overtone palette** over a 55 Hz root (0 km bright & high → ~650 km dark, low, muffled — *not* C-major pentatonic, banned this cycle); **longitude** → `StereoPanner` (W=left, E=right); **latitude** → tone brightness + sawtooth for large events. Signal path per quake: osc(+sub/noise) → lowpass → gain envelope → StereoPanner → master → `DynamicsCompressor` limiter, with an always-on calm drone so the room is never silent. **Live** mode polls every 60s and sounds only genuinely-new quakes (staggered so a batch never slams); **Replay 24h** fast-plays the day in time-compressed order (24h → ~90s).

Visual is **deliberately non-luminous** (the 2026-06-02 JURY's "ban the glow" verdict): a single Canvas2D in plain `source-over`, ink-on-paper on near-black — a graphite lat/long graticule + map, each quake an expanding ink ring that settles to a magnitude-sized dot (M≥5 gets the one muted amber accent), and a scrolling pen-on-drum-paper **seismograph ribbon** that jolts per event. Degrades gracefully: if the USGS fetch fails (offline / CORS / blocked / empty) it falls back to a bundled ~30-quake set on a timer with a readable `text-amber-300/95` notice — **fully demoable with zero network**. No API route (client-side fetch to a keyless third-party feed; no secrets, no side effects), no new deps.

**First real-world-data sonification in the lab** — the JURY's explicitly-named empty shelf (the banked `transit-pulse`/`weather-score`/`iss-pass` seeds, finally realized via the cleanest keyless source). References: **SeismoDome** (Ben Holtzman, Seismic Sound Lab, Lamont-Doherty Earth Observatory / AMNH), **seismic2midi** (PyPI, Nov 2025), USGS feeds. Born from RESEARCH §289. Shipped as the winner of a **WIDE** 3-builder adult fire across three different empty shelves; siblings `midi-harmonograph` (first Web MIDI — harmony-as-harmonograph) + `ensemble-tabs` (first networked/multi-instance — BroadcastChannel ensemble) build-verified (all-three-present compiled) + banked in IDEAS.md.

Design notes: `src/app/dream/279-tremor-score/README.md`

---

### 280-kids-echo-canyon
**Status**: `demoable` · **Cycle shipped**: 290 · **Last touched**: 2026-06-03

Open `/dream/280-kids-echo-canyon`. **For kids (4+).** Press **start singing**, then sing, hum, or call across the canyon — a little paper creature ("Echo") on the far cliff catches your phrase and sings it right back as a flight of colored paper birds, then layers a gentle harmony underneath. The lab's **first call-and-response / canon piece**: everything else in the lab reacts to sound or generates it; this one *listens to you, waits, and answers* — the oldest musical game there is, turned into a toy a four-year-old can play alone.

Four subsystems: (1) **mic + pitch detection** — `getUserMedia` → `AnalyserNode` (analysis only; the voice is never played back, recorded, or sent), and ~every 130 ms a frame of time-domain samples runs through normalized **autocorrelation** pitch detection (Chris Wilson's canonical Web Audio method, YIN family, parabolic-interpolation refined); (2) **phrase segmentation** — an RMS gate captures degrees as you sing and ~620 ms of quiet ends the phrase, octave-collapsed so a high or low child voice both land in the same comfortable register; (3) **echo + harmony scheduler** — Echo replays your phrase note by note on a soft triangle mallet and adds a diatonic **third** 150 ms behind each note for a round-like shimmer, over an always-on C+G drone through a `DynamicsCompressor` limiter (safe sounds, never silent); (4) **cut-paper canyon render** — rAF/refs-only, birds fly sine-arc beziers cliff to cliff, the singing creature bobs and opens its beak, color = pitch.

Built straight at the 2026-06-02 JURY's three demands: **non-pentatonic** (the scale is **C-Lydian** — its raised 4th floats, deliberately not the C-major pentatonic the lab kept defaulting to; no wrong notes — anything you sing is snapped into the mode), **non-luminous** (pure matte **cut-paper on Canvas2D** — flat dusk sky, paper cliffs with drop-shadow lips, a paper moon, birds as colored ovals; pure `source-over`, drop-shadows only, **no glow, no additive, no WebGL**), and it **audits the sound** (the mode is the point). **Input = mic** — chosen because `touch` is at ×4 in the last-10 window (260/264/268/272) and therefore banned this cycle; mic was under-represented and is loved (`158-kids-hum-paint`❤️). Degrades gracefully: no mic / permission denied → a **self-playing demo** where the two creatures sing call-and-response to each other on a timer (readable `text-rose-300` invite to allow the mic), so it's always demoable. No reading, no fail states, ≥64px start button, ~14-min calm session. No API route, no `guard` needed (fully client-side; no server, no secrets).

Serves KIDS.md's explicitly-named **vocalization** goal (call-and-response is the purest singing prompt for 4yo language + music development) and the calm/contemplative corner KIDS.md stakes out. References: **YIN** (de Cheveigné & Kawahara, JASA 2002), **Chris Wilson PitchDetect** (`cwilso/PitchDetect`; the lab already uses Wilson's two-clocks in `256`), **Pauline Oliveros, *Deep Listening*** (2005). Born from RESEARCH §290. Zero new deps · zero API.

Design notes: `src/app/dream/280-kids-echo-canyon/README.md`

---

### 287-mirror-choir
**Status**: `demoable` · **Cycle shipped**: 295 · **Last touched**: 2026-06-03

Open `/dream/287-mirror-choir`. Press **Begin**, allow the camera, and stand back — your whole body becomes a choir. This is the lab's **first body-tracking piece** (MediaPipe Pose Landmarker, 33 real-time 3D landmarks loaded at runtime from a CDN, no npm dep) and its **first vocal-formant synthesis** (Klatt-style: a sawtooth glottal pulse split through three parallel bandpass formants F1/F2/F3 per voice). Your left and right hands are two singing voices whose pitch follows a warm **D-Dorian** chord stack by their height in frame; **arm openness** (wrist-span ÷ shoulder-span) morphs the vowel continuously oo→oh→eh→ah; **body height** shifts the register. Two softer pad voices + a low sine drone keep a chord under it all, through a delay tail — so it's never silent and never atonal (anything you do lands in the mode).

Deliberately **non-glow**: a matte **"wooden mirror"** (Daniel Rozin, *Wooden Mirror* 1999) — the camera is sampled into a grid of 14px tiles that light warm amber where your landmark-hull silhouette + pixel-brightness fall and stay near-black elsewhere; pure Canvas2D `source-over`, drop-shadows only, no additive/WebGL. Degrades gracefully: no camera / permission denied / MediaPipe fails → a **"ghost dancer"** loops 7 hand-authored keyframe poses (smooth-stepped over 20s) that drive the exact same choir + mirror, with a readable `text-rose-300` notice — **fully demoable at 06:30 on a phone with no camera**. The mic is never touched (camera-only; nothing recorded). No API route, no `guard` needed (camera + CDN model + Web Audio are all client-side; no server, no secrets). Zero new deps.

**First MediaPipe / body-tracking + first formant synthesis in the lab** — the ambition floor's own example of a never-used technique. Born from RESEARCH §295. Shipped as the winner of a **WIDE** 3-explorer adult fire across three empty shelves; siblings `aurora-wire` (live NOAA space-weather sonification — the lab's 2nd real-world-data source) + `still-room` (eyes-closed HRTF spatial audio navigated by phone tilt — first non-screen + first DeviceOrientation controller) build-verified and banked in IDEAS.md.

Design notes: `src/app/dream/287-mirror-choir/README.md`

---

### 290-kids-sound-safari
**Status**: `demoable` · **Cycle shipped**: 296 · **Last touched**: 2026-06-03

Open `/dream/290-kids-sound-safari`. **For kids (4+).** Press the big **Start** button, then turn your whole body in a slow circle — six animals (frog, bird, whale, cricket, owl, bee) are hidden at fixed bearings *around* you in 3D sound, each humming a soft motif. When you turn to **face** one, its song swells to front-and-center and brightens, the phone gives a tiny `navigator.vibrate` buzz, the animal blooms big onto the mostly-dark screen and sings a happy phrase — "found!" — and joins the found-row. Find all six → they sing a chord together, then it gently resets and loops. No reading, no fail, no timer; headphones make it magical, speakers still convey left/right.

This is the lab's **first deliberately non-screen / audio-FIRST piece** and its **first DeviceOrientation (heading) controller** in a shipped prototype — the screen is a footnote (a faint warm dusk-meadow compass + the found-row); the experience lives in spatial sound moving around the listener's head. Built straight at the 2026-06-03 JURY's provocations #2 (kids must *move* their body, not poke — touch input was banned this cycle), #3 (ship the spatial breadth banked-but-never-shipped — this is the `still-room` concept finally realized, recast for kids), #4 (build the unused head-tracked-spatial half of RESEARCH §295), and #5 (output is spatial *audio*, not a screen visualizer).

Subsystems: (1) **HRTF binaural panning** — one continuous `PannerNode` (`panningModel="HRTF"`, inverse distance) per animal at its compass bearing, plus an always-on ambient pad so it's never silent; (2) **DeviceOrientation head-tracking** — `alpha` rotates the `AudioListener` forward vector (feature-detects modern `forwardX/Z` AudioParams vs legacy `setOrientation`; same modern-vs-legacy detection for the panners), with iOS `requestPermission()` inside the click handler; (3) **find/collect state engine** — per-frame nearest-bearing test (within 25°) → gain swell + lowpass brighten + bloom; first-find fires the sung phrase + vibrate + found-row; all-found → celebration chord → gentle auto-reset; (4) **minimal warm Canvas2D compass** render (no WebGL/three.js, no glow). Degrades gracefully: if no `deviceorientation` events arrive within ~2s (desktop / denied / no sensor), it falls back to **pointer-drag + ← → arrow keys + a slow hands-free auto-tour** that finds the animals by itself with a readable `text-rose-300` hint — **fully demoable at 06:30 on a phone with zero sensors**. Mic is never opened; no recording. No API route, no `guard` needed (Web Audio + a motion sensor are all client-side; no server, no secrets). Zero new deps.

References: **Pauline Oliveros, *Deep Listening*** (2005); **Bernhard Leitner, *Sound Space*** (sound you move through); the **2026 head-tracked-spatial-audio wave** (THX Spatial Audio+ AI head tracking, CES Jan 2026 — the browser-feasible equivalent is `PannerNode` HRTF + DeviceOrientation, zero hardware). Born from RESEARCH §296. Shipped as the winner of a **WIDE** 3-explorer kids fire; siblings `kids-shadow-dance` (camera frame-difference dancing → blooming meadow) + `kids-sky-band` (today's real Open-Meteo weather → a generative kids band) build-reviewed and banked in IDEAS.md.

Design notes: `src/app/dream/290-kids-sound-safari/README.md`

---

### 291-harmonograph
**Status**: `demoable` · **Cycle shipped**: 297 · **Cycle 2 (expressive)**: 299 · **Cycle 3 (polychrome)**: 301 · **Last touched**: 2026-06-04

**Cycle 3 (cycle 301) — the polychrome specimen.** The multi-cycle thread reaches its planned 3rd cycle. The figure is no longer one color: **each held note draws its OWN running-composite thread in its circle-of-fifths color** (`pitchClassToColor`: `hue=((pc*7)%12)/12`, s 0.78 v 1.0 → `hsvToRgb`), so a major triad visibly **weaves from three distinct-but-kindred hues** — and because a fifth is one constant hue step, the chord reads as a single family rather than three clashing colors (RESEARCH §301 chose circle-of-fifths over the naive chromatic-rainbow mapping for exactly this reason). New `sampleCompositeUpTo` sums pendulums `[0..i]` but normalizes by the FULL set's amplitude so partial threads stay spatially registered with the full figure; it still cleans up under Pure tuning because every composite is built from the same JI-snapped ratios. Added the lab's **first vector export**: **Export SVG** emits one aspect-corrected `<polyline>` per colored thread over a dark ground → `harmonograph-<chord>.svg`, a true printable specimen (the PNG raster export from cycle 2 stays). A color **legend** mirrors the drawn threads (swatch + note name). References: **Chord Colourizer** (arXiv 2510.10173, 2025 — CQT chord → Newton's color wheel), **Jack Ox**'s circle-of-fifths color/harmony wheel, **maddie lim**'s "12 Tone Color Theory." Build 9.29→**10.4 kB**. Shipped as the winner of a **DEEP** 2-approach fire; the parallel **scope-mode** explorer (continuous Pure⇄Equal XY phosphor vector-scope + beat-Hz/LOCKED readouts + presets, folding in the banked `phase-scope`, citing Lissajous/Jerobeam Fenderson/Ryoji Ikeda) is build-verified and banked in IDEAS.md as **cycle 4**. Build-verified, not browser-verified — unverified surface: multi-strip draw legibility on a dense chord, the SVG aspect projection, PNG readback on Safari.

**Cycle 2 (cycle 299) — the expressive live instrument.** The lab's first multi-cycle thread advances instead of starting fresh. Four performance layers now sculpt the figure as it draws, each with a MIDI control AND a no-hardware fallback: **sustain pedal → figure-HOLD/accrete** (MIDI CC64 / Space bar / on-screen pad — released notes keep ringing AND keep contributing their decaying pendulum so the figure *accretes* as you layer chords over a held bass; lifting drops them from audio + figure together; HUD shows held-vs-pedaled, on-screen keys tint when pedaled); **mod-wheel → pendulum damping** (MIDI CC1 / ↑↓ keys / slider → exponential decay multiplier `0.35·17^d`, loose-sprawl → tight-spiral, with a readable `NN%` + word label); **velocity → ink intensity** (avg held velocity drives a `uInk` shader uniform so dynamics are visible); **PNG export** (`preserveDrawingBuffer:true` + `canvas.toBlob` → `harmonograph-<chord>.png`). Engine gained `HarmonographSynth.setPedal()` (parks key-released voices, returns dropped midis on release); the render loop composites held + pedaled notes. Build-verified (build size 7.51→**9.29 kB**), not browser-verified — unverified surface: pedal accrete edge cases (re-strike a parked note) and PNG readback on Safari (see STATE §299). Shipped as the winner of a **DEEP** 2-approach fire; the parallel `harmonograph-spectrum` explorer (per-note Newton-color-wheel threads + SVG vector specimen export, citing Chord Colourizer arXiv 2510.10173) is build-verified and banked in IDEAS.md as **cycle 3**.

Open `/dream/291-harmonograph`. Press **Start sound**, then play a chord — on a **MIDI keyboard**, your **computer keys** (`a w s e d f t g y h u j k o l p ;`, `z`/`x` = octave), or the **on-screen piano** — and the harmony *draws itself* as a Victorian **harmonograph**: each held note becomes a decaying pendulum whose frequency ratio is taken against the lowest held note, traced as `x(t)=Σ aᵢ·sin(rᵢt+φᵢ)e^(−dᵢt)`, `y(t)=Σ aᵢ·cos(rᵢt+φᵢ+kᵢ)e^(−dᵢt)`. A prominent **Pure tuning (Just Intonation)** toggle snaps every ratio to the nearest small-integer just interval for BOTH the oscillator pitch AND the pendulum rates — so a consonant chord's figure visibly **cleans up into a near-closed spirograph** while the audible beating settles, at the same instant; under 12-TET the irrational ratios make the curve drift and tangle. That coupling — *see it close, hear it settle* — is the whole point.

Four subsystems: (1) **three-way note input → one note-on/off path** — Web MIDI (`requestMIDIAccess({sysex:false})`, `onstatechange` hotplug, device-name readout), auto-repeat-guarded QWERTY, and a 2-octave on-screen piano (≥44px, multi-touch pointer events); (2) **warm 12-voice Web Audio synth** (sine + +7¢ detuned triangle → lowpass → ADSR → shared feedback delay → master → `DynamicsCompressor` limiter, velocity → loud+bright, soft always-on drone); (3) **JI-lock + chord/ratio analysis** (live HUD: held notes, best-guess chord name, active ratio set e.g. `1/1 : 5/4 : 3/2`); (4) **raw WebGL2 renderer** (NOT three.js, NOT Canvas2D) — hand-written GLSL ES 3.00, VAO/VBO, ~3000-point `LINE_STRIP` `bufferSubData`'d each frame, additive glow, translucent fade-quad ink trail, idle Lissajous "seed" figure when nothing is held, DPR/resize-aware. Optional **MIDI-out echo** (off by default) forwards held notes to the first output port, so the output isn't only a screen.

This is the lab's **first harmonograph / harmony-as-visible-geometry** piece, and it claims the **AMBITION-MANDATE criterion #4 (multi-cycle commitment) for the first time in the lab's history** — the 2026-06-03 JURY's #1 provocation (zero multi-cycle builds in 15+ cycles, "stop shipping orphans"). It is the banked, build-verified `281-midi-harmonograph` breadth resurrected (JURY provocation #3: "ship the breadth you've already paid for instead of citing new breadth"), and it inverts the audio→visual driver the JURY flagged (#5: output a MIDI/sound instrument, not a sound→picture viz). **Novelty honesty**: Web MIDI itself already exists at `4-operator` — the novel technique is the **harmonograph geometry** (0 prior hits in INDEX/READMEs, grep-verified), not MIDI. Diversity: INPUT=MIDI/keyboard · OUTPUT=raw-WebGL2 line-geometry · TECHNIQUE=harmonograph+JI · VIBE=theory-literate live instrument — dodges the JURY's banned [touch · three.js · poke-toy-in-exotic-tuning] AND the over-represented [matte-Canvas2D 5×]. Degrades gracefully: no Web MIDI (e.g. Safari) → amber notice + working keyboards; MIDI-but-no-device → amber prompt; no WebGL2 → rose notice (audio + keyboards still work). No API route, no `guard` needed (Web Audio + Web MIDI + WebGL2 all client-side; no mic, no recording, no network, no secrets). Zero new deps. References: the **harmonograph** (Hugh Blackburn pendulum apparatus, ~1840s) + **Lissajous figures** (J. A. Lissajous, 1857). Shipped as the winner of a **DEEP** 2-explorer adult fire; sibling **`phase-scope`** (a continuous Pure⇄Equal XY oscilloscope tuning-lock — see+hear consonance settle on three channels at once) build-verified and banked in IDEAS.md. **Multi-cycle thread — cycle 2 (299) ADDED**: sustain-pedal figure-hold/accrete, mod-wheel→pendulum-damping, velocity→ink, PNG export (see top of this entry). **Cycle 3 will add**: per-note Newton-color-wheel threads (circle-of-fifths hue) + SVG vector specimen export + color legend (banked in IDEAS.md from the parallel explorer).

Design notes: `src/app/dream/291-harmonograph/README.md`

---

### 298-kids-echo-friend
**Status**: `demoable` · **Cycle shipped**: 302 · **Last touched**: 2026-06-04

Open `/dream/298-kids-echo-friend`. **For kids (4+).** Press the big **"Sing to me ✨"** button, then **sing any little phrase** — a soft glowing creature *listens*, **sings your phrase back** in its own warm voice, and **remembers** it. Every few rounds it plays a growing **little song** made of everything you've sung together. No reading, no timer, no score, no fail; the creature hums a gentle drone so it's never silent.

This is the kids lane's first **call-and-response with memory** — the antidote to the lane's local minimum ("poke a cute thing → it drones, no memory"). It reframes the banked `294-kids-voice-garden` **out of the C-pentatonic rut** (quantizes to **D-Dorian**) and moves `296-kids-firefly-tilt`'s remember-and-replay mechanic onto a **fresher input** (voice, not tilt) — exactly the two queued kids moves from STATE §301.

Four subsystems into one pipeline: (1) **real-time monophonic pitch detection** — YIN/NSDF (normalized square difference) autocorrelation on raw `AnalyserNode` PCM, no ML, no CDN model, mic analysis-only (never recorded/uploaded), each detected Hz snapped to D-Dorian; (2) **call-and-response memory engine** — collects a phrase frame-by-frame, detects ~0.8–1.2 s of silence as phrase-end, dedupes into notes, pushes to a growing memory, and every 3rd phrase replays the whole accumulated song; (3) **warm sing-back synth** — sine + triangle through lowpass + short delay, drone-duck while echoing, all through a `DynamicsCompressor` limiter so it can never get loud/harsh; (4) **hand-written WebGL2 GLSL** creature — an SDF blob with domain-warped organic jiggle on an aurora ground, pitch-driven hue (violet→amber→teal→lime across the Dorian range), one orbiting **memory orb per remembered phrase**, and a sing-back pulse ring. Degrades gracefully: **no mic / permission denied → a hands-free auto-demo** sings 6 hand-authored D-Dorian phrases through the *identical* pitch→echo→memory pipeline (so the whole loop demos itself on a phone with no mic), with a readable `text-rose-300` notice; **no WebGL2 → rose notice, audio still runs**; iOS-safe (mic + AudioContext created inside the click handler). No API route, no `guard` needed (Web Audio + WebGL2 are client-side; no recording, no network, no secrets). Zero new deps.

References: **SingingSDS** (arXiv:2511.20972, Nov 2025 — a dialogue agent that *responds by singing*; this is its fully-client, no-AI, kid-sized embodiment), **Pauline Oliveros, *Deep Listening*** (the listen-then-answer tradition), and the classic **call-and-response / "Simon"** memory game. Born from RESEARCH §302. Shipped as the winner of a **WIDE** 3-explorer kids fire; siblings `299-kids-clap-band` (clap → onset-detection layered groove, Steve Reich *Clapping Music*) + `300-kids-blow-sail` (blow → breath-envelope sailing, Wiener-entropy breath/tone discriminator) build-reviewed and banked in IDEAS.md. **Build-verified, not browser-verified** — unverified surface: whether YIN pitch-tracking on a real 4-year-old's wobbly voice lands cleanly on the Dorian grid, and whether the sing-back-and-grow loop reads as a "song we're building together" vs. a list of echoes.

Design notes: `src/app/dream/298-kids-echo-friend/README.md`

---

### 303-kids-wind-harp
**Status**: `demoable` · **Cycle shipped**: 304 · **Last touched**: 2026-06-04

Open `/dream/303-kids-wind-harp`. **For kids (4+).** Hit the big amber **"Tilt to play ▸"** button, then **tilt your phone or iPad** — gravity swings a row of seven glowing strings like a wind-harp, and any string that swings far enough **plucks itself and sings**. The child plays music by *tipping the world*, hands-free; no tapping, no reading, no timer, no fail.

The lab's **first tilt-input piece since the loved `83-kids-tilt-rain`**, and a deliberate pull on three loved prototypes (`83-kids-tilt-rain`❤️ tilt · `105-pluck-field`❤️ Karplus pluck · `140-kids-string-bridge`❤️ playable strings). It couples two genuinely **fresh-for-this-lab techniques**: (1) **Verlet-integration string physics** — each of 7 strings is a 14-node mass-chain solved with Verlet + distance-constraint relaxation (3 passes/frame) on a **fixed 120 Hz step**; the device-tilt `deviceorientation` β/γ becomes a **gravity vector**, so tipping the tablet changes which way "down" is and the hanging strings swing and settle with believable physical motion; (2) **Karplus-Strong plucked-string synthesis** (Karplus & Strong, 1983) — when a string's midpoint swing crosses a threshold it plucks: a noise burst rendered offline through a tuned lowpass-fed delay line into an `AudioBuffer`, bigger swing → louder/brighter/longer, per-string refractory so it never machine-guns, stereo-panned low→high. A third subsystem is the hand-written **raw WebGL2** ribbon renderer (matte alpha-over string curves expanded along their normals on a soft breathing dark gradient, a glow flash per pluck — **no additive bloom, no three.js**). The 7 strings are tuned to **D-Dorian** (D E F G A B C — explicitly NOT C-major-pentatonic), with an ambient D+A drone underneath and a `DynamicsCompressor` limiter so simultaneous plucks can never blast.

Degrades at every step so it's **fully playable on a desktop with no sensors**: iOS 13+ `DeviceOrientationEvent.requestPermission()` is called inside the Start gesture (denial → readable `text-rose-300` note + fallback); **pointer-drag** tilts the gravity vector on desktop; and a **2 s auto-sway** kicks in when no tilt events arrive so the harp **plays itself** and a 4-year-old (or Karel at 06:30 on his phone) always sees cause→effect. No API route, no `guard` needed (Web Audio + WebGL2 all client-side; no mic, no camera, no network, no secrets). Zero new deps.

References: the **Aeolian harp** (a stringed instrument played by moving air rather than fingers — here the child's tilt is the wind); the **Karplus-Strong** plucked-string algorithm (1983). Chains from RESEARCH §304 (*Rhythm in the Air*, arXiv:2511.00793, Nov 2025 — embodied motion → scale-constrained musical output; tilt is the body, D-Dorian is the scale constraint). Winner of a **WIDE** 3-explorer kids fire; siblings `299-kids-clap-band` (clap → HFC-onset-detection layered groove, Steve Reich *Clapping Music*) + `300-kids-blow-sail` (blow → Wiener-entropy breath-envelope sailing) build-reviewed and re-banked in IDEAS.md. **Ambition 2/5**: never-used-technique(#1, Verlet rope physics) + named-reference(#3). **Build-verified, not browser-verified** — unverified surface: the deviceorientation→gravity *feel* and pluck threshold on a real tilting hand, the iOS permission branches, and the rendered look of the ribbon strips (no sensors/GPU in this sandbox).

Design notes: `src/app/dream/303-kids-wind-harp/README.md`

---

### 306-kids-rain-shaker
**Status**: `demoable` · **Cycle shipped**: 306 · **Last touched**: 2026-06-04

Open `/dream/306-kids-rain-shaker`. **For kids (4+).** Tap the big amber **"Shake to play"** button, then **shake the phone or iPad like a rainstick or maraca** — gentle shakes make a soft trickle of beads, bigger shakes tumble a warm rain down the screen, and each strong shake-peak strikes a **D-Dorian** bell. The child plays by *moving the whole device*, hands-free; no tapping, no reading, no timer, no fail. An always-on pad keeps it alive, and a `DynamicsCompressor` brick-wall limiter means even the most vigorous shaking can never blast.

The lab's **first `devicemotion` / accelerometer instrument** in 300+ prototypes — and deliberately a *different sensor and axis* from the lab's prior motion pieces: `303-kids-wind-harp` and `290-kids-sound-safari` used `deviceorientation` (tilt β/γ and compass heading α — device *orientation*), whereas this reads `accelerationIncludingGravity` for shake *energy*. Three subsystems: (1) **`shake.ts`** — per `devicemotion` event, read the acceleration vector, subtract a slow per-axis running average (a **high-pass** that removes the constant gravity component), take the magnitude, and feed a smoothed **shake-energy envelope** (fast attack, slow release); threshold crossings with a ~130 ms refractory emit discrete **hit** events while the continuous envelope drives bead density. Every input path (motion, pointer-shake, auto-demo) feeds the IDENTICAL `pushSample` pipeline. (2) **`rain-audio.ts`** — a soft D-Dorian pad drone (detuned triangles, breathing lowpass) + a rainstick trickle of short filtered-noise bead grains whose spawn rate/brightness track the live energy + **FM bell chimes** struck on hit events (panned, velocity from hit strength, lowpassed so they never get piercing), all summed through a final `DynamicsCompressor` used as a limiter. (3) **`rain-gl.ts`** — raw **WebGL2** (hand-written GLSL ES 3.00): a soft **dark→dawn** gradient quad that warms with energy + a CPU-simulated pool of up to 600 falling **bead/rain particles** as soft point-sprites in **matte premultiplied alpha-over** (the lab's non-additive house style — switched from the builder's additive blend during curation to honor the JURY's anti-glow ban) + warm glow blooms on each bell. DPR/resize aware.

Degrades for the 06:30 phone review: iOS 13+ `DeviceMotionEvent.requestPermission()` is called inside the Start tap (denial → readable `text-rose-300` note + fallback); on a sensor-less device it falls back to **pointer/mouse-shake** (fast pointer movement synthesises an acceleration vector into the same detector) and a gentle **auto-demo** that rains and chimes by itself; no WebGL2 → `text-rose-300` notice, audio still runs. `AudioContext` is created inside the Start tap (iOS-safe). No API route, no `guard` needed (Web Audio + a motion sensor + WebGL2 are all client-side; no mic, no camera, no network, no secrets). Zero new deps.

References: the **rainstick** (Andean/Chilean cactus-spine instrument played by tilting and shaking) + the **maraca / shaker** percussion tradition; the embodied-motion→sound mapping echoes movement-sonification research (**CHI 2026**, *Designing Interactive Movement Sonification*). Born from RESEARCH §306. Winner of a **WIDE** 3-explorer kids fire; siblings `304-kids-clap-band` (clap → HFC-onset-detection layered groove, Steve Reich *Clapping Music*, D-Mixolydian) + `305-kids-blow-sail` (blow → Wiener-entropy breath-envelope sailing, C-Lydian) build-verified and re-banked in IDEAS.md. **Ambition 3/5**: never-used-technique(#1, devicemotion shake-energy) + named-reference(#3) + recent-research(#5, §306). **Build-verified, not browser-verified** — unverified surface: the shake threshold/scale *feel* on a real shaking hand (one-number fixes if too touchy or too stiff), the auto-demo chime cadence, and WebGL2 point-size behaviour across GPUs (no phone sensor / GPU in this sandbox).

Design notes: `src/app/dream/306-kids-rain-shaker/README.md`
