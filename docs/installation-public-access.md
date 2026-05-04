# Public installation URL — `/installation`

## What this gives you

A shareable URL — `https://getresonance.vercel.app/installation` — that anyone can open without signing in. They see:

- The cycle intro (Resonance title + your credit)
- All 5 journeys playing in sequence, with shaders + audio + journey titles
- The credits screen + loop back to the start

What they **don't** see in anon mode:
- AI-generated imagery (the fal.ai endpoints stay auth-gated to bound your costs)

If they sign up, they get the full experience including AI imagery on the same URL.

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
- The `InstallationLoopClient` receives an `anonMode` flag. When true, it calls `setAiImageEnabled(false)` on mount so the visualizer skips fal.ai calls entirely.

## How to verify

After deploy:

1. Open `/installation` in an incognito / signed-out browser
2. You should see the cycle intro start within ~2 seconds (font load + audio unlock)
3. Click anywhere on the page to unlock the AudioContext (browser autoplay policy)
4. Audio + shaders + journey titles play
5. No AI imagery should appear; the network panel should show no requests to `/api/ai-image/*`

If you see "no audio" or the loop hangs at the cycle intro → the SQL above probably hasn't been run yet, so the anon client can't read the paired tracks.

## To revert / lock back down

- Remove the `/installation` and `/room/installation` lines from `middleware.ts`'s `isPublicRoute` block
- Page would redirect anonymous viewers to `/login` again (the page logic remains backward-compatible — it just renders shader/audio without imagery for anon, but the middleware would never let them through)
