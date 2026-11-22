-- Inputs for a later weight search. One row per player and stat (points, rebounds)
-- saved by Projections. Gaps are the numerators before that day's slider divides them.
-- Null means that term was not applied. Run this in the Supabase SQL editor. The app does not apply it.

create table if not exists projection_inputs (
  player_id text not null,
  game_id text not null,
  stat text not null check (stat in ('points', 'rebounds')),
  slate_date date not null,
  saved_at timestamptz not null,
  sportsline numeric,
  dimers numeric,
  minutes numeric,
  usage numeric,
  last15_points numeric,
  last15_rebounds numeric,
  opponent_pace numeric,
  defense_vs_position numeric,
  opp_rebounds_allowed numeric,
  dvp_gap numeric,
  pace_gap numeric,
  recent_gap numeric,
  minutes_gap numeric,
  opp_rebounds_gap numeric,
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
  min_rate_games integer not null,
  primary key (player_id, game_id, stat)
);

comment on table projection_inputs is
  'One row per saved points or rebounds projection. opponent_pace, defense_vs_position, and opp_rebounds_allowed are the differentials the model uses. Gap columns are those numerators before the slider divides them, and are null when that term was not applied. Points has no opponent-rebounds term.';

create index if not exists projection_inputs_slate_idx on projection_inputs (slate_date);

create or replace function prevent_projection_input_change()
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
    raise exception 'projection inputs stay locked after actuals are stored';
  end if;
  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

drop trigger if exists projection_inputs_lock on projection_inputs;
create trigger projection_inputs_lock
before insert or update or delete on projection_inputs
for each row execute function prevent_projection_input_change();

alter table projection_inputs enable row level security;

revoke all on table projection_inputs from anon, authenticated;
grant all on table projection_inputs to service_role;
