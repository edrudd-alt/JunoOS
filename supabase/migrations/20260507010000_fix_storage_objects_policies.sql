-- Drop all existing storage.objects policies (created during initial bucket setup —
-- "flreew_0" variants were Supabase dashboard defaults with no bucket scope;
-- "documents bucket *" variants used the public role and were overly permissive).
DROP POLICY IF EXISTS "Public read access flreew_0" ON storage.objects;
DROP POLICY IF EXISTS "documents bucket select" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can upload flreew_0" ON storage.objects;
DROP POLICY IF EXISTS "documents bucket upload" ON storage.objects;

-- Replace with two strict authenticated-only policies scoped to the documents bucket.
CREATE POLICY "documents: authenticated read"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (bucket_id = 'documents');

CREATE POLICY "documents: authenticated upload"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (bucket_id = 'documents');
