# Disconnected mode + local LLM + local imagery — design notes

Written 2026-04-13. This is the research doc the user asked for, covering:
1. What breaks if wifi drops while Resonance is running.
2. Whether a disconnected mode could be a reliable fallback for installations.
3. Whether a local LLM (for chat-based journey creation) is viable on this Mac.
4. How all three tie into the new local-image feature (already shipped).

---

## 1. What happens today if wifi is turned off

Resonance is *hostile* to offline use right now. Nearly everything on the hot path goes through Supabase or a network-only AI service:

**Immediate failures**
- Supabase auth middleware runs on every SSR route (`src/middleware.ts`). Offline → auth refresh fails → pages 500 or redirect to login.
- Audio streams via `/api/audio/[id]` (`src/app/api/audio/[id]/route.ts`) which signs a Supabase storage URL. No network → no audio.
- AI imagery calls fal.ai through `src/lib/journeys/realtime-image-service.ts`. An in-memory LRU cache holds 20 images max, nothing persisted to disk.
- TTS guidance phrases hit OpenAI via `src/app/api/poetry/speak/route.ts`. Cache-Control is only 1h browser cache, no server-side persistence.
- Cormorant Garamond font is injected at runtime from Google Fonts (`journey-phase-indicator.tsx:99`, `journey/[token]/client.tsx:100`). Falls back to Georgia.
- Music credits + cue markers fetched alongside the journey metadata from Supabase.
- Journey creation (`/api/journeys/create`) requires Anthropic (generateObject) + Supabase insert. 100% offline-blocked.

**Things that still work offline**
- Static assets served out of `.next/`, the TensorFlow Basic Pitch model in `/public/model/`, compiled JS bundles, Geist fonts (embedded at build time).
- Anything already in the browser's HTTP cache for that session.

**Verdict**: today, a wifi drop kills Resonance within seconds. No service worker, no IndexedDB cache, no offline-first anywhere.

---

## 2. Disconnected mode as an installation fallback

The user's scenario: running a gallery installation, wifi drops, the piece must keep playing without visible interruption. This is achievable but requires deliberate work. Scoping from smallest useful intervention to full offline-first:

### Level 1 — "keep what's already playing going" (small)
When the active journey is running and the network goes away:
- Keep rendering whatever AI images are currently in the layer stack. They already hold for 8s peak + 12s fadeout, so there's ~60s of runway after the last successful gen.
- Pause new generation requests silently instead of retrying in tight loops (the realtime-image-service already has basic retry; just make it cheaper when offline).
- Don't refetch anything. The shader, engine, and audio file are already loaded.

That alone buys you a "soft degrade" window for short outages. It's ~1 day of work.

### Level 2 — "local imagery fallback" (medium)
Leverage the *local-image feature shipped in this session*. Any journey built with the "Your own photos" option is already 100% offline-capable for imagery — it never calls fal.ai, cycles URLs from a list. If those URLs are hosted locally (see Level 3) or pre-fetched, the journey plays without any network activity.

Practical install pattern: build journeys for the installation using the photographer-collab flow. Put the image files somewhere the installation machine can reach without internet — either pre-fetched into the browser's cache via a service worker, or served by a local static server. This is maybe a week of work and the most pragmatic path for the photographer-collab use case.

### Level 3 — "full offline-first" (large, ~2–3 weeks)
For a proper no-network-ever experience we need:
- A service worker precaching shell + shaders + fonts + Basic Pitch model.
- IndexedDB blob store for AI-generated images. `AiImageLayer` would tap `onFrame` and write the decoded blob. On cold start with no network, read from IndexedDB keyed by `(journeyId, phaseId, promptHash)`.
- Auth fallback: persist the last-known session in localStorage and let middleware.ts skip the refresh if `navigator.onLine === false`. The Supabase JS client already stores tokens — just need to stop hard-failing on refresh.
- Audio stored locally via Cache API or IndexedDB, keyed by recording ID.
- TTS guidance: pre-generate all phase phrases at journey creation and persist to storage, so they exist before playback.
- Fonts: bundle Cormorant Garamond with `next/font/google` instead of runtime `<link>` injection. (This is a ~10-minute fix worth doing regardless.)

The blocker isn't technical difficulty, it's coverage — you have to audit every network call once. The Cormorant fix and service worker registration alone would take the app from "dies on wifi drop" to "survives a 10-minute outage mid-journey".

**Recommendation**: Do Level 2 now for installations (leverages the photographer feature). Budget Level 3 as a ~3-week roadmap item if offline becomes an ongoing requirement.

---

## 3. Local LLM for chat-based journey creation

