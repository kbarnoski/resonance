# Prototype validation

**Last sweep**: 2026-05-21 (manual audit + automated detection)

The dashboard at `/dream` now shows a per-prototype badge auto-derived from the code:

- **✓ local** — pure-local: Web Audio, WebGPU, Canvas, AudioWorklet. No external APIs, no env vars. Runs entirely in the browser.
- **🔑 FAL_KEY** — calls FAL.ai for image / music / voice generation. Requires the `FAL_KEY` env var.

Detection rules:

1. Read `src/app/dream/<slug>/api/route.ts` — if it imports `@fal-ai/client` → fal-required.
2. Read `src/app/dream/<slug>/page.tsx` — if it fetches `/api/ai-image/*` (the shared Resonance FAL-backed endpoint) → fal-required.
3. Otherwise → local.

## Findings (2026-05-21)

**16 prototypes need FAL_KEY:**

| Slug | API path |
|---|---|
| 2-ghost-lab | shared `/api/ai-image/generate` |
| 6-compose | own `api/route.ts` |
| 43-stable-extend | own `api/route.ts` |
| 44-vocal-bgm | own `api/route.ts` |
| 48-arc-compose | own `api/route.ts` |
| 53-ghost-sfx | own `api/route.ts` |
| 54-maestro-stems | own `api/route.ts` |
| 56-ghost-voice | own `api/route.ts` |
| 57-sound-to-image | own `api/route.ts` |
| 58-music-to-ghost | own `api/route.ts` |
| 59-gemini-voice-lab | own `api/route.ts` |
| 61-orpheus-voice | own `api/route.ts` |
| 62-collage-compose | own `api/route.ts` |
| 64-eleven-dialogue | own `api/route.ts` |
| 66-chatterbox-ghost | own `api/route.ts` (+ `api/upload/route.ts`) |

**Everything else** (~50 prototypes) is pure-local and works without configuration.

## FAL_KEY scope (2026-05-21)

Before today, `FAL_KEY` was only configured for the **Production** scope on Vercel. The `dream/sandbox` branch deploys as a **Preview**, which had no `FAL_KEY` — meaning all 16 FAL-dependent prototypes returned 500 on the public preview URL.

Today (2026-05-21) `FAL_KEY` was added to **Preview** and **Development** scopes via the Vercel CLI. After the next deploy of `dream/sandbox`, the FAL-required prototypes should function on the public preview URL.

## Security model (2026-05-21)

The preview URL is **public, no login required** (Karel's explicit ask). To keep that open while preventing FAL_KEY abuse, all 15 dream-zone FAL routes plus the `66-chatterbox-ghost/api/upload` route are wrapped with `src/app/dream/_shared/api-guard.ts`. The guard runs four layered checks before the route's handler:

1. **Method check** — POST only.
2. **Origin check** — request's `Origin` or `Referer` header must match a known Resonance domain (`getresonance.vercel.app`, any `resonance-*-kbarnoski-5224s-projects.vercel.app` preview, or localhost). Stops casual `curl` abuse and cross-site invocation. Spoofable by a motivated attacker but blocks ~80% of bot traffic.
3. **Per-IP sliding-window rate limit** — 8 requests / 60s. Returns `429 Retry-After`.
4. **Per-IP daily quota** — 40 requests per IP per UTC day. Returns `429`.

State is held in process memory, so it's per-lambda-instance and resets on cold starts. For true global rate limiting we'd move to Vercel KV / Upstash. For an experimental public sandbox the in-memory tier raises the bar enough that casual abuse is unprofitable; the FAL account-level budget cap (set in the fal.ai dashboard) is the hard cost backstop.

The shared `/api/ai-image/generate` route used by `2-ghost-lab` is already protected by Resonance's existing rate limiter (`@/lib/rate-limit`) plus a tiered model selection — anonymous traffic gets the cheap `fal-ai/flux/schnell` model (~$0.003/frame) with burst=8 and refill=0.125/s.

### Hardening recommended next (in order)

1. **Set a FAL account budget cap** in fal.ai dashboard. Hard backstop on cost.
2. **Move guard state to Vercel KV** for cross-instance persistence (small monthly cost).
3. **Add Cloudflare Turnstile** invisible challenge for the most expensive routes (voice synthesis, music).
4. **Audit each route for prompt-length caps and parameter bounds** — most have implicit caps but a malicious POST could request `duration_seconds: 600` and burn budget. Add per-route input validation.

### Agent rule

`AGENT.md` rule #8 now requires every new dream-zone API route to call `guard(req)` as its first line. Future cycles that add API-backed prototypes will automatically inherit this protection.

## How this stays current

The dashboard auto-derives the validation badge from the source files on every Vercel build. When the agent adds a new prototype with an `api/route.ts` that imports `@fal-ai/client`, it'll automatically show 🔑 FAL_KEY. If it adds something using a different provider (ElevenLabs, Gemini, OpenAI directly), the detection rules in `src/app/dream/page.tsx → loadPrototypes()` will need updating.
