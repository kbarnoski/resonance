# 743 · Song Family

**What if a 4-year-old's hummed songs hatched a FAMILY of glowing companions who
sang the child's melodies back in stacked HARMONY — and their voices were made
from grains of Karel's OWN real recorded "Welcome Home" piano?**

A near-dark, calm luminous world for little ones (3+, no reading). Hum a phrase
and a glowing friend hatches who remembers it. Hum more and a whole family
appears (cap 4), each visibly growing — bigger, brighter, warmer in hue — as it
hears more. When the child goes quiet, the family sings the remembered melodies
back as a **chord choir**: at any moment each companion sings a different
consonant chord tone, so a single remembered line blooms into warm 3–4-part
harmony. Nothing is ever wrong — pitches snap to D-Dorian.

This is the **cycle-2** of `738-kids-song-sprout` (a single creature that
remembered & recombined a child's hums). Cycle-2 is the multi-voice **harmonic**
deepening AND the fusion with Karel's real recordings.

## How to use

Tap **"Sing to them"** (mic) or **"Just watch them dream"** (hands-free auto-demo),
hum a few notes, then go quiet and listen.

## Technique

- **Mic analysis-only** (never routed to output): RMS-gated autocorrelation pitch
  estimate segments sustained phrases into a short note sequence, quantized to a
  consonant D-Dorian scale.
- **Phrase-memory store** (`family.ts`) is the long-form source of truth for both
  audio and visuals. The first phrase hatches the first companion; later phrases
  hatch more (cap 4) and feed soft saturating growth, so minute 5 differs from
  minute 1.
- **Harmony scheduler:** each companion is assigned a different scale-degree chord
  tone from a stack that DEEPENS with maturity (unison+octave → root+5th+octave →
  root+3rd+5th+9th), thickening 1→4 voices and monophonic→chordal. Cadence is
  free / rubato with staggered entrances and breaths — deliberately **not** a
  quantized step-sequencer grid.
- **Grain voice = Karel's REAL piano.** At runtime it fetches his recording via
  the existing public `/api/audio/<id>` GET route (loader pattern copied verbatim
  from `720-paths-grainfield` / `721-kids-piano-garden`: 4s abort, JSON-`{url}`
  or raw bytes, `decodeAudioData`), shatters it into a CataRT-style grain corpus
  (each grain tagged with RMS, brightness, and a crude fundamental), and a sung
  note selects grains near that pitch and **pitch-shifts** them (playbackRate)
  onto the exact note with Hann windows — concatenative resynthesis. If the fetch
  fails / times out / is offline, it falls back to a gentle offline-rendered
  FM/additive piano-ish buffer so the piece ALWAYS sounds.
- **Kids-safe master chain:** master gain ≤0.3 → lowpass ~7.5 kHz →
  DynamicsCompressor(−10, 20:1) → destination.
- **Renderer:** RAW **WebGL2** (`getContext("webgl2")`, own GLSL ES 3.00
  shaders). A fullscreen triangle's fragment shader sums soft additive glow from
  uniform-array companion data (position / radius / brightness / hue / singing
  pulse) — dark calm field, gentle bloom, slow drift. A Canvas2D glow-dot
  fallback covers devices without WebGL2.

## Degrades gracefully

- No mic → ghost auto-demo: a virtual child hums, hatching & growing companions.
- Karel's piano fetch fails → synth-voice fallback (with a small on-screen note).
- No WebGL2 → Canvas2D glow-dot fallback.
- iOS AudioContext resumes on first tap.

## References

- Diemo Schwarz — **CataRT** concatenative / corpus-based synthesis (selecting &
  concatenating grains of a real recording by descriptor).
- arXiv **2506.18143**, "AI Harmonizer" — generating four-part harmony from a
  single voice.
- Brian Eno — *Reflection* (generative, ever-unfolding, never-looping ambient).

Uses Karel's real **Welcome Home** piano (recording id `549fc519…`).
