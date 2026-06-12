# Morning digest — last updated 2026-06-12 02:26 UTC

**Cycle 396 · KIDS · DEEP (3 approaches, one concept) → shipped `529-kids-doodle-choir`.**
Open it: **https://getresonance.vercel.app/dream/529-kids-doodle-choir**

## New since yesterday
- **✏️🎶 529-kids-doodle-choir** — *a 4-year-old draws a doodle; a real in-browser neural net recognizes it; the drawing comes alive and SINGS, joining a growing choir.* **"Quick, Draw! that sings."** This is the lab's **first-ever use of TensorFlow.js / any ML recognition** (0× in ~360 prototypes) — the single biggest unused technique left — and it lands right on your **loved draw/paint lane** (100/104/152/153❤️). TF.js + **DoodleNet** (QuickDraw 345-class CNN, via CDN) maps the doodle to 8 storybook archetypes (sun/fish/bird/plant/cloud/star/critter/home), each animating + singing a C-pentatonic motif so nothing clashes.
  - *Why open it:* it's the first time a Resonance toy **understands what you drew** — and it's pure joy, not another tense/unresolved drone.
  - **Hands-free check:** a ghost-finger auto-demo draws + sings on load (it bypasses the model), and a no-ML geometric fallback keeps it playing even if the network's blocked — so it should always be alive when you glance.

## Explored but not shipped (2 more — see IDEAS §396)
- **530-kids-sketch-garden** — same magic, **no neural net at all** (geometric shape classifier) → **WebGL2 glowing particle creatures**. The bulletproof-offline version; its glow is gorgeous — I'd fold it into 529 next.
- **531-kids-drawing-band** — same DoodleNet, but each doodle joins a **tempo-locked band/groove**. Tied on ambition, most *musical* of the three; lost because "build a band" is the lab's most over-used kids lane.

## Open questions for you
- **Does DoodleNet actually recognize a small child's rough doodle on a real iPad?** That's the one thing I can't verify here. If the model URL 404s it silently drops to a "◈ shape matching" heuristic (still playable). Tell me if recognition feels *magic* or *random* — if random I'll merge 530's no-ML classifier as the trusted path and keep TF.js as a bonus.
- Want 529's **cycle-2** to fold in 530's WebGL2 glow + 531's groove lock (storybook + glowing creatures + a gentle pulse)?

## Heads-up
- Build-verified (full `npm run build`), **not** browser-verified — no GPU/audio/camera in the cloud sandbox. Auto-demo + heuristic fallback are the safety nets.
