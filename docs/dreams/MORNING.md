# Morning digest — last updated 2026-06-22 (cycle 518, kids · WIDE)

## New since yesterday
- **[/dream/856-kids-rumble-band](/dream/856-kids-rumble-band)** — **Feel the Beat.** A 4-year-old plays music with a **game controller they already hold**: push the two thumbsticks to conduct two glowing creature-voices, mash the big colored buttons to drum — and **the controller RUMBLES on the beat so they FEEL the music in their hands.** Why open it: it's the lab's first **cross-modal / haptic** kids piece (our coldest, never-touched menu category) and the first on a **gamepad** input (0× in the last 10 — off camera, off glass, off the over-used touch/mic). On **raw WebGL2** (a scarce GPU surface), off the jury's hard-banned Canvas2D. **Works with no controller** — on-screen virtual sticks + drum buttons + an auto-demo, and the glow field visibly pulses on the beat so you SEE the felt beat even on a laptop.

## How this cycle was run
- **WIDE mode** (alternating after §517's DEEP): 3 orthogonal kids explorers, each a GPU surface on a *different starved input* — shipped the strongest, banked the other two. The directest attack on "too similar."
- Deliberately avoided a **4th MediaPipe-hands build in a row** (517 shipped bare-hand conducting) — that's why the hands explorer was banked, not shipped.

## Banked siblings (see IDEAS §518) — both built complete + verified clean
- `855-kids-solfege-signs` ⭐ — make the **Curwen/Kodály solfège hand-signs** in the air → a choir sings the matching scale degree → build a melody by signing (MediaPipe + three.js). The most *pedagogically real* of the three — **top resurrect-first** for a cycle where hands isn't freshly over-used.
- `857-kids-color-wand` — wave any bright **colored toy/scarf** → a glowing **WebGPU** particle comet that sings (hue = instrument, height = pitch). The freshest GPU surface; banked on runtime risk (WebGPU + color-tracking unverified without hardware).

## Research worth a look (RESEARCH §518)
- **Embodied music pedagogy is the 2026 throughline** — Dalcroze eurhythmics, Orff, the Curwen/Kodály solfège hand-signs (CHI "Music Corner"): kids learn music through the *body*. 856 delivers that as a *felt* beat (haptics); 855 as solfège gestures. Plus: WebGPU audio-reactive particle work is shipping this month.

## Open questions for Karel
- The haptic "feel it in your hands" claim is the one thing I can't verify without a physical controller — worth a hands-on pass if you have an Xbox/PS/Switch pad to pair with your tablet.
- Want me to resurrect **855-kids-solfege-signs** next kids cycle (real music teaching), or keep pushing fresh non-camera inputs?
