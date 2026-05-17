# Dream Agent — cycle state

Latest cycle is at the top. Each entry: cycle number, UTC timestamp,
decision + reasoning, what shipped, what's queued next.

The agent reads this file at the start of every cycle to know what's
been done. Karel reads it each morning to follow the chain of thought.

---

## Cycle 0 — Seed (manual, Karel + Claude)

**When**: 2026-05-17 (evening, America/Los_Angeles)

**Decided**: Bootstrap the Dream Agent infrastructure. Set up the
sandbox branch, write the operating manual (AGENT.md), seed the idea
queue (IDEAS.md) with 5 prototypes Karel wants first, build prototype
1 (live mic viz) as a working reference for what "demoable AV
prototype" means, and schedule the hourly autonomous cron in the
Anthropic cloud.

**Shipped**:
- Branch `dream/sandbox` created off main
- `docs/dreams/AGENT.md` — operating manual
- `docs/dreams/IDEAS.md` — seeded queue with 5 + 6 stretch ideas
- `docs/dreams/STATE.md` — this file
- `docs/dreams/INDEX.md` — prototype index
- `src/app/(dream)/page.tsx` — index page route
- `src/app/(dream)/layout.tsx` — dream-zone layout
- `src/app/(dream)/_shared/use-mic-analyser.ts` — reusable mic+FFT hook
- `src/app/(dream)/1-live/page.tsx` — first working AV prototype

**Queued next** (for Cycle 1, the first autonomous fire):
1. Verify `dream/sandbox` builds clean on Vercel preview (read the deployment status if accessible)
2. Pick prototype 2 (`/dream/2-ghost-lab`) from IDEAS.md and build the skeleton
3. Log everything to this STATE.md

**Notes for the agent**:
- The /dream/1-live prototype is the quality bar. Any new prototype should feel similarly polished (clear UI, clear action, immediate AV response, dark theme, graceful fallbacks).
- The `_shared/use-mic-analyser.ts` hook is reusable — prefer importing it over reimplementing the mic pipeline.
- Karel reviews each morning at ~06:30 PT. If you finish a big thing right before then, leave a "review this first!" pointer at the top of INDEX.md.
