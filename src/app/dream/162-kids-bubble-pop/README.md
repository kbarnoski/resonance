# Bubble Pop — design notes

**For**: kids 3+  
**Built**: Cycle 190 — kids build  
**Route**: `/dream/162-kids-bubble-pop`  
**Status**: demoable

---

## The question

What if the simplest musical interaction — tap something, hear a note — could be
endlessly satisfying because the "something" never runs out?

Popping a bubble is one of the most universally satisfying physical actions for
children. Every child, every culture. Bubble Pop makes that action musical.

---

## Design

**What you see**: colorful glowing bubbles drift upward across a dark canvas,
swaying gently side to side. Five colors — violet, emerald, amber, rose, cyan —
each tied to a pitch in the C-major pentatonic scale (C3–C4).

**What you do**: tap any bubble to pop it. Drag your finger across the canvas
to pop multiple in sequence — this plays a fast melody or glissando.

**What you hear**: a triangle-wave triangle tone (slightly detuned pair for
warmth), quick attack, gentle decay. Lower bubbles ring longer than higher ones.
A soft C3+G3 ambient pad makes the canvas feel alive between interactions.

**The BANDIMAL rule**: bigger bubble = lower pitch. A 4yo who tries the large
violet bubbles vs. the small cyan ones will discover this within two pops.
No labels, no instruction.

---

## Key design decisions

**Autonomous respawn**: bubbles appear from the bottom and drift upward, leaving
the top of the screen after ~20 seconds. New bubbles spawn every 1.2–1.9 seconds
to keep 10–14 visible at all times. The canvas never becomes empty or static.

**Per-gesture deduplication**: when dragging, a gesture Set ensures each bubble
pops at most once per touch gesture. This prevents one long drag from
triggering 30 rapid pops of the same bubble.

**Sparkle burst**: 18 particles radiate outward from the pop point, colored
in the bubble's hue, fading and decelerating over ~650ms. The sparkles are the
primary visual reward — their scale tells the child something happened here.

**Fade-in on spawn**: new bubbles fade in over 500ms. Without this, sudden
appearances at the bottom of the screen feel jarring. With it, bubbles feel
like they're floating up from fog.

**BANDIMAL size/pitch mapping**: radii of [52, 44, 36, 28, 20]px for
[C3, E3, G3, A3, C4]. This makes the pitch ordering visually obvious without
any labels. The same principle used in `105-pluck-field`, `108-kids-kalimba`,
and `125-kids-jellyfish`.

---

## What's different from existing prototypes

- **`95-kids-breath-bubbles`**: mic amplitude spawns bubbles; no popping mechanic.
  Here, bubbles spawn autonomously; popping IS the musical interaction.
- **`125-kids-jellyfish`**: jellyfish are touched and they survive + bounce back.
  Bubbles pop permanently and respawn. The destruction + sparkle is the payoff.
- **`122-kids-firefly-song`**: fireflies avoid your finger (catching = challenge).
  Bubbles drift slowly and don't avoid you — more accessible for 3yo.

This is the first kids prototype where **destruction is the musical act**.
All prior prototypes reward touching, holding, dragging, or connecting.
Bubble Pop rewards the release — the pop.

---

## What to try next

- Melody runs: drag quickly from one size to another — low violet to high cyan
  plays a rising pentatonic glissando.
- Chord: tap two or three different-colored bubbles simultaneously with
  multi-touch (each finger pops its own bubble).
- Patient listening: let the canvas fill with bubbles without touching.
  After 30 seconds, 14 bubbles are drifting — pop them all at once.

---

## Technical

- Zero permissions: no mic, no camera, no sensors
- Zero API: all synthesis is Web Audio triangle oscillators + gain envelopes
- Zero deps: no npm packages beyond React
- ~3.5 kB page component
- Canvas2D rAF loop at 60fps; DPR-aware for retina displays
- Pointer events (not touch) for multi-touch + drag support on all devices
