-- ============================================================================
-- PHASE-2 FLIP — drop the blanket anon SELECT policies on
-- journey_paths / journeys / recordings.
--
-- ⚠️  DO NOT APPLY until BOTH of the following are true:
--
--   1. The Phase-2 code changes (MIGRATION-NOTES-2026-08-25.md items 1–12
--      and 14 — the rpc migrations landed 2026-08-25) are DEPLOYED to
--      production. Every anon flow now reads through the SECURITY DEFINER
--      functions from 20260825120000_anon_token_scoped_access.sql (as
--      corrected by 20260825150000_fix_released_leaks.sql), and
--      /api/audio/[id] + /api/recordings/[id]/analysis resolve shared
--      media via the service-role client.
--
--   2. The smoke list passes against the DEPLOYED build:
--        * anon /path/d2c79111528a46cf renders + plays a track
--        * anon /journey/<any Welcome Home token> full playback
--        * anon /room/installation?loop=1 builds its journey sequence
--          (online mode)
--        * anon /share/<recording token> renders (player + analysis)
--        * anon /room?recording=<released id> renders + plays
--        * a dream proto on real music (e.g. /dream/700-welcome-home)
--          streams audio
--        * Tramokyo OFFLINE_PACK boot (untouched — no Supabase at all)
--
-- After applying, re-run the smoke list, then verify the enumeration hole
-- is actually closed:
--     curl "$SUPABASE_URL/rest/v1/journey_paths?select=*" \
--       -H "apikey: $ANON_KEY" -H "Authorization: Bearer $ANON_KEY"
--   must return [] (likewise for journeys and recordings).
--
-- WHAT THIS DOES
--   Removes the membership-predicate anon policies ("share_token IS NOT
--   NULL", "is_featured = true") that made the entire shared catalog —
--   tokens, storage paths, user_ids — enumerable through the anon REST
--   API. Owner (authenticated) policies are unaffected; all public reads
--   now flow through the token-scoped SECURITY DEFINER functions or
--   server routes holding the service-role key.
--
-- WHAT THIS DELIBERATELY KEEPS (per the notes' analyses/markers follow-up)
--   analyses_select_public and the featured-markers policy stay in place:
--   the anon players on /journey/[token], /share/[token], /room and the
--   installation still read analyses + markers directly. If those are to
--   be closed later, add get_analysis_for_released_recording(uuid) /
--   get_markers_for_released_recording(uuid) gated on
--   recording_is_released() FIRST, migrate the readers, then drop the
--   policies in their own migration.
--
-- Standing rules honored: nothing here adds an auth wall — the dream lab
-- and every share link stay fully login-free. This is row filtering only.
-- ============================================================================

-- journey_paths: kill blanket anon read (owner policy is unaffected).
drop policy if exists "Anyone can read shared journey_paths" on public.journey_paths;

-- journeys: kill blanket anon/shared read (owner policy is unaffected).
drop policy if exists "Anyone can read shared journeys" on public.journeys;

-- recordings: kill the blanket public policy. Owner policy remains; all
-- public reads flow through the SECURITY DEFINER functions / server routes.
drop policy if exists "recordings_select_public" on public.recordings;

-- analyses: NOT dropped — see header. Kept for the anon players.
-- drop policy if exists "analyses_select_public" on public.analyses;
