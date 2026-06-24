# Balance Band

A kids (4-year-old) musical seesaw where a **wrong note tips the beam and STAYS tipped** — a sour, buzzing chord that does *not* auto-resolve. The child earns the calm back by physically balancing the music: hang a friendly consonant creature on the high (lighter) arm to glide the beam level and bloom the dissonance away.

> The one question: *What if a young child could FEEL a wrong note as a seesaw tipping over — and had to balance the music back to consonance themselves?*

This is deliberately **not** a "no-wrong-notes / safe-scale" kids piece. Dissonance is a *consequence that persists*, not a thing we hide.

## The mechanic — torque ↔ harmony

The beam is a **2D rigid lever** rendered in **Canvas2D** (no WebGL/three.js/SVG). Children tap glowing rings (≥64px palette buttons + large on-beam tap targets) to hang singing **creature-weights** at discrete slots along each arm.

**Physics (real 2D torque balance).** Each hung creature contributes
`torque = mass × signed_distance_from_fulcrum`. Mass is `1.0` for friendly creatures and `1.7` for spicy (dissonant) ones — spicy creatures are literally *heavier and grumpier*. Distance grows outward (`(slot+1) × SLOT_GAP`), so creatures further out have more leverage. The summed torque is normalized to a target angle clamped to **±28°**, and the rendered angle eases toward it each frame:
`angle += (target − angle) × 0.08` — giving a gentle, physical settle.

**Harmony engine.** The set of hung creatures forms a chord judged against a C root (`ROOT_MIDI = 60`). Pitch classes `{0,3,4,5,7,8,9}` semitones are treated as consonant; the spicy creatures are the **tritone (F#)** and **minor-2nd (Db)**, which are dissonant. Each creature maps to a scale degree of C major (C/E/G = friendly; F#/Db = spicy). No reading required — only color, shape, and emoji.

**Dissonance persists (the whole point).** When a spicy creature is present, its side gets heavier, the beam **tips toward it and stays tipped**, the creature renders as a spiky/wobbly star, and its voice gains a `+14¢` detuned beating partner plus a faint sawtooth shimmer. There is **no auto-correct** — the sour buzz holds until the child acts.

**Earning the calm.** The child hangs a balancing friendly creature on the high arm. When torque returns near level (`|target| < 0.06`), the harmony engine re-evaluates the chord and the sour/shimmer voices glide to silence via `setTargetAtTime` — a warm consonant **bloom** rewards the return, and the background halo warms from rose to green. A big **↺ Start over** button clears the beam.

**Never silent, self-demoing.** An always-on soft drone (open fifth C2 + G2) plays from the first tap. If the beam sits empty for ~2s, it auto-hangs a creature or two so a hands-free glance both *sees* the beam move and *hears* sound within ~1s.

## Audio-safety chain (kids-safe, mandatory)

Every voice routes through:

```
voices → masterGain(0.26) → BiquadFilter lowpass(6kHz) → DynamicsCompressor(thr −10, ratio 20:1) → destination
```

- Soft attacks (≥40–60ms). Per-voice peaks well under master.
- Warm timbres: sine fundamental + soft octave partial. Even the "dissonant" voice reads as *wobbly/grumpy* (slow beating + gentle shimmer), never loud or shrill.
- Gesture-gated: the `AudioContext` is created/resumed inside the first **Start** tap (≥64px cloud button) for iOS.
- No `AnalyserNode` is routed to `destination` (none used here; if added it would tap off master for visuals only).

## Fallbacks / robustness

- No Web Audio (or construction throws) → a `text-rose-300` notice appears and **visuals stay fully alive**; the seesaw remains playable.
- Wrapped in try/catch so the page never throws an unhandled error or shows a dead screen.
- Full teardown in `useEffect` cleanup: `cancelAnimationFrame`, stop all oscillators, `audioCtx.close()`, and remove the resize listener.

## Subsystems integrated (≥3)

1. Touch input (palette selection + Canvas pointer hit-testing to nearest slot).
2. 2D rigid-lever torque physics sim (mass × leverage → eased angle with settle).
3. Interval consonance/dissonance harmony engine (chord judged vs. root; persistent sour voice + earned bloom).
4. Canvas2D render (beam, fulcrum, hanging creatures, pulsing tap-target rings, mood halo).

## Research grounding

- **Developmental:** 4–6 year olds are *just acquiring* consonance/dissonance categorization (NIH/PMC11336827); consonance is perceived as pleasant and dissonance as unpleasant with measurable affective valence (PMC12605063, Oct 2025). Balance Band teaches the *category* by making dissonance a consequence that persists and must be resolved by the child — not by hiding wrong notes behind a safe scale.
- **Technique anchor (optional):** real-time non-linear modal/impact synthesis (arXiv 2603.10240, Mar 2026) informs the framing of the beam's settle/clack and the creature voices as physical impacts.

## Tags

INPUT: touch · OUTPUT: Canvas2D · TECHNIQUE: 2D rigid-lever torque balance ↔ interval-consonance harmony engine · VIBE: kids, warm, playful.
