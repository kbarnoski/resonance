# 94 — Ghost Echo Pond (kids)

**For**: kids (4+)
**Route**: `/dream/94-kids-ghost-echo`
**Status**: demoable
**Built**: Cycle 108

## What it does

Tap anywhere on the screen to summon an echo Ghost. Each Ghost:

- Appears exactly where you tapped, with a burst of sparkle particles
- Plays a single piano-like note (Y position → pentatonic pitch, low = bass, high = treble)
- Drifts gently with a slow Lissajous wander (each Ghost has its own phase)
- Fades out over 4 seconds

Up to 8 Ghosts can coexist. When you tap a 9th, the oldest Ghost disappears to make room. A soft ambient chord plays quietly under everything once the session starts.

## Why this works for kids

- **No wrong actions.** Tap anywhere, always get a Ghost. The pentatonic scale guarantees every note sounds good.
- **Infinite play.** There's no goal, no score, no end state. Just Ghosts accumulating and fading.
- **Zero permissions.** No mic, no camera, no motion sensors — first tap just works.
- **"Pond" metaphor.** Each tap is like dropping a stone in water. The Ghost is the ripple. Multiple Ghosts = multiple ripples coexisting. This is the "multi-point" variant of `92-kids-ghost-lullaby`.

## Connection to Karel's universe

This prototype extends `92-kids-ghost-lullaby` from a single interactive Ghost to a chorus. The same Ghost character — Karel's published Ghost from the live performances — appears multiple times. The chord you form by tapping many positions at once is always pentatonic, so any cluster of Ghosts sounds like a real musical moment.

## Design decisions

**Ghost size**: 28px radius (G_R). Slightly smaller than ghost-lullaby's 32px to give more visual room for 8 simultaneous Ghosts on an iPad screen without crowding.

**Fade curve**: `alpha = (1 - lifeT)^0.75`. The exponent < 1 means the Ghost stays bright for most of its life and fades quickly near the end — more satisfying than a linear fade, which starts dimming too early.

**Drift amplitude**: 7–16 px random per Ghost, at 0.52 and 0.38 rad/s (incommensurable, so the drift never loops). Each Ghost drifts differently. When 6–8 Ghosts are on screen, the slight independent drift creates the impression of a flock.

**Sparkle gravity**: `vy += 0.04` per frame — a slight downward pull. The sparkles arc upward from the spawn burst, then fall back. This subtle parabolic trajectory makes them feel physical.

**Audio**: same synthesis as ghost-lullaby — sine + 2nd harmonic (0.12 relative gain). Envelope: 40ms attack, setTargetAtTime decay from 300ms with τ=100ms. Ambient pad at gain 0.012 per note (3 notes = 0.036 total) — barely audible, just warms the silence.

**Max 8 Ghosts**: chosen so an 8-note cluster spans the full pentatonic range (C3–A4), enabling a child to build a complete arpeggio just by tapping systematically from bottom to top of the screen.

## Kids rules compliance

| Rule | Compliant |
|------|-----------|
| No reading required (hint is label only) | ✅ |
| Tap target ≥ 64×64 px | ✅ (entire canvas) |
| Immediate response ≤ 50ms | ✅ (pointerdown, no permission dialog) |
| No "wrong" interactions | ✅ (pentatonic, no fail state) |
| Zero permissions | ✅ |
| Safe sounds | ✅ (sine + harmonic, no transients) |
| Ambient pad on start | ✅ (C3/E3/G3 at gain 0.012) |
| No external links | ✅ |
| No AI / no API calls | ✅ |
