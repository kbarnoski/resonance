-- Per-user journey paths: ordered collections of custom journeys
-- that can be shared via a single token. First use case is the
-- Welcome Home album — 13 journeys, one per track, one shareable
-- URL that represents the album as an experience.

create table if not exists journey_paths (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references auth.users(id) on delete cascade not null,
  name text not null,
  subtitle text,
  description text,
  journey_ids uuid[] not null default '{}'::uuid[],
  share_token text unique,
  accent_color text,
  glow_color text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index if not exists journey_paths_user_id_idx on journey_paths(user_id);
create index if not exists journey_paths_share_token_idx on journey_paths(share_token)
  where share_token is not null;

alter table journey_paths enable row level security;

-- Owner can do everything on their own paths
drop policy if exists "Owner can manage journey_paths" on journey_paths;
create policy "Owner can manage journey_paths"
  on journey_paths for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- Anyone with the share token can read
drop policy if exists "Anyone can read shared journey_paths" on journey_paths;
create policy "Anyone can read shared journey_paths"
  on journey_paths for select
  using (share_token is not null);
