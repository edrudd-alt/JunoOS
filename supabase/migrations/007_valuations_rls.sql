-- Allow authenticated users to insert, update and delete valuation records.
-- Without these policies Supabase RLS silently filters mutations (0 rows
-- affected, no error), making edit/delete appear to do nothing.

alter table valuations enable row level security;

-- SELECT: authenticated users can read all valuations
create policy "authenticated can select valuations"
  on valuations for select
  to authenticated
  using (true);

-- INSERT: authenticated users can insert valuations
create policy "authenticated can insert valuations"
  on valuations for insert
  to authenticated
  with check (true);

-- UPDATE: authenticated users can update valuations
create policy "authenticated can update valuations"
  on valuations for update
  to authenticated
  using (true)
  with check (true);

-- DELETE: authenticated users can delete valuations
create policy "authenticated can delete valuations"
  on valuations for delete
  to authenticated
  using (true);
