-- ============================================================================
-- Corrective pass on 20260825120000_anon_token_scoped_access.sql
-- (found by live verification probes immediately after Phase-1 apply)
--
-- DEFECT 1 — quarantine bypass: recording_is_released() keyed on
--   is_featured/share_token, but the 17th St + Folsom St quarantine and
--   Joseph's "Sketches" exclusions live only in code
--   (src/app/dream/_shared/welcomeHome.ts). The quarantined uploads are
--   is_featured=true in the DB, so "17th St 61" sailed through
--   get_released_recording_meta(). Fix: hardcode the exclusion set here
--   (KEEP IN SYNC with welcomeHome.ts — 9 quarantined + 5 Joseph tracks),
--   and flip is_featured off for all 14 (matches Karel's 2026-08-25
--   "exclude" ruling; also removes them from /api/audio's anon
--   is_featured fallback and every featured pool).
--
-- DEFECT 2 — storage-path leak: audio_url IS the storage object path
--   (e.g. "<user>/<ts>-17th St 61.m4a"). The Phase-1 functions excluded
--   file_name/aac_file_name but returned r.audio_url. No app code consumes
--   these functions yet (Phase 2 pending), so the return-type change is
--   free. Media resolution stays in /api/audio (service role, signed URLs).
-- ============================================================================

-- ────────────────────────────────────────────────────────────────────────────
-- 1. Released test — now excludes the unverified/not-Karel's catalog.
--    Source of truth for the ID list: src/app/dream/_shared/welcomeHome.ts
--    (SEVENTEENTH_ST_TRACKS + FOLSOM_ST_TRACKS + the commented Sketches ids).
-- ────────────────────────────────────────────────────────────────────────────
create or replace function public.recording_is_released(p_recording_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select p_recording_id <> all (array[
      -- 17th St (quarantined, unverified)
      'e49f17ca-7215-4a82-8c80-bf4339cd3e3b',
      '64c5cca9-a1db-41b8-8ebf-e3a6f6ede9f5',
      'd073c3fb-329d-4126-a27e-3167e2ed605d',
      '2ff2768b-98a7-44eb-a498-473d9b7c33dc',
      '6a009894-d341-4f84-8a2e-b45a59b68b82',
      -- Folsom St (quarantined, unverified)
      '808f253c-bca9-42e6-b0f7-5762b8d92a92',
      'ba5ad023-6858-401c-807d-74fb29be81af',
      'e1553a57-682f-444a-992d-92165ee471d1',
      'ee0bd856-d565-417d-a9d3-8f307116e043',
      -- Joseph's "Sketches" (not Karel's music)
      'c3c34efa-76e1-4375-9e01-499eafd8d126',
      'aafddeb5-5333-49f5-8308-16dd6d59a1f2',
      'bcd04d03-8bdc-4868-bb30-f620349f54fe',
      'ca26d632-bf64-4ab8-bbcf-24f49e238b73',
      '0d167679-42af-44b9-be6b-0e383c2ef56e'
    ]::uuid[])
    and (
      exists (
        select 1 from public.recordings r
        where r.id = p_recording_id
          and (r.is_featured = true or r.share_token is not null)
      ) or exists (
        select 1 from public.journeys j
        where j.recording_id = p_recording_id
          and j.share_token is not null
      )
    );
$$;

-- ────────────────────────────────────────────────────────────────────────────
-- 2. Recording functions — drop audio_url from every return; gate all of
--    them on recording_is_released. Return-type changes require drop+create.
-- ────────────────────────────────────────────────────────────────────────────
drop function if exists public.get_recording_for_journey(text);
create function public.get_recording_for_journey(p_journey_token text)
returns table (
  id uuid,
  title text,
  artist text,
  duration double precision,
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
    r.id, r.title, r.artist, r.duration::double precision,
    r.is_featured, to_jsonb(r.waveform_peaks) as waveform_peaks, r.created_at
  from public.recordings r
  join public.journeys j on j.recording_id = r.id
  where j.share_token = p_journey_token
    and p_journey_token is not null
    and length(p_journey_token) between 8 and 64
    and public.recording_is_released(r.id);
$$;

drop function if exists public.get_released_recording_meta(uuid);
create function public.get_released_recording_meta(p_recording_id uuid)
returns table (
  id uuid,
  title text,
  artist text,
  duration double precision,
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
    r.id, r.title, r.artist, r.duration::double precision,
    r.is_featured, to_jsonb(r.waveform_peaks) as waveform_peaks, r.created_at
  from public.recordings r
  where r.id = p_recording_id
    and public.recording_is_released(p_recording_id);
$$;

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
  where r.is_featured = true
    and public.recording_is_released(r.id);
$$;

drop function if exists public.get_recording_by_share_token(text);
create function public.get_recording_by_share_token(p_token text)
returns table (
  id uuid,
  title text,
  description text,
  artist text,
  duration double precision,
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
    r.is_featured, to_jsonb(r.waveform_peaks) as waveform_peaks,
    r.created_at
  from public.recordings r
  where r.share_token = p_token
    and p_token is not null
    and length(p_token) between 8 and 64
    and public.recording_is_released(r.id);
$$;

-- ────────────────────────────────────────────────────────────────────────────
-- 3. Re-lock execution on the recreated functions.
-- ────────────────────────────────────────────────────────────────────────────
revoke all on function public.get_recording_for_journey(text) from public;
revoke all on function public.get_released_recording_meta(uuid) from public;
revoke all on function public.get_recording_by_share_token(text) from public;
grant execute on function public.get_recording_for_journey(text) to anon, authenticated, service_role;
grant execute on function public.get_released_recording_meta(uuid) to anon, authenticated, service_role;
grant execute on function public.get_recording_by_share_token(text) to anon, authenticated, service_role;

-- ────────────────────────────────────────────────────────────────────────────
-- 4. Data fix — un-feature the excluded catalog (Karel's 2026-08-25 ruling).
--    This also removes them from /api/audio's anon is_featured fallback and
--    the online installation featured pool. Reversible per-track after
--    Karel's verification pass.
-- ────────────────────────────────────────────────────────────────────────────
update public.recordings set is_featured = false
where id = any (array[
  'e49f17ca-7215-4a82-8c80-bf4339cd3e3b',
  '64c5cca9-a1db-41b8-8ebf-e3a6f6ede9f5',
  'd073c3fb-329d-4126-a27e-3167e2ed605d',
  '2ff2768b-98a7-44eb-a498-473d9b7c33dc',
  '6a009894-d341-4f84-8a2e-b45a59b68b82',
  '808f253c-bca9-42e6-b0f7-5762b8d92a92',
  'ba5ad023-6858-401c-807d-74fb29be81af',
  'e1553a57-682f-444a-992d-92165ee471d1',
  'ee0bd856-d565-417d-a9d3-8f307116e043',
  'c3c34efa-76e1-4375-9e01-499eafd8d126',
  'aafddeb5-5333-49f5-8308-16dd6d59a1f2',
  'bcd04d03-8bdc-4868-bb30-f620349f54fe',
  'ca26d632-bf64-4ab8-bbcf-24f49e238b73',
  '0d167679-42af-44b9-be6b-0e383c2ef56e'
]::uuid[]);
