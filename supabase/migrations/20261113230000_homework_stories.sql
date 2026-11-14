-- Sourced sentences for the homework eight. Run this in the Supabase SQL editor.
-- The app does not apply it. A missing table is skipped so Projections still save.

create table if not exists homework_stories (
  player_id text not null,
  game_id text not null,
  stat text not null,
  slate_date date not null,
  text text not null,
  source_url text not null,
  saved_at timestamptz not null,
  primary key (player_id, game_id, stat, slate_date)
);

alter table homework_stories enable row level security;

revoke all on table homework_stories from anon, authenticated;
grant all on table homework_stories to service_role;
