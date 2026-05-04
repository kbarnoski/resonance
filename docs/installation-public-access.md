# Public installation URL — `/installation`

## What this gives you

A shareable URL — `https://getresonance.vercel.app/installation` — that anyone can open without signing in. They see the **full experience**:

- The cycle intro (Resonance title + your credit)
- All 5 journeys playing in sequence
- Shaders + audio + journey titles
- AI-generated imagery (live, same as authed users see)
- The credits screen + loop back to the start

## Cost protection (per-IP rate limits)

Each visitor's IP address gets its own quota of fal.ai / Anthropic vision calls. The limits are tighter for anonymous viewers than authed users:

| Endpoint | Anon limit (per IP) | Authed limit (per user) |
|---|---|---|
| `ai-image/token` GET (mints fal JWT) | 3 burst, 1 per 60s | 5 burst, 1 per 30s |
| `ai-image/token` POST (HTTP proxy) | 30 burst, 0.5/s | 60 burst, 1/s |
| `ai-image/generate` (HTTP fallback) | 15 burst, 0.25/s | 30 burst, 0.5/s |
| `ai-image/validate` | 15 burst, 0.25/s | 30 burst, 0.5/s |

Worst-case per-IP cost: ~$10-20/hour at sustained max. Normal usage is well below the limits — these are abuse ceilings, not throttle points for organic viewing.

For "a few people to start," this is fine. If you decide later to share more widely (Twitter, etc.), revisit by either tightening the anon limits in `src/app/api/ai-image/*/route.ts` or routing public traffic through a moderation cache.

## What you need to do once

For anonymous visitors to actually play your audio, the 5 paired tracks need to be marked `is_featured` in your Supabase database. RLS on the `recordings` table only returns rows that have `is_featured = true` (or are attached to a shared journey) for anonymous reads — that's what protects your other recordings from being readable by anyone with the URL.

Open the Supabase SQL editor and run:

```sql
-- Mark the five paired installation tracks as featured so anonymous
-- visitors at /installation can stream them.
update recordings set is_featured = true
where title ilike any (array[
  '%17th St 63%',     -- Ascension
  '%KB_REALIZED%',    -- Inferno
  '%KB_SFLAKE%',      -- First Snow
  '%17th St 62%',     -- Abyssal Dive
  '%KB_GHOST_REF%'    -- Ghost
]);

-- Confirm:
select id, title, is_featured from recordings
where title ilike any (array[
  '%17th St 63%', '%KB_REALIZED%', '%KB_SFLAKE%',
  '%17th St 62%', '%KB_GHOST_REF%'
]);
```

The `update` should report 5 rows affected. The `select` should show all five with `is_featured = true`.

## How it works

- `middleware.ts` allowlists `/installation` and `/room/installation` so unauthenticated visitors aren't redirected to `/login`.
- `next.config.ts` rewrites `/installation` → `/room/installation?loop=1` (URL stays clean).
- The page-level server component reads the auth state. If unauthenticated, it queries the anon Supabase client for `is_featured` recordings only — RLS does the gating.
- The fal.ai endpoints (`ai-image/token`, `ai-image/validate`, `ai-image/generate`) accept anon callers but apply tighter per-IP rate limits than for authed users.

## How to verify

After deploy:

1. Open `/installation` in an incognito / signed-out browser
2. You should see the cycle intro start within ~2 seconds (font load + audio unlock)
3. Click anywhere on the page to unlock the AudioContext (browser autoplay policy)
4. Audio + shaders + journey titles + AI imagery all play

If you see "no audio" or the loop hangs at the cycle intro → the SQL above probably hasn't been run yet, so the anon client can't read the paired tracks.

## To revert / lock back down

- Remove the `/installation` and `/room/installation` lines from `middleware.ts`'s `isPublicRoute` block
- Page would redirect anonymous viewers to `/login` again (the page logic remains backward-compatible — it just renders shader/audio without imagery for anon, but the middleware would never let them through)
