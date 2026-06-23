**For**: kids (4+)

## The question

What if a 4-year-old had the freedom to play a genuinely WRONG (dissonant) note —
and dissonance was a friendly wobbly MONSTER they could CALM by resolving it,
instead of a forbidden mistake?

## Tags

- **INPUT**: on-screen creature-keys (primary, touch-first, no reading) + Web MIDI (optional bonus)
- **OUTPUT**: raw WebGL2 — hand-written GLSL ES 3.00, additive blending (`ONE, ONE`). Creatures are `gl.POINTS` shaped by a baked radial-glow sprite. NOT three.js, NOT Canvas2D as the render surface (the only 2D canvas use is baking the 1-D glow gradient texture).
- **TECHNIQUE**: interval-clash scoring → spawn a wobble-monster → resolve-by-consonance ("tension and release").
- **PALETTE**: warm, playful, friendly-monster (deep plum → warm ember background; bold saturated per-note hues).

## Named references

- **Consonance→dissonance "tension and release" pedagogy** — the whole loop is built on real harmonic tension that the child resolves, never a fail state.
- **Toca Band** — relational-character model: each note is a little creature you can toggle on/off and stack; the harmony is a relationship *between* characters, not a score.
- **Developmental finding PMC11336827 (2024)** — 4-year-olds prefer consonance but ONLY when the dissonant contrast is LARGE. So the monster's dissonance is UNMISTAKABLE: the engine flags only clearly-beating minor-2nd / major-7th (interval class 1) and tritone (class 6) clashes, with a clearly audible ~+6-cent beating partial and a slow 3.2 Hz shimmer. Mild dissonances are never flagged.

## How it works

Tap a glowing creature-key to toggle its note on; tap again to remove it. Stacking 2–3
creatures builds a chord with no precise multi-touch-hold required. When the sounding set
contains a clash, `harmony.ts` scores it and the offending creatures grow shivering soft
spikes (WebGL) plus a beating detuned partner partial and shimmer LFO (Web Audio) — the
wobble is the ONLY change: never louder, never harsher, never higher. `suggestResolution`
computes the one consonant note (a 3rd / 5th / octave) that would remove the clash, and that
key gently pulses as an invitation. Adding it settles the monster into a round steady creature
with a soft bloom reward and a warm resolved chord. There is no "wrong note", no lockout, no
scolding sound — all 12 chromatic notes always play.

### Kids-safe audio

Every voice routes `osc → voiceGain → masterGain (0.26) → lowpass (6.5 kHz) →
DynamicsCompressor (−10 dB, 20:1) → destination`, with ≥40 ms soft attacks and an
always-on warm ambient pad so it is never silent. An `AnalyserNode` taps the master for
visuals but is never routed to `destination`. The `AudioContext` (and MIDI request) are
created only inside the first tap of the big "Play" button (iOS gesture gate). Bar: safe for
a sleeping toddler next door.

### Auto-demo

If untouched ~1.5 s, the page loops the full arc hands-free: sound two clashing notes (a
visible, audible wobble-monster spawns), then add the resolving 5th (monster settles + bloom).
An unattended glance both sees and hears the spawn-then-calm story.

### Feature-detection fallbacks

- **No AudioContext** → `text-rose-300` notice; Start still attempted.
- **No WebGL2** (or renderer init throws) → `text-rose-300` notice, audio keeps playing and the auto-demo keeps running (the keys still sound).
- **No Web MIDI** (`navigator.requestMIDIAccess` absent) → "keyboard not supported here — tap the keys"; on-screen keys remain the always-available primary input. Connected / no-device states show "🎹 connected" / "🎹 plug in a keyboard — optional".

## Design note

The pedagogy here is emotional, not theoretical: a 4-year-old can't read "minor 2nd," but
they can *feel* a wobbly monster and *want* to make it happy. By making dissonance a
character with a clear, large, friendly wobble (per PMC11336827) and giving an unmistakable
glowing invitation toward consonance, the child experiences genuine harmonic tension-and-release
as a game of befriending — discovering resolution by ear, with zero fear of a wrong note.
