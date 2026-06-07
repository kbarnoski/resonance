# Morning digest — last updated 2026-06-07 (UTC), cycle 340 (kids · WIDE)

> Even cycle → **kids**. Instead of another poke-a-thing-to-make-a-sound toy, I gave the kids lane its first piece of **emergence**: a simple local rule that produces surprising global order. Three of them, actually — I built three emergent-system toys in parallel and shipped the one with the strongest "magic moment."

## ☀️ Open this first
- **[/dream/384-kids-firefly-chorus](https://getresonance.vercel.app/dream/384-kids-firefly-chorus)** — a dusk meadow of ~280 fireflies, each blinking out of time and humming its own note (gentle twinkly chaos). **Tilt the phone** (or drag, or just watch) to drift them together — and when they gather, they start *nudging each other's blink timing* until a cluster locks into one pulsing blink and its scattered pitches collapse onto a single D-Dorian chord. **Chaos becoming harmony, in your hands.**
  - *Why this one:* it's a **lab-first** — fireflies have shown up as decoration before, but the *spontaneous synchronization* (real **Kuramoto** coupled-oscillator phase-locking, Kuramoto 1975 / Huygens' clocks 1665) has never been the mechanic. And it's in the **legible** lane your jury liked: the "togetherness" meter is literally the Kuramoto order parameter r (0 = chaos → 1 = unison), so you can *watch* the order emerge. If you don't touch it, a slow auto-breeze gathers them on its own — it self-syncs hands-free.

## Also explored this fire (2 more — banked in IDEAS §340, both build-clean, both grep-verified lab-first techniques)
- **383-kids-coral-garden** — *shake* the tablet → glowing plankton drift and **stick** onto a growing coral (real **Diffusion-Limited Aggregation**, Witten–Sander 1981); each new branch sings a D-Dorian note, so the reef you grow *is* the song. The calmest, most "looks like Resonance" of the three — lost only because its wow is gentler than 384's emergence. The obvious next calm kids ship.
- **385-kids-ant-garden** — *wave at the camera* → flowers bloom, and a swarm of ants builds **singing pheromone trails** between them (real **ant-colony stigmergy**, Deneubourg 1990 / Dorigo 1992); each trail sustains a chord voice. The most ambitious (4 subsystems) — lost because the camera permission + slower trail-emergence hurt the 06:30 phone-glance fit.

## How this was made (the studio choreography)
- **WIDE fan-out:** three *unrelated* emergent-system briefs (synchronization / aggregation / stigmergy), each a different lab-first technique × a different fresh input (tilt / shake / camera) × a different renderer (WebGL2 / Canvas2D / three.js) — none using a tag your jury banned (touch, mic/voice, SVG). Three parallel makers; I read the actual code, picked the winner on *experience-novelty + legibility*, ran the authoritative winner-only build (**exit 0, 24.5s**), and banked the other two. One commit.
- Research → build: the dive surfaced a **current-quarter** paper — arXiv:2603.08352 (Mar 2026) on Kuramoto synchronization — directly on the winner's technique. (RESEARCH §340.)

## Open questions for you
- **Kids: which sibling next?** I'd ship **383-coral (DLA)** as the calm-lane companion to 384's emergence — both build-clean. Or 385-ant if you want the camera game. Say which.
- **Adult thread, cycle 3 (Accompanist):** still queued — fold the robustness + anticipation siblings into 380 (Solo⇄Resilient toggle + predictive scheduling), or map your **Welcome Home** melody as the score. Mirror-Canon cycle-2 and Tonnetz (359) are also still unshipped if you'd rather I jump to those.

## Caveats
- `384` is **build-verified, not browser-verified** (no sensor/GPU here). Unverified: the coupling strength/radius *feel* (the whole point is the chaos→unison *transition* being visible, not too-instant or never), the tilt→gravity feel, whether the sync reads as magic vs. a glitch at a phone glance — all likely small tunes. Clean fast-forward sync this fire (no force-push), scope clean (only `384` + docs).
