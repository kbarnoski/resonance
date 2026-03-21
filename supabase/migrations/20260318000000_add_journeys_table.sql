create table journeys (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references auth.users(id) on delete cascade not null,
  recording_id uuid references recordings(id) on delete set null,
  name text not null,
  subtitle text,
  description text,
  story_text text,
  realm_id text not null,
  phases jsonb not null,
  share_token text unique,
  is_public boolean default false,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Index for user lookups
create index journeys_user_id_idx on journeys(user_id);
-- Index for share token lookups
create index journeys_share_token_idx on journeys(share_token) where share_token is not null;

-- RLS
alter table journeys enable row level security;

-- Owner can do everything
create policy "Owner can manage journeys"
  on journeys for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- Anyone can read shared/public journeys
create policy "Anyone can read shared journeys"
  on journeys for select
  using (is_public = true or share_token is not null);
