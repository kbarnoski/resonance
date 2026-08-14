# 11840 · Bodyloom

**The one question:** *What if a room recorded and looped your moving body — so
you fill an empty, silent space with a spatial canon of your own past selves?*

## What it is

A warm room, drawn in Canvas2D, that **records and loops** your body. You move;
the room captures a gesture; you commit it; that gesture keeps **looping** as a
spatially-placed voice standing exactly where you stood — while you record
another over it. Over a couple of minutes an empty, silent room fills with a
**polyphonic canon of your looping past selves**. Minute two never sounds like
minute zero.

This is deliberately *not* a live-only body instrument. The load-bearing verb is
**record + loop + layer**, not just "move → sound."

## INPUT / OUTPUT / CORE TECHNIQUE

- **INPUT** — camera full-body pose via MediaPipe **PoseLandmarker** (33 joints),
  the real primary sensor. Audio exists *only* from motion.
- **OUTPUT** — a warm room view: your live skeleton drawn bright and near, plus
  accumulating translucent **ghost-loops** (your recorded past selves) standing
  where they were captured, dimmer and further back the deeper they sit.
- **CORE TECHNIQUE** — pose landmarks → a per-gesture **loop buffer** → a looping
  **HRTF `PannerNode`** voice at the recorded body position. A voice's loudness
  tracks the replaying body's motion energy and its pitch tracks wrist height, so
  a still recorded moment is silent and a moving gesture keeps singing.

## The record–loop–canon technique

1. The live body (camera or the seeded demo dancer) is sampled at a fixed 24 fps
   into a rolling frame buffer.
2. **Committing** a loop copies those frames, precomputes per-frame motion energy
   and wrist height, assigns the loop a deterministic floor slot and a warm tint,
   and drops a fixed HRTF voice into the room at that spot.
3. Each committed loop replays independently forever, its voice modulating with
   the recorded motion — so the room accumulates a spatial canon. A ring buffer
   caps the canon at eight voices, always keeping it fresh.
4. An **empty + still room is silent.** There is no self-playing drone; the only
   thing that ever sounds is motion — live, or looped.

## Interaction

- On mount, before any camera or audio, a **seeded scripted demo dancer**
  (`mulberry32(0x11840)` phase offsets + a scripted motion path) is already
  moving, recording, and looping — the first ghost lands by about 1.4 s, so the
  whole idea reads in ~2 s with zero hardware and zero sound.
- **Begin · sound the room** starts the AudioContext (the browser gesture gate);
  now the looping demo dancer is audible as spatial voices.
- **Use my body (camera)** grants `getUserMedia`, switches the driver to your
  live pose, and clears the room so the canon becomes *your* past selves.
- With the camera live, **Record a loop** captures a rolling take (auto-commits
  at six seconds) and **Commit the loop** drops it into the room as a looping
  ghost. **Clear room** empties the canon.
- Live readouts along the bottom show source, joints tracked, loops in room, and
  recording state.

## References

- **"Designing Interactive Movement Sonification for Hip-Hop Dance" (CHI 2026)** —
  the perception–action-loop model ported here: you move, you hear yourself, and
  the sound shapes your next move. Bodyloom extends that loop across *time* by
  letting the room remember and re-sound each gesture.
- **Myron Krueger's *Videoplace* (1975)** — the responsive-environment lineage: a
  room that answers the moving body. Here the room does more than answer — it
  records, loops, and layers.

## How it degrades

- No/blocked audio → the room keeps looping silently; a notice shows.
- MediaPipe CDN fails or camera denied/unavailable → the seeded demo dancer keeps
  building the canon (it never needs the network) and a `text-destructive` notice
  explains.
- The renderer is Canvas2D, so there is no WebGL dependency to fall back from.

## Strobe safety

Motion is smooth and there is no flashing or strobe. The room glow only breathes
slowly with the overall sound level. `prefers-reduced-motion: reduce` calms the
dancer's speed and slows the glow further.

## Determinism

Nothing uses `Math.random`, `Date.now`, or argless `new Date()`. All "chance"
(the demo dancer's phase offsets) comes from a seeded `mulberry32`; all time comes
from the animation clock. Two visits — and the muted 06:30 phone — dance the same
dance and build the same canon.
