# Prototype validation

**Last sweep**: 2026-08-14 (steering-doc audit; prior full sweep 2026-05-21)

The dashboard at `/dream` now shows a per-prototype badge auto-derived from the code:

- **✓ local** — pure-local: Web Audio, WebGPU, Canvas, AudioWorklet. No external APIs, no env vars. Runs entirely in the browser.
- **🔑 FAL_KEY** — calls FAL.ai for image / music / voice generation. Requires the `FAL_KEY` env var.

Detection rules:

1. Read `src/app/dream/<slug>/api/route.ts` — if it imports `@fal-ai/client` → fal-required.
2. Read `src/app/dream/<slug>/page.tsx` — if it fetches `/api/ai-image/*` (the shared Resonance FAL-backed endpoint) → fal-required.
3. **Non-fal providers count too (added 2026-08-25).** "✓ local" means NO external AI/API dependency of any kind, not merely "no fal". A proto is key-required — and must NOT badge as local — if its route or page references any of:
   - `@fal-ai/client` / `fal.run` / `fal.ai` URLs (badge: 🔑 FAL_KEY)
   - ElevenLabs — `elevenlabs` imports, `api.elevenlabs.io`, `ELEVENLABS_API_KEY` / `ELEVEN_API_KEY`
   - Google — `@google/generative-ai` / `@google/genai`, `generativelanguage.googleapis.com`, `GEMINI_API_KEY` / `GOOGLE_API_KEY`
   - Anthropic — `@anthropic-ai/sdk`, `api.anthropic.com`, `ANTHROPIC_API_KEY`
   - OpenAI — `openai` import, `api.openai.com`, `OPENAI_API_KEY`
   - Replicate / Hugging Face inference — `replicate` import, `api.replicate.com`, `api-inference.huggingface.co`
   - Generic tells: any `process.env.*_API_KEY` / `*_KEY` read inside a dream route, or a server route that `fetch`es a non-Resonance origin.
   When any of these match, badge with the provider's key name (e.g. 🔑 ELEVENLABS_API_KEY) rather than the generic FAL badge; the auto-detection in `src/app/dream/page.tsx → loadPrototypes()` must be extended in the same commit that introduces a new provider.
4. Otherwise → local.

## Findings (2026-05-21)

**16 prototypes need FAL_KEY** *(2026-08-14 update: the dream zone has since grown to **32 dream API routes**, all verified calling `guard()` — audit 2026-08-14; the table below is the historical 2026-05-21 snapshot)*:

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

## FAL_KEY scope (2026-05-21) — **RETIRED FLOW, historical only**

**RETIRED 2026-05-21:** the `dream/sandbox` Preview flow described below no longer exists — the agent commits straight to `main` (the build gate + `guard()` are the controls). Kept for history:

Before today, `FAL_KEY` was only configured for the **Production** scope on Vercel. The `dream/sandbox` branch deploys as a **Preview**, which had no `FAL_KEY` — meaning all 16 FAL-dependent prototypes returned 500 on the public preview URL.

Today (2026-05-21) `FAL_KEY` was added to **Preview** and **Development** scopes via the Vercel CLI. After the next deploy of `dream/sandbox`, the FAL-required prototypes should function on the public preview URL.

## Security model (2026-05-21)

The preview URL is **public, no login required** (Karel's explicit ask). To keep that open while preventing FAL_KEY abuse, all 15 dream-zone FAL routes plus the `66-chatterbox-ghost/api/upload` route are wrapped with `src/app/dream/_shared/api-guard.ts`. The guard runs four layered checks before the route's handler:

1. **Method check** — POST only.
2. **Origin check** — request's `Origin` or `Referer` header must match a known Resonance domain (`getresonance.vercel.app`, any `resonance-*-kbarnoski-5224s-projects.vercel.app` preview, or localhost). Stops casual `curl` abuse and cross-site invocation. Spoofable by a motivated attacker but blocks ~80% of bot traffic.
3. **Per-IP sliding-window rate limit** — 8 requests / 60s. Returns `429 Retry-After`.
4. **Per-IP daily quota** — 40 requests per IP per UTC day. Returns `429`.

**Updated 2026-08-14:** rate limiting uses **Upstash KV** when `KV_REST_API_URL` / `KV_REST_API_TOKEN` are set, falling back to per-lambda in-memory otherwise (`src/lib/rate-limit.ts`). The env vars must be confirmed present on Vercel for the KV tier to be active — in-memory fallback is per-instance and resets on cold starts. The FAL account-level budget cap (set in the fal.ai dashboard) is the hard cost backstop.

**Global aggregate daily caps (added 2026-08-14):** on top of the per-identity quotas, `api-guard.ts` enforces a lab-wide ceiling of 1,500 fal calls/day (`DREAM_FAL_GLOBAL_DAILY_CAP` to override) and `/api/ai-image/generate` enforces 6,000/day (`AI_IMAGE_GLOBAL_DAILY_CAP`, sized so a full-day installation show at ~514 frames/hr is never blocked). These bound the many-IPs worst case; they are truly global only once KV is connected.

The shared `/api/ai-image/generate` route used by `2-ghost-lab` is already protected by Resonance's existing rate limiter (`@/lib/rate-limit`) plus a tiered model selection — anonymous traffic gets the cheap `fal-ai/flux/schnell` model (~$0.003/frame) with burst=8 and refill=0.125/s.

### Hardening recommended next (in order)

1. **Set a FAL account budget cap** in fal.ai dashboard. Hard backstop on cost. **DONE — confirmed set by Karel 2026-08-14.**
2. **Move guard state to Vercel KV** for cross-instance persistence (small monthly cost).
3. **Add Cloudflare Turnstile** invisible challenge for the most expensive routes (voice synthesis, music).
4. **Audit each route for prompt-length caps and parameter bounds** — most have implicit caps but a malicious POST could request `duration_seconds: 600` and burn budget. Add per-route input validation.

### Agent rule

`AGENT.md` rule #8 now requires every new dream-zone API route to call `guard(req)` as its first line. Future cycles that add API-backed prototypes will automatically inherit this protection.

## How this stays current

The dashboard auto-derives the validation badge from the source files on every Vercel build. When the agent adds a new prototype with an `api/route.ts` that imports `@fal-ai/client`, it'll automatically show 🔑 FAL_KEY. If it adds something using a different provider (ElevenLabs, Gemini/Anthropic, OpenAI, Replicate, HF), detection rule 3 above applies: the proto must not badge "✓ local", and `src/app/dream/page.tsx → loadPrototypes()` must be extended for that provider in the same commit.
