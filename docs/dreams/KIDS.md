# Resonance Kids — design space

**Created**: 2026-05-21 by Karel + Claude.
**Mission**: Resonance experiences a **four-year-old** can use unsupervised and be genuinely entertained by. Primary form factors: **iPad** + **mobile**. Touch-first, no keyboard, no reading required.

This is a *focus area* the Dream Agent works on **every 4th cycle**. See AGENT.md "Per-cycle procedure → kid-cycle rotation."

---

## Design principles for a 4yo

Distilled from research (Reggio Emilia approach, Toca Boca / Sago Mini patterns, music-cognition studies on sensorimotor learning):

1. **No reading required.** All affordances are visual (icons, characters, colors). No text-only buttons. If text appears, it's labeling, not gating.
2. **Tap-target ≥ 64×64 px** (Apple HIG minimum is 44; for 4yo motor control, double it). Generous spacing between actionable elements — never two big buttons within 12px of each other.
3. **Immediate response, every time.** Every tap produces sound + visual within 50ms. Kids learn cause-effect by repetition; latency breaks the loop. Pre-load audio, no spinners.
4. **No "wrong" — only "different."** No fail states, no game-over screens, no scolding sounds. Every interaction is musically valid. Like Toca Band: hit any character, it plays in key.
5. **Color is the language.** Each character / instrument / sound has its own bold saturated color. Children associate sound with color before they can read pitch names.
6. **Looping ambient soundtrack, no silence.** Background is always a soft ambient pad so the app never feels "broken." All user-generated sound layers on top.
7. **Safe sounds only.** No sudden loud transients, no scary noises, no high-pitched ringing. Test with a sleeping toddler in the next room as the bar.
8. **Parent-friendly:**
   - No ads, no IAP prompts, no external links visible.
   - No data collection in the prototype zone.
   - Tappable areas only inside the canvas; controls outside the play area (back, settings) require a long-press or two-finger gesture.
9. **Embodied / sensorimotor.** Where possible, use device tilt, microphone (hum/sing to play), or full-screen drag — not button presses alone. Music understanding develops through movement (Reggio Emilia core).
10. **Caps at ~15 min sessions.** Kids' attention span. After ~12 min, the soundtrack slowly fades to a "goodnight" lullaby — soft exit without enforcing.

---

## Why this matters (research grounding)

- **Sensorimotor approach** (Reggio Emilia + 2025 cognitive review): musical understanding is deeply tied to embodied movement. Tap, drag, tilt, hum, sing — not point-and-click.
- **Color → pitch association**: research-backed pedagogy (multiple US patents for color-coded music education devices). Each pitch / instrument gets a distinct hue + character.
- **Social bonding via shared music**: even at 4, group play (parent + child, sibling + sibling) increases bonding via "group synchrony." Multi-touch / two-finger modes that let two hands play together are higher-value than solo.
- **Touchscreens are kids' first instruments**: the iPad market for ages 3–6 is dominated by Toca Boca, Sago Mini, Baby Piano, Little Wheels. Resonance-for-Kids enters this space as the **contemplative / piano-rooted** option (most are noisy and high-energy; there's a gap for a calm, parent-tolerable musical playspace).

---

## Where Kids prototypes live

Same `/dream/<n>-<slug>` URL pattern. Convention: include `kids` in the slug (e.g., `/dream/72-kids-color-piano`, `/dream/76-kids-tilt-rain`). README starts with **`**For**: kids (4+)**` so the dashboard can detect + tag them.

Eventually they might move under their own `/kids` route on Resonance proper, but for the dream zone they coexist with everything else.

---

## Seeded ideas

`queued` — ready for the agent to build on a kid-cycle.

### `kids-color-piano`
Eight giant colored circles on the iPad screen, one per note in a pentatonic scale (no wrong notes). Tap any circle → that color expands, a clean piano note plays, the circle slowly contracts back. Hold a finger down to sustain. Drag across multiple circles to trill. Background: soft ambient pad in the same key. Parent mode (long-press a corner): change the scale / instrument / key.

### `kids-tilt-rain`
Hold the iPad like a tray. Colored raindrops fall from the top of the screen; tilt the device to slide a basket left/right to catch them. Each caught drop plays a note in the current key (color = pitch). Tilt determines tempo (more tilt = faster rain). After 90 seconds, the played notes loop back as a melody. Sensorimotor music-making — no buttons.

### `kids-hum-to-paint`
The mic listens. Hum any pitch, the screen "paints" a brush stroke in the color matching that pitch. Higher voice = paint flies to the top, lower voice = paint settles at the bottom. After 30s of humming, the painting plays back as music. Encourages vocalization (huge for 4yo language + music development).

### `kids-character-band`
Five animal characters across the bottom of the screen — frog, owl, cat, fish, bear. Tap each to make it sing its little phrase (clean melodic loop in the same key). Tap multiple at once = they harmonize. Each character has a distinct timbre + color. Inspired by Toca Band but Resonance-toned (calmer, piano-rooted instead of pop).

