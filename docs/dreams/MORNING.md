# Morning digest — last updated 2026-07-31 (cycle 970, WIDE fire)

> **Two nights, two different senses.** Last night was a duet *you hear*. Tonight is a plate *you see* — a note given a shape. (And deliberately NOT another dark-3D-bloom piece — after last night's three.js duet, shipping a second one would have been exactly the "too similar in design" trap, so tonight's is WebGPU particles.)

**Open on your phone → https://getresonance.vercel.app/dream/4360-cymatic** — tap **Start**, then just **drag your finger left↔right across the plate**. Thousands of grains of "sand" flee the parts of the plate that are shaking and pile onto the still lines — and you watch a clean geometric figure *assemble itself out of the note you're holding*. Tap the keys `A S D F G H J K` to jump between eight clean figures (cross → saddle → grid → fan → …); the plate sings each tone as its picture forms.

## New since yesterday
- **`4360-cymatic` — "what does a pitch look like?"** A real Chladni plate, simulated: a square plate driven at a frequency, and ~100k particles that gradient-descend onto the standing-wave **nodal lines** — the exact figure that pitch makes. Drag the frequency and the figure *reorganises live* into the next mode. It's the app's whole thesis in one gesture: **sound made into visible form.** (WebGPU on your phone; falls back to a lighter Canvas version if a browser lacks it — a badge tells you which.)
- **Why this one won the night:** it's the most on-brand *resonance* statement of the three, and — bluntly — it's the one that looks *different* from last night. Shipping a second three.js/glowing-3D piece back-to-back was the thing to avoid.

## Also explored (banked, both built clean, ready to ship next)
- This was a **WIDE fire: 3 unrelated directions, one shipped.** Both runners-up are in `IDEAS.md §970`:
  - **⭐⭐ `4328-orrery` — a solar system that composes AND *tunes itself*.** Orbits pluck notes (period ratio = musical interval), and a real celestial mechanism (mean-motion resonance, like Jupiter's moons) slowly drags the orbits onto whole-number ratios — so the music **starts clashing and audibly locks into consonance over ~30 seconds.** I verified the physics numerically (it settles into a 4:3·4:3·2:1 chord and grooves for 3+ minutes). This is the **biggest concept of the three** — held back only because it's three.js like last night. **This is the ship-next.**
  - **⭐ `4344-otomata`** — a tap-to-seed Otomata music box (walking tokens that pluck when they hit a wall and turn when they collide → hypnotic self-organising loops). The most phone-native of the three.

## Heads-up
- **Not yet hardware-verified.** Built headless — the WebGPU shader never ran on a real GPU, so the *look* of 100k points and whether dragging the pitch gives a legibly re-forming figure want your actual phone. First thing to sanity-check. (Typecheck + lint + normalizer clean; compiled cleanly in isolation. The full 920-route build overflows this sandbox's file-descriptor cap; Vercel has headroom and deploys fine — unchanged note.)

## Open questions for Karel — three standing items that need a *decision*, not a build
- **The genuinely cold cell, now with a concrete hook:** this cycle's research found the open idea of **latency-as-instrument** — a "canyon" where you (and eventually a bandmate on a second device) are heard as deliberate, spatialized *delayed echoes*, the piece being *about* the distance between you. It's the multi-user cell the jury keeps flagging. Want a DEEP fire on it — as a solo "answer-yourself-across-a-delay" canyon first, or straight to real **two-device WebRTC**?
- **Depth-camera spatial-audio room** — the other cold cell. On or off-limits?
- **AI-pipeline chain (music → image → video):** still blocked on your `FAL_KEY` go-ahead. Yes/no?
