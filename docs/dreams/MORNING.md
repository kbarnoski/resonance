# Morning digest — last updated 2026-06-06 (UTC), cycle 334 (kids · DEEP)

> Even cycle → **kids**. Acting on your **jury** (`docs/dreams/JURY.md`): *make it legible* and *stop the viz hiding inside the screen*. I built a color game that's maximally legible (color = note) AND gets the kid **off the couch and into the room** — and it dodges every jury ban (no touch, no mic, no SVG) by using the **camera**, which also sits in your loved cluster (101-camera-song ❤️).

## ☀️ Open this first
- **[/dream/368-kids-rainbow-quest](https://getresonance.vercel.app/dream/368-kids-rainbow-quest)** — press **Start**. A friendly unicorn shows a glowing color and *wants* it — so a 4-year-old goes and **points the phone camera at something that color in the real world** (red, then orange, then yellow…). Get close → the creature **glows warmer** with a rising shimmer; hold the match ~0.6s → **fanfare + sparkles**, and that color fills a **rainbow arc**. Collect all 7 → a **rainbow song** plays, then loops. No reading, no timer, no score, no fail.
  - *Why this one:* it's the lab's **first color-foraging *game*** — the camera sends the child hunting the physical world instead of tapping glass (your "stop staring at the screen" provocation, answered head-on). Color→pitch is the most legible mapping the kids lane can make; each hue is a note in **D-Dorian** (not pentatonic) over a calm drone. On your phone with no rear camera, it **plays the whole quest itself** (auto-demo) so you'll see the full loop at 06:30. Camera is analysis-only — nothing recorded or uploaded.

## Also explored this fire (2 more — banked in IDEAS §334, both build-clean)
- **366-kids-color-hunt** (three.js) — free-forage jam: catch any colors you point at, and every few catches **the colors replay as the melody you built running around the house**. The strongest *memory/composition* idea — lost only because a 4yo needs a clearer goal up front, and its per-particle 3D lights are a phone-GPU risk. Teed up as the next kids resurrection.
- **367-kids-color-chord** (Canvas2D) — point the camera around a room and **hear the whole scene as a chord**: a colorful corner rings a full 4-note harmony, a plain wall hushes to one tone. The most *surprising* take (you'd enjoy it too) — reads a little older than 4, so banked as an adult/older-kid piece.

## How this was made (the studio choreography)
- **DEEP fan-out** (alternating off last fire's WIDE): ONE concept — *"point the camera at real colors, each sings"* — attacked three ways (quest / free-forage+memory / room-as-chord) by three parallel builders, curated to the **most kid-legible** winner. Shipped one, banked two. One commit, `npm run build` ✓.
- Dodged every jury ban: **camera input** (not touch, not mic), **DOM/CSS** output (not SVG — and it cools the over-used raw-WebGL2, which hit 4× in the last 10 and is now diversity-banned).

## Open questions for you (your call unblocks these)
- **Deepen `364-tonal-orbit` (Chew Spiral Array) next adult cycle (335)?** Still the cleanest answer to your "actually deepen something" ask, banked build-clean.
- **`351-erosion`** (a tape more ruined each morning) still triple-banked — its hook is invisible on a first open. Ship unconditionally? Reframe to open already-eroded?
- **AI-pipeline-chain in an AV piece** still blocked on a small paid FAL budget grant — one word and I build it.
- **GPU verification debt:** `323` + `327` have never run on real hardware — worth a browser pass before the next big WebGPU build.

## Caveats
- `368` is **build-verified, not browser-verified** — the quest logic, D-Dorian audio, DOM/CSS visuals, and auto-demo are written correct and `npm run build` passes clean, but **real hue-extraction under a phone camera's auto-white-balance/mixed lighting** (the saturation/tolerance thresholds may need tuning), **iOS AudioContext unlock**, and the **auto-demo→live-camera handoff** are unverified here (no camera in this sandbox). Likely small tunes if off.
