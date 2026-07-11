// readme.ts — design-notes prose shown IN-PAGE via the "Design notes" toggle.
// Kept in sync with README.md by hand.

export const README = `Sema Ascent

What if Resonance could take you into an ecstatic whirling trance — a drug-free
Sufi sema — as a long-form, self-evolving CLIMB? Nested rings of light spin at
locked polyrhythmic ratios; the whole architecture accelerates, phase-locks, and
lifts you into a white-hot peak, then sets you gently down. You are different at
minute 6 than at minute 1.

This is an ASCENT, not a dissolve. It builds, gathers speed, and blazes.

HOW IT WORKS

The whirl (three.js scene-graph)
  Nine nested shells of light, each an InstancedMesh of flame-shard "petals"
  plus an additive halo, stacked and tilted like a gyroscope / orrery. Real 3D
  with perspective and depth — not a full-screen shader, not a point cloud. A
  camera-facing Sprite core swells white-hot at the peak. All glow is additive
  emissive (no post-processing) so it stays fast and robust.

The polyrhythm (one shared conductor)
  Each shell spins at an angular velocity in integer ratio 2:3:4:5:6:7:8:9:11.
  Because the ratios are coprime-ish, the pattern is always shifting and only
  momentarily aligns — it never repeats on a short loop. Counter-rotating shells
  read as a single breathing gyroscope. At the Fana peak the ratios blend toward
  one shared velocity: the shells PHASE-LOCK into a brief blazing alignment.

The arc (~6 minutes, stateful, non-repeating)
  I  Invocation   — one slow shell, sparse pulse.
  II Gathering    — shells ignite one by one, tempo creeps up.
  III Acceleration — polyrhythms tighten, gold warms toward white.
  IV Fana (the lock) — shells converge, the core swells white-hot: annihilation-
     in-union. This is a one-time peak, not a loop.
  V  Descent      — everything slows, cools to amber embers, comes to rest.
  Parameters evolve monotonically; "trance energy" from your surges is remembered
  and biases the climb, so no two runs are identical.

Audio-visual coupling (Web Audio, pure synth)
  A continuous inharmonic drone ground glides underneath — never snapped to a
  fixed scale. Every bell/percussion hit is fired by a ring rotation crossing a
  phase GATE from the same conductor: what you see spin is what you hear pulse.
  The bells are inharmonic (two detuned partials, fast decay). Density and
  brightness rise to the peak and thin out in the descent. Master chain:
  everything → a DynamicsCompressor limiter → a master gain that ramps up from
  silence (peak ≤ 0.2) → out. Voices capped at 14.

INPUT
  • Tilt your phone (DeviceOrientation) to lean the whirl axis — primary input.
    iOS asks permission on the first tap of Begin.
  • Tap / click (or Space) = a SURGE that boosts trance energy and speeds the
    climb.
  • No tilt? It falls back silently to pointer-lean + keyboard, and it fully
    self-runs with no input at all.

SAFETY
  Gesture-gated audio, ramp from silence, limiter, ≤14 voices, full teardown on
  unmount. The white-hot peak is a slow swell-and-fade (well under 3 Hz — no
  strobe). Reduced-motion is honored: rotation is damped and the bright flare is
  suppressed for a calm, slow version. Fully deterministic (seeded mulberry32,
  performance.now timing — no Math.random / Date).

REFERENCES
  • The Mevlevi Order / whirling dervishes and the sema ceremony — rotational
    ecstatic trance toward fana (self-annihilation-in-union).
  • Gilbert Rouget, Music and Trance (1985) — music as the driver of trance.
  • Aparicio-Terrés et al., "The neurobiology of altered states of consciousness
    induced by drumming and other rhythmic sound patterns," Annals of the NY
    Academy of Sciences (2025) — rhythmic sound → absorption/entrainment.
  • Current anchor: ASTRODITHER (Robert Borghesi), an audio-reactive three.js
    WebGPU/TSL experiment, released 2026-07-01 — momentum for audio-reactive
    three.js scene-graphs.

KNOWN LIMITATIONS
  • Additive glow approximates bloom; a true bloom pass would deepen the peak.
  • The phase-lock is expressed through shared velocity + color flare rather than
    a literal petal-perfect grid snap.
  • Bell voices are throttled, so at maximum density some polyrhythm gates are
    dropped to protect the ear and the voice cap.

NEXT-CYCLE DEEPENING
  • Literal geometric alignment at Fana: ease every petal onto a shared radial
    grid so the lock is visually unmistakable.
  • A second, slower macro-arc across multiple cycles (a "night") so cycle 3
    differs from cycle 1 — real long-form memory.
  • Breath / heart-rate input (mic or sensor) to entrain the tempo to the body,
    closing the trance loop.`;
