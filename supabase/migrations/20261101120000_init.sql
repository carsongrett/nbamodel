-- Personal 2026-27 prop desk. The API uses the service role.
-- Row level security is on and there are no policies, so anon and authenticated clients cannot read or write.

create table teams (
  team_id text primary key,
  name text not null
);

create table players (
  player_id text primary key,
  display_name text not null,
  team_id text not null,
  position text not null check (position in ('PG', 'SG', 'SF', 'PF', 'C')),
  season text not null check (season = '2026-27')
);

create table games (
  game_id text primary key,
  season text not null check (season = '2026-27'),
  game_date date not null,
  home_team_id text not null,
  away_team_id text not null,
  status text not null check (status in ('scheduled', 'in_progress', 'final')),
  check (home_team_id <> away_team_id)
);

create table source_id_map (
  source text not null,
  entity_type text not null check (entity_type in ('player', 'team', 'game')),
  source_id text not null,
  canonical_id text not null,
  primary key (source, entity_type, source_id)
);

create table outside_projections (
  player_id text not null,
  game_id text not null,
  source text not null,
  season text not null check (season = '2026-27'),
  points numeric,
  rebounds numeric,
  minutes numeric,
  source_timestamp timestamptz,
  primary key (player_id, game_id, source)
);

create table prop_lines (
  player_id text not null,
  game_id text not null,
  stat text not null check (stat in ('points', 'rebounds', 'points_rebounds')),
  season text not null check (season = '2026-27'),
  line numeric not null,
  over_odds integer,
  under_odds integer,
  source text,
  source_timestamp timestamptz,
  primary key (player_id, game_id, stat)
);

create table player_rates (
  player_id text primary key,
  season text not null check (season = '2026-27'),
  pts_per_100 numeric,
  pts_per_100_games integer,
  usg_pct numeric,
  usg_games integer,
  reb_per_minute numeric,
  reb_per_minute_games integer,
  recent_points_per_game numeric,
  recent_rebounds_per_game numeric,
  recent_games integer,
  source_timestamp timestamptz
);

create table dvp (
  team_id text not null,
  position text not null check (position in ('PG', 'SG', 'SF', 'PF', 'C')),
  season text not null check (season = '2026-27'),
  points_diff numeric,
  rebounds_diff numeric,
  source_timestamp timestamptz,
  primary key (team_id, position)
);

create table pace (
  team_id text primary key,
  season text not null check (season = '2026-27'),
  pace numeric,
  pace_diff numeric,
  source_timestamp timestamptz
);

create table opp_rebounds (
  team_id text primary key,
  season text not null check (season = '2026-27'),
  rebound_diff numeric,
  source_timestamp timestamptz
);

create table vegas (
  game_id text not null,
  team_id text not null,
  season text not null check (season = '2026-27'),
  spread numeric not null,
  total numeric not null check (total > 0),
  source_timestamp timestamptz,
  primary key (game_id, team_id)
);

create table settings (
  id integer primary key check (id = 1),
  dvp_points_strength numeric not null,
  dvp_rebounds_strength numeric not null,
  pace_points_strength numeric not null,
  pace_rebounds_strength numeric not null,
  recent_points_strength numeric not null,
  recent_rebounds_strength numeric not null,
  minutes_points_strength numeric not null,
  minutes_rebounds_strength numeric not null,
  opp_rebounds_strength numeric not null,
  min_recent_games integer not null,
  min_rate_games integer not null
);

insert into settings (
  id, dvp_points_strength, dvp_rebounds_strength, pace_points_strength, pace_rebounds_strength,
  recent_points_strength, recent_rebounds_strength, minutes_points_strength, minutes_rebounds_strength,
  opp_rebounds_strength, min_recent_games, min_rate_games
) values (1, 2, 2, 5, 7.5, 10, 10, 3, 2, 10, 3, 5);

create table overrides (
  player_id text not null,
  game_id text not null,
  minutes numeric not null check (minutes >= 0 and minutes <= 48),
  primary key (player_id, game_id)
);

create table pregame (
  player_id text not null,
  game_id text not null,
  stat text not null check (stat in ('points', 'rebounds', 'points_rebounds')),
  slate_date date not null,
  baseline numeric,
  projection numeric,
  minutes numeric,
  adjustments jsonb not null default '[]'::jsonb,
  flags jsonb not null default '[]'::jsonb,
  line numeric,
  over_odds integer,
  under_odds integer,
  saved_at timestamptz not null,
  sources_used jsonb not null default '[]'::jsonb,
  primary key (player_id, game_id, stat)
);

create table actuals (
  player_id text not null,
  game_id text not null,
  season text not null check (season = '2026-27'),
  dnp boolean not null default false,
  points numeric,
  rebounds numeric,
  source_timestamp timestamptz,
  primary key (player_id, game_id),
  check (not dnp or (points is null and rebounds is null))
);

create table research_findings (
  id text primary key,
  slate_date date not null,
  player_id text,
  team_id text,
  source_url text,
  published_at timestamptz,
  retrieved_at timestamptz not null,
  summary text not null,
  kind text not null check (kind in ('verified', 'inference')),
  availability text,
  suggested_minutes numeric,
  suggested_role text,
  conflict boolean not null default false,
  applied_at timestamptz,
  flags jsonb not null default '[]'::jsonb
);

create index games_date_idx on games (game_date);
create index pregame_slate_idx on pregame (slate_date);
create index actuals_game_idx on actuals (game_id);
create index research_slate_idx on research_findings (slate_date);

-- Once actuals exist, the saved pregame projection, line, odds, and timestamp stay put.
create or replace function prevent_pregame_change()
returns trigger
language plpgsql
as $$
declare
  pid text;
  gid text;
begin
  pid := case when tg_op = 'DELETE' then old.player_id else new.player_id end;
  gid := case when tg_op = 'DELETE' then old.game_id else new.game_id end;
  if exists (select 1 from actuals a where a.player_id = pid and a.game_id = gid) then
    raise exception 'pregame projection, line, odds, and timestamp are locked after actuals are stored';
  end if;
  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

create trigger pregame_lock
before insert or update or delete on pregame
for each row execute function prevent_pregame_change();

alter table teams enable row level security;
alter table players enable row level security;
alter table games enable row level security;
alter table source_id_map enable row level security;
alter table outside_projections enable row level security;
alter table prop_lines enable row level security;
alter table player_rates enable row level security;
alter table dvp enable row level security;
alter table pace enable row level security;
alter table opp_rebounds enable row level security;
alter table vegas enable row level security;
alter table settings enable row level security;
alter table overrides enable row level security;
alter table pregame enable row level security;
alter table actuals enable row level security;
alter table research_findings enable row level security;

revoke all on table
  teams, players, games, source_id_map, outside_projections, prop_lines, player_rates,
  dvp, pace, opp_rebounds, vegas, settings, overrides, pregame, actuals, research_findings
from anon, authenticated;
