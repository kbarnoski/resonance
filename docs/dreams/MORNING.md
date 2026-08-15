# Morning digest — last updated 2026-08-15T~12:00Z (cycle 1142, DEEP)

> **Jury verdict today**: You climbed out of the cosmic-shader rut — six top-tier pieces now vs one last fortnight — but the lab's building a quieter rut: four straight "analyze my playing and draw it" pieces you just press Play on. Tomorrow: let you *play*, not just watch. And ten minutes of your headphones would unblock six of them. See `docs/dreams/JURY.md`.

## New since yesterday
- **[13440-resonancefield](https://getresonance.vercel.app/dream/13440-resonancefield)** — **the whole piano ringing, not just the notes you played.** Your real recording drives a physical model of all 88 strings as *coupled* resonators: when you strike a key, every string that shares a partial rings in sympathy — so a struck C lights its octave, twelfth and fifth as distinct glowing **ridges** that linger ~3 seconds while unrelated strings stay dark. It paints as a slow scrolling bloom (pitch up, time across). **Why open this:** the lab has now drawn your harmony, timing, space and hands — this is the first time it draws the thing the product is literally *named after*: **sympathetic resonance**, the afterglow ordinary note-visualizers throw away. It reads as *harmony*, not spectrum, because the coupling is selective (a real physics fix — see below). Runs on a WebGPU compute shader with a full CPU fallback, so it blooms even on a muted phone with no GPU. Honest caveat: it's a plausibility model of the coupling, not a measurement of your actual piano.

## Explored this fire (DEEP — one concept, 3 renderers; 2 banked, not shipped)
- One concept — *your real playing lighting up the whole instrument's sympathetic strings* — built three ways. Shipped the WebGPU-compute field; banked two.
- **13424-sympathetics** (⭐⭐⭐ resurrect-strong) — the **most legible** version: 88 vertical filaments laid out as the literal keyboard, so you see *which* strings your playing wakes. Best next step: fold it in as a "keyboard view" toggle on the winner. IDEAS §1142.
- **13456-resonancehall** (⭐⭐) — sympathy made **spatial**: the strings stand as rods of light in a 3D hall and you watch energy travel *along an edge into the distance* to the partner string it wakes. Banked lower only because three.js just shipped (handreader). IDEAS §1142.

## Research finding worth a look
- **2026 piano research is reaching past discrete MIDI toward continuous *touch* / key-motion** — CHI 2026 *Visualising Pianists' Touch* (doi:10.1145/3772318.3791621) transcribes continuous key-depression trajectories straight from audio, arguing they reflect how you shape sound better than MIDI events do. That's the seed for resonancefield: read the *behavior* of the instrument (its sympathetic ring), not just the note list. RESEARCH §1142.

## Open questions for Karel
- **Sound-on / real-device review is still the biggest lever** — does resonancefield's afterglow match what you hear your piano actually *do*? Same standing ask on handreader (does the choreography read as your playing?), vocabularygraph (centrality), rubatoline (onsets), resonantrooms (headphones).
- **Where next?** — deepen resonancefield toward a real instrument (infer pedaling from your legato so the tail blooms when you hold the pedal; per-string inharmonicity), OR add its "keyboard view" toggle (fuses the banked string-bank); OR continue vocabularygraph's cycle-2; OR finally chase the AI-pipeline chain (music → image → video — needs a FAL_KEY budget + your go-ahead). 1142 was DEEP → 1143 is WIDE by rotation.
