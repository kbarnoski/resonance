# Morning digest — last updated 2026-08-04 (cycle 1014, DEEP)

> **Following yesterday's jury to the letter.** The verdict said the last 15 builds were **15-for-15 GPU**, 2D output extinct, and the self-playing violet journey was back 4× — *"break the screen or hand the player a real sensor."* So tonight's build does **both**: a hand-played instrument rendered in **pure SVG, zero GPU**. See `docs/dreams/JURY.md`.

Open the lab: https://getresonance.vercel.app/dream

## New since yesterday
- **[6456-loomstring](/dream/6456-loomstring)** — **play a woven net of strings.**
  An 8×8 cat's-cradle loom of glowing vector lines hangs in the dark. **Poke or drag any crossing**
  and a pulse races outward along *both* strings it sits on; wherever a travelling wave reaches a peg,
  that crossing rings a note (row = pitch, column = octave, just intonation). The line you *watch bend*
  is the exact wave state that *makes the sound* — see and hear, welded into one object.
  **Why open it:** it's the piece that breaks the lab out of the all-GPU rut you called out — **not one
  pixel of WebGL**, every string is an SVG `<polyline>` — and it carries the thing you loved in
  `drumskin`/`stemfield` ("sound and image are one object") onto a calm, restrained, non-GPU canvas.
  It's alive the moment it loads (a soft ripple crosses the web on its own) and instantly yours the
  moment you touch it. Best on a touchscreen — strum a path across the web.

## How I picked it (DEEP fire — one concept, 3 physics roads, 1 shipped)
The jury was unusually blunt, so this cycle *is* the escape: **one idea — "the SVG line you see IS the
string you hear," played by finger, pure SVG / zero GPU — built three ways** (a woven mesh, a plucked
harp, a bowed cello-string). I shipped the woven mesh: it's the freshest mechanic (a playable
2-D waveguide net is new here), it welds see=hear most tightly (the same numbers draw the line *and*
fire the note), and it reads instantly in a still frame. Technique: a coupled 2-D digital-waveguide mesh
+ Karplus–Strong plucks — the no-GPU, classic-DSP heart of the string-modeling frontier
(*Four Decades of Digital Waveguides*, arXiv:2604.12878, 2026). I'm also claiming this as the start of a
**multi-cycle "vector strings" line** — the criterion you keep noting is 0-for-15; here's cycle 1.

## Also explored, banked verbatim (IDEAS §1014)
- **6440-harpline** ⭐⭐ — **pluck a rack of glowing SVG strings** (Karplus–Strong; the wiggle you see is
  that string's real decaying energy). The most robust + most instantly-legible of the three — no
  audio-worklet, plays on anything. **Resurrect-first** if you want the safest non-GPU instrument.
- **6472-bowline** ⭐⭐ — **bow a single SVG curve** like a fretless cello (position = pitch, stroke = loudness);
  the visible Helmholtz corner traveling the line *is* the sustained tone. The most expressive of the
  three — resurrect where I can test the bowed-string worklet on your real device.

## Open questions for Karel (both need your call — stop-or-build)
1. The **shared multi-device room** (two phones in one acoustic space) — asked for ~14 cycles; it needs a
   signaling store I can't stand up headlessly, so it needs your go-ahead. Build it, or strike the lane?
2. The **music→image→video AI pipeline** — "queued" ~32 cycles; needs `FAL_KEY` funded to ever ship.
   Fund it, or strike it permanently?

*(Not runtime-verified — headless, no speakers/touch. Full `npm run build` passed clean this cycle; the
live feel — does the coupled ripple sound musical, does a big strum stay clean — wants your hands on a
touchscreen. 2 more non-GPU string instruments built & banked this fire — see IDEAS §1014.)*
