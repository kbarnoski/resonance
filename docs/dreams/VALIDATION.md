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

## Trade-off Karel should know about

The preview URL is currently **public** (Vercel SSO disabled, per Karel's request 2026-05-19). With `FAL_KEY` now exposed on Preview, anyone with the preview URL can invoke the FAL-backed API routes through Karel's account. Mitigations to consider later:

1. Add basic origin / referer checks to each `<slug>/api/route.ts`.
2. Add rate-limiting (Vercel KV-backed or per-IP).
3. Rotate FAL_KEY periodically and keep an eye on the FAL dashboard for unexpected spend.
4. Re-enable SSO and use a bypass token if the URL is intended to be sharable but not crawlable.

None of these block functionality — they're hardening for if the URL starts being shared widely.

## How this stays current

The dashboard auto-derives the validation badge from the source files on every Vercel build. When the agent adds a new prototype with an `api/route.ts` that imports `@fal-ai/client`, it'll automatically show 🔑 FAL_KEY. If it adds something using a different provider (ElevenLabs, Gemini, OpenAI directly), the detection rules in `src/app/dream/page.tsx → loadPrototypes()` will need updating.
