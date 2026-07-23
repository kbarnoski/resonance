# 2332 · Lock

**The question:** What if an altered state were not a knob you turn, but a lock
you have to *earn* — where the trippy bloom only arrives when your own body's
rhythm phase-locks to a drifting pulse, and drifts away the instant you lose the
lock?

A drug-free neural-entrainment instrument. A stimulus **pulse** ticks at a tempo
that slowly **drifts** through 1.65 → 2.25 → 2.85 Hz and back (a ~40 s triangle
sweep). You try to entrain to it by **tapping** — spacebar, a click/tap anywhere
on the tunnel, or microphone onsets if you grant the mic. The visual/audio bloom
is *gated on your entrainment*, not on any intensity control.

## How to play

1. Press **Start** (audio + visuals begin together; silent until then).
2. On load a **seeded autopilot** flies a virtual tapper through the whole arc —
   searching → locking tempo but in the wrong phase → correcting → drifting →
   relocking — so the piece is alive with zero interaction.
3. Press **Take over** (or just tap) to steer it yourself.
4. Chase the pulse: match its **tempo** *and* land **on its beat**. When both are
   good the shells snap into concentric rings that swell on the beat and the
   camera glides forward. Stop tapping and the lock decays.
5. Optional: **Use mic** to tap with claps/percussion (onset-driven). No mic →
   spacebar and clicks still work. No WebGL → the tunnel is replaced by a notice,
   but the readouts and audio keep running.

## The two-independent-variables design (no master knob)

The "state" is **two genuinely independent axes that can conflict** — never one
0→1 dial:

- **tempoError** — does your inter-tap tempo match the current stimulus tempo?
  (Computed from the median inter-tap interval vs. the drifting pulse period.)
- **phaseError** — do your taps land *on* the pulse, or in anti-phase? You can
  match tempo perfectly and still tap on the off-beat; you can hit one beat by
  luck at the wrong tempo.

Consistency across recent taps is the **PLV (phase-locking value)**: the
magnitude of the mean unit phasor `e^(i·2π·tapPhase)` over a sliding window of
recent taps. High PLV means a *stable* phase relationship — which may still be
the wrong phase.

These drive the piece on two separate channels, so the two never collapse into
one scalar:

- `coherence = PLV × (1 − tempoError)` → how organized/bright the rings are and
  how fast the camera glides. The **ring swell** is timed to *your* tap-phase.
- A crisp reference **flash** marks the *true* stimulus beat every cycle.

That produces three clearly distinct regimes:

| state | PLV / tempo | phase | looks / sounds like |
|-------|-------------|-------|---------------------|
| **searching** | low coherence | — | jittered, dim, desynchronized shells; drone is choppy, detuned, dark |
| **off-phase** | high coherence | wrong | clean concentric rings — but they swell *between* the beat-flashes, and the tap-click syncopates between the woodblock beats |
| **entrained** | high coherence | right | rings swell *on* the flash, camera glides smoothly; drone unifies and gently opens; tap-click and beat coincide |

The wrong-phase state is the whole point: you can be perfectly *locked* (high
PLV, right tempo) and still not entrained, because you are locked to the wrong
phase. It reads and sounds unmistakably different from both unlocked and fully
entrained.

## Audio

- **Stimulus pulse** — a soft filtered woodblock on every beat at the drifting
  tempo (always audible; this is what you chase).
- **Tap click** — your own / the autopilot's taps get a softer, higher mint
  click, so the phase relationship is *audible*: coincident when entrained,
  syncopating when off-phase.
- **Drone bed** — two just-intonation anchors (root + fifth), each a detuned
  pair. `coherence` opens the lowpass and collapses the detune from a choppy
  beating cluster toward a unified, gently shimmering pad; `phaseAlign` smooths a
  tremolo chop. Kept calm and cosmic-ambient — a settling *into* lock, not a
  bright climax.
- Master ≤ 0.16 through a `DynamicsCompressor`, 1 s fade-in, torn down on unmount.

## References

- **Aparicio-Terrés et al. (2025)**, "The neurobiology of altered states of
  consciousness induced by drumming and other rhythmic sound patterns," *Annals
  of the NY Academy of Sciences* — thalamo-cortical entrainment to low-frequency
  rhythm parallels psychedelic mechanisms.
- **2025 study (PMC12014595)**, "The strength of neural entrainment to electronic
  music correlates with proxies of altered states of consciousness" — auditory
  entrainment peaks around ~2 Hz (tested 1.65 / 2.25 / 2.85 Hz), which is why the
  pulse sweeps exactly that range.
- **Lachaux, Rodriguez, Martinerie & Varela (1999)**, "Measuring phase synchrony
  in brain signals," *Human Brain Mapping* — the PLV measure implemented here.

## Honest limitations

- **tempoError does not fold octaves** — tapping double- or half-time reads as
  wrong on purpose, because matching the tempo means matching the tempo.
- **Mic onset detection is coarse** in noisy rooms; the spacebar/click path is
  the reliable input.
- The "altered state" here is an *evoked feeling of earned lock*, a
  phenomenology — not a clinical or medical claim.
- **Safety:** the pulse stays 1.65–2.85 Hz (< 3 Hz); luminance moves as smooth
  radial swells rather than a hard strobe; `prefers-reduced-motion` slows the
  camera glide and widens/softens the pulse.

## Files

- `page.tsx` — chrome, three.js renderer ownership, autopilot/human input, loop.
- `engine.ts` — the phase-locking math (PLV, tempoError, phaseError), the
  drifting stimulus, and the seeded deterministic autopilot. No master knob.
- `audio.ts` — stimulus pulse, tap click, entrainment-tracking drone.
- `tunnel.ts` — the `THREE.Points` concentric-shell entrainment tunnel.
