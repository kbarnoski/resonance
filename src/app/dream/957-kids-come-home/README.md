# 957 · Come Home

> Can a 4-year-old *feel* a melody wanting to come home?

The first KIDS piece in the lab built around real **tonal tension and
resolution** — a cadence you can feel with your hand.

## What it is

A glowing dusk hill. A single luminous **firefly** rests at the bottom, at
**home**. The child drags it up an invisible hill; as it rises the pitch climbs
a diatonic ladder, the colour gets hotter, the light shimmers faster, and a
detune **wobble** creeps in. Near the top the firefly reaches the **leading
tone (ti)** and visibly trembles — it is being *pulled* toward home. When the
child **lets go**, the firefly swoops down and **resolves to the tonic (do)**
with a warm major-chord bloom and a soft "ahh". That release is a real
**V → I / leading-tone resolution**.

## How to play

1. Tap **Start** (this creates/resumes the AudioContext inside the gesture, for
   iOS).
2. Drag the firefly **up** the hill. Higher = higher note + more tension.
3. **Let go.** It comes home and blooms.

No reading required. One gesture: drag up, let go. Works with touch *and* mouse.
If you don't touch anything, a **ghost firefly** runs the cadence on a slow loop
within ~1 second, so an untouched screen is always alive and sounding the
tension-and-release. Real touch overrides it; after ~4 s of idle the demo
resumes.

## The mapping: pitch ↔ hill ↔ chord

| Hill height        | Melody (C major) | Supporting chord | Feel             |
| ------------------ | ---------------- | ---------------- | ---------------- |
| bottom (home)      | do / C4          | **I** (C E G)    | rest, resolved   |
| rising             | re mi fa sol la  | I → V crossfade  | building         |
| top (leading tone) | **ti / B4**      | **V** (G B D)    | trembling, pulled |
| let go → swoop     | back to **do**   | snap to **I**    | the bloom home   |

- **Melody voice:** triangle + soft sine octave (light FM-ish brightness) with
  ADSR-style attack/release, a detune-wobble LFO that grows with height and
  vanishes on resolution.
- **Harmony:** two sustained triangle pad chords (I and V), crossfaded by a
  `tension²` curve so the dominant only really blooms near the top — the child
  *hears* the cadence, not just one note. Max 3 notes per chord.
- **Always-on pad:** a soft low C/G drone so it is never silent.
- **Resolution:** `bloomHome()` snaps the harmony back to I, kills the wobble,
  and swells a warm C-E-G "ahh" bloom (sine + triangle through a gentle
  lowpass).

### Kids-safe master chain (mandatory)

```
voices → master gain (0.24, ≤0.26) → lowpass ~7000 Hz → compressor(−10 dB, 20:1) → destination
```

Nothing can be harsh or loud, and no "wrong" note is possible — the height
quantizes to the nearest diatonic rung.

## Renderer

Raw **WebGL2** with hand-written GLSL ES 3.00 (no three.js): a dusk sky
gradient that warms toward amber with tension, a dark rolling hill, a "home"
glow at the base, an additive firefly bloom + soft trail, and the trembling
offset at high tension. If `webgl2` is unavailable it falls back to a **Canvas2D**
version of the same scene (same audio) and shows a `text-rose-300` notice
"(showing the simple view)". Handles context-loss/restore and full teardown
(cancels rAF, deletes GL resources, removes listeners).

## Named references

- **François Pachet, "Attractive and Repulsive Pattern Control in Sequence
  Generation," arXiv:2606.24911 (June 2026)** — signed coupling where a target
  pattern is an *attractor* (the sequence is drawn toward it) or a *repulsor*.
  Here the **tonic is the attractor**: the melody is *drawn home*. This is the
  conceptual seed of the whole piece.
- **"Sad syntax? Tonal closure affects children's perception of emotional
  valence," arXiv:2008.01810** — children feel tonal closure/resolution
  emotionally; this grounds the claim that a 4-year-old can *feel* the cadence.
- **Leonard Bernstein on the appoggiatura** — "the music *wants* to resolve."
  The leaning, trembling leading tone made physical in the firefly.

## Next-cycle deepening (honest notes)

- The cadence is currently a fixed V → I. A deepening would let the *path* the
  child draws shape the harmony (a ii –V–I, a deceptive V–vi to "tease" home),
  so resolution can be earned, delayed, or denied — directly modelling Pachet's
  attractor *strength*.
- Pitch quantizes to 7 rungs; a continuous glissando with snap-on-release would
  let older kids feel the *pull* as a force, not a staircase.
- The "ahh" is a lowpassed oscillator stack; a proper two-formant vowel would
  make the home landing read as a human sigh.
- Add a faint visual "ghost path" of where home is, so the pull has a spatial
  target, not just an audible one.
- Haptics on iPad (a soft tick at the leading tone, a warm pulse on resolution)
  would make the cadence literally felt in the hand.
