# Deploy gate + ops hardening (2026-08-25)

Two production-hardening items from the 2026-08-25 audit that each need one
manual step in a dashboard. Everything code-side is already in the repo and is
**inert until you do the dashboard step** — nothing changes until then.

---

## 1. Agent→prod deploy gate (audit P1-Security #6 / C1)

**Problem:** Vercel auto-deploys every push to `main`; CI runs after the fact.
The dream agent ships ~12×/day, so a red build can be live in production
before CI even finishes.

**What's in the repo:** `.github/workflows/deploy-gate.yml` — on every push to
`main` it runs lint + `tsc --noEmit` + vitest, and only on success POSTs a
Vercel **Deploy Hook**. While the `VERCEL_DEPLOY_HOOK_URL` secret is missing,
the deploy step logs a notice and exits 0 — current auto-deploy behavior is
untouched.

**One-time manual setup (≈5 minutes):**

1. **Create the deploy hook** — Vercel dashboard → the Resonance project →
   *Settings → Git → Deploy Hooks* → Create Hook. Name: `ci-gate`, branch:
   `main`. Copy the generated URL.
2. **Add the GitHub secret** — GitHub repo → *Settings → Secrets and
   variables → Actions* → New repository secret. Name:
   `VERCEL_DEPLOY_HOOK_URL`, value: the hook URL.
3. **Turn off git auto-deploy** so the hook becomes the only path to prod.
   Either:
   - *Settings → Git* → disable auto-deployments for production, **or**
   - add an **Ignored Build Step** (Settings → Git → Ignored Build Step) with
     command `exit 0` for git-triggered builds — deploy-hook builds ignore the
     ignored-build-step, so only CI-triggered deploys run. This is the
     safest variant: pushes still register in Vercel, they just don't build.
4. Push any commit and watch: the *Deploy Gate* action goes green → a
   production deployment appears in Vercel sourced from the hook.

**Rollback:** delete the secret (gate goes inert again) and/or re-enable
auto-deploy. The workflow never needs to be reverted.

**Note:** deploy-hook builds clone the branch tip at hook time — a rapid
second push during a CI run deploys the newer tip; `concurrency` in the
workflow cancels the stale run, so the last green push wins.

---

## 2. Upstash KV for durable rate limits (audit P1-Security #3)

**Problem:** `src/lib/rate-limit.ts` supports a Redis (Upstash) backend but no
`KV_REST_API_URL`/`KV_REST_API_TOKEN` is configured anywhere (verified
2026-08-25: absent from `.env.local`). All per-IP limits and the fal/vision
**global daily caps** therefore live in per-lambda memory — every new
serverless instance starts with fresh buckets, so a determined client
multiplies every cap by the number of warm lambdas, and the "global" caps
aren't global. This is the single highest-value remaining security dial.

The code now logs a one-time
`[rate-limit] No KV backend configured …` warning at first use in production
so the gap is visible in Vercel logs until fixed.

**One-time manual setup (≈5 minutes):**

1. Vercel dashboard → the Resonance project → *Storage* → *Create Database* →
   **Upstash for Redis** (Marketplace). Pick the region closest to the
   primary Vercel region.
2. Connect it to the project. Vercel injects `KV_REST_API_URL` and
   `KV_REST_API_TOKEN` env vars automatically (all environments is fine).
   No code change needed — `rate-limit.ts` picks them up on next deploy
   (it also accepts the `UPSTASH_REDIS_REST_URL`/`UPSTASH_REDIS_REST_TOKEN`
   names if you wire Upstash directly instead).
3. Redeploy. Confirm the startup warning no longer appears in function logs.

**What gets durable the moment this lands:** per-IP limits on
`/api/ai-image/*`, `/api/audio/[id]`, heartbeat; the global daily caps on
generate / token-mint / token-proxy / validate; shader-prefs writes.

---

## Related

- Middleware now actually executes from `src/middleware.ts` (default-allow;
  session refresh + security headers + studio-only login redirects). A
  tripwire test (`src/lib/middleware-tripwire.test.ts`) fails CI if a root
  `middleware.ts` ever reappears or a build produces an empty
  middleware-manifest.
- Anon RLS lockdown is staged in
  `supabase/migrations/20260825120000_anon_token_scoped_access.sql` (additive
  phase) — see `supabase/migrations/MIGRATION-NOTES-2026-08-25.md` for the
  code-migration inventory and the flip procedure.
