-- ============================================================================
-- Token-scoped anonymous access for journey_paths / journeys / recordings
-- (2026-08-25 full audit, P1-Security #1 — "Lock down anon RLS")
--
-- PROBLEM
--   The current anon SELECT policies are membership predicates
--   ("share_token IS NOT NULL", "is_featured = true"). RLS cannot express
--   "only the row whose token the caller actually provided", so the entire
--   shared catalog — every path, journey, and recording, INCLUDING their
--   share tokens, storage file_name, and user_id — is enumerable through
--   the anon REST API with a single unfiltered SELECT.
--
-- DESIGN
--   SECURITY DEFINER functions that take the share token (the capability
--   the visitor legitimately holds) and return ONLY the columns the public
--   pages need. Never returned to anon: user_id, file_name, aac_file_name,
--   audio_codec, or any row that is neither featured nor reachable from a
--   provided token. Storage/media resolution stays inside server routes
--   (/api/audio uses the service-role key server-side).
--
-- ROLLOUT — TWO PHASES (this file is PHASE 1 and is fully additive)
--   Phase 1 (now): create the functions + grants. Nothing existing breaks;
--     the old blanket policies keep working while code migrates.
--   Phase 2 (after the code changes in MIGRATION-NOTES-2026-08-25.md ship):
--     uncomment the "FLIP" section at the bottom to drop the blanket anon
--     policies. Do NOT flip before every flow in the notes doc is migrated.
--
-- The dream lab and all share links stay fully login-free — this is row
-- filtering, not auth. (Standing rule: never put /dream behind a login.)
-- ============================================================================

-- ────────────────────────────────────────────────────────────────────────────
-- 1. Paths
-- ────────────────────────────────────────────────────────────────────────────

-- Public view of a shared path, keyed by its share token.
-- Replaces: anon `select * from journey_paths where share_token = :token`
-- Excludes: user_id. (share_token is not echoed back either — the caller
-- already holds it.)
create or replace function public.get_path_by_token(p_token text)
returns table (
  id uuid,
  name text,
  subtitle text,
  description text,
  journey_ids uuid[],
  culmination_journey_id uuid,
  accent_color text,
  glow_color text,
  created_at timestamptz,
  updated_at timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    jp.id, jp.name, jp.subtitle, jp.description,
    jp.journey_ids, jp.culmination_journey_id,
    jp.accent_color, jp.glow_color,
    jp.created_at, jp.updated_at
  from public.journey_paths jp
  where jp.share_token = p_token
    and p_token is not null
    and length(p_token) between 8 and 64;
$$;

-- ────────────────────────────────────────────────────────────────────────────
-- 2. Journeys
-- ────────────────────────────────────────────────────────────────────────────

-- Shared column list for public journey reads: everything the shared
-- journey player + path pages use, minus user_id. NOTE: journey
-- share_token IS included — journeys reachable here are only ever the
-- token-matched journey itself or members of a token-matched path, and
-- the path pages need each member's token to build /journey/<token>
-- links (that linkage is the product feature, not a leak).

-- Single shared journey by its own token.
-- Replaces: anon `select * from journeys where share_token = :token`
create or replace function public.get_journey_by_token(p_token text)
returns table (
  id uuid,
  recording_id uuid,
  name text,
  subtitle text,
  description text,
  story_text text,
  realm_id text,
  phases jsonb,
  share_token text,
  is_public boolean,
  playback_seed text,
  theme jsonb,
  creator_name text,
  audio_reactive boolean,
  local_image_urls text[],
  photography_credit text,
  dedication text,
  ai_enabled boolean,
  created_at timestamptz,
  updated_at timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    j.id, j.recording_id, j.name, j.subtitle, j.description, j.story_text,
    j.realm_id, j.phases, j.share_token, j.is_public, j.playback_seed,
    j.theme, j.creator_name, j.audio_reactive, j.local_image_urls,
    j.photography_credit, j.dedication, j.ai_enabled,
    j.created_at, j.updated_at
  from public.journeys j
  where j.share_token = p_token
    and p_token is not null
    and length(p_token) between 8 and 64;
$$;

-- All member journeys (+ culmination) of a shared path, keyed by the
-- PATH token. Replaces: anon `select ... from journeys where id in
-- (:path.journey_ids)` on /path/[token] and /room/installation.
create or replace function public.get_path_journeys(p_token text)
returns table (
  id uuid,
  recording_id uuid,
  name text,
  subtitle text,
  description text,
  story_text text,
  realm_id text,
  phases jsonb,
  share_token text,
  is_public boolean,
  playback_seed text,
  theme jsonb,
  creator_name text,
  audio_reactive boolean,
  local_image_urls text[],
  photography_credit text,
  dedication text,
  ai_enabled boolean,
  created_at timestamptz,
  updated_at timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    j.id, j.recording_id, j.name, j.subtitle, j.description, j.story_text,
    j.realm_id, j.phases, j.share_token, j.is_public, j.playback_seed,
    j.theme, j.creator_name, j.audio_reactive, j.local_image_urls,
    j.photography_credit, j.dedication, j.ai_enabled,
    j.created_at, j.updated_at
  from public.journeys j
  join public.journey_paths jp
    on jp.share_token = p_token
  where (j.id = any (jp.journey_ids) or j.id = jp.culmination_journey_id)
    and p_token is not null
    and length(p_token) between 8 and 64;
$$;

-- ────────────────────────────────────────────────────────────────────────────
-- 3. Recordings
-- ────────────────────────────────────────────────────────────────────────────

-- "Released" test — a recording is publicly readable when it is featured,
-- carries its own share token, or is attached to a shared journey.
-- Quarantined / unreleased material matches none of these and is invisible.
create or replace function public.recording_is_released(p_recording_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.recordings r
    where r.id = p_recording_id
      and (r.is_featured = true or r.share_token is not null)
  ) or exists (
    select 1 from public.journeys j
    where j.recording_id = p_recording_id
      and j.share_token is not null
  );
$$;

-- Playback/display metadata for the recording behind a shared journey,
-- keyed by the JOURNEY token. Replaces: anon `select artist, duration
-- from recordings where id = :journey.recording_id` on /journey/[token].
-- Excludes: user_id, file_name, aac_file_name, audio_codec, share_token.
create or replace function public.get_recording_for_journey(p_journey_token text)
returns table (
  id uuid,
  title text,
  artist text,
  duration double precision,
  audio_url text,
  is_featured boolean,
  waveform_peaks jsonb,
  created_at timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    r.id, r.title, r.artist, r.duration::double precision, r.audio_url,
    r.is_featured, to_jsonb(r.waveform_peaks) as waveform_peaks, r.created_at
  from public.recordings r
  join public.journeys j on j.recording_id = r.id
  where j.share_token = p_journey_token
    and p_journey_token is not null
    and length(p_journey_token) between 8 and 64;
$$;

-- Same metadata by recording id, gated on the released test. For flows
-- that already hold a recording_id from a token-resolved journey/path
-- (room player, installation sequencing). NOT a token check by itself —
-- this intentionally matches the H1 accepted-risk semantics (id of a
-- released recording is a capability; owner ruling, do not tighten
-- silently).
create or replace function public.get_released_recording_meta(p_recording_id uuid)
returns table (
  id uuid,
  title text,
  artist text,
  duration double precision,
  audio_url text,
  is_featured boolean,
  waveform_peaks jsonb,
  created_at timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    r.id, r.title, r.artist, r.duration::double precision, r.audio_url,
    r.is_featured, to_jsonb(r.waveform_peaks) as waveform_peaks, r.created_at
  from public.recordings r
  where r.id = p_recording_id
    and public.recording_is_released(p_recording_id);
$$;

-- Featured pool (installation fallback / DJ pool for anon kiosks).
-- Replaces: anon `select id, title, artist, duration from recordings
-- where is_featured = true`.
create or replace function public.get_featured_recordings()
returns table (
  id uuid,
  title text,
  artist text,
  duration double precision,
  created_at timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  select r.id, r.title, r.artist, r.duration::double precision, r.created_at
  from public.recordings r
  where r.is_featured = true;
$$;

-- Recording-level share links (/share/[token]).
-- Replaces: anon `select * from recordings where share_token = :token`.
create or replace function public.get_recording_by_share_token(p_token text)
returns table (
  id uuid,
  title text,
  description text,
  artist text,
  duration double precision,
  audio_url text,
  is_featured boolean,
  waveform_peaks jsonb,
  created_at timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    r.id, r.title, r.description, r.artist, r.duration::double precision,
    r.audio_url, r.is_featured, to_jsonb(r.waveform_peaks) as waveform_peaks,
    r.created_at
  from public.recordings r
  where r.share_token = p_token
    and p_token is not null
    and length(p_token) between 8 and 64;
$$;

-- ────────────────────────────────────────────────────────────────────────────
-- 4. Grants — lock function execution to the API roles.
-- ────────────────────────────────────────────────────────────────────────────

revoke all on function public.get_path_by_token(text) from public;
revoke all on function public.get_journey_by_token(text) from public;
revoke all on function public.get_path_journeys(text) from public;
revoke all on function public.recording_is_released(uuid) from public;
revoke all on function public.get_recording_for_journey(text) from public;
revoke all on function public.get_released_recording_meta(uuid) from public;
revoke all on function public.get_featured_recordings() from public;
revoke all on function public.get_recording_by_share_token(text) from public;

grant execute on function public.get_path_by_token(text) to anon, authenticated, service_role;
grant execute on function public.get_journey_by_token(text) to anon, authenticated, service_role;
grant execute on function public.get_path_journeys(text) to anon, authenticated, service_role;
grant execute on function public.recording_is_released(uuid) to anon, authenticated, service_role;
grant execute on function public.get_recording_for_journey(text) to anon, authenticated, service_role;
grant execute on function public.get_released_recording_meta(uuid) to anon, authenticated, service_role;
grant execute on function public.get_featured_recordings() to anon, authenticated, service_role;
grant execute on function public.get_recording_by_share_token(text) to anon, authenticated, service_role;

-- ────────────────────────────────────────────────────────────────────────────
-- 5. FLIP — Phase 2. DO NOT UNCOMMENT until every anon flow listed in
--    supabase/migrations/MIGRATION-NOTES-2026-08-25.md has been migrated
--    to the functions above (and /api/audio + /api/recordings/[id]/analysis
--    are on the service-role resolution path) AND the flows have been
--    smoke-tested against production:
--      * anon /path/d2c79111528a46cf renders + plays
--      * anon /journey/<any WH token> renders + plays
--      * anon /installation (online kiosk) builds its sequence
--      * anon /share/<recording token> renders
--      * dream lab audio (welcomeHome via /api/audio) still streams
--
-- -- journey_paths: kill blanket anon read (owner policy is unaffected).
-- drop policy if exists "Anyone can read shared journey_paths" on public.journey_paths;
--
-- -- journeys: kill blanket anon/shared read (owner policy is unaffected).
-- drop policy if exists "Anyone can read shared journeys" on public.journeys;
--
-- -- recordings: kill the blanket public policy. Owner policy remains; all
-- -- public reads flow through the functions above / server routes.
-- drop policy if exists "recordings_select_public" on public.recordings;
--
-- -- analyses: the public policy leaks full analysis rows for any
-- -- shared/featured recording via REST enumeration of the parent — but
-- -- the /journey and /share players read analyses anonymously today.
-- -- Only drop after those reads move behind get_* functions or a server
-- -- route (see notes doc, "analyses/markers follow-up"):
-- -- drop policy if exists "analyses_select_public" on public.analyses;
-- ============================================================================
