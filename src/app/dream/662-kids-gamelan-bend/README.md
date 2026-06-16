**For**: kids (4+)

# Bronze Bend — 662-kids-gamelan-bend

## The one question
What if a 4-year-old could grab a glowing bar of bronze and BEND its pitch
across a real Indonesian gamelan tuning — and discover that a note that sounds
"wrong" at first can settle into something beautiful?

## How to play (no reading required)
- A row of five glowing bronze metallophone keys sits in a temple-dusk field.
- **Touch a bar** to strike it — it rings with a shimmering bronze tone.
- **Drag up or down** on a bar to BEND its pitch continuously: up = sharper,
  down = flatter. You can slide a tone past its neighbours and back.
- **Let go** and the bar springs slowly back toward its in-tune (laras) pitch.
  As it nears tune, the metallic beating *shimmer slows down* — the note
  audibly calms. That is how a child hears "in tune" vs "out of tune."
- **The big sun/moon button** flips the WHOLE instrument between two real
  gamelan tunings. Sun = **slendro** (open, floating). Moon = **pélog**
  (tense, with a close half-step). Every key AND the low gong drone re-tune
  at once — a real, audible mass re-tuning the child triggers.

There is no wrong note and no fail state. Bending is expressive, never
punished. An always-on soft bronze gong drone keeps it alive, and an
auto-demo shimmers/strikes gently when no one is touching, so a silent
glance still looks and sounds alive.

## The real harmonic event (audible, NOT pentatonic-snap)
1. **Re-tuning the mood**: flipping slendro⇄pélog moves every key and the
   drone to new cent values. Slendro's roughly-equal steps sound open;
   pélog's ~120-cent half-step makes it tense. The child hears the
   instrument's whole character change.
2. **Bending into and out of tune**: the bend has NO scale-snap. A bent note
   genuinely sits between pitches and beats against its laras neighbours; as
   it springs home the beating settles. Out-of-tune isn't scary — it's
   expressive, and resolving it is satisfying. This teaches consonance vs
   dissonance by ear.

## Tuning notes (real cents, not 12-TET, not pentatonic-snap)
Root ≈ 246 Hz. `freq = root * 2^(cents/1200)`.
- **Slendro** (≈5 roughly-equal steps/oct): `0, 231, 474, 717, 955` (→1200).
  Famously not equal and varies per gamelan; this is a playable approximation.
- **Pélog** (common 5-key subset of the 7-step laras): `0, 120, 270, 540, 670`
  (→1200). The small ~120-cent half-step gives pélog its tense colour.
- **The bend** maps a full key-height drag to roughly ±300 cents, so a child
  can slide a tone clearly past a neighbour and back.

## Core technique — inharmonic modal bronze synthesis
Real gamelan metallophones (saron/gendér) are struck bars with STRETCHED,
inharmonic partials, not integer harmonics. Each key here is additive sine
partials at bar-mode-like ratios **1, 2.76, 5.40, 8.93**. Every partial is
two slightly-detuned voices, so the pair beats slowly — the signature bronze
shimmer. A struck envelope (≈6 ms attack, ~3.4 s ring) gives the strike + long
ring. The beating depth scales with bend: in tune ≈ 0.6 Hz (calm), fully bent
≈ 6 Hz (restless). The low gong drone uses the same inharmonic recipe an octave
down; its upper partial glides to a new ratio on a laras flip (slendro keeps the
open 2.76 bronze colour, pélog leans tenser), so the re-tune is felt underneath. This inharmonic-modal-bronze
timbre is the prototype's signature and had not been used in the lab.

## Safe sounds
All audio routes through `master gain → lowpass (7.2 kHz) → DynamicsCompressor
(brick-wall-ish limiter) → destination`. No harsh highs, no sudden loud
transients. AudioContext is created/resumed inside the first user gesture
(iOS unlock).

## Named reference
- Ableton "Tune a Gamelan Yourself" interactive Sundanese-gamelan tuner
  (tuning.ableton.com), and Javanese **slendro / pélog** *laras*.
- The inharmonic bar-mode acoustics of struck bronze idiophones (saron/gendér).

## Graceful degradation
- **Primary renderer: WebGL2** — a fullscreen fragment shader paints the
  bronze field with heat-haze shimmer and additive glow on struck keys. This
  is the path that runs on iPad Safari (iOS has WebGL2).
- **Fallback: Canvas2D** — if no WebGL2 context is available, a Canvas2D
  renderer draws the same bars with glow and bend, still shimmering and still
  singing. A `text-rose-300` note tells the user the fallback is active.
- Audio and animation are cleaned up on unmount (rAF cancelled, nodes
  disconnected, AudioContext closed).
