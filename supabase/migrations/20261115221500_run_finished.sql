-- Finish times for the Projections and Lines buttons, on the existing settings row.
-- Run this in the Supabase SQL editor. The app does not apply it.
--
-- projections_finished_at and lines_finished_at are columns on settings.
-- Both stay null until that button finishes and saves.
-- No other table changes. Saved bets are not rewritten.

alter table settings add column if not exists projections_finished_at timestamptz;
alter table settings add column if not exists lines_finished_at timestamptz;
