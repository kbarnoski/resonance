# Morning digest — last updated 2026-06-29 (cycle 595 · ADULT · psychedelic — WIDE)

**Today's ship: [`/dream/1043-dreamachine`](https://getresonance.vercel.app/dream/1043-dreamachine)** — the lab's first **Dreamachine / Ganzflicker**, and its first **gated safe-flicker engine**.

## New since yesterday
- **`1043-dreamachine`** — dim your lights, soft-focus the center, and your *own* visual cortex blooms the spirals/tunnels/honeycombs. The screen never draws the hallucination — it only gives you a uniform warm field (a *Ganzfeld*) + a slow safe pulse + a breathing drone, the way Brion Gysin's 1959 Dreamachine does. `state: jhāna/hypnagogia · pole: cosmic-ambient`. **Why open it:** it's the calm, meditative counterweight to this week's intense DMT pieces — and the concept ("the screen doesn't draw it, your brain does") is the most surprising thing in the lab right now.
- This is the **safety build** the whole psychedelic direction needs: flicker is hard-capped at **≤3 Hz** in code (the slider can't reach the seizure-risk band), soft sine never a strobe, a photosensitive-epilepsy warning + opt-in before anything, and an always-visible instant Stop. Default mode is no-flicker drift. Chained straight from today's research: the 2026 Oxford Ganzflicker study.

## Explored but not shipped (2 more — see IDEAS §595)
- **`1044-hyperbolic-bloom`** ⭐ — gorgeous **intense** DMT piece: the lab's first Poincaré-disk hyperbolic {7,3} tiling you fall through forever, jeweled + iridescent. Banked because it'd be a *third* intense piece in a row and I wanted to rebalance toward calm. Strong resurrect candidate for an intense night.
- **`1045-k-hole`** — first ketamine "K-hole": float untethered into a vast time-dilated void as your body dissolves. Banked over aesthetic-overlap risk with the existing `1041-nde-tunnel` dark-void.

## Open questions for Karel
- **The local build gate is broken in my sandbox (not the code).** Full `npm run build` can't finish here — the container's open-file limit (4096) is too low for the lab's 1000+ routes, so it dies with `EMFILE` in the prerender step. I proved it's environmental: clean cycle-594 HEAD (live in prod) fails identically. I validate with `next build --experimental-build-mode compile` (full TS + ESLint + bundle = green) instead. **Could you raise the fd limit, or bless compile-mode as the official gate?** It will hit every future cycle.
- Want me to lift `1043`'s `flicker.ts` + drone bank into `_shared/` (`safeFlicker.ts` / `droneBank.ts`) next — the core psychedelic infra PSYCHEDELIC.md keeps asking for. Worth a DEEP infra cycle?

## Lane status (psychedelic)
4 builds: `1038` DMT (intense) · `1041` NDE (cosmic) · `1042` 4D-DMT (intense) · **`1043` Dreamachine (cosmic)**. Pole back in balance, 2/2.
