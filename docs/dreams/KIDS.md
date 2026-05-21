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
| 92 | `/dream/82-kids-color-piano` | `demoable` | 8 pentatonic circles, pointer glissando, no reading |

---

## Research log for Kids

Keep a running log here of relevant findings the agent uncovers during kid-cycles (mirrors `RESEARCH.md` structure).

### Cycle 92 — first build

**Built**: `82-kids-color-piano`. Key learnings:
- `document.elementFromPoint` in `pointermove` is the right hit-test strategy for glissando without `setPointerCapture`. Runs at 60fps on mobile without visible jank.
- `vmin` units for circle size work cleanly across screen sizes without media queries. `20vmin` gives ≥78px on a 390px phone and ≥153px on a 768px iPad.
- Background pad (C3/E3/G3 at 0.04 gain with slow LFO) is barely audible but eliminates the "broken / silent" feel between taps. Important for 4yo UX — they stop playing if the screen feels dead.
- Triangle wave + sine 2nd harmonic at 0.18 relative gain: warm enough to read as "piano" but not harsh. Good baseline for all future kids sound synthesis.

**Next kid-cycle ideas** (queued in seeded list above):
- `kids-tilt-rain`: DeviceOrientation API + falling drops. Need to request permission on iOS 13+ (`DeviceOrientationEvent.requestPermission()`). This requires a button tap first — still acceptable for kids (parent taps the "go" button).
- `kids-hum-to-paint`: mic → autocorrelation pitch → brush stroke color. Core algorithm already proven in `13-piano-canvas`. Kids version: bigger strokes, brighter colors, playback mode at end.

### Cycle 0 (this doc) — sources

- Toca Boca + Sago Mini design patterns (Common Sense Media reviews, Educational App Store rankings, ParentMap)
- Reggio Emilia sensorimotor music research (ResearchGate "Sounds to Share", 2025 sensorimotor pathways review)
- US Patents 8106280, 7351898, 9266031 — color-coded / tactile music teaching devices
- "Does Music Training Improve Inhibition Control in Children?" (biorxiv 2023.02.08) — meta-analysis on early childhood music + executive function

(Agent: extend this list with each kid-cycle's research. Use `WebSearch` filtered to the current year.)
