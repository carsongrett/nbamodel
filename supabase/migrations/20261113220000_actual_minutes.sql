-- Minutes played on a stored result, taken from the daily leaders page already fetched.
-- Run this in the Supabase SQL editor. The app does not apply it.
--
-- minutes is a column on actuals.
-- That table already has row level security and no anon policies.
-- Privileges stay on the table.

alter table actuals add column if not exists minutes numeric;

alter table actuals drop constraint if exists actuals_minutes_nonnegative;
alter table actuals add constraint actuals_minutes_nonnegative check (minutes is null or minutes >= 0);

alter table actuals enable row level security;

revoke all on table actuals from anon, authenticated;
grant all on table actuals to service_role;
