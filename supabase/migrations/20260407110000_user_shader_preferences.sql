-- User shader preferences (blocked / loved / deleted)
-- Replaces browser localStorage for cross-device sync.

create table user_shader_preferences (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references auth.users(id) on delete cascade not null,
  shader_mode text not null,
  status text not null check (status in ('blocked', 'loved', 'deleted')),
  created_at timestamptz default now(),
  unique (user_id, shader_mode)
);

alter table user_shader_preferences enable row level security;

create policy "Users manage own shader prefs"
  on user_shader_preferences for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create index idx_shader_prefs_user on user_shader_preferences(user_id);
