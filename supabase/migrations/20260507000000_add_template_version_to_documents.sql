ALTER TABLE documents
  ADD COLUMN template_version TEXT;

COMMENT ON COLUMN documents.template_version IS
  'Identifier of the template version that produced this document, e.g. "applicationForm@1.0.0". Recorded at generation time for audit. NULL for documents not produced by the generation service (manually uploaded, seeded, etc.).';
