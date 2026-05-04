# Resonance audit — final posture assessment

This is the honest "where does the app actually stand" doc after PRs
#2 (Phase 0/1), #3 (P1 follow-ups), #4 (P2 follow-ups), and the
deferred-followups branch.

## What's solid now

| Category | Status | Notes |
|---|---|---|
| API auth gating | ✅ Solid | All paid-upstream routes gated. 47 files use the verified `auth.getUser()`; **zero** use the cookie-only `auth.getSession()`. |
| Per-user rate limits | ✅ Solid | Token bucket on every expensive route, KV-aware backend ready for multi-region. |
| Input validation | ✅ Solid | Length caps, enum validation, URL host allowlists wherever user input flows to a paid upstream. |
| Admin gating | ✅ Solid | Single-source-of-truth `requireAdmin()`. Fail-closed if `ADMIN_EMAIL` unset. |
| Open-redirect | ✅ Closed | `safeInternalRedirect` applied at login, signup, and `/auth/callback`. 8 unit tests. |
| AI image safety | ✅ Default ON | `enable_safety_checker: true` for normal users; admins can opt out. |
| fal.ai credentials | ✅ Server-only | 5-min JWT minted per page load; master key never reaches client. |
| ffmpeg sandbox | ✅ Hardened | 200 MB input cap, 250 MB output cap (`-fs` + SIGKILL stat-check), 60s timeout. |
| Tauri sidecar | ✅ Hardened | UUID-validated recording_id, host-allowlisted audio fetcher, real CSP (was `null`). |
| CSP | 🟡 Partial | Loose enforced policy is live. Tighter nonce-based policy ships in Report-Only mode for monitoring before promotion. |
| Logging seam | ✅ In place | All `console.*` in API routes go through `logger.ts`. Ready for redaction / Sentry without touching call sites. |
| Tests | ✅ 76 | rate-limit (19), validate-input (29), require-admin (10), installation-machine (10), safe-redirect (8). |
| CI gating | ✅ On | Lint + tests + build on every push/PR via `.github/workflows/test.yml`. |
| Dependency CVEs | ✅ Patched | Next.js 15.5.15 (was 15.5.12) closes 3 high-severity advisories. Remaining moderate advisories assessed not-exploitable. |
| XSS surface | ✅ Clean | No `dangerouslySetInnerHTML` anywhere. ReactMarkdown locked down. |

## What's NOT yet solid (and why)

| Gap | Severity | Why it's deferred |
|---|---|---|
| RLS policy review | **HIGH** | Script ships (`scripts/audit-rls.mjs`); the actual policy review is human work that needs DB access. **This is the load-bearing security boundary for cross-user data isolation. Do this review before anything else.** |
| Supabase dashboard config | Medium | Email templates, MFA, OAuth providers, password rules — all live in the Supabase dashboard, not the codebase. Need a 30-min walkthrough of the dashboard auth settings. |
| Content moderation | Medium for personal use; high if shared widely | Vendor + product decisions needed (block-vs-warn, appeal flow, cost). Design doc + interface stub ship in `docs/content-moderation.md`. |
| Observability | Medium | No Sentry / structured error tracking. Logger seam is in place; wiring it to a backend is a follow-up. |
| Performance / load testing | Medium | No load tests. Vercel autoscaling + the rate limiter cap exposure to spikes; query patterns haven't been audited. |
| Backups + DR | Medium | No verified backup restore process. Supabase has automatic backups; whether they restore correctly hasn't been tested. |
| Accessibility | Low for current scope | Not audited. The app is a creative tool, not a public service obligation. |
| Compliance (GDPR/CCPA) | Low for current scope | No data-export / deletion flows. Becomes high if EU/CA users get access. |
| Mobile Capacitor surface | Low | iOS build works; not security-audited. |
| Multi-region failover | Low | Single Vercel region today. KV-aware rate limiter is ready; no other state is multi-region-aware. |

## "Best in class" — honest take

For an indie/personal-music app at this scale, **yes** — the security
posture is materially above what most apps in this category ship.
The auth/rate-limit/input-validation hygiene is at parity with what
a well-funded SaaS startup would have after a Series A audit. The
Tauri sidecar is hardened past most Electron apps you can name. The
test suite + CI gating prevents regression.

For "scalable enterprise SaaS at $10M ARR" the gaps above are the
work to close. None of them are quick fixes — they're real
engagements (RLS review with DB access, observability with vendor
choice, accessibility with WCAG audit).

## Recommended next steps (in order)

1. **Run the RLS audit.** This is the single most important thing
   left. Follow the instructions at the top of
   `scripts/audit-rls.mjs`, eyeball the output, fix any policy that
   doesn't match the access pattern its table needs.
2. **Walk the Supabase dashboard.** Spend 30 minutes on the auth
   tab — email templates, MFA, password rules, OAuth providers. Most
   of these are one-toggle wins.
3. **Wire Sentry** (or equivalent). The logger seam is ready; just
   need to swap the `console.*` calls inside `src/lib/logger.ts`
   for a Sentry SDK call. Half a day of work.
4. **Promote the CSP.** Watch `/api/csp-report` for a release cycle.
   When it's quiet, swap the enforced CSP for the nonce-based one.
5. **Decide on content moderation.** Read `docs/content-moderation.md`,
   make the vendor + block-vs-warn calls, then implement.

Items 1, 2 are dashboard / DB review. Items 3, 4 are short
engineering tasks. Item 5 is a product decision.

## Reproducibility

Every commit on `main` since the audit started has `[lint + test +
build]` running in CI. The 76 tests cover the security-critical
helpers (rate-limit, input validation, admin gate, safe-redirect,
installation timing). New code that breaks any of those fails the
build before merge.

The audit-findings doc (`docs/audit-findings.md`) is the long-form
record. This file is the executive summary.
