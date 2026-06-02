**For**: kids (4+)

# 268 · Kids Shadow Theater

A warm wayang-kulit (Indonesian shadow-puppet) stage that a 4-year-old can run on
their own. Five big friendly animal silhouettes — bird, elephant, deer, fish,
monkey — wait on a puppet rack at the bottom. Tap one and it walks out onto the
glowing amber-to-indigo screen and begins to sing in the shimmering tuning of a
Javanese gamelan. Tap it again and it strolls back to the rack, its voice fading.
Several puppets on screen at once make a tiny gamelan ensemble, all locked to a
slow, calming gong cycle so the room is never silent.

## How to play

- **Tap a puppet** in the bottom rack to send it onto the lit screen. It sways,
  walks, and starts singing immediately.
- **Tap it again** (in the rack or on stage) to send it home; its voice softly
  fades out.
- **Stack several** puppets for a full ensemble — every combination sounds good
  together. There is no wrong note and no way to lose.
- No reading required: just shapes, colors, and sound. The first tap also wakes
  up the audio (mobile/iPad requires a gesture before sound can start).

## The gamelan tuning (the surprise)

The puppets are deliberately **not** tuned to a Western scale, and **not** to the
familiar C-major pentatonic that most "kids music" toys use. Instead the five
pitches come from a **slendro-like** set of stretched, non-equal-tempered ratios
over a 220 Hz base:

```
ratios ≈ 1.00, 1.16, 1.35, 1.52, 1.78
```

These intervals are intentionally "off" by Western ears — that shimmering,
slightly-alien quality is exactly what makes a gamelan sound like a gamelan. Each
metallophone voice (think saron / bonang) is synthesized as **two slightly
detuned sine fundamentals** (a few Hz apart, producing the characteristic gamelan
*beating*/shimmer) plus an **inharmonic upper partial around 2.41×**, all shaped
by a fast percussive attack and a long bell-like decay. The **gong** is a low
~70 Hz sine with a small downward pitch glide and a soft filtered-noise thump on
a long decay; the mid **kempul** is the same idea an octave-ish up. Everything
runs through an always-on `DynamicsCompressor` limiter so it stays soft and
toddler-safe and never clips.

## Subsystems

1. **SVG silhouette render + animation engine** — the entire visual is inline
   `<svg>`: cut-paper animal `<path>` silhouettes, a radial-gradient lamp
   backdrop, and a `feTurbulence` "oil lamp" flicker. Puppets walk and sway via
   React `requestAnimationFrame` updating SVG `transform`/opacity. No `<canvas>`,
   no WebGL, no three.js.
2. **Gamelan synthesis** — detuned-FM/additive metallophone voices in slendro
   tuning, Web Audio API only.
3. **Colotomic gong-cycle scheduler** — a lookahead beat clock reading
   `audioContext.currentTime` fires a deep gong every 8 beats, a mid kempul every
   4, footstep "kethuk" ticks for walking puppets, and quantizes every puppet
   strike onto the pulse so the ensemble locks together.
4. **Touch/drag interaction** — large (≥76px) tap targets, immediate response,
   tap-on / tap-off toggling with no fail states.

## References

- Javanese **wayang kulit** shadow theater and its accompanying **gamelan
  slendro** tuning — see **Colin McPhee**'s studies of Indonesian gamelan music.
- **Lotte Reiniger**'s pioneering silhouette animation (*The Adventures of Prince
  Achmed*, 1926) for the cut-paper aesthetic.

---

Zero deps · Zero API · No permissions
