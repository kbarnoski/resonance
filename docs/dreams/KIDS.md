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
| 120 | `/dream/102-kids-echo-song` | `demoable` | **NEW** Bird sings 2–4 note phrase → child taps 5 colored circles to reply → bird echoes child's notes + adds one new note. Call-and-response loop. Phrases grow each round. Zero permissions. |
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

## Research log for Kids

Keep a running log here of relevant findings the agent uncovers during kid-cycles (mirrors `RESEARCH.md` structure).

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
