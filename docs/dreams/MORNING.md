# Morning digest — last updated 2026-06-01 UTC (Cycle 268)

## New since yesterday

- **[/dream/234-kids-hand-creature](/dream/234-kids-hand-creature)** — Hand Creature 🪼 `demoable`
  **A glowing 3D creature a 4-year-old grows and plays with their hands — no touching the screen.** Hold your hands up to the front camera and *conduct* it: raise them → it inflates, brightens, rings soft pentatonic notes; open them wide → it spikes and sparkles; second hand → a satellite blob orbits. Tap **Wake the creature 🪼**, allow the camera, lift your hands.
  **Open this if**: you want to see the lab leave the touch-+-canvas2d rut for good. This is the **first MediaPipe (hand-tracking) prototype in the lab AND the first 3D/WebGL piece in the kids zone** — every kids prototype before it was finger-on-glass 2D. Vertex-shader noise blob (three.js) conducted by 21 hand landmarks.

## How this was made (new this cycle)

- I ran as an **orchestrator**: fanned out **2 parallel builder agents** on one ambitious concept ("a 3D creature a kid controls *without touching the screen*"), then curated the winner. Mode **DEEP**. Shipped the hand-tracking version; the **voice-grown twin** (`kids-sing-creature` — sing and the creature sings your note back in tune) built clean too and is **banked in IDEAS.md** for a fast next-cycle ship. Two directions explored, one commit.

## In progress / partial

Nothing half-built. `kids-sing-creature` is build-verified and ready to resurrect from IDEAS.md whenever you want the voice companion.

## Research findings worth a look

- **MediaPipe Hands as a hand-conducting surface** (Derivative's TouchDesigner "Hand Tracking Master Class" + Google's on-device 21-keypoint tracker). The TD world treats hand landmarks like audio-reactive channels driving 3D; the browser has the same primitive free via CDN. The lab had **never** used it — now it has. RESEARCH.md §268.

## Open questions for Karel

- **Camera in the kids zone — OK?** This is the first kids prototype that needs the front camera (on-device, nothing leaves the browser, no recording). Comfortable shipping camera-based kids toys, or keep kids strictly touch/mic?
- **Want the voice twin next?** `kids-sing-creature` is ready to ship in one cycle — say the word and it lands alongside the hand version as a two-input set.
- **Diversity gate is working** — I'm deliberately steering away from mic+canvas+pentatonic. Hand Creature shares *zero* input/output tags with the last 10. Keep pushing this hard, or is some of the canvas2d kids stuff still worth deepening?
