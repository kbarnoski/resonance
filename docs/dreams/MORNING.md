# Morning digest — last updated 2026-08-05 (cycle 1024, DEEP)

**Open this first:** [/dream/6920-neuralbloom](https://getresonance.vercel.app/dream/6920-neuralbloom) — **the hallucinating cortex, and you play it with your voice.** A 256×256 sheet of model cortex runs a live **Wilson–Cowan** neural field tuned right at its Turing instability, so it spontaneously self-organizes from noise into stripes, spots and hexagons — and the retina-to-cortex map turns those into **tunnels, cobwebs and honeycombs** on screen. The twist: which form-constant you see is set by one number (the Turing wavelength), so **your pitch slides it** — hum up and down and the hallucination walks continuously through the four classes; your **loudness** pushes it past the bifurcation into breakthrough. *(It's alive the instant it loads — a seeded auto-sweep demos the whole morph. Hit Begin for the drone, "Hum to the cortex" for the mic, or just drag the Tunnels⇄Honeycomb slider. No strobe — smooth field motion only.)*

**Why this, tonight:** the lab has *drawn* Klüver's form-constants ~100 times with procedural math — but never once *simulated the cortical dynamics that actually generate them*. `grep wilson-cowan` = **0 files**. This is that: the mechanism, not the picture. It deepens last night's psychedelic return without repeating it — 6872 was a passive camera-lit Ganzflicker; this is an embodied instrument you drive with your voice, a different pole (intense/DMT), a different engine, a real primary sensor (the jury's repeated ask).

## New since yesterday
- **`6920-neuralbloom`** (shipped, DEEP winner) — first Wilson–Cowan neural-field simulation in the lab; mic-pitch walks the emergent form-constant class. WebGL2 · intense/DMT pole · **ambition 4/5** (the highest in recent cycles). Safe: continuous drift, no strobe.
- **Two sibling substrates built clean & banked** (IDEAS §1024), the other roads from this fire:
  - **`6888-corticalstorm`** (resurrect-first) — the **faithful, unguided** version: RGBA16F float precision + true field→audio readback (the pure-science companion; fold its precision into neuralbloom, or ship as the emergence purist).
  - **`6904-cortexflow`** — the same field on a **WebGPU compute** shader (the truly-rested GPU register), with a full WebGL2/CPU fallback ladder. Resurrect once it can be verified on a real GPU.

## Research finding worth a look (RESEARCH §1024)
- **bioRxiv 2026-02-18** — a large-scale computer-vision mapping of *stroboscopic* hallucination geometry, read against the neural-field framework. The useful nugget: cortical patterns with translational symmetry become rotationally-symmetric percepts (cobweb/tunnel/spiral) under the log-polar map, while lattices stay translational — so the four Klüver classes are separated by the **Turing wavelength**, which is exactly what tonight's pitch control drives.

## Open questions for Karel
1. **Two GPU cycles in a row — still OK?** After 9 non-GPU cycles, the mechanical diversity gate now flips the jury's old "no GPU" note on its head: pure-DOM, Canvas2D and SVG are ALL one-from-ban, WebGL2 is the rested lane. So I fed it again. 1025 is WIDE-due — I'll swing to a fresh sensor (tilt / MIDI / your Path audio) and vary the output. If you'd rather I rest GPU sooner, say so.
2. **The morph is *guided*.** To make the stripes→hexagon walk read reliably on a phone, I let a small hexagon-bias ride the honest physical control. `6888-corticalstorm` is the unguided-purist bank if you'd rather see the bare cortex find its own pattern (with a live parameter panel to hunt the bifurcation).
3. **AI-pipeline chain** (music→image→video) still needs `FAL_KEY` funded or a permanent strike (~42 cycles queued — the jury wants this *decided*, not re-queued).
