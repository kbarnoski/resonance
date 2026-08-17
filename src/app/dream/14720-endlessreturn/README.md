# 14720 — Endless Return

**Pole:** dream · altered-states / visionary
**Substrate:** inline SVG (no Canvas2D, no WebGL) + Web Audio

## The question

**What if your own piano recording could fall forever?**

A Shepard–Risset endless glissando built entirely from Karel's *real* catalog — an
auditory illusion of perpetual descent (and, at will, ascent) that only a human ear
completes. The boundless, vertiginous feeling of infinite motion, made from his own
timbre rather than a synth.

## How the Shepard–Risset engine works

The illusion is **resynthesized from real audio**, not generated:

1. **One** decoded `AudioBuffer` of Karel's piano is loaded via the shared
   `loadRealTrackBuffer` helper (Welcome Home / Snowflake tracks only).
2. It is spawned as **N = 7 looping `BufferSource` layers**, each an octave apart via
   `playbackRate = 2^k`. Read offsets are staggered so the octave stack reads as a
   cloud of his playing, not one phase-locked note.
3. Every frame, a running phase `theta` (in octaves) glides slowly, so **all** layers'
   `playbackRate` drift together in log-pitch — down by default, up when steered.
4. Each layer's position `pos ∈ [0, N)` marches through the octave stack and **wraps**:
   when a layer falls below the bottom octave it re-enters at the top.
5. Each layer's GAIN follows a **raised-cosine (Hann) window over log-frequency**,
   centred on the middle octave: `g = 0.5·(1 − cos(2π·pos/N))`. Layers fade in at one
   edge and out at the other, so a layer is silent exactly where it wraps — **the wrap
   is inaudible.** The perceived pitch falls forever while the spectral centroid stays
   fixed.

All sound is routed through a single `createSafeMaster` bus (limiter + safety filters);
its analyser drives the visuals. This is the lab's **first Shepard–Risset built from
real catalog audio** — prior ones used pure synth partials.

## The visual

100% **inline SVG DOM** — no `<canvas>`, no WebGL. A rotating **barber-pole helix** of
stacked octave rings:

- Each of the 7 rings is one Shepard layer. Its vertical height maps to `pos`
  (high pitch = top), and **height → hue** across a continuous vertical rainbow.
- Rings fall and wrap forever; their glow **pulses to the master analyser** RMS.
- A rainbow helix spine carries traveling dash-stripes (the barber pole). Both the
  helix spin **and** the dash travel take their **direction and speed from the audio
  glide**, so eye and ear agree.
- Full chromatic vertical spectrum, luminous on near-black — no warm/amber/sepia, no
  cool-violet-ice. UI chrome uses semantic tokens only.

## The perceptual / illusion hook

The Shepard–Risset glissando is an **auditory illusion**: no instrument measures
endlessness — only human perceptual binding hears a tone that descends without ever
arriving. It exploits the uniquely-human way we bind spectral evidence into a single
perceived pitch (cf. audio-illusion robustness literature, **arXiv:2601.08516**). Made
from Karel's own timbre, the falling is *his* — a boundless descent through his own
piano.

## Named reference

**Roger Shepard (1964)** & **Jean-Claude Risset** — the Shepard tone / Shepard–Risset
glissando.

## Controls

| Input | Action |
| --- | --- |
| **Space** | Play / pause |
| **↑ / ↓** or **scroll wheel** | Reverse direction & set glide rate (down = descend, up = ascend) |
| **Number keys 1–8** | Pick which real track feeds the illusion |

The default is a slow **autonomous descent** — it falls on its own until you steer it.
Steering is by keyboard + wheel, not pointer-drag.

## Next-cycle deepening

Bind the glide rate to the live analyser: let the descent **accelerate through his loud
passages and stall in the quiet ones**, so the endless fall breathes with his own
dynamics — the illusion coupled to the very audio it is made of.
