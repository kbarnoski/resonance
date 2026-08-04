# 6568 · Dulcet

**Route:** `/dream/6568-dulcet`

> What if you could play a pure-SVG hammered dulcimer — strike its crossing
> courses of strings with a hammer, where strike velocity sets brightness and
> strike position along the string sets which modes ring — and each struck string
> flashes and vibrates with the exact modal decay you hear?

A trapezoidal soundboard hangs in the dark: two bridges cross ~15 diatonic
courses (a just-intonation major scale over two octaves), low at the bottom, high
at the top. Strike a course with the pointer and it rings as a **bank of decaying
resonant modes**; the `<polyline>` you watch bend **is** the summed modal
displacement that produces the sound.

This is **cycle 2** of the lab's "vector strings" line. Cycle 1
(`6456-loomstring`) proved a plucked string's visible SVG displacement *is* the
acoustic state. Cycle 2's job was to make it a **performable instrument** — a
struck / hammered string via **modal synthesis**, played expressively rather than
poked.

## The method — modal synthesis of a struck string

- **Mode bank.** Each note is a bank of `M = 7` resonant modes: sine partials at
  slightly inharmonic frequencies `fₖ = f₀·k·√(1 + B·k²)` (`B` = a little
  metallic-wire inharmonicity), each with its own amplitude `aₖ` and decay time
  `τₖ`. Higher modes decay faster (`τₖ = τ₀ / (1 + 0.8·(k−1))`); lower notes ring
  longer overall. A short strike excites them all at once. In Web Audio each mode
  is one enveloped `OscillatorNode` (fast linear attack → exponential decay over
  `τₖ`); the modes sum into a per-strike voice gain. No samples, no libraries.
- **Strike position → spectral weighting.** Each mode is weighted by
  `|sin(k·π·pos)|` — the classic struck-string spectrum. Strike the **middle**
  (`pos ≈ 0.5`) and the even modes vanish while the fundamental dominates → a
  round, warm tone. Strike **near an end** (`pos → 0/1`) and the weighting grows
  with `k`, so the high partials ring through → bright and thin. This genuinely
  changes **timbre**, not just level.
- **Velocity → brightness.** A hard strike flattens the `1/kᵗⁱˡᵗ` roll-off
  (`tilt = 1.75 − 1.05·vel`), pushing energy into the upper modes (brighter); a
  soft strike steepens it (darker). Per-strike velocity comes from **pointer
  speed** during a roll, or a deliberate medium tap on a fresh press.

## The expressive layer (this is what makes it cycle 2)

- **Two hammers.** Pointer Events are tracked per `pointerId`, so **multi-touch**
  gives you two independent hammers — play a rolling tremolo across two courses
  with two fingers, exactly like a real dulcimer.
- **The roll.** A held pointer dragging across courses re-strikes each one it
  reaches; a back-and-forth wag on a single course re-strikes it past a small
  horizontal threshold — both produce the characteristic dulcimer **roll**, with
  velocity from pointer speed. A short per-course cooldown keeps it musical.
- **Damping (palm mute).** Hold **Shift** or tap the **Palm** button to shorten
  every decay — new strikes get a choked `τ`, and everything currently ringing is
  damped fast in both audio and vibration. Expressive muting.

## The see = hear weld

The **same mode bank** that feeds the oscillators also draws the string. Each
course is a `<polyline>` whose vertices are the superposed modal displacement:

```
u(x, t) = Σₖ  level · aₖ · sin(k·π·x) · cos(ωₖ·t) · e^(−t/τₖ)
```

The mode **shapes** `sin(k·π·x)`, their strike-position-weighted **amplitudes**
`aₖ`, and their **decay envelopes** `e^(−t/τₖ)` are exactly the acoustic ones —
nothing is faked for the eye. The single honest compromise: the oscillation
frequency is time-scaled (`ωₖ = 2π·fₖ · VIS_FUND/f₀`) down to a visible few Hz so
you can watch each mode beat, while the decay runs in real wall-clock seconds —
so the line **settles as you hear it settle**. Idle courses are straight taut
lines; a struck one flashes brightness proportional to strike energy and dims as
it decays.

## Constraints honoured

- **Pure SVG, zero GPU** — no three.js / WebGL / WebGPU / `<canvas>`. Every course
  is a `<polyline>`; the RAF loop writes `points` straight to the DOM. React
  renders the structure once.
- **Web Audio only** — a hand-built mode bank (`OscillatorNode` + `GainNode`
  envelopes), a seeded-noise convolution reverb, and a `DynamicsCompressor`
  limiter. No audio libraries, no new npm deps.
- **Determinism** — all randomness runs through `mulberry32` seeded `0x6568`. No
  `Math.random`, no `Date.now` / `new Date`; timing is `performance.now` + RAF.
- **Voice safety** — a 16-voice cap (oldest struck voice stolen when full), master
  gain `0.15`, and the limiter mean a fast roll can't clip or blow up.
- **Graceful degradation** — `AudioContext` created/resumed on first gesture; a
  "tap to play" hint until then; audio init is wrapped in try/catch and failure
  surfaces as a `text-destructive` notice, never a white screen.
  `prefers-reduced-motion` dampens the vibration amplitude.
- **Alive on load** — a soft seeded phrase strikes gentle near-middle notes every
  couple of seconds (silent until the first gesture unlocks audio) and yields the
  instant you touch the board.
- **Full teardown** — RAF cancelled, listeners removed, oscillators stopped, all
  audio nodes disconnected, `AudioContext.close()` on unmount.

## References

- J. O. Smith III, *Physical Audio Signal Processing* (CCRMA / online book) — the
  modal / resonant-filter view of struck and plucked strings, and struck-string
  spectra weighted by strike position `sin(k·π·pos)`.
- J.-M. Adrien, *The Missing Link: Modal Synthesis* (in *Representations of
  Musical Signals*, MIT Press, 1991) — the canonical modal-synthesis formulation
  (a resonating object as a bank of decaying modes excited by an impulse).
- Fletcher & Rossing, *The Physics of Musical Instruments* — hammered-string /
  dulcimer acoustics and strike-point spectral shaping.
- *A Review of String Instrument Synthesis Methods for Use in Interactive Systems*
  (TISMIR, 13 Apr 2026) — finds physical-modeling synthesis (with modal among its
  named PMS families) dominates the real-time interactive Tier-1 landscape.

## Honest rough edges

- The visual oscillation is **time-scaled** to a few Hz so individual mode
  vibrations are perceptible; the mode ratios, amplitudes and decay times are
  real, but the absolute pitch of the *motion* is not the audio pitch (that would
  alias at 60 fps). This is the deliberate see=hear compromise, made explicit.
- Modes are **linear and non-interacting** — a real hammer has a finite,
  amplitude-dependent contact time that low-passes hard strikes; here brightness
  is modelled directly as a spectral tilt, which is a simplification.
- Inharmonicity `B` is a single fixed constant, not derived per-course from wire
  stiffness; it reads as "metallic" without being a measured dulcimer.
- Strikes snap to the **nearest course** (its pitch is fixed); strike *position*
  along the string is continuous and is the real timbral control.
