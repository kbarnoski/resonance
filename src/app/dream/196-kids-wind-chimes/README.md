# 196 — Wind Chimes

**For**: kids (4+)  
**Route**: `/dream/196-kids-wind-chimes`  
**Cycle**: 228 (kids build)  
**Status**: demoable

## What it does

Eight pentatonic wind chimes hang from a horizontal bar in a dark sky. Each chime
is a glowing colored rod with a bell disc at the tip. Longer = lower pitch (C3 left,
A4 right) — the BANDIMAL rule: kids discover this by watching without any label.

An invisible wind blows in every 3–6 seconds, causing the chimes to sway. When two
adjacent chimes collide at their tips, they ring together as a small chord and burst
with a glow halo.

**Interaction**: tap or drag anywhere on the canvas. The left half blows wind
leftward; the right half blows rightward. Sustained dragging creates a continuous
breeze. Strong gusts cause multiple adjacent chimes to cascade — a brief rising
or falling chord ripple.

**Audio**: additive bell synthesis — triangle fundamental + 2.756× partial +
5.404× partial (slightly inharmonic, characteristic of real metal tubes). Long 4.8s
exponential decay. Soft C3+G3 ambient drone underneath.

## What's new

- **First pendulum-physics prototype in the kids sandbox.** 195 prior kids prototypes
  use tap-response, bouncing balls (elastic), or Karplus-Strong strings. This is the
  first where gravity, damping, and wind force combine as a coupled pendulum system.
- **Emergent melody from physics.** The child sets initial conditions (wind direction,
  strength) and the chime array generates its own harmonic sequence. Same principle
  as `169-kids-marble-run` ❤️ but with continuous pendulum dynamics instead of
  ballistic trajectories.
- **Autonomous from load.** A startup gust immediately sets chimes swaying, so the
  canvas is alive before any touch — same pattern as `186-kids-breath-bloom` and
  `194-kids-turtle-trail`.
- **BANDIMAL at a glance.** The visual size gradient (long left, short right) teaches
  the low-left / high-right mapping without any label. After one wind gust, a child
  can direct wind toward the left side to hear deep notes.

## Physics notes

- Linearized pendulum ODE: `α = -(G/L)·θ − D·ω + wind/L`
- G_eff = 260 (visual-gravity scale), damping D = 0.30
- Euler integration with dt-clamping (max 50ms to survive tab-hidden frames)
- Collision: adjacent-pair tip distance < 18 px; elastic momentum exchange ×0.60
- Per-chime 0.55s cooldown prevents rapid re-triggering on sustained contact
- Wind decays as `wind *= exp(−2.2·dt)` — exponential decay matches natural
  wind-dying-down feel

## Polish ideas (future cycles)

- Add a "strong gust" on two-finger tap (both fingers = stronger wind)
- Make the bar itself glow slightly when a big cascade happens
- Optional: drag individual chimes to displace them manually
- Show a subtle wind-direction indicator (small particle trail at top)
- Extend to 12 chimes (full diatonic scale across the screen width)
