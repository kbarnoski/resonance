# Morning digest — last updated 2026-08-09 (cycle 1069, DEEP)

**Open first:** https://getresonance.vercel.app/dream/8856-pendulums

## New since yesterday
- **`8856-pendulums` — a Doppler pendulum-wave you can HEAR.** A row of 14
  sound-sources swing on strings of graduated length (the classic pendulum-wave
  apparatus). Released together they fan out of phase, then re-converge over a
  ~48-second breath — and because each bob's real **Doppler shift** (pitch rises
  as it swings toward you, falls as it recedes) sighs a vibrato at its own swing
  rate, the ensemble shivers apart into shimmer and re-fuses into a chord. **You
  don't play notes — the MOTION is the music.** Pure DOM/CSS (no WebGL), so it's
  light and phone-perfect; **tilt your phone** to lean the wave (drag on desktop).
  *Why open it:* it's mesmerizing on a muted screen — the wave moves the second
  it loads, no sound or tap needed. Best with the volume on.

## How it was made (DEEP fire, 3 parallel builders → 1 shipped)
- Cycle 1069 ran **DEEP**: ONE concept — *"THE DOPPLER STAGE: set sound-sources
  moving around your ear, the Doppler shift IS the melody"* — raced three ways on
  three different substrates. Shipped the pendulum-wave; **2 more explored — see
  IDEAS.md.**

## In the bank (built to demoable this fire, resurrect-ready — IDEAS §1069)
- **⭐⭐⭐ `8824-slingshot` — FLING a sound past your ear.** Grab a source and
  throw it; a fast pass-by wails the iconic siren "neeee-yowww." The boldest,
  most stage-playable of the three — resurrect first. (Didn't win only because
  its Canvas2D substrate was well-used lately; the winner's DOM/CSS was starved.)
- **⭐⭐ `8840-orrery` — an orbital music-box** where orbital velocity is the
  tuning. Elegant, but a centred ear hears zero Doppler — resurrect with
  elliptical orbits.

## Research finding (§1069)
- The 2026 spatial-audio frontier (DynamicSound, arXiv:2601.15433) races to
  *faithfully reproduce* moving-source Doppler for VR realism — always for one
  passive listener. The un-built inversion, and tonight's build: make the
  Doppler bend the **instrument** — author motion, hear the pitch.
- **Heads-up / caught by the pre-build check:** last night's "resurrect the
  cross-synthesis piece first" note turned out to be a near-duplicate of two
  shipped prototypes (`532-vocoder-veil`, `1310-piano-duet`) — so I did NOT ship
  it. The novelty grep did its job.

## Open questions for Karel
- The AI-pipeline chain (music→image→video, needs `FAL_KEY`) has stood ~35
  cycles. Build it or strike it from the queue?
- Strategic (flagged ~15 cycles): "first-ever technique" is unreachable at 1000+
  prototypes — formally reward fresh-verb + scope + diversity instead? Tonight is
  another honest 3/5 with no #1.
