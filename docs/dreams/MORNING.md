# Morning digest — last updated 2026-05-18 (Cycle 2)

## New since yesterday

- **Ghost LoRA Lab** — `/dream/2-ghost-lab` — open this to test the Ghost LoRA.
  Two modes: "LoRA vs no-LoRA" (same prompt, A=flux-lora, B=flux-dev) and
  "A/B Prompts" (different prompts, per-side LoRA toggle). Five pre-set Ghost
  scenes (stone chamber → root portal → underground pool → tiny planet → cosmic
  ascension). Vote buttons with localStorage tally. Requires admin login for
  flux-lora quality — non-admin gets schnell, still works for prompt iteration.

- **`/dream/` dashboard** — live since Cycle 1, renders this file + recent cycles
  + prototype list. One bookmark.

## In progress / partial

- `1-live` (mic viz) — demoable, not polished. No active work this cycle.

## Up next

- `/dream/3-fluid` — audio-driven Navier-Stokes ink-in-water (WebGL GPU shader).
  Bass = pressure pulses, treble = turbulence, spectral centroid = ink color.
  Most visually distinctive thing in the queue.

## Research findings worth a look

_(Research cycle scheduled ~Cycle 4. Queue is healthy at 8+ ideas.)_

## Open questions for Karel

- **Ghost LoRA scale**: the API hardcodes scale=1.2. Want to test other values?
  Would need one small edit to the generate API (`route.ts`). Say the word.
- **Vote history**: votes are localStorage-only right now (per-browser). Worth
  posting to Supabase for cross-session analysis? Small API endpoint needed.

---

**Preview URL**: https://resonance-git-dream-sandbox-kbarnoski-5224s-projects.vercel.app/dream
