-- Remove the broad "Authenticated users have full access" policy on valuations
-- that was created by the loop in 001_initial_schema.sql. The four explicit
-- per-operation policies added in 007_valuations_rls.sql are kept and cover
-- all operations without overlap.

drop policy if exists "Authenticated users have full access" on valuations;
