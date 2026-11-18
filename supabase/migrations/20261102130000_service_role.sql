-- Existing projects: the first migration revoked anon and authenticated,
-- and a new Supabase project does not grant the server role on its own.
grant usage on schema public to service_role;
grant all on all tables in schema public to service_role;
grant all on all sequences in schema public to service_role;
grant execute on all functions in schema public to service_role;
