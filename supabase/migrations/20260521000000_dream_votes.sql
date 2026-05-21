-- Dream-lab vote table — single source of truth for which prototypes Karel
-- has loved (+1) or downvoted (-1). One row per slug, last vote wins.
-- Public can read (so favorite hearts render for anonymous visitors), only
-- the admin API endpoint writes (the route checks isAdmin() server-side).

create table if not exists dream_votes (
  slug text primary key,
  vote smallint not null check (vote in (-1, 0, 1)),
  updated_at timestamptz not null default now()
);

alter table dream_votes enable row level security;

create policy "Anyone can read dream votes" on dream_votes
  for select using (true);

-- No insert/update/delete RLS policies for non-service-role callers — the
-- admin write path uses the service-role client via /api/dream/vote, and
-- the API route itself enforces isAdmin() before calling supabase.

comment on table dream_votes is
  'Karel''s favorite (1) / downvote (-1) state for each dream-lab prototype slug.';
