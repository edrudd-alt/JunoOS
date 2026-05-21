-- Storage UPDATE policy for the documents bucket.
-- Required by supabase.storage.move() during document supersedure (e.g. portfolio
-- statement regeneration, transaction statement regeneration). Without this policy,
-- move() fails with "Object not found" because RLS denies the underlying UPDATE
-- on storage.objects.
--
-- Applied via MCP on 2026-05-21 during PR #11; this migration file captures it
-- in version control for parity with the live database. On existing databases
-- where the policy is already present, this migration is a no-op.

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'storage'
      and tablename  = 'objects'
      and policyname = 'documents: authenticated update'
  ) then
    execute $policy$
      create policy "documents: authenticated update"
      on storage.objects
      for update
      to authenticated
      using (bucket_id = 'documents')
      with check (bucket_id = 'documents')
    $policy$;
  end if;
end;
$$;
