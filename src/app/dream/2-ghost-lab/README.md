# Ghost LoRA Lab — design notes

**Route**: `/dream/2-ghost-lab`  
**Cycle**: 2 · **Status**: demoable  
**Question**: Can we iterate the Ghost LoRA faster by seeing A vs B side-by-side?

---

## Why this exists

LoRA tuning right now is a guess-and-check loop: generate a frame, watch it, estimate what's wrong, change `scale` or the prompt, wait. This tool makes it deliberate:

- **LoRA vs no-LoRA mode**: same prompt, A routes through `fal-ai/flux-lora` (with the Ghost character LoRA attached), B routes through `fal-ai/flux-dev` (base model, no identity lock). Directly shows whether the LoRA is actually doing its job — white spiral fibonacci hair, mist dress, face obscured, translucent wings — vs when the base model interprets the prompt on its own.

- **A/B Prompts mode**: two independent prompts with per-side LoRA toggles. Good for comparing different scene compositions or camera angles.

## Five pre-set scenes

The scenes cover the Ghost journey arc in order:
1. **Stone chamber** — threshold phase, the child angel's starting point
2. **Root portal** — descent underground, the transition
3. **Underground pool** — the encounter and transformation
4. **Tiny planet** — the blooming tree, peak transcendence
5. **Cosmic ascension** — the final integration tableau

Each scene has two angles (Prompt A = primary, Prompt B = alternate camera) so you can test composition without rewriting from scratch.

## What the votes tell you

Votes are stored in `localStorage` under `ghost-lab-votes`. A tally of A/B/both/neither builds up as you generate. If "LoRA vs no-LoRA" consistently shows "A wins" (LoRA better), the LoRA is doing real work. If it's "Neither" or "B wins", something's wrong — the LoRA may be too strong (dominating the scene prompt) or too weak (identity leaking through).

## Tech notes

- Calls `/api/ai-image/generate` with `highQuality: true`. For admin users this routes to `fal-ai/flux-lora` (with LoRA) or `fal-ai/flux-dev` (without). For non-admin the server silently uses `flux/schnell` regardless — images still generate, just faster and lower fidelity.
- The Ghost LoRA URL is hardcoded in `page.tsx` (copied from `src/lib/journeys/ghost-lora.ts`). If you retrain the LoRA, update both files.
- LoRA scale is 1.2 (hardcoded in the API). A future dream cycle could expose scale as a query param to the API — or this tool could include a "note: scale=1.2" annotation alongside each result.
- Both generations run in parallel (`Promise.all`) — total wait time is one generation, not two.

## What to try

1. **Stone chamber, LoRA vs no-LoRA** — clearest test. Does A (LoRA) show white spiral fibonacci hair and obscured face where B doesn't?
2. **Cosmic ascension, same prompt** — the LoRA should still produce the right character even in abstract cosmic scenes. Does it?
3. **A/B Prompts, overhead vs eye-level** — camera angle matters a lot in Ghost scenes. The preset scenes include alternate angles; this tool makes the comparison instant.