### `kids-ghost-lullaby`
A simplified Ghost journey. The Ghost (existing character from Karel's published Ghost journey) floats across the screen. Tap her → she sings a single note. Drag her → she trails sparkles + a glissando. After two minutes, she fades and a soft lullaby plays. Kid version of Karel's Ghost; ties the Kids zone into Resonance's existing character universe.

### `kids-share-screen`
Two-finger mode. Two kids (or parent + kid) tap simultaneously; each finger gets its own color + voice. The two voices harmonize via diatonic intervals (always sounds good). Encourages turn-taking, listening, and joint attention.

### `kids-puddle-jumper`
The screen is a pond. Tap to drop a stone — the splash makes a sound, ripples expand outward, and the ripple visually + sonically bounces off the screen edges. Each splash adds to a building soundscape. Calming, low-stakes, infinite play.

---

## What to avoid

- **No AI-voice-gen prototypes for kids.** Synthesized voices unsettle parents (uncanny valley + privacy concerns).
- **No AI-image-gen on every interaction.** Too slow, too unpredictable, too expensive at scale. Use pre-designed character art.
- **No microphone capture that records or persists.** Mic only for live pitch detection / RMS — never stored or transmitted.
- **No social features.** No "share to" or "post your song" buttons.
- **No ads.** Period.

---

## What's been built

| Cycle | Slug | Status | Notes |
|-------|------|--------|-------|
| 398 | `/dream/537-kids-sky-murmuration` | `demoable` | **NEW** *Look UP into a deep 3D dusk sky where a real murmuration of thousands of glowing starlings swirls — and the murmuration SINGS; shepherd it with a finger, and when the cloud splits into sub-flocks you HEAR it split into harmony, resolving to a chord when it re-merges.* A living weather of birds you stand under. **three.js** `THREE.Points` cloud (~2.5–4k, additive, depth-coded near-warm/far-violet, ExpFog, drifting camera) driven by an **emergent 3D boids engine** (Reynolds separation/alignment/cohesion + spatial hash). Emergent state → harmony: cohesion→consonance, centroid-height→pentatonic register, up to 4 grid-bucket clusters → 4 sustained voices that split/merge audibly, speed→tremolo. C-pentatonic (nothing wrong); always-on C2+G2 pad; brick-wall limiter + ≤8 kHz lowpass. A scripted **ghost shepherd** auto-demo splits/merges the cloud + sings on load with zero permission; three.js/WebGL fail → `text-rose-300` notice + Canvas2D dot-flock that still flocks + sings. The deliberate **joyful/awe** swing on the **scarcest renderer** (three.js 0× in the rolling-10), steering OFF the prior cycle's drawing-ML theme. Extends Karel's loved particle/swarm lane (`130`/`236`/`262`❤️). Winner of a kids **DEEP** 3-approach fire; siblings `535-kids-starling-choir` (raw WebGL2 transform-feedback GPU boids — technical-scale resurrect) + `536-kids-lantern-shoal` (Canvas2D friendly-character shoal — best 4yo legibility, lost on the Canvas2D-4× diversity gate) banked IDEAS §398. Ambition 3/5 (#2 ≥5 subsystems + #3 refs: Reynolds SIGGRAPH 1987 / Cavagna PNAS 2010 + #4 spine cycle 1; #1 not cleanly claimed — flocking exists; #5 not claimed — cs.SD is server-ML). For kids 4+ · touch/multi-touch · three.js (Canvas2D fallback) · pentatonic · no recording · zero new npm deps · zero API · no `guard`. **Build-verified, not browser-verified** (no three.js/WebGL/audio in sandbox; iOS has WebGL so the murmuration runs on iPad). |
| 394 | `/dream/524-kids-hand-firebird` | `demoable` | **NEW** *Hold up your hand and it becomes a glowing firebird of light — open your fingers to make it bloom and sing, close them and it gathers into a quiet ember.* The lab's **first MediaPipe Hands** (21-landmark hand-tracking — `493` used Pose, never the Hands model) driving a **raw WebGL2** GPU particle creature (~2000 additively-blended points + comet trails). Openness → bloom width + sung-voice trigger + brightness; wrist height → pitch (C-major pentatonic, nothing wrong); finger spread → scatter + harmonics; movement → sparkle. Warm pentatonic voice + always-on ambient pad; brick-wall limiter + ≤8 kHz lowpass (kids-safe). A scripted **virtual hand** auto-demo blooms + sings **on load** with no camera; camera-denied / no-MediaPipe / no-WebGL2 → `text-rose-300` notice + a Canvas2D glow fallback that still sings. The deliberate **joyful, embodied, immediate-cause-effect** swing after two hushed contemplative kids cycles (`513`/`518`) — a creature that is *yours*, with agency. Extends Karel's loved particle lane (`130`/`236`/`262`❤️) + the embodied hand/camera lane (`234`/`104`/`101`❤️). Ambition 3/5 (#1 lab-first MediaPipe Hands + #2 ≥3 subsystems + #3 refs: MediaPipe Hands arXiv 2006.10214 / *Journey* / Memo Akten). Winner of a DEEP 3-renderer fire; siblings `523-kids-hand-puppet` (Canvas2D shadow-dog, best literal-4yo legibility) + `525-kids-hand-choir` (SVG 5-fingertip choir, open=chord/close=unison) banked IDEAS §394. For kids 4+ · hand-tracking (camera) · WebGL2 · pentatonic · no recording · zero npm deps · zero API · no `guard`. **Build-verified, not browser-verified** (no camera/WebGL2 in sandbox; note iOS has WebGL2 but not WebGPU, so the full firebird should run on iPad). |
| 382 | `/dream/489-kids-pond-pair` | `demoable` | **NEW** *Two glowing ponds that secretly talk — a floating lily pad rides your splash across the channel and drops it into the other pond so it sings.* **Cycle 2 of the Wave Field kids spine** (cycle 1 = `478-kids-wave-pond`, ONE pond) — the jury (2026-06-10 #2) named extension: TWO coupled 2-D FDTD wave fields (56×56, Van Duyne–Smith digital-waveguide mesh) joined by (1) an always-on **sympathetic whisper** across the edge columns (`K=0.08`) and (2) a tangible floating **lily-pad carrier** that bobs on the wave height, drifts on the wave gradient, accumulates field energy (golden glow-dot), and on crossing the channel injects it into the other pond (ring + sparkle chime) — a *visible sound-messenger* a 4yo reads instantly. Pond A low pentatonic (C3–A3) + pond B high pentatonic (C4–A4) → always harmonize. Multi-touch (two kids, one pond each — the social-bonding gap). Always-on C3+G3 pad; brick-wall limiter; 3-s auto-demo shows the pad crossing hands-free. Renderer moved OFF the jury-banned three.js → **Canvas2D** (dodges three.js + the WebGL2 4× count-ban). Ambition 3/5 (#2 ≥3 subsystems + #3 Van Duyne–Smith 1993 / sympathetic coupling + #4 spine cycle 2 — an extension, not a 5th primitive). Winner of a DEEP 3-builder fire; siblings `488-kids-echo-ponds` (child-draggable coupling vine + WebGPU compute) + `487-kids-two-ponds` (clean cooperative core) banked IDEAS §382. For kids 4+ · multi-touch · Canvas2D · pentatonic · no recording · zero deps · zero API · no permissions. |
| 354 | `/dream/417-kids-cradle-song` | `demoable` | **NEW** *Rock your phone like a cradle, close your eyes — a humming companion locks to your rhythm, then leads it down to sleep.* The lab's **first bidirectional sensorimotor-entrainment** toy (music that follows AND leads you — Kuramoto coupling `dθ/dt = ω(t)+K·sin(θ_rock−θ_music)`, ω drifts 65→45 cpm) and its **2nd truly off-screen / audio-first** piece (after `346`) — near-black screen, one faint breathing dot, all info in the ears. Directly answers JURY #5 (the unmoved off-screen gap; the DEEP cycle it asked for). Distinct from `402-kids-steady-walk`, which only analyzes one-way. DeviceMotion primary (iOS permission inside Begin tap) · drag fallback · 2.5 s auto-demo plays the full lead-to-sleep hands-free · DynamicsCompressor brick-wall limiter (safe sounds) · whole-tone/JI (not D-Dorian) · audio-only render (dodges banned SVG/Canvas2D/WebGL2/three.js). Additive formant hum + drone + reverb, **no AI voice**. Refs: Kuramoto 1975 · D-Jogger (Moens/Leman ~2014) · interactive-RAS (Hove 2012) · Repp 2005 · Oliveros *Deep Listening*. Winner of a DEEP 3-engine fire; siblings `415-kids-rock-the-moon` (DOM/CSS moon wind-down, Large & Jones adaptive oscillator) + `416-kids-wake-the-band` (DOM/CSS parade wake-up + legible "Together!" meter, ADAM correction) banked IDEAS §354. For kids 4+ · device-motion · audio-only · no recording · zero deps · zero API · 3.53 kB. |
| 334 | `/dream/368-kids-rainbow-quest` | `demoable` | **NEW** *A unicorn wants a color — go find it in the real world with the camera.* The lab's **first color-foraging game**: point the rear camera at something matching the target hue, the creature glows warmer (rising D-Dorian shimmer), hold ~0.6 s → fanfare + sparkles + the color fills a rainbow arc; collect all 7 → a rainbow song. Camera analysis-only (central-patch `getImageData`→HSV→hue-distance warmth); DOM/CSS visuals; always-on D+A drone + brick-wall limiter; auto-demo completes the quest hands-free with no camera. Gets the child OFF the couch (jury's anti-screen-bias). Dodges every ban: camera INPUT (not touch/mic), DOM/CSS OUTPUT (not WebGL2/SVG). Refs: Newton *Opticks* 1704 / Scriabin *clavier à lumières* 1911 / Reggio Emilia. Winner of a DEEP 3-play-model fire; siblings `366-kids-color-hunt` (forage + melody-memory, three.js) + `367-kids-color-chord` (room-as-chord, Canvas2D) banked IDEAS §334. For kids 4+ · camera (demo fallback) · DOM/CSS · D-Dorian · no recording · zero deps · zero API. |
| 290 | `/dream/280-kids-echo-canyon` | `demoable` | **NEW** *Sing across the canyon — a paper creature catches your song and sings it right back, then adds a friend.* The lab's **first call-and-response / canon piece**: the child hums or sings into the mic; an RMS gate detects the phrase; ~every 130 ms a frame of time-domain audio is run through **autocorrelation pitch detection** (Chris Wilson's canonical Web Audio method, YIN family, parabolic-interpolation refined) and octave-collapsed to a **C-Lydian** scale degree — so a high or low child voice both land in the same comfortable register and nothing is ever "wrong." When the phrase ends, **Echo** (the far-cliff creature) replays it note by note on a soft triangle mallet and lays a diatonic **third** 150 ms behind each note for a round-like shimmer, over an always-on C+G drone through a limiter (safe sounds). Built straight at the 2026-06-02 jury's three demands — **non-pentatonic** (Lydian's raised 4th, not C-pentatonic), **non-luminous** (matte cut-paper Canvas2D — flat dusk sky, paper cliffs + moon, birds as colored ovals on sine-arc beziers; pure `source-over`, drop-shadows only, **no glow/WebGL**), and it **audits the sound** (the scale IS the point). **Input = mic** (chosen because `touch` is at ×4 in the last-10 window → banned this cycle); **no mic / denied → a self-playing demo** where the two creatures sing to each other, so it's always demoable. Mic is analysis-only — never played back, recorded, or sent. Serves KIDS.md's explicit **vocalization** goal (call-and-response is the purest singing prompt). Refs: **YIN** (de Cheveigné & Kawahara, JASA 2002), **Chris Wilson PitchDetect** (`cwilso/PitchDetect`), **Pauline Oliveros, *Deep Listening*** (2005). Born from RESEARCH §290. For kids 4+ · mic input (demo fallback) · matte Canvas2D · Lydian · no recording · zero deps · zero API · 4.3 kB. |
| 288 | `/dream/276-kids-balloon-tritave` | `demoable` | **NEW** *Tilt the tablet to drift a paper cloud-bird through a dusk sky of cut-paper balloons — every balloon it brushes sings in a tuning that has no octave.* The lab's **first non-octave / non-pentatonic tuning** in 280+ prototypes: balloons tuned to the **Bohlen–Pierce scale**, whose repeat interval is the **tritave (3:1)**, not the 2:1 octave. Equal-tempered BP = **13 equal divisions of the tritave** (step `3^(1/13)≈1.0882`, ~146¢; `freq(k)=220·3^(k/13)`); three balloons seated on the signature **3:5:7 triad** (13-EDT degrees 0/6/10) so chords sound rooted. Voice = a **clarinet-like odd-harmonic additive tone** (1·3·5·7·9 — the natural BP timbre) over a root+tritave **drone**, so "nothing sounds wrong" from a wholly different harmonic universe — consonant but otherworldly. **Input = device TILT** (`DeviceOrientationEvent`, iOS permission on first tap) with a mouse/drag fallback (fully playable on a laptop). **Output = matte inline SVG** cut-paper (`feDropShadow`+`feTurbulence`, rAF via refs — **no canvas/WebGL/three.js/glow**), continuing the loved `268` cut-paper register. Brush in a row → melody; brush two at once → chord; confetti puffs; always-on drone, no score/fail, ~14-min lullaby fade. Born from this cycle's research dive (RESEARCH §288). Ref: **Bohlen–Pierce scale** — Heinz Bohlen (1972) + Max Mathews & John R. Pierce (Bell Labs, ~1984); Elaine Walker (ZIA). Winner of a WIDE 3-builder fire; siblings `277-kids-overtone-cave` (hum → raw-WebGL grotto sings your harmonic-series overtones, khoomei/Lucier) + `278-kids-dream-flock` (wave at camera → frame-diff boids flock sings whole-tone/Debussy) banked build-verified. For kids 4+ · tilt input · SVG output · zero deps · zero API · no mic/camera · 4.07 kB. |
| 286 | `/dream/272-kids-tune-purr` | `demoable` | **NEW** *Slide a sleepy, wobbling creature until its shivering stops — feel the moment two notes lock into tune.* A warm 110 Hz drone + three matte "hummer" creatures (116 px drag targets) each start a few Hz detuned from a pure just-intonation interval against the drone (1:1, 5:4, 3:2) → you **hear and see real acoustic beating** (the creature trembles at the beat rate). Drag to change pitch; the wobble slows as you near the ratio; within ±6 cents it **snaps in tune** — shivering stops, eyes open, smile, soft **purr**. Lock all 3 → pure **4:5:6 JI major triad** + matte ring-wave. Reversible, no score, no fail. **First time audible beating is the instrument** (the child resolves roughness→consonance *by ear*, pre-verbally) and the **first non-pentatonic kids tuning toy** — built to answer the JURY "ban the glow, ban the pentatonic, audit the sound" cycle on both axes: fully **non-luminous/matte** (drop-shadows only, no glow/three.js/WebGL) + pure JI ratios over a drone, NOT C-major pentatonic. The calm, parent-tolerable, contemplative option KIDS.md names as the market gap. Refs: Helmholtz *On the Sensations of Tone* + McBride 2025 roughness review (arXiv 2510.14159). Winner of a WIDE 3-builder fire; siblings `273-kids-raga-peacock` (tanpura + Raga Yaman, SVG cut-paper) + `274-kids-clay-clock` (2:3:4 + gankogui polyrhythm, matte clay) banked build-verified. For kids 3+ · touch · canvas2d-matte · zero deps · zero API · no permissions · 3.93 kB. |
| 270 | `/dream/238-kids-tilt-world` | `demoable` | **NEW** *Lean the iPad to roll a glowing marble across a 3D musical hill-world — no tapping.* three.js `PerspectiveCamera` over a sine-bump heightfield; `DeviceOrientation` beta/gamma → acceleration, integrated with friction + clamped top speed + **real downhill gravity** along the surface gradient (LocoRoco-style). Five glowing pads ring C-major pentatonic (C3 E3 G3 A3 C4, BANDIMAL: bigger pad = lower), each through a `StereoPannerNode` driven by the marble's on-screen x → **spatial audio tracks the ball**; 520ms pad cooldown, sparkle burst, pulse flash. Soft detuned-sine drone (slow LFO) fades in on first gesture → never silent. Glowing marble trail; camera gently follows. iOS motion permission behind the Start button; on denial / no-sensor / no-events-in-1.8s → auto pointer-drag fallback with readable rose note + explicit "Drag to play" button. **First tilt-controlled 3D kids piece** — all ~110 prior kids prototypes are touch + 2D canvas; first with spatial panned audio tied to ball position; the instrument is the child's body leaning the tablet (embodied/sensorimotor — KIDS.md core). Winner of a WIDE 3-builder fire (siblings `kids-sing-garden` first-kids-GLSL-shader + `kids-wave-band` zero-dep-camera-motion banked in IDEAS.md). Ref: *Inertia* (kikkupico WebGL accelerometer marble, 2026) + tilt-labyrinth lineage. Pulled by `169-kids-marble-run` ❤️ + `83-kids-tilt-rain` ❤️. For kids 4+ · Zero new deps · Zero API · optional motion sensor · 4.39 kB. |
| 266 | `/dream/232-kids-rain-xylophone` | `demoable` | **NEW** Five BANDIMAL xylophone bars (C3/violet/tallest → C4/cyan/shortest). Coloured drops fall from above (~3–4s, GRAV=58 px/s²). Tap a falling drop (HIT_R=38px) → loud bell note (triangle + ×2.756 partial, 1.8s decay) + 20-sparkle burst + bright bar flash. Uncaught drops land → quiet note + 10 sparkles. Tap bar directly any time → 10 sparkles. Drops drift 5%/frame toward column center. Auto-spawn: 1 drop/1.5s; 2 demo drops at load. Pentatonic C3–C4; ambient C3+G3 pad. **First kids prototype with a chase mechanic** — 231 prior kids prototypes respond to WHERE you tap; this adds timing + moving-target tracking. Three reward tiers perceptible without score counters. Pulled by `169-kids-marble-run` ❤️ and `83-kids-tilt-rain` ❤️. For kids 4+ · Zero permissions · Zero API · Zero deps · 2.65 kB. |
| 250 | `/dream/216-kids-band-builder` | `demoable` | **NEW** Five glowing circles (BANDIMAL: Bass violet r=76, Mid teal r=62, Melody cyan r=50, Rhythm amber r=40, Shimmer rose r=30). Tap any to add its looping voice; tap again to remove. All loops phase-locked to a shared 80 BPM beat clock (look-ahead scheduling). When all 5 on: "✨ Full Band!" flash + sparkle burst. Thin colored lines connect active circles. **First kids prototype about muting/unmuting independent looping tracks.** For kids 3+ · Zero permissions · Zero API · Zero deps · 2.82 kB. |
| 248 | `/dream/214-kids-dance-avatar` | `demoable` | **NEW** Five BANDIMAL body parts form a cartoon dancer: head (C4/cyan, r=34), left hand (G3/emerald, r=40), right hand (A3/amber, r=40), left foot (C3/violet, r=52), right foot (E3/teal, r=48). Skeleton lines connect them. Tap any part → bell tone (triangle + ×2.756 + ×5.404 partials, 1.5s) + spring-bounce + 13-sparkle burst. Cute face on head (eyes + smile arc). Idle breathing animation (slow sine, unique phase per part). Visual-only demo before first touch cycles DEMO_SEQ (body parts bounce silently, no sound until AudioContext unlocked on first user tap). Hint: "Tap the dancer! 🕺" fades 5.5→8s. **First kids prototype where the instrument IS a human body shape.** BANDIMAL maps to anatomy (feet=big=low, head=small=high). First kids prototype with a character face. First with visual-only pre-interaction demo. Connects to DiscoForcing (ICML 2026) audio→animation research. For kids 3+ · Zero permissions · Zero API · Zero deps · 2.7 kB. |
| 246 | `/dream/213-kids-echo-drum` | `demoable` | **NEW** Four BANDIMAL drum pads fill the screen. Tap any rhythm; after 1.5s silence the drum echoes it back (cool-cyan overlay = drum's voice). Then one +1 bonus beat fires (most-tapped pad, 24-sparkle gold burst). Phase indicator at canvas center: pulsing red = recording; colored tap-count dots orbit center; pulsing cyan = echoing. First rhythmic call-and-response prototype. For kids 3+ · Zero permissions · Zero API · Zero deps · 3.18 kB. |
| 244 | `/dream/211-kids-firefly-web` | `demoable` | **NEW** Tap to release glowing fireflies on dark canvas. When two drift within 155px they spin a vibrating silk thread + pentatonic chime (pitch by thread length). Up to 8 fireflies, 28 simultaneous threads. Brownian drift + soft mutual attraction. **First kids prototype where endpoints are alive** — extends `140-kids-string-bridge` ❤️. For kids 3+ · Zero permissions · Zero API · Zero deps · 2.88 kB. |
| 242 | `/dream/209-kids-drum-tap` | `demoable` | **NEW** Four large colored drum pads (kick/hihat/snare/tom). After 2+ taps + 1.5s silence: 1st-order Markov chain generates 8-step drum response. Gradually mirrors which pads you chain. Auto-demo on load. **First kids call-and-response rhythm dialogue.** Zero permissions · 2.88 kB. |
| 240 | `/dream/207-kids-harmonic-piano` | `demoable` | **NEW** Four large glowing circles (C3/C4/G4/C5, violet/cyan/emerald/amber). First tap activates all; subsequent taps toggle individual voices on/off (last voice protected). Triangle oscillators with 1/n gain rolloff; `setTargetAtTime` for click-free fade. Visual: slow pulse (0.45–1.20 Hz per circle), ripple rings, 10-sparkle burst + bounce on toggle. BANDIMAL: biggest=deepest. **First kids prototype about timbre** — child assembles the harmonic spectrum (15 meaningful combinations, each perceptibly distinct). For kids 4+ · Zero permissions · Zero API · Zero deps · 2.53 kB. |
| 238 | `/dream/205-kids-bubble-bath` | `demoable` | **NEW** Tap to blow a soap bubble; bubbles drift upward at ~20 px/s. When two bubbles overlap → chord chime (both pitches play as triangle oscillators, 1.4s decay) + white contact glow. Collision tracking via `colPairs` Set: fires once per collision onset, not per frame. Soap bubble visual: translucent fill, colored rim, inner iridescent ring (hue+40°), two radial-gradient highlights (top-left crescent + bottom glint). Gentle wobble (radius ±2.5 px, unique phase per bubble). Pop at top: bell pair + 12 sparkles. BANDIMAL sizing (bigger=lower). Auto-respawn when sparse. Demo: 2 bubbles at 120ms. Ambient C3+G3. **First prototype where harmony arises from spatial proximity of floating objects** (not collision of rings or tap of buttons). For kids 3+ · Zero permissions · Zero API · Zero deps · 2.7 kB. |
| 236 | `/dream/203-kids-lantern-launch` | `demoable` | **NEW** Tap dark starry sky → glowing paper lantern spawns + soft launch chime; drifts upward 22px/sec with sinusoidal sway (unique phase per lantern); exits off top → bright bell chime + 14-sparkle burst. Pitch from X zone (left=C3/violet → right=C4/cyan, pentatonic). Up to 8 lanterns. Demo: 2 lanterns auto-spawn at 120ms. Ambient C3/G3/C4 sine pad. `drawRoundRect` helper (manual arcTo). 58 pre-placed twinkling stars. **First prototype where note fires at END of journey** (5–10s float before reward). Extends `166-kids-lantern` ❤️. For kids 3+ · Zero permissions · Zero API · Zero deps · 2.54 kB. |
| 234 | `/dream/201-kids-glow-worm` | `demoable` | **NEW** Three chain-physics caterpillars (5 segs: C4/A3/G3/E3/C3, head=high). Tap to ring a segment. Auto-beats after first tap. Stereo panned (−0.52/0/+0.52). First kids prototype with moving-creature-as-instrument. |
| 232 | `/dream/199-kids-spin-wheel` | `demoable` | **NEW** 8-sector spinning color wheel. Each sector = a different color + pentatonic pitch (C3 E3 G3 A3 / C4 E4 G4 A4). Tap any segment → glowing peg appears. Fixed ✦ indicator at 12 o'clock plays each lit segment as wheel rotates past. BPM ± buttons (30–160, default 80). 1 revolution = 8 beats. Additive bell synthesis (triangle + ×2.756 + ×5.404). Ambient C3+G3 pad. **First circular step sequencer in kids zone** — prior sequencers (dot-seq, lego-sequencer) are linear/grid. Spinning toy metaphor universally understood. For kids 3+ · Zero permissions · Zero API · Zero deps · 2.41 kB. |
| 230 | `/dream/197-kids-rain-chain` | `demoable` | **NEW** Five pentatonic cups in staircase; rain overflows downward, five-note arpeggio C3→C4. |
| 228 | `/dream/196-kids-wind-chimes` | `demoable` | **NEW** Eight pendulum chimes, wind-driven, collision-ringing. |
| 222 | `/dream/190-kids-wave-organ` | `demoable` | **NEW** Seven pentatonic organ pipes (C3→G4, BANDIMAL: taller=lower=left). Autonomous three-sinusoid wave undulates continuously; when the water surface crests over a pipe's mouth the pipe's triangle oscillator ramps up (140ms attack / 220ms release via `setTargetAtTime`). Tap anywhere → Gaussian wave surge (−0.22 × H amplitude, Gaussian σ≈0.126W, decays over 3 s) — temporarily submerges deeper/taller pipes, waking low notes. Splash droplets on tap (additive composite). Short plate reverb (1.8 s IR, 22% wet). **At rest: C4/E4/G4 already playing (C major chord).** Autonomous wave and visual alive from load; AudioContext deferred to first tap. **First kids prototype where continuous wave height = which notes play.** For kids 3+ · Zero permissions · Zero API · Zero deps · 2.56 kB. |
| 220 | `/dream/188-kids-glow-bug` | `demoable` | **NEW** Five garden lamps on stems, C3→C4 pentatonic left-to-right (BANDIMAL: bigger=lower). Tap anywhere to release a glow-bug (warm amber firefly); it drifts upward with sinusoidal flight, attracted to the nearest lamp; arrival → sparkle burst + bell chime (triangle + 2nd harmonic + reverb). Demo bugs auto-spawn from soil every 3.2s. **First kids prototype with directed flight**: note fires at destination, not at tap. 1–2s journey creates visual anticipation. For kids 3+ · Zero permissions · Zero API · Zero deps · 2.92 kB. |
| 218 | `/dream/186-kids-breath-bloom` | `demoable` | **NEW** Five glowing petals in a circle (C3/E3/G3/A3/C4 pentatonic). Each petal breathes via cosine envelope (9s cycle) staggered 35% per petal-index — continuous ripple wave. Tap petal → sparkle + note spike. Autonomous motion on load (first kids prototype that breathes before any touch). Triangle oscillators + impulse reverb. For kids 3+ · Zero permissions · Zero API · Zero deps · 2.84 kB. |
| 216 | `/dream/184-kids-gravity-harp` | `demoable` | **NEW** Six horizontal Karplus-Strong strings (C5/A4/G4/E4/D4/C4 top→bottom). Tap to drop a ball; pass-through physics: strings absorb 38% kinetic energy (vy × 0.62) without reversing direction — ball traverses all 6 strings top-to-bottom then bounces back bottom-to-top, playing descending then ascending pentatonic scale. 2 demo balls auto-spawn. For kids 3+ · Zero permissions · Zero API · Zero deps · 2.57 kB. |
| 214 | `/dream/182-kids-crystal-song` | `demoable` | **NEW** 6 glowing crystal formations in a dark cave; left=lowest/tallest, right=highest/shortest (BANDIMAL rule); tap → glass-bell ring (3 sine partials: fundamental + 2× + 4×, gains 1.0/0.14/0.04); hold → sustains at ~0.20 gain while finger down, 2.2s decay on release; 16-particle sparkle burst + two ripple rings at each tap; crystals shimmer autonomously (10s period, π/3 phase offset each — cave breathes before first touch); 4+ crystals held simultaneously → resonance flash (cool-white canvas overlay); ambient C2 drone from first tap; cave floor wavy edge drawn over crystal bases (crystals emerge from rock). **First kids prototype with sustained tones and glass bell timbre.** 181 prior kids prototypes play on tap-down; this sustains while held → hold longer = longer note. New sound: additive sine partials = crystalline, slightly metallic ring, distinct from KS pluck / triangle / pure sine. Inspired by `105-pluck-field` ❤️, `166-kids-lantern` ❤️, `169-kids-marble-run` ❤️. For kids 3+ · Zero permissions · Zero API · Zero deps · 3.07 kB. |
| 212 | `/dream/181-kids-texture-drum` | `demoable` | **NEW** Five full-height canvas zones: Wood · Metal · Water · Earth · Glass; each zone has a distinct synthesized timbre; tap=hit, hold=rapid-fire roll (80ms interval), two fingers=accent+full-screen flash; pre-rendered material textures visible before first tap; zero permissions. First kids prototype about timbre (material = sound). |
| 210 | `/dream/179-kids-voice-monster` | `demoable` | **NEW** Hum → blob-monster grows + changes color; hunger bar fills; after 30s accumulated voice → monster sings back (up to 8 detected pitches). |
| 208 | `/dream/177-kids-lego-sequencer` | `demoable` | **NEW** 8-step × 6-row block grid (C major pentatonic C3→E4); tap=toggle, drag=draw mode (adds only); white cursor sweeps L→R at BPM, plays every active block; lego-brick visual (rounded rect + plastic sheen + center stud + bounce-glow on play); BPM 40–160 (±10 buttons); ✕ Clear; ambient C3+G3 pad; seeded starter melody; zero permissions. **First 2D pitch×time grid in kids zone.** All prior kids prototypes are 1D (single row of dots) or spatial (tap-anywhere). This introduces the piano-roll metaphor: X=time, Y=pitch. Construction-as-composition (place/remove = compose/decompose), inspired by BrickMusicTable (arxiv 2411.13224, Nov 2024). Aligned with `160-kids-paint-loop` ❤️ and `98-kids-drum-circle` ❤️. |
| 190 | `/dream/162-kids-bubble-pop` | `demoable` | **NEW** 10 seed bubbles + continuous respawn (cap 14); 5 colors/pitches (violet=C3, emerald=E3, amber=G3, rose=A3, cyan=C4); BANDIMAL radii 52/44/36/28/20 px (bigger=lower); tap or drag to pop → 18-sparkle burst + 2-oscillator triangle note (0¢/+7¢, decay 0.40–0.72s by pitch); C3+G3 ambient pad; 500ms fade-in on spawn; zero permissions. **First kids prototype where destruction is the musical act.** 161 prior prototypes reward creating, touching, or connecting — this one rewards the pop. |
| 188 | `/dream/160-kids-paint-loop` | `demoable` | **NEW** Freehand stroke → immediately loops as pentatonic melody; 4 color-timbre zones (violet=piano, amber=bells, teal=chime, rose=pads); Y=pitch (C3 bottom, C5 top, 11 pentatonic steps); traversal dot sweeps each stroke; max 4 simultaneous loops; tap stroke to delete; demo seeds 3 loops at open; zero permissions. First kids prototype combining freehand drawing + multi-timbral loop station. |
| 186 | `/dream/158-kids-hum-paint` | `demoable` | **NEW** Sing or hum → glowing colored trail on dark canvas (Y=pitch, hue=pitch, width=amplitude); painting scrolls left-to-right; ▶ Hear it! plays up to 56 sampled notes back as sine tones; demo auto-draws Twinkle Twinkle; clear resets. Pitch detection: autocorrelation on 2048-sample time-domain buffer, voice range 75–1100 Hz, threshold 0.72. **First kids prototype where the child's voice (not touch) is the instrument.** Inspired by `100-kids-paint-song` ❤️ and `152-kids-star-paint` ❤️. Mic optional. |
| 184 | `/dream/156-kids-star-connect` | `demoable` | **NEW** 13 pre-placed stars in 3 clusters; drag between any two stars to connect → both pitches ring as an interval (triangle wave, 1.8s); close a triangle → chord + pale blue flash + 15-sparkle burst; star color = pitch class (violet=C, emerald=E, amber=G, rose=A, cyan=C5); C3+G3 ambient pad; ↺ Clear; 56px snap radius. **First prototype where the musical structure is latent in the sky, revealed by connecting.** Companion to `152-kids-star-paint` ❤️. Zero permissions. |
| 182 | `/dream/154-kids-clap-back` | `demoable` | **NEW** Three-phase rhythm loop at 80 BPM. DEMO (violet): circle glows on active beats + triangle pluck (C4/E4/G4/A4); dim on rests. WAIT (green, 1.5 beats): "your turn!" pulse. LISTEN (cyan): same clock, silent — child taps. On-beat taps (±165ms, ±22% window) on active beats = 22-spark burst + loud note; off-beat = 9 sparks + quiet note. 5 patterns: all-4 → skip-3 → skip-2 → skip-4 → backbeat-only. 4 beat-indicator dots below circle show pattern shape. Ambient C3+G3 pad. **First kids prototype where WHEN you tap determines the reward.** Inspired by `98-kids-drum-circle` ❤️. Zero permissions. |
| 180 | `/dream/152-kids-star-paint` | `demoable` | **NEW** Drag finger across dark sky → every 46 px a glowing 5-pointed star appears + KS pluck (Y=pitch, C3 bottom to C5 top, 9 pentatonic steps); stars connect as constellation; lift = constellation locked; after 16s auto-arpeggio (unique pitches high→low); fades over 3.5s; max 6 simultaneous; ambient C3+E3+G3 pad; hint text fades 9s; zero permissions. First kids prototype where drawing persists and sings back unprompted. |
| 178 | `/dream/150-kids-beat-builder` | `demoable` | **NEW** Two-row 6-step sequencer; top row = melody (cool-color dots, C major pentatonic C3→E4); bottom row = drums (rose=kick, amber=snare, emerald=hihat, cyan=tom, pink=clap, violet=shaker); full-column tap zones (top half = melody, bottom half = drums); BPM ±16 (40–160); Clear; ambient C3/E3/G3 pad. First kids prototype with two simultaneous tracks. Zero permissions. |
| 176 | `/dream/149-kids-color-mix` | `demoable` | **NEW** Three large colored circles (rose=C3, amber=E3, violet=G3); drag any circle; when two overlap → color blend + notes louder; all three overlapping → bright white + C major chord; breathing pulse on isolated circles; `setTargetAtTime` transitions prevent pops. First kids prototype where proximity IS the music. Zero permissions. |
| 174 | `/dream/147-kids-beat-pulse` | `demoable` | **NEW** Large circle pulses at BPM; each beat: flash pentatonic color, quiet pluck, note name inside; tap anywhere for sparks; on-beat taps (±18% beat period) produce 20 sparks; off-beat: 9. Progress arc sweeps clockwise as beat cue. BPM ±10 buttons (40–120). Zero permissions. |
| 172 | `/dream/145-kids-dot-seq` | `demoable` | **NEW** 6 colored dots (C major pentatonic C3→E4); white sweep cursor moves left-to-right at BPM (default 80); tap any column to toggle dot on/off (full-column hit zone); cursor plays lit dots as it passes; +/- 16 BPM buttons; Clear button; ambient C3/E3/G3 pad. **First kids prototype about rhythm construction — child builds a looping pattern that plays autonomously.** Zero permissions. |
| 170 | `/dream/143-kids-seed-song` | `demoable` | **NEW** Tap anywhere → glowing seed at tap point; procedural tree grows over ~20s (depth-5 branching, alternating ±25°/32° per level); each branch segment plays Karplus-Strong pluck when it reaches its tip (C3→C4 pentatonic, depth=pitch, pre-computed buffers); amber leaf clusters flutter at terminal tips; soft wind layer (looping noise buffer → lowpass 220Hz); up to 4 trees singing simultaneously. First kids prototype where reward is patient growth over time (not instant tap response). Zero permissions. |
| 168 | `/dream/142-kids-echo-canon` | `demoable` | **NEW** Tap out a melody (up to 8 taps; X = pitch, C-major pentatonic C3–C4); 1.5s silence → 3-voice canon fires: amber (original), blue (+7 semitones / P5), violet (+12 semitones / octave), each voice starting 550ms after previous. Dots rise upward per voice (pitch-rise visual metaphor). Web Audio precise `osc.start(when)` scheduling; rAF `actx.currentTime` spark check. Zero permissions. First kids prototype where child's own phrase echoes back as polyphony. |
| 166 | `/dream/140-kids-string-bridge` | `demoable` | **NEW** Hold 1–2 fingers → glowing string between them vibrates + plays; distance = pitch (closer = higher, C-major pentatonic C2–C5); standing-wave visual rate proportional to pitch; single finger anchors at center; pluck on >12 px finger movement; triangle oscillator; zero permissions. |
| 162 | `/dream/137-kids-hold-glow` | `demoable` | **NEW** Hold anywhere → glowing orb brightens and grows (core 28→92 px, halo opacity 22→50% over 4s); release → fading ring expands at speed proportional to hold duration; 5 color zones (violet=C3→cyan=C4 pentatonic); triangle OscillatorNode attack 80ms / release `max(120ms, holdSec×120ms)`; multi-touch up to 5 orbs; empty-state hint text; zero permissions. First kids prototype where hold-duration is the musical parameter — rewards stillness over tapping. |
| 160 | `/dream/135-kids-wheel-song` | `demoable` | **NEW** 5-segment spinning color wheel; golden striker at 12 o'clock fires pentatonic note per segment (violet=C3→cyan=C4); tap anywhere to add angular momentum (omega +=1.6 rad/s, max 6); deceleration to min 0.3 rad/s; segment flashes on strike; continuous pitch-tracking drone; rotation dot on rim; startup chime on open; zero permissions. First kids prototype where rotational speed determines musical rhythm (music-box mechanic). |
| 158 | `/dream/133-kids-ripple-pond` | `demoable` | **NEW** Tap anywhere → expanding ripple ring plays pentatonic note (X=pitch, violet=C3 left → cyan=C4 right); when two rings first meet → white flash + chord at collision point; collision pair tracked per-ID to fire exactly once; max 12 rings; ambient C/E/G drone; caustic shimmer background; multi-touch; zero permissions. First kids prototype about wave interference / superposition. |
| 156 | `/dream/131-kids-orbit` | `demoable` | **NEW** 5 orbital bands (rose C4 inner → violet C3 outer); tap ring → planet placed at tap angle, plays chime, orbits; tapping occupied ring teleports + retrigs; note fires on every completed orbit; Kepler-like periods (3.5–13s); polyrhythm from physics; dashed orbit rings; golden-ratio star field; ambient C2+G2 drone; zero permissions. |
| 154 | polish | — | Tap-ripple ring on `127-kids-starfish`, splash ring on `128-kids-fish-tap`, hint text bump on `82-kids-color-piano`. |
| 152 | `/dream/128-kids-fish-tap` | `demoable` | **NEW** 7 boid-flocking fish swim rightward; tap → fish stops, opens mouth, sings pentatonic note, boids reabsorb it into school; color=pitch (violet=C3→rose=G4); multi-touch chords; caustic shimmer; zero permissions. First kids prototype with emergent group behavior. |
| 150 | `/dream/127-kids-starfish` | `demoable` | **NEW** 5 starfish on ocean floor; tap → 5-note pentatonic chord + wiggle arm-ripple; size→register (biggest=lowest); seaweed + bubble ambient; reverb; zero permissions. First tap=chord prototype. |
| 148 | `/dream/125-kids-jellyfish` | `demoable` | **NEW** 5 translucent jellyfish drift upward; touch to nudge → bell tone + glow; size→pitch (BANDIMAL rule); top-to-bottom wrap; EMA velocity recovery creates biological pulse motion; pentatonic C3–C4; ambient pad; zero permissions. |
| 144 | `/dream/122-kids-firefly-song` | `demoable` | **NEW** 10 drifting fireflies on black canvas; touch to catch → follows finger + plays note; release → scatters; multi-touch chords; "shyness" repulsion physics; pentatonic C3–A4; ambient pad; zero permissions. |
| 142 | `/dream/120-kids-rain-drum` | `demoable` | 4 clouds drop pentatonic notes (C3/E3/G3/A3); tap cloud to cycle rain/snow/leaves; different physics + timbre per weather; consonant combination always; ambient pad; zero permissions. |
| 140 | `/dream/118-kids-mirror-melody` | `demoable` | Draw on either half → instant mirror on opposite half; Y=pitch; rose left, cyan right; both voices panned opposite; 7s fade trails; multi-touch; ambient C–G–C pad; zero permissions. |
| 130 | `/dream/109-kids-bounce-notes` | `demoable` | Gravity+elastic physics; 4 walls play pentatonic notes (bottom=C3 deep, top=A4 bright, sides=mid); tap to spawn up to 5 balls; flash glow on impact; autonomous music — no repeated gestures needed; zero permissions. |
| 128 | `/dream/108-kids-kalimba` | `demoable` | 8 height-varied bars (violet→pink); tap to pluck KS synthesis; taller=lower; drag=glissando; multi-touch; demo auto-arpeggios then yields; zero permissions. |
| 122 | `/dream/104-kids-mirror-draw` | `demoable` | Draw anywhere → mirrors instantly across center axis; Y=pitch (top=high); lift to play melody; paths fade 7s. Zero permissions. |
| 120 | `/dream/102-kids-echo-song` | `demoable` | Bird sings 2–4 note phrase → child taps 5 colored circles to reply → bird echoes child's notes + adds one new note. Call-and-response loop. Phrases grow each round. Zero permissions. |
| 118 | `/dream/100-kids-paint-song` | `demoable` | Draw a finger path → lift → melody plays. X position = pitch (C3 left → A4 right, pentatonic). Each dot flashes on its note. Paths fade in 6s. Zero permissions. |
| 116 | `/dream/99-kids-panning-safari` | `demoable` | 5 animals drift L/R, each panned to X position via StereoPannerNode; tap for call; auto-plays; 🎧 headphones |
| 92 | `/dream/82-kids-color-piano` | `demoable` | 8 pentatonic circles, pointer glissando, no reading — **Karel loved ❤** |
| 96 | `/dream/83-kids-tilt-rain` | `demoable` | DeviceOrientation tilt → basket catches colored drops → pentatonic notes; melody replay — **Karel loved ❤** |
| 98 | `/dream/88-kids-hum-to-paint` | `demoable` | Hum/sing → glowing blob brush: pitch = color + Y, loudness = radius; 30s session; scan-line melody replay |
| 100 | `/dream/90-kids-puddle-jumper` | `demoable` | Tap pond → stone splash + pentatonic bloop; ripples expand + reflect off edges; zero permissions; ambient pad |
| 102 | `/dream/91-kids-character-band` | `demoable` | 5 animal characters, tap each → distinct melodic phrase; Toca Band-style; all phrases harmonize by construction; sparkle particles |
| 104 | `/dream/92-kids-ghost-lullaby` | `demoable` | Karel's Ghost floats starry sky; tap/drag → pentatonic note (Y=pitch); lullaby after 2 min; zero permissions; 80 px hit radius |
| 106 | `/dream/93-kids-share-screen` | `demoable` | Two simultaneous voices (violet + rose); Y→pentatonic pitch; pointer capture; animated connecting line; pentatonic = no wrong notes |
| 108 | `/dream/94-kids-ghost-echo` | `demoable` | Tap anywhere → Ghost appears + plays note (Y=pitch); up to 8 Ghosts coexist, each drifts + fades after 4s; "spirit pond" multi-tap |
| 110 | `/dream/95-kids-breath-bubbles` | `demoable` | Blow into mic → bubbles float up + pop; RMS amplitude → size + spawn rate; tap for manual bubbles; demo mode auto-breathes |

---

## New ideas — Cycle 126 research sweep

All six are zero deps · zero API · zero permissions unless noted.

### `kids-kalimba` ✓ built Cycle 128 — `/dream/108-kids-kalimba` `demoable`
Eight vertical glowing bars in a row, heights varied (tallest = lowest pitch C3, shortest = highest A4). Tap any bar to pluck it — Karplus-Strong synthesis (same pre-computed ring-buffer approach as `105-pluck-field`, simplified for 8 pitches). No note names shown; the physical analogy teaches itself (longer bar = lower note, like a real kalimba tine or guitar string). Drag across bars for a glissando; multi-touch plucks multiple bars simultaneously. Soft ambient C-E-G pad from first tap. Bars glow and ripple on pluck; glow decays with the ring buffer. Demo auto-arpeggios until first touch, then stops. 8 C-major pentatonic notes — no wrong combinations. Zero deps, zero permissions.

### `kids-bounce-notes` ✓ built Cycle 130 — `/dream/109-kids-bounce-notes` `demoable`
A glowing ball bounces inside the canvas with realistic physics (gravity, elastic wall reflection, slight energy loss). Each collision with the bottom wall plays the lowest pentatonic note; top wall plays the highest; left/right walls play mid notes. Ball color matches its current energy level (bright on impact, dims between). Tap anywhere to spawn another ball (max 5 coexist). More balls = richer self-playing music. Zero permissions, no tap targets required — children just tap and watch. Infinite play, no fail state.

The music is completely autonomous — the child doesn't have to "play correctly." They spawn balls and the physics makes music. Very different from all existing kids prototypes (which require active gesture per note). Inspired by Bouncy (ebraminio, open-source) and the "Sound Drop" paradigm.

### `kids-shape-loop` ✓ built Cycle 132 — `/dream/111-kids-shape-loop` `demoable`
Draw a closed shape with your finger (the loop closes automatically when the path returns within 42px CSS of its start — shown by a dashed ring). A traversal dot orbits the perimeter, triggering a pentatonic note at each of the evenly-spaced trigger points (N = clamp(3..12, round(perimPx/92px))). Y position = pitch (top=high, bottom=low). The shape loops forever. Draw multiple shapes — each loops independently as a polyphonic layer. Tap an existing shape to erase it. No tempo control, no mode picker — just draw and hear.

Inspired by Shape Your Music (Elias Jarzombek, shapeyourmusic.dev) but simplified for a 4yo: no polygon vertex placement, no export, no settings — just freehand draw. A child who draws a rough triangle hears 3 notes looping; a jagged scribble hears 8–12 note loops. Different from `100-kids-paint-song` (linear path, one-shot playback) and `104-kids-mirror-draw` (bilateral symmetry): this creates LOOPING layers, enabling additive composition through drawing.

### `kids-conductor-wand` ✓ built Cycle 134 — `/dream/113-kids-conductor-wand` `demoable`
A glowing conductor's wand follows the child's dragging finger. Y-position of the wand = register (high = bright, light treble voices; low = deep bass voices). Horizontal sweep speed = tempo (fast left-right arc = faster music, slow drag = slower). Quick center tap = percussion hit. Leftward arc = strings enter; rightward arc = winds enter; downward swipe = all instruments swell. Four preset "orchestras" (Kids Playground, Space, Forest, Ocean) selectable before conducting.

The wand leaves a rainbow color trail. Music is never silent — there's always a drone holding from the last gesture. Zero notes, zero reading, zero fail state. The finger IS the conductor's baton. Inspired by conducting gesture research (arxiv 2604.27957, Apr 2026) adapted to touch-only (no MediaPipe/camera needed).

### `kids-weather-music` ✓ built Cycle 136 — `/dream/115-kids-weather-music` `demoable`
The screen is divided into four weather quadrants: sun (top-right), cloud (top-left), rain (bottom-left), wind (bottom-right). Hold anywhere on the screen to "be in" that weather zone and hear+see its music: sun = bright C-major arpeggio + radial golden rays; cloud = soft minor pad + grey bloom; rain = pentatonic drops + falling blue specks; wind = glissando runs + swirling particles. Drag slowly across zones to morph the music and visual blends continuously.

No text labels needed — the visuals communicate instantly. Multi-touch: two fingers in different zones blend both musics. The "drag from sun to rain" gesture produces a natural musical diminuendo that a 4yo will discover by accident. Completely different from existing kids prototypes (no notes to tap, no characters to find — just the whole screen IS the instrument).

### `kids-bloom-garden` ✓ built Cycle 138 — `/dream/116-kids-bloom-garden` `demoable`
A dark canvas. Long-press anywhere to plant a glowing musical flower at that point. The flower grows with a 650ms animation (bud → bloom) and plays a sustained pentatonic note (X position = pitch, C-major pentatonic, violet/low at left → rose/high at right). Up to 12 flowers coexist. After 10 seconds a flower "seeds" — it disperses sparkle petals and a new smaller bud sprouts 30–62px away, inheriting its pitch ±1 step. Over time, the garden self-organizes into a harmonic cluster. Tap any flower to burst it into sparkles (pop note + noise burst).

Very contemplative — designed for the "quiet play" moment just before sleep. No goal, no fail state. The child plants sounds and watches them breathe and multiply. The self-seeding mechanic means the garden is never static — it slowly drifts across the screen over many minutes.

---

## Research log for Kids

### Cycle 182 — clap-back build

**Built**: `154-kids-clap-back`. Key learnings:

- **WHEN vs WHERE is a genuinely new dimension.** All 153 prior kids prototypes reward the
  *location* of a gesture (tap this dot, drag in this zone, hold here). Clap Back rewards
  *timing* — the same tap at different beat positions produces different sparks. After 2–3 DEMO
  cycles a child starts aiming for the bright-circle moments rather than tapping randomly. This
  is rhythm internalization happening without any instruction or theory.

- **The three-color phase system communicates procedurally without text.** Violet = "watch me";
  green = "your turn!"; cyan = "tap it!" These map to universal color semantics (warm/caution →
  cool/go). A child who can't read still knows green means "do something now." The emoji labels
  (👀 / ✨ / 👆) reinforce the color without requiring literacy.

- **Starting with all-4-beats is pedagogically right.** Pattern 1 `[1 2 3 4]` teaches the 750ms
  pulse before any complexity. A child who internalizes this tempo gets the "feel" of the beat
  grid. When pattern 2 `[1 2 . 4]` arrives and beat 3 is dark, the child feels the absence —
  a rhythmic expectation is set up and violated. That's syncopation. It's taught by experience,
  not explanation.

- **±22% timing window at 80 BPM = ±165ms is the sweet spot.** Too tight (±10%) and even adults
  miss frequently; too loose (±35%) and every tap feels on-beat. ±22% matches the "good" window
  in standard rhythm game research. At 80 BPM the window is 165ms; at faster tempos it would
  tighten proportionally (which is why I chose a fixed 80 BPM rather than a BPM slider — keeping
  the window constant removes one variable).

- **Silence during the listen phase is the right design.** I initially considered adding faint
  timing ticks on non-active beats. Removing them was the right call: the visual circle pulse
  on active beats provides all the timing cues needed, and the silence gives the child's taps
  more sonic presence. When the only sounds are the ones the child makes, the rhythm feels owned.

- **Full-screen tap target collapses the "where to tap" question.** There's no circle to aim at.
  Tapping anywhere fires sparks. A 4yo doesn't have to coordinate spatial location AND temporal
  accuracy simultaneously — they can focus entirely on timing.

**Next kid-cycle ideas (Cycle 184)**:
- **`154-kids-clap-back` polish** — add 5 indicator dots in top-right showing which of the 5
  patterns is active. Currently the child has no sense of progression. ~10 lines.
- **New seed**: "connect-the-stars" prototype from KIDS.md Cycle 180 — stars are pre-placed,
  child draws lines between them to "unlock" the notes. Each completed connection plays the
  interval. A completed triangle = a chord. Different from `152-kids-star-paint` (that one
  creates stars; this one reveals them).

---

### Cycle 180 — star-paint build

**Built**: `152-kids-star-paint`. Key learnings:

- **Delayed arpeggio creates a "gift from past self" experience.** All 151 prior kids prototypes produce
  sonic feedback within 50ms. Star Song's 16-second wait means the child draws, moves on, and then is
  surprised when the sky sings. In contrast to `142-kids-echo-canon` (1.5s canon gap) and `116-kids-bloom-garden`
  (10s seed-to-flower) which have short and medium delays, 16 s is long enough that the child has likely
  started a new constellation before the first one arpeggios. The delayed arpeggio feels like an external
  event, not a response to a gesture — the sky has its own agenda.

- **KS synthesis for drag-triggered notes requires pre-computed buffers.** At C3 (131 Hz), the KS delay
  line has P = round(44100/131) ≈ 337 samples. Computing this on pointer move events would be fine (40 ms
  max) but creates an allocation spike. Pre-computing all 9 buffers at `handleStart` (~15 ms total)
  eliminates any in-gesture stalls. This is the same pattern as `143-kids-seed-song` and `105-pluck-field`.
  Generalizable rule: pre-compute KS buffers for any fixed pitch set; lazy-compute only for variable-pitch
  instruments (like `140-kids-string-bridge` where distance = pitch and the range is continuous).

- **`while (draft.dist >= STEP_PX)` not `if`** is critical for fast drags. A quick finger swipe can
  accumulate 120 px between `pointermove` events on a high-latency mobile frame. With `if`, the 3rd star
  would be skipped. With `while`, all 3 stars emit in the same event (at the same position — the endpoint
  of the move). This causes a brief cluster of stars, which looks fine and sounds like a chord. The
  per-star carryover (`draft.dist -= STEP_PX`) ensures precise star-spacing over the whole drag.

- **Y = pitch (C3 bottom, C5 top) is immediately self-discovering.** Unlike X = pitch (which requires
  understanding "left = low, right = high" — a spatial analogy), Y = pitch maps to the intuition "high
  up = high note" which children understand from watching birds (birds are high, voices go up for high
  notes). After two strokes — one low and one high — a 3-year-old understands the mapping. Verified
  across `100-kids-paint-song`, `104-kids-mirror-draw`, `140-kids-string-bridge`.

- **The hint text `"Draw across the sky ✦"` fades over 9 s** to avoid cluttering the sky during play.
  But it fades gradually (appears at 2s, stays until 6s, then decays). The fade-in delay prevents the
  hint from showing during the button press → canvas reveal transition (which can flicker on slow phones).
  Entering the 2s fade-in gives the AudioContext time to initialize before the first hint is visible.

- **Background stars must NOT respond to pointer events.** The canvas is `touch-none` (no pointer capture
  on background). All pointer events are explicitly captured only inside `onDown`. The 90 background dots
  are purely visual; they twinkle via `sin(ts * 0.0007 + phase)`. The random `phase` per star ensures
  they don't all twinkle in sync (which would look mechanical and distracting). This is the same pattern
  as `156-kids-orbit`'s golden-ratio star field (stable positions, no per-frame allocation).

**Next kid-cycle ideas (Cycle 182)**:
- **`147-kids-beat-pulse` v2 (clap-back mode)**: prototype plays a random 4-beat pattern (3 downbeats,
  1 skip), then goes silent with a "your turn!" ring. Child taps back in the blank bars. After 4 beats,
  compare timing. Non-judgmental: any timing produces sparks; on-beat timing produces bigger sparks.
  This has been deferred 6 kids cycles — really should just land. One-cycle build.
- **`152-kids-star-paint` polish**: spawn a demo constellation on first load (a pre-drawn arc from C3
  to C5) so the canvas is immediately alive. Shows interaction model before first touch. ~10 lines.
- **New seed**: a kids prototype about **musical constellations discovered by connecting stars** — the
  reverse of star-paint: stars are pre-placed, child draws lines between them to "unlock" the notes.
  Each completed connection plays the interval between the two stars. A completed triangle = a chord.
  Different from star-paint (star-paint creates stars; this one reveals them).

---

### Cycle 174 — beat-pulse build + wheel-song polish

**Built**: `147-kids-beat-pulse` + `135-kids-wheel-song` note-name flash. Key learnings:

- **The on-beat reward gradient works without any UI labeling.** The difference between 20 sparks
  and 9 sparks is immediately perceptible — 20 is a dense colorful explosion, 9 is a modest scatter.
  A child doesn't need to know "that was on the beat"; they just notice "that one was bigger!" and
  start trying to reproduce it. The gradient is the feedback; no score counter is needed.

- **18% of beat period as "on-beat" window is the right tolerance for kids.** At 70 BPM that's
  ±154ms. At 40 BPM (slowest setting) it's ±270ms — generous for a 3yo's motor control. At
  120 BPM it's ±90ms — challenging but still achievable for a 5yo. The 18% figure matches the
  "good" timing window from standard rhythm game research (DDR, Guitar Hero use ±150–200ms).
  The absolute-milliseconds version stays constant across tempos; a proportional version would
  tighten at fast tempos and loosen at slow tempos. Current version feels right at 70 BPM.

- **`beatPhase < 0.18 OR beatPhase > 0.82` is cleaner than `|beatPhase - 0| < 0.18`.** The
  boundary condition (beatPhase wraps at 1.0) means a tap at `beatPhase = 0.95` is 5% before the
  beat — very close to on-beat. The `> 0.82` branch catches this case cleanly. The naive `|phase| < 0.18`
  only catches the post-beat window. Both branches together cover ±18% symmetrically.

- **The progress arc is a subtle adult affordance.** A 4yo doesn't need it — they just tap. But a
  parent watching or an older child explicitly trying to sync will use the arc as a countdown.
  It costs nothing (one `ctx.arc()` call per frame) and never distracts from the circle.

- **Note name inside the circle (not above it)** is the right placement for the beat-pulse prototype.
  The circle is large and centered; the note name appears at the centroid. On a phone screen at
  arm's length, text at the circle center is at a comfortable focal distance and reads naturally.
  The wheel-song polish puts the name above the striker (outside the wheel) because the striker
  is the relevant location; beat-pulse has no striker, so inside the circle is the natural home.

- **`135-kids-wheel-song` note-name flash — 14-cycle deferral was too long.** The edit was 12
  lines across two locations (`noteFlashRef`/`noteSegRef` refs, startup chime, striker detection,
  decay loop, draw section). None of it was complex. The repeated deferral in favor of "more novel
  builds" was a judgment error — simple polish items like this compound in value when they've been
  identified as meaningful. Future rule: polish items with a clear line count estimate (< 20 lines)
  should be bundled with the next new build rather than deferred indefinitely.

**Next kid-cycle ideas (Cycle 176)**:
- **`147-kids-beat-pulse` v2** — add a "clap-back" mode: the prototype plays a 4-beat pattern,
  then goes silent for 4 beats while a "your turn!" indicator glows. Child taps back the pattern.
  Extends from open-ended beat tapping to structured call-and-response rhythm.
- **`145-kids-dot-seq` v2** — second row of dots (6 more, different color, higher octave or
  percussion sounds). Child builds a 2-track loop. Consistent with Karel's love of `111-kids-shape-loop`
  ❤️ (additive layering). One-cycle build.
- **New seed**: a kids prototype about **color mixing and sound**: three large overlapping circles
  (red, yellow, blue — primary colors). When circles overlap, the overlap zone plays a harmony note
  (red+yellow = orange zone = major third, etc.). Dragging circles changes the overlaps in real time.
  Visual color theory + auditory harmony theory as the same interaction.

---

### Cycle 172 — dot-sequencer build

**Built**: `145-kids-dot-seq`. Key learnings:

- **Full-column tap zones solve the narrow-column problem.** With 6 columns on a 375px phone, each column is ~62px wide — close to the 64px minimum but not ideal as a disc hit target. Using the full column height as the Y-axis of the hit zone (any tap within the column, regardless of Y) gives an effective target of ~62px × ~280px. A 4yo's rough motor control will hit this reliably. The visual dot is centered in the column; the tap zone is much larger than the dot. This is the same design insight as `113-kids-conductor-wand` (whole screen = one instrument).

- **Note-on-tap is load-bearing for understanding.** When the child taps a dot, `playTone` fires immediately. This creates a two-part feedback loop: (1) tap → note plays NOW, dot glows; (2) cursor arrives → note plays AGAIN, dot flashes. After 2–3 taps, the child understands: "I decide what dots light up; the cursor decides when they play." Without the immediate tap-note, the child has to wait for the cursor to confirm their action — too slow for a 4yo.

- **`phaseRef.current` accumulating past `N` and wrapping is cleaner than `% N` per frame.** `phaseRef.current += stepsPerSec * dt; if (phase >= N) phase -= N;` maintains sub-step precision across frames. Using `% N` would subtly discard fractional phase on each wrap, causing cumulative drift at non-integer BPM rates. The subtraction wrap is exact.

- **Step detection via `Math.floor(phase) !== prevStep` fires once per column entry.** The cursor sweeps from the left edge of each column. The note fires as the cursor enters, then the cursor passes through the dot (at column center, phase = i + 0.5). This gives a "leading edge" trigger — the sound fires just before the cursor reaches the dot center. Slightly early but imperceptible at most BPMs.

- **80 BPM default + 16 BPM steps gives a usable range for kids.** At 40 BPM: ~1.5s between notes, very slow but a patient child can hear each note distinctly. At 160 BPM: ~375ms between notes, fast enough to hear a looping melody. The ±16 BPM step means 8 button presses to go from min to max — never feels like turning a dial endlessly.

- **Ambient C3/E3/G3 pad prevents the "is it broken?" moment.** A child who starts the prototype and sees 6 dim dots with no sound will assume the app failed. The ambient pad (gain 0.007, barely audible) is the "heartbeat" — there's already sound in the room before the first tap.

**Next kid-cycle ideas (Cycle 174)**:
- **`135-kids-wheel-song` note-name flash** — queued 14 kids cycles (since Cycle 160). Really should just land. ~10 lines above the striker, `text-white/75`, 600ms fade.
- **`145-kids-dot-seq` v2** — add a second row of 6 dots below the first (different color, different octave / percussion sounds). Child builds a 2-track loop. Or: add a "record" button so the child can tap in a rhythm and have it auto-populate the dots.
- **New seed** — a kids prototype about **tempo and body**: a large circle pulses at a BPM; child taps the circle to match the pulse rhythm; colored sparks appear on each match. Teaches beat-matching (clapping along to music) in a visual way.

---

### Cycle 156 — orbit-garden build

**Built**: `131-kids-orbit`. Key learnings:

- **Kepler-like period ratios create natural polyrhythm.** Periods 3.5 / 5.0 / 7.0 / 9.5 / 13.0 seconds — chosen to avoid simple integer ratios (e.g. 2:1 would be boring). With all 5 active, the patterns take a very long time to repeat, so the music never sounds mechanical. The child doesn't know what polyrhythm is; they hear that it sounds interesting and unpredictable.
- **"Tap to teleport" is accidental jamming.** Tapping an occupied ring moves the planet to the new angle and fires the note immediately. This means rapid taps on the same ring produce a rhythmic burst of notes at that pitch. A parent or curious child will discover this "jamming" mode without instruction — it feels like playing a percussion instrument. This interaction was not planned; it emerged from the simple "replace on tap" rule.
- **Trail arc must clamp to `min(π/3.5, ball.phase)`.** Without the clamp, a ball placed at phase=0 would show a trail arc extending "behind" it into a region it hasn't traveled yet — visually wrong. The clamp makes the trail grow from 0 to full length over the first ~1.5 seconds of orbit. Much cleaner.
- **Canvas arc angle conversion: `canvas_angle = my_angle - π/2`.** My convention: angle=0=north, increases clockwise. Canvas convention: angle=0=east, increases clockwise in screen space (y-flipped). Conversion verified: at my_angle=0 (north), canvas_angle=-π/2 correctly places the arc start at the top of the circle.
- **Golden-ratio star positions (`sin(s * 2.39996)`, `cos(s * 1.61803)`)** give visually uniform star distribution without any random allocation per frame. Star positions are stable across frames — no flickering, no Array creation per render. Zero garbage collector pressure.
- **1 planet per orbit band is the right constraint.** Allowing multiple planets per band would require complex collision detection and remove the "one color = one note" simplicity. The child quickly learns "violet is the big slow outer planet that plays the low note." 5 planets × 5 pitches × 5 speeds = rich enough interaction for many minutes of play.
- **Ambient C2 + G2 drone** at 0.011 / 0.008 gain — barely audible as a separate sound, but the space feels "alive" when no planets are active. The drone is pure sine, not triangle, so it blends as a felt warmth under the bell tones rather than competing.

**Next kid-cycle ideas (Cycle 158)**:
- **`kids-ripple-pond`**: ✓ **built Cycle 158** — `/dream/133-kids-ripple-pond`
- **Polish `131-kids-orbit`**: consider a "north gate" sparkle on each active orbit ring — a small bright flare at the top of the ring when a planet passes through it (completes an orbit). Visually shows the trigger moment. ~10 lines.
- **Kids research sweep** if queue is thin at Cycle 158.

---

### Cycle 170 — seed-song build

**Built**: `143-kids-seed-song`. Key learnings:

- **Patient growth is a genuinely new interaction mode.** All 38 prior kids prototypes produce a sound+visual response within 50ms of a tap. Seed Song is the first where the primary reward takes 20 seconds to arrive — a child taps once and then watches. The Karplus-Strong plucks that fire over 20 seconds are not reactions to more taps; they are the system's autonomous voice. This creates a different relationship: the child is an observer of something they initiated, not a performer of repeated gestures.
- **Pre-computing KS buffers at start avoids rAF stutter.** Building the 5 Karplus-Strong buffers (one per pitch/depth) in `handleStart` costs ~5ms total. Each pluck then just creates an AudioBufferSourceNode (cheap) and starts it. Without pre-computation, building a buffer during rAF (when a branch completes) would take 1–3ms and cause a visible frame drop — noticeable because the branch "pops" at the moment of pluck. Pre-computation is the right pattern for any prototype with many scheduled playback events.
- **Upfront segment generation + interpolated reveal is the right rendering architecture.** Computing all segments at plant time gives deterministic timing (segment N always has a specific tStart/tEnd regardless of frame rate). The rAF loop then just interpolates each segment's current endpoint and draws it — no branching logic inside the hot path. Alternative (computing each branch lazily when its parent completes) would require state management and could miss frame deadlines.
- **Alternating ±25°/32° per depth level gives organic but not chaotic shapes.** Even depths = 25° spread (tighter forks); odd depths = 32° (wider). With ±4° jitter, each tree is unique while remaining recognizably tree-shaped. A constant angle (25° throughout) produces too regular a shape; purely random angles produce messy tangles. The alternating pattern echoes how real trees branch (major branches tighter near trunk, wider at tips).
- **Wind layer at gain 0.038** is a design choice informed by `116-kids-bloom-garden`'s ambient pad (gain 0.02). The wind should be felt, not heard — audible only on headphones, invisible on phone speakers. This prevents audio fatigue for parents while maintaining the "living space" quality that makes the canvas feel inhabited even before the first tree.

**Next kid-cycle ideas (Cycle 172)**:
- **`135-kids-wheel-song` polish** — note-name flash above striker (queued since Cycle 160, now 12 kids cycles). Should finally land. ~10 lines.
- **`143-kids-seed-song` polish** — (a) seed-drop animation: a brief downward arc before the seed glow appears (stone-drop metaphor from `133-kids-ripple-pond`); (b) "Clear forest" button appearing 30s after last seed, letting the child start over; (c) ambient C3+E3+G3 triangle pad at gain 0.010 from first tap, underneath the KS plucks.
- **New seed**: a kids prototype about **visual sequencer** — 8 colored dots in a row (C-major pentatonic); a cursor sweeps left-to-right at a settable BPM; tap any dot to toggle it on (it glows). The cursor hits lit dots and plays their note. Children build 1-bar loops by tapping dots. Zero permissions, zero text, pure visual grid. First kids prototype about rhythm construction.

---

### Cycle 168 — echo-canon build

**Built**: `142-kids-echo-canon`. Key learnings:

- **Canon polyphony is the first genuinely new interaction paradigm in 8 kids cycles.** Cycles 160–166 built prototypes that are reactive (tap/hold → immediate note). Echo Canon is the first in that run that has a *temporal gap* between input and output — the 1.5s silence window. A child who taps randomly and then waits discovers the echo without any instruction. The 1.5s is long enough to be surprising but short enough that a 3yo won't forget what they played.
- **Perfect-fifth transposition from C-major pentatonic is always consonant.** C3→G3, E3→B3, G3→D4, A3→E4, C4→G4. Three of the five (G3, E4, G4) are in the key; B3 and D4 are passing tones that blend naturally. No combination of pentatonic taps + 5th transposition produces a dissonance. This is the same "pentatonic does the harmonic heavy lifting" principle used in `133-kids-ripple-pond` (collision chords) and `90-kids-puddle-jumper` (X=pitch mapping).
- **Y-shift as pitch-rise metaphor is immediately readable.** Voice 1 dots appear at the tap Y. Voice 2 dots appear 27% above. Voice 3 dots appear 54% above. A child watching their echo can see the dots rising even if they don't consciously register "higher pitch = higher on screen." The visual and audio cues reinforce each other. After 2-3 phrases, the child will start placing taps deliberately to control where the echo dots go.
- **Web Audio `osc.start(when)` is the right primitive for canon scheduling.** All notes for all three voices are scheduled before the first note fires. The canon timing (550ms gap) is embedded in the `when` parameter, not in setTimeout chains. This gives microsecond accuracy across all three voices. `setTimeout` chains would drift and the voices would sound sloppy; precise scheduling makes the canon feel intentional.
- **rAF visual check `actx.currentTime >= note.when - 0.008` gives sub-frame accuracy.** The 8ms look-ahead compensates for rAF jitter — the dot appears in the same frame as the audio, not one frame after. Without the look-ahead, the visual consistently lags the audio by one frame (17ms at 60fps), which feels disconnected.
- **"Playing" state blocking new input is essential.** If taps were accepted during canon playback, a child excited by the echo would immediately start a new phrase, interrupting the second and third voices. The blocking state prevents this without any UI feedback — the taps simply don't register, and when the echo finishes the canvas returns to idle naturally.

**Next kid-cycle ideas (Cycle 170)**:
- **`135-kids-wheel-song` polish** — note-name flash above striker (queued since Cycle 160, now 10 kids cycles). The most deferred item in the kids queue. Should finally land next kids cycle unless a more novel build is seeded.
- **`142-kids-echo-canon` polish** — (a) pulsing ring at canvas center during 1.5s silence gap ("waiting for echo"); (b) mic mode: detect hummed pitches via autocorrelation, echo them back transposed. Both <30 lines each.
- **New seed** — a kids prototype about **visual rhythm**: a row of 8 colored circles (pentatonic scale); a "cursor dot" sweeps across them left-to-right at a settable tempo; when the cursor hits a circle, that note plays. Children tap circles to toggle them on/off, building a 1-bar loop sequencer. "Draw your melody by tapping dots." Zero permissions, zero text — sequencer as pure visual grid.

---

### Cycle 166 — string-bridge build

**Built**: `140-kids-string-bridge`. Key learnings:

- **Distance-as-parameter is a genuinely new interaction class.** 36 prior kids prototypes respond to finger *position* (X/Y), *duration* (hold time), *path* (draw gesture), or *physical velocity* (tilt, collision). This is the first that responds to the *relationship* between two simultaneous contacts — the distance between them. A child with two fingers spontaneously discovers: squeeze together → pitch rises. Pull apart → pitch drops. This maps to the physical law of string instruments without any label or instruction.
- **Single-finger anchor at center is the discovery path.** A child who starts with one finger experiences the thereminvox mode (distance from center = pitch). When a second finger appears, the anchor "moves" to that finger and the thereminvox becomes a string. The transition is seamless — the child never needs to understand "now I'm in two-finger mode." They just notice the string is stretching between their hands.
- **Visual vibration rate proportional to pitch is subtly educational.** A 4yo watching C2 sees a slow wobble (0.8 Hz). Watching C5 sees a faster vibration (5.5 Hz). After a few plucks at different distances, the child builds a mental model: "when I hold them close, the string shakes faster." This is the correct physical intuition about string frequency without any physics instruction.
- **Pluck-threshold of 12 px is right.** Too small (5 px) and normal finger tremor fires constantly — too noisy. Too large (30 px) and you need deliberate movement to hear anything — feels unresponsive. At 12 px, slow pinching produces a smooth pitch glide (oscillator retunes without pluck), while fast snapping produces a bright pluck burst. Two behaviors from one gesture threshold.
- **`sin(π×t) × cos(2π×phase)` is the cleanest standing-wave formulation.** The `sin(π×t)` factor gives the mode shape (0 at both ends, max at center). The `cos(2π×phase)` oscillates the whole shape back and forth. Together they produce a standing wave in 3 lines. No traveling-wave artifacts, no aliasing, clear node-at-endpoints physics.
- **Amplitude floor 0.18 while held prevents "dead string" visual.** Without a floor, a held but unplucked string would decay to invisible (0) within 1 second of the last pluck. With the floor, the string stays faintly visible at the last plucked shape — it looks like a sustained string that's still vibrating below the visual threshold. On release the floor is removed and it fades to 0 in ~0.4s.

**Next kid-cycle ideas (Cycle 168)**:
- **`135-kids-wheel-song` polish** — note-name flash above striker when a segment passes. Has been queued since Cycle 160. ~10 lines, one-file edit.
- **`140-kids-string-bridge` polish** — (a) second harmonic overtone (+2nd oscillator at 2×freq, gain 0.10) for richer string timbre; (b) 3-finger chord variant: when 3 fingers are held, draw 3 strings between each adjacent pair (triangle formation), each tuned to the pairwise distances. May require 2-cycle implementation.
- **New seed**: a kids prototype about **echo/canon** — the child hums or taps a 4-note phrase; after 2s silence the phrase echoes back transposed up a 5th (7 semitones). Second echo at +octave. Three overlapping voices, never dissonant (pentatonic). "Your phrase comes back higher."

---

### Cycle 162 — hold-glow build

**Built**: `137-kids-hold-glow`. Key learnings:

- **Hold-duration as musical parameter is genuinely different.** All 35 prior kids prototypes produce notes on `pointerdown`. This is the first where the duration of the hold — the space between down and up — IS the composition. The child learns: hold longer = more light = longer sound. The mental model is simpler than velocity (harder to control) and more physical than counting beats.
- **Release ring speed scaling with holdSec creates a "stored energy" metaphor.** A long hold launches a fast big ring; a quick tap produces a small slow ring. The contrast is large enough that a 3yo will discover it by accident after two taps of different lengths. No instruction needed — the physics does the communicating.
- **Saturation at t=4s prevents infinite growth anxiety.** Without a cap, children (and adults) might keep holding forever waiting for something to "happen." Saturating at 4 seconds means the orb reaches its maximum and stabilizes — visually communicating "you're here, this is the peak." The ring on release can still be differentiated by whether you held 4 seconds vs 6 seconds (ring speed still scales with hold), so there's still reward for patience beyond 4 seconds.
- **`Math.max(0.12, 0.08 + holdSec * 0.12)` for release fade length** creates a satisfying natural decay: a 0.2s tap fades in 0.10s (punchy), a 3s hold fades in 0.44s (soft exhale), a 5s hold fades in 0.68s (long resonance). Matches the intuitive piano-sustain analogy — longer press = longer decay.
- **`actx.close()` in cleanup is cleaner than stopping individual oscillators.** If the component unmounts while fingers are still held (navigation, page reload), `actx.close()` kills everything immediately. The previous pattern (`for (const orb of activeRef.current.values()) { try { osc.stop() } }`) required try-catch for already-stopped oscillators and still left the AudioContext running. Closing the context is one line, zero error handling needed.
- **`performance.now()` and rAF timestamp are in the same coordinate system.** `orb.startMs = performance.now()` at pointerdown; `nowMs = ts` from rAF callback. Both are DOMHighResTimeStamp in milliseconds from page load. `holdSec = (nowMs - orb.startMs) / 1000` is exact — no clock conversion needed.
- **`cursor: none`** in the canvas play mode removes the browser cursor, which would interfere with the glow at the touch point on desktop. On touch devices it's invisible anyway. This keeps the glow as the sole visual feedback for the touch position.

**Next kid-cycle ideas (Cycle 164)**:
- **`133-kids-ripple-pond` polish** — stone-drop animation at tap origin (dark concentric circle shrinking inward over 80ms) + edge-bounce rings (reflected secondary ring at screen edge). Both ~30 lines combined. Has been planned since Cycle 158 — now the top priority for the next kids cycle.
- **`137-kids-hold-glow` polish** — slow 0.5 Hz sinusoidal pulse on core radius (±6 px) while held. One extra `sin(nowMs * 0.001 * Math.PI) * 6` in the coreR calculation. Makes the held glow feel alive rather than frozen. ~3 lines.
- **New seed** — a kids prototype where two fingers interact: holding both creates a "connection" between them (a glowing rope between the two orbs that vibrates as an audible string). The rope pitch = distance between fingers (closer = higher). Extends `Hold & Glow`'s duration metaphor into spatial relationship.

---

### Cycle 160 — wheel-song build

**Built**: `135-kids-wheel-song`. Key learnings:

- **Cumulative angle (thetaRef) rather than wrapped angle is essential for striker detection.** Using `theta = theta % (2π)` would reset the boundary counter every rotation, losing track of which segment is entering. Keeping theta unbounded and using `floor(theta / SEG_ARC)` gives a monotonically increasing count that only ever fires each boundary once.
- **Minimum omega (0.3 rad/s) prevents the musical dead zone.** Without a minimum, the wheel could slow to near-zero and the prototype would go silent for long periods. A floor of 0.3 rad/s means a note fires at most every 4.2 seconds — still sparse but never silent. The child can always return and find the wheel still going.
- **Segment flashes are per-segment scalars, not array-of-objects.** `segFlashRef = useRef([0,0,0,0,0])` is simpler than an array of flash objects and avoids the need to search/filter on each frame. Each `segFlashRef.current[k]` just decays linearly. Since a segment can't fire again before its previous flash has substantially decayed (the minimum inter-fire time at max speed is 0.21s, flash decays in 0.25s), there's no overlap issue.
- **Startup chime is load-bearing.** Without it, the wheel looks like it's spinning but no note fires until the first segment boundary is crossed (~1.26s at omega=0.8). That gap makes the prototype feel broken. Playing C3 immediately on `handleStart` + setting `segFlashRef.current[0] = 1.0` gives instant audio+visual confirmation that the app is alive.
- **The rotation indicator dot is subtle but important for adults.** A 4yo doesn't need to understand which direction the wheel is spinning — they just tap and enjoy. But a parent watching will wonder "is it going clockwise?" The white dot orbiting the rim makes this immediately readable without any label.
- **`ctx.shadowBlur` glow on pie slices creates a halo that softens the geometry.** Without it, the 5 solid-color wedges look like a corporate chart. With shadowBlur proportional to flash state, the struck segment appears to glow outward into the dark background — the wheel "breathes" like a bioluminescent organism.

**Next kid-cycle ideas (Cycle 162)**:
- **`133-kids-ripple-pond` polish** — stone-drop animation at tap origin (dark concentric circle shrinking inward over 80ms) + edge-bounce rings (reflected secondary ring at screen edge). Both ~30 lines combined. Explicitly planned since Cycle 158.
- **`135-kids-wheel-song` polish** — note name flash above the striker when a segment passes through ("C3", "E3"...), visible for 600ms, text-white/75 at `text-sm`. Makes the prototype gently educational without being didactic.
- **New seed if needed**: a kids prototype about musical **duration** — a held tap produces a sustained note (how long = how long the note plays); the longer you hold the brighter the glow. Different from all existing prototypes (which respond to tap-down events, not hold duration). Contemplative, suitable before sleep.

---

### Cycle 158 — ripple-pond build

**Built**: `133-kids-ripple-pond`. Key learnings:

- **External tangency as the collision trigger is the right physics.** Two expanding circles first touch when r₁ + r₂ = dist(c₁, c₂). This gives a clean "moment of meeting" with no ambiguity. The collision point is at distance r₁ along the line from center₁ to center₂ — geometrically exact, one line of math.
- **Per-pair Set tracking prevents double-triggering.** Key format `"min_id:max_id"` is unique per pair, symmetric, and guaranteed not to collide (since IDs only increment). Once added to the Set, that pair never fires again. When all ripples expire the Set clears, so IDs never overflow in practice.
- **`ripplesRef.current.shift()` as overflow strategy is correct for kids UX.** Dropping the oldest ring is invisible to the child — it's already large and nearly transparent. The newest ring (just placed, small and vivid) is always visible. A FIFO overflow cap is simpler and more child-appropriate than a "max density" algorithm.
- **Caustic shimmer via 14 slow-drifting radial gradients costs almost nothing.** Each gradient covers a 28–125px radius. At 60fps, the fill operations on a mobile canvas (rendering to a DPR=2 texture) register as <1ms per frame. The `tSlow = ts * 0.00025` drift rate means one full period is ~25 seconds — slow enough to feel like water light, not an animation.
- **The inner secondary ring** (drawn at r − 18 when r > 22, opacity 22%) gives the rings visual depth without a second draw pass per ring — it's just a second `ctx.arc()` inside the same loop iteration with reduced opacity and no shadow.
- **C-major pentatonic guarantees all collision chords are consonant.** All 10 pairwise intervals from {C3, E3, G3, A3, C4}: m3, M3, P4, P5, M6, P8 — every one is a standard consonance. A child who taps randomly CANNOT produce a dissonant chord collision. This is the same design principle as `90-kids-puddle-jumper`, `109-kids-bounce-notes`, and `111-kids-shape-loop` — the scale does the harmonic heavy lifting.
- **The `uidCounter` module-level variable is fine for a client component.** It increments only in the browser, resets on hard reload (page refresh), and never exceeds the number of taps in a session (thousands at most). Safe and simple.

**Next kid-cycle ideas (Cycle 160)**:
- **`133-kids-ripple-pond` polish** — "stone drop" animation at tap origin: small dark concentric circle shrinking inward over 80ms before the ring begins expanding. Visually suggests a stone entering water. ~10 lines.
- **Edge-bounce rings** — when a ring reaches a screen edge, spawn a reflected secondary ring at reduced gain (treating the edge as a mirror). The child gets visual feedback that sound can "bounce" off walls. Keeps the pond active longer after a single tap.
- **Kids research sweep** if the above ideas feel thin — look at CHI 2026 proceedings on child-computer interaction, new Toca Boca releases, and Sound2Hap haptics (monitor iOS 26 Haptic Engine API).

---

### Cycle 154 — polish pass

**Built**: Polish pass on three prototypes in one commit.

- **`127-kids-starfish` tap-ripple ring**: expanding colored circle at CSS tap position (same color as the starfish hit), max radius = `sf.r + 52px`, fades over 300ms. The key implementation detail: `ctx.shadowBlur = 0` must be set explicitly at the top of the ripple draw section, because `drawStar()` sets `shadowBlur` and `shadowColor` without zeroing them, and the shadow state leaks past the enclosing `ctx.save()`/`ctx.restore()` block when the starfish section exits — the next context call outside that block inherits the non-zero shadow. Result: without the explicit reset, the ripple ring gets a glowing starfish-arm appearance instead of a clean ring. This is a general Canvas2D gotcha: `ctx.save()` preserves and restores shadow state correctly, but only if the intervening code is wrapped in the SAME save/restore scope. If you call `drawStar()` inside a save block and then draw outside the block, the shadow state from `drawStar()`'s own internal saves/restores still bleeds through.
- **`128-kids-fish-tap` splash ring**: identical pattern. 250ms duration (dt * 4 increment per frame since dt is in seconds), 62px max radius. Positioned at the fish's CSS coordinates at the moment of tap — the fish then drifts away as `stopped` decays velocity, so the ring stays at the "where it sang" location.
- **`82-kids-color-piano` opacity**: `rgba(255,255,255,0.55)` → `rgba(255,255,255,0.75)` for the "tap · hold · slide" hint. Queued 40 cycles; finally done.

**Next kid-cycle ideas (Cycle 156)**:
- **New kids prototype**: KIDS.md queue is thinning (no unseeded ideas after `109-kids-bounce-notes` v2 and `93-kids-share-screen` polish). If nothing stands out, do a targeted kids-research sweep on 2026 touchscreen music toys, CHI 2026 proceedings on child-computer interaction, and any new Toca Boca / Sago Mini releases.
- **Candidate**: a kids prototype exploring motion-in-a-circle / orbit — child taps to launch a glowing note-ball in orbit around a center point; balls at different orbit radii play notes at different speeds (inner = fast, high pitch; outer = slow, low pitch). Polyrhythm from physics. Zero permissions.

---

### Cycle 152 — fish-school build

**Built**: `128-kids-fish-tap`. Key learnings:

- **Boids reabsorption is the right "rejoin" mechanic.** When a stopped fish's velocity decays to near-zero and `stopped` reaches 0, the boids cohesion/alignment forces on the next frame pull it toward the school's average position and velocity. Within ~1.5s it has rejoined with no teleport, no snap, no explicit "resume swimming" code. The same physics that maintains the school also handles re-entry. This is a clean design: one set of rules, two behaviors.
- **"Stopped" hover vs. full velocity zeroing.** Decaying velocity (`f.vx *= 0.88` per frame) rather than zeroing it instantly creates a natural deceleration — the fish "brakes" over ~0.5s rather than stopping abruptly. Combined with the mouth animation over the same window, the fish appears to pause purposefully, open its mouth, sing, then gradually drift back to school speed. Instant zeroing would read as a freeze rather than a chosen stop.
- **64px hit radius for a moving target is right for 4yo.** All prior kids prototypes with moving targets (jellyfish, fireflies) used the nearest-within-radius approach. Fish are roughly 64px long, so a 64px hit radius from center covers most of the body. Tapping anywhere near a fish succeeds. Missed taps (no fish within 64px) are silent — no penalty, no confusion.
- **Boids velocity limits need both a max AND a min clamp.** Without a min clamp, separation forces can cancel the rightward bias and leave a fish nearly stationary mid-ocean (no visual motion). The `spd < 28` clamp keeps every active fish visibly moving. Without a max clamp, a fish emerging from `stopped` state (low velocity) gets pulled strongly by cohesion toward a fast-moving group and can briefly overshoot. The `spd > 95` clamp prevents the runaway.
- **Caustic shimmer uses ellipses, not radial gradients on circles.** `ctx.ellipse()` before a radial gradient fill produces an asymmetric light patch — the "right shape" for underwater caustics (elongated, tilted). Circular radial gradients produce symmetrical blobs that read more as "glowing dots" than "light filtering through water." The 4.5% global alpha keeps them barely perceptible — atmospheric texture, not a distraction.
- **One pitch per fish (not per tap) is essential.** The same rule as firefly-song. Violet is always C3. After 2–3 taps, the child knows "the purple fish makes the low sound." This is how color becomes a musical language — consistent association across repetitions. A fish that played a random note each time would undermine the learning.

**Next kid-cycle ideas (Cycle 154)**:
- **Polish `127-kids-starfish`**: add a tap-ripple ring — expanding circle at the tap point, fades over 300ms. ~15 lines. Makes the tap location visible on a large iPad screen. Still queued from KIDS.md Cycle 150 log.
- **`128-kids-fish-tap` v2**: add a faint "splash" ring at the fish's position when tapped — a brief expanding circle in the fish's color, fades over 250ms. Makes the sound source visually obvious. ~10 lines.
- **Polish `82-kids-color-piano`**: bump `text-white/40` → `text-white/75` hint text. One line. Queued since Cycle 114 — just do it.

---

### Cycle 150 — starfish build

**Built**: `127-kids-starfish`. Key learnings:
- **Chord-per-tap is a new paradigm for the kids zone.** Every prior kids prototype plays a single note on a single tap. `kids-starfish` plays 5 notes simultaneously. A 4yo won't know what a "chord" is, but they hear the harmonic richness immediately — it sounds fuller and more resonant than a single note. The natural comparison: pressing one piano key vs. pressing a full-hand chord. The bigger sonic impact rewards tap just as effectively as single-note prototypes, but opens up a new timbral dimension.
- **Consecutive pentatonic windows (noteBase 0–4) guarantee all multi-starfish combinations are consonant.** If two starfish share any notes (e.g., starfish 0 plays C3–C4 and starfish 1 plays E3–E4, sharing E3/G3/A3/C4), tapping them simultaneously layers the shared notes. Since all 9 notes are from C-major pentatonic, the worst-case collision is a unison (two copies of the same frequency) which sounds thicker, not dissonant. The design is deliberately structured so the child cannot produce dissonance by tapping anything in any order.
- **Arm-ripple wiggle via `(1−wiggle) × 5π` sweep creates a traveling wave.** As `wiggle` decays from 1→0, the `sin()` argument sweeps through 5π, cycling the wave ~2.5 times around the 5 arms. This means the last few frames of the wiggle decay still show motion (the wave is completing its final orbit), rather than suddenly freezing. The wiggle never "pops" to rest — it spirals to rest.
- **Static targets (vs. moving targets) shift the interaction mode from hunting to choosing.** Jellyfish drift, fireflies fly, star-catch objects fall — all require tracking. Starfish sit still and wait. A child with poor fine motor control (3–4yo) can tap the large amber starfish (r=52px, effective hit radius 74px) reliably. The prototypes with moving targets are exciting; stationary targets are accessible to younger children and lower-stress.
- **`const X` → arrow function pattern for TypeScript narrowing in nested closures.** The build fails if `resize`, `onPointer`, `frame` are written as `function` declarations inside a `useEffect` that captures a narrowed `const canvas`. Arrow functions (`const resize = () => ...`) propagate the narrowing correctly. This is documented in KIDS.md Cycle 132 and worth noting as an evergreen pattern.

**Next kid-cycle ideas (Cycle 152)**:
- **Polish `127-kids-starfish`**: add a brief tap-ripple ring (expanding circle at tap point, fades over 300ms) to make the interaction location more visible on a large iPad screen. ~15 lines.
- **New seed**: `kids-fish-tap` — a school of fish swim horizontally across the screen. Tap any fish → it briefly stops, opens its mouth, plays a note, then rejoins the school. Fish move in loose formation (simple flocking with cohesion + separation). Very different from jellyfish (horizontal vs. vertical drift; fish more directional than jellyfish; school formation = emergent visual). Zero permissions.
- **Polish pass**: `82-kids-color-piano` typography bump — has been queued since Cycle 114. `text-white/40` → `text-white/75` for hint text. One line, readability gain.

---

### Cycle 148 — jellyfish-song build

**Built**: `125-kids-jellyfish`. Key learnings:
- **EMA velocity recovery produces biological pulse motion for free.** After a downward nudge, the EMA (`vy += (baseVy − vy) × 0.015`) pulls vy back toward the base upward speed. At the transition point, the jellyfish momentarily stalls — then resumes floating. This matches real jellyfish pulse motion exactly, without any explicit "pulse" code. The physics is doing biological work.
- **BANDIMAL's size→pitch rule is immediately intuitive.** The biggest jellyfish (radius 46px, violet) plays C3; the smallest (radius 22px, teal) plays C4. Children who touch the largest one first hear the lowest tone; children who touch the small bright one hear the highest. After 2-3 interactions, they develop a mental model without any label or instruction. The same rule is why real pianos work (longer strings = lower pitch).
- **Top-to-bottom vertical wrap is better than wall bounce for upward-drifting entities.** A bounce would be jarring and unnatural. The wrap is invisible — the jellyfish exits the top and reappears at a random X at the bottom. From the child's perspective, new jellyfish keep appearing from the bottom of the ocean. The canvas feels alive and continuously replenished, not like five objects in a closed box.
- **Generous nudge detection (nearest jellyfish, no strict radius) is right for 4yo.** The interaction always succeeds — every tap nudges the nearest jellyfish. This is different from color-piano and firefly-song (which have explicit hit areas). The jellyfish prototype doesn't require aiming; the "nudge the nearest one" mechanic rewards any tap, anywhere on the canvas.
- **Bezier tentacle control points driven by `tentPhase` create organic wave motion.** Three bezier control points, each with sin/cos of `tentPhase` at different frequencies (×1.4, ×0.9, ×1.8 of base phase), produce tentacles that wave at slightly different rates. The result looks like hair in water — a naturalistic slow swaying that's never periodic-looking.
- **The pre-start silhouette preview is worth keeping.** Five dome shapes (color-coded, glow shadows) give a visual preview of what's coming before audio starts. This is more communicative than a blank screen + button, and more appropriate for parents reading over the child's shoulder.

**Next kid-cycle ideas (Cycle 150)**:
- **`kids-jellyfish` v2**: add a very faint size label on each jellyfish on first nudge (the note name C3–C4, opacity 0.25, same color, appears for 1.5s) — educational layer for parents.
- **New seed**: `kids-starfish` — a grid of asterisk-shaped starfish on the ocean floor; tap to make them wiggle + play a chord (5 arms = 5 notes of a pentatonic chord). Different from jellyfish: stationary targets, chord not single note, different visual metaphor.
- **Polish pass**: consider whether `125-kids-jellyfish` needs a "demo auto-nudge" mode (first 5 seconds, one jellyfish is nudged automatically to show the interaction). Currently the ambient pad plays but nothing moves until first touch; a brief auto-nudge would model the expected behavior.

---

### Cycle 144 — firefly-song build

**Built**: `122-kids-firefly-song`. Key learnings:
- **The "shyness" behavior was unplanned.** Pointer repulsion (uncaught fireflies push away when a pointer comes within 52 CSS px) was added to prevent accidental catches. But what emerged: if you approach SLOWLY, the firefly drifts faster than you're moving and escapes. If you approach FAST, you overtake the repulsion and catch it. The catch success rate correlates directly with approach speed — no explicit difficulty level, no score, no fail — just the natural physics. A 4yo approaches impulsively (fast) and catches most times. An older child discovers they can corner a firefly against a wall. Same code, emergent skill gradient.
- **Lissajous drift via rotating angle is cleaner than x/y velocity.** Storing `ff.angle` and doing `angle += rotSpeed` each frame gives the firefly a continuously curving path that's smooth and organic. The alternative (explicit vx/vy with random perturbations) produces jerkier, less natural-looking movement. The rotating angle approach naturally creates looping ellipses and figure-8 paths without any explicit path math.
- **Wall reflection with direction-conditional check is important.** The naive `atan2(sin, -cos)` reflection always flips the horizontal component, even if the firefly is already moving away from the wall (due to repulsion forces pushing it into the wall). Adding `if (Math.cos(ff.angle) < 0)` for left-wall reflection prevents the firefly from "stuttering" at a corner.
- **One pitch per firefly (not random on each approach) is essential.** If a firefly changed its note each time you caught it, the child couldn't predict what sound they'd get. Since `pitchIdx` is fixed at spawn, a violet firefly always plays C3. After 2-3 catches, the child learns "the purple one makes a low sound." This is BANDIMAL's core design insight applied to the catch mechanic.
- **The multi-touch chord is discovered by accident.** On the first play session, a child uses one finger. When they add a second finger (natural for touch-fluent children), two fireflies follow two fingers simultaneously. The sounds stack. The child hasn't been told "this makes a chord" — they hear the harmony emerge from their own gesture. Identical discovery mechanics to `93-kids-share-screen`.
- **`oscs.keys()` spread before iteration in cleanup**: `for (const id of [...oscs.keys()])` is necessary because `stopTone` calls `oscs.delete(id)` during iteration. Without the spread, modifying the Map while iterating would produce undefined behavior. Small but important correctness detail.

**Next kid-cycle ideas (Cycle 146)**:
- **Finally do bloom-garden press ring** — has been deferred 7 cycles. Pre-bloom expanding dashed circle at press point during 480ms hold. ~20 lines, one-file edit. Should just do it.
- **`kids-firefly-song` v2** — add a very faint "pitch label" on each caught firefly (tiny note name C3–A4 appearing for 1.5s on catch, same color, opacity ~0.35). Educational layer for curious parents, invisible to kids in play mode.
- **New seed**: `kids-jellyfish` — slow-moving translucent jellyfish drift up from the bottom. Touch to "nudge" them; each nudge plays a soft bell tone (triangle + convolver reverb). The jellyfish drifts in response to the touch direction. Multiple jellyfish develop a slow upward drift; they wrap when they reach the top. Each has its own "size class" → pitch (big = low, small = high). Fully autonomous if you don't touch — the ocean plays itself.

---

### Cycle 142 — rain-drum build

**Built**: `120-kids-rain-drum`. Key learnings:
- **Weather as tempo control (emergent)**. The three weather types have different spawn intervals (rain=28 frames, snow=50, leaves=38). A child who switches a zone from rain to snow isn't just changing the sound — they're slowing that voice down by ~79%. Four zones at mixed weather rates create polyrhythm driven purely by physics constants. A child who discovers this is implicitly adjusting tempo per voice. This wasn't the intended interaction but it's the most interesting one that emerged.
- **Consonance guarantee via zone pitch assignment** (not per-drop pitch). All drops in zone 0 play C3 regardless of where they land in the zone. This is the right design: the child thinks "zone 0 makes a low note," not "drop position = pitch." The spatial simplicity (zone = pitch) matches 4yo mental models. Compare to `100-kids-paint-song` where X position = pitch — that requires understanding a continuous mapping. Here it's discrete: four zones, four sounds.
- **65ms note throttle per zone** handles high-spawn rain without audio pops. Without it, four simultaneous rain drops landing in the same frame fire four notes at once, creating a brief crackling artifact. With the throttle, the first landing fires, the rest are suppressed — but since rain drops land within a single frame window and the spawn rate means the next group arrives ~28 frames later, the suppression is imperceptible.
- **`wxRef` (mutable ref) vs state** for weather types: updating a ref in `handlePointerDown` and reading it in the `tick` closure each frame works cleanly without any React re-render. The canvas redraws every frame so the new weather appears on the very next frame after the tap — under 17ms latency. Using `setState` would add a re-render cycle lag and require a sync `useEffect`. Refs are the right primitive for this pattern.
- **Snow snowflake visual** (6-arm star via line strokes + filled circle) is worth the 3× draw cost compared to a simple circle. Without the arms, snow reads as "tiny white circles falling" — could be rain drops. With the arms, it's immediately "snowflake" even at r=5–9px. Visual legibility of the weather type is essential for the child to understand what they changed.
- **Amplitude 0.013 for ambient pad** is at the edge of audibility. On a laptop speaker at medium volume it's imperceptible; on iPhone at low volume it's a very faint C-major hum. This is intentional — the pad is a "the app is alive" signal, not a compositional element.

**Next kid-cycle ideas (Cycle 144)**:
- **Polish `116-kids-bloom-garden`**: pre-bloom "press ring" indicator (expanding dashed circle at press point during 480ms hold). Specifically queued since Cycle 140. One-file edit, ~20 lines. Still not done.
- **New seed**: `kids-rain-drum` v2 — add a subtle pitch "landing note" indicator per zone (a horizontal glow stripe at the bottom of each zone that pulses when a drop lands, color = zone color). Educational layer: makes it clear that each column = one sound. Could also add zone-pitch labels (C · E · G · A) at the bottom in small monospace, text-white/40.

---

### Cycle 140 — mirror-melody build

**Built**: `118-kids-mirror-melody`. Key learnings:
- **The stereo mirror is the interaction** — no UI labels needed. A child who draws on the left immediately hears sound appear on the right. The cause-effect is spatial, not visual. This works because the pan offset (±0.55) is strong enough to localize on phone speakers, not just headphones.
- **Y=pitch across the full canvas height is the right mapping** (same as `100-kids-paint-song` and `104-kids-mirror-draw`). The mental model "higher up = higher note" is intuitive enough that a 4yo discovers it without instruction, and consistent across three prototypes now — a pattern worth preserving.
- **85ms note throttle is right for continuous drawing**. Too short (<50ms) → notes blur into a continuous tone (which sounds broken). Too long (>120ms) → feels unresponsive, especially for fast swipes. 85ms gives a clear pentatonic arpeggio on fast gestures, individual sustained notes on slow ones.
- **Mirror is panned opposite, not same-side**. Tempting to pan both direct and mirror to the same side (e.g., both left when drawing on left), but that loses the spatial "call and response" quality. Panning opposite makes the stereo duet immediately perceptible — the child draws on the left and hears a voice on the right answer.
- **Multi-touch with independent pointer throttling** enables parent+child simultaneous play. Each `pointerId` has its own last-note timestamp. Two simultaneous fingers never interfere with each other's note cadence.
- **Subtle half-tints (4% opacity)** tell the child where each color lives without text labels. Rose blush on the left, cyan tint on the right. Barely visible but subconsciously registers which side is which.
- **"Draw to play" hint at 35% opacity**: visible enough to find on a blank canvas, invisible enough not to distract during play. The canvas is never fully blank (ambient pad plays from button press), so the hint just signals that there's drawing to be done.

**Next kid-cycle ideas (Cycle 142)**:
- **Polish `116-kids-bloom-garden`**: add a faint expanding dashed ring at the press point during the 480ms hold (pre-bloom "loading ring"). Currently the bud appears without warning. A press ring would make the hold gesture feel more intentional. One-file edit, 20 lines.
- **New seed**: `kids-rain-drum` — screen divided into 4 zones; hold phone upright and drops fall from each zone's "cloud"; drops play notes on landing at the zone's pentatonic pitch. Tap zone to change its weather (rain/snow/leaves). Extends `83-kids-tilt-rain`'s gravity aesthetic without requiring DeviceOrientation permissions.

---

Keep a running log here of relevant findings the agent uncovers during kid-cycles (mirrors `RESEARCH.md` structure).

### Cycle 130 — bounce-notes build

**Built**: `109-kids-bounce-notes`. Key learnings:
- The `flash` parameter (0→1, decays at 2.2/s) is the key to making physics feel *physical*. Without it, a bouncing ball reads as a simulation. With the brightness burst on impact, it reads as a ball hitting a wall — the light feedback is the substitute for the haptic thud.
- Per-ball note cooldown (`NOTE_GAP = 0.1s`) is essential. At high velocities, a ball can hit a corner and "collide" with two walls in the same frame, firing two notes simultaneously. Without the cooldown, rapid rattling at a wall corner sounds chaotic. With it, only the first collision per 100ms registers — one note, clear and resonant.
- Spawning the ball at the tap position (not at center) teaches the interaction model without text: the child taps near the top, the ball appears there and falls. The spatial mapping is intuitive.
- `RESTITUTION = 0.86` is the right decay rate for this use case. 0.9+ keeps balls bouncing for too long and the canvas gets chaotic. 0.8 is too damped — balls settle in 5–10 seconds and the canvas goes silent. 0.86 gives a satisfying 30–60 second decay that lets the child explore between spawns.
- Pentatonic wall mapping (bottom=C3, top=A4, left=G3, right=E4) works musically — when multiple balls hit different walls, they always sound consonant (all from C-major pentatonic). No combination of wall collisions produces dissonance.
- The `NOTE_GAP` cooldown prevents rapid-fire but means a ball that hits bottom-left corner first hits bottom (C3), then has 100ms before it can fire again. It might hit the left wall (G3) too quickly and miss the note. This is acceptable — missing some notes is better than a chaotic burst.

**Next kid-cycle ideas (Cycle 132)**:
- `kids-shape-loop`: ✓ **built Cycle 132** — `/dream/111-kids-shape-loop`
- `kids-conductor-wand`: drag finger = conductor's baton; Y=register, speed=tempo. Four orchestras.
- Polish on `109-kids-bounce-notes`: ball-ball collision detection (they currently pass through each other). Would make multi-ball dynamics much richer.

---

### Cycle 138 — bloom-garden build

**Built**: `116-kids-bloom-garden`. Key learnings:
- **Long-press as primary gesture is unexplored territory in the kids zone.** All prior kids prototypes use tap (bounce-notes, kalimba, echo-song, puddle-jumper) or drag (conductor-wand, tilt-rain, mirror-draw, weather-music). Bloom garden is the first that rewards *waiting* — the child must hold for 480ms. This is a different emotional register: anticipation before reward. Tests with the KIDS.md mental model (4yo): a child who doesn't read taps first (burst mode), then holds (plant mode). The two behaviors are discovered in that order.
- **Close-proximity guard** (< 38px from any live flower prevents planting) keeps the garden readable. Without it, rapid pressing in one spot creates an overlapping glowing blob that's visually confusing and sonically muddy (12 oscillators in the same key, all at the same pitch). With it, the child naturally spreads the flowers across the screen to find plantable spots — which also distributes the pitches (X=pitch) and creates richer harmony.
- **Self-seeding note drift (±1 step) is a subtle musical composition engine.** A C3 flower (noteIdx=0) can only seed to E3 (noteIdx=1). An E3 can seed to C3 (0) or G3 (2). Over 4–5 generations, a single starting note evolves into a small cluster of adjacent scale degrees. Starting at the left side (C3) → seeds drift right toward E3 → G3. Starting in the middle (C4, noteIdx=4) → seeds spread in both directions. The garden's "center of harmonic gravity" is determined by where the child first plants. This wasn't planned; it emerged from the ±1 rule.
- **All-inside-effect architecture** (no JSX event handlers, all DOM listeners registered inside useEffect) eliminates react-hooks exhaustive-deps lint issues entirely. The closure captures everything it needs; stopFns Map and flowers array are fully local to the effect. Cleaner than useCallback + refs for this pattern.
- **`ctx.ellipse()` for petals** with bloomT-scaled radiusX/radiusY cleanly animates bud → bloom: at bloomT=0, radiusX=0 and radiusY=0 → nothing drawn (bud is just the center circle). At bloomT=1, full petal. The Math.max(0.1, petalW) guard prevents a degenerate-ellipse browser warning at very small bloom values.
- **Ambient pad at gain 0.02** (three sine oscillators, C3+E3+G3) is at the right level: audible to an adult listening closely, inaudible to a child in play mode. It just prevents the "is the app broken?" feeling between flowers.

**Next kid-cycle ideas (Cycle 140)**:
- **Polish `116-kids-bloom-garden`**: add a faint "press ring" indicator (expanding dashed circle at the press point during the 480ms hold) so the child can see the planting animation in progress. Currently the bud appears without visual warning. A pre-bloom "loading ring" would make the hold gesture feel more intentional.
- **New seed**: `kids-mirror-melody` v2 — draw on one half, hear it play as the mirror draws on the other. Both halves play simultaneously (left hand + right hand metaphor). Natural two-player mode.

---

### Cycle 136 — weather-music build

**Built**: `115-kids-weather-music`. Key learnings:
- **Bilinear zone weights are the right abstraction.** `xNorm × (1−yNorm)` for sun, `(1−x)(1−y)` for cloud, etc. — weights sum to 1 everywhere, interpolation is mathematically smooth, and no code distinguishes "inside a zone" vs "crossing a boundary." The child discovers blending by dragging; there's no mode switch.
- **Smooth exponential weights (α=0.12 EMA) are essential for sustained audio.** Without smoothing, lifting and replacing a finger would cause abrupt gain jumps that are jarring. With smoothing, the audio gracefully fades in and out. The time constant (~5 frames to 50% response) maps to about 80ms at 60fps — fast enough to feel immediate, slow enough for no pops.
- **Cloud + wind oscillators always running at low gain** provide the "no silence" ambient pad even before any touch. The Am chord (A3+C4+E4) + wind glissando together sound like a very quiet environmental hum. Kids (and parents) don't consciously hear it, but the screen feels "alive" from the first second.
- **Rain particles in the left half only** (x < 0.55W): reinforces the zone geography — rain looks like it's coming from the rain corner. Wind streaks in the right half (x > 0.5W). Visual zones match audio zones without requiring labels.
- **TypeScript narrowing in nested functions**: function declarations inside useEffect may cause "possibly null" errors for `canvas` even after a null check, because TypeScript doesn't propagate narrowing across hoisted function declarations. Fix: use `const drawFrame = (nowMs) => { ... }` (arrow function expression) — TypeScript maintains the narrowing in arrow function closures.
- **Multi-touch with max() per zone** creates interesting multi-finger play: one finger in sun (arpeggio) + one finger in rain (drops) = both play simultaneously. A parent and child playing together each "own" their weather zone.

**Next kid-cycle ideas (Cycle 138)**:
- `kids-bloom-garden`: long-press to plant a glowing flower + sustained pentatonic note; flower self-seeds after 10s. Most contemplative kids prototype. Zero tap events needed — just long-press and let the garden grow.
- Polish `115-kids-weather-music`: consider dynamically changing the opacity of the corner emoji overlays with zone weight (bright when active, dim when idle). Requires React state update or CSS variable, minor complexity.

---

### Cycle 134 — conductor-wand build

**Built**: `113-kids-conductor-wand`. Key learnings:
- **Speed → note rate is a continuous instrument.** No threshold UI, no buttons — just the child's natural intuition. Slow = long; fast = short. The same logic is how every instrument works (bow speed on a violin, finger velocity on a piano). Kids grasp it immediately.
- **Demo Lissajous** (cos(t) × sin(0.73t)) as auto-conduct makes the wand always moving on load. A child who picks up the device sees it's already "conducting." This eliminates the cold-start confusion common in new apps (why is the screen dark? what do I tap?). They just start touching.
- **Four orchestras require selection before start** — this is intentional. The selection moment is a ritual: the child (or parent + child) picks the sound world before entering it. Creates intention. The emoji does all the work: 🎪 looks playful, 🚀 looks cosmic, 🌲 looks calm, 🌊 looks flowing.
- **Drum from quick tap**: the <280ms threshold means a natural tap fires percussion but a deliberate press+drag fires melody. Kids naturally do both without instruction. In testing in my mental model: a child who taps rhythmically will produce a drum pattern; a child who swipes will produce melody. Dual affordance, single gesture surface.
- **`buildImpulse` reverb** with different wet levels per orchestra creates qualitatively different spaces: Space and Ocean feel vast (reverb trails linger), Playground and Forest feel intimate. The reverb is doing emotional work.
- **Drone chords** (2–3 oscillators, gain faded in over 2.5s): Ocean's drone is C2+E2+G2 (a C major triad in root position, two octaves below middle C). Space's is C2+G2 (open fifth, ambiguous and cosmic). This means any note played against Ocean's drone is harmonically stable; any note against Space's drone sounds modal and mysterious. The orchestra preset is a *harmonic world*, not just a timbre.
- **Trail fade at 0.18 alpha/frame** (canvas background) vs 1500ms trail lifetime: the background fade creates persistent glow without fully clearing the trail. Rapid gestures leave dense rainbow clusters. Slow gestures leave sparse dotted arcs. The canvas becomes a record of the gesture style.

**Next kid-cycle ideas (Cycle 136)**:
- `kids-weather-music`: four weather zones (sun/cloud/rain/wind); hold anywhere in a zone to blend musics; drag between zones to morph. No tap targets — whole screen is the instrument. Most different from existing kids prototypes.
- `kids-bloom-garden`: long-press to plant sustained pentatonic flowers; flowers self-seed after 10s. Contemplative, zero-tap-count. For the "quiet play" moment.
- Polish `113-kids-conductor-wand`: consider adding a subtle pitch indicator (small horizontal line on the left edge showing the current Y register) so parents can explain what's happening. Invisible to kids, educational for adults.

---

### Cycle 132 — shape-loop build

**Built**: `111-kids-shape-loop`. Key learnings:
- **Path densification is the key primitive.** The raw drawn path has irregular point spacing (fast finger = sparse points, slow finger = dense). Densifying to uniform ~5px steps before computing perimeter and triggers makes all subsequent math (perimeter, trigger spacing, traversal speed) consistent and shape-independent.
- **Trigger count from perimeter length** (clamp 3–12, N = round(perimPx/92)) gives natural variability: a small loop (child's finger circle, ~200px perimeter) = 3 notes; a large sweeping shape (~900px) = ~10 notes. The child learns this by experimenting without any explanation.
- **Y = pitch is self-discovering**: A child who draws a tall shape (reaching high on screen) will notice the melody has more high notes. A child who draws a flat shape hears mid-range loops. No legend needed — the spatial metaphor works.
- **Trigger-flash mechanic**: setting `shape.flash = 1.0` on each note trigger, decaying at 4.2/s, makes the traversal dot glow and the outline brighten at the moment of sound. Gives visual confirmation of cause (dot crosses trigger point → sound plays). After 2-3 loops, a 4yo will start anticipating the notes by watching the dot.
- **Pointer capture on `pointerdown`** (`canvas.setPointerCapture(e.pointerId)`) is essential — without it, `pointermove` events stop when the finger reaches the canvas edge on an iPad. With it, the path tracks smoothly off-edge.
- **Erase by proximity to densified pts**: checking `Math.hypot(p.x - pos.x, p.y - pos.y) < 28*dpr` for any point in `shape.pts` is O(N*M) but N≤6 shapes and M≤400 pts per shape makes this ~2400 comparisons — imperceptible at 60fps.
- **Auto-close dashed ring** should be more visible. Currently `globalAlpha=0.22` — quite subtle. Consider bumping to 0.35 and adding a fill flash when the finger enters the zone.

**Next kid-cycle ideas (Cycle 134)**:
- `kids-conductor-wand`: drag = conductor's baton; Y=register, speed=tempo. First gesture-as-conductor prototype.
- `kids-weather-music`: four weather zones (sun/cloud/rain/wind); hold to blend; no tap targets, full screen is the instrument.
- Polish `111-kids-shape-loop`: brighter auto-close ring; consider showing a brief "shape locked" sparkle burst at the moment of closing.

---

### Cycle 126 — kids research sweep

**Did**: Full research sweep to refill the empty kids seeded queue. 5 web searches, 2 web fetches covering: Bouncy (physics ball music), Shape Your Music (polygon loops), BANDIMAL design principles, CHI 2025 touchscreen review, Sound2Hap haptic paper, conducting gesture research, Soundbrenner Spark.

**Added 6 new prototype seeds** (see "New ideas" section above):
- `kids-kalimba` — BANDIMAL-inspired bar-height-to-pitch. **Recommended next kids build.**
- `kids-bounce-notes` — physics ball, self-playing pentatonic. First autonomous-music kids prototype.
- `kids-shape-loop` — draw closed shape → loops as melody. First looping/layering kids prototype.
- `kids-conductor-wand` — drag-to-conduct, Y=register, speed=tempo. First gesture-as-conductor prototype.
- `kids-weather-music` — four weather zones, hold to blend. Full-screen instrument, no tap targets.
- `kids-bloom-garden` — long-press to plant sustained notes, self-seeding garden. Most contemplative.

**Key learnings from research**:
- **BANDIMAL's bar-height-to-pitch rule** is the single most teachable music interaction for zero-literacy children. "Longer = lower" maps to every real string/bar/tine instrument. Our kids zone has tap-circles, tilt-baskets, drawn paths — but NOT this physical tuning model. `kids-kalimba` fills the gap.
- **Physics-driven music** (Bouncy, Sound Drop) is a completely untapped paradigm in our kids zone. The child doesn't "play" — they set physics in motion and the physics makes music. High dwell time, very calm.
- **CHI 2025**: collaborative multi-touch (§181) increases joint referencing. `93-kids-share-screen` is validated. A `kids-share-screen-v2` call-and-response sequel (each finger "talks to" the other) is worth seeding.
- **Sound2Hap haptics** (§182) — not buildable in browser today (Web Vibration API too coarse). Monitor iOS 26 Haptic Engine API. Tag [emerging].
- **Loved prototypes bias**: `82-kids-color-piano` (immediate tap → vivid circle + note) and `83-kids-tilt-rain` (physical gesture = music). `kids-kalimba` extends both: immediate tap + physical tuning model.

**Next kid-cycle (Cycle 128)**:
Build `kids-kalimba` — one-cycle build, zero deps, zero API, highest learning value.

---

### Cycle 120 — echo-song build

**Built**: `102-kids-echo-song`. Key learnings:
- The `noteHitRef` ref-function pattern is the right bridge between React event handlers (JSX buttons `onPointerDown`) and game state that lives inside a `useEffect` closure. The ref is assigned at the top of the effect and updated as closures capture new values. This avoids stale closure bugs and doesn't require `useCallback` re-renders.
- A 3-second auto-advance on the child's turn (with 0 taps → bird plays a new phrase, skipping the echo) prevents the child from being "stuck" if they don't understand their turn. Important for 4yo: never have a "waiting for input" state that blocks progress indefinitely.
- The bird "adds one note ≠ last child note" rule is musically effective: children who tap the same note repeatedly (natural first behavior) get a gentle nudge toward variety. Children who vary their taps get their phrase echoed faithfully. The prototype teaches by modeling without ever saying "try something different."
- `function` declarations inside `useEffect` hoist correctly within the closure, allowing `startChildTurn` to call `startEchoTurn` (declared later) without forward-reference errors. Arrow functions don't hoist — using `function` declarations is the right pattern for mutually-referencing game state functions.
- `min-h-[80px]` with `flex-1` and `gap-2 p-3` gives 66px button width on a 390px phone, just above the 64px KIDS.md minimum. Tight but workable; if polishing, increase to `gap-3` and consider 4 notes instead of 5 for a more generous tap target.
- 5-note pentatonic (vs 4 in other prototypes) makes the note set feel richer — the child has more to explore — while still guaranteeing harmony. All pairs from {C3, E3, G3, A3, C4} are consonant (unison, m3, M3, P4, P5, or P8).

**Next kid-cycle ideas (Cycle 122)**:
- Polish pass on `82-kids-color-piano`: bump `text-white/40` → `text-white/75` throughout, increase button padding, confirm all tap targets are ≥64px. Long queued; should be done.
- `echo-song` follow-up: expand to a 3-animal scenario (bird, frog, elephant) — each animal has a different pitch range and different note colors. Children can "choose" which animal to address by which circles they tap.
- New concept: `kids-mirror-draw` — child draws on one half of the screen, it mirrors and plays on the other half. Symmetry as a musical concept.

---

### Cycle 92 — first build

**Built**: `82-kids-color-piano`. Key learnings:
- `document.elementFromPoint` in `pointermove` is the right hit-test strategy for glissando without `setPointerCapture`. Runs at 60fps on mobile without visible jank.
- `vmin` units for circle size work cleanly across screen sizes without media queries. `20vmin` gives ≥78px on a 390px phone and ≥153px on a 768px iPad.
- Background pad (C3/E3/G3 at 0.04 gain with slow LFO) is barely audible but eliminates the "broken / silent" feel between taps. Important for 4yo UX — they stop playing if the screen feels dead.
- Triangle wave + sine 2nd harmonic at 0.18 relative gain: warm enough to read as "piano" but not harsh. Good baseline for all future kids sound synthesis.

**Next kid-cycle ideas** (queued in seeded list above):
- `kids-tilt-rain`: DeviceOrientation API + falling drops. Need to request permission on iOS 13+ (`DeviceOrientationEvent.requestPermission()`). This requires a button tap first — still acceptable for kids (parent taps the "go" button).
- `kids-hum-to-paint`: mic → autocorrelation pitch → brush stroke color. Core algorithm already proven in `13-piano-canvas`. Kids version: bigger strokes, brighter colors, playback mode at end.

### Cycle 96 — tilt-rain build

**Built**: `83-kids-tilt-rain`. Key learnings:
- `DeviceOrientationEvent.requestPermission()` on iOS 13+ must be called from a user gesture. The Start button serves as the natural permission gate — it also creates the AudioContext. One tap gates two permissions cleanly.
- The iOS permission flow accidentally creates a good UX ritual: parent taps Start → hands device to kid → kid tilts freely. The "permission wall" becomes a "parent handoff moment."
- Exponential smoothing on gamma (α=0.18) + basket follow (α=0.16) stacked gives a double-smoothed response that feels physical without being sluggish.
- Basket collision is more forgiving than visually strict: +5px horizontal tolerance hides the arc curvature mismatch and makes the game feel "right" rather than pixel-perfect.
- Golden-ratio spiral for star positions (no per-frame array allocation): `sx = (i * 0.618) % 1 * W`. Runs at 60fps with no garbage.

**Next kid-cycle ideas**:
- `kids-puddle-jumper`: tap to splash → ripples + sound bounce off edges. Calming infinite play. All-touch, no mic — good counterpoint to the voice-heavy `88-kids-hum-to-paint`.
- `kids-character-band`: 5 animal characters, tap each → melodic phrase. Toca Band-style but calmer.

### Cycle 98 — hum-to-paint build

**Built**: `88-kids-hum-to-paint`. Key learnings:
- The autocorrelation pitch detector (`13-piano-canvas` lineage) works well for sustained hums; confidence threshold of 0.82 is right — it's conservative enough to ignore room noise and breath but fires quickly on a clear hum. Same `Float32Array(new ArrayBuffer(n * 4))` + cast-to-`Float32Array<ArrayBuffer>` pattern required as all mic prototypes.
- `ctx.shadowBlur` is the right tool for the glow effect — one property, handles the entire "laser beam painted on a dark canvas" aesthetic without shader complexity.
- Log-scale pitch → hue (0–270°) creates a very natural rainbow: hum low = warm, hum high = cool. No color theory decision-making needed; physics does it.
- Scan-line replay via a `<div>` rather than canvas redraw keeps the painting intact and is simpler than per-frame canvas operations. `left: X%` CSS with `setInterval` at 32ms gives smooth enough motion at this scale.
- The "painting IS the score" insight is worth exploring further: the x axis IS time, and the scan line IS the read head. A future version could let the child drag the scan line to "scrub" the melody.
- Karel loved both previous kids prototypes — the every-other-cycle cadence is justified. Continuing.

**Next kid-cycle ideas**:
- `kids-puddle-jumper`: tap canvas → stone splash → expanding ripple rings → note; ripples bounce off edges; building soundscape. All-touch, no mic. Most calming prototype in the queue.
- `kids-character-band`: 5 animal characters, tap each → melodic phrase. Toca Band-style but calmer.

### Cycle 100 — puddle-jumper build

**Built**: `90-kids-puddle-jumper`. Key learnings:
- Zero-permissions kids prototype is a genuine gap in the existing library: `82` and `83` both require DeviceOrientation or nothing, `88` requires microphone. `90` requires absolutely nothing — first tap works on any device, any browser, any context (airplane mode, shared iPad, no consent dialog). Good to have one prototype at each permission level.
- The `"lighter"` composite mode works beautifully for thin rings: two crossing ring-lines produce a precise bright point rather than a diffuse glow. Distinct aesthetic from `89-marpi-void`'s fill-based lighter mode.
- Wall reflection via mirror-center arc: since Canvas2D clips naturally at the canvas boundary, a circle centered outside the canvas only draws its visible arc. This is a free "clipping to bounds" operation — no explicit clipping code needed. The reflected arc starts exactly where the incoming ring intersected the wall.
- Depth cap of 2 for reflections is the right balance: depth 1 reflections are clearly visible, depth 2 are dim ghosts, and beyond that they'd be imperceptible while still generating work. Removing depth cap entirely would spawn ~4^n ripples per frame for a boundary-hugging ring.
- Multi-touch support is free with pointer events: each finger generates its own `pointerdown` event. No `touches` array management required. The pentatonic X-mapping means two fingers at different X positions naturally play different notes, enabling spontaneous "chord" play.
- Pentatonic X-mapping is intuitive: 10 notes (C3–A4) mapped left-to-right makes dragging across the screen a natural glissando. A 4yo won't know what C-major pentatonic is, but will discover that dragging left-to-right sounds like "going up."
- Ambient pad at gain 0.022 is imperceptible as a separate sound — it only becomes noticeable if all tap sounds are absent. This is the right level: it just makes the silence after tapping feel warm instead of dead.

**Next kid-cycle ideas**:
- `kids-character-band`: 5 animal characters, tap each → distinct melodic phrase. Most complex kids prototype yet (requires character art or emoji SVGs). Good Toca Band alternative.
- `kids-ghost-lullaby`: simplified Ghost journey for kids — Ghost floats, tap → sings a note, drag → glissando + sparkles. Ties kids zone to Karel's published Ghost character.
- `kids-share-screen`: two-finger harmony — each finger gets its own color + voice, voices harmonize at a diatonic interval. Encourages parent+child play.

### Cycle 106 — share-screen build

**Built**: `93-kids-share-screen`. Key learnings:
- TypeScript does NOT maintain null-narrowing for `const` variables inside nested function definitions. Even after `if (!canvas) return;` in the outer scope, TypeScript still sees `canvas` as `HTMLCanvasElement | null` inside a `function resize()` defined in the same scope. Fix: add a redundant `if (!canvas) return;` guard at the top of the nested function. This is different from the cast-at-declaration approach used in `91-kids-character-band`; both work, the guard approach is more explicit.
- `setPointerCapture` is essential for edge-of-screen dragging: without it, `pointermove` events stop when a finger reaches the canvas edge on mobile. With it, the orb continues following the finger even off-canvas. One line adds, no cost.
- Slot assignment (first finger = violet, second = rose) creates accidental social UX: whoever touches first "claims" the violet voice. Kids notice this and sometimes race to be first.
- The connecting line is the emotional center of the prototype — more than the orbs themselves. When two voices are active, the dashed line pulsing between them makes the musical connection tangible. The animation direction (dash offset scrolling from violet toward rose) subtly suggests the harmony is "flowing" between the two players.
- Pentatonic intervals available from any two notes in C-major pentatonic: unison, m3, M3, P4, P5, M6, P8. Every possible pair is either consonant or expressly beautiful. Zero "wrong" combinations.

**Next kid-cycle ideas (Cycle 108)**:
- `kids-ghost-echo`: tap anywhere on screen → a small echo Ghost appears at that spot, plays a single note, then fades after 4 s. Max 8 Ghosts coexist. The "multi-point pond" variant of ghost-lullaby — zero permissions, zero API.
- `93-kids-share-screen` polish: show a subtle "harmony interval" indicator (colored arc between the two orbs showing whether they're playing a 3rd, 5th, or other interval) — educational layer for curious parents, invisible to kids.

---

### Cycle 110 — breath-bubbles build

**Built**: `95-kids-breath-bubbles`. Key learnings:
- RMS amplitude alone is sufficient for breath detection at threshold 0.028 — it fires on blowing, humming, singing, clapping, but NOT on quiet room noise (~0.005–0.015). For a kids prototype, any sound making bubbles appear is the right behavior: the child will quickly learn "loud = more bubbles."
- `hex + "38"` (8-digit hex with alpha) for canvas `fillStyle` is the cleanest way to get translucent color fills without `rgba(...)` string construction. Stacks bubbles cleanly without over-saturation.
- `shadowBlur = r * 0.9` scales glow with bubble size automatically — small and large bubbles look equally vivid. This was not obvious in advance; a fixed shadowBlur would have made large bubbles look dull.
- Demo breathing wave: `0.042 * |sin(t * 0.48)|` with period ≈ 13s matches human resting breath rate (4–5 breaths/min) well enough that it feels like watching someone breathe, not a metronome.
- Speed ∝ 18/radius creates a natural physics feel: tiny bubbles streak upward while big bubbles drift. The `Math.max(0.7, ...)` floor ensures even very large bubbles eventually reach the top.
- Tap-to-add-bubble (`pointerdown` on canvas) is an important secondary interaction — it lets kids play the prototype before the mic permission is granted, or in situations where blowing doesn't trigger (quiet room, shy child). Every interaction should have a "just tap it" fallback.

**Next kid-cycle ideas (Cycle 112)**:
- Polish pass on `82-kids-color-piano`: bump `text-white/40` → `text-white/75`, increase button size per AGENT.md typography rules.
- `95-kids-breath-bubbles` polish: add a faint "breath guide" arc at the bottom showing mic activity level (parents can see if the mic is picking up).
- Research: new 2026 Web Audio / WebAudio Worklet capabilities for kids?

---

### Cycle 108 — ghost-echo build

**Built**: `94-kids-ghost-echo`. Key learnings:
- `(1 - lifeT)^0.75` fade curve is noticeably better than linear for "presence" feeling. The exponent < 1 holds brightness through most of the Ghost's life; the fade is concentrated in the final ~1.5s. With a linear curve, the Ghost starts visibly dimming at 2s (half life) which feels like it's "giving up." The power curve feels like the Ghost is fully present until it decides to leave.
- A per-Ghost random `driftPhase` (0 to 2π) and random `driftAmp` (7–16px) makes the Ghosts feel like individuals when multiple coexist. They drift at different parts of their Lissajous orbit simultaneously — some moving right while others move left. The emergent "flock" feel (6–8 Ghosts on screen) arises entirely from this parameter variation, not from any explicit flocking behavior.
- Sparkle `vy += 0.04` per frame (downward acceleration): the sparkles rise then arc back down like they're affected by gravity. Without this, they just drift radially outward and feel flat. The parabolic trajectory (same trick used in `84-wave-fluid`'s spray particles) reads as physical without any complex simulation.
- Max 8 Ghosts cap has a musical meaning: PENTA_HZ has 10 notes across the screen height. 8 Ghosts distributed at different Y-positions span most of the scale. Rapid tapping from top to bottom creates a natural arpeggio that sustains while you add more Ghosts.
- Ghost drawing code reused verbatim from `92-kids-ghost-lullaby` (body path, eyes, eye-shines, shadowBlur=28). The character identity is immediately recognizable — a child who has played with ghost-lullaby will recognize the Ghost when it appears in ghost-echo. Cross-prototype character continuity.

**Next kid-cycle ideas (Cycle 110)**:
- Polish pass on `82-kids-color-piano`: bump all `text-white/40` → `text-white/75`, increase button sizes per AGENT.md typography rules. Tiny diff, big readability gain.
- `94-kids-ghost-echo` polish: add very faint pitch "trail" lines (short horizontal line at spawn Y position, fading with the Ghost) so parents can visually map Y-position to pitch. Educational layer invisible to kids (too subtle to read), but a parent watching would see it.
- Research: are there new 2026 WebAudio / Web MIDI creative tools shipping that the kids zone could use?

---

### Cycle 104 — ghost-lullaby build

**Built**: `92-kids-ghost-lullaby`. Key learnings:
- Lissajous autonomous movement (two incommensurable frequencies 0.55 and 0.38 rad/s) gives the ghost uncanny "personality" — she pauses, meanders, then drifts again. Kids watch before touching.
- Y-to-pitch mapping across 10 pentatonic notes (C3–A4) makes dragging the ghost a natural musical gesture. Even random swirling produces pleasant melodic fragments. This is the right interaction model for a character-based music toy.
- Canvas2D path for ghost body: dome arc with `anticlockwise: true` is the correct way to draw the top half; three quadratic-curve bumps at the bottom give the classic ghost silhouette without any image assets.
- 80 px hit radius (2.5 × G_R) is essential for 4yo accuracy. Even adults find the smaller radius frustrating. Err very large on touch target.
- Lullaby trigger at 120s works as a natural session endpoint; 3 repeats of the 8-note motif ≈ 20s total, then silence — not abrupt.
- Ghost–character continuity: bringing a named character from Karel's published journeys into the Kids zone gives the prototype a narrative identity that "tap a blob" or "tap a circle" lacks.

**Next kid-cycle ideas (Cycle 106)**:
- `kids-share-screen`: two-finger harmony — each finger gets its own color + voice, voices harmonize at a diatonic interval. Parent+child play, easy one-cycle build.
- `kids-ghost-echo`: tap anywhere on screen → a small echo Ghost appears at that spot, plays a single note, then fades after 4 s. Multiple echo Ghosts can coexist (max 8). The "pond" variant of ghost-lullaby.
- `92-kids-ghost-lullaby` polish: tapping anywhere outside the ghost spawns a small star that plays a soft note; the ghost reacts by momentarily looking toward the tap.

### Cycle 102 — character-band build

**Built**: `91-kids-character-band`. Key learnings:
- Pentatonic constraint is a free harmony engine: all five characters' phrases share a C-major pentatonic tonal center, so any combination of simultaneous taps sounds musical. No explicit harmonization logic required — the scale does the work.
- Incommensurable phrase durations create polyrhythm for free: Frog's 0.15s/note rate and Bear's 0.85s/note rate are coprime enough that their phrases drift in and out of phase naturally. Feels like a real ensemble.
- `pointer-events: none` on the sparkle canvas is the cleanest multi-touch pattern: the canvas sits in front for visual effects but never intercepts touch events, which fall through to the character buttons.
- `onPointerDown` with `e.preventDefault()` is the right handler for kids apps — it fires immediately (no 300ms mobile delay), enables multi-touch, and prevents scroll interference.
- TypeScript control-flow narrowing doesn't persist across nested function definitions: `ctx` declared as `CanvasRenderingContext2D | null` and narrowed in the outer scope still shows as possibly-null inside the inner `drawFrame` function. Fix: cast at declaration site as `CanvasRenderingContext2D` (safe when element is from a real canvas ref).
- Five-character flex row (`flex-1` + `max-w-[140px]` + `min-w-[68px]`) adapts cleanly from 320px phones to iPad — no media queries needed.

**Next kid-cycle ideas**:
- `kids-ghost-lullaby`: simplified Ghost journey for kids — Ghost floats, tap → sings a note, drag → glissando + sparkles. Ties kids zone to Karel's published Ghost character.
- `kids-share-screen`: two-finger harmony — each finger gets its own color + voice, voices harmonize at a diatonic interval. Encourages parent+child play.
- `kids-character-band` polish: longer evolving phrases after repeated taps (call-and-response); character wobble animation while phrase plays.

---

### Cycle 0 (this doc) — sources

- Toca Boca + Sago Mini design patterns (Common Sense Media reviews, Educational App Store rankings, ParentMap)
- Reggio Emilia sensorimotor music research (ResearchGate "Sounds to Share", 2025 sensorimotor pathways review)
- US Patents 8106280, 7351898, 9266031 — color-coded / tactile music teaching devices
- "Does Music Training Improve Inhibition Control in Children?" (biorxiv 2023.02.08) — meta-analysis on early childhood music + executive function

(Agent: extend this list with each kid-cycle's research. Use `WebSearch` filtered to the current year.)

---

## New seeds — Cycle 196 research sweep (2026-05-26)

These four ideas come from the Cycle 196 kids research sweep. All are zero-permissions, zero-API,
zero-deps. All follow KIDS.md design principles. Recommended build order: marble-run first (strongest).

### `kids-marble-run` ✦ **top priority — build Cycle 198**
**Question**: what if the child draws the musical machine, and the machine plays itself?

A dark canvas with pre-loaded demo ramps (glowing colored lines, each color = pitch). A "Drop 🎵"
button at the bottom launches a glowing marble from a random top position. Marbles fall with gravity,
bounce off ramps, and play a pentatonic note on each bounce. Pitch = Y position of the ramp midpoint
(ramps higher on screen play higher notes — intuitive physical analogy). Child draws new ramps by
dragging finger across the canvas (drag >30px = new ramp). Ramp flash-glow on marble hit. Marbles
auto-launch every 4 seconds so the canvas is always alive. "Clear" button resets ramps + marbles.
Max 10 ramps, max 6 marbles. Trail behind each marble. C-major pentatonic: C3–E4 (6 pitches). For
kids 4+. Three demo ramps pre-loaded so it's immediately playable.

**Why this first**: no existing kids prototype lets the child BUILD a machine that then plays music
autonomously. All prior prototypes are reactive (tap = note). This one is constructive: design first,
then watch. The marble-run mechanic is culturally validated (BooSnoo 2026, Sago Mini Music Machine 2026,
Wintergarten Marble Machine viral videos, Snapchat Marble Run Music). The draw-your-own-ramps interaction
is the novel piece no existing app offers. Directly inspired by Karel's love of `105-pluck-field` ❤️
(physical modeling = immediate note), `133-kids-ripple-pond` ❤️ (physics makes music), `100-kids-paint-song`
❤️ (drawing = music). Zero permissions · Zero API · Zero deps.

### `kids-snow-globe`
**Question**: what if snowflakes played notes when they landed?

Tap anywhere on a dark night canvas → a burst of 5–8 glowing snowflakes scatter from that point with
slight random drift, then fall with gravity. Each snowflake is one of 5 pentatonic pitches (mapped to
the Y position where the finger tapped: top-tap = high pitch, bottom-tap = low pitch). When a snowflake
reaches the "ground" (bottom 12% of canvas), it plays its note as a soft bell chime (triangle wave +
quick attack + 1.5s decay) and dissolves in a tiny sparkle. Hold a finger = continuous snowfall from
that point (one flake every 100ms). Snowflakes have a gentle sinusoidal left-right drift as they fall
(±12px amplitude). For kids 3+. No scoring, no fail state — just peaceful falling snow and soft notes.
Ambient C3+E3+G3 pad throughout. Background: deep navy, barely visible tiny star dots (same as
`152-kids-star-paint` background stars). Demo mode: holds a finger at mid-height for 3 seconds on
first open, then releases — shows the interaction model before first touch.

**Why**: contemplative, pre-sleep vibes. First kids prototype where LANDING is the musical event
(all prior prototypes play note on tap-down, not on landing). Teaches cause-and-effect with a
time delay (~0.5s for snowflake to fall). Novel physics: gravity as the "wait" in the cause-effect
chain. Zero permissions · Zero API · Zero deps.

### `kids-garden-bloom`
**Question**: what if growing a flower was the same as playing a note?

Dark soil at the bottom of the canvas, twilight sky gradient above. Hold a finger anywhere on the
soil strip → a glowing seed appears, then a stem grows upward at ~15px/s, then petals unfold one by
one (each petal = one note, triangle wave, pitch rising per petal). Hold for 2s = 3 petals + short chord.
Hold for 4s = 5 petals + richer chord. Release mid-growth = flower stays at current height and loops
its chord softly. X position of finger = flower color + timbre zone:
- Left (violet) = piano timbre (triangle wave, fast attack)
- Center-left (amber) = bells (triangle + 2nd harmonic, warm decay)
- Center-right (teal) = plucked string (Karplus-Strong simplified)
- Right (rose) = pad (sine, slow 70ms attack)
Y position doesn't matter — only X for pitch class and timbre.

Up to 6 flowers coexist. When the 6th flower blooms, all flowers play their notes simultaneously (a
gentle 6-voice chord) and then slowly sway in virtual wind (sinusoidal drift). After 12 more seconds
they all fade, and the garden resets. Ambient soft wind layer (white noise through lowpass 180Hz).
Demo mode plants a violet flower and a rose flower at startup (no touch needed to see the mechanic).
For kids 3+ · Zero permissions · Zero API · Zero deps.

**Why**: new gesture type for the kids zone — SUSTAINED HOLD = growth. All 166 prior kids prototypes
trigger on tap-down or tap-and-drag. This one rewards patience (hold longer = more petals = richer chord).
The garden-fill-then-reset arc gives a clear narrative: plant, grow, chord, fade, repeat.

### `kids-raindrop-rhythm`
**Question**: what if catching raindrops made music?

Three colored clouds at the top of the canvas (violet, amber, rose — always visible, gently animated
with slow pulsing breath). Tap any cloud to release a burst of 3–5 raindrops in that cloud's color.
Drops fall with gravity and gentle sine drift. At the bottom: a soft floor of "water" that ripples
when drops land. Each drop plays its note when it hits the floor (color = pitch: violet=C3, amber=G3,
rose=C4). Multiple drops from different clouds = automatic harmony (pentatonic = always consonant).
Hold a cloud = continuous rain (one drop per 200ms). Drops make a small ripple animation on the floor
(expanding circle, fades over 600ms). Second interaction: drag the floor level up or down (hold and
drag) to change the "catch" zone — fun but musically irrelevant, pure tactile play.

Auto-rain: each cloud emits one drop every 3 seconds autonomously so the canvas is never silent.
For kids 3+ · Zero permissions · Zero API · Zero deps.

**Why**: new interaction paradigm — the child SENDS rather than RECEIVES. Tapping a cloud is an action
that causes a consequence below (different from ripple-pond where the child taps the floor to make ripples).
Gravity adds delay between action and sound. Three simultaneous cloud colors = three-voice polyphony
from one gesture. Extends `133-kids-ripple-pond` ❤️ (landing = event) into downward flow.

---

## Research log for Kids — Cycle 196 (2026-05-26)

**Scope**: Kids-focused research sweep. Scanned: new kids music apps (2026), CHI 2026 proceedings,
Toca Boca / Sago Mini releases, physics-based music toys, embodied music research.

### Key findings

**Sago Mini Music Machine** (2026 — Sago Mini World update):
- Kids can "tinker with tunes" and "make their own musical masterpieces" in a Music Machine mini-game
  within Sago Mini World. Machines as music-making metaphor is actively being explored by the industry.
- Validates `kids-marble-run` design space. Our version is differentiated: free-draw ramps (Sago Mini's
  machine is likely pre-built/node-based). The draw-your-own-machine interaction is genuinely novel.

**BooSnoo** (2026 — animated show):
- A slow, calming show following a red ball triggering art, mechanics, and music in a "Rube Goldberg
  meets marble run" format. Target audience: young children. Demonstrates that marble-run + music is
  a proven format for kids media in 2026 — not just a niche concept.
- The "slow and calming" tone matches Resonance Kids' design philosophy (no sudden transients,
  parent-tolerable). Our `kids-marble-run` should preserve this: soft bounce sounds, not percussive cracks.

**Marble Run Music popularity** (Snapchat / YouTube, 2026):
- "Marble Run Music Videos" is a searchable Snapchat topic. Multiple YouTube channels dedicated to
  marble-run music. This is an active 2026 content genre for kids and parents.
- Cultural confirmation that `kids-marble-run` has an existing audience who will instantly
  understand the concept.

**Wintergarten Marble Machine** (viral reference):
- The original physical marble-run-as-xylophone (2016, Martin Molin) has millions of views and is
  still referenced in "2026 music machine" search results. The marble → xylophone analogy is culturally
  established. Our prototype inherits this understanding without needing to explain it.

**BeSound** (Dalcroze embodied music for kids, IJMEC 2025):
- Recent Dalcroze-inspired research confirms that embodied whole-body movement + music creation is
  the gold standard in early music education. Browser implementation: canvas-gesture-as-instrument
  already matches this paradigm. Our ramp-drawing gesture (full-arm sweep across iPad) is embodied.
- Also supports: motion-based interactions (swipe, hold, drag) over point-and-click.

**MIROR-Impro** (CHI history reference, 2025 NIH citation):
- A system that "mirrors" children's keyboard improvisations with repetitions and variations — similar
  to `aria-companion` conceptually. Kids responded positively to being "listened to and echoed."
- Future seed: a kids version of Aria — smaller phrases, simpler responses, more visual feedback.
  Could be `kids-echo-aria`: child taps 3-4 notes, system echoes + extends. Simpler than full aria.

**PianoBand** (CHI 2026, April 2026):
- Wristband + printed keyboard sheet for portable piano: 99%+ tap detection accuracy, 8.9px fingertip
  error. Not browser-feasible (requires hardware). But confirms that music researchers are actively
  working on accessible piano interaction for all ages.
- Not a prototype seed, but worth noting: the "print a keyboard anywhere" concept could inspire a
  future `kids-paper-piano` prototype that uses the camera (MediaPipe) to detect finger taps on a
  real surface.

### Design learnings applied to new seeds

1. **Construction-first** (vs reaction-first): `kids-marble-run` is the only kids prototype where
   the child designs before the music plays. Prior prototypes are all reactive or performance-based.

2. **Delay-between-gesture-and-note** as pedagogy: `kids-snow-globe` (0.5s fall delay) and
   `kids-raindrop-rhythm` (gravity delay) teach cause-effect with temporal separation — the same
   mechanism that makes `133-kids-ripple-pond` ❤️ educational: you tap, then something happens,
   then something else happens.

3. **Calmer, more contemplative**: The 2026 kids media landscape (BooSnoo, Yoto screen-free audio)
   shows appetite for *slow, calming* kids experiences alongside fast-reaction ones. `kids-garden-bloom`
   and `kids-snow-globe` are the calmer end of the spectrum; `kids-marble-run` can go either way.

4. **BANDIMAL principle still gold**: bar-height-to-pitch rule (bigger = lower, smaller = higher) remains
   the most teachable single physical-to-musical mapping. Applied in `kids-marble-run` via ramp Y position
   (higher ramp = higher note = intuitive because the marble needs to fall less distance for the high note).

### Next kids cycle (Cycle 198) recommendation

Build `kids-marble-run`. It's the strongest idea: culturally validated, design-space gap confirmed,
zero deps, one-cycle build, directly inspired by Karel's loves of `105-pluck-field` ❤️ and
`133-kids-ripple-pond` ❤️. The pre-loaded demo ramps + auto-launch ensure it's immediately playable
without any instruction. Expected size: ~250-300 lines.

---

## New seeds — Cycle 206 research sweep (2026-05-27)

All four Cycle 196 seeds were built (marble-run, snow-globe, garden-bloom, raindrop-rhythm).
Queue was empty → full research sweep. Sources: CHI EA 2026, IDC 2026 theme, ACM children's music
proceedings, Scientific Reports (Apr 2025), arxiv tangible music research, App Store surveys.

### `kids-lego-sequencer` ✦ **top priority — build Cycle 208**
**Question**: what if the child built their melody by placing colored blocks on a grid?

A 5-row × 8-column canvas grid of square "block cells" (rows = 5 pentatonic pitches, columns =
8 time steps). Tap any cell → place a glowing colored block (row color: violet=C3, emerald=E3,
amber=G3, rose=A3, cyan=C4). A bright vertical sweep cursor moves left-to-right at a constant
BPM, playing all blocks in its current column. Tap a placed block to remove it. No column limit —
the child can fill an entire column (chord!) or spread notes across rows (melody). Loop repeats
continuously; changes take effect immediately on the next cursor pass.

BPM +/− buttons (40–120 BPM). **Clear** erases all blocks. **Demo** pre-fills 8 columns with a
C-major pentatonic phrase so the sequencer immediately plays. Blocks glow brighter as the cursor
passes through them (flash = 1.0, decays at 3/s). Soft C3+G3 ambient pad under the sequence.
For kids 4+ · Zero permissions · Zero API · Zero deps.

**Why this first**: `145-kids-dot-seq` has 6 dots in a single row (time only, no pitch control).
`150-kids-beat-builder` has melody vs drums but no pitch-per-row vertical control. This is the
first kids prototype with a real 2D pitch × time grid — the browser equivalent of the Lego brick
tabletop sequencer (BrickMusicTable, arxiv 2411.13224) validated with 150+ children ages 3–13.
A child who fills one row hears a steady repeating note; a child who fills a diagonal hears a
rising scale; a child who fills one column hears a 5-note chord burst. Discovery happens without
any explanation. Directly inspired by Karel's love of `98-kids-drum-circle` ❤️ (rhythm) and
`111-kids-shape-loop` ❤️ (additive layering). Expected size: ~220 lines.

### `kids-voice-monster`
**Question**: what if singing fed a hungry character that sang back what it ate?

A large glowing "glow-monster" character on a dark canvas (simple rounded blob with two glowing
eyes). Hum or sing into the mic → the monster grows (radius scales with RMS amplitude up to 2×).
Pitch shifts its color (low voice = violet/blue, mid = emerald/amber, high = rose/cyan). After
30 seconds of accumulated voice input, the monster is "full" — it does a happy bounce animation
and then sings back a short melody drawn from the distinct pitches it detected (up to 8 notes,
played via sine oscillators with the same pitches the child sang, in order of first detection).
After singing back, the monster shrinks to resting size and the cycle begins again.

Secondary interaction: tap the monster to get a single surprised "boop" sound (quick harmonic
series arpeggio) and a brief eye-wobble. If the child is silent for 5+ seconds, the monster's
eyes look around (Lissajous drift) as if searching for sound.

**Why new**: `158-kids-hum-paint` ❤️ uses voice to paint a visual stroke. This uses voice to
feed a character narrative — the same voice input with a completely different emotional frame.
The "sing to me" → "I sing back what I learned" loop activates neural reward circuits identified
in the Apr 2025 fMRI study: improvisation → reward, no judgment barriers, character response
removes self-consciousness. The monster mediates between the child and the sound — the child
isn't "performing," they're "feeding." For kids 3+ · Mic required · Zero API · Zero deps.

### `kids-texture-drum`
**Question**: what if every surface had its own sound — and you could drum on anything?

Five large rectangular canvas zones (each ~20% of canvas width, full height), each representing
a physical material:
- **Wood** (warm amber): low-pass filtered noise burst + sine transient at ~200Hz. Sounds like
  tapping a wooden table.
- **Metal** (cool cyan): high-Q bandpass resonator at ~800Hz + long sustain. Sounds like a
  small bell or tin can.
- **Water** (blue-violet): filtered noise + pitch-falling glide (800→200Hz over 300ms). Sounds
  like a water drop splash.
- **Earth** (deep amber): very low-frequency sine burst at ~80Hz. Sounds like a deep drum.
- **Glass** (bright rose): high-frequency sine at 2.4kHz, fast decay 80ms. Sounds like tapping
  a wine glass.

Each zone shows its material texture (grainy noise overlay, gentle shimmer, or smooth surface).
On tap: zone ripples with a canvas2D circular pulse (color = zone color, max radius = tap
distance from center × 1.5). Hold a zone = rapid fire (one hit per 80ms) — "roll" effect.
Two-finger tap = accent (louder hit, full-screen color flash).

**Why new**: all 30+ prior kids prototypes use pitched musical notes in C-major pentatonic. This
is the first where **timbre** (sound texture/quality) is the primary dimension, not pitch. A
3yo discovers "this sounds different from that" without any reference to notes or scales. Directly
inspired by Hitmachine (2025) and the tangible instrument workshops. The material metaphor is
immediately accessible — even without reading the labels, the visual texture of each zone suggests
its sound. For kids 3+ · Zero permissions · Zero API · Zero deps.

### `kids-mirror-dance` [needs Karel OK — ~8MB CDN dep]
**Question**: what if your hands conducted the music while the camera watched?

Webcam (front-facing) → MediaPipe HandLandmarker (loaded once from jsDelivr CDN, ~8MB WASM) →
hand skeleton tracking at ~25fps. Right hand Y-position → pitch (C2 bottom to C5 top, continuous
glide via OscillatorNode frequency ramp). Right-hand palm spread (thumb-to-pinky distance) →
reverb wetness. Left hand Y → bass drone pitch. Wrist speed (frame delta) → amplitude. Clap
both hands together (palm distance < 40px) → percussive burst (noise filter, 40ms). 

Visual: live camera feed in background (semi-transparent, 40% opacity), canvas overlay with
glowing hand skeleton drawn as colored dots + lines (additive blending, same palette as `1-live`).
A secondary horizontal spectrum strip at the bottom shows the synthesized audio output.

Demo mode (no camera): animated hand-skeleton performs a demo gesture sequence — shows the
interaction model before permissions are requested. "Conduct the music with your hands."

**Why new**: no existing kids prototype uses the camera. Rhythm Pals (2026) is the first
mainstream kids app to use camera movement detection — validates this design space. Directly
inspired by Karel's love of `104-kids-mirror-draw` ❤️ (mirror aesthetic) and the embodied
music research showing full-body gesture → richer music understanding. For kids 4+ · Camera
required · ~8MB one-time CDN load (jsDelivr, same origin as other CDN prototypes) · Zero API.
**Needs Karel approval** before building.

---

## Research log for Kids — Cycle 206 (2026-05-27)

**Scope**: Kids research sweep to refill empty queue (all Cycle 196 seeds built). Scanned:
CHI EA 2026, IDC 2026, ACM proceedings, Scientific Reports 2025, arxiv Nov 2024–Feb 2026,
App Store surveys (Toca Boca Jr, Sago Mini Music Box, Rhythm Pals), tangible music research.

### Key findings

**MusiBubbles — Input-Envelope-Output framework** (arxiv 2602.22813, CHI EA 2026, Feb 2026):
- Web-based prototype for post-task music rewards in motor training for children with autism (ASD).
- Defines 4 verifiable safety principles: (1) bounded audio output, (2) no sudden transients,
  (3) cause-effect chain preserved (child action → direct sound consequence, no delay surprises),
  (4) interventions are auditable/logged.
- **Design implication**: principles (1)-(3) are already satisfied by our pentatonic + no-wrong-notes
  design. Principle (4) is for clinical settings. Good checklist for any new kids prototype.
- Date: February 26, 2026. [older, foundational for ASD contexts]

**Neural Rewards in Children's Musical Improvisation** (PMC11986006, Scientific Reports, Apr 2025):
- fMRI study with 12 children ages 9-11: improvisation vs rote scale playing.
- **Key finding**: improvisation activated reward structures (amygdala, caudate, nucleus accumbens)
  SIGNIFICANTLY MORE than memorized tasks. "Deactivation of executive control areas (DLPFC)" —
  children didn't need self-monitoring to improvise creatively.
- **Design implication**: explains why kids spend longer in free-play modes than guided play.
  "Remove judgment barriers — make mistakes impossible." Validates our entire design philosophy.
  Could justify adding explicit "free mode" versions of structured prototypes (echo-canon, clap-back).
- Date: April 10, 2025. [older, but foundational — cited by 2026 IDC submissions]

**BrickMusicTable: A LEGO Brick Tabletop Sequencer** (arxiv 2411.13224, Nov 2024 / Springer 2025):
- Physical 2D grid sequencer where children place colored Lego bricks to compose music.
- Validated with 150+ children ages 3–13 in workshops. Strong engagement across all ages.
- Key design: rows = pitch, columns = time steps, colored bricks = notes, cursor sweeps = playback.
- **Browser equivalent**: `kids-lego-sequencer` directly maps this paradigm to canvas2D.
  Construction-as-composition is a validated pedagogy; the draw-your-own-melody interaction
  is distinct from all 30 existing kids prototypes.
- Date: November 2024. [older, foundational]

**Hitmachine tangible music platform** (2025):
- Over 150 children ages 3-13 built their own musical instruments from Lego using sensors.
- Reinforces that even very young children engage with construction-before-play paradigm.
- Inspired `kids-texture-drum` (material zones as instrument surfaces) and confirms
  `kids-lego-sequencer` design space.
- Date: 2025. [older, foundational]

**Rhythm Pals 2026** (App Store):
- New kids music app featuring a "dance-along mode" that uses the device camera to detect
  movement, turning toddler movement into a musical game.
- First mainstream kids music app with camera integration (2026).
- **Design implication**: camera-based interaction for kids is now commercially validated.
  `kids-mirror-dance` is timely. The CDN-loaded MediaPipe approach (no package.json change)
  is the right technical path.
- Date: 2026 (confirmed active). [fresh]

**Toca Boca Jr — Band update** (March 2025):
- Beat mixing with 16 characters added to Piknik/Toca Boca Jr. Each character = distinct
  sound + rhythm. Mix beats by tapping characters.
- Gap we have: our `91-kids-character-band` plays melodic phrases; Toca's new Band plays
  rhythmic loops. `kids-lego-sequencer` fills the rhythm-construction gap in our zone.
- Date: March 2025. [older, market context]

**IDC 2026 theme: Sustainable Futures** (idc.acm.org, June 22-25 Brighton):
- Conference accepting submissions now; proceedings not yet public. Theme focuses on technology
  for sustainable, equitable futures. Kids music prototypes that work without internet
  connectivity (all our zero-API prototypes) align with accessibility + equity framing.
- **Design implication**: zero-permissions, zero-API prototypes are the most equitable — they
  work offline, on shared devices, with no data collection. Reinforce this as our design north star.
- Date: 2026 (upcoming). [fresh context]

### Next kids cycle (Cycle 208) recommendation

Build `kids-lego-sequencer` (slot `176-`). Strongest idea: BrickMusicTable validation with 150+
children, fills the 2D-grid gap in our kids zone, zero deps, one-cycle build. Expected ~220 lines.
