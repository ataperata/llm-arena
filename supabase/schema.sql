-- Optional shared leaderboard for LLM Arena.
-- Apply this in your own Supabase project. The app reads SUPABASE_URL and
-- SUPABASE_SERVICE_ROLE_KEY on the server and does not embed them in the client.
-- Row level security is enabled with no policies, so the anon and
-- authenticated keys cannot read or write this table. The service role
-- bypasses row level security.

create table if not exists public.arena_votes (
  id uuid primary key default gen_random_uuid(),
  comparison_id text not null unique,
  prompt text not null,
  winner_model_id text not null,
  model_ids text[] not null,
  created_at timestamptz not null default now()
);

create index if not exists arena_votes_created_at_idx
  on public.arena_votes (created_at desc);

alter table public.arena_votes enable row level security;