Short answer: **Claude Code itself cannot run locally** (it requires Anthropic API), but Resonance's journey creation *can* be swapped to a local LLM with very little code.

### Runtime
Use **Ollama** on Apple Silicon. It's a single brew install, runs headless on `localhost:11434` with an OpenAI-compatible HTTP API, and ships day-one GGUF models. Vercel AI SDK (already used in this repo via `generateObject`) has two community providers: `ai-sdk-ollama` (recommended) and `ollama-ai-provider`.

### Model
**Qwen 2.5 32B** (~24 GB RAM at q4_K_M) or **Mistral Small 24B** are the minimum viable sizes for reliable structured JSON output matching the 6-phase journey schema. Llama 3.3 70B is better prose but needs 40+ GB RAM and is overkill for this task. Qwen 2.5 in particular has strong JSON-mode compliance (>95% schema adherence in practice).

### Integration
The change is essentially one file:
- `src/lib/ai/providers.ts` — switch `defaultModel` between Anthropic and Ollama based on `process.env.USE_LOCAL_LLM`.
- `src/lib/journeys/journey-builder.ts:66` — no change needed, `generateObject()` is provider-agnostic.
- Add a retry loop in `buildJourneyFromStory()` because local JSON schema constraints are "strong hints" not guarantees.

### Expected UX
- First token latency on schema-constrained generation is ~2–3× slower than free-form. Plan for 15–25 seconds to generate a full 6-phase journey vs. ~2 seconds via Anthropic.
- The existing creation dialog already has rotating status messages ("Reading your story...", "Composing phases...") — these would need longer rotation (every 3–4 seconds instead of 8).
- Add a startup health-check that pings Ollama once at boot; if unreachable, gracefully fall back to the Anthropic path instead of erroring.

### Chat-based vs. single-shot form
The user asked about replacing "OG text input boxes and fields" with a chat interface. That's an independent UX change from the local-LLM swap. A minimal chat flow:
1. User types "a walk through autumn woods at dusk"
2. LLM replies with a 2-sentence interpretation + proposed theme, asks one clarifying question
3. User answers
4. LLM emits the full structured journey
This is 2–3 round trips with a smaller reasoning model per turn, then one structured-output call at the end. Works fine on local Ollama; the latency hurts less in a chat UI because each turn is small.

**Recommendation**: worth doing in 2 steps. First add the env-flag provider swap (1 day of work) so any future local-LLM users can opt in. Then later build the chat UI on top of it. Don't couple them.

### Can local LLM + disconnected mode combine?
Yes — and that's the killer combo for installations. Ollama runs on the installation machine, Resonance talks to it over localhost, no network required for journey creation at all. Combined with Level 3 offline-first above, the whole app becomes wifi-optional. The one caveat is that TTS (OpenAI voice) doesn't have a strong local equivalent yet; you'd need to fall back to browser SpeechSynthesis or pre-generate audio.

---

## 4. How the local-image feature shipped this session ties in

The photographer-collab feature just shipped. Journey creation now accepts a multi-file image upload, persists the uploads to a new Supabase `journey-images` bucket, and the playback engine cycles those URLs instead of calling fal.ai. It's the first piece of "offline-friendlier" architecture in the codebase:
- No per-image cost cap concerns (fal.ai is $0.003/frame × ~100/session).
- Playback makes zero AI-imagery network calls.
- The image URLs are public-read from Supabase storage — if a service worker precaches them once, subsequent playback is fully offline for imagery.

This is the feature to build Level 2 disconnected mode on top of. For the installation use case specifically, pre-fetching the photographer's images via service worker would give you the whole journey's visuals stored locally, and the audio is the only remaining network dependency.

---

## Next-step shortlist

If you want to keep pushing on this, the roughly-right ordering is:

1. **Bundle Cormorant via `next/font/google`** (10 min). Removes one runtime network dependency.
2. **Register a service worker** that precaches shell + shader code + the journey-images bucket. ~2 days. Unlocks Level 2.
3. **Add `USE_LOCAL_LLM` env flag** to `providers.ts` and install Ollama + Qwen 2.5 32B. ~1 day. Journey creation works offline.
4. **Persist session auth** in localStorage + make `middleware.ts` tolerant of offline refreshes. ~1 day. Makes `/room` routes openable without network.
5. **IndexedDB blob store** for AI images + pre-generated TTS. ~1 week. Unlocks Level 3 for regular AI-imagery journeys.
6. **Chat-based creation UI** on top of the local LLM. ~3–5 days.

Steps 1–4 get you to "installation-safe for local-image journeys". Steps 5–6 round out the vision.
