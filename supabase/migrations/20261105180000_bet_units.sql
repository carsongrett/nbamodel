-- Units staked with the model, on the live line and the saved pregame row.
-- Null means no bet. Run this in the Supabase SQL editor. The app does not apply it.

alter table prop_lines add column if not exists units numeric;
alter table pregame add column if not exists units numeric;

alter table prop_lines drop constraint if exists prop_lines_units_positive;
alter table prop_lines add constraint prop_lines_units_positive check (units is null or units > 0);

alter table pregame drop constraint if exists pregame_units_positive;
alter table pregame add constraint pregame_units_positive check (units is null or units > 0);
