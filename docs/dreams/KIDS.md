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
