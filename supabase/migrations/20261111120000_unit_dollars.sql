-- Dollars per unit, stored on each bet and as one setting.
-- Existing bets are $5 a unit. The setting starts at $10 and prices only bets saved after that.
-- Run this in the Supabase SQL editor. The app does not apply it.
--
-- unit_dollars is a column on prop_lines and pregame, the same as units.
-- dollars_per_unit is a column on settings.
-- Those tables already have row level security and no anon policies.
-- Privileges stay on the table. The statements below match the units columns:
-- anon and authenticated have nothing, and service_role has the table.

alter table prop_lines add column if not exists unit_dollars numeric;
alter table pregame add column if not exists unit_dollars numeric;
alter table settings add column if not exists dollars_per_unit numeric not null default 10;

alter table prop_lines drop constraint if exists prop_lines_unit_dollars_positive;
alter table prop_lines add constraint prop_lines_unit_dollars_positive check (unit_dollars is null or unit_dollars > 0);

alter table pregame drop constraint if exists pregame_unit_dollars_positive;
alter table pregame add constraint pregame_unit_dollars_positive check (unit_dollars is null or unit_dollars > 0);

alter table settings drop constraint if exists settings_dollars_per_unit_positive;
alter table settings add constraint settings_dollars_per_unit_positive check (dollars_per_unit > 0);

update prop_lines
set unit_dollars = 5
where units is not null and units > 0 and unit_dollars is null;

alter table pregame disable trigger pregame_lock;
update pregame
set unit_dollars = 5
where units is not null and units > 0 and unit_dollars is null;
alter table pregame enable trigger pregame_lock;

alter table prop_lines enable row level security;
alter table pregame enable row level security;
alter table settings enable row level security;

revoke all on table prop_lines, pregame, settings from anon, authenticated;
grant all on table prop_lines, pregame, settings to service_role;
