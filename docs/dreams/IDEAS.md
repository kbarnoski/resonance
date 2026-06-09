# Resonance Dream IDEAS — living queue

Each idea has a status (`queued` / `in-progress` / `demoable` / `polished` / `dead`),
a slug (becomes the route `/dream/<n>-<slug>`), and a spec terse enough for
the Dream Agent to build from. Add new ideas to the bottom; promote
items by editing status in place.

The agent appends new ideas here from research cycles. Karel adds ideas
via Claude Code conversation; assistant transcribes into this file.

---

## Banked from Cycle 365 (WIDE **adult** fire — *three frontier-different adult directions in one fire*: AI-image-inside-AV (Karel's stated #1), an adult body-spatial-room (jury #6), and attention-as-instrument ("go weird", jury's sharpest critique). Each cleared the floor via DIFFERENT tags. Winner shipped = `441-latent-listening-room` (audio→prompt→FAL-image→audio closed loop, fresh AI-image OUTPUT, rides loved `323`❤️). Both siblings are complete, **build-reviewed** real implementations (folder-isolated; folders removed per the no-half-built-folders rule, banked here as ready-to-resurrect TEXT). **Renumber on revival — max folder now 441.**)

### `442-body-orchestra` — step BACK from the webcam and conduct a spatial ensemble with your whole body: raise a hand → a voice swells/rises and pans to where your wrist is; spread your arms → pads bloom open; move faster → reverb opens *(banked sibling — the lab's first ADULT full-body MediaPipe spatial 'room'; the literal answer to jury-2026-06-08 #6 "the depth-camera/body spatial room is the single biggest untouched first")*
- **Tags** (dodge all current bans): INPUT = **camera / MediaPipe Pose** (33-landmark `PoseLandmarker`, the proven 419/423 CDN+WASM loader — analysis-only, nothing uploaded, no API route) · OUTPUT = **Canvas2D** glowing-skeleton stage (mirrored selfie, voice orbs that bloom with loudness) · TECHNIQUE = **body-landmark → spatial-audio** mapping (wrist Y → pitch/gain of two lead voices, wrist X → `StereoPannerNode` pan, shoulder span → pad+bass drone bloom, motion energy → shimmer + reverb depth; 5 voices → limiter → master, no HRTF so it reads on laptop/phone speakers) · VIBE = embodied / installation / conductor.
- **Ghost-conductor fallback:** no camera / MediaPipe fail → synthetic figure-8 conducting landmarks drive the **identical** audio+visual engine, so it performs fully hands-free at 06:30. Built files: `page.tsx` (415), `audio.ts` (334), `pose.ts` (244), `scene.ts` (250). **Refs:** Myron Krueger *Videoplace* (1985) · Jaques-Dalcroze Eurhythmics · Mathews Radio Baton / Machover Hyperinstruments / IRCAM gesture-sound · BlazePose (Bazarevsky 2020).
- **Why it didn't win + the FIX before reshipping:** it built the ensemble on **D Dorian** — the *retired* D-Dorian bed (jury 2026-06-07 ban). **Re-voice it onto an expressive non-D-Dorian tonal world first**, then it's a clean, near-ship-ready answer to jury #6. Also rest the camera one cycle (419/423/440 were all embodied) so the body-spatial novelty reads as fresh, not as more camera. **Ambition 2/5** (#2 ≥3-subsystems · #3 named-ref). Build-reviewed, zero new deps, no API route.

### `443-the-vanishing` — a 10-voice ensemble that can only survive your full attention: every time you look away (switch tabs / blur the window / mouse leaves the page / 20s idle) it **permanently loses one voice it can never get back**, moving only toward silence *(banked sibling — the purest "go-weird" answer to the jury's sharpest critique; the next adult "weird" ship, essentially ready as-is)*
- **Tags** (a genuinely never-used input): INPUT = **visitor attention / presence** (`document.visibilitychange` + `window` blur/focus + `pointerleave` + ~20s idle timer — never used as an instrument in any prior lab piece) · OUTPUT = **spare clinical Canvas2D** (luminous ring-glyphs that breathe with amplitude; on death a 3.5s fracture animation + a permanent dashed-ring "scar" with an ×; a fading center pulse + connection web) · TECHNIQUE = **irreversible state-erosion / entropy** (kill order ornament→roots: overtone → choirs → shimmer → arp → pulse → shadow → octave → fifth → ground; survivors grow more exposed) · VIBE = conceptual / critical / melancholy (the deliberate break from the consonant-resolving rut; expressive 12-TET C-minor, never JI-as-subject).
- **Opening state plays the full ensemble** so a passive 06:30 glance hears the complete piece and the concept reveals itself the instant they switch tabs; "Begin again" fully resets (a new session — the loss was real, but you can start over). Built files: `page.tsx` (550), `audio.ts` (622), `scene.ts` (340). **Refs:** Alvin Lucier *I Am Sitting in a Room* (1969, erosion-as-process) · Ryoji Ikeda (clinical data aesthetics) · Tehching Hsieh (duration art that costs real time) · John Cage (attention IS the score).
- **Why it didn't win:** only because `441` answers a *direct standing Karel directive* (AI-image-in-AV) and the recent window already broke the consonance rut (422/432/437); on pure surprise this was the closest contender. **Resurrect first** for the next adult cycle that wants the jury-#2 "refuses-to-resolve" piece. **Ambition 2/5** (#2 attention-input + erosion engine + Canvas2D scar-renderer + 4 event-listener subsystems · #3 named conceptual lineage). Build-reviewed, zero deps, no API route, no network.

---

## Banked from Cycle 364 (DEEP **kids** fire — *turn the phone to physically look around a 3D singing night sky*, one concept × three technical attacks, alternating off three consecutive WIDE cycles. Forced off touch (4× in last-10 → count-banned) and off the camera-body kids rut (419/423/234) onto **device-orientation** (the clean, embodied, hands-free-on-phone lane). Winner shipped = `440-kids-comet-gather` (sweep-to-gather a personal constellation → long-form evolving lullaby, three.js — the biggest concept + the thin long-form-generative slot). Both siblings are complete, **build-reviewed** real implementations (tsc + ESLint clean — 438: 519 lines incl. quaternion-slerp gyro + audio.ts/scene.ts; 439: 495 lines incl. hand-written GLSL 300 es + gl.ts; folder-isolated); folders removed per the no-half-built-folders rule, banked here as ready-to-resurrect TEXT. **Renderer note for revival: both three.js (438) and raw-WebGL2 (439) are at 2× in the trailing window — both still clean lanes; renumber on revival, max folder now 440.**)

### `438-kids-star-window` — hold the phone up like a window, turn/tilt to look around a 3D night sky, AIM at a glowing star-creature to wake it so it sings from where it sits *(banked sibling — the most immediate / kid-legible take; the cleanest cycle-2 simplification of `440`)*
The most *forgiving* and instantly-rewarding of the three: sweep your aim past a star and it swells-and-sings (no dwell, no scoop — pure immediate cause-effect, the legibility logic that won `419`/`423`/`429`). three.js, 20 Fibonacci-lattice star-creatures + ~1400 background stars, **quaternion-slerp** gyro magic-window (more frame-correct than `440`'s yaw/pitch), per-star `StereoPannerNode` pan + proximity gain, D-major-pentatonic chords, figure-8 auto-pan tour, DynamicsCompressor limiter, iOS `requestPermission` in the Begin tap, drag fallback. Ambition 2/5 (#2 ≥3-subsystems + #3 magic-window/3-DoF-spatial-audio). **Resurrect** if a future kids cycle wants the *immediate* version for the youngest players (3-year-olds who can't yet hold a steady dwell), or as a polish/companion to `440`. Build-reviewed, zero new deps, no API route.

### `439-kids-star-night` — the SAME aim-to-wake night sky, rendered as a **raw-WebGL2** GLSL additive-glow point-field (the atmospheric renderer attack) *(banked sibling — the renderer-diversity revival)*
Hand-written GLSL 300 es vertex+fragment pipeline (W3C Rz·Rx·Ry orientation → `u_view` matrix; 3-layer additive Gaussian glow: core + halo + bloom + aim sparkle-ring; `gl.ONE,gl.ONE` blending; ~500-point starfield + 20 singing stars). Same gyro magic-window + `StereoPannerNode` spatial audio + pentatonic + auto-pan + iOS permission + drag fallback as `438`, but a deeper/more-nebula atmospheric look from the raw shaders. Ambition 2/5 (#2 + #3). **Resurrect** when the kids lane wants raw-WebGL2 renderer diversity and a moodier night than three.js sprites give; slightly higher build risk (shader compile / OEM gyro-frame quirks). Build-reviewed (tsc + ESLint clean), zero deps, no API route.

---

## Banked from Cycle 362 (WIDE **kids** fire — *three genuinely different NON-percussion kids registers*, breaking the recent kids-percussion rut (419 pose-beat / 423 face-beat / 426 euclid / 429 noise-foley were all rhythm). The grep audit this fire killed three would-be #1 claims (fluid, shadow, hand-tracking all already in the lab — the lab is technique-saturated at 432 prototypes), so all three briefs cleared the floor honestly at **2/5** (#2 ≥3-subsystems + #3 named-ref) and competed on register-breadth + 06:30 phone read. Winner shipped = `433-kids-fluid-paint` (real Stam Navier-Stokes GPU fluid finger-paint, WebGL2 — liquid-dreamy, rides loved `84-wave-fluid`❤️ + the most-loved paint lineage). Both siblings are complete, **build-reviewed** real implementations (tsc + ESLint clean — 434: 778+64 lines, 435: 1089 lines incl. real HandLandmarker; folder-isolated); folders removed per the no-half-built-folders rule, banked here as ready-to-resurrect TEXT. **Renderer note for revival: Canvas2D is over-represented and three.js/WebGL2 are the cleaner kids lanes; renumber on revival, max folder now 433.**)

### `434-kids-lantern-sky` — tap to launch glowing paper lanterns into a 3D night sky you LOOK AROUND inside, each singing from its own place in true HRTF binaural space *(banked sibling — the cosmic-wonder / 3D-spatial register; the headphone piece)*
- **Tags** (clean dodge of all bans): INPUT = **touch + device-gyro** (tilt to look around; drag fallback) · OUTPUT = **three.js** (the freshest renderer lane, 1× recent) · TECHNIQUE = **true 3D HRTF spatial audio** (`PannerNode` `panningModel:"HRTF"` + `AudioListener` orientation re-derived from the camera quaternion **every frame**, so turning your head genuinely moves the choir around you) · VIBE = cosmic/calm/wonder.
- **The mechanic:** night-sky dome (350-point starfield, additive moon halo, warm horizon torus). Camera **rotates only, no translation** (non-nauseating). Tap → a warm glowing lantern (cylinder body + additive glow-sphere) rises with sinusoidal sway, singing a sustained slow-attack voice (G-major-pentatonic, color=pitch, any combination consonant) positioned at its 3D world coords via its own `PannerNode`; up to ~10–12 coexist, old ones fade high up. Always-on open-fifth ambient pad; `DynamicsCompressor` brick-wall limiter (−8 dB / 16:1) → master 0.22 (safe ears). iOS: `AudioContext` + `DeviceOrientationEvent.requestPermission()` inside the Begin tap; auto-demo launches a lantern every ~1.5 s + slow-pans the camera hands-free after 1.8 s. Full three.js disposal + listener teardown. Built files: `page.tsx` (778), `README.md` (64). **Refs:** Web Audio `PannerNode` HRTF / Google Resonance Audio lineage · sky-lantern / Yi Peng (Khom Loi) festival image.
- **Why it didn't win:** the most genuinely *spatial* of the three and a clean three.js dodge, BUT its core payoff — the **binaural HRTF field** — is **largely lost on phone speakers** at the 06:30 review (the README admits this; needs headphones), and it's the closest neighbour to an existing piece (`238-kids-tilt-world` already does tilt + 3D + panned audio; the differentiator here is HRTF-vs-StereoPanner, a real but headphone-dependent upgrade). **Revive:** the **headphone/installation** spatial piece, or as the explicit cycle-2 over `238` (the HRTF-tracks-camera engine IS the upgrade); pair with a visual payoff that also reads on phone speakers (e.g. lanterns visibly swirl past as you turn) so it isn't headphone-gated. Reconstructable from this spec. **Ambition 2/5** (#2 ≥3-subsystems · #3 named).

### `435-kids-air-ribbon` — paint music in the AIR: wave a hand at the camera, a glowing light-ribbon trails your fingertip and SINGS a sustained song (friendly theremin) *(banked sibling — the magical-flowing / sustained-melodic-camera register; the inverse of the recent face/pose BEATS)*
- **Tags:** INPUT = **camera / MediaPipe HandLandmarker** (index-fingertip, analysis-only — never recorded/stored/uploaded) · OUTPUT = **Canvas2D** (additive-glow trailing ribbon + sparkle particles + dim mirrored backdrop) · TECHNIQUE = **hand-landmark → continuous air-theremin** (fingertip Y → pitch snapped to C-major-pentatonic with 60 ms `setTargetAtTime` portamento GLIDE — sustained/singing, NOT discrete hits; X → `StereoPannerNode`; hand openness → timbre/volume) · VIBE = magical/flowing/dreamy.
- **The mechanic:** HandLandmarker via `webpackIgnore` CDN dynamic import (zero npm dep), `detectForVideo`, fingertip drives a fading glow-ribbon (hue=pitch, violet→cyan) with a bright Gaussian head + gravity sparkles. 3-osc voice (triangle + sine octave + sine fifth) → voice gain → panner → `DynamicsCompressor` (−8 dB / 16:1) → master 0.22; always-on C3 ambient pad (never silent). **Three-tier always-demoable fallback** (the strength): camera denied / CDN fail → scripted figure-8 "ghost hand" melody loop immediately; no hand within 2.5 s → ghost auto-kicks alongside the live feed; pointer/drag fallback always playable on a laptop. Full camera + landmarker + audio teardown. Built files: `page.tsx` (604), `audio.ts` (220), `hand.ts` (142), `README.md` (123). **Refs:** Léon Theremin (1928) gestural-pitch instrument · Myron Krueger *Videoplace* (1975) camera-as-instrument · MediaPipe HandLandmarker (Google).
- **Why it didn't win:** a genuinely fresh **register** (sustained melodic air-painting — the melodic *inverse* of the recent face/pose percussion) and a superb always-demoable ghost fallback, BUT (a) **camera INPUT** was just used back-to-back-ish in the recent kids ships (`419`/`423`) so reviving it again leans on the camera lane the lab is resting, and (b) **Canvas2D OUTPUT** is over-represented (3× in the last-10, would tip to 4×), where the winner's WebGL2 is the cleaner dodge. **Revive:** the next time the camera lane is fresh and Canvas2D isn't over-represented — it's the strongest *melodic* (vs percussive) camera-kids piece banked; or port the ribbon to WebGL2/three.js for renderer diversity. Reconstructable from this spec. **Ambition 2/5** (#2 ≥3-subsystems · #3 named).

## Banked from Cycle 361 (WIDE adult fire — *three genuinely unrelated go-weird directions*, one per renderer lane, against the jury's "the lab learned to go deep and forgot how to go weird." Winner shipped = `432-three-body` (N-body gravity sim → sound, Canvas2D — grep-verified lab-first technique, the most elegant "refuses to resolve"). Both siblings are complete, **build-reviewed** real implementations (tsc + ESLint clean, ~670/841 lines, folder-isolated); folders removed per the no-half-built-folders rule, banked here as ready-to-resurrect TEXT. Both are strong ADULT resurrections — they deliberately diversify OUTPUT (three.js, raw-WebGL2) and INPUT (external-data, keyboard) away from the winner.)

### `430-wiki-pulse` — the LIVE Wikimedia recent-changes firehose sonified: every edit on Earth, right now, bots vs humans *(banked sibling — the real-world-data + "music about something other than music" take; the freshest data SOURCE the lab has)*
- **Tags** (clean dodge of all bans): INPUT = **external SSE data** (Wikimedia EventStreams, public/keyless/CORS, client-side `EventSource` — NO api route, no guard) · OUTPUT = **three.js** (rising glowing nodes, additive bloom) · TECHNIQUE = real-time event-stream sonification · VIBE = restless/global/never-resolving.
- **The mechanic:** connects to `https://stream.wikimedia.org/v2/stream/recentchange`, keeps `type==="edit"||"new"`, reads `wiki`/`bot`/`user`/`length.{old,new}` → `delta`. **delta** (log-scaled) drives amplitude/duration/base-freq (big additions bloom deep & swelling, tiny edits soft high ticks; sign changes timbre — deletions glide down with a gritty high-passed breath); **bot vs human → two distinct timbres** (bots dry/mechanical/quantized square blips; humans warm/breathy/resonant triangle-through-moving-LPF + noise breath — "you can hear the machines vs the people," the emotional core); **wiki/language → stereo pan** (west→east spread + micro-detune); always-on detuned-sine bed; master `DynamicsCompressor` brick-wall limiter + voice cap. Each edit also spawns a rising three.js sphere (size = log|delta|, humans warm / bots cool, x = pan). **Reliability:** a single Begin gesture creates/resumes the AudioContext (iOS); a **deterministic seeded synthetic firehose** drives the EXACT same pipeline if no live event arrives within ~2.5s (amber "offline demo" notice → green "● live" when real events flow), so it always comes alive hands-free in ~2s. Built files: `page.tsx` (~670), `README.md`. **Refs:** **Hatnote *Listen to Wikipedia*** (LaPorte & Hashemi, 2013 — the canonical Wikipedia-edit sonification; this is a darker, non-consonant, three.js take) + **Wikimedia EventStreams**.
- **Why it didn't win:** the highest-*concept* surprise of the slate and the most direct answer to the jury's #4 ("zero real-world-data sonification in 15 cycles — sonify an external API, it breaks the mic rut AND the consonance rut in one fire"), BUT data-sonification is **explicitly NOT a lab-first** (`314-solar-wind` / `337`/`418-seismic` already did it — corrected IDEAS §359), so it tops out at **ambition 2/5** (#2 ≥3-subsystems: EventSource ingest + Web-Audio synth + three.js render · #3 named-ref) where `432` clears 3/5 with a grep-verified #1. **Revive:** the obvious next **real-world-data ship** — it's the freshest data SOURCE the lab has (not seismic/solar) and breaks the mic+consonance ruts together; **fix-first:** add per-region timbre color (currently language is pan-only) and orchestrate dense bursts instead of thinning at the voice cap. Reconstructable from this spec.

### `431-test-signal` — clinical Ikeda / Alva-Noto GLITCH-WALL instrument, raw-WebGL2 data-card *(banked sibling — the purest clinical refuse-to-resolve swing; jury #2)*
- **Tags:** INPUT = **keyboard/touch** (toggle + sculpt channels) · OUTPUT = **raw WebGL2** (hand-written GLSL monochrome test-card) · TECHNIQUE = sine-sweep + look-ahead impulse-grid + bit-crush glitch (no scale) · VIBE = clinical/abrasive/unresolved.
- **The mechanic:** three independent signal channels, nothing pitched to a scale. **SWEEP** (key 1) — a continuous log-glide sine (top capped 9 kHz, amplitude rolled off as freq climbs) + gliding sub. **IMPULSE** (key 2) — band-passed filtered-noise clicks scheduled with a Web-Audio **look-ahead scheduler** (Chris Wilson "Two Clocks", 25ms tick / 100ms ahead), `RATE`/`DENS` controls, no pitch. **GLITCH** (key 3) — bit-crush via quantizing `WaveShaperNode` + sample-hold playbackRate + stutter gate, `RATE`/`BRGHT`. All → master gain → brick-wall `DynamicsCompressor` (−6 dB / ratio 20) → analyser → out. Raw-WebGL2 GLSL data-card: sweep-tracking scan line, density-shifting barcode field, impulse-strobed columns (localized + soft, **no full-screen strobe**), glitch displacement/block-noise, a live oscilloscope trace of the master output; `prefers-reduced-motion` → `u_calm` dampens everything. **Reliability:** Begin creates/resumes the ctx in-gesture (iOS), then auto-sequences SWEEP→IMPULSE→GLITCH (~0.3/2.1/4.2s) hands-free, then fully interactive (cards ≥44px + keys). Built files: `page.tsx` (~841), `README.md`. **Refs:** **Ryoji Ikeda** (*test pattern* / *dataplex* / *data.matrix*) + **Alva Noto / Carsten Nicolai** (*Xerrox*, clicks-and-glitch).
- **Why it didn't win:** a genuine, safety-serious commitment to the Ikeda/Alva-Noto idiom (un-snapped glide, real look-ahead scheduler, dependency-free bit-crush, GLSL data-card driven by live audio state) — but **ambition 2/5** (#2 + #3; refuse-to-resolve is the *framing*, not a novel technique) and the lab already swung at refuse-to-resolve twice recently (`357-shatter`, `422`), so it's the second piece at the same mandate rather than a new capability. **Revive:** ship next time the adult lane wants the *pure clinical* register on its own renderer (raw-WebGL2, distinct from 357's DOM/CSS and 422's grid); **deepen-first:** make the impulse grid a programmable pattern sequencer and the glitch channel player-triggerable as discrete one-shots (both self-flagged) to push it from "ambient generator" to "instrument." Reconstructable from this spec.

## Banked from Cycle 360 (DEEP kids fire — *finger-paint where the brush's TEXTURE is its SOUND, noise not notes*. Winner shipped = `429-kids-texture-paint-tap` (impulse+resonator foley, Canvas2D, discrete crunch/pop/tap/scratch/splash — the lab's first pure-NOISE kids instrument by touch, jury #1 for kids). Both siblings are complete, **build-reviewed** real implementations (~900–1300 lines, folder-isolated, ESLint-discipline followed); folders removed per the no-half-built-folders rule, banked here as ready-to-resurrect TEXT. Shared thesis: every kids sound toy maps to pentatonic PITCH; these make the whole palette NOISE/TIMBRE. **Renderer note for revival: Canvas2D is now 4× in the trailing window → 428 (WebGL2) is the cleaner lane; renumber on revival, max folder now 429.**)

### `428-kids-texture-paint-morph` — subtractive noise-morph on a raw-WebGL2 painterly canvas *(banked sibling — the BEAUTIFUL take + the obvious cycle-2 deepening)*
- **Concept:** same toy as 429 (paint a texture, hear it) but the sound is **continuous subtractive synthesis** — an always-running noise bed (white + brown) sculpted live by resonant biquad filters: finger X → filter centre/brightness, Y → Q/resonance, drag-speed → energy. Textures: 🌬️ Wind (bandpass-swept brown noise) · 💧 Water (resonant bubbling) · 🏜️ Sand (narrow high hiss) · 🔥 Fire (low noise + irregular crackle bursts) · ⚡ Fizz (wide bright noise + fast tremolo).
- **Render:** **raw WebGL2** (hand-rolled, no three.js) — 3 shader programs + **ping-pong FBO accumulation** so strokes glow and accrete; per-texture procedural appearance (fbm gradients, ripple rings, grain stipple, turbulent fire, sparkle hash). The most visually striking candidate of the fire — a glowing accreting paint canvas, the strongest pull on Karel's loved-paint lineage.
- **Why it didn't win:** continuous morph is less kid-legible than 429's discrete one-dab-one-sound; it uses 3 sub-audible LFO oscillators (marginally less "pure noise" for a zero-pitch-thesis piece); and the 3-program FBO pipeline is the highest perf/build risk on low-end phones.
- **Resurrect as:** the **cycle-2 visual deepening** — port 429's discrete foley *voices* onto 428's WebGL2 painterly accumulation canvas → a noise-paint that both *crunches satisfyingly* AND *looks gorgeous*. Best kids renderer move while Canvas2D is over-represented. Refs: Köhler bouba/kiki 1929 · Farnell *Designing Sound* 2010 · Kandinsky synesthesia. Touch IN · raw-WebGL2 OUT · subtractive-noise TECH · kids non-tuned VIBE.

### `427-kids-texture-paint-grains` — granular-noise foley brush, Canvas2D *(banked sibling — the granular-texture take)*
- **Concept:** same toy; sound = **granular synthesis of NOISE** via a Web-Audio look-ahead grain scheduler. While the finger moves, a stream of tiny windowed filtered-noise grains plays; drag speed + texture control grain **density / size / brightness / spread**: Sand = dense tiny dry grains · Silk = sparse long soft low-passed grains · Sparkle = very short bright high grains · Rumble = larger low-passed grains · Fizz = rapid medium grains. 0 oscillators (genuinely pitch-less). Canvas2D strokes.
- **Why it didn't win:** solid but not the standout on any axis — granular-continuous like 428 but less visually rich; Canvas2D like 429 but less legible than discrete events.
- **Resurrect as:** the granular-texture variant, or fold its grain engine into 428's WebGL2 canvas as a "soft/continuous" mode alongside 429's discrete "dab" voices. Refs: Curtis Roads *Microsound* 2001 (granular) · Farnell 2010 · Köhler 1929. Touch IN · Canvas2D OUT · granular-noise TECH · kids non-tuned VIBE.

## Banked from Cycle 359 (WIDE adult fire — *three ways to leave the consonant monastery*, three emotional registers, one per clean lane. Winner shipped = `426-euclid-engine` (adult Euclidean polyrhythm + Reich phasing on **three.js** — the freshest renderer lane, 0× recent — pure percussion / zero tuning, jury #1 for adults). Both siblings are complete, **build-reviewed** (substantial real implementations, ~900–1100 lines each; folder-isolated, ESLint-discipline followed) demoable builds — folders removed per the no-half-built-folders rule, banked here as ready-to-resurrect TEXT. Shared thesis (jury 2026-06-08 #1+#2): ~13/15 recent pieces resolve to calm consonance; these three each refuse it differently. **Also corrected this fire (RESEARCH §359): real-world-data sonification is NOT a lab-first and is saturated** — `314-solar-wind` already fetches live NOAA SWPC, so the banked `421-solar-drone` would DUPLICATE it; and `9-reaction-diffusion` already exists. Don't revive those as "firsts.")

### `424-welcome-erosion` — Karel's REAL Welcome Home piano, long-form 5-min generative EROSION (a piece about forgetting) *(banked sibling — the intimate register + the vehicle for Karel's actual music)*
- **Question:** "What if a warm intimate piano phrase were played once, then over five minutes slowly eroded through self-feedback + granular decay until it can never return home?"
- **Tags** (clean dodge of all bans): INPUT = **audio-file** (Karel's tracks via the existing `/api/audio/{id}` door + a synth-phrase fallback; NO mic/camera) · OUTPUT = Canvas2D (memory-strip + grain motes + fraying waveform) · TECHNIQUE = **long-form stateful granular/spectral erosion** (monotonic, one-way) · VIBE = intimate/decaying/unresolved.
- **The mechanic:** a pure `computeErosion(elapsed)` drives a monotonic trajectory over ~5 min — grain density 12→1.5/s, grain dur 80→850 ms, pitch spread 0.05→~7 st, position jitter 1%→90%, amplitude 100%→20%, reverb send 28%→95%, LPF 7 kHz→380 Hz — so phrases thin, smear, detune and fragment into a resonant wash that never cadences back. Web-Audio look-ahead grain scheduler (25 ms tick / 120 ms ahead), `DynamicsCompressor` brick-wall limiter, 5-phase HUD label (intact→fraying→dissolving→eroding→forgotten) + a falling "memory remaining" bar. Auto-erodes the synth phrase ~2 s after Begin (hands-free). Built files: `page.tsx` (~1105), `README.md`. **Refs:** William Basinski *Disintegration Loops* · Alvin Lucier *I Am Sitting in a Room* · Roads *Microsound*.
- **Why it didn't win:** the strongest fit for Karel's STANDING #1 directive (use his real music) and the most poignant, but (a) it defaults to a **synth** phrase at 06:30 unless Karel pastes a recording ID, so it doesn't actually *showcase* his music hands-free; (b) Canvas2D is 2× in the last-10 (allowed but not the freshest lane the way 426's three.js is); (c) the erosion is granular-adjacent to 422's shatter (distinct — 5-min stateful vs 10-s freeze — but the same neighbourhood). **Revive:** the ship that finally puts a real Welcome-Home track on screen (hand it a known recording ID), or fold its erosion engine onto 422's material. Reconstructable from this spec. **Ambition 2/5** (#2 ≥3-subsystems · #3 named).

### `425-test-signal` — clinical Ikeda / Alva-Noto GLITCH-WALL, WebGL2 test-card *(banked sibling — the purest *refuse-to-resolve* / "go weird" swing; jury #2)*
- **Question:** "What does a piece that was NEVER consonant sound like — a self-mutating wall of sine-grids, impulse clicks and band-noise in Ikeda's cold register?"
- **Tags:** INPUT = **generative** (no device; optional density/intensity sliders) · OUTPUT = **raw WebGL2** scanline/datamosh test-card · TECHNIQUE = **glitch-DSP** (clocked impulse trains + inharmonic sine pings + filtered-noise bursts + a mutation engine that re-rolls the grid) · VIBE = clinical/abrasive/monochrome/unresolved.
- **The mechanic:** a look-ahead scheduler (25 ms / 100 ms ahead) across 4 layers — HF sine pings at 8 mutually-inharmonic freqs (6317–13711 Hz), 1–7 ms impulse clicks, 5 sub pulses at irrational ratios (37.13–91.53 Hz, no implied root), and an LFO-swept band-noise — with a mutation event every 5–12 s re-randomizing densities/BPF within clinical bounds so it permanently drifts and never locks. `DynamicsCompressor` brick-wall (−8 dB, 20:1). Auto-starts ~2 s after load (with a "TAP TO START" overlay if the AudioContext is gesture-gated); WebGL2 fails → DOM fallback meter. Built files: `page.tsx` (~908), `README.md`. **Refs:** Ryoji Ikeda *test pattern* / *datamatics* · Carsten Nicolai / Alva Noto. **This finally realizes the §356 banked "test-pattern" Ikeda counter-piece idea.**
- **Why it didn't win:** the purest answer to the jury's #2 (abrasive / never-consonant — the boldest "go weird"), but (a) a wall of 6–14 kHz pings + sharp clicks is a real **06:30-on-phone-speakers fatigue risk** (could read as "annoying" not "compelling" at the review moment); (b) WebGL2 was just used by 423 (1×), where 426's three.js is the cleaner renderer dodge; (c) builder-flagged node-churn at max density on low-end mobile. **Revive:** ship on a fire where a harsh-HF clinical piece fits the review context, or as the desktop/headphone Ikeda reference; pair the mutation engine with a non-mic input. Reconstructable from this spec. **Ambition 2/5** (#2 ≥3-subsystems · #3 named).

---

## Banked from Cycle 357 (WIDE adult fire — three *refuse-to-resolve* explorers, one per clean output lane after the diversity audit banned BOTH Canvas2D (5×) and SVG (4×) on top of the jury's mic/Kuramoto/just-intonation bans, leaving only WebGPU / DOM-CSS / audio-only. Winner shipped = `422-shatter-piano` (DOM/CSS granular spectral-freeze that takes a consonant phrase and denies its resolution). Both siblings are complete, **build-verified** (tsc + ESLint clean, project-wide tsc 0 errors) demoable builds — folders removed per the no-half-built-folders rule, banked here as ready-to-resurrect TEXT. Shared thesis (jury 2026-06-08 #2): ~13 of 15 recent pieces resolve to calm consonance and there is no Ikeda/Akten counter-piece — all three of these *refuse to resolve*. Also logged this fire: **WebGPU compute is NOT a lab-first** — it already shipped in `16-particle-life-gpu`/`55-webgpu-audio-fx`/`130-tsl-particle-compute`❤️; the jury/STATE "biggest unclaimed first" framing was wrong (see RESEARCH §357).)

### `420-slime-static` — WebGPU compute physarum slime-mold, sonified as an abrasive non-resolving ROAR *(banked sibling — the biggest GPU swing)*
- **Question:** "What if a living slime-mold network simulated entirely on the GPU were not calm and beautiful but a roaring, ever-shifting wall of sound that refuses to resolve?"
- **Tags** (clean dodge of all bans): INPUT = generative (no mic/camera) · OUTPUT = **WebGPU** (3 `@compute` WGSL pipelines + render pass; CPU/Canvas2D fallback) · TECHNIQUE = physarum agent sim (sense→rotate→move→deposit→diffuse/decay) · VIBE = abrasive/industrial/non-resolving (Ikeda/Akten energy).
- **The mechanic:** 262,144 agents in a storage buffer; per-frame agent-step (`atomicAdd` pheromone deposit) → diffuse+decay ping-pong on a 1024² trail → a non-blocking async readback (~12 Hz, staging buffer, never stalls the GPU) extracts density / agitation (variance) / center-of-mass-pan. Those drive 5 sawtooth oscillators at **prime-ratio inharmonic frequencies** (83.2/137.7/211.3/307.1/431.9 Hz), each ring-modulated by an irrational-ratio LFO, + a Q-swept bandpass noise bed + a stochastic 3–8-bit bitcrush waveshaper + irregular burst gating → DynamicsCompressor brick-wall limiter. Nothing ever tunes to a scale or settles. Built files: `page.tsx` (~1178 lines, all self-contained), `README.md`.
- **Why it didn't win:** the flashiest technical swing, but (a) **WebGPU compute is no longer a lab-first** (corrected this fire), so the headline ambition deflated; (b) its GPU path most likely shows the smaller CPU/Canvas2D fallback on Karel's 06:30 review device; (c) physarum is an **emergence-sim** — the jury flagged the emergence-sim *reflex* (#6). **Revive:** the lab's reference abrasive-GPU piece, or a desktop-WebGPU-confirmed fire; reuse its physarum compute as a sonification substrate for other inputs. Reconstructable from this spec.

### `421-solar-drone` — live NOAA solar-wind sonification, audio-only / off-screen *(banked sibling — the real-world-data + off-screen take; the natural data-lane cycle-2 to 418-seismic-pulse)*
- **Question:** "What does the live solar wind hitting Earth's magnetosphere sound like — as an eyes-closed drone that, because the data never stops or repeats, can never resolve?"
- **Tags:** INPUT = **external data API** (NOAA SWPC, public/keyless/CORS) · OUTPUT = **audio-only / minimal-DOM** (near-black + breathing dot + big numeric readouts; the off-screen lane) · TECHNIQUE = real-world-data audification (raw → synth params, no scale) · VIBE = cosmic/vast/unresolved.
- **The mechanic:** fetches plasma-1-day (speed/density/temp) + mag-1-day (Bz/Bt) + planetary-K-index JSON (5s AbortController, falls back to a deterministic 144-row G1–G2-storm offline sample with an amber notice). Walks the 24h series in ~75s, looping but live-different each session. **Speed→raw-Hz fundamental** (no scale), density→partial richness + noise, temperature→filter brightness, **Bz(±)→detuning/beat-width that swings with magnetic polarity**, Kp→agitation + crackle-burst rate. Partials at 1×/2.0×/3.07×/4.13× (irrational) so no two ever land on a shared harmonic node; 1/23 Hz irrational stereo LFO; DynamicsCompressor limiter. Built files: `page.tsx` (~436), `synth.ts` (~357), `data.ts` (~111), `sample.ts` (~154), `README.md`. **Refs:** NOAA SWPC DSCOVR/ACE → IMAP I-ALiRT 2026 transition (RESEARCH §357, current this month) · NASA space-weather sonification heritage (R. Alexander/Goddard) · Ikeda *data-cosm*.
- **Why it didn't win:** the strongest **jury-data-lane** fit (extends the loved 418 real-data lane + off-screen + refuses to resolve), but (a) a near-black audio-only screen is the riskiest 06:30 read (the breathing dot + readouts hedge it, but `422`'s legible phrase→denied arc reads instantly), and (b) real-world-data is no longer a lab-first (418 claimed it). **Revive:** the obvious **cycle-2 of the real-world-data lane** (pair with 418-seismic — earth tremor + sky weather), or fold a minimal aurora-curtain visual onto it. Reconstructable from this spec.

---

## Banked from Cycle 356 (DEEP kids fire — ONE concept: *your body, seen through the camera, generates a BEAT, not a chord* — the answer to JURY 2026-06-08 #1 (rhythm/timbre/noise, NOT tuning) **and** #6 (camera embodiment / MediaPipe). Winner shipped = `419-kids-body-band` (MediaPipe-Pose zone-triggered drum kit). Both siblings are complete, build-reviewed, demoable builds — folders moved to /tmp and removed per the no-half-built-folders rule, banked here as ready-to-resurrect TEXT. Shared thesis (research §356): every body-tracking piece the lab ever shipped maps poses to **harmony** (`287-mirror-choir`, `302-mirror-canon-round`, `234-kids-hand-creature`❤️); none made the body generate a **beat**. Named refs across the fire: "Dance Motion-Guided Music Generation via RVQ," *Electronics* 15(10):2098, May 2026 · BlazePose (Bazarevsky et al. 2020) · Lee et al. "Dancing to Music" (NeurIPS 2019) · TouchDesigner Optical-Flow-TOP lineage (for the 420 sibling). These are the natural **cycle-2 of a new body→percussion thread**.)

### `420-kids-motion-storm` — webcam frame-differencing motion-energy groove, NO machine-learning model *(banked sibling — the dependency-free / renderer-diversity take)*
- **Question:** "What if a 4-year-old's whole-body movement generated a live percussion groove with **no ML model at all** — just raw motion energy from the webcam?"
- **Tags** (clean dodge of all jury bans): INPUT = **camera (motion-energy, no skeleton)** · OUTPUT = Canvas2D heat-trails · TECHNIQUE = **frame-differencing / optical-flow-lite** (TouchDesigner Optical-Flow-TOP lineage; cf. lab's `221`/`388`) · VIBE = kids energetic/percussive (no tuning).
- **The mechanic:** downscale the mirrored webcam to ~120×90, frame-difference against the previous grayscale frame → per-cell motion magnitude over an 8×6 grid → per-region energy + total. Region motion bursts QUANTIZE onto a ~100 BPM 16th grid (kick/snare/hat/tom/shaker), total energy drives groove fullness; a soft always-on pulse keeps a beat when still. Glowing heat-trail sparkles paint the child's movement; region pads light on fire. Built files: `page.tsx` (~485 lines), `flow.ts` (frame-diff field + demo blob), `drums.ts` (limiter'd percussion), `groove.ts` (quantizing scheduler), `README.md`. **Self-reported `tsc` exit 0 + folder ESLint clean.** Auto-demo = a synthetic motion blob sweeping the regions; finger taps inject motion as a third input path.
- **Why it didn't win:** the strongest **renderer/dependency-diversity** statement (zero external runtime deps — builds even if the MediaPipe CDN is down) and the most robust 06:30 surface, but its motion read is coarser/less *legible* than the winner's discrete "left hand = tom" drum-kit mapping, which a 4-year-old grasps instantly. **Revive:** the offline/low-end-device sibling, or as the guaranteed-build fallback if a future MediaPipe fire has CDN trouble. Reconstructable from this spec.

### `421-kids-beat-puppet` — MediaPipe-Pose continuous POLYRHYTHM (each limb drives a layer's density) *(banked sibling — the generative/textural take)*
- **Question:** "What if each of a child's limbs conducted its OWN continuous layer of a polyrhythmic groove — so the body becomes a beat-puppet you sculpt by *which parts you move*?"
- **Tags:** INPUT = **camera / MediaPipe Pose** · OUTPUT = Canvas2D (four limb-auras + sweeping 16-step ring) · TECHNIQUE = **per-limb motion-energy → probabilistic step-sequencer density** (continuous, not discrete hits) · VIBE = kids evolving polyrhythm (no tuning).
- **The mechanic:** four percussion layers on a shared ~96 BPM 16-step grid — 👋 left arm→shaker, 💪 right arm→conga, 🦵 left leg→kick, 🦶 right leg→hat. Each limb's smoothed wrist/ankle speed sets that layer's per-step trigger *probability* + loudness, so moving a limb fast fills its layer in and holding it still thins it to silence; the probabilistic gating keeps the groove **evolving rather than looping** (the "different at minute 3 than minute 0" quality). Built files: `page.tsx` (~593 lines), `drums.ts`, `layers.ts` (`GrooveSequencer` + per-limb energy + demo energies), `README.md`. **Self-reported build clean, ESLint exit 0.** Auto-demo = sine-driven limb energies sweeping the four layers; finger-quadrant fallback.
- **Why it didn't win:** the most **generative/textural** of the three and the best "conduct a living groove" feel, but the continuous density mapping is less *immediately legible* to a 4-year-old than the winner's one-gesture-one-drum kit (a toddler may not connect "move arm faster → busier shaker" as readily as "hand up → DRUM!"). **Revive:** the cycle-2 deepening of the body→percussion thread once kids can feel the discrete kit (419) — graduate them from hits to layers; or an *adult* version (conduct a polyrhythm ensemble). Reconstructable from this spec.

## Banked from Cycle 354 (DEEP kids fire — ONE concept, *music that locks to your movement and gently LEADS your tempo* (bidirectional sensorimotor entrainment), attacked via 3 engines/directions; winner was `417-kids-cradle-song` (audio-only Kuramoto lullaby). Both siblings are complete, build-reviewed, demoable builds — folders moved to /tmp and removed per the no-half-built-folders rule, banked here as ready-to-resurrect TEXT. All three share the core thesis: the lab's existing movement piece `402-kids-steady-walk` only *analyzes* your beat one-way; these make the music a coupled oscillator that follows AND leads. Named refs across the fire: Kuramoto 1975 · D-Jogger (Moens, Leman et al. ~2014) · interactive-RAS (Hove et al. 2012) · ADAM phase+period model (van der Steen & Keller 2013) · Large & Jones 1999 adaptive oscillator · Repp 2005. These are the natural **cycle-2 of the entrainment thread** (the DOM/CSS *visible* leads, vs. the winner's audio-only lead).)

### `415-kids-rock-the-moon` — DOM/CSS breathing-moon wind-down (Large & Jones adaptive oscillator) *(banked sibling — strong cycle-2 candidate)*
- **Question:** "What if rocking the tablet like a cradle let a breathing moon gently rock YOU to sleep — locking to your rhythm, then leading it down?"
- **Tags** (clean dodge of all jury bans + the SVG-4×/Canvas2D over-rep): INPUT = device-motion (rocking) · OUTPUT = **DOM/CSS** (moon + stars, NO canvas/SVG/WebGL) · TECHNIQUE = bidirectional **adaptive-oscillator** entrainment · VIBE = JI-major wind-down lullaby.
- **The mechanic:** same bidirectional idea as the winner, but the engine is a **Large & Jones (1999) nonlinear adaptive oscillator** — phase-coupling (κ·sin) + ADAM-style period correction on each detected rock peak, plus a slowly drifting *preferred period* that pulls the locked tempo down over ~90 s. The payoff is **visible**: a big breathing **moon** (DOM div, radial-gradient, box-shadow glow) sways with the rocks, slowly closes its eyes / yawns / dims, stars fade, and a green glow ring shows phase-lock quality. Built files: `page.tsx` (~28 kB), `entrain.ts` (~240 lines, full JSDoc refs), `README.md`. **Tuning caveat to fix on revival:** the constants ship INIT 1.5 s (40 cpm) → FINAL 1.28 s (47 cpm), i.e. the period currently *shortens* (speeds up) — invert/retune so a cradle starting ~70–80 cpm leads *down* toward ~45, matching the wind-down narrative.
- **Why it didn't win:** the strongest *legible visual* of the wind-down (you watch the moon doze), but it keeps a screen front-and-centre, and the JURY's loudest unmet ask (#5) was the **off-screen** gap — so the audio-only `417` (near-black, ears-only) was the truer answer this fire. **Revive:** the cycle-2 "you can watch it this time" companion to 417, or a DOM/CSS toggle-skin on the same engine. Reconstructable from this spec.

### `416-kids-wake-the-band` — DOM/CSS parade wake-up with a legible "Together!" meter (ADAM phase+period correction) *(banked sibling — the legible/instructional take)*
- **Question:** "What if keeping a steady bounce woke a sleepy marching band — and the band pulled YOU into step, then sped you up into a parade?"
- **Tags:** INPUT = device-motion (bounce/pat onsets) · OUTPUT = **DOM/CSS** parade (NO canvas/SVG/WebGL) · TECHNIQUE = bidirectional **linear phase+period (ADAM)** correction · VIBE = bright Lydian wake-up (legible togetherness meter).
- **The mechanic:** the *opposite direction* of the winner — leads tempo **up**. Detect bounce/pat impulse onsets from accel-magnitude peaks; an **ADAM / Mates two-term linear corrector** (α-phase + β-period, in ms space, van der Steen & Keller 2013) locks a sleepy band (~66 bpm) to the child, then a **moving target period** climbs toward a ~120-bpm parade as togetherness sustains, blended via a LEADER_WEIGHT so the band genuinely *pulls* the child up. The centrepiece is a big **legible "Together!" phase-lock meter** (red→yellow→green DOM bar, labelled "Wake the band! → Keep going! → Together! 🎉") + a 7-member bouncing DOM parade + a look-ahead Web-Audio scheduler. Built files: `page.tsx` (~27 kB), `entrain.ts` (~230 lines), `README.md`. Lydian/whole-tone (not D-Dorian).
- **Why it didn't win:** best on the JURY's #1 *legible/instructional* lane (you SEE the coupling lock), but it's energetic + screen-forward, and #5 (off-screen) was the louder unmet need this fire. **Revive:** the wake-up / morning sibling, or fold its "Together!" meter into a *visible* mode of the winner so the lab-first entrainment is legible on demand. Reconstructable from this spec.

## Banked from Cycle 353 (DEEP adult fire — ONE concept, *a living chord that LISTENS to your piano* — cycle 3 of the a-life/JI thread, adding a "listen" subsystem so emergent just intonation assembles itself around REAL heard audio; attacked via 3 renderers; winner was `414-conchordal-listen` (inline SVG blooming garden). Both siblings are complete, build-reviewed, demoable builds — folders moved to /tmp and removed per the no-half-built-folders rule, banked here as ready-to-resurrect TEXT. **Shared engine** (identical across all three, ~650 lines): Plomp–Levelt roughness `a₁a₂(e^{-3.5sx}−e^{-5.75sx})` over partial-pairs vs heard spectrum + other organisms; Metropolis pitch foraging at continuous microtonal pitch (no scale, no D-Dorian) toward roughness-min + harmonicity bonus to the strongest heard partial; consonant organisms thrive / dissonant die + re-seed near heard partials; Kuramoto phase coupling (K≈1.5) so a chord breathes together; **listen** = `extractFftPeaks` top-4 spectral peaks + `detectFundamental` MPM/autocorrelation f₀ → attractor wells; additive synth → reverb → DynamicsCompressor brick-wall limiter. Three input doors: ~2s self-play JI piano phrase (default, hands-free) · live mic ("Play piano") · paste a Welcome-Home recording ID → `/api/audio/{id}` (the `163-paths-visualizer` pattern, try/catch, demo fallback). Named refs: Conchordal arXiv:2603.25637 · Plomp–Levelt 1965 · McLeod MPM 2005 · consonance-sync PMC11534602 (2024) · musicalboard.com 2026-05-05 (browser MPM/YIN). Ambition 4/5 each (#2 ≥5 subsystems + #3 named + #4 multi-cycle + #5 borderline-recent).)

### `415-conchordal-orbit` — the geometry of harmony, on a log-spiral pitch space *(banked sibling — strong cycle-4 candidate)*
- **Question:** "What if you could SEE the geometry of the pure-intonation harmony a living chord grows around your piano — pure intervals as recurring constellations?"
- **Tags** (clean dodge of all jury bans + the Canvas2D over-rep): INPUT = audio/mic-listen · OUTPUT = **inline-SVG log-spiral** (NOT WebGL2/three.js, NOT Canvas2D) · TECHNIQUE = input-conditioned a-life consonance-foraging + Shepard log-spiral pitch mapping · VIBE = emergent no-fixed-scale microtonal, geometric/Ikeda-adjacent.
- **The mechanic:** the SAME listening engine, but pitch → an **Archimedean/log spiral where one full turn = one octave** (pitch-class = angle, octave = radius), so octave/fifth/just-third land at fixed angular offsets and recur on every turn. When two organisms settle into a pure interval (3:2, 5:4, 9:8…) a **color-coded chord-line/arc** is drawn between them, and the heard pitches are brighter anchor markers — emergent pure intervals appear as **recurring geometric constellations that snap into place**. Interval labels (P5/M3/m3…) on strong arcs. Built files: `page.tsx` (~890 lines), `engine.ts` (~576), `README.md`. Extra ref: Shepard 1982 "Geometrical approximations to the structure of musical pitch."
- **Why it didn't win:** the most *surprising* viz (the structure of emergent JI made visible) and a genuinely different lens, but (a) the spiral needs a beat of decoding at a 06:30 phone glance where 414's blooming garden reads as "harmony around your playing" instantly, and (b) the spiral/constellation idea is adjacent to the already-banked `411-conchordal-spiral` lineage from §351. **Revive:** the designated "geometry of harmony" cycle-4 piece, or fold the spiral as a toggle-lens *inside* 414 ("garden view ⇄ orbit view"). Reconstructable from this spec.

### `416-conchordal-aura` — the same living chord in PURE DOM/CSS light *(banked sibling — the lab's flagship CSS-only renderer experiment)*
- **Question:** "What if a living chord that listens to your piano were rendered as a breathing cloud of CSS light — consonant voices drifting together and glowing brighter, without a single canvas or SVG?"
- **Tags** (maximal renderer-diversity dodge): INPUT = audio/mic-listen · OUTPUT = **pure DOM + CSS** (absolutely-positioned div glow-blobs, `filter: blur()`, `box-shadow`, `radial-gradient`, `@keyframes` breathing modulated per-node by Kuramoto phase via inline `animation-duration`/`-delay`; CSS `transition` on left/top for JS-free pitch-glide) — no canvas, no SVG, no WebGL · TECHNIQUE = input-conditioned a-life consonance-foraging · VIBE = emergent microtonal, ambient/organic.
- **The mechanic:** the SAME engine (18–30 organisms, kept modest because DOM nodes are heavier than canvas; nodes reused, not recreated per frame). Heard pitches = pulsing violet aura halos the blobs drift toward; consonance = blobs cluster + brighten; a CSS-width mean-consonance bar. Built files: `page.tsx` (~641 lines), `engine.ts` (~333), `audio.ts` (~409), `README.md`.
- **Why it didn't win:** the strongest renderer-diversity statement (pure CSS is *rare* in the lab) and the calmest, but (a) its buttons missed the `min-h-[44px]` tap-target rule (needs a typography pass on revive), (b) its `audio.ts` shipped with the repo's strict-TS `Float32Array<ArrayBufferLike>` analyser-cast error (the gotcha 414/352 handled — a 1-line `as` cast fixes it; it was the reason the all-three build failed), and (c) DOM-node perf at 30 blobs on a low-end tablet is the riskiest unverified surface. **Revive:** the lab's flagship CSS-only piece — fix the analyser cast + button sizing first. Reconstructable from this spec.

---

## Banked from Cycle 352 (DEEP kids fire — ONE concept, *a creature that PHYSICALLY COPIES your mouth/tongue from a sung vowel and sings it back* (AURORA formant-to-tongue inversion, done literally, with real LPC/cepstral formant tracking — the exact upgrade `393-kids-vowel-color` admitted it lacked for children's voices), attacked via 3 renderers; winner was `413-kids-mouth-mirror` (SVG side-view x-ray tongue + vowel quadrilateral, whole-tone). Both siblings are complete, build-reviewed, demoable builds — folders removed per the no-half-built-folders rule, banked here as ready-to-resurrect TEXT.)

The shared concept is the lab's first **articulatory-inversion** toy and its first use of **real LPC / cepstral formant tracking** (grep-verified lab-first: prior vowel piece 393 used crude FFT peak-picking and its own README concedes that is unreliable precisely for the 4-year-olds this lab targets, because a child's wide harmonic spacing makes the "formant" peak land on whichever harmonic falls in-band — LPC/cepstrum model the vocal-tract envelope independent of pitch). All three: mic-voice INPUT (breaks the touch reflex), no WebGL2/three.js, foreign-tonal sing-back (not D-Dorian), continuous formant→geometry morph (not snapping between 5 poses), Peterson–Barney label only for the letter + sing-back note, dual-bandpass formant-shaped voice through a brick-wall limiter, hands-free attract demo for no-mic reviewers. Inspired by **AURORA formant-to-tongue inversion (arXiv:2603.17543, Mar 2026)** + **Peterson & Barney (1952)**. Crosses **JURY #6** (a kids *listening/analysis* toy — breaks the kids emergence-sim reflex) and feeds the standing legible/instructional lane. Ambition cleared via #1 (LPC/cepstral formant tracking — lab-first) + #2 (≥3 subsystems: formant tracker + articulatory-inversion renderer + formant-shaped sing-back) + #3 (named refs).

### `411-kids-copycat-mouth` — front-facing clay creature that copies your mouth, JI sing-back `[banked cycle 352 — the warmest / most kid-delightful realization; the cleanest modular code]`
**One question:** what if a creature COPIED your mouth like a game of copycat? **Renderer = SVG** front-facing clay creature (eyes, cheeks, a morphing inner-mouth path + tongue blob). **Technique = real LPC** (`lpc.ts`, 331 lines: pre-emphasis 0.97 → Hamming → autocorrelation → **Levinson–Durbin order 14** → all-pole spectral-envelope peak-pick of F1/F2 with parabolic interp → Peterson–Barney classify, α=0.15 smoothing). **Mapping:** jaw-open ∝ F1, lip spread-vs-round ∝ F2, tongue blob from (tongueFront=spread, tongueHigh=1−open), all rebuilt every frame from raw smoothed (F1,F2). **Tonal world = just intonation** pentad on A3 (`synth.ts`: dual-bandpass vowel sing-back, master gain → DynamicsCompressor limiter, ambient pad). **Why it's strong:** the most immediately legible "it's copying ME" for the youngest users (a face copying your face is lower cognitive load than an x-ray), and the best-factored build (separate lpc.ts/synth.ts/page.tsx). **Why it didn't win:** the side-view x-ray (413) is the more *surprising* and more literal AURORA tongue-inversion — you actually see inside the mouth — and better feeds the jury's "show what it heard" ask; 411 is the safer, warmer sibling. **Resurrect as:** the kid-friendliest ship of this thread, or a "front view" toggle inside 413 (same LPC engine, second camera angle). Files were `src/app/dream/411-kids-copycat-mouth/{page.tsx (594), lpc.ts (331), synth.ts (169), README.md}` — rebuild from this seed. Build-safe (client Web Audio + SVG, no API route, no new deps). **Ambition 3/5** (#1 LPC lab-first · #2 ≥3 subsystems · #3 AURORA/Peterson–Barney/Fant).

### `412-kids-vowel-puppet` — Canvas2D gooey clay puppet, CEPSTRAL formants, gamelan slendro `[banked cycle 352 — the distinct-technique sibling (cepstrum, not LPC); revive when Canvas2D isn't over-represented]`
**One question:** what if your voice were a squash-and-stretch clay puppet? **Renderer = Canvas2D** (bezier-blob head + mouth, squash-stretch deformation, idle wobble/breath, moonlit indigo/cream-teal, DPR/resize-aware). **Technique = real CEPSTRAL formant extraction** (the genuinely different DSP path): Hann window → radix-2 FFT → log-magnitude → IFFT to **real cepstrum** → **lifter** (zero quefrency ≥32) → FFT back → smooth envelope → parabolic peak-pick F1 (170–950 Hz) / F2 (900–2900 Hz), RMS voicing gate. **Mapping:** F1→mouth openness, F2→width↔round pucker, continuous from smoothed formants. **Tonal world = gamelan slendro** (240 Hz base, ~240-cent steps, two formant-tuned bandpasses + detuned inharmonic partials for a metallic shimmer, → limiter). **Why it's strong:** the only sibling on a *different formant algorithm* (cepstral liftering vs LPC all-pole) — the natural A/B if LPC ever underperforms on real kid voices; the gooiest, most tactile puppet. **Why it didn't win:** **Canvas2D OUTPUT is the next over-represented renderer (STATE flagged it, ≥4× recent)** so the SVG siblings were the diversity-compliant ships; and a front-facing puppet is less surprising than the x-ray tongue. **Resurrect as:** the cepstral A/B ship on a fire where Canvas2D is clean, or fold the cepstral tracker into 413 as an alternate detector toggle. Files were `src/app/dream/412-kids-vowel-puppet/{page.tsx (656), README.md}` — rebuild from this seed. Build-safe (client Web Audio + Canvas2D, no API route, no new deps). **Ambition 3/5** (#1 cepstral formant tracking lab-first · #2 ≥3 subsystems · #3 AURORA/Peterson–Barney/Bogert–Noll cepstrum/slendro).

---

## Banked from Cycle 351 (DEEP adult fire — ONE emergent-harmony concept, *a chord that is ALIVE, foraging a psychoacoustic consonance landscape*, attacked via 3 different renderers; winner was `410-conchordal-garden` (inline SVG blooming garden). Both siblings are complete, build-reviewed, demoable builds — folders moved to /tmp and removed per the no-half-built-folders rule, banked here as ready-to-resurrect TEXT.)

The shared concept is the lab's first **artificial-life audio** piece, and **cycle 2 of the JI/roughness thread** that 404 (adaptive JI) → 405 (banked Plomp–Levelt roughness meter) opened — it promotes roughness from a *readout* to the *physics that drives a population*. Inspired by **"Conchordal: Emergent Harmony via Direct Cognitive Coupling in a Psychoacoustic Landscape," arXiv:2603.25637 (2026-03-26)**. All three share the same engine: ~24–40 sound-organisms in continuous log-frequency space (no scale), a **Plomp–Levelt roughness** fitness landscape + harmonicity bonus for small-integer ratios, **Metropolis pitch foraging** with crowding penalty, **consonance-dependent metabolism** (bloom/grow vs wilt/die + reproduce + re-seed), and **Kuramoto phase coupling** so consonant clusters pulse together; additive Web-Audio synth with glide → reverb → limiter. Stacks the jury's *expensive* criteria (#4 multi-cycle + #5 current-quarter research) and crosses **jury #6** (an *adult emergence-sim sonified* — breaking the adult-analysis reflex), in an emergent **no-fixed-scale** tonal world (the antidote to D-Dorian). The two siblings are the same engine under different renderers/metaphors — both build-reviewed clean, both Canvas2D (which the diversity audit *banned this cycle* for over-representation, so neither could ship over the SVG winner).

### `409-conchordal-field` — the psychoacoustic LANDSCAPE as a Canvas2D heatmap `[banked cycle 351 — the most FAITHFUL realization of the paper's central image; revive when Canvas2D isn't over-represented]`
**One question:** what does the *fitness landscape* the organisms forage actually look like? **Renderer = Canvas2D.** The vertical axis is log pitch (110–880 Hz); the background is a **live dissonance heat field** — at every pixel row the engine probes the total Plomp–Levelt roughness a voice *would* feel at that pitch given the current chord, painting dark "rough" bands and cool-violet "consonant **valleys**." Glowing agent **motes** (colored violet=consonant → amber=dissonant by score, sized by health) visibly **settle into the valleys**; pulsing violet **threads** connect strongly-consonant pairs (pulse = shared Kuramoto phase); left-edge **tick marks** flag local dissonance minima (the emergent "scale" the population discovered). Side panel: elapsed / population / a **mean-consonance bar that climbs** as the ecosystem self-organizes. **Why it's strong:** the most *legible* and *faithful* of the three — it literally renders the paper's "psychoacoustic landscape," so the "chaos → motes fall into glowing consonance valleys → bar climbs" arc is unmistakable at a phone glance; the most robust engine. **Why it didn't win:** **Canvas2D OUTPUT was over-represented (≥4× in the last 10 shipped) and thus banned by this cycle's diversity audit** — the SVG sibling 410 was the diversity-compliant ship; on pure merit 409 was the runner-up. **Perf note:** per-frame per-row roughness probing (≈600 rows × agents × 5 partials) is the cost to watch — sample at lower row resolution if it janks. **Resurrect as:** the next ship on a fire where Canvas2D is clean, OR fold its dissonance-heatmap *background* into the SVG garden as an optional "show the landscape" overlay (the best of both). Files were `src/app/dream/409-conchordal-field/{page.tsx, engine.ts, README.md}` — rebuild from this seed. Build-safe (client Web Audio + Canvas2D, no API route, no new deps). **Ambition 4/5** (#1 a-life consonance-foraging · #2 ≥3 subsystems · #4 multi-cycle JI/roughness thread · #5 Conchordal current-quarter).

### `411-conchordal-spiral` — emergent JI as GEOMETRY on a Canvas2D log-spiral `[banked cycle 351 — the most intellectually SURPRISING viz; revive as the "structure of emergent harmony" piece]`
**One question:** if living voices discover consonance with no scale given, what *geometry* does the harmony they find have? **Renderer = Canvas2D log-spiral** — angle = pitch class (one full turn = one octave), radius grows with octave, so octave-equivalents line up along a ray and **pure intervals subtend a constant angular span**. Agents are glowing points on the spiral; chord lines between consonant agents are **color-coded by interval species** (violet = perfect fifth, emerald = major third, amber = perfect fourth, rose = minor third), so as the population locks, emergent pure intervals appear as **recurring geometric constellations** — the same fifth-shape repeating at every octave is the visual "aha." Brightness = consonance × health; the pulse = Kuramoto phase; optional faint reference rays at just-ratio angles. **Why it's strong:** the most *surprising* visualization — it reveals the *structure* of emergent just intonation (the spiral makes octave-equivalence and interval-invariance visible), a genuine "huh, I didn't know harmony looked like that." **Why it didn't win:** the spiral geometry needs a beat of decoding (less instantly legible to a non-musician at a 06:30 glance than 410's blooming garden or 409's valleys), and it's Canvas2D (banned this cycle by the diversity audit). **Resurrect as:** the "geometry of harmony" adult piece, or a toggle-view inside the garden/field (same engine, third lens). Files were `src/app/dream/411-conchordal-spiral/{page.tsx, engine.ts, README.md}` — rebuild from this seed. Build-safe (client Web Audio + Canvas2D, no API route, no new deps). **Ambition 4/5** (#1 a-life consonance-foraging · #2 ≥3 subsystems · #4 multi-cycle JI/roughness thread · #5 Conchordal current-quarter).

---

## Banked from Cycle 350 (DEEP kids fire — ONE long-form-STATEFUL concept, *breathing grows a night-garden that remembers every breath*, attacked via 3 different renderers; winner was `408-kids-breath-grove` (Canvas2D L-system + timelapse). Both siblings are complete, build-reviewed, demoable builds — folders moved to /tmp and removed per the no-half-built-folders rule, banked here as ready-to-resurrect TEXT.)

The shared concept finally lands the long-form-STATEFUL kids thread the lab had banked since cycle 348 (`403-kids-breath-garden`) — it stacks the **expensive #4 (multi-cycle / long-form, state + memory + evolution, NOT a loop)** ambition criterion the jury said is nearly absent, and dodges every JURY 2026-06-07 ban: **breath-RMS INPUT** (not MIDI/touch), a non-GPU renderer (not WebGL2/three.js), **pelog-inharmonic VIBE** (not D-Dorian). All three share: a mic RMS breath-envelope detector with **auto-calibrating noise floor** (so a quiet child crosses the gate; analysis-only, never recorded), a 4-stage arc gated by cumulative breath count, a 5-voice pelog-like inharmonic drone (55/82.41/110/164.81/185 Hz, bent 8–22¢, stage-gated thickening) + per-exhale inharmonic bell through a brick-wall limiter, and a synthetic-breath auto-demo reaching Stage 4 in ~48s hands-free.

### `407-kids-breath-garden` — the canonical inline-SVG night MEADOW `[banked cycle 350 — the most LEGIBLE literal-imagery read; ship as the calm bedtime companion to 408]`
**One question:** what if your slow breathing grew a glowing night-meadow that remembered every breath? **Renderer = inline SVG** with direct DOM-attribute mutation in a rAF loop (layered: stars → moon → fireflies → ground → flowers → grass). 4-stage arc: **(1–4)** grass blades sprout · **(5–9)** flowers open on swaying stems · **(10–14)** fireflies/lanterns drift up · **(15+)** sky→violet, crescent moon brightens, stars appear. Exhale strength/duration vary blade height / flower size / firefly count so no two meadows match. Audio = the shared pelog drone + bell. Breath detector uses a **20th-percentile noise-floor calibration** from the first ~1.5s + 12mV margin. **Why it's strong:** the most instantly legible bedtime imagery for a 4yo (grass→flowers→moon is unmistakable) and the freshest renderer in the recent window (SVG-DOM mutation); it's the most faithful realization of the original `403-kids-breath-garden` spec. **Why it didn't win:** 408's **timelapse replay** makes the "remembers every breath" thesis *visceral and legible* in a way a static-accreting meadow can't, and 408's L-system adds a named-technique layer. **Resurrect as:** the next kids ship (the calm companion), OR fold 408's timelapse-replay idea into the SVG meadow. Files were `src/app/dream/407-kids-breath-garden/{page.tsx, breath.ts, audio.ts, README.md}` — rebuild from this seed. Build-safe (client mic-analysis + Web Audio + SVG, no API route, no new deps). **Ambition 3/5** (#2 ≥3 subsystems · #4 long-form-stateful · #3 named refs: pelog + long-form generative + Eno).

### `409-kids-breath-tidepool` — a pure DOM/CSS bioluminescent REEF `[banked cycle 350 — extreme RENDERER diversity (zero canvas/SVG); revive when the lab wants a CSS-only piece]`
**One question:** what if your slow breathing grew a glowing underwater tide-pool, each breath blooming a bioluminescent creature that pulses forever? **Renderer = DOM + CSS ONLY** — absolutely-positioned divs with `radial-gradient` + `box-shadow` glow, animated by CSS keyframes (`tidepool-sway / drift / pulse / plankton-spark`) + direct style mutation; **no canvas, no SVG, no WebGL**. Four creature kinds (anemone / jellyfish / coral polyp / plankton cluster), placed by ecological role; a persistent React-state list keeps every creature (memory), capped at ~50 for low-end-tablet perf (transform/opacity animations, GPU-composited). 4-stage arc: **(1–4)** anemones on the seabed · **(5–9)** jellyfish drift up, current sway · **(10–14)** plankton swarms shimmer, palette broadens · **(15+)** whole water-column glows, aurora light-rays descend from a violet surface, all 5 drone voices in. Bioluminescent teal/cyan/violet/rose hues. **Why it's strong:** the strongest *renderer* diversity dodge in the lab (pure CSS is rare), and the calmest/most immersive of the three; named refs add bioluminescence biology. **Why it didn't win:** the reef metaphor sits adjacent to the well-loved ocean lineage (107-ocean-presence, 133-ripple-pond, 84-wave-fluid), and the per-breath creature-bloom is a *gentler* accretion than 408's branch-by-branch growth + replay; CSS-animation perf at 50 glowing creatures is the riskiest unverified surface. **Resurrect as:** the lab's flagship CSS-only piece, or a calmer "underwater" variant of the breath-garden thread. Files were `src/app/dream/409-kids-breath-tidepool/{page.tsx, breath.ts, audio.ts, README.md}` — rebuild from this seed. Build-safe (client mic-analysis + Web Audio + DOM/CSS, no API route, no new deps). **Ambition 3/5** (#2 ≥3 subsystems · #4 long-form-stateful · #3 named refs: bioluminescence + pelog + long-form generative).

---

## Banked from Cycle 348 (WIDE kids fire — 3 kids LISTENING/ANALYSIS toys, each on an analysis dimension the lab hadn't centered, all SVG/DOM output (kill the jury's raw-WebGL2 monoculture), none in D-Dorian; winner was `402-kids-steady-walk`, the lab's first pulse-STEADINESS / entrainment toy)

This fire went **WIDE** (the 2026-06-07 JURY handed a heavy ban list — raw-WebGL2/three.js OUTPUT · MIDI/keyboard + touch/tap INPUT · the D-Dorian bed — and "go WIDE with fresh tags" is the prescribed response to a heavy-ban morning). All three explorers: **mic-feature INPUT** (a *different* feature each — timbre / onset-rhythm / breath-envelope; never MIDI/touch), **inline-SVG/DOM OUTPUT** (the direct answer to jury provocation #1, "raw-WebGL2 is the new Canvas2D"), **kids listening/analysis VIBE** (jury #6 — break the kids *emergence-sim* reflex with a listening toy), and a **non-D-Dorian tonal world** (jury #2). Winner `402` shipped (the freshest lane by grep + the most legible 06:30-phone magic-moment + the cleanest single-fire double-rut-break: it takes the *adult analysis-engine reflex* — onset/IOI/tempo tracking, the 358/365/370/375/380 family — and makes it a *kids* toy). Both non-winners are **complete, demoable builds** (full page.tsx + helpers + README); folders `rm -rf`'d per the no-half-built-folders rule, banked here as ready-to-resurrect TEXT. Each adds a lane the lab is thin on.

### `403-kids-breath-garden` — long-form STATEFUL breath garden `[banked cycle 348 — the strongest BANK; an explicit MULTI-CYCLE thread → resurrect as the next kids fire's DEEP target]`
**One question:** what if your slow breathing grew a whole glowing night-garden over a few minutes — and it *remembered* every breath, so it looked completely different at minute three than at the start? **Input** = mic **RMS envelope only** (breath, never pitch): a breath-cycle detector (threshold 0.012, min-dur 0.6 s, debounce 0.8 s) fires one event per exhale, measuring its duration+strength. Each exhale plants/grows an SVG element and accretes persistent state through a **4-stage arc driven by cumulative breath count** — stage 1 grass blades (breaths 1–4) → stage 2 flowers open on swaying stems (5–9) → stage 3 fireflies/lanterns drift up (10–14) → stage 4 sky-hue shifts violet, moon brightens, stars appear (15+). Audio: a **pelog-like inharmonic** drone (5 stage-gated oscillator voices: 55/110/164.5/185/82.41 Hz, partials bent 8–22¢ off 12-TET) that thickens per stage, plus a soft bloom tone per exhale. Direct SVG-DOM mutation at 60 fps via RAF (no canvas/WebGL). Auto-demo (~3.2 s synthetic breaths) reaches stage 4 in ~48 s for a hands-free phone review. **Why it's strong:** it's the only one of the three that stacks the *EXPENSIVE* ambition criterion the jury said is nearly absent — **#4 multi-cycle / long-form-stateful-with-memory** — and it fills the categorical-menu's explicitly-thin **"Long-form generative — state, memory, evolution, not loops"** shelf; calm/bedtime, a deliberate counterweight to the energetic winner. **Why it didn't win:** slower to read at a 06:30 phone glance (the payoff is the minute-3 evolution, not an instant beat), and the breath lane has near-neighbors (186-breath-bloom, 95-breath-bubbles) even though the *stateful long-form* framing is novel. **Resurrect as:** the next kids-DEEP target — cycle 2 adds per-plant species variety, a **timelapse replay** of the whole garden's growth, richer stage transitions, and a lullaby melody emerging from accumulated bloom tones. **Fix-first:** the 0.012 RMS breath threshold needs per-mic calibration (an auto-gain / first-breath calibration step) so a quiet child reliably crosses the gate. Ambition: #2 ≥3 subsystems (RMS breath detector + stateful garden model + SVG render + pelog drone synth) + #4 multi-cycle + foreign-tonal (pelog).

### `401-kids-sound-zoo` — voice-TIMBRE classifier (spectral flatness / Wiener entropy) `[banked cycle 348 — the weakest on novelty (the timbre lane was touched by cycle-344's banked 394-kids-sound-monster), but a clean, legible build]`
**One question:** what if making different *textures* with your voice — a hiss, a hum, a growl, a bright "eee" — woke up different sleeping animals? **No pitch, no scale anywhere** (so it dodges the D-Dorian ban wholesale). Per FFT frame compute **spectral flatness** = geometricMean(power)/arithmeticMean(power) — a.k.a. **Wiener entropy**, the same noisy↔tonal measure used to quantify birdsong (Tchernichovski et al., *Sound Analysis Pro*, Animal Behaviour 2000) — plus **spectral centroid** (dark↔bright) and an RMS gate. Map (flatness × centroid) into a 2-D timbre field with 4 quadrant-animals (noisy+dark = Bear grrr · noisy+bright = Snake sss · tonal+dark = Owl hoo · tonal+bright = Bird eee); the matching animal wakes (SVG scale/eyes/wiggle + confirming tone) while a live "you are here" dot drifts across the labeled field so the *texture→animal* relationship is visible/learnable. Auto-demo synthesizes hiss/hum/growl/eee in turn (noise buffer + oscillators) so it wakes each animal hands-free. **Why it's strong:** a genuinely *educational* listening map (timbre made visible), and timbre-as-the-analyzed-dimension is grep-clean as a classifier. **Why it didn't win:** the timbre→creature lane was already explored at cycle 344 (banked Bouba/Kiki `394-kids-sound-monster`), so it's the least "massively bigger" of the three; and 4 discrete quadrant-buckets may feel finicky at the growl/hum boundary on a real phone mic. **Resurrect as:** a *continuous* timbre-morph piece (one creature whose shape/color morphs continuously across the flatness×centroid plane — Bouba/Kiki) rather than 4 discrete buckets, which would also subsume the 344 seed. **Fix-first:** widen/auto-calibrate the quadrant boundaries; add hysteresis so a held sound doesn't flicker between two animals. Ambition: #1 lab-first (spectral-flatness timbre classification) + #2 ≥3 subsystems + #3 named ref (Tchernichovski).

## Banked from Cycle 343 (DEEP adult fire — Accompanist thread CYCLE 3: ONE concept "an accompanist that survives your mistakes," three robustness techniques; winner was `391-resilient-accompanist`, the dual DTW⇄HMM confidence-supervisor)

This fire went **DEEP** (the JURY explicitly told the lab to *extend* the accompanist thread — its only 4/5 piece — instead of opening a fresh WIDE explorer). One ambitious concept, three genuinely different robustness algorithms. Winner `391` shipped (dual-follower DTW⇄HMM + hysteresis supervisor — most subsystems, research-truest, keeps full cycle-2 expressivity, SVG renderer per the jury's freshest-renderer ask). Both non-winners are **build-reviewed and clean** (`tsc --noEmit` + `eslint --max-warnings 0` pass; the full `npm run build` compiled all three to static routes) — folders `rm -rf`'d, banked here as ready-to-resurrect TEXT. Both add the same thread a real new technique; either is a strong **cycle-4** candidate.

### `393-forgiving-accompanist` — particle-filter (Sequential Monte Carlo) score follower `[banked cycle 343 — the most BEAUTIFUL of the three; strongest cycle-4 candidate]`
Keep ~240 particles, each a hypothesis `{ scorePos (continuous beats), tempo (beats/s), weight }`. **predict** (advance each by `tempo·dt` + Gaussian process noise so the cloud spreads to cover uncertainty) → **update** on each onset (reweight by a semitone-kernel pitch likelihood at that particle's scorePos, with a non-zero floor so a wrong note *reweights* rather than kills the cloud) → **resample** (systematic, when ESS = 1/Σwᵢ² < ½N, with jitter to fight degeneracy) → **estimate** (weighted-mean scorePos/tempo drive the accompaniment, still coupled to dynamics+articulation from cycle 2). Robustness is *emergent*: a wrong note reweights, a skip is covered because some particles are always ahead, a hesitation lets the cloud sit. **Canvas2D** swarm (x=scorePos, y=tempo, opacity=weight) + weighted-mean cursor with ±1σ band + ESS/spread meters that spike on a fumble and shrink on recovery — the scatter-and-reconverge IS the show, and it's genuinely lovely. Twinkle in C major, baked 5-fault demo. Ref: Otsuka/Nakadai, *Real-Time Audio-to-Score Alignment Using Particle Filter for Coplayer Music Robots* (EURASIP 2011). **Why it didn't win:** continuous-state SMC is elegant and the visual is the most surprising, but the dual-follower (391) is the more *legible/instructional* robustness story (two labeled cursors + an explicit "in control: DTW/HMM" handover) the jury named as the lab's lane, and 391 is the queue-named 381 design. **Resurrect as cycle 4** — or fold the swarm-cloud uncertainty viz into 391 as a third "belief" layer.

### `392-anticipating-accompanist` — predictive-tempo + delayed-decision anticipation `[banked cycle 343 — the 382 predictive-tempo seed, realized]`
A Kalman-ish 1-D tempo state `(positionBeats, beatsPerSec)` that **predicts the next onset forward** and **schedules the chord at the predicted time** (via `AudioContext.currentTime`) so the accompaniment plays *with* — even a hair ahead of — the soloist instead of lagging. A **delayed-decision buffer** discounts a single anomalous IOI (gain ≈ 0.05) unless 2–3 onsets confirm a sustained accel/rit (gain ≈ 0.5), so one wrong/late note is a small transient, not a derail. Onset matcher: nearest-expected-note within ±3 semitones; out-of-window pitches flagged as fumbles and excluded from the tempo update. **SVG** beat timeline with a literal **forward prediction cone+marker** ahead of the playhead, accompaniment diamonds landing on the predicted beats, a live BPM readout tracking accel/rit, and rose fumble markers. "Ode to Joy" in F major, baked steady→accel→rit + wrong-note + late-note demo. Ref: Nakamura et al. (delayed-decision/anticipation). **Why it didn't win:** the anticipation framing is lovely and the prediction-cone viz is the most novel, but its robustness is "discount one fumble," weaker than 391/393's full recover-from-a-wrong-note-RUN-and-skip story; the jury's headline ask was robustness. **Resurrect** as cycle 5, OR fold the anticipatory `currentTime` scheduling (play-ahead, not lag) into the winning follower to fix the inherent reactive latency of all three.

## Banked from Cycle 341 (WIDE adult fire — 3 unrelated explorers breaking the adult legible-analysis/ambient monoculture; winner was `387-drop-engine`, the lab's first EDM/club journey engine)

This fire went **WIDE** (an adult WIDE was owed after 3 adult DEEPs — 335/337/339 — and WIDE is the direct attack on the jury's "too similar"): three unrelated adult directions, each clearing the ambition floor via a *different* input × technique × vibe, **none touching a jury-banned tag** (touch / mic-voice INPUT, inline-SVG OUTPUT, adult-JI-drone VIBE). Winner `387-drop-engine` shipped (Karel priority #4: a journey-engine alternative; the lab's first club/EDM arc). The two non-winners are **build-reviewed and banked here as TEXT** (folders `rm -rf`'d, copies retained in `/tmp/dream-losers` for the fire only); both are ready-to-resurrect adult explorers that would each add a lane the lab is thin on.

### `386-aeolian-atlas` — banked (build-reviewed clean; `wind.ts`/`audio.ts`/`atlas.ts`/`page.tsx`, ~1074 lines)
**Real-world data sonification: the live wind blowing across the whole planet as a global aeolian harp.** Fetches current wind speed+direction at ~14 world cities from **Open-Meteo** (CORS-enabled, no key, client-side — NO api route, so no guard), with a **baked fallback dataset** so it always demos offline; each point drives a **Strouhal aeolian-tone voice** (band-pass-filtered noise "whistle" whose centre freq f ≈ St·U/d rises with wind speed, plus a sine tone partial so it sings; centres snapped to **D-Dorian**, NOT pentatonic; direction pans), with per-voice gust LFOs so the chorus breathes and never repeats (a genuine long-form ambient piece). Visual = a Canvas2D equirectangular wind atlas (glowing nodes + streaming wind-barbs/particle tails), live/demo status line. **Why strong:** lab-first technique (aeolian-tone wind physical model, grep-clean), a real **external-API sonification** (a category thin since 314-solar-wind/337-seismic), cosmic vibe; named ref **Aeolian harp + Strouhal vortex-shedding**. **Why it lost curation:** it leans **ambient pad-chorus**, the exact adult lane the jury said to *starve* — strong, but lower surprise than a brand-new club engine. **Resurrect when:** the lab wants its data-sonification lane refreshed; **fix-first:** verify Open-Meteo's batched array-response shape on a live fetch (the builder flagged the array-vs-object ambiguity → the fallback silently activates if wrong); confirm the gust-LFO "breathing" depth is audible. Ambition 3/5 (#1 aeolian technique + #3 named-ref + real-data sonification).

### `388-flow-grains` — banked (build-reviewed clean; `flow.ts`/`audio.ts`/`viz.ts`/`page.tsx`, ~1116 lines)
**Camera optical-flow → granular synthesis: move in front of the webcam and the room's motion scatters into a granular cloud.** Self-computed dense **optical-flow / frame-difference field** (downsample to a ~64×48 grid, per-cell brightness-change magnitude + gradient direction, EMA-smoothed — no ML libs) maps onto a **granular engine** (reused 32-voice pool of short windowed grains): total motion energy → grain density + master gain (still room ≈ silent), vertical motion centroid → grain pitch (quantised to **D-Dorian**, NOT pentatonic), horizontal centroid → stereo pan, flow turbulence → grain duration + detune spread. Camera is **analysis-only** (never recorded/uploaded, no network); **no-camera auto-demo** drifts two synthetic motion blobs across the field so it fully demos hands-free. Visual = the glowing flow field over a dimmed feed, tinted by pitch. **Why strong:** the **optical-flow→granular** fusion is the lab-first hook (camera exists at 368/346/101 and granular at 227/243, but never motion-field-driven grains with no intermediate symbolic layer — every pixel's velocity directly moves a grain); embodied vibe; named ref **AudioFlow (Andrew Kihs) + TouchDesigner Optical-Flow TOP**. **Why it lost curation:** both camera *and* granular already exist in the lab, so it reads as a fresh *combination* rather than a wholly new lane — less of a "massively bigger" jump than a new journey engine. **Resurrect when:** the lab wants a second embodied/off-couch piece; **fix-first:** tune the flow thresholds (SMOOTH 0.72 / MAG_SAT 8 / clamp 12) on a real camera in a dim room; confirm the 768 radial-gradients/frame Canvas2D path holds 60fps on mobile (consider porting the viz to WebGL2). Ambition 3/5 (#1 optical-flow-granular + #2 ≥3 subsystems + #3 named-ref).

---

## Banked from Cycle 338 (DEEP kids fire — 3 SOC cascade-models of ONE concept: "tap a little, sometimes the whole world tumbles — and the avalanche IS the song"; winner was `377-kids-cascade-bloom`)

This fire went **DEEP** on a lab-first technique: **self-organized criticality (SOC) avalanche cascades** as a kids music toy — the research→build chain from this cycle's dive (the *Echoes of the Land* SOC-earthquake sonification, arXiv:2507.14947, 2025). One concept ("small input → power-law-sized cascade → emergent music"), three different SOC models. All three: **GPU OUTPUT** (no inline-SVG — the JURY's standing screen-relocation ban), **D-Dorian** (hard-held, NOT C-pentatonic), **kids VIBE**, touch INPUT. Built to demoable + README by folder-isolated builders; losers banked here as TEXT + folders removed (no half-built folders in the commit). Tie-break was the **kids reliability bar**: the winner's flat grid maps every tap directly to a cell, while both losers project taps through a tilted/scattered layout and self-admit edge-taps can miss — a direct conflict with the hard "immediate response to *every* tap" rule. The winner is also the most *legible/iconic* SOC (the canonical Abelian sandpile), feeding the JURY's "legible/instructional" lane.

### `378-kids-quake-meadow` — the **Olami–Feder–Christensen** non-conservative earthquake CA (α≈0.20 < 0.25 → power-law quakes) rendered as a **three.js heightfield meadow that bulges and shudders**: press to load stress, a cell relaxes past threshold and sheds α to each neighbour, cascades roll outward as a tilted-terrain tremor; epicenter gets a lower, louder **ground-thump** while aftershocks are lighter/higher so a big quake **sounds like a phrase**; slow tectonic loading makes it self-quake hands-free `[banked cycle 338 — the most BEAUTIFUL + research-truest build (OFC is literally the Echoes-of-the-Land earthquake model); resurrect as a desktop/installation view, OR fold its 3-D heightfield render + ground-thump epicenter phrasing + tectonic self-quaking into 377's next cycle]`
**Why it's strong (and why it didn't win):** closest descendant of the cited 2025 research (OFC *is* the spring-block earthquake model), the most visually striking (a glowing 3-D meadow that physically rolls), and the most *musical* cascade (epicenter-thump + aftershock phrasing). Clean build (`page.tsx` + `ofc.ts` + `audio.ts` + `terrain.ts` + README; built clean, no lint errors). **Why it lost (only):** `getPointerCell` uses a linear screen→grid projection, NOT a three.js raycaster against the tilted plane, so taps near the rotated far edge land a cell or two off — fine for an adult, but it breaks the hard 4yo "every tap responds" rule that the flat-grid winner satisfies perfectly. **Fix first on resurrect:** swap the linear projection for a proper raycaster hit-test against the terrain mesh. **Ambition 4/5** (#1 lab-first OFC SOC · #2 ≥3 subsystems: OFC sim + three.js heightfield shader + D-Dorian mallet+thump engine · #3 Olami–Feder–Christensen 1992 + arXiv:2507.14947 · #5 RESEARCH §338). Build-safe (client touch + Web Audio + three.js, no API route, no new deps).

### `379-kids-domino-forest` — a **threshold-toppling domino cascade** (BTW sandpile cousin) in an enchanted twilight forest: tap to grow glowing stalks, a stalk past its height threshold **tips over** and knocks charge into neighbours, knocked neighbours topple in turn → a falling-domino wave that sweeps the forest; stalks spring back up so it never ends; **GPU-instanced** stalk quads with per-instance lean-angle animation + a ring-ripple shock pass; cascade **pans left→right** in the stereo field so a sweep is an audible run `[banked cycle 338 — the most physically-INTUITIVE model for a child ("dominoes!"); resurrect next kids cycle, or fold its GPU-instanced lean animation + stereo-pan-by-position sweep into 377]`
**Why it's strong (and why it didn't win):** the domino metaphor is the most immediately graspable cause→effect for a 4yo, the GPU-instanced lean-over is charming, and the position→pan stereo sweep makes a big cascade legibly *travel*. Clean build (`page.tsx` + `forest.ts` + `audio.ts` + `gl.ts` + README; built clean). **Why it lost (only):** "tap *near* a stalk" on a scattered (non-grid) layout has the same target-ambiguity risk as 378 for the smallest hands, and the canonical Abelian sandpile (winner) is the more *legible/iconic* SOC to introduce the technique with. **Fix first on resurrect:** snap taps to the nearest stalk with a generous radius, or grid-align the stalks. **Ambition 4/5** (#1 lab-first threshold-topple SOC · #2 ≥4 subsystems: cascade sim + WebGL2 instanced renderer + ring-ripple pass + D-Dorian kalimba engine · #3 Bak–Tang–Wiesenfeld 1987 + arXiv:2507.14947 · #5 RESEARCH §338). Build-safe (client touch + Web Audio + WebGL2, no API route, no new deps).

### Winner `377-kids-cascade-bloom` — next-cycle deepenings (folded from the losers)
The shipped piece is the canonical **Abelian sandpile** (24×16 grid, topple-at-4, edge-loss, ≤12 topples/frame so the avalanche ring is watchable). To deepen it without changing identity: (1) add **378's 3-D heightfield render** as an alternate "terrain mode" so the grain heights become a rolling landscape; (2) borrow **378's epicenter ground-thump + aftershock phrasing** so a big bloom sounds like a phrase, not a chord-wash; (3) add **379's stereo pan-by-position** so a screen-spanning cascade audibly travels; (4) add a slow **tectonic auto-loading** option (378) so it self-blooms even richer in attract mode. Each is a clean, additive next cycle.

---

## Banked from Cycle 335 (DEEP adult fire — 3 legibility approaches to ONE concept: "watch your music's tonal center of gravity travel through tonal space"; winner was `370-tonal-map`)

This fire **DEEPENED the Spiral-Array thread** (seeded §333 as the banked `364-tonal-orbit`) — the JURY's repeated "actually deepen something, stop buying breadth" ask, finally shipped. ONE concept (Elaine Chew's tonal **center of effect** traveling tonal space), three legibility approaches; shipped the most legible (`370-tonal-map`, the top-down labeled map) and banked the other two. All three: INPUT internal-demo + Web MIDI (NOT touch, NOT mic — dodges the JURY bans) · OUTPUT three.js (NOT DOM/CSS which hit 4× → banned this fire; NOT SVG) · TECHNIQUE Chew Spiral Array center-of-effect + K-S key-finding + tonal-focus (arXiv:2603.27035, gravitational centering) · VIBE instructional/legible/spatial-tonality. Built to demoable + README by folder-isolated builders; losers moved to `/tmp/dream-losers/` (no half-built folders in the commit) and banked here as TEXT. Tie-break was **legibility-while-keeping-the-thread-identity** (the map fixes 364's abstract-helix flaw without abandoning spatial tonality).

### `369-tonal-orbit` — the literal **3-D Chew Spiral Array helix** in three.js (h = r√(2/15) so major thirds land close), with named key-region `CanvasTexture` sprites that brighten on the active key, a fading comet **trail** of the center-of-gravity's path, an **auto-framing camera** that lerps to the active region (pointer-drag override), a violet chord-c.e. sphere + amber key-c.e. sphere, 12 pitch-class spheres that light when sounding, and a tonal-focus meter `[banked cycle 335 — the most FAITHFUL Spiral-Array build; resurrect for a desktop/installation view where orbiting the true 3-D helix is the point]`
**Why it's strong (and why it didn't win):** it's the genuine Chew model in 3-D — the most theory-faithful of the slate, and a clean build (page 429 / scene 444 / spiral 201 / key-finder 95 / audio 286 + README). **Why it lost (only):** the 3-D helix IS the abstraction the JURY/STATE flagged as *least legible* ("an abstract sphere drifting in a 3D helix"); the named regions + trail mitigate it but a flat labeled MAP still beats it for a 06:30 phone glance, which is the cycle's whole criterion. Its tonal-focus = inverse weighted variance of recent pitch-class points from the c.e. (MAX_VARIANCE≈1.4 empirical). Demo: C: I IV ii V I → pivot (C:IV=G:I) → G: I IV V I → Em: i iv V7 i → C: I IV V Imaj7 (~40s loop). Files were `src/app/dream/369-tonal-orbit/` — moved to /tmp; rebuild from this seed. **Ambition 4/5** (#1 lab-first Spiral Array · #2 ≥3 subsystems · #3 Chew 2000 + KK 1982 + arXiv:2603.27035 · #5 RESEARCH §335). Build-safe (client internal-demo + Web MIDI + Web Audio + three.js, no API route, no new deps).

### `371-tonal-journey` — a scrolling **modulation-journey timeline** (three.js): a left-scrolling ribbon of coloured key-region bands spelling the modulation NARRATIVE with chord symbols + Roman numerals, **explicit pivot-chord callouts** (amber diamonds: "pivot: vi of C = ii of G", detected as diatonic-in-both-keys), a live **tonal-focus trace over time** (emerald polyline that dips at each modulation and recovers — the literal graph of the research scalar), and a small circle-of-fifths compass needle for the current c.e. `[banked cycle 335 — the most INSTRUCTIONAL/teaching take; resurrect as a "modulation explainer" companion, or fold its pivot-chord callouts into 370-tonal-map]`
**Why it's strong (and why it didn't win):** the richest *teaching* piece — it explains the MECHANISM of modulation (pivot chords) and plots tonal-focus as a readable graph over time, the most direct visualization of arXiv:2603.27035. Clean build (page 533 / scene 591 / tonal 233 / key-finder 143 / audio 297 + README; here focus = fraction of histogram weight on the current key's 7 diatonic degrees — a cleaner operationalization). Demo: C → G (pivot Am) → Em (pivot Bm) → C (pivot C), 66 BPM, real pivots. **Why it lost (only):** it drifts furthest from the *spatial* Spiral-Array identity STATE queued (the c.e. demotes to a secondary compass needle), and its scrolling-timeline form overlaps existing piano-roll/score idioms (`24-piano-roll`, `26-score-follow`). Files were `src/app/dream/371-tonal-journey/` — moved to /tmp; rebuild from this seed. **Possible improvement on resurrect:** shorten the hysteresis so pivot callouts land on the ear, not 1–2 chords late. **Ambition 4/5** (#1 lab-first Spiral Array + pivot detection · #2 ≥3 subsystems · #3 Chew 2000 + KK 1982 + arXiv:2603.27035 · #5 RESEARCH §335). Build-safe (client internal-demo + Web MIDI + Web Audio + three.js, no API route, no new deps).

---

## Banked from Cycle 334 (DEEP kids fire — 3 play-models of ONE concept: "Color Hunt" — point the camera at real-world colors, each sings in D-Dorian; winner was `368-kids-rainbow-quest`)

This fire went **DEEP** (one concept, three play-models) on the §334 research hook: camera-as-controller is commodity, but the lab has **no color-foraging game**, and color→pitch is the most legible kids mapping. All three: **camera INPUT** (fresh in the last-10 window — diversity audit banned raw-WebGL2 4×; JURY banned touch/mic/SVG — camera dodges all of them, and sits in Karel's loved cluster `101-camera-song`❤️/`86-sound-to-video`❤️), **color-extraction TECHNIQUE**, **D-Dorian** (hard-held — NOT C-pentatonic), kids VIBE; each renderer different (three.js / Canvas2D / DOM-CSS, none banned). All built to demoable + README by folder-isolated builders; losers moved to `/tmp/dream-losers/` (no half-built folders in the commit) and banked here as TEXT. Tie-break was the **kids bar**: clearest 4yo goal + most embodied + best payoff + lowest perf risk → the guided quest won.

### `366-kids-color-hunt` — free-forage color jam: point the camera at anything, hue→D-Dorian degree / brightness→octave / saturation→voice-brightness; hold a color ~0.8s to "catch" it onto a growing rail, and every 3 catches the whole collection **replays as the melody you built running around the house** `[queued, BUILD-CLEAN this fire — the strongest DEEPENING (memory/composition); resurrect next kids cycle, or fold its "replay what you caught as YOUR song" memory into 368]`
**Why it's strong (and why it didn't win):** the **melody-memory loop** is the richest payoff of the slate — the child hears the song they composed without knowing they composed it (the "gift from past self" mechanic that worked in `152-star-paint`). **Why it lost (only):** for a 4yo, free-foraging has **no clear goal** in the first 5 seconds the way "the unicorn wants red!" does, and its **three.js per-particle `PointLight`** render (~12 lights) is the slate's biggest unverified phone-GPU perf risk. **Spec (built + reviewed this fire):** audio.ts (D+A drone + saturation-LPF continuous voice + catch chime + 480ms memory replay w/ `onStep`, 237 ln) · visuals.ts (three.js reticle Torus+Circle live-HSV + orbiting emissive Sphere blooms + `playMemoryHighlight`, 281 ln) · page.tsx (center 30% of 64×48 offscreen `getImageData` → HSV → hold-stability catch + auto-demo of 7 colors, 445 ln) · README. Files were `src/app/dream/366-kids-color-hunt/` → /tmp; rebuild from this seed. **Fix first:** swap per-particle PointLights for an emissive/additive-free cheaper glow (budget GPU), and add a soft *suggested* color hint so a 4yo has a loose goal. **Ambition 2/5** (#2 ≥3 subsystems: camera capture + color extraction + D-Dorian mapping + catch/memory loop + three.js = 5 · #3 Newton 1704 / Scriabin 1911). Build-safe (client camera analysis-only + Web Audio + three.js; no API route, no new deps).

### `367-kids-color-chord` — room-as-a-chord: extract the whole frame's **palette** (up to 4 colors via 3-bit histogram bucketing) and play all of them at once — a colorful corner rings a full 4-note chord, a plain wall hushes to one soft tone; color *variety* = harmonic *density*, morphing as you sweep `[queued, BUILD-CLEAN this fire — the most SURPRISING take; ship as an adult/older-kid piece or a 2nd kids color cycle]`
**Why it's strong (and why it didn't win):** the **most conceptually surprising** (Karel #2) — "the whole room has a sound, and richer color = richer harmony" is a genuinely fresh idea adults would enjoy too, and it's legible (you *hear* color variety). **Why it lost (only):** as a kids piece it's **ambient/exploratory with no discrete payoff moment** — there's no "found it!" the way the quest has — so it reads older than 4. **Spec (built + reviewed this fire):** colorAnalysis.ts (48×36 downsample → 512-bucket histogram, grey/black filter, top-4 ≥30° hue-separated + 8 demo "room scenes", 201 ln) · audioEngine.ts (4 triangle voices, hue→D-Dorian pitch-class / brightness→octave / coverage→gain glide, D+A drone, limiter, 170 ln) · page.tsx (Canvas2D palette orbs + particles + 2s no-frame watchdog auto-demo, 536 ln) · README (Newton/Scriabin lineage). Files were `src/app/dream/367-kids-color-chord/` → /tmp; rebuild from this seed. **Resurrect as an adult/older take:** pitch it slightly older, or add a discrete reward (e.g. "make a major chord by aiming at 3 colors that are friends"). **Ambition 2/5** (#2 ≥3 subsystems · #3 Newton 1704 / Scriabin *clavier à lumières* 1911). Build-safe (client camera analysis-only + Web Audio + Canvas2D; no API route, no new deps).

---

## Banked from Cycle 333 (DEEP adult fire — 3 technical approaches to ONE concept: "name the KEY + harmonic FUNCTION you play, live"; winner was `365-cadence-ladder`, the lab's first key-estimation + functional/cadence analysis)

This fire went **DEEP** (one concept, three approaches) to *feed the JURY's legible/instructional lane* (its named wins 358/353/345) and *starve the adult JI-drone monoculture*. The concept: a real-time **tonal/functional harmonic analyst** — Krumhansl-Schmuckler key-finding + Roman-numeral functional labeling, fed by an internal known progression (358-style ground-truth verification) + Web MIDI (NOT mic — jury-banned). All three: MIDI/internal INPUT, **three.js** OUTPUT (cools the warm raw-WebGL2 4×), K-S-key-finding/functional-analysis TECHNIQUE (grep-verified lab-first — `229-chord-canvas` names chords only, no key/function/cadence), instructional VIBE. Each cleared the ambition floor ≥4/5. Losers were built to demoable + README by folder-isolated builders, then moved to /tmp (no half-built folders in the commit) and banked here as TEXT. Tie-break was *instructional depth* + first-open legibility (the jury is steering the lab AWAY from abstraction) + distinctness from the existing 229 — the cadence ladder won by teaching WHY harmony moves, not just naming chords.

### `364-tonal-orbit` — Elaine Chew's **Spiral Array** in 3D: chord/key "center of effect" spheres travel through a helix of fifths; modulation = the center-of-gravity migrating across tonal space `[✅ SHIPPED cycle 335 as the deepening — but as the top-down-MAP form (370-tonal-map), which beat the literal 3-D helix on legibility; the helix version itself is banked above as 369-tonal-orbit for a future desktop/installation view]`
**Why it's strong (and why it didn't win):** the Spiral Array (Chew, MIT 2000) is the **most ambitious/surprising technique** of the slate — a genuine lab-first spatial-tonality model where pitch classes sit on a helix parameterised by fifths (h = r·√(2/15) so major thirds are geometrically close), chords are the weighted **center of effect** of their pitch points, and a key is the c.e. of its T/D/S triads; you literally *watch* the tonal center of gravity drift to a new region of the helix when the music modulates — tonal motion made spatial. **Why it lost (only):** an abstract sphere drifting in a 3D helix is the **least legible** reading of the three and exactly the abstraction the JURY is steering the lab away from (it reads like "another pretty spatial thing" on a first open, where 365's named cadence arcs teach instantly). **Spec (built + reviewed this fire):** spiral.ts (helix geometry + triad/key c.e. + chord ID + Roman numeral, 264 ln) · key-finder.ts (K-K Pearson hysteresis, 6-frame/0.04-margin, 164 ln) · audio.ts (triangle+FM pad → DynamicsCompressor, demo progression C→G→Em, Web MIDI, 270 ln) · orbit-scene.ts (three.js helix wire + 12 pitch spheres + 24 dim key markers + violet chord c.e. sphere + amber key c.e. sphere + connection line + pointer-drag camera, 421 ln) · page.tsx (rAF loop + HUD + start overlay + WebGL fallback, 350 ln) · README. Files were `src/app/dream/364-tonal-orbit/` — moved to /tmp; rebuild from this seed. **Resurrect as the multi-cycle deepen (cycle 335) — fix first:** make the spatial motion *legible* (label the regions the center-of-gravity enters with their key names; draw a fading trail of where it's been so the modulation journey is readable; consider snapping the camera to frame the active region) and tune the hysteresis (6 frames may be too slow for sharp pivots). **Ambition 4/5** (#1 lab-first Spiral Array + key-finding · #2 ≥3 subsystems: spiral geometry + K-S estimator + chord/Roman analysis + three.js 3D + audio = 5 · #3 Chew 2000 + Krumhansl & Kessler 1982 · #5 RESEARCH §333). Build-safe (client internal-demo + Web MIDI + Web Audio + three.js, no API route, no new deps).

### `363-key-compass` — **circle-of-fifths** key wheel that rotates to re-center on the new tonic when the music modulates (the cleanest single "the ground moved" gesture); chords light functional spokes labeled with Roman numerals `[queued, BUILD-CLEAN this fire — the most ICONIC/immediately-readable take; ship as a simpler companion or fold the rotating-wheel gesture into 365]`
**Why it's strong (and why it didn't win):** the circle of fifths is the **most iconic, instantly-recognizable** harmonic topology to any musician, and the wheel **rotating** so the new tonic sits at the top is the single most elegant "I just modulated" gesture of the three — lower cognitive load than 365's ladder or 364's helix, ideal for a 06:30 phone glance. Its demo modulates **C→G→Eb** (a chromatic bVI jump) to stress-test the hysteresis on a non-diatonic pivot. **Why it lost (only):** it "**only**" names key+function — it doesn't teach tension→resolution or cadence the way the winning ladder does, so it's less *instructional* (the specific lane the jury asked to feed). **Spec (built + reviewed this fire):** key-finder.ts (PitchClassAccumulator + estimateKey K-S Pearson + detectChord 9-quality template match + getRomanNumeral + HysteresisKeyTracker 2.5 s/0.025-margin, 347 ln) · audio.ts (triangle/sine pads → DynamicsCompressor, 24-chord C→G→Eb loop, Web MIDI, 269 ln) · scene.ts (three.js circle-of-fifths wheel, 12 CanvasTexture node labels, violet tonic glow, emerald active-chord highlight, tonic→chord-member arc lines, lerped 2.5 rad/s rotation, key-switch flash, 382 ln) · page.tsx (rAF analysis loop + readout: key/chord/Roman/confidence/ground-truth label/MIDI status, 384 ln) · README. Files were `src/app/dream/363-key-compass/` — moved to /tmp; rebuild from this seed. **Resurrect — possible improvements:** richer secondary dominants (V/ii, V/vi, not just V/V); cheaper labels (sprite-sheet/SDF font vs 12 CanvasTextures); shorter hysteresis (2.5 s lags the short 2 s demo chords). **Ambition 4/5** (#1 lab-first key-finding/functional · #2 ≥3 subsystems · #3 Krumhansl & Kessler 1982 + Temperley 2001 + Riemann + circle of fifths · #5 RESEARCH §333). Build-safe (client internal-demo + Web MIDI + Web Audio + three.js, no API route, no new deps).

---

## Banked from Cycle 332 (WIDE kids fire — 3 UNRELATED simulation toys, each a grep-verified lab-FIRST cellular-automaton / physics technique; winner was `360-kids-sand-choir`, the lab's first falling-sand granular CA)

This fire went **WIDE** to attack "too similar," and deliberately picked **three different cellular-automaton / growth families** the lab had never touched (all grep-clean across 350+ prototypes): **(A) `360-kids-sand-choir`** falling-sand granular CA (SHIPPED — headline lab-first technique + the most *legible* cross-modal mapping: the dune you build IS the song), **(B) `361-kids-coral-bloom`** Diffusion-Limited Aggregation, **(C) `362-kids-tumble-bells`** Abelian sandpile / self-organized criticality. All three dodge the §JURY-2026-06-06 bans (NOT touch-input, NOT mic/voice-input, NOT SVG-output): two tilt + one shake input, all WebGL2 output, three distinct techniques, warm/cool/jewel palettes respectively. Losers were built to demoable + README by folder-isolated builders, then `rm -rf`'d and banked here as TEXT (no half-built folders in the commit). Tie-break was technique-recognizability + first-open legibility + warm-palette diversity vs the recent cool/jewel run + robustness — sand won on all four.

### `361-kids-coral-bloom` — SHAKE the iPad to release sparkles that drift, stick, and grow a glowing DLA coral reef; each new branch sings a rising D-Dorian note (height→pitch) `[queued, BUILD-CLEAN this fire — strong next-KIDS build, lab-first DLA]`
**Why it's strong (and why it didn't win):** Diffusion-Limited Aggregation is a **grep-verified lab-first** and one of the most beautiful organic-growth algorithms (the physics behind coral, frost, lightning, mineral dendrites); shake-as-input is fresh for the kids lane and the height→pitch mapping literally grows a rising melody. **Why it lost (only):** the **growth is stochastic**, so the song is less *legible* than the winner's direct sand-on-strings mapping (a 4yo can't predict which branch sings next), and a 200×140 grid with a ~900-walker random-walk pool per frame is the **heaviest CPU budget** of the three (perf-unverified). **Spec (built + read this fire):** 200×140 grid, seeds along the floor; ~900 walkers do a biased (downward-settle) random walk, stick on 8-neighbour contact → fractal reef. `accelerationIncludingGravity` high-passed (subtract per-axis running average) → fast-attack/slow-release energy envelope → (a) releases walker bursts + (b) adds walk turbulence. Stick event → glassy marimba bell, pitch by cell height across **D-Dorian**, pan by x, voice-budget + min-inter-onset rate-limit; always-on underwater D+A pad; `DynamicsCompressor` limiter. WebGL2 GLSL ES 3.00: aggregate uploaded as RGBA texture (R=age/opacity, G=height for hue teal→cyan→violet), soft point-sprite kernel over ocean gradient + cheap animated caustic; faint sparkle pass for walkers; matte premult alpha-over (no additive bloom). Degrade: iOS `DeviceMotionEvent.requestPermission()` in-gesture; pointer-shake fallback; auto-demo (synthetic breathing shake) after ~1.8s so it grows hands-free; no-WebGL2 rose notice (audio runs). Refs: **Witten & Sander, "Diffusion-Limited Aggregation," Phys. Rev. Lett. 47, 1400 (1981)** + natural coral/frost/dendrite growth. **Ambition 3/5** (#1 lab-first DLA · #2 ≥3 subsystems: DLA sim + shake input + sonification + WebGL2 = 4 · #3 named ref). Files were `src/app/dream/361-kids-coral-bloom/` (page.tsx 364 ln, dla.ts 226, shake.ts 83, audio.ts 226, gl.ts 292, README) — `rm -rf`'d; rebuild from this seed. **Resurrect** next kids cycle — **fix first:** make the song more legible (e.g. quantize sticks to a slower beat, or only sound the *tallest-so-far* new tip so the melody clearly climbs), and budget the walker pool down / move the random walk to a coarser grid for phone perf. Build-safe (client devicemotion + Web Audio + WebGL2, no API route, no new deps).

### `362-kids-tumble-bells` — drip grains on a magic pile (TILT to aim); sometimes one grain triggers a huge glowing AVALANCHE that ripples out as a fractal star and plays a cascade of bells `[queued, BUILD-CLEAN this fire — lab-first Abelian sandpile / SOC, the highest-surprise of the slate]`
**Why it's strong (and why it didn't win):** the **Abelian sandpile / self-organized criticality** model is a grep-verified lab-first and the most *conceptually surprising* of the three — avalanche sizes follow a **power law**, so the same tiny action sometimes does nothing and sometimes detonates a 500-topple cascade (genuine delight). **Why it lost (only):** it's **conceptually adjacent to the recent `350-kids-bump-along`** (chain-reaction, last kids cycle — the jury already flagged that lane), and the cascade→bell mapping is the **least legible** for a 4yo ("why did THIS avalanche happen?" is invisible) even with the 8-voice cap. **Spec (built + read this fire):** 120×90 grid, cells hold 0–3 grains; cell ≥4 topples (−4, +1 to each orthogonal neighbour) → FIFO worklist cascades exactly (Abelian = order-independent). Auto-drip is continuous; `deviceorientation` β/γ → smoothed reticle aims the dropper. Topple → D-Dorian bell, pitch by radial distance from avalanche centre (centre low, rim high), **≤8 voices + tiny stagger** so a giant slide reads as a sparkling run not a wall; always-on D+A pad; `DynamicsCompressor` limiter. WebGL2 GLSL ES 3.00: grain-count grid + a decaying "heat" grid (bump on topple, fade ~0.86/frame) → two R8 textures; shader maps 4 levels to jewel colours (deep blue/teal/gold/crimson) on near-black + bounded crimson→white flash where heat is high; matte alpha-over, no bloom. Degrade: iOS `DeviceOrientationEvent.requestPermission()` in-gesture; pointer-drag aim fallback; **auto-drip keeps running** so it self-plays; no-WebGL2 rose notice. Refs: **Bak, Tang & Wiesenfeld, "Self-organized criticality," Phys. Rev. Lett. 59, 381 (1987)** / the Abelian sandpile model. **Ambition 3/5** (#1 lab-first sandpile/SOC · #2 ≥3 subsystems: sandpile CA + tilt-aim + cascade sonification + WebGL2 = 4 · #3 named ref). Files were `src/app/dream/362-kids-tumble-bells/` (page.tsx 369 ln, sandpile.ts 150, audio.ts 193, gl.ts 229, README) — `rm -rf`'d; rebuild from this seed. **Resurrect** as an *adult* piece where the power-law / fractal-identity beauty is the point (legibility matters less for adults), OR for kids **fix first:** give the child a clear *cause* — e.g. they place/aim a single visible grain and a "ready to tip" region pulses before it goes, so the avalanche feels earned. Build-safe (client deviceorientation + Web Audio + WebGL2, no API route, no new deps).

---

## Banked from Cycle 330 (DEEP kids fire — 3 play-models for ONE concept, "a tuned water-glass instrument"; winner was `355-kids-glass-armonica`, the lab's first fill-to-tune instrument)

This fire went **DEEP** (alternating off cycle 329's WIDE). The §330 research dive was honest: the kids lane is **saturated** (110 prototypes) and three fresh-concept probes were grep-killed before briefing — **wave-interference→chord** is already the LOVED `133-kids-ripple-pond` (verbatim: "when two ripples meet … a chord plays"); **radial/step/groove sequencer** is covered (`145`/`177`/`199`/`216`/`218`); **soft-body/Verlet** overlaps `303-wind-harp`; **camera/hand/shadow** are already 5×+ (`234`/`258`/`287`/`302`/`268`/`295`). The genuine empty shelf: **NO glass-harp / glass-armonica / fill-to-tune instrument** in the lab (grep-clean). One concept = *"fill glasses with water to TUNE them (water level = visible pitch), then PLAY them"* — the most legible cross-modal mapping the lab can make (jury #1). Three distinct PLAY MODELS, all touch INPUT · **DOM/CSS** OUTPUT (cools the warm raw-WebGL2 3×) · glass-fill-tuning TECHNIQUE · kids-playful VIBE: **(A) `354-kids-water-glasses`** tap-to-strike struck bells, **(B) `355-kids-glass-armonica`** swipe-across-rims continuous sustain (SHIPPED — most surprising + novel SOUND + best first-open + lowest 4yo skill-floor), **(C) `356-kids-pour-organ`** pour-between-vessels conservation puzzle. Deliberately broke from the queued chain-reaction banks (`348-domino`/`349-marble`) to avoid a back-to-back repeat of `350-kids-bump-along` (chain-reaction shipped last kids cycle). Losers built to demoable + README by folder-isolated builders, build-clean for their own folders, then moved to `/tmp/dream-losers/` and banked here as TEXT (no half-built folders in the commit). Tie-break was surprise + novel-sound + first-open + 4yo-playability (diversity was a wash — all three share identical clean tags).

### `356-kids-pour-organ` — pour water BETWEEN bottles to tune them: filling one empties another (a conservation puzzle), then tap to play `[queued, BUILD-CLEAN this fire — RE-FLAGGED as the strong next-KIDS build: the RICHEST concept of the slate]`
**Why it's strong (and why it didn't win):** the **richest concept** — a fixed total of water is *shared* across the row, so pouring from vessel A into neighbour B lowers A and raises B together: "if I pour here, that one goes low." Tuning becomes a playful cause-and-effect puzzle that quietly teaches conservation of volume as a musical property, with no reading. The auto-demo even auto-pours so the unique twist self-demonstrates. **Why it lost (only):** the **two-vessel pour gesture (drag from A into B) is a higher fine-motor + more abstract cause-effect** than the winner's swipe-a-finger, so it placed second on 4yo-playability; and its PLAY phase is *struck* glass-bells (the lab's most-done idiom, shared with `354` and `317-kids-color-bells`), so it's lower-surprise on SOUND than the winner's continuous armonica. **Spec (built + read this fire):** 7 vessels, conservation-enforced `pourWater()` (adjacent-only; transfer ∝ drag distance, capped 40%/gesture, MIN/MAX clamps); `pointerdown`→drag-into-neighbour pours with a CSS pour-stream `<div>` (rotated gradient strip between vessel centres), `pointerup` within 14px = a *tap* that strikes. **Water→pitch** `freq(level)=FREQ_FULL·(FREQ_EMPTY/FREQ_FULL)^(1−level)` (log-linear, D3..D5), pre-distributed to a **D-major** scale on load (NOT C-pentatonic). **Struck glass-bell** voice (fundamental + inharmonic ×2.756 + ×5.404 + 30ms noise transient, 6ms attack / 2.6s decay) → `DynamicsCompressor` limiter; quiet D-tonal triangle pad. Auto-demo: 18-note melody every ~510ms + an auto-pour every ~3.6s; both stop on first touch. Refs: musical **bottle organ** folk tradition · **glass harp / Franklin armonica (1761)**. **Ambition 3/5** (#1 conservation-constrained fill-tuning is a fresh kids interaction · #2 ≥3 subsystems: conservation pour model + glass-bell synth + drone/limiter + DOM/CSS render + pour/flash rAF = 5 · #3 named refs). Files in `/tmp/dream-losers/356-kids-pour-organ/` this container only (ephemeral — `page.tsx` 831 ln, `audio.ts` 202, `README.md`; one harmless eslint-disable on a stable-ref dep in `runDemoPour` — re-verify on resurrect). **Resurrect** next kids fire — **fix first: simplify to a one-finger pour** (e.g. tap source then tap target, or a single drag that visibly "tips" a vessel into its neighbour) so the two-vessel cause-effect lands for a 4yo; or pitch it slightly older as a tuning sandbox. Build-safe (client touch + Web Audio + DOM/CSS, no API route, no new deps).

### `354-kids-water-glasses` — fill glasses with water to tune them, then TAP to play a struck glass-harp melody `[queued, BUILD-CLEAN this fire — the cleanest/simplest fill-to-tune piece; banked]`
**Why it's strong (and why it didn't win):** the **cleanest and simplest** of the three and the most directly love-aligned (struck glass-bells echo the LOVED `317-kids-color-bells`); the drag-to-fill / tap-to-strike split is the lowest-cognitive-load two-phase model. **Why it lost (only):** **lowest surprise** — once tuned it's essentially a glockenspiel you tap (the lab's most-done idiom), so it brought no new SOUND, where the winner's continuous rubbed-glass armonica did. The fill-to-tune *mechanic* is the fresh part and it shares that with the winner. **Spec (built + read this fire):** 8 glasses, drag up/down to fill with a soft live pitch-preview; quick tap (<10px, <400ms) = strike. **Water→pitch** exponential `freq = freqHigh·(freqLow/freqHigh)^level` (660 Hz empty → 220 Hz full), pre-tuned to **D-major** (D4..D5, NOT C-pentatonic). **Glass-bell** = 3 inharmonic partials (1 : 2.76 : 5.4, decays 2.8/1.4/0.7s, 4ms attack) + lowpass 5.2kHz → `DynamicsCompressor` limiter; D2/A2/D3 triangle pad. CSS ripple pulse on strike; auto-demo plays an 11-note D-major phrase, stops on first touch; Begin overlay for iOS autoplay. Refs: **Franklin glass armonica (1761)** · folk **glass harp / Jamey Turner**. **Ambition 2/5** (#2 ≥3 subsystems: water-fill model + glass-bell synth + drone/limiter + DOM/CSS render = 4 · #3 named refs — honest 2/5, the fill-tuning #1 is claimed by the shipped sibling). Files in `/tmp/dream-losers/354-kids-water-glasses/` this container only (ephemeral — `page.tsx` 486 ln, `audio.ts` 120, `glasses.ts` 117, `README.md`). **Resurrect** if the lane wants a pure struck glass-harp, or fold its clean tap-to-strike + pitch-preview into a future struck piece. Build-safe (client touch + Web Audio + DOM/CSS, no API route, no new deps).

---

## Banked from Cycle 329 (WIDE adult fire — 3 UNRELATED explorers; winner was `353-collapse-score`, the lab's first Wave Function Collapse composer)

This fire went **WIDE** (alternating off cycle 328's DEEP) — WIDE is the jury's named tool against the forming **adult monoculture** ("kill the his-piano→nebula rut"). Three genuinely unrelated adult directions, each clearing the ambition floor with DIFFERENT tags, all dodging every banned tag and all on the COOLEST renderers (DOM/CSS / audio-first — actively cooling the warm SVG 4× / raw-WebGL2 3×): **(A) `353-collapse-score`** music composing itself by Wave Function Collapse (SHIPPED — highest surprise + most literally legible + best first-open delivery), **(B) `351-erosion`** music that wears out, **(C) `352-breath-tide`** a drone you play with your breath. The §329 research dive (cs.SD recent: LiveBand 2606.03803, SketchSong 2606.03169, SegTune 2606.02638 — all server/GPU-heavy, un-buildable client-side) confirmed the lab's strategy of **deterministic, client-verifiable, self-composing sources** over chasing a frontier model. **Grep-correction before briefing** (the honesty the mandate demands): three weaker candidate directions were KILLED on grep — **Web MIDI** (`291-harmonograph`, `4-operator` already use it), **Tonnetz / neo-Riemannian** (`37-ratio-lab` already has the lattice), and **Steve Reich phasing** (`302-mirror-canon-round` already ships a Phase mode) — so the slate was rebuilt around three confirmed-fresh axes. Losers built to demoable + README by folder-isolated builders, build-clean for their own folders, then moved to `/tmp/dream-losers/` and banked here as TEXT (no half-built folders in the commit).

### `351-erosion` — a piece of music that physically WEARS OUT as you listen, more ruined every morning, until one day it is gone `[queued, BUILD-CLEAN — TRIPLE-banked now (cycles 327, 328, 329); ESCALATED to Karel — see open question]`
**Why it's strong (and why it didn't win, a third time):** the **most emotionally distinct** of the slate and a **grep-verified lab-FIRST** generative-degradation piece (opens the thinnest shelf, conceptual/critical — only `330-stillness` before it; pure DOM/CSS bars, the cleanest renderer dodge in the lab). It has now lost curation in **three** WIDE adult fires — each time to a fresher *first-open* piece (347 the sky, then 353 the WFC composer) — and the recurring reason is structural, not quality: **erosion's core hook (more ruined each morning) is invisible on a first open.** At 06:30 Karel opens it and sees/hears a *pristine* warm loop; the decay payoff only appears if he returns the next day — which is a real weakness for a lab judged fresh each cycle, and exactly why it keeps banking. **This is now an honest open question for Karel** (see MORNING): it is build-clean and ready; should it just ship next adult cycle *unconditionally* (the morning-review-vs-decay-over-days tension is the whole point, not a bug), or be reframed so the decay is visible immediately (e.g. open with an already-half-eroded tape + a "rewind to new" control)? **Spec (built + read this fire):** on Begin, synth a warm ~12 s 5-limit-JI loop into an `AudioBuffer` from a seeded mulberry32 PRNG (3 pad tones + 4–6 bell tones; "New tape" re-seeds). An `erosion` value in [0,1] advances three ways — loop-pass tick (0.004/pass), continuous drift (~0.0054/hr open), AND **real elapsed wall-clock time while away** (localStorage `seed`/`erosion`/`bornAt`/`savedAt`, `EROSION_PER_DAY=0.18` → ~5–6 days new→gone). Erosion degrades the audio (all `setTargetAtTime`-smoothed): descending lowpass (16 kHz→420 Hz, highs first), amplitude thinning + deterministic per-seed dropout bars, rising white-noise hiss, wow/flutter LFO on `playbackRate` (an OscillatorNode → the source's `playbackRate` AudioParam, the canonical tape-wobble move); at ≈1 it's near-silence + hiss. **Visual = 56 pure DOM/CSS bars** (slice amplitudes, scrubbing playhead, warm-amber→ashen-grey palette as it erodes). Controls (≥44px): Let it rest / New tape; always-visible erosion % + age + seed; master `DynamicsCompressor` limiter; `prefers-reduced-motion` honored; in-memory fallback if storage blocked. Refs: **William Basinski *The Disintegration Loops*** + **Brian Eno *Music for Airports***. **Ambition 3/5** (#1 lab-first generative-degradation · #3 named refs · #4 multi-day decay-while-away). Files in `/tmp/dream-losers/351-erosion/` this container only (ephemeral — rebuild from this seed; `page.tsx` 733 ln, `tape.ts` 438 ln, `README.md`). Build-safe (client-only Web Audio + DOM/CSS, no API route, no new deps).

### `352-breath-tide` — a near-screenless drone you play with your BREATH, that hears your breathing and gently guides it toward calm `[queued, BUILD-CLEAN — the strong jury-#2 SECOND-non-screen answer brought to the adult lane; ship next adult]`
**Why it's strong (and why it didn't win):** the most direct answer to **jury provocation #2** ("build the SECOND non-screen piece — `308` found the freshest axis the lab owns and nothing followed it"), and it brings that embodied/non-screen axis to the **adult** lane for the first time, on a **fresh input** (mic **breath-envelope**, NOT pitch/voice — distinct from the voice pieces `322`/`330`/`331`). It lost to `353` on first-open surprise + legibility: the WFC composer shows its full concept in 10 seconds, whereas breath-entrainment is *subtle* (and the builder honestly flagged that the guide period starts AT the 10 s target rather than measuring the listener's initial rate first, so the entrainment is partly cosmetic at the very start), and an always-on JI meditation drone is closer to the lab's house style than WFC's novel technique. **Spec (built + read this fire):** raw mic (`echo/noise/AGC: false`) → `AnalyserNode` (fft 512) → `computeRms()` 0..1 → a slow exponential follower (τ 300 ms) that tracks the 3–20 s breath cycle while suppressing phonemes; **hysteresis** thresholds + 0.8 s dwell guard detect inhale/exhale transitions; a 5-sample ring buffer estimates the breath period. **Entrainment**: `guidePeriod` eases toward `TARGET=10 s` (0.1 Hz HRV resonance rate) over `ENTRAIN_MINUTES=8`; the audio swell and the halo both track `guidePeriod`, so the listener naturally follows. **Audio**: D2=73.42 Hz JI drone (partials 1/1, 3/2, 5/4, **7/4 harmonic seventh** for the ambiguous meditative color, 9/8, 2/1), ±5/±7-cent chorus copies → lowpass 700 Hz → synthetic 3.2 s convolver reverb → master → `DynamicsCompressor` limiter; each partial has inhale (bright/full) vs exhale (sparse/dark) gains, `setTargetAtTime` 80 ms (click-free). **Visual = near-black DOM/CSS halo** (a `radial-gradient` circle scaled by the swell + a `box-shadow` overlay whose spread/blur/opacity track it + a thin swell bar + a phase label; violet hue on inhale → indigo on exhale; direct style mutation in the rAF loop, no React re-render). **Haptics** `navigator.vibrate` at each breath turn (silent no-op where unsupported). **Auto-demo** = a simulated 0.12 Hz breath sine drives the IDENTICAL detect→entrain→drone→halo pipeline, so it's alive + auditionable on load with no mic; real mic is opt-in inside the Begin gesture (analysis-only, never recorded/uploaded). Refs: **Pauline Oliveros *Deep Listening*** · **HRV resonance breathing (~6 bpm / 0.1 Hz; Lehrer & Gevirtz 2014)** · **Alvin Lucier *I Am Sitting in a Room***. **Ambition 3/5** (#1 first adult breath-envelope-entrainment input · #2 ≥3 subsystems: breath detection + entrainment state machine + JI drone/tide synth + dim halo = 4 · #3 named refs). Files in `/tmp/dream-losers/352-breath-tide/` this container only (ephemeral; `page.tsx` 463 ln, `breath.ts` 190, `audio.ts` 219, `README.md`). **Resurrect** next adult cycle as the second-non-screen build — **fix first: seed the tracker from the listener's first 2–3 real breaths BEFORE entraining** (so the guide visibly starts at *their* rate and eases away), which makes the entrainment honest rather than cosmetic; deepen with a haptic-only / eyes-closed mode. Build-safe (client mic analysis-only + Web Audio + DOM/CSS, no API route, no new deps).

---

## Banked from Cycle 328 (DEEP kids fire — 3 physics/interaction approaches to "the lab's FIRST chain-reaction music machine for kids"; winner was `350-kids-bump-along`)

This fire went **DEEP** (alternating off cycle 327's WIDE) on a grep-confirmed-fresh kids concept: the §328 research dive found live-weather-for-kids is **already taken** (`293-kids-sky-band`), so it pivoted to a lab-gap audit and found the kids lane (110+ prototypes) has **ZERO chain-reaction / Rube-Goldberg / cause-and-effect-cascade pieces** (domino/Newton's-cradle/marble-machine all grep 0). One concept = *"place pieces, trigger one, and watch a cascade of collisions play a melody"* — cognitively perfect for a 4yo (cause→effect-by-repetition, KIDS.md #3) and a genuinely new creative frame (arrange-in-space = compose; trigger = perform). Explored via three physics/interaction models, all **SVG inline JSX** (dodges the Canvas2D jury-ban + warm raw-WebGL2 3× + WebGPU verification-debt), all pentatonic-no-fail, all auto-demo-alive. Winner `350-kids-bump-along` shipped (impulse-propagation / Newton's-cradle — the most legible + lowest-skill-floor + most-robust). The other two were built to demoable + README by folder-isolated builders, build-clean for their own folders, moved to `/tmp/dream-losers/`, and banked here as TEXT (no half-built folders in the commit). All three share the same diversity-clean tags (touch INPUT · SVG OUTPUT · collision-cascade TECHNIQUE · kids-playful-construction VIBE), so the tie-break was surprise + 4yo-playability + legibility + code-robustness + love-signal, not diversity. **Renderer note:** SVG is now warm (this fire took it to 4× in the last 10) — a revival should consider DOM/CSS (cleaner) for the visual.

### `348-kids-domino-song` — drag a winding trail of dominoes, tap the first, and watch the whole chain topple one-by-one, each fall singing its note `[queued, BUILD-CLEAN this fire — the strong next-KIDS build: highest charm + cleanest render; fix the tip-trigger first]`

**Why it's strong (and why it didn't win):** the **highest-surprise / most-charming** of the slate — toppling dominoes is iconic, and the "arrange in space, then release in time" frame is the freshest creative model (composition is the layout). It also has the **cleanest render engineering** of the three (a single per-frame `setRenderTick` rebuilds the SVG, vs. the winner's per-creature state). It lost ONLY on 4yo-playability: its core trigger is a **precise ~32px tap on the *first* domino**, which the builder itself flagged as misfire-prone on dense trails (an accidental tap starts a *new* trail instead of tipping), and laying a deliberate trail is more fine-motor-demanding than the winner's "tap a big creature." **Spec (built + read this fire):** drag the SVG surface to lay dominoes — a carry-over loop (`while (carry+remaining >= STEP)`) drops one every 46px regardless of pointer speed; pitch cycles a 5-note pentatonic in drag order, color = pitch (red=C/orange=D/yellow=E/green=G/blue=A). Tap the first domino → a recursive `setTimeout` chain topples each (SVG `<rect>` rotated via `translate(pivot) rotate(deg) translate(-pivot)`, a `springEase` cubic ease-out 0→82° over 220ms), knocking the next 145ms later, each firing an additive-bell note (2 triangles + sine 3rd partial, 10ms attack / 1.4s decay) + 6 ballistic SVG-circle sparkles; last domino → a C-major shimmer arpeggio; +2.2s all dominoes silently stand back up. Always-on C+G drone; master gain → `DynamicsCompressor` (−6dB, 12:1) → lowpass 9kHz. Auto-demo lays a curved ~7-domino trail and tips it on load (silent until first-gesture unlock). Refs: dominoes/Rube Goldberg · *The Incredible Machine* (1992) · Sound Drop (Earslap). **Ambition 3/5** (#1 first chain-reaction/Rube-Goldberg kids piece — grep-verified · #2 ≥3 subsystems: cascade-timer chain + drag-placement + bell synth + drone/limiter + SVG render + sparkles · #3 named refs). Files in `/tmp/dream-losers/348-kids-domino-song/` this container only (ephemeral — rebuild from this seed). **Resurrect** next kids fire as the strong default — **fix first: replace the tap-the-first-domino trigger with a dedicated big (≥64px) "tip it!" button per trail** (the builder's own recommendation); deepen with domino-angle→volume, or two children laying converging trails into a duet. Build-safe (client touch + Web Audio + SVG, no API route, no new deps).

### `349-kids-marble-bells` — drop a glowing marble and watch it bounce down through color-coded bells you placed, each collision ringing a chime `[queued, BUILD-CLEAN this fire — love-pull from `169-kids-marble-run`❤️ + Plinko wow; refactor the per-frame setState before shipping]`

**Why it's strong (and why it didn't win):** the **strongest love-signal** of the slate — Karel loved `169-kids-marble-run`, and a marble machine is high Plinko wow with the **lowest skill floor** (tap to drop, watch it cascade). It lost on two axes: (a) **legibility** — the marble's bounce is semi-chaotic, so the child's cause→effect is looser than the winner's ordered, repeatable wave (jury #1 is "make it legible"); (b) **code robustness** — the build calls `setBells([...nextBells])` + `setMarbles([...nextMarbles])` **every frame** (its own builder flagged jank risk on low-end tablets with the glow filters), the weakest engineering of the three. **Spec (built + read this fire):** tap anywhere to place a bell (SVG `<circle>` r=38, ≥64px hit), top 10% of screen = drop a marble (or 🔮 button); marbles integrate gravity (`vy += 0.28/frame`), circle-circle collision reverses the normal component with restitution 0.62 + a lateral kick from `hitOffset = (m.x-b.x)/BELL_R` so they cascade down a zigzag; each hit rings an additive glass-bell (fundamental + 2× + 4× + 2.76× inharmonic, 4ms attack / 2.4s decay) + ripple ring + 8 sparkles; vertical position → pentatonic pitch index (8 bells, top=C5/bottom=G3) AND color (coral→pink); marble exits bottom → soft landing chime; auto-drop demo every few seconds (cap 4 marbles). Always-on drone; master gain → lowpass 9kHz → `DynamicsCompressor` (−18dB, 6:1). Refs: Wintergatan Marble Machine · Plinko · Taito Sound Drop · Rube Goldberg · pinball bumpers. **Ambition 3/5** (#1 first chain-reaction/marble-machine kids piece · #2 ≥3 subsystems: gravity/bounce physics + bell synth + drone/limiter + SVG render + sparkles/ripples + placement state · #3 named refs). Files in `/tmp/dream-losers/349-kids-marble-bells/` this container only (ephemeral). **Resurrect** on a kids fire that wants the marble lineage (love-backed) — **refactor first: move per-frame bell/marble updates to ref-only direct SVG mutation (no React setState in the rAF loop)** to kill the jank, and tighten the bounce so the path reads as more deliberate (jury #1). Build-safe (client touch + Web Audio + SVG, no API route, no new deps).

---

## Banked from Cycle 327 (WIDE adult fire — 3 UNRELATED explorers attacking the jury's "kill the his-piano→nebula adult rut" via deterministic AUTONOMOUS sources; winner was `347-the-place`)

This fire went **WIDE** (alternating off cycle 326's DEEP) on the jury's #1 live provocation: *the adult lane is forming a rut — three of four adult builds are "Karel's piano → an abstract luminous cloud he watches"; make the music LEGIBLE / about something, not a 6th screen-viz nebula.* The escape (RESEARCH §327): **deterministic autonomous, self-composing sources** — verifiable in-sandbox (jury #5: no new unrun WebGPU compute), about *something*, none using his-recording. Three unrelated explorers: **(A) `347-the-place`** the real local sky (SHIPPED), **(B) `348-erosion`** decay/loss itself, **(C) `349-strange-attractor`** a chaotic attractor. All three built to demoable + README by folder-isolated builders, build-clean for their own folders, then 348/349 moved to `/tmp/dream-losers/` and banked here as TEXT (no half-built folders in the commit). Resurrect on a future adult cycle with a fresh number.

### `348-erosion` — a piece of music that physically WEARS OUT as you listen, more ruined every morning, until one day it is gone `[queued, BUILD-CLEAN this fire — the strongest BANK; a genuine lab-FIRST technique; ship next adult or next conceptual cycle]`
**Why it's strong (and why it didn't win):** the **highest-surprise / most emotionally distinct** of the three and a **grep-verified lab-FIRST** — the lab has no generative-degradation / tape-decay piece (only `275-memory-loom` matched and it's a verbatim-capture *looper*, not decay). It also opens the lab's thinnest shelf, **conceptual/critical** (only `330-stillness` before it), and uses the **cleanest renderer dodge in the lab — pure DOM/CSS bars** (no canvas/SVG/WebGL at all), which sidesteps the SVG audit-ban + Canvas2D jury-ban + the warming raw-WebGL2 entirely. It lost to `347` ONLY on jury-fit: the loudest current provocation is "make his music LEGIBLE," and `347` (the sky scores the music, with readouts you can watch) is the more direct answer to *that specific* ask, plus `347` is the warmer "Resonance-vibe" (place-based contemplative) and more obviously product-relevant. `348` is a downer-by-design (a piece you *use up*), which is the point but a harder morning open. **Spec (built + read this fire):** on Begin, synth a warm 10–15 s just-intonation loop into an `AudioBuffer` from a seeded mulberry32 PRNG (a few sustained pad tones + a bell-ish motif; "New tape" re-seeds a different pretty loop). An `erosion` value in [0,1] grows per loop-pass + a slow continuous drift, and **advances for real elapsed time while you're away** (localStorage `seed`/`erosion`/`bornAt`/`savedAt`, `EROSION_PER_DAY≈0.18`) so the tape is genuinely more ruined each morning. Erosion degrades the audio (all `setTargetAtTime`-smoothed): descending lowpass (~16 kHz→~420 Hz, highs wear first), amplitude thinning + deterministic per-seed dropouts, rising tape hiss, wow/flutter LFO on `playbackRate`; at ≈1 it's near-silence + hiss + a "this tape has worn away" state. **Visual = 56 pure DOM/CSS bars** (slice amplitudes, a scrubbing playhead, warm-amber→ashen-grey palette as it erodes). Controls (≥44px): **Let it rest** (pause erosion), **New tape** (reset+re-seed), always-visible erosion % + age + seed; master `DynamicsCompressor` limiter; `prefers-reduced-motion` honored; in-memory fallback if storage blocked. Refs: **William Basinski *The Disintegration Loops*** + **Brian Eno *Music for Airports***. **Ambition 3/5** (#1 first generative-degradation piece — grep-verified · #3 named refs · #4 multi-day persistence/decay-while-away). Files in `/tmp/dream-losers/348-erosion/` this fire (`page.tsx`, `tape.ts`, `README.md`). **Resurrect**: ship on an adult or conceptual/critical cycle; deepen with multiple coexisting tapes that age at different rates, or "one shared tape the whole audience erodes."

### `349-strange-attractor` — a chaotic attractor (Lorenz / Rössler / Chua) as the composer; turn a knob to cross the edge of chaos `[queued, BUILD-CLEAN this fire — banked, but HONESTLY a deepening of the 9-yr-old `10-strange`, NOT a lab-first; resurrect only as an explicit "modern re-take" with a fresh angle]`
**Why it's strong (and why it didn't win):** a beautiful, fully-verifiable (deterministic) modern re-take — multi-system (Lorenz/Rössler/Chua), **scale-snapped so it's musical not a siren**, an audible **edge-of-chaos** via sliders with a **largest-Lyapunov-style regime probe** (a shadow twin orbit renormalized to show `λ`), and a hand-written WebGL2 phase-portrait ribbon. **GREP CORRECTION (honesty the mandate demands):** it is **NOT a novel technique** — `10-strange` (cycle 10) already maps a Lorenz attractor → FM synthesis ("hear chaos"). So its ambition is only **2/5** (#2 ≥3 subsystems: RK4 integrator + scale-mapped ensemble + WebGL2 portrait · #3 Lorenz 1963 / Xenakis / Leonardo Vol.59 No.1 2026 Roddy et al. / Chua), and a second Lorenz piece risks the very "too similar" the mandate bans. It lost on both ambition (no #1) and the soft renderer note (raw-WebGL2 would hit 3× with 347 shipping). Its genuine upgrades over `10-strange` (scale-snap, three systems, Lyapunov label, edge-of-chaos slider) make it a legitimate *replacement-grade* re-take if Karel ever wants the chaos lane refreshed. Note its trail uses **additive** blending (the jury's anti-glow ban — switch to matte premultiplied alpha-over on resurrect). Files in `/tmp/dream-losers/349-strange-attractor/` this fire (`page.tsx`, `systems.ts`, `audio.ts`, `gl.ts`, `README.md`). **Resurrect**: only as an explicit "we already have `10-strange`, here's the musical/multi-system upgrade" — or cannibalize its scale-snap + Lyapunov-regime ideas into a different dynamical piece (reaction-diffusion, double pendulum, n-body).

---

## Banked from Cycle 326 (DEEP kids fire — 3 interaction-model approaches to "the lab's first NON-SCREEN / audio-first KIDS listening adventure"; winner was `346-kids-sound-hunt`)

This fire went **DEEP** (alternating off cycle 325's WIDE) on a genuinely fresh kids concept surfaced by the §326 research dive — spatial audio is the 2026 off-screen frontier, and the lab has **108 kids prototypes and ZERO that are non-screen / audio-first** (the only non-screen piece in 300+ is the ADULT `308-orbit-choir`). One concept = *"a kids listening adventure: the screen goes dim, the child TURNS their body/phone and LISTENS to find singing creatures placed around them in HRTF space."* Explored via three INTERACTION MODELS, all rendering the dim visual in **DOM/CSS** (dodging the diversity audit's **SVG ban ≥5×** + the Canvas2D ban entirely) with HRTF spatial audio via `PannerNode { panningModel:"HRTF" }` + `DeviceOrientationEvent`. Winner `346-kids-sound-hunt` shipped (find-and-collect; richest/most-charming, clearest discrete reward, most robust fallback — the compass glow + tap-shortcut complete the loop even with weak HRTF). The other two were built to demoable + README by folder-isolated builders, build-clean for their own folders, moved to `/tmp/dream-losers/`, and banked here as TEXT (no half-built folders in the commit). Resurrect on a future kids cycle with a fresh number. All three share the same diversity-clean tags (device-orientation INPUT · HRTF-spatial + dim-DOM/CSS OUTPUT · HRTF-spatial-listening TECHNIQUE · listening-adventure VIBE), so the tie-break was surprise + 4yo-playability + reward-legibility + verifiability, not diversity. **Honest novelty (grep-verified):** the lab-first is *non-screen / audio-first for kids* — distinct from the many kids pieces that pan in 2-D stereo with a full game screen. **Renderer note:** all three are DOM/CSS dim visuals (cleanest possible dodge of the SVG/Canvas2D bans) — a revival can keep DOM/CSS or move to audio-only/haptic-only to push the non-screen axis even further (jury #2).

### `348-kids-song-catcher` — turn toward each hidden note to catch a KNOWN D-Dorian melody in order, assembling a visible ribbon `[queued, BUILD-CLEAN this fire — RE-FLAGGED as the strong next-KIDS build: the most jury-#1-legible model]`

**Question**: what if a song hid in the space around a child, one note at a time, and they caught the whole melody — in order — by turning toward where each note is loudest?

**Why it's strong (the most legible of the slate)**: where the winner has you collect *characters*, this has you assemble a *recognizable melody* note-by-note into a visible ribbon — the most faithful kids answer to **jury #1** ("make the music *legible* — recognize what you played"), and it teaches melodic sequence by ear. The catch (progress-bar fill + chime + haptic) is a clear discrete reward and the loop has a real finish (the full melody plays back in celebration). **Why it lost (only)**: localizing a *single* sustained note by ear is the hardest perceptual task of the three for a 4yo (the winner's six simultaneous distinct timbres give more cues), and "collect cute animals" out-charms "catch abstract notes" for the target age — so it placed second on surprise + playability, not on concept. Spec (built + read this fire): INPUT=**device orientation** (turn toward the loud note) with pointer-drag + ←→ keys + auto-demo fallback. `audio.ts` = a ~7-note D-Dorian target melody (`D E G E D A G`) each note a pulsing voice on its own `PannerNode{HRTF}` at radius 3.5 m (gain swells ~0.18→0.88 as you face it), always-on **D2+A2+D3** drone, master → brick-wall `DynamicsCompressor` (−3 dB, 20:1). `catch.ts` = note placement (random 45° zone ≥1 zone from the previous + ±14° elevation) + heading→facing + 0.8 s within-±24° hold → catch → advance → celebrate state machine. OUTPUT=**DOM/CSS** dim compass ring + directional glow petal + center glow + catch-progress bar + note ribbon (no canvas, no SVG). Auto-demo steers toward each note's azimuth and catches at 55% hold-time through the identical audio path. **Ambition 3/5** (#1 first non-screen/audio-first kids piece · #2 ≥3 subsystems: orientation listener + HRTF melody bank + drone/limiter + DOM compass + auto-demo + catch sequence state machine · #3 named refs **Janet Cardiff *audio walks* · *Papa Sangre* · Pauline Oliveros *Deep Listening* · `308-orbit-choir` lineage**). Real risks (unverified — no real HRTF/device/4yo in sandbox): whether a 4yo can localize a single note by ear well enough to catch it vs. random turning (the ±24° cone / 0.8 s hold are adult-tuned and may need widening); the glow petal carries it visually regardless. **Resurrect** next kids fire — the legible-melody angle is genuinely distinct from the winner's collect-characters loop; deepen by letting the child *record their own* short melody for a friend to catch. Folder lives at `/tmp/dream-losers/348-kids-song-catcher` this container only (ephemeral — rebuild from this seed). Build-safe (client device-orientation + Web Audio + DOM/CSS, no API route, no new deps).

### `347-kids-echo-cave` — call into a dark cave and creatures echo back from FIXED 3-D addresses, building a spatial round around you `[queued, BUILD-CLEAN this fire — banked but DIFFERENTIATE before resurrecting: the echo lane is jury-saturated]`

**Question**: what if a child made ONE sound and heard creatures answer back from all around them in the dark, each from its own direction, until they were surrounded by a soft round?

**Why it's strong**: the simplest interaction of the three (tap a big button — no turning, no localization *required* to succeed), so it's the most robust to weak HRTF and the lowest cognitive load for a 4yo; the spatial round accreting around you (five creatures at fixed azimuth/elevation, each a D-Dorian note with its own timbre) is lovely and genuinely non-screen. **Why it lost / the caution**: the call-and-echo lane is **jury-flagged as saturated** — the lab already has `94-kids-ghost-echo`, `102-kids-echo-song`, `142-kids-echo-canon`, `280-kids-echo-canyon`, `298-kids-echo-friend` — and even with the spatial twist the *experience* rhymes with them; the builder's own README concedes the differentiation is "real but subtle." It also has the weakest reward legibility (no discrete "I did it!" — the round just accretes) and the least agency (you tap and it builds). Spec (built + read this fire): INPUT=**tap "✨ Call"** (each tap = a call) + optional device-orientation to face creatures. `audio.ts` = five fixed `PannerNode{HRTF}` positions (e.g. `(30°,+10°)`, `(120°,0°)`, `(210°,-10°)`, `(300°,+5°)`, `(180°,+20°)`); each call plays centered then echoes return one at a time over ~1–2 s, each a creature singing its D-Dorian note (softer/higher as they bounce); **D2+A2+D1** drone; master → brick-wall `DynamicsCompressor` (−3 dB, 20:1). OUTPUT=**DOM/CSS** dim ring + radial-gradient/box-shadow glow blooms at each return direction + a faint heading dot (no canvas, no SVG). Auto-demo calls every ~4.5 s (first at ~1.2 s) through the identical path, resetting on manual taps. **Ambition 3/5** (#1 first non-screen/audio-first kids piece · #2 ≥3 subsystems: call engine + spatial echo bank/scheduled round + creature synthesis + limiter + auto-demo + DOM glow · #3 named refs **Cardiff · *Papa Sangre* · Oliveros · `308-orbit-choir`**). Real risks (unverified): real HRTF localization on a 4yo; whether the spatial round reads as "around me" vs. flat. **Resurrect ONLY if differentiated** — lean hard into something the lab's flat echo toys can't do: e.g. the child must TURN to "wake" a sleeping creature in each direction (make orientation *required*, not optional), so it's a spatial *hunt* and not "another echo creature." Folder at `/tmp/dream-losers/347-kids-echo-cave` this container only (ephemeral). Build-safe (client tap + Web Audio + DOM/CSS, no API route, no new deps).

---

## Banked from Cycle 325 (WIDE adult fire — 3 unrelated explorers; winner was `345-speech-melody`)

This fire went **WIDE** (alternating off cycle 324's DEEP; the jury's central complaint is monoculture and WIDE is the named anti-monoculture tool) with three UNRELATED adult axes, each clearing the ambition floor via different tags, each dodging the diversity audit's **SVG ban (≥5× in the last 10)** + the Canvas2D ban + a 3rd unrun WebGPU (verification debt) by rendering in raw-WebGL2 / three.js. Winner `345-speech-melody` shipped (type a line → its *speech* becomes music; your words light up as they sing — the most jury-#1-legibility-faithful, fully verifiable in-sandbox, cleanest diversity dodge, highest-surprise lab-first FORM). The other two were built to demoable + README by folder-isolated builders, build-clean for their own folders, moved to `/tmp/dream-losers/`, and banked here as TEXT (no half-built folders in the commit). Resurrect on a future adult cycle with a fresh number. **Renderer math when resurrecting: this fire shipped raw-WebGL2 (now warming); three.js stays WARM (321 + 337); SVG cooled; WebGPU 2× still unrun (verification debt). Lean audio-only/non-screen (jury #2) or a cooled renderer next.**

### `343-live-accompanist` — listen to a live acoustic instrument (or voice) and a generative BAND locks to your tempo + key and comps under your phrases `[queued, BUILD-CLEAN this fire — RE-FLAGGED a THIRD time: the boldest swing, but it needs a DEDICATED real-instrument verification cycle, NOT another fan-out slot]`

**The recurring lesson, stated plainly:** this concept has now been re-flagged as "the strong next-adult build" three cycles running (323 → 325) and has lost each time on the SAME axis — its entire headline ("the band locks to ME") is unauditionable in a sandbox with no live instrument, and the jury made verification debt (#5) a live priority, so I will not *ship* a headline I can't confirm. **Do not just throw it into another WIDE slate** — it will lose the same way. The unblock is a real-instrument pass: open it on a device, play a real acoustic source, confirm onset/tempo/key tracking actually reads as control vs. coincidence. Spec (built + read this fire): INPUT=**live mic** (analysis-only — never recorded/stored/transmitted/routed to speakers). `listen.ts` = half-wave-rectified **spectral-flux onset** detection (adaptive-median threshold + refractory gap, ~80 Hz–5 kHz band) → **IOI-histogram tempo** (octave-folded 60–180 BPM) + a running **beat phase** (light online PLL) + a decaying **12-bin chroma** → **Krumhansl–Schmuckler key** estimate w/ a confidence margin. `audio.ts` = a generative **Ensemble** (always-on root drone + walking bass + diatonic 7th pad + offbeat arp/comp) in the detected key/tempo via a ~25 ms lookahead scheduler (~120 ms ahead), activity-driven thin/fill, click-free `setTargetAtTime`, master ≤0.5 → procedural convolver reverb → brick-wall `DynamicsCompressor`. OUTPUT viz=**raw WebGL2** (GLSL ES 3.00) full-screen beat-ring (pulses on beats, hue = key on circle-of-fifths, rotation = tempo, 12 chroma petals, additive onset flash-sprites). `demo.ts` = an auto-demo bebop solo routed into the SAME analyser (not the speakers), so the whole pipeline demos with no mic. LEGIBLE readouts: detected **BPM**, **key**, comping **chord** by name, onset meter. **Ambition 3/5** (#2 ≥3 subsystems: listener + ensemble + WebGL2 viz + auto-demo; #3 named refs **Dan Ellis "Beat Tracking by Dynamic Programming" (2007) · Arshia Cont *Antescofo* · George Lewis *Voyager* · Krumhansl–Schmuckler**; #5 research chain). Real risks (unverified — no live instrument in sandbox): onset recall on soft/legato attacks; tempo octave-locking to half/double-time; chroma key swing on chromatic/modal material; PLL drift under rubato. Build-safe (client mic + Web Audio + raw WebGL2, no API route, no new deps).

### `344-slow-machine` — a deterministic seeded long-form generative MACHINE that genuinely transforms across ~6 minutes through six crossfaded sections, Ikeda-minimal `[queued, BUILD-CLEAN this fire — banked; reliable, fully verifiable, lower surprise]`

**Why it's strong**: commits hard to the **"different at minute 5"** menu item (true long-form with real state/memory — the lab is thin on it), is **fully verifiable** (no input — deterministic; same seed → same piece, auto-starts so it's alive at review), and leans **Ikeda-clinical** (monochrome lattice, exact pings/clicks) rather than the Anadol glowing-cloud default, with a legible section/meter/field/progress readout. **Why it lost**: lowest on surprise/ambition of the three (generative-ambient is the most well-trodden lane), and it renders in **three.js** which is now WARM (321 + 337) where the winner's raw-WebGL2 is cleaner. Spec (built + read this fire): INPUT=**none/seed** (seed text → `hashSeed` → `mulberry32`; density slider; root-key buttons; a "nudge"). `machine.ts` = a six-section ~360 s timeline (emerge 55 → build 70 → fracture 65 → suspend 55 → reform 65 → dissolve 50) that retunes a **just-intonation field over a FIXED root** (bare fifths → major → septimal "out" → hollow → warm → thinned) and drifts meter/density/register so it never returns to the opening state; **6 s crossfades** bleed colour across seams; a monotonic lookahead `runScheduler` with persistent rng/cursor; derived re-seed (`hash ^ 0x9e3779b9`) on loop so it never replays the same tape. `audio.ts` = always-on drone (detuned saws + sub) + sine pings + filtered-noise clicks + sub + sustained pad, procedural reverb, brick-wall compressor (−10 dB, 20:1), click-free. OUTPUT=**three.js** 16×16 `Points` lattice (no r3f) lit by the SAME `SchedEvent` stream (x = beat phase, y = pitch-class), per-section standing-wave warp + accent recolour; disposes geometry/material/renderer. LEGIBLE readout: section NAME + elapsed + meter + density + field + root + seed + arc bar. **Ambition 2–3/5** (#2 ≥3 subsystems: state machine + audio engine + three.js lattice; #3 named refs **Ryoji Ikeda *test pattern*/*data.matrix* · Brian Eno *Reflection*/*Music for Airports* · Robert Henke *Lumière***; [#4 long-form — single-cycle, claimed cautiously]). Real risk (unverified): whether minute 5 *perceptibly* reads as different from minute 1 (crossfades may smear the contrast); fracture density vs. the compressor; visual section-distinction on a phone. **Resurrect** on an adult cycle wanting a reliable, verifiable long-form/minimal piece (**give it a non-three.js renderer** — three.js is warm; raw-WebGL2 or audio-only). Build-safe (client-only Web Audio + three.js, no API route, no new deps).

---

## Banked from Cycle 323 (WIDE adult fire — 3 unrelated explorers; winner was `337-seismic-globe`)

This fire went **WIDE** (alternating off two DEEP cycles; the jury's central complaint is monoculture and WIDE is the named tool) with three UNRELATED adult axes, each rendering in **three.js** to dodge the diversity audit's **SVG ban (≥5×)** + the Canvas2D ban + a 3rd unrun WGSL (verification debt). Winner `337-seismic-globe` shipped (live USGS quakes → a 3-D globe + HRTF spatial JI choir — the most jury-#3-faithful + most-verifiable + highest-surprise of the three). The other two were built to demoable + README by folder-isolated builders, build-clean for their own folders, moved to `/tmp/dream-losers/`, and banked here as TEXT (no half-built folders in the commit). Resurrect on a future adult cycle with a fresh number. Born from RESEARCH §323. **Note the renderer math when resurrecting: three.js is now WARMING (321 + 337) — give these a non-three.js renderer (raw-WebGL2 is now low; audio-only/non-screen serves jury #2) unless three.js has cooled.**

### `338-live-accompanist` — listen to a live acoustic instrument (or voice) and a generative band locks to your tempo + key and comps under your phrases `[SUPERSEDED cycle 325 — rebuilt fresh as 343-live-accompanist (see the Cycle 325 bank above) and lost a THIRD time on verifiability; now needs a dedicated real-instrument pass, not another fan-out slot]`

**Question**: what if Resonance could LISTEN to you play live and a generative ensemble joined in — locking to your tempo and key, comping under your phrases — so a soloist on stage suddenly has a responsive band?

**Why it's strong (the boldest/most-ambitious of the slate)**: it's the genuine answer to Karel's standing **"jazz-responsive alternate arc"** wishlist + the **≈0× score-following / live-performance axis** (the AGENT menu calls it thin), and a responsive band is a "massively bigger" concept than a viz. **Why it lost (only)**: real-time onset/tempo/key tracking on a *live acoustic source* is the hardest-to-audition headline of the slate (its own README is honest it'll be rough on sustained/reverberant/polyphonic input — most reliable on percussive sources + the Auto-demo), and with the jury making **verification debt (#5)** a live priority, I would not ship a headline I can't confirm works. The **Auto-demo routes a synthesized solo through the SAME analyser path** the mic feeds (a clean design that de-risks the *demo*), but the live "wow" is unproven. Spec (built + read this fire): INPUT=**live mic** of an acoustic instrument/voice (analysis-only — never recorded/stored/transmitted/routed to speakers). `listen.ts` = spectral-flux **onset** detection (positive spectral difference + adaptive threshold + refractory gap) → IOI-histogram **tempo** + a running **beat phase** + a 12-bin chroma → **Krumhansl key** estimate. `audio.ts` = a generative **Ensemble** (always-on root drone + walking bass + diatonic 7th pad + arp/comp) in the detected key/tempo via a ~25 ms lookahead scheduler (~120 ms ahead), activity-driven thin/fill, click-free `setTargetAtTime`, master ≤0.5 → procedural reverb → brick-wall `DynamicsCompressor`. OUTPUT viz=**raw three.js** beat-ring (current beat pulses, hue = chord/key, rotation speed = tempo, onsets spawn flash particles). LEGIBLE readouts: detected **BPM**, **key**, comping **chord** by name, onset meter. Graceful: mic denied → `text-rose-300` + Auto-demo; no WebGL → notice + band still plays. **Ambition 3/5** (#2 ≥3 subsystems: listener + ensemble + three.js viz + auto-demo; #3 named refs **Dan Ellis "Beat Tracking by Dynamic Programming" (2007) · Arshia Cont *Antescofo* · George Lewis *Voyager***; #5 RESEARCH §323). Real risks (unverified — no live instrument in sandbox): tracking accuracy/latency on real acoustic input; whether "the band locks to ME" reads as control vs. coincidence; thin/fill responsiveness by ear. **Resurrect FIRST** next adult cycle **with a real-instrument listen** (and consider a non-three.js renderer since three.js is now warming). Build-safe (client mic + Web Audio + three.js, no API route, no new deps).

### `339-slow-machine` — a deterministic seeded long-form generative machine that genuinely transforms across ~6 minutes through six sections, Ikeda-minimal `[SUPERSEDED cycle 325 — rebuilt fresh + improved (crossfades, derived re-seed) as 344-slow-machine; see the Cycle 325 bank above]`

**Question**: what if a piece were genuinely DIFFERENT at minute 5 than at minute 1 — a long-form generative machine with memory and evolution, not a loop — that you seed and watch slowly transform, minimal and exact rather than a glowing cloud?

**Why it's strong**: it commits hard to the **"different at minute 5"** menu item (long-form generative with real state/memory — the lab is thin on true long-form), is **fully verifiable** (no input, no mic — deterministic; the same seed reproduces the same journey), and leans **Ikeda-clinical** (monochrome lattice + exact pings/clicks) rather than the Anadol glowing-cloud default, making the long-form arc *legible* via a live section/meter/field/progress readout. **Why it lost**: lowest on surprise/ambition of the three — generative-ambient is the most well-trodden lane, and a no-input piece scores lower on the interactivity bar than 337's live data or 338's live instrument. Spec (built + read this fire): INPUT=**none/seed** (seed text → `hashSeed`; density slider; root-key buttons; optional single "nudge"). `machine.ts` = `mulberry32` PRNG + a six-section ~360 s timeline (emerge → build → fracture → suspend → reform → dissolve) that retunes a JI field over a fixed root and drifts meter/density/register so it never returns to the opening state, + a monotonic lookahead scheduler emitting timed events. `audio.ts` = a precise Web-Audio voice set (pings/clicks/sine blips/sub/noise-ticks) over an always-on drone, stereo-panned, procedural reverb, brick-wall compressor, click-free. OUTPUT=**three.js** 16×16 lattice (points + grid + wireframe frame + scan line) lit by the SAME events, phase-shifting by section. LEGIBLE readout: current **section name + elapsed + meter + harmonic field**, arc progress bar. Auto-starts on load (alive at the 06:30 review). Graceful: no WebGL → `text-rose-300` + audio still plays. **Ambition 2–3/5** (#2 ≥3 subsystems: state machine + audio engine + three.js lattice; #3 named refs **Ryoji Ikeda *test pattern*/*data.matrix* · Brian Eno generative *Reflection*/*Music for Airports* · Robert Henke *Lumière*/*CBM 8032 AV***; [#4 long-form — single-cycle, claimed cautiously]). Real risk (unverified): whether minute 5 perceptibly *reads* as different from minute 1, and whether the hard section cuts feel like "slow transformation" vs. abrupt switches. **Resurrect** on an adult cycle wanting a reliable, verifiable long-form/minimal piece (give it a non-three.js renderer if three.js is still warm); deepen by softening section transitions into crossfades + a "save this seed" share. Build-safe (client-only Web Audio + three.js, no API route, no new deps).

---

## Banked from Cycle 324 (DEEP kids fire — 3 interaction-model approaches to "the lab's first REAL-TIME simultaneous two-child consonance duet"; winner was `341-kids-star-pair`)

This fire went **DEEP** (alternating off cycle 323's WIDE) on the queued §322 concept — two children co-play in real time and tune to a just-intonation consonance *by ear, between them* — explored via three distinct INTERACTION MODELS, all rendering in **raw WebGL2** to dodge the diversity audit's **SVG ban (≥5× in the last 10)** + the Canvas2D ban + three.js (warming, 321+337). Winner `341-kids-star-pair` shipped (drag-primary; the most-legible discrete beam-lock; the most verifiable + most reliably solo-demoable of the three). The other two were built to demoable + README by folder-isolated builders, build-clean for their own folders, moved to `/tmp/dream-losers/`, and banked here as TEXT (no half-built folders in the commit). Resurrect on a future kids cycle with a fresh number. All three share the same diversity-clean tags (multi-user + voice/touch INPUT · raw-WebGL2 OUTPUT · real-time consonance/beating TECHNIQUE · collaborative-kids VIBE), so the tie-break was verifiability + 4yo-playability + reward-legibility, not diversity. **Honest novelty (grep-verified):** the lab-first is real-time *simultaneous* co-play — distinct from the SOLO `272-kids-tune-purr` (one child, fixed drone) and the TURN-TAKING `334`. **Renderer math when resurrecting: raw-WebGL2 is now warming this fire — give a revival a fresh renderer (audio-only/non-screen serves jury #2) unless it's cooled.**

### `342-kids-whale-song` — two children each HUM to bend their own whale's call until the two whales lock into tune and swim together `[queued, BUILD-CLEAN this fire — RE-FLAGGED as the strong next-KIDS build: the boldest/warmest swing; pair with a real-device hum-pitch pass]`

**Question**: what if two young children, each on their own screen, could hear consonance happen BETWEEN them — by each *humming* to bend their own glowing WHALE's song until the two calls lock and the whales swim together?

**Why it's strong (the boldest of the slate)**: it's the **voice-forward / embodied** version — a child's own hum is the primary control — with the warmest, most-surprising vibe (a deep glowing ocean; pulls Karel's loved `107-ocean-presence`❤️ + `262-aurora-particle`❤️), and the silent lock reward is strong (the two whales physically glide together + a bubble stream rises + the ocean warms + ✨ banner). **Why it lost (only)**: hum-to-tune is the **least auditionable headline** of the three and the cognitively-hardest 4yo control — its own README is honest that a small child may not sustain a steady enough pitch to *drive* the lock by voice (a drag fallback that reaches the lock on its own is included, which de-risks it but isn't the headline). With the jury making **verification debt (#5)** a live priority, I shipped the more-verifiable drag-primary `341` and held this for a real-device listen. Spec (built + read this fire): INPUT=**live mic hum** (analysis-only — never recorded/stored/transmitted/routed to speakers) with a ≥64px **drag** whale fallback; `pitch.ts` = YIN-style autocorrelation (difference fn → cumulative-mean norm → first dip → parabolic interp), clarity-gated, octave-folded into a ~233–440 Hz band. `audio.ts` = always-on warm **D2** drone + two sustained whale voices (sine + faint detuned triangle through a slow lowpass for a soft vocal timbre) + a consonant lock shimmer, master → brick-wall `DynamicsCompressor` (ratio 20). `score.ts` = fold the inter-whale interval into an octave, nearest JI ratio over `[1, 6/5, 5/4, 4/3, 3/2, 5/3, 2]`, ±35¢ lock, raw `|f1−f2|` beat Hz. OUTPUT=**raw WebGL2** single full-screen fragment shader (deep ocean + caustics + two glowing whales + rising bubbles + beat-rate water shudder + warm together-glow). `sync.ts` = `BroadcastChannel("resonance-whale-song-342")` ~3 Hz pitch + presence; solo → a robot whale 🤖 drifts + pauses near consonances. **Ambition 3/5** (#1 first real-time simultaneous two-child co-play — grep-verified · #2 ≥3 subsystems: mic + JI synth + WebGL2 ocean + BroadcastChannel · #3 named refs **Helmholtz *On the Sensations of Tone* · this lab's `319-hub-score` BroadcastChannel lineage · Reggio Emilia group-synchrony/joint-attention · honest contrast w/ solo `272-kids-tune-purr`**). Real risks (unverified — no real child / second device / GPU in sandbox): whether a 4yo can drive the lock by hum at all; whether the lock reads on a *muted* device; mic-vs-speaker drone bleed. **Resurrect FIRST** next kids fire **with a real-device hum pass** (and a fresh renderer since raw-WebGL2 just warmed). Build-safe (client mic + Web Audio + WebGL2, no API route, no new deps).

### `340-kids-duet-bridge` — two children each raise/lower their END of a shared glowing ROPE (hum OR drag) until the two ends ring in tune and the rope blooms gold `[queued, BUILD-CLEAN this fire — banked; the seeded concept, clean balanced dual-input]`

**Question**: what if two kids each held one end of a glowing rope across two screens and tuned their ends into consonance — the rope wobbling at the beat rate out of tune, relaxing into a calm gold catenary sag at lock?

**Why it's strong**: this is the **literal queued §322 `335-kids-duet-bridge` concept** — a single shared object (the rope) neither child can make gold alone, the clearest Reggio "joint-attention third object," with balanced **dual input** (hum AND drag both first-class). The beat-driven rope wobble (amplitude + travel speed grow with `|f1−f2|`, vanish at lock) is a lovely "beating made visible." **Why it lost**: its lock reward (gold rope sag + sparkles) is the **least discrete/unmistakable** of the three — a continuous color/shape change on one object reads less as a single "we connected!" event than `341`'s beam physically linking two stars or `342`'s two whales joining; on the kids-legibility + verifiability axis it placed third. Spec (built + read this fire): INPUT=**hum + drag** (both first-class; mic analysis-only); `pitch.ts` autocorrelation (YIN-flavoured, RMS-gated, 120–1000 Hz). `audio.ts` = always-on **D2** drone (root+oct+fifth) + two warm voices (sine + quiet detuned triangle, lowpass) + held shimmer + lock chime, master → brick-wall `DynamicsCompressor`. `sync.ts` = `BroadcastChannel("resonance-duet-bridge-340")` ~3 Hz + the JI table `[1, 6/5, 5/4, 4/3, 3/2, 5/3, 2]` (±35¢), height↔Hz over D4→D5, `scoreInterval()`. OUTPUT=**raw WebGL2** (GLSL ES 3.00): full-screen warm bg w/ a rising gold lock-bloom + a rope triangle-strip whose vertex shader interpolates the two end heights, adds a catenary sag + a beat-rate wobble that vanishes at lock + two point-sprite handles + lock-gated rising sparkles. Solo → robot 🤖 sweeps the far end, pausing near consonances. **Ambition 3/5** (#1 first real-time simultaneous co-play · #2 ≥3 subsystems · #3 Helmholtz · `319` lineage · Reggio · honest contrast w/ solo `272`). Real risks (unverified): two-tab co-play, child-voice pitch tracking, the rope-wobble look on a GPU. **Resurrect** on a kids cycle wanting the balanced-input rope metaphor (fresh renderer if raw-WebGL2 is still warm); deepen by making the gold-lock a louder discrete event (a one-shot bloom + a held "you did it!" chord) so it competes with the beam/whale legibility. Build-safe (client mic + Web Audio + WebGL2, no API route, no new deps).

---

## Banked from Cycle 322 (DEEP kids fire — 3 interaction-model approaches to "the lab's first two-child shared-music piece"; winner was `334-kids-pass-the-song`)

This fire went **DEEP** on the one genuinely-novel jury-#3 axis — multi-user/turn-taking for kids (real-world-data + camera were already served by `293`/`295`, caught by grep before spawning) — explored via three distinct INTERACTION MODELS of "two children make one piece of music together." Winner `334-kids-pass-the-song` shipped (turn-based relay; the most legible + most-verifiable model). The other two were built to demoable + README by folder-isolated builders, build-clean for their own folders, moved to `/tmp/dream-losers/`, and banked here as TEXT (no half-built folders in the commit). Resurrect on a future kids cycle with a fresh number. All three share the same diversity-clean tags (multi-user/networked INPUT · SVG OUTPUT · BroadcastChannel TECHNIQUE · collaborative-kids VIBE — dodging the touch + Canvas2D bans), so the tie-break was taste + jury-#3 alignment + verifiability, not diversity. **The multi-user axis is now OPEN for kids — deepen it rather than returning to single-child toys.**

### `335-kids-duet-bridge` — two children co-play in REAL TIME on a shared glowing rope, tuning their two ends into just-intonation consonance BY EAR `[EXPLORED cycle 324 → the concept-family shipped as 341-kids-star-pair (star-beam interaction model); the literal rope is re-banked as 340-kids-duet-bridge above. SUPERSEDED — see the Cycle 324 bank.]`

**Question**: what if two kids each held one end of a glowing rope stretched across their two screens, and discovered — by listening to each other — the moment their two notes ring together in tune?

**The boldest / most-surprising swing of the slate** (the genuine "huh, kids can hear consonance happen between them"). A glowing rope spans both screens; each child raises/lowers THEIR end by **humming** (live pitch → end height) or **dragging a big ≥64px handle**; the two ends sound **continuously** over an always-on D drone, defining an interval. Bring the interval onto a **just-intonation consonance** (1:1, 5:4, 4:3, 3:2, 2:1; ±35¢ window) and the beating vanishes, the rope **glows gold + sparkles** ("✨ in tune! ✨"); dissonance = the rope wobbles (audible beating made visible). Each tab broadcasts its end ~3×/s over `BroadcastChannel("resonance-duet-bridge-335")`; solo → a gentle **robot friend** sweeps the far end (pausing near consonances) so a lone player can chase the gold lock. Clean `scene.tsx`/`audio.ts`/`sync.ts` split; consonance scoring; full teardown. **Why it lost (only):** its headline reward (the gold consonance-lock) is **perceptual and unauditionable in the sandbox**, and continuous hum-to-tune-against-a-partner is a cognitively harder 4yo control than 334's discrete turn-taking — so it lost on the jury's verification-debt priority (#5), NOT on concept (it's the bolder piece). **Resurrect**: ship next kids fire **with a real-device listen** (does the gold-lock read for a 4yo? is the robot sweep a believable partner? is hum-to-pitch playable by a small child?). Ambition 3/5: #1 (first real-time co-play kids) + #2 (≥3 subsystems) + #3 (319 lineage · Reggio group-synchrony · Helmholtz consonance/beating). Refs: `319-hub-score`; Reggio Emilia; Helmholtz *On the Sensations of Tone*. Folder lives at `/tmp/dream-losers/335-kids-duet-bridge` this container only (ephemeral — rebuild from this seed).

### `336-kids-echo-relay` — sing a phrase, it FLIES to a FRIEND'S tablet, their creature echoes it back + adds → a networked kid-to-kid canon `[queued, BUILD-CLEAN this fire — banked, but DIFFERENTIATE before resurrecting]`

**Question**: what if a child sang a little phrase, watched it fly across the room to a friend's tablet, and the friend's creature sang it back and added its own — building a round together?

A child sings/taps a 2–6-note phrase into their glowing creature; tap **send** and it flies off-screen as a trail of colored note-beads over `BroadcastChannel("resonance-echo-relay-336")` to the friend's tablet, where the friend's creature **sings it back** (echo) then the friend **adds** their own phrase — the canon grows across two screens (optional short delay for a true round shimmer). Solo → a robot friend echoes + adds. Voice (autocorrelation, RMS-gated, octave-collapsed to **D-Lydian** over a drone) + big-button tap fallback; `pitch.ts`/`audio.ts`/`sync.ts`/`page.tsx`; full teardown. **The genuinely-novel twist** is that the echo happens on a DIFFERENT CHILD'S screen (real antiphony), explicitly distinct from the SOLO `298-kids-echo-friend`. **Why it lost / the caution:** the *experience* rhymes hard with the lab's already-saturated echo/call-and-response kids lane (`298-kids-echo-friend`, `280-kids-echo-canyon`, `142-kids-echo-canon`, `102-kids-echo-song`, `246`/`213`/`242` drum-echoes) — weakest on the jury's "too similar" axis despite the networked novelty. **Resurrect ONLY if differentiated** — e.g. lean hard into the two-child *canon stacking* (a visible round both kids see growing in layers) so it reads as something the echo-toys can't do, not "another echo creature." Ambition 3/5: #1 (first networked kid-to-kid antiphony) + #2 + #3 (319 lineage · Reggio · Kodály/Oliveros · Chris Wilson/YIN). Folder at `/tmp/dream-losers/336-kids-echo-relay` this container only (ephemeral — rebuild from this seed).

---

## Banked from Cycle 321 (DEEP adult fire — 3 approaches to "the SECOND non-screen piece: live-voice → HRTF spatial choir, legible"; winner was `331-voice-cathedral`)

This fire went **DEEP** (alternating off two WIDE cycles) on the one concept JURY provocation #2 most wanted — the lab's second non-screen piece, in `308-orbit-choir`'s crowned HRTF lineage — explored via three distinct technical approaches to "live voice → a spatial HRTF choir you can READ" (jury #1 legibility). Winner `331-voice-cathedral` shipped (sing → JI-snapped voices accumulate into a NAMED chord orbiting your head; the most faithful #2 + #1 answer, the most robustly verifiable, and it discharges the multi-cycle-deferred standing pick). The other two were built to demoable + README by folder-isolated builders, build-clean for their own folders, moved to `/tmp/dream-losers/`, and banked here as TEXT (no half-built folders in the commit). Resurrect on a future adult cycle with a fresh number. All three share the same diversity-clean tags (voice INPUT · HRTF+SVG OUTPUT · sacred VIBE — dodging every banned tag), so the tie-break was directive alignment + verifiability, not diversity.

### `332-overtone-mirror` — hear your own voice EXPLODED into its harmonic series, each overtone a separate HRTF voice spiraled around your head `[queued, BUILD-CLEAN this fire — RE-FLAGGED as a strong next-adult build: the boldest/most-surprising swing of the slate]`

**Question**: what if you could hear the overtones hidden *inside* a single sung note — the partials that make up your timbre — pulled apart and placed around you in 3-D space, so one held tone becomes a spherical choir you can walk your ear through?

**Why it's strong (and the most surprising of the three)**: where `331` has you *assemble* a chord note-by-note, this *reveals* the harmony already living inside one tone — a mirror of your own timbre, in space. It's the genuine "huh, I didn't know we could do that" of the slate. It lost only because the effect is the hardest of the three to verify perceptually (real-time harmonic peak-picking from a live mic is finicky and the "each overtone as a separate spatial voice" read is subtle) and `331` was the more directive-faithful + robustly-demoable #2 answer. Spec (built + read this fire): INPUT=**live voice/mic** (analysis-only). TECHNIQUE=real-time **harmonic-series decomposition** — `harmonics.ts` finds f0 via normalized autocorrelation (robust to a missing fundamental), then per-harmonic peak-picks the FFT magnitude in a bin window around each integer multiple `n·f0` with parabolic interpolation; amplitudes + f0 one-pole smoothed so partials swell/fade rather than flicker. OUTPUT=**HRTF spatial audio** — a persistent bank of up to ~10 partial voices (sine osc at `n·f0`, gliding with your pitch, gain = measured partial amplitude with a floor), each on its **own** `PannerNode {HRTF, inverse}` spiraled around the listener (low harmonics near/front, high harmonics arc up/behind, gentle orbital drift); quiet root drone at f0; master → brick-wall `DynamicsCompressor` → procedural convolver reverb. VISUAL=**inline-SVG harmonic ladder** (each rung = one partial, brightness = live amplitude, horizontal offset echoes its azimuth). LEGIBLE: each rung labelled `n · note` (e.g. `1 · D3`, `2 · D4`, `3 · A4`, `5 · F♯5`) + the fundamental you're singing. Graceful: mic denied → `text-rose-300` + an **Auto-demo** that synthesizes a vowel-like voice (formant-shaped partial bank) gliding a few pitches over ~20s so the mirror is alive mic-free; iOS gesture-gated; full teardown. **Ambition 2/5** (#2 ≥3 subsystems: harmonic analyzer + per-partial HRTF voice bank + drone/compressor/reverb + SVG ladder; #3 named refs **David Hykes & the Harmonic Choir · Tuvan/Mongolian khoomei throat-singing · Pauline Oliveros *Deep Listening* · `308-orbit-choir` lineage**). Real risks (unverified — no mic/headphones in sandbox): harmonic peak-picking stability on real breathy voices; whether "your timbre exploded into space" reads as distinct partials by ear; partial-amplitude floor + smoothing tuning. **Resurrect on an adult cycle that wants the bolder swing** — pair with a real-hardware browser-verification pass (the effect lives or dies perceptually). Build-safe (client mic + Web Audio HRTF + SVG, no API route, no new deps).

### `333-antiphon` — sing a phrase and a stone cathedral answers it back as a SPATIAL CANON, copies returning from rotating HRTF positions until you've built a round alone `[queued, BUILD-CLEAN this fire — banked]`

**Question**: what if the room sang your phrase back to you — not an echo, but a canon: re-synthesized copies of what you sang, each entering on a delay and orbiting your head at its own speed, transposed into consonant harmony, layering into a round you built by yourself?

**Why it's strong**: it's the **temporal** member of the slate (the others are instantaneous) — it reads the pitch *contour over time*, segments it into named notes, and schedules a spatial canon, which is the most structurally complex of the three. It lost on verifiability + directive-faithfulness (the phrase-capture timing is the most fragile to get right unheard, and `331`'s build-a-named-chord is the more literal jury-#1 answer). Spec (built + read this fire): INPUT=**live voice/mic** (analysis-only — re-SYNTHESIZES from detected notes, never replays captured audio). `pitch.ts` = YIN detector + median tracker + a `PhraseSegmenter` (new note on >~0.7 semitone change held ~80 ms → `{degree, name, startTime, duration}`), quantized to a **D-rooted just scale** (`1, 9/8, 6/5, 5/4, 4/3, 3/2, 5/3, 15/8, 2`). OUTPUT=**HRTF spatial canon** — each captured phrase spawns several voices (`audio.ts`); voice *k* enters after a growing delay (`~k × phraseLength × 0.55`), re-synthesized as sustained additive oscillators, each on its **own** rotating `PannerNode {HRTF, inverse}` (per-voice azimuth speed/direction so the phrase *circles* you); later copies transposed up a consonant JI interval (fifth/octave/fourth/twelfth) to thicken; phrases accumulate into a round (cap ~9 voices, oldest fades); always-on D2 drone; master → brick-wall `DynamicsCompressor` → procedural convolver reverb. VISUAL=**inline-SVG** top-down ring (listener center, each voice a glowing orbiting dot brightening on each note, faint trailing arc) + the captured phrase spelled as named notes. LEGIBLE: the phrase as named notes + each voice's current note. Graceful: press-&-hold "sing a phrase" capture; mic denied → `text-rose-300` + an **Auto-demo** loading a built-in modal phrase (`D – F♯ – A – G – F♯`) that launches the full canon; iOS gesture-gated; full teardown (oscillators stopped, ctx closed, mic disconnected, timers + rAF cancelled). **Ambition 2/5** (#2 ≥3 subsystems: pitch+phrase capture + canon scheduler + per-voice HRTF engine + SVG ring; #3 named refs **Pauline Oliveros *Deep Listening* · medieval/Renaissance antiphony & canon · Alvin Lucier *I Am Sitting in a Room* · `308-orbit-choir` + `302-mirror-canon-round` lineage**). Real risks (unverified): phrase segmentation thresholds on real singing; whether the spatial canon reads as "the room answering" vs. a wash; delay/rotation tuning. **Resurrect** on an adult cycle wanting a temporal/canon piece; deepen with a tap-tempo so the round locks to a pulse, or a "conduct" mode that rotates the whole field. Build-safe (client mic + Web Audio HRTF + SVG, no API route, no new deps).

---

## Banked from Cycle 320 (WIDE adult fire — 3 non-screen explorers; winner was `330-stillness`)

This fire answered the JURY's monoculture verdict by going WIDE with three **adult, non-screen-forward** directions, each dodging every banned tag (touch · his-recording · Canvas2D · kids · Anadol-cloud). Winner `330-stillness` shipped (the 5-cycle-deferred Cage anti-instrument — SVG, the cleanest diversity dodge, fully build-verifiable). The other two were built to demoable + README by folder-isolated builders, build-clean for their own folders, moved to `/tmp/dream-losers/`, and banked here as TEXT (no half-built folders in the commit). Resurrect on a future adult cycle with a fresh number.

### `329-voice-cathedral` — sing one note and it blooms into an HRTF-spatialized overtone choir that ORBITS your head; a spatial chord you build with your voice, with the notes named `[✅ SHIPPED cycle 321 as 331-voice-cathedral — built fresh in inline-SVG (no Canvas2D fix needed) + brick-wall DynamicsCompressor added]`

**Question**: what if you could sing a single note and watch it bloom into a choir that surrounds you in 3-D space — a one-person overtone cathedral you build with your voice?

**Why it's the top next-adult pick**: it is the **most direct answer to JURY provocation #2** ("build the SECOND non-screen piece — `308-orbit-choir` found the freshest axis the lab owns and nothing followed it"), in `308`'s crowned HRTF lineage, AND it satisfies provocation #1 ("make his music **legible**, not a nebula") by printing the chord you sang by **note name** (`D · A · F♯ · C♯`). Born from RESEARCH §320 (the 2026 overtone-singing + spatial-audio wave). It lost cycle 320 ONLY because its quiet compass renders in **Canvas2D — the one renderer the jury banned this cycle** ("do not ship a 6th Canvas2D viz"); `330-stillness` (SVG) was the cleaner diversity dodge. **The fix is one file**: convert the `scene.ts` compass from Canvas2D → inline SVG (a dim top-down radar: a breathing listener dot + orbiting voice glows + faint tethers), then it clears the renderer ban and is a clean ship. Spec (built + read this fire): INPUT=**live voice/mic** (analysis-only; hand-written YIN-style pitch detector in `pitch.ts` — difference→CMND→threshold→parabolic interp + a `MedianTracker` to kill octave jumps; stability gate ~120 ms + retrigger-gap 0.6 st + 700 ms cooldown so a held breath blooms ONE voice). OUTPUT=**HRTF spatial audio** — each committed pitch snaps to a JI degree (D2 ≈ 73.42 Hz root; ratios `1, 9/8, 6/5, 5/4, 4/3, 3/2, 5/3, 15/8, 2`) and spawns a sustained additive-oscillator voice routed through a `PannerNode { panningModel:"HRTF" }` placed at a golden-angle azimuth that slowly ORBITS (`position.x/z`), capped ~9 with oldest-fades-out; an always-on JI root drone anchors it. TECHNIQUE=real-time pitch→JI-snap→spatial-voice-accumulation. VIBE=reverent/drone/sacred ("best on headphones"). LEGIBLE note-name readout + current-sung-note + voice count. Graceful: mic denied → `text-rose-300` notice + an **Auto-demo** that programmatically sings a slow rising JI arpeggio into the spatial field so the cathedral is alive mic-free; iOS gesture-gated AudioContext; full teardown. **Ambition 2/5** (#2 ≥3 subsystems: YIN pitch detector + HRTF spatial-voice engine + orbiting-compass renderer + JI-snap/accumulation state; #3 named refs **Pauline Oliveros *Deep Listening* / David Hykes Harmonic Choir / La Monte Young**). Real risks (builder's, unverified — no mic/headphones in sandbox): YIN clarity threshold + stability timings per voice/room; HRTF feel by ear; master at ~0.8 with 9 voices + drone may clip → **add a brick-wall `DynamicsCompressor`** when resurrecting (330's audio engine has the pattern to copy). **Resurrect FIRST** next adult cycle. Build-safe (client mic + Web Audio + renderer + no API route + no new deps).

### `331-palm-pulse` — a song you FEEL, not watch: the phone's vibration motor is the lead voice, driving an evolving multi-minute generative piece in your palm `[queued, BUILD-CLEAN this fire — banked; needs an Android/desktop-haptic review or a reframe (iOS Safari has NO Vibration API)]`

**Question**: what if you could feel a piece of music in your hand instead of watching it — a song for the palm, where the phone's vibration motor is the instrument and the screen barely matters?

**Why it's banked (not shipped)**: the boldest non-screen swing (JURY provocation #2 names "haptic-only" explicitly) and a genuine lab-first FORM — `navigator.vibrate` as the **lead voice**, not secondary feedback. It lost cycle 320 on a hard reviewability problem, not on concept: **iOS Safari has no Web Vibration API**, so at the 06:30 phone review on an iPhone the haptic *headline never fires* — only the on-screen-pulse + audio fallback runs (and desktop Chrome exposes `vibrate` but it's usually a motorless no-op). It needs either (a) an explicit Android/desktop-with-haptics review, or (b) a reframe where the audio/visual carries equal weight so it's meaningful everywhere. Spec (built + read this fire): OUTPUT (lead)=**Vibration API** patterns (downbeat thump / accent / tick / phrase rumble) scheduled over a generative timeline; OUTPUT (bed)=calm JI Web-Audio drone + bells aligned to accents; `timeline.ts`=a **6-section evolving state machine** (meter 4/3/7/5, tempo, density, phrase length drift over ~6.3 min via a seeded mulberry32 PRNG + monotonic lookahead cursor) so it's different at minute 3 than minute 0; near-dark Canvas2D breathing dot synced to each event + legible section/meter/phrase/elapsed readout. TECHNIQUE=lookahead-scheduler-driven cross-modal (haptic) sonification. VIBE=embodied/intimate/clinical. Graceful: `"vibrate" in navigator` detection → amber "haptics unsupported, showing visual+audio pulse" path; iOS gesture-gated AudioContext (also the vibration-unlock gesture); full teardown (`vibrate(0)`). **Ambition 2–3/5** (#1 first haptic-LEAD piece — honest, since prior vibration is secondary-only; #2 ≥3 subsystems: haptic scheduler + generative timeline + audio bed; #3 named refs **David Eagleman / Neosensory · "Music: Not Impossible" haptic suits · Oliveros**). **Renderer note on resurrect**: its dot is Canvas2D — swap to SVG if Canvas2D is still banned. Build-safe (client-only, no API route, no new deps).

### `326-stillness` → SHIPPED this fire as `330-stillness`
The Cage *4′33″* silence-inversion anti-instrument — flagged as the top next-adult build for FIVE straight cycles (315→319) and the subject of a standing open question to Karel — **finally shipped in cycle 320** as `330-stillness` (route `/dream/330-stillness`). INPUT=mic level INVERTED with RMS hysteresis (`QUIET=0.045`/`NOISE=0.12`) + press-&-hold + breathing auto-demo. OUTPUT=inline SVG bloom/mote room. JI drone over E2. The 5-cycle deferral is resolved.

---

## Banked from Cycle 319 (WIDE adult fire — 3 explorers; winner was `327-physarum-choir`)

Built to demoable + README by parallel folder-isolated builders, then moved to `/tmp/dream-losers/` per the WIDE-curation rule (only the winner is committed). Both are **adult**, build-clean as delivered (tsc+eslint clean for their folders), non-C-major-pentatonic, render in **SVG** (dodging the Canvas2D/three.js renderer constraints), and clear the ambition floor at 2/5. Born from RESEARCH §317 (re-validated this fire). Resurrect on a future adult cycle with a fresh number. **`326-stillness` is re-flagged as the top next-adult build** — it has now been the standing flagged adult pick for FIVE cycles (315→316→317→318→319) and keeps getting deferred for the bigger systems piece; that deferral is itself a meta-rut. **Recommend Karel force-schedule it** (see STATE §319 open questions).

### `326-stillness` — an anti-instrument that sings only when you are QUIET: sustained mic-silence blooms a drone + an SVG light field; any loud sound collapses it; longest stillness persists across sessions `[queued, BUILD-CLEAN this fire — RE-FLAGGED as the top next-adult build]`

**Question**: what if the instrument rewarded silence and attention instead of noise — a room that blooms in your stillness and scatters at the first sound you make?

**Why it's the flagged pick (and why it lost this fire)**: it remains the **most direct answer to the jury's standing "too similar / no-fail-noodle" critique** — it doesn't swap a sensor, it *inverts the entire reactive paradigm*. It lost to `327-physarum-choir` ONLY on the ambition floor (2/5 vs 3/5) and the research-first chain (this fire's §319 dive was about physarum, so 327 was the direct today's-research→today's-build; stillness came from §317's bank). It is the cleaner anti-similarity break (327 rhymes with the just-shipped `323` on WebGPU+his-piano+systems) and is fully build-verifiable (no GPU blind spot), so it is the disciplined next ship. Spec (built fresh this fire, verified): INPUT=**microphone level INVERTED** with RMS hysteresis (the two named consts at the top of `page.tsx`: `QUIET=0.045` / `NOISE=0.12`; below QUIET the room blooms, a rising edge above NOISE startles + scatters + resets the streak) + a **press-&-hold touch fallback** that fully substitutes (mic-free) + a hands-free **breathing auto-demo** so it's alive on load. OUTPUT=**inline SVG** additive light-bloom — radial-gradient core+halo under an `feGaussianBlur`/`feMerge` glow filter, ~46 drifting motes, in a dark one-point-perspective wireframe room (NOT Canvas2D, NOT three.js). TECHNIQUE=inverted silence-detection + cross-session `localStorage` **longest-stillness-streak** persistence + a live input meter that shows the QUIET/NOISE markers. VIBE=contemplative/critical. Just-intonation drone over a low **E2** (ratios `1, 2, 6/5, 4/3, 3/2, 8/5`), staggered partial bloom + opening lowpass + procedural convolver reverb, master ≤0.5 → brick-wall compressor, click-free `setTargetAtTime` glides; provenance badges emerald "Listening 🎤" / amber "Touch mode ✋" / "Auto-demo (breathing)". Full teardown (mic tracks stopped, ctx closed). **Ambition 2/5** (#2 four subsystems: inverted silence detector + E2 drone engine + SVG bloom/mote renderer + streak persistence; #3 named refs **Cage *4′33″* / Pauline Oliveros *Deep Listening* / Éliane Radigue**). Only real risk: RMS calibration vs a noisy review room (the press-&-hold fallback covers it); the SVG blur over ~46 motes is unprofiled on low-end GPUs. **Resurrect FIRST** next adult cycle. Build-safe (client mic + Web Audio + SVG + localStorage, no API route, no new deps).

### `328-seismic-choir` — the live planet sung as a spatial choir: every earthquake in the last day becomes a sustained HRTF-placed voice around your head; the chord IS Earth's current seismic state `[queued, build-clean]`

**Question**: what if you could HEAR the living planet — every earthquake recorded on Earth in the last day becoming a sustained voice placed in 3D space around you, so the ever-shifting chord you hear is the seismic state of the world right now?

**Why it's strong (and why it lost)**: discharges the jury's standing **#3 (real-world-data sonification — "exactly one entry")** with a fresh data source + a spatial twist. It lost on ambition (2/5 vs 327's 3/5) and the research-first chain (it didn't come from this fire's physarum dive); HRTF (`308-orbit-choir`) and data-sonification (`314-solar-wind`) both already exist, so it's a *fusion* not a lab-first. Spec (built this fire, verified): INPUT=**live USGS Earthquakes GeoJSON feed** (`earthquake.usgs.gov/.../summary/{2.5_day,all_day,all_hour}.geojson`, public, no key, CORS-open — fetched from the browser, one-tap feed switch, polled every 60s; new quakes fade in, aged-out fade away). OUTPUT=**spatial audio primary** (HRTF `PannerNode` per quake: azimuth←longitude, elevation←latitude, distance/loudness←magnitude) + a minimal **inline-SVG** equirectangular world map (pulsing dot per sounding quake, depth→hue) + a "loudest voices right now" list. TECHNIQUE=real-time external-API sonification → an evolving just-intonation chord (ratios `1,9/8,6/5,4/3,3/2,5/3,15/8,2` over **C2**, magnitude→register, depth→lowpass timbre, top ~16 by magnitude, slow attack/fade), master 0.45 → procedural reverb → brick-wall limiter, `StereoPanner` fallback when HRTF is absent. VIBE=cosmic/contemplative/systems. Refs: **Florian Dombois *Auditory Seismology*** + **Pauline Oliveros *Deep Listening***; data courtesy USGS. Graceful: blocked/offline feed → amber notice + 8 bundled globe-spanning sample quakes so it still surrounds you; empty window → one-tap switch to the all-day feed; auto-starts the sample set so it's hands-free. **Ambition 2/5** (#2 four subsystems: feed poll/normalize + HRTF spatial engine + JI voice synth + SVG globe; #3 named refs). **Resurrect**: ship on an adult cycle that wants the *systems/real-world* vibe; deepen with depth→elevation, a rotating globe you can orient, or a "replay the last 24h sped-up" time machine. Build-safe (client fetch + Web Audio HRTF + SVG, no API route — USGS is CORS-open — no new deps).

---

## Banked from Cycle 318 (DEEP kids fire — 3 approaches to ONE concept: the lab's first long-form, REMEMBERED kids journey; winner was `325-kids-paper-boat`)

Built to demoable + README by parallel folder-isolated builders, then moved to `/tmp/dream-losers/` per the DEEP-curation rule (only the winner is committed). Both are **kids (4+)**, build-clean as delivered, non-C-major-pentatonic, SVG (dodge the Canvas2D/three.js renderer constraints), and clear the ambition floor (≥3-subsystems + named-ref + long-form). Born from RESEARCH §318. Resurrect with a fresh number. All three share the same big concept — a 6–12 min dusk→dawn journey through a **D-rooted modal arc** (D Dorian → F Lydian → C Mixolydian → D major home) that **remembers your path and sings it back on arrival**, persisted to localStorage — and differ only in the **interaction model**.

### `326-kids-sing-home` — HUM/SING a lost little star home through dusk→dawn; sustained voice = forward travel, pitch = which sky-lane, and the journey sings your remembered path back `[queued, build-clean — resurrect once VOICE cools (~2 kids cycles out)]`

**Question**: what if a 4-year-old could *sing* a glowing lost star all the way home on a long, evolving, remembered journey — voice as the engine of travel?

**Spec** (DEEP-sibling, cycle 318): INPUT = **voice/mic** (hum-to-travel). `voice.ts` = analysis-only mic — smoothed RMS (loudness → forward drive, quiet = the star rests) + **autocorrelation pitch** (Chris Wilson / YIN family, 2048 buffer, parabolic interp) octave-collapsed so a high or low child voice both work; pitch → `pitchToLane` (which sky-lane to fly through the star-gates). Mic is **never recorded/stored/transmitted; tracks stopped on unmount**. OUTPUT = **inline SVG** (sky gradient per act, the star companion with a glowing "sing!" mouth-meter that opens with loudness — no reading required, faint background stars, a warm little house as "home" that brightens as you approach, gate rings, flown-path trail). `audio.ts` (`SingEngine`) = always-on retuning pad, D-rooted modal `ACTS` (Dorian→Lydian→Mixolydian→Ionian), scale-quantized gate chimes, replay notes + lullaby, master 0.5 → brick-wall `DynamicsCompressor`, code-synthesized convolver reverb; owns/closes its own AudioContext. `memory.ts` = wall-clock localStorage (progress + gate path + timestamp) + resume hint. Graceful: mic denied/unavailable → readable `text-rose-300` notice + a **full TOUCH fallback** (drag the big star up/down to choose lane, hold to travel) + a hands-free **auto-demo** (a gentle breathing hum that sings up and down) so it is always demoable; emerald "Listening 🎤" vs amber "Touch mode ✋" provenance. Full teardown (rAF cancel, mic stop, audio dispose, ctx close). **Ambition 3/5**: ≥3-subsystems(#2 — voice analyser + SVG journey + SingEngine arc + memory/persistence) + named-ref(#3 — Campbell monomyth + Resonance journey engine + 2026 generative game-music + Kodály/Curwen vocalization) + multi-cycle/long-form(#4). **Why it didn't win** (vs `325-kids-paper-boat`): the decisive **anti-similarity** gate — it's **voice + SVG + dusk**, which rhymes hard with the just-shipped `322-kids-voice-garden` (also voice + SVG + dusk + persistence); shipping it would be two sing-into-the-mic dusk-SVG kids pieces in a row, exactly the jury's "too similar" trap. It is the most technically ambitious + most pedagogically rich sibling — **resurrect once voice has cooled** (it serves KIDS.md's explicit vocalization goal). **To deepen**: a duet (two voices = two travelers); pitch-match challenges at gates (sing the gate's note to open it brighter); seasons over multi-day wall-clock age. Build-safe (client mic + Web Audio + SVG + localStorage, no API route, no new deps).

### `324-kids-firefly-journey` — TAP the night sky to drift a glowing firefly home through dusk→dawn; the simplest possible journey control, with lingering-deepens-harmony `[queued, build-clean — strong, ready to ship]`

**Question**: what if the long-form remembered journey used the simplest control a 4-year-old can grasp — *tap where you want it to go*?

**Spec** (DEEP-sibling, cycle 318): INPUT = **touch (tap-to-drift)** — tap anywhere and the firefly glides there with an ease-out velocity clamp; **lingering** in a region deepens the harmony (more voices fade in via `setDepth`), drifting onward thins it. OUTPUT = **inline SVG**, full-screen immersive (`h-dvh`, `xMidYMid slice`): a sky gradient that recolors across 7 scenes, a pre-built 90-star field that twinkles, pulsing waypoint glows the firefly chimes on reaching (each respawns ahead so the path keeps flowing), a faint trail of remembered lights, the firefly itself, and a home beacon near the horizon that brightens toward the end. `journey.ts` = D-rooted 7-scene **Dorian→Lydian→Mixolydian→Ionian** progression + scene crossfade helpers + scale quantization + `STORAGE_KEY`/`SavedState`. `audio.ts` (`JourneyAudio`) = master 0.5 → brick-wall `DynamicsCompressor`, synthesized convolver reverb, always-on pad, lingering-driven harmonic depth, chimes, an immediate tap-blip (<50ms feedback every tap), scene chord glides. On arrival the firefly **sings the journey back**, each remembered waypoint pitch **re-quantized into the resolved HOME mode** so the journey *resolves* when recounted; localStorage resume + gentle sky-aging by real elapsed hours; full teardown. **Ambition 3/5**: ≥3-subsystems(#2 — tap-drift+lingering tracker + SVG scene world + JourneyAudio arc + memory/persistence) + named-ref(#3 — Campbell monomyth + Resonance journey engine + 2026 generative game-music) + multi-cycle/long-form(#4). **Why it didn't win** (vs `325`): it's a beautiful, dead-simple control, but the firefly drifts within a **single square sky** — progress is an abstract recolor rather than visible *travel*, where 325's auto-scroll + 3-layer parallax reads instantly as "a long river voyage" (the stronger embodiment of the "massively bigger journey"). **Resurrect**: ship as the next kids journey (the simplest control is its own virtue for the youngest users); or fold its lingering-deepens-harmony idea into a 325 deepening. Build-safe (client touch + Web Audio + SVG + localStorage, no API route, no new deps).

### `327-physarum-choir` (adult) — place tones as "food" and a living slime-mold network autonomously routes between them; the chord you hear IS which sources are currently connected — the slime composes the connections `[✅ SHIPPED cycle 319 as /dream/327-physarum-choir — note: ambition #1 (never-used technique) did NOT hold; physarum already exists at 260-kids-slime-garden, so it shipped at 3/5 via #2+#3+#5, with the WebGPU-compute renderer + connectivity→harmony mapping as the honest novelty]`

**Question**: what if you didn't play notes but planted *attractors*, and a living **Physarum (slime-mold) agent network** decided — over seconds — which ones to connect, the harmony emerging from the topology it grows?

**Spec** (adult; research seed, NOT yet built): INPUT = touch/click to place "food" nodes (each a tone in a JI/modal set) + adjust a couple of agent params. **TECHNIQUE = Physarum agent trail-field simulation** (Jeff Jones / Sage Jenson model: millions of agents that deposit a trail chemical, sense it ahead-left/ahead-right, and turn toward the strongest — producing the characteristic self-organizing vein networks that connect sources and prune dead ends) — **never used in the lab** (our generative growth has only been L-system / space-colonization / banked differential-growth; verify by grep at build time). OUTPUT must be a **GPU/compute trail-field** (ping-pong textures): **WebGPU compute** is now the proven path (`323-latent-condensation` shipped raw WebGPU) and dodges the Canvas2D-4× ban + the three.js cluster. SOUND = a sustained voice per food node, its gain/brightness rising as the network *connects* it to the trunk (path-completion = harmonic consonance); the evolving chord = the live connectivity graph. Refs: **Andrew Adamatzky, *Physarum* sound-synthesis / biocomputing** (arXiv 1212.1203) + **Sage Jenson (mxsage) Physarum** + **Simulacra Naturae** (arXiv 2509.02924, 2025 agent-ecosystem + spatial audio). **Ambition (projected) 3/5**: never-used-technique(#1 — Physarum) + ≥3-subsystems(#2 — agent sim + connectivity→harmony engine + WebGPU renderer + interaction) + recent-research(#5 — RESEARCH §318). Why deferred this fire: too abstract for a 4yo (this was a kids cycle), and the renderer it needs (GPU trail-field) was off-axis for the kids brief. **A strong future ADULT #1-clearing build** — Karel's "massively bigger," a fresh systems/emergent piece in his loved `236-particle-life-song`❤️/`130-tsl-particle-compute`❤️ lineage.

---

## Banked from Cycle 317 (WIDE adult fire — 3 explorers; winner was `323-latent-condensation`)

Built to demoable + README by parallel folder-isolated builders, then moved to `/tmp/dream-losers/` per the WIDE-curation rule (only the winner is committed). Both are **adult**, build-verified (tsc+eslint clean for their folders), non-C-major-pentatonic, and clear the ambition floor. Born from RESEARCH §317. Resurrect on a future adult cycle with a fresh number. **`324-stillness` is re-flagged as the next adult build — it remains the boldest answer to the jury's "too similar" critique (it *inverts* the reactive paradigm).**

### `324-stillness` — an anti-instrument that sings only when you are QUIET: sustained mic-silence blooms a drone + an SVG light field; any loud sound collapses it; longest stillness persists across sessions `[queued, build-verified — FLAGGED as the next adult build]`

**Question**: what if the instrument rewarded silence and attention instead of noise — a room that blooms in your stillness and scatters at the first sound you make?

**Why it's the flagged pick**: the **most direct answer to the jury's standing "too similar / no-fail-noodle" critique** — it doesn't swap a sensor, it *inverts the entire reactive paradigm* (below-threshold mic RMS → bloom grows; a rising edge above the noise threshold → startle collapse + scatter + lowpass-down + reset). A genuine conceptual/critical piece (Cage *4'33"* / Pauline Oliveros *Deep Listening* / Éliane Radigue), a shelf the lab is thin on. INPUT=microphone level **INVERTED** (+ press-&-hold touch fallback that fully substitutes, mic-free) · OUTPUT=**inline SVG** additive light-bloom (radial-gradient core+halo, `feGaussianBlur`/`feMerge` glow, drifting motes) in a dark one-point-perspective wireframe room — NOT Canvas2D, NOT three.js · TECHNIQUE=silence-detection inverted interaction with RMS hysteresis + cross-session `localStorage` longest-streak persistence · VIBE=contemplative/critical. Just-intonation drone over a low **E2** (ratios `1, 2, 6/5, 4/3, 3/2, 8/5`), NOT C-pentatonic; blooming lowpass + procedural convolver reverb + master ≤0.5 → brick-wall compressor. **This fire** rebuilt it fresh in SVG (cycle 315 had banked a three.js version; SVG dodges the live Canvas2D/three.js renderer bans). Ambition **2/5** (#2 four subsystems: inverted silence detector + drone engine + SVG bloom/mote renderer + persistence; #3 named refs). Tuning constants `QUIET=0.045` / `NOISE=0.12` are the top two consts in `page.tsx` — only real risk is RMS calibration vs a noisy review room (the press-&-hold fallback covers it). Full teardown (mic tracks stopped, ctx closed). **Resurrect first** next adult cycle. Build-safe (client mic + Web Audio + SVG + localStorage, no API route, no new deps).

### `325-seismic-choir` — the live planet sung as a spatial choir: every earthquake in the last day becomes a sustained HRTF-placed voice around your head; the chord IS Earth's current seismic state `[queued, build-verified]`

**Question**: what if you could HEAR the living planet — every earthquake recorded on Earth in the last day becoming a sustained voice placed in 3D space around you, so the ever-shifting chord you hear is the seismic state of the world right now?

**Why it's strong**: discharges the jury's standing **#3 (real-world-data sonification — "exactly one entry")** with a fresh data source and a spatial twist. INPUT=**live USGS Earthquakes GeoJSON feed** (`earthquake.usgs.gov/.../summary/{all_hour,2.5_day,all_day}.geojson`, public, no key, CORS-open — fetched directly from the browser, polled every 60s) · OUTPUT=**spatial audio primary** (HRTF `PannerNode` per quake: azimuth←longitude, elevation←latitude, distance/loudness←magnitude) + a minimal **inline-SVG** equirectangular world map (pulsing dot per sounding quake, depth→hue) + a "loudest voices right now" list · TECHNIQUE=real-time external-API sonification → an evolving just-intonation chord (ratios `1,9/8,6/5,4/3,3/2,5/3,15/8,2` over **C2**, magnitude→register, depth→lowpass timbre, slow attack/fade as quakes enter/age out), top ~16 by magnitude, master 0.42 → procedural reverb → brick-wall limiter · VIBE=cosmic/contemplative/systems. Refs: **Florian Dombois *Auditory Seismology*** + **Pauline Oliveros *Deep Listening***; data courtesy USGS. Graceful: blocked/offline feed → amber notice + 8 bundled globe-spanning sample quakes so it still surrounds you; empty window → one-tap switch to the all-day feed. **Honest note**: HRTF (`308-orbit-choir`) and data-sonification (`314-solar-wind`) both already exist in the lab, so this is a *fusion* rather than a lab-first — it lost to 323 on ambition (2/5 vs 3/5) and on diversity (323's WebGPU is a fresher renderer than another SVG/HRTF piece). Ambition **2/5** (#2 four subsystems: feed poll/normalize + HRTF spatial engine + JI voice synth + SVG globe; #3 named refs). **Resurrect**: ship on an adult cycle that wants the *systems/real-world* vibe; deepen with depth→elevation, a rotating globe you can orient, or a "replay the last 24h sped-up" time machine. Build-safe (client fetch + Web Audio HRTF + SVG, no API route — USGS is CORS-open — no new deps).

---

## Banked from Cycle 316 (DEEP kids fire — 2 approaches to a long-form voice-grown garden; winner was `322-kids-voice-garden`)

Built to demoable + README by a parallel folder-isolated builder, then moved to `/tmp/dream-losers/` per the DEEP-curation rule (only the winner is committed). Born from RESEARCH §316 (generative growth algorithms as the body of a long-form piece). Resurrect with a fresh number. It uses a **never-used-in-the-lab** technique (differential growth) and clears the ambition floor — it lost only on the **renderer-diversity** axis this cycle.

### `323-kids-coral-bloom` — grow a glowing bioluminescent reef with your VOICE via differential growth; it ages with real wall-clock time and journeys harmonically `[queued, build-verified — resurrect once three.js cools, or as an adult piece]`

**Question**: what if a 4-year-old could grow a living underwater coral/kelp reef with their voice — sing/hum and a self-avoiding organism spreads and *folds* into coral through the dark, singing as it grows — and it keeps its real age, so it's a bigger, differently-tuned reef every visit?

**Spec** (DEEP-sibling, cycle 316; build-verified by its builder — `npx tsc --noEmit` exit 0 + `npx eslint` 0 problems on the folder; did NOT run the full `npm run build`): the **differential-growth** sibling. `growth.ts` holds a `Reef` = a closed ring of connected nodes; each `step(energy, biasAngle)` applies (a) neighbor attraction (springs along the ring), (b) **short-range self-avoidance repulsion from ALL nearby nodes via an O(n) spatial bucket grid** (cells sized to repel radius, 3×3 neighborhood test — no O(n²) blow-up), and (c) a steerable outward growth bias; **node insertion** at a stretched pair's midpoint (probability scaled by voice energy) lengthens the ring so it *buckles into organic brain-coral folds*. Hard-capped at 1500 nodes (graceful at cap). INPUT = voice (RMS loudness → growth speed/brightness; autocorrelation pitch → bias steering + hue teal→violet + chord tone). OUTPUT = **three.js** — additive-blended bright core `LineLoop` + soft halo `LineLoop` + glowing `Points` tips in a dark `FogExp2` volume with drifting plankton, no postprocessing; pre-allocated GPU buffers (over-allocated 1.3×). Scale = **D Lydian** over a low D drone (NOT C-pentatonic). Persistence = serialize quantized node positions + `bornAt`/`savedAt` to localStorage every 5s + on unmount; on reopen, **age forward** (1 offline step/min away, capped 60) so a reef left overnight is bigger this morning; HUD shows real age ("3h old", "2d old") + "Color N/5". Harmonic journey advances ~every 40s. Safe-sounds chain (master 0.5 → brick-wall `DynamicsCompressor`), synthesized convolver reverb, ~13-min lullaby drift. Graceful: mic denied → `text-rose-300` + full touch fallback (tap/drag the water; vertical = pitch) + auto-demo; no WebGL → `text-rose-300` notice; emerald/amber provenance. Full teardown incl. three.js dispose + `forceContextLoss()`. **Ambition 3/5**: never-used-technique(#1 — first differential growth in the lab, verified by grep) + ≥3-subsystems(#2 — voice + diff-growth sim + three.js scene + audio + persistence) + multi-cycle/long-form(#4). Ref: **differential line growth / Anders Hoff *inconvergent*** + **Jason Webb *morphogenesis-resources***. **Why it didn't win** (vs `322-kids-voice-garden`): renderer diversity — three.js was already 3× in the last 10 ships (311/320/321, the *emerging* monoculture), so shipping it would push three.js to 4× and seed exactly the cluster the jury keeps flagging; 322's **SVG** is the freshest committed renderer and the cleaner break. Also: 322 self-ran the full `npm run build` (passed) where 323 ran only tsc+eslint, and the builder honestly flagged a benign ring-wrap node-insertion edge case (no crash, slightly uneven insertion near index 0 — harden alongside the branching-fronds deepening). **To resurrect/deepen**: ship on an adult cycle (the deep-sea glow reads beautifully for adults too) or a kids cycle once three.js cools; harden the ring-wrap insertion; then the README's deepening — multiple reefs/a tank you scroll, branching fronds (child chains for kelp verticality), per-frond timbre (a self-playing ensemble), two-voice duet (inter-reef negotiation), tides/day-night by real clock. Build-safe (client mic + Web Audio + three.js + localStorage, no API route, no new deps; `three` already present).

---

## Banked from Cycle 315 (WIDE adult fire — 3 explorers; winner was `321-spectral-flight`)

Built to demoable + README by parallel folder-isolated builders, then moved to `/tmp/dream-losers/` per the WIDE-curation rule (only the winner is committed). Both are **adult**, render in **three.js** (dodging the cycle-315 Canvas2D-at-4× ban), are non-C-major-pentatonic, and clear the ambition floor. Born from RESEARCH §315. Resurrect on a future adult cycle with a fresh number. **`323-stillness` is flagged as the next adult build — it's the boldest answer to the jury's "too similar" critique (it *inverts* the reactive form).**

### `322-strange-attractor` — a chaotic system that is BOTH the sound and the picture: a Lorenz attractor synthesized at audio rate in a custom AudioWorklet, its trajectory the waveform you hear and the glowing 3D sculpture you see `[queued, build-verified]`

**Question**: what if you could *hear* a strange attractor — the same trajectory that draws the famous butterfly is the waveform — and steer it from periodic into chaos with your hands?

**Why it's strong**: on Karel's *explicit* wishlist ("a strange-attractor visualization", AGENT.md priorities). The "sound IS the picture" identity is elegant and surprising. INPUT=touch/drag + sliders (parameter-space steering) · OUTPUT=three.js phase-space ribbon · TECHNIQUE=audio-rate chaotic synthesis in a custom `AudioWorkletProcessor` (Lorenz, RK4, DC-block + tanh soft-clip + brick-wall limiter for safety) · VIBE=mathematical/clinical-sublime. Refs: **Lorenz (1963)**, **Chua's circuit**, the chaotic-synthesis lineage (Spasov; *Musical Attractors*). **Honest ambition note**: AudioWorklet is NOT new to the lab (`34-spectral-morph`, `23-pitch-harmonize` already use it), so claim #1 downgrades to "first audio-rate strange-attractor synth voice"; the floor is still cleared at **2–3/5** (≥3 subsystems + named ref). Build (worklet via Blob URL, fallback main-thread integrator → oscillator) verified clean. **Resurrect**: it's complete and ship-ready as-is — a strong pick for an adult cycle that wants a fresh *mathematical/clinical* vibe (the lab leans warm/immersive).

### `323-stillness` — an anti-instrument that sings only when you are QUIET: sustained mic-silence blooms a drone + a three.js light field; any loud sound collapses it; longest stillness persists across sessions `[queued, build-verified — FLAGGED as the next adult build]`

**Question**: what if the instrument rewarded silence and attention instead of noise — a room that blooms in your stillness and scatters at the first sound you make?

**Why it's the flagged pick**: it is the **most direct answer to the jury's standing "too similar / no-fail-noodle" critique** — it doesn't swap a sensor, it *inverts the entire reactive paradigm* (below-threshold mic RMS → bloom; a clap/word edge-triggers a lowpass-down collapse + reset). A genuine conceptual/critical piece, a shelf the lab is thin on. INPUT=microphone level INVERTED (+ press-&-hold touch fallback, mic-free) · OUTPUT=three.js additive light-bloom in a dark wireframe room · TECHNIQUE=silence-detection inverted interaction + cross-session `localStorage` persistence · VIBE=contemplative/critical/Cage–Oliveros–Radigue. Just-intonation over low E (Aeolian/Phrygian, NOT C-pentatonic). Ambition **2/5** (4 subsystems + named refs). Build verified clean, full teardown (mic tracks stopped, ctx closed, three.js disposed). **Resurrect first** next adult cycle; only tuning risk is the RMS thresholds (`QUIET=0.045`, `NOISE=0.12`) vs a noisy review environment — isolated constants at the top of `page.tsx`.

---

## Banked from Cycle 314 (WIDE kids fire — 3 explorers; winner was `320-kids-light-loom`)

Built to demoable + README by parallel folder-isolated builders, then moved to `/tmp/dream-losers/` per the WIDE-curation rule (only the winner is committed). Resurrect on a future kids cycle with a fresh number. Born from RESEARCH §314. Both dodge the cycle-314 Canvas2D-at-4× ban (both render in **SVG**), are non-C-major-pentatonic, and break the no-fail-noodle form (one via persistence/evolution, one via a kind pitch-match consequence).

### `321-kids-seed-garden` — a long-form musical garden that grows + sings + PERSISTS with real wall-clock age while you're away `[queued, build-verified — strong DEEP/long-form promotion candidate]`

**Question**: what if a child planted a musical garden that keeps growing and singing WHILE THEY'RE AWAY — so it's a different, fuller garden every time they come back?

**Spec** (WIDE-sibling, cycle 314; build-verified by its builder, ~5.66 kB): the lab's **"persists and grows" answer** to the standing JURY #2 kids provocation, and the closest thing to a long-form/stateful kids piece. Tap the dark soil → plant a glowing seed; an **L-system recursive plant** (stem forks ±25° to depth 5, length ×0.72/level, glowing bloom at each terminal) grows over wall-clock seconds, each branch-tip singing a soft Karplus-Strong pluck as it reaches. **The ambition centerpiece = wall-clock persistence + self-seeding**: every plant is saved to `localStorage` with a millisecond `seedTime`; on reopen the app recomputes `growthElapsed = min((now−seedTime)/1000, maxGrowth)` so a plant seeded last night is full-grown this morning, and any plant alive ≥120s self-seeds a child nearby (inheriting pitch ±1 step, with its own catch-up), capped at 14 with graceful oldest-retire — so the garden genuinely spreads and drifts across sessions. **Output = inline SVG** matte cut-paper (dusk-gradient sky, stars, plants as `<line>`/`<circle>`/`<ellipse>` with `feGaussianBlur`/`feMerge` glow, per-frame ref-mutated attributes — NOT Canvas2D, NOT WebGL). Scale = **G Lydian (G A B C# D E F#)**, the raised-4th sparkle, NOT C-pentatonic. Always-on G2+D3 drone + synthesized convolver reverb + `DynamicsCompressor` safety chain; AudioContext deferred to the first gesture; no-localStorage → in-memory 4-plant starter garden; no Web Audio → grows silently. Subsystems (4): L-system grower · wall-clock persistence/self-seeding state machine · SVG glow renderer · KS pluck engine + drone + reverb/limiter. Ref: **Lindenmayer systems (Aristid Lindenmayer, 1968)** + *The Algorithmic Beauty of Plants* (Prusinkiewicz & Lindenmayer, 1990). **Why it didn't win** (vs `320-kids-light-loom`): L-system already exists in the lab (INDEX line 880, "first fractal/L-system prototype") so it rests on ambition #2+#4 = 2/5, where 320 cleared #1 (never-used technique) at 3/5; 320 also brought a NEW sound (the bowed string) where the garden re-treads plucked KS + persistence (311-music-box already owns kids persistence). **To resurrect/deepen**: this is the natural **DEEP/long-form** piece — promote it to a multi-cycle build where the garden evolves harmonically over the session (a slow chord journey, not just spread), wind/weather modulates growth, and a returning child hears a "what bloomed overnight" recap. **Ambition 2/5**: ≥3-subsystems(#2 — four) + multi-cycle/long-form(#4). Build-safe (client SVG + Web Audio + localStorage, no API route, no new deps).

### `322-kids-sing-up` — sing higher and a paper bird climbs the sky; hold a steady pitch to land on a cloud `[queued, build-verified — freshest INPUT modality]`

**Question**: what if a 4-year-old's own VOICE were the controller — sing higher and a little creature climbs the sky; hold a steady pitch and it floats and lands?

**Spec** (WIDE-sibling, cycle 314; build-verified by its builder): the **voice/vocalization** explorer — the freshest INPUT modality of the fire (the lab hasn't pointed mic-pitch at kids since `280-kids-echo-canyon`). A dusk SVG sky with 6 cloud "stepping stones"; **sing/hum → detected pitch maps to a target height**, the paper bird rises to match; **hold a steady pitch ~0.3s → the bird lands on the nearest cloud**, which lights and rings its note (a kind "you reached it!" consequence — never wrong, only higher/lower; stop singing → it gently drifts down). Pitch detection = RMS-gated **autocorrelation (YIN-family, parabolic-interpolation refined, Chris Wilson's method)** on a 2048-sample time-domain buffer every ~80ms, octave-collapsed into D3–D5, EMA-smoothed (α=0.15) so a wobbly toddler voice still feels in control; **mic is analysis-only — never played back, recorded, stored, or transmitted**, tracks stopped on unmount. **Output = inline SVG** cut-paper (dusk sky + moon + stars, glowing clouds via `feDropShadow`/`feGaussianBlur`, animated paper bird, a live pitch ribbon on the right edge; per-frame ref mutation, no whole-tree re-render — NOT Canvas2D). Scale = **D-major hexachord (D E F# G A B)** ascending, NOT C-pentatonic. Bell tones + always-on D4+A4 drone + synthesized reverb + brick-wall limiter (master ≤0.48). Graceful: mic denied → `text-rose-300` + a full **touch fallback** (drag the sky / tap a cloud to move the bird) + a hands-free auto-demo climb on load; provenance emerald "Listening 🎤" vs amber "Touch mode." Subsystems (4): autocorrelation pitch detector · climb game state machine (pitch→height, inertia, landing-detect, drift-back) · SVG scene with live pitch ribbon · bell/drone engine + reverb/limiter. Refs: **Kodály method & Curwen–Glover solfège hand-signs** (pitch-as-height pedagogy) + **YIN (de Cheveigné & Kawahara, 2002)** + Chris Wilson PitchDetect. **Why it didn't win** (vs `320`): pitch-detection already exists in the lab (158/186/280…) so it rests on #2+#3 = 2/5 vs 320's #1-clearing 3/5; and pitch-climb is a known game genre where the bowed string is a genuinely new instrument. **To resurrect**: ship next kids cycle for the vocalization goal — or deepen into the child's rising voice *composing* a remembered melody (collect the landed clouds → replay "your song" at the top). **Ambition 2/5**: ≥3-subsystems(#2 — four) + named-reference(#3). Build-safe (client mic + Web Audio + SVG, no API route, no new deps).

---

## Banked from Cycle 313 (DEEP adult fire — 2 approaches to the serverless shared room; winner was `319-hub-score`)

Built to demoable + README, build-verified by its builder (full `npm run build` clean), then moved to `/tmp/dream-losers/` per the DEEP-curation rule (only the winner is committed). Resurrect on a future adult cycle with a fresh number. Born from RESEARCH §313 (serverless multiplayer browser instruments; The Hub / League lineage).

### `318-ensemble-room` — every browser tab is a player in one serverless, tempo-locked STEP-SEQUENCER ensemble; the room is a 3D orbital constellation `[queued, build-verified — ship any cycle]`

**Question**: what if every open browser tab were a *rhythmic* player in ONE shared, server-less, tempo-locked ensemble — and the music you hear is the SUM of the room, visualized as a constellation of orbiting players?

**Spec** (DEEP-sibling, cycle 313; build-verified `○ Static` 6.35 kB): the rhythmic counterpart to the shipped `319-hub-score`. Each tab joins `BroadcastChannel("resonance-ensemble-318")` (protocol `hello`/`welcome`/`pattern`/`heartbeat`/`leave`, live roster, ~5s prune) and edits its OWN looping **16×8 D-Dorian step pattern** (a piano-roll grid, tap to toggle, broadcasts immediately). The shared grid is derived **purely from `Date.now()`** via a pure `barStepAt(epochMs)` (96 BPM, 16 sixteenths) so every same-origin tab computes the same step at the same instant — zero drift, the wall clock is the conductor. A ~25ms **Chris-Wilson "Two Clocks" lookahead scheduler** plays this tab's own part AND every peer's latest pattern on six distinct voices (bell/pluck/marimba/glass/soft-reed/low-pad, per-id octave + hue) over an always-on D+A drone through a master `DynamicsCompressor` limiter (per-player gain auto-ducks as the room grows). **Output = three.js / react-three-fiber 3D constellation** (`scene.tsx`): each player a glowing body orbiting a shared center at its own radius/hue, a wall-clock playhead ring sweeping the bar, a fire-ripple + brighten on each note, a "this is you" highlight ring, faint concentric guide rings, **drei/postprocessing Bloom**. Subsystems (5): BroadcastChannel sync+roster · wall-clock shared grid + lookahead scheduler · six-voice Web Audio synth engine · three.js constellation · editable step-sequencer. Refs: **The League of Automatic Music Composers (1978)** + **The Hub (Bischoff/Perkis, 1980s)** + **Chris Wilson, "A Tale of Two Clocks."** Degrades: 1–2 seeded ghost players so a lone tab already hears an ensemble; no BroadcastChannel → amber + solo; no WebGL → rose notice, audio plays on. **Why it didn't win** (vs `319-hub-score`): it leans on **three.js + Bloom glow** (the exact glow/shader cluster the JURY keeps flagging; three.js was just used by 311) where 319's no-glow Canvas2D score dodges it cleaner; and 319's **conductor-baton** is a deeper multi-user idea than parallel sequencers. **Ambition 3/5**: never-used-technique(#1 — first networked/multi-instance, same lab-first as 319) + ≥3-subsystems(#2 — five) + named-reference(#3). **To resurrect/deepen**: assign a fresh number; the obvious next step is **true WebRTC across machines** (data channels + tiny signaling + leader-elected epoch + per-peer latency compensation) → the lab's first cross-DEVICE shared room (needs an API route + the `guard` + a Karel nod on signaling infra); also per-note velocity/octave editing, pattern-length negotiation, and a "drop into the room" join animation. Deps already present (`three`/`@react-three/fiber`/`@react-three/drei`/`@react-three/postprocessing`). Build-safe (pure client BroadcastChannel + Web Audio + three.js, no API route).

---

## SEEDED — to build first

### 0. dashboard — turn /dream/ into a live single-bookmark dashboard `[queued, do FIRST]`

**Question**: when Karel opens one URL on his phone at 06:30, what's the
absolute best single-page experience?

**Spec**:
- Enhance `src/app/dream/page.tsx` (currently a static prototype list)
  into a real dashboard that reads three files at request time:
  - `docs/dreams/MORNING.md` — rendered as the top hero section
    ("This morning's digest")
  - `docs/dreams/STATE.md` — parse the latest 3-5 cycle entries and
    show them as a "Recent activity" stream (cycle number, UTC
    timestamp, one-line summary)
  - `docs/dreams/INDEX.md` OR the existing PROTOTYPES constant — list
    of prototypes with status badges, click-through to play
- Use Next.js server component + `fs/promises` to read the files at
  build time (Vercel rebuilds on every push, so each cycle's changes
  flow in automatically). Wrap with `export const dynamic = 'force-static'`
  for fast loads.
- Render MORNING.md and the STATE.md slices via a tiny markdown→jsx
  converter (no external deps — just handle headings, bullets, links,
  and code spans). Resist installing `react-markdown` for this; we
  want the dream zone dependency-free.
- Layout: dashboard top (hero MORNING + recent activity), prototypes
  middle, footer with links to (GitHub branch, Claude Code routines
  page at claude.ai/code/routines, this dream's README).
- Phone-first responsive. Dark theme already in place via dream layout.

**Why this first**: Karel wants ONE bookmark on his phone home screen
that surfaces everything. Right now he has to triangulate between
GitHub, Claude Code app, and the preview URL. This consolidates them.
It's also a perfect "agent's first autonomous task" — meaningful work
that proves the loop functions before launching into more speculative
prototypes.

**Acceptance**:
- Open `/dream/` on a phone-sized viewport — MORNING.md content visible
  immediately above the fold, no scrolling required to see "what's new"
- Recent cycles section shows actual cycle data from STATE.md (not
  placeholder text)
- Prototype list still works (clickable, status badges)
- Local `next build` succeeds, type-check clean

### 1. live — mic-input audio-reactive viz `[in-progress]`

**Question**: what if Resonance could respond to anything you play, live?

**Spec**:
- Route: `/dream/1-live`
- "Start mic" button → `getUserMedia({ audio: true })` → Web Audio AnalyserNode
- Split FFT into 6 bands: sub-bass (20-60Hz), bass (60-250), low-mid (250-500), mid (500-2k), high-mid (2k-4k), high (4k-20k)
- Map energy per band to color/intensity using:
  - sub-bass → deep violet/indigo (cool, heavy)
  - bass → cyan/teal (cool, fluid)
  - low-mid → green (transitional)
  - mid → yellow (warming)
  - high-mid → orange (warm, sharp)
  - high → red/magenta (hottest, finest detail)
- Canvas viz: full-screen, six radial color fields blooming from center, each band controlling one. Smooth interpolation (exponential moving average per band) so it breathes, not flickers.
- Onset detector → trigger a brief white flash for percussive hits
- Tempo estimate → BPM display in corner
- Sensitivity slider (live performance needs tunable mic gain)
- Latency target: <50ms input-to-screen

**Why this first**: it's the most-discoverable prototype (anyone with a mic can play), demonstrates the band→color mapping that informs all other prototypes, and proves the live-input pipeline works.

### 2. ghost-lab — A/B Ghost LoRA testing `[queued]`

**Question**: can we iterate the Ghost LoRA faster by comparing variants side-by-side?

**Spec**:
- Route: `/dream/2-ghost-lab`
- UI: prompt textarea, LoRA scale slider (0.5–1.5), seed input, "Generate A vs B" button
- Generates two images via `/api/ai-image/generate` with different scales OR different prompts
- Side-by-side display with vote buttons (👍 A, 👍 B, both, neither)
- Stores votes to localStorage to build intuition for what scales work for what scenes
- Pre-set "scenes" dropdown: "stone chamber back-view", "forest dawn full-body", "cosmic flying profile" — quick way to test the LoRA on key Ghost compositions without rewriting prompts
- Admin-only (reuses existing `isAdmin` gate)

**Why**: the LoRA tuning right now is "play Ghost, watch, guess what's wrong, change a number." This makes it deliberate.

### 3. fluid — Navier-Stokes fluid driven by audio `[queued]`

**Question**: what if the visualizer felt like ink in water reacting to sound?

**Spec**:
- Route: `/dream/3-fluid`
- GPU fluid simulation (port a small open-source shader-based solver — e.g. Pavel Dobryakov's WebGL fluid sim or a leaner variant)
- Mic input (reuse `/dream/1-live`'s analyser hook from `_shared/`)
- Audio mapping:
  - Bass energy → pressure pulses at center
  - Treble energy → curl/turbulence forces
  - Spectral centroid → injection color (low pitch = blue, high pitch = red)
  - Onset → splat at random position
- Touch/mouse stir as fallback when no mic
- Toggle: "react to mic" / "ambient drift"

**Why**: pure GPU, very different aesthetic from existing Resonance shaders, performs well on lower-end devices, captivating to interact with.

### 4. operator — Tauri-mode operator panel mock `[demoable]`

**Question**: what does running Resonance from a venue's booth look like?

**Spec**:
- Route: `/dream/4-operator`
- Two-pane UI: left = "performer view" (large viz preview + scene list), right = "operator controls" (scene picker, MIDI map, transition timer, fader for mic-input gain, BPM tap)
- Scene library: 6 pre-baked scenes (each is one of the dream prototypes or a Resonance journey snapshot), pickable, transitions with crossfade
- MIDI input (Web MIDI API): when a MIDI device is connected, show "MIDI: <device name>" and let user assign CC knobs to scene-blend fader / scene-trigger pads
- BPM tap button (spacebar) → drives any scene's pulse params
- Crowd-noise meter (mic input) — visual indicator only for now; later could trigger climax cues

**Why**: live performance is the highest-impact future for Resonance. Even a mock helps you (Karel) think through what controls a performer needs.

### 5. arcs — Journey engine v2 (non-psychedelic arcs) `[demoable]`

**Question**: what if journeys could have shapes other than the 6-phase psychedelic arc?

**Spec**:
- Route: `/dream/5-arcs`
- Arc picker: "Psychedelic (current)" / "EDM Build-and-Drop" / "Cinematic Three-Act" / "Ritual / Ceremony" / "Sleep Cycle"
- Each arc is its own phase definition (count, duration weights, shader rotation rules, post-fx curves, ambient layers)
- Audio source: looped sample (provide a short audio file in `public/dream/` per arc that matches the arc's shape, or use mic input)
- Visual demo of how each arc unfolds: timeline at bottom, phase chips light up, color/shader changes mid-arc
- Side panel: "what's different about this arc": text comparing it to the psychedelic baseline

**Why**: forces an explicit articulation of what "a Resonance journey" actually IS structurally, opens the door to non-introspective use cases (dance music, soundtracks, ambient sleep, ritual ceremonies).

---

## QUEUED — agent may pick up after seeded set

### strange — strange attractor viz `[demoable]`
Lorenz attractor in 3D with real-time FM synthesis driven by xyz coordinates. Shipped as `/dream/10-strange` (Cycle 10). Mic mode modulates σ live. See README for polish ideas: σ/ρ/β sliders, non-chaotic regime exploration, loop into fluid sim.

### tessellate — Penrose / Truchet tile rhythm `[demoable]`
Shipped as `/dream/12-tessellate` (Cycle 12). 40×28 Truchet grid, mass flip on onset,
bass drizzle, two-color complement, Path2D batched rendering, ellipse() for non-square tiles.
See README for polish ideas: spatial frequency split, progressive resolution, inverted mode.

### terrain — fly-through spectrogram `[queued]`
Last 60s of FFT history is a 3D terrain. Camera flies forward through it. Bass = mountain height, treble = surface detail. Like Audiosurf for any audio.

### typography — generative kinetic type `[queued]`
Live poetry from existing Resonance poetry system → animated 3D type that breaks/forms with music. Variable font weight modulated by amplitude.

### reaction-diffusion — Turing patterns alive `[queued]`
Gray-Scott RD simulation. Audio drives feed/kill rates. Patterns evolve like coral/leopard spots/stripes. Hypnotic.

### audience — multi-phone collective viz `[queued]`
WebRTC channel: multiple phones in a venue each contribute one color/shape, server (or peer mesh) composites into one shared visualizer. Tech-heavy; might require backend work outside the dream zone — flag for design discussion first.

---

## FROM RESEARCH (Cycle 4, 2026-05-18) — promoted to queue

### compose — AI journey soundtrack generator `[queued]`
Route: `/dream/6-compose`. User types a mood/scene ("forest dawn ceremony, 70 BPM, ceremonial drums, reverbed piano"). ACE-Step on fal.ai generates a 30-second musical sketch ($0.006). Plays back through the fluid/live visualizer automatically. "Create your journey soundtrack." Could become the prototype for Resonance's "compose mode."  
Full research notes: RESEARCH.md §2.

### spatial — binaural HRTF spatial audio mixer `[queued]`
Route: `/dream/7-spatial`. Import any audio file or use mic. Split into 6 frequency bands via AnalyserNode. Place each band at a point on a 3D sphere using HRTF PannerNodes. Visualize sphere with glowing colored dots. User drags dots to reposition. With headphones, music surrounds you in 3D space. No deps — all Web Audio API. Live performance: immersive room-filling feel from one laptop.  
Full research notes: RESEARCH.md §5.

### particle-life — WebGPU flocking driven by audio `[queued]`
Route: `/dream/8-particle-life`. 6 species mapped to 6 frequency bands. Attraction/repulsion matrix gives emergent flocking/orbit/predator behavior. Audio energy controls particle "temperature" (velocity injection). Onset reshuffles the matrix → new emergent pattern emerges. Requires WebGPU (2026: 70% browser coverage). Completely alien aesthetic.  
Full research notes: RESEARCH.md §§4, 8.

### ghost-sound — add soundscape to Ghost images `[queued]`
Route: `/dream/9-ghost-sound`. Extend ghost-lab: after generating a Ghost image, pipe it through MMAudio V2 on fal.ai ($0.001/s) with an auto-generated prompt ("ethereal wind, stone chamber reverb, single piano note sustain"). Returns a 10s video with synchronized ambient soundscape. Ghost images that *breathe*. Admin-only. Budget: ~$0.01/generation.  
Full research notes: RESEARCH.md §3.

---

---

## FROM RESEARCH (Cycle 13, 2026-05-18) — promoted to queue

### piano-canvas — your improvisation as a painting `[demoable — /dream/13-piano-canvas, Cycle 14]`
Route: `/dream/13-piano-canvas`. Mic input → pitch detection via AnalyserNode autocorrelation.
Each detected note leaves a brush stroke on the canvas: pitch → hue (C=red rotating through
spectrum), velocity → stroke weight (0–8px), duration → stroke length. Strokes accumulate across
the session; the canvas persists as a visual record of what you played. Dark background; the
painting glows with each new note. "Your improvisation becomes a painting."

Fallback (no mic / no pitched notes): demo mode plays 3-octave ascending piano scale with slow
random improv, leaving example strokes. Canvas saves as PNG (download button).

No external deps. Full Web Audio API — `OscillatorNode` for pitch detection signal, `AnalyserNode`
for autocorrelation. Zero-crossings method: reliable for piano/voice (monophonic), degrades
gracefully for chords (picks the dominant pitch).

Why this now: none of the 12 existing prototypes treat the musical session as a *persistent visual
artifact*. This is the first "record of a journey" rather than a real-time reaction. Also the most
intimate — it rewards careful, deliberate playing. Full research notes: RESEARCH.md §10 (Art2Mus
inspired the image↔music axis; this is the reverse direction: your music → your image).

### reference-compose — style-match a piano phrase into a full track `[queued, needs FAL_KEY]`
Route: `/dream/14-reference-compose`. Record 4–8 bars of piano via mic → encode as WAV blob →
send as reference audio to MiniMax Music 2.5 on fal.ai ($0.035/track) alongside a text prompt
("extend this phrase into a 30-second atmospheric piece"). Get back a full track that sounds like
an extension of the user's playing. Play through fluid/live-bloom visualizer automatically.

"Your phrase, extended." This is the compose prototype upgraded: instead of typing a mood, you
play one. The output track is in the same harmonic/rhythmic universe as your input. Needs FAL_KEY
+ Karel budget approval. Full research notes: RESEARCH.md §12.

### ghost-animate — Ghost images → cinematic video with native audio `[queued, needs FAL_KEY]`
Route: (extend `/dream/2-ghost-lab`). After generating a Ghost LoRA image, pass it through
Seedance 2.0 on fal.ai (image + atmospheric text → 5–10s cinematic video with native audio).
The still Ghost image becomes a living, moving scene. Option: also pipe through Foley Control
for environmental soundscape layer. Admin-only. Budget estimate: $0.05–0.15/clip. Full research
notes: RESEARCH.md §§13, 15.

### webgpu-fluid — upgrade 3-fluid to WebGPU render pipelines `[demoable — /dream/15-webgpu-fluid, Cycle 16]`
Shipped as `/dream/15-webgpu-fluid`. 512×512 rgba16float render pipeline approach (not compute
shaders — fragment shader ping-pong, simpler to implement and equally fast at this resolution).
Same audio mapping as 3-fluid. WebGPU required; clear fallback. See README for polish ideas:
vorticity confinement, curl-noise turbulence, resolution toggle based on GPU tier detection.

---

## RESEARCH BIN — agent appends here from research cycles

See RESEARCH.md for full dated entries with sources.

Key findings from Cycle 4 (2026-05-18):
- ACE-Step music generation on fal.ai ($0.0002/s) — text → coherent music in 20s
- MMAudio V2 ($0.001/s) — video + text → synchronized ambient audio
- WebGPU at 70% browser coverage — compute shaders without extension flags, 1M+ particles
- HRTF binaural PannerNode spatial audio — no-dep 3D sound placement in browsers
- Strange attractor synthesizer pattern — attractor xyz coords drive FM modulation
- Gray-Scott RD implementations in WebGL — no audio version found, opportunity exists
- Network bending for diffusion models — audio-reactive content generation (not just color)

Key findings from Cycle 13 (2026-05-18):
- WebGPU confirmed in ALL major desktop browsers (Chrome, Firefox, Safari 26, Edge) as of Nov 2025
- Art2Mus (arxiv Feb 2026) — direct image→music via CLIP + AudioLDM 2, no text intermediate
- BRAVE (arxiv Mar 2026) — 10ms latency neural audio timbre transfer, approaching browser-ready
- MiniMax Music 2.5 ($0.035/track) — reference audio style matching, better than ACE-Step for style-match
- Foley Control (fal.ai) — video → synchronized sound effects; extends ghost-sound options
- Patchies (patchies.app) — browser-based code+visual patcher, inspiration for modular Resonance surface
- Seedance 2.0 / Kling 4K — cinematic video with native audio from reference images

---

## FROM RESEARCH (Cycle 18, 2026-05-18) — promoted to queue

### acoustic-trail — 3D spectral coordinate space trail `[queued]`
Route: `/dream/17-acoustic-trail`. Mic input (or demo oscillators) → extract three audio features
per frame: **spectral centroid** (brightness), **spectral bandwidth** (richness/noisiness), and
**pitch** (autocorrelation, same algorithm as `13-piano-canvas`). Map to [X, Y, Z] in a 3D
coordinate space. Plot a glowing point trail: each frame leaves a small particle at the current
[centroid, bandwidth, pitch] position. Color = frequency energy gradient (same mapping as `1-live`).
Mouse drag rotates the space. The trail accumulates over the session — the shape of the cloud IS the
acoustic fingerprint of the performance.

Rendering: WebGPU point cloud. Points stored in a circular buffer (e.g., 8000 points), drawn via
instanced point rendering. Fade oldest points toward transparent. Grid lines on the XZ floor plane
(spectral centroid × pitch axes) for spatial reference. Background dark; glowing particles additive.

What makes this different from every other prototype: it maps audio to its *own* natural coordinate
system rather than using audio as a trigger for abstract visuals. A single clean pitch traces a
vertical column; a piano chord with rich harmonics spreads wide on the bandwidth axis; a bass note
pulls the trail toward the low-pitch low-centroid corner. The trajectory IS the music, not a
reaction to it.

Zero external deps (WebGPU + Web Audio). Demo mode: same wandering multi-oscillator signal used in
`11-terrain` and `13-piano-canvas`. One-cycle build. Inspired by SoundPlot (arxiv 2601.12752).

### elevenlabs-compose — structured AI journey music, streaming `[queued, needs API key + budget]`
Route: `/dream/18-elevenlabs-compose`. User writes a journey arc as plain-language section
descriptions: e.g. "sparse piano intro (20 seconds). slow cello build, add low drone (30 seconds).
full orchestral peak with percussion (15 seconds). long fade to silence (20 seconds)." Sends to
ElevenLabs Music API with section-level control. Music streams back at 44.1kHz; plays in real-time
through the fluid or live-bloom visualizer as it arrives.

This is the `5-arcs` prototype realized with *real generated music* instead of demo oscillators.
The user doesn't just see the arc — they hear a unique 85-second musical piece shaped to their
spec, generated once, played through the existing AV system. First prototype where the music itself
is AI-authored from a structured arc description.

Needs ElevenLabs API key + Karel budget approval ($0.80/min → ~$0.40/generation for 30s, ~$1.13
for 85s). More expensive than MiniMax ($0.035/flat) but streaming + section control is a different
capability — streaming means the visualizer can react to music that is still being generated.

### ghost-animate `[queued, updated — use HappyHorse-1.0, beats Seedance 2.0]`
Route: extend `/dream/2-ghost-lab`. Updated plan (Cycle 23): Ghost LoRA image + atmospheric prompt →
HappyHorse-1.0 API (fal.ai) → 5-8s 1080p cinematic video with native audio in single forward pass.
HappyHorse debuted April 26, 2026 and immediately topped Seedance 2.0 on benchmarks. No separate
MMAudio V2 or audio post-processing step. Backup: Google Veo 3.1 (image-to-video + audio, $0.40/sec,
can chain to ~2.5 min). Admin-only. Budget ~$0.05-0.30/clip depending on model. See RESEARCH.md §§22, 23.

### granular — granular synthesis cloud `[demoable — /dream/18-granular, Cycle 20]`
Route: `/dream/18-granular`. Shipped. Mic or demo oscillators → Web Audio analyser
time-domain buffer → grain extraction + Hann window → AudioBufferSourceNode with detune/pan.
Scatter plot visual: X = buffer position, Y = pitch shift, color = buffer age. Live sliders for
density, pitch range, grain size, scatter. See README for polish ideas: freeze mode, pitch envelope,
density automation from amplitude.

Key findings from Cycle 18 (2026-05-18):
- Three.js WebGPU + TSL production-ready across all browsers (r171+, 2026 baseline)
- SoundPlot (Jan 2026) — 3D acoustic feature space visualization (centroid/bandwidth/pitch axes)
- ElevenLabs Music API — streaming + section-level composition ($0.80/min), custom finetunes
- Seedance 2.0 native audio confirmed — one-step Ghost image → cinematic video with sound
- ReaLchords — online adaptive chord accompaniment from melody (web demo exists, no public API yet)
- ACM IMX 2025 — MIR + LLM + image gen pipeline for semantic music visualization

---

## FROM RESEARCH (Cycle 23, 2026-05-18) — promoted to queue

### three-mesh-av — audio-reactive 3D deforming mesh via Three.js R3F `[queued]`
Route: `/dream/21-three-mesh-av`. An `IcosahedronGeometry` (or torus knot) whose vertices displace
based on frequency band energies using Three.js TSL node materials. The displacement shader samples
a 6-band FFT uniform per frame; bass frequencies push outward from the equator, treble from the poles,
creating an organic breathing form. `@react-three/fiber`, `three@0.182`, and `@react-three/drei` are
all already installed in Resonance — zero new dependencies. Additive point-light tracks the current
spectral centroid position on the mesh surface. Demo mode: same LFO oscillators as other prototypes
(no permissions). Mic mode: live FFT mesh deformation. Post-processing: bloom from
`@react-three/postprocessing` (already installed). Dark background, glowing mesh.

Why now: none of the 20 existing prototypes use Three.js 3D geometry. This is the only remaining
visual paradigm space not covered: animated parametric 3D mesh. TSL means no raw WGSL — the shader
compiles to either WGSL (WebGPU) or GLSL (WebGL) depending on the browser, so full compatibility.
The bioluminescent/organic aesthetic is qualitatively different from particles, fluid, or canvas.
See RESEARCH.md §25.

### code-score — minimal browser music DSL with canvas visualization `[queued]`
Route: `/dream/22-code-score`. A textarea score editor on the left, a live canvas painting on the
right. Score syntax: `C4 Q` (C4 quarter note), `E4 H` (E4 half note), `rest Q` (quarter rest),
`[C4 E4 G4] H` (chord). Parser converts note names to frequencies (using standard A4=440Hz tuning),
durations to seconds (based on a BPM slider), schedules OscillatorNodes with Hann-windowed GainNode
envelopes. Simultaneously paints strokes on a canvas identical to `13-piano-canvas` (same brush
stroke logic). "Write a melody — watch it paint itself — hear it play."

Demo loads a short Bach fragment (BWV 772, 8 bars). Zero external deps (Web Audio + textarea).
Resonance angle: what if your session started with a written score? Or ended with the score as
an artifact? This is the reverse of `13-piano-canvas` — instead of playing → painting, you write →
both play and paint. See RESEARCH.md §26.

### pitch-harmonize — real-time harmonic doubling via AudioWorklet phase vocoder `[queued]`
Route: `/dream/23-pitch-harmonize`. Mic input → AudioWorklet phase vocoder (inline WASM-free
implementation, based on the `phaze` approach: overlap-add, 4× overlap, Hann window, phase locking)
→ pitch-shifted copy (+7 semitones = perfect fifth, or +12 = octave, or -12 = sub-octave, selectable)
→ HRTF PannerNode: dry signal center, shifted copy at a user-adjustable 3D position. You play piano;
the harmony floats above/beside you in 3D space. Visual: dual vectorscope (from `20-scope`) — dry
signal as warm orange trail, harmonized copy as cool blue trail, overlapping on the same canvas.
"Become your own accompanist."

AudioWorklet can be written as an inline string (no separate .js file needed in Next.js — use
`createObjectURL(new Blob([workerStr]))`). Zero npm deps. See RESEARCH.md §27.

Key findings from Cycle 23 (2026-05-18):
- HappyHorse-1.0 (Alibaba, April 2026) — #1 ranked joint audio-video model, single-pass 1080p. Upgrades ghost-animate plan.
- Google Veo 3.1 — 4K video + native audio on fal.ai, $0.40/sec with audio, video extension to ~2.5 min
- Latent Granular Resynthesis (arxiv 2507.19202) — training-free timbre transfer via neural codec
- Three.js TSL + R3F bioluminescent 3D mesh — active community, Three.js already in Resonance (0.182)
- ÆTHRA music DSL (Feb 2026) — browser-native equivalent: `code-score` prototype
- Phase vocoder AudioWorklet (`phaze`) — real-time pitch shift in browser, zero deps
- GAPT/ReaLchords — adversarial post-training improvement, still no public API; monitor

---

## FROM RESEARCH (Cycle 27, 2026-05-19) — promoted to queue

### piano-roll — live scrolling piano roll from mic `[queued]`
Route: `/dream/24-piano-roll`. Mic input → autocorrelation pitch detection (same algorithm as
`13-piano-canvas`) → note events → Canvas2D scrolling piano roll. Each detected note renders as
a colored horizontal rectangle: pitch = vertical MIDI position (C2=bottom, C6=top), duration =
bar width (scrolls left at constant speed), color = frequency→hue same as `1-live` and
`13-piano-canvas`. Additive blending + `shadowBlur` glow on each note bar.

Scroll speed tied to a BPM slider (default 60 BPM). Grid lines for C notes (octave markers).
Demo mode: plays the same Bach fragment from `22-code-score` silently via OscillatorNodes and
detects its own notes for an immediate visual. "What you played, as notation — in real time."

Why this now: the 23 existing prototypes visualize audio as abstract art (fluid, particles,
terrain) or playful geometry (cymatics, tessellate). This is the first that renders recognizable
musical notation from live input. A pianist will immediately understand it. Natural triptych with
`13-piano-canvas` (abstract painting) and `22-code-score` (written score): three representations
of the same musical event. Zero deps. Research basis: WaveRoll (RESEARCH.md §32), score-following
trend (§31).

### cellular — Conway cellular automaton composer `[queued]`
Route: `/dream/25-cellular`. A 64 × 16 Conway Game of Life grid. Each column maps to a musical
pitch (C2 left → C5 right, log-spaced across 3 octaves). On each Life generation tick, all
living cells in column X trigger a note at pitch X with a short triangle-wave envelope. Result:
emergent melodies from simple rules — gliders create repeating 4-note loops, oscillators make
rhythmic patterns, R-pentomino chaos evolves unpredictably.

Tick rate = BPM slider (40–120 BPM). Canvas: each live cell = a glowing dot (additive blending);
columns with active notes flash briefly brighter. Note burst particles per column on trigger.
User interactions: click/drag to toggle cells; preset buttons: Glider, Pulsar, Acorn, R-pentomino.
"Reset" to random fill (20% density). "What if generative music was also life?"

Why this now: none of the 23 existing prototypes treats music as *autonomous* — all either react
to mic input or generate via API. A cellular automaton "acts first"; the user shapes initial
conditions and watches the music write itself. Completely different aesthetic and interaction
paradigm. Surprise factor: high. Research basis: CLAVIER-36 (RESEARCH.md §33).

### score-follow — live score cursor that follows your playing `[queued]`
Route: `/dream/26-score-follow`. Displays the `22-code-score` Bach fragment as a static scrolling
piano roll (same grid as `24-piano-roll`). As the user plays piano via mic, autocorrelation pitch
detection runs at 30Hz. Each detected note is matched to the nearest upcoming score note (tolerance
= ±1 semitone). Matched notes illuminate green; a cursor bar advances through the score on each
match. Missed notes stay dim. Tempo is derived from match cadence (EMA of inter-match intervals).

The canvas shows two layers: score notes (outlined, grey-green), detected notes (filled, hue-colored
same as `13-piano-canvas`). The cursor moves forward when you match, pauses when you miss, snaps
back slightly on repeated misses (forgiveness mode). "The score lights up as you play it."

Alternative score: user can paste their own `22-code-score` DSL text and follow it. Demo mode:
auto-plays the score and self-detects — score cursor advances perfectly through the whole piece.
Zero deps (no ML — pure autocorrelation + symbol matching). One-cycle build. Research basis: score
following papers (RESEARCH.md §31).

### gpu-additive — GPU particle swarm IS the synthesizer `[queued, complex]`
Route: `/dream/27-gpu-additive`. Extends `16-particle-life-gpu`. Each of 9,000 particles is
assigned a harmonic partial index (1–450 per species × 6 species). Consonance forces: particles
whose harmonic ratios are simple (2:1, 3:2, 4:3) attract weakly; dissonant ratios repel. The
6×6 species interaction matrix becomes a "timbre matrix." Each frame: compute shader runs physics,
then a secondary pass reads particle Y-amplitudes (= partial amplitudes) into a mapped buffer.
An AudioWorkletProcessor reads the buffer and enqueues synthesized audio samples.

Audio output IS the swarm state. Emergent clusters = consonant harmonics → pure tones. Scattered
distributions = inharmonic → noisy textures. Reshuffles → timbre discontinuities. Mic input
injects velocity turbulence per species (same as `16-particle-life-gpu`). "The swarm is the
synthesizer."

Requires WebGPU. Technically the most ambitious idea in the queue — GPU compute shader must write
audio-rate data (44,100 samples/sec). The JolifantoBambla technique (RESEARCH.md §36) proves this
is feasible. May require 2 build cycles. Research basis: WebGPU additive synthesis (§36).

Key findings from Cycle 27 (2026-05-19):
- Score following is browser-feasible (arxiv 2505.05078) — autocorrelation + symbol matching, 174ms latency
- CLAVIER-36 (Sep 2025) — browser cellular automaton music env; inspires `cellular` prototype
- Kling 3.0 (fal.ai Feb 2026) — multi-shot storyboarding + native audio; enables Ghost journey arc sequences
- Real-Time AI Accompaniment (arxiv 2604.07612) — latent diffusion + consistency distillation at 5.4× speedup
- WaveRoll (arxiv Nov 2025) — browser piano roll JS library; confirms `piano-roll` is feasible
- WASM AudioWorklet — Rust→WASM DSP is 2026 standard; needs pre-built binary for dream zone
- WebGPU additive synthesis — compute shaders can write audio samples; enables `gpu-additive`
- GAPT/ReaLchords — still no public API; continue monitoring

---

## FROM RESEARCH (Cycle 31, 2026-05-19) — promoted to queue

### chord-canvas — real-time chord name + color timeline `[queued]`
Route: `/dream/28-chord-canvas`. Mic input → 2048-sample FFT → 12-bin chroma vector (sum FFT
magnitude by semitone class across all octaves) → template-match against 24 major/minor chord
templates (dot-product correlation) → detect root + quality. Display: chord name in large
monospace type at top center (e.g. "F♯m", "C", "Bdim"). Canvas2D timeline strip scrolls left;
each chord block is a colored rectangle: hue from root note (same `freqToHue`-style wheel as
`1-live`, but mapped to 12 pitch classes instead of frequency), saturation from quality
(major=vivid, minor=desaturated, dominant 7th=warm orange, diminished=cool grey). Duration =
how long the chord was held (wider block = longer hold).

Secondary display: 12-bar chromagram at the bottom showing current energy per pitch class as a
vertical bar chart. "Your pitch class is C, E, G — C major." Zero external deps (pure FFT chroma,
no ML). One-cycle build. Demo mode: plays a ii-V-I progression (Dm7 → G7 → Cmaj7) via triangle
oscillators. "What chord are you playing?" — the first prototype to explicitly surface music theory.

Why this now: 26 existing prototypes visualize audio signal properties. None name the musical
structure. This is the simplest bridge from signal to theory. Pianists will recognize their chords
immediately. Natural complement to `24-piano-roll` (pitch positions) and `22-code-score` (written
notation). Research basis: Chord Colourizer (RESEARCH.md §42).

### scene-spatial — Ghost preset scenes as spatial audio environments `[queued]`
Route: `/dream/29-scene-spatial`. Six Ghost preset scenes from the journey narrative, each with
hand-authored 3D HRTF audio: stone chamber (near-field piano reverb from front-left, stone
percussion hits from above, long tail), root portal (low root-tone drone from below + forest
ambience ahead), underground pool (water trickle from right, vast low-frequency resonance),
tiny planet (wind dome from all azimuths, bird calls from variable positions), forest dawn
(birdsong from tree canopy = high positions, stream from left-front, first piano tone from
front-right), cosmic ascension (ultra-high reverb pad from all around, harmonic series drone
rising in frequency as scene progresses).

UI: scene selector row at top (same names as `2-ghost-lab`). Main area: a First-Person "listener
head" circle in the center of a canvas, with 3–6 labeled sound sources as colored dots placed
in their spatial positions; user can drag them to reposition. Audio uses WebAudio HRTF PannerNode
(same as `7-spatial`). All sounds are synthesized via OscillatorNode + ConvolverNode + custom
impulse responses (no audio files needed). Wear headphones — scenes should feel like being there.
One-cycle build. Zero deps. "Each Ghost scene has a sound as distinctive as its visuals."
Research basis: SonoWorld (RESEARCH.md §39).

### lyria-jam — infinite AI music steering via Lyria RealTime API `[queued, needs GEMINI_API_KEY]`
Route: `/dream/30-lyria-jam`. Connect to Google's Lyria RealTime API via WebSocket (Gemini API).
UI: two text prompt slots with weight sliders (0–2) for live blending ("jazz piano" at 1.5 +
"ambient drone" at 0.5 → morph live by adjusting sliders). BPM slider (60–200), density slider,
brightness slider, key picker. All controls send `set_weighted_prompts()` or
`set_music_generation_config()` through the WebSocket in real time; music changes within ~2 seconds.
Mic input: amplitude → auto-drives brightness (louder playing → brighter, denser music).

Generated 48kHz PCM audio piped directly to `AnalyserNode` → live-bloom radial visualizer (same
6-band color mapping as `1-live`). Karel pastes his Gemini API key into a settings field;
stored only in `sessionStorage`, never committed. Admin-only gate. "The music never stops.
You just steer it." Budget: Google AI Studio free tier has daily quota; paid Gemini API charges
per minute of generated audio (track against Karel's existing Gemini billing). This is the most
live-performance-relevant AI music prototype in the queue — continuous, real-time, steerable.
Research basis: Lyria RealTime (RESEARCH.md §37).

### gesture-music — webcam hand gestures → real-time audio synthesis `[queued, needs MediaPipe CDN dep]`
Route: `/dream/31-gesture-music`. Webcam → MediaPipe HandLandmarker (loaded from jsDelivr CDN
as WASM, ~8MB one-time download) → hand skeleton landmarks → 5 synthesizer parameters: right
hand Y-position → pitch (continuous glide, C2–C7 range); palm-spread (thumb-to-pinky distance)
→ reverb decay (0.5–4s); left hand Y → bass drone frequency; curl-count (metacarpal-fingertip
angle sum) → harmonic richness (1–8 harmonics); wrist velocity (frame-delta) → percussive onset
trigger. Triangle-wave + convolver synthesis, all Web Audio.

Visual: canvas2D overlay on webcam feed shows hand skeleton as glowing dots + lines (additive
blending). A secondary audio-reactive strip below the feed shows a spectrum bar (1-live style).
"Conduct the music with your hands." No mic needed. Inspiration: Gesture2Music (30ms latency,
arxiv 2511.00793, RESEARCH.md §41). One-cycle build; needs Karel approval on CDN load (~8MB).

### mood-vis — semantic audio-reactive visualizer that switches modes `[queued]`
Route: `/dream/32-mood-vis`. Mic input → extract 4 real-time audio features: tempo estimate
(onset intervals), spectral centroid, zero-crossing rate, tonal clarity (HPS pitch confidence).
Rule-based classifier maps features to 6 mood/energy buckets: calm+bright, calm+dark,
energetic+bright, energetic+dark, complex, minimal. Each bucket maps to a visual mode drawn on
a single canvas: calm+bright = fluid-style ink diffusion; calm+dark = slow particle drift;
energetic+bright = cymatics-style radial bloom; energetic+dark = reaction-diffusion-style
growing patterns; complex = tessellate-style tile rewire; minimal = simple Lissajous circle.
A smooth 2-second crossfade transitions between modes. Current bucket and features shown as a
small overlay. "A visualizer that listens." No ML, no external deps. One-cycle build.
Research basis: ACM IMX 2025 semantic visualization (RESEARCH.md §43).

Key findings from Cycle 31 (2026-05-19):
- Lyria RealTime API (Google DeepMind) — WebSocket streaming infinite music, text prompt blending, BPM/density/brightness controls, browser-callable with Gemini API key. Most live-performance-relevant AI music capability found yet.
- Magenta RealTime — open-weights version of above; Python/Colab only, not browser-callable without local server.
- iOS 26 / Safari 26 — WebGPU now universal: full support on iOS, iPadOS, macOS, visionOS. Karel's phone can now run all WebGPU prototypes.
- Veo 3.1 Fast — $0.15/sec with audio (half of standard tier). Ghost-animate at ~$0.75/clip.
- SonoWorld (arxiv 2603.28757, Mar 2026) — image → navigable 3D spatial audio scene, Three.js + WebAudio HRTF, browser-native demo at 5.3ms latency. Inspires `scene-spatial`.
- Gesture2Music (arxiv 2511.00793) — 30ms webcam gesture → music control. Inspires `gesture-music` via MediaPipe.
- Chord Colourizer (arxiv 2510.10173) — CQT chroma → chord name + color. Inspires `chord-canvas`, first music-theory prototype.
- ACM IMX 2025 semantic visualization — MIR + rule-based classifier → visualizer mode switching. Inspires `mood-vis`.

---

## FROM RESEARCH (Cycle 35, 2026-05-19) — promoted to queue

### aria-companion — turn-taking piano AI companion `[queued]`
Route: `/dream/33-aria-companion`. Mic input → autocorrelation pitch detection → note event buffer.
After 2s of silence AND ≥8 notes captured: generate **Markov-chain response**: a 1st-order bigram
pitch transition table built from the user's own note sequence (what interval did you most often
play next?), plus a light pentatonic bias to prevent atonal chaos. Response plays as piano-timbred
OscillatorNode + short convolver reverb (same impulse technique as `29-scene-spatial`). Visual:
split dual piano roll — user phrase on top (warm orange), AI response on bottom (cool blue). After
the AI finishes, the system returns to "listening" mode. The longer you play, the more the Markov
table learns your style.

"The piano responds when you rest." Zero deps. No server. No ML inference — the Markov chain is
~20 lines of JS. This is the first **dialogue** prototype: not reactive (responding every frame) but
compositional (listening, then generating). Inspired by Aria-Duet (NeurIPS 2025, arxiv 2511.01663)
and the "Design Space for Live Music Agents" taxonomy that identifies dialogue agents as the least-
explored category. One-cycle build.

### spectral-morph — real-time FFT timbre blending `[queued]`
Route: `/dream/34-spectral-morph`. AudioWorklet receives two audio channels (source A, source B)
simultaneously → applies FFT (2048 samples) to each → linearly interpolates magnitude spectra:
|blend| = (1−t)×|A| + t×|B| → restores phase from source A → IFFT → output. A morph slider
(0→1) continuously adjusts t. Visual: three stacked horizontal spectrum strips (source A bottom,
blend center, source B top), each colored with the `1-live` frequency→hue palette, magnitude bars
scrolling right in real time.

Demo mode: source A = sawtooth oscillator, source B = pure sine, same pitch C3. At t=0.5 you hear
a triangle-like waveform — the FFT midpoint between saw and sine is acoustically real and distinct
from either. Mic mode: source A = mic input, source B = a selectable waveform (sine / triangle /
noise). "Morph between your piano and a flute."

Zero deps — pure AudioWorklet + Web Audio. First prototype in the sandbox that **resynthesizes from
spectral manipulation** rather than just visualizing or shifting frequency content. Inspired by
daudio.dev spectral morphing and the observation that 32 prototypes use FFT for analysis but none
have used it for resynthesis. One-cycle build. Full research notes: RESEARCH.md §47.

### loop-station — 4-slot live loop station `[queued]`
Route: `/dream/35-loop-station`. Four record slots. Each slot: BPM-synced length (1, 2, or 4 bars
selectable). Tap **REC** → record begins; tap again → close loop and start looping immediately.
Loop boundary crossfade (200ms overlap-add) removes the click at the loop point. All active slots
play phase-locked (all start from beat 1 simultaneously). Overdub: tap REC on a looping slot to
layer additional audio on top. Mute/unmute per slot. **Clear** stops and empties a slot.

Visual: each slot is a horizontal canvas mini-waveform (scrolling, color matches `1-live` band
palette for the slot's dominant frequency). A BPM tap-tempo button. Demo loads 4 pre-built 2-bar
loops (sub-bass drone, mid-range piano phrase, high arpeggiated figure, rhythmic click) so Karel
can try the interaction immediately without recording.

"Build a multi-layer performance in real time." Zero deps. Pure Web Audio API (AudioBufferSourceNode
with loop=true, scheduled via AudioContext.currentTime for phase lock). This is the first prototype
where you actively **construct** a composition over time rather than playing or watching. Natural live
performance tool — same paradigm as a Boss RC-1 looper or Ableton session clips. One-cycle build.
Inspired by LoopGen (arxiv 2504.04466, RESEARCH.md §46) and the "live performance fitness" priority
in the operating manual.

Key findings from Cycle 35 (2026-05-19):
- Aria-Duet / Ghost in the Keys (NeurIPS 2025, arxiv 2511.01663) — turn-taking piano AI duet on Disklavier. AI response generated by autoregressive transformer (Aria model). Inspires `aria-companion` — browser Markov-chain version, zero deps.
- LoopGen (arxiv 2504.04466, Apr 2026) — training-free loopable music: 55% better loop coherence, 70% better listener ratings. Inspires `loop-station`.
- Spectral Morphing — FFT magnitude interpolation → genuine acoustic hybrid timbres. Fully browser-native AudioWorklet approach. Inspires `spectral-morph`.
- Design Space for Live Music Agents (arxiv 2602.05064, Feb 2026) — 184-system taxonomy. Identifies "dialogue agents" as least-explored category — exactly what `aria-companion` fills.
- Web Audio API spec (TPAC 2025) — Configurable Render Quantum in Q4 2026: will push audio-processing latency below 3ms. Performance.now() in AudioWorklet. Playout Statistics API.
- BRAVE (arxiv 2503.11562, Mar 2026) — low-latency neural timbre transfer (RAVE upgrade). No browser/WASM port yet; monitor for future `brave-timbre` prototype.
- iPlug3 (Jan 2026) — WebGPU + SDL3 + MCP audio plugin framework. Scripts mirror web APIs. Potential foundation for "Resonance as an installation" (Tauri mode).
- Revival (arxiv 2503.15498, Mar 2026) — live concert with AI musical agents in two roles: harmonic resonance + structural scaffolding. Validates Resonance's phase-based design.
- Kling 2.6 — native audio + speech at $0.14/sec. Ghost image + motion prompt → 5s cinematic clip with audio + optional spoken Ghost line. Updates ghost-animate plan.

---

## FROM RESEARCH (Cycle 39, 2026-05-19) — promoted to queue

### pluck-field — Karplus-Strong virtual string field `[queued]`
Route: `/dream/36-pluck-field`. A canvas containing 24 virtual strings arranged in a 4×6 grid,
tuned to C pentatonic across 4 octaves (C2–B5). Each string is 3 Web Audio nodes: a `DelayNode`
(delay time = 1/frequency, e.g. C4 = 1/261.63 ≈ 3.82ms delay), a `BiquadFilterNode(lowpass,
fc=4000Hz)` in the feedback path, and a `GainNode(0.996)` for energy decay. To pluck: inject a
5ms white-noise burst into the delay line; the feedback loop sustains the string's natural
resonance as it decays over ~2s. Multiple strings ring simultaneously without interaction.

Visual: each string is an animated horizontal line across its grid cell. On pluck, the line
animates as a damped cosine wave — amplitude decreasing exponentially with the string's decay
time constant. Color = pitch hue (same C pentatonic mapping as `1-live`: low C = violet, high
B5 = warm orange). Dense rings of simultaneous strings glow like a harp. Dark background.
Click any cell to pluck. Mic: onset events pluck a random string. "What if the canvas was a
harp?" No academic paper needed — Karplus-Strong (1983) is the standard; Web Audio DelayNode
is exactly the right primitive. Zero external deps. First physical modeling synthesis prototype
in the sandbox. One-cycle build. Full research notes: RESEARCH.md §54.

### ratio-lab — Tonnetz just intonation harmonic lattice `[queued]`
Route: `/dream/37-ratio-lab`. A 9×5 canvas showing the Tonnetz lattice: X axis = perfect fifth
intervals (×3/2 ratio), Y axis = major third intervals (×5/4 ratio). Each node is a frequency
ratio from a base pitch of A3 = 220Hz. Click any node to hear it as a sustained sine tone against
a continuous 1/1 drone. Neighboring nodes (1–2 steps) are consonant intervals (perfect fifth,
major third, minor third); distant nodes are dissonant (tritone, complex ratios). Node color
encodes consonance: warm (consonant, nearby) → cool (dissonant, far). Large nodes = simple
ratios; small nodes = complex ones.

Mic mode: autocorrelation pitch detection (same algorithm as `13-piano-canvas`) highlights the
closest lattice node to the currently detected pitch, with a glowing ring. Hold a chord: multiple
glowing nodes form a subgraph — the shape IS the chord quality (a major chord = right-triangle
on the lattice; a minor chord = left-triangle; an augmented chord = equilateral). "Navigate
harmony as a landscape." First Resonance prototype about tuning systems rather than signal
processing. Zero deps. One-cycle build. Research basis: LIMITER (RESEARCH.md §55).

### mood-xy — Russell circumplex emotion synthesis `[queued]`
Route: `/dream/38-mood-xy`. A 2D canvas: valence (sad ← → happy) on X axis; arousal (calm ↑
excited) on Y axis. Drag a dot to any position. Web Audio synthesizes music in real time driven
by the coordinates: arousal → BPM (40–140), simultaneous voice count (1–6), register (bass vs.
treble), note attack time (slow pads vs. sharp staccato); valence → chord quality (major at +1,
minor at 0, diminished at −1), spectral brightness (filter fc), note duration (longer = sadder).

Four quadrant aesthetics: energetic+happy (bright major arpeggios at 120 BPM), energetic+sad
(dark chromatic runs at 110 BPM), calm+happy (sustained major pads at 55 BPM), calm+sad (sparse
minor chords at 40 BPM). Canvas background color shifts smoothly with the mood (warm quadrants =
amber background, sad quadrants = deep blue). The dot leaves a pastel trail showing where you've
been. A small text label reads the current quadrant (e.g. "calm · sad"). "Navigate your musical
mood." No ML, no API, zero external deps. First emotion-coordinate prototype in the sandbox.
One-cycle build. Research basis: AffectMachine-Pop, RESEARCH.md §58.

### anticipate — ReaLJam-inspired AI anticipation display `[queued]`
Route: `/dream/39-anticipate`. Extends `33-aria-companion`: same mic → autocorrelation pitch
detection → Markov chain response. Adds a ghost-note anticipation layer: when the Markov chain
computes a response (during the 2s silence window), the *planned* response notes are immediately
rendered as semi-transparent ghost bars in the ARIA (blue) piano roll panel, before each note
actually fires. As each note sounds, its ghost bar solidifies from 25% opacity to full color
with a brief flash. If the Markov chain re-samples a note (probability weighting), the ghost
updates instantly.

The user sees Aria's intention 0.5s before execution — the same "anticipation" design insight
from ReaLJam (CHI 2025, arxiv 2502.21267), which found this transparency dramatically improved
perceived collaboration quality. Visual effect: a wave of solidification sweeps through the ARIA
panel as the response plays. The top (YOU) panel is unchanged. "Watch Aria decide before she
plays." Zero deps. One-cycle build. Research basis: RESEARCH.md §53.

### browser-musicgen — In-browser MusicGen via Transformers.js `[queued, needs Karel OK on ~390MB model]`
Route: `/dream/40-browser-musicgen`. Loads `@xenova/transformers` and `facebook/musicgen-small`
ONNX weights (~390MB, browser-cached after first download) via CDN import — no package.json
change needed if imported as an ES module from jsDelivr. User types a text prompt ("forest piano
dawn, gentle 70 BPM, ceremonial drums") and presses Generate. Streaming: first audio chunk plays
at ~5s. Total generation: ~15–30s for 30s of music. Audio plays through the live-bloom radial
visualizer (same 6-band color mapping as `1-live`). A progress bar + "Model loading..." state
handles the one-time download gracefully. No API key. No per-generation cost.

This is the first dream prototype with in-browser ML inference. Different capability from
fal.ai-based compose: offline-capable after first load, no rate limits, zero API cost. Max 30s
output. Needs Karel OK on (1) ~390MB CDN dependency, (2) whether CDN ES module import (jsDelivr)
is acceptable vs. npm dep. Could become the `6-compose` prototype implementation with no API
dependencies. Research basis: RESEARCH.md §56.

Key findings from Cycle 39 (2026-05-19):
- Karplus-Strong synthesis: 3 Web Audio nodes = plucked string. 35 prototypes, none physical modeling. Gap filled by `pluck-field`.
- ReaLJam (CHI 2025, arxiv 2502.21267) — anticipation in AI jamming: ghost-note preview before execution. Inspires `anticipate`.
- LIMITER (arxiv 2507.08675, Jul 2025) — gamified just intonation; Tonnetz lattice visualization. Inspires `ratio-lab`.
- MusicGen browser via Transformers.js — ~390MB ONNX, zero API cost, 5s to first chunk. Inspires `browser-musicgen`.
- AffectMachine-Pop (arxiv 2506.08200, Jun 2026) — arousal×valence → real-time music. Inspires `mood-xy`.
- DARC (arxiv 2601.02357, Jan 2026) — drum accompaniment from tapping/beatboxing. Inspires future `drum-tap`.
- ASTRODITHER (Three.js forum) — TSL + dithering + time warp + selective bloom. Technique note for `21-three-mesh-av` polish.
- Three.js r171+ — WebGPU renderer production-ready, TSL compiles to WGSL+GLSL automatically. No migration needed.

---

## FROM RESEARCH (Cycle 44, 2026-05-19) — promoted to queue

### shepard-tone — auditory illusion: the endless staircase `[queued]`
Route: `/dream/40-shepard-tone`. A Shepard tone is a superposition of sine waves separated by
octaves (e.g. A2 + A3 + A4 + A5 + A6), each fading in at the bottom and fading out at the top,
creating the auditory illusion of a tone that rises (or falls) forever without ever resolving.
Discovered by Roger Shepard (1964). The most famous auditory illusion after the McGurk effect.

**Spec**: 8 sine oscillators, each one octave apart (A1–A8). Each oscillator's gain follows a
bell-curve envelope based on its current log-frequency position within the audible range
(peak at 440Hz, zero at ~55Hz and ~14kHz). A `rate` parameter controls how fast the shared
pitch glides upward: 0.5 BPM (very slow, meditative) to 30 BPM (dizzying). At any rate, the
fundamental pitch spirals upward while the perceived "height" is frozen — it always sounds like
it's rising. Toggle "descending" for the downward illusion (the tritone paradox: descending
Shepard tones are equally valid but flip the perceived direction).

**Interactions**: a `rate` slider; **Ascending / Descending** toggle; **interval** select
(chromatic glide / whole-tone / half-tone steps — each creates a distinct temporal rhythm to
the illusion); **freeze** (stops the glide mid-spiral, snaps the auditory illusion's "position");
**mic mode**: microphone amplitude modulates rate (play louder → tone ascends faster). Canvas:
the 8 oscillators as circles arranged in a vertical column, each glowing proportional to its
gain (bright at center of the stack, dim at top/bottom). A rotating logarithmic spiral
indicator shows the current pitch position. "An endless musical staircase."

**Why this now**: 39 existing prototypes cover audio-reactive viz, physical modeling, spatial
audio, emotion synthesis, pattern automata, timbre morphing, dialogue AI. None address auditory
illusions or psychoacoustics. Shepard tones are the canonical demonstration that what you hear
is not what is physically happening — deeply relevant to Resonance's "transcendent listening"
vision. Surprising to pianists who haven't encountered it. Zero external deps, one-cycle build,
no API keys. Research basis: RESEARCH.md §62 (style-space navigation analogy: the Shepard tone
"navigates" frequency space the same way embedding arithmetic navigates style space — continuous
motion with no apparent end).

### neural-pitch — shared CREPE-tiny ONNX pitch detection upgrade `[queued, needs Karel OK on CDN ONNX dep]`
Route: no new page — this is a `src/app/dream/_shared/use-neural-pitch.ts` upgrade. Load
CREPE-tiny (~2MB ONNX, loadable from CDN via ONNX Runtime Web) as an optional drop-in
replacement for the current autocorrelation pitch detection path. CREPE-tiny is loaded once
on first mic-start, cached permanently. It accepts 1024-sample audio frames at 16kHz and
returns a 360-bin pitch salience (20–1975 Hz, 20 cent resolution). Peak + parabolic
interpolation gives a pitch estimate 10× more accurate than autocorrelation on complex piano,
voice, and noisy signals.

Prototype approach: add `use-neural-pitch.ts` to `_shared/`, integrate it into `13-piano-canvas`
as the pitch source, compare with autocorrelation in real time (show both estimates side-by-side
in a small debug overlay). If accuracy is clearly better, offer to upgrade the shared hook across
all pitch-detecting prototypes. One-cycle build. Needs Karel OK on CDN ONNX Runtime Web dep.
Research basis: RESEARCH.md §61.

### mirelo-ghost-loop — extend Ghost soundscapes into seamless loops `[queued, needs FAL_KEY]`
Route: extend `/dream/9-ghost-sound` or standalone `/dream/41-mirelo-ghost-loop`. After
generating a Ghost scene audio clip (via MMAudio V2 or direct Mirelo Text-to-Audio), pipe it
through **Mirelo AI SFX Audio Extension** (fal.ai) to extend the 10s clip into a 30-60s
seamlessly looping ambient soundscape. Display: waveform player with the original clip highlighted
in one color and the extended section in another. Loop button: set the extended clip to play
continuously as a live ambient background for the Ghost scene image. Admin-only, needs FAL_KEY.
Budget: ~$0.01-0.02/clip (MMAudio V2 + Mirelo Extension). Research basis: RESEARCH.md §63.

### code-vis — live coding DSL that draws as it plays `[queued]`
Route: `/dream/41-code-vis`. Split-screen: left = CodeMirror textarea (CDN ESM, no package.json
change), right = canvas. A minimal pattern DSL: each line defines a synthesizer voice and its
visual: `A3 tri 0.8 // warm triangle at A3 = golden ring`. Evaluate on change (debounced 500ms).
Each active voice renders as a pulsing circle/ring on the canvas, sized by amplitude, colored
by frequency (same `1-live` hue mapping), updated every animation frame. Multiple voices = a
constellation of colored rings breathing together. "The code plays; the code draws."

Inspired by limut (§67) but much simpler: no pattern sequencer, just sustained tones as the
building block. A pianist can write a chord in 5 seconds and hear+see it. BPM slider drives
pulsing. Save canvas as PNG. Zero new npm deps (CodeMirror loaded from CDN). One-cycle build.

Key findings from Cycle 44 (2026-05-19):
- onnxcrepe (RESEARCH.md §61) — CREPE-tiny ONNX, ~2MB, browser-loadable. Neural pitch detection for 6+ existing prototypes.
- Magenta RealTime (§62) — open-weights 800M music model, Apache 2.0, embedding arithmetic style blending. Colab-proxy path.
- Mirelo AI SFX 1.6 (§63) — new fal.ai model: audio extension + inpainting. Extends Ghost soundscape workflow.
- Udio v4 Audio Inpainting (§64) — select-and-regenerate paradigm. No API, but informs future compose+edit UX.
- Live Music Models paper (§65) — embedding arithmetic is vector addition, not just prompt blending. 2D style canvas better than sliders for `30-lyria-jam`.
- Transformers.js v4 (§66) — 53% smaller bundles, 200ms load (was 2s). Makes browser ML fully viable.
- limut (§67) — browser live coding music+visuals, updated May 2026. Inspires `code-vis` prototype.
- Suno v5.5 (§68) — voice cloning + generative stems (12 tracks). Stems → `suno-spatial` prototype (needs Suno API).

---

## FROM RESEARCH (Cycle 48, 2026-05-19) — promoted to queue

### lyria-ghost — Ghost scene image → Lyria 3 Clip → 30s ambient Ghost soundtrack `[queued, needs GEMINI_API_KEY]`
Route: `/dream/43-lyria-ghost`. UI shows the five Ghost preset scenes (Stone Chamber, Root Portal,
Underground Pool, Tiny Planet, Forest Dawn, Cosmic Ascension) as a button row — same names as
`29-scene-spatial`. Click a scene: a scene-specific text prompt is pre-filled in an editable
textarea ("ambient score for a stone chamber, slow tempo, single reverbed piano chord, long decay,
no percussion"). Optionally drag-and-drop a custom Ghost image (or use a built-in placeholder
thumbnail per scene). Click "Generate" → call `lyria-3-clip-preview` via Gemini API → receive 30s
MP3 → decode via AudioContext → play through live-bloom radial visualizer (same as `1-live`).
Waveform player shows duration; "Generate variation" calls again with the same inputs + a new seed.

"Your Ghost scene, given a voice." Admin-only. Budget: free tier in Google AI Studio, then minimal
per-call billing. Needs GEMINI_API_KEY (same key as `30-lyria-jam`). Zero new npm deps — Gemini
API called via standard `fetch`. One-cycle build. RESEARCH.md §69.

### stable-extend — record a piano phrase, AI continues it `[queued, needs FAL_KEY]`
Route: `/dream/43-stable-extend`. Split screen: left = record controls (same mic-capture as
`35-loop-station`: tap ● REC to start, ■ STOP to close, waveform preview shows captured audio).
Right = generation panel: optional text prompt to guide style ("extend this into a cello duet",
"continue in a jazz register"), then "Extend →" button. Sends the captured audio to
`fal-ai/stable-audio-25/inpaint` (continuation mode) with the current audio as the prefix clip and a
target duration of 30s. Progress bar during generation (~5–10s). Returned audio is decoded and played
through the live-bloom radial visualizer. Waveform panel shows original clip (amber) + AI extension
(blue) side by side as a horizontal strip.

"What if your phrase kept going?" This is the first dream prototype that extends YOUR playing with AI
— `6-compose` generates from a text prompt; `14-reference-compose` style-matches; `stable-extend`
simply continues from where you stopped. Budget: $0.20/generation (FAL_KEY already in use). No new
approvals needed. Admin-optional. One-cycle build. RESEARCH.md §70.

### binaural-lyria — binaural brainwave entrainment + matched AI ambient music `[queued, needs GEMINI_API_KEY]`
Route: upgrade of `/dream/42-binaural` (or standalone `/dream/44-binaural-lyria`). Step 1: user
selects a target brainwave state (δ/θ/α/β/γ) — same five presets as `42-binaural`. Step 2: binaural
beats play at the target beat frequency (exact same synthesis as `42-binaural`). Step 3: "Generate
ambient track" button calls `lyria-3-clip-preview` with a state-matched prompt: δ→"deep ambient,
long slow drones, vast reverb, no melody, no rhythm, 0.5–2 BPM pulse, subharmonic bass"; θ→"meditative
flute and bowl, gentle 6 BPM breath"; α→"calm piano solo, gentle 10 BPM, warm room reverb";
β→"focused acoustic guitar, steady 16 BPM arpeggio"; γ→"bright gamelan, 40 BPM metallic shimmer".
The 30s ambient track plays alongside the binaural beats at a user-controlled blend level (0–100%
ambient). A session timer counts the current state duration. After 30s, the ambient track regenerates
automatically (next generation pre-fetched and queued via AudioContext for gapless looping).

"A meditation session where the music knows what your brain is trying to do." Combines the science of
brainwave entrainment (`42-binaural`, RESEARCH.md §74/75) with AI-generated ambient sound sculpted for
that brainwave state. Needs GEMINI_API_KEY. $0 on free tier (Lyria 3 Clip). One-cycle build.

### piano-to-ghost — your playing generates Ghost imagery + music simultaneously `[queued, needs GEMINI_API_KEY + FAL_KEY]`
Route: `/dream/45-piano-to-ghost`. Mic → autocorrelation pitch detection (same as `13-piano-canvas`)
+ 12-bin chroma chord detection (same as `28-chord-canvas`) → arousal/valence coordinates (same
mapping as `38-mood-xy`). After 2 seconds of silence AND ≥6 notes detected: (1) call `lyria-3-clip-preview`
with a Ghost-themed prompt shaped by the current arousal/valence quadrant ("cosmic ascending major
chords, energetic and bright, 80 BPM" / "stone chamber minor meditation, calm and dark, 50 BPM" /
etc.); simultaneously (2) call the Ghost LoRA on fal.ai with a scene prompt derived from the same
quadrant (energetic+bright→"cosmic ascension, Ghost figure in flight, golden light" / calm+dark→"stone
chamber, Ghost figure seated, single candle"). The canvas shows two panels: top = live piano roll
(from `24-piano-roll`), bottom = the Ghost image fading in over 3s. When the Lyria track arrives, it
plays through the live-bloom visualizer. Both update on the next phrase (2s silence → generate again).

"Your playing generates your world." First prototype that connects ALL the dream zone's systems: pitch
detection, chord analysis, emotion mapping, AI music generation, Ghost image generation. Admin-only.
Budget: ~$0.01–0.05/phrase (Lyria Clip + Ghost LoRA). Needs GEMINI_API_KEY + FAL_KEY. Complex (2
concurrent API calls). Two-cycle build likely. RESEARCH.md §73.

Key findings from Cycle 48 (2026-05-19):
- Lyria 3 (RESEARCH.md §69) — Gemini API music generation with image input. `lyria-3-clip-preview` = 30s MP3. Up to 10 images influence mood. Same key as lyria-jam. Inspires `lyria-ghost`.
- Stable Audio 2.5 (§70) — fal.ai audio continuation at $0.20/audio. Extend YOUR recording with AI. Inspires `stable-extend`.
- Suno Studio v5 Generative Stems (§71) — 12-stem export from AI music. API stems endpoint not yet public. Monitor for `suno-stems-spatial`.
- ONNX Runtime Web 1.26.0 (§72) — WebGPU EP now default. Faster than estimated; upgrades `neural-pitch` viability.
- Real-time MIDI-to-image (§73) — MIDI emotional analysis → generative images, validated with musicians. Inspires `piano-to-ghost`.
- Music as "controlled hallucination" (§74) — Frontiers 2026 framework: brain simulates a "virtual body" inside the music. Validates Resonance's "transcendent listening" thesis scientifically.
- MindMelody (§75) — EEG-driven closed-loop music therapy. Inspires `binaural-lyria`: binaural beats + Lyria ambient music matched to the target state.
- Three.js WebGPU/TSL maturity (§76) — full cross-browser production readiness. Reduces risk of `gpu-additive`. ASTRODITHER techniques worth applying to `21-three-mesh-av` polish.

---

## FROM RESEARCH (Cycle 51, 2026-05-20) — promoted to queue

### vocal-bgm — hum a melody, get a full band `[queued, needs FAL_KEY — already in use]`
Route: `/dream/44-vocal-bgm`. Record 5–15 seconds of humming, singing, or piano via mic (same `MediaRecorder` approach as `43-stable-extend`). Click "Arrange →". Server route sends audio to `fal-ai/ace-step/audio-to-audio` in remix mode with `lyrics: "[inst]"` (instrumental — no AI vocals) and a genre tag from a user-selectable dropdown ("jazz piano trio", "ambient electronic", "cinematic strings", "solo guitar"). ACE-Step 1.5 generates a 30s track where your hummed melody is the melodic seed for a full band arrangement. The result plays through the live-bloom radial visualizer.

Why this fills a gap: `43-stable-extend` continues your recording from the end. `vocal-bgm` puts your melody inside a new arrangement — your hum becomes the lead motif of a jazz trio or string quartet. The audio-to-audio paradigm is completely different from text-to-audio: your melodic contour is preserved in the output. FAL_KEY already in use. $0.006/30s. Zero new approvals needed. One-cycle build. RESEARCH.md §77.

### guided-session — brainwave path guide: from stressed to calm `[queued, zero deps]`
Route: `/dream/44-guided-session`. User selects a starting state ("Stressed", "Distracted", "Wired", "Tired") and a target state ("Calm", "Focused", "Drowsy", "Present"). The system calculates a brainwave-state path (e.g., Stressed=β-high → Focused=β-mid → Calm=α → Drowsy=θ) and plays isochronic tones (speakers-compatible, no headphones required) through each state in sequence. The session timer from `42-binaural` tracks time-in-state and triggers transitions with a gentle tone + text prompt ("You've been in α for 8 minutes. Ready to deepen to θ?"). Pink or brown noise layer adapts per state (pink=α, brown=δ/θ). A journal textarea (from `42-binaural`, localStorage per state) captures insights at each stage. At the end, shows a summary: "Session complete: 5 min β → 8 min α → 7 min θ."

Why this: The brainwave research cluster (RESEARCH.md §§74, 75, 80) validates guided state progression as clinically effective. The session timer and noise layer are already built in `42-binaural`. This prototype wires them into an intentional arc: a 20-minute guided session with a clear start, path, and end. First Resonance prototype that is also a genuine wellness tool. Zero deps, no API keys. One-cycle build.

### mood-journey — proactive mood traversal via the Russell circumplex `[queued, zero deps]`
Route: `/dream/45-mood-journey`. A canvas shows the Russell circumplex (valence × arousal, same as `38-mood-xy`). User places two labeled dots: "Now" (current mood) and "Goal" (target mood) by clicking. Press "Begin journey" → the synthesizer starts at the "Now" coordinate and slowly glides the dot toward "Goal" over a configurable duration (5, 10, 20 minutes). Every 30 seconds, the coordinate updates one step along the arc. The audio changes continuously: `38-mood-xy`'s full synthesis engine (BPM, chord quality, register, attack, arpeggio mode) tracks the coordinate in real time. A second layer: isochronic tones at the brainwave frequency matching the current arousal level (high arousal = β 16 Hz, mid = α 10 Hz, low = θ 6 Hz, very low = δ 2 Hz). The glowing trail shows the traversal history.

Why this is different: `38-mood-xy` responds to manual dragging. `mood-journey` automates the navigation along a goal-directed arc. Your music shifts from "distressed/agitated" to "calm/content" without you doing anything — you surrender control to the journey. Clinically, this follows the proactive music therapy framework (RESEARCH.md §84). Combining the `38-mood-xy` synthesizer (arousal/valence) with `42-binaural` isochronic tone (arousal as brainwave frequency) makes the audio doubly multi-modal. Zero deps, no API keys. One-cycle build.

### osc-composer — design a Lissajous figure, generate the audio that draws it `[queued, zero deps]`
Route: `/dream/45-osc-composer`. A canvas shows the Lissajous figure in real time, drawn from two OscillatorNodes routed to L (left) and R (right) channels. Controls: Ratio (L:R frequency ratio — presets: 1:1, 1:2, 2:3, 3:4, 3:5), Phase offset (0°–360° continuous slider), Amplitude balance (L/R). Preset shapes panel: Circle (1:1, 90°), Figure-8 (1:2, 0°), Trefoil (2:3, 0°), Rose (3:4, 0°), Starburst (3:5, 36°). User selects a preset → figure appears → fine-tunes sliders → figures morph smoothly. A "Puzzle" mode: target figure shown on canvas left, user's figure on right — tune to match. Download stereo WAV that encodes the current figure as a 5s stereo audio file (this is the literal oscilloscope music: when you play it on a real oscilloscope in XY mode, it draws the figure).

Why this: `20-scope` visualizes existing audio as Lissajous. `osc-composer` inverts it: design the shape, get the audio. Teaches music theory through geometry (a perfect fifth = specific ellipse; a minor third = three-loop figure). The downloadable WAV is the prototype's "artifact" — like `13-piano-canvas` saves a painting, `osc-composer` saves a figure as audio. First prototype where the artifact IS the sound (not a visualization of it). Zero deps, pure Web Audio + Canvas2D. One-cycle build. RESEARCH.md §82.

### ghost-xr — step inside a Ghost scene's spatial audio via WebXR `[queued, needs CDN dep (A-Frame ~1MB)]`
Route: `/dream/45-ghost-xr`. An A-Frame WebXR scene (A-Frame loaded from CDN, ~1MB) where the user is inside a 3D sphere. The Ghost scene spatial audio sources from `29-scene-spatial` are positioned around them — synthesized HRTF sound sources (stone chamber reverb, forest birds, cosmic drone) orbit at specific azimuths and elevations. On Chrome desktop: drag to rotate the view, audio follows head rotation (DeviceOrientation API). On Meta Quest/Vision Pro: physically look around the Ghost scene's audio landscape. Six Ghost scene presets (same as `29-scene-spatial`), selectable from a floating panel. No headset required for demo — the 360° rotation works on any desktop browser.

Why this: `29-scene-spatial` puts you in front of the spatial audio sphere. `ghost-xr` puts you inside it. With a headset, this is the most immersive Ghost experience in the sandbox — you're not looking at a Ghost scene, you're standing inside its sonic world. The HRTF audio code is identical to `29-scene-spatial` (reuse the same synthesis). WebXR is production-ready in 2026 (RESEARCH.md §81). Needs Karel OK on A-Frame CDN dep (~1MB). Without A-Frame: raw WebXR API is more code but zero-dep. One-cycle build.

Key findings from Cycle 51 (2026-05-20):
- ACE-Step 1.5 vocal-to-BGM (RESEARCH.md §77) — `fal-ai/ace-step/audio-to-audio`. Hum → full band. FAL_KEY in use. $0.006/30s. Inspires `vocal-bgm`.
- MusicRFM (§78, ICLR 2026) — note/chord steering via activation space during inference. Server-side. Future API: `note-steer` prototype.
- Composer Vector (§79, Apr 2026) — style-space blending for symbolic music. 70% Chopin + 30% Bach = audible hybrid. Inspires `style-map`.
- AI music therapy cluster (§80) — binaural + AI music therapy validated. Proactive path guidance. Inspires `guided-session` and `mood-journey`.
- WebXR spatial audio production-ready (§81) — WebXR 2026 standard. Ghost-XR prototype possible with A-Frame CDN dep. Inspires `ghost-xr`.
- Oscilloscope music browser tools (§82) — Lissajous figure composition as audio. Inverts `20-scope`. Inspires `osc-composer`.
- Rust/WASM AudioWorklet (§83) — browser-native production DSP. ~150KB CDN dep. Inspires `wasm-filter`, upgrades `34-spectral-morph`.
- Proactive AI music therapy (§84) — mood-path traversal via Russell circumplex. Combines `38-mood-xy` + `42-binaural`. Inspires `mood-journey`.

---

## FROM RESEARCH (Cycle 56, 2026-05-20) — promoted to queue

### arc-compose — MiniMax Music 2.6 journey arc composer with structural section tags `[queued, needs FAL_KEY — already in use]`
Route: `/dream/48-arc-compose`. Left panel: a textarea with section-tag helper buttons ([Intro], [Verse], [Build Up], [Chorus], [Bridge], [Outro], [Inst]). Style prompt field: "cinematic orchestra, dark ambient" or "jazz piano trio, warm". Right panel: the generated waveform + bloom visualizer. User writes an arc like:

```
[Intro] single piano note in vast reverb, silence between phrases, 15 seconds
[Build Up] low cello drone enters, pad swells, tension builds, 20 seconds
[Chorus] full orchestral peak, bright major resolution, drums present, 20 seconds
[Outro] instruments fade one by one, piano alone, then silence, 10 seconds
```

Server route calls `fal-ai/minimax-music/v2.6` with the arc text as lyrics and the style string. The model generates a 60–90s structured piece that follows the arc. MP3 plays through the six-band bloom visualizer; waveform strip shows the full duration. Download button saves the MP3.

Why this now: `18-elevenlabs-compose` was designed for exactly this interaction but cost $1.13/generation — prohibitively expensive for experimentation. MiniMax 2.6 delivers equivalent section control at **$0.03**, 37× cheaper. This is the prototype that turns the abstract arc concept (`5-arcs` — five arc types described in prose) into a generated 60-second piece you can actually listen to and show at a venue. First prototype where Karel can hear what a Cinematic Three-Act or EDM Build-and-Drop arc *sounds like* with real AI-generated music. FAL_KEY already in use. Zero new approvals. One-cycle build. RESEARCH.md §86.

### tap-rhythm — tap your rhythm, get a step sequencer `[queued, zero deps]`
Route: `/dream/48-tap-rhythm`. Mic → onset detection (same amplitude threshold approach as `1-live` and `36-pluck-field`). User taps on any surface or claps for ~8 beats. The agent detects each onset, measures inter-onset intervals to estimate BPM, and quantizes each tap to the nearest 16th-note position in a 2-bar grid. After 8+ taps, the grid is displayed as a **circular step sequencer** (clock face with 32 positions). Each filled position loops, triggering a drum sound synthesized via Web Audio:
- Low-energy taps → kick: 55Hz sine burst, 80ms attack-decay, slight distortion
- Mid-energy taps → snare: filtered noise burst, 50ms duration, 2kHz peak
- High-energy taps (louder) → hi-hat: 6–12kHz white noise, 20ms sharp decay

The clock hand rotates at the detected BPM. User can toggle individual steps on/off (click the clock face). Tap new rhythm → re-captures and replaces. BPM slider (±20% from detected). "Clear" resets. Mic amplitude indicator while tapping.

Why this: None of the 47 prototypes accept rhythm as the primary input. A non-pianist can walk up and clap a rhythm — the prototype turns it into a live drum loop. First step toward the DARC tap-to-drum concept (RESEARCH.md §89). High live-performance fitness: at a venue, tap a groove, and the rhythm starts playing. Zero deps, zero API. One-cycle build.

### anemone-av — organic bioluminescent 3D form dancing to audio `[queued, zero new deps]`
Route: `/dream/48-anemone-av`. A Three.js R3F scene (all deps already installed: `three@0.182`, `@react-three/fiber`, `@react-three/drei`, `@react-three/postprocessing`) with a procedurally generated branching 3D anemone form:
- Main trunk: 1 `TubeGeometry` path (sinusoidal spine curve)
- 8 branches: each sprouting from the trunk at a different height/angle
- Sub-branches: 3–5 per branch, tapering, with randomized directions

**TSL vertex displacement** (compiled to WGSL/GLSL automatically by Three.js TSL):
- Sub-bass (20–100 Hz): slow pendulum sway of the main trunk axis (~0.3 Hz, ±15°)
- Low-mid (100–500 Hz): branch base rotation (±8°, 0.8 Hz)
- High-mid (2–4 kHz): tip-flicker — outer branch vertices oscillate rapidly (4 Hz, ±3°)
- Onsets: a brief global pulse — all geometry expands by 10% for 80ms then contracts

**Bloom post-processing** (`UnrealBloomPass` via `@react-three/postprocessing`): glowing core (white), branch body (deep cyan), tips (violet). Alpha fades with distance from center — the form glows against pure black.

Demo mode: LFO oscillators (sub-bass at 0.1 Hz, high-mid at 3 Hz) animate the form without mic permissions. Mic mode: live FFT drives all parameters. Dark background, no axes, just the form. One sentence description overlay fades after 3s.

Why this: `21-three-mesh-av` is the only 3D prototype and it uses rigid platonic geometry (icosahedron). An organic living form — tentacles flickering, trunk swaying — reads as alive rather than mathematical. Sub-bass swaying the trunk at concert-room dynamics would be genuinely striking on a projector. Zero new deps (all Three.js packages are installed). One-cycle build. RESEARCH.md §92.

### stem-spatial — AI track → stem split → HRTF band positioning `[queued, needs FAL_KEY + stem API — two cycles]`
Route: `/dream/48-stem-spatial`. Step 1: generate a 30s instrumental track via MiniMax Music 2.6 (`[Inst]` tag, no vocals) with a brief style prompt. Step 2: send the generated MP3 to a stem separation model (fal.ai has Demucs-based stem splitters — check current availability). Step 3: the separated stems (drums, bass, piano/melody, other) are each decoded into an `AudioBuffer` and routed to a separate `PannerNode` with distinct HRTF position: drums from above, bass from below, piano from front-left, melody from front-right. Drag any source dot to reposition in 3D space (same canvas sphere as `29-scene-spatial`). Wear headphones.

Why this: `7-spatial` spatializes mic input across frequency bands. `29-scene-spatial` spatializes synthesized sounds. `stem-spatial` is the first prototype that spatializes an AI-generated full track — the band you summoned is placed in 3D space around you. Combines `48-arc-compose` (generation) with `7-spatial` (HRTF positioning). Budget: ~$0.03 (MiniMax) + ~$0.01–0.05 (stem split). FAL_KEY already in use. Two-cycle build (generation + spatial routing). RESEARCH.md §85.

Key findings from Cycle 56 (2026-05-20):
- Google Flow Music + Lyria 3 Pro (RESEARCH.md §85) — stem splitter, 3-min structured songs, "Replace+Extend" section regeneration. Inspires `stem-spatial`. Same Gemini key as `lyria-ghost`.
- MiniMax Music 2.6 (§86) — 14+ structural section tags, $0.03/generation, FAL_KEY in use. Inspires `arc-compose` — the `18-elevenlabs-compose` prototype, finally affordable.
- AILive Mixer (§87, arxiv 2603.15995) — zero-latency DL auto-mixer for live performance. Inspires polish of `35-loop-station` with RMS-based auto-gain.
- Real-Time Human-AI Co-Performance (§88, arxiv 2604.07612) — look-ahead latent diffusion + MAX/MSP, 5.4× speedup. Inspires look-ahead slider polish of `39-anticipate`.
- DARC (§89, arxiv 2601.02357) — tap/beatbox → drum accompaniment. Inspires `tap-rhythm` — zero deps, highest accessibility.
- Streaming accompaniment (§90, arxiv 2510.22105) — latency/coherence tradeoff formalized. Explains Lyria RealTime 2s update delay. Reference for all future real-time AI music prototypes.
- SonoCraftAR (§91, arxiv 2508.17597) — multi-agent LLM generates sound-reactive AR interfaces from text. Inspires `claude-canvas` meta-prototype (needs Karel OK on ANTHROPIC_API_KEY in dream zone).
- Bioluminescent AV + Galaxy WebGPU (§92) — organic branching forms dancing to audio, Three.js TSL. Inspires `anemone-av` — zero new deps, One-cycle build.

---

## FROM RESEARCH (Cycle 61, 2026-05-20) — promoted to queue

### diatonic-harmony — play a melody, hear chord-correct harmony voices `[queued, zero deps]`
Route: `/dream/51-diatonic-harmony`. Mic → autocorrelation pitch detection (same algorithm as
`13-piano-canvas`). Key detection: accumulate a 12-bin chroma vector over the last 8 detected
notes → dot-product template match against 24 major/minor key templates (same technique as
`28-chord-canvas`) → pick highest-scoring key + mode. For each detected note, generate 2
additional harmony voices: the **diatonic third above** (major or minor third depending on scale
degree) and the **diatonic fifth above** (perfect fifth or diminished fifth at scale degree 7),
both within the detected key's scale. Harmony voices = sine `OscillatorNode`s with 150ms
attack + 400ms release envelope, gain 0.4, panned ±20° for spatial separation. Main melody
stays center (mic passthrough OFF — just the pitch-detection visualization; no raw mic audio).

Visual: three-track piano roll (same Canvas2D as `24-piano-roll`): your detected note in
**warm orange** (middle track), third-voice in **light blue** (above), fifth-voice in **deep blue**
(below). Bars scroll left at BPM rate. Key label top-right updates live ("Detected: C major").
Chord name (from `28-chord-canvas` template matching over the last 3 notes) updates when stable.
Demo mode: plays the Bach fragment from `22-code-score` and auto-generates its diatonic harmonies
at full fidelity. "You play a melody — its diatonic harmonies float alongside."

Different from `23-pitch-harmonize`: that prototype pitch-shifts the raw mic signal by a fixed
interval (always a fifth, always mechanical). This prototype detects the key and generates
*scale-correct* voices — different intervals on different scale degrees, as a real arranger would.
Zero deps. One-cycle build. Research basis: AI Harmonizer (RESEARCH.md §96).

### concept-steer — 6-axis music concept synthesizer `[queued, zero deps]`
Route: `/dream/52-concept-steer`. Inspired by sparse autoencoder research on interpretable music
model representations (RESEARCH.md §94): music AI models internally represent music along axes
labeled **Brightness**, **Density**, **Regularity**, **Complexity**, **Energy**, **Mode**. This
prototype makes those same axes the primary synthesis controls.

Canvas: a hexagonal radar chart (regular hexagon, one vertex per axis). Each vertex is
draggable; the radar polygon fills as the current "concept position." Axis labels around the
perimeter. Six synthesis mappings:
- **Brightness** → low-pass filter fc 400–6000 Hz
- **Density** → simultaneous voice count 1–5, BPM 40–140
- **Regularity** → note quantization: free (random 80–160% duration) → strict grid (exact durations)
- **Complexity** → chord voicings: unison → dyad → triad → 7th → polychord (add 9th, 11th)
- **Energy** → note attack 0.8s→0.04s + velocity scaling 0.3→1.0
- **Mode** → chord quality interpolation: major → minor → diminished

Synthesis engine: same oscillator stack as `38-mood-xy` (GainNode envelopes, BiquadFilterNode
low-pass, multiple OscillatorNodes per chord voice). A small chord-name label (from
`28-chord-canvas` template matching) updates live in the corner. Preset positions: "Classical
Fugue" (bright, regular, complex, major), "Dark Ambient" (dim, sparse, free, minor, low energy),
"Jazz Improv" (bright, dense, irregular, complex, major), "Drone" (dim, sparse, regular, unison).

"Navigate music as a space of named concepts — not moods, not knobs." First prototype where the
UI labels are the same vocabulary a musician or music theorist would use, derived from what
music AI models learn internally. Zero deps. One-cycle build. RESEARCH.md §94.

### claude-shader — LLM-generated audio-reactive GLSL shader `[queued, needs ANTHROPIC_API_KEY]`
Route: `/dream/51-claude-shader`. Admin-only. A textarea where you describe an audio-reactive
visualization in plain English: "a rotating vortex of particles that expands on every beat,
purple when bass-heavy, orange when treble-heavy." Click "Generate" → server route calls
`claude-haiku-4-5` with a constrained system prompt:

```
You generate GLSL fragment shaders for audio-reactive visuals. The shader receives these uniforms:
  uniform float uBass;    // 0.0–1.0 bass energy (20–250 Hz)
  uniform float uMid;     // 0.0–1.0 mid energy (250–4000 Hz)
  uniform float uTreble;  // 0.0–1.0 treble energy (4000–20000 Hz)
  uniform float uOnset;   // 0.0–1.0 onset strength (decays 100ms after beat)
  uniform float uTime;    // elapsed seconds
  uniform vec2  uRes;     // canvas resolution in pixels
Output: only the GLSL function body for `vec4 mainImage(vec2 fragCoord)`.
```

Generated shader body is compiled via WebGL on a fullscreen quad. Web Audio AnalyserNode
feeds the uniforms each frame. The user can edit the raw GLSL inline (CodeMirror from CDN,
~200KB, no package.json change). "Regenerate variation" calls again with the same prompt +
"Try a different approach." Error overlay shows GLSL compile errors.

Self-referential: Claude generates an audio-reactive GLSL shader that runs in the browser
session where Claude is the agent. Zero new npm deps. Needs ANTHROPIC_API_KEY in Vercel env —
ask Karel. Budget: ~$0.001/generation at Haiku pricing. Route: `/dream/51-claude-shader`.
RESEARCH.md §93.

### ghost-sfx — ElevenLabs sound effects for Ghost scenes `[queued, needs FAL_KEY — already in use]`
Route: `/dream/52-ghost-sfx`. Six Ghost preset scenes, each with 3–4 pre-authored sound effect
text prompts. Click "Generate [Stone Chamber]" → server route calls fal.ai ElevenLabs Sound
Effects model for each prompt → 3–5s clips returned as audio data → stored in `sessionStorage`
→ decoded via `AudioContext.decodeAudioData` → played through `PannerNode` (HRTF model) at
scene-specific 3D positions.

Scene sound prompts (examples):
- Stone Chamber: "footstep echo in large stone cave, reverb 3s decay", "single piano chord in stone chamber, long reverb", "water drip in distant cave"
- Forest Dawn: "birdsong canopy from above, morning light", "stream flowing past from left", "single piano note in a forest clearing"
- Cosmic Ascension: "vast resonant drone from all directions", "high harmonic shimmer rising", "deep subharmonic pulse from below"

Canvas: same top-down sphere view as `29-scene-spatial` (F/B/L/R compass, colored dots for
each source). Drag dots to reposition. Wear headphones — the HRTF spatialization of naturalistic
generated sounds is more immersive than synthesized oscillators.

"The scenes that were always visual — now they have a voice." The ElevenLabs SFX model gives
Ghost scenes the same quality level as their imagery. Admin-only. FAL_KEY in use. Budget:
~$0.05–0.15/scene. One-cycle build once fal.ai endpoint is confirmed. RESEARCH.md §95.

Key findings from Cycle 61 (2026-05-20):
- AI Co-Artist (RESEARCH.md §93, arxiv 2512.08951) — LLM generates and evolves GLSL shaders from text descriptions; proves `claude-shader` is buildable. Needs ANTHROPIC_API_KEY.
- Interpretable Concepts in Music Models (§94, arxiv 2505.18186, May 2026) — sparse autoencoders extract Brightness/Density/Regularity/Complexity/Energy/Mode from transformer music models. Inspires `concept-steer` — zero deps, one cycle.
- ElevenLabs Sound Effects on fal.ai (§95) — text → short high-fidelity ambient sounds. FAL_KEY in use. Inspires `ghost-sfx` — naturalistic Ghost scene audio.
- AI Harmonizer (§96, arxiv 2506.18143, Jun 2025) — AMT-based 4-part diatonic harmony; offline only. Inspires `diatonic-harmony` — key detection + rule-based voice generation, zero deps.
- Token-Based Audio Inpainting (§97, arxiv 2507.08333, Feb 2026) — discrete diffusion for coherent audio continuation/inpainting. Future upgrade path for `43-stable-extend`. No fal.ai endpoint yet.
- Three.js/WebGPU 2026 (§98) — 100× gains confirmed, 1M particles at 60fps, ML inference via WebGPU compute. Reinforces `gpu-additive` and Three.js polish cycles.
- Streaming Piano Transcription (§99, arxiv 2503.01362) — causal streaming model for full note events (onset+pitch+offset+pedal). Future WASM upgrade for pitch detection across all prototypes.
- iPlug3 2026 (§100) — Jan 2026 clean-slate audio plugin framework with WebGPU + MCP agent integration. Best path to Resonance native install mode.

---

## FROM RESEARCH (Cycle 66, 2026-05-20) — promoted to queue

### maestro-stems — Beatoven 2.5-min track → stems → HRTF 3D band positioning `[queued, needs FAL_KEY — already in use]`
Route: `/dream/54-maestro-stems`. A style prompt field ("cinematic cello quartet, 70 BPM, minor key") + "Generate Track" button. Server route calls `beatoven/music-generation` → returns a full 2-minute instrumental track **AND individual stems** (drums, bass, melody, other). All stems decoded via `AudioContext.decodeAudioData`. Each stem is routed through a separate `PannerNode` (HRTF model): drums from above (+60° elevation), bass from below (−30°), melody from front-right (+25° azimuth), other from front-left (−25°). Canvas: same top-down sphere as `29-scene-spatial` — 4 colored stem-source dots, draggable. Mix slider per stem (same as `7-spatial`). Wear headphones.

"The band plays around you." This is the `stem-spatial` idea from the queue, now buildable without Lyria Flow Music's stem splitter. Maestro outputs stems directly. The key difference from `7-spatial` (which splits by frequency band): this separates by **musical role** — the drums come from above, not "the high frequencies." Much more spatially meaningful. FAL_KEY in use. $0.10/track. One-cycle build. RESEARCH.md §101.

### webgpu-audio-fx — Three.js TSL compute audio: GPU pitch-shift + reverb + visual feedback `[queued, zero new deps]`
Route: `/dream/54-webgpu-audio-fx`. Extends the Three.js WebGPU compute audio example (RESEARCH.md §102) into an interactive prototype. An audio file upload (or mic via `getUserMedia`) feeds an `AudioBuffer` to a GPU storage buffer. A TSL compute shader (Three.js Shader Language, compiles to WGSL automatically) applies: (1) **pitch shift** — reads the waveform at speed-adjusted fractional indices (0.5× to 2.0×, continuous slider), (2) **6-layer feedback delay** — each delay slightly different length with decreasing gain coefficient (reverb depth slider 0–100%). The processed audio is enqueued to a `ScriptProcessorNode` for playback. Simultaneously, an `AnalyserNode` on the output feeds a Three.js texture uniform that drives a 3D frequency visualization (a radial bar chart or mesh-deformation same as `21-three-mesh-av`, now driven by the GPU-processed audio).

"GPU computes the music. GPU renders the music." First sandbox prototype where the audio processing DSP and the visual rendering both run on the same GPU device — no AudioWorklet, no CPU DSP. WebGPU required; clear fallback. Zero new npm deps (three@0.182 + R3F already installed). One-cycle build. RESEARCH.md §102.

### ghost-voice — Ghost scene narration via Inworld TTS + HRTF front-center `[queued, needs FAL_KEY — already in use]`
Route: extend `/dream/53-ghost-sfx` OR standalone `/dream/55-ghost-voice`. A scene selector (same 6 Ghost scenes). Each scene has a pre-written one-line narrative fragment from the Ghost journey text:
- Stone Chamber: *"The resonance here is ancient. Let yourself be absorbed by it."*
- Root Portal: *"Something stirs beneath the roots. A low note. Then silence."*
- Underground Pool: *"The water remembers every sound that has passed through this place."*
- Tiny Planet: *"A single breath. The horizon wraps around you."*
- Forest Dawn: *"The first light is also the first sound. They arrive together."*
- Cosmic Ascension: *"You are not rising. The world is receding."*

"Narrate" button → server route calls Inworld TTS-1.5 Max (or Chatterbox Turbo) on fal.ai with the line + a voice description ("calm, androgynous, slow pace, slight reverb, like speaking from inside a resonant chamber"). Returned audio decoded and played through HRTF PannerNode at azimuth 0°, elevation 0° (directly ahead at ear level). A subtitle bar fades in below the canvas. The spoken word completes the Ghost scene: ambient sound + 3D sources + narration.

"The Ghost speaks." Admin-only. FAL_KEY in use. ~$0.01–0.02/line. Zero new deps. One-cycle build as extension of `53-ghost-sfx` or standalone. RESEARCH.md §105.

Key findings from Cycle 66 (2026-05-20):
- Beatoven Maestro on fal.ai (§101) — `beatoven/music-generation`, $0.10/request, 2.5-min instrumentals + stems. FAL_KEY in use. Inspires `maestro-stems-spatial`.
- Three.js WebGPU Compute Audio (§102) — TSL compute shaders for GPU pitch-shift + delay DSP. Visual AnalyserNode feedback. Zero new deps (three@0.182 installed). Inspires `webgpu-audio-fx`.
- Art2Mus (§103, arxiv 2602.17599, Feb 2026) — direct artwork→music without text intermediary; validates `lyria-ghost` direction. No public API yet; monitor.
- TADA! Activation Steering (§104, arxiv 2602.11910, Feb 2026) — named concept control (instrument/genre/vocal) in audio diffusion at inference time. No API yet; monitor.
- Inworld TTS-1.5 Max (§105) — sub-150ms TTS, expressive, FAL_KEY in use. Inspires `ghost-voice` — Ghost scenes narrated in the Ghost character's voice.
- Conducting gesture recognition (§106, arxiv 2604.27957, Apr 2026) — skeleton tracking → live music tempo/dynamics control. Inspires `conductor` prototype (needs MediaPipe CDN dep, same as `31-gesture-music`).
- Web Audio API v2 Configurable Render Quantum (§107) — sub-3ms audio processing in Q4 2026. Will improve all pitch-detection prototypes automatically when Chrome ships.
- TVTSyn real-time voice timbre conversion (§108, arxiv 2602.09389, Feb 2026) — sub-80ms GPU timbre transfer. Not browser-ready; monitor for WASM port. Inspires future `timbre-morph`.

---

## FROM RESEARCH (Cycle 70, 2026-05-20) — promoted to queue

### sound-to-image — mic audio → acoustic analysis → Flux generated image `[queued, needs FAL_KEY — already in use]`
Route: `/dream/57-sound-to-image`. Mic input (or demo oscillators) runs for 10 seconds. During
capture: extract spectral centroid (brightness), dominant pitch (autocorrelation), energy level,
zero-crossing rate (noisiness), and basic chord quality if pitched (same chroma algorithm as
`28-chord-canvas`). Combine into a natural-language description: "dark, resonant, low-frequency
bass music with slow tempo and cave-like reverb quality" or "bright, energetic treble-dominant
music with a fast pace and C major character." Send to fal.ai `fal-ai/flux/schnell` with the
description augmented by "photorealistic scene, dramatic lighting, no text." The generated image
fades in over 2 seconds on the right panel alongside the audio waveform and feature readout.

"What does your music look like?" This is the conceptual inverse of `1-live` (audio → abstract
color fields) and `13-piano-canvas` (audio → brush strokes): it generates a *semantic image* of
the acoustic scene — what place, what environment, what story does this sound evoke? Inspired by
Sound2Vision (RESEARCH.md §112). FAL_KEY in use. ~$0.01–0.04/image (Flux Schnell). One-cycle
build. Zero new npm deps.

### music-to-ghost — live audio analysis → Ghost scene image generation `[queued, needs FAL_KEY — already in use]`
Route: `/dream/58-music-to-ghost`. Mic input → `28-chord-canvas`-style chroma analysis (12-bin
chroma vector, template-matched to major/minor chord quality) + `38-mood-xy`-style emotion
mapping (arousal from tempo/energy, valence from chord quality). After 8 seconds of audio:
classify into one of four quadrants (energetic+bright, energetic+dark, calm+bright, calm+dark).
Map the quadrant to a pre-written Ghost LoRA prompt: energetic+bright → "Ghost figure in cosmic
ascension, arms outstretched, golden light, flight"; calm+dark → "Ghost figure in stone chamber,
seated meditation, single candle, ancient stone walls"; energetic+dark → "Ghost figure in
underground pool, standing, turbulent water, deep blue light"; calm+bright → "Ghost figure in
forest dawn, walking, morning mist, warm green light." Call the Ghost LoRA image generation API
(`/api/ai-image/generate` with admin auth) with the matching prompt.

Canvas: two panels — top: live scrolling piano roll (from `24-piano-roll` logic), bottom: Ghost
image fades in. Status text shows current detected chord and emotion quadrant. "A 5-second listen
tells the story." Admin-only. FAL_KEY in use. ~$0.02–0.05/image. One-cycle build. Inspired by
multi-agent music-to-image research (RESEARCH.md §114). Simpler than `45-piano-to-ghost` (no
GEMINI_API_KEY needed — image only, no Lyria music generation).

### gemini-voice-lab — A/B Gemini TTS style director for Ghost Voice `[queued, needs FAL_KEY — already in use]`
Route: `/dream/57-gemini-voice-lab` (or extend `/dream/56-ghost-voice`). Two-panel UI. Left: scene
selector (same 6 Ghost scenes) + two style_instructions textareas (A and B). Right: two waveform
strips + play buttons. Click "Generate A" → calls `fal-ai/gemini-tts` with the scene line +
style_instructions A. Click "Generate B" → same line + style_instructions B. Both cached in
sessionStorage. Click A/B to listen and compare. Vote buttons: "A wins", "B wins", "Both fine",
"Try again." Votes stored to localStorage. Pre-loaded examples: A = "calm, slow, stone reverb" vs
B = "whispered, breathy, intimate, very close." Canvas shows two waveform strips; duration and
pitch contour (rough) side by side.

"Fine-tune the Ghost's voice through comparison." Useful for Karel to find the right voice
character. Complements `2-ghost-lab` (which does A/B image comparison). Zero new deps. FAL_KEY in
use. ~$0.01/generation pair. One-cycle build. Research basis: RESEARCH.md §110 (Gemini TTS style
prompting confirmed working — used to fix `56-ghost-voice` this cycle).

Key findings from Cycle 70 (2026-05-20):
- Inworld TTS correct endpoint (§109) — `fal-ai/inworld-tts`, 70+ named voices, no style description
  field. Used Gemini TTS instead for `56-ghost-voice` fix (style_instructions matches Ghost voice descs).
- Gemini TTS on fal.ai (§110) — `fal-ai/gemini-tts`, natural-language style_instructions, 30+ voices,
  FAL_KEY in use. Fixed `56-ghost-voice` endpoint this cycle. Inspires `gemini-voice-lab`.
- Live Music Models paper (§111, arxiv 2508.04651) — Magenta RealTime open-weights confirmed
  production-quality. Lyria RealTime API confirmed for `30-lyria-jam`. Both require GEMINI_API_KEY.
- Sound2Vision (§112, arxiv 2412.06209) — audio → semantic image via cross-modal alignment.
  No public API; browser-approachable via acoustic analysis → text → fal.ai Flux. Inspires `sound-to-image`.
- LARA-Gen (§113, arxiv 2510.05875) — continuous valence×arousal emotion control for music generation.
  No API yet. Validates `38-mood-xy` + `47-mood-journey` design. Monitor for endpoint.
- Multi-Agent Music-to-Image (§114, arxiv 2512.23320) — joint music semantics + affect → image.
  No API yet. Inspires `58-music-to-ghost` (FAL_KEY-only, Ghost LoRA images from audio emotion).
- Segment-Factorized Full-Song (§115, arxiv 2510.05881) — real-time streaming symbolic piano gen.
  Future upgrade path for `33-aria-companion`. No API yet; monitor.
- SynthVC streaming voice conversion (§116, arxiv 2510.09245) — 77ms end-to-end latency,
  zero-shot. Future `voice-morph` prototype. No browser/WASM port yet; monitor.

---

## FROM RESEARCH (Cycle 74, 2026-05-21) — promoted to queue

### music-palette — live emotion→color palette from audio `[queued, zero deps, zero API]`
Route: `/dream/60-music-palette`. Mic input (or demo LFOs) → 6-band FFT (`1-live` pipeline) →
arousal/valence estimation (same mapping as `38-mood-xy`): bass energy → arousal, chord quality
from chroma → valence. Compute a 5-color HSL palette from the current coordinates: valence maps
hue anchor (happy=45–80° warm yellows/oranges, neutral=150° green-teal, sad=240–270° blues/purples);
arousal maps lightness (energetic=L70%, calm=L30%); frequency richness maps saturation. Five swatches
are complementary offsets from the anchor hue (±30°, ±60°, ±90° in HSL space). Palette updates
every second via exponential moving average — it breathes slowly with the music.

Canvas: upper half = five large colored rectangles labeled with their hex codes + HSL values.
Lower half = the `1-live`-style six-band bloom ring showing the current audio energy. A "Download
SVG" button exports the current 5-color palette as an SVG file (labelled with the detected arousal/valence
values). Demo mode: same wandering LFO oscillators as other no-mic prototypes — watch the palette
drift from warm to cool as the LFOs cycle.

"Your music as a color story." Zero deps, zero API. First prototype that makes the emotion→color
connection visible and downloadable. Natural complement to `38-mood-xy` (emotion as music) and
`13-piano-canvas` (music as painting). One-cycle build. Research basis: Music2Palette (RESEARCH.md §120).

### lyrics-journey — Ghost journey as a sung AI composition `[queued, needs FAL_KEY — already in use]`
Route: `/dream/60-lyrics-journey`. Admin-only. ElevenLabs Music (`fal-ai/elevenlabs/music`) with
a full Ghost journey `composition_plan`. Six sections, one per Ghost narrative scene:

- **Stone Chamber** (30s, minor, sparse piano): "The resonance here is ancient. / Let yourself be absorbed by it."
- **Root Portal** (25s, ominous, bass drone): "Something stirs beneath the roots. / A low note. Then silence."
- **Underground Pool** (30s, ethereal, water textures): "The water remembers every sound. / That has passed through this place."
- **Tiny Planet** (20s, airy, high strings): "A single breath. / The horizon wraps around you."
- **Forest Dawn** (30s, hopeful, strings rising): "The first light is also the first sound. / They arrive together."
- **Cosmic Ascension** (35s, transcendent, full orchestral): "You are not rising. / The world is receding."

User can edit any section's lyrics or style before generating. Generate button → composition_plan sent
to ElevenLabs Music → 2.5–3 minute sung piece plays through the live-bloom visualizer. Waveform strip
shows the full duration; section markers show where each Ghost scene begins.

This is the first prototype where the Ghost character **sings**. Different from `48-arc-compose`
(structural arc, instrumental) and `6-compose` (text prompt, no lyrics): this one uses the actual
Ghost narrative as lyrics and the journey arc as the musical structure. The output is a literal Ghost
journey album track. Budget: ~$2.40/generation for a 3-min piece. FAL_KEY in use. One cycle.
Research basis: RESEARCH.md §118 (ElevenLabs Music composition_plan confirmed API).

### orpheus-voice — phrase-level emotion tags for Ghost TTS `[queued, needs FAL_KEY — already in use]`
Route: Extend `/dream/59-gemini-voice-lab` OR standalone `/dream/61-orpheus-voice`. Adds Orpheus TTS
(`fal-ai/orpheus-tts`, $0.05/1000 chars) as a third comparison track alongside the two Gemini variants.
Orpheus uses **phrase-level XML-style emotional tags** embedded in the text — a fundamentally different
control paradigm from Gemini's global `style_instructions`:

- Gemini: `style_instructions = "calm, androgynous, very slow, stone reverb"` → global voice character
- Orpheus: `"The <reverent>resonance</reverent> here is ancient. Let yourself be <whispers>absorbed</whispers> by it."` → per-word direction

Eight available tags: `<sad>`, `<reverent>`, `<fearful>`, `<excited>`, `<happy>`, `<whispers>`,
`<disgusted>`, `<surprised>`. UI: a "C — Orpheus Tags" textarea for each scene, pre-loaded with an
example using bracket syntax. Generate C button calls `fal-ai/orpheus-tts`. Three waveform strips A/B/C
with play buttons. Vote: A wins / B wins / C wins / etc.

The emotional bracket syntax opens a new dimension: you can make a single line change register, pause,
whisper. A <whispers> word in the middle of a sentence breaks differently from a whispered sentence.
FAL_KEY in use. Zero new deps. One cycle. Research basis: RESEARCH.md §117.

### collage-compose — image + hum + word → music `[queued, needs FAL_KEY — already in use]`
Route: `/dream/62-collage-compose`. Three input slots: (1) a Ghost scene **image** — either from a
preset thumbnail (Stone Chamber, Forest Dawn, Cosmic Ascension placeholder images) or drag-and-drop
your own; (2) a short **hum** recording (3–8s via mic, same `MediaRecorder` pattern as `43-stable-extend`);
(3) a **mood word** (textarea, e.g. "ancient", "ascending", "lost", "dawn"). Click **Compose →**.

Processing before the API call:
- Extract dominant color temperature from the image (compute average HSL of sampled pixels): warm colors
  → "warm, golden, glowing" descriptor; cool → "cold, vast, reverberant."
- Run autocorrelation pitch detection on the hum → identify the dominant pitch and tempo feel (BPM estimate
  from zero-crossing periodicity) → "melody centered on E3, slow 52 BPM" or "quick rising phrase, 90 BPM."
- Combine all three into a rich style prompt: "[warm, golden, ancient dawn light] + [slow melodic phrase centered on E3, 52 BPM] + [ascending, hopeful]" → sent to ACE-Step (`fal-ai/ace-step`) with `[inst]` lyrics tag.

The generated 30s track plays through the bloom visualizer. Waveform strip. Download MP3.

"What if your world designed your music?" The multimodal combination produces prompts no one would
type manually. A Ghost scene image combined with a hum establishes tonal center, mood, and visual
context simultaneously — the output should feel more precisely tuned than any text-only prompt. Zero
new npm deps. FAL_KEY in use, $0.006/track (ACE-Step). One cycle.
Research basis: RESEARCH.md §121 (Mozualization) and §125 (Sonauto V2).

Key findings from Cycle 74 (2026-05-21):
- Orpheus TTS on fal.ai (§117) — phrase-level `<emotion>` tags in text, $0.001/Ghost line, FAL_KEY in use. Inspires `orpheus-voice`: 3-way A/B/C Ghost voice comparison (Gemini global vs Gemini alt vs Orpheus phrase-level).
- ElevenLabs Music composition_plan confirmed (§118) — lyrics per section confirmed in API schema. Inspires `lyrics-journey`: full Ghost journey as a sung composition, 6 sections with Ghost narrative as lyrics. $2.40/generation.
- StyleStream (§119, arxiv 2602.20113, ICLR 2026) — 1s latency real-time zero-shot voice style conversion. GitHub available. No fal.ai endpoint yet; monitor for `voice-style` prototype.
- Music2Palette (§120, arxiv 2507.04758, ACM MM 2025) — emotion-aligned color palette from music. Inspires `music-palette`: browser-native zero-dep live palette from audio arousal/valence.
- Mozualization (§121, arxiv 2504.13891, CHI 2025) — multimodal music gen from images + audio clips + keywords. Inspires `collage-compose`.
- Sonic4D (§122, arxiv 2506.15759) — spatial audio from video, physics-based. Future direction; no API yet.
- Three.js r184 (§123) — memory fix + WebGPU Baseline in all browsers. All Three.js prototypes stable; zero-cost WebGPU renderer upgrade available.
- AI Music Psychotherapy for D/HH (§124, arxiv 2603.07963) — co-writing process is itself therapeutic. Inspires `co-write` direction.
- Sonauto V2 (§125, fal.ai) — full songs with vocals, BPM control, $0.075/song. Good backend for `collage-compose`.
- MuVi + SyncDIT (§126, arxiv 2410.12957) — video↔music semantic + rhythmic alignment. Future direction for Ghost animate + music pairing.

---

## FROM RESEARCH (Cycle 78, 2026-05-21) — promoted to queue

### synesthetic-sketch — multi-dimensional synesthetic canvas `[queued, zero deps]`
Route: `/dream/63-synesthetic-sketch`. Six independent audio features each control a separate visual
dimension on a single accumulated Canvas2D. NOT just color (already done in `1-live`, `60-music-palette`).
Each audio frame deposits a "musical object" on the canvas:
- spectral centroid → hue (same mapping as `1-live`)
- spectral bandwidth → shape complexity: circle=pure tone, hexagon=mid-spread, star=wide spread
- rhythm regularity (IOR variance over last 8 onsets) → object size jitter (regular=tight cluster, irregular=scattered)
- harmonic peak count (FFT peak-picking above noise floor) → number of inner rings
- amplitude → scale of the object
- onset → bright spark burst at a random position + alpha flash

Objects accumulate across the session (like `13-piano-canvas` brush strokes but as shapes, not paths).
Canvas does NOT scroll — it fills. Each new object is composited additively at 60% alpha over prior objects,
building up a luminous layered field. A slow decay pass (0.2% per frame) prevents permanent burn-in.
Download as PNG.

Demo mode: same 6 incommensurable LFO oscillators as `11-terrain` and `17-acoustic-trail` — slow breathing
that cycles through all shape types.

"Not just what color your music is — what shape it is." The 62 existing prototypes map audio to color, fluid,
particles, geometry. None map audio to morphological object *shape* in a multi-dimensional way. A pure sine
tone leaves a single circle. A chord with rich harmonics leaves a multi-ringed star. A rhythmically precise
performance builds a tight grid of shapes; an improvisational performance scatters them wildly. The canvas
IS the acoustic record of a session, readable by shape as much as by color.

Zero external deps. One-cycle build. Research basis: musicolors (RESEARCH.md §131).

### eleven-dialogue — Ghost scene as AI-generated two-character drama `[queued, needs FAL_KEY — already in use]`
Route: `/dream/63-eleven-dialogue`. Six Ghost scenes, each with a pre-scripted 3-line dramatic exchange
between two characters: **Ghost** (calm, ancient, knowing) and **Visitor** (awed, nervous, curious).
ElevenLabs Eleven V3 Text-to-Dialogue (`fal-ai/elevenlabs/tts/eleven-v3`) renders both voices in a single
API call, matching prosody and emotional range across the exchange.

Pre-loaded Stone Chamber exchange:
- Ghost `[slowly, reverently] The resonance here [pauses] is ancient.`
- Visitor `[nervous, awed] I didn't expect it to feel this alive.`
- Ghost `[whispers] Everything that ever sounded here — still does. [pauses] If you know how to listen.`

Both characters' lines shown in editable textareas (Ghost = left, Visitor = right). Generate → single API call
→ audio plays back. Canvas: two side-by-side waveform strips (Ghost = warm amber, Visitor = cool blue) with
animated character-by-character subtitle per line. Scene transitions via the top row. Six scenes × 3-line
dialogue = 30 lines total, each with Eleven V3 inline tags pre-loaded.

"The Ghost is no longer alone." This is the first prototype where the Ghost speaks *to* someone rather than
narrating to the user. Creates a dramatically different listening experience: you become the Visitor's presence.
Different from `56-ghost-voice` (monologue) and `61-orpheus-voice` (A/B style comparison). FAL_KEY in use,
~$0.02/scene ($0.10/1000 chars × ~200 chars/scene). Zero new deps. One cycle. Research basis: RESEARCH.md §§127, 134.

### dialogue-score — score-constrained AI piano dialogue `[demoable — /dream/65-dialogue-score, Cycle 81]`
Route: `/dream/65-dialogue-score` (64 was taken by eleven-dialogue). Extends `33-aria-companion`. After the user plays a phrase (2s silence
→ trigger), instead of a pure Markov chain response, the AI's reply is **contour-constrained**: detect
whether the user's phrase was overall ascending, descending, or arch-shaped (peak in middle) by averaging
inter-note pitch deltas. The AI response then follows the same shape — ascending user phrase → AI responds
with ascending motif, descending → AI continues descent, arch → AI mirrors the arch. Markov transition
probabilities still bias the note selection (preserving the "learns your style" property), but the pitch
range for each step is additionally constrained to enforce the target contour direction.

Visual: same split dual piano roll as `33-aria-companion` (YOU top / ARIA bottom). A small contour
indicator shows the detected shape of the user's phrase and the planned shape of the AI response (using
the `39-anticipate` ghost-note preview — ARIA's contour is visible before it plays). "The AI mirrors your
musical thought." Inspired by "Dialogue in Resonance" (arxiv 2505.16259) where the computer's responses
follow score-derived constraints rather than pure improvisation — the composition and the dialogue coexist.
Zero deps. One cycle. Research basis: RESEARCH.md §129.

### ghost-v3-voice — Ghost narration via ElevenLabs Eleven V3 audio tags `[queued, needs FAL_KEY — already in use]`
Route: extend `/dream/61-orpheus-voice` (add column D) OR standalone `/dream/64-ghost-v3-voice`. Six Ghost
scenes, each narrated using ElevenLabs Eleven V3's inline audio tag system. Pre-loaded tags chosen to match
the Ghost emotional arc:
- Stone Chamber: `[slowly, reverently] The resonance here [pauses] is ancient. Let yourself [whispers] be absorbed by it.`
- Root Portal: `[low, measured] Something stirs [pauses] beneath the roots. [nervous pause] A low note. Then silence.`
- Underground Pool: `[dreamily] The water remembers [pauses] every sound [whispers] that has passed through this place.`
- Tiny Planet: `A single breath. [pauses] The horizon [softly] wraps around you.`
- Forest Dawn: `The first light [pauses, warmly] is also the first sound. They arrive [gently] together.`
- Cosmic Ascension: `[flatly, vast] You are not rising. [long pause] The world [resigned tone] is receding.`

Eleven V3's inline tags work as mid-sentence emotional beats — not per-word direction (Orpheus) or global
style (Gemini) but per-phrase beats. A `[pauses]` mid-sentence creates a real silence; `[whispers]` on the
next phrase drops to intimate register; `[resigned tone]` changes vocal quality. All tags editable. Waveform
strip per scene. ▶ play.

If added to `61-orpheus-voice` as column D: four-way comparison A=Gemini global / B=Gemini alt /
C=Orpheus XML / D=Eleven V3 inline tags — the most complete Ghost TTS study in the sandbox.
FAL_KEY in use, ~$0.005/scene line (cheaper than Orpheus). Zero new deps. One cycle.
Research basis: RESEARCH.md §127.

Key findings from Cycle 78 (2026-05-21):
- ElevenLabs Eleven V3 (§127, Feb 2026) — inline audio tag system `[whispers]`, `[pauses]`, `[resigned tone]` for per-phrase emotional beats. Different from Orpheus XML (per-word) and Gemini (global). $0.10/1000 chars, FAL_KEY in use. Text-to-Dialogue mode for multi-speaker scenes. Inspires `ghost-v3-voice` and `eleven-dialogue`.
- ACE-Step 1.5 hybrid architecture (§128, Jan 2026) — decoupled reasoning + diffusion, sub-second first token. Validates `44-vocal-bgm` and `62-collage-compose` patterns. Polish opportunity: streaming progress bar showing first-token arrival.
- Dialogue in Resonance (§129, arxiv 2505.16259) — piano + real-time transcription + score-constrained dialogue between human and computer piano. Inspires `dialogue-score`: extend `33-aria-companion` with contour-constrained AI response.
- ShaderVine (§130, April 2026) — MIT browser WebGPU shader editor with MCP interface for AI agents. Inspires `wgsl-synth`: minimal WGSL editor with pre-wired audio uniforms. Also relevant to `claude-shader` (needs ANTHROPIC_API_KEY).
- musicolors (§131, arxiv 2503.14220) — web-based synesthetic music visualization; multi-dimensional (not just color). Inspires `synesthetic-sketch`: each audio feature → different visual shape property (hue + shape complexity + ring count + scatter).
- SAMUeL (§132, arxiv 2507.19991) — vocal-conditioned music gen, 220× smaller than SOTA, 52× faster. Future upgrade for `44-vocal-bgm` when fal.ai endpoint appears.
- BINAQUAL (§133, arxiv 2505.11915) — binaural localization quality metric. Validates HRTF work in `7-spatial`, `29-scene-spatial`, `53-ghost-sfx`. Research-only, not a prototype.
- Eleven V3 Text-to-Dialogue (§134) — multi-speaker dramatic scene in a single API call. Inspires `eleven-dialogue`: Ghost + Visitor 3-line scene per narrative location.
- WebGPU audio 2026 status (§135) — SharedArrayBuffer streaming path enables real-time GPU synthesis. COOP header needed; worth asking Karel if Vercel supports it. Upgrade path for `27-gpu-additive`.
- CHI 2026 creative AI taxonomy (§136) — four interaction modes: reactive / compositional / dialogic / generative. Sandbox covers first two well; dialogic (only `33-aria-companion`, `39-anticipate`) and generative (only `47-mood-journey`) are underrepresented. Priority: build `dialogue-score` (dialogic) and confirm Gemini key for `lyria-jam` (generative).

---

## FROM RESEARCH (Cycle 82, 2026-05-21) — promoted to queue

### chatterbox-ghost — voice-cloned Ghost narration via Chatterbox Turbo `[queued, needs FAL_KEY — already in use]`
Route: `/dream/66-chatterbox-ghost`. Six Ghost scenes. Each scene has a pre-written narration line (same as `56-ghost-voice`). A **voice clone** input: either a short URL to a pre-recorded 5–10s audio sample (bundled as a public asset), or a live browser mic recording. Chatterbox Turbo renders the Ghost narration in the cloned voice at `fal-ai/chatterbox/text-to-speech`, with paralinguistic tags embedded mid-sentence:

- Stone Chamber: `The resonance here is ancient. [sigh] Let yourself be absorbed by it.`
- Root Portal: `[slowly] Something stirs beneath the roots. [gasp] A low note. Then silence.`
- Underground Pool: `The water remembers every sound [sigh] that has passed through this place.`
- Tiny Planet: `A single breath. [laugh softly] The horizon wraps around you.`
- Forest Dawn: `The first light is also the first sound. [softly] They arrive together.`
- Cosmic Ascension: `[flatly] You are not rising. [long pause] The world is receding.`

UI: record or paste a URL to a 5–10s voice reference clip → "Generate Ghost voices" button fires six concurrent API calls → six waveform strips appear. ▶ plays each. "Exaggeration" slider (0.0–1.0) controls emotional intensity across all generated voices.

**Why this is different from all prior Ghost voice prototypes**: `56-ghost-voice` (Gemini — global style direction), `61-orpheus-voice` (Orpheus — per-word XML tags), `64-eleven-dialogue` (ElevenLabs V3 — per-phrase acting direction) all use pre-existing model voices. Chatterbox Turbo clones any voice from 5 seconds of audio. First prototype where Karel can hear the Ghost speak in a **specific human voice** — record himself reading one line, and hear all six scenes in his voice. Or record an actor, or a synthesized ghost-like reference voice. The paralinguistic tags add physical vocal actions (`[sigh]`, `[gasp]`) that complement the emotional tag paradigms from Orpheus and ElevenLabs V3. Four TTS paradigms now compared: Gemini (global) / Orpheus (per-word XML) / ElevenLabs V3 (per-phrase acting) / Chatterbox (voice-clone + physical action tags).

FAL_KEY in use. $0.025/1000 chars — cheaper than all prior options. Zero new npm deps. One cycle. RESEARCH.md §137.

### structure-viz — self-similarity matrix: your music as a map of itself `[demoable — /dream/67-structure-viz, Cycle 84]`
Route: `/dream/66-structure-viz`. Mic input (or demo oscillators) → accumulate bar-length FFT magnitude vectors (1 vector per ~1.5s of audio, up to 64 bars = ~96s). Compute an N×N **self-similarity matrix** (SSM): entry (i,j) = cosine similarity between bar i and bar j's FFT vector. Display the SSM as a Canvas2D colormap: dark = dissimilar, bright = similar. Apply a simple block-diagonal segmentation pass (find the rows/columns where average similarity drops, marking section boundaries) → draw colored vertical lines on a horizontal timeline strip below the SSM. Section blocks are labeled A / B / A' / C based on similarity clustering.

Live mode: SSM grows in real time as you play. Each new bar appends a new row+column, and the colormap updates. Repeating material (a chorus coming back) lights up as bright off-diagonal squares. A simple 1-minute demo melody with ABA structure creates a visible 3×3 block pattern. Canvas resizes as the SSM grows (max 64×64 → 320×320 pixels).

"Your music as a map of itself." This is the **first prototype that shows structure rather than content** — not what frequencies are present, but how the sections relate. A pianist who plays an ABA form sees the A-sections appear as matching diagonal blocks; the B section appears darker on the off-diagonal. The SSM is a standard MIR technique (no ML needed — FFT vectors are sufficient for detecting repetition structure). Zero external deps. One-cycle build. Research basis: RESEARCH.md §143.

### improv-expand — ImprovNet-style seed-to-improvisation `[queued, needs API endpoint]`
Route: `/dream/67-improv-expand`. User plays an 8-bar phrase (or uses demo MIDI) → select genre (jazz, classical, blues, bossa nova) and style degree slider (0.0 = close to original, 1.0 = free improvisation) → ImprovNet API generates a 32-bar structured improvisation that develops and transforms the seed material. Display: piano roll shows seed (amber, left panel) and AI improvisation (blue, right panel). Play both sequentially. Download generated MIDI.

"Your phrase, fully developed." Different from `33-aria-companion` (immediate Markov response) and `65-dialogue-score` (contour mirroring): ImprovNet generates a complete, structured piece that develops the seed across 32 bars rather than responding phrase-by-phrase. This is the first prototype where the AI generates a **complete compositional unit** from the user's seed. Needs an ImprovNet API endpoint — no fal.ai deployment found yet. Monitor HuggingFace for Spaces deployment. Also monitor for local server path. Zero new npm deps (server route calls API). RESEARCH.md §138.

### wgsl-synth — minimal WGSL shader editor with pre-wired audio uniforms `[queued, zero deps]`
Route: `/dream/68-wgsl-synth`. Inspired by ShaderVine (RESEARCH.md §130): a split-screen WebGPU WGSL shader editor. Left: CodeMirror textarea (loaded from CDN, ~200KB, no package.json change) with a pre-wired WGSL fragment shader template. Right: fullscreen WebGPU canvas running the shader. Six audio uniforms pre-wired and updated every frame from the Web Audio AnalyserNode: `uBass`, `uMid`, `uTreble`, `uOnset`, `uTime`, `uBPM`. Pre-loaded example shader: a pulsing radial grid where `uBass` expands the rings and `uOnset` flashes white. Edit any WGSL line → shader recompiles live (debounced 400ms). GLSL compile error messages shown inline.

Demo mode: LFO oscillators animate the shader without mic permissions. Mic mode: live audio drives the uniforms. "Write a WGSL shader that responds to your piano." Different from `55-webgpu-audio-fx` (which runs GPU DSP on audio *data*): this runs GPU *visualization* shaders with audio *uniforms*. The user's code is the visualization; the audio is the parameter. Different from `claude-shader` (which calls Claude to generate the WGSL): this is a manual editor for users who want to write their own. These two prototypes are the lowest and highest of an "AI assistance" spectrum. Zero new npm deps (CodeMirror from CDN). One-cycle build. RESEARCH.md §130 (ShaderVine) + §135 (WebGPU audio).

Key findings from Cycle 82 (2026-05-21):
- Chatterbox Turbo on fal.ai (§137) — open-source TTS with 5s voice cloning + paralinguistic tags `[sigh]`, `[gasp]`. $0.025/1000 chars, FAL_KEY in use. Most affordable TTS in the sandbox. First model that can clone Karel's own voice. Inspires `chatterbox-ghost`.
- ImprovNet (§138, arxiv 2502.04522, Feb 2026) — seed → structured 32-bar improvisation with controllable style transfer. Cross-genre (Bach→jazz). No API yet; monitor. Inspires `improv-expand`.
- Pianist Transformer (§139, arxiv 2512.02652, Dec 2025) — 135M params, human-level expressive piano rendering, Apache 2.0, HuggingFace demo. No API; proxy via HuggingFace Spaces. Inspires `expressive-render`.
- D3PIA (§140, arxiv 2602.03523, Feb 2026) — discrete diffusion piano accompaniment from melody + chord symbols. No API yet. Inspires `lead-sheet` prototype.
- PianoFlow (§141, arxiv 2604.12856, Apr 2026) — real-time bimanual piano hand motion from audio, 9× faster inference. Inspires `piano-hands` 3D visualization prototype.
- NCLMCTT (§142, ICLR 2026) — zero-shot instrument timbre cloning from 1–5s reference. No fal.ai endpoint. Inspires `timbre-clone`.
- Self-similarity matrix structure analysis (§143, arxiv 2603.27218, Mar 2026) — unsupervised section detection via SSM + CBM. Zero deps, browser-native. Inspires `structure-viz`.
- Anchored Cyclic Generation (§144, arxiv 2604.05343, Apr 2026) — prevents semantic drift in long-form music generation via hierarchical anchoring. Validates `48-arc-compose` design; no new prototype.
- Etude piano cover generation (§145, arxiv 2509.16522, Sep 2025) — polyphonic music → pianistic piano cover. Three-stage pipeline. No API yet. Inspires `piano-cover`.
- StreamMark audio watermarking (§146, arxiv 2604.11917, Apr 2026) — AI audio provenance tracking. Research awareness; no prototype recommended.

---

## FROM RESEARCH (Cycle 86, 2026-05-21) — promoted to queue

### oracle-music — Musical I-Ching oracle `[queued, zero deps, zero API]`
Route: `/dream/69-oracle-music`. Three coin tosses × 6 lines → one of 64 hexagrams. Each of the 64 hexagrams maps to a set of musical parameters drawn from classical I-Ching commentary (element, season, archetypal quality → musical equivalent):
- Hexagram 1 (Creative/Heaven/Metal): pentatonic C major, bright register (C4–C6), 80 BPM, strong sustained chords, high saturation
- Hexagram 2 (Receptive/Earth/Yin): slow minor arpeggios, deep register (C2–C3), 35 BPM, sparse, open fifths
- Hexagram 29 (Abysmal/Water): descending chromatic lines, 50 BPM, thick resonant bass, unresolved tension
- Hexagram 30 (Clinging/Fire): ascending bright diminished scales, 120 BPM, thin upper register
- Hexagram 51 (Thunder/Arousing): sharp onset pulses, 140 BPM, percussive attack, sudden loud/soft contrasts
- ... (all 64 mapped in a lookup table, ~60 lines of data)

**Visual sequence**: three animated coin tosses (each coin face shows yin/yin or yang/yang/yin — 3 coins × sum = line type), building a hexagram line-by-line from the bottom. Hexagram symbol drawn in animated strokes. English title ("The Creative") fades in. Traditional commentary line (one sentence, pre-written from Wilhelm translation public domain). Then music begins — synthesized with the same oscillator + filter engine as `38-mood-xy` and `52-concept-steer`. A subtle "changing lines" visual effect where any line marked as "moving" glows and shifts.

"The oracle answers in sound." First prototype connecting music to a divination tradition. High surprise factor — something no audio software has done before. Zero deps, zero API. One-cycle build. Research basis: RESEARCH.md §151 (Music of Changing Lines, arxiv 2605.20386). Optional future layer: if GEMINI_API_KEY available, add a Lyria call to generate a 30s piece from the hexagram's musical description, playing alongside the synthesized music.

### pitch-algo-compare — three pitch detection algorithms running simultaneously `[queued, zero deps]`
Route: `/dream/69-pitch-algo-compare`. Mic input → simultaneously run three pitch detection algorithms on every 2048-sample FFT buffer:
1. **Autocorrelation** (our current approach across 8+ prototypes) — normalized peak correlation, octave-fold at 55–880 Hz range
2. **YIN** — autocorrelation variant with aperiodicity threshold check (~40 lines of JS); reduces octave errors by ~15%
3. **HPS (Harmonic Product Spectrum)** — multiplies harmonically downsampled FFT spectra (4 harmonics), better for piano/violin; poorly defined for pure sine tones

Canvas: a vertical piano roll grid (C2–C7, same as `24-piano-roll`). Three horizontal cursors per frame: orange (autocorrelation), blue (YIN), green (HPS). When all three agree within ±1 semitone, a bold gold cursor overlays them ("consensus"). When they disagree, the spread is visible. Each algorithm also shows a "confidence bar" (autocorrelation peak correlation coefficient; YIN aperiodicity; HPS peak-to-floor ratio). A faint piano tone plays for the consensus pitch (0.15s triangle-wave envelope).

Demo mode: same demo oscillators as other prototypes — three clean sine tones at known frequencies where all algorithms should agree. Mic mode: play piano. On C4: all three agree. On C2: algorithms diverge (sub-bass confusion). On a chord: HPS tracks the fundamental best; autocorrelation jumps to harmonics.

"Which algorithm is right? Sometimes all of them. Sometimes none." Educational: makes pitch detection internals visible. Utility: directly informs the `neural-pitch` upgrade decision (§61, §148). Zero new deps (YIN and HPS are pure JS, ~30 lines each). One-cycle build.

### shader-evolve — genetic evolution of audio-reactive WGSL shaders `[queued, zero deps]`
Route: `/dream/70-shader-evolve`. Inspired by ShaderVine's genetic evolution system (RESEARCH.md §147). Start from the `68-wgsl-synth` default shader (pulsing radial rings + grid shimmer + onset flash). Display **four mutated variants** in a 2×2 WebGPU canvas grid. Each variant randomly perturbs 2–4 numeric constants in the shader (ring frequency, color rotation speed, HSV saturation coefficient, onset flash decay time, grid line spacing) while keeping the structure valid WGSL. All four run simultaneously at ~15fps each (smaller canvas, lower frame rate to stay within GPU budget).

Click any canvas to "select" it (it grows to fill the right panel at full 60fps). Click "Evolve from selection" → breed the selected shader with 3 fresh mutations. Click "Add to gallery" → save this shader to localStorage. Click "Edit" → opens the shader in a `68-wgsl-synth`-style textarea for manual refinement. Gallery row at the bottom shows the last 6 saved shaders as animated thumbnails.

"Natural selection of shaders." The first prototype where the creative process is *selection* rather than *composition* — you don't write the shader; you judge it. The audio uniforms keep running throughout, so the evolving shaders respond to demo LFOs (or mic input). No external deps — same WebGPU pipeline as `68-wgsl-synth`. Zero new npm deps. One-cycle build.

### ghost-lip — Inworld TTS viseme timing → animated Ghost face `[queued, needs FAL_KEY — already in use]`
Route: `/dream/70-ghost-lip`. Extends `56-ghost-voice` (Ghost narration via Gemini TTS). Switches the TTS backend to **Inworld TTS-1.5 Max** (`fal-ai/inworld-tts`) which, unlike Gemini TTS, returns **viseme-level timestamp data** alongside the audio — a sequence of (time_ms, viseme_id) events specifying exactly which mouth shape is active at each moment during speech.

Canvas: a stylized Ghost face — abstract, minimal, not realistic. A dark oval (head), two narrow white ellipses (eyes, blinking every 4–7s), and a central path that morphs between 6 mouth shapes keyed to viseme groups:
- Closed (silence, M/B/P)
- Small open (E/eh)
- Wide open (A/ah)
- Rounded (O/oo)
- Teeth together (S/Z/T)
- Wide with teeth (EE)

As the narration plays, viseme timestamps drive the mouth morph via `requestAnimationFrame`. The mouth opens for loud vowels, closes for consonants, stays shut in pauses. The eyes blink independently on a slow random interval. Color: ghost-white face on deep black; warm amber glow on the eye/mouth shapes matching the `1-live` mid-frequency hue.

Six scenes selectable. Same narration lines as `56-ghost-voice`. "The Ghost has a face." First prototype giving the Ghost character a visual speaking presence — not an image (static) or an orb (abstract), but a face that moves when it speaks. FAL_KEY in use. ~$0.005/narration. Zero new npm deps. One-cycle build. Research basis: RESEARCH.md §155.

### browser-stems — upload any audio, split to 4 stems in-browser, hear them in 3D `[queued, needs Karel OK on CDN ONNX dep ~200MB cached]`
Route: `/dream/71-browser-stems`. Drag-and-drop any audio file → in-browser Demucs v4 (htdemucs via ONNX Runtime Web + WebGPU acceleration) separates it into 4 stems: **drums, bass, other, vocals/melody**. Processing time: ~3–5 min for a 4-min song on a WebGPU laptop; ~15–20 min CPU fallback (shown in the UI upfront). All processing is local — audio never leaves the device. Progress bar with estimated time remaining.

After separation: each stem routes to a dedicated `PannerNode` with HRTF model: drums from above (+60° elevation), bass from below (−30°), other from front-left (−25° azimuth), vocals from front-right (+25°). Canvas: same top-down sphere as `29-scene-spatial` and `53-ghost-sfx` — four colored dots, draggable. Per-stem gain slider. Wear headphones.

"Your music. Any music. Yours." This is `54-maestro-stems` but for audio you already have — a recording you made, a Resonance session, your favorite piece. Zero API cost. Zero data upload. Completely private. The HRTF positioning of real, separated stems (not frequency-band splits like `7-spatial`) means the drums are overhead *because they're the drums*, not because they're in the treble range. Demucs CDN dep: ~200MB ONNX model + ONNX Runtime Web JS (~2MB) — cached after first load, no subsequent network use. Two-cycle build. Needs Karel OK on CDN dep size. Research basis: RESEARCH.md §§149, 154.

Key findings from Cycle 86 (2026-05-21):
- ShaderVine (§147, April 2026) — MIT WebGPU shader editor with genetic evolution + MCP server. 16 compute sims. Natural partner to `68-wgsl-synth`. Inspires `shader-evolve`: select from mutations, breed favorites.
- Voice Composer (§148, HN Jan 2026) — 4-algorithm simultaneous pitch detection (CREPE/YIN/FFT/AMDF). Key insight: YIN and HPS are ~30 lines of pure JS and can run alongside our existing autocorrelation. Inspires `pitch-algo-compare`.
- Demucs-web (§§149, 154, April 2026) — htdemucs running in-browser via ONNX + WebGPU; 3–5 min for 4-min song, fully private. Inspires `browser-stems`. Needs Karel OK on ~200MB model.
- Art2Mus (§150, arxiv 2602.17599, Feb 2026) — direct artwork→music via visual latent diffusion. No API yet. Future `art-to-music`. Zero-dep HSL approximation possible now.
- I-Ching musical oracle (§151, arxiv 2605.20386, May 2026) — coin casting → hexagram → LLM → Lyria music. Zero-dep version: 64 hexagrams → musical parameters. High surprise. Inspires `oracle-music`.
- AuDirector (§152, arxiv 2605.11866, May 2026) — multi-agent long-form audio narrative with character profiles + self-correction. Architecture model for future Ghost narrative arc. No standalone prototype.
- ICME 2026 text-to-music winners (§153, May 2026) — generation quality jump over ACE-Step. Monitor fal.ai for new endpoints; upgrade `6-compose` when available.
- Inworld TTS viseme timing (§155) — new detail: Inworld TTS returns mouth shape timestamps (viseme alignment). FAL_KEY in use. Inspires `ghost-lip`: animated Ghost face with synced mouth movement.
- Pitch algorithm comparison (§156) — YIN reduces octave errors ~15% vs. autocorrelation; HPS ~30 lines JS. Direct informant for `neural-pitch` upgrade decision. Inspires `pitch-algo-compare`.

---

## 2026-05-21 — NEW DIRECTION FROM KAREL (read AGENT.md "Current direction")

Karel sent new directives. Read them in `AGENT.md` under "Current direction". Tl;dr: **no more AI voice gen**; **image-gen INSIDE AV experiments yes**; **spread across journeys, not just Ghost**; **use his real piano music from the Paths as input**; **research TouchDesigner / Houdini patterns deeply**. The agent should fold these into idea selection on the next cycle.

### Seeded ideas matching the new direction

`queued` — fresh slugs ready to build. Pick from these (or do a research cycle first) on the next fire.

- **`72-paths-visualizer`** — Read the user's `journey_paths` table (or hit `/api/recordings/...`) to pull the actual audio URLs of his Welcome Home album, then play each track in sequence while a strange-attractor + bloom visualization responds in realtime. The user's OWN music as the audio source, not synthesized. Read `src/lib/journeys/journeys.ts` and `src/app/api/audio/[id]/route.ts` to figure out how to fetch the audio.
- **`73-journey-arc-spread`** — Like `5-arcs` (already shipped) but a single page that lets the visitor cycle through 5 of Karel's *different* journey themes (NOT just Ghost): Cosmic Homecoming, Earth Grounding, Inner Sanctuary, Ocean Breath, Snowflake. Each theme drives a distinct shader-arc. Use the journey definitions from `src/lib/journeys/journeys.ts` directly so this stays in sync with what he's published.
- **`74-touchdesigner-feedback`** — Port a classic TouchDesigner TOP feedback loop (a TOP gets composited with a delayed copy of itself + slight transform = endless evolving recursion) to a WebGPU texture-feedback prototype. Audio drives the transform parameters (rotation, zoom, hue shift). Reference TD's tutorials by Bileam Tschepe / Elekktronaut.
- **`75-houdini-particle-flock`** — VEX-style particle-flocking sim (Boids 3D + curl-noise force fields), but rendered with `fal-ai/flux/schnell` background images chosen from the user's published journey palettes so each flock session looks themed (Snowflake → cold-blue iceberg, Earth Grounding → warm-loam soil, etc.). 8-12k particles via WebGPU compute. The image gen is INSIDE the AV experiment, not the experiment itself.
- **`76-cymatics-on-piano-path`** — Take a Welcome Home album track, run real-time FFT, and use band energies to drive Chladni-plate / cymatic sand patterns (extend `19-cymatics` but with HIS music as the source). Visual stays low-key / contemplative — Karel's piano isn't club music.
- **`77-projection-mapping-sandbox`** — Sandbox for the installation-mode story. WebGPU + tap-to-define-quad warp so a projector aligned to a real-world surface (a stage backdrop, a wall) can map a journey-shader onto it. Calibration UX + keystone correction + edge blending. No FAL needed; pure GPU.

### Research priorities for the next research cycle

Karel asked for DEEP research into the interactive audio-visual domain. The next research cycle (cycle ~30 or whenever the queue thins) should add 3-5 NEW prototype seeds inspired by these specific sources, with explicit notes on which TD/Houdini pattern each is porting:

- TouchDesigner tutorials by **Bileam Tschepe (Elekktronaut)**, **Matthew Ragan**, **Markus Heckmann** (Derivative's own tutorial channel)
- Houdini techniques in **Junichiro Horikawa's** "Procedural Library" series + **Entagma**'s VEX particle tutorials
- AV artist code/talks: **Memo Akten** (learning-to-see), **Robert Henke** (Lumiere), **Ryoji Ikeda** (data.matrix), **Daniel Rozin** (mechanical mirrors), **Refik Anadol** (latent walks), **Marpi**, **Manolo Gamboa Naon**
- Browser equivalents: **WebGPU compute** for particles/fluid, **MediaPipe** for body/face/hand tracking, **TensorFlow.js** for lightweight realtime ML, **three.js postprocessing pipeline**

Each research cycle should pick ONE of those threads and go deep — not a survey, a deep dive. Then propose 3-5 concrete prototype slugs in this file with enough spec for a future build cycle.

---

## FROM RESEARCH (Cycle 90, 2026-05-21) — promoted to queue

Note: Karel's new direction (above) deprioritizes AI voice gen. `78-xai-ghost` below is deferred unless Karel re-enables voice prototypes. The other four are AV/synthesis-focused and align with the new direction.

### node-synth — visual Web Audio routing graph synthesizer `[queued, zero deps, zero API]`
Route: `/dream/78-node-synth`. The Web Audio API is architecturally a directed routing graph — every AudioNode is a vertex, every `.connect()` call is an edge. This prototype makes that graph literal and interactive. A Canvas2D canvas shows colored node blocks: **OscillatorNode** (blue), **GainNode** (green), **BiquadFilterNode** (cyan), **ConvolverNode** (purple, with IR from `room-acoustic` library), **DelayNode** (amber), **PannerNode** (teal), **DestinationNode** (white). Toolbar at top: click a node type to add it to the canvas. Drag to position. Click a node's output port (right side dot) and drag to another node's input port (left side dot) to connect. Shift-click an edge to disconnect. Each node shows a minimal inline parameter panel (OscillatorNode: frequency + waveform type; GainNode: gain slider; BiquadFilter: frequency + Q + type; Delay: time slider). Click **▶ Run** → compile the visual graph into a real Web Audio graph and play it. Click **■ Stop** → tear down all nodes cleanly.

Pre-loaded "Hello Synth" patch on load: Oscillator (440Hz, sine) → Filter (lowpass, 1000Hz) → Gain (0.5) → Destination. The user can disconnect and reconnect nodes immediately. Add a second oscillator at 441Hz → hear the 1Hz beating. Connect an oscillator to a filter's frequency input → get FM-style timbre. The Web Audio routing graph IS modular synthesis — we're just drawing it.

Why this now: 71 prototypes, none visualize the audio routing graph. The Web Audio API was designed to be patched — this is the most native possible interface for it. Live performance relevance: a venue operator patches a custom signal chain visually in 30 seconds. Educational: shows how every Web Audio prototype in the sandbox is structured internally. High surprise factor: Karel will likely not have seen the Web Audio graph rendered as a live patchbay. Inspired by Strudel Flow (RESEARCH.md §159) and the node-based synthesis paradigm. Zero deps, zero API. One-cycle build.

### fm-explorer — 2-operator FM synthesis with audio-reactive parameters `[queued, zero deps, zero API]`
Route: `/dream/79-fm-explorer`. Frequency Modulation synthesis: one OscillatorNode (the **modulator**) connects to the `frequency` AudioParam of a second OscillatorNode (the **carrier**). C:M ratio and modulation index together determine the timbre across the classic DX7 palette. Controls:
- **C:M Ratio** slider: 0.50–7.00 with labeled preset stops (1:1 electric piano, 1:3.5 tubular bell, 3:2 reed, 1:2 bass, 7:1 metallic)
- **Modulation Index** (0–20 with nonlinear feel) — at low index: near-pure carrier; at high index: rich harmonic spectra → noisy chaos
- **Carrier Frequency** (MIDI note slider C2–C6, or any MIDI note)
- **ADSR envelope** controls on the carrier gain
- **Preset banks**: DX Piano, Vibraphone Bell, FM Bass, Reed, Metallic Chrome, Glass Harmonica

Secondary canvas: real-time **sideband spectrum** — a bar chart showing the predicted magnitude at each harmonic (Bessel function coefficients Jn(index) × carrier ± n × modulator). The chart updates live as you move sliders: you see the DX7 math as animated bars. "You can see why the electric piano sounds the way it does: J0(2.5) × C, J1(2.5) × (C±M), J2(2.5) × (C±2M)..."

Audio-reactive (demo mode OR mic): bass energy → modulation index (louder playing → grittier timbre), onset → retrigger ADSR (each new note reshapes the spectral envelope), treble energy → C:M ratio bias toward inharmonic ratios (bright playing → metallic shimmer).

Why this now: 71 prototypes, none implement FM synthesis — the technique that defined 1980s digital sound design (Yamaha DX7, Roland D-50). The Web Audio API implements FM in 3 nodes. A subtle index change transforms a soft piano tone into a harsh metallic clang — the entire timbral range lives in 2 continuous parameters, perfect for live performance. First prototype where **synthesis algorithm parameters** (not just audio features) are the primary UI. Zero deps, zero API. One-cycle build. Research basis: DDX7 (RESEARCH.md §161).

### room-acoustic — draw a room, hear its reverb `[queued, zero deps, zero API]`
Route: `/dream/80-room-acoustic`. A 2D top-down canvas showing a rectangular room (default 10m × 8m). Drag four corner handles to resize; the walls show color-coded absorption coefficients (from material preset buttons: Concrete 0.04, Wood Panel 0.15, Carpet 0.35, Glass 0.05, Stone 0.03). An **image-source method** simulation (up to 3rd-order reflections, ~40 lines of JS for a rectangular room) computes early reflection delay times and attenuation from the room geometry and materials. The reflection sequence is loaded into a Web Audio `ConvolverNode` as a synthetic impulse response (IR samples at 44.1kHz). A demo piano chord (from `36-pluck-field`) plays through the ConvolverNode. A BPM-timed loop lets you hear the same chord repeating in the designed space.

Room shape presets: **Closet** (2m × 2m, carpet), **Bedroom** (4m × 3m, mixed), **Recording Studio** (8m × 6m, treated), **Concert Hall** (30m × 20m, wood), **Cathedral** (40m × 80m, stone), **Cave** (irregular — simulated as a random-reflection low-absorption space). RT60 readout updates in real time. Canvas shows animated reflection rays during impulse response computation.

"Build a room. Hear what it sounds like." First prototype about **acoustic space simulation** — 71 previous prototypes visualize audio signal or synthesis parameters; this one simulates the physics of sound in a space. Directly relevant to Ghost scene design: the Stone Chamber should have RT60 ~2.5s (stone walls, 0.03 absorption); Forest Dawn should have ~0.4s (outdoor open clearing). Karel can now tune those acoustic environments with a slider rather than guessing. Zero deps, zero API. The image-source method is the standard algorithm from Concert Hall Acoustics (Barron, 2010). One-cycle build. Research basis: AcoustiVision Pro (RESEARCH.md §162).

### xai-ghost — fifth Ghost TTS paradigm: inline actions + semantic wrapping `[DEFERRED — Karel's new direction pulls back on voice gen]`
Route: extend `/dream/61-orpheus-voice` (add column E) OR standalone `/dream/78-xai-ghost`. xAI TTS (`xai/tts/v1` on fal.ai) adds the fifth TTS paradigm to the Ghost voice study. Unique dual-tag system:
- **Inline action tags** at any position in the text: `[laugh]`, `[pause]`, `[sigh]`, `[clears_throat]`
- **Semantic wrapping tags** applied to spans: `<whisper>text</whisper>`, `<slow>text</slow>`

No other TTS system in the sandbox supports both paradigms simultaneously. Pre-loaded Ghost lines:
- Stone Chamber: `[pause] The resonance here [pause] is ancient. <whisper>Let yourself be absorbed by it.</whisper>`
- Root Portal: `[sigh] Something stirs beneath the roots. [pause] A low note. <slow>Then silence.</slow>`
- Underground Pool: `The water <slow>remembers</slow> every sound [pause] that has passed through this place.`
- Tiny Planet: `A single breath. [pause] <whisper>The horizon wraps around you.</whisper>`
- Forest Dawn: `The first light is also [pause] the first sound. <slow>They arrive together.</slow>`
- Cosmic Ascension: `[sigh] You are not rising. [pause] <slow>The world is receding.</slow>`

5 voices: eve (energetic), ara (warm), rex (confident), sal (smooth), leo (authoritative). Vote buttons carry forward from `61-orpheus-voice` (A/B/C/D/E). The full 5-way comparison — Gemini global / Orpheus per-word / ElevenLabs V3 per-phrase / Chatterbox voice-clone / xAI inline+wrapping — is the most complete TTS paradigm study in any browser prototype. FAL_KEY in use. Zero new deps. One-cycle build. Research basis: RESEARCH.md §158.

### cassette-speed — CassetteAI vs ACE-Step side-by-side speed comparison `[queued, needs FAL_KEY — already in use]`
Route: `/dream/81-cassette-speed`. Two panels side by side. Left: CassetteAI (`cassetteai/music-generator`). Right: ACE-Step (`fal-ai/ace-step`). Same prompt field at top — type once, both generate simultaneously. Both show a generation timer in milliseconds counting up from "▶ Generate" click to first audio byte received. CassetteAI should show first audio in ~2s; ACE-Step in ~20–40s. Both play through the same six-band bloom visualizer (one after the other, or simultaneously with a mix slider). Download buttons for both. "Which one is faster? Which sounds better? Pick one." The point is to empirically demonstrate the CassetteAI speed advantage and let Karel evaluate whether the quality tradeoff is acceptable for `6-compose` → backend swap. FAL_KEY in use. $0.004 + $0.006/generation. Zero new deps. One-cycle build. Research basis: RESEARCH.md §157.

Key findings from Cycle 90 (2026-05-21):
- CassetteAI (§157) — `cassetteai/music-generator`, $0.02/min, 30s sample in 2s, 3min in 10s. 10× faster than ACE-Step. FAL_KEY in use. Inspires `cassette-speed` comparison; candidate for `6-compose` backend upgrade.
- xAI TTS (§158) — `xai/tts/v1`, inline `[laugh]`/`[pause]`/`[sigh]` + semantic `<whisper>`, `<slow>` wrapping. 5th TTS paradigm for Ghost study. FAL_KEY in use. Inspires `xai-ghost` (deferred per new direction).
- Strudel Flow (§159) — visual node-based Strudel editor (2026). Web Audio API IS a routing graph. Inspires `node-synth` — make the Web Audio routing graph literal and interactive.
- AI vs Human music perception (§160) — listeners prefer AI music but rate human music as more emotionally effective. No measurable difference in actual emotional response. Framing and perceived authorship matter.
- FM synthesis gap (§161) — 71 prototypes, none implement FM synthesis. Web Audio: 2–3 nodes. Classic DX7 timbres (electric piano, bells, metallic). Inspires `fm-explorer`.
- AcoustiVision Pro / room IR (§162) — open-source web RIR analysis platform. Inspires `room-acoustic` — image-source method, Web Audio ConvolverNode. Ghost scene acoustic space design tool.
- Sound-to-video (§163) — music → latent features → LLM → video gen pipeline. Inspires extension of `57-sound-to-image` using fal.ai video endpoints. FAL_KEY + budget needed.
- LLM+Strudel pattern code (§164) — English description → LLM → play in browser. Inspires `llm-pattern`. Needs ANTHROPIC_API_KEY (same as `claude-shader`).
- Selective auditory attention (§165) — EEG + consumer headset can decode which musical element you're attending to. Inspires `listen-guide` — guided listening prototype directing attention to musical elements, highlighting corresponding FFT bands. Zero deps.
- WebGPU MLS-MPM fluid (§166) — 100k particles, audio-reactive ocean surface. Inspires `84-wave-fluid`.
- Seedance 2.0 + LTX-2.3 (§167) — audio-native video generation, $0.04/s. Inspires `86-sound-to-video` (extend `57-sound-to-image`).
- FLUX.2 + Nano Banana 2 (§168) — FLUX.2 Dev at $0.012/MP, Flash at $0.005/MP, Nano Banana 2 reasoning-guided. Upgrade path for image gen in AV experiments.
- Marpi "New Nature" (§169) — audio-reactive organic entity ecosystem. Inspires `88-marpi-void`.
- Matchmaker score following (§170) — chromagram DTW, ISMIR 2025. Inspires `87-piano-transcript` (YIN pitch → flowing score, zero deps, uses Karel's live playing as input).

---

## FROM RESEARCH (Cycle 95, 2026-05-21) — new seeds

### wave-fluid — MLS-MPM audio-reactive WebGPU ocean surface `[queued, zero API, WebGPU required]`
Route: `/dream/84-wave-fluid`. WebGPU MLS-MPM (Moving Least Squares Material Point Method) fluid simulation — the same hybrid particle-grid algorithm used in Houdini's fluid solvers and Disney's "Frozen" snow. 80,000–100,000 particles at 60fps on an integrated GPU. Audio drives three parameters: **bass energy** → continuous wave injection (more particle momentum = taller waves), **treble energy** → surface turbulence scalar (high register → choppy chop), **onset** → a localized splash event at a random surface position. Screen-Space Fluid Rendering: depth pass → bilateral filter → surface normals → water-like surface with reflections. Color palette: deep ocean blue at rest → violet-tinted foam on onset → rose bloom at peak bass. Dark background. Inspired by `matsuoka-601/webgpu-ocean` (open source, MIT). This is a direct port of the Houdini fluid solver paradigm (RESEARCH.md §166) to WebGPU. Fallback: if WebGPU unavailable, show a graceful "WebGPU required" message and link to existing `3-fluid` (Navier-Stokes canvas). Zero API, zero deps. Two-cycle build. Likely MOST visually spectacular prototype in the sandbox if executed well.

### sound-to-video — piano audio → FLUX.2 image → LTX-2.3 video clip `[queued, FAL_KEY in use]`
Route: `/dream/86-sound-to-video`. Extend `57-sound-to-image` with a second generation step. UI: record 10s of piano → emotional analysis (valence, arousal, tempo, dominant frequency) → FLUX.2 Dev image (`fal-ai/flux-2`, $0.012/MP, higher quality than Schnell) → LTX-2.3 fast video clip (`fal-ai/ltx-2.3/text-to-video`, $0.04/s, 6 seconds = $0.24). The FLUX.2 image becomes the first frame of the LTX-2.3 video; the emotional analysis drives the motion prompt ("slow ethereal ripple, introspective, the landscape breathes with each breath"). Total cost per generation: ~$0.25–0.35. Optional second mode: "Cinematic" uses Veo 3.1 (`fal-ai/veo3.1`, $0.40/s, 6s = $2.40) for premium quality. The key UX: 10s of playing → 6s of video. The audio was the brush; the video is the canvas. This is "AI image gen INSIDE AV" exactly as Karel directed — the audio IS the generative input, not an afterthought. Must call `guard(req)` in the API route. FAL_KEY in use. One-cycle build.

### piano-transcript — real-time piano playing → animated piano-roll score `[queued, zero API, zero deps]`
Route: `/dream/87-piano-transcript`. User plays piano via mic → YIN pitch detection (§156, ~30 lines JS, ~15% fewer octave errors than autocorrelation) + onset detector → note list accumulates in real time → Canvas2D renders a growing piano-roll score scrolling rightward. Each note: filled rectangle (height = MIDI pitch, width = onset-to-release duration). Color gradient: C2–C3 = warm amber, C3–C5 = violet (Resonance accent), C5–C8 = cool cyan. When a phrase ends (≥2-beat rest at current tempo), the phrase gets a subtle outlined box marking it as "complete." Score scrolls leftward as it fills, keeping the last 16 bars visible. Session duration counter. "Save score" button: draws the full session to a 1080p canvas and triggers a PNG download. "This prototype writes while you play — a permanent record of your session." Zero API, zero deps, pure Web Audio + Canvas2D. Aligns directly with Karel's direction: **use his actual playing as the input**, not synthesized sounds. One-cycle build.

### marpi-void — audio-reactive organic void organism `[demoable, cycle 99]`
Route: `/dream/89-marpi-void`. A single procedurally generated organism lives in a black void. The organism: a radial structure with 8–16 "arms" extending from a glowing nucleus, each arm a Bezier curve with Perlin-noise-jittered control points. **Nucleus** pulsates to amplitude envelope. **Arm extension** responds to bass energy (sustain → long arms). **Arm curvature jitter** responds to treble energy. **Onset** = a reproductive "bud" spawns at the tip of a random arm, grows into a secondary organism over 3 seconds. Each organism drifts under slow Brownian motion. After 2–3 minutes of playing, the canvas holds a colony of organisms. Color: bass organisms → violet nucleus, mid organisms → cyan arms, treble organisms → rose tips. When an organism hasn't been "fed" (its driver frequency silent) for 15s, it slowly fades and dissolves. Demo mode: an LFO drives audio parameters so the organism breathes without mic. Canvas2D stroke rendering (no WebGPU required). Inspired by Marpi Studio "New Nature" (ARTECHOUSE 2026, RESEARCH.md §169). Zero API, zero deps. One-cycle build.

### spectrogram-paint — AudioWorklet spectrogram as WebGPU feedback texture `[queued, zero API, WebGPU required]`
Route: `/dream/85-spectrogram-paint`. Port the TouchDesigner "Record CHOP → TOP" pattern to WebGPU. In TD, you can record a CHOP's (audio channel operator's) output into a TOP (texture operator), making time the X axis and channel values the Y axis — essentially writing a spectrogram into a GPU texture in real time. Port: an AudioWorklet captures FFT bins every frame, writes them into column X of a `rgba8unorm` texture (Y = frequency bin, value = amplitude). The texture is now a live spectrogram (X = time history, Y = frequency). This texture feeds a second pass: a WebGPU feedback shader (ping-pong, same as `74-touchdesigner-feedback`) that blurs, rotates, and color-maps the spectrogram into an evolving visual painting. The spectrogram's own history IS the visual — you play a melody and watch it crystallize into layered color trails, then feed back into recursive patterns. Related to Ryoji Ikeda's data.matrix aesthetic: the raw data rendered as visual matrix. Three WGSL passes: write-column (AudioWorklet → texture), feedback (ping-pong transform), present (tonemapping). WebGPU required. Zero API, zero deps. Two-cycle build (spectrogram write pass is one cycle; feedback integration is second).

## FROM RESEARCH (Cycle 117, 2026-05-22) — new seeds

### camera-song — camera azimuth as music: 6 journey-theme orbs in 3D space `[queued, zero API, zero deps]`
Route: `/dream/100-camera-song`. React Three Fiber scene: 6 glowing orbs arranged in a sphere constellation, each representing one of Karel's 6 journey themes (Cosmic Homecoming = above-center, Earth Grounding = below-center, Inner Sanctuary = left-rear, Ocean Breath = right-front, Snowflake = far-right, Ghost = far-left). Each orb emits a distinct synthesizer voice: Cosmic = wide reverb pad, Earth = deep bass drone, Sanctuary = warm FM flute, Ocean = slow lush chord, Snowflake = high crystalline sine, Ghost = minor-key slow melody. Camera orientation determines gain: the orb closest to the camera's forward axis (dot product with camera direction vector) gets full gain. All other orbs receive gain proportional to their angular distance (cosine falloff via Web Audio `PannerNode` in HRTF mode). User orbits with mouse / trackpad / touch — the musical mix shifts continuously as they turn. Mic mode: amplitude pushes the camera forward into the nearest orb. No UI chrome — just orbs, darkness, and the music of looking. "You're not listening to music. You're walking through it." Directly inspired by Artisans d'Idées §174. Zero new deps (R3F + drei + postprocessing already installed). One-cycle build.

### ocean-presence — mouse presence disturbs a fluid that thinks in sound `[queued, zero API, WebGPU required]`
Route: `/dream/101-ocean-presence`. WebGPU MLS-MPM fluid simulation (adapt WGSL compute approach from `84-wave-fluid`, Cycle 107) driven by mouse/touch position rather than audio. The mouse cursor creates a "presence field" — a Gaussian disturbance applied to the fluid velocity grid at the cursor position each frame. Fluid flows around and toward the cursor, forming vortices and pressure gradients. Fluid velocity field drives audio synthesis (no audio input — audio is OUTPUT): high-velocity vortex regions → sine tone at pitch proportional to angular velocity magnitude; pressure gradient magnitude → FM modulation depth (higher pressure = more complex timbre); still/quiet fluid regions → a gentle ambient pad drone. Three synthesis voices: vortex tones (OscillatorNode), pressure FM (carrier + modulator pair), ambient pad (BufferSourceNode loop). No mic, no API. "Move your hand through this ocean. It sings back." Dark background, deep blue-to-violet fluid rendering (Screen-Space Fluid Rendering from wave-fluid). Directly inspired by Memo Akten "The Thinking Ocean" §175. WebGPU required. Two-cycle build.

### veo3-ghost — Ghost LoRA image → Veo 3 cinematic video with native audio `[queued, FAL_KEY in use, needs budget approval]`
Route: `/dream/102-veo3-ghost`. Admin-only gate (`guard(req)` in API route). Generate a Ghost LoRA image from a preset ethereal scene (forest dawn / stone chamber / cosmic void / underground pool). Pass image + cinematic motion text prompt to `fal-ai/veo3` Fast endpoint ($0.40/s with native audio). Output: 5–8 second 1080p cinematic clip with synchronized atmospheric audio (wind, ambient hum, subtle piano, ghost-like reverb). Full-screen video element. Video audio feeds a real-time bloom visualizer (`runBloom` pattern) overlaid at 30% opacity. Download button. Two presets: "Fast" (5s, $2.00) and "Cinematic" (8s, $3.20). Optional "Compare" mode: Seedance 2.0 Fast (`bytedance/seedance-2.0/image-to-video`, $0.55–0.70 for 5s) runs same prompt for direct quality comparison. Budget: $2–3.20 (Veo 3) or $0.55–0.70 (Seedance Fast) per clip. FAL_KEY already in use. One-cycle build once Karel approves budget. Research basis: RESEARCH.md §171–§172.

### listen-guide — guided listening of Karel's Paths recordings with attention lens `[queued, zero API, zero deps]`
Route: `/dream/103-listen-guide`. Guided listening experience for Karel's actual piano recordings from the Paths. Fetches a track via `/api/audio/[id]` (same pattern as `72-paths-visualizer`). Routes audio through: `<audio>` element → `MediaElementAudioSourceNode` → `AnalyserNode` (2048-bin FFT) → destination. A 6-zone frequency attention lens overlays the existing 6-band bloom ring from `1-live`: at each 20-second segment, one frequency zone is highlighted (sector glows 4× brighter, others dim to 30% opacity). Text caption guides the listener: Segment 1 → "Focus on the bass register (0–200 Hz) — feel the warmth of the low strings." Segment 2 → "Shift to the low-mids (200–500 Hz) — where the piano body resonates." Segment 3 → "Mid register (500–2kHz) — the heart of the melody." Segment 4 → "Upper-mids (2–6kHz) — listen for the brightness of attack." Segment 5 → "Presence (6–10kHz) — the air around each note." Segment 6 → "Full spectrum — hold all six zones at once." Toggle: "Guided" vs. "Open" (all bands equal). Progress bar shows segment position. Implements `listen-guide` idea from RESEARCH.md §165, now fully specced. Directly uses Karel's real Paths recordings per his direction. Zero deps, zero API beyond existing audio endpoint. One-cycle build.

### beat-cut — particle flock + onset-snapped camera presets (TD camSequencer in R3F) `[queued, zero API, zero deps]`
Route: `/dream/104-beat-cut`. React Three Fiber particle flock (6,000 Boids particles, same flocking rules as `75-houdini-particle-flock` rebuilt standalone). 6 preset camera positions defined as `{azimuth, elevation, distance}` pairs, one per journey theme (Cosmic = above/wide, Earth = ground-level, Sanctuary = close-right, Ocean = wide-left, Snowflake = high-angle, Ghost = behind/low). An onset detector (spectral flux algorithm, ~20 lines JS) fires when RMS energy difference exceeds threshold. On each onset: `OrbitControls.object.position` snaps immediately to the next preset (no lerp, no tween — hard cut, same as TD camSequencer). Inter-onset timing enforces a minimum cooldown (= estimated beat period at current tempo) so rapid noise doesn't over-fire. The hard-cut quality IS the feature — particles flock continuously, viewer perspective snaps cinematically on every beat, creating a montage effect. Demo mode: 6 LFO oscillators at musical intervals (0.5–4 Hz) produce varied onset timing. Mic mode: live piano / drumming drives cuts. Cooldown slider (50–500 ms). Directly inspired by Elekktronaut TD Tutorial #65 §177 camSequencer concept. Zero new deps (R3F + drei already installed). One-cycle build.

---

## FROM RESEARCH (Cycle 129, 2026-05-23) — promoted to queue

### webcam-compose — camera as synthesizer: what you see becomes music `[queued, zero API, zero deps, webcam permission]`
Route: `/dream/109-webcam-compose`. Webcam → `getImageData()` frame analysis each 250ms → extract 4 zone average HSL (top-left, top-right, bottom-left, bottom-right) + overall brightness variance + dominant hue + inter-frame delta. Map directly to synthesizer parameters (no VLM, no server, no ML): dominant hue angle → chord quality (0°–60° warm = major, 150°–240° cool = minor, 270°–360° = diminished); brightness → register (dark = bass chord C2–E2–G2, bright = treble chord C4–E4–G4); saturation → harmonic richness (1–5 simultaneous OscillatorNodes per chord tone); frame-to-frame brightness delta → note trigger speed (static scene = sustained pad, changing scene = arpeggiated at 120 BPM). All synthesis via OscillatorNode + GainNode envelopes. Canvas split: left = live webcam feed with 4 colored zone overlays (each showing its HSL values), right = 6-band bloom ring (`1-live` style) animated by the current synth output. One-sentence overlay: "Point at anything — it becomes music." Webcam permission required; graceful fallback shows demo LFO mode. Zero API, zero external deps. One-cycle build. Directly inspired by LUMIA (RESEARCH.md §185) but achieved without any server inference — the image-to-sound mapping is deterministic and immediate.

### bio-echo — your music grows a forest `[queued, zero deps, zero API]`
Route: `/dream/110-bio-echo`. Mic input (or demo LFO oscillators) → 6-band FFT → generates an "ecological" generative canvas animated from audio energy. Five visual layers mirroring five ecological strata: (1) sub-bass (20–80 Hz) → soil/root tendrils growing upward from canvas bottom: dark violet particle paths, growth rate ∝ sub-bass energy, bends gently; (2) low-mid (80–500 Hz) → tree trunk column: amber vertical brushstroke that grows tallest when bass is loudest, up to 60% canvas height; (3) mid (500 Hz–2 kHz) → forest canopy particle system: emerald leaf-like particles (20–80 active) swirling at 50–70% canvas height, density ∝ mid energy; (4) high-mid (2–4 kHz) → bird arc trajectories: each onset fires one white curved short trail from a random point at 75–90% canvas height; (5) treble (4–20 kHz) → sky shimmer: small star-like white dots at top 15% of canvas, density ∝ treble energy. Canvas accumulates over the session — by the end of a full piano piece, a complete forest ecosystem has grown on screen. Download canvas as PNG. Colors: soil=deep violet, trunk=amber, canopy=emerald-600, birds=white/90, sky=white dots on indigo-950. One sentence at start: "Play — watch your music grow a forest." Zero deps, zero API. One-cycle build. Inspired by Refik Anadol's DATALAND / Large Nature Model (RESEARCH.md §188) — ecological data as visual pigment.

### landscape-resonance — audio-reactive 3D terrain that breathes with your music `[queued, zero deps]`
Route: `/dream/111-landscape-resonance`. Full-canvas WebGL GLSL fragment shader: a simplex-noise 3D terrain rendered with a forward-moving camera (no Three.js — raw WebGL quad + GLSL). The terrain is a heightmap computed from 2D simplex noise in GLSL; camera position advances along Z each frame (fly-through effect). Audio energy deforms the terrain in real-time via uniforms: `uBass` (0–1) → terrain height scale (loud bass = towering peaks, range 0.1–1.5); `uTreble` (0–1) → terrain surface detail (high-frequency octave added to simplex noise, adds roughness); `uOnset` (decays 120ms) → brief terrain inversion flash (values sign-flipped for 80ms); `uAmp` (overall amplitude) → fog density (quiet = far horizon clear, loud = misty). Terrain color: ground-level = violet-900, peaks = emerald-400 blending to white. Distant horizon: indigo-950 sky. Additive bloom: peaks glow faintly. Demo mode: three LFO oscillators (0.1/0.3/0.7 Hz) create slow terrain breathing without permissions. Mic mode: live audio drives all four uniforms. First prototype with a recognizable natural 3D landscape (not abstract geometry). Live-performance quality: fly-through on a projector screen with bass driving mountain peaks is genuinely striking. Zero deps (raw WebGL + GLSL). One-cycle build. Inspired by Superradiance (RESEARCH.md §187) — landscape as body, environment as music.

### live-harmonize — play a melody: the system predicts the harmony `[queued, zero deps]`
Route: `/dream/112-live-harmonize`. Mic → autocorrelation pitch detection (same algorithm as `13-piano-canvas`) → accumulate last 4–6 detected pitches → template-match against 24 chord progressions (I-IV-V-vi, ii-V-I jazz, I-V-vi-IV, I-vi-IV-V, III-IV-I-V, i-VII-VI-VII, i-iv-V-i, i-VI-III-VII) in all 12 keys → score each progression by counting how many of the last detected pitches appear in its chord tones → pick highest-scoring chord → synthesize it via 4-voice OscillatorNode chord stack (soft triangle wave, gain 0.08, sustained) panned slightly left (−15°) while the detected melody note plays center. Three display panels: (1) top — detected melody as mini scrolling piano roll (warm orange bars, same as `24-piano-roll`); (2) bottom-left — predicted chord in large monospace type ("Am7", "F", "G/B") with Roman numeral label; (3) bottom-right — 12-bar chromagram (same technique as `28-chord-canvas`). Key label top-right updates live ("Detected key: C major"). "You play a melody — the system supplies the harmony, live." Distinct from `28-chord-canvas` (detects chords from what IS playing) — this predicts what chord would harmonize the notes you've played so far (even mid-phrase, even sparse). Demo mode: plays the Bach fragment from `22-code-score` and auto-supplies its harmonies. Zero deps. One-cycle build. Inspired by Pay-Cross-Attention-to-Melody (RESEARCH.md §189).

Key findings from Cycle 129 (2026-05-23) — adult research sweep:
- Break-the-Beat! (§184, arxiv 2605.14555, May 2026) — MIDI + reference audio timbre → drum synthesis. Inspires `midi-drum-forge` (step sequencer + timbral imprinting via AudioBuffer).
- LUMIA (§185, arxiv 2512.17228, Dec 2025) — camera→music via looking. Inspires `webcam-compose` — zero API camera image analysis → synthesizer control.
- WebGPU SPH Ocean (§186, GitHub, 2025–2026) — physically accurate SPH fluid at 60 FPS. Neither project audio-reactive. Inspires `sph-ocean-av` (two-cycle build).
- Superradiance / Memo Akten (§187, Feb 2026) — embodied simulation, landscape breathes with body. Inspires `landscape-resonance` — audio-reactive 3D terrain fly-through, zero deps, one cycle.
- DATALAND / Refik Anadol (§188, opens June 20 2026) — Large Nature Model, data as pigment. Inspires `bio-echo` — mic → ecological canvas, zero deps, one cycle.
- Pay Cross-Attention to Melody (§189, arxiv 2601.16150, Jan 2026) — mid-phrase chord prediction from melody. Inspires `live-harmonize` — predict harmony from partial phrase. Zero deps, one cycle.

---

## FROM RESEARCH (Cycle 137, 2026-05-23) — promoted to queue

### data-cosm — particle physics data stream as audio-visual material `[demoable — /dream/117-data-cosm, Cycle 139]`
Route: `/dream/117-data-cosm`. (Note: IDEAS.md originally said 116, but that slot was used by kids-bloom-garden; built as 117.) Ryoji Ikeda data-cosm aesthetic: synthetic particle physics event stream as audio-visual medium. The visual: a full-canvas grid of monospace white text on pure black, rows scrolling upward, each row = one synthetic collision event (particle type label in brackets, 6 numeric fields for energy/momentum/angles — all synthetic, formatted as CERN CMS output: `[μ+] pt=48.3 eta=-1.27 phi=2.95 m=0.106 q=+1`). Events fire at a rate controlled by the current "scale." On each event: a 300ms scatter animation (each character in the row jumps to a random offset then snaps back via CSS transform), a 4kHz sine pulse (30ms attack, 80ms decay, gain 0.28), and a 3-pixel particle trail from the event row's position. Continuous sub-bass at 38Hz (OscillatorNode gain 0.06) underlies — felt not heard.

Three temporal scales auto-advance every 40s with a timeline indicator at the bottom:
1. **Quantum** — 8 events/second, 4kHz tones, dense flickering matrix, intense scatter
2. **Biological** — 1 event/second, 440Hz tones, slower matrix, graceful scatter
3. **Cosmic** — 1 event/10s, 110Hz tone (near sub-bass), near-empty canvas, one event at a time centered in the frame

Scale transitions: full-canvas white flash (200ms) → all characters scatter to random positions (800ms) → snap back with new scale parameters.

Typography: `font-mono text-xs` for the matrix rows (≈ 9px — intentionally small for density), `text-3xl font-mono` for the current scale name ("QUANTUM", "BIOLOGICAL", "COSMIC") displayed bottom-right at 60% opacity. One sentence at bottom-left: "All of nature's data is the same material." Zero deps, zero API. One-cycle build. Inspired by Ryoji Ikeda data-cosm [n°1] (RESEARCH.md §192). Highest surprise factor of this research batch.

### poem-fluid — WebGL fluid simulation with generative text overlay `[queued, zero deps, zero API]`
Route: `/dream/117-poem-fluid`. Memo Akten's "The Thinking Ocean" paradigm. A WebGL ping-pong Navier-Stokes fluid simulation (same approach as `3-fluid` and `15-webgpu-fluid`) driven by mouse/touch presence. The fluid's vorticity magnitude (curl of velocity field, computed per frame) controls which poem fragment appears:

- `vorticity < 0.08` (still water) → long full sentence fades in, holds for 4s: *"The resonance here is ancient. Let yourself be absorbed."*
- `vorticity 0.08–0.3` (gentle motion) → 3-5 word phrase: *"Let yourself drift."* / *"Something stirs beneath."* / *"The water remembers."*
- `vorticity > 0.3` (turbulent) → single word: *"ANCIENT"* / *"LISTEN"* / *"DISSOLVE"* / *"VAST"*

40 pre-written fragments drawn from the 6 Ghost scenes. Each fragment fades in over 800ms, holds, then fades out over 1.2s. At most one fragment visible at a time. CSS: `mix-blend-mode: screen` makes the white text glow through the dark fluid. Typography: `font-mono text-2xl text-white/80`, centered, `letter-spacing: 0.1em`. The vorticity threshold state is a 3-level EMA (α=0.05) so rapid turbulence doesn't flicker the text.

Start: a still fluid canvas with no text. The first mouse movement generates vortex → short phrase appears. Heavy stirring → single-word intensity. Return to stillness → long sentence resurfaces. "The fluid speaks in fragments — the calmer the water, the fuller the thought." Zero deps, zero API. One-cycle build. Inspired by Memo Akten "The Thinking Ocean" (RESEARCH.md §193).

### audio-cloud — 6-species audio-reactive WebGPU particle cloud (TD particlesGPU port) `[queued, zero deps, WebGPU required]`
Route: `/dream/118-audio-cloud`. Port of Elekktronaut's TouchDesigner particlesGPU + CHOP audio technique to WebGPU compute shaders. Six frequency bands → six particle species clouds. Per-species physics defined as constants in the compute shader:
- Species 0 (sub-bass 20–80 Hz): large radius (8px), strong downward gravity (0.004), slow birth rate, violet color
- Species 1 (bass 80–250 Hz): medium radius (5px), weak gravity (0.002), medium birth rate, cyan
- Species 2 (low-mid 250–500 Hz): small radius (3px), no gravity, emerald
- Species 3 (mid 500–2kHz): small radius (3px), slight upward float, yellow
- Species 4 (high-mid 2–4kHz): tiny radius (2px), repulsive neighbor force (species 4 particles push each other away), orange
- Species 5 (high 4–20kHz): tiny radius (1.5px), fast chaotic velocity, strong repulsion, magenta

Compute shader: `struct Particle { pos: vec2f; vel: vec2f; age: f32; species: u32; }`. Per-frame: JS reads `AnalyserNode.getByteFrequencyData()`, computes per-band energy, uploads as `band_energy: array<f32, 6>` uniform buffer. Compute dispatch: physics update per particle. New particles spawn at random positions when `band_energy[species] > threshold`. Particles age → alpha fade → recycle at 2.5s.

Render pass: instanced quads (6 vertices/particle), per-particle `species` attribute → color lookup, alpha from age. Camera slowly rotates via `azimuth += 0.003` per frame (no three.js — raw WebGPU). Background: transparent over solid dark background.

Demo mode: 6 LFO oscillators (one per band frequency range). Mic mode: live AnalyserNode. "Six clouds of sound, each behaving differently." Two-cycle build (compute shader setup is non-trivial). WebGPU required; fallback message links to `3-fluid`. Zero API, zero npm deps. Research basis: §194.

### body-conductor — full-body pose tracking → music synthesis `[queued, CDN dep ~8MB, needs Karel OK]`
Route: `/dream/119-body-conductor`. MediaPipe PoseLandmarker loaded from CDN (same CDN pattern as `31-gesture-music` HandLandmarker). Webcam → 33 body landmarks at 30fps → synthesizer. Mapping:
- **Right wrist Y** (0=top, 1=bottom) → melody pitch: inverted (wrist high = high note). C2–C7, pentatonic snap. Short triangle-wave note envelope on each semitone change.
- **Left wrist Y** → bass drone frequency: C1–C3 continuous glide (no snap). Drone gain 0.12, always playing.
- **Wrist-to-wrist horizontal distance** (normalized 0→1 of screen width) → stereo spread: `panR = +spread`, `panL = -spread`. Arms wide = full stereo; arms together = mono center.
- **Right elbow angle** (forearm-to-upper-arm vector dot product → 0°=fully bent, 180°=fully extended) → harmonic count: 1 harmonic (pure tone) at 0° → 6 harmonics (rich timbre) at 180°.
- **Hip center Y position** → register bias: low Y (standing tall) = ×2 pitch multiplier; high Y (crouching) = ÷2.
- **Overall motion speed** (sum of `|pos[t] - pos[t-1]|` across all 33 landmarks) → amplitude envelope gain + arpeggiation speed (still = sustained pad at 40 BPM; fast movement = 160 BPM arpeggiation).

Canvas: webcam feed (scaled-down, 50% opacity) behind a full-canvas skeleton overlay: 33 joints as 8px violet circles, connections as 2px glowing lines. Companion audio-reactive bloom strip at the bottom (6-band energy, same as `1-live` style). "Dance and the music follows." CDN dep ~8MB, cached after first load. One-cycle build. Needs Karel OK on CDN dep. Research basis: §195.

### image-chord — drag an image, hear its music `[demoable — /dream/124-image-chord, Cycle 147]`
Route: `/dream/120-image-chord`. Drag a photo, screenshot, or artwork onto the canvas. JS extracts HSL from `getImageData()`: dominant hue H (largest cluster in hue histogram, ~10-bin), mean saturation S, mean brightness L. Maps to synthesizer:
- **Hue H** → chord quality: 0°–60° (red/orange/warm) = bright major chord (C E G); 60°–120° (yellow/lime) = dominant 7th (C E G B♭); 120°–180° (green) = minor (C E♭ G); 180°–240° (cyan/blue) = minor 7th (C E♭ G B♭); 240°–300° (blue/violet) = minor with major 7th (Cmaj7 = C E G B); 300°–360° (magenta/violet) = diminished (C E♭ G♭)
- **Saturation S** → harmonic richness: desaturated (S < 0.2) = 1 pure sine voice; vivid (S > 0.7) = 5 harmonics + subtle detuning
- **Brightness L** → register + tempo: dark (L < 0.3) = bass register C2–C3, slow arpeggios at 35 BPM; bright (L > 0.7) = treble register C4–C6, fast arpeggios at 120 BPM; mid = C3–C4, 75 BPM

8 preset palette swatches in a horizontal strip: one per journey theme (Cosmic Homecoming=deep violet, Earth Grounding=warm ochre, Inner Sanctuary=sage green, Ocean Breath=cyan, Snowflake=icy white, Ghost=cool grey, Inner Fire=amber, Mycelium=forest green). Click any swatch = instant chord/texture. Drag image = extracted chord. Current chord name shown in large monospace type ("Cmaj7", "E♭m"). A 6-band bloom ring animates to the synth output. "Your visual sense becomes music." One-cycle build. Inspired by Mozualization (RESEARCH.md §196) — zero-dep conceptual port.

### arc-steer — 6-phase journey arc realized as an AI music chain `[queued, FAL_KEY in use]`
Route: `/dream/121-arc-steer`. MusicRFM concept adapted for Resonance: instead of steering MusicGen activations (no browser API), steer ACE-Step via a sequential prompt chain. Six textarea fields, one per journey phase, pre-loaded with mood descriptors:
1. *"sparse piano, introspective, major, very slow, 30 BPM"*
2. *"minor arpeggios, building tension, rhythmic, cello drone, 60 BPM"*
3. *"dense chromatic, dissonant, complex harmonics, climax approaching, 90 BPM"*
4. *"bright triumphant, full orchestral, peak, ecstatic, 110 BPM"*
5. *"bittersweet descending, resolving, minor to major shift, 70 BPM"*
6. *"open fifth drone, fading, spacious, near-silence, 25 BPM"*

Each field is editable. **▶ Start Journey** → sequentially fires 6 ACE-Step API calls (`fal-ai/ace-step`), 30s each (~$0.006/call × 6 = ~$0.036 total). Each 30s clip plays through the 6-band bloom visualizer immediately on receipt. A phase timeline at the bottom advances as each phase completes. Phases transition without gap: next generation starts 5s before current phase ends. "Write the arc. Hear it realized." FAL_KEY in use. Zero new npm deps. One-cycle build. Inspired by MusicRFM's time-based steering schedule concept (RESEARCH.md §191).

Key findings from Cycle 137 (2026-05-23) — adult research sweep:
- MusicRFM (§191, ICLR 2026) — frozen MusicGen steering via RFM probes. Time-based schedules. No browser API. Inspires `arc-steer` (ACE-Step prompt chain approximation, FAL_KEY in use).
- Ryoji Ikeda data-cosm (§192, Oct 2025–Feb 2026) — particle physics to cosmic AV material. Inspires `data-cosm`. Zero deps, highest surprise, one cycle.
- Memo Akten "The Thinking Ocean" (§193, Whitney 2026) — WebGPU fluid + generative real-time poem. Inspires `poem-fluid`. Zero deps, one cycle.
- Elekktronaut particlesGPU + CHOP (§194, 2026) — TD audio-reactive per-species particle physics. Port to WebGPU inspires `audio-cloud`. Two cycles, WebGPU required.
- MediaPipe PoseLandmarker (§195, confirmed 2026) — 33 body landmarks at 30fps. Inspires `body-conductor`. One cycle, CDN dep, needs Karel OK.
- Mozualization (§196, Apr 2026) — multimodal input → music. Zero-dep port inspires `image-chord`. One cycle, zero deps.
- Audio-Visual Foundation Models Survey (§190, arxiv 2605.04045, May 2026) — embodied AV agents as open frontier. Directional; no immediate prototype.

---

## FROM RESEARCH (Cycle 151, 2026-05-24) — promoted to queue

### lyria3-journey — six Ghost scenes → Lyria 3 Pro ambient music via FAL_KEY (no GEMINI_API_KEY needed) `[queued, FAL_KEY — already in use]`
Route: `/dream/128-lyria3-journey`. **Priority: build next adult cycle.** Six Ghost preset scenes (Stone Chamber, Root Portal, Underground Pool, Tiny Planet, Forest Dawn, Cosmic Ascension). Each scene has a pre-written music prompt describing its acoustic character (e.g., Stone Chamber → "ambient score, slow tempo, single reverbed piano chord, stone cave resonance, 35 BPM, long decay tails, no percussion, eerie"). Click any scene → API call to `fal-ai/lyria3/pro` ($0.08/generation, FAL_KEY already in use) → receive 30s MP3 + BPM metadata → decode via `AudioContext.decodeAudioData` → play through six-band bloom visualizer (same as `1-live`). BPM from the metadata drives a subtle bloom-pulse animation at the detected tempo. Waveform strip shows duration. "Generate variation" re-calls with the same prompt + `seed: Math.random()`. All six prompts are editable before generating.

**Why this is the highest-priority adult build**: MORNING.md's open question "GEMINI_API_KEY: unlocks 30-lyria-jam, 43-lyria-ghost, 44-binaural-lyria — still waiting" is now RESOLVED. `fal-ai/lyria3/pro` is Google's latest Lyria model, now available on fal.ai at $0.08/generation via FAL_KEY — no Gemini API key required. This prototype builds the simplest, most direct version: Ghost scene → Lyria music → bloom. After this ships, the more complex `43-lyria-ghost` (image + music together) and `44-binaural-lyria` (binaural beats + Lyria) can be updated to use `fal-ai/lyria3/pro` instead of waiting for GEMINI_API_KEY. Zero new npm deps. One-cycle build. Research basis: RESEARCH.md §197.

### ghost-3d-orbit — Ghost LoRA image → Pixal3D 3D model → audio-reactive R3F scene `[queued, FAL_KEY — already in use, two-cycle build]`
Route: `/dream/129-ghost-3d-orbit`. Admin-only. Step 1: generate Ghost LoRA image from a preset scene description (using existing `/api/ai-image/generate` + the Ghost LoRA). Step 2: pass the returned image URL to `fal-ai/pixal3d` (1024p, $0.30) → receive `.glb` 3D model. Step 3: load the GLB in a React Three Fiber scene using `@react-three/drei`'s `useGLTF` hook. Step 4: audio-reactive: attach a custom `MeshStandardNodeMaterial` with TSL `positionNode` displacement — bass energy → subtle global scale pulse (0.98→1.03×), treble energy → per-vertex normal displacement for surface shimmer. Step 5: `OrbitControls` for free camera orbit. Step 6: `@react-three/postprocessing` bloom (`UnrealBloomPass`). Dark background. Demo OscillatorNode audio drives the reactivity without mic.

"The Ghost character becomes a 3D sculpture you can orbit — and it breathes with sound." This is the first prototype that gives the Ghost image spatial depth and interactive presence. The Ghost figure stops being a flat image and becomes a three-dimensional object. Pixal3D is accepted to **SIGGRAPH 2026** (TencentARC) and just released on fal.ai in May 2026 — state of the art image-to-3D. Zero new npm deps (drei, three@0.182, R3F, postprocessing already installed). Budget: ~$0.30 (Pixal3D) + Ghost LoRA image cost. FAL_KEY in use. Two-cycle build: Cycle A = Ghost image generation + Pixal3D integration + GLB loading; Cycle B = audio-reactive vertex displacement + polish. Research basis: RESEARCH.md §199.

### tsl-particle-compute — Three.js TSL compute shader: 50k-particle Lorenz strange attractor `[queued, zero deps, WebGPU required]`
Route: `/dream/130-tsl-particle-compute`. A 50,000-particle Lorenz strange attractor using Three.js TSL compute shaders — the correct 2026 approach vs. the FBO-based GPGPU hack used in `16-particle-life-gpu`. Implementation:

```js
const updateParticles = Fn(() => {
  const i = instanceIndex;
  const pos = storageObject('positions', 'vec3', N).element(i);
  const vel = storageObject('velocities', 'vec3', N).element(i);
  const sigma = uniform(10.0); // driven by bass energy
  const rho = uniform(28.0);   // driven by treble energy
  const dx = sigma.mul(vel.y.sub(pos.x));
  const dy = pos.x.mul(rho.sub(pos.z)).sub(pos.y);
  const dz = pos.x.mul(pos.y).sub(2.667.mul(pos.z));
  // ... update pos, vel
});
```

Audio mapping: bass energy → `sigma` (Lorenz σ, 8–14); treble energy → `rho` (ρ, 24–32); onset → brief velocity turbulence burst. Render: instanced points with color from particle speed magnitude (slow=violet, fast=cyan, intermediate=emerald). OrbitControls. Demo mode: LFO oscillators animate σ/ρ. Mic mode: live FFT. The strange attractor's wing shape changes as audio parameters shift — a different "signature" for bass-heavy vs. treble-heavy music. "The music attracts." WebGPU required; graceful fallback text links to `10-strange`.

Why this now: `16-particle-life-gpu` (6-species flocking via FBO hack) and `75-houdini-particle-flock` (Boids) are the only GPU particle prototypes. TSL compute shaders as of Three.js r171 (WebGPU Baseline Jan 2026) are production-ready and clean — no more string-concatenated WGSL, no more ping-pong texture hacks. This is the idiomatic 2026 approach to GPU particle physics. Also: this simplified approach makes the `audio-cloud` two-cycle plan achievable in one cycle. Zero new npm deps (three@0.182 + R3F already installed). One-cycle build. Research basis: RESEARCH.md §200 (Maxime Heckel TSL field guide, Jan 2026).

### kali-sustain — long-tone harmonic meditation: slow ratio glide (Kali Malone / drone music inspired) `[queued, zero deps, zero API]`
Route: `/dream/131-kali-sustain`. Inspired by Kali Malone's slowly evolving harmonic music (pipe organs, just intonation, intervals held for minutes) performing at MUTEK Montréal 2026. Two `OscillatorNode`s: (1) **root drone** — a sustained C2 sine (gain 0.10) with a very slow LFO (0.05 Hz) for gentle beating; (2) **harmony voice** — a second `OscillatorNode` that slowly glides between pure-ratio target frequencies: 3:2 (perfect fifth), 4:3 (fourth), 5:4 (major third), 6:5 (minor third), 7:4 (harmonic seventh), 9:8 (whole tone). Each ratio holds for 12 seconds, then glides via `linearRampToValueAtTime` over another 12 seconds to the next ratio — a complete cycle through all 6 intervals takes ~144 seconds (2.4 minutes), then repeats.

Canvas: a slow circular "ratio clock" — a circle with 6 labeled positions for each ratio, a glowing indicator that sweeps between them. Center: the current interval name in `font-serif text-2xl` ("3:2 — Perfect Fifth") and the ratio as a fraction. Background: very slow HSL color cycle synchronized to the current ratio (3:2=violet, 4:3=teal, 5:4=amber, 6:5=rose, 7:4=indigo, 9:8=emerald). Mic mode: autocorrelation pitch detection → detect user's sustained long tone → set root drone to detected pitch → begin glide sequence from that fundamental. "Hold a note. The world shifts beneath it."

This fills a real gap: 130 prototypes have been built, and none explore the aesthetics of **drone music / sustained harmonic meditation** — Éliane Radigue, La Monte Young, Tony Conrad, Kali Malone. Resonance's "transcendent listening" vision maps exactly onto this tradition. The patient aesthetic is a counterpoint to the busy, reactive majority of the sandbox. Zero deps, zero API. One-cycle build. Research basis: RESEARCH.md §201 (MUTEK 2026, Kali Malone, Aug 25–30).

### lmdm-echo — generative delay: your piano phrase, echoed back transformed `[queued, FAL_KEY — already in use]`
Route: `/dream/132-lmdm-echo`. Inspired by the "generative delay" concept from Live Music Diffusion Models (arXiv:2605.22717, May 21, 2026). Mic → record a piano phrase (same `MediaRecorder` approach as `43-stable-extend`, 5–15s). When recording stops: (1) run chroma analysis (12-bin, same as `28-chord-canvas`) to detect dominant chord quality; (2) estimate tempo from onset intervals (same as `48-tap-rhythm`); (3) detect register from spectral centroid; (4) construct ACE-Step style prompt: `"piano improvisation echo, [quality] character, [tempo] BPM, [register] register, slight timbral variation, reverb, contemplative"`. Call `fal-ai/ace-step` ($0.006/30s). When response arrives: play both simultaneously — original recording left-panned (gain 0.65), AI echo right-panned (gain 0.45). Waveform strip: two-channel horizontal bar (original=amber, echo=blue). "Echo again" button re-generates with same analysis but different seed.

Different from `44-vocal-bgm` (which uses `audio-to-audio` remix of raw signal): this is `text-to-audio` where the prompt is derived from harmonic analysis — the echo is in the same key and tempo but is a fresh composition, not a direct transformation. The echo responds to the musical *meaning* of the phrase (what chord quality, what register, what tempo) rather than its literal sonic content. "The piano echoes back — transformed." Different from `33-aria-companion` (Markov response, immediate, short) — this is a longer, richer, AI-generated echo of a full recorded phrase. FAL_KEY in use, $0.006/echo. Zero new npm deps. One-cycle build. Research basis: RESEARCH.md §198 (arXiv:2605.22717, May 21, 2026).

Key findings from Cycle 151 (2026-05-24):
- Lyria 3 Pro on fal.ai (§197) — $0.08/generation via FAL_KEY. Resolves MORNING.md open question re: GEMINI_API_KEY. Inspires `128-lyria3-journey` — highest-priority adult build (one cycle, zero new deps, directly unblocks 3+ prototypes).
- Live Music Diffusion Models (§198, arXiv:2605.22717, May 21, 2026 — freshest paper) — "generative delay" concept. Inspires `132-lmdm-echo` — ACE-Step harmonic echo of pianist's phrase.
- Pixal3D SIGGRAPH 2026 (§199, TencentARC, May 2026 fal.ai release) — $0.30 image→3D GLB, zero new deps. Inspires `129-ghost-3d-orbit` — two-cycle build, highest surprise of batch.
- Three.js TSL Compute Shaders (§200, Jan 2026 confirmed baseline) — clean particle physics without WGSL strings. Inspires `130-tsl-particle-compute` — one-cycle build, simplifies `audio-cloud` two-cycle plan.
- MUTEK 2026 / Kali Malone (§201, Aug 25–30 announcement) — slowly evolving harmonic meditation. Inspires `131-kali-sustain` — zero deps, zero API, fills the drone/sustain gap.
- ACE-Step 1.5 in diffusers (§202) — likely already live on fal.ai endpoint; LongCat-AudioDiT needs fal.ai endpoint.
- AUDIOLAB unified React tree pattern (§203) — apply as architecture for future Three.js prototypes.

---

## FROM RESEARCH (Cycle 169, 2026-05-25) — promoted to queue

### kids-seed-song — plant a seed, grow an L-system tree, hear it sing `[queued, zero deps, zero API, kids build]`
Route: `/dream/143-kids-seed-song`. Tap anywhere on the canvas to plant a seed. A procedural L-system tree grows from the seed over ~20 seconds: trunk sprouts, branches fork at 25°/35° alternating angles, each fork spawns 2 sub-branches, recursion depth 5. Each branch segment has a pitch: root trunk = C3, first fork = E3, second fork = G3, third = A3, fourth = C4 (C major pentatonic, low to high as depth increases). As each new branch segment grows into existence, its pitch plays as a short Karplus-Strong pluck: `DelayNode` (delay = 1/freq), `BiquadFilterNode(lowpass, 2000 Hz)`, `GainNode(0.995)` decay, 5ms noise burst to seed. Multiple trees grow simultaneously if multiple seeds planted; their voices overlap in gentle harmony.

Atmospheric layer: soft brown-noise wind at gain 0.04, always present. Color: branches warm from root (deep violet) to tip (amber/golden). Background: very dark forest green. Tap-to-plant target area: the whole canvas (no reading required). Leaves — small oval polygons drawn at the terminal branches — flutter slowly via a sin-time offset.

**Why this is a kids build**: zero inputs beyond one tap, immediate visual + audio reward, grows patiently across 20s (rewards attention), multiple trees create organic ensemble harmony. The Karplus-Strong resonance gives it a warm, gentle character that won't startle. 4-year-old friendly. No mic, no permissions. Inspired by Anadol's Machine Dreams: Rainforest (RESEARCH.md §206). Fills a gap: 37+ kids prototypes react to taps immediately; none show patient growth over time.

**One-cycle build**. Zero deps. Zero API. Pure Web Audio + Canvas2D.

---

### sa3-journey — Stable Audio 3: 6-minute journey generation + piano continuation `[queued, FAL_KEY in use]`
Route: `/dream/144-sa3-journey`. Two modes on a single page:

**Mode A — Write Your Journey**: Textarea pre-filled with a journey theme prompt ("Inner Sanctuary — slow reverbed piano, soft cello drone, ancient forest, meditative, 3 minutes"). Dropdown for target duration: 2 min / 4 min / 6 min. Click "Generate Journey" → server route calls Stable Audio 3 Large on fal.ai (endpoint: `fal-ai/stable-audio-3` or via Stability AI API — check at build time; FAL_KEY in use) → receive WAV/MP3 → decode via `AudioContext.decodeAudioData` → play through six-band bloom radial visualizer (same as `1-live`). Waveform strip shows full duration with a playhead. Download MP3 button.

**Mode B — Extend Your Playing**: Mic capture (same `MediaRecorder` approach as `43-stable-extend`): tap ● REC → play piano for 30s → tap ■ STOP. Server route sends captured audio to SA3 Large in "causal continuation" mode — SA3 treats the recording as the prefix and generates continuation audio for the selected duration (2/4/6 min). The result plays back: original recording (first 30s, amber waveform strip) then SA3 continuation (blue strip). Crossfade at the boundary. "Your playing, continued."

Preset prompts panel: one button per Resonance journey theme (Cosmic Homecoming, Earth Grounding, Inner Sanctuary, Ocean Breath, Snowflake, Ghost, Inner Fire, Mycelium). Click any → pre-fills the prompt textarea with a theme-appropriate music description. Goal: Karel can hear a 4-minute generative ambient score for each journey theme in 10 seconds.

**Why this fills a real gap**: all existing generation prototypes top out at 30–90 seconds (ACE-Step, MiniMax, Lyria). SA3 changes that — 6 minutes is enough for a full Resonance journey phase. Mode B directly addresses Karel's directive: "let his existing music be the input." Budget: ~$0.20–0.50/generation (SA3 Large pricing not yet confirmed; monitor fal.ai). Fallback: SA3 Medium is open-weight on HuggingFace — if fal.ai endpoint isn't available, build Mode A only using `stabilityai/stable-audio-3-medium` via HuggingFace Inference API. FAL_KEY in use. One-cycle build. Research basis: RESEARCH.md §204.

---

### eco-bloom — procedural rainforest: L-system growth + layered atmospheric synthesis `[queued, zero deps, zero API]`
Route: `/dream/145-eco-bloom`. Inspired by Refik Anadol's Machine Dreams: Rainforest (RESEARCH.md §206, DATALAND opens June 20, 2026). A full procedural ecosystem on canvas:

**Visual**: Three simultaneous L-system trees with different species parameters (branching angle 20°/30°/40°, segment length 8–20px, max depth 6/5/4). All three begin as seeds at canvas bottom and grow simultaneously over 45 seconds. Terminal branches accumulate oval leaves (additive blending, low opacity). Background slowly fades from near-black to very deep forest green as canopy density increases.

**Synthesis** — layered, never abruptly on/off:
- **Root resonance**: a C1 sine at gain 0.06, subtle 0.08 Hz LFO — felt rather than heard, always present.
- **Branch plucks**: Karplus-Strong at each new branch segment spawn (5 pentatonic pitches, depth → octave). Simultaneous trees = 3-voice polyphony, always harmonious.
- **Wind layer**: band-passed brown noise, gain rising from 0 to 0.03 as canopy grows. Subtle leaf rustle.
- **Rain layer** (toggle): white noise low-pass at 1200 Hz, very low gain. On/off toggle in bottom corner. When rain plays, growth slightly accelerates.
- **Dawn birds** (toggle): every 8 seconds, a rapid pentatonic arpeggio (5 Karplus-Strong notes in 400ms) from a random tree tip — a bird call. Appears only after canopy density > 30%.

**Interactions**: Tap canvas to plant an additional seed (up to 6 simultaneous trees). Drag an existing tree root to move it. "Clear" removes all trees and returns to silence. "Rain" toggle.

Mic mode: bass energy → growth rate multiplier (play a low note and the forest grows faster); onset → triggers an immediate bird call.

**Why this now**: 142 prototypes exist; none explore **patient growth over time** as the primary metaphor. Most are instantaneous-response. Eco-bloom rewards watching — you plant it and step back. Closest aesthetic to the Inner Sanctuary and Earth Grounding journeys. "What does a Resonance journey sound like before the human starts playing?" Zero deps, zero API. One-cycle build. Research basis: RESEARCH.md §206.

---

### spatial-palette — drag synthesis voices to sculpt your soundscape `[queued, zero deps, zero API]`
Route: `/dream/146-spatial-palette`. Inspired by CHI 2026 6DoF gesture paper (RESEARCH.md §207). A full-screen dark canvas with 6–8 colored synthesis voice dots, each draggable:

- **X position** → stereo pan (–1=far left, +1=far right)
- **Y position** → pitch (top=C6, bottom=C2, log-scaled) — drags are musical, not abstract
- **Mouse wheel over a dot** → filter cutoff + reverb send: scroll up = brighter+drier, scroll down = darker+wetter
- **Tap/click canvas (empty area)** → add a new voice dot (up to 8 total)
- **Double-click dot** → cycle through timbres: sine → triangle → sawtooth → Karplus-pluck
- **Long-press dot** → remove it

Each voice produces a continuous, sustained tone at its current pitch and timbre with a slow Hann-windowed envelope (150ms attack, 400ms release on position change). Chord quality emerges from the spatial arrangement: voices on the upper-left cluster → minor chord (dark); voices spread wide and high → bright major spread.

Canvas decoration: a very faint 2D grid with semitone lines (horizontal) and stereo-field lines (vertical). A small stereo waveform display at the bottom (same as `20-scope` in Lissajous mode) shows the combined stereo output. Current chord label (from `28-chord-canvas` chroma template matching on the synthesized output) in the top-right corner.

Demo: pre-placed C major triad (C4 center, E4 right, G4 left) with slight reverb. The voices hum quietly. Drag the E4 down a step → chord becomes C minor; drag it up → back to major. "Sculpt your soundscape." Zero deps, zero API. One-cycle build. Research basis: RESEARCH.md §207.

---

### face-synth — MediaPipe FaceLandmarker → expressive face synthesizer `[queued, needs CDN dep ~5MB MediaPipe, needs Karel OK]`
Route: `/dream/147-face-synth`. MediaPipe FaceLandmarker loaded from jsDelivr CDN (WASM, ~5MB one-time download). Webcam feed at 40% opacity. 5 synthesis parameters driven by face expression:

- **Jaw opening** (normalized inner-lip distance / face height, 0–1) → filter cutoff 400–8000 Hz. Open mouth wide = full treble; jaw relaxed = dark filtered tone.
- **Inner eyebrow height** (brow-to-eye distance above neutral) → harmonic count 1→8 (pure sine at closed, rich timbre at raised). Raise your eyebrows = richer sound.
- **Head tilt angle** (left/right from vertical) → stereo pan –1→+1. Tilt head left = sound moves left.
- **Mouth corner spread** (smile width normalized) → chord quality interpolation: no smile = minor; full smile = major. Smile and the chord brightens.
- **Nose tip forward lean** (Z-depth, camera-relative) → reverb send 0–0.8. Lean toward camera = more reverb.

Visual: 468-point face mesh drawn as glowing violet dots at 30fps. A secondary Lissajous canvas (same as `20-scope`) shows the stereo shape of the current synthesis output — your face expression is visible in both the webcam overlay and the Lissajous shape simultaneously. 5 parameter gauges on the right side (vertical bars, color-coded). Chord name label updates live ("Cm" / "C"). 

Demo: without face tracking active, a slow LFO auto-drives each parameter in a breathing cycle so the synthesis plays on its own and the visitor can see what's possible before activating the webcam.

"Your face is the instrument." CDN dep ~5MB. Needs Karel OK. One-cycle build once approved. Research basis: RESEARCH.md §208.

---

Key findings from Cycle 169 (2026-05-25):
- Stable Audio 3 (§204, May 20, 2026 — 5 days ago) — family of open + partner-access models, up to 6+ min, inpainting + causal continuation. SA3 Large on fal.ai (FAL_KEY in use). **Highest priority adult build next cycle** → `144-sa3-journey`. Resolves the "30-second generation ceiling" problem.
- WavFlow (§205, May 18, 2026) — waveform-space audio gen, video-to-audio + text-to-audio. Server-only; monitor for fal.ai endpoint.
- Refik Anadol DATALAND + Machine Dreams: Rainforest (§206, opens June 20, 2026) — ecological data → digital sculpture. L-system + Karplus-Strong + atmospheric noise technique. Inspires `143-kids-seed-song` (kids) and `145-eco-bloom` (adult).
- CHI 2026 6DoF gesture mixing (§207, Feb 2026) — spatial sculpting > sliders for musical expressivity. Inspires `146-spatial-palette` — draggable synthesis voices on canvas.
- MediaPipe 2026 simultaneous multi-modal tracking (§208, March 2026) — 468 face landmarks at 60fps in browser. Inspires `147-face-synth` — face expression → synthesizer. Needs Karel OK on CDN dep.

---

## FROM RESEARCH (Cycle 177, 2026-05-25) — promoted to queue

### ritual-compose — I-Ching divination as musical intent-setting via Lyria `[queued, FAL_KEY in use, ~$0.08/gen]`
Route: `/dream/150-ritual-compose`. The most transcendent concept in the queue: users perform an animated I-Ching coin-tossing ritual that resolves to a hexagram, which becomes the musical intent for a Lyria 3 Pro generation.

**Interaction**:
- Start screen: a dark canvas with three ancient coins centered; a brief text ("Cast the oracle"). Tap/click → one animated coin toss (three coins flip simultaneously with a CSS rotation animation, each landing heads or tails via `Math.random()`).
- Six tosses = one hexagram line each = complete hexagram (1–64). After each toss, the line is drawn in the hexagram display: solid line (yang, two or more heads) or broken line (yin, two or more tails).
- Hexagram display: 6 horizontal lines in a vertical stack (top = line 6, bottom = line 1), glowing amber/violet for solid/broken. Hexagram number and name appear below (static lookup table of all 64, e.g. "Hexagram 11 — T'ai / Peace" or "Hexagram 29 — K'an / The Abysmal Water").
- A 2–3 sentence poetic interpretation (all 64 in a static `const` lookup, derived from public-domain I-Ching text) appears in italic `text-white/80 text-base`.
- "Generate Journey Music" button → POST to `/dream/150-ritual-compose/api/route.ts` with hexagram name + interpretation as the Lyria prompt (e.g. "peaceful, calm, prosperous union of sky and earth, ancient ceremony, ascending piano tones, open harmony, reverbed strings — Inner Sanctuary journey"). Calls `fal-ai/lyria3/pro` ($0.08/generation, FAL_KEY in use).
- Response: 30s of ambient music plays through the six-band bloom radial visualizer (same as `1-live`). Hexagram + interpretation displayed during playback. "Re-cast" button to toss a new hexagram and generate fresh music.

**Technical**:
- API route uses `guard(req)` as first line (origin + rate-limit + quota).
- All 64 hexagram name/interpretation pairs fit in ~3KB of static data — no external API for the text.
- Lyria 3 Pro endpoint: `fal-ai/lyria3/pro` (same as `129-lyria3-journey`).
- Zero new npm deps. Pure CSS coin animation + Canvas2D bloom.

**Why this now**: "Surprise" is Karel's #2 priority. Nothing in the sandbox treats a session as a *ritual act* — all 149 existing prototypes are instrumental (tap, play, record, generate). This is the first where the user performs a ceremony first, then receives music as a response to that ceremony. The I Ching connection also ties to East Asian musical traditions (an underrepresented axis in the sandbox so far). Research basis: §212 (arXiv:2605.20386, May 2026).

---

### paint-compose — paint colored strokes on a canvas → loop plays them back as music `[queued, zero deps, zero API]`
Route: `/dream/151-paint-compose`. Inspired by ViTex (RESEARCH.md §209, March 2026). A dark canvas with four color brushes (tabs at top):

- **Violet** = sine/piano timbre (OscillatorNode type "sine" + harmonics 2+3 at 0.3 gain)
- **Amber** = triangle/brass timbre (OscillatorNode "triangle" + 3rd harmonic)
- **Teal** = sawtooth/strings timbre (OscillatorNode "sawtooth" with mild low-pass 2kHz)
- **Rose** = pulse/woodwind timbre (OscillatorNode "square" with 600Hz low-pass + reverb)

Draw anywhere on the canvas with mouse/touch. Each stroke records its color and Y-position (normalized 0–1, top=C6, bottom=C3, mapped through `Math.pow(freq, y)` log-scale). Strokes are stored as `{color, x, y, width, height}` rectangles — the visual position IS the note position in time and pitch.

**Playback**: A `▶ Loop` button starts a cursor bar sweeping left-to-right across the canvas over 4 seconds (a single bar at ~60 BPM). When the cursor intersects a stroke at X position, it fires the note: pitch from Y, duration from stroke width, timbre from color. Multiple strokes at the same X column play simultaneously (chords). The cursor loops indefinitely.

**Canvas interactions**:
- Select brush color from the 4 tabs
- Draw by dragging — freehand strokes are rasterized as filled rectangles aligned to the canvas grid
- `⌫ Clear` erases all strokes
- Eraser brush: 5th tool option

**Visual**: strokes glow with a subtle additive shadow (`shadowBlur=12`) in their color, on a pure-black background. The cursor is a thin white vertical line. No other chrome during playback — the canvas IS the score.

**Why this now**: 151 prototypes visualize audio; none let you compose by painting. ViTex proved the metaphor is learnable and musically productive. The zero-API version (timbre per color) is feasible in one cycle and produces genuinely musical results — all pentatonic if Y maps to C-major pentatonic semitones (C3 D3 E3 G3 A3 C4 D4...). "Your painting loops as a melody." Different from `22-code-score` (text notation) and `13-piano-canvas` (painting from playing) — this is painting BEFORE playing. Zero deps, zero API. One-cycle build. Research basis: §209.

---

### piano-hands — PianoFlow-inspired: animated ghost fingers press detected keys on a canvas keyboard `[queued, zero deps, zero API]`
Route: `/dream/152-piano-hands`. Inspired by PianoFlow (RESEARCH.md §211, April 2026). A canvas piano keyboard in the center of the screen, with autocorrelation pitch detection driving animated "ghost finger" presses in real time.

**Canvas layout**:
- Top half: a dark visual area showing a glowing note trail (same additive-dot technique as `13-piano-canvas`) — each detected note leaves a color dot that fades over 3s.
- Bottom half: a 2-octave keyboard (C3–B4, 24 keys): white keys labeled C3–B4, black keys unlabeled. Drawn in Canvas2D: white keys as slightly warm-white rectangles with a 1px violet border, black keys as deep-indigo raised rectangles.

**Ghost finger animation**:
- On pitch detection: a semi-transparent finger silhouette (a soft rounded ellipse, ~12px wide, ~28px tall) descends from above onto the detected key over 60ms, stays depressed for the note duration (onset-to-silence), lifts in 80ms.
- Left-hand register (C3–B3) = violet ghost finger.
- Right-hand register (C4–B4) = rose ghost finger.
- The key itself brightens to 80% opacity when pressed; returns to 30% when released.
- Note name label appears briefly above the finger in `text-xs text-white/90`.

**Mic mode**: `getUserMedia({ audio: true })` → `AnalyserNode` → autocorrelation pitch detection (same `detectPitch()` function as `13-piano-canvas`, `24-piano-roll`). Real-time: 30Hz detection cycle.

**Demo mode** (no mic): plays a Bach BWV 772 Invention fragment (same score as `22-code-score`) via OscillatorNodes at scheduled `AudioContext.currentTime`, which the pitch detector reads back from the AnalyserNode — the demo self-drives its own keyboard display. The fingers animate to a piece Karel knows.

"See exactly where your hands are on the keyboard — in real time." First prototype in the sandbox that renders a literal piano keyboard as a responsive instrument. Different from `22-code-score` (static score display) and `24-piano-roll` (scrolling pitch history) — this shows WHERE on the keyboard, not WHAT or WHEN. Natural complement to the piano-roll triptych (`13-piano-canvas`, `22-code-score`, `24-piano-roll`). Zero deps, zero API. One-cycle build. Research basis: §211.

---

Key findings from Cycle 177 (2026-05-25) — adult research sweep:
- ViTex (§209, March 2026) — paint color strokes = instrument + pitch + time. Inspires `151-paint-compose`, zero API, one cycle.
- "Abstraction Beats Realism" (§210, March 2026) — science validates Resonance's abstract AV thesis.
- PianoFlow (§211, April 2026) — streaming bimanual piano motion. Inspires `152-piano-hands`, animated keyboard, zero API.
- I-Ching Music System (§212, May 2026 — freshest) — coin ritual → Lyria music. Inspires `150-ritual-compose`, highest-surprise build in the queue.
- MiniMax Music 2.6 confirmed (§213, May 2026) — activates `arc-compose` plan.
- ACE-Step 1.5 trending (§214, May 2026) — monitor fal.ai endpoint for silent upgrade.

---

## FROM RESEARCH (Cycle 203, 2026-05-26) — promoted to queue

### vocal-choir — sing into mic → 3 auto-harmony voices appear in 3D space `[queued, zero deps, zero API]`
Route: `/dream/174-vocal-choir`. Mic → autocorrelation pitch detection (same `detectPitch()` as
`13-piano-canvas`) at 30Hz. On a stable detected pitch: spawn three `OscillatorNode`s tuned
to +4 semitones (major third, violet), +7 semitones (perfect fifth, teal), and −12 semitones
(bass octave, rose). Each voice run through a `GainNode(0.25)` + `StereoPannerNode` for basic L/R
placement, then through a `PannerNode` (HRTF model) for 3D spatialization: M3 voice at azimuth
−45° elevation +20°, P5 voice at +45° elevation +20°, bass at azimuth 0° elevation −25°. User voice
= center. The four voices together form a choral SATB formation around the listener's head.

Visual: dark canvas, 4 glowing orbs in a semicircle (user = bottom center, white; M3 = upper left,
violet; P5 = upper right, teal; bass = lower center, rose). Orb radius scales with voice amplitude.
A thin arc connects the 4 orbs. When the detected pitch shifts, all three harmony oscillators glide
to their new target via `linearRampToValueAtTime(newFreq, now + 0.05)` — smooth 50ms portamento.
Wear headphones: the choir wraps around you. On speakers: clear chord bloom.

Demo mode: slow ascending pentatonic LFO oscillator self-plays so the choir is always active,
showing 4 orbs orbiting around each other at the current pitch without requiring mic permission.

"You sing one voice. Three more appear." First choir prototype in the sandbox. Different from
`23-pitch-harmonize` (phase vocoder pitch-shift, same timbre, 1D shift) — this is additive
synthesis at independent frequencies, giving genuinely distinct voices. Different from
`7-spatial` (existing audio file source) — this uses your own voice as the root. Zero deps,
zero API. One cycle. Inspired by §219 (AI Harmonizer, NIME 2025). Aligns with Karel's love of
`148-spatial-palette` ❤️ (spatial synthesis) and `105-pluck-field` ❤️ (resonant harmonic synthesis).

### sdf-cave — audio-reactive SDF ray-marching shader: an architectural space that breathes with sound `[queued, zero deps, zero API]`
Route: `/dream/175-sdf-cave`. A WebGL fragment shader renders a cave-like interior space via SDF
(signed-distance function) ray marching. No Three.js, no external deps — just a `<canvas>` with
a `WebGLRenderingContext` and an inline GLSL shader string.

SDF scene: three primitives combined with smooth-min blending:
- A rounded box (cave room walls)
- A torus (ceiling arch)
- A series of stalactite columns (domain-repeated vertical capsules)
Smooth-min `smin(a, b, k)` merges them organically; `k` is the key audio-reactive parameter.

Audio mapping:
- **Bass energy** → `k` (smin blend factor 0.1→0.8): walls melt together and separate rhythmically
- **Treble energy** → Perlin-style noise displacement on the SDF: surface becomes rough, jagged
- **Spectral centroid** → color temperature of the cave light (violet = deep bass, ice-blue = treble)
- **Onset** → brief camera shake (translate ray origin ±0.03 for 2 frames)

Lighting: single directional ambient point inside the cave (warm amber, dim, distance-attenuated).
Dark palette: near-black stone + deep violet shadows + the centroid-driven color accent.

Camera: slow orbital drift (0.005 rad/s) — the cave rotates lazily. Mic button stops the drift
and lets the music drive the feel entirely. Demo oscillators (same as `10-strange`) fill in when
no mic.

"You are inside a space that breathes with your music." First prototype in the sandbox where the
viewer is *inside* the visual space — 173 prior prototypes produce visuals *on* the canvas. SDF
ray-marching is a completely new visual paradigm for the sandbox. Zero deps, zero API. One cycle.
Inspired by §224 (MUTEK Sphaîra, architectural acoustics) + §225 (Revision 2026 Shader Showdown,
SDF smin technique). Highest surprise factor of this research batch.

### score-structure — the architecture of your improvisation, visualized `[queued, zero deps, zero API]`
Route: `/dream/176-score-structure`. Mic → two simultaneous analysis streams:
1. **Chord detection** (same 12-bin chroma + template match as `28-chord-canvas`): detect root + quality every 2 beats (≈2s at 60 BPM).
2. **Density analysis**: count onsets per 2-second window via autocorrelation confidence peaks.

Build a scrolling 2D grid (X = time, right-to-left, one column per 2-second window; Y = 12 pitch
classes). Each detected chord fills a colored column cell: hue from root class (same pitch-class
wheel as `1-live`), saturation from density (sparse = desaturated, dense = vivid), brightness from
quality (major = warm, minor = cool). After 8 columns (16 seconds ≈ 4 bars), auto-label the section
with a short tag: "Intro" (sparse + wide intervals), "Build" (density rising), "Climax" (dense +
rapid chord changes), "Resolution" (consonant + slowing density), "Coda" (very sparse).

Secondary display: a small "style bar" at the top shows the current section's character as 3
horizontal gauges: Density (0-10 onsets/2s), Complexity (chord changes/min), Register (FFT spectral
centroid low/high). The labels change in real time.

"The architecture of your improvisation." First prototype to analyze musical *structure* rather
than signal — all 175 prior prototypes visualize FFT, pitch, or timbre. This surfaces the
compositional shape of what Karel is playing. Natural complement to `28-chord-canvas` (single chord),
`24-piano-roll` (pitch history), and `22-code-score` (written score) — these four form a complete
"four perspectives on your playing" suite. Zero deps, zero API. One cycle. Inspired by §221 (Style
Plan visualization, arxiv 2602.15074).

### splat-bloom — Gaussian-language audio-reactive visual field `[queued, zero deps, zero API]`
Route: `/dream/177-splat-bloom`. 500 oriented Canvas2D ellipses, each defined by position (x, y),
rotation (angle), scale (rx, ry with rx:ry ≈ 1:3–1:8 for elongated splat shape), opacity (0.3–0.7),
and hue. Initial layout: Gaussian scatter around canvas center (σ = 0.2 × canvas width/height).
Render: `ctx.save() → ctx.translate(x,y) → ctx.rotate(angle) → ctx.scale(rx,ry) → ctx.beginPath()
→ ctx.arc(0,0,1,0,2π) → ctx.fillStyle = hsla(hue, 80%, 70%, opacity) → ctx.fill() → ctx.restore()`.
`globalCompositeOperation = "screen"` (additive) so overlapping splats bloom rather than occlude.

Audio mapping:
- **Bass energy** → "bloom push": the 100 splats nearest to the canvas centroid scale outward (rx,ry
  × 1 + bass × 0.6) and fade slightly (opacity − 0.15 × bass). Creates an outward bloom on bass hits.
- **Treble energy** → slow rotation drift: all splats rotate += treble × 0.008 rad/frame. High treble
  makes the field slowly swirl.
- **Spectral centroid** → hue shift: all splat hues lerp toward warm (centroid > 2kHz = amber/rose)
  or cool (centroid < 500Hz = violet/teal). Hue moves 1°/frame.
- **Onset** → scatter burst: 50 random splats get velocity impulse (random direction, magnitude =
  onset strength × 60px), then spring back to rest position over 90 frames (k=0.015 spring constant).

Background: pure black (#000). The splats accumulate light additively to create a luminous,
cloud-like field — like looking at a galaxy through a soft lens. Completely different visual quality
from all existing prototypes (which are either hard points, fluid fields, or crisp geometry).

Demo mode: 3-LFO oscillator demo signal auto-drives the mapping (no mic needed). Mic mode:
`getUserMedia` → `AnalyserNode` → extract bass/treble/centroid/onset.

"A painting that breathes." Different from `16-particle-life-gpu` (discrete particles with physics)
and `3-fluid` (density field) — this is a *texture field*, a middle ground between particles and
continuous media. Zero deps, zero API. One cycle. Inspired by §222 (WebSplatter, Feb 2026). Aligns
with Karel's loves of `130-tsl-particle-compute` ❤️ and `153-paint-compose` ❤️.

Key findings from Cycle 203 (2026-05-26) — adult research sweep:
- AI Harmonizer (§219, NIME Jun 2025) — 3-voice vocal harmony from mic. Seeds `vocal-choir`.
- NeoLightning (§220, ICMC May 2025) — 3D gesture synthesis, depth-as-reverb. Updates `gesture-music`.
- Structure-Aware Piano Accompaniment (§221, Feb 2026) — style plan timeline. Seeds `score-structure`.
- WebSplatter (§222, Feb 2026) — Gaussian splat Canvas2D technique. Seeds `splat-bloom`.
- Voxtral + Web Speech API (§223, Feb 2026) — spoken-word AV control. Seeds `voice-scene`.
- MUTEK 2026 Sphaîra (§224, May 2026) — architectural sound. Seeds `sdf-cave`.
- Revision 2026 Shader Showdown (§225, Apr 2026) — SDF smin technique. Also seeds `sdf-cave`.
- Gesture Control Framework (§226, Apr 2026) — relative joint distances. Updates `body-conductor`.

---

## FROM RESEARCH (Cycle 213, 2026-05-27) — promoted to queue

### ritual-generate — I-Ching coin casting → Lyria 3 Pro meditation music `[queued, needs GEMINI_API_KEY — already planned]`
Route: `/dream/182-ritual-generate`. Six rounds of virtual coin throwing: each round, tap
the screen 3 times (or click a large "Throw" button). Each throw shows 3 coins landing heads/tails
(animated flip). Three coin results determine one hexagram line: 3 tails → broken line with moving
dot (·⁻⁻); mixed → solid line (——) or broken line (⁻⁻); 3 heads → solid line with dot. After 6
rounds: the hexagram (1–64) is complete, drawn line by line from bottom to top on the canvas as an
ink-brush animation.

The hexagram number maps to one of Resonance's journey themes + a meditative music prompt:
- Hexagrams 1–8 → Cosmic / Space themes → "vast orchestral drone, long reverb, celestial pad, no melody, 50 BPM"
- Hexagrams 9–16 → Earth / Grounding → "low cello drone, stone resonance, slow pulse, 40 BPM"
- Hexagrams 17–24 → Inner Sanctuary → "solo piano meditation, sparse, 55 BPM, warm reverb"
- Hexagrams 25–32 → Ghost journey → "piano echoes in vast hall, haunting, 45 BPM"
- Hexagrams 33–40 → Forest / Organic → "forest ambience, birdsong, gentle piano, 60 BPM"
- Hexagrams 41–48 → Water / Flow → "water trickle, resonant room, 50 BPM, minimal piano"
- Hexagrams 49–56 → Snowflake / Crystal → "bright piano harmonics, crystalline texture, 65 BPM"
- Hexagrams 57–64 → Homecoming / Resolution → "warm major chords, home key, gentle 55 BPM"

Server route calls `fal-ai/lyria3/pro` with the prompt. 30s ambient piece plays through
live-bloom radial visualizer. Below the hexagram: traditional Chinese name + one-line interpretation.
"Cast the coins. Receive music." Admin-only (GEMINI_API_KEY). Zero new npm deps. One-cycle build.

**Why this stands out**: all 181 prior prototypes trigger music via mic, click, slider, or text.
This is the first where the trigger is a **ritual act** — a series of chance operations that carry
symbolic weight. The I-Ching connection to Resonance's journey themes is natural: both navigate
states of being through structured phases. Inspired by §228 (ICMC 2026, Music of Changing Lines).
Surprise factor: very high. Aligns with Karel's #3 priority: live performance / ceremony.

### camera-compose — webcam snapshot → Gemini vision → Lyria 3 Pro ambient track `[queued, needs GEMINI_API_KEY — already planned]`
Route: `/dream/183-camera-compose`. Single-page UI: large camera preview area (webcam via
`getUserMedia({ video: true })`). A large "📷 Take snapshot" button freezes one frame and sends
it as a base64 JPEG to a server route. Server calls Gemini Flash vision API: system prompt =
"Describe this scene in ≤30 words, focusing on light quality, mood, textures, and any motion.
Avoid naming people." The description is displayed as secondary text ("I see: [description]...").
Then a second server call: `fal-ai/lyria3/pro` with prompt
`"ambient music for: [description]. Minimal, contemplative, 60 BPM, no lyrics."` →
returns 30s MP3 → decode → play through live-bloom radial visualizer.

After playback: "Take another snapshot" re-triggers the cycle. Three snapshot history (small
thumbnails at bottom) with their generated descriptions. No audio saved; just plays once.
Fallback (no webcam): a 6-scene picker (Stone Chamber / Forest Dawn / Cosmic / Winter / Waves /
Desert Night) with hand-authored descriptions that go directly to Lyria.

Admin-only (GEMINI_API_KEY). Zero new npm deps. One-cycle build.

**Why this stands out**: first prototype that reads the visual world as a music trigger. All 181
prior prototypes use audio (mic), keyboard/mouse, or API text. This inverts the direction: you
look at your environment, the system listens through your eyes and plays back what it hears.
Deeply aligned with LUMIA (§231, NeurIPS 2025) and the "camera as instrument" paradigm. Natural
for a morning ritual or workspace setup: "play me music for where I am right now."

### piano-motion — watch Karel's piano tracks being played, animated `[queued, zero deps, zero API — uses /api/audio/[id]]`
Route: `/dream/184-piano-motion`. Load one of Karel's piano tracks from the Resonance audio API
(`/api/audio/[id]`). A track picker shows 3–4 of his Welcome Home album pieces. On selection: fetch
and decode the audio → run offline autocorrelation pitch detection (same algorithm as `13-piano-canvas`)
→ extract note events (onset time, pitch, duration, amplitude).

Visualization: full-width top-down piano keyboard (88 keys, C0–B7). Two cartoon hands positioned
above the keys: left hand (bass clef register, below C4) and right hand (treble clef, C4 and up).
For each note event:
- The appropriate hand's finger (index or middle finger, alternating) glides smoothly to the
  correct key position via spring interpolation (k=0.12, damping=0.6).
- At onset: key brightens (overlay glow) + finger scales down slightly ("press"), then springs back.
- Multiple simultaneous notes: fingers spread across the keys; chords show all active fingers lit.
- Hand color: left = deep violet/indigo, right = warm rose/amber (matching `1-live` palette).

Background: pure dark canvas; keys are slim white/black rectangles with subtle edge glow. No
tablature, no score overlay — just the hands and keys. A small "Now playing:" title and a playhead
below the keyboard.

Demo/fallback: if `/api/audio/[id]` is unavailable, falls back to the Bach fragment from
`22-code-score` (pre-hardcoded note array). But the primary use is Karel's real recordings.

**Why this stands out**: first prototype that animates the ACT of playing rather than the SOUND.
All 181 prior prototypes visualize audio output. This visualizes musical gesture — the hands,
the reach, the simultaneous notes. Watching your own music being played back as animation is an
entirely different emotional experience. Zero deps (Canvas2D + Web Audio). Implements AGENT.md
directive: "build prototypes that USE his real piano tracks as the audio source."
Inspired by §229 (PianoFlow, arxiv 2604.12856).

Key findings from Cycle 213 (2026-05-27) — adult research sweep:
- Stable Audio 3 (§227, May 2026) — sub-2s generation, inpainting/continuation, public weights. Upgrade path for `43-stable-extend`.
- I-Ching + Lyria (§228, ICMC May 2026) — ceremonial coin casting → AI music. Seeds `ritual-generate`.
- PianoFlow (§229, Apr 2026) — streaming bimanual piano motion synthesis, 9× faster. Seeds `piano-motion`.
- SAMUeL (§230, Jul 2025) — 15M real-time vocal accompaniment, 52× faster. Monitor for fal.ai listing.
- LUMIA vision-to-music (§231, Dec 2025) — webcam → Gemini vision → ambient track. Seeds `camera-compose`.
- Lyria 3 Pro on fal.ai (§232, May 2026) — `fal-ai/lyria3/pro` now live. Upgrades all Lyria-based queued specs.
- Mirelo SFX 1.6 full suite (§233, May 2026) — extend-audio + inpaint-audio added. Upgrades `ghost-loop` + `stable-extend`.

---

### param-layer — hierarchical parameter-ring synthesizer `[queued, zero deps, zero API]`
Route: `/dream/201-param-layer`.
Inspired by §234 (DEMON, arXiv:2605.28657, May 2026): 4 concentric drag-ring controls,
each broadcasting through all layers below it — outer ring = fundamental/mass, next = odd/even
harmonic balance, next = inharmonicity stretch, inner = amplitude envelope shape. Each drag
gesture simultaneously reshapes all timbral dimensions below it, giving the "one control,
global timbre reshape" feeling of DEMON without any diffusion model.

Implementation: build on the harmonic-series oscillator graph from `200-harmonic-series`
(16 OscillatorNode → GainNode chain, same BELL_RATIOS trick for inharmonicity). Replace the
preset buttons with 4 SVG concentric rings — drag angle maps to 0–1 parameter. JavaScript
propagation: outer ring scales fundamental (60–500 Hz); ring 2 adds/removes even harmonics;
ring 3 stretches partial ratios from integer toward bell inharmonicity; ring 4 shapes ADSR
of the master gain. One AnimationFrame loop updates all OscillatorNode frequencies + GainNode
values using setTargetAtTime. Canvas: ring UI + live Lissajous-style overlay showing summed
waveform shape. Zero deps · Zero API · one cycle scope.

---

### membrane-drum — 2D finite-difference drumhead simulation `[demoable, built Cycle 235 — /dream/202-membrane-drum]`
Route: `/dream/202-membrane-drum`.
Inspired by §234 (DEMON, May 2026) and `200-harmonic-series` Bell preset: a circular drumhead
solved with 2D finite-difference wave equation on an N×N grid (~128×128). Tension (c²) and
damping (d) are user-controlled via sliders; clicking/tapping anywhere on the canvas strikes
the membrane at that point. Wave propagates outward; boundary condition: fixed (zero at rim).

Audio: sample the center point of the grid each frame as a 1D time-domain signal → feed into
an AudioContext ScriptProcessorNode or AudioWorklet for audible output. The inharmonic overtone
ratios of a real circular membrane (2.295×, 3.598×, 4.904×, … the Bessel zeros) emerge
naturally from the physics without any manual partial tuning.

Canvas: visualize the Z-displacement as a color map (blue=negative, white=zero, amber=positive)
drawn to a 2D canvas element with ImageData. A ring of colored waveform traces below shows the
last 1s of center-point audio. Zero deps · Zero API · one cycle scope.

Key findings from Cycle 233 (2026-05-29) — research note (brief, build cycle):
- DEMON (§234, May 2026) — real-time diffusion music instrument, hierarchical parameter propagation. Seeds `param-layer` and `membrane-drum`.

---

## FROM RESEARCH (Cycle 247, 2026-05-30) — promoted to queue

### dance-avatar — spring-physics stick figure that dances to audio `[queued, zero deps, zero API]`
Route: `/dream/214-dance-avatar`. A 12-joint skeleton (head, shoulders×2, elbows×2, hands×2, hip,
knees×2, feet×2) animated by spring physics driven in real time by FFT bands. No ML, no CDN dep.

**Joint physics**: per-joint `{pos, vel, restPos}` object. Each frame:
`vel += (restPos - pos) * k - vel * damping; pos += vel` (spring constant k=0.18, damping=0.82).

**Audio mappings to rest positions** (all relative to canvas center):
- **Sub-bass** → hip sway: `restPos[hip].x = center.x + sin(t×1.2) × bass × 40px`
- **Bass** → knee lift: `restPos[kneeL/R].y = center.y - bass × 35px` (knees rise)
- **Mid** → arm raise: `restPos[handL/R].y -= mid × 80px`
- **Treble** → arm splay: `restPos[handL].x = center.x - 60 - treble × 30px`; handR mirrors
- **Onset** → jump impulse: `vel[all].y -= onset × 120` (upward velocity on every joint)
- **Spectral centroid** → lean: `restPos[head].x = center.x + (centroid - 0.5) × 20px`

**Render**: each limb segment as a glowing Canvas2D line (`lineWidth=3`, `shadowBlur=14`). Hue per band
segment: hip/torso=violet (sub-bass), upper arms=teal (bass), forearms=amber (mid), hands=rose (treble).
Head: circle, radius 18px, white glow. Black background, pure additive blending. Subtle motion trail:
ghost skeleton 5 frames behind at 25% opacity.

Demo mode: same LFO oscillators as other prototypes, figure dances to the LFOs. Mic mode: live FFT.
Start screen: "▶ Watch it dance" (demo) / "🎤 Let it hear you" (mic), matching `1-live` UX pattern.

**Why this fills a paradigm gap**: 213 existing prototypes — none animate a human figure. Fluid, particles,
terrain, geometry, piano rolls — all non-human visual languages. A dancing figure is qualitatively
different: it reads as *responsive* rather than *reactive*. Live performance fit: project onto a wall
next to the pianist; the figure dances to their music. High surprise factor. Inspired by DiscoForcing
(ICML 2026, arXiv:2605.28491): "music has kinetic energy; a body is its natural receiver."
Zero deps, zero API. One-cycle build. Research basis: RESEARCH.md §§235, 243.

---

### fm-explorer — FM synthesis timbral landscape `[queued, zero deps, zero API]`
Route: `/dream/215-fm-explorer`. FM (frequency modulation) synthesis underlies the DX7 (1983, best-selling
synthesizer ever), 808 bass, electric piano, metallic percussion. Two `OscillatorNode`s: carrier (C) and
modulator (M). FM equation: C_freq_input = C_freq + sin(M_phase) × FM_index × M_freq.

```js
const carrier = actx.createOscillator();          // heard output
const modulator = actx.createOscillator();         // modulates carrier freq
const modGain = actx.createGain();                 // FM index controls depth
modulator.connect(modGain);
modGain.connect(carrier.frequency);               // AudioParam.connect — the key line
carrier.connect(masterGain);
```

**Interaction**: A 2D canvas. X axis = carrier pitch (C2–C7, log-spaced). Y axis = modulator-to-carrier
ratio (0.5–8.0). Mouse position determines both. FM index = distance from canvas center (0 at center,
max at corner), OR a vertical range slider at right. Moving across the canvas sweeps through hundreds
of timbres without any label-reading. A light background color field encodes timbral complexity (green=simple
sine, amber=bell, rose=metallic, violet=complex/noisy).

Presets: **Bell** (E4, ratio √2, index 8), **Rhodes** (C3, ratio 2:1, index 3.5), **Clangy** (G3, ratio 3.5:1,
index 12), **Sub** (A1, ratio 1:1, index 2), **Metallic** (D3, ratio 5:3, index 15). Each preset fires a
short note on click. Display below canvas: carrier Hz + note name, ratio, index value as a small monospace
HUD row. Live Lissajous waveform strip (same as `20-scope`) shows the FM output shape.

Mic mode: RMS amplitude → FM index (quiet=gentle sine, loud=complex metallic). "Play loud and the timbre
becomes more complex." Live performance: vary ratio while playing = timbral glide through FM space.

**Why this fills a gap**: 213 prototypes, none use FM synthesis. OscillatorNode has been used as audio
source in every prototype but never as a modulator. The DX7's 6-operator FM creates a vast palette from
3 lines of Web Audio code. "Navigate the space of synthesized timbre." Zero deps, zero API. One-cycle build.
Research basis: RESEARCH.md §241.

---

### waveshape-draw — draw a waveform on canvas, hear your timbre change in real time `[queued, zero deps, zero API]`
Route: `/dream/216-waveshape-draw`. A canvas shows a 1-period waveform as a white curve on black. User
draws directly on the wave by dragging (mouse or touch), deforming it to any shape. The drawn curve is
immediately converted to a `PeriodicWave` and applied to an `OscillatorNode` — the timbre changes in
real time as you draw.

**Conversion pipeline** (runs on each `pointermove`, ~0.3ms):
1. Sample drawn curve at 512 evenly-spaced x positions → `Float32Array` (amplitude values −1..1)
2. Forward DFT (Cooley-Tukey, inline ~20 lines of JS): extract bins 0–63 (the perceptually significant partials)
3. `cosTerms[k] = real[k] / 512; sinTerms[k] = imag[k] / 512`
4. `const wave = actx.createPeriodicWave(cosTerms, sinTerms, {disableNormalization: false})`
5. `oscillator.setPeriodicWave(wave)`

**UI**: The waveform canvas is the primary element (full width, ~200px height). Below it: a harmonic
spectrum strip (horizontal bar chart of magnitudes for partials 1–32, color-coded by partial index,
same hue mapping as `1-live`). A pitch slider below (C2–C7). Draw interactions: left-drag reshapes the
curve; right-click (or two-finger on mobile) resets to flat sine.

**Presets** (7 buttons): Sine, Square, Sawtooth, Triangle, "DX7 Piano" (pre-loaded 32-coefficient
shape that approximates a DX7 FM piano patch), "Glass Harmonica" (strong 2nd+3rd harmonics, weak
fundamentals), "Bowed String" (odd harmonics with amplitude decay, like violin). Each preset loads a
pre-computed Float32Array into the canvas and immediately applies `createPeriodicWave`.

Mic mode: RMS amplitude → distorts the current drawn shape (multiplies values by `1 + rms × 2`, then
clips at ±1) — louder playing = more harmonic distortion.

**Why this inverts the paradigm**: all 213 prior prototypes react to or visualize sound. `waveshape-draw`
sculpts the source. The visitor draws a shape and hears exactly what that mathematical shape sounds like
— an inverted oscilloscope. Natural triptych with `20-scope` (visualize waveform of audio) and
`13-piano-canvas` (playing draws art): now completing the set with "draw the art, it becomes audio."
Zero deps, zero API. One-cycle build. Research basis: RESEARCH.md §242.

---

### optical-flow-music — webcam frame differencing → expressive synthesis, no CDN `[queued, zero deps, zero API]`
Route: `/dream/217-optical-flow-music`. Webcam → Canvas2D frame differencing optical flow → Web Audio synthesis.
No MediaPipe, no CDN dep — pure pixel math.

**Flow extraction**:
1. `getUserMedia({ video: true })` → `<video>` element (360p sufficient)
2. Each rAF: draw frame to offscreen canvas, `getImageData()` → per-pixel grayscale
3. Per-pixel: `delta[i] = |curr_gray[i] - prev_gray[i]|` (stores luminance change)
4. Downsample to 20×15 grid (300 cells). Per cell: `mag = avg(|deltas| in 8 pixels)`,
   `dx = avg(right-half - left-half)`, `dy = avg(bottom-half - top-half)`
5. Global: `totalMag = Σmag/300`, `hBias = Σdx/300` (rightward flow), `vBias = Σdy/300`

**Synthesis** (2 OscillatorNodes + BiquadFilter + ConvolverNode reverb):
- **totalMag** → filter cutoff: `400 + totalMag × 5600 Hz` (still=dark, moving=bright)
- **hBias** → pitch: `C3 × 2^(hBias × 2.5)` ≈ ±2.5 octaves around C3 (flow right=up, left=down)
- **vBias** → reverb send gain: `Math.max(0, vBias × 2)` (downward motion=wet)
- **totalMag** → note rate: arpeggiation interval = `max(50ms, 800 - totalMag × 700)ms` (fast motion=rapid notes)

**Display**: webcam feed at 40% opacity. Per grid cell: a glowing gradient line from cell center in direction
`(dx, dy)` (arrow visualization). Line length = `mag × 30px`. Color: hue from motion direction
(rightward=amber, leftward=violet, upward=teal, downward=rose). 6-band spectrum bar at bottom (same as `1-live`).

"Dance in front of the camera — the motion IS the music." First prototype using optical flow (no landmarks,
no CDN, zero deps). Different from `31-gesture-music` (MediaPipe hand tracking), `101-camera-song`,
`147-face-synth`. Inspired by V2M-Zero (arXiv:2603.11042). Zero deps, zero API. One-cycle build.
Research basis: RESEARCH.md §§237, 244.

---

### paths-granular — Karel's piano tracks granularized `[queued, zero deps, zero API — uses /api/audio/[id]]`
Route: `/dream/218-paths-granular`. Load one of Karel's Welcome Home album tracks from the Resonance
audio API (`/api/audio/[id]`). Track picker shows 3–4 available pieces. On selection: fetch → decode
via `AudioContext.decodeAudioData()` → store as `AudioBuffer`. Granular synthesis engine plays tiny
windowed segments (grains) from the buffer at user-controlled parameters.

**Controls** (large sliders, mobile-friendly):
- **Scrub position** (full-width horizontal) — extraction point in the track (0–100%)
- **Grain size** (20–500ms slider) — window size per grain (Hann-windowed)
- **Density** (2–30 grains/second)
- **Pitch shift** (−12 to +12 semitones, via playback rate)
- **Scatter** (0–400ms random offset from scrub position per grain)

**Per-grain render**: extract buffer slice at `scrubPos + rand(-scatter, scatter)`, apply Hann window
(`w[i] = 0.5 × (1 − cos(2π×i/N))`), create `AudioBufferSourceNode`, set `.playbackRate` for pitch shift,
pan to random position within ±0.3, start at `actx.currentTime + jitter`. All in JS, no external deps.

**Display**: full waveform of the decoded track as a glowing amber horizontal strip (use `OffscreenCanvas`
or `ImageData` to render the waveform at page load). A bright cursor at the current scrub position.
Sparkle particles fly off the scrub point (one per grain, direction = random, decay 0.6s) — visible indicator
of grain density. Current track name and duration shown.

**Why Karel's own music**: granular synthesis of his piano recordings produces something entirely new —
a crystallized, non-linear texture of his own playing. Scrubbing slowly at high density over a chord =
ethereal shimmer. Large grain + low density = scattered piano chords in silence. The visitor becomes a
DJ of Karel's own work. First prototype to address AGENT.md directive "build prototypes that USE his
real piano tracks as the audio source" in a purely transformative (not playback) way.

Demo/fallback: if `/api/audio/[id]` returns 401 or 404, load a 10s demo buffer of a C major chord
generated from OscillatorNodes at page open — granular synthesis still works, just on synthetic audio.
Zero new npm deps. One-cycle build. Research basis: Dennis Gabor (1946), Curtis Roads (1978, granular
synthesis foundations); RESEARCH.md §163 (Karel's Paths tracks), AGENT.md Karel-music directive.

---

Key findings from Cycle 247 (2026-05-30) — full research sweep:
- DiscoForcing (§235, ICML 2026, May 2026) — streaming audio→full-body animation, zero ML in browser. Seeds `dance-avatar` (spring physics, zero deps, human-figure gap, live performance fitness).
- EchoAvatar (§236, May 2026) — 3D character from audio + LLM. Server-side; validates audio→motion linkage.
- V2M-Zero (§237, Mar/May 2026) — video-to-music without paired data. Seeds `optical-flow-music` (frame diff, no CDN, zero deps).
- BEAT tokenization (§238, April 2026) — beat-quantized tokens improve music generation coherence. Seeds future `beat-looper` concept.
- ACE-Step UI trending (§239, May 2026) — 1,940 stars/month confirms ACE-Step 1.5 community momentum.
- Seedance 2.0 multimodal (§240, May 2026) — top video model with audio-reference input. Updates `ghost-animate`.
- FM synthesis gap (§241, synthesis note) — none of 213 prototypes use FM. Seeds `fm-explorer`.
- createPeriodicWave gap (§242, API note) — most underused Web Audio primitive. Seeds `waveshape-draw`.
- Dance avatar design (§243) + optical flow design (§244) — detailed build specs for zero-dep one-cycle implementations.

---

### kids-sing-creature — voice-grown 3D creature (call-and-response) `[seed from cycle 268 DEEP non-winner, build-verified]`
Route would be `/dream/<n>-kids-sing-creature`. **This was fully built and clean-building in cycle 268 as the sibling approach to the shipped `234-kids-hand-creature`; banked here, not committed.** Mic → one AnalyserNode (fftSize 2048); per frame compute RMS (loudness) + autocorrelation pitch (range-gated 80–1000 Hz, parabolic-interpolated, smoothed). Loudness → `uGrow` inflation + `uBright`; sustained loudness → `uSpike` (a held "AAAH" erupts the surface into spikes, quiet humming stays round); pitch → `uHue` (low=violet, high=amber/rose, shortest-path eased). Pitch is **snapped to nearest C-major-pentatonic note and sung back** as a soft sine+octave-triangle chime (60ms attack / 1.4s release, feedback delay) — call-and-response: the child sings, the creature sings the in-tune version back. Same Perlin-displaced icosahedron blob (three.js + Bloom) as 234; always-on ambient pad. Graceful degradation: sleeping-breathing idle → mic-denied auto-demo phrase + tap-to-bounce. Tags: mic · three.js · pitch-detection(autocorrelation) · kids. Clears ambition floor (first-3D-kids + autocorrelation-pitch + ≥3 subsystems). **Why it's promising**: it's the *voice* half of the no-touch-creature concept — pairs with 234 (hands) as a two-input set; the "creature sings your note back in tune" loop is a genuine ear-training toy. **To resurrect**: copy the cycle-268 page.tsx pattern (it built green); next-cycle deepening = two harmonizing creatures, a memory-phrase playback ("it remembers your song"), and a downsampled/FFT-assisted pitch estimator for cheap tablets.

---

### spectral-terrain — fly through a recording's spectrogram as 3D terrain `[seed from cycle 269 WIDE non-winner, build-verified]`
Route would be `/dream/<n>-spectral-terrain`. **Fully built and clean in cycle 269 as a WIDE sibling to the shipped `236-particle-life-song`; banked here, not committed.** A `THREE.PlaneGeometry` 128 freq-cols × 96 time-rows height-field: X=frequency (log-ish, bass spread wider), Z=time (scrolls backward), Y+vertex-color=spectral energy. Each frame an `AnalyserNode` (fftSize 2048) `getByteFrequencyData` is downsampled into a fresh leading-edge row pushed into a ring-buffered height-field (moving `head` pointer, no full memmove), normals recomputed for lighting. Violet→cyan→amber/rose heat ramp, exponential fog, Bloom on crests, a gliding/bobbing fly-camera + OrbitControls. **Audio source = file upload** (invites Karel's Paths tracks, decodeAudioData→loop) with a built-in generative pentatonic arpeggio fallback so the terrain is alive before any upload; rose error on decode-fail, readable WebGL-fail notice. Reference: TouchDesigner "spectrogram waterfall as flying terrain." Tags: audio-file(upload) · three.js 3D · scrolling-spectrogram-terrain · organic/immersive. **Why promising**: pairs Karel's loved `227-paths-granular` (his real music as source) with a genuinely immersive 3D form — first 3D spectral-terrain in the lab. **To resurrect**: cycle-269 page.tsx built green; next-cycle deepening = stereo (two terrains L/R), beat-synced camera lurches, and a "freeze + walk the canyon" mode.

### tonnetz-lattice — harmony as a place you walk (neo-Riemannian) `[seed from cycle 269 WIDE non-winner, build-verified]`
Route would be `/dream/<n>-tonnetz-lattice`. **Fully built and clean in cycle 269 as a WIDE sibling to the shipped `236-particle-life-song`; banked here, not committed.** A 3D Tonnetz (Euler's tone-network): axial lattice where q steps by a perfect fifth (+7 st) and r by a major third (+4 st), gently bowed into a curved sheet (r3f + drei `Text` labels + Bloom, OrbitControls). Every small triangle is a maj/min triad; nodes colored on the chromatic hue wheel (C=red…) matching `1-live`/`229-chord-canvas`. **Play it two ways**: (1) click a triangle → full triad (3 osc + lowpass + feedback-delay), click a node → its pitch + highlight the triads it belongs to; P/L/R buttons glide to the neighbor triad and voice-lead only the moving note (animated pan/rotate so the new triad centers) — neo-Riemannian transforms made visible+audible. (2) mic mode → 4096-FFT → 12-bin chroma → dot-product vs 24 maj/min templates → light up the live triad; mic-denied falls back to click mode with a rose notice. Reference: Euler's Tonnetz; Hugo Riemann; the modern PLR transformation group. Tags: touch/click(+mic) · three.js 3D lattice · Tonnetz/neo-Riemannian PLR · geometric/Ikeda-clean. **Why promising**: first lattice-of-harmony piece; the only one in the lab that makes chord *relationships* spatial — a real ear/eye training instrument and a crisp geometric counterpoint to the lab's warm pieces. **To resurrect**: cycle-269 page.tsx built green (verify drei `Text` SSR); next-cycle deepening = trace a played progression as a glowing path across the lattice, and a "chord-route finder" that animates the shortest PLR path between two chords.

---

### kids-sing-garden — sing a GLSL fluid sky, hear your melody back `[seed from cycle 270 WIDE non-winner, build-verified]`
Route would be `/dream/<n>-kids-sing-garden`. **Fully built and clean-building in cycle 270 as a WIDE sibling to the shipped `238-kids-tilt-world`; banked here, not committed (108 kB, no three.js).** A fullscreen **raw WebGL fragment shader** (fullscreen triangle, hand-written GLSL: value-noise fbm + domain warping animated by `uTime`) renders a slowly-flowing fluid color field that breathes in calm violet/blue at rest. Mic → **autocorrelation** pitch (80–900 Hz, clarity-gated) + RMS: pitch → `uHue` (violet→rose→gold) + `uY` (high notes bloom at top), loudness → `uBloom` intensity + `uFlow` warp speed — the child paints the sky with their voice. Sung pitches sampled every ~120 ms (cap 48); **"Hear it!"** plays them back **quantized to C-major pentatonic** as soft sine+triangle tones, pulsing the shader in sync. Never-silent ambient pad. Mic used live-only (analyser-only connection, no feedback, nothing stored); graceful degrade to a touch-the-sky drag mode (Y=pitch) with a rose notice, shader stays alive. Reference: Refik Anadol latent color fields; Vincent Morisset's *Bla Bla*; the loved `158-kids-hum-paint` + `100-kids-paint-song`. Tags: **mic/voice-pitch · raw-WebGL-fragment-shader · autocorrelation+melody-loopback · contemplative/bedtime**. **Why promising**: the lab's **first kids GLSL fragment-shader piece** (all ~110 others are 2D canvas), it fills the empty calm/pre-sleep niche, and the voice→shader-bloom mapping is genuinely new. **To resurrect**: cycle-270 page.tsx built green (TS+ESLint clean); next-cycle deepening = star/particle accents that seed where you sang, a two-voice harmony mode, and a "the sky remembers last night's song" persistent melody.

### kids-wave-band — conduct a band by waving at the camera (zero-dep motion) `[seed from cycle 270 WIDE non-winner, build-verified]`
Route would be `/dream/<n>-kids-wave-band`. **Fully built and clean-building in cycle 270 as a WIDE sibling to the shipped `238-kids-tilt-world`; banked here, not committed.** **Zero-dependency frame-differencing**: each frame the live video is drawn tiny (64×48) to a hidden offscreen canvas, grayscaled, and compared to the previous frame — the sum of `|pixel − prevPixel|` per region *is* motion energy (no MediaPipe, no ML). Screen split into 5 vertical zones (BANDIMAL: left=low/biggest → right=high); zone motion past threshold opens that zone's pentatonic voice (C3 E3 G3 C4 E4, triangle + shimmer sine, `setTargetAtTime` envelopes), louder with more motion. **Output = WebGL particles (THREE.Points)**: motion centroids spawn glowing additive sprites colored per zone over pulsing glow quads, camera mirrored horizontally (a "ghostly silhouette of light," video itself hidden). Never-silent ambient pad; after ~3 s of stillness it auto-pulses a zone to show what movement does. Camera live-only (frames discarded each tick, tracks stopped on exit); graceful degrade to pointer mode (drag across zones) with a rose notice. Reference: the loved `101-camera-song` + `221-optical-flow-music`; Daniel Rozin's mirror works; Toca Band (motion replaces tap). Tags: **camera-motion (frame-diff, zero-dep) · WebGL-particles · optical-energy → voices · kids/playful**. **Why promising**: turns *gross-motor whole-body movement* into music with no model to fail — lighter and more forgiving than the MediaPipe-based `234`. **Held back this cycle only because** a camera kids piece (234) shipped last cycle; revive once camera isn't in recent history. **To resurrect**: cycle-270 page.tsx built clean (tsc+eslint); next-cycle deepening = adaptive lighting threshold (auto-calibrate to the room), a horizontal "pitch-bend" from motion height within a zone, and a two-kid duet split (left half / right half).

---

### spectral-canyon — fly through your music as a scrolling spectrogram terrain `[seed from cycle 271 DEEP non-winner, build-verified]`
Route would be `/dream/<n>-spectral-canyon`. **Fully built and clean (authoritative `npm run build` green with it present in cycle 271) as a DEEP sibling to the shipped `243-spectral-cloud`; banked here, not committed.** A `THREE.PlaneGeometry` 128 freq-cols × 96 time-rows height-field: frequency runs across X (power-warped so bass spreads wide), the newest `getByteFrequencyData` row is written at a moving `head` index, magnitude → elevation, and the whole mesh glides forward (fly-camera with bob/drift + OrbitControls). Heat ramp violet→cyan→amber/rose, `FogExp2`, onset-flux flash + camera lurch + median-interval **BPM**, spectral-centroid biasing global color temperature + fog density. **Audio = file upload + generative pentatonic pad fallback** (alive on Start), rose decode-error, graceful WebGL-fail notice. Reference: TouchDesigner "spectrogram waterfall as flying terrain" + Refik Anadol data-landscapes. Tags: **audio-file-input · three.js-3D · spectrogram-terrain · immersive/Anadol**. **Why promising**: the most legible of the three "your music as a 3D world" readings; pairs Karel's loved real-music thread (`227-paths-granular` ❤️, `163-paths-visualizer` ❤️) with an immersive flythrough. **To resurrect**: cycle-271 page.tsx built green. **Known weakness to fix first**: the ring buffer writes the new row at a *cycling* head index but the row Z positions are fixed and the mesh only wraps within one cell — so the time axis scrambles and it reads as an undulating field rather than a clean waterfall flowing toward you. Fix = remap each row's world-Z by `(r − head)` so the head row always sits at the far edge and the whole history marches forward coherently. Then deepen: stereo L/R terrains, beat-synced camera lurches, "freeze + walk the canyon" first-person mode.

### spectral-tunnel — fly down a wormhole carved by your music `[seed from cycle 271 DEEP non-winner, build-verified]`
Route would be `/dream/<n>-spectral-tunnel`. **Fully built and clean-building in cycle 271 as a DEEP sibling to the shipped `243-spectral-cloud`; banked here, not committed.** A radial flythrough: a 64-ring buffer of `LineSegments`+glow-`Points` cross-sections marches toward the camera and recycles by wrapping Z (geometry never reallocated, only typed-array attributes rewritten). Each ring's circumference is displaced by the live spectrum (frequency bin → angle, mirrored for bilateral symmetry), so loud frequencies bulge the wall outward; additive indigo→cyan→rose heat ramp + `FogExp2`. **Motion model is the most correct of the three** (rings genuinely translate in Z and recycle). Subsystems: energy-flux **onset** → forward speed-boost + a flash ripple that travels down the tunnel + FOV punch (with corner BPM/onset readout); spectral **centroid** → hue + twist/spiral rate (brighter music spins faster, warmer); optional OrbitControls "look around" vs default auto-fly. **Audio = file upload + generative pentatonic motif fallback** (drone + plucks so onsets fire), rose decode-error, WebGL-fail notice. Reference: Jeff Minter / demoscene tube-tunnel lineage + Refik Anadol immersive data-tunnels. Tags: **audio-file-input · three.js-3D · spectral-tunnel · immersive/kinetic**. **Why promising**: the most kinetic, immediately-wow of the three; the wormhole is a fresh form for the lab and the per-frame motion is the most physically convincing. **Held this cycle only because** `243`'s volumetric cloud was the tighter match to this cycle's WebGPU-point-cloud research dive and to the loved `130-tsl-particle-compute` ❤️. **To resurrect**: cycle-271 page.tsx built green (uses a `startGenerativeRef` indirection to satisfy exhaustive-deps). Deepen: a real time-history version (each ring = a past spectrum frame, not the current one) so the tunnel wall is the song's recent shape; UnrealBloomPass; beat-locked color strobes.

---

## Banked from Cycle 272 kids WIDE fire (build-verified explorations, not committed)

### `kids-clap-dancers` — clap/onset rhythm → 3D dancing band `[queued, strong]`
**Question**: what if a 4-year-old played RHYTHM with their body — clapping/stomping/shouting — to make a band of 3D creatures dance?
**Spec**: Row of ~5 capsule-bodied three.js creatures with little faces on a warm stage. Mic `AnalyserNode` → half-wave-rectified **spectral-flux + RMS onset detector** (adaptive baseline + refractory window). Each onset → round-robin a creature does gravity-bounce + **squash-and-stretch** (anticipation squash → stretch on rise → squash on land), flash, confetti; louder clap = bigger bounce + brighter + nudges a neighbor. Rolling inter-onset-interval **tempo estimate** drives a self-running backing groove that builds with the child's beat and never goes silent (always-on ambient pad + idle breathing). Each creature owns a voice (kick/tom/shaker/clap/bell) + a C-pentatonic note. Mic-denied → ≥64px CLAP! button + tap-anywhere fallback. three.js output, mic-onset input — clears JURY's kids door cleanly.
**Why it was held, not killed**: very close 2nd to `244` this cycle; lost only on love-alignment (one drum love vs the winner's two voice loves). First clap/onset-driven 3D kids piece in the lab — a genuinely fresh musical dimension (rhythm via amplitude, not melody or location). **Resurrect on cycle 274.** Built clean (tsc+eslint) this fire; ~786 lines.

### `kids-body-band` — whole-body camera motion → music + light `[queued]`
**Question**: what if a 4-year-old played by DANCING their whole body in front of the camera, no touching the screen?
**Spec**: Mirrored webcam behind a dark glowing overlay, divided into 5 vertical zones (5 playground colors, C-pentatonic). Per-frame the video is drawn into a tiny 64×48 offscreen canvas → grayscale → summed |pixel delta| vs prev frame **per zone** (dependency-free frame-differencing, zero ML). Zone motion crossing threshold (with refractory) → rings that zone's voice + a glowing particle burst at the brightest-delta pixel. Always-on ambient pad + idle drift particles (never dead). Camera-denied → tap/drag the stripes. Inspired by Google **"Jump to play" (2026)** whole-body-pose-as-controller + Daniel Rozin motion mirrors.
**Why it was held**: novel camera-body-motion input, but it shipped a **canvas2d output** — the exact over-represented diversity tag JURY banned this week. **Resurrect with a three.js/WebGL particle-field output** (or fuse with MediaPipe pose for a real `body-aurora`) so it clears the diversity bar. Built clean (tsc+eslint) this fire; ~519 lines.

---

## Banked from Cycle 273 adult DEEP fire (the "fly through your music" trio; build-verified, not committed)

Cycle 273 ran DEEP on **"fly THROUGH your own music as a living volume"** — three render approaches built in parallel. **Winner shipped: `246-spectral-splat`** (Gaussian-splat volumetric flythrough, from the AudioGS dive). The other two were rebuilt clean this fire (both passed tsc + eslint in-folder) and are banked again, sharper:

### `spectral-tunnel` — fly down a wormhole carved by your music `[queued, strong — close 2nd, build-verified TWICE (271 + 273)]`
Route would be `/dream/<n>-spectral-tunnel`. The most **kinetic** of the trio. A 64-ring `Float32Array ringZ[]` buffer of `LineSegments` + additive glow `Points` cross-sections that genuinely translate in +Z toward the camera and recycle by wrapping `-TUNNEL_LENGTH`; **each ring freezes the spectrum at spawn**, so the wall streams past like terrain instead of pulsing in place (the correct-motion detail that sells forward travel). Bin→angle (bilateral-mirrored), magnitude→radial bulge; spectral-flux onset → speed boost + FOV punch + a flash ripple travelling *toward* you; centroid → hue + twist rate; median-IOI BPM HUD; auto-fly vs drag-to-look. Audio = generative motif + file/drop + offline demo + optional mic, all graceful. Reference: Jeff Minter / demoscene tube-tunnel + Refik Anadol data-tunnels. Tags: **audio-file-input · three.js-3D · radial-tunnel · immersive/kinetic**. **Held in 273 only because** the splat reading had the tighter research→build chain (today's AudioGS dive) and the genuinely never-used technique; tunnel is a known demoscene form. **Resurrect**: the cycle-273 page.tsx (~937 lines) built green. Deepen: UnrealBloomPass; per-bin decaying max so transients streak the wall; stereo split (L carves left half, R the right, breaking the mirror); branching wormholes on strong onsets.

### `spectral-canyon` — fly over your music as a spectrogram-waterfall terrain `[queued — build-verified TWICE, Z-fix now implemented]`
Route would be `/dream/<n>-spectral-canyon`. The most **legible** of the trio. A `THREE.PlaneGeometry` height-field (128 freq cols × 96 time rows); frequency→X power-warped (`t^0.45`) so bass spreads wide; magnitude→Y elevation; violet→cyan→rose→amber ramp + `FogExp2`. **The known time-axis-scramble bug is now fixed**: each row's world-Z is remapped by its age `((head - r + ROWS) % ROWS)` so the newest row always sits at the horizon and the whole history marches coherently toward the camera (a true waterfall). Onset → camera lurch + flash; centroid → color temp + fog density; BPM/onset HUD; fly-cam + drag-orbit. Audio sources as above. Reference: TouchDesigner "spectrogram waterfall as flying terrain" + Anadol data-landscapes. Tags: **audio-file-input · three.js-3D · spectrogram-terrain · immersive/Anadol**. **Known weakness to fix before shipping**: CPU recomputes ~12k vertex positions/colors + `computeVertexNormals()` every frame — fine on desktop, but move displacement to a GPU vertex shader (and lit `MeshStandardMaterial` + moving light for real ridge shadows) before raising ROWS past ~128. **Resurrect**: cycle-273 page.tsx (~811 lines) built green.

---

## Banked from Cycle 274 kids WIDE fire (build-verified explorations, not committed)

Cycle 274 ran WIDE on the kids cadence (JURY: never ship a solo kids build) — three unrelated **non-touch input × raw-WebGL-shader output** directions, deliberately dodging the banned three.js/canvas2d outputs. **Winner shipped: `248-kids-stir-garden`** (camera-motion → Gray-Scott reaction-diffusion). The other two built clean in the authoritative all-three `npm run build` (exit 0) and are banked, sharper:

### `kids-sing-garden` — paint a glowing bedtime sky with your voice, hear your song back `[seed from cycle 274 WIDE non-winner, build-verified]`
Route would be `/dream/<n>-kids-sing-garden`. **Fully built + clean in the cycle-274 authoritative build (all three present, exit 0); banked, not committed (~679 lines).** A fullscreen **raw WebGL fragment shader** (hand-written GLSL: value-noise `fbm` through two stages of **domain warping**, bedtime violet→rose→gold palette, vertical glow-pool + vignette, animated by `uTime`). Mic → **autocorrelation** pitch (80–900 Hz, RMS+clarity gated, analyser-only/never stored) + RMS: pitch → `uHue` (low violet → high gold) + `uY` (high notes bloom up), loudness → `uBloom` + `uFlow` (swirl speed) — the child paints the sky with their voice. Sung pitches sampled every ~120ms (cap 48); a big glowing **"Hear it!"** (96px) replays them **quantized to C-major pentatonic** as soft sine+octave-triangle tones, pulsing the shader (`uPulse`) in sync. Never-silent low-pass drone; mic-denied → vertical-drag "paint the sky" fallback (Y=pitch) with a `text-rose-300` notice; WebGL-absent → readable notice. Reference: Refik Anadol latent color fields; Vincent Morisset's *Bla Bla*; the loved `158-kids-hum-paint` ❤️ + `100-kids-paint-song` ❤️. Tags: **mic/voice-pitch input · raw-WebGL-fragment-shader output · autocorrelation + pentatonic loopback · contemplative/bedtime**. **Why promising**: fills the lab's empty **calm/pre-sleep** kids niche, descends directly from two loved voice/paint pieces, and is the safe high-quality runner-up that lost only on surprise (closest in concept to the existing loved pieces). **Resurrect**: cycle-274 page.tsx built green. Deepen: per-note "petals/seeds" that bloom where you sang (lean into the garden name); McLeod/MPM pitch tracker to kill octave-jumps; optional under-harmony (third/fifth) on playback; one-tap palette/season swap.

### `kids-tilt-pour` — tilt to pour a glowing lava-lamp of blobs that sing when they merge `[seed from cycle 274 WIDE non-winner, build-verified]`
Route would be `/dream/<n>-kids-tilt-pour`. **Fully built + clean in the cycle-274 authoritative build (all three present, exit 0); banked, not committed (~631 lines).** A fullscreen **raw-WebGL metaball** shader: ~8 candy-colored jelly blobs whose inverse-square fields are summed and pulled out with `smoothstep` (smin-style fusion), glowing rims + additive halo + Reinhard tonemap = lava-lamp aura. **Tilt** (`deviceorientation` gamma/beta) → smoothed **gravity unit vector** driving a tiny CPU physics step (gravity, damping, edge restitution ~0.55, soft blob–blob repulsion+impulse). When two blobs merge past threshold (per-pair ~260ms refractory) the blob rings its **C-pentatonic** note (each color owns a pitch); gentle sine+triangle → feedback-delay shimmer → DynamicsCompressor limiter, velocity capped ≤0.5 so it's never harsh. Never-silent triad pad swells with sloshing. iOS `DeviceOrientationEvent.requestPermission()` from the 88px "Pour!" gesture (also unlocks audio); no-tilt/desktop → drag steers gravity toward the pointer with a `text-rose-300` notice; no-WebGL → readable notice. Reference: Inigo Quilez smooth-min/SDF; lava-lamp aesthetics; loved `83-kids-tilt-rain` ❤️ + `169-kids-marble-run` ❤️ + `84-wave-fluid` ❤️. Tags: **tilt input · raw-WebGL-metaball-shader output · physics + SDF fusion · candy/playful**. **Why promising**: pure-tactile no-reading toy with strong loved-tilt lineage; lost only on surprise (metaball is a known form and tilt shipped recently in `238-kids-tilt-world`). **Resurrect**: cycle-274 page.tsx built green. Deepen: per-orientation gravity remap via `screen.orientation.angle`; true IQ `smin` over signed distances; volume-preserving merge; `devicemotion` shake → blob split + sparkle; chord-on-full-overlap with hue-blend.

---

## Banked from Cycle 275 adult DEEP fire — the live-reactive-accompanist "AI band" (build-verified, not committed)

Cycle 275 ran DEEP on JURY.md's named request ("fuse duet-shadow + 225-aria-companion into real reactive accompaniment") — ONE concept, *a live AI accompanist that plays WITH you in real time*, attacked via three "band-member" approaches. **Winner shipped: `251-live-duet-trader`** (gap→Markov-fill→duck-on-re-entry). The other two are the **next two band members** — a clear multi-cycle arc: **Trader (shipped) → Harmonist → Groover = a reactive trio you play with**. Both built clean per their builders' lint+tsc self-verification (folder-isolated; the authoritative build shipped winner-only). All three share the research cite (arXiv 2604.07612, Apr 2026), so all clear the ambition floor on re-build.

### `live-duet-harmonist` — ✅ SHIPPED cycle 277 as `256-live-duet-harmonist` (jazz-voicing variant won a DEEP 2-builder re-fire)
**Status: built + shipped.** Cycle 277 ran a DEEP 2-builder fire on this banked member: builder A = the canonical fixed-clock comping bed below; builder B = a **jazz-voicing + walking-bass + onset-synced** variant that folds this seed's own "next-cycle deepening" into the shipped piece. **Builder B won and shipped as `/dream/256-live-duet-harmonist`** (clears 4 ambition criteria vs A's 3; first spectral-flux onset/tempo + two-clocks scheduler fused with harmony in the lab). Builder A is banked just below as a build-verified fallback. Original seed kept for the record:

Route would be `/dream/<n>-live-duet-harmonist`. **~714 lines, builder-verified lint+tsc clean (cycle 275).** The **bassist/pianist** member, and the one that handles **chordal piano** (where 251 can't — it's monophonic). Mic → AnalyserNode (fftSize 4096) → fold byte-FFT (60–2000 Hz) into a **12-bin chroma** vector (one-pole smoothed) → **cosine-match against 36 templates** (12 maj / 12 min / 12 dom7) → best above a confidence floor → a **~160 ms look-ahead "settle" window** (a new chord must hold before the bed switches, so it's anticipatory not flickery) → synthesized accompaniment: a **triangle bass** on the root + a **3-note sine comp** with **voice-leading** (each oscillator glides to the nearest octave placement of its new pitch class, no hard-cuts) + a gentle ~72 BPM eighth-note arpeggiation; the whole bed **breathes** with input energy over an always-on floor. Canvas-2D: 12-wedge chroma ring, large center chord name, glowing bass/comp staff nodes, scrolling chord-history trail. No-mic → auto ii–V–I–vi loop in C. Reference: arXiv 2604.07612 (look-ahead/settle) + Rowe interactive systems + Pachet Continuator. Tags: **mic input · canvas2d output · chroma→chord + generative comping bed · jazz/responsive**. **Why promising & complements 251**: it's the polyphony-handling half of the duet (Karel plays chords) and the most "useful for a pianist" of the three — a living harmonic bed under your hands. Lost the cycle-275 pick only because its chroma→chord detection overlaps `229-chord-canvas` (less *novel*), but as the **next** member it's the priority build. Deepen (from its README): infer a tonal center over a longer window for diatonic ii–V–I *anticipation* (genuine look-ahead, not just settle); a tiny Markov-over-chords model to pre-voice the likely next chord a beat early; rootless/drop-2 jazz voicings + walking bass; onset-synced comping instead of a fixed clock; expose settle-window/confidence as live controls. **Resurrect**: cycle-275 page.tsx built green.

### `live-duet-harmonist-simple` — fixed-clock voice-led comping bed (the cycle-277 runner-up) `[build-verified, not committed — fallback]`
The cycle-277 DEEP fire's **builder A**: the canonical, simpler harmonist — mic → 12-bin chroma → 36-template (maj/min/dom7) cosine match → 160 ms settle → **triangle bass on the root + 3 sine comp voices** with greedy nearest-octave voice-leading glides + a steady **72 BPM eighth-note arpeggiation**, breathing with input energy over an always-on floor, feedback delay + DynamicsCompressor limiter. Canvas-2D: 12-wedge chroma ring, large root-hued center chord name, left-column bass/comp staff nodes, scrolling chord-history trail. No-mic → ii–V–I–vi in C. **Build-verified clean (cycle 277, `npm run build` exit 0, `/dream/250-live-duet-harmonist` ○ Static 4.23 kB), then removed per orchestration safety.** **Why banked, not dead**: it lost only on ambition (3 vs 4 criteria) — it is the more **demo-reliable** version (no onset/tempo tracking to misfire on legato piano). **Resurrect if** `256`'s spectral-flux tempo-sync proves flaky in a real browser session (the groover caveat applies): ship 250 as the safe comping bed and keep 256 as the "jazz mode." References: arXiv 2604.07612 (settle) + ReaLchords (2506.14723) + Pachet Continuator + Rowe. Tags: **mic · canvas2d · chroma→chord + voice-led comp · jazz/responsive**.

### `live-duet-groover` — a drummer/arpeggiator that infers your tempo and follows it `[seed from cycle 275 DEEP non-winner, build-verified]`
Route would be `/dream/<n>-live-duet-groover`. **~728 lines, builder-verified lint+tsc clean (cycle 275).** The **rhythm-section** member and the most technically novel of the three — **first real beat-tracker + look-ahead scheduler in the lab**. Mic → AnalyserNode (fftSize 1024) → **spectral flux** (sum of positive bin-to-bin energy increases) with an **adaptive threshold** (`flux > mean + 1.6·std`, EMA mean/var, 100 ms refractory) → onsets → ~6 s **inter-onset-interval histogram**, each IOI's BPM **folded into 60–180** by ×2/÷2 (the standard octave-ambiguity fix), neighbor-smeared + parabolic peak → smoothed BPM + a peakiness **confidence** → a **Chris-Wilson "two clocks" look-ahead scheduler** (~25 ms coarse `setInterval` schedules grid steps inside a 100 ms window at precise `AudioContext` times): synthesized kick (sine pitch-drop) on beats, snare (band-passed noise) on 2&4, hats (HP noise) on 8ths/16ths, + an A-minor-pentatonic arpeggio, all density/level-scaled by confidence. Locks to a *moving* target two ways: beat period re-derived from live BPM each tick + a small proportional **phase nudge** toward your latest onset. Canvas-2D beat-radar ring, rotating phase hand, pulsing core, emerald onset-flash, violet arp dots, large BPM readout, locked/listening indicator. No-mic → an internal click source that **drifts 84↔124 BPM** so you can watch it chase tempo. Reference: arXiv 2604.07612 + Rowe *Interactive Music Systems* + Chris Wilson "A Tale of Two Clocks." Tags: **mic input · canvas2d output · onset/tempo-tracking + look-ahead scheduling · jazz/EDM-club**. **Why promising**: completes the trio (harmony + melody + rhythm) and brings genuinely new DSP (beat tracking, two-clocks scheduling) the lab has never had. **Caveat flagged by its builder**: spectral-flux loves *transients* — legato/sustained piano (Karel's instrument) gives weak onsets and a fuzzier tempo estimate, and abrupt tempo jumps take a couple beats to catch (proportional nudge, not a DP/Kalman beat tracker). Couldn't be ear-verified in the build env — **needs a real browser session to tune the flux floor + correction gain** before it's stage-ready. Deepen: Ellis-style DP beat tracker over the onset envelope; half/double-time toggle; key-detect the arp scale; swing/micro-timing inference. **Resurrect**: cycle-275 page.tsx built green.

### `kids-blow-bloom` — BLOW on the iPad to scatter a glowing dandelion that rings `[seed from cycle 276 WIDE non-winner, build-verified]`
Route would be `/dream/<n>-kids-blow-bloom`. **~850-line page.tsx, build-verified clean in the cycle-276 authoritative all-three build (exit 0, 5.05 kB, tsc+eslint clean per builder).** The lab's **first breath/blow-detection input** — every prior mic piece does *pitch* detection; this does the opposite. A luminous **Vogel-spiral dandelion** (~52 seed-petals) sits in a dark meadow; the child **blows** (like blowing out birthday candles) and petals peel off the head, lift on an upward+turbulent breeze, and drift away fading — each departing seed rings a soft **C-major-pentatonic** note (pitch ∝ launch height) through a feedback-delay + DynamicsCompressor limiter; the head visibly thins from the outside in and slowly **regrows** when calm so there's always something to blow. Blow-vs-voice is decided by **three multiplicatively-combined features**: RMS energy (gated above a quiet-room floor) × **spectral flatness** (geometric/arithmetic-mean ratio over 200–4000 Hz — high for noise-like breath, low for tonal voice) × **inverted autocorrelation clarity** (suppresses sung/hummed notes). An asymmetric EMA (fast rise / slow decay) gives a natural ramp-and-hold `blowStrength`; a live puff meter shows detection working. Always-on ambient C/E/G pad swells with blow energy. Mic-denied → tap/drag-to-puff fallback with a `text-rose-300` notice; full rAF/track/AudioContext cleanup. Reference: Nintendo DS blow mechanics (Electroplankton, Nintendogs), Toca Boca's natural-gesture toy ethic, electronic wind controllers (EWI/Aerophone — breath energy *is* the gesture), spectral flatness/Wiener-entropy as a standard MIR noise-vs-tone feature. Tags: **breath/blow-mic input · canvas2d output · spectral-flatness breath-detection + particle physics · meadow/whimsy**. **Why promising**: the single most *surprising* of the cycle-276 trio — a genuinely new input modality in 250+ prototypes, and "blow out the dandelion" is an interaction a 4-year-old already understands with zero instruction. **Honest weakness** (builder-flagged): unvoiced fricatives ("sss/shh") and loud broadband room noise (HVAC, clapping) can partially fool the detector — the autocorrelation gate helps but doesn't fully defeat them. **Resurrect**: cycle-276 page.tsx built green. Deepen: frequency-weighted flatness (weight 200–800 Hz for breath's pink/brown tilt), a 40-bin mel + tiny learned blow/voice/silence classifier, multiple blooms, stereo energy-difference for blow *direction*, chord clusters when ≥3 seeds airborne.

### `kids-sing-garden` (cycle-276 build) — sing a glowing bedtime sky, hear your melody back `[seed from cycle 276 WIDE non-winner, build-verified]`
Route would be `/dream/<n>-kids-sing-garden`. **~849-line page.tsx, build-verified clean in the cycle-276 authoritative all-three build (exit 0, 5.98 kB, tsc+eslint clean per builder).** (A second, independently-built realization of the long-standing `kids-sing-garden` seed — fills the lab's empty **calm/pre-sleep** kids niche.) A fullscreen **raw-WebGL fragment shader**: value-noise **fbm** through **two-stage domain warping**, violet→rose→gold bedtime ramp, a Gaussian vertical glow-pool + vignette + Reinhard tonemap, 4-octave/DPR≤2 capped for tablets. Mic → **autocorrelation** pitch (80–900 Hz, RMS+clarity-gated, analyser-only/never stored) → `uHue` (low violet → high gold, shortest-path eased) + `uY` (high notes bloom up); RMS loudness → `uBloom` brightness + `uFlow` swirl speed — the child paints the sky with their voice. Sung pitches sampled ~every 120ms (cap 48); a big glowing **"Hear it!"** button replays them **quantized to C-major pentatonic** as sine+octave-triangle tones (feedback delay, DynamicsCompressor limiter), pulsing the shader (`uPulse`) in sync. Never-silent detuned C/G drone. Mic-denied → vertical drag-to-paint fallback (Y=pitch/hue) with a `text-rose-300` notice; no-WebGL → notice + pad/loopback still work; full GL/rAF/track/AudioContext cleanup. Reference: Refik Anadol latent color fields; Vincent Morisset *Bla Bla*; loved `158-kids-hum-paint` ❤️ + `100-kids-paint-song` ❤️. Tags: **voice-pitch input · raw-WebGL fbm/domain-warp output · autocorrelation + pentatonic loopback · bedtime/calm**. **Why promising**: fills the empty pre-sleep niche, descends from two loved voice/paint pieces. **Lost the cycle-276 pick** because (a) the *winner* (253) had the direct research→build chain to today's lava-lamp dive, and (b) it overlaps `244-kids-sing-creature` (voice→autocorrelation→pentatonic-loopback, just shipped) — the most redundant of the trio. **Honest weakness** (builder-flagged): plain autocorrelation produces occasional **octave jumps** (half/double-period) that flash the sky's color and insert wrong-octave notes. **Resurrect** only after `244` has had time to breathe (avoid two near-identical voice-pitch kids pieces back-to-back), and swap in **YIN/MPM** pitch tracking first to kill the octave errors. Deepen: per-note petals/seeds that bloom where you sang, optional under-harmony on playback, FPS-adaptive quality.

---

### 257-kids-face-band — single-creature face music toy `[banked, build-verified — cycle 278 DEEP runner-up]`

**Question**: what if a 4-year-old played music with their face, mirrored by ONE charming creature (vs. 258's Rozin swarm-mosaic)?

**What it is**: webcam → MediaPipe FaceLandmarker → a hand-drawn glowing Canvas2D creature with big blinking eyes, blushing cheeks, and a mouth that opens to sing. Mapping: `jawOpen`→singing-voice volume + open mouth + radiating sound rings; `mouthSmile*`→hue violet→gold + cheek blush + sparkle bloom + brighter timbre; `browInnerUp/Outer`→note steps up a C-major-pentatonic scale; head-turn (nose landmark x)→stereo pan + the creature leans & pupils glance; blink→twinkle chime + the creature blinks. Always-on pad, master limiter, EMA smoothing. Degrades: camera/CDN fail → self-playing auto-demo + `text-rose-300` notice; tap the canvas → the creature sings (touch fallback).

**Why it was the runner-up (and worth resurrecting)**: it's the *more legible* take for the actual 4-year-old — "open your mouth → the creature sings louder" is the most direct, joyful cause/effect in the whole face-music space, and the single creature is a character a kid bonds with. It lost to 258 only on *surprise + named-reference strength* (Rozin), not on kid-delight or code quality. **Build-verified** in the cycle-278 DEEP fire (compiled clean alongside 258 before winner-only rebuild).

**To resurrect**: re-create `src/app/dream/257-kids-face-band/page.tsx` from the cycle-278 builder output (the design is documented above and in STATE §278). One-cycle ship. Apply the full MediaPipe house import pattern up front (`// @ts-expect-error - runtime ESM import, no local types` + `eslint-disable-line @typescript-eslint/no-explicit-any` on a single-line import) so the build passes first try. Pairs with 258 as a two-take set: *mosaic-mirror* vs *single-creature*.

**Next-cycle deepenings** (from the builder's README): two-face duet (`numFaces:2`, two creatures harmonizing); use the facial transformation matrix for true 3D head-tilt → note-bend/wah; a 10-second face-looper (record + loop expressions to layer over yourself).

---

## BANKED (build-verified) — Cycle 279 WIDE non-winners

### 260-aurora-drone — live solar wind is the score `[queued · build-verified · ship next adult cycle]`

**Question**: what if the solar wind hitting Earth *right now* were the score — a generative drone + aurora that sounds different every session because the Sun wrote it?

**Status**: built + **build-verified** in the cycle-279 all-present `npm run build` (exit 0, `○ Static`, 705 lines, 4.81 kB); curator gotcha-scan clean (canvas2d-only, correct GitHub README link, no API route, no unguarded `any`). Folder `rm -rf`'d after curation (orchestration safety — never commit a non-winner). **Lost to `259` only on ambition floor (2/5 — `233-earth-pulse` already did external-API sonification, so not "novel") and no love anchor.** It is the **JURY-requested 2nd piece** in the real-world-data category (233 + 260 = a body of work, not a fluke).

**Spec** (as built — resurrect by re-creating `src/app/dream/<n>-aurora-drone/page.tsx`): fetch 3 NOAA SWPC JSON feeds on Start, re-poll ~60 s — plasma (`/products/solar-wind/plasma-1-day.json`: speed/density/temp), mag (`/mag-1-day.json`: Bx/By/Bz/Bt), Kp (`/products/noaa-planetary-k-index.json`). Array-of-arrays w/ header row 0; scan backwards for last non-null. **Mapping**: wind speed→drone root pitch + bell-arp tempo + aurora hue (green→violet); plasma density→# detuned partials (2–5); **Bz**→major↔minor harmonic color *and* aurora height (negative Bz drives storms → minor + taller curtains); Bt→master amp; **Kp 0–9**→discrete calm→storm state (voice count, lowpass cutoff, curtain count/shimmer). Web Audio: detuned saw/tri osc → lowpass → feedback delay → synthesized convolution reverb → master. Canvas-2D: sum-of-sines aurora ribbons + star field + monospace HUD of live values + state badge. **Degrades to a simulated solar-wind random-walk** (bounded realistic ranges) on any fetch/CORS failure with a `text-rose-300` notice — always sounds + looks alive. No server route (client-side fetch; sim covers CORS). References: `233-earth-pulse`, NOAA SWPC, Mickey Hart aurora sonification. **Next-cycle deepening**: GOES X-ray flare feed → transient flares; 1-minute estimated-Kp; historical scrubbing; binaural widening with Kp.

### 261-live-duet-groover — the drummer that completes the AI-band trio `[queued · build-verified · completes 251+256]`

**Question**: what if a drummer listened to your piano and locked a generative groove to the pulse of *your* playing — completing the lab's AI band (melody `251-live-duet-trader` ❤️ + harmony `256-live-duet-harmonist`)?

**Status**: built + **build-verified** in the cycle-279 all-present build (exit 0, `○ Static`, 1081 lines, 5.67 kB); curator scan clean (`as any` for `webkitAudioContext` is properly `eslint-disable-next-line`-guarded). Folder `rm -rf`'d after curation. **Lost to `259` deliberately because it was the most "similar" of the three** — the 3rd live-duet sibling (mic→canvas2d), and its spectral-flux-onset + two-clocks-scheduler technique **already shipped in `256`**, so it didn't clear novelty and pushing mic to 5× in the last-10 cut against the diversity audit. Ship it when the AI-band family has earned a deepening (it *completes the trio* — a real body of work).

**Spec** (as built): mic → `AnalyserNode` → **spectral flux** (Σ positive bin increases) → adaptive threshold (mean + 1.5·std, 100 ms refractory) → onsets → median-IOI **tempo** folded 60–180 BPM (EMA smoothed, 90 BPM default when sparse) → **Chris-Wilson two-clocks scheduler** (25 ms tick / 120 ms look-ahead, hits at exact `AudioContext` time) → **synthesized 4-voice kit** (kick w/ pitch-env+click, snare noise+body, hat, clave) through a compressor+room master. **Generative pattern engine** regenerates each bar from input RMS energy (ghost notes/16th-hats/clave gated by intensity; fills every 4 bars) so it plays busier when you play harder. Canvas-2D transport: playhead, beat pulses, onset flash, large BPM, lit step-grid, energy meter. No-mic demo drives the same pipeline with synthesized ii–V–I–vi piano chords. References: arXiv 2604.07612, Chris Wilson *A Tale of Two Clocks*, siblings 251/256. **Honest caveat**: spectral flux is weak on legato piano (Karel's instrument) — same tempo-sync risk flagged for 256; pair a real-browser "tune the live-duet family by ear" session. **Next-cycle deepening**: true DP beat tracking; hand-off / call-and-response between the three band members.

---

## Numbering reconciliation (Cycle 280)

The two banked specs above titled **"260-aurora-drone"** and **"261-live-duet-groover"** kept the cycle-279 builder pre-allocation numbers, but those folders were `rm -rf`'d and never committed. Cycle 280 committed a real folder at **260** (`260-kids-slime-garden`). **Treat aurora-drone and live-duet-groover as number-free** — resurrect each at the next available folder number, not at 260/261. Their specs above are unchanged and still build-verified.

---

## BANKED (build-verified) — Cycle 280 WIDE kids non-winners

Both built to demoable in the cycle-280 WIDE kids fire and **compiled clean** in the all-three-present `npm run build` (exit 0, `○ Static`) before winner-only rebuild; folders `rm -rf`'d after curation (orchestration safety). Number-free — resurrect at the next available folder number. Both lost to `260-kids-slime-garden` **only** on love-anchor + 4-yo control + ship-reliability, NOT on ambition (each cleared 3/5: first-in-lab technique + named ref + ≥3 subsystems) or code quality.

### kids-lenia-pond — a 4-year-old breeds glowing lifeforms that sing `[✅ SHIPPED cycle 282 → /dream/264-kids-lenia-pond]`

**Question**: what if a 4-year-old could play with soft glowing "living" blobs that drift, wobble and pulse like real organisms, where each one sings?

**Status**: **SHIPPED cycle 282** as `264-kids-lenia-pond` (DEEP fire, winner of three Lenia formulations). The cycle-281 queue's named target, resurrected and **de-risked**: the cycle-282 builder replaced the hand-rolled crescent with **Bert Chan's canonical 20×20 orbium matrix** + Chan's exact `exp(4 − 1/(r(1−r)))` kernel, and **empirically verified stability with a 400-step Node sim** (mass steady ~75–76, centroid translating ~0.24 cells/step, toroidal-wrapping) — resolving the one unverified risk that lost it in cycle 280. The other two formulations explored this fire are banked below.

**Spec** (as built — resurrect by re-creating `src/app/dream/<n>-kids-lenia-pond/page.tsx`): **Lenia — continuous-state cellular automata (Bert Chan, 2019)**, the orbium glider. CPU sim of a scalar field `A(x,y)∈[0,1]` on a **150×150 toroidal grid** (Float32 double-buffer): convolve with a precomputed smooth radial **ring kernel** (R=13) → growth mapping `G(U)` (bell at mu=0.15, sigma=0.017) → `A ← clamp(A + dt·G, 0,1)`, dt=0.1. **Seeded with Bert Chan's published 20×20 orbium pattern stamped verbatim** (quarter-turn rotations on tap so creatures head off in varied directions) — the builder's key fix vs. a hand-rolled crescent that risked dissolving/exploding. Field packed to `Uint8` and uploaded as a WebGL2 **R8** texture (deliberate: R8 supports `LINEAR` filtering on every device; R32F-linear needs `OES_texture_float_linear` many tablets lack → would render black), rendered through a violet/cyan/rose nebula fragment shader with bloom over near-black. **Audio**: field split into 5 vertical bands → 5 pentatonic voices (C3 E3 G3 A3 C4), band **mass**→gain, band **centroid**→±cents detune so the chord breathes; always-on C3+G3 pad; per-tap one-octave-up ping for <50 ms feedback; warm lowpass → compressor/limiter. Degrades: WebGL2 fail → rose notice + pad; orbia glide silently before Start. **MUST DO at resurrection: a real-browser pass to confirm the orbium stays alive and glides** under those params (the one unverified risk) — tune dt/mu/sigma/R if it dies or explodes. **Next-cycle deepenings**: detect connected blobs for per-creature voices (vs. fixed bands); mass→pitch per creature; let two creatures merge into a chord; predator/prey species for evolving texture.

### kids-light-cloth — strum a hanging curtain of light `[queued · build-verified · most tactile/robust]`

**Question**: what if a 4-year-old could touch a hanging curtain of light, stretch and strum it, and feel it twang back?

**Status**: built + build-verified in the cycle-280 all-present build (`○ Static`, 4.55 kB; **zero warnings**). **The most robust + most tactile** of the three (CPU physics + GL lines, no texture-filter or CA-stability gotchas). Lost only on surprise/love-anchor (physics-toy vs. the emergence vein Karel loved in 236) — a strong demo-reliable fallback and the natural choice if a future kids cycle wants a guaranteed-solid embodied piece.

**Spec** (as built — resurrect by re-creating `src/app/dream/<n>-kids-light-cloth/page.tsx`): **Verlet-integration mass-spring cloth (Thomas Jakobsen, "Advanced Character Physics," GDC 2001).** A **26×18** particle grid, top row pinned (hangs like a curtain); each frame: Verlet integrate (`x += (x−x_prev) + a·dt²`, velocity implicit), gravity + a soft touch-impulse force field around the finger, then **4 distance-constraint relaxation iterations** on right+down springs. Rendered through **WebGL2 as additive `gl.LINES`** (`SRC_ALPHA, ONE`), each segment's brightness+hue tracking local **stretch + midpoint velocity** so taut/moving threads flare cyan/violet→hot-rose (aurora-harp on black) — **never a 2D canvas**; all particle state in typed-array refs, React state only for start/error UI. **Audio**: finger crossing a mesh **column** (or a column's kinetic-energy spike on release) → a **Karplus-Strong-style pluck** (noise burst → tuned delay-feedback), **column index = pitch** (left=low → right=high across ~2 octaves of C-major pentatonic); overall cloth kinetic energy → ambient-pad swell; always-on C3/E3/G3 detuned-triangle drone; master compressor/limiter; pluck gains capped (no scary transients). Degrades: WebGL2 fail → rose notice + "Play the hum" pad button; cloth sways silently before Start; full GL/audio teardown on unmount. **Next-cycle deepenings**: two-finger stretch chords; pin the bottom corners for a trampoline mode; cloth color/tension as a slow generative drift so it's alive before touch.

### kids-glow-lifeforms — breed glowing Particle-Lenia creatures that crawl, merge & sing `[queued · build-verified cycle 282 · the fresher-render swing]`

**Question**: what if a 4-year-old could breed glowing alien lifeforms — energy-based Particle-Lenia particles — that crawl toward the finger, merge, and sing?

**Status**: built + build-verified in the cycle-282 **all-three-present** `npm run build` (exit 0, `○ Static`, **4.46 kB**, zero warnings); folder `rm -rf`'d after curation (orchestration safety). Number-free — resurrect at the next free folder number. Lost to `264-kids-lenia-pond` on two axes only: (a) 264 had an *empirical* 400-step stability proof while this is failure-proof "by construction" but its *aesthetic* (do ~200 particles settle into pretty cells vs a diffuse cloud?) wasn't numerically checked, and (b) 264's discrete orbium "creature that swims away on its own agency" is more legible for a 4-yo than a particle swarm. **Its edge over 264: a fresher render modality** (additive glowing `gl.POINTS` vs another fullscreen field-texture — would add visual variety to the emergent-kids set) and **zero params to tune** (the most truly unbreakable for unsupervised play).

**Spec** (as built — resurrect by re-creating `src/app/dream/<n>-kids-glow-lifeforms/page.tsx`): **Particle-Lenia (Mordvintsev et al., Google Research "Self-Organising Systems", 2023; energy-based reformulation of Chan's Lenia).** ~200 particles (cap 400, recycle oldest) in world space `[-12,12]`. Each frame each particle steps **down the gradient of energy `E = R − G`**: Lenia field `U(x)=Σ K(|x−p_i|)`, kernel `K(r)=w_K·exp(−((r−mu_K)²/sigma_K²))` (mu_K=4.0, sigma_K=1.0, w_K≈0.022), growth `G=exp(−((U−mu_G)²/sigma_G²))` (mu_G=0.6, sigma_G=0.15), repulsion `R=(c_rep/2)·Σ max(1−|x−p_i|,0)²` (c_rep=1.0), `p ← p − dt·∇E` (dt=0.1), ∇E by central finite difference. Energy descent + soft repulsion = **provably bounded** (can't explode or vanish). **Tap** = spawn 12-particle seed + one-frame attractor impulse pulling the nearby swarm to the finger. Render: additive `gl.POINTS` with soft radial falloff (`SRC_ALPHA→ONE`), teal→violet→rose→gold by x-band, over near-black. **Audio**: 5 x-bands → 5 pentatonic voices (C3 E3 G3 A3 C4), band count→gain, centroid→±18¢; always-on C3+G3 pad; per-tap octave-up ping <50 ms; warm lowpass → compressor/limiter. Degrades: WebGL2 fail → rose notice + pad-only. **Honest caveat**: field sums are O(N²) per gradient eval (fine ≤400 on CPU, won't scale to thousands without a spatial grid/GPU). **Next-cycle deepenings**: union-find per-creature blob detection → per-organism pitch/hue (vs fixed x-bands); detect blob *merges* → resolve the two pitches into a consonant interval (merging you can hear); 2nd species with different mu_K/mu_G (predator/symbiont); size/density → filter brightness.

### kids-flow-pond — finger-paint mass-conserving Flow-Lenia goo that never spills `[queued · build-verified cycle 282 · most-recent research anchor]`

**Question**: what if a 4-year-old could finger-paint living glowing "goo" that flows like liquid light, never spills or disappears (mass-conserving Flow-Lenia), and sings?

**Status**: built + build-verified in the cycle-282 **all-three-present** `npm run build` (exit 0, `○ Static`, **4.91 kB**, zero warnings); folder `rm -rf`'d after curation. Number-free — resurrect at the next free folder number. **Strongest research anchor of the three** (Flow-Lenia is the *most recent* paper — Artificial Life MIT Press 2025) and the cleanest "spill-proof by mass conservation" story. Lost on (a) honest self-flagged caveats — exact conservation is a per-step renormalization *patch* over bilinear leakage, not a natively conservative operator, and the R=12 CPU convolution forces stepping every other frame (low-end phones may dip), and (b) "flowing goo" sits conceptually nearer the lab's existing fluid pieces (3/15/84) than the discrete-creature framing.

**Spec** (as built — resurrect by re-creating `src/app/dream/<n>-kids-flow-pond/page.tsx`): **Flow-Lenia (Plantec, Hamon, Etcheverry, Chan et al., Artificial Life 2025; arXiv 2506.08569 / 2212.07906).** Field `A≥0` on a **128×128 toroidal grid** (Float32 double-buffer). Per step: (1) `U = K⊛A` (ring kernel R=12, normalized sum=1, sparse offset/weight list, toroidal); (2) growth bell `G` (mu=0.15, sigma=0.017, range[-1,1]); (3) affinity `AFF = U·alpha + G·(1−alpha)` (alpha=0.35), **flow field `F = ∇AFF`** (central diff × FLOW_GAIN=0.85, clamped `|F|≤0.45` cells); (4) **mass-conserving advection** via semi-Lagrangian backward bilinear sample `A_new(x)=A_old(x−F·dt)` (dt=0.35) **then rescale by `ΣA_before/ΣA_after`** so total mass is constant to float precision (no white-out, no decay). Steps every other frame. Packed to `Uint8` → WebGL2 **R8** texture (LINEAR-filterable everywhere; R32F-linear renders black on tablets lacking `OES_texture_float_linear`). Render: fullscreen-triangle fragment shader, cyan→violet→rose ramp + 3×3 bloom + white-hot core + shimmer/vignette over near-black ("liquid light / lava-lamp life"). **Tap/drag** = inject a gaussian mass blob + instant in-band ping; dragging leaves a flowing trail. **Audio**: same 5-band pentatonic scheme as the siblings + always-on pad + limiter. Degrades: WebGL2 fail → rose notice + pad-only. **Next-cycle deepenings**: **multi-species** via per-region mu/sigma/kernel; **embedded parameter localization** (the paper's open-ended-evolution move — carry rule params as extra conserved channels that flow *with* the mass, so species mix where they meet); GPU ping-pong + separable kernel for 256² at 60 fps on phones.

---

### `aurora-drone-field` — solar wind as raw-WebGL2 GLSL sum-of-sines curtains `[seed from cycle 281 DEEP non-winner, build-verified]`
Route would be `/dream/<n>-aurora-drone-field`. **Fully built + self-verified clean (tsc + ESLint, cycle 281) as a DEEP sibling to the shipped `262-aurora-particle`; banked here, not committed (folder `rm -rf`'d — number-free, take the next free folder on resurrection).** Same shared spine as 262 — three live NOAA SWPC feeds (plasma/mag/Kp) via `Promise.allSettled` + defensive backward-scan, 60s re-poll, EMA-smoothed, bounded random-walk sim fallback; identical Web Audio drone (2–5 density-gated detuned saw/tri partials → Kp lowpass → feedback delay → code-synth convolution reverb → limiter + speed-tempo Bz-major/minor pentatonic bell arp). **Render differs**: a single fullscreen quad through a custom **raw WebGL2 fragment shader** — up to 6 layered "sum-of-sines" horizontal light-curtains whose vertical centres undulate, horizontal wobble = sum of 3 sines (freq scaled by speed+density), **FBM filament streaking** along x for the vertical-ray look, additive glow fading toward the top of the sky, faint twinkling star field + vignette + Reinhard tonemap. Curtain **count** from Kp (2→6), **height/agitation** from negative Bz (storm coupling), **hue** green→violet from speed + a Kp/storm push toward red/violet. Tags: **external-API input · raw-WebGL2 GLSL output · sum-of-sines aurora · cosmic/aurora**. Reference: classic Shadertoy "Auroras" (nimitz) sum-of-sines+FBM curtain technique; NOAA SWPC; sibling `233-earth-pulse`. **Why banked, not dead**: it's the most *faithful, GPU-cheap* aurora and the cleanest single-file (no three.js) — the right pick if a future cycle wants the aurora as a lightweight background layer or an installation wall that must run on weak GPUs. **Lost to 262 only on** dimensionality (flat fullscreen quad, no parallax) and love-anchor (262 *is* the loved `130-tsl-particle-compute` glowing-points language). **Resurrect**: cycle-281 page.tsx (~800 lines) built green. Deepen: add a second far-curtain parallax layer; reflect the curtains on a faint horizon; beat the arp to onset flashes in the shader.

### `aurora-raymarch` — solar wind as a volumetric raymarched aurora with real emission-line physics `[seed from cycle 281 DEEP non-winner, build-verified — the bigger swing]`
Route would be `/dream/<n>-aurora-raymarch`. **Fully built + self-verified (full `npm run build` exit 0, cycle 281) as a DEEP sibling to `262-aurora-particle`; banked, not committed (number-free).** Same NOAA spine + audio engine as above. **Render = lightweight volumetric raymarch** in a fullscreen WebGL2 fragment shader: camera looks UP, marches a fixed **44 steps** along each view ray through a curved altitude shell, density = scrolling FBM gated to the band so curtains hang like sheets and **recede into the distance** (true depth via growing step size + `exp(-t)` depth fade), front-to-back emissive accumulation with transmittance. **The standout**: it encodes the **real aurora altitude→colour physics** — atomic-oxygen green (low) → oxygen red (high) → nitrogen violet (top fringe), with storms (high Kp / negative Bz) pushing taller curtains that redden and violet at the top. So the colour *teaches the geophysics by eye*, the same quality JURY praised in `233-earth-pulse` ("the mapping encodes the physics"). Tags: **external-API input · raymarched-volumetric WebGL2 output · volumetric-aurora + emission-line physics · cosmic/educational**. Reference: Shadertoy volumetric-aurora raymarch lineage; the O-558/O-630/N₂ emission-line altitude ordering; NOAA SWPC; sibling `233`. **Why banked, not dead — and why it's the bigger swing**: it's the most *ambitious and most educational* of the three (true 3D volume + real physics), and a genuine 2nd take on the aurora that complements 262's particle reading. **Lost to 262 only on** an **unverifiable visual-quality risk** — raymarched aurora can read as murky fog if untuned, and the build env can't browser-check it; 262's additive points are visually robust without tuning. **MUST DO at resurrection: a real-browser pass** to confirm the curtains read as crisp sheets (tune `STEPS`, the band smoothstep, `dens`, and the shimmer term; consider raising step size near the band and lowering far). Deepen: stereo/parallax two-eye march; beat-locked brightness pulses; a "look around" drag camera; fold these emission-line colours back into `262`'s particle hue (the next-cycle deepening already noted in 262's README).

## Banked from Cycle 283 adult DEEP fire (the "fly through your music" vein, take 4; build-verified, not committed)

Cycle 283 ran **DEEP** on the JURY's flagged richest vein — *"fly THROUGH your own music as a living 3D world"* — extending the loved `243-spectral-cloud` ❤️. Three render readings built in parallel, **all three `npm run build`-verified `○ Static` together** (so these banks are honest). **Winner shipped: `267-spectral-drift`** (advecting glowing-particle river, the research-anchored reading from this cycle's NSTR dive §283). The other two — both JURY-named, both build-verified this fire (and previously in 271/273) — are banked again, sharper. Per the number-hygiene rule, banked specs are **number-free** and take the next free folder on resurrection.

### `spectral-tunnel` — fly down a glowing wormhole carved by your music `[build-verified THREE TIMES: 271 + 273 + 283 — strongest queued]`
The most **kinetic** reading. **64 rings × 128 points** (geometry allocated once; the rAF loop only rewrites position/color typed arrays + `needsUpdate`). Rings translate in +Z toward the camera and recycle to the far end, **freezing the live FFT frame only at the instant they spawn** — so the wall streams past as a ~9 s record of the recent song, not a wall pulsing in place (the motion detail that sells forward flight). Bin→angle (bilaterally mirrored), magnitude²→radial bulge, spectral-centroid→heat hue (violet→cyan→amber) + spin rate, spectral-flux onset (mean+1.5·std, 100 ms refractory)→speed boost ×2.4 + FOV punch + a brightness flash stamped into the spawning ring that rides toward you, median-IOI→BPM. Additive `THREE.Points` (soft round sprite) + additive `LineSegments` wireframe, `FogExp2`; drag-to-look over auto-fly. Tri-modal never-silent audio (file drop / `/api/audio/:id` JSON-or-bytes / synth pad+pentatonic demo). Tags: **audio-file input · three.js-3D output · radial spectral-tunnel · cosmic/kinetic (demoscene/Anadol)**. Reference: demoscene tube-tunnel lineage (Jeff Minter) + Refik Anadol data-tunnels. **Why it's the strongest queued**: the most immediately-*wow* of the trio and the **lightest** (8,192 verts) — the demo-reliable kinetic reading. **Lost to 267 in 283 only on** the research→build chain (267 implements *today's* §283 NSTR dive) + love-anchor (267 *is* the loved glowing-points language). **Resurrect**: cycle-283 page.tsx (733 lines) built green `○ Static` 4.91 kB. Deepen: UnrealBloomPass; per-bin decaying max so transients *streak* the wall; stereo L/R split feeding the two halves of the mirror; branching wormholes on strong onsets.

### `spectral-canyon` — fly over your music as a spectrogram-waterfall terrain `[build-verified THREE TIMES: 271/269 + 273 + 283; Z-fix implemented]`
The most **legible** reading — you read the song's structure in the hills. A `THREE.PlaneGeometry` **128 freq-cols (X) × 96 time-rows (Z)** height-field, allocated once; per frame rewrites only `position.Y`/`position.Z`/`color`. Freq→X power-warped (`pow(col/COLS,0.6)`) so bass spreads wide and readable; magnitude²→elevation Y; **time→Z via the Z-remap waterfall fix** — storage cycles a head slot but each row's world-Z is recomputed every frame from `age=(head−r+ROWS)%ROWS` so the newest row pins to the far edge and the whole history marches forward as one coherent waterfall (the fix for the prior scrambled-time bug). Violet→cyan→amber/rose vertex heat ramp, `FogExp2`, grazing lights so ridges catch light; spectral-flux onset→camera lurch + ridge flash + folded 60–180 BPM; centroid→color warmth + fog density. Tri-modal never-silent audio (same spine). Tags: **audio-file input · three.js-3D output · spectrogram-terrain · immersive/Anadol-data-landscape**. Reference: TouchDesigner spectrogram-waterfall-as-flying-terrain + Refik Anadol data-landscapes. **Resurrect**: cycle-283 page.tsx (609 lines) built green `○ Static` 4.58 kB. Deepen: stereo L/R dual terrains; beat-synced camera lurches; a **"freeze + walk the canyon" first-person mode** to inhabit one moment of the song.

---

## BANKED from Cycle 284 WIDE kids fire (build-verified — both compiled `○ Static` alongside the winner before curation)

Both were built to demoable, ran clean in the all-three-present `npm run build` (✓ Compiled successfully, all `○ Static`), then `rm -rf`'d (non-winners are never committed). Resurrect either on a future kids cycle. Both are **SVG output + non-pentatonic sound** — the lab's never-used non-luminous lane the JURY asked for; keep them that way.

### `kids-paper-parade` — torn-paper marching band, a rhythm-LAYER groove builder `[queued]`

**Question**: what if a 4-yo built a band by stacking rhythmic groove layers instead of picking pretty notes?

**Spec**: A side-scrolling **Eric Carle torn-tissue collage** parade, **entirely inline SVG** (`<path>` paper animals + `feTurbulence` paper-grain + `feDropShadow` cut-paper lift; marching + per-beat bob via rAF SVG transforms — no canvas/WebGL). Five big picture-buttons add/remove animal musicians who march in and **add a groove layer**, all phase-locked to a 16-step ~104 BPM lookahead scheduler: elephant big-drum (beats 1&3), bear tuba **oom-pah alternating root C2 / fifth G2** (a real major-key I–V feel, *not* a pentatonic note set), fox snare backbeat, bird cymbal off-beats, rabbit glockenspiel FM-bell ostinato. Always-on heartbeat pulse so never silent; master compressor; tap a marching animal to send it home. The musical dimension is **rhythm + texture / ensemble arrangement**, not melody. Ref: Eric Carle collage + Toca Band's add-a-character model. **Promising**: the cleanest "build a groove, not a tune" kids piece; the Carle paper aesthetic is warm + parent-tolerable; dodges glow + pentatonic. **To resurrect**: assign a fresh number; consider a 2-finger "two kids" mode and a tempo slider on a long-press.

### `kids-paper-score` — a Cardew-style graphic score a playhead performs `[queued]`

**Question**: what if a 4-yo's drawing WAS the music — place shapes on a page and a playhead reads them left→right forever?

**Spec**: A warm cream **paper page** (inline SVG, `feTurbulence` grain + soft shadows — no canvas/WebGL). Pick one of five bold shape-stamps (circle/triangle/square/squiggle/star), tap the page to drop it (plays instantly), and a paper **ribbon playhead** sweeps a 16-beat-wide loop; each shape **bounces + sings** as the ribbon crosses it. **Graphic-notation mapping** (not a keyboard): shape KIND → timbre (marimba / bell / woodblock / noise-rattle / FM-sparkle), vertical position → a **full diatonic 3-octave C-major scale C D E F G A B** (includes the 4th + 7th — deliberately NOT pentatonic), horizontal → time on the beat grid. Always-on drone bed; master compressor; tap a shape to remove. Ref: Cornelius Cardew *Treatise* (1967) + graphic-score tradition (Fischinger, Ligeti). **Promising**: aligns with the lab's big paint/draw love cluster (`100`/`104`/`152`/`158`/`160`/`223`/`153` ❤️) while being a genuinely new *interaction* (the drawing performs itself); a strong "conceptual" piece for kids. **To resurrect**: assign a fresh number; obvious deepening = record a playhead pass as a shareable loop, and a "second voice" page you can layer.

---

## Banked from cycle 285 (DEEP fire — "AI image as a living participant in an AV piece") — both build-verified `○ Static`

These two are the non-winning readings of the cycle-285 DEEP concept (winner shipped = `271-pigment-mosaic`). Both compiled green in the all-three authoritative build, so the banking is honest. Each is a full prototype waiting on a fresh number. Both already implement the shared spine: tri-modal audio (mic / file / **Welcome Home track-id** via `/api/audio/:id` JSON-or-bytes / non-pentatonic synth fallback) → live mood analysis (RMS / centroid / low-mid-high / spectral flux) → `flux/schnell` chapter generation behind the `guard` (501-degrades to a procedural chapter so it demos with **zero API calls**) → an audio-reactive renderer.

### `latent-breath` — an AI chapter image that *breathes* under the live sound `[queued, build-verified]`

**Question**: what if a generated image were a living surface — continuously domain-warped, rippled and bloomed by the music — rather than a one-shot render?

**Spec**: WebGL2 full-screen-quad fragment shader samples the (crossfaded) chapter texture with UVs **domain-warped** by live audio: bass → ripple amplitude (sin/cos + value noise), centroid → warp frequency, highs → a blooming radial dilation, transients → chromatic-aberration split, plus a slow global "breath" so even silence drifts. A-aeolian synth fallback. **Promising**: the most directly legible "AI image shaped by audio," cinematic/latent palette, lowest runtime risk after 271; the cleanest base for **image-to-image continuity** (feed the previous chapter as init image → chapters morph not cut → the honest StreamDiffusion morph, RESEARCH §285 anchor 1). **To resurrect**: assign a fresh number; add curl-noise warp, stereo L/R split, beat-synced cuts. *(Note: it's luminous — schedule it for a cycle when the glow ban has lifted.)*

### `dream-chapters` — chapters that MELT via optical feedback (long-form memory piece) `[queued, build-verified — top candidate for the "extend 259 / long-form-memory" ask]`

**Question**: what if an AV piece were a continuously melting dream — each AI chapter dissolving into the next through an audio-driven optical-feedback loop, so the screen at minute 5 is a sediment of everything that played before?

**Spec**: WebGL2 **ping-pong feedback** (two FBOs): each frame re-photographs the previous frame through an audio-warped lens — energy → zoom + feedback decay (louder = longer memory) + gain; brightness → swirl + hue-drift; flux → rotation kick + chromatic split + hue jolt; high−low balance → advection direction. A new chapter is bled in via an easing `chapterMix` so it *melts* rather than cuts; `dt` clamped so a stall can't diverge. D-dorian synth fallback. Refs: Memo Akten *Learning to See*, Steina & Woody Vasulka video-feedback, StreamDiffusion (honest approximation). **Promising**: this is the lab's vehicle for the JURY's *"extend 259, the long-form/memory vein"* — fuse it with the proven mic-listening intelligence of `251`/`256` into a 10-minute piece that **listens, remembers, and rewrites its own imagery**. The accumulator already survives state changes (engine reads via refs) — the "minute-5 sediment" is real. **To resurrect**: assign a fresh number; add image-to-image chapter continuity (condition each chapter on a snapshot of the feedback buffer), a reaction-diffusion term in the feedback pass, beat-synced melt-ins, and a save-the-dream snapshot. *(Note: luminous feedback — schedule when the glow ban lifts, or pair with a non-luminous treatment.)*

---

### `273-kids-raga-peacock` — tap a peacock's feathers to play a raga over a living tanpura `[queued, build-verified — deferred for spacing from 268]`

**Question**: what if a 4-year-old could play a Hindustani raga over a living tanpura drone — where every note they touch is automatically "right"?

**Spec** (WIDE-sibling, cycle 286; build-verified `○ Static` 4.31 kB): a jewel-toned cut-paper **SVG** peacock whose **7 tail feathers = the 7 swaras of Raga Yaman** (Sa Re Ga Ma# Pa Dha Ni), tuned in **just intonation** (1/1, 9/8, 5/4, 45/32, 3/2, 5/3, 15/8 over Sa=220 Hz). A **tanpura drone** plays continuously from first touch — a Pa–Sa–Sa–Sa pluck cycle at 1.2 s, approximated with ~11 additive partials + slight detuning on the upper harmonics to fake the buzzing **jvari** shimmer. Tap a feather → that swara sings over the drone (always in context, no wrong note). **Drag across the fan → a meend**: a smooth `linearRampToValueAtTime` pitch glide through the swaras, feathers lighting as you pass — the signature Hindustani ornament. Fully **non-luminous / matte** (flat jewel fills on warm dusk `#1a1008`, no glow). Refs: Siddiq et al. *A Real-Time Synthesis Oriented Tanpura Model* (Queen's Belfast) + Raga Yaman (Kalyan thaat). **Promising**: a brand-new kids SOUND (Hindustani classical, JI), directly answers the JURY "audit the sound" mandate, and the meend drag is a genuinely fresh gesture. **Why deferred, not shipped**: its non-Western-tuning + matte-cut-paper aesthetic sits too close to the previous kids cycle's `268-kids-shadow-theater` (slendro gamelan + SVG cut-paper); ship it ≥1 kids cycle later so the two don't read as a pair. **To resurrect**: assign a fresh number; add a 2nd selectable raga (Bhairavi — all komal, lullaby), draw the meend arc as a curved line, add an aroha intro that lights feathers in ascending sequence.

---

### `274-kids-clay-clock` — wake clay drums into an interlocking West-African groove `[queued, build-verified — the polyrhythm opener, ship next kids cycle]`

**Question**: what if a 4-year-old could build an interlocking 3-against-2 cross-rhythm — feeling West-African/Afro-Cuban polyrhythm in their body — just by waking up sleeping clay drums?

**Spec** (WIDE-sibling, cycle 286; build-verified `○ Static` 4.66 kB): a ring of 5 matte **terracotta clay pots** on warm earth (`#2A1A0E`, Canvas 2D, soft inner-shadow gradients — **no glow, no bloom**). A shared 12-sub-step master cycle; each pot hits a different subdivision — **Bass 2×** (steps 0,6), **Mid/open 3×** (0,4,8), **High/slap 4×** (0,3,6,9), **Bell = 12/8 gankogui** (0,2,4,5,7,9,11), **Shaker offbeats** (2,5,8,11). Because all subdivisions divide 12, **any subset still grooves** (no wrong combo). Tap a pot → it wakes and joins; tap again → sleeps. Bass(2) against Mid(3) = the **3:2 hemiola** at the heart of the tradition. Timing via the **Chris-Wilson two-clock look-ahead scheduler** (25 ms ticker, 120 ms window, exact `when` to Web Audio); visual squash-bounces queued off `performance.now()` to land exactly on the audio hit. **Percussion-only** (bass-drop sine, filtered-noise slaps, two-partial inharmonic bell, band-passed shaker) — categorically non-pentatonic. A soft downbeat heartbeat keeps it from ever sounding broken. Refs: **Steve Reich** *Clapping Music*/*Drumming* + the **gankogui** (Ewe/Yoruba) standard bell. **Promising**: the lab's **first true cross-rhythm/polyrhythm toy** (all prior kids drum toys are single-pulse), another brand-new kids SOUND for the JURY's sound-diversity push. **To resurrect (queued cycle 288)**: assign a fresh number (or keep 274), pre-bake noise buffers at startup, add a 6th dundun pitch-bend pot, draw connection-lines between pots hitting the same beat.

---

## Cycle 287 banked siblings — the long-form LISTENER DEEP fire (winner shipped = `275-memory-loom`)

Both are non-winning readings of the same cycle-287 DEEP concept: *"a piece that LISTENS to you play, REMEMBERS what you played, and REWRITES its own structure over 10 minutes"* (the JURY's #1 adult ask — extend `259-paths-generative`). All three compiled green in the all-three authoritative build, so the banking is honest. Each is a complete prototype waiting on a fresh number. Both share the spine: mic (primary) + file-drop + **Welcome Home track-id** via read-only `/api/audio/:id` (JSON-or-bytes) + non-pentatonic (D-dorian) synth fallback that's never silent → a growing, *decaying* memory of what you played → a 5-movement state machine that rewrites the texture over 10+ min → a Canvas2D viz of the memory. No API route, no guard, no new deps.

### `mosaic-listener` — your sound becomes a corpus the machine navigates `[SHIPPED cycle 293 as 285-mosaic-listener — corpus = Karel's real piano (or procedural fallback), matte WebGL2 descriptor atlas, drag/mic/auto-drift target; deepen path in its README]`

**Question**: what if a piece shattered your live sound into a growing corpus of tiny tagged grains, then re-synthesized endless new music "in your own voice" by concatenating grains that match a slowly-drifting target in descriptor space — never replaying what you literally played, but always made of you?

**Spec** (cycle 287 DEEP sibling; build-verified `○ Static` 5.73 kB): live mic → ~160 ms chunks sliced into overlapping grains, each tagged with **RMS (loudness) + spectral centroid (a 256-pt Hann DFT) + ZCR pitch**; corpus capped at ~360 grains, FIFO-evicted (decaying memory). A **Chris-Wilson look-ahead scheduler** fires 5–12 grains/sec: each trigger computes a **drifting Lissajous target** in 2D descriptor space (centroid × loudness), picks the **k≈5 nearest** corpus grains (random among them so it's organic, not robotic), plays it windowed with a `playbackRate` transposition + brightness-panned, through lowpass → procedural reverb → limiter. Five ~90 s movements ramp the target region/speed, grain density, grain length, transposition set, reverb, cutoff (glassy pointillism → dense wash → sparse shimmer). Canvas2D **descriptor-space scatter**: each grain a dot at (centroid, loudness) colored by pitch, fading with age; a bright cursor for the moving target; a flash on the selected grain. **Refs: Diemo Schwarz — CataRT (corpus-based concatenative synthesis); Lee & Pasquier — "Musical Agent Systems: MACAT and MACataRT," arXiv 2502.00023 (audio mosaicing + self-listening agent).** **Promising**: this is the **lab's first concatenative-synthesis / audio-mosaicing piece in 270+ prototypes** — a genuinely new synthesis paradigm (the JURY keeps asking the lab to escape its templates with new *techniques*, not just new palettes), and the descriptor-space scatter is a fresh, legible visual. It lost to `275` only because `275` is the more literal extension of the loved `259` (and keeps the raw audio = his actual piano). **To resurrect**: assign a fresh number; add onset-aligned grains (AudioWorklet), a real YIN pitch + MFCC descriptors, a KD-tree for k-NN at thousands of grains, and a **user-draggable target so you can "play the cloud" by hand**, CataRT-style. Strongest single bank in the queue — schedule it on the next clean-slate adult cycle.

### `motif-memory` — it transcribes your notes and improvises on them `[queued, build-verified]`

**Question**: what if a piece transcribed the NOTES you played into a remembered melody, then spent 10 minutes re-performing, varying, and recombining your motifs with its own synthesized voices — an improvising partner that remembers what you gave it?

**Spec** (cycle 287 DEEP sibling; build-verified `○ Static` 6.62 kB): a **hand-written autocorrelation (NSDF-style) monophonic pitch tracker** on 2048-sample frames + an RMS gate segments live mic into discrete `{midi, start, dur, vel}` note events → a capped (220-event, decaying) **symbolic memory** + an incrementally-built **first-order pitch-class Markov table**. A Chris-Wilson scheduler pulls 3–7-note phrases and applies one weighted **transformation** (verbatim / transpose to a consonant degree / retrograde / augment-diminish / fragment-echo / **Markov recombination walk**), snapped to **D-dorian**, sounded by a 2-op-FM lead + detuned-saw pad + sub bass → lowpass → procedural reverb → limiter. Five ~80 s movements shift transform weights from faithful-echo (minute 1) toward free recombination (minute 10). Canvas2D **scrolling piano-roll**: emerald = your transcribed notes, violet = the machine's re-performed/varied notes, amber = the live detected pitch, plus a transition-matrix heat strip. Also has an **on-screen note pad** so a no-mic visitor can feed it motifs. **Refs: George E. Lewis — *Voyager*; Robert Rowe — *Cypher* / *Machine Musicianship* (the listener→player split); David Cope — EMI (recombinant motifs).** **Promising**: the lab's first **symbolic transcription → re-performance** piece, and the most musically-literate (extends the loved `256-live-duet-harmonist` jazz-partner vein toward *composition with memory*). The piano-roll legibly shows "it remembers what you played and reworks it." **Why it didn't win**: monophonic JS pitch detection is inherently fragile (octave errors, latency — honestly flagged in its README), a live-demo risk at 06:30; and it sits closer to the existing `251`/`256` mic-listening jazz-partner vein than `275` does. **To resurrect**: assign a fresh number; upgrade to a YIN detector with parabolic interpolation, make the Markov second-order with a separate rhythm table, add rest-based phrase segmentation and a modal bass that implies a slow chord progression.

---

## BANKED from Cycle 288 WIDE kids fire (build-verified — both compiled `○ Static` alongside the winner before curation)

Winner shipped = `276-kids-balloon-tritave` (the lab's first non-octave / Bohlen–Pierce tuning). These two are the non-winning readings of the same WIDE fire: *three fresh non-pentatonic kids SOUND worlds, each dodging the cycle's banned tags (touch-input 4×, canvas2d-output 4×, three.js, C-pentatonic)*. Both were built to demoable, ran clean in the all-three `npm run build` (✓ Compiled, all `○ Static`: 276 4.07 kB · 277 4.43 kB · 278 4.2 kB), then `rm -rf`'d (non-winners are never committed). Each is a complete prototype waiting on a fresh number. Both are **non-pentatonic + a non-canvas2d/non-touch input** — keep them that way.

### `277-kids-overtone-cave` — hum into the tablet and a crystal cave sings your overtones back `[queued, build-verified]`

**Question**: what if a 4-year-old could HUM into the tablet and hear a crystal cave sing their voice's hidden overtones back at them — discovering the harmonic series with their own throat?

**Spec** (WIDE-sibling, cycle 288; build-verified `○ Static` 4.43 kB): **mic input** (clean — not touch) → `AnalyserNode` (fftSize 2048) → per-frame **RMS + spectral centroid** (no fragile exact-pitch detection). A fixed warm **drone fundamental ~98 Hz** + an **additive stack of integer harmonics (2f…9f)** = the natural **harmonic series** (categorically non-pentatonic — one tone + its overtones). A **formant cursor** rides up the series with the smoothed centroid (Gaussian peak scaled by RMS), so a quiet hum wakes the low partials and a brighter/louder hum sweeps a single overtone UP the stack — the Tuvan/khoomei throat-singing effect. **Output = hand-written raw WebGL** (clean — not canvas2d/three.js): a GLSL full-screen-quad crystal grotto, matte translucent strata + drifting caustics + a resonance cursor line (deliberately NOT an additive-particle starfield). Subsystems (4): mic capture+analysis · additive overtone synth · formant-cursor mapping · raw-WebGL grotto. Refs: **Tuvan/Mongolian khoomei** (overtone singing) + **Alvin Lucier *I Am Sitting in a Room*** (room sings you back) + **Helmholtz *On the Sensations of Tone*** (harmonic series); recent-research aligned with the 2025–2026 interactive-resonator work. Degrades: mic-denied → self-playing "breathing" formant sweep (fully demoable, `text-rose-300` status); no-WebGL → CSS gradient that still pulses. **Promising**: the lab's **first overtone-singing / harmonic-series-as-instrument** kids piece — a brand-new SOUND for the JURY's "audit the sound" push, and a calm/contemplative fit for KIDS.md. **Why it didn't win**: mic-permission + raw-WebGL fragility = higher 06:30-demo risk than the winner's tilt+SVG (which needs no permission and is never silent). **To resurrect**: assign a fresh number; add a lightweight YIN/autocorrelation pitch track to optionally retune the drone to the child's note (so the cave harmonizes), move the additive stack toward a differentiable modal/resonator timbre, add a second answering cave voice (more Lucier-like).

### `278-kids-dream-flock` — wave at the camera and a paper flock sings a whole-tone dream cloud `[queued, build-verified]`

**Question**: what if a 4-year-old could wave their hand at the camera and a flock of paper birds swirled toward the motion, singing a dreamy whole-tone cloud that has no "home note" and never sounds wrong?

**Spec** (WIDE-sibling, cycle 288; build-verified `○ Static` 4.2 kB): **camera input via frame-differencing** (clean — not touch, and deliberately NOT MediaPipe/ML): `getUserMedia({video})` → hidden 16×16 offscreen canvas → per-cell luminance delta → **motion energy + motion centroid** (lightweight, dependency-free, privacy-friendly — the feed is never surfaced). A **boids-lite flock** (Reynolds 1986: cohesion toward the motion centroid + a perpendicular swirl + cohesion-lite + separation, damped/speed-clamped) of cut-paper birds. **Output = inline SVG** (clean — the only canvas is the hidden frame-diff buffer): `<g>`/`<path>` birds animated via transform refs, `feDropShadow` + `feTurbulence`. Birds crossing horizontal bands sing soft celesta/mallet **whole-tone** notes (C D E F# G# A#) over an always-on whole-tone pad — categorically non-pentatonic, **no perfect fifth, no leading tone, no home note**: every combination floats (Debussy). Subsystems (4): camera frame-diff motion field · boids-lite physics · inline-SVG render · whole-tone synth+pad. Refs: **Claude Debussy** (*Voiles*, *Cloches à travers les feuilles*) + **Craig Reynolds — Boids (1986)**. Degrades: camera-denied → autonomous pseudo-noise "wind" so the flock keeps drifting+singing (`text-rose-300` status); audio-fail → visuals still run; dt-clamped on tab-return. **Promising**: a **fresh whole-tone (Debussy) kids SOUND** + a camera-motion input the kids zone hasn't used recently; the flock-toward-your-wave gesture is delightful. **Why it didn't win**: camera permission + frame-diff lighting-sensitivity = the highest 06:30-demo risk of the three; the winner's tilt+SVG is the safest + most novel (non-octave tuning). **To resurrect**: assign a fresh number; add multi-band motion (two kids steer two sub-flocks), optical-flow direction (swipe shapes the swirl), a second whole-tone collection that cross-fades for slow harmonic-colour shifts, a "settle to roost" end state.

---

## BANKED from Cycle 289 WIDE adult fire (build-verified — both compiled `○ Static` alongside the winner before curation)

Winner shipped = `279-tremor-score` (the lab's first live-external-API real-world-data sonification). These two are the non-winning readings of the same WIDE fire: *three adult explorers, each on a DIFFERENT categorical empty shelf the JURY keeps flagging (real-world-data / MIDI / multi-user), all non-luminous + non-pentatonic + fresh input/output.* Both were built to demoable, ran clean in the all-three `npm run build` (✓ Compiled, all `○ Static`: 279 5.5 kB · 280 4.68 kB · 281 4.62 kB), then `rm -rf`'d (non-winners are never committed). Each is a complete prototype waiting on a fresh number and each opens a shelf with **zero** prior entries.

### `midi-harmonograph` — your MIDI keyboard plays Resonance, and the chord you hold draws itself `[SHIPPED cycle 297 as 291-harmonograph]`

**Question**: what if your MIDI keyboard played Resonance directly — and the chord you're holding DREW itself as a harmonograph, so you can SEE the harmony's geometry?

**Spec** (WIDE-sibling, cycle 289; build-verified `○ Static` 4.68 kB): the lab's **first Web MIDI API** integration (`navigator.requestMIDIAccess()`, `onstatechange` hotplug). Each held note (1) **sounds** through a warm polyphonic Web Audio synth (sine + detuned triangle → lowpass → per-voice ADSR → feedback-delay space → `DynamicsCompressor`, velocity → loudness+brightness) and (2) **draws** as one pendulum in a **harmonograph**: `x(t)=Σ aᵢ·sin(rᵢ·t+φᵢ)`, `y(t)=Σ aᵢ·cos(rᵢ·t+φᵢ+kᵢ)` where `rᵢ` is the note's pitch ratio vs the lowest held note. A **JI-lock toggle** snaps ratios to small-integer just-intonation (octave 2:1, fifth 3:2, third 5:4…) for both synth and pendulums — so consonant chords become *periodic* and trace a clean, near-closed figure while 12-TET drifts/tangles, and the audible beating resolves as the figure cleans up. **Output = single non-luminous Canvas2D** (plain `source-over`, slow alpha-fade ink trail — a pen tracing a spirograph on dark paper; NOT additive glow) + a faint chromatic "harmony ring" polygon + a live notes/chord/ratio readout. Full chromatic input — **not a pentatonic toy**. Subsystems (3): MIDI/QWERTY/on-screen input layer · JI-retuning polyphonic synth · harmonograph geometry + chord/ratio detection. Refs: **harmonograph** (Victorian pendulum-drawing apparatus, ~1840s; Hugh Blackburn) + **Lissajous figures** (Jules Antoine Lissajous, 1857) + Web MIDI API (MDN, refreshed May 2026). Degrades: no MIDI device / unsupported → amber notice + a fully-playable QWERTY map (`a w s e d f t g y h u j k o l p ;`, key-repeat guarded) + a ≥2-octave on-screen keyboard (≥44px pointer targets); permission denied → visible `text-rose-300`. **Promising**: the lab's **first MIDI / live-performance-instrument** piece + first "harmony-as-geometry" — elegant, theory-literate, and a real stage/keyboard fit (Karel is a pianist). **Why it didn't win**: the headline experience wants hardware (degrades well to keyboard, but the wow is highest with a MIDI controller plugged in) and the seismic winner hit the higher ambition (4/5) + the JURY's named real-world-data shelf + a non-deterministic "about the world" surprise. **To resurrect**: assign a fresh number; add **MIDI-out** reactive arpeggiation/accompaniment, sustain-pedal = figure-hold, mod-wheel → pendulum damping, expression → ink weight; per-note color from spectral centroid; export the figure as SVG/PNG. Pairs naturally with the JI/beating interest from `272-kids-tune-purr`.

### `ensemble-tabs` — every browser tab is a player in one server-less, tempo-locked ensemble `[queued, build-verified]`

**Question**: what if every open browser tab on this page were a player in ONE shared, tempo-locked ensemble — a networked-music room with no server?

**Spec** (WIDE-sibling, cycle 289; build-verified `○ Static` 4.62 kB): the lab's **first multi-instance / networked-ensemble** piece — the "multi-user / collaborative listening room" empty shelf, demoable SOLO by opening 2–3 tabs side by side. Every same-origin tab joins `new BroadcastChannel("resonance-ensemble-281")`; protocol = `hello`/`welcome` (roster), `pattern` (your 16-step part), `voice`, `beat` (1.5s heartbeat, 4.5s prune), `leave`. **Shared clock with no leader, no negotiation**: each tab derives the grid purely from `Date.now()` (identical across same-origin tabs) — 90 BPM, 16 sixteenth-steps; `barPhaseAt(epochMs)` makes every tab compute the same step at the same instant, zero drift. Audio scheduled via a **Chris-Wilson lookahead scheduler** (25ms setInterval → schedules steps within the next 120ms on each tab's own AudioContext, sample-accurate). Six matte timbres (bell/pluck/low-pad/marimba/glass/reed) in **D Dorian** (modal — not pentatonic) over an always-on D+A drone. **Output = single non-luminous Canvas2D graphic score** (plain `source-over`, no glow): a 16-position ring, each connected voice on a concentric ring, scheduled notes as ink marks, a violet playhead sweeping in time, quiet ink ripples on note hits, plain-text roster with matte dots. Subsystems (4): BroadcastChannel sync/roster · wall-clock shared grid + lookahead scheduler · per-voice Web Audio synth · non-luminous Canvas2D score. Refs: **The League of Automatic Music Composers** (1978) + **The Hub** (1980s, Bischoff/Perkis) + **Chris Wilson "A Tale of Two Clocks."** Degrades: no BroadcastChannel → amber notice + solo generative instrument; single tab → fully playable solo loop with a "open another tab" hint; no audio until a Start gesture. **Promising**: the lab's **first networked piece**, server-less, and a genuinely surprising "the music is the sum of the room" interaction; cracks open the multi-user/WebRTC shelf the JURY has flagged at 0× for many cycles. **Why it didn't win**: the wow requires opening multiple tabs (less immediate at a phone-first 06:30 review than the seismic winner's single-button "listen to the Earth"), and a mid-loop joiner only hears a peer after that peer's next pattern edit/heartbeat. **To resurrect**: assign a fresh number; the obvious next step is **true WebRTC across machines** (data channels + a tiny signaling step + leader-elected epoch + per-peer latency compensation) — that turns the same engine into the lab's first cross-device shared room; also add per-note velocity/octave/gate editing and pattern-length negotiation.

---

## BANKED from Cycle 291 WIDE adult fire (build-verified — both compiled `○ Static` alongside the winner before curation; these REBUILD the two cycle-289 banks in a **canvas2d-free** form)

Winner shipped = `283-piano-isosurface` (first marching-cubes / volumetric isosurface). The cycle-291 diversity audit **banned canvas2d-output (5× in the last 10)**, so the two banked cycle-289 siblings (`midi-harmonograph` / `ensemble-tabs`, both originally Canvas2D) were re-built this fire with their visuals moved to **raw WebGL2** — which both clears the ban AND makes them shippable on *any* future cycle regardless of the canvas2d window. Both built to demoable, ran clean in the all-three-present `npm run build` (✓ Compiled, all `○ Static`: 281 5.82 kB · 282 5.91 kB · 283 9.97 kB), then `rm -rf`'d (non-winners are never committed). Each is a complete prototype waiting on a fresh number. **Keep them raw-WebGL2** (the non-canvas2d form is the point).

### `281-midi-harmonograph` (raw-WebGL2 rebuild) — your chord draws itself as a Victorian harmonograph `[SHIPPED cycle 297 as 291-harmonograph]`

**Question**: what if the chord you play (MIDI / QWERTY / on-screen) DREW itself as a harmonograph — so you can *see* the geometry of the harmony — while it sounds through a JI-lockable synth?

**Spec** (WIDE-sibling, cycle 291; build-verified `○ Static` 5.82 kB): a three-way input layer — **Web MIDI** (`navigator.requestMIDIAccess()`, `onstatechange` hotplug), auto-repeat-guarded **QWERTY** from C4 (`a w s e d f t g y h u j k o l p ;`), and a ≥2-octave **on-screen keyboard** (≥44px pointer targets) — all feeding one note-on/note-off path into a warm 12-voice synth (sine + detuned triangle → lowpass → per-voice ADSR → shared feedback-delay → `DynamicsCompressor`, velocity → loudness+brightness). A **JI-lock toggle** snaps each held note's ratio vs the lowest held note to small-integer just intonation (2:1, 3:2, 4:3, 5:4, 6:5, 5:3, 9:8…) for BOTH the synth pitch AND the harmonograph pendulum rates — so a consonant chord makes the figure **periodic and near-closed** while 12-TET drifts/tangles, and the audible beating resolves as the figure cleans up. **Output = raw WebGL2** (NOT canvas2d): hand-written GLSL ES 3.00, VAO/VBO, ~2000-point `LINE_STRIP` resampled and `bufferSubData`-uploaded each frame from `x(t)=Σ aᵢ·sin(rᵢt+φᵢ)e^(−dt)`, `y(t)=Σ aᵢ·cos(rᵢt+φᵢ+kᵢ)e^(−dt)`; pitch-class harmony ring; idle rotating seed figure; always-on soft drone; DOM HUD (held notes / chord / ratio set / MIDI status). Subsystems (4): MIDI/QWERTY/on-screen input · JI-retuning polyphonic synth · harmonograph geometry + chord/ratio detection · raw-WebGL2 renderer. Refs: the **harmonograph** (Hugh Blackburn, ~1840s) + **Lissajous figures** (J. A. Lissajous, 1857). **Novelty honesty**: Web MIDI itself already exists in the lab (`4-operator`); the novel-technique claim is the **harmonograph geometry** (0 prior hits) + harmony-as-visible-geometry. Degrades: no MIDI → amber notice + working keyboard; no WebGL2 → `text-rose-300`. **Promising**: pianist/live-performance fit (Karel plays piano), theory-literate, elegant; a real "see the harmony" instrument. **Why it didn't win**: ambition 3/5 (no recent-research tie, MIDI not novel) vs the marching-cubes winner's 4/5 + brand-new rendering paradigm; the headline is best with a MIDI controller plugged in. **To resurrect**: assign a fresh number; add MIDI-out arpeggiation, sustain-pedal figure-hold, mod-wheel → pendulum damping, per-note color from spectral centroid, export the figure as SVG/PNG, and the optional ping-pong-FBO ink-trail the builder deferred.

### `282-ensemble-tabs` (raw-WebGL2 rebuild) — every browser tab is a player in one serverless, tempo-locked ensemble `[queued, build-verified — canvas2d-free, ship any cycle]`

**Question**: what if every open browser tab on this page were a player in ONE shared, server-less, tempo-locked ensemble — the music being the sum of the room?

**Spec** (WIDE-sibling, cycle 291; build-verified `○ Static` 5.91 kB): the lab's **first networked / multi-instance / `BroadcastChannel` piece**, demoable SOLO by opening 2–3 tabs. Each tab joins `BroadcastChannel("resonance-ensemble-291")` (protocol hello/welcome/pattern/voice/beat/leave, live roster, ~4.5s prune) and derives the grid **purely from `Date.now()`** via a pure `stepIndexAt(epochMs)` — 90 BPM, 16 sixteenths — so every same-origin tab computes the same step at the same instant (zero drift, no clock-sync protocol; the wall clock is the conductor). A 25ms **Chris-Wilson lookahead scheduler** plays this tab's own part AND every peer's latest part on six **D-Dorian** voices (bell/pluck/low-pad/marimba/glass/reed) over an always-on D+A drone through a master compressor. **Output = raw WebGL2 circular graphic score** (NOT canvas2d): one concentric ring per connected player (colored by id), lit note marks, a violet playhead, ripples on note fire; DOM overlay for roster/BPM/Start. Subsystems (4): BroadcastChannel sync+roster · wall-clock shared grid + lookahead scheduler · per-voice Web Audio synth · raw-WebGL2 score. Refs: **The League of Automatic Music Composers** (1978) + **The Hub** (Bischoff/Perkis, 1980s) + **Chris Wilson, "A Tale of Two Clocks."** Same-origin tabs sharing `Date.now()` sidestep the NMP <25ms latency wall entirely. Degrades: no BroadcastChannel → amber notice + solo instrument; single tab → playable solo with "open another tab" hint; audio gated behind Start. **Promising**: cracks the multi-user/WebRTC shelf (0× for many cycles), serverless, genuinely surprising. **Why it didn't win**: the wow requires opening multiple tabs (less immediate at a phone-first 06:30 review than a single-button 3D form), and a mid-loop joiner hears a peer only after that peer's next heartbeat/edit. **To resurrect**: assign a fresh number; the obvious next step is **true WebRTC across machines** (data channels + tiny signaling + leader-elected epoch + per-peer latency compensation) → the lab's first cross-device shared room; also per-note velocity/octave/gate editing + pattern-length negotiation.

---

## Banked WIDE non-winners — Cycle 292 (kids physical-modeling fire)

Both **build-verified** (the all-three-present `npm run build` was exit 0 and emitted both routes) before their folders were removed per the curate-and-prune rule. Resurrect number-free on a future kids cycle; both are non-canvas2d and non-pentatonic, so they clear the recurring canvas2d ban + the JURY sound mandate as-is. Born from RESEARCH §292 (real-time physical-modeling / modal synthesis).

### `kids-singing-bowl` — friction / stick-slip sustain `[queued, build-verified once]`
**Question**: what if a kid played a Tibetan singing bowl by *rubbing*, and the tone grew out of the gesture? **Spec**: the lab's first **friction/stick-slip excitation of a modal resonator** (sustain-by-gesture, not tap-attack). One scalar `excitation` ref pumped each frame by the finger's smoothed circular angular speed around the rim (`excitation += rubSpeed·K·dt`) and leaked toward 0 (`*= DECAY`); it drives master gain AND brightness (higher partials swell more when rubbing fast). Voice = 5 **inharmonic** bell partials `[1.0, 2.7, 4.9, 7.7, 11.0] × 174.6 Hz` + a detuned `×1.006` twin for the classic ~1 Hz beat + a slow LFO so it sounds *sung*; tap = a one-shot strike. **three.js** metallic lathe bowl (3/4 view) + a cymatic water disc whose concentric rings react to excitation + a glow point trailing the finger round the rim. Always-on sub-drone, `DynamicsCompressor` limiter, toddler-safe. **Why it lost (292)**: gorgeous but the signature *requires discovering the circular-rub* — a plain tap at 06:30 gives only a small strike (the "wow needs a learned gesture" risk that also sank 282/289). **Resurrect**: ship as-is; consider an animated finger-hint ghost that traces the first circle so the gesture is self-teaching. Refs: nlm (arXiv 2603.10240, 2026); Inácio/Antunes/Wright 2008.

### `kids-jelly-choir` — mass-spring soft-body → audio `[SHIPPED cycle 294 as 286-kids-jelly-choir]`
**Question**: what if a kid squished a wobbly jelly and heard it *sing its own wobble* — and squished two together to harmonize? **Spec**: the lab's first **mass-spring / Verlet soft-body → audio** instrument. Each jelly = 12 perimeter point-masses + implicit center, radial + structural springs, **Verlet** integration (2 substeps, damping); poke/drag pins the nearest point to the pointer, release → overshoot → decaying wobble. Per-frame **deformation energy** (mean displacement from the breathing rest ring) drives one warm modal voice per blob: `e²→gain` (silent at rest), `e→lowpass`, `e→vibrato depth/rate` — the shimmer literally tracks the jiggle. Tuning = **just intonation** 1/1, 9/8, 5/4, 3/2, 2/1 over a 196 Hz root (non-pentatonic); squish two → a pure JI interval + a contact glow. **Inline animated SVG** (Catmull-Rom→Bézier blob paths, soft fill, a face whose mouth opens with energy) — SVG always renders, lowest render risk. Multi-touch (two kids, two hands). Always-on drone + limiter. **Why it lost (292)**: delightful and very kid-friendly, but the voice is fixed integer partials (not true eigenmodes) so its sound is slightly less novel than the drum's, and a gentle poke can be quiet (`e²`). **Resurrect**: ship as-is; deepen with true modal partials from the blob's eigenmodes + real inter-blob collision (currently glow-on-proximity). Refs: nlm (arXiv 2603.10240, 2026); Provot 1995; Müller PBD.

---

## Banked from cycle 295 (WIDE adult fire — 2 build-verified explorers, winner was 287-mirror-choir)

Both were fully built to demoable + README, then removed (not committed) per the WIDE-curation rule. Both clear the ambition floor; resurrect either on a future adult cycle.

### `aurora-wire` (was 288) — live space-weather sonification, the lab's 2nd real-world-data source
**The brief**: fetch three keyless, CORS-open NOAA SWPC feeds — solar-wind plasma (`/products/solar-wind/plasma-1-day.json`: speed/density), IMF (`/products/solar-wind/mag-1-day.json`: Bz), planetary K-index (`/products/noaa-planetary-k-index.json`: Kp) — and drive (a) a warm equal-temperament root+fifth+upper-partials drone whose tension rises with Kp and southward Bz, and (b) a matte aurora-curtain Canvas2D (source-over gradient ribbons on near-black, NOT additive particles). Poll 60s; glide all params; bundled-snapshot fallback (Bz -6.5/Kp 4/speed 480/density 4.2 random-walked) so it breathes with zero network. Themed to Karel's *Cosmic Homecoming* journey. **Why it's promising**: proves the live-API pattern (279) generalizes to a 2nd source; a non-glow cosmic piece. **Resurrect notes**: it overlaps `262-aurora-particle` (same data, additive-THREE aesthetic) — the differentiator is the *matte* render + the equal-temperament held-chord (no pentatonic/arpeggio). To justify a 3rd aurora piece, push past 262/288: add the OVATION auroral-oval image as the actual visual, an ISS-pass overlay, or a "replay a famous storm" mode (e.g. the May 2024 Gannon storm) so it's a *historical* instrument, not just a now-meter. Ambition: ≥3-subsystems + named-ref(NOAA SWPC/SeismoDome lineage) + recent-research(§295). Build-safe (pure client fetch + Web Audio + Canvas2D, no deps, no API route).

### `still-room` (was 289) — eyes-closed HRTF spatial piece navigated by head-turn — ⚑ CONCEPT SHIPPED cycle 307 as `308-orbit-choir`; faithful fixed-room sibling re-banked as `307-still-room`
**Status (cycle 307)**: the spatial-audio family this seed defined is now OPEN — its long-form "guided journey into a resolving chord" deepening **shipped this fire as `/dream/308-orbit-choir`** (the DEEP winner: 6-min azimuth+pitch convergence). The **faithful fixed-room variant** (below) was built green this fire as `307-still-room`, lost curation to the bigger 308, and is **re-banked here as the calmer companion piece — a strong standalone next-cycle ship** (it's already build-verified, ~690 lines, just `rm`'d after curation; rebuild from this brief).
**The brief (`307-still-room`)**: near-black screen; 7 sustained whole-tone + natural-minor bell/pad voices (rooted on A: A2·B2·C3·D3·E3·F3·G3) placed at FIXED compass bearings (0/51/103/154/206/257/309°, slight elevation variety) via `PannerNode` `panningModel="HRTF"`; the `AudioListener` forward vector is rotated by DeviceOrientation `alpha`/`webkitCompassHeading` (with `DeviceOrientationEvent.requestPermission()` for iOS), so turning your phone swings the tones around your head; the faced voice swells via a cosine focus curve (`max(0,cos Δ)^2.2 → gain`), the ones behind fall quiet — turning becomes a slow *scan* of a static room (vs. 308's *moving/resolving* room). Each voice = sine + quiet triangle octave → per-voice lowpass + breathing LFO → shared synthesized convolver reverb (decaying filtered-noise impulse, no files). Feature-detects modern `forwardX`/`positionX` AudioParams vs legacy `setOrientation`/`setPosition`. Degrades: no sensor → pointer-drag + arrow-keys + a hands-free auto-tour. Faint violet compass as a guide, not the point. Refs Pauline Oliveros *Deep Listening*, Bernhard Leitner *Ton-Raum*, the 2026 head-tracked-spatial-audio wave (CES/THX). **Why keep it (vs. 308)**: it's the *still* counterpart — no clock, no arc, no resolution; pure attentional listening to a fixed sonic architecture. The calmer, more meditative half of the pair; ships as a companion. **Resurrect/deepen**: MediaPipe face-landmark as an alternate head-tracker (fuses with 287); a haptic pulse (`navigator.vibrate`) when a voice aligns; let the room be one of Karel's *Welcome Home* tracks spatialized into 7 stems. Ambition: novel-technique(HRTF-navigation + DeviceOrientation, now established by 308) + ≥3-subsystems + named-ref + recent-research(§295/§307). **Build-verified cycle 307.**

### `kids-shadow-dance` — ✅ SHIPPED cycle 300 as `/dream/295-kids-shadow-dance` (WIDE winner)
**Shipped note (2026-06-03, cyc300)**: resurrected from the third re-bank below and shipped as the cycle-300 WIDE winner over `294-kids-voice-garden` + `296-kids-firefly-tilt`. Authoritatively `npm run build`-verified (✓ Compiled, `/dream/295-kids-shadow-dance ○ 7.08 kB`, zero warnings attributable to it), not browser-verified. **Won this cycle** (vs the two siblings) precisely on Karel's "massively bigger / less similar" mandate: it's the only one that escapes the C-pentatonic rut Karel named (tuned to **G-Lydian**), it's whole-body embodied (the jury-praised "child *moves*" direction, like the standout 287), and it's the most technically ambitious (ping-pong FBO light-trail accumulation + frame-diff motion field + self-silhouette composite). The bank's "space it from the embodied run" caveat is discharged — 291 (MIDI, cyc297/299) and 293 (weather, cyc298) now separate it from the 287/290 body run, so cyc300 is the non-embodied-adjacent kids cycle the note asked for. **Deepen path** (next time this resurfaces): per-limb color trails; a "freeze-dance" game mode (music pauses, garden waits); two-kid mode (two silhouettes, two gardens); a calmer scale toggle. Original brief + re-bank history below.

### `kids-shadow-dance` (was 291, cycle-296 WIDE explorer — banked, shipped cyc300) — camera frame-difference movement → a blooming, singing meadow
**The brief**: kids (4+) camera piece where GROSS whole-body dancing (not precise landmarks) makes a dusk meadow bloom + sing. Deliberately uses **frame-difference optical flow** (video → 32×24 offscreen → per-cell luminance diff = motion field), NOT MediaPipe/skeleton — lighter, dependency-free, and robust for a constantly-moving 4yo. Motion field drives: bloom spawn (hot cells), pitch (screen height → warm Lydian), and overall energy → pad swell + filter + voice count; `DynamicsCompressor` master so it can never get harsh. Matte Canvas2D shadow-theater (no three.js, no glow). Graceful: no camera → hand-authored "ghost dancer" sweeps the meadow and drives the same engine (fully demoable, never silent). **Why promising**: the loved body/dance cluster (`217-dance-avatar`❤️, `234-kids-hand-creature`❤️) at the kids altitude, but with a *non-precise* control model that fits a 4yo's motor skills — and frame-diff is a technically distinct path from 287's MediaPipe landmarks. **Resurrect/deepen**: per-limb color trails; a "freeze-dance" game mode (music pauses, garden waits); two-kid mode (two silhouettes, two gardens). Ambition: ≥3-subsystems(camera+motion-field+generative-bloom+audio) + named-ref(Dalcroze Eurhythmics; Frid/Bresin interactive sonification of children's movement) + recent-research(§296). Was build-reviewed (not authoritatively built — winner-only build that cycle). **Note**: don't ship right after another body→sound piece; space it from 287.
**Re-banked cyc298 (built again as `295-kids-shadow-dance`, build-verified, then removed per WIDE-curation)**: this cycle the builder upgraded the render to a **raw WebGL2 fragment-shader meadow** (motion-field uploaded as a texture, light-trail decay, low-res self-silhouette composite) instead of matte Canvas2D, and confirmed the ghost-dancer fallback drives the identical pipeline. Did NOT win because it sits inside the heavy 287(cyc295)/290(cyc296) embodied/camera run — the diversity audit specifically guards against this clustering, and 293 (real-world-data) is a cleaner-divergent axis. Resurrect on a *non-embodied-adjacent* kids cycle; the WebGL2 build is the strongest version to revive.

### `kids-sky-band` — ✅ SHIPPED cycle 298 as `/dream/293-kids-sky-band` (WIDE winner)
**Shipped note (2026-06-03, cyc298)**: resurrected the banked seed below and shipped it as the cycle-298 WIDE winner, with the spec's one change — **output is a raw WebGL2 fragment-shader sky, NOT matte Canvas2D** (matte-Canvas2D was at the diversity-audit ban threshold; WebGL2 dodged it and looks better for a sky). Re-validated current this cycle (RESEARCH §298: DATASONICA 2026 award + RIT Weather Chimes Apr 2026), so the "hold until the real-world-sonification vein cools" note below is discharged — it's the FIRST *kids* real-world-data piece and FIRST weather source (prior two were adult/cosmic: 279 earthquakes, 288 aurora). Deepen path lives in `293-kids-sky-band/README.md` (moon phase; sunrise/sunset transitions across a session; multi-city tour; weather_code → fog/storm motifs).
**Original brief**: kids (4+) real-world-data sonification. On start, fetch live weather from keyless CORS-open **Open-Meteo** (`current=temperature_2m,cloud_cover,wind_speed_10m,is_day,precipitation,weather_code`) via `navigator.geolocation` (3s timeout) → fixed-location fallback. Four cartoon sky-friends (Sun/Cloud/Wind/Rain, distinct hues) play a C-pentatonic ensemble: is_day+temp → bell register + day/night palette; cloud_cover → pad lowpass+level; wind → breathy filtered-noise whoosh on an LFO; precipitation → droplet density; temp → tempo. Plays fully hands-free (tap-to-solo is a bonus). Matte Canvas2D sky scene; `DynamicsCompressor` limiter. Graceful: fetch fail / offline → bundled `SAMPLE_WEATHER` + `text-amber-300/95` notice, full band still plays with zero network. Client-side fetch only — NO api route (public keyless side-effect-free GET). **Why promising**: the lab's FIRST *kids* real-world-data piece — "the band is different every day because the sky is real." **Resurrect/deepen**: moon phase, sunrise/sunset transitions across a session, a multi-city tour, weather_code → fog/storm motifs. Ambition: ≥3-subsystems(geo+API+param-mapping+generative-ensemble+render) + named-ref(John Luther Adams *The Place Where You Go to Listen*; Open-Meteo) + real-world-sonification. Was build-reviewed (not authoritatively built). **Note**: jury flagged real-world-sonification as recently over-mined (279-tremor + aurora-wire) — hold until that vein cools, then this kids form refreshes it.

### `kids-voice-garden` (was 294, cycle-298 + cycle-300 WIDE explorer — RE-BANKED, build-verified) — SING a garden into bloom, it sings back
**Re-bank note (2026-06-03, cyc300)**: built AGAIN as `294-kids-voice-garden` with the full deepen list (2–3 seeded flowers on load, idle self-arpeggio, duet drone-lean) and verified build-clean by its builder, then removed per WIDE-curation. **Did NOT win this cycle** for one sharp reason: it's a **mic + WebGL + pentatonic** piece, and that mic+pentatonic combo is exactly the rut Karel named ("stop shipping mic+canvas+pentatonic variants") — so despite being charming and the freshest research-chained of the three (MusicalBoard browser-pitch-detection, 2026-05-05, §300), shipping it would have shipped *into* the named local minimum. **To resurrect well: reframe it OUT of the pentatonic rut** — e.g. a *duet/harmony* mode where the garden answers in a different mode each session, or a long-form "the garden you grew yesterday is still here" stateful version, so the next voice ship is a *bigger* concept, not the same shape. The build-verified code from this fire is the strongest base to revive. Original brief below.
**The brief**: kids (4+) voice instrument. On Start (mic via `getUserMedia`), real-time **autocorrelation pitch detection** (Chris Wilson `PitchDetect` / YIN family — ~2048-sample buffer, voice 75–1100 Hz, clarity ~0.7) octave-collapses each sung note to **C-major pentatonic** (nothing is ever "wrong") and maps loudness (RMS) → bloom size. Each sustained sung note **grows a flower** in a raw WebGL2 fragment-shader twilight garden (pitch → hue + vertical position [high voice = top], loudness → size/brightness). After ~2s of silence the garden **sings the phrase back** note-by-note on a soft mallet over an always-on C+G drone (DynamicsCompressor limiter) — call-and-response is the reward. No/denied mic → a self-playing demo melody, so always demoable. Mic is analysis-only (never recorded/played-raw/sent). INPUT=mic/voice · OUTPUT=raw-WebGL2 shader garden · TECHNIQUE=autocorrelation pitch-detection + sing-back memory · VIBE=kids/twilight/contemplative. Refs: **Chris Wilson PitchDetect**; **YIN** (de Cheveigné & Kawahara, JASA 2002); **Pauline Oliveros *Deep Listening***. **Why it didn't win** (vs 293): voice/mic was used recently (280-echo-canyon, 287-mirror-choir) so it's less diversity-fresh than 293's never-used-in-kids real-world-data axis; and 293 needs zero permission to demo (mic prompts add a failure surface). **Resurrect/deepen**: a "duet" mode (drone follows the child's key); seed a few demo flowers on load; let the garden slowly self-arpeggio its bloomed flowers when idle; pick a second scale (Lydian) for variety. Build-verified (tsc + next-lint clean), then removed per WIDE-curation. Strong standalone next-voice-cycle ship.

### `kids-firefly-tilt` (was 296, cycle-300 WIDE explorer — banked, build-verified) — tilt a firefly to wake stars; the sky REMEMBERS your path and replays it as a lullaby
**The brief**: kids (4+) tilt + memory piece. On Start, listen to **DeviceOrientation** (`gamma`/`beta` → acceleration over a comfortable ±35°; iOS `DeviceOrientationEvent.requestPermission()`, type-guarded). Tilt nudges a glowing **firefly** around a raw-WebGL2 night sky with gentle physics (accel + damping + speed clamp + soft edge-bounce). ~8–12 **sleeping stars**; when the firefly drifts near one it **wakes** — brightens and rings a soft chime whose register is set by the star's screen height — over an always-on drone through a `DynamicsCompressor` limiter. **The bigger idea = path-memory / replay**: the *order* the stars are woken is stored for the whole session, and on a **"Replay the lullaby"** button (or after all stars wake) the sky relights them one-by-one in that order, re-ringing the song — so the sky you make is *different depending on the journey you drew* (stateful, not a loop). The firefly's recent path draws as a fading glowing trail. INPUT=tilt/device-orientation (pointer-drag fallback on desktop) · OUTPUT=raw-WebGL2 starfield · TECHNIQUE=tilt-physics + path-memory replay · VIBE=kids/night/lullaby. Ref: **Toshio Iwai *Electroplankton*** (playful constellation/creature interaction). Degrades: no sensor / desktop → pointer-drag (never blocked, amber notice); no WebGL2 → rose notice, chimes still play. No API route, no deps. **Why it didn't win** (vs 295): the *input* (tilt) is heavily used in the kids lane already (238/253/276/284/286…) so it's the least diversity-fresh axis, and it stays on **C-pentatonic** (the named rut); 295 escaped both (camera + Lydian). **The keeper is the CONCEPT, not the input** — "the sky remembers your journey and plays it back" is a genuine stateful/long-form idea (categorical-menu: state/memory/evolution). **Resurrect/deepen**: lift the path-memory-replay mechanic onto a *fresher* input (voice phrase, drawn gesture, or a two-kid duet where two fireflies weave one lullaby), and/or let yesterday's constellation persist into today. Build-verified by its builder (structurally consistent, API-aligned), removed per WIDE-curation.

### `phase-scope` (was 292, cycle-297 DEEP explorer — banked, build-verified) — see + hear consonance LOCK on an XY oscilloscope
**The brief**: an adult tuning instrument that makes just intonation *visible*. Two (or up to four) tones drive an **XY phosphor vector-scope** (raw WebGL2, CRT-green, fade-quad phosphor trail): small-integer just ratios trace clean, **still, closed Lissajous loops**; a mistuned ratio makes the loop slowly **precess and tangle** — the visual analogue of beating. The headline control is a continuous **"Pure ⇄ Equal" morph slider** that crossfades every interval (in log-frequency space) between its nearest just ratio and 12-TET; drag toward Pure and the lock reads on **three channels at once** — the figure goes still, an emerald **beat-rate meter (Hz)** falls to "LOCKED" ≈0, and the audible beating slows to silence. One-tap interval presets (1:1, 2:1, 3:2, 4:3, 5:4, 6:5, 5:3) collapse to a single clean interval so the payoff is instant; per-partner ±50¢ detune gives manual control; stack up to 3 partners into a chord scope. Subsystems (3): base+3-partner Web Audio engine (de-zippered `setTargetAtTime`, limiter) · tuning/lock model (just/equal ratios, log-space morph, cents-from-just, dominant beat-Hz) · raw-WebGL2 phosphor scope. Refs: **Lissajous** (1857), **oscilloscope music / vector synthesis** (Jerobeam Fenderson), **Ryoji Ikeda**'s clinical XY-phosphor aesthetic. INPUT=sliders/presets · OUTPUT=raw-WebGL2 scope · TECHNIQUE=Lissajous XY phase-portrait + JI-lock · VIBE=clinical/Ikeda CRT — dodges all JURY-banned tags. Degrades: no WebGL2 → rose notice, audio+controls still work. No api route, no deps. **Why it didn't win** (vs `291-harmonograph`): it's an elegant educational *tuning demo* (slider/preset input), not a *played* instrument — 291 is the pianist-fit MIDI-keyboard instrument that IS the banked breadth the JURY named to ship + carries MIDI-out for provocation #5. Its "Design notes" affordance also fell back to a browser `alert()` (cosmetic). **To resurrect/deepen**: assign a fresh number; add **mic-input pitch detection** → a live partner tone (sing into it and watch your interval lock); a MIDI-controlled base note; calibrate the visual precession speed to the real beat-Hz (the builder scaled it artistically, not physically); a "save-a-figure" PNG export. **Strong fold-in option**: this could become a **"scope mode" toggle inside 291's multi-cycle deepening** rather than a standalone — 291 + a continuous-tuning XY scope view is a complete "harmony made visible" instrument.

---

### 291-harmonograph CYCLE 3 — polychrome specimen `[✅ SHIPPED cycle 301 into /dream/291-harmonograph — DEEP winner]`

**Shipped (cycle 301)**: implemented exactly as specced below — `pitchClassToColor(midi)` (circle-of-fifths `hue=((pc*7)%12)/12`, s 0.78 v 1.0) + `hsvToRgb`; `sampleCompositeUpTo` (sums pendulums 0..i, normalized by the FULL set so partial threads stay registered); render loop draws one colored running-composite `LINE_STRIP` per held note (a triad weaves from three kindred hues); **SVG vector export** (one aspect-corrected `<polyline>` per thread over a dark rect → `harmonograph-<chord>.svg`, the lab's first vector artifact) alongside the kept PNG export; color legend (swatch + note name per thread). Cited Chord Colourizer (arXiv 2510.10173) + Jack Ox + maddie lim's "12 Tone Color Theory" (RESEARCH §301 chose circle-of-fifths over chromatic mapping). Build 9.29→10.4 kB. Won a DEEP-2 fire over the scope-mode sibling (banked below). Build-verified, not browser-verified — unverified: the multi-strip draw legibility on a dense chord, the SVG aspect projection, PNG readback on Safari.

**Question**: what if every note in the chord wrote its OWN colored thread, and the finished figure could be taken home as a printable **vector** specimen?

**Provenance**: cycle 299 ran DEEP on `291-harmonograph` (2 parallel approaches). Winner = the *expressive* layer (pedal/damping/ink/PNG, shipped into 291). This is the **loser, banked** — fully build-verified by its builder (tsc + eslint clean), `rm -rf`'d per the orchestration rule. It is the natural **cycle 3** of the 291 multi-cycle thread.

**Spec (extend the shipped `291-harmonograph`, do not start a new slug — keep the multi-cycle thread):**
- **Per-note color — Newton color wheel via circle of fifths.** Add `pitchClass` + `color` to the `Pendulum` type; map pitch class (0–11) → hue by `(pc*7)%12 / 12` (a fifth = one constant hue step, so a triad reads as three distinct-but-kindred hues), `hsvToRgb(hue, 0.78, 1.0)`. Lineage: **Chord Colourizer** (arXiv 2510.10173 — CQT chord detect → Isaac Newton's 7-color wheel), RESEARCH §299.
- **Multi-strip polychrome render.** Extend `harmonograph-gl.ts` with `sampleCompositeUpTo(out, pts, pends, upTo, rotate, tMax)` (sums pendulums `[0..upTo]`, normalized by the *full* set so partial threads stay registered) and draw each note's running-composite thread as its own colored `LINE_STRIP` (the renderer already takes a per-`drawCurve` color). A major triad then weaves visibly from its parts. Must STILL clean up under Pure tuning.
- **SVG vector export.** Emit one `<polyline>` per colored thread from the exact sampled points, wrapped in an SVG doc with the dark ground; download `harmonograph-<chord>.svg`. A true printable artifact (vs. cycle-2's PNG raster).
- **Specimen legend.** Swatch + note name + ratio per thread.

**Why it's strong**: cites the freshest research reference in the lab (Chord Colourizer, 2025); gives a *vector* takeaway (no other prototype exports SVG); and is a clean continuation of the lab's only multi-cycle thread. Builder already wrote working `pitchClassToColor`, `sampleCompositeUpTo`, `runSvgExport`, and the legend — resurrect from cycle-299 history (`git log` around the cycle-299 commit) or rebuild from this spec.

**Ambition**: named-reference (Chord Colourizer/Newton) + multi-cycle-commitment (cycle 3 of 291) + recent-research (§299) = 3 of 5.

---

### 291-harmonograph CYCLE 4 — SCOPE MODE fold-in `[queued · banked from cycle-301 DEEP loser `harmonograph-scope`]`

**Question**: what if the harmonograph instrument had a second render mode — a CRT-green XY phosphor **vector-scope** where a continuous **Pure ⇄ Equal** slider lets you *watch* an interval lock (the figure goes still) while you *hear* the beating slow to silence?

**Provenance**: cycle 301 ran DEEP on 291 (2 parallel approaches). Winner = the polychrome specimen (shipped, above). This is the **loser, banked** — its builder reported a clean `npm run build` + ESLint + tsc, `rm -rf`'d per the orchestration rule. It is the natural **cycle 4** and folds in the long-banked standalone `phase-scope` concept.

**Spec (extend the shipped `291-harmonograph` — keep the multi-cycle thread, add a render-MODE toggle):**
- **Mode toggle** at the top: **"Harmonograph"** (existing figure, unchanged byte-for-byte) vs **"Scope"** (new XY phase-scope of the SAME held notes). Both share input layer / synth / WebGL2 canvas. Switching hands tuning ownership to the right system (JI toggle owns Harmonograph mode; the morph slider owns Scope mode).
- **Continuous Pure⇄Equal morph slider** (value `m` 0..1, distinct from the binary JI toggle): `morphRatio(equalRatio, m) = exp((1-m)·ln(equalRatio) + m·ln(snapToJustRatio(equalRatio)))`, applied to BOTH the scope figure AND the synth (`synth.retuneMorph(low, m)` via `setTargetAtTime` de-zipper) so dragging toward Pure audibly slows the beats to silence.
- **XY phosphor vector-scope render** (raw WebGL2, reuse `makeRenderer`/`drawCurve`, CRT-green `[0.3,1.0,0.45]`, fade-quad phosphor trail): per base+upper pair, `x=sin(rA·t), y=sin(rB·t+φ)`; locked just ratio → still closed Lissajous; mistuned → slow precession ∝ cents-from-just. 1–3 channels for a chord. New helpers already written: `morphRatio`, `centsFromJust`, `beatHz` (dominant beat-rate Hz → 0 on lock), `scopeTMax`/`justClosePeriods` (per-channel t-span so a locked loop CLOSES), `sampleScope`, `ScopeChannel`, and engine `retuneMorph`.
- **Readouts (emerald)**: live **beat-Hz meter** → "LOCKED ≈ 0 Hz" on lock + per-interval **cents-from-just**; **7 one-tap presets** (1:1, 2:1, 3:2, 4:3, 5:4, 6:5, 5:3) that play a clean interval and auto-switch to Scope mode → demoable with zero hardware.

**Why it didn't win (vs polychrome)**: its core "see+hear consonance lock" *re-presents* 291's existing JI-toggle mechanic (a different VIEW of the same idea) rather than adding a NEW capability — the polychrome added per-voice color + the lab's first vector export. But it's an elegant, pedagogically strong tuning instrument and a clean cycle 4. Refs: Lissajous (1857), oscilloscope music / **Jerobeam Fenderson**, **Ryoji Ikeda** clinical XY-phosphor. Caveat noted by builder: the 45/32 tritone is treated as high-q "barely-rational" so it won't perfectly close even at Pure (expected).

**To resurrect**: rebuild from this spec, or recover from cycle-301 history (the `297-harmonograph-scope` scratch folder, `git log` around the cycle-301 commit). **Ambition**: named-reference (Lissajous/Fenderson/Ikeda) + multi-cycle-commitment (cycle 4 of 291) = 2 of 5.

---

### 299-kids-clap-band — clap a rhythm, a band catches it and grows `[banked seed — re-built + build-verified cycles 304 AND 306 (THRICE-banked: cyc302→304→306); built as folder 304-kids-clap-band cyc306; lost to 303-kids-wind-harp then 306-kids-rain-shaker]`

**⚠ THRICE-BANKED (cyc302→304→306).** STATE §306 flags this for a **decision next kids cycle (308): ship it outright or deliberately retire it** — it keeps clearing the ambition floor STRONGEST (3/5) yet losing on experience-novelty (the jury's own flag: "clap → groove grows" reads close to existing loopers). It is the missing kids **rhythm/percussion** lane and pairs cleanly with `298` (pitch) / `303` (tilt) / `306` (shake). At cyc306 it built clean again as folder `304-kids-clap-band` (page.tsx + onset.ts + groove-audio.ts + band-gl.ts + README, builder-clean, matte raw-WebGL2 SDF band — no glow).

**Re-banked from cycle 304** (kids WIDE fire, 3 explorers — built again clean: page.tsx + onset.ts + groove-audio.ts + band-gl.ts + README, builder-clean tsc+ESLint — and lost narrowly to `303-kids-wind-harp`). It clears the floor **strongest of the three** (onset detection #1 + Reich ref #3 + recent-research §304 #5 = **3/5**) and most directly implements the RESEARCH §304 hook (*Rhythm in the Air*, arXiv:2511.00793 — embodied input quantized onto a grid, scale-constrained). It lost on **experience-novelty, not gates**: "clap → groove grows" reads close to the lab's existing loopers/drum pieces (284/280/98), while wind-harp's tip-the-world string physics moves the *experience* (the jury's actual ask). **This is the obvious next kids rhythm/percussion ship** — revive whole from this spec.

(Originally banked cycle 302; full build re-confirmed cycle 304.)

- **Question**: "What if a kid could CLAP a rhythm and a band of friendly animal-drummers caught it, looped it back, and built a whole groove on top — getting richer with every clap?"
- **Tags** (clean diversity dodge): INPUT = clap/percussive onset (mic, hands-free) · OUTPUT = raw WebGL2 band · TECHNIQUE = real-time **onset/transient detection** (HFC spectral flux, 2–8 kHz weighting, adaptive threshold self-calibrated to room noise floor, 160 ms refractory) → quantize to a 16-step loop @ ~96 BPM → progressively **layer** woodblock→kick→shaker→bell at thresholds 1/3/6/10 filled slots · VIBE = kids campfire, D-Mixolydian pad bed (NOT pentatonic), DynamicsCompressor limiter, no fail.
- **What was promising**: onset detection is a genuinely lab-fresh DSP technique (could claim ambition #1, never-used technique); the look-ahead Web Audio clock keeps timing tight under JS jank; the layered-loop thickening is very satisfying and kid-legible (more claps → more drummers bouncing). Named ref: **Steve Reich, *Clapping Music* (1972)** + the looper/step-sequencer lineage recast hands-free.
- **Why it didn't win**: it loops ONE captured pattern rather than remembering the child's *evolving* input over time — closer to the lab's existing looper form than `298`'s growing-memory/state arc. Strong, fresh, ship-ready; revive when the kids lane wants a rhythm/percussion piece (it pairs well as a sibling to the pitch-based `298`).

### 300-kids-blow-sail — blow into the mic, your breath is the wind `[banked seed — re-built + build-verified cycles 304 AND 306; built as folder 305-kids-blow-sail cyc306; lost to 303-kids-wind-harp then 306-kids-rain-shaker]`

**Re-banked again from cycle 306** (kids WIDE fire — built clean a 3rd time as folder `305-kids-blow-sail`: page.tsx + breath.ts + chime-audio.ts + sea-gl.ts + README, builder-clean; the boat/buoys now render inside the WebGL2 sea shader. Lost to `306-kids-rain-shaker` on experience-novelty — it's the least compositional-memory of the candidates, a continuous calm toy, and clears the floor 2/5. Revive for the calm/breath lane.)

**Re-banked from cycle 304** (kids WIDE fire, 3 explorers — built again clean: page.tsx + breath.ts + chime-audio.ts + sea-gl.ts + README, builder-clean tsc+lint — the cycle-304 build moved the boat/buoys into the **same WebGL2 fragment shader** as the sea, dropping the old Canvas2D overlay. Lost to `303-kids-wind-harp`). Floor: breath-envelope/Wiener-entropy #1 + wind-controller ref #3 = **2/5**. Revive for a calm breath lane.

- **Question**: "What if a kid could blow into the mic and their breath became the wind that sails a little glowing boat across a singing sea?"
- **Tags** (clean diversity dodge): INPUT = **breath/blowing** (mic, hands-free — NOT pitch, NOT touch) · OUTPUT = raw WebGL2 dawn-sea (FBM waves) + small Canvas2D boat overlay · TECHNIQUE = **breath-envelope detection** = short-window RMS × **spectral flatness (Wiener entropy)** in the 1–10 kHz band, so a broadband blow scores high while a tonal voice/piano (peaked spectrum) scores near zero → wind force drives boat velocity + wake ripples + horizon brightness + a wind-chime swell/pitch-glide; the boat passes **singing buoys** that chime modal notes so a melody emerges from the journey · VIBE = kids calm/dreamy, **Lydian** pad bed (NOT pentatonic), limiter, boat can never crash, no fail.
- **What was promising**: breath input is a genuinely lab-fresh modality (could claim ambition #1); the Wiener-entropy breath/tone discriminator is a clean, robust trick that ignores ambient music; the "your breath is wind" body→world mapping is calming and unusual for the kids lane. Named ref: breath/wind-controller lineage (Akai EWI / Yamaha BC; ney/shakuhachi).
- **Why it didn't win**: least compositional *memory* of the three (continuous toy rather than a remembered/accumulating piece), and it leans on a Canvas2D boat overlay. Revive when the kids lane wants a calm, breath-controlled, screensaver-grade piece — or fold the breath detector into a larger wind/weather instrument.

---

### 301-mirror-canon-phase — Steve Reich phasing performed by copies of your own body `[banked seed — cycle 303 DEEP sibling, build-reviewed · = the planned CYCLE-2 deepening of the 302 Mirror-Canon thread]`

**Banked from cycle 303 (adult DEEP fire, 2 approaches — lost narrowly to `302-mirror-canon-round`).** Fully built (single-file `page.tsx`, ~1112 lines, + README) and build-reviewed (tsc + ESLint clean per builder), then moved out per the curate rule (non-winners are text seeds, never half-built folders). This is the **designated cycle-2 deepening** of the Mirror-Canon thread, not a separate piece — revive it as a **Round ⇄ Phase mode toggle inside `302`**.

- **Question**: "What if you could sing Steve Reich's *Piano Phase* with a choir of your own past selves — record a body-phrase, watch it loop back as a silhouette-ghost in a wooden mirror, and layer performances until the loops slowly drift OUT of alignment?"
- **Tags** (same thread as 302): INPUT = camera/body (MediaPipe Pose Lite via webpackIgnore CDN import, ghost fallback) · OUTPUT = matte wooden mirror (Canvas2D source-over, no glow) · TECHNIQUE = Klatt formant choir + **multi-layer PHASING canon memory** · VIBE = adult, embodied, meditative-ritual.
- **The differentiator (vs 302's locked round)**: each committed layer plays at a slightly different loop rate (`length × (1 + N·0.012)`), so up to 4 past-yous **drift in and out of phase** with one another and the live you over ~30–60 s. A HUD shows layer count + a **phase-spread indicator**. The piece **never repeats** and is genuinely different at minute 2 than at second 5 — the jury's evolution/state quality (275-memory-loom) made literal, and the antidote to the loop/drone form.
- **What was promising**: it's the more *surprising* of the two ("I didn't know we could do that" — Reich phasing by your own body in a Rozin mirror) and the strongest on pure evolving-state depth. The phasing engine is fully implemented and the ghost fallback auto-commits two layers so the drift demos itself hands-free.
- **Why it didn't win (vs the round)**: the locked **round** (302) reads more legibly as "a canon of past-yous" in the actual 06:30 phone-review context (especially in ghost mode, where phasing-drift risks reading as a bug rather than intent), adds live **conduct** controls (mute/solo = stage fitness, a Karel priority), and was the only one the builder full-`next build`-verified. Phasing is the natural *second* layer once the round is legible — hence banked as cycle 2.
- **To resurrect**: recover `301-mirror-canon-phase/page.tsx` from cycle-303 git history (or `/tmp` at fire time) and fold its phasing playback + phase-spread HUD into `302` behind a Round⇄Phase toggle. **Ambition**: ≥3-subsystems(#2) + named-reference(#3: Reich/Rozin/Oliveros/LUMIA) + multi-cycle-commitment(#4) = 3 of 5. Refs: **Steve Reich, *Piano Phase***; **Daniel Rozin, *Wooden Mirror***; **LUMIA** (arXiv:2512.17228).

---

### 309-kids-echo-duet — trade phrases with a creature that remembers your notes `[banked seed — cycle 308 kids WIDE explorer, build-verified, lost to 311-kids-music-box]`

**Banked from cycle 308 (kids WIDE fire, 3 explorers).** Fully built + ESLint/tsc-clean per builder (page.tsx + audio.ts + response.ts + README; folder moved to /tmp per the curate rule — non-winners are text seeds, never half-built folders). The most direct implementation of **RESEARCH §308** (reflexive interaction).

- **Question**: "What if a ~4yo (can't read) could trade musical phrases with a friendly springy creature that LISTENS, REMEMBERS, and answers back in the child's own style — a duet that grows out of what the child just played?"
- **Tags** (clean diversity dodge): INPUT = touch (6 big colored pads) · OUTPUT = Canvas2D + DOM springy creature (no WebGL shader) · TECHNIQUE = **reflexive interaction / phrase-memory + response generation** · VIBE = warm kids duet.
- **How it works**: clear *your turn / my turn* state (green 👉 / violet 🎵, color+icon led, no reading). Child taps a phrase; on a 1.5s pause or a big "Done" button the creature replies with a tasteful transform of the child's recent notes — **echo** (biased early so the child clearly hears their own notes given back), **reorder** (rotation), **extend** (echo + 1–2 note Markov tail), **octaveTail** (lift the end up an octave), or **motifWeave** (splice an earlier motif so old material recurs). `DuetMemory` (response.ts) holds a rolling note buffer + most-recent phrase + first-order Markov map + a motif stash; seeded per turn so it's reproducible, never random-feeling. Scale: **Lydian hexachord on C** (C D E F# G A — NOT pentatonic). Soft mallet/bell voices + convolver reverb + limiter.
- **What was promising**: it's the tightest chain to today's named research (Pachet *Continuator* 2002 + Addessi *MIROR* reflexive interaction) and the most faithful follow-up to the JURY-flagged `298-echo-friend` lead. The audible "the creature remembered what I played" moment is genuinely different from the no-fail wash.
- **Why it didn't win**: it's a Canvas2D-creature-with-pads piece — the lab's over-represented form, shared with its sibling 310 — and its magic only appears *after* the child takes a turn (weaker at-a-glance self-demo than the winner's auto-spinning box). Revive when the lane wants a turn-taking/duet piece; deepen toward higher-order Markov / true phrase-segmentation (closer to the real Continuator) + visible floating "memory" motif bubbles.

---

### 310-kids-sing-back — Simon-style growing memory game with real-but-kind right/wrong `[banked seed — cycle 308 kids WIDE explorer, build-verified, lost to 311-kids-music-box]`

**Banked from cycle 308 (kids WIDE fire, 3 explorers).** Fully built + ESLint/tsc-clean per builder (page.tsx + audio.ts + game.ts + README; folder moved to /tmp). The most literal answer to the JURY's "the child can make something *wrong* and fix it" clause.

- **Question**: "What if a ~4yo (can't read) played a memory game where a creature (Pip) sings a melody that GROWS by one note each round, the child echoes it on big colored pads, RIGHT grows the song + celebrates, WRONG is gently re-sung (no punishment) — the lab's first kids piece with genuine right/wrong consequence?"
- **Tags** (clean diversity dodge): INPUT = touch (4 big quadrant pads) · OUTPUT = Canvas2D (creature + pads + confetti) · TECHNIQUE = **growing-sequence memory game + match detection** (Simon lineage) · VIBE = warm encouraging kids game.
- **How it works (game.ts)**: Pip sings the current sequence (lights pads in order); child echoes. Full correct echo → dance + confetti + rising fanfare → sequence **grows +1** and Pip sings the new longer phrase (by round 5 it's a real little tune the child built). Wrong tap → no buzzer/game-over: Pip head-tilts sympathetically, a soft 2-note "oops" plays, same phrase re-sung. **Generous**: 2 misses on a >2-note sequence gently shortens it (`registerMiss → shortened`) so a 4yo never gets stuck. Self-demos: sings round 1 immediately on Start. Scale: **D-major triad + octave** (D F# A D' — NOT C-major-pentatonic). Mallet/bell voices + convolver reverb + limiter.
- **What was promising**: the ONLY candidate with literal "make something wrong and fix it" — exactly JURY #2's first option, the cleanest break from the no-fail-noodle rut. Warm, legible, strong at-a-glance self-demo. Named refs: **Simon** (Milton Bradley, 1978) + **Kodály** echo-singing.
- **Why it didn't win**: a Canvas2D-creature-with-pads piece (over-represented form, shared with sibling 309); the winner's persistent 3D composition machine was the bigger/more-diverse concept per Karel's "massively bigger" mandate. **Strong ship-ready backup** — revive next kids cycle as the consequence/right-wrong lane (pairs naturally with the winner's persistence/memory lane). Deepen: per-pad shapes for color-blind accessibility, a "replay so far" hint tap, milestone rewards, formant "humming" voice for Pip.

---

### 312-kids-sing-back — Simon-grows echo-singing with a creature "Pip" + kind right/wrong `[banked seed — cycle 310 kids WIDE explorer, lost to 313-kids-tone-tower]`

**Re-explored cycle 310 (kids WIDE, 3 explorers); a re-build of the cycle-308 banked `310-kids-sing-back`.** The literal answer to JURY #2's "make something wrong and fix it." Folder moved to `/tmp` per the curate rule (non-winners are text seeds, never half-built folders).

- **Question**: "What if a ~4yo (can't read) played a memory game where a creature (Pip) sings a melody that GROWS +1 note/round, the child echoes on big colored pads, RIGHT grows the song + celebrates, WRONG is gently re-sung (no punishment)?"
- **Tags** (clean diversity dodge): INPUT = touch (4 big quadrant pads ≥96px) · OUTPUT = Canvas2D (creature Pip + pads + confetti) · TECHNIQUE = **growing-sequence memory + match detection** (Simon lineage) · VIBE = warm encouraging game. Scale: **D-major triad + octave** (D4 F#4 A4 D5 — NOT C-pentatonic).
- **How it works** (`game.ts`): Pip sings the sequence (pads light in order); child echoes; full correct → dance + confetti + rising fanfare → sequence grows +1 → Pip sings the longer phrase. Wrong tap → Pip head-tilts, soft 2-note "oops", same phrase re-sung. Generous `maybeShorten` (after 2 misses on length>2, drop a note, never below 1). Self-demos round 1 on Start. Always-safe limiter chain; synthesized convolver reverb. Refs: **Simon** (1978) + **Kodály** echo-singing + JMIR Serious Games 2026.
- **Why it didn't win** (cycle 310): (1) it shipped a **real production-build error** — `Cannot access 'G' before initialization` (a module-init TDZ bug `tsc` passes but Next's build catches — **fix this on revival**, likely a const referenced before its declaration at module scope in `audio.ts`/`game.ts`); (2) it's the **Canvas2D-creature-with-pads form** the JURY flagged as over-represented, shared with sibling 314 — the winner 313 was the only candidate that broke it. **Strong ship-ready backup once the TDZ bug is fixed** — the cleanest literal "right/wrong, kindly." Deepen: per-pad shapes for color-blind accessibility, a "replay so far" hint tap, milestone rewards, formant "humming" voice for Pip.

---

### 314-kids-echo-duet — trade phrases with a creature that remembers + answers in your own style `[banked seed — cycle 310 kids WIDE explorer, lost to 313-kids-tone-tower]`

**Re-explored cycle 310 (kids WIDE, 3 explorers); a re-build of the cycle-308 banked `309-kids-echo-duet`. Build-clean this time** (tsc + ESLint clean; page.tsx + audio.ts + memory.ts + README). Folder moved to `/tmp`. The most faithful Continuator/MIROR reflexive-interaction homage and the tightest chain to the §308 research.

- **Question**: "What if a ~4yo could trade musical phrases with a springy creature that LISTENS, REMEMBERS, and answers back in the child's OWN style — a duet that grows out of what the child just played, where old motifs recur so the child hears the creature 'remembered'?"
- **Tags** (clean diversity dodge): INPUT = touch (6 big colored pads, 110px) · OUTPUT = Canvas2D + DOM springy creature (no WebGL shader) · TECHNIQUE = **reflexive interaction / phrase-memory + style-aware response generation** (rolling buffer + first-order Markov + motif stash) · VIBE = warm playful duet. Scale: **Lydian hexachord on C** (C D E F# G A — raised 4th, NOT pentatonic).
- **How it works** (`memory.ts`): clear *your turn / my turn* (green 🟢👉 / violet 🟣🎵, color+icon led, no reading). Child taps a phrase; on a ~1.5s pause or a colored ✓🎵 "done" affordance the creature replies via seeded-RNG strategy — **echo** (biased early), **reorder**, **extend** (echo + Markov tail), **octaveTail**, or **motifWeave** (splice an *earlier* stored phrase — the "it remembered!" moment, triple-signalled: an amber 💫 memory-bubble, a flashing "it remembered!" badge, the creature audibly replaying the old motif). Idle self-noodling + always-on drone keep it alive. Limiter chain + convolver reverb. Refs: **Pachet *Continuator*** (2002) + **Addessi *MIROR*** + JMIR 2026.
- **Why it didn't win** (cycle 310): it's a **Canvas2D-creature-with-pads piece** — the over-represented form the JURY flagged (13/15 to a screen), shared with sibling 312; the winner 313's *architectural* tower-consequence broke that form and was the bigger/more-diverse concept. Its magic also only appears *after* the child takes a turn (weaker at-a-glance self-demo). **Build-clean ship-ready backup** — revive when the lane wants a pure turn-taking/duet piece; deepen toward higher-order Markov / true phrase-segmentation (closer to the real Continuator) + lengthen the motif stash so "it remembered!" unlocks sooner.

---

### helios-stream — the Sun as a clinical Ikeda data-field (DEEP sibling of 314-solar-wind, cycle 311) `[build-explored, banked]`
The **clinical / data.matrix reading** of the same live-space-weather concept that shipped as `314-solar-wind`. Same three keyless CORS-open NOAA SWPC feeds (plasma speed/density/temp · mag bz_gsm/bt · planetary Kp), fetched client-side, defensively parsed by header-name, bundled-sample fallback. Where 314 is a warm aurora drone, this is **white-on-near-black Ikeda**: a scrolling monospace matrix + thin plotted channel lines on a graticule, sonified by a genuinely different engine.
- **Tags** (clean diversity dodge): INPUT = live external API/network (no sensor) · OUTPUT = Canvas2D Ikeda data-field (mono text + plotted channels, NOT a raw fragment shader, NOT warm-aurora) · TECHNIQUE = **granular cloud + inharmonic spectral comb** (NOT a pad) · VIBE = adult clinical/scientific-precision.
- **How the audio works** (`audio.ts`, build-explored): two layered engines — (1) a **granular cloud** of short windowed filtered-noise grains scheduled by a look-ahead clock: grain RATE ∝ density, grain pitch/centroid ∝ speed, grain duration+noisiness ∝ temperature → textural not melodic; (2) a **spectral comb** of 9 sine partials on an INHARMONIC stretched series `[1, 2.07, 3.16, 4.29, 5.51, 6.78, 8.12, 9.55, 11.1]` where southward Bz spreads the partials so they beat ("stressed field"), northward settles them; fundamental tracks speed, partial gain tracks Bt/Kp. Brick-wall limiter + modest master so a storm can't blast. Live + "Scan last 24h in ~3 min" modes.
- **Why it didn't win** (cycle 311, DEEP): 314 was the more complete deliverable (315's README came back empty) AND the **aurora-curtain visual is a fresher form for the lab**, which already has an Ikeda data-field lineage (`117-data-cosm`); 314's warm "window the Sun plays through" also aligns with Karel's loved immersive cluster. **Build-explored, ready to revive** when the lane wants the cold/granular counterpart — fold in: a real spectrogram of the granular cloud, per-channel mute/solo so you can isolate "the sound of the density," and a true Ikeda test-pattern strobe gated by Kp.

---

## Cycle 312 banked seeds (kids WIDE — 2 non-winners, build-verified, ready to revive)

### 316-kids-seed-garden — a kids' generative *Bloom* that grows while you're away `[queued — strong, near-ship]`
**Question**: what if a child planted a musical garden that keeps GROWING and SINGING after they stop touching it, and is taller when they come back tomorrow?
**What was built (build-clean, tsc+eslint=0)**: full-screen Canvas2D soil+sky; tap the soil to plant a seed → dirt-poof + "plink"; each plant grows seed→sprout→stem→leaf→bloom over ~40s and SINGS a soft triangle/sine voice (gain ramps with maturity) locked to **A Dorian** across 6 zones; mature blooms self-seed nearby so the garden spreads with no input; a 4-min day/night sky cycle + sinusoidal breeze keep it evolving; state persists to `localStorage` every 8s with **wall-clock age accumulation** — it literally keeps growing while the browser is closed. Auto-plants 3 seeds on first load. Refs: Toshio Iwai *SimTunes/Electroplankton* + Brian Eno *Bloom*. `ambition: #2 (≥3 subsystems) + #3 (Iwai/Eno)` (arguably #1 — first long-form evolving stateful kids piece).
**Why it didn't ship this cycle**: it's the most "massively bigger" of the three, but its tags (touch INPUT + Canvas2D OUTPUT + **persistence**) re-tread the lab's three most-recent ships (311 music-box = touch+persistence; 313 tone-tower = touch+Canvas2D). 317's camera modality + novel technique won on diversity/surprise. **Revive**: ship as-is on a future kids fire (folder was complete), OR promote to a DEEP adult long-form cycle (it's the lab's best long-form-generative skeleton — add seasons, cross-plant harmony resolution, a real-clock "what grew overnight" summary on return).

### 315-kids-sing-up — sing to make the balloon climb `[queued]`
**Question**: what if a 4-year-old could SING to make something climb, and the world only rises when their voice finds the right note?
**What was built (build-clean per builder)**: tap START → mic via getUserMedia; real-time **autocorrelation pitch detection** (parabolic-interpolated, 4096-window, RMS gate, EMA α=0.18, clamped G3–E5) drives a hot-air balloon's height on a Canvas2D sunrise sky; a glowing target band shows the pitch to match — hold inside it ~1s → balloon pops up a step of the **D major hexachord**, a chime sounds, a star is collected; reach the summit → the sequence of notes you sang replays as "your song." No fail (wrong pitch just hovers). Degrades to a synthesized auto-demo + pointer-drag fallback if no mic. Refs: **Orpheus** (Karuthedath et al., HCI in Games / ACM 2021) + Kodály/Curwen hand-signs. `ambition: #2 + #3`.
**Why it didn't ship**: lowest ambition (2/5 — autocorrelation pitch detection already exists in `13-piano-canvas`, so no novel-technique claim) and sing-along is a well-trodden genre → lower surprise than 317's room-as-instrument. **Revive**: pairs naturally with 317 as a "voice" sibling on a future kids fire; or deepen — vary win-song playback timing by how long each note was held (more expressive), lower the autocorrelation clarity threshold for children's voices.

---

## Cycle 331 banked seeds (adult WIDE — 2 non-winners, build-clean per builder, ready to revive)

### 357-euclidean-orrery — a self-playing polyrhythmic clockwork of Euclidean rhythms `[queued — strong, near-ship]`
**Question**: what if you could SEE and HEAR Euclidean rhythms phasing against each other like an orrery of clockwork rings?
**What was built (build-clean per builder; route prerendered)**: five concentric rings, step counts `16,12,9,7,5`, each carrying a Euclidean rhythm **E(k,n)** via a clean **Bjorklund** implementation (defaults E(5,16) Bossa clave, E(4,12), E(4,9), E(3,7), E(3,5)). A sweeping playhead wedge fires a JI-tuned struck voice per onset (outer = low/drum, inner = high/sparkle), always-on drone bed + brick-wall limiter, sample-accurate lookahead scheduler. Rings cycle at coprime lengths so full re-alignment recurs only every `lcm = 5040` pulses — slow Reich-*Piano-Phase* drift, genuinely different at 0:30 vs 3:00; the central hub brightens on phase-align. Raw-WebGL2 fragment shader draws all rings/beads/playheads from uniform arrays (Ikeda-matte, film-grain not bloom). Autoplays on one tap; optional tap-a-ring-to-cycle-k + tempo slider. Files: `page.tsx`, `euclid.ts`, `audio.ts`, `gl.ts`, `README.md`. `ambition 3/5`: #1 (Euclidean/Bjorklund — grep-verified lab-first, 0 prior) + #2 (≥3 subsystems) + #3 (Toussaint 2005 *"The Euclidean Algorithm Generates Traditional Musical Rhythms"* · Reich phase music).
**Why it didn't ship this cycle**: lost curation to `358-beat-mirror` on two axes — (a) **legibility/Karel-priority**: 358 directly serves "live-performance fitness" (his stated #3) and its internal-groove demo is self-verifying (known answer = 112 BPM), whereas 357's payoff (slow 5040-pulse phasing) is the *least* visible on a 06:30 first-open; (b) **renderer diversity**: 357 is raw-WebGL2 (3× recent, warming) where 358's three.js is fresher (1×). **Revive**: ship as-is on a future adult fire (folder was complete) — it's the lab's cleanest generative-rhythm skeleton. Deepen: let rings be re-tuned (drag radius → pitch), add a "scrub to alignment" control that fast-forwards toward the next phase-align so the slow payoff is reachable in seconds, and an export of the current 5-ring pattern as a named world-rhythm when it matches one (tresillo/clave/bembé).

### 359-tonnetz-walk — walk through harmonic space on the Euler Tonnetz `[queued — strong, near-ship]`
**Question**: what if you could WALK through harmonic space and hear pure triads as architecture, seeing exactly which chord you're standing in?
**What was built (build-clean per builder; route prerendered, 4.9 kB)**: a playable, self-touring **Tonnetz** — pitch-class lattice `pc(q,r)=(7q+4r)mod12` (fifths × major-thirds axes); every triangle is a triad (up=major, down=minor). Autoplays a smooth tour via **neo-Riemannian P/L/R transformations** (each crosses one edge → holds 2 of 3 notes, slides the third = smoothest voice leading); the highlighted triangle glides cell-to-cell and the hero serif readout names each chord. JI triad synth: 3 sustained pad voices with octave-folded targets so common tones literally hold while one voice slides (pure 1/1, 5/4 or 6/5, 3/2), always-on sub drone + limiter. **DOM/CSS renderer** — positioned note-label divs + rotated 1px edge mesh + a `clip-path: polygon` active triangle that glides via CSS transitions (no SVG, no canvas). Optional steer: P/L/R buttons + arrow keys (←=L →=R ↓=P), Space toggles autoplay. Files: `page.tsx`, `tonnetz.ts`, `audio.ts`, `README.md`. `ambition 3/5`: #1 (Tonnetz/neo-Riemannian navigation — lab-first) + #2 (≥3 subsystems) + #3 (Euler *Tentamen* 1739 · Riemann / Richard Cohn *Audacious Euphony*).
**Why it didn't ship this cycle**: closest runner-up; lost to 358 narrowly. 358 was the stronger *surprise + tool* ("it found my tempo" is a magic moment for a performing pianist); 359's explicitly-flagged risk is the clip-path-triangle pixel fit over its three nodes (unverified visually). **Revive**: a very strong next-adult build (it's the most legible *harmony* piece the lab has — the perfect complement to 358's *rhythm* legibility, and to the WFC `353` legibility line). Deepen first: browser-verify the triangle alignment across viewports; let the visitor drop a seed chord and watch the shortest P/L/R path to a target chord animate (voice-leading pathfinding); optionally map his real *Welcome Home* chord changes onto the lattice so he watches his own progressions move as geometry (the legible his-music answer the jury asked for).

---

### 372-kids-blow-garden — grow a singing garden with your BREATH `[queued — build-verified, near-ship; banked cycle 336]`
**Question**: what if a 4-year-old could grow a calm, singing garden just by *blowing* at the phone — almost eyes-free?
**What was built (build-reviewed clean; WIDE sibling of the 336 winner, `rm -rf`'d from tree, code reconstructable from this spec)**: blow gently toward the mic → a **breath-envelope detector** (`breath.ts`) turns sustained airflow into a smooth control signal that grows the nearest flower; at full bloom it locks and sings a sustained **D-Dorian** note (lower flower = lower note), stacking into a gently humming chord over an always-on D+A drone. The core technique is **RMS × spectral flatness (Wiener entropy)**: blowing is broadband/noisy (flatness ≈1), a hum/sung note is tonal/spiky (flatness ≈0), a clap is a transient — so `smoothstep(RMS) × smoothstep(flatness)` cleanly gates *blowing* from talking/singing/clapping, smoothed into a fast-attack/slow-release envelope. Dusk WebGL2 garden (`garden-gl.ts`) that warms and fills with bloom; `garden-audio.ts` = drone + airy breath whoosh + slow-attack flower voices + limiter. One identical envelope drives mic-breath, press-and-hold ("blow"), and a hands-free auto-demo. Files: `page.tsx`, `breath.ts`, `garden-audio.ts`, `garden-gl.ts`, `README.md`. **Ambition 2/5**: never-used-technique(#1, spectral-flatness breath discriminator — lab-first input) + named-reference(#3, Akai EWI / breath controllers · spectral flatness in birdsong/MIR).
**Why it didn't ship cycle 336**: the **least compositional-memory** of the three (a continuous toy — the breath sibling's recurring weakness across cycles), and the "screen-light/eyes-free" claim is soft. **Revive**: it's the strongest answer to the JURY's standing **"second off-screen / eyes-free piece"** provocation, and the calm/contemplative niche Resonance owns — ship as the next kids calm-lane build; tune the flatness/RMS thresholds on a real device first (a gentle child's breath vs. their speech).

### 373-kids-firefly-path — compose a melody by laying a path of glowing stones `[queued — build-verified, near-ship; banked cycle 336]`
**Question**: what if a 4-year-old could compose a little tune by laying a PATH of stones, and a firefly sang it back forever, growing as they add more?
**What was built (build-reviewed clean; WIDE sibling of the 336 winner, `rm -rf`'d from tree, code reconstructable from this spec)**: tap anywhere on a dark dusk meadow to drop a glowing stepping-stone; a firefly continuously hops stone→stone in placement order, plucking each note as it lands, looping forever; each new stone **appends** to the loop so the song GROWS with no transport reset (seamless by construction). A stone's **vertical position = pitch**, snapped to **D-Dorian** over ~2 octaves, so the shape of the path you draw IS the melody; soft **Karplus-Strong** pluck + D+A drone through a limiter. The transport playhead (the firefly) is eased along an ease-in-out arc locked to the audio beat phase. Auto-demo seeds a gentle 6-stone path after ~3.5 s so it plays itself; clear-path control outside the play area; mouse = touch. Files: `page.tsx`, `path-audio.ts`, `meadow-gl.ts`, `README.md`. **Ambition 2/5**: ≥3-subsystems(#2, sequence transport + Karplus synth + WebGL2) + named-lineage (the loved `169-kids-marble-run` "lay a track, watch it play"). The **sequence record-and-replay memory** is the kids-lane memory/consequence the jury wants.
**Why it didn't ship cycle 336**: **touch** is the jury's over-represented kids INPUT (the `350-kids-bump-along` local minimum), and Karplus-Strong already exists at `105-pluck-field`. **Revive**: it's the cleanest *compositional* touch toy the lab has (genuine accumulating memory, NOT a poke-toy) — a strong rebuttal-by-execution to "touch kids pieces are shallow"; ship when the rotation wants a touch melody-maker.

> **Number-reuse note (cycle 336):** the numbers 372/373 above are the as-built labels (no folders on disk now — banked text seeds). Also: cycle 335's banked `371-tonal-journey` seed (IDEAS §335) now collides with the shipped `371-kids-clap-along` folder — **renumber the tonal-journey seed on revival.** Future pre-allocation should count from the max committed folder (now 371) and skip any banked label numbers.

---

## Cycle 337 banked seeds (adult DEEP — 2 non-winner *approaches* to "The Accompanist", build-verified clean, ready to revive)

> These are the two losing **algorithms** from the DEEP-3 score-follower fire (winner shipped: `375-tempo-canon`, online DTW). All three follow the same concept — *an accompanist that plays the bass+chords in sync with YOUR rubato through Beethoven's "Ode to Joy"*, driven by a built-in baked rubato demo / computer-keyboard / Web MIDI (NO mic, dodging the JURY ban), self-verifying with zero hardware the way `358-beat-mirror` does. The winner's README lists both of these as its **"next-cycle deepening"** directions. Numbers 374/376 are as-built labels (no folders on disk now — `rm -rf`'d, code reconstructable from these specs + the winner's shared structure).

### 374-the-accompanist — HMM / forward-algorithm probabilistic note-event follower `[queued — strong, the natural cycle-2 deepening]`
**Question**: what if the accompanist tracked you with a *belief distribution* over score positions — so wrong, extra, and missed notes never derail it — and showed you its confidence?
**What was built (build-clean, exit-0 in the 3-up diagnostic build)**: an **HMM-style online forward estimator** (`follower.ts`) over discrete score states (one per melody note). Per played note: **predict** via a transition kernel (advance 0.80 / stay 0.10 / skip 0.08 / skip2 0.02), **update** by pitch-observation likelihood (exact 1.0 / octave 0.45 / step 0.18 / third 0.06 / **non-zero floor 0.02** = robustness, belief never collapses), **normalize** (underflow-guarded). Committed position = argmax(belief); a smoothed expectation eases the cursor; **confidence = belief mass at the committed state** (a meter the others lack). Online tempo = EMA-smoothed IOI (40–220 BPM); the accompaniment clock is anchored to the committed note's score-time and extrapolated forward at the current BPM between notes. Visual: a raw-**WebGL2 "score river"** piano-roll (reactive shader bg + instanced note-blocks, pulsing cursor, teal matched / rose unmatched hits). Files: `page.tsx`, `score.ts`, `follower.ts`, `audio.ts`, `gl.ts`, `README.md`. **Ambition 3/5**: #2 (≥3 subsystems: input layer + HMM follower + Web-Audio accompaniment + WebGL2 river) + #3 (The ACCompanion arXiv:2304.12939 · Antescofo) + #4 (multi-cycle: the probabilistic core the elastic-dynamics-following cycle wants).
**Why it didn't ship**: two reasons. (a) **Legibility/diversity** — its score-river visual is the lab's most *familiar* form (close to existing `24-piano-roll` / `13-piano-canvas`), where `375`'s **warping path** is a genuinely fresh, more-legible alignment picture and a better answer to the JURY's "stop relocating the screen-viz" complaint. (b) **Surprise** — "watch the diagonal bend as you rush" beats a piano-roll cursor at the 06:30 glance. **Revive**: this is the **strongest cycle-2 deepening of the `375` thread** — the HMM belief is the right substrate for the ACCompanion's *expressive* following (dynamics + articulation), and the **confidence meter** is the missing legibility readout. Fold the HMM follower in behind a DTW/HMM toggle (Matchmaker's exact comparison), or ship standalone with the confidence field as the headline.

### 376-the-prompter — cue / anchor finite-state-machine follower (robust to wrong notes) `[queued — strong, the "live-performance reliability" take]`
**Question**: what if the accompanist forgave genuinely messy playing — wrong notes, ornaments, hesitations — by committing *only at musical cues*, like a stage prompter waiting in the wings for each line?
**What was built (build-clean; a build-time simulation against its own demo proved 8/8 cues fire correctly)**: a **cue-based reactive follower** (`cues.ts`, Antescofo-style) — the score is segmented into **8 phrases**, each ending in an **anchor pitch** (the cue point). Incoming notes accumulate *progress* toward the current anchor (matching lead note = lots, out-of-order = some, unexpected = a tiny nudge it can't break); reaching the anchor (±1 semitone tolerance, ~180 ms **refractory** so a trill can't double-fire) transitions the FSM and **fires that phrase's accompaniment cue** (bass thump + chord stab + a tempo-paced arpeggio sweep, paced to fill the time to the next expected anchor; tempo from anchor-interval). Deliberately trades fine-grained per-note positional accuracy for **robustness** (stated honestly). Its built-in demo bakes in **deliberate wrong/extra notes** (a stray B4, a G4 intrusion, a C#5 ornament) and the log shows them classified `stray`/absorbed while the cues still land on the right anchors (I–V–vi–IV–I–V–vi–I), BPM climbing in the accelerando (~224) and settling in the ritard (~175) — the **strongest verification posture** of the three (a build-time proof, echoing `358`'s known-answer ethos). Visual: raw-**WebGL2 cue track** — phrase tiles flow to a NOW line, the anchor glows/brightens with progress, a **bright violet commit burst** vs. a **dim rose stray flicker** per note. Files: `page.tsx`, `score.ts`, `cues.ts`, `audio.ts`, `gl.ts`, `README.md`. **Ambition 3/5**: #2 (≥3 subsystems) + #3 (Antescofo · The ACCompanion) + #4 (multi-cycle: the robustness layer a real-stage tool needs).
**Why it didn't ship**: it's the most *forgiving* but the **least legible about position** — it intentionally doesn't know *which note* you're on, only *how close to the cue*, so the "watch it follow you" payoff is coarser than `375`'s continuous warping path; and the arpeggio-fill is a generative flourish rather than the literal left-hand part. **Revive**: the right build when the thread turns toward **live-performance reliability** (the `375`/`374` precise followers desync on a fumble; this one survives it) — ship as "The Prompter" robustness mode, or fuse: DTW/HMM for fine position + a cue-FSM safety net that re-anchors when confidence collapses (the production hybrid Matchmaker describes). The wrong-note demo is the keeper feature.

---

## §339 — banked seeds from the cycle-339 DEEP fire (Accompanist thread, cycle 2) — both build-verified, both designated cycle-3/4 deepenings of the winner `380-expressive-accompanist`

The cycle-339 adult fire was a **DEEP-3**: one concept — *an accompanist that follows your **expression**, not just your tempo* — attacked three ways. Winner shipped = **`380-expressive-accompanist`** (follows tempo + **dynamics** + **articulation**; the ACCompanion's central thesis). The two siblings below were build-reviewed (TS + ESLint clean per builder; not authoritatively built since only the winner is built), `rm -rf`'d after banking. They are the natural **cycle-3 deepenings**: fold robustness + anticipation *into* 380's expressive follower (the thread's runway is now expression → +robustness → +anticipation → +Karel's *Welcome Home* score).

### Seed A — `381-resilient-accompanist` (the ROBUSTNESS axis — strongest next-cycle deepening)
**Brief:** "What if the accompanist could survive your MISTAKES — you fumble, skip, or play wrong notes, and it stays with you?" A **dual-follower** architecture answering the ACCompanion's "Reactivity + Robustness" axis and the DTW-vs-HMM comparison in **Matchmaker** (arXiv:2510.10087, Oct 2025). Two alignment engines run in parallel: (1) the online **DTW** (Dixon MATCH 2005, bounded forward-only, confidence = cost-margin between best/second-best window cell), and (2) a lightweight **HMM / forward note-event follower** — a belief distribution over all N score positions, transition probs (advance 0.72 / skip 0.10 / stay 0.12 / back 0.06), pitch-class emission (exact 1.0 / octave 0.55 / nearby 0.05–0.15 / unrelated 0.03), re-seed on belief collapse, confidence = normalized peak posterior. A **confidence supervisor** hands off: trust DTW until its confidence < 0.25 → defer to HMM until DTW recovers > 0.45. Twinkle-in-D melody; the baked demo bakes **four deliberate fumbles** (wrong note, skipped note, 3× hesitation, rushed run) so the resilience is *provable on a phone with no MIDI* — confidence meter dips and recovers, the trusted-follower indicator flips, accompaniment never derails. WebGL2 viz shows the **two followers racing** (DTW teal path + HMM violet belief bars + a confidence band that collapses/recovers at each fumble). **What was promising:** technically the most sophisticated of the three (two followers + supervisor), and it directly solves 375/380's known weakness (a long wrong-note run outruns the bounded DTW window). **Why it didn't win:** its expressive layer is thinner (velocity→dynamics only, no articulation), so it's a robustness *refinement* rather than the headline expressive leap the thread's cycle-2 promised. **To resurrect:** fold the HMM backup + confidence-gated supervisor *behind* 380's expressive follower as a `Solo⇄Resilient` toggle — you get expression-following AND fumble-recovery in one piece. Files were: `score.ts` (Twinkle-D + 4-fumble `makePerformance()`), `dtw.ts` (+confidence), `hmm.ts`, `audio.ts` (velocity→dynamics), `gl.ts` (dual-track + confidence band), `page.tsx` (supervisor + 3 input doors + HUD). Refs: ACCompanion (IJCAI 2023, arXiv:2304.12939) · Matchmaker (arXiv:2510.10087, Oct 2025) · Dixon MATCH (2005).

### Seed B — `382-anticipating-accompanist` (the ANTICIPATION axis)
**Brief:** "What if the accompanist ANTICIPATED you — predicting where your next beat will land so it plays *with* you, like a duet partner leaning in, instead of always a beat behind?" Implements the ACCompanion's **tempo-prediction / online tempo-adaptation** component. Pipeline: online **DTW** (which score position you're at) → a **predictive tempo model** (`tempo.ts`, the star): a **Kalman-style EMA** on inter-onset intervals maintains a beat-period estimate + a phase anchor nudged toward each real onset, then **forecasts the next onset time** = last onset + predicted period × next note's nominal beat count, tracking a rolling prediction error → **anticipatory scheduling** in `audio.ts` (`accompanyAt(harmony, predictedWallMs, dynamics, period)` converts the predicted wall-clock time to the AudioContext clock and passes it as the `when` arg, so the chord is enqueued *ahead* of time and lands *with* you). Ode-to-Joy-in-D; the baked demo bakes a deliberate **abrupt tempo-step at note 10** (≈160→105 BPM) so the prediction-error trace **visibly spikes then re-converges** over 4–5 notes — self-verifiable on a phone with no MIDI. WebGL2 scrolling 4-lane timeline: soloist onsets (amber), accompaniment at predicted times (violet), a prediction-error oscilloscope (red→green as it locks), the DTW slope, and a bright **ghost prediction marker ahead of "now"** showing where it expects your next beat. **What was promising:** the most *musically ambitious* (the felt difference between "chases you" and "breathes with you"), and the ghost-marker viz is a genuinely fresh legibility object. **Why it didn't win:** the anticipation payoff is the **hardest to feel/verify** at a 06:30 phone glance (it's a sub-beat latency effect) and the headline expressive leap was 380's. **To resurrect:** layer the predictive tempo model onto 380 so the *expressive* accompaniment also arrives anticipatorily — combine with Seed A and you have the full ACCompanion (reactive + robust + expressive + anticipatory). Files were: `score.ts` (Ode-to-Joy-D + tempo-step `makePerformance()`), `dtw.ts`, `tempo.ts`, `audio.ts` (`accompanyAt`), `gl.ts` (4-lane timeline + ghost marker), `page.tsx`. Refs: ACCompanion (IJCAI 2023, arXiv:2304.12939) · Dixon MATCH (2005).

---

## §340 — banked kids WIDE losers (both build-reviewed, grep-verified lab-first techniques)

### Seed — `383-kids-coral-garden` (Diffusion-Limited Aggregation — the calmest, most Resonance-toned)
**Brief:** "What if a 4-year-old could GROW a singing coral reef by gently shaking the tablet?" **Shake** (devicemotion accel magnitude = stir intensity) → drifting glowing plankton random-walk through the water and **stick** when they touch the growing coral, accreting into a branching dendritic reef; **each new branch that locks plays one soft note up a D-Dorian scale**, so the coral you grow *is* the song — it never resets, just blooms denser/calmer. **Technique:** genuine **Diffusion-Limited Aggregation** (Witten & Sander, *Phys. Rev. Lett.* 1981) — stuck-particle set + Brownian walkers + stick-radius freeze + spatial-hash neighbour buckets + recorded branch-depth (the screening effect makes real branches, not blobs). **Output:** Canvas2D (matte underwater gradient, caustic shimmer, hue drifts pink→mint by branch depth — a *fresh* renderer, 0× in the last-10). **Tags:** shake INPUT · Canvas2D OUTPUT · DLA TECHNIQUE · kids-underwater-calm D-Dorian VIBE. Fallbacks: pointer-drag "swish" + 3s-idle synthetic breathing current (self-grows hands-free). Files were: `dla.ts` (CoralSim), `audio.ts` (ReefAudio, drone + D-Dorian bells + limiter), `page.tsx` (3 input doors + renderer), `README.md`. **What was promising:** the calmest, most parent-tolerable, most "looks like Resonance" of the three; real accreting *memory* (the jury's kids-lane ask after `350` regressed to a memory-less poke-toy); shake is a fresh input (last tilt/shake kids piece was `360`/`303`). **Why it didn't win:** the *wow* is gentler than 384's chaos→unison emergence; DLA growth is beautiful but less of a single legible "magic moment." **To resurrect:** ship as the next kids fire — it's build-clean and the obvious calm-lane companion to 384's emergence. Ref: Witten & Sander 1981.

### Seed — `385-kids-ant-garden` (ant-colony stigmergy — the most subsystems, the riskiest demo)
**Brief:** "What if a 4-year-old could wave at the camera to drop magic flowers, and a swarm of glowing ants would build singing trails between them?" **Camera frame-difference motion** → a glowing flower (food source) blooms wherever the child moves; a swarm of ants forages from a nest, and via **pheromone deposition + diffusion + evaporation** reinforced nest↔flower **trails self-organize** and then fade when a flower exhausts; **each established trail sustains a soft D-Dorian drone** (strength = trail strength), so the trail network is a slowly-shifting living chord. **Technique:** genuine **ant-colony stigmergy / ACO** — two pheromone layers (HOME/FOOD), sensor-biased (L/C/R) wandering, deposit-on-walk, pickup-at-flower, return-to-nest; **distinct from reaction-diffusion** *and* from `327-physarum-choir`'s slime-mold field (discrete foraging agents, not a continuous trail-field). **Output:** three.js (top-down ortho, pheromone `DataTexture` + shader plane, point ants colored by carrying-state, glow flowers, pulsing nest). **Tags:** camera-motion INPUT · three.js OUTPUT · ant-stigmergy TECHNIQUE · kids-night-garden D-Dorian VIBE. **4 subsystems** (camera + colony sim + three.js + audio) — the ambition-floor #2 piece of the fire. Privacy: camera analysis-only frame-diff, never recorded/stored/uploaded. Fallbacks: tap-to-plant + 3s-idle synthetic flower bloomer (self-organizes hands-free). Files were: `colony.ts` (stigmergy engine + RGBA texture packing), `audio.ts` (drone + per-flower sustained voices + limiter), `page.tsx` (camera + three.js scene), `README.md`. **What was promising:** the most ambitious (4 subsystems, real emergence), and camera input is fresh (1× in last-10). **Why it didn't win:** camera adds a permission step that hurts the 06:30 phone-review fit (mitigated by auto-demo but still); the trail-emergence payoff is *slower* and less instantly legible than 384's sync; and stigmergy sits adjacent to the already-shipped `327-physarum-choir` slime-mold lineage. **To resurrect:** the strongest "AI-pipeline-free camera kids game" — ship once a calmer/faster trail-tuning pass is done, or as the kids camera-lane companion to `368-rainbow-quest`. Refs: Deneubourg et al. 1990 (double-bridge) · Dorigo ACO 1992.

## §342 — banked kids DEEP losers (one concept "a singing DLA coral reef grown by shaking", 3 approaches; winner = 390-kids-coral-tide)

### Seed — `kids-coral-garden` (the CANONICAL directional-DLA take — cleanest, most immersive)
**Brief:** "Grow a singing coral reef by shaking the tablet — and watch it climb up from the seabed toward you." **Shake** (devicemotion jerk = stir) → glowing plankton random-walk *down* with a settling bias and **stick** on contact, accreting a branching dendritic reef that grows **upward** from a seabed; each locked branch rings one D-Dorian note up the scale, depth → scale degree. **Technique:** directional DLA (Witten & Sander 1981 + ACS Omega settling-bias enhancement); spatial-hash buckets, branch-depth tracking. **Output:** full-screen Canvas2D — deep teal→indigo underwater gradient, caustic shimmer, plankton glow (`lighter`), pink→mint coral hue by depth, per-lock "pop" brighten. **Tags:** shake INPUT · Canvas2D OUTPUT · directional-DLA TECHNIQUE · kids-underwater-calm D-Dorian VIBE. Fallbacks: pointer "swish" + 3s-idle breathing current (self-grows hands-free). **What was promising:** the cleanest, most immersive full-screen render and the most parent-tolerable; the directional climb (up from a seabed) is more legible than an isotropic blob. **Why it didn't win:** no *audio* legibility hook — it's the gentle-wow problem that has lost DLA-coral curation three times (323/361/383); 390 fixed exactly this with chord-stacking. **To resurrect:** ship as the calm full-screen companion to 390, OR fold its caustic/pop visuals into 390. Files were: dla.ts, audio.ts, page.tsx, README.md. Ref: Witten & Sander 1981.

### Seed — `kids-reef-glow` (bioluminescent night swarm, size-dependent diffusivity — most mesmerizing)
**Brief:** "Shake to stir a glowing night-ocean of plankton that drift like a living swarm and crystallize into a bioluminescent singing reef." **Shake** → a current sweeps a swarm of glowing plankton with **size-dependent diffusivity** (big = slow lazy drift, small = fast darting) that settle downward and stick; each lock pulses a bioluminescent flash + rings a D-Dorian note (depth → degree). **Technique:** DLA with size-dependent diffusivity (Witten & Sander 1981; ACS Omega realistic-DLA). **Output:** full-screen Canvas2D, near-black ocean, additive `lighter` glow, teal→violet by depth, flash-on-lock blooms. **Tags:** shake INPUT · Canvas2D OUTPUT · size-dependent-DLA TECHNIQUE · kids-bioluminescent-night D-Dorian VIBE. Fallbacks: pointer-drag current + 3s-idle roaming current. **What was promising:** the most *mesmerizing* — the living swarm before the stick is genuinely alive; the size-dependent diffusivity is a real research-driven twist. **Why it didn't win:** the bioluminescent-glow aesthetic sits adjacent to the lab's well-represented cool-glow lineage (firefly-song/glow-bug/ocean-presence), and the swarm payoff is less *legible* than 390's chord-stacking. **To resurrect:** ship as the night-mode glow companion; or graft the size-dependent-diffusivity walkers + additive bloom onto 390. Files were: dla.ts, audio.ts, page.tsx, README.md. Refs: Witten & Sander 1981 · ACS Omega realistic-DLA.

---

## §344 — banked from cycle 344 WIDE (kids listening mirrors; winner shipped = 393-kids-vowel-color)

Cycle 344 ran WIDE: three kids "the machine shows what it heard" mirrors, each a *different* analysis + a different non-GPU renderer + a non-D-Dorian tonal world (JURY 2026-06-07 provocation #6: turn the adult analysis-reflex into a kids toy; bans on WebGL2/three.js OUTPUT, MIDI/touch INPUT, D-Dorian). All three were built clean and folder-isolated. 393 won (freshest research anchor + most-avoided renderer + lab-first formant technique). The two below are build-reviewed and ready to resurrect — both retained in `/tmp/dream-losers/` this fire.

### 392-kids-voice-mirror (banked — the robust pitch sibling)
- **Brief:** child sings → real-time **autocorrelation pitch detection** → a living **SVG ribbon-creature** traces the melody (pitch→y, RMS→width/glow, friendly face at the head) → a warm **5-limit just-intonation choir on G3** sings the recorded contour back. Renderer = inline SVG (no canvas/WebGL). Named ref = **"Visible Speech" sound spectrograph (Potter/Kopp/Green, Bell Labs, 1947)**.
- **Why strong:** the most *reliable* of the three — autocorrelation pitch is robust on any voice (unlike formants), and the "sing → hear your own wobbly hum returned as a real choir" payoff is the most emotionally direct. JI-on-G3 sing-back is a genuine non-D-Dorian tonal world.
- **Why it lost:** pitch detection already exists in the lab (331/341/345), so the *concept* is the most familiar of the three — closest to existing pitch toys (341-star-pair, 322-voice-garden). Lowest surprise; named ref is foundational (1947), not recent.
- **Fix-first to resurrect:** swap autocorrelation for YIN/pYIN to kill plosive/breathy glitches; add the "conduct multiple stored ribbons at once for layered choir" and "two creatures = sibling/parent harmony" ideas from its README. Files in `/tmp/dream-losers/392-kids-voice-mirror/` (page.tsx 607 / pitch.ts / synth.ts).

### 394-kids-sound-monster (banked — the most robust + most legible runner-up; STRONGEST resurrect)
- **Brief:** child's voice **timbre/dynamics** (RMS loudness + spectral centroid brightness + ZCR roughness) → a **morphing SVG blob-monster** (soft/dark → round/cool/calm; loud/bright → spiky/hot/excited; size=loudness, spikiness=brightness) → **purr↔roar sing-back** (JI C3 4:5:6, lowpass cutoff tracks brightness). Renderer = morphing inline SVG path (fbm-perturbed Catmull-Rom). Named ref = **Bouba/Kiki cross-modal sound-symbolism (Köhler 1929; Ramachandran & Hubbard 2001)**.
- **Why strong:** the most *robust* analysis (loudness+centroid are trivially reliable on a high child voice — exactly where 393's formant detection is weakest) and the most *legible* magic moment (round↔spiky creature locks in within ~50ms; the same "instant legible payoff" the JURY praised in 384-firefly). Cross-modal sound-symbolism is lab-first. A near-tie with 393.
- **Why it lost:** named ref is foundational (1929), not recent — so it doesn't pay the JURY's freshness debt the way 393's AURORA (2026) does; and SVG output is a renderer the lab has touched, where 393's pure-CSS color field is the more radical rut-break. On reliability alone it arguably should have won — noted honestly.
- **Fix-first / how it deepens 393:** **fold 394's centroid-robustness lesson into 393** — when formant classification confidence is low (high kids voices, /i/ vs /u/), fall back to a brightness→hue mapping so the color *always* responds even when the vowel is uncertain (rescues 393's one real weakness with 394's one real strength). Standalone resurrect: add autocorrelation pitch so the purr/roar transposes to the child's own fundamental; SVG→PNG "save my monster" snapshot. Files in `/tmp/dream-losers/394-kids-sound-monster/` (page.tsx / analysis.ts / blob.ts / synth.ts).

## §345 — banked from cycle 345 DEEP (spatial-audio, one off-screen concept; winner shipped = 394-soundfield-room)

Cycle 345 ran DEEP on JURY prov #5 (the untouched off-screen/spatial-audio/haptic shelf): three orthogonal spatial-audio attacks on one concept — "an eyes-closed room you navigate by turning your head, headphones on." All three built clean + folder-isolated, all dodge every jury ban (device-orientation INPUT not MIDI/touch; binaural-audio + dim non-WebGL radar OUTPUT; just-intonation VIBE not D-Dorian). 394 won (true coherent-field ambisonics = the genuine lab-first leap past existing per-source binaural pieces, + the tightest/freshest research chain). The two below are build-reviewed and ready to resurrect — both retained in `/tmp/dream-losers/` this fire.

### 396-soundwalk (banked — STRONGEST resurrect / the designated 394 cycle-2 deepening)
- **Brief:** an eyes-closed binaural room you move THROUGH, not just turn inside. 6 fixed-position HRTF `PannerNode` voices on an E2 just-intonation overtone palette scattered on a plane; the virtual listener **drifts forward continuously** while device-orientation yaw (or drag) sets the heading — so voices approach, bloom (gain swell + arpeggio shimmer <3.5m), and recede behind you. **Lab-first haptic leg:** `navigator.vibrate()` fires a voice-specific rhythmic pattern on close approach (<5m) — cross-modal sound+touch embodiment. Auto-pilot waypoint demo tours all voices hands-free; drag-to-steer + rose-notice fallbacks. Files: `page.tsx` 383 / `synth.ts` 262 (SoundwalkSynth, DynamicsCompressor limiter, triggerBloom) / `walk.ts` 287 (WalkEngine — locomotion, orientation/drag/auto-demo heading, proximity events) / `map.ts` 114 (string-built top-down SVG map). Named ref = **Janet Cardiff audio walks** + W3C Web Audio spatialization + W3C Vibration API.
- **Why strong:** the lab's **first haptic output** (a genuinely new sensory modality, grep-clean) and the most *embodied* of the three — directly the "haptic" half of jury prov #5 that 394 didn't take. "You walk through the music and *feel* each voice" is the highest-surprise of the slate.
- **Why it lost:** renderer/technique reuse per-source PannerNode HRTF (not a coherent rotatable field, so less lab-first than 394's true ambisonics); named refs foundational, so it pays less of the jury's #5 freshness debt than 394's Jun-2026 ambisonics papers.
- **Fix-first / how it deepens 394:** **this IS the 394 cycle-2 plan** — fold locomotion (translate the listener *through* a true B-format ambisonic field, not just rotate it) + the haptic confirmation into 394. Standalone resurrect: tune the drift speed + proximity thresholds on real ears; add Karel's *Welcome Home* stems as the scattered voices. Files in `/tmp/dream-losers/396-soundwalk/`.

### 395-listener-orbit (banked — the lightweight baseline / fallback path)
- **Brief:** "rotate the AudioListener, not the field" — 6 voices as fixed-position HRTF `PannerNode`s around the origin (A-Lydian just intonation, 220/275/309/330/385/440 Hz, ratios 1/1·5/4·45/32·3/2·7/4·2/1); device-orientation yaw/pitch drives `AudioListener.forwardX/Y/Z` AudioParams via smooth ramps (deprecated `setOrientation` fallback). The browser's built-in HRTF does the binaural — minimal DSP. Inline-SVG radar with a yaw-driven compass arrow; auto-demo sweep + drag fallback. Files: `page.tsx` / `synth.ts` / `orientation.ts`. Named ref = W3C Web Audio PannerNode/AudioListener spec + Google Resonance Audio listener-pose model.
- **Why strong:** the simplest, most-robust path to head-tracked binaural — if 394's hand-rolled 8-speaker decode proves CPU-heavy on mobile, this is the graceful fallback that gets 90% of the effect for 10% of the nodes.
- **Why it lost:** per-source PannerNode HRTF already exists in the lab (7-spatial, 29-scene-spatial), so it's the most *familiar* concept of the three — lowest surprise, foundational ref only.
- **Fix-first to resurrect:** use it as the explicit A/B comparison against 394 ("does a true coherent field actually sound different from rotating the listener?" — a real perceptual question worth a side-by-side). Files in `/tmp/dream-losers/395-listener-orbit/`.

## §346 — banked from cycle 346 (kids WIDE — 2 non-winners; winner shipped = 397-kids-crystal-bloom)

Cycle 346 ran WIDE: three kids pieces, each in a DIFFERENT foreign tonal world × a DIFFERENT non-GPU renderer × a DIFFERENT non-banned input (JURY 2026-06-07 bans: WebGL2/three.js OUTPUT, MIDI/touch INPUT, D-Dorian VIBE; provocations #1 force-a-renderer-you-avoid + #2 foreign-tonal-world). All three were build-reviewed clean and folder-isolated. 397 won (cleanest research→build chain + the expensive #5 recent-research criterion + the under-served breath/calm niche). The two below are build-reviewed and ready to resurrect.

### 398-kids-rainbow-roll — tilt a ball of light around a gamelan courtyard, in PURE DOM/CSS `[banked — cycle 346 kids WIDE explorer; the most literal answer to jury prov #1]`
- **Question:** "What if a 4yo could TILT the tablet to roll a glowing ball of light around a courtyard of gongs — and every gong it bumps rings a shimmering Balinese **slendro** tone?"
- **Tags** (clean dodge of all bans): INPUT = **device tilt** (DeviceOrientation beta/gamma → gravity vector; pointer-drag + auto-demo wandering-gravity fallbacks) · OUTPUT = **pure DOM/CSS** (HTML divs + CSS transforms/box-shadow/keyframe ripples — NO canvas, NO svg, NO WebGL) · TECHNIQUE = 2D gravity physics (velocity + friction + speed-clamp + wall + circle-vs-circle gong collision) + gamelan synth · VIBE = bright/playful, foreign-tonal.
- **The tuning:** Balinese **slendro** — ~5 roughly-equal but non-equal-tempered steps, octave **stretched to ~1208¢**; each gong is two slightly-detuned voices producing the slow beating Balinese musicians call **ombak** ("waves"); soft mallet attack + medium decay; sustained drone so it's never silent; limiter. Sits *between the cracks* of 12-TET so it sounds genuinely non-Western. Ref: Balinese/Javanese gamelan tuning; Colin McPhee, *Music in Bali*.
- **Ambition:** #2 (4 subsystems: tilt physics + DOM/CSS render + gamelan synth + collision) + #3 (named cultural reference) + foreign tonal world + rare renderer (pure DOM/CSS, used ~once in the lab). Build files were: `page.tsx` (DOM courtyard + RAF physics + gravity-source selection + iOS motion permission), `gamelan.ts` (slendro table + inharmonic detuned-pair gong synth + drone + limiter), `tilt.ts` (DeviceOrientation permission + smoothed gravity + liveness check), `README.md`.
- **Why it didn't win:** the purest answer to jury #1 and very fun, but tilt-marble is a familiar lab interaction (cf. loved `169-marble-run`, `384` tilt) and it leans on a *foundational* cultural reference rather than a *recent* one, so it pays less of the #5 freshness debt the jury flagged. **Revive:** ship as the next kids tilt/DOM fire — it's the cleanest pure-DOM/CSS piece the lab has. Reconstructable from this spec (folder `rm -rf`'d; numbers: max committed folder is now 397, so renumber on revival).

### 399-kids-aurora-step — dance at the camera to paint a whole-tone aurora `[banked — cycle 346 kids WIDE explorer]`
- **Question:** "What if a 4yo could DANCE or wave at the camera and their MOTION painted a flowing aurora across the sky while the places they move ring dreamy **whole-tone** chimes?"
- **Tags** (clean dodge of all bans): INPUT = **camera frame-difference motion** (getUserMedia → 12×8 luminance-diff grid; ANALYSIS-ONLY, never recorded/stored/shown/uploaded; phantom-attractor auto-demo) · OUTPUT = **Canvas2D** (additive `lighter`-glow aurora ribbons drifting upward) · TECHNIQUE = frame-diff motion energy per cell → particle spawn + debounced chime trigger (screen height → scale degree) · VIBE = dreamy/floating aurora, foreign-tonal.
- **The tuning:** **whole-tone** scale (6 equal steps, no perfect fifth, no leading tone — the floating Debussy/Impressionist sound), mapped over ~2 octaves; soft chime voices (sine + partials, slow attack, long tail) + a two-note whole-tone pad so it's never silent; limiter. Ref: Claude Debussy / whole-tone Impressionism.
- **Ambition:** #2 (4 subsystems: camera + frame-diff analysis + Canvas2D aurora + whole-tone synth) + #3 (named reference) + foreign tonal world. Build files were: `page.tsx` (Canvas2D render + RAF + camera↔auto-demo orchestration + privacy notice), `motion.ts` (`MotionTracker`: getUserMedia + frame-diff grid), `chimes.ts` (`ChimeEngine`: whole-tone tuning + chime synth + pad + limiter + per-degree debounce), `README.md`.
- **Why it didn't win:** camera-motion→glow is the lab's comfort zone (jury: 13/15 are screen-camera-ish) and Canvas2D additive glow is a well-represented aesthetic — least *differentiated* despite the foreign whole-tone world; camera permission is also the jury-flagged 06:30-phone-review risk (mitigated by a strong phantom-attractor auto-demo). **Revive:** strong as the kids camera-lane companion (pairs with the loved `101-camera-song`/`104-mirror-draw` lineage); or graft its aurora field onto a future motion piece. Reconstructable from this spec (folder `rm -rf`'d; renumber on revival).

## §347 — banked from cycle 347 (adult DEEP — 1 non-winner; winner shipped = 400-soundwalk-room)

Cycle 347 ran DEEP on the spatial-audio thread's cycle 2 — one concept (*walk through the ambisonic room + feel each voice*), two technical attacks. Both build-reviewed clean + folder-isolated. 400 won (audio-first → robust on every device; the genuine 6DoF-translation leap past 394's rotation-only field; richer legible running view for the 06:30 glance). The runner-up below is the stronger *pure-embodiment* concept and is the designated next off-screen / cycle-3 candidate.

### 401-feel-the-room — haptic-LED "metal detector for sound": feel your way to the voices eyes-closed `[banked — cycle 347 adult DEEP explorer; the lab's most genuinely off-screen concept]`
- **Question:** "What if you could find your way through a spatial-audio room with your HANDS — eyes closed — a parking-sensor pulse train quickening toward the nearest voice, audio confirming as you arrive?"
- **Tags** (clean dodge of all jury bans): INPUT = auto-walk homing + drag-to-steer + device-orientation heading (NOT MIDI, NOT touch-as-instrument) · OUTPUT = binaural HRTF + **Vibration-API haptics as the LEAD channel** + a deliberately dim/optional Canvas2D map (NO WebGL/three.js) · TECHNIQUE = path-distance soundfield navigation + a continuous nearest-voice haptic pulse-train (audio→vibrotactile, Sound2Hap-style) · VIBE = ritual/echolocation, just-intonation D-root overtones, screen-optional.
- **The mechanic:** ~6 JI voices at fixed spots. A homing auto-pilot slews heading toward a target voice and steps forward; the nearest voice drives a **continuous `navigator.vibrate` pulse train whose cycle quickens as you near it** (metal-detector / white-cane); arrival fires a distinct triple-buzz + a harmonic bloom, then it retargets the next voice. The whole point is to work **eyes-closed** — the haptic is the primary wayfinding sense, audio the confirmation. Built files were: `engine.ts` (`RoomEngine`: 6 JI voices → amp/LFO → bloom → distance-LP → inverse-distance gain → per-voice HRTF PannerNode → limiter; `update()` re-spatialiser returning the nearest-voice descriptor; `planHaptics` pulse-train mapping; `ARRIVAL_PATTERN`), `page.tsx` (homing auto-pilot + pulse-train scheduler that re-issues vibrate on a cycle-sized interval + dim map with proximity-pulsing target ring as the visual fallback + drag/tilt manual layers + full teardown incl. `vibrate(0)`), `README.md`.
- **Ambition:** same spine as 400 — #1 (haptic output, lab-first) + #2 (≥3 subsystems) + #3 (Google soundfield-navigation · Sound2Hap arXiv:2601.12245 CHI 2026 · Cardiff / white-cane) + #4 (cycle of the spatial thread) + #5 (Sound2Hap, recent).
- **Why it didn't win:** the more surprising/novel *experience* and the most literally off-screen piece the lab has — but its entire thesis (FEEL where to walk) is **invisible/unfelt on a non-vibrating device** (most desktops, iOS Safari), exactly the 06:30-review fragility 400 avoids by leading with audio; and on a phone the auto-walk + audio reads close to 400's. **Revive:** ship as the next dedicated off-screen / haptic-led fire (it directly answers jury prov #5's embodiment gap), OR fold its quickening homing-pulse into 400 as an optional "guide me to a voice" mode. Reconstructable from this spec (folder `rm -rf`'d; max committed folder is now 400 → renumber on revival).

## §349 — banked from cycle 349 (adult DEEP — 2 non-winners; winner shipped = 404-comma-pump)

Cycle 349 ran DEEP on a single fresh foreign-tonal concept — **adaptive / dynamic just intonation** (the lab had only *fixed-ratio* JI: 394/397/400 + the *static* click Tonnetz 37-ratio-lab) — via three approaches: comma-drift (404, won), roughness-pedagogy (405), organic glide-drone (406). All three Canvas2D-only (jury #1), 5-limit JI (jury #2), generative-not-analysis (jury #6), autonomous (no MIDI/keyboard/tap). 404 won on: the biggest *concept* ("music that can never come home"), genuine long-form **stateful** drift (the under-served menu shelf — the cents-from-home counter sinks indefinitely), the strongest "huh" surprise (pure tuning literally can't close the loop), AND an immediate JI⇄12-TET audible payoff. Both seeds below build-reviewed clean + folder-isolated; `rm -rf`'d (max committed folder after this cycle = 404, renumber on revival).

### 405-pure-lock — see AND hear sensory roughness fall to zero (Plomp–Levelt meter) `[banked — cycle 349 adult DEEP explorer; the lab's most legible/pedagogical JI piece]`
- **Question:** "Can you *watch* dissonance vanish? A held chord glides from 12-TET into pure 5-limit JI while a live sensory-roughness meter collapses toward zero as the partials lock."
- **Tags** (clean dodge of all jury bans): INPUT = autonomous chord-cycler + a manual 12-TET⇄JI morph slider + Hold-chord toggle (NOT MIDI, NOT tap-as-instrument) · OUTPUT = **Canvas2D** roughness curve + beating strip (NO WebGL/three.js) · TECHNIQUE = adaptive JI + **Plomp–Levelt sensory-dissonance** computed over all sounding-partial pairs · VIBE = clinical/instructional, foreign-tonal (roots Eb/Ab/F/B/Gb/E).
- **The mechanic:** each chord (Maj/min/dom7/Maj7/min7/sus2) starts every note at its 12-TET freq, then glides ~3s to its pure 5-limit ratio; ~4–6 real harmonic partials per note so the beating is genuine; roughness = Σ over partial pairs of `a1·a2·(e^{-3.5x} − e^{-5.75x})`, `x = (0.24/(0.0207·fmin+18.96))·(f2−f1)` — high under 12-TET mistuning, ~0 when JI locks. Built files: `page.tsx` (624 lines), `tuning.ts`, `roughness.ts`, `audio.ts` (additive partials + limiter), `README.md`.
- **Ambition:** #1 (lab-first roughness meter + first dynamic JI) + #2 (≥3 subsystems: adaptive-tuner + partial-pair roughness engine + additive synth + Canvas2D) + #3 (Plomp & Levelt 1965 · Sethares *Tuning Timbre Spectrum Scale* · Pivotuner arXiv:2306.03873 · Ben Johnston).
- **Why it didn't win:** the clearest *explainer* in the set and the best single-glance see+hear demo, but it reads as a pedagogical instrument rather than a "massively bigger" *experience* — 404's never-comes-home concept is the larger idea. **Revive:** ship as the legible/instructional flagship the jury keeps asking the lab to feed (cf. 358-beat-mirror lineage), or fold the roughness meter into 404 as an optional overlay so you can *watch* the comma-pump chords lock pure. Reconstructable from this spec.

### 406-drifting-choir — sustained voices that keep gliding into pure harmony (Pivotuner drone) `[banked — cycle 349 adult DEEP explorer; the lab's most immersive JI piece]`
- **Question:** "What does it *feel* like to hear a choir keep sliding into purity? 5–7 sustained additive voices retune in real-time to pure 5-limit ratios whenever a wandering pivot moves — a soft shimmer of beats fading to silence as each voice locks."
- **Tags** (clean dodge of all jury bans): INPUT = autonomous ambient + density/drift-speed sliders + canvas drag-to-nudge-pivot (NOT MIDI, NOT tap-as-instrument) · OUTPUT = **Canvas2D** drifting comet/orb field (NO WebGL/three.js) · TECHNIQUE = **Pivotuner-style adaptive JI** with audible glissando re-tuning + multi-timescale generative pivot path · VIBE = organic/ambient/Anadol, foreign-tonal, long-form.
- **The mechanic:** a `pivotHz` wanders on three incommensurable timescales (sub-pivot ±2 semitone sinusoid ~60–120s · 10-chord-palette rotation 8–55s · 6 base pivots Eb3/Ab3/B3/F3/Db4/Gb3); on each move every voice picks the nearest pure 5-limit ratio (across −1/0/+1 octave layers) and `linearRampToValueAtTime`-glides fundamental+partials over 1–2.5s → you HEAR the beating slow to zero; a "lock" emits an audio+visual bloom. Genuinely different at minute 5 vs minute 1. Built files: `page.tsx` (705 lines), `voices.ts` (additive voices + vibrato + warmth LP + retune glide), `tuning.ts`, `README.md`.
- **Ambition:** #1 (lab-first dynamic JI glide-retune) + #2 (≥3 subsystems: voice bank + adaptive-tuner + generative pivot-path + Canvas2D) + #3 (Pivotuner arXiv:2306.03873 · La Monte Young *The Well-Tuned Piano* · Harry Partch · Éliane Radigue) + long-form/stateful.
- **Why it didn't win:** the most beautiful and immersive of the three and the strongest long-form *drone*, but the glide-into-purity shimmer is subtle — it can be hard to perceive at a 06:30 phone glance where 404's sinking counter + JI/ET toggle are immediately legible. **Revive:** the designated next **adult long-form JI** DEEP target (pairs with the loved spectral-drift lineage 267/243/323); or use Karel's *Welcome Home* piano as the voices' source so his real music drifts into purity. Reconstructable from this spec.

---

## §355 — 2026-06-08 (UTC) · banked from the cycle-355 WIDE fire (2 strong non-winners — resurrect-ready)

**`419-webgpu-storm` — the lab's FIRST real WebGPU compute shader** `queued` (HIGH priority — the standing jury "first")
The single most-deferred "first" in the lab (JURY 2026-06-08 #3: "WebGPU compute is still never used — claim it, on a non-mic input"). A **WGSL compute pipeline** advects a **500,000-particle storm** by **curl-noise** (incompressible 2D velocity = curl of a value-noise potential) each frame in a storage buffer, plus a pointer attractor; an additive **point-list render pass** draws it (blue/white, no warm tones); field turbulence + pointer force drive an **abrasive, non-tonal audio bed** (bandpass-swept noise + three detuned sub-saws at 41.3/42.9/57.7 Hz + FM grit, all through a compressor — refuses to resolve). **Degrades gracefully:** no `navigator.gpu` → an amber notice + a **standalone CPU Canvas2D fallback** (4k particles, same curl-noise, same audio). The full piece (`page.tsx`, `gpu.ts` with both WGSL shaders inline, `fallback.ts`, `audio.ts`, README) was **build-reviewed clean** this fire (the builder's `next build` compiled it; folder removed, banked as text). **Why it didn't win cycle 355:** its headline — the GPU compute path — is **unverifiable in the sandbox** AND degrades to the CPU Canvas2D fallback on **mobile Safari (no WebGPU)**, so Karel's 06:30 *phone* review would likely see the fallback, not the headline. **Revive on a desktop-review cycle** (or once you confirm Karel reviews on a WebGPU-capable browser). Ambition ≥2/5: never-used-technique(#1, WebGPU compute) + ≥3-subsystems(#2, compute sim + render pipeline + reactive audio + CPU fallback) + named-ref(#3, Bridson 2007 curl-noise · Bileam Tschepe / TouchDesigner GPU particles). Diversity: pointer/autonomous INPUT (non-mic) · **WebGPU OUTPUT** (never used) · GPU curl-noise advection TECHNIQUE · storm/abrasive VIBE — clean of all bans. Loved `130-tsl-particle-compute`❤️ is soft support. Renumber on revival (max folder now 418).

**`420-test-pattern` — a Ryoji-Ikeda test-tone piece that flatly REFUSES to resolve** `queued`
The purest answer to JURY 2026-06-08 #2 ("build something that refuses to resolve … nothing abrasive, glitched, or left unresolved … make the one that *doesn't* harmonize"). 8 oscillator pairs log-spaced **40 Hz–7.8 kHz**, each pair detuned **1.3–7.2 Hz** (share no common divisor → inescapable, never-locking **beating**); a square-LFO **gate** chops them into clicks/stutters (30–250 ms period, re-randomized each tick so no rhythm ever stabilizes); fast frequency **sweeps**; pointer X → active band, Y → gate density / beat rate. Visual = stark monochrome **64×32 data-grid** + barcode stripe + measurement-tick rulers + waveform trace + numeric readouts (Ikeda *test pattern* / *data.tron* aesthetic). Frequencies treated as **measurement data, not pitch** — no scale, no chord, ever. Build-reviewed clean (`engine.ts`, `draw.ts`, `page.tsx`, README; tsc clean); folder removed, banked as text. **Why it didn't win cycle 355:** thinnest on the ambition floor (oscillators + canvas ≈ 2 subsystems; no genuinely lab-first *technique* — beating/gating are standard), where the seismic winner also satisfies the jury's *named-untouched* data-sonification menu. **Revive** as the lab's standing "abrasive register" counter-piece whenever the consonant-resolving rut needs breaking again. Diversity: touch INPUT · Canvas2D OUTPUT · test-tone/beating/gating TECHNIQUE · clinical-abrasive-unresolved VIBE — clean of all bans. Renumber on revival.

## §358 — 2026-06-08 (UTC) · banked from the cycle-358 DEEP kids fire (2 build-reviewed non-winners; winner shipped = 423-kids-face-beat)

Cycle 358 ran **DEEP**: one concept — *make a BEAT/sound with your FACE, not a tune* (MediaPipe FaceLandmarker blendshapes → percussion/timbre, the lab's first face→rhythm mapping; answers JURY 2026-06-08 #1 rhythm-not-tuning + #6 face-tracking) — attacked three ways, each in a different non-banned renderer. All three were built clean (tsc + ESLint zero in their folders) and folder-isolated. `423` won (most kid-legible discrete kit + the cleanest output-diversity dodge, raw WebGL2). The two below are build-reviewed and ready to resurrect (folders `mv`'d out and removed — reconstructable from these specs + their READMEs were written).

### Seed — `424-kids-face-jam` (face → continuous NOISE/FOLEY texture, three.js point-cloud — the "go weird" sibling) `[banked — strong; the timbre/abrasive take the jury keeps asking for]`
**Brief:** "What if your face was a CONDUCTOR of a living texture — open your mouth for a big WHOOSH, raise your eyebrows for sparkle/fizz, scrunch up for crunch — a soundscape you sculpt continuously with your expression?" **Continuous** (not threshold/discrete): EMA-smoothed blendshapes drive five parallel **noise/filter foley layers** — `jawOpen`→LP-cutoff+gain of a wind/whoosh; `browUp`→HP shimmer/fizz + tremolo; `mouthPucker/Funnel`→resonant bandpass "wooo" sweep; `cheekPuff`→sub rumble; `noseSneer/browDown`→WaveShaper **crunch** — all through a `DynamicsCompressor` limiter, with an always-on faint bed and `setTargetAtTime` smoothing (no clicks). **NO pitch, NO scale, pure TIMBRE** — it cannot be hummed. **Output:** **three.js** — a glowing additive **point-cloud of the 478 face landmarks** (hue/size driven by foley intensity) + 200 drifting ambient particles that swirl harder as the texture brightens; resources disposed on unmount. Files were `page.tsx` (561 ln), `audio.ts` (302 ln), `face.ts` (110 ln), `README.md`. **Self-assessment (builder):** unambiguously continuous texture (no oscillator/quantized note anywhere); hands-free ghost-face auto-demo within ~2s; tsc+ESLint clean at `--max-warnings=0`. **What was promising:** the **most surprising / most "weird"** of the three — the strongest answer to the jury's deeper rut ("learned to go deep, forgotten to go weird"; ~13/15 resolve to consonance) and the only one whose subject is *timbre/noise* rather than *rhythm*. three.js OUTPUT is also a clean diversity dodge (0× in the last-10). **Why it didn't win:** for a **4-year-old**, continuous foley is **less immediately legible** than one-face-one-drum (the same reason `419`'s discrete kit beat its continuous siblings) — a toddler may not connect "scrunch = crunch" as fast as "open mouth = BOOM." **To resurrect:** ship as the cycle-2 **timbre/"go-weird"** lane piece (kids *or* adult — it's genuinely an adult Ikeda/Akten-adjacent texture instrument too); or fold its landmark point-cloud render into a future face piece. Refs: Expotion (arXiv:2507.04955, 2025); Ekman-Friesen FACS 1978; MediaPipe FaceLandmarker. Renumber on revival (max folder now 423).

### Seed — `425-kids-face-loop` (face → looping step-sequencer with compositional MEMORY, Canvas2D) `[banked — the jury's kids-lane "memory/consequence" ask, done as a face toy]`
**Brief:** "BUILD a beat one funny face at a time — make a face to record a drum into a loop, add another face for a second layer, watch your beat grow and repeat forever." A steady **8-step loop at 96 BPM** with a sweeping playhead; threshold+rising-edge+cooldown face detection (`jawOpen`→KICK, `browUp`→HAT, `smile`→SHAKE, `cheekPuff`→TOM) **records the drum onto the step nearest the playhead** (quantized), so it joins the loop and repeats; a **4×8 grid** shows the accumulating pattern, cells light as they fire. The loop **grows** and keeps playing hands-free; a big ≥64px **Clear** button wipes it. Pure percussion through a `DynamicsCompressor` limiter; look-ahead scheduler. **Output:** **Canvas2D** (mirrored webcam + the loop grid + per-hit bursts + expression score bars). Files were `page.tsx` (821 ln), `audio.ts` (253 ln), `face.ts` (173 ln), `README.md`. **Self-assessment (builder):** loop visibly grows (ghost demo stamps kick→hats→shake→tom over ~8s); every stamped cell is picked up by the scheduler next pass and repeats forever (genuine accumulating memory); auto-demo fires within ~1.2s, tap-grid fallback if CDN fails. **What was promising:** the only sibling with **compositional memory** — the jury's standing kids-lane ask after `350-kids-bump-along` regressed to a memory-less poke-toy; "I made this and it keeps going" is a real consequence model. **Why it didn't win:** **Canvas2D is the over-represented screen renderer** this window (banned-by-count alongside SVG), and a step-sequencer is a more *familiar* form than the WebGL2 mirror — least differentiated despite the nice memory mechanic. **To resurrect:** ship on a cycle where the renderer count has cooled, OR **fold its loop/memory mechanic into the shipped `423`** as a "record mode" toggle (the cleanest cycle-2 deepening of the face-beat thread — gives `423` the memory it lacks). Refs: Expotion (arXiv:2507.04955, 2025); Ekman-Friesen FACS 1978; step-sequencer / loop-station lineage (loved `172-loop-station`❤️). Renumber on revival.

---

## §363 — banked siblings from the WIDE adult fire (cycle 363, 2026-06-09)

Both were built to demoable in the cycle-363 fire and lost only to `437-wiki-pulse` on ambition (each 2/5 vs 437's 3/5) and freshness. Both are genuinely worth resurrecting — they answer the JURY's "refuse to resolve / go weird" mandate via inputs the lab is thin on.

- **`436-flow-static` — camera *motion energy* (not landmarks) → abrasive Ikeda data-noise.** Point the camera at anything; **dense optical flow via 64×48 frame-differencing** (deliberately NOT a MediaPipe landmark model — the genuinely fresh camera technique vs. the lab's `258`/`419`/`423` model-based pieces) drives an Ikeda glitch-synthesis chain (continuous pink-noise data-hum + motion-gated grain noise + 0.5–40/sec white-noise click-burst scheduler + sine-ping spike detector at incommensurable freqs, all through a −8 dB/12:1 limiter) and a **raw WebGL2** fullscreen clinical motion-texture shader (hard cell borders, scanlines, glitch bars, centroid cross-hair). Refs: Memo Akten (optical-flow "Forms") / Ryoji Ikeda *test pattern*. **Why it lost:** camera was used back-to-back recently (419/423) and ambition was 2/5; 437's live-data was fresher. **Why resurrect:** "movement energy, not a body model" is a real, distinct camera lane the lab has never shipped; it's complete and abrasive. **Next-cycle deepening:** pool the per-click `AudioBuffer` allocations (builder-flagged stutter risk under high motion on low-end phones); consider a true GPU optical-flow pass (Lucas–Kanade in a fragment shader) instead of CPU frame-diff.

- **`438-no-input` — a no-input feedback-delay-network self-oscillator (the Nakamura lineage).** No mic, no sample, no oscillator-playing-a-note: a **feedback-delay-network** (Hadamard H4 mixing matrix + resonant bandpass bank in a feedback loop) self-oscillates, kept on the edge of Larsen instability; you sculpt feedback-gain / filter-center / delay-time and the emergent tone swerves wildly — the instability *is* the instrument. Three safety layers (in-path hard clamp + code ceiling at gain ~0.93 + master `DynamicsCompressor`/`WaveShaper` soft-clip) make it impossible to blast. 10 s auto-demo blooms hum→howl→hum; **Canvas2D** oscilloscope (zero-crossing-triggered) + Lissajous phase-portrait + live spectrum. Refs: Toshimaru Nakamura (no-input mixing board) / David Tudor (*Rainforest*). **Why it lost:** the riskiest of the three — the FDN runs in a deprecated **`ScriptProcessorNode`** on the main thread and the self-oscillation "feel" is unverified without a live audio context; 437 was the safer, more surprising ship. **Why resurrect:** `INPUT=generative/no-input` does not exist anywhere in the lab's 320 prototypes — a genuinely fresh category, and the purest possible "refuse to resolve." **Next-cycle deepening (REQUIRED before shipping):** port the feedback loop from `ScriptProcessorNode` to an **`AudioWorklet`** (off-main-thread, not deprecated, glitch-free), then verify in a real browser that it actually self-oscillates musically and that the edge-of-howl ceiling feels thrilling-but-safe.
